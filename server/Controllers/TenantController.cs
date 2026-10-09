using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Mapping;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Public storefront bootstrap + the shop-admin surface for customising it:
// design template, editable copy, and the ordered blocks that make up the
// home page. Everything here is tenant-scoped.
[Route("api/[controller]")]
public class TenantController : TenantScopedControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IBlobStorageService _blobStorage;
    private readonly ISecretCipher _cipher;

    public TenantController(
        ApplicationDbContext db,
        IBlobStorageService blobStorage,
        ISecretCipher cipher,
        ITenantContext tenantContext) : base(tenantContext)
    {
        _db = db;
        _blobStorage = blobStorage;
        _cipher = cipher;
    }

    private static string Currency(Tenant t) =>
        string.IsNullOrWhiteSpace(t.CurrencyCode) ? "USD" : t.CurrencyCode.ToUpperInvariant();

    [HttpGet("current")]
    public async Task<ActionResult<TenantInfoDto>> GetCurrent()
    {
        var tenant = TenantContext.Tenant!;

        var content = await _db.TenantContents.AsNoTracking()
            .ToDictionaryAsync(c => c.Key, c => c.Value);

        var sections = await _db.TenantSections.AsNoTracking()
            .Where(s => s.IsVisible)
            .OrderBy(s => s.Position)
            .ToListAsync();

        return Ok(new TenantInfoDto
        {
            Id = tenant.Id,
            Name = tenant.Name,
            Slug = tenant.Slug,
            Plan = tenant.Plan.ToString(),
            // Older tenant rows predate these columns and can be blank.
            ThemeTemplate = string.IsNullOrWhiteSpace(tenant.ThemeTemplate) ? "marketstall" : tenant.ThemeTemplate,
            ThemeMode = string.IsNullOrWhiteSpace(tenant.ThemeMode) ? "system" : tenant.ThemeMode,
            CurrencyCode = Currency(tenant),
            LowStockThreshold = tenant.LowStockThreshold,
            Content = content,
            Sections = sections.Select(s => s.ToDto()).ToList()
        });
    }

    [HttpPut("inventory")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> UpdateInventorySettings(UpdateInventorySettingsRequest request)
    {
        var tenant = await _db.Tenants.FirstAsync(t => t.Id == TenantContext.TenantId);
        tenant.LowStockThreshold = Math.Clamp(request.LowStockThreshold, 0, 100000);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---- Admin: payments (currency + the shop's own Xendit account) ------
    [HttpGet("payments")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public ActionResult<PaymentSettingsDto> GetPaymentSettings()
    {
        var tenant = TenantContext.Tenant!;
        var secret = _cipher.Decrypt(tenant.XenditSecretKeyEnc);

        return Ok(new PaymentSettingsDto
        {
            CurrencyCode = Currency(tenant),
            PlatformSupportsConnect = _cipher.IsConfigured,
            XenditConnected = !string.IsNullOrEmpty(secret),
            // Last-4 only (industry-standard convention for a key/card hint) -
            // showing both ends narrows a live payment-processor credential
            // more than necessary just to confirm "a key is connected".
            XenditSecretKeyHint = string.IsNullOrEmpty(secret)
                ? null
                : $"…{secret[^Math.Min(4, secret.Length)..]}",
            WebhookTokenSet = !string.IsNullOrEmpty(_cipher.Decrypt(tenant.XenditWebhookTokenEnc)),
            WebhookUrl = $"{Request.Scheme}://{Request.Host}/api/payments/webhook"
        });
    }

    [HttpPut("payments")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> UpdatePaymentSettings(UpdatePaymentSettingsRequest request)
    {
        var tenant = await _db.Tenants.FirstAsync(t => t.Id == TenantContext.TenantId);
        tenant.CurrencyCode = request.CurrencyCode.ToUpperInvariant();

        // A single dash means "disconnect / wipe"; a real value means
        // "(re)connect"; null/blank means "leave as is".
        static string? Apply(string? incoming, string? current, ISecretCipher cipher, out bool changed)
        {
            changed = false;
            if (string.IsNullOrWhiteSpace(incoming)) return current;
            changed = true;
            return incoming.Trim() == "-" ? null : cipher.Encrypt(incoming.Trim());
        }

        var touchingCreds = !string.IsNullOrWhiteSpace(request.XenditSecretKey)
            || !string.IsNullOrWhiteSpace(request.XenditWebhookToken);
        if (touchingCreds && !_cipher.IsConfigured)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Connecting a payment account isn't available on this server yet (Payments:EncryptionKey not set)."
            });
        }

        if (!string.IsNullOrWhiteSpace(request.XenditSecretKey)
            && request.XenditSecretKey.Trim() != "-"
            && !request.XenditSecretKey.Trim().StartsWith("xnd_", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "That doesn't look like a Xendit secret key (they start with 'xnd_')." });
        }

        tenant.XenditSecretKeyEnc = Apply(request.XenditSecretKey, tenant.XenditSecretKeyEnc, _cipher, out _);
        tenant.XenditWebhookTokenEnc = Apply(request.XenditWebhookToken, tenant.XenditWebhookTokenEnc, _cipher, out _);

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---- Admin: read everything (incl. hidden blocks) --------------------
    [HttpGet("settings")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<TenantSettingsDto>> GetSettings()
    {
        var tenant = TenantContext.Tenant!;
        var content = await _db.TenantContents.AsNoTracking()
            .ToDictionaryAsync(c => c.Key, c => c.Value);
        var sections = await _db.TenantSections.AsNoTracking()
            .OrderBy(s => s.Position)
            .ToListAsync();

        return Ok(new TenantSettingsDto
        {
            ThemeTemplate = string.IsNullOrWhiteSpace(tenant.ThemeTemplate) ? "marketstall" : tenant.ThemeTemplate,
            ThemeMode = string.IsNullOrWhiteSpace(tenant.ThemeMode) ? "system" : tenant.ThemeMode,
            Content = content,
            Sections = sections.Select(s => s.ToDto()).ToList()
        });
    }

    [HttpPut("theme")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> UpdateTheme(UpdateThemeRequest request)
    {
        if (!TenantDefaults.Templates.Contains(request.ThemeTemplate))
            return BadRequest(new { message = "Unknown design template." });
        if (!TenantDefaults.Modes.Contains(request.ThemeMode))
            return BadRequest(new { message = "Unknown theme mode." });

        var tenant = await _db.Tenants.FirstAsync(t => t.Id == TenantContext.TenantId);
        tenant.ThemeTemplate = request.ThemeTemplate.ToLowerInvariant();
        tenant.ThemeMode = request.ThemeMode.ToLowerInvariant();
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // TenantContent.Value has no DB-level max length (it backs free-form copy
    // like a hero paragraph), and a Dictionary<string,string> body can't carry
    // a [StringLength] on its values via Data Annotations - so this is
    // enforced by hand here, same as the existing key-length check below.
    private const int MaxContentValueLength = 20_000;

    [HttpPut("content")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> UpdateContent(UpsertContentRequest request)
    {
        var existing = await _db.TenantContents.ToDictionaryAsync(c => c.Key);

        foreach (var (key, value) in request.Entries)
        {
            if (string.IsNullOrWhiteSpace(key) || key.Length > 128) continue;
            if (value is not null && value.Length > MaxContentValueLength) continue;

            if (string.IsNullOrWhiteSpace(value))
            {
                // Empty = revert this key to the shipped default.
                if (existing.TryGetValue(key, out var toDelete))
                {
                    _db.TenantContents.Remove(toDelete);
                }
            }
            else if (existing.TryGetValue(key, out var row))
            {
                row.Value = value;
            }
            else
            {
                _db.TenantContents.Add(new TenantContent { Key = key, Value = value });
            }
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---- Admin: home-page blocks ---------------------------------------
    [HttpPost("sections")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<SectionDto>> CreateSection(SectionWriteRequest request)
    {
        if (!TenantDefaults.SectionKinds.Contains(request.Kind))
            return BadRequest(new { message = $"Unknown block type '{request.Kind}'." });

        var nextPosition = await _db.TenantSections.AnyAsync()
            ? await _db.TenantSections.MaxAsync(s => s.Position) + 1
            : 0;

        var section = new TenantSection
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
        _db.TenantSections.Add(section);
        await _db.SaveChangesAsync();
        return Ok(section.ToDto());
    }

    [HttpPut("sections/{id:int}")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<SectionDto>> UpdateSection(int id, SectionWriteRequest request)
    {
        var section = await _db.TenantSections.FirstOrDefaultAsync(s => s.Id == id);
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

    [HttpDelete("sections/{id:int}")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> DeleteSection(int id)
    {
        var section = await _db.TenantSections.FirstOrDefaultAsync(s => s.Id == id);
        if (section is null) return NotFound();
        _db.TenantSections.Remove(section);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("sections/order")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> ReorderSections(ReorderRequest request)
    {
        var sections = await _db.TenantSections.ToListAsync();
        for (var i = 0; i < request.OrderedIds.Count; i++)
        {
            var match = sections.FirstOrDefault(s => s.Id == request.OrderedIds[i]);
            if (match is not null) match.Position = i;
        }
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---- Admin: upload an image / video for a storefront block ----------
    private static readonly HashSet<string> AllowedMediaTypes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "image/jpeg", "image/png", "image/webp", "image/gif",
            "video/mp4", "video/webm", "video/quicktime"
        };

    [HttpPost("media")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    [RequestSizeLimit(524_288_000)]
    public async Task<IActionResult> UploadMedia([FromForm] List<IFormFile> files)
    {
        if (!_blobStorage.IsConfigured)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "File uploads are not configured on this server yet. Paste a hosted video URL instead."
            });
        }

        var file = files?.FirstOrDefault();
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "No file was uploaded." });

        if (!AllowedMediaTypes.Contains(file.ContentType))
            return BadRequest(new { message = $"'{file.FileName}' is not a supported image or video type." });

        if (file.Length > _blobStorage.MaxFileSizeBytes)
        {
            return BadRequest(new
            {
                message = $"'{file.FileName}' is larger than the {_blobStorage.MaxFileSizeBytes / (1024 * 1024)} MB limit."
            });
        }

        // The declared Content-Type is caller-supplied - confirm the bytes.
        if (!UploadValidation.TryValidate(file, out var validationError))
            return BadRequest(new { message = validationError });

        await using var stream = file.OpenReadStream();
        var result = await _blobStorage.UploadAsync(stream, file.FileName, file.ContentType);
        return Ok(new { url = result.Url, isVideo = result.IsVideo });
    }
}
