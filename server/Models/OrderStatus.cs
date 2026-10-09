namespace SellWithEllie.Models;

public enum OrderStatus
{
    Completed = 0,
    Cancelled = 1,

    // Order placed, waiting for the customer to finish paying on the shop's
    // Xendit hosted invoice. Becomes Completed on invoice.paid, or Cancelled
    // (with stock restored) on invoice.expired.
    AwaitingPayment = 2
}
