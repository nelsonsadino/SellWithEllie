namespace SellWithEllie.Models;

// A single message in an auction's or a raffle's live chat room. Exactly one
// of AuctionId/RaffleId is set - enforced at the point of insert in
// AuctionsController/RafflesController, not a DB constraint (SQL Server
// CHECK-constraint plumbing through EF isn't worth it for two nullable FKs).
// Content has already passed through IProfanityFilterService by the time
// it's saved here - the raw, un-filtered text is never persisted, so
// there's nothing to leak even if this table were ever queried directly.
public class ChatMessage : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public int? AuctionId { get; set; }
    public Auction? Auction { get; set; }

    public int? RaffleId { get; set; }
    public Raffle? Raffle { get; set; }

    public string UserId { get; set; } = string.Empty;
    public ApplicationUser? User { get; set; }

    public string Content { get; set; } = string.Empty;
    public bool WasFiltered { get; set; }
    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;
}
