using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Server-to-server events from each SHOP's own Xendit account for customer
// checkout invoices (distinct from BillingWebhookController, which handles
// the PLATFORM's Xendit account for shop subscriptions).
//
// One URL serves every shop. The invoice's external_id
// ("swe-order-{tenantId}-{orderId}") identifies the shop, and the
// x-callback-token header is verified against THAT shop's stored webhook
// token. Not [Authorize], not tenant-scoped - Xendit can't send our headers.
[ApiController]
[Route("api/payments/webhook")]
public class PaymentsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantPaymentService _payments;
    private readonly IEmailSender _emailSender;
    private readonly IRaffleService _raffleService;
    private readonly ILogger<PaymentsController> _logger;

    public PaymentsController(
        ApplicationDbContext db,
        ITenantPaymentService payments,
        IEmailSender emailSender,
        IRaffleService raffleService,
        ILogger<PaymentsController> logger)
    {
        _db = db;
        _payments = payments;
        _emailSender = emailSender;
        _raffleService = raffleService;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Handle()
    {
        using var doc = await JsonDocument.ParseAsync(Request.Body);
        var root = doc.RootElement;

        // Xendit posts the invoice object directly for invoice callbacks.
        var externalId = GetString(root, "external_id");
        var status = GetString(root, "status")?.ToUpperInvariant();

        if (!ITenantPaymentService.TryParseExternalId(externalId, out var tenantId, out var orderId))
        {
            _logger.LogWarning("Payment webhook: unrecognised external_id '{ExternalId}'.", externalId);
            return Ok(); // not ours / nothing to do
        }

        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId);
        if (tenant is null) return Ok();

        var expectedToken = _payments.GetWebhookToken(tenant);
        var providedToken = Request.Headers["x-callback-token"].ToString();
        if (string.IsNullOrEmpty(expectedToken)
            || string.IsNullOrEmpty(providedToken)
            || !FixedTimeEquals(providedToken, expectedToken))
        {
            _logger.LogWarning("Payment webhook for tenant {TenantId} rejected - bad x-callback-token.", tenantId);
            return Unauthorized();
        }

        var order = await _db.Orders
            .IgnoreQueryFilters()
            .Include(o => o.Items)
            .Include(o => o.User)
            .FirstOrDefaultAsync(o => o.Id == orderId && o.TenantId == tenantId);
        if (order is null)
        {
            _logger.LogWarning("Payment webhook: order {OrderId} for tenant {TenantId} not found.", orderId, tenantId);
            return Ok();
        }

        // Only act on an order that's still waiting - webhooks can arrive
        // more than once and out of order.
        if (order.Status != OrderStatus.AwaitingPayment)
        {
            return Ok();
        }

        if (status is "PAID" or "SETTLED")
        {
            order.Status = OrderStatus.Completed;
            await _db.SaveChangesAsync();
            _logger.LogInformation("Order {OrderId} (tenant {TenantId}) marked paid via Xendit.", orderId, tenantId);

            var buyerName = order.GuestEmail is not null ? order.ShippingName : order.User?.DisplayName ?? "there";
            var (subject, html) = EmailTemplates.OrderConfirmation(
                buyerName,
                tenant.Name,
                order.Id,
                order.TotalAmount,
                order.Items.Select(i => i.ProductName));
            await _emailSender.SendAsync(order.GuestEmail ?? order.User?.Email ?? string.Empty, buyerName, subject, html);

            // No-ops for an ordinary product order - only does anything if
            // this order has linked RaffleSeat rows.
            await _raffleService.OnOrderPaidAsync(order.Id);
        }
        else if (status is "EXPIRED" or "FAILED")
        {
            order.Status = OrderStatus.Cancelled;
            foreach (var item in order.Items)
            {
                var product = await _db.Products.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(p => p.Id == item.ProductId && p.TenantId == tenantId);
                if (product is not null)
                {
                    product.StockQuantity += item.Quantity;
                    product.InStock = product.StockQuantity > 0;
                    product.UpdatedAtUtc = DateTime.UtcNow;
                }
            }
            await _db.SaveChangesAsync();
            _logger.LogInformation("Order {OrderId} (tenant {TenantId}) cancelled - invoice {Status}; stock restored.", orderId, tenantId, status);

            // No-ops for an ordinary product order - only does anything if
            // this order has linked RaffleSeat rows, releasing them back to
            // Available (the raffle equivalent of the stock restore above).
            await _raffleService.OnOrderCancelledAsync(order.Id);
        }

        return Ok();
    }

    private static string? GetString(JsonElement el, string prop) =>
        el.ValueKind == JsonValueKind.Object
        && el.TryGetProperty(prop, out var v)
        && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;

    // Hashing first (rather than comparing raw byte length before the
    // constant-time compare) means there's no length-dependent branch at
    // all - a SHA-256 digest is always 32 bytes regardless of input length,
    // so the expected token's exact length is never observable via timing.
    private static bool FixedTimeEquals(string a, string b)
    {
        var aHash = SHA256.HashData(Encoding.UTF8.GetBytes(a));
        var bHash = SHA256.HashData(Encoding.UTF8.GetBytes(b));
        return CryptographicOperations.FixedTimeEquals(aHash, bHash);
    }
}
