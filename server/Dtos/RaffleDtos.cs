using System.ComponentModel.DataAnnotations;

namespace SellWithEllie.Dtos;

public class RafflePrizeDto
{
    public int Rank { get; set; }
    public string Description { get; set; } = string.Empty;
    public int? WinningSeatNumber { get; set; }
    public string? WinnerDisplayName { get; set; }
}

public class RaffleSummaryDto
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public int SeatCount { get; set; }
    public decimal SeatPrice { get; set; }
    public int AvailableSeatCount { get; set; }
    public int ReservedSeatCount { get; set; }
    public int PaidSeatCount { get; set; }
    public string Status { get; set; } = string.Empty;
    public string DrawMode { get; set; } = string.Empty;
    public DateTime? ScheduledDrawAtUtc { get; set; }
    public DateTime? DrawnAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public List<RafflePrizeDto> Prizes { get; set; } = new();

    // How many prizes have actually been revealed so far (reveal order,
    // lowest rank first) - drives "Nth prize up next" / "all done" UI
    // without the client having to infer it from which prizes carry a
    // winner (an unawarded prize never gets one, so that count alone can't
    // tell "not revealed yet" apart from "revealed as not awarded").
    public int RevealedPrizeCount { get; set; }
}

public class RaffleSeatDto
{
    public int Id { get; set; }
    public int SeatNumber { get; set; }
    public string Status { get; set; } = string.Empty;

    // True if the current caller (if any) reserved/paid this seat.
    public bool IsMine { get; set; }

    // Null for an Available/Forfeited seat - nobody to name. Already how
    // this app treats reserver identity elsewhere (a drawn raffle's prize
    // list names winners by display name to every visitor), so naming the
    // seat grid itself the same way is consistent, not a new exposure.
    public string? ReservedByDisplayName { get; set; }
}

public class MyRaffleReservationDto
{
    public int OrderId { get; set; }
    public List<int> SeatNumbers { get; set; } = new();
    public decimal TotalAmount { get; set; }
    public string OrderStatus { get; set; } = string.Empty;
    public string? PaymentUrl { get; set; }
}

public class RaffleDetailDto : RaffleSummaryDto
{
    public List<RaffleSeatDto> Seats { get; set; } = new();
    public List<MyRaffleReservationDto> MyReservations { get; set; } = new();
}

public class CreatePrizeRequest
{
    [Required, StringLength(500)]
    public string Description { get; set; } = string.Empty;
}

public class CreateRaffleRequest
{
    [Required, StringLength(150)]
    public string Title { get; set; } = string.Empty;

    [StringLength(500)]
    public string? ImageUrl { get; set; }

    [Range(2, 2000)]
    public int SeatCount { get; set; }

    [Range(0.01, 1000000)]
    public decimal SeatPrice { get; set; }

    [Required, MinLength(1), MaxLength(50)]
    public List<CreatePrizeRequest> Prizes { get; set; } = new();

    // "Instant" | "Wheel" | "DuckRace" | "LastManStanding", parsed via
    // Enum.TryParse in RaffleService.CreateRaffleAsync - same string+
    // TryParse convention already used for ?status= on GET /api/raffles.
    // Defaults to Instant if omitted/unrecognized.
    public string? DrawMode { get; set; }

    public DateTime? ScheduledDrawAtUtc { get; set; }
}

public class ReserveSeatsRequest
{
    [Required, MinLength(1)]
    public List<int> SeatNumbers { get; set; } = new();

    [Required, StringLength(150)]
    public string ShippingName { get; set; } = string.Empty;

    [Required, StringLength(300)]
    public string ShippingAddress { get; set; } = string.Empty;

    [StringLength(300)]
    public string? ReturnUrlBase { get; set; }
}
