namespace SellWithEllie.Models;

// One stacked block on a shop's editable storefront home page. Kind selects
// which component renders it; DataJson is that component's opaque props blob,
// so adding new block kinds never needs a schema migration.
public class TenantSection : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public string Kind { get; set; } = string.Empty;
    public int Position { get; set; }
    public bool IsVisible { get; set; } = true;
    public string DataJson { get; set; } = "{}";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
