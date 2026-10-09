using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;

namespace SellWithEllie.Hubs;

// Clients join a per-shop-per-auction group so bid updates only reach people
// actually viewing that auction - and, critically, never cross between two
// different shops even if their auction ids happen to collide. No
// server-trusted data flows through the hub itself - bids are always placed
// (and validated) via the REST API; this hub only broadcasts the result.
//
// A WebSocket upgrade can't carry the same X-Tenant-Slug header the REST API
// uses, so the caller passes tenantId/auctionId directly. JoinAuction checks
// the pair is real (ignoring the query filter, since there's no reliable
// per-connection tenant context here) so joining a group at least requires
// knowing a genuine tenant+auction id combination, not just guessing one.
public class AuctionHub : Hub
{
    private readonly ApplicationDbContext _db;

    public AuctionHub(ApplicationDbContext db)
    {
        _db = db;
    }

    public static string GroupName(int tenantId, int auctionId) => $"auction-{tenantId}-{auctionId}";

    public async Task JoinAuction(int tenantId, int auctionId)
    {
        var exists = await _db.Auctions.IgnoreQueryFilters().AnyAsync(a => a.Id == auctionId && a.TenantId == tenantId);
        if (!exists) return;

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(tenantId, auctionId));
    }

    public async Task LeaveAuction(int tenantId, int auctionId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(tenantId, auctionId));
    }
}
