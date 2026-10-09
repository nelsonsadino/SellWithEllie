using System.Text.RegularExpressions;
using SellWithEllie.Middleware;

namespace SellWithEllie.Data;

// Shared shop-address (slug) rules, used by both the public signup flow and
// the platform console's "create shop" action so they can never drift.
public static class SlugRules
{
    public static (bool IsValid, string? Reason) Validate(string? slug)
    {
        if (string.IsNullOrWhiteSpace(slug) || slug.Length < 3 || slug.Length > 30)
        {
            return (false, "Shop address must be 3-30 characters.");
        }

        slug = slug.ToLowerInvariant();
        if (!Regex.IsMatch(slug, "^[a-z0-9]+(-[a-z0-9]+)*$"))
        {
            return (false, "Use only lowercase letters, numbers, and hyphens (no leading/trailing hyphen).");
        }

        if (TenantResolutionMiddleware.ReservedSubdomains.Contains(slug))
        {
            return (false, "That shop address is reserved.");
        }

        return (true, null);
    }
}
