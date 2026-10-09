namespace SellWithEllie.Models;

public class OrderItem : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public int OrderId { get; set; }
    public Order? Order { get; set; }

    public int ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;

    // Unit price at the time of purchase. Line total = PriceAtPurchase * Quantity.
    public decimal PriceAtPurchase { get; set; }
    public int Quantity { get; set; } = 1;
}
