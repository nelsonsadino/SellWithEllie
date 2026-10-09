using System.Collections.Concurrent;

namespace SellWithEllie.Services;

// In-memory, per-process anti-spam guard for auction chat. Two rules, both
// per user (not per auction - someone spamming one auction's chat is
// spamming, full stop):
//   1. A minimum gap between consecutive messages (stops rapid-fire spam).
//   2. A cap on messages within a rolling window (stops slow-but-steady
//      flooding that a minimum gap alone wouldn't catch).
// Registered as a singleton - state naturally resets on app restart, which
// is fine for a "slow down" guard rather than a permanent record (that's
// what ChatBlockedUser is for).
//
// A background sweep drops idle users' entries so the dictionary can't grow
// without bound over a long-running process (every distinct chatter would
// otherwise leave a permanent key behind).
public sealed class ChatRateLimiter : IChatRateLimiter, IDisposable
{
    private static readonly TimeSpan MinGap = TimeSpan.FromSeconds(1.5);
    private static readonly TimeSpan Window = TimeSpan.FromSeconds(20);
    private const int MaxMessagesPerWindow = 8;

    private readonly ConcurrentDictionary<string, List<DateTime>> _history = new();
    private readonly Timer _sweep;

    public ChatRateLimiter()
    {
        _sweep = new Timer(_ => Sweep(), null, TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(5));
    }

    public string? CheckAndRecord(string userId)
    {
        var now = DateTime.UtcNow;
        var timestamps = _history.GetOrAdd(userId, _ => new List<DateTime>());

        lock (timestamps)
        {
            timestamps.RemoveAll(t => now - t > Window);

            if (timestamps.Count > 0 && now - timestamps[^1] < MinGap)
            {
                return "You're sending messages too fast - please slow down.";
            }

            if (timestamps.Count >= MaxMessagesPerWindow)
            {
                return "You've hit the chat limit for now - wait a few seconds and try again.";
            }

            timestamps.Add(now);
            return null;
        }
    }

    private void Sweep()
    {
        var cutoff = DateTime.UtcNow - Window;
        foreach (var (userId, timestamps) in _history)
        {
            lock (timestamps)
            {
                timestamps.RemoveAll(t => t < cutoff);
                if (timestamps.Count != 0) continue;
            }
            // Remove only if still empty - a racing CheckAndRecord may have
            // just added to (a possibly different) list for this key.
            _history.TryRemove(new KeyValuePair<string, List<DateTime>>(userId, timestamps));
        }
    }

    public void Dispose() => _sweep.Dispose();
}
