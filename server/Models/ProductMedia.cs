namespace SellWithEllie.Models;

public enum ProductMediaType
{
    Image,
    Video
}

// A single uploaded picture or video attached to a product. Products keep
// their existing single ImageUrl as the "cover" shown in listings/cards/
// auctions/cart snapshots (so none of that existing code needs to change),
// while Media holds the up-to-5-item gallery shown on the product detail
// page. BlobName is stored separately from Url so the file can be deleted
// from Azure Blob Storage later without having to parse it back out of a
// full URL.
public class ProductMedia : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public int ProductId { get; set; }
    public Product? Product { get; set; }

    public string Url { get; set; } = string.Empty;
    public string BlobName { get; set; } = string.Empty;
    public ProductMediaType MediaType { get; set; }
    public int SortOrder { get; set; }
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
}
