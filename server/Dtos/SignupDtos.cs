using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

public class SignupRequest
{
    [Required, StringLength(100, MinimumLength = 2)]
    public string ShopName { get; set; } = string.Empty;

    [Required, StringLength(30, MinimumLength = 3)]
    [RegularExpression("^[a-z0-9]+(-[a-z0-9]+)*$", ErrorMessage = "Use only lowercase letters, numbers, and hyphens.")]
    public string Slug { get; set; } = string.Empty;

    [Required, EmailAddress, StringLength(256)]
    public string AdminEmail { get; set; } = string.Empty;

    [Required, StringLength(100, MinimumLength = 8)]
    public string AdminPassword { get; set; } = string.Empty;

    [Required, StringLength(100, MinimumLength = 2)]
    public string AdminDisplayName { get; set; } = string.Empty;
}

public class SignupResponse
{
    public TenantInfoDto Shop { get; set; } = new();
    public AuthResponse Auth { get; set; } = new();
}

public class SlugAvailabilityResponse
{
    public bool Available { get; set; }
    public string? Reason { get; set; }
}
