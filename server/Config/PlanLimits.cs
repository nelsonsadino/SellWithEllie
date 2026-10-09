namespace SellWithEllie.Config;

// Free-tier ceilings, enforced server-side on the create endpoints so a
// shop can't exceed what its plan allows even if a client bypasses the UI.
// Pro has no limits - these constants are only ever consulted when
// Tenant.Plan == PlanTier.Free.
public static class PlanLimits
{
    public const int FreeMaxProducts = 25;
    public const int FreeMaxActiveAuctions = 3;

    // "Active" = Status Open or ReadyToDraw.
    public const int FreeMaxActiveRaffles = 3;
}
