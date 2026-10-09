using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SellWithEllie.Config;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Lets a shop's admin upgrade to the Pro plan via Xendit's hosted checkout
// (a Payment Session, session_type SUBSCRIPTION). Tenant-scoped and
// Admin-only: an admin can only ever act on their own shop's billing.
//
// There's no self-serve "manage subscription" portal here the way Stripe
// offers one - Xendit doesn't publish an equivalent product, and rather
// than guess at an unverified cancel/update endpoint, cancellations are
// handled by contacting support for now (see AdminBillingPanel.jsx and the
// README). Revisit once this is validated against a live Xendit sandbox.
[Route("api/billing")]
[Authorize(Roles = ApplicationDbContext.AdminRole)]
public class BillingController : TenantScopedControllerBase
{
    private readonly IXenditClient _xendit;
    private readonly XenditSettings _xenditSettings;
    private readonly ILogger<BillingController> _logger;

    public BillingController(
        ITenantContext tenantContext,
        IXenditClient xendit,
        IOptions<XenditSettings> xenditSettings,
        ILogger<BillingController> logger)
        : base(tenantContext)
    {
        _xendit = xendit;
        _xenditSettings = xenditSettings.Value;
        _logger = logger;
    }

    [HttpGet("status")]
    public ActionResult<BillingStatusDto> GetStatus()
    {
        var tenant = TenantContext.Tenant!;

        return Ok(new BillingStatusDto
        {
            Plan = tenant.Plan.ToString(),
            SubscriptionStatus = tenant.SubscriptionStatus.ToString(),
            HasXenditCustomer = !string.IsNullOrEmpty(tenant.XenditCustomerId),
            ProPlanAmount = _xenditSettings.ProPlanAmount,
            Currency = _xenditSettings.Currency
        });
    }

    [HttpPost("create-checkout-session")]
    public async Task<ActionResult<CheckoutSessionResponseDto>> CreateCheckoutSession(
        [FromBody] CreateCheckoutSessionRequest request)
    {
        if (string.IsNullOrWhiteSpace(_xenditSettings.SecretKey))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { message = "Billing is not configured on this server yet." });
        }

        if (string.IsNullOrWhiteSpace(request.SuccessUrl) || string.IsNullOrWhiteSpace(request.CancelUrl))
        {
            return BadRequest(new { message = "SuccessUrl and CancelUrl are required." });
        }

        var tenant = TenantContext.Tenant!;
        var adminEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;

        // Stable per-tenant, not per-attempt: recurring.plan.* webhooks
        // carry this same reference_id back (see BillingWebhookController),
        // which is how an event gets matched to a tenant with no other
        // lookup available at that point. If Xendit ever rejects reusing a
        // reference_id from an abandoned/expired prior attempt, make this
        // unique per attempt instead and switch the webhook lookup to a
        // prefix match.
        var referenceId = $"tenant-{tenant.Id}-pro";

        try
        {
            var session = await _xendit.CreateSubscriptionSessionAsync(
                referenceId: referenceId,
                customerReferenceId: $"tenant-{tenant.Id}",
                customerEmail: adminEmail,
                amount: _xenditSettings.ProPlanAmount,
                currency: _xenditSettings.Currency,
                country: _xenditSettings.Country,
                successUrl: request.SuccessUrl,
                cancelUrl: request.CancelUrl);

            return Ok(new CheckoutSessionResponseDto { Url = session.PaymentLinkUrl });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create Xendit subscription session for tenant {TenantId}", tenant.Id);
            return StatusCode(StatusCodes.Status502BadGateway,
                new { message = "Could not start checkout with the payment provider. Please try again." });
        }
    }
}
