using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

public class CartItemDto
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string ProductImageUrl { get; set; } = string.Empty;
    public string ProductCategory { get; set; } = string.Empty;
    public decimal Price { get; set; }        // unit price
    public int Quantity { get; set; }
    public int AvailableStock { get; set; }   // current on-hand for this product
    public decimal LineTotal { get; set; }    // Price * Quantity
    public bool InStock { get; set; }
}

public class CartSummaryDto
{
    public List<CartItemDto> Items { get; set; } = new();
    public decimal Total { get; set; }
}

public class AddToCartRequest
{
    [Range(1, 999)]
    public int Quantity { get; set; } = 1;
}

public class UpdateCartItemRequest
{
    [Range(0, 999)]
    public int Quantity { get; set; }
}
