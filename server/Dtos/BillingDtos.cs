using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

public class CreateCheckoutSessionRequest
{
    // Where Xendit's hosted payment page redirects the browser after
    // success/cancel. Must be URLs the frontend controls (e.g. the shop's
    // own billing page) - never taken from anywhere other than this
    // request body.
    [Required, StringLength(500), Url]
    public string SuccessUrl { get; set; } = string.Empty;

    [Required, StringLength(500), Url]
    public string CancelUrl { get; set; } = string.Empty;
}

public class CheckoutSessionResponseDto
{
    public string Url { get; set; } = string.Empty;
}

public class BillingStatusDto
{
    public string Plan { get; set; } = string.Empty;
    public string SubscriptionStatus { get; set; } = string.Empty;
    public bool HasXenditCustomer { get; set; }
    public decimal ProPlanAmount { get; set; }
    public string Currency { get; set; } = string.Empty;
}
