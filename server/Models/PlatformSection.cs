namespace SellWithEllie.Models;

// One stacked block on the platform's own editable marketing site. Mirrors
// TenantSection but is not tenant-scoped. Edited by a platform admin.
public class PlatformSection
{
    public int Id { get; set; }

    public string Kind { get; set; } = string.Empty;
    public int Position { get; set; }
    public bool IsVisible { get; set; } = true;
    public string DataJson { get; set; } = "{}";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
