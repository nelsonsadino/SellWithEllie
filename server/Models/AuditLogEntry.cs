namespace SellWithEllie.Models;

// A durable, append-only record of admin actions for accountability and
// support ("who did what, and when"). Deliberately denormalized - the
// actor's display name is captured at write time from their JWT claims,
// not joined from the Users table - so the log stays fully readable even
// if that admin's account is later renamed or removed.
public class AuditLogEntry : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public string ActorUserId { get; set; } = string.Empty;
    public string ActorDisplayName { get; set; } = string.Empty;

    // e.g. "Product.Create", "Auction.Cancel", "Chat.BlockUser"
    public string Action { get; set; } = string.Empty;

    public string? TargetType { get; set; }
    public string? TargetId { get; set; }

    // Short free-form human-readable detail (e.g. the product name or
    // amount involved) - not a full JSON dump of the request.
    public string? Details { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
