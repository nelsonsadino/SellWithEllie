using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Models;

namespace SellWithEllie.Services;

public record PricingResult(decimal Subtotal, decimal Discount, decimal Shipping, decimal Total,
    Coupon? Coupon, ShippingMethod? Method, string? Error);

// One place that turns "subtotal + chosen shipping method + coupon code" into
// what the customer actually pays, so the cart preview, the coupon validator
// and real checkout can never disagree.
public static class CheckoutPricing
{
    public static async Task<PricingResult> ComputeAsync(
        ApplicationDbContext db, decimal subtotal, int? shippingMethodId, string? couponCode)
    {
        Coupon? coupon = null;
        decimal discount = 0;

        if (!string.IsNullOrWhiteSpace(couponCode))
        {
            var code = couponCode.Trim().ToUpperInvariant();
            coupon = await db.Coupons.FirstOrDefaultAsync(c => c.Code == code);
            if (coupon is null || !coupon.IsActive)
                return new(subtotal, 0, 0, subtotal, null, null, "That code is not valid.");
            if (coupon.ExpiresAtUtc is { } exp && exp < DateTime.UtcNow)
                return new(subtotal, 0, 0, subtotal, null, null, "That code has expired.");
            if (coupon.MaxUses is { } max && coupon.UsedCount >= max)
                return new(subtotal, 0, 0, subtotal, null, null, "That code has been fully redeemed.");
            if (subtotal < coupon.MinSubtotal)
                return new(subtotal, 0, 0, subtotal, null, null, $"Spend at least {coupon.MinSubtotal:0.00} to use this code.");

            discount = coupon.Type == CouponType.Percent
                ? Math.Round(subtotal * coupon.Value / 100m, 2)
                : coupon.Value;
            discount = Math.Min(discount, subtotal);
        }

        ShippingMethod? method = null;
        decimal shipping = 0;
        if (shippingMethodId is { } mid)
        {
            method = await db.ShippingMethods.FirstOrDefaultAsync(s => s.Id == mid && s.IsActive);
            if (method is null)
                return new(subtotal, discount, 0, subtotal - discount, coupon, null, "That shipping option is not available.");
            shipping = method.FreeOverSubtotal is { } free && subtotal - discount >= free ? 0 : method.Price;
        }

        return new(subtotal, discount, shipping, subtotal - discount + shipping, coupon, method, null);
    }
}
