using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Mapping;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// The cart is for fixed-price "Buy Now" products and is intentionally kept
// separate from the auction/Bid flow in AuctionsController.
[Route("api/[controller]")]
[Authorize]
public class CartController : TenantScopedControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly CheckoutService _checkout;

    public CartController(
        ApplicationDbContext db,
        CheckoutService checkout,
        ITenantContext tenantContext) : base(tenantContext)
    {
        _db = db;
        _checkout = checkout;
    }

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    [HttpGet]
    public async Task<ActionResult<CartSummaryDto>> GetCart()
    {
        var items = await _db.CartItems
            .Include(c => c.Product)
            .Where(c => c.UserId == CurrentUserId)
            .OrderBy(c => c.AddedAtUtc)
            .Select(c => new CartItemDto
            {
                Id = c.Id,
                ProductId = c.ProductId,
                ProductName = c.Product!.Name,
                ProductImageUrl = c.Product.ImageUrl,
                ProductCategory = c.Product.Category,
                Price = c.Product.Price,
                Quantity = c.Quantity,
                AvailableStock = c.Product.StockQuantity,
                LineTotal = c.Product.Price * c.Quantity,
                InStock = c.Product.InStock
            })
            .ToListAsync();

        return Ok(new CartSummaryDto { Items = items, Total = items.Sum(i => i.LineTotal) });
    }

    [HttpPost("{productId:int}")]
    public async Task<IActionResult> AddToCart(int productId, AddToCartRequest? request)
    {
        var quantity = Math.Max(1, request?.Quantity ?? 1);

        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == productId);
        if (product is null) return NotFound(new { message = "Product not found." });
        if (product.IsAuctionOnly) return BadRequest(new { message = "This product is only available via auction." });
        if (product.StockQuantity <= 0) return BadRequest(new { message = "This product is out of stock." });

        var item = await _db.CartItems.FirstOrDefaultAsync(c => c.UserId == CurrentUserId && c.ProductId == productId);
        var desired = (item?.Quantity ?? 0) + quantity;

        if (desired > product.StockQuantity)
        {
            return BadRequest(new
            {
                message = $"Only {product.StockQuantity} of '{product.Name}' left" +
                          (item is not null ? $" and you already have {item.Quantity} in your cart." : ".")
            });
        }

        if (item is null)
        {
            _db.CartItems.Add(new CartItem { UserId = CurrentUserId, ProductId = productId, Quantity = quantity });
        }
        else
        {
            item.Quantity = desired;
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Set an exact quantity for a line (0 removes it). Used by the cart page's
    // quantity stepper.
    [HttpPut("{productId:int}")]
    public async Task<IActionResult> SetQuantity(int productId, UpdateCartItemRequest request)
    {
        var item = await _db.CartItems
            .Include(c => c.Product)
            .FirstOrDefaultAsync(c => c.UserId == CurrentUserId && c.ProductId == productId);
        if (item is null) return NotFound();

        if (request.Quantity <= 0)
        {
            _db.CartItems.Remove(item);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        var stock = item.Product?.StockQuantity ?? 0;
        if (request.Quantity > stock)
        {
            return BadRequest(new { message = $"Only {stock} of '{item.Product?.Name}' left." });
        }

        item.Quantity = request.Quantity;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{productId:int}")]
    public async Task<IActionResult> RemoveFromCart(int productId)
    {
        var item = await _db.CartItems.FirstOrDefaultAsync(c => c.UserId == CurrentUserId && c.ProductId == productId);
        if (item is null) return NotFound();

        _db.CartItems.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("checkout")]
    public async Task<ActionResult<OrderDto>> Checkout(CheckoutRequest request)
    {
        var cartItems = await _db.CartItems
            .Where(c => c.UserId == CurrentUserId)
            .ToListAsync();

        var outcome = await _checkout.PlaceOrderAsync(
            new CheckoutInput(CurrentUserId, request.ShippingName, request.ShippingAddress,
                request.ShippingMethodId, request.CouponCode, request.ReturnUrlBase, null),
            cartItems.Select(c => new CheckoutLine(c.ProductId, c.Quantity)).ToList(),
            onPlaced: () => _db.CartItems.RemoveRange(cartItems));

        if (outcome.Order is null) return StatusCode(outcome.StatusCode, new { message = outcome.Error });
        return Ok(outcome.Order.ToDto());
    }
}
