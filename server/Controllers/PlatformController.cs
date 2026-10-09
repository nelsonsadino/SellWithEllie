using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Mapping;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// The platform owner's view across every shop on the SaaS. Deliberately not
// tenant-scoped - a platform admin operates with no single shop context.
[ApiController]
[Route("api/platform")]
[Authorize(Roles = ApplicationDbContext.PlatformAdminRole)]
public class PlatformController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ITenantCache _tenantCache;

    public PlatformController(ApplicationDbContext db, UserManager<ApplicationUser> userManager, ITenantCache tenantCache)
    {
        _db = db;
        _userManager = userManager;
        _tenantCache = tenantCache;
    }

    [HttpGet("tenants")]
    public async Task<ActionResult<List<PlatformTenantDto>>> GetTenants()
    {
        // The ProductCount subquery below looks like it would run once per
        // tenant, but EF translates it into a single correlated subquery in
        // one SQL statement (verified via ToQueryString()) - not N+1 - so
        // this stays one round-trip no matter how many tenants exist.
        var tenants = await _db.Tenants
            .OrderByDescending(t => t.CreatedAtUtc)
            .Select(t => new PlatformTenantDto
            {
                Id = t.Id,
                Name = t.Name,
                Slug = t.Slug,
                Plan = t.Plan.ToString(),
                SubscriptionStatus = t.SubscriptionStatus.ToString(),
                IsActive = t.IsActive,
                CreatedAtUtc = t.CreatedAtUtc,
                ProductCount = _db.Products.IgnoreQueryFilters().Count(p => p.TenantId == t.Id)
            })
            .ToListAsync();

        return Ok(tenants);
    }

    // Provision a new shop straight from the console: tenant + its first
    // admin + a starter storefront, using the same slug rules and seeding as
    // public signup. Nobody is signed in - the platform admin hands the
    // temporary password to the shop owner.
    [HttpPost("tenants")]
    public async Task<ActionResult<PlatformTenantDto>> CreateTenant(CreateTenantRequest request)
    {
        var slug = request.Slug.Trim().ToLowerInvariant();

        var (isValid, reason) = SlugRules.Validate(slug);
        if (!isValid) return BadRequest(new { message = reason });

        if (await _db.Tenants.AnyAsync(t => t.Slug == slug))
        {
            return Conflict(new { message = "That shop address is already taken." });
        }

        if (!Enum.TryParse<PlanTier>(request.Plan, ignoreCase: true, out var plan))
        {
            plan = PlanTier.Free;
        }

        var tenant = new Tenant
        {
            Name = request.ShopName.Trim(),
            Slug = slug,
            Plan = plan,
            SubscriptionStatus = TenantSubscriptionStatus.Active,
            IsActive = true
        };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        var adminUser = new ApplicationUser
        {
            // Prefixed with the tenant id so the unique username index never
            // collides across shops (mirrors SignupController).
            UserName = $"t{tenant.Id}-{request.AdminEmail}",
            Email = request.AdminEmail,
            DisplayName = request.AdminDisplayName,
            TenantId = tenant.Id,
            EmailConfirmed = true
        };

        var result = await _userManager.CreateAsync(adminUser, request.AdminPassword);
        if (!result.Succeeded)
        {
            // Roll the tenant back so a failed admin creation doesn't leave an
            // orphaned shop with no way in.
            _db.Tenants.Remove(tenant);
            await _db.SaveChangesAsync();
            return BadRequest(new { message = string.Join(" ", result.Errors.Select(e => e.Description)) });
        }

        await _userManager.AddToRoleAsync(adminUser, ApplicationDbContext.AdminRole);
        TenantDefaults.SeedStorefront(_db, tenant);

        return Ok(new PlatformTenantDto
        {
            Id = tenant.Id,
            Name = tenant.Name,
            Slug = tenant.Slug,
            Plan = tenant.Plan.ToString(),
            SubscriptionStatus = tenant.SubscriptionStatus.ToString(),
            IsActive = tenant.IsActive,
            CreatedAtUtc = tenant.CreatedAtUtc,
            ProductCount = 0
        });
    }

    [HttpPost("tenants/{id:int}/deactivate")]
    public async Task<IActionResult> Deactivate(int id)
    {
        var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.Id == id);
        if (tenant is null) return NotFound();

        tenant.IsActive = false;
        await _db.SaveChangesAsync();
        _tenantCache.Invalidate(tenant.Slug);
        return NoContent();
    }

    [HttpPost("tenants/{id:int}/activate")]
    public async Task<IActionResult> Activate(int id)
    {
        var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.Id == id);
        if (tenant is null) return NotFound();

        tenant.IsActive = true;
        await _db.SaveChangesAsync();
        _tenantCache.Invalidate(tenant.Slug);
        return NoContent();
    }

    // ---- Marketing site (sellwithellie.example) editing ------------------
    [HttpGet("marketing")]
    public async Task<ActionResult<MarketingSiteDto>> GetMarketing()
    {
        var content = await _db.PlatformContents.AsNoTracking()
            .ToDictionaryAsync(c => c.Key, c => c.Value);
        var sections = await _db.PlatformSections.AsNoTracking()
            .OrderBy(s => s.Position)
            .ToListAsync();

        return Ok(new MarketingSiteDto
        {
            Content = content,
            Sections = sections.Select(s => s.ToDto()).ToList()
        });
    }

    // Same reasoning as TenantController.MaxContentValueLength - PlatformContent
    // .Value has no DB-level cap and a dictionary body can't carry a
    // [StringLength] on its values via Data Annotations.
    private const int MaxContentValueLength = 20_000;

    [HttpPut("marketing/content")]
    public async Task<IActionResult> UpdateMarketingContent(UpsertContentRequest request)
    {
        var existing = await _db.PlatformContents.ToDictionaryAsync(c => c.Key);

        foreach (var (key, value) in request.Entries)
        {
            if (string.IsNullOrWhiteSpace(key) || key.Length > 128) continue;
            if (value is not null && value.Length > MaxContentValueLength) continue;

            if (string.IsNullOrWhiteSpace(value))
            {
                if (existing.TryGetValue(key, out var toDelete)) _db.PlatformContents.Remove(toDelete);
            }
            else if (existing.TryGetValue(key, out var row))
            {
                row.Value = value;
            }
            else
            {
                _db.PlatformContents.Add(new PlatformContent { Key = key, Value = value });
            }
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("marketing/sections")]
    public async Task<ActionResult<SectionDto>> CreateMarketingSection(SectionWriteRequest request)
    {
        if (!TenantDefaults.SectionKinds.Contains(request.Kind))
            return BadRequest(new { message = $"Unknown block type '{request.Kind}'." });

        var nextPosition = await _db.PlatformSections.AnyAsync()
            ? await _db.PlatformSections.MaxAsync(s => s.Position) + 1
            : 0;

        var section = new PlatformSection
        {
            Kind = request.Kind,
            Position = nextPosition,
            IsVisible = request.IsVisible,
            DataJson = request.Data.ValueKind == System.Text.Json.JsonValueKind.Undefined
                ? "{}"
                : request.Data.GetRawText(),
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };
        _db.PlatformSections.Add(section);
        await _db.SaveChangesAsync();
        return Ok(section.ToDto());
    }

    [HttpPut("marketing/sections/{id:int}")]
    public async Task<ActionResult<SectionDto>> UpdateMarketingSection(int id, SectionWriteRequest request)
    {
        var section = await _db.PlatformSections.FirstOrDefaultAsync(s => s.Id == id);
        if (section is null) return NotFound();

        if (!TenantDefaults.SectionKinds.Contains(request.Kind))
            return BadRequest(new { message = $"Unknown block type '{request.Kind}'." });

        section.Kind = request.Kind;
        section.IsVisible = request.IsVisible;
        section.DataJson = request.Data.ValueKind == System.Text.Json.JsonValueKind.Undefined
            ? "{}"
            : request.Data.GetRawText();
        section.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(section.ToDto());
    }

    [HttpDelete("marketing/sections/{id:int}")]
    public async Task<IActionResult> DeleteMarketingSection(int id)
    {
        var section = await _db.PlatformSections.FirstOrDefaultAsync(s => s.Id == id);
        if (section is null) return NotFound();
        _db.PlatformSections.Remove(section);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("marketing/sections/order")]
    public async Task<IActionResult> ReorderMarketingSections(ReorderRequest request)
    {
        var sections = await _db.PlatformSections.ToListAsync();
        for (var i = 0; i < request.OrderedIds.Count; i++)
        {
            var match = sections.FirstOrDefault(s => s.Id == request.OrderedIds[i]);
            if (match is not null) match.Position = i;
        }
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
