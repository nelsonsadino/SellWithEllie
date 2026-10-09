using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Hubs;
using SellWithEllie.Models;

namespace SellWithEllie.Services;

// Periodically flips Scheduled -> Active -> Closed based on wall-clock time,
// so auction state is correct even if nobody is actively viewing/bidding on
// it at the exact moment it should open or close, and broadcasts the
// transition to anyone watching.
public class AuctionStatusBackgroundService : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(15);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AuctionStatusBackgroundService> _logger;

    public AuctionStatusBackgroundService(IServiceScopeFactory scopeFactory, ILogger<AuctionStatusBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await UpdateAuctionStatusesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while updating auction statuses.");
            }

            await Task.Delay(PollInterval, stoppingToken);
        }
    }

    private async Task UpdateAuctionStatusesAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var hub = scope.ServiceProvider.GetRequiredService<IHubContext<AuctionHub>>();
        var emailSender = scope.ServiceProvider.GetRequiredService<IEmailSender>();

        var now = DateTime.UtcNow;

        // This runs outside any tenant's request scope and must process every
        // shop's auctions, so it explicitly opts out of the tenant query filter.
        var toActivate = await db.Auctions
            .IgnoreQueryFilters()
            .Where(a => a.Status == AuctionStatus.Scheduled && a.StartTimeUtc <= now)
            .ToListAsync(cancellationToken);

        foreach (var auction in toActivate)
        {
            auction.Status = AuctionStatus.Active;
            await hub.Clients.Group(AuctionHub.GroupName(auction.TenantId, auction.Id))
                .SendAsync("AuctionStarted", new { auctionId = auction.Id }, cancellationToken);
        }

        var toClose = await db.Auctions
            .IgnoreQueryFilters()
            .Include(a => a.Product)
            .Include(a => a.CurrentHighestBid)
            .ThenInclude(b => b!.User)
            .Where(a => a.Status == AuctionStatus.Active && a.EndTimeUtc <= now)
            .ToListAsync(cancellationToken);

        foreach (var auction in toClose)
        {
            auction.Status = AuctionStatus.Closed;

            if (auction.CurrentHighestBidId is not null && auction.Product is not null)
            {
                // The lot went to the winning bidder - nothing left to sell.
                auction.Product.InStock = false;
                auction.Product.StockQuantity = 0;
                auction.Product.UpdatedAtUtc = now;
            }

            await hub.Clients.Group(AuctionHub.GroupName(auction.TenantId, auction.Id)).SendAsync("AuctionClosed", new
            {
                auctionId = auction.Id,
                winningBidderName = auction.CurrentHighestBid?.User?.DisplayName,
                winningAmount = auction.CurrentHighestAmount,
                wasBuyout = false
            }, cancellationToken);

            // Best-effort "you won" email - a slow/unavailable mail server
            // must never block the status sweep for every other auction.
            // Silently no-ops if Email isn't configured.
            var winner = auction.CurrentHighestBid?.User;
            if (winner is not null && auction.Product is not null)
            {
                try
                {
                    var tenantName = await db.Tenants
                        .AsNoTracking()
                        .Where(t => t.Id == auction.TenantId)
                        .Select(t => t.Name)
                        .FirstOrDefaultAsync(cancellationToken) ?? "the shop";

                    var (subject, html) = EmailTemplates.AuctionWon(
                        winner.DisplayName, tenantName, auction.Product.Name, auction.CurrentHighestAmount ?? 0m);
                    await emailSender.SendAsync(winner.Email ?? string.Empty, winner.DisplayName, subject, html);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to send auction-won email for auction {AuctionId}.", auction.Id);
                }
            }
        }

        if (toActivate.Count > 0 || toClose.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}
