using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

public class ReviewRequest
{
    [Range(1, 5)] public int Rating { get; set; }
    [StringLength(120)] public string? Title { get; set; }
    [Required, StringLength(2000, MinimumLength = 3)] public string Body { get; set; } = string.Empty;
}

[Route("api/products/{productId:int}")]
public class ReviewsController : TenantScopedControllerBase
{
    private readonly ApplicationDbContext _db;
    public ReviewsController(ApplicationDbContext db, ITenantContext t) : base(t) => _db = db;

    [HttpGet("reviews")]
    public async Task<IActionResult> Get(int productId)
    {
        var rows = await _db.ProductReviews.AsNoTracking()
            .Where(r => r.ProductId == productId)
            .OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => new { r.Id, r.Rating, r.Title, r.Body, r.IsVerifiedPurchase, r.CreatedAtUtc, Author = r.User!.DisplayName, r.UserId })
            .ToListAsync();
        var me = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var breakdown = Enumerable.Range(1, 5).Reverse().Select(s => new { stars = s, count = rows.Count(r => r.Rating == s) });
        return Ok(new
        {
            count = rows.Count,
            average = rows.Count == 0 ? 0 : Math.Round(rows.Average(r => r.Rating), 1),
            breakdown,
            mine = me is null ? (int?)null : rows.FirstOrDefault(r => r.UserId == me)?.Id,
            reviews = rows.Select(r => new { r.Id, r.Rating, r.Title, r.Body, r.IsVerifiedPurchase, r.CreatedAtUtc, author = r.Author })
        });
    }

    [HttpPost("reviews")]
    [Authorize]
    public async Task<IActionResult> Post(int productId, ReviewRequest req)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        if (!await _db.Products.AnyAsync(p => p.Id == productId)) return NotFound();
        if (await _db.ProductReviews.AnyAsync(r => r.ProductId == productId && r.UserId == userId))
            return Conflict(new { message = "You have already reviewed this product." });

        var verified = await _db.OrderItems.AnyAsync(i => i.ProductId == productId && i.Order!.UserId == userId && i.Order.Status == OrderStatus.Completed);
        _db.ProductReviews.Add(new ProductReview
        {
            ProductId = productId, UserId = userId, Rating = req.Rating,
            Title = req.Title?.Trim() ?? string.Empty, Body = req.Body.Trim(), IsVerifiedPurchase = verified
        });
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("reviews/{id:int}")]
    [Authorize]
    public async Task<IActionResult> Delete(int productId, int id)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var r = await _db.ProductReviews.FirstOrDefaultAsync(x => x.Id == id && x.ProductId == productId);
        if (r is null) return NotFound();
        if (r.UserId != userId && !User.IsInRole(ApplicationDbContext.AdminRole)) return Forbid();
        _db.ProductReviews.Remove(r);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Same category first, then anything else, never the product itself.
    [HttpGet("related")]
    public async Task<IActionResult> Related(int productId)
    {
        var p = await _db.Products.AsNoTracking().FirstOrDefaultAsync(x => x.Id == productId);
        if (p is null) return NotFound();
        var rows = await _db.Products.AsNoTracking()
            .Where(x => x.Id != productId && !x.IsAuctionOnly)
            .OrderByDescending(x => x.Category == p.Category)
            .ThenByDescending(x => x.Subcategory == p.Subcategory)
            .ThenByDescending(x => x.CreatedAtUtc)
            .Take(4)
            .Select(x => new { x.Id, x.Name, x.Category, x.Price, x.ImageUrl, x.InStock })
            .ToListAsync();
        return Ok(rows);
    }
}
