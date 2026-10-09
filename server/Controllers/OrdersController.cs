using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Mapping;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

[Route("api/[controller]")]
[Authorize]
public class OrdersController : TenantScopedControllerBase
{
    private readonly ApplicationDbContext _db;

    private readonly CheckoutService _checkout;
    private readonly IEmailSender _emailSender;

    public OrdersController(ApplicationDbContext db, CheckoutService checkout, IEmailSender emailSender, ITenantContext tenantContext) : base(tenantContext)
    {
        _db = db;
        _checkout = checkout;
        _emailSender = emailSender;
    }

    // Guest checkout: no account, items come from the browser's own cart.
    [HttpPost("guest")]
    [AllowAnonymous]
    public async Task<ActionResult<OrderDto>> GuestCheckout(GuestCheckoutRequest request)
    {
        var guestId = await _checkout.GetOrCreateGuestUserIdAsync();
        var outcome = await _checkout.PlaceOrderAsync(
            new CheckoutInput(guestId, request.ShippingName, request.ShippingAddress,
                request.ShippingMethodId, request.CouponCode, request.ReturnUrlBase, request.Email.Trim()),
            request.Items.Select(i => new CheckoutLine(i.ProductId, i.Quantity)).ToList());

        if (outcome.Order is null) return StatusCode(outcome.StatusCode, new { message = outcome.Error });
        return Ok(outcome.Order.ToDto());
    }

    // Guests prove ownership with order number + the email used at checkout.
    [HttpGet("track")]
    [AllowAnonymous]
    public async Task<ActionResult<OrderDto>> Track([FromQuery] int orderId, [FromQuery] string email)
    {
        var e = (email ?? string.Empty).Trim().ToLowerInvariant();
        var order = await _db.Orders.Include(o => o.Items).Include(o => o.User).AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == orderId);
        var owner = order is null ? null : (order.GuestEmail ?? order.User?.Email)?.ToLowerInvariant();
        if (order is null || owner is null || owner != e)
            return NotFound(new { message = "We couldn't find an order matching those details." });
        return Ok(order.ToDto());
    }

    [HttpPut("{id:int}/fulfillment")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<OrderDto>> UpdateFulfillment(int id, FulfillmentUpdateRequest request)
    {
        if (!Enum.TryParse<FulfillmentStatus>(request.Status, true, out var status))
            return BadRequest(new { message = "Unknown status." });

        var order = await _db.Orders.Include(o => o.Items).Include(o => o.User).FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound();
        if (order.Status != OrderStatus.Completed)
            return BadRequest(new { message = "Only paid orders can be shipped." });

        var previous = order.Fulfillment;
        order.Fulfillment = status;
        if (!string.IsNullOrWhiteSpace(request.Carrier)) order.Carrier = request.Carrier.Trim();
        if (!string.IsNullOrWhiteSpace(request.TrackingNumber)) order.TrackingNumber = request.TrackingNumber.Trim();
        if (status >= FulfillmentStatus.Shipped && order.ShippedAtUtc is null) order.ShippedAtUtc = DateTime.UtcNow;
        if (status == FulfillmentStatus.Delivered && order.DeliveredAtUtc is null) order.DeliveredAtUtc = DateTime.UtcNow;
        if (status == FulfillmentStatus.Processing) { order.ShippedAtUtc = null; order.DeliveredAtUtc = null; }
        await _db.SaveChangesAsync();

        // Email only on a genuine forward move so re-saving tracking info doesn't spam.
        if (status != previous && status != FulfillmentStatus.Processing)
        {
            var email = order.GuestEmail ?? order.User?.Email ?? string.Empty;
            var name = order.GuestEmail is not null ? order.ShippingName : order.User?.DisplayName ?? "there";
            var shop = TenantContext.Tenant!.Name;
            var (subject, html) = status == FulfillmentStatus.Shipped
                ? EmailTemplates.OrderShipped(name, shop, order.Id, order.Carrier, order.TrackingNumber)
                : EmailTemplates.OrderDelivered(name, shop, order.Id);
            await _emailSender.SendAsync(email, name, subject, html);
        }

        return Ok(order.ToDto());
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<OrderDto>>> GetMyOrders(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? stage = null)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

        var mine = _db.Orders.AsNoTracking().Where(o => o.UserId == userId);
        var query = ApplyStage(mine, stage)
            .Include(o => o.Items)
            .OrderByDescending(o => o.OrderDateUtc);

        var totalCount = await query.CountAsync();
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<OrderDto>
        {
            Items = items.Select(o => o.ToDto()).ToList(),
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        });
    }

    // topay | toship (paid, not yet shipped) | shipping (on its way) | completed (delivered)
    private static IQueryable<Order> ApplyStage(IQueryable<Order> q, string? stage) => stage?.ToLowerInvariant() switch
    {
        "topay" => q.Where(o => o.Status == OrderStatus.AwaitingPayment),
        "toship" => q.Where(o => o.Status == OrderStatus.Completed && o.Fulfillment == FulfillmentStatus.Processing),
        "shipping" => q.Where(o => o.Status == OrderStatus.Completed && o.Fulfillment == FulfillmentStatus.Shipped),
        "completed" => q.Where(o => o.Status == OrderStatus.Completed && o.Fulfillment == FulfillmentStatus.Delivered),
        _ => q
    };

    [HttpGet("counts")]
    public async Task<IActionResult> GetMyCounts()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var mine = _db.Orders.AsNoTracking().Where(o => o.UserId == userId);
        return Ok(new
        {
            all = await mine.CountAsync(),
            topay = await ApplyStage(mine, "topay").CountAsync(),
            toship = await ApplyStage(mine, "toship").CountAsync(),
            shipping = await ApplyStage(mine, "shipping").CountAsync(),
            completed = await ApplyStage(mine, "completed").CountAsync()
        });
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderDto>> GetOrder(int id)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isAdmin = User.IsInRole(ApplicationDbContext.AdminRole);

        var order = await _db.Orders
            .Include(o => o.Items)
            .Include(o => o.User)
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order is null) return NotFound();
        if (order.UserId != userId && !isAdmin) return Forbid();

        return Ok(order.ToDto());
    }

    [HttpGet("admin/all")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<PagedResult<OrderDto>>> GetAllOrders(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.Orders
            .Include(o => o.Items)
            .Include(o => o.User)
            .AsNoTracking()
            .OrderByDescending(o => o.OrderDateUtc);

        var totalCount = await query.CountAsync();
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<OrderDto>
        {
            Items = items.Select(o => o.ToDto()).ToList(),
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        });
    }
}
