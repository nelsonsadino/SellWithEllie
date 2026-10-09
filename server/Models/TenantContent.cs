namespace SellWithEllie.Models;

// One overridable piece of storefront copy for a shop, keyed by a dotted
// string (e.g. "home.hero.title"). The frontend ships a catalog of default
// values; a row here overrides exactly one of them, for this tenant only.
// Deleting the row reverts that string to the shipped default.
public class TenantContent : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
