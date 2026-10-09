using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

public class AuctionSummaryDto
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string ProductImageUrl { get; set; } = string.Empty;
    public string ProductCategory { get; set; } = string.Empty;
    public decimal StartingPrice { get; set; }
    public decimal MinIncrement { get; set; }
    public decimal? CurrentHighestAmount { get; set; }
    public decimal? BuyoutPrice { get; set; }
    public bool ClosedViaBuyout { get; set; }
    public DateTime StartTimeUtc { get; set; }
    public DateTime EndTimeUtc { get; set; }
    public string Status { get; set; } = string.Empty;
    public int BidCount { get; set; }
}

public class BidDto
{
    public int Id { get; set; }
    public string BidderDisplayName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public DateTime PlacedAtUtc { get; set; }
}

public class AuctionDetailDto : AuctionSummaryDto
{
    public string ProductDescription { get; set; } = string.Empty;
    public string ProductSubcategory { get; set; } = string.Empty;
    public string? CurrentHighestBidderName { get; set; }
    public List<BidDto> Bids { get; set; } = new();
}

public class CreateAuctionRequest
{
    [Required]
    public int ProductId { get; set; }

    [Range(0.01, 1000000)]
    public decimal StartingPrice { get; set; }

    [Range(0.01, 100000)]
    public decimal MinIncrement { get; set; } = 5m;

    [Required]
    public DateTime StartTimeUtc { get; set; }

    [Required]
    public DateTime EndTimeUtc { get; set; }

    // Optional "Buy It Now" price. When provided it must be strictly greater
    // than StartingPrice (enforced in the controller, where the comparison
    // between the two fields naturally belongs).
    [Range(0.01, 1000000)]
    public decimal? BuyoutPrice { get; set; }
}

public class PlaceBidRequest
{
    [Range(0.01, 10000000)]
    public decimal Amount { get; set; }
}

public class BuyoutResponseDto
{
    public AuctionDetailDto Auction { get; set; } = null!;
    public OrderDto Order { get; set; } = null!;
}
