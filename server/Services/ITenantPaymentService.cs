using SellWithEllie.Models;

namespace SellWithEllie.Services;

public record TenantInvoice(string InvoiceId, string InvoiceUrl);

// Collects customer checkout payments into the SHOP'S OWN Xendit account
// (unlike BillingController/IXenditClient, which use the platform's account
// for the shop's own Pro subscription).
public interface ITenantPaymentService
{
    // The prefix on Order.PaymentReference's external_id: swe-order-{tenantId}-{orderId}
    static string ExternalId(int tenantId, int orderId) => $"swe-order-{tenantId}-{orderId}";

    static bool TryParseExternalId(string? externalId, out int tenantId, out int orderId)
    {
        tenantId = 0;
        orderId = 0;
        if (string.IsNullOrEmpty(externalId)) return false;
        var parts = externalId.Split('-');
        return parts.Length == 4
            && parts[0] == "swe" && parts[1] == "order"
            && int.TryParse(parts[2], out tenantId)
            && int.TryParse(parts[3], out orderId);
    }

    bool IsConnected(Tenant tenant);

    // Returns null if the tenant hasn't connected Xendit or the platform
    // encryption key isn't configured.
    string? GetWebhookToken(Tenant tenant);

    Task<TenantInvoice> CreateInvoiceAsync(
        Tenant tenant,
        int orderId,
        decimal amount,
        string customerEmail,
        string description,
        string successUrl,
        string failureUrl,
        CancellationToken cancellationToken = default);
}
