namespace SellWithEllie.Models;

// Where a *paid* order is in the physical hand-off - separate from
// OrderStatus, which is about payment.
public enum FulfillmentStatus
{
    Processing = 0,
    Shipped = 1,
    Delivered = 2
}
