namespace SellWithEllie.Config;

// Credentials for "Continue with Google" / "Continue with Facebook" on the
// shop storefront's login/register pages. All four values are set via
// user-secrets (dev) or app settings (production) - never committed. Either
// pair can be left blank; the corresponding button is simply non-functional
// (returns 503) until it's configured, so the app still starts and the
// email/password flow keeps working either way.
public class ExternalAuthSettings
{
    public const string SectionName = "ExternalAuth";

    public string GoogleClientId { get; set; } = string.Empty;
    public string GoogleClientSecret { get; set; } = string.Empty;
    public string FacebookAppId { get; set; } = string.Empty;
    public string FacebookAppSecret { get; set; } = string.Empty;
}
