using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Middleware;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Public, tenant-independent: this is how a brand new shop is provisioned.
// Deliberately NOT tenant-scoped (there's no tenant yet).
[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth")]
public class SignupController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ITokenService _tokenService;

    public SignupController(ApplicationDbContext db, UserManager<ApplicationUser> userManager, ITokenService tokenService)
    {
        _db = db;
        _userManager = userManager;
        _tokenService = tokenService;
    }

    [HttpGet("check-slug")]
    public async Task<ActionResult<SlugAvailabilityResponse>> CheckSlug([FromQuery] string slug)
    {
        var (isValid, reason) = ValidateSlugFormat(slug);
        if (!isValid)
        {
            return Ok(new SlugAvailabilityResponse { Available = false, Reason = reason });
        }

        var taken = await _db.Tenants.AnyAsync(t => t.Slug == slug.ToLowerInvariant());
        return Ok(new SlugAvailabilityResponse
        {
            Available = !taken,
            Reason = taken ? "That subdomain is already taken." : null
        });
    }

    [HttpPost]
    public async Task<ActionResult<SignupResponse>> Signup(SignupRequest request)
    {
        var slug = request.Slug.ToLowerInvariant();
        var (isValid, reason) = ValidateSlugFormat(slug);
        if (!isValid)
        {
            return BadRequest(new { message = reason });
        }

        if (await _db.Tenants.AnyAsync(t => t.Slug == slug))
        {
            return Conflict(new { message = "That subdomain is already taken." });
        }

        var tenant = new Tenant
        {
            Name = request.ShopName,
            Slug = slug,
            Plan = PlanTier.Free,
            SubscriptionStatus = TenantSubscriptionStatus.Active,
            IsActive = true
        };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        var adminUser = new ApplicationUser
        {
            UserName = $"t{tenant.Id}-{request.AdminEmail}",
            Email = request.AdminEmail,
            DisplayName = request.AdminDisplayName,
            TenantId = tenant.Id,
            EmailConfirmed = true
        };

        var result = await _userManager.CreateAsync(adminUser, request.AdminPassword);
        if (!result.Succeeded)
        {
            // Roll back the tenant so a failed signup doesn't leave an
            // orphaned shop with no admin behind it.
            _db.Tenants.Remove(tenant);
            await _db.SaveChangesAsync();
            return BadRequest(new { message = string.Join(" ", result.Errors.Select(e => e.Description)) });
        }

        await _userManager.AddToRoleAsync(adminUser, ApplicationDbContext.AdminRole);

        // Give the brand-new shop a starter home page so it isn't blank.
        Data.TenantDefaults.SeedStorefront(_db, tenant);

        var roles = await _userManager.GetRolesAsync(adminUser);
        var (token, expiresAtUtc) = _tokenService.GenerateToken(adminUser, roles);

        return Ok(new SignupResponse
        {
            Shop = new TenantInfoDto { Id = tenant.Id, Name = tenant.Name, Slug = tenant.Slug, Plan = tenant.Plan.ToString() },
            Auth = new AuthResponse
            {
                Token = token,
                ExpiresAtUtc = expiresAtUtc,
                Email = adminUser.Email!,
                DisplayName = adminUser.DisplayName,
                Roles = roles.ToList()
            }
        });
    }

    private static (bool IsValid, string? Reason) ValidateSlugFormat(string? slug) => SlugRules.Validate(slug);
}
