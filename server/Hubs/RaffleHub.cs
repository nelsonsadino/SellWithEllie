using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;

namespace SellWithEllie.Hubs;

// Mirrors AuctionHub exactly. Clients join a per-shop-per-raffle group so
// seat updates only reach people actually viewing that raffle, and never
// cross between two different shops even if their raffle ids happen to
// collide. No server-trusted data flows through the hub itself - seats are
// always reserved/paid/drawn (and validated) via the REST API; this hub
// only broadcasts the result.
public class RaffleHub : Hub
{
    private readonly ApplicationDbContext _db;

    public RaffleHub(ApplicationDbContext db)
    {
        _db = db;
    }

    public static string GroupName(int tenantId, int raffleId) => $"raffle-{tenantId}-{raffleId}";

    public async Task JoinRaffle(int tenantId, int raffleId)
    {
        var exists = await _db.Raffles.IgnoreQueryFilters().AnyAsync(r => r.Id == raffleId && r.TenantId == tenantId);
        if (!exists) return;

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(tenantId, raffleId));
    }

    public async Task LeaveRaffle(int tenantId, int raffleId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(tenantId, raffleId));
    }
}
