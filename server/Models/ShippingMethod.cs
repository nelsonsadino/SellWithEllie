namespace SellWithEllie.Models;

public class ShippingMethod : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string EstimatedDelivery { get; set; } = string.Empty;

    // Orders at or above this subtotal ship free on this method (null = never).
    public decimal? FreeOverSubtotal { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}
