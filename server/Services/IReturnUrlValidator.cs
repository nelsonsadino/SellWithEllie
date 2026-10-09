using SellWithEllie.Models;

namespace SellWithEllie.Services;

public interface IReturnUrlValidator
{
    // A redirect-target origin supplied by the client (e.g. where to send a
    // customer's browser after a Xendit payment completes) is only
    // trustworthy if it's actually the tenant's own storefront host - never
    // an attacker-controlled domain. Without this, a paying customer's
    // browser could be sent to a phishing page immediately after a real,
    // legitimate transaction completes on Xendit's own domain, primed to
    // look trustworthy off the back of it.
    bool IsValidForTenant(string? returnUrlBase, Tenant tenant);
}
