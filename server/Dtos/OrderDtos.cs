using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

public class CheckoutRequest
{
    [Required, StringLength(150)]
    public string ShippingName { get; set; } = string.Empty;

    [Required, StringLength(300)]
    public string ShippingAddress { get; set; } = string.Empty;

    // Storefront origin (e.g. https://acme.example) - used to build the
    // return URLs Xendit redirects the customer back to after paying.
    // Ignored for the simulated checkout flow.
    [StringLength(300)]
    public string? ReturnUrlBase { get; set; }

    public int? ShippingMethodId { get; set; }

    [StringLength(40)]
    public string? CouponCode { get; set; }
}

public class GuestCheckoutLine
{
    public int ProductId { get; set; }
    [Range(1, 999)] public int Quantity { get; set; } = 1;
}

public class GuestCheckoutRequest : CheckoutRequest
{
    [Required, EmailAddress, StringLength(200)]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(1), MaxLength(50)]
    public List<GuestCheckoutLine> Items { get; set; } = new();
}

public class FulfillmentUpdateRequest
{
    // "Processing" | "Shipped" | "Delivered"
    [Required] public string Status { get; set; } = string.Empty;
    [StringLength(80)] public string? Carrier { get; set; }
    [StringLength(120)] public string? TrackingNumber { get; set; }
}

public class OrderItemDto
{
    public int ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public decimal PriceAtPurchase { get; set; }   // unit price
    public int Quantity { get; set; }
    public decimal LineTotal => PriceAtPurchase * Quantity;
}

public class OrderDto
{
    public int Id { get; set; }
    public DateTime OrderDateUtc { get; set; }
    public decimal TotalAmount { get; set; }
    public string Status { get; set; } = string.Empty;
    public string ShippingName { get; set; } = string.Empty;
    public string ShippingAddress { get; set; } = string.Empty;
    public string? CustomerEmail { get; set; }
    public string PaymentProvider { get; set; } = "simulated";
    public string? PaymentUrl { get; set; }   // where to finish an unpaid order
    public string Fulfillment { get; set; } = "Processing";
    public string ShippingMethodName { get; set; } = string.Empty;
    public decimal ShippingCost { get; set; }
    public decimal DiscountAmount { get; set; }
    public string? CouponCode { get; set; }
    public string? Carrier { get; set; }
    public string? TrackingNumber { get; set; }
    public DateTime? ShippedAtUtc { get; set; }
    public DateTime? DeliveredAtUtc { get; set; }
    public bool IsGuest { get; set; }
    public List<OrderItemDto> Items { get; set; } = new();
}
