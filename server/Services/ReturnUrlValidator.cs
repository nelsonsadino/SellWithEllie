using SellWithEllie.Models;

namespace SellWithEllie.Services;

// Mirrors ExternalAuthController.IsReturnUrlValidForSlug's logic - that
// controller's version is a private method it can't share with services
// registered in DI, so this is the reusable equivalent for everywhere else
// a client-supplied return URL feeds into a payment gateway redirect.
public class ReturnUrlValidator : IReturnUrlValidator
{
    private readonly IConfiguration _configuration;

    public ReturnUrlValidator(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public bool IsValidForTenant(string? returnUrlBase, Tenant tenant)
    {
        if (string.IsNullOrWhiteSpace(returnUrlBase)) return false;
        if (!Uri.TryCreate(returnUrlBase, UriKind.Absolute, out var uri)) return false;

        var isLocalhostDev = uri.Scheme == "http" && uri.Host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase);
        if (uri.Scheme != "https" && !isLocalhostDev) return false;

        var rootDomain = _configuration["RootDomain"];
        var expectedHost = string.IsNullOrWhiteSpace(rootDomain) ? $"{tenant.Slug}.localhost" : $"{tenant.Slug}.{rootDomain}";
        return uri.Host.Equals(expectedHost, StringComparison.OrdinalIgnoreCase);
    }
}
