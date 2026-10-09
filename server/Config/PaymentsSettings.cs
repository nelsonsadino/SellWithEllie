namespace SellWithEllie.Config;

// Bound from the "Payments" configuration section. EncryptionKey is
// sensitive - set it via
// `dotnet user-secrets set "Payments:EncryptionKey" "<base64 of 32 random bytes>"`
// in development, an app setting / Key Vault reference in production.
//
// Left unset, shops cannot connect their own Xendit account (the connect
// endpoint returns 503) and customer checkout stays on the simulated flow -
// browsing, bidding and the mock checkout all keep working, matching the
// Xendit/BlobStorage/Email graceful-degradation pattern used elsewhere.
public class PaymentsSettings
{
    public const string SectionName = "Payments";

    // AES-256-GCM key, base64-encoded, exactly 32 bytes when decoded. Used
    // to encrypt each shop's Xendit secret key + webhook token at rest.
    // Rotating it makes every previously-stored key undecryptable, so shops
    // would need to re-enter their Xendit credentials.
    public string EncryptionKey { get; set; } = string.Empty;

    // How long a customer's Xendit hosted invoice stays payable before it
    // expires (and the order is cancelled, stock restored). Default 1 hour.
    public int InvoiceExpirySeconds { get; set; } = 3600;
}
