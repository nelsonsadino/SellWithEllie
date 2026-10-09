using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Deliberately NOT tenant-scoped via TenantScopedControllerBase: Login must
// work both for shop users (tenant resolved from subdomain) and for the
// platform-owner account (no tenant at all). Register, which creates a new
// shop-facing account, checks for a resolved tenant itself.
[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly ITokenService _tokenService;
    private readonly ITenantContext _tenantContext;
    private readonly IEmailSender _emailSender;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        ITokenService tokenService,
        ITenantContext tenantContext,
        IEmailSender emailSender,
        ILogger<AuthController> logger)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _tokenService = tokenService;
        _tenantContext = tenantContext;
        _emailSender = emailSender;
        _logger = logger;
    }

    private string ClientIp => HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        if (_tenantContext.TenantId is null)
        {
            return NotFound(new { message = "Unknown shop." });
        }

        var existing = await _userManager.FindByEmailAsync(request.Email);
        if (existing is not null)
        {
            return Conflict(new { message = "An account with that email already exists for this shop." });
        }

        var user = new ApplicationUser
        {
            // Email uniqueness is scoped per-tenant (via the query filter on
            // ApplicationUser), but Identity's UserName has a real database
            // unique index with no tenant awareness - so UserName is derived
            // from tenant + email to avoid two different shops colliding
            // when a customer happens to use the same email at both.
            UserName = $"t{_tenantContext.TenantId}-{request.Email}",
            Email = request.Email,
            DisplayName = request.DisplayName,
            TenantId = _tenantContext.TenantId
        };

        var result = await _userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", result.Errors.Select(e => e.Description)) });
        }

        await _userManager.AddToRoleAsync(user, ApplicationDbContext.CustomerRole);

        // Best-effort - a slow/unavailable mail server should never block
        // account creation. Silently no-ops if Email isn't configured.
        var (subject, html) = EmailTemplates.Welcome(user.DisplayName, _tenantContext.Tenant?.Name ?? "our shop");
        await _emailSender.SendAsync(user.Email ?? string.Empty, user.DisplayName, subject, html);

        return await BuildAuthResponse(user);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        // Deliberately generic error message on both "no such user" and
        // "wrong password" so the endpoint can't be used to enumerate
        // registered email addresses. FindByEmailAsync is automatically
        // scoped to the current shop (or to platform-admin accounts, when
        // no shop is resolved) by the ApplicationUser query filter.
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        // CheckPasswordSignInAsync (unlike CheckPasswordAsync) actually honours
        // the Identity lockout config set in Program.cs - it increments the
        // failed-attempt counter and locks the account after the threshold, so
        // password brute force is bounded per-account, not just per-IP by the
        // "auth" rate limiter.
        var result = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);

        if (result.IsLockedOut)
        {
            _logger.LogWarning("Auth: login blocked - account locked. user={UserId} tenant={Tenant} ip={Ip}",
                user.Id, _tenantContext.TenantId, ClientIp);
            return StatusCode(StatusCodes.Status429TooManyRequests,
                new { message = "Too many failed sign-in attempts. Please try again in a few minutes." });
        }

        if (!result.Succeeded)
        {
            _logger.LogWarning("Auth: failed login. user={UserId} tenant={Tenant} ip={Ip}",
                user.Id, _tenantContext.TenantId, ClientIp);
            return Unauthorized(new { message = "Invalid email or password." });
        }

        _logger.LogInformation("Auth: successful login. user={UserId} tenant={Tenant} ip={Ip}",
            user.Id, _tenantContext.TenantId, ClientIp);
        return await BuildAuthResponse(user);
    }

    // "Sign out everywhere": rotate the Identity security stamp so every token
    // ever issued for this account (this device and any other) is rejected on
    // its next request (see JwtBearerEvents.OnTokenValidated in Program.cs).
    // The client also drops its local copy - this endpoint is what makes the
    // logout stick server-side.
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = userId is null ? null : await _userManager.FindByIdAsync(userId);
        if (user is not null)
        {
            await _userManager.UpdateSecurityStampAsync(user);
            _logger.LogInformation("Auth: logout / sessions revoked. user={UserId} ip={Ip}", user.Id, ClientIp);
        }
        return NoContent();
    }

    private async Task<ActionResult<AuthResponse>> BuildAuthResponse(ApplicationUser user)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var (token, expiresAtUtc) = _tokenService.GenerateToken(user, roles);

        return Ok(new AuthResponse
        {
            Token = token,
            ExpiresAtUtc = expiresAtUtc,
            Email = user.Email ?? string.Empty,
            DisplayName = user.DisplayName,
            Roles = roles.ToList()
        });
    }
}
