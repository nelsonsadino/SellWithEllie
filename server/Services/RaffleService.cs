using System.Security.Cryptography;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Hubs;
using SellWithEllie.Mapping;
using SellWithEllie.Models;

namespace SellWithEllie.Services;

// Seat reservation is the raffle equivalent of AuctionService's bid
// placement: N seats are independently contested resources, so each
// RaffleSeat carries its own RowVersion (unlike Auction, where the single
// contested resource - current price - lives on the parent row). Every
// mutation here follows the same shape: load tracked -> validate against
// the in-memory snapshot -> mutate -> one SaveChangesAsync wrapped in
// try/catch(DbUpdateConcurrencyException), returning a Fail result on a
// lost race rather than silently overwriting someone else's claim.
public class RaffleService : IRaffleService
{
    private readonly ApplicationDbContext _db;
    private readonly IHubContext<RaffleHub> _hub;
    private readonly IEmailSender _emailSender;
    private readonly ITenantPaymentService _payments;
    private readonly IReturnUrlValidator _returnUrlValidator;
    private readonly ITenantContext _tenantContext;
    private readonly ILogger<RaffleService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public RaffleService(
        ApplicationDbContext db,
        IHubContext<RaffleHub> hub,
        IEmailSender emailSender,
        ITenantPaymentService payments,
        IReturnUrlValidator returnUrlValidator,
        ITenantContext tenantContext,
        ILogger<RaffleService> logger,
        IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _hub = hub;
        _emailSender = emailSender;
        _payments = payments;
        _returnUrlValidator = returnUrlValidator;
        _tenantContext = tenantContext;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    public async Task<RaffleActionResult> CreateRaffleAsync(CreateRaffleRequest request, string adminUserId)
    {
        var now = DateTime.UtcNow;
        var drawMode = Enum.TryParse<RaffleDrawMode>(request.DrawMode, true, out var parsedMode)
            ? parsedMode
            : RaffleDrawMode.Instant;

        var raffle = new Raffle
        {
            Title = request.Title,
            ImageUrl = request.ImageUrl,
            SeatCount = request.SeatCount,
            SeatPrice = request.SeatPrice,
            Status = RaffleStatus.Open,
            DrawMode = drawMode,
            ScheduledDrawAtUtc = request.ScheduledDrawAtUtc,
            CreatedByUserId = adminUserId,
            CreatedAtUtc = now
        };

        for (var i = 1; i <= request.SeatCount; i++)
        {
            raffle.Seats.Add(new RaffleSeat { SeatNumber = i, Status = RaffleSeatStatus.Available });
        }

        for (var i = 0; i < request.Prizes.Count; i++)
        {
            raffle.Prizes.Add(new RafflePrize { Rank = i + 1, Description = request.Prizes[i].Description });
        }

        _db.Raffles.Add(raffle);
        await _db.SaveChangesAsync();

        return RaffleActionResult.Ok(await LoadDetailDtoAsync(raffle.Id, null));
    }

    public async Task<SeatReservationResult> ReserveSeatsAsync(
        int raffleId, string userId, List<int> seatNumbers, string shippingName, string shippingAddress, string? returnUrlBase)
    {
        var distinctSeatNumbers = (seatNumbers ?? new List<int>()).Distinct().ToList();
        if (distinctSeatNumbers.Count == 0)
        {
            return SeatReservationResult.Fail("Pick at least one seat.");
        }

        var raffle = await _db.Raffles.FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return SeatReservationResult.Fail("Raffle not found.");
        if (raffle.Status != RaffleStatus.Open)
        {
            return SeatReservationResult.Fail("This raffle is not currently accepting reservations.");
        }

        var seats = await _db.RaffleSeats
            .Where(s => s.RaffleId == raffleId && distinctSeatNumbers.Contains(s.SeatNumber))
            .ToListAsync();

        if (seats.Count != distinctSeatNumbers.Count)
        {
            return SeatReservationResult.Fail("One or more selected seats don't exist.");
        }

        if (seats.Any(s => s.Status != RaffleSeatStatus.Available))
        {
            return SeatReservationResult.Fail(
                "One or more of the seats you picked are no longer available. Please refresh and pick again.");
        }

        var tenant = _tenantContext.Tenant!;
        var payWithXendit = _payments.IsConnected(tenant);
        var now = DateTime.UtcNow;

        // Always AwaitingPayment - deliberately does NOT follow
        // CartController.Checkout's auto-complete-when-no-Xendit shortcut,
        // since "pay later" for a raffle must hold even without a gateway
        // (the admin marks it paid manually instead).
        var order = new Order
        {
            UserId = userId,
            OrderDateUtc = now,
            ShippingName = shippingName,
            ShippingAddress = shippingAddress,
            Status = OrderStatus.AwaitingPayment,
            PaymentProvider = payWithXendit ? "xendit" : "manual",
            TotalAmount = raffle.SeatPrice * seats.Count
        };

        foreach (var seat in seats.OrderBy(s => s.SeatNumber))
        {
            order.Items.Add(new OrderItem
            {
                ProductId = 0,
                ProductName = $"Seat #{seat.SeatNumber} – {raffle.Title}",
                PriceAtPurchase = raffle.SeatPrice,
                Quantity = 1
            });
        }

        _db.Orders.Add(order);

        foreach (var seat in seats)
        {
            seat.Status = RaffleSeatStatus.Reserved;
            seat.ReservedByUserId = userId;
            seat.ReservedAtUtc = now;
            seat.Order = order;
        }

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _logger.LogInformation("Seat reservation on raffle {RaffleId} lost a concurrency race and was rejected.", raffleId);
            return SeatReservationResult.Fail(
                "One or more of the seats you picked were just reserved by someone else. Please refresh and pick again.");
        }

        if (payWithXendit)
        {
            // Same reasoning as CartController.Checkout - only honor
            // returnUrlBase if it's actually this tenant's own storefront
            // host, otherwise Xendit would redirect a paying customer's
            // browser to an attacker-controlled page right after a real
            // transaction completes.
            var baseUrl = _returnUrlValidator.IsValidForTenant(returnUrlBase, tenant)
                ? returnUrlBase!.TrimEnd('/')
                : string.Empty;
            try
            {
                var customerEmail = (await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId))?.Email ?? string.Empty;
                var invoice = await _payments.CreateInvoiceAsync(
                    tenant,
                    order.Id,
                    order.TotalAmount,
                    customerEmail: customerEmail,
                    description: $"{raffle.Title} – {seats.Count} seat(s) at {tenant.Name}",
                    successUrl: string.IsNullOrEmpty(baseUrl) ? "" : $"{baseUrl}/orders/{order.Id}?paid=1",
                    failureUrl: string.IsNullOrEmpty(baseUrl) ? "" : $"{baseUrl}/orders/{order.Id}?payment=failed");

                order.PaymentReference = invoice.InvoiceId;
                order.PaymentUrl = invoice.InvoiceUrl;
                await _db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Xendit invoice creation failed for raffle order {OrderId} (tenant {TenantId}).", order.Id, tenant.Id);

                foreach (var seat in seats)
                {
                    seat.Status = RaffleSeatStatus.Available;
                    seat.ReservedByUserId = null;
                    seat.ReservedAtUtc = null;
                    seat.OrderId = null;
                }
                order.Status = OrderStatus.Cancelled;
                await _db.SaveChangesAsync();

                return SeatReservationResult.Fail("Could not start payment with the shop's payment provider. Please try again.");
            }
        }

        var savedOrder = await _db.Orders
            .Include(o => o.Items)
            .Include(o => o.User)
            .AsNoTracking()
            .FirstAsync(o => o.Id == order.Id);

        await _hub.Clients.Group(RaffleHub.GroupName(raffle.TenantId, raffleId)).SendAsync("SeatsReserved", new
        {
            raffleId,
            seatNumbers = seats.Select(s => s.SeatNumber).ToList()
        });

        return SeatReservationResult.Ok(savedOrder.ToDto());
    }

    public async Task<RaffleActionResult> MarkSeatPaidAsync(int raffleId, int seatId)
    {
        var raffle = await _db.Raffles.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return RaffleActionResult.Fail("Raffle not found.");

        var seat = raffle.Seats.FirstOrDefault(s => s.Id == seatId);
        if (seat is null) return RaffleActionResult.Fail("Seat not found.");
        if (seat.Status != RaffleSeatStatus.Reserved)
        {
            return RaffleActionResult.Fail("This seat isn't awaiting payment.");
        }

        var siblingSeats = raffle.Seats.Where(s => s.OrderId == seat.OrderId).ToList();
        var order = await _db.Orders.Include(o => o.Items).Include(o => o.User).FirstOrDefaultAsync(o => o.Id == seat.OrderId);
        if (order is null) return RaffleActionResult.Fail("The order behind this seat could not be found.");

        var now = DateTime.UtcNow;
        foreach (var s in siblingSeats)
        {
            s.Status = RaffleSeatStatus.Paid;
            s.PaidAtUtc = now;
        }
        order.Status = OrderStatus.Completed;

        var allPaid = raffle.Seats.All(s => s.Status == RaffleSeatStatus.Paid);
        if (allPaid) raffle.Status = RaffleStatus.ReadyToDraw;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return RaffleActionResult.Fail("This seat was just updated elsewhere. Please refresh and try again.");
        }

        // Best-effort - a slow/unavailable mail server should never affect
        // whether the mark-paid action succeeds. Silently no-ops if Email
        // isn't configured. (This is the admin-manual path, so unlike
        // OnOrderPaidAsync below, no confirmation email has been sent yet.)
        var (subject, html) = EmailTemplates.OrderConfirmation(
            order.User?.DisplayName ?? "there",
            _tenantContext.Tenant?.Name ?? "the shop",
            order.Id,
            order.TotalAmount,
            order.Items.Select(i => i.ProductName));
        await _emailSender.SendAsync(order.User?.Email ?? string.Empty, order.User?.DisplayName ?? "there", subject, html);

        var groupName = RaffleHub.GroupName(raffle.TenantId, raffleId);
        await _hub.Clients.Group(groupName).SendAsync("SeatsPaid", new
        {
            raffleId,
            seatNumbers = siblingSeats.Select(s => s.SeatNumber).ToList()
        });
        if (allPaid)
        {
            await _hub.Clients.Group(groupName).SendAsync("RaffleReadyToDraw", new { raffleId });
        }

        return RaffleActionResult.Ok(await LoadDetailDtoAsync(raffleId, null));
    }

    public async Task<RaffleActionResult> ReleaseReservationAsync(int raffleId, int seatId)
    {
        var raffle = await _db.Raffles.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return RaffleActionResult.Fail("Raffle not found.");
        if (raffle.Status != RaffleStatus.Open)
        {
            return RaffleActionResult.Fail("Reservations can only be released while the raffle is open.");
        }

        var seat = raffle.Seats.FirstOrDefault(s => s.Id == seatId);
        if (seat is null) return RaffleActionResult.Fail("Seat not found.");
        if (seat.Status != RaffleSeatStatus.Reserved)
        {
            return RaffleActionResult.Fail("This seat isn't currently reserved.");
        }

        return await ReleaseSeatGroupAsync(raffle, seat);
    }

    public async Task<RaffleActionResult> CancelMyReservationAsync(int raffleId, string userId, int orderId)
    {
        var raffle = await _db.Raffles.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return RaffleActionResult.Fail("Raffle not found.");
        if (raffle.Status != RaffleStatus.Open)
        {
            return RaffleActionResult.Fail("Reservations can only be cancelled while the raffle is open.");
        }

        var seat = raffle.Seats.FirstOrDefault(s => s.OrderId == orderId && s.Status == RaffleSeatStatus.Reserved);
        if (seat is null || seat.ReservedByUserId != userId)
        {
            return RaffleActionResult.Fail("This isn't one of your active reservations.");
        }

        return await ReleaseSeatGroupAsync(raffle, seat);
    }

    // Shared by the admin release action and the customer self-service
    // cancel - both end up doing the identical order-granular release, they
    // just differ in who's allowed to call it and how the seat is looked up.
    private async Task<RaffleActionResult> ReleaseSeatGroupAsync(Raffle raffle, RaffleSeat seat)
    {
        var siblingSeats = raffle.Seats.Where(s => s.OrderId == seat.OrderId).ToList();
        var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == seat.OrderId);

        foreach (var s in siblingSeats)
        {
            s.Status = RaffleSeatStatus.Available;
            s.ReservedByUserId = null;
            s.ReservedAtUtc = null;
            s.OrderId = null;
        }
        if (order is not null) order.Status = OrderStatus.Cancelled;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return RaffleActionResult.Fail("This seat was just updated elsewhere. Please refresh and try again.");
        }

        await _hub.Clients.Group(RaffleHub.GroupName(raffle.TenantId, raffle.Id)).SendAsync("SeatsReleased", new
        {
            raffleId = raffle.Id,
            seatNumbers = siblingSeats.Select(s => s.SeatNumber).ToList()
        });

        return RaffleActionResult.Ok(await LoadDetailDtoAsync(raffle.Id, null));
    }

    public async Task<RaffleActionResult> ReopenAsync(int raffleId)
    {
        var raffle = await _db.Raffles.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return RaffleActionResult.Fail("Raffle not found.");
        if (raffle.Status != RaffleStatus.ReadyToDraw)
        {
            return RaffleActionResult.Fail("Only a raffle that's ready to draw can be reopened.");
        }

        // Reopen only makes sense as the undo of a prior ForceCloseAsync -
        // it hands Forfeited seats back to Available. If there are none,
        // this raffle reached ReadyToDraw the natural way (every seat sold
        // and paid), and reopening would just strand it in Open with zero
        // Available/Reserved seats: nothing left to reserve, nothing left
        // to mark paid, and no path back to ReadyToDraw. Caught in QA
        // testing - refuse instead of silently creating that dead end.
        var forfeitedSeats = raffle.Seats.Where(s => s.Status == RaffleSeatStatus.Forfeited).ToList();
        if (forfeitedSeats.Count == 0)
        {
            return RaffleActionResult.Fail(
                "There's nothing to reopen - every seat in this raffle is already paid. Draw a winner, or cancel individual seats' orders directly if you need to undo a sale.");
        }

        foreach (var seat in forfeitedSeats)
        {
            seat.Status = RaffleSeatStatus.Available;
        }
        raffle.Status = RaffleStatus.Open;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return RaffleActionResult.Fail("This raffle was just updated elsewhere. Please refresh and try again.");
        }

        await _hub.Clients.Group(RaffleHub.GroupName(raffle.TenantId, raffleId)).SendAsync("RaffleReopened", new { raffleId });

        return RaffleActionResult.Ok(await LoadDetailDtoAsync(raffleId, null));
    }

    public async Task<RaffleActionResult> ForceCloseAsync(int raffleId)
    {
        var raffle = await _db.Raffles.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return RaffleActionResult.Fail("Raffle not found.");
        if (raffle.Status != RaffleStatus.Open) return RaffleActionResult.Fail("This raffle is not open.");

        var forfeitedSeatNumbers = new List<int>();
        var orderIdsToCancel = new HashSet<int>();

        foreach (var seat in raffle.Seats)
        {
            if (seat.Status is RaffleSeatStatus.Available or RaffleSeatStatus.Reserved)
            {
                if (seat.Status == RaffleSeatStatus.Reserved && seat.OrderId.HasValue)
                {
                    orderIdsToCancel.Add(seat.OrderId.Value);
                }
                seat.Status = RaffleSeatStatus.Forfeited;
                forfeitedSeatNumbers.Add(seat.SeatNumber);
            }
        }

        if (orderIdsToCancel.Count > 0)
        {
            var orders = await _db.Orders.Where(o => orderIdsToCancel.Contains(o.Id)).ToListAsync();
            foreach (var order in orders) order.Status = OrderStatus.Cancelled;
        }

        raffle.Status = RaffleStatus.ReadyToDraw;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return RaffleActionResult.Fail("This raffle was just updated elsewhere. Please refresh and try again.");
        }

        await _hub.Clients.Group(RaffleHub.GroupName(raffle.TenantId, raffleId)).SendAsync("RaffleForceClosed", new
        {
            raffleId,
            forfeitedSeatNumbers
        });

        return RaffleActionResult.Ok(await LoadDetailDtoAsync(raffleId, null));
    }

    // Instant and Wheel produce the same kind of assignment this pass -
    // sequential unique random picks without replacement. They're kept as
    // separate DrawMode values because a future animation pass frames them
    // differently on the client (Wheel = pool visibly shrinking one spin at
    // a time; Instant = no visible mechanism), not because the math differs
    // today.
    private static List<(int Rank, RaffleSeat? Seat)> AssignBySequentialDraw(
        List<RafflePrize> prizesByRank, List<RaffleSeat> paidSeats)
    {
        var remaining = new List<RaffleSeat>(paidSeats);
        var result = new List<(int, RaffleSeat?)>();
        foreach (var prize in prizesByRank)
        {
            if (remaining.Count == 0) { result.Add((prize.Rank, null)); continue; }
            var idx = RandomNumberGenerator.GetInt32(remaining.Count);
            result.Add((prize.Rank, remaining[idx]));
            remaining.RemoveAt(idx);
        }
        return result;
    }

    // DuckRace and LastManStanding are also the same algorithm this pass -
    // one full random ranking of the pool, top-N mapped to prize ranks.
    // "Finish order" and "elimination order" are the same ranking read two
    // different directions conceptually; they only diverge once a future
    // pass adds actual race/elimination animation.
    private static List<(int Rank, RaffleSeat? Seat)> AssignByFullShuffle(
        List<RafflePrize> prizesByRank, List<RaffleSeat> paidSeats)
    {
        var shuffled = CryptoShuffle(paidSeats);
        var result = new List<(int, RaffleSeat?)>();
        for (var i = 0; i < prizesByRank.Count; i++)
        {
            result.Add((prizesByRank[i].Rank, i < shuffled.Count ? shuffled[i] : null));
        }
        return result;
    }

    private static List<T> CryptoShuffle<T>(List<T> items)
    {
        var list = new List<T>(items);
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
        return list;
    }

    public async Task<RaffleActionResult> DrawWinnerAsync(int raffleId)
    {
        var raffle = await _db.Raffles.Include(r => r.Seats).Include(r => r.Prizes)
            .FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return RaffleActionResult.Fail("Raffle not found.");
        if (raffle.Status != RaffleStatus.ReadyToDraw)
        {
            return RaffleActionResult.Fail("This raffle isn't ready to draw yet.");
        }

        var paidSeats = raffle.Seats.Where(s => s.Status == RaffleSeatStatus.Paid).ToList();
        if (paidSeats.Count == 0) return RaffleActionResult.Fail("No paid seats to draw from.");

        var prizesByRank = raffle.Prizes.OrderBy(p => p.Rank).ToList();
        if (prizesByRank.Count == 0) return RaffleActionResult.Fail("This raffle has no prizes configured.");

        var assignment = raffle.DrawMode switch
        {
            RaffleDrawMode.Instant or RaffleDrawMode.Wheel => AssignBySequentialDraw(prizesByRank, paidSeats),
            RaffleDrawMode.DuckRace or RaffleDrawMode.LastManStanding => AssignByFullShuffle(prizesByRank, paidSeats),
            _ => AssignBySequentialDraw(prizesByRank, paidSeats)
        };

        foreach (var prize in prizesByRank)
        {
            var seat = assignment.FirstOrDefault(a => a.Rank == prize.Rank).Seat;
            prize.WinningSeatId = seat?.Id;
        }

        raffle.DrawnAtUtc = DateTime.UtcNow;
        raffle.Status = RaffleStatus.Drawn;
        raffle.RevealedPrizeCount = 0;
        raffle.RevealInProgress = false;
        raffle.LastRevealedAtUtc = null;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return RaffleActionResult.Fail("This raffle was just updated elsewhere. Please refresh and try again.");
        }

        // Every winner is already decided and persisted above - only the
        // reveal is still pending, one prize at a time via
        // RevealNextPrizeAsync, whenever the admin is ready for it.
        await _hub.Clients.Group(RaffleHub.GroupName(raffle.TenantId, raffleId))
            .SendAsync("RaffleDrawStarted", new { raffleId, prizeCount = prizesByRank.Count });

        return RaffleActionResult.Ok(await LoadDetailDtoAsync(raffleId, null));
    }

    public async Task<RaffleActionResult> RevealNextPrizeAsync(int raffleId)
    {
        var raffle = await _db.Raffles.Include(r => r.Prizes).FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return RaffleActionResult.Fail("Raffle not found.");
        if (raffle.Status != RaffleStatus.Drawn)
        {
            return RaffleActionResult.Fail("This raffle hasn't been drawn yet.");
        }
        if (raffle.RevealInProgress)
        {
            return RaffleActionResult.Fail("A prize reveal is already in progress.");
        }

        // Reveal order matches MappingExtensions.ToSummaryDto's reveal-index
        // calculation: descending rank, lowest-prestige prize first.
        var orderedRanks = raffle.Prizes.OrderByDescending(p => p.Rank).Select(p => p.Rank).ToList();
        if (raffle.RevealedPrizeCount >= orderedRanks.Count)
        {
            return RaffleActionResult.Fail("All prizes have already been revealed.");
        }

        var rank = orderedRanks[raffle.RevealedPrizeCount];
        raffle.RevealInProgress = true;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return RaffleActionResult.Fail("This raffle was just updated elsewhere. Please refresh and try again.");
        }

        var tenantId = raffle.TenantId;
        var raffleTitle = raffle.Title;

        await _hub.Clients.Group(RaffleHub.GroupName(tenantId, raffleId))
            .SendAsync("RoundStarted", new { raffleId, rank });

        _ = Task.Run(() => RevealOnePrizeAsync(tenantId, raffleId, raffleTitle, rank));

        return RaffleActionResult.Ok(await LoadDetailDtoAsync(raffleId, null));
    }

    // Runs detached from the original HTTP request (already returned by the
    // time this executes), so it creates its own DI scope - mirrors
    // AuctionStatusBackgroundService's scope-per-operation pattern, since
    // none of the request-scoped _db/_hub/_emailSender instances are safe to
    // use here. A server restart/crash mid-reveal loses only that one
    // round's animation (RevealInProgress stays stuck true - an admin can
    // still re-trigger a fresh draw computation isn't needed, only a manual
    // DB nudge would unstick it today; acceptable for this pass since the
    // winner assignment itself was already persisted synchronously and
    // nothing is lost, just the live pacing of the one interrupted round).
    private async Task RevealOnePrizeAsync(int tenantId, int raffleId, string raffleTitle, int rank)
    {
        // The delay is the suspense - RoundStarted (spin/race animation) has
        // already gone out; this is when the result actually lands.
        await Task.Delay(TimeSpan.FromSeconds(RaffleDrawTiming.RevealStepSeconds));

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var hub = scope.ServiceProvider.GetRequiredService<IHubContext<RaffleHub>>();

        try
        {
            var emailSender = scope.ServiceProvider.GetRequiredService<IEmailSender>();

            var prize = await db.RafflePrizes.IgnoreQueryFilters()
                .Include(p => p.WinningSeat).ThenInclude(s => s!.ReservedByUser)
                .FirstOrDefaultAsync(p => p.RaffleId == raffleId && p.Rank == rank);
            var description = prize?.Description ?? string.Empty;
            var seat = prize?.WinningSeat;
            var winnerUser = seat?.ReservedByUser;

            var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId);

            await hub.Clients.Group(RaffleHub.GroupName(tenantId, raffleId)).SendAsync("PrizeRevealed", new
            {
                raffleId,
                rank,
                seatNumber = seat?.SeatNumber,
                winnerDisplayName = winnerUser?.DisplayName,
                description
            });

            if (winnerUser is not null)
            {
                var (subject, html) = EmailTemplates.RaffleWon(
                    winnerUser.DisplayName, tenant?.Name ?? "the shop", raffleTitle, description, seat!.SeatNumber, rank);
                await emailSender.SendAsync(winnerUser.Email ?? string.Empty, winnerUser.DisplayName, subject, html);
            }

            var freshRaffle = await db.Raffles.IgnoreQueryFilters().Include(r => r.Prizes)
                .FirstOrDefaultAsync(r => r.Id == raffleId);
            if (freshRaffle is not null)
            {
                freshRaffle.RevealedPrizeCount += 1;
                freshRaffle.RevealInProgress = false;
                freshRaffle.LastRevealedAtUtc = DateTime.UtcNow;
                var isLast = freshRaffle.RevealedPrizeCount >= freshRaffle.Prizes.Count;
                await db.SaveChangesAsync();

                if (isLast)
                {
                    await hub.Clients.Group(RaffleHub.GroupName(tenantId, raffleId)).SendAsync("RaffleDrawn", new { raffleId });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Reveal step failed for raffle {RaffleId}, rank {Rank}.", raffleId, rank);
            try
            {
                // Best-effort unstick - a failed reveal shouldn't permanently
                // block the admin from retrying the same rank.
                var freshRaffle = await db.Raffles.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == raffleId);
                if (freshRaffle is not null)
                {
                    freshRaffle.RevealInProgress = false;
                    await db.SaveChangesAsync();
                }
            }
            catch (Exception unstickEx)
            {
                _logger.LogError(unstickEx, "Failed to clear RevealInProgress for raffle {RaffleId} after a failed reveal.", raffleId);
            }
        }
    }

    public async Task<RaffleActionResult> CancelRaffleAsync(int raffleId)
    {
        var raffle = await _db.Raffles.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return RaffleActionResult.Fail("Raffle not found.");
        if (raffle.Status is RaffleStatus.Drawn or RaffleStatus.Cancelled)
        {
            return RaffleActionResult.Fail("This raffle has already ended.");
        }

        // No refund flow exists anywhere in this codebase - cancelling a
        // raffle that already collected money would leave paid customers
        // with no recorded path to a refund, so it's disallowed outright.
        if (raffle.Seats.Any(s => s.Status == RaffleSeatStatus.Paid))
        {
            return RaffleActionResult.Fail(
                "Cannot cancel a raffle with paid seats — force-close and draw instead, or contact paid customers directly.");
        }

        var orderIdsToCancel = raffle.Seats
            .Where(s => s.Status == RaffleSeatStatus.Reserved && s.OrderId.HasValue)
            .Select(s => s.OrderId!.Value)
            .Distinct()
            .ToList();

        foreach (var seat in raffle.Seats)
        {
            if (seat.Status is RaffleSeatStatus.Available or RaffleSeatStatus.Reserved)
            {
                seat.Status = RaffleSeatStatus.Forfeited;
            }
        }

        if (orderIdsToCancel.Count > 0)
        {
            var orders = await _db.Orders.Where(o => orderIdsToCancel.Contains(o.Id)).ToListAsync();
            foreach (var order in orders) order.Status = OrderStatus.Cancelled;
        }

        raffle.Status = RaffleStatus.Cancelled;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return RaffleActionResult.Fail("This raffle was just updated elsewhere. Please refresh and try again.");
        }

        await _hub.Clients.Group(RaffleHub.GroupName(raffle.TenantId, raffleId)).SendAsync("RaffleCancelled", new { raffleId });

        return RaffleActionResult.Ok(await LoadDetailDtoAsync(raffleId, null));
    }

    public async Task OnOrderPaidAsync(int orderId)
    {
        // A webhook request never resolves a tenant via subdomain/header, so
        // every query here must ignore the (null-tenant) global filter -
        // same reasoning as PaymentsController's own IgnoreQueryFilters use.
        var seats = await _db.RaffleSeats
            .IgnoreQueryFilters()
            .Where(s => s.OrderId == orderId && s.Status == RaffleSeatStatus.Reserved)
            .ToListAsync();

        if (seats.Count == 0) return; // not a raffle order, or already handled

        var raffleId = seats[0].RaffleId;
        var raffle = await _db.Raffles.IgnoreQueryFilters().Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return;

        var now = DateTime.UtcNow;
        foreach (var s in seats)
        {
            s.Status = RaffleSeatStatus.Paid;
            s.PaidAtUtc = now;
        }

        var allPaid = raffle.Seats.All(s => s.Status == RaffleSeatStatus.Paid);
        if (allPaid) raffle.Status = RaffleStatus.ReadyToDraw;

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _logger.LogWarning("OnOrderPaidAsync for order {OrderId} lost a concurrency race while flipping raffle seats.", orderId);
            return;
        }

        var groupName = RaffleHub.GroupName(raffle.TenantId, raffleId);
        await _hub.Clients.Group(groupName).SendAsync("SeatsPaid", new
        {
            raffleId,
            seatNumbers = seats.Select(s => s.SeatNumber).ToList()
        });
        if (allPaid)
        {
            await _hub.Clients.Group(groupName).SendAsync("RaffleReadyToDraw", new { raffleId });
        }
    }

    public async Task OnOrderCancelledAsync(int orderId)
    {
        var seats = await _db.RaffleSeats
            .IgnoreQueryFilters()
            .Where(s => s.OrderId == orderId && s.Status == RaffleSeatStatus.Reserved)
            .ToListAsync();

        if (seats.Count == 0) return; // not a raffle order, or nothing left to release

        var raffleId = seats[0].RaffleId;

        foreach (var s in seats)
        {
            s.Status = RaffleSeatStatus.Available;
            s.ReservedByUserId = null;
            s.ReservedAtUtc = null;
            s.OrderId = null;
        }

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _logger.LogWarning("OnOrderCancelledAsync for order {OrderId} lost a concurrency race while releasing raffle seats.", orderId);
            return;
        }

        var raffle = await _db.Raffles.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(r => r.Id == raffleId);
        if (raffle is null) return;

        await _hub.Clients.Group(RaffleHub.GroupName(raffle.TenantId, raffleId)).SendAsync("SeatsReleased", new
        {
            raffleId,
            seatNumbers = seats.Select(s => s.SeatNumber).ToList()
        });
    }

    private async Task<RaffleDetailDto> LoadDetailDtoAsync(int raffleId, string? callerUserId)
    {
        var raffle = await _db.Raffles
            .Include(r => r.Seats).ThenInclude(s => s.ReservedByUser)
            .Include(r => r.Seats).ThenInclude(s => s.Order)
            .Include(r => r.Prizes).ThenInclude(p => p.WinningSeat).ThenInclude(s => s!.ReservedByUser)
            .AsNoTracking()
            .FirstAsync(r => r.Id == raffleId);

        return raffle.ToDetailDto(callerUserId);
    }
}
