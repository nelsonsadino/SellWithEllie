using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Read-only sales/stock/demand reporting for shop admins. Everything here is
// computed on demand from Orders, OrderItems, Products, CartItems and Bids -
// no separate reporting tables to keep in sync. Tenant isolation comes from
// the same global query filters every other controller relies on.
[Route("api/reports")]
[Authorize(Roles = ApplicationDbContext.AdminRole)]
public class ReportsController : TenantScopedControllerBase
{
    private readonly ApplicationDbContext _db;

    public ReportsController(ApplicationDbContext db, ITenantContext tenantContext) : base(tenantContext)
    {
        _db = db;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 1, 365);
        var now = DateTime.UtcNow;
        var from = now.Date.AddDays(-(days - 1));
        var prevFrom = from.AddDays(-days);
        var threshold = TenantContext.Tenant!.LowStockThreshold;

        // Only paid-for orders count as sales; AwaitingPayment/Cancelled don't.
        var paid = _db.Orders.AsNoTracking().Where(o => o.Status == OrderStatus.Completed);

        var current = await paid.Where(o => o.OrderDateUtc >= from)
            .Select(o => new { o.Id, o.OrderDateUtc, o.TotalAmount, o.UserId }).ToListAsync();
        var previous = await paid.Where(o => o.OrderDateUtc >= prevFrom && o.OrderDateUtc < from)
            .Select(o => new { o.TotalAmount }).ToListAsync();

        var revenue = current.Sum(o => o.TotalAmount);
        var prevRevenue = previous.Sum(o => o.TotalAmount);

        // Raffle seat purchases also live in OrderItems but aren't products.
        var productIds = await _db.Products.AsNoTracking().Select(p => p.Id).ToListAsync();
        var lines = await _db.OrderItems.AsNoTracking()
            .Where(i => i.Order!.Status == OrderStatus.Completed && i.Order.OrderDateUtc >= from && productIds.Contains(i.ProductId))
            .Select(i => new { i.ProductId, i.ProductName, i.Quantity, Line = i.PriceAtPurchase * i.Quantity })
            .ToListAsync();

        var products = await _db.Products.AsNoTracking()
            .Select(p => new { p.Id, p.Name, p.Category, p.StockQuantity, p.IsAuctionOnly, p.Price })
            .ToListAsync();
        var byId = products.ToDictionary(p => p.Id);

        var sold = lines.GroupBy(l => l.ProductId).Select(g => new
        {
            productId = g.Key,
            name = g.First().ProductName,
            units = g.Sum(x => x.Quantity),
            revenue = g.Sum(x => x.Line)
        }).ToList();

        var bestSellers = sold.OrderByDescending(s => s.units).ThenByDescending(s => s.revenue).Take(10)
            .Select(s => new
            {
                s.productId,
                s.name,
                s.units,
                s.revenue,
                category = byId.TryGetValue(s.productId, out var p) ? p.Category : "",
                stock = byId.TryGetValue(s.productId, out var q) ? q.StockQuantity : 0
            }).ToList();

        var fixedPrice = products.Where(p => !p.IsAuctionOnly).ToList();
        var outOfStock = fixedPrice.Where(p => p.StockQuantity <= 0)
            .Select(p => new { productId = p.Id, name = p.Name, category = p.Category }).ToList();
        var lowStock = fixedPrice.Where(p => p.StockQuantity > 0 && p.StockQuantity <= threshold)
            .OrderBy(p => p.StockQuantity)
            .Select(p => new { productId = p.Id, name = p.Name, category = p.Category, stock = p.StockQuantity }).ToList();

        // "In demand" = interest signals beyond completed sales: units sitting in
        // carts right now, and bids placed on the product's auctions this period.
        var inCart = await _db.CartItems.AsNoTracking()
            .GroupBy(c => c.ProductId).Select(g => new { ProductId = g.Key, Qty = g.Sum(x => x.Quantity) }).ToListAsync();
        var bids = await _db.Bids.AsNoTracking().Where(b => b.PlacedAtUtc >= from)
            .GroupBy(b => b.Auction!.ProductId).Select(g => new { ProductId = g.Key, Count = g.Count() }).ToListAsync();

        var cartMap = inCart.ToDictionary(x => x.ProductId, x => x.Qty);
        var bidMap = bids.ToDictionary(x => x.ProductId, x => x.Count);
        var soldMap = sold.ToDictionary(x => x.productId, x => x.units);

        var demand = products.Select(p =>
        {
            var u = soldMap.GetValueOrDefault(p.Id);
            var c = cartMap.GetValueOrDefault(p.Id);
            var b = bidMap.GetValueOrDefault(p.Id);
            return new
            {
                productId = p.Id,
                name = p.Name,
                category = p.Category,
                unitsSold = u,
                inCarts = c,
                bids = b,
                stock = p.StockQuantity,
                isAuctionOnly = p.IsAuctionOnly,
                score = u * 3 + c * 2 + b
            };
        }).Where(d => d.score > 0).OrderByDescending(d => d.score).Take(10).ToList();

        var daily = Enumerable.Range(0, days).Select(i =>
        {
            var d = from.AddDays(i);
            var day = current.Where(o => o.OrderDateUtc.Date == d).ToList();
            return new { date = d.ToString("yyyy-MM-dd"), revenue = day.Sum(o => o.TotalAmount), orders = day.Count };
        }).ToList();

        var categories = lines
            .GroupBy(l => byId.TryGetValue(l.ProductId, out var p) && !string.IsNullOrWhiteSpace(p.Category) ? p.Category : "Uncategorised")
            .Select(g => new { category = g.Key, units = g.Sum(x => x.Quantity), revenue = g.Sum(x => x.Line) })
            .OrderByDescending(c => c.revenue).ToList();

        return Ok(new
        {
            days,
            from = from.ToString("yyyy-MM-dd"),
            to = now.ToString("yyyy-MM-dd"),
            lowStockThreshold = threshold,
            kpis = new
            {
                revenue,
                previousRevenue = prevRevenue,
                orders = current.Count,
                previousOrders = previous.Count,
                unitsSold = lines.Sum(l => l.Quantity),
                averageOrderValue = current.Count == 0 ? 0 : revenue / current.Count,
                customers = current.Select(o => o.UserId).Distinct().Count(),
                pendingPayment = await _db.Orders.CountAsync(o => o.Status == OrderStatus.AwaitingPayment),
                activeAuctions = await _db.Auctions.CountAsync(a => a.Status == AuctionStatus.Active),
                openRaffles = await _db.Raffles.CountAsync(r => r.Status == RaffleStatus.Open),
                outOfStockCount = outOfStock.Count,
                lowStockCount = lowStock.Count
            },
            dailySales = daily,
            bestSellers,
            outOfStock,
            lowStock,
            inDemand = demand,
            categories
        });
    }
}
