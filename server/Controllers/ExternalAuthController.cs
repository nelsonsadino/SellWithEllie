using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Facebook;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SellWithEllie.Config;
using SellWithEllie.Data;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// "Continue with Google" / "Continue with Facebook" for shop customers.
//
// Deliberately NOT TenantScopedControllerBase, and deliberately not reached
// through a shop's own subdomain: Google and Facebook only let an app
// register a small, fixed set of OAuth redirect URIs, so a per-tenant
// subdomain callback (acme.sellwithellie.example/...) could never scale as
// new shops sign up. Instead these endpoints live on the API's own single,
// fixed domain, and the shop is carried through the round trip as a "slug"
// value stashed in the OAuth AuthenticationProperties - the tenant context
// is set manually, once the slug is validated, before any tenant-scoped
// table is touched.
//
// Flow: the frontend does a full browser navigation (not fetch) to
// {provider}/start, which challenges Google/Facebook; they redirect back to
// this app's fixed /signin-google or /signin-facebook path (registered with
// the provider), which the authentication handler intercepts and turns into
// a sign-in against the short-lived "ExternalCookie" scheme, then redirects
// to our own {provider}/callback action here. That action mints our normal
// JWT and redirects the browser to the shop's own login page with the token
// in the URL fragment (never sent to any server, unlike a query string), so
// the SPA can pick it up and finish logging in exactly like a password login.
[ApiController]
[Route("api/auth/external")]
[EnableRateLimiting("auth")]
public class ExternalAuthController : ControllerBase
{
    public const string CookieScheme = "ExternalCookie";

    private static readonly Dictionary<string, string> ProviderSchemes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["google"] = GoogleDefaults.AuthenticationScheme,
        ["facebook"] = FacebookDefaults.AuthenticationScheme,
    };

    private readonly ApplicationDbContext _db;
    private readonly ITenantContext _tenantContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ITokenService _tokenService;
    private readonly IConfiguration _configuration;
    private readonly ExternalAuthSettings _externalAuthSettings;
    private readonly ILogger<ExternalAuthController> _logger;

    public ExternalAuthController(
        ApplicationDbContext db,
        ITenantContext tenantContext,
        UserManager<ApplicationUser> userManager,
        ITokenService tokenService,
        IConfiguration configuration,
        IOptions<ExternalAuthSettings> externalAuthSettings,
        ILogger<ExternalAuthController> logger)
    {
        _db = db;
        _tenantContext = tenantContext;
        _userManager = userManager;
        _tokenService = tokenService;
        _configuration = configuration;
        _externalAuthSettings = externalAuthSettings.Value;
        _logger = logger;
    }

    [HttpGet("{provider}/start")]
    public async Task<IActionResult> Start(string provider, [FromQuery] string slug, [FromQuery] string returnUrl)
    {
        if (!ProviderSchemes.TryGetValue(provider, out var scheme))
        {
            return BadRequest(new { message = "Unknown sign-in provider." });
        }

        if (!IsProviderConfigured(provider))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { message = $"Sign-in with {provider} is not configured on this server yet." });
        }

        if (string.IsNullOrWhiteSpace(slug) || string.IsNullOrWhiteSpace(returnUrl))
        {
            return BadRequest(new { message = "slug and returnUrl are required." });
        }

        var normalizedSlug = slug.Trim().ToLowerInvariant();
        var tenant = await _db.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Slug == normalizedSlug && t.IsActive);
        if (tenant is null)
        {
            return NotFound(new { message = "Unknown shop." });
        }

        if (!IsReturnUrlValidForSlug(returnUrl, normalizedSlug))
        {
            return BadRequest(new { message = "Invalid returnUrl for this shop." });
        }

        var properties = new AuthenticationProperties
        {
            RedirectUri = $"/api/auth/external/{provider}/callback"
        };
        properties.Items["slug"] = normalizedSlug;
        properties.Items["returnUrl"] = returnUrl;

        return Challenge(properties, scheme);
    }

    [HttpGet("{provider}/callback")]
    public async Task<IActionResult> Callback(string provider)
    {
        if (!ProviderSchemes.ContainsKey(provider))
        {
            return BadRequest(new { message = "Unknown sign-in provider." });
        }

        var result = await HttpContext.AuthenticateAsync(CookieScheme);

        // One-shot: this cookie only exists to carry state across the
        // redirect to the identity provider and back, never used again.
        await HttpContext.SignOutAsync(CookieScheme);

        if (!result.Succeeded || result.Principal is null)
        {
            return BadRequest(new { message = "Sign-in with the identity provider failed or was cancelled." });
        }

        // AuthenticationProperties.Items is typed as IDictionary<string, string?>,
        // which - unlike IReadOnlyDictionary<> - has no GetValueOrDefault overload
        // to extend, hence the plain TryGetValue lookup below.
        var slug = result.Properties is not null && result.Properties.Items.TryGetValue("slug", out var slugValue)
            ? slugValue
            : null;
        var returnUrl = result.Properties is not null && result.Properties.Items.TryGetValue("returnUrl", out var returnUrlValue)
            ? returnUrlValue
            : null;

        if (string.IsNullOrWhiteSpace(slug) || string.IsNullOrWhiteSpace(returnUrl))
        {
            return BadRequest(new { message = "Sign-in session expired or was tampered with. Please try again." });
        }

        if (!IsReturnUrlValidForSlug(returnUrl, slug))
        {
            return BadRequest(new { message = "Sign-in session expired or was tampered with. Please try again." });
        }

        var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Slug == slug && t.IsActive);
        if (tenant is null)
        {
            return NotFound(new { message = "Unknown shop." });
        }

        var email = result.Principal.FindFirstValue(ClaimTypes.Email);
        if (string.IsNullOrWhiteSpace(email))
        {
            _logger.LogWarning("External sign-in via {Provider} for shop {Slug} returned no email claim - the " +
                "provider account may have no verified email, or (Facebook) the user declined the email permission.",
                provider, slug);
            return RedirectToFrontend(returnUrl, error: "no_email");
        }

        var displayName = result.Principal.FindFirstValue(ClaimTypes.Name)
            ?? result.Principal.FindFirstValue(ClaimTypes.GivenName)
            ?? email;

        // Everything below needs this shop's tenant-scoped data (looking up
        // or creating the ApplicationUser row). This request never went
        // through TenantResolutionMiddleware - it's a direct browser redirect
        // from Google/Facebook to the API's own domain, with no
        // X-Tenant-Slug header - so the tenant context is set by hand here,
        // exactly once, from the slug validated above.
        _tenantContext.SetTenant(tenant);

        var user = await _userManager.FindByEmailAsync(email);
        if (user is null)
        {
            // First time this email has signed in to this shop via any
            // method - create the account. No password is set; the user can
            // only ever sign in via a provider until/unless a future
            // "set a password" flow is added. EmailConfirmed is true because
            // Google/Facebook already verified this address is real.
            user = new ApplicationUser
            {
                UserName = $"t{tenant.Id}-{email}",
                Email = email,
                DisplayName = displayName,
                TenantId = tenant.Id,
                EmailConfirmed = true
            };

            var createResult = await _userManager.CreateAsync(user);
            if (!createResult.Succeeded)
            {
                _logger.LogWarning("Could not create an account from {Provider} sign-in for {Email}: {Errors}",
                    provider, email, string.Join(" ", createResult.Errors.Select(e => e.Description)));
                return RedirectToFrontend(returnUrl, error: "account_error");
            }

            await _userManager.AddToRoleAsync(user, ApplicationDbContext.CustomerRole);
        }
        // An account with this email already exists for this shop (however
        // it was originally created) - since Google/Facebook already proved
        // ownership of the address, sign straight into it. This is the
        // standard "social sign-in doubles as sign-up, and links by email"
        // pattern; it's safe specifically because both providers verify the
        // email themselves before ever handing it to us.

        var roles = await _userManager.GetRolesAsync(user);
        var (token, expiresAtUtc) = _tokenService.GenerateToken(user, roles);

        return RedirectToFrontend(
            returnUrl,
            token: token,
            expiresAtUtc: expiresAtUtc,
            email: user.Email,
            displayName: user.DisplayName,
            roles: roles);
    }

    private bool IsProviderConfigured(string provider) => provider.ToLowerInvariant() switch
    {
        "google" => !string.IsNullOrWhiteSpace(_externalAuthSettings.GoogleClientId)
            && !string.IsNullOrWhiteSpace(_externalAuthSettings.GoogleClientSecret),
        "facebook" => !string.IsNullOrWhiteSpace(_externalAuthSettings.FacebookAppId)
            && !string.IsNullOrWhiteSpace(_externalAuthSettings.FacebookAppSecret),
        _ => false
    };

    // The frontend supplies returnUrl (so this works for any shop on any
    // domain/port without the backend hardcoding one), but it must not
    // become an open redirect: it's only ever honored when its host is
    // exactly the shop's own storefront host for the resolved slug, either
    // in production (`{slug}.{RootDomain}`) or local dev (`{slug}.localhost`,
    // any port - browsers already resolve *.localhost to the local machine).
    private bool IsReturnUrlValidForSlug(string returnUrl, string slug)
    {
        if (!Uri.TryCreate(returnUrl, UriKind.Absolute, out var uri)) return false;

        var isLocalhostDev = uri.Scheme == "http" && uri.Host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase);
        if (uri.Scheme != "https" && !isLocalhostDev) return false;

        var rootDomain = _configuration["RootDomain"];
        var expectedHost = string.IsNullOrWhiteSpace(rootDomain) ? $"{slug}.localhost" : $"{slug}.{rootDomain}";
        return uri.Host.Equals(expectedHost, StringComparison.OrdinalIgnoreCase);
    }

    // Hands control back to the SPA via a URL fragment, never a query
    // string - fragments are never sent in any HTTP request (including the
    // very next one the browser makes), so the JWT never touches server
    // logs, proxies, or the Referer header the way a query param could.
    private IActionResult RedirectToFrontend(
        string returnUrl,
        string? token = null,
        DateTime? expiresAtUtc = null,
        string? email = null,
        string? displayName = null,
        string? error = null,
        IList<string>? roles = null)
    {
        var fragment = error is not null
            ? $"authError={Uri.EscapeDataString(error)}"
            : $"token={Uri.EscapeDataString(token!)}" +
              $"&expiresAtUtc={Uri.EscapeDataString(expiresAtUtc!.Value.ToString("O"))}" +
              $"&email={Uri.EscapeDataString(email ?? string.Empty)}" +
              $"&displayName={Uri.EscapeDataString(displayName ?? string.Empty)}" +
              $"&roles={Uri.EscapeDataString(string.Join(',', roles ?? new List<string>()))}";

        return Redirect($"{returnUrl}#{fragment}");
    }
}
