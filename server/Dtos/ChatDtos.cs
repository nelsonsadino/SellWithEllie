using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

public class ChatMessageDto
{
    public int Id { get; set; }
    public int? AuctionId { get; set; }
    public int? RaffleId { get; set; }

    // Opaque per-entity (auction or raffle) author pseudonym - safe to send to every viewer.
    public string AuthorRef { get; set; } = string.Empty;

    // The real user id, populated ONLY for admin callers of the history
    // endpoint (never in the live broadcast) so moderation still works.
    public string? UserId { get; set; }

    public string DisplayName { get; set; } = string.Empty;
    public bool IsAdmin { get; set; }
    public string Content { get; set; } = string.Empty;
    public bool WasFiltered { get; set; }
    public DateTime SentAtUtc { get; set; }
}

public class ChatHistoryDto
{
    public List<ChatMessageDto> Messages { get; set; } = new();

    // The caller's own AuthorRef for this auction, so the client can mark
    // its own messages without ever seeing a user id.
    public string MyAuthorRef { get; set; } = string.Empty;
}

public class SendChatMessageRequest
{
    [Required, StringLength(500, MinimumLength = 1)]
    public string Content { get; set; } = string.Empty;
}

public class BlockChatUserRequest
{
    // Either the real user id (admin loaded history) or an AuthorRef +
    // AuctionId/RaffleId pair (blocking straight off a live message).
    public string? UserId { get; set; }
    public string? AuthorRef { get; set; }
    public int? AuctionId { get; set; }
    public int? RaffleId { get; set; }

    [StringLength(300)]
    public string? Reason { get; set; }
}

public class BlockedChatUserDto
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public DateTime BlockedAtUtc { get; set; }
}
