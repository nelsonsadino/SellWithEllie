using SellWithEllie.Models;

namespace SellWithEllie.Services;

// Scoped per-request. Populated by TenantResolutionMiddleware before any
// controller or DbContext query runs.
public interface ITenantContext
{
    int? TenantId { get; }
    Tenant? Tenant { get; }
    void SetTenant(Tenant tenant);
}
