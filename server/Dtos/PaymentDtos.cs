using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

// GET /api/tenant/payments — what the admin Payments screen shows. Secrets
// are never returned; only whether they're set and a masked hint.
public class PaymentSettingsDto
{
    public string CurrencyCode { get; set; } = "USD";
    public bool PlatformSupportsConnect { get; set; }   // Payments:EncryptionKey configured
    public bool XenditConnected { get; set; }
    public string? XenditSecretKeyHint { get; set; }    // e.g. "xnd_…a1b2"
    public bool WebhookTokenSet { get; set; }
    public string WebhookUrl { get; set; } = string.Empty; // paste into the shop's Xendit dashboard
}

public class UpdatePaymentSettingsRequest
{
    // 3-letter ISO 4217. Required.
    [Required, RegularExpression("^[A-Za-z]{3}$", ErrorMessage = "Currency must be a 3-letter code, e.g. USD or PHP.")]
    public string CurrencyCode { get; set; } = "USD";

    // Optional: send to (re)connect. Omit/blank to leave the stored key as
    // is. Send "-" (a single dash) to disconnect and wipe it.
    [StringLength(500)]
    public string? XenditSecretKey { get; set; }

    [StringLength(500)]
    public string? XenditWebhookToken { get; set; }
}
