using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

public class ShippingMethodRequest
{
    [Required, StringLength(80)] public string Name { get; set; } = string.Empty;
    [Range(0, 100000)] public decimal Price { get; set; }
    [StringLength(80)] public string EstimatedDelivery { get; set; } = string.Empty;
    public decimal? FreeOverSubtotal { get; set; }
    public bool IsActive { get; set; } = true;
}

[Route("api/shipping-methods")]
public class ShippingMethodsController : TenantScopedControllerBase
{
    private readonly ApplicationDbContext _db;
    public ShippingMethodsController(ApplicationDbContext db, ITenantContext t) : base(t) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetActive() =>
        Ok(await _db.ShippingMethods.AsNoTracking().Where(s => s.IsActive).OrderBy(s => s.SortOrder).ThenBy(s => s.Price).ToListAsync());

    [HttpGet("all")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> GetAll() =>
        Ok(await _db.ShippingMethods.AsNoTracking().OrderBy(s => s.SortOrder).ThenBy(s => s.Price).ToListAsync());

    [HttpPost]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> Create(ShippingMethodRequest r)
    {
        var m = new ShippingMethod { Name = r.Name, Price = r.Price, EstimatedDelivery = r.EstimatedDelivery, FreeOverSubtotal = r.FreeOverSubtotal, IsActive = r.IsActive };
        _db.ShippingMethods.Add(m);
        await _db.SaveChangesAsync();
        return Ok(m);
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> Update(int id, ShippingMethodRequest r)
    {
        var m = await _db.ShippingMethods.FirstOrDefaultAsync(s => s.Id == id);
        if (m is null) return NotFound();
        m.Name = r.Name; m.Price = r.Price; m.EstimatedDelivery = r.EstimatedDelivery; m.FreeOverSubtotal = r.FreeOverSubtotal; m.IsActive = r.IsActive;
        await _db.SaveChangesAsync();
        return Ok(m);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> Delete(int id)
    {
        var m = await _db.ShippingMethods.FirstOrDefaultAsync(s => s.Id == id);
        if (m is null) return NotFound();
        _db.ShippingMethods.Remove(m);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public class CouponRequest
{
    [Required, StringLength(40)] public string Code { get; set; } = string.Empty;
    public CouponType Type { get; set; }
    [Range(0.01, 1000000)] public decimal Value { get; set; }
    public decimal MinSubtotal { get; set; }
    public int? MaxUses { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
}

public class QuoteRequest
{
    public decimal Subtotal { get; set; }
    public int? ShippingMethodId { get; set; }
    public string? CouponCode { get; set; }
}

[Route("api/coupons")]
public class CouponsController : TenantScopedControllerBase
{
    private readonly ApplicationDbContext _db;
    public CouponsController(ApplicationDbContext db, ITenantContext t) : base(t) => _db = db;

    // Public: price a basket for the cart/checkout summary. Only reveals what
    // this basket would pay, never the coupon table.
    [HttpPost("quote")]
    public async Task<IActionResult> Quote(QuoteRequest r)
    {
        var p = await CheckoutPricing.ComputeAsync(_db, r.Subtotal, r.ShippingMethodId, r.CouponCode);
        return Ok(new { p.Subtotal, p.Discount, p.Shipping, p.Total, couponCode = p.Coupon?.Code, error = p.Error });
    }

    [HttpGet]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> GetAll() =>
        Ok(await _db.Coupons.AsNoTracking().OrderByDescending(c => c.CreatedAtUtc).ToListAsync());

    [HttpPost]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> Create(CouponRequest r)
    {
        var code = r.Code.Trim().ToUpperInvariant();
        if (await _db.Coupons.AnyAsync(c => c.Code == code)) return Conflict(new { message = "A coupon with that code already exists." });
        if (r.Type == CouponType.Percent && r.Value > 100) return BadRequest(new { message = "A percentage cannot exceed 100." });
        var c = new Coupon { Code = code, Type = r.Type, Value = r.Value, MinSubtotal = r.MinSubtotal, MaxUses = r.MaxUses, ExpiresAtUtc = r.ExpiresAtUtc, IsActive = r.IsActive };
        _db.Coupons.Add(c);
        await _db.SaveChangesAsync();
        return Ok(c);
    }

    [HttpPut("{id:int}/active")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> SetActive(int id, [FromQuery] bool active)
    {
        var c = await _db.Coupons.FirstOrDefaultAsync(x => x.Id == id);
        if (c is null) return NotFound();
        c.IsActive = active;
        await _db.SaveChangesAsync();
        return Ok(c);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> Delete(int id)
    {
        var c = await _db.Coupons.FirstOrDefaultAsync(x => x.Id == id);
        if (c is null) return NotFound();
        _db.Coupons.Remove(c);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
