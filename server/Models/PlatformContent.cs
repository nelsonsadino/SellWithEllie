namespace SellWithEllie.Models;

// Editable copy for the platform's own marketing site (sellwithellie.example),
// keyed by a dotted string. Not tenant-scoped - there is no tenant on the
// marketing site. Edited by a platform admin in the platform console.
public class PlatformContent
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
