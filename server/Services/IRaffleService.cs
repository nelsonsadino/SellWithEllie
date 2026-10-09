using SellWithEllie.Dtos;

namespace SellWithEllie.Services;

public class RaffleActionResult
{
    public bool Success { get; init; }
    public string? ErrorMessage { get; init; }
    public RaffleDetailDto? Raffle { get; init; }

    public static RaffleActionResult Fail(string message) => new() { Success = false, ErrorMessage = message };
    public static RaffleActionResult Ok(RaffleDetailDto raffle) => new() { Success = true, Raffle = raffle };
}

public class SeatReservationResult
{
    public bool Success { get; init; }
    public string? ErrorMessage { get; init; }
    public OrderDto? Order { get; init; }

    public static SeatReservationResult Fail(string message) => new() { Success = false, ErrorMessage = message };
    public static SeatReservationResult Ok(OrderDto order) => new() { Success = true, Order = order };
}

public interface IRaffleService
{
    Task<RaffleActionResult> CreateRaffleAsync(CreateRaffleRequest request, string adminUserId);

    Task<SeatReservationResult> ReserveSeatsAsync(int raffleId, string userId, List<int> seatNumbers, string shippingName, string shippingAddress, string? returnUrlBase);

    Task<RaffleActionResult> MarkSeatPaidAsync(int raffleId, int seatId);

    Task<RaffleActionResult> ReleaseReservationAsync(int raffleId, int seatId);

    // Customer-facing self-service equivalent of ReleaseReservationAsync -
    // same order-granular release, but scoped to "must be my own
    // reservation" instead of admin-only. Addressed by orderId (not seatId)
    // since that's what the client already has from MyRaffleReservationDto.
    Task<RaffleActionResult> CancelMyReservationAsync(int raffleId, string userId, int orderId);

    Task<RaffleActionResult> ForceCloseAsync(int raffleId);

    // Undoes a ForceCloseAsync: only valid from ReadyToDraw, only when the
    // raffle hasn't been drawn - flips Forfeited seats back to Available and
    // the raffle back to Open, so admin can keep taking reservations/payments.
    Task<RaffleActionResult> ReopenAsync(int raffleId);

    // Computes and persists the full winner assignment for every prize
    // immediately (so it's locked in and a double-draw can't happen), but
    // reveals nothing yet - each prize's reveal is a separate, admin-
    // triggered step via RevealNextPrizeAsync below.
    Task<RaffleActionResult> DrawWinnerAsync(int raffleId);

    // Reveals the next not-yet-revealed prize (reveal order: lowest rank
    // first), broadcasting RoundStarted immediately and PrizeRevealed a few
    // seconds later for suspense. Fails if a reveal is already in flight or
    // every prize has already been revealed.
    Task<RaffleActionResult> RevealNextPrizeAsync(int raffleId);

    Task<RaffleActionResult> CancelRaffleAsync(int raffleId);

    // Called by PaymentsController after it flips an Order to Completed via
    // the Xendit webhook. No-ops if the order has no linked RaffleSeat rows
    // (an ordinary product order) - keeps PaymentsController decoupled from
    // raffle internals. Does NOT send an order-confirmation email - the
    // webhook handler already sent one before calling this.
    Task OnOrderPaidAsync(int orderId);

    // Called by PaymentsController after it flips an Order to Cancelled on
    // an EXPIRED/FAILED Xendit invoice. Releases any still-Reserved seats
    // back to Available, mirroring how the webhook already restores Product
    // stock on the same branch. No-ops if the order has no linked seats.
    Task OnOrderCancelledAsync(int orderId);
}
