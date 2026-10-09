using System.Text.Json;
using SellWithEllie.Dtos;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Mapping;

public static class MappingExtensions
{
    private static readonly JsonElement EmptyObject = JsonSerializer.Deserialize<JsonElement>("{}");

    // A section's DataJson is opaque props for the block's frontend component.
    // Parse it into a JsonElement so it serialises back out as nested JSON
    // rather than an escaped string; fall back to {} if it's blank or invalid.
    private static JsonElement ParseData(string dataJson)
    {
        if (string.IsNullOrWhiteSpace(dataJson)) return EmptyObject;
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(dataJson);
        }
        catch (JsonException)
        {
            return EmptyObject;
        }
    }

    public static SectionDto ToDto(this TenantSection section) => new()
    {
        Id = section.Id,
        Kind = section.Kind,
        Position = section.Position,
        IsVisible = section.IsVisible,
        Data = ParseData(section.DataJson)
    };

    public static SectionDto ToDto(this PlatformSection section) => new()
    {
        Id = section.Id,
        Kind = section.Kind,
        Position = section.Position,
        IsVisible = section.IsVisible,
        Data = ParseData(section.DataJson)
    };

    public static ProductDto ToDto(this Product product)
    {
        int? activeAuctionId = null;
        if (product.Auction is not null &&
            (product.Auction.Status == AuctionStatus.Active || product.Auction.Status == AuctionStatus.Scheduled))
        {
            activeAuctionId = product.Auction.Id;
        }

        // ImageUrl is the "cover" shown in listings/cards/auctions/cart. If
        // the admin never set one directly, fall back to the first uploaded
        // photo so a product with only gallery media still has a cover.
        var coverImageUrl = product.ImageUrl;
        if (string.IsNullOrWhiteSpace(coverImageUrl))
        {
            coverImageUrl = (product.Media ?? new List<ProductMedia>())
                .OrderBy(m => m.SortOrder)
                .FirstOrDefault(m => m.MediaType == ProductMediaType.Image)?.Url ?? string.Empty;
        }

        return new ProductDto
        {
            Id = product.Id,
            Name = product.Name,
            Category = product.Category,
            Subcategory = product.Subcategory,
            Price = product.Price,
            Description = product.Description,
            ImageUrl = coverImageUrl,
            InStock = product.InStock,
            StockQuantity = product.StockQuantity,
            IsAuctionOnly = product.IsAuctionOnly,
            ActiveAuctionId = activeAuctionId,
            Media = (product.Media ?? new List<ProductMedia>())
                .OrderBy(m => m.SortOrder)
                .Select(m => m.ToDto())
                .ToList()
        };
    }

    public static ProductMediaDto ToDto(this ProductMedia media)
    {
        return new ProductMediaDto
        {
            Id = media.Id,
            Url = media.Url,
            MediaType = media.MediaType.ToString(),
            SortOrder = media.SortOrder
        };
    }

    public static AuctionSummaryDto ToSummaryDto(this Auction auction)
    {
        return new AuctionSummaryDto
        {
            Id = auction.Id,
            ProductId = auction.ProductId,
            ProductName = auction.Product?.Name ?? string.Empty,
            ProductImageUrl = auction.Product?.ImageUrl ?? string.Empty,
            ProductCategory = auction.Product?.Category ?? string.Empty,
            StartingPrice = auction.StartingPrice,
            MinIncrement = auction.MinIncrement,
            CurrentHighestAmount = auction.CurrentHighestAmount,
            BuyoutPrice = auction.BuyoutPrice,
            ClosedViaBuyout = auction.ClosedViaBuyout,
            StartTimeUtc = auction.StartTimeUtc,
            EndTimeUtc = auction.EndTimeUtc,
            Status = auction.Status.ToString(),
            BidCount = auction.Bids?.Count ?? 0
        };
    }

    public static AuctionDetailDto ToDetailDto(this Auction auction)
    {
        var summary = auction.ToSummaryDto();

        return new AuctionDetailDto
        {
            Id = summary.Id,
            ProductId = summary.ProductId,
            ProductName = summary.ProductName,
            ProductImageUrl = summary.ProductImageUrl,
            ProductCategory = summary.ProductCategory,
            StartingPrice = summary.StartingPrice,
            MinIncrement = summary.MinIncrement,
            CurrentHighestAmount = summary.CurrentHighestAmount,
            BuyoutPrice = summary.BuyoutPrice,
            ClosedViaBuyout = summary.ClosedViaBuyout,
            StartTimeUtc = summary.StartTimeUtc,
            EndTimeUtc = summary.EndTimeUtc,
            Status = summary.Status,
            BidCount = summary.BidCount,
            ProductDescription = auction.Product?.Description ?? string.Empty,
            ProductSubcategory = auction.Product?.Subcategory ?? string.Empty,
            CurrentHighestBidderName = auction.CurrentHighestBid?.User?.DisplayName,
            Bids = (auction.Bids ?? new List<Bid>())
                .OrderByDescending(b => b.PlacedAtUtc)
                .Select(b => b.ToDto())
                .ToList()
        };
    }

    public static BidDto ToDto(this Bid bid)
    {
        return new BidDto
        {
            Id = bid.Id,
            BidderDisplayName = bid.User?.DisplayName ?? "A bidder",
            Amount = bid.Amount,
            PlacedAtUtc = bid.PlacedAtUtc
        };
    }

    public static ChatMessageDto ToDto(this ChatMessage message, bool isAdmin, string authorRefSalt, bool includeUserId)
    {
        var scope = message.RaffleId is not null ? "raffle" : "auction";
        var entityId = message.RaffleId ?? message.AuctionId ?? 0;

        return new ChatMessageDto
        {
            Id = message.Id,
            AuctionId = message.AuctionId,
            RaffleId = message.RaffleId,
            AuthorRef = ChatAuthorRef.For(authorRefSalt, scope, entityId, message.UserId),
            UserId = includeUserId ? message.UserId : null,
            DisplayName = message.User?.DisplayName ?? "A user",
            IsAdmin = isAdmin,
            Content = message.Content,
            WasFiltered = message.WasFiltered,
            SentAtUtc = message.SentAtUtc
        };
    }

    public static AuditLogEntryDto ToDto(this AuditLogEntry entry)
    {
        return new AuditLogEntryDto
        {
            Id = entry.Id,
            ActorDisplayName = entry.ActorDisplayName,
            Action = entry.Action,
            TargetType = entry.TargetType,
            TargetId = entry.TargetId,
            Details = entry.Details,
            CreatedAtUtc = entry.CreatedAtUtc
        };
    }

    // `revealed` gates the winner fields - a prize whose reveal-order turn
    // hasn't come up yet (even though WinningSeatId is already persisted,
    // computed synchronously the instant the draw started) must not leak its
    // winner to a page refresh before the admin actually reveals it.
    public static RafflePrizeDto ToDto(this RafflePrize prize, bool revealed)
    {
        return new RafflePrizeDto
        {
            Rank = prize.Rank,
            Description = prize.Description,
            WinningSeatNumber = revealed ? prize.WinningSeat?.SeatNumber : null,
            WinnerDisplayName = revealed ? prize.WinningSeat?.ReservedByUser?.DisplayName : null
        };
    }

    public static RaffleSummaryDto ToSummaryDto(this Raffle raffle)
    {
        var seats = raffle.Seats ?? new List<RaffleSeat>();
        var prizes = raffle.Prizes ?? new List<RafflePrize>();

        // Reveal order is descending rank (lowest-prestige prize first,
        // building up to the top prize) - mirrors RaffleService's own
        // ordering so "reveal-order index < RevealedPrizeCount" means the
        // same thing on both sides.
        var revealIndexByRank = prizes
            .OrderByDescending(p => p.Rank)
            .Select((p, index) => (p.Rank, Index: index))
            .ToDictionary(x => x.Rank, x => x.Index);

        return new RaffleSummaryDto
        {
            Id = raffle.Id,
            Title = raffle.Title,
            ImageUrl = raffle.ImageUrl,
            SeatCount = raffle.SeatCount,
            SeatPrice = raffle.SeatPrice,
            AvailableSeatCount = seats.Count(s => s.Status == RaffleSeatStatus.Available),
            ReservedSeatCount = seats.Count(s => s.Status == RaffleSeatStatus.Reserved),
            PaidSeatCount = seats.Count(s => s.Status == RaffleSeatStatus.Paid),
            Status = raffle.Status.ToString(),
            DrawMode = raffle.DrawMode.ToString(),
            ScheduledDrawAtUtc = raffle.ScheduledDrawAtUtc,
            DrawnAtUtc = raffle.DrawnAtUtc,
            CreatedAtUtc = raffle.CreatedAtUtc,
            RevealedPrizeCount = raffle.RevealedPrizeCount,
            Prizes = prizes.OrderBy(p => p.Rank)
                .Select(p => p.ToDto(revealIndexByRank.TryGetValue(p.Rank, out var idx) && idx < raffle.RevealedPrizeCount))
                .ToList()
        };
    }

    public static RaffleDetailDto ToDetailDto(this Raffle raffle, string? callerUserId)
    {
        var summary = raffle.ToSummaryDto();
        var seats = raffle.Seats ?? new List<RaffleSeat>();

        // Only "Reserved" (awaiting-payment) holds are actionable for the
        // caller to resume payment on - a Paid seat already shows as paid in
        // the seat grid, and a Forfeited seat has nothing left to pay.
        var myReservations = seats
            .Where(s => s.Status == RaffleSeatStatus.Reserved
                        && !string.IsNullOrEmpty(callerUserId)
                        && s.ReservedByUserId == callerUserId
                        && s.Order is not null)
            .GroupBy(s => s.OrderId!.Value)
            .Select(g => new MyRaffleReservationDto
            {
                OrderId = g.Key,
                SeatNumbers = g.Select(s => s.SeatNumber).OrderBy(n => n).ToList(),
                TotalAmount = g.First().Order!.TotalAmount,
                OrderStatus = g.First().Order!.Status.ToString(),
                PaymentUrl = g.First().Order!.PaymentUrl
            })
            .ToList();

        return new RaffleDetailDto
        {
            Id = summary.Id,
            Title = summary.Title,
            ImageUrl = summary.ImageUrl,
            SeatCount = summary.SeatCount,
            SeatPrice = summary.SeatPrice,
            AvailableSeatCount = summary.AvailableSeatCount,
            ReservedSeatCount = summary.ReservedSeatCount,
            PaidSeatCount = summary.PaidSeatCount,
            Status = summary.Status,
            DrawMode = summary.DrawMode,
            ScheduledDrawAtUtc = summary.ScheduledDrawAtUtc,
            DrawnAtUtc = summary.DrawnAtUtc,
            CreatedAtUtc = summary.CreatedAtUtc,
            RevealedPrizeCount = summary.RevealedPrizeCount,
            Prizes = summary.Prizes,
            Seats = seats
                .OrderBy(s => s.SeatNumber)
                .Select(s => s.ToDto(!string.IsNullOrEmpty(callerUserId) && s.ReservedByUserId == callerUserId))
                .ToList(),
            MyReservations = myReservations
        };
    }

    public static RaffleSeatDto ToDto(this RaffleSeat seat, bool isMine)
    {
        return new RaffleSeatDto
        {
            Id = seat.Id,
            SeatNumber = seat.SeatNumber,
            Status = seat.Status.ToString(),
            IsMine = isMine,
            ReservedByDisplayName = seat.Status is RaffleSeatStatus.Reserved or RaffleSeatStatus.Paid
                ? seat.ReservedByUser?.DisplayName
                : null
        };
    }

    public static OrderDto ToDto(this Order order)
    {
        return new OrderDto
        {
            Id = order.Id,
            OrderDateUtc = order.OrderDateUtc,
            TotalAmount = order.TotalAmount,
            Status = order.Status.ToString(),
            ShippingName = order.ShippingName,
            ShippingAddress = order.ShippingAddress,
            CustomerEmail = order.GuestEmail ?? order.User?.Email,
            PaymentProvider = order.PaymentProvider,
            PaymentUrl = order.Status == OrderStatus.AwaitingPayment ? order.PaymentUrl : null,
            Fulfillment = order.Fulfillment.ToString(),
            ShippingMethodName = order.ShippingMethodName,
            ShippingCost = order.ShippingCost,
            DiscountAmount = order.DiscountAmount,
            CouponCode = order.CouponCode,
            Carrier = order.Carrier,
            TrackingNumber = order.TrackingNumber,
            ShippedAtUtc = order.ShippedAtUtc,
            DeliveredAtUtc = order.DeliveredAtUtc,
            IsGuest = order.GuestEmail is not null,
            Items = (order.Items ?? new List<OrderItem>())
                .Select(i => new OrderItemDto
                {
                    ProductId = i.ProductId,
                    ProductName = i.ProductName,
                    PriceAtPurchase = i.PriceAtPurchase,
                    Quantity = i.Quantity
                })
                .ToList()
        };
    }
}
