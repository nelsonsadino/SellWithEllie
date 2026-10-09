namespace SellWithEllie.Models;

public enum PlanTier
{
    Free = 0,
    Pro = 1
}

public enum TenantSubscriptionStatus
{
    Trialing = 0,
    Active = 1,
    PastDue = 2,
    Canceled = 3
}

// One row per shop that signs up for the platform. Every tenant-scoped
// entity (Product, Auction, Bid, CartItem, Order, OrderItem, and shop-level
// ApplicationUsers) carries a TenantId pointing back here.
public class Tenant
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    // Subdomain, e.g. "acmeshop" for acmeshop.sellwithellie.example. Lowercase,
    // URL-safe, unique.
    public string Slug { get; set; } = string.Empty;

    public PlanTier Plan { get; set; } = PlanTier.Free;
    public TenantSubscriptionStatus SubscriptionStatus { get; set; } = TenantSubscriptionStatus.Active;

    // Which of the selectable storefront designs this shop uses, and its
    // default light/dark preference. Validated against TenantDefaults.
    // "marketstall" | "warmwood" | "mono"  /  "system" | "light" | "dark"
    public string ThemeTemplate { get; set; } = "marketstall";
    public string ThemeMode { get; set; } = "system";

    // ISO 4217 code the shop prices, carts and orders are shown in, and
    // the currency customer-checkout invoices are created in. Display + the
    // amount currency; product prices are stored as plain decimals.
    public string CurrencyCode { get; set; } = "USD";

    // A fixed-price product with 1..LowStockThreshold units on hand is
    // flagged "low stock" on the storefront and in the admin inventory view.
    public int LowStockThreshold { get; set; } = 5;

    // The shop's OWN Xendit account, used to collect customer checkout
    // payments (money lands in the shop's Xendit balance, not the
    // platform's). Both are encrypted at rest (see ISecretCipher); the
    // plaintext never leaves the server. Null = not connected -> checkout
    // falls back to the simulated flow.
    public string? XenditSecretKeyEnc { get; set; }
    public string? XenditWebhookTokenEnc { get; set; }

    // Xendit's own customer id, learned once the first webhook for this
    // shop arrives (Xendit generates/matches it from the reference_id we
    // send - see BillingController). This is for the PLATFORM's Xendit
    // account (the shop's Pro subscription), unrelated to the fields above.
    public string? XenditCustomerId { get; set; }

    // The recurring plan Xendit created after checkout completed. This is
    // how billing-cycle webhooks (which only carry Xendit's plan id, not
    // our reference_id) get matched back to a tenant.
    public string? XenditRecurringPlanId { get; set; }

    // Platform-admin kill switch, independent of subscription status (e.g. abuse).
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
