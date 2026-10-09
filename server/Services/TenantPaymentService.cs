using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SellWithEllie.Config;
using SellWithEllie.Models;

namespace SellWithEllie.Services;

public class TenantPaymentService : ITenantPaymentService
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly ISecretCipher _cipher;
    private readonly PaymentsSettings _settings;

    public TenantPaymentService(
        IHttpClientFactory httpFactory,
        ISecretCipher cipher,
        IOptions<PaymentsSettings> settings)
    {
        _httpFactory = httpFactory;
        _cipher = cipher;
        _settings = settings.Value;
    }

    public bool IsConnected(Tenant tenant) =>
        _cipher.IsConfigured && !string.IsNullOrEmpty(_cipher.Decrypt(tenant.XenditSecretKeyEnc));

    public string? GetWebhookToken(Tenant tenant) =>
        _cipher.IsConfigured ? _cipher.Decrypt(tenant.XenditWebhookTokenEnc) : null;

    public async Task<TenantInvoice> CreateInvoiceAsync(
        Tenant tenant,
        int orderId,
        decimal amount,
        string customerEmail,
        string description,
        string successUrl,
        string failureUrl,
        CancellationToken cancellationToken = default)
    {
        var secretKey = _cipher.Decrypt(tenant.XenditSecretKeyEnc)
            ?? throw new InvalidOperationException("This shop has not connected a Xendit account.");

        using var client = _httpFactory.CreateClient("xendit-tenant");
        client.BaseAddress = new Uri("https://api.xendit.co");
        client.Timeout = TimeSpan.FromSeconds(20);
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{secretKey}:"));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", basic);

        var payload = new
        {
            external_id = ITenantPaymentService.ExternalId(tenant.Id, orderId),
            amount,
            currency = string.IsNullOrWhiteSpace(tenant.CurrencyCode) ? "USD" : tenant.CurrencyCode.ToUpperInvariant(),
            payer_email = customerEmail,
            description,
            success_redirect_url = successUrl,
            failure_redirect_url = failureUrl,
            invoice_duration = Math.Max(300, _settings.InvoiceExpirySeconds)
        };

        using var response = await client.PostAsJsonAsync("/v2/invoices", payload, cancellationToken);
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Xendit invoice creation failed ({(int)response.StatusCode}): {raw}");
        }

        using var doc = JsonDocument.Parse(raw);
        var root = doc.RootElement;
        var id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
        var url = root.TryGetProperty("invoice_url", out var urlProp) ? urlProp.GetString() : null;

        if (string.IsNullOrEmpty(url))
        {
            throw new InvalidOperationException($"Xendit invoice response had no invoice_url: {raw}");
        }

        return new TenantInvoice(id ?? string.Empty, url);
    }
}
