namespace SellWithEllie.Models;

public class ProductReview : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public int ProductId { get; set; }
    public Product? Product { get; set; }

    public string UserId { get; set; } = string.Empty;
    public ApplicationUser? User { get; set; }

    public int Rating { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;

    // True when the reviewer has a completed order containing this product.
    public bool IsVerifiedPurchase { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
