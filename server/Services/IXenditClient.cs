namespace SellWithEllie.Services;

public record XenditSessionResult(string PaymentSessionId, string PaymentLinkUrl);

public interface IXenditClient
{
    Task<XenditSessionResult> CreateSubscriptionSessionAsync(
        string referenceId,
        string customerReferenceId,
        string customerEmail,
        decimal amount,
        string currency,
        string country,
        string successUrl,
        string cancelUrl,
        CancellationToken cancellationToken = default);
}
