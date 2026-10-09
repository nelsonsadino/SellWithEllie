namespace SellWithEllie.Models;

// One ranked prize slot on a Raffle (1 = first/top prize). Mirrors the old
// singular Raffle.WinningSeatId field, just per-rank now. WinningSeatId is
// null until the raffle is drawn, and stays null forever if the raffle had
// fewer paid seats than prizes (see RaffleService.DrawWinnerAsync).
public class RafflePrize : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public int RaffleId { get; set; }
    public Raffle? Raffle { get; set; }

    public int Rank { get; set; } // 1-based; 1 = first/top prize
    public string Description { get; set; } = string.Empty;

    // Restrict delete (see ApplicationDbContext) - same multiple-cascade-
    // paths gotcha as the old Raffle.WinningSeatId -> RaffleSeat relation
    // this replaces.
    public int? WinningSeatId { get; set; }
    public RaffleSeat? WinningSeat { get; set; }
}
