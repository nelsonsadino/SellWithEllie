using System.Net.Http.Json;
using System.Text.Json;

namespace SellWithEllie.Services;

// Thin wrapper around Xendit's REST API (https://api.xendit.co/sessions).
// There's no well-documented, confidently up-to-date official .NET SDK to
// lean on the way Stripe.net was used elsewhere in this project - the
// published packages' docs don't even agree on install steps - so this
// calls the REST endpoint directly with HttpClient instead. Fewer moving
// parts, and every field below matches Xendit's published request/response
// schema for POST /sessions (session_type: SUBSCRIPTION).
public class XenditClient : IXenditClient
{
    private readonly HttpClient _http;

    public XenditClient(HttpClient http)
    {
        _http = http;
    }

    public async Task<XenditSessionResult> CreateSubscriptionSessionAsync(
        string referenceId,
        string customerReferenceId,
        string customerEmail,
        decimal amount,
        string currency,
        string country,
        string successUrl,
        string cancelUrl,
        CancellationToken cancellationToken = default)
    {
        var payload = new
        {
            reference_id = referenceId,
            session_type = "SUBSCRIPTION",
            mode = "PAYMENT_LINK",
            amount,
            currency,
            country,
            customer = new
            {
                type = "INDIVIDUAL",
                reference_id = customerReferenceId,
                email = customerEmail
            },
            subscription = new
            {
                schedule = new
                {
                    interval = "MONTH",
                    interval_count = 1
                    // total_recurrence intentionally omitted for an
                    // indefinite (until-cancelled) subscription. If your
                    // Xendit account requires a finite value here instead,
                    // set one (e.g. 120 for a 10-year cap) and renew it
                    // periodically.
                }
            },
            success_return_url = successUrl,
            cancel_return_url = cancelUrl
        };

        using var response = await _http.PostAsJsonAsync("/sessions", payload, cancellationToken);
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Xendit session creation failed ({(int)response.StatusCode}): {raw}");
        }

        using var doc = JsonDocument.Parse(raw);
        var root = doc.RootElement;
        var paymentLinkUrl = root.TryGetProperty("payment_link_url", out var urlProp) ? urlProp.GetString() : null;
        var paymentSessionId = root.TryGetProperty("payment_session_id", out var idProp) ? idProp.GetString() : null;

        if (string.IsNullOrEmpty(paymentLinkUrl))
        {
            throw new InvalidOperationException($"Xendit session response had no payment_link_url: {raw}");
        }

        return new XenditSessionResult(paymentSessionId ?? string.Empty, paymentLinkUrl);
    }
}
