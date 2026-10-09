using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Config;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Mapping;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

[Route("api/[controller]")]
public class ProductsController : TenantScopedControllerBase
{
    // A product can have at most this many photos/videos combined - keeps
    // the detail-page gallery scannable and bounds per-product blob storage
    // cost. Enforced here server-side; the admin UI mirrors it client-side
    // too so uploads are rejected before they even start.
    private const int MaxMediaPerProduct = 5;

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "video/mp4", "video/webm", "video/quicktime"
    };

    private readonly ApplicationDbContext _db;
    private readonly IBlobStorageService _blobStorage;
    private readonly IAuditLogService _auditLog;
    private readonly IOutputCacheStore _outputCache;

    public ProductsController(
        ApplicationDbContext db,
        IBlobStorageService blobStorage,
        IAuditLogService auditLog,
        IOutputCacheStore outputCache,
        ITenantContext tenantContext) : base(tenantContext)
    {
        _db = db;
        _blobStorage = blobStorage;
        _auditLog = auditLog;
        _outputCache = outputCache;
    }

    [HttpGet]
    [OutputCache(PolicyName = "PublicCatalog")]
    public async Task<ActionResult<PagedResult<ProductDto>>> GetProducts(
        [FromQuery] string? search,
        [FromQuery] string? category,
        [FromQuery] decimal? minPrice,
        [FromQuery] decimal? maxPrice,
        [FromQuery] string? sort,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);

        var query = _db.Products.Include(p => p.Auction).Include(p => p.Media).AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(p => p.Name.Contains(term) || p.Subcategory.Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(category))
        {
            query = query.Where(p => p.Category == category);
        }

        if (minPrice.HasValue)
        {
            query = query.Where(p => p.Price >= minPrice.Value);
        }

        if (maxPrice.HasValue)
        {
            query = query.Where(p => p.Price <= maxPrice.Value);
        }

        query = sort switch
        {
            "price_asc" => query.OrderBy(p => p.Price),
            "price_desc" => query.OrderByDescending(p => p.Price),
            "name" => query.OrderBy(p => p.Name),
            "newest" => query.OrderByDescending(p => p.CreatedAtUtc),
            _ => query.OrderByDescending(p => p.CreatedAtUtc)
        };

        var totalCount = await query.CountAsync();
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<ProductDto>
        {
            Items = items.Select(p => p.ToDto()).ToList(),
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        });
    }

    [HttpGet("categories")]
    [OutputCache(PolicyName = "PublicCatalog")]
    public async Task<ActionResult<List<string>>> GetCategoryList()
    {
        var categories = await _db.Products
            .Select(p => p.Category)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();

        return Ok(categories);
    }

    // ---- Admin: inventory management view --------------------------------
    [HttpGet("inventory")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<InventoryListDto>> GetInventory(
        [FromQuery] string? search,
        [FromQuery] string? category,
        [FromQuery] string? stockStatus,
        [FromQuery] string? sort,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 500);
        var threshold = TenantContext.Tenant!.LowStockThreshold;

        // KPIs over EVERY product for this shop, independent of the filters.
        var all = await _db.Products.AsNoTracking()
            .Select(p => new { p.Price, p.StockQuantity, p.IsAuctionOnly })
            .ToListAsync();
        var fixedPrice = all.Where(p => !p.IsAuctionOnly).ToList();
        var summary = new InventorySummaryDto
        {
            SkuCount = all.Count,
            TotalUnits = fixedPrice.Sum(p => p.StockQuantity),
            LowStockCount = fixedPrice.Count(p => p.StockQuantity > 0 && p.StockQuantity <= threshold),
            OutOfStockCount = fixedPrice.Count(p => p.StockQuantity <= 0),
            AuctionOnlyCount = all.Count(p => p.IsAuctionOnly),
            InventoryValue = fixedPrice.Sum(p => p.Price * p.StockQuantity),
            LowStockThreshold = threshold
        };

        var query = _db.Products.Include(p => p.Auction).Include(p => p.Media).AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim();
            query = query.Where(p => p.Name.Contains(t) || p.Category.Contains(t) || p.Subcategory.Contains(t));
        }

        if (!string.IsNullOrWhiteSpace(category))
        {
            query = query.Where(p => p.Category == category);
        }

        query = stockStatus switch
        {
            "in" => query.Where(p => !p.IsAuctionOnly && p.StockQuantity > threshold),
            "low" => query.Where(p => !p.IsAuctionOnly && p.StockQuantity > 0 && p.StockQuantity <= threshold),
            "out" => query.Where(p => !p.IsAuctionOnly && p.StockQuantity <= 0),
            "auction" => query.Where(p => p.IsAuctionOnly),
            _ => query
        };

        query = sort switch
        {
            "price_asc" => query.OrderBy(p => p.Price),
            "price_desc" => query.OrderByDescending(p => p.Price),
            "stock_asc" => query.OrderBy(p => p.StockQuantity).ThenBy(p => p.Name),
            "stock_desc" => query.OrderByDescending(p => p.StockQuantity).ThenBy(p => p.Name),
            "newest" => query.OrderByDescending(p => p.CreatedAtUtc),
            _ => query.OrderBy(p => p.Name)
        };

        var totalCount = await query.CountAsync();
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        return Ok(new InventoryListDto
        {
            Items = items.Select(p => p.ToDto()).ToList(),
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize,
            Summary = summary
        });
    }

    // Quick stock change from the inventory table without the full edit form.
    [HttpPatch("{id:int}/stock")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<ProductDto>> AdjustStock(int id, AdjustStockRequest request)
    {
        var product = await _db.Products.Include(p => p.Auction).Include(p => p.Media)
            .FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return NotFound();
        if (product.IsAuctionOnly)
        {
            return BadRequest(new { message = "Auction-only products are sold as a single lot and have no stock count." });
        }

        var before = product.StockQuantity;
        var next = request.SetTo ?? (before + (request.AdjustBy ?? 0));
        if (next < 0) next = 0;

        if (next != before)
        {
            product.StockQuantity = next;
            product.InStock = next > 0;
            product.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            await _outputCache.EvictByTagAsync("catalog", default);
            await _auditLog.LogAsync(User, "Inventory.Adjust", "Product", id.ToString(),
                $"{product.Name}: {before} → {next}");
        }

        return Ok(product.ToDto());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProductDto>> GetProduct(int id)
    {
        var product = await _db.Products
            .Include(p => p.Auction)
            .Include(p => p.Media)
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id);
        return product is null ? NotFound() : Ok(product.ToDto());
    }

    [HttpPost]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<ProductDto>> CreateProduct(CreateProductRequest request)
    {
        if (TenantContext.Tenant!.Plan == PlanTier.Free)
        {
            var productCount = await _db.Products.CountAsync();
            if (productCount >= PlanLimits.FreeMaxProducts)
            {
                return StatusCode(StatusCodes.Status402PaymentRequired, new
                {
                    message = $"The Free plan is limited to {PlanLimits.FreeMaxProducts} product listings. Upgrade to Pro for unlimited listings."
                });
            }
        }

        var product = new Product
        {
            Name = request.Name,
            Category = request.Category,
            Subcategory = request.Subcategory,
            Price = request.Price,
            Description = request.Description,
            ImageUrl = request.ImageUrl,
            IsAuctionOnly = request.IsAuctionOnly,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };
        ApplyStock(product, request);

        _db.Products.Add(product);
        await _db.SaveChangesAsync();

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Product.Create", "Product", product.Id.ToString(), product.Name);

        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, product.ToDto());
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<ProductDto>> UpdateProduct(int id, UpdateProductRequest request)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return NotFound();

        product.Name = request.Name;
        product.Category = request.Category;
        product.Subcategory = request.Subcategory;
        product.Price = request.Price;
        product.Description = request.Description;
        product.ImageUrl = request.ImageUrl;
        product.IsAuctionOnly = request.IsAuctionOnly;
        product.UpdatedAtUtc = DateTime.UtcNow;
        ApplyStock(product, request);

        await _db.SaveChangesAsync();

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Product.Update", "Product", product.Id.ToString(), product.Name);

        return Ok(product.ToDto());
    }

    // Fixed-price products: StockQuantity is the source of truth and InStock
    // is derived from it. Auction-only products: quantity is not a concept
    // (the lot is sold "as set" via bidding), so StockQuantity is zeroed and
    // InStock stays an admin-controlled "listed" flag.
    private static void ApplyStock(Product product, CreateProductRequest request)
    {
        if (request.IsAuctionOnly)
        {
            product.StockQuantity = 0;
            product.InStock = request.InStock;
        }
        else
        {
            product.StockQuantity = Math.Max(0, request.StockQuantity);
            product.InStock = product.StockQuantity > 0;
        }
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> DeleteProduct(int id)
    {
        var product = await _db.Products.Include(p => p.Auction).Include(p => p.Media).FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return NotFound();

        if (product.Auction is not null &&
            (product.Auction.Status == AuctionStatus.Active || product.Auction.Status == AuctionStatus.Scheduled))
        {
            return Conflict(new { message = "Cancel or close this product's auction before deleting it." });
        }

        // Best-effort blob cleanup - a failure here (e.g. blob storage
        // briefly unreachable) shouldn't block the admin from deleting the
        // product; it just leaves an orphaned blob behind.
        foreach (var media in product.Media)
        {
            try
            {
                await _blobStorage.DeleteAsync(media.BlobName);
            }
            catch
            {
                // ignored - see comment above
            }
        }

        _db.Products.Remove(product);
        await _db.SaveChangesAsync();

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Product.Delete", "Product", id.ToString(), product.Name);

        return NoContent();
    }

    // Uploads one or more photos/videos for a product, up to the combined
    // 5-item cap. Mirrors BillingController's pattern for a not-yet-configured
    // dependency: return 503 rather than letting an unconfigured
    // BlobStorageService throw mid-request.
    [HttpPost("{id:int}/media")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    [RequestSizeLimit(524_288_000)]
    public async Task<ActionResult<List<ProductMediaDto>>> UploadMedia(int id, [FromForm] List<IFormFile> files)
    {
        if (!_blobStorage.IsConfigured)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { message = "Photo/video uploads are not configured on this server yet." });
        }

        if (files is null || files.Count == 0)
        {
            return BadRequest(new { message = "No files were uploaded." });
        }

        var product = await _db.Products.Include(p => p.Media).FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return NotFound();

        if (product.Media.Count + files.Count > MaxMediaPerProduct)
        {
            return BadRequest(new
            {
                message = $"A product can have at most {MaxMediaPerProduct} photos/videos - this product already has {product.Media.Count}."
            });
        }

        foreach (var file in files)
        {
            if (!AllowedContentTypes.Contains(file.ContentType))
            {
                return BadRequest(new { message = $"'{file.FileName}' is not a supported image or video type." });
            }

            if (file.Length <= 0)
            {
                return BadRequest(new { message = $"'{file.FileName}' is empty." });
            }

            if (file.Length > _blobStorage.MaxFileSizeBytes)
            {
                return BadRequest(new
                {
                    message = $"'{file.FileName}' is larger than the {_blobStorage.MaxFileSizeBytes / (1024 * 1024)} MB limit per file."
                });
            }

            // Verify the bytes match the declared type, not just the header.
            if (!UploadValidation.TryValidate(file, out var validationError))
            {
                return BadRequest(new { message = validationError });
            }
        }

        var nextSortOrder = product.Media.Count == 0 ? 0 : product.Media.Max(m => m.SortOrder) + 1;
        var uploaded = new List<ProductMedia>();

        foreach (var file in files)
        {
            await using var stream = file.OpenReadStream();
            var result = await _blobStorage.UploadAsync(stream, file.FileName, file.ContentType);

            var media = new ProductMedia
            {
                ProductId = product.Id,
                Url = result.Url,
                BlobName = result.BlobName,
                MediaType = result.IsVideo ? ProductMediaType.Video : ProductMediaType.Image,
                SortOrder = nextSortOrder++
            };
            _db.ProductMediaItems.Add(media);
            uploaded.Add(media);
        }

        await _db.SaveChangesAsync();

        return Ok(uploaded.Select(m => m.ToDto()).ToList());
    }

    [HttpDelete("{id:int}/media/{mediaId:int}")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> DeleteMedia(int id, int mediaId)
    {
        var media = await _db.ProductMediaItems.FirstOrDefaultAsync(m => m.Id == mediaId && m.ProductId == id);
        if (media is null) return NotFound();

        try
        {
            await _blobStorage.DeleteAsync(media.BlobName);
        }
        catch
        {
            // Best-effort - still remove the DB record so the gallery no
            // longer references it even if the blob delete call failed.
        }

        _db.ProductMediaItems.Remove(media);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
