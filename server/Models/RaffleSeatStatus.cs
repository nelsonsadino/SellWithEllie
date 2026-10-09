namespace SellWithEllie.Models;

public enum RaffleSeatStatus
{
    Available = 0,
    Reserved = 1,
    Paid = 2,

    // Terminal: was Available/Reserved when the raffle was force-closed or
    // cancelled. Permanently excluded from the draw pool.
    Forfeited = 3
}
