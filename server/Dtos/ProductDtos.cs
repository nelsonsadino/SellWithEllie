using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

public class ProductDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Subcategory { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Description { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public bool InStock { get; set; }
    public int StockQuantity { get; set; }
    public bool IsAuctionOnly { get; set; }
    public int? ActiveAuctionId { get; set; }
    public List<ProductMediaDto> Media { get; set; } = new();
}

public class ProductMediaDto
{
    public int Id { get; set; }
    public string Url { get; set; } = string.Empty;
    public string MediaType { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

public class CreateProductRequest
{
    [Required, StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required, StringLength(50)]
    public string Category { get; set; } = string.Empty;

    [StringLength(100)]
    public string Subcategory { get; set; } = string.Empty;

    [Range(0, 1000000)]
    public decimal Price { get; set; }

    [StringLength(2000)]
    public string Description { get; set; } = string.Empty;

    [StringLength(2000)]
    public string ImageUrl { get; set; } = string.Empty;

    // Fixed-price on-hand quantity. Ignored when IsAuctionOnly is true.
    [Range(0, 1000000)]
    public int StockQuantity { get; set; } = 1;

    // Only meaningful for auction-only products (a "listed" flag). For
    // fixed-price products InStock is derived from StockQuantity server-side.
    public bool InStock { get; set; } = true;
    public bool IsAuctionOnly { get; set; } = false;
}

public class UpdateProductRequest : CreateProductRequest
{
}

public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
}

// GET /api/products/inventory (admin) - the same paged list plus shop-wide
// KPIs computed over every product, not just the current page/filter.
public class InventorySummaryDto
{
    public int SkuCount { get; set; }
    public int TotalUnits { get; set; }        // fixed-price units on hand
    public int LowStockCount { get; set; }
    public int OutOfStockCount { get; set; }
    public int AuctionOnlyCount { get; set; }
    public decimal InventoryValue { get; set; } // sum(price * stockQuantity)
    public int LowStockThreshold { get; set; }
}

public class InventoryListDto
{
    public List<ProductDto> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public InventorySummaryDto Summary { get; set; } = new();
}

public class AdjustStockRequest
{
    // Exactly one of these. SetTo wins if both are sent. Bounds match
    // CreateProductRequest.StockQuantity's own [Range] so a stock adjustment
    // can't push a product to a value the create/edit form would never allow.
    [Range(0, 1000000)]
    public int? SetTo { get; set; }

    [Range(-1000000, 1000000)]
    public int? AdjustBy { get; set; }
}

public class UpdateInventorySettingsRequest
{
    [Range(0, 100000)]
    public int LowStockThreshold { get; set; } = 5;
}
