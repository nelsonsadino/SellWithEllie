namespace SellWithEllie.Models;

public class RaffleSeat : ITenantScoped
{
    public int Id { get; set; }
    public int TenantId { get; set; }

    public int RaffleId { get; set; }
    public Raffle? Raffle { get; set; }

    public int SeatNumber { get; set; } // 1-based, unique per raffle

    public RaffleSeatStatus Status { get; set; } = RaffleSeatStatus.Available;

    public string? ReservedByUserId { get; set; }
    public ApplicationUser? ReservedByUser { get; set; }
    public DateTime? ReservedAtUtc { get; set; }

    // The Order covering this reservation. One Order can cover several
    // seats reserved together in one action - order-granular, like OrderItem
    // rows under one Order today, just applied to seats.
    public int? OrderId { get; set; }
    public Order? Order { get; set; }

    public DateTime? PaidAtUtc { get; set; }

    // Per-seat concurrency token - N seats are independently contested
    // resources (unlike Auction's single current-price), so each seat
    // carries its own RowVersion rather than sharing the parent's.
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();
}
