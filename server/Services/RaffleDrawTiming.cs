namespace SellWithEllie.Services;

public static class RaffleDrawTiming
{
    // Was 3s, then 6s, then 30s (too long) - 15s gives each reveal room to
    // breathe as a full race without dragging.
    public const int RevealStepSeconds = 15;

    // Buffer for the final RaffleDrawn event + network latency, added on top
    // of the reveal sequence's own duration when computing whether raffle
    // chat has passed its post-draw cutoff window.
    public const int RevealGraceSeconds = 5;
}
