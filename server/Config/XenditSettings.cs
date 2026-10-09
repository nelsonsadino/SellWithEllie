namespace SellWithEllie.Config;

// Bound from the "Xendit" configuration section. SecretKey and
// CallbackVerificationToken are sensitive - set them via
// `dotnet user-secrets set "Xendit:SecretKey" "xnd_development_..."` etc.
// in development, never in appsettings.json. ProPlanAmount/Currency/Country
// aren't secret and can live in appsettings.json directly.
public class XenditSettings
{
    public const string SectionName = "Xendit";

    // Xendit API secret key (test keys start with "xnd_development_",
    // live keys with "xnd_production_"). Sent as the Basic-auth username
    // on every request, with an empty password.
    public string SecretKey { get; set; } = string.Empty;

    // The "Verification Token" from Dashboard > Settings > Developers >
    // Callbacks. Compared directly against the incoming x-callback-token
    // header - Xendit's webhook auth is a shared secret, not an HMAC
    // signature like Stripe's.
    public string CallbackVerificationToken { get; set; } = string.Empty;

    // Charged per billing cycle for the Pro plan. Xendit has no "Price"
    // catalog object like Stripe - the amount is just sent on each request.
    public decimal ProPlanAmount { get; set; } = 1499m;

    public string Currency { get; set; } = "PHP";
    public string Country { get; set; } = "PH";
}
