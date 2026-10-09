namespace SellWithEllie.Models;

// Deliberately generic so any kind of shop can list things for sale here -
// pets, furniture, electronics, whatever a tenant sells. Category/Subcategory
// are free-text rather than a fixed enum for the same reason (a pet shop
// might use "Dog"/"Golden Retriever", a furniture shop "Tables"/"Oak").
public class Product : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Subcategory { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Description { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;

    // How many units are on hand for fixed-price sale. Source of truth for
    // buyability of a non-auction product; decremented at checkout. Ignored
    // for auction items (an auction sells its lot "as set", not per-unit).
    public int StockQuantity { get; set; } = 0;

    // Kept in sync with StockQuantity for fixed-price products (InStock ==
    // StockQuantity > 0) so all existing "sold out" checks keep working; for
    // auction-only products it's an admin-controlled "listed" flag instead.
    public bool InStock { get; set; } = true;

    // IsAuctionOnly hides the "Add to cart" action for products the admin
    // only wants sold via bidding.
    public bool IsAuctionOnly { get; set; } = false;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public Auction? Auction { get; set; }

    // Up to 5 photos/videos, stored in Azure Blob Storage. ImageUrl above
    // remains the "cover" image shown in listings/cards/auctions/cart - this
    // is the fuller gallery shown on the product detail page.
    public ICollection<ProductMedia> Media { get; set; } = new List<ProductMedia>();
}
