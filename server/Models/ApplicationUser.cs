using Microsoft.AspNetCore.Identity;

namespace SellWithEllie.Models;

public class ApplicationUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Null for platform-admin accounts (they aren't tied to any one shop).
    // Set for every shop Admin / Customer account.
    public int? TenantId { get; set; }
    public Tenant? Tenant { get; set; }
}
