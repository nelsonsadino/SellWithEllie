namespace SellWithEllie.Models;

public enum CouponType
{
    Percent = 0,
    FixedAmount = 1
}

public class Coupon : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    // Stored upper-case; matched case-insensitively.
    public string Code { get; set; } = string.Empty;
    public CouponType Type { get; set; } = CouponType.Percent;
    public decimal Value { get; set; }
    public decimal MinSubtotal { get; set; }
    public int? MaxUses { get; set; }
    public int UsedCount { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
