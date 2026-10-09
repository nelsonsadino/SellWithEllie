namespace SellWithEllie.Models;

public class Bid : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public int AuctionId { get; set; }
    public Auction? Auction { get; set; }

    public string UserId { get; set; } = string.Empty;
    public ApplicationUser? User { get; set; }

    public decimal Amount { get; set; }
    public DateTime PlacedAtUtc { get; set; } = DateTime.UtcNow;
}
