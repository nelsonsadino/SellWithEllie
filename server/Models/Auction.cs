namespace SellWithEllie.Models;

public class Auction : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public int ProductId { get; set; }
    public Product? Product { get; set; }

    public decimal StartingPrice { get; set; }
    public decimal MinIncrement { get; set; }

    public DateTime StartTimeUtc { get; set; }
    public DateTime EndTimeUtc { get; set; }

    public AuctionStatus Status { get; set; } = AuctionStatus.Scheduled;

    public int? CurrentHighestBidId { get; set; }
    public Bid? CurrentHighestBid { get; set; }
    public decimal? CurrentHighestAmount { get; set; }

    // Optional "Buy It Now" price. When set (and higher than StartingPrice),
    // a bidder can skip the auction entirely and win instantly at this price.
    public decimal? BuyoutPrice { get; set; }

    // True when this auction ended via a buyout rather than the clock running
    // out - lets the UI show a distinct "won by buyout" message even after a
    // page reload, without having to infer it from timing.
    public bool ClosedViaBuyout { get; set; }

    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Optimistic concurrency token so two simultaneous bids can never both
    // "win" a race to become the highest bidder.
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();

    public ICollection<Bid> Bids { get; set; } = new List<Bid>();
}
