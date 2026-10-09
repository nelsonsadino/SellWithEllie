namespace SellWithEllie.Services;

public interface IChatRateLimiter
{
    // Returns null if the message is allowed (and records it), or a
    // user-facing reason string if it should be rejected as spam.
    string? CheckAndRecord(string userId);
}
