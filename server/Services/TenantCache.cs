using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SellWithEllie.Data;
using SellWithEllie.Models;

namespace SellWithEllie.Services;

// Caches the (slug -> active Tenant) lookup that TenantResolutionMiddleware
// would otherwise run against the shared Tenants table on every single
// request, for every shop on the platform. It's already an indexed lookup
// (Tenant.Slug is unique-indexed) so it was never slow - but it was one
// extra pooled DB connection checked out and returned per request, on the
// one table every tenant's traffic hits in common. As the platform grows to
// many active shops each generating steady traffic, that's the one place
// where "how many tenants exist and are busy" adds load to a resource every
// tenant shares, so it's worth cutting out even though each individual
// lookup is cheap. Mirrors the existing 60s IMemoryCache pattern used for
// the JWT security-stamp check in Program.cs.
public interface ITenantCache
{
    Task<Tenant?> GetActiveBySlugAsync(string slug, ApplicationDbContext db);
    void Invalidate(string slug);
}

public class TenantCache : ITenantCache
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);
    private readonly IMemoryCache _cache;

    public TenantCache(IMemoryCache cache) => _cache = cache;

    private static string Key(string slug) => $"tenant:{slug}";

    public Task<Tenant?> GetActiveBySlugAsync(string slug, ApplicationDbContext db)
    {
        // Only a successful resolution is cached - a miss (wrong slug, or a
        // shop that isn't active) is never cached, so a shop that was just
        // created a moment ago, or reactivated, is never left unresolvable
        // by a stale negative entry. The cost of a miss stays exactly what
        // it is today: one indexed lookup.
        return _cache.TryGetValue(Key(slug), out Tenant? cached)
            ? Task.FromResult(cached)
            : LoadAndCacheAsync(slug, db);
    }

    private async Task<Tenant?> LoadAndCacheAsync(string slug, ApplicationDbContext db)
    {
        var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Slug == slug && t.IsActive);
        if (tenant is not null)
        {
            _cache.Set(Key(slug), tenant, Ttl);
        }
        return tenant;
    }

    // Called wherever a tenant's IsActive, Slug, Plan or SubscriptionStatus
    // changes (platform activate/deactivate, billing webhooks) so those
    // take effect immediately instead of waiting out the TTL - the cache
    // only exists to remove a redundant DB round-trip, never to make those
    // changes visibly slower to take effect.
    public void Invalidate(string slug) => _cache.Remove(Key(slug));
}
