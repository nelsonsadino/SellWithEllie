using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SellWithEllie.Config;
using SellWithEllie.Data;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Receives server-to-server events from Xendit. Deliberately NOT a
// TenantScopedControllerBase (Xendit's servers can't send an X-Tenant-Slug
// header or hit a shop subdomain) and not [Authorize] - authenticity is
// verified via the x-callback-token header instead.
[ApiController]
[Route("api/billing/webhook")]
public class BillingWebhookController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly XenditSettings _xenditSettings;
    private readonly ILogger<BillingWebhookController> _logger;
    private readonly ITenantCache _tenantCache;

    public BillingWebhookController(
        ApplicationDbContext db,
        IOptions<XenditSettings> xenditSettings,
        ILogger<BillingWebhookController> logger,
        ITenantCache tenantCache)
    {
        _db = db;
        _xenditSettings = xenditSettings.Value;
        _logger = logger;
        _tenantCache = tenantCache;
    }

    [HttpPost]
    public async Task<IActionResult> Handle()
    {
        if (string.IsNullOrWhiteSpace(_xenditSettings.CallbackVerificationToken))
        {
            _logger.LogError("Received a Xendit webhook but Xendit:CallbackVerificationToken is not configured.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        // Xendit's webhook auth is a static shared secret compared against
        // this header (Dashboard > Settings > Developers > Callbacks) -
        // not an HMAC signature over the body like Stripe's. A fixed-time
        // comparison costs nothing and avoids leaking the token's contents
        // through response-time differences.
        var providedToken = Request.Headers["x-callback-token"].ToString();
        if (string.IsNullOrEmpty(providedToken) || !FixedTimeEquals(providedToken, _xenditSettings.CallbackVerificationToken))
        {
            _logger.LogWarning("Xendit webhook rejected - missing or mismatched x-callback-token.");
            return Unauthorized();
        }

        using var doc = await JsonDocument.ParseAsync(Request.Body);
        var root = doc.RootElement;
        var eventType = root.TryGetProperty("event", out var eventProp) ? eventProp.GetString() : null;
        var data = root.TryGetProperty("data", out var dataProp) ? dataProp : default;

        switch (eventType)
        {
            case "recurring.plan.activated":
                await HandlePlanActivated(data);
                break;

            case "recurring.plan.inactivated":
                await HandlePlanInactivated(data);
                break;

            case "recurring.cycle.succeeded":
                await HandleCycleSucceeded(data);
                break;

            case "recurring.cycle.failed":
            case "recurring.cycle.force_attempt_failed":
                await HandleCycleFailed(data);
                break;

            default:
                // payment_session.completed/expired and the created/retrying
                // cycle events are informational only here - the plan
                // webhooks above are the authoritative state transitions,
                // since a completed payment session doesn't necessarily mean
                // the resulting plan finished activating yet.
                break;
        }

        return Ok();
    }

    private async Task HandlePlanActivated(JsonElement data)
    {
        var planId = GetString(data, "id");
        var referenceId = GetString(data, "reference_id");
        var customerId = GetString(data, "customer_id");

        var tenant = await ResolveTenant(referenceId, planId);
        if (tenant is null)
        {
            _logger.LogWarning("recurring.plan.activated for plan {PlanId} has no resolvable tenant.", planId);
            return;
        }

        tenant.XenditRecurringPlanId = planId;
        if (!string.IsNullOrEmpty(customerId))
        {
            tenant.XenditCustomerId = customerId;
        }
        tenant.Plan = PlanTier.Pro;
        tenant.SubscriptionStatus = TenantSubscriptionStatus.Active;

        await _db.SaveChangesAsync();
        _tenantCache.Invalidate(tenant.Slug);
        _logger.LogInformation("Tenant {TenantId} upgraded to Pro via Xendit plan {PlanId}.", tenant.Id, planId);
    }

    private async Task HandlePlanInactivated(JsonElement data)
    {
        var planId = GetString(data, "id");
        var referenceId = GetString(data, "reference_id");

        var tenant = await ResolveTenant(referenceId, planId);
        if (tenant is null) return;

        tenant.Plan = PlanTier.Free;
        tenant.SubscriptionStatus = TenantSubscriptionStatus.Canceled;
        await _db.SaveChangesAsync();
        _tenantCache.Invalidate(tenant.Slug);
    }

    private async Task HandleCycleSucceeded(JsonElement data)
    {
        var tenant = await FindTenantByPlanId(GetString(data, "plan_id"));
        if (tenant is null) return;

        tenant.SubscriptionStatus = TenantSubscriptionStatus.Active;
        tenant.Plan = PlanTier.Pro;
        await _db.SaveChangesAsync();
        _tenantCache.Invalidate(tenant.Slug);
    }

    private async Task HandleCycleFailed(JsonElement data)
    {
        var tenant = await FindTenantByPlanId(GetString(data, "plan_id"));
        if (tenant is null) return;

        // A single failed attempt doesn't necessarily end the subscription -
        // Xendit keeps retrying per the plan's own retry/dunning schedule
        // before the plan eventually goes INACTIVE. Reflect "at risk" now;
        // recurring.plan.inactivated above is what actually downgrades the
        // tenant once retries are exhausted.
        tenant.SubscriptionStatus = TenantSubscriptionStatus.PastDue;
        await _db.SaveChangesAsync();
        _tenantCache.Invalidate(tenant.Slug);
    }

    private async Task<Tenant?> ResolveTenant(string? referenceId, string? planId)
    {
        if (!string.IsNullOrEmpty(planId))
        {
            var byPlan = await _db.Tenants.FirstOrDefaultAsync(t => t.XenditRecurringPlanId == planId);
            if (byPlan is not null) return byPlan;
        }

        // reference_id follows the "tenant-{id}-pro" convention set in
        // BillingController.CreateCheckoutSession.
        if (!string.IsNullOrEmpty(referenceId))
        {
            var parts = referenceId.Split('-');
            if (parts.Length >= 2 && parts[0] == "tenant" && int.TryParse(parts[1], out var tenantId))
            {
                return await _db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId);
            }
        }

        return null;
    }

    private async Task<Tenant?> FindTenantByPlanId(string? planId)
    {
        if (string.IsNullOrEmpty(planId)) return null;
        return await _db.Tenants.FirstOrDefaultAsync(t => t.XenditRecurringPlanId == planId);
    }

    private static string? GetString(JsonElement data, string property)
    {
        return data.ValueKind == JsonValueKind.Object
            && data.TryGetProperty(property, out var value)
            && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
    }

    // Hashing first (rather than comparing raw byte length before the
    // constant-time compare) means there's no length-dependent branch at
    // all - a SHA-256 digest is always 32 bytes regardless of input length,
    // so the expected token's exact length is never observable via timing.
    private static bool FixedTimeEquals(string a, string b)
    {
        var aHash = SHA256.HashData(Encoding.UTF8.GetBytes(a));
        var bHash = SHA256.HashData(Encoding.UTF8.GetBytes(b));
        return CryptographicOperations.FixedTimeEquals(aHash, bHash);
    }
}
