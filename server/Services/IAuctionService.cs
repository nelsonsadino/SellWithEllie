using SellWithEllie.Dtos;

namespace SellWithEllie.Services;

public class BidPlacementResult
{
    public bool Success { get; init; }
    public string? ErrorMessage { get; init; }
    public BidDto? Bid { get; init; }

    public static BidPlacementResult Fail(string message) => new() { Success = false, ErrorMessage = message };
    public static BidPlacementResult Ok(BidDto bid) => new() { Success = true, Bid = bid };
}

public class BuyoutResult
{
    public bool Success { get; init; }
    public string? ErrorMessage { get; init; }
    public BuyoutResponseDto? Response { get; init; }

    public static BuyoutResult Fail(string message) => new() { Success = false, ErrorMessage = message };
    public static BuyoutResult Ok(BuyoutResponseDto response) => new() { Success = true, Response = response };
}

public interface IAuctionService
{
    Task<BidPlacementResult> PlaceBidAsync(int auctionId, string userId, decimal amount);

    Task<BuyoutResult> BuyoutAsync(int auctionId, string userId, string shippingName, string shippingAddress);
}
