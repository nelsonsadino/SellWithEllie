namespace SellWithEllie.Models;

public class Order : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public string UserId { get; set; } = string.Empty;
    public ApplicationUser? User { get; set; }

    public DateTime OrderDateUtc { get; set; } = DateTime.UtcNow;
    public decimal TotalAmount { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Completed;

    public string ShippingName { get; set; } = string.Empty;
    public string ShippingAddress { get; set; } = string.Empty;

    // Payment tracking. "simulated" for the mock flow, "xendit" when the
    // shop has connected its own Xendit account. PaymentReference is the
    // Xendit invoice id; PaymentUrl is the hosted checkout page (kept so a
    // customer can resume an unfinished payment from their orders list).
    public string PaymentProvider { get; set; } = "simulated";
    public string? PaymentReference { get; set; }
    public string? PaymentUrl { get; set; }

    // Fulfilment (shipping) - separate from payment Status above.
    public FulfillmentStatus Fulfillment { get; set; } = FulfillmentStatus.Processing;
    public string ShippingMethodName { get; set; } = string.Empty;
    public decimal ShippingCost { get; set; }
    public string? Carrier { get; set; }
    public string? TrackingNumber { get; set; }
    public DateTime? ShippedAtUtc { get; set; }
    public DateTime? DeliveredAtUtc { get; set; }

    // Discounts and guest checkout.
    public string? CouponCode { get; set; }
    public decimal DiscountAmount { get; set; }
    // Set for guest orders (UserId then points at the shop's shared guest user).
    public string? GuestEmail { get; set; }

    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
}
