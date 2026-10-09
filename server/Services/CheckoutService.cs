using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Models;

namespace SellWithEllie.Services;

public record CheckoutLine(int ProductId, int Quantity);

public record CheckoutInput(
    string UserId,
    string ShippingName,
    string ShippingAddress,
    int? ShippingMethodId,
    string? CouponCode,
    string? ReturnUrlBase,
    string? GuestEmail);

public record CheckoutOutcome(Order? Order, int StatusCode, string? Error)
{
    public static CheckoutOutcome Fail(int status, string message) => new(null, status, message);
}

// Shared by the signed-in cart checkout and guest checkout so stock handling,
// coupon/shipping pricing, Xendit and confirmation emails behave identically.
public class CheckoutService
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantContext _tenantContext;
    private readonly ITenantPaymentService _payments;
    private readonly IReturnUrlValidator _returnUrlValidator;
    private readonly IEmailSender _emailSender;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<CheckoutService> _logger;

    public CheckoutService(ApplicationDbContext db, ITenantContext tenantContext, ITenantPaymentService payments,
        IReturnUrlValidator returnUrlValidator, IEmailSender emailSender,
        UserManager<ApplicationUser> userManager, ILogger<CheckoutService> logger)
    {
        _db = db;
        _tenantContext = tenantContext;
        _payments = payments;
        _returnUrlValidator = returnUrlValidator;
        _emailSender = emailSender;
        _userManager = userManager;
        _logger = logger;
    }

    // Guest orders hang off one shared, password-less placeholder user per shop
    // (Order.UserId is required). The real contact lives in Order.GuestEmail.
    public async Task<string> GetOrCreateGuestUserIdAsync()
    {
        var tenantId = _tenantContext.TenantId;
        var email = $"guest@guest.t{tenantId}.invalid";
        var existing = await _userManager.FindByEmailAsync(email);
        if (existing is not null) return existing.Id;

        var user = new ApplicationUser
        {
            UserName = $"t{tenantId}-guest",
            Email = email,
            DisplayName = "Guest",
            TenantId = tenantId
        };
        var result = await _userManager.CreateAsync(user);
        if (!result.Succeeded)
            throw new InvalidOperationException("Could not create guest user: " + string.Join(" ", result.Errors.Select(e => e.Description)));
        return user.Id;
    }

    public async Task<CheckoutOutcome> PlaceOrderAsync(CheckoutInput input, IReadOnlyList<CheckoutLine> lines, Action? onPlaced = null)
    {
        if (lines.Count == 0) return CheckoutOutcome.Fail(400, "Your cart is empty.");

        var ids = lines.Select(l => l.ProductId).Distinct().ToList();
        var products = await _db.Products.Where(p => ids.Contains(p.Id)).ToListAsync();
        var byId = products.ToDictionary(p => p.Id);

        var available = lines
            .Where(l => byId.TryGetValue(l.ProductId, out var p) && !p.IsAuctionOnly && p.StockQuantity > 0)
            .GroupBy(l => l.ProductId)
            .Select(g => new CheckoutLine(g.Key, g.Sum(x => Math.Max(1, x.Quantity))))
            .ToList();
        if (available.Count == 0) return CheckoutOutcome.Fail(400, "None of the products in your cart are still available.");

        var tenant = _tenantContext.Tenant!;
        var payWithXendit = _payments.IsConnected(tenant);

        var order = new Order
        {
            UserId = input.UserId,
            OrderDateUtc = DateTime.UtcNow,
            ShippingName = input.ShippingName,
            ShippingAddress = input.ShippingAddress,
            GuestEmail = input.GuestEmail,
            Status = payWithXendit ? OrderStatus.AwaitingPayment : OrderStatus.Completed,
            PaymentProvider = payWithXendit ? "xendit" : "simulated"
        };

        foreach (var line in available)
        {
            var product = byId[line.ProductId];
            // Clamp to what's left in case stock dropped since it went in the cart.
            var qty = Math.Min(line.Quantity, product.StockQuantity);
            if (qty <= 0) continue;

            order.Items.Add(new OrderItem
            {
                ProductId = product.Id,
                ProductName = product.Name,
                PriceAtPurchase = product.Price,
                Quantity = qty
            });
            product.StockQuantity -= qty;
            product.InStock = product.StockQuantity > 0;
            product.UpdatedAtUtc = DateTime.UtcNow;
        }

        if (order.Items.Count == 0) return CheckoutOutcome.Fail(400, "The items in your cart just sold out.");

        // The server always re-prices; the client's preview is never trusted.
        var subtotal = order.Items.Sum(i => i.PriceAtPurchase * i.Quantity);
        var pricing = await CheckoutPricing.ComputeAsync(_db, subtotal, input.ShippingMethodId, input.CouponCode);
        if (pricing.Error is not null)
        {
            _db.ChangeTracker.Clear(); // discard the in-memory stock decrements
            return CheckoutOutcome.Fail(400, pricing.Error);
        }

        order.DiscountAmount = pricing.Discount;
        order.CouponCode = pricing.Coupon?.Code;
        order.ShippingMethodName = pricing.Method?.Name ?? string.Empty;
        order.ShippingCost = pricing.Shipping;
        order.TotalAmount = pricing.Total;
        if (pricing.Coupon is not null) pricing.Coupon.UsedCount++;

        _db.Orders.Add(order);
        await _db.SaveChangesAsync();

        var saved = await _db.Orders.Include(o => o.Items).Include(o => o.User).FirstAsync(o => o.Id == order.Id);
        var customerEmail = saved.GuestEmail ?? saved.User?.Email ?? string.Empty;
        var customerName = saved.GuestEmail is not null ? saved.ShippingName : saved.User?.DisplayName ?? "there";

        if (payWithXendit)
        {
            // Only honour ReturnUrlBase if it is this tenant's own storefront
            // host, so Xendit can never redirect a payer somewhere hostile.
            var baseUrl = _returnUrlValidator.IsValidForTenant(input.ReturnUrlBase, tenant)
                ? input.ReturnUrlBase!.TrimEnd('/')
                : string.Empty;
            // Guests have no account page; they come back to the tracking page.
            var isGuest = saved.GuestEmail is not null;
            string ReturnTo(string flag) => isGuest ? $"{baseUrl}/track?order={saved.Id}&{flag}" : $"{baseUrl}/orders/{saved.Id}?{flag}";
            try
            {
                var invoice = await _payments.CreateInvoiceAsync(
                    tenant, saved.Id, saved.TotalAmount,
                    customerEmail: customerEmail,
                    description: $"Order #{saved.Id} at {tenant.Name}",
                    successUrl: string.IsNullOrEmpty(baseUrl) ? "" : ReturnTo("paid=1"),
                    failureUrl: string.IsNullOrEmpty(baseUrl) ? "" : ReturnTo("payment=failed"));

                saved.PaymentReference = invoice.InvoiceId;
                saved.PaymentUrl = invoice.InvoiceUrl;
                onPlaced?.Invoke();
                await _db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Xendit invoice creation failed for order {OrderId} (tenant {TenantId}).", saved.Id, tenant.Id);

                foreach (var it in saved.Items)
                {
                    var p = await _db.Products.FirstOrDefaultAsync(x => x.Id == it.ProductId);
                    if (p is not null) { p.StockQuantity += it.Quantity; p.InStock = p.StockQuantity > 0; }
                }
                if (pricing.Coupon is not null)
                {
                    var c = await _db.Coupons.FirstOrDefaultAsync(x => x.Id == pricing.Coupon.Id);
                    if (c is not null && c.UsedCount > 0) c.UsedCount--;
                }
                saved.Status = OrderStatus.Cancelled;
                await _db.SaveChangesAsync();
                return CheckoutOutcome.Fail(502, "Could not start payment with the shop's payment provider. Please try again.");
            }

            // Confirmation email is sent from the payment webhook once paid.
            return new CheckoutOutcome(saved, 200, null);
        }

        onPlaced?.Invoke();
        await _db.SaveChangesAsync();

        var (subject, html) = EmailTemplates.OrderConfirmation(customerName, tenant.Name, saved.Id, saved.TotalAmount, saved.Items.Select(i => i.ProductName));
        await _emailSender.SendAsync(customerEmail, customerName, subject, html);
        return new CheckoutOutcome(saved, 200, null);
    }
}
