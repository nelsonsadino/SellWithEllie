namespace SellWithEllie.Models;

// A cart holds products the customer intends to buy at their listed Price.
// It is intentionally separate from the auction/Bid flow.
public class CartItem : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public string UserId { get; set; } = string.Empty;
    public ApplicationUser? User { get; set; }

    public int ProductId { get; set; }
    public Product? Product { get; set; }

    public int Quantity { get; set; } = 1;

    public DateTime AddedAtUtc { get; set; } = DateTime.UtcNow;
}
