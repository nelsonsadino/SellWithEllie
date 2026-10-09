using SellWithEllie.Models;

namespace SellWithEllie.Services;

public class TenantContext : ITenantContext
{
    public Tenant? Tenant { get; private set; }
    public int? TenantId => Tenant?.Id;

    public void SetTenant(Tenant tenant) => Tenant = tenant;
}
