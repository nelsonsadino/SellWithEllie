namespace SellWithEllie.Models;

public class Raffle : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public string Title { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }

    public int SeatCount { get; set; }
    public decimal SeatPrice { get; set; }

    public RaffleStatus Status { get; set; } = RaffleStatus.Open;

    public RaffleDrawMode DrawMode { get; set; } = RaffleDrawMode.Instant;

    // Informational only - admin sets it, users see it, nothing auto-
    // triggers off it. The admin still manually clicks "Draw" when ready.
    public DateTime? ScheduledDrawAtUtc { get; set; }

    public DateTime? DrawnAtUtc { get; set; }

    // How many prizes (in reveal order - lowest rank first) the admin has
    // actually triggered the reveal of so far. Deliberately separate from
    // the WinningSeatId assignments below, which are all computed and
    // persisted the instant the draw starts (Status flips to Drawn right
    // away, to block a double-draw race) - the mapping layer only exposes a
    // prize's winner once its reveal-order index is < this count, so a page
    // refresh mid-sequence can't spoil prizes the admin hasn't revealed yet.
    public int RevealedPrizeCount { get; set; }

    // True while a single prize's reveal is in flight (RevealNextPrizeAsync
    // has broadcast RoundStarted but the delayed PrizeRevealed hasn't landed
    // yet) - blocks a second "reveal next" click from racing the same round.
    public bool RevealInProgress { get; set; }

    // Timestamp of the most recent PrizeRevealed, used (with
    // RaffleDrawTiming.RevealGraceSeconds) to compute when chat should close
    // - replaces the old fixed-cadence estimate now that the admin paces
    // reveals manually and the gap between rounds is unbounded.
    public DateTime? LastRevealedAtUtc { get; set; }

    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Guards Raffle.Status transitions (ForceClose / Draw / Cancel / the
    // auto Open->ReadyToDraw flip on last seat paid) against a race between
    // two admin actions, or an admin action and the payment webhook.
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();

    public ICollection<RaffleSeat> Seats { get; set; } = new List<RaffleSeat>();
    public ICollection<RafflePrize> Prizes { get; set; } = new List<RafflePrize>();
}
