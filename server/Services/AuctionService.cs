using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Hubs;
using SellWithEllie.Mapping;
using SellWithEllie.Models;

namespace SellWithEllie.Services;

// Bid placement is the one piece of business logic in this app that must be
// airtight under concurrent requests: two people can click "bid" at the same
// instant. We rely on Auction.RowVersion (a SQL Server rowversion / EF Core
// concurrency token) so that if two requests both read the same "current
// highest" snapshot, only the first to commit wins - the second gets a
// concurrency exception and is asked to retry against the now-current price,
// rather than silently overwriting the winning bid.
public class AuctionService : IAuctionService
{
    private readonly ApplicationDbContext _db;
    private readonly IHubContext<AuctionHub> _hub;
    private readonly IEmailSender _emailSender;
    private readonly ITenantContext _tenantContext;
    private readonly ILogger<AuctionService> _logger;

    public AuctionService(
        ApplicationDbContext db,
        IHubContext<AuctionHub> hub,
        IEmailSender emailSender,
        ITenantContext tenantContext,
        ILogger<AuctionService> logger)
    {
        _db = db;
        _hub = hub;
        _emailSender = emailSender;
        _tenantContext = tenantContext;
        _logger = logger;
    }

    public async Task<BidPlacementResult> PlaceBidAsync(int auctionId, string userId, decimal amount)
    {
        var auction = await _db.Auctions
            .Include(a => a.Product)
            .FirstOrDefaultAsync(a => a.Id == auctionId);

        if (auction is null)
        {
            return BidPlacementResult.Fail("Auction not found.");
        }

        var now = DateTime.UtcNow;
        if (auction.Status != AuctionStatus.Active || now < auction.StartTimeUtc || now > auction.EndTimeUtc)
        {
            return BidPlacementResult.Fail("This auction is not currently accepting bids.");
        }

        var minRequired = auction.CurrentHighestAmount.HasValue
            ? auction.CurrentHighestAmount.Value + auction.MinIncrement
            : auction.StartingPrice;

        if (amount < minRequired)
        {
            return BidPlacementResult.Fail($"Your bid must be at least {minRequired:0.00}.");
        }

        // Captured before being overwritten below, so the previous highest
        // bidder can be emailed an "outbid" notice once the new bid commits.
        var previousHighestBidderId = auction.CurrentHighestBidId.HasValue
            ? await _db.Bids.Where(b => b.Id == auction.CurrentHighestBidId.Value).Select(b => b.UserId).FirstOrDefaultAsync()
            : null;

        var bid = new Bid
        {
            AuctionId = auction.Id,
            UserId = userId,
            Amount = amount,
            PlacedAtUtc = now
        };

        _db.Bids.Add(bid);
        auction.CurrentHighestBid = bid;
        auction.CurrentHighestAmount = amount;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _logger.LogInformation("Bid on auction {AuctionId} lost a concurrency race and was rejected.", auctionId);
            return BidPlacementResult.Fail("Someone else just placed a bid. Please check the current price and try again.");
        }

        // Best-effort - a slow/unavailable mail server should never affect
        // whether a bid succeeds. Silently no-ops if Email isn't configured.
        if (!string.IsNullOrEmpty(previousHighestBidderId) && previousHighestBidderId != userId)
        {
            var previousBidder = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == previousHighestBidderId);
            if (previousBidder is not null)
            {
                var (outbidSubject, outbidHtml) = EmailTemplates.AuctionOutbid(
                    previousBidder.DisplayName, _tenantContext.Tenant?.Name ?? "the shop", auction.Product?.Name ?? "an item", amount);
                await _emailSender.SendAsync(previousBidder.Email ?? string.Empty, previousBidder.DisplayName, outbidSubject, outbidHtml);
            }
        }

        var bidWithUser = await _db.Bids
            .Include(b => b.User)
            .FirstAsync(b => b.Id == bid.Id);

        var bidDto = bidWithUser.ToDto();

        await _hub.Clients.Group(AuctionHub.GroupName(auction.TenantId, auctionId)).SendAsync("BidPlaced", new
        {
            auctionId,
            bid = bidDto,
            currentHighestAmount = amount
        });

        return BidPlacementResult.Ok(bidDto);
    }

    // "Buy It Now": lets a bidder skip the auction entirely and win instantly
    // at the admin-configured BuyoutPrice. Mirrors PlaceBidAsync's
    // concurrency safety (RowVersion) so a buyout can never silently clobber
    // - or be clobbered by - a bid landing at the same instant, and mirrors
    // CartController.Checkout's "simulated payment" pattern: the Order is
    // created directly, with no real payment gateway call, and its existence
    // is what represents "payment has been sent" before the auction closes.
    public async Task<BuyoutResult> BuyoutAsync(int auctionId, string userId, string shippingName, string shippingAddress)
    {
        var auction = await _db.Auctions
            .Include(a => a.Product)
            .FirstOrDefaultAsync(a => a.Id == auctionId);

        if (auction is null)
        {
            return BuyoutResult.Fail("Auction not found.");
        }

        if (!auction.BuyoutPrice.HasValue)
        {
            return BuyoutResult.Fail("This auction does not offer a buy-out option.");
        }

        var now = DateTime.UtcNow;
        if (auction.Status != AuctionStatus.Active || now < auction.StartTimeUtc || now > auction.EndTimeUtc)
        {
            return BuyoutResult.Fail("This auction is not currently accepting a buy out.");
        }

        if (auction.CurrentHighestAmount.HasValue && auction.CurrentHighestAmount.Value >= auction.BuyoutPrice.Value)
        {
            return BuyoutResult.Fail("The current highest bid has already reached the buyout price - place a bid instead.");
        }

        if (auction.Product is null)
        {
            return BuyoutResult.Fail("The product for this auction could not be found.");
        }

        var buyoutPrice = auction.BuyoutPrice.Value;

        // Record the buyout as the winning bid so every existing UI/DTO that
        // reads CurrentHighestBid/CurrentHighestAmount reflects the buyer
        // without needing separate winner-tracking fields on Auction.
        var bid = new Bid
        {
            AuctionId = auction.Id,
            UserId = userId,
            Amount = buyoutPrice,
            PlacedAtUtc = now
        };
        _db.Bids.Add(bid);
        auction.CurrentHighestBid = bid;
        auction.CurrentHighestAmount = buyoutPrice;
        auction.Status = AuctionStatus.Closed;
        auction.ClosedViaBuyout = true;

        var order = new Order
        {
            UserId = userId,
            OrderDateUtc = now,
            ShippingName = shippingName,
            ShippingAddress = shippingAddress,
            Status = OrderStatus.Completed,
            TotalAmount = buyoutPrice
        };
        order.Items.Add(new OrderItem
        {
            ProductId = auction.Product.Id,
            ProductName = auction.Product.Name,
            PriceAtPurchase = buyoutPrice,
            Quantity = 1
        });
        _db.Orders.Add(order);

        // The lot is sold as set - no units remain for fixed-price sale.
        auction.Product.InStock = false;
        auction.Product.StockQuantity = 0;
        auction.Product.UpdatedAtUtc = now;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _logger.LogInformation("Buyout on auction {AuctionId} lost a concurrency race and was rejected.", auctionId);
            return BuyoutResult.Fail("Someone just placed a bid or bought this out. Please refresh and try again.");
        }

        var savedOrder = await _db.Orders
            .Include(o => o.Items)
            .Include(o => o.User)
            .FirstAsync(o => o.Id == order.Id);

        // Best-effort - a slow/unavailable mail server should never affect
        // whether a buyout succeeds. Silently no-ops if Email isn't configured.
        var (buyoutSubject, buyoutHtml) = EmailTemplates.OrderConfirmation(
            savedOrder.User?.DisplayName ?? "there",
            _tenantContext.Tenant?.Name ?? "the shop",
            savedOrder.Id,
            savedOrder.TotalAmount,
            savedOrder.Items.Select(i => i.ProductName));
        await _emailSender.SendAsync(savedOrder.User?.Email ?? string.Empty, savedOrder.User?.DisplayName ?? "there", buyoutSubject, buyoutHtml);

        var auctionWithDetails = await _db.Auctions
            .Include(a => a.Product)
            .Include(a => a.CurrentHighestBid).ThenInclude(b => b!.User)
            .Include(a => a.Bids).ThenInclude(b => b.User)
            .AsNoTracking()
            .FirstAsync(a => a.Id == auction.Id);

        var response = new BuyoutResponseDto
        {
            Order = savedOrder.ToDto(),
            Auction = auctionWithDetails.ToDetailDto()
        };

        await _hub.Clients.Group(AuctionHub.GroupName(auction.TenantId, auctionId)).SendAsync("AuctionClosed", new
        {
            auctionId,
            winningBidderName = auctionWithDetails.CurrentHighestBid?.User?.DisplayName,
            winningAmount = buyoutPrice,
            wasBuyout = true
        });

        return BuyoutResult.Ok(response);
    }
}
