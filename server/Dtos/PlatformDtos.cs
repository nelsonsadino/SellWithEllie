using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

public class PlatformTenantDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Plan { get; set; } = string.Empty;
    public string SubscriptionStatus { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public int ProductCount { get; set; }
}

// Platform-console "create shop": provisions a tenant + its first admin the
// same way public signup does, but without signing anyone in. The platform
// admin sets a temporary password to hand to the shop owner.
public class CreateTenantRequest
{
    [Required, StringLength(80, MinimumLength = 2)]
    public string ShopName { get; set; } = string.Empty;

    [Required]
    public string Slug { get; set; } = string.Empty;

    [Required, StringLength(80, MinimumLength = 1)]
    public string AdminDisplayName { get; set; } = string.Empty;

    [Required, EmailAddress]
    public string AdminEmail { get; set; } = string.Empty;

    [Required, StringLength(100, MinimumLength = 8)]
    public string AdminPassword { get; set; } = string.Empty;

    // "Free" | "Pro" - defaults to Free if unrecognised.
    public string Plan { get; set; } = "Free";
}
