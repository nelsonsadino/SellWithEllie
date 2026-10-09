namespace SellWithEllie.Models;

// Marker interface for any entity that belongs to exactly one shop (Tenant).
// ApplicationDbContext uses this to (a) auto-stamp TenantId on insert so
// controllers never have to remember to set it, and (b) apply a global query
// filter so a query can never accidentally cross shops.
public interface ITenantScoped
{
    int TenantId { get; set; }
}
