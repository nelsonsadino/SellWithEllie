namespace SellWithEllie.Models;

// A shop-wide chat block: once blocked, a customer can't send messages in
// ANY of that shop's auction chats (not just the one they were blocked
// from) until an admin unblocks them. Deliberately separate from
// account-level bans/deletion - a blocked customer can still browse, bid,
// and buy, they just can't chat.
public class ChatBlockedUser : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public string UserId { get; set; } = string.Empty;
    public ApplicationUser? User { get; set; }

    public string BlockedByUserId { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public DateTime BlockedAtUtc { get; set; } = DateTime.UtcNow;
}
