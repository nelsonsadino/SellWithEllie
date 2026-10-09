using SellWithEllie.Data;
using SellWithEllie.Services;

namespace SellWithEllie.Middleware;

// Figures out which shop (Tenant) this request is for, before any
// controller runs. The frontend sends the shop's subdomain explicitly via
// the X-Tenant-Slug header (derived from window.location.hostname), which
// keeps the API on a single stable hostname even though shop storefronts
// live on wildcard subdomains of a different (frontend) host. Falling back
// to parsing the request's own Host header covers direct API testing and a
// same-host deployment.
//
// Resolving no tenant is not an error here - some routes (platform admin,
// signup, health checks) are intentionally tenant-independent. Controllers
// that require a tenant enforce that themselves (see TenantScopedControllerBase).
public class TenantResolutionMiddleware
{
    public static readonly HashSet<string> ReservedSubdomains = new(StringComparer.OrdinalIgnoreCase)
    {
        "www", "api", "app", "admin", "platform"
    };

    private readonly RequestDelegate _next;

    public TenantResolutionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ApplicationDbContext db, ITenantContext tenantContext, ITenantCache tenantCache)
    {
        var slug = ResolveSlug(context);

        if (!string.IsNullOrWhiteSpace(slug))
        {
            var tenant = await tenantCache.GetActiveBySlugAsync(slug, db);

            if (tenant is not null)
            {
                tenantContext.SetTenant(tenant);
            }
        }

        await _next(context);
    }

    private static string? ResolveSlug(HttpContext context)
    {
        var header = context.Request.Headers["X-Tenant-Slug"].ToString();
        if (!string.IsNullOrWhiteSpace(header))
        {
            return header.Trim().ToLowerInvariant();
        }

        var host = context.Request.Host.Host;
        var parts = host.Split('.');
        if (parts.Length < 2) return null;

        var candidate = parts[0].ToLowerInvariant();
        return ReservedSubdomains.Contains(candidate) ? null : candidate;
    }
}
