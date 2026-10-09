using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SellWithEllie.Config;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Hubs;
using SellWithEllie.Mapping;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

[Route("api/[controller]")]
public class RafflesController : TenantScopedControllerBase
{
    // Same rationale as AuctionsController: a live raffle-room chat, not a
    // permanent message archive.
    private const int ChatHistoryLimit = 200;

    private readonly ApplicationDbContext _db;
    private readonly IRaffleService _raffleService;
    private readonly IHubContext<RaffleHub> _hub;
    private readonly IProfanityFilterService _profanityFilter;
    private readonly IChatRateLimiter _rateLimiter;
    private readonly IAuditLogService _auditLog;
    private readonly IOutputCacheStore _outputCache;
    private readonly string _authRefSalt;

    public RafflesController(
        ApplicationDbContext db,
        IRaffleService raffleService,
        IHubContext<RaffleHub> hub,
        IProfanityFilterService profanityFilter,
        IChatRateLimiter rateLimiter,
        IAuditLogService auditLog,
        IOutputCacheStore outputCache,
        IOptions<JwtSettings> jwtOptions,
        ITenantContext tenantContext) : base(tenantContext)
    {
        _db = db;
        _raffleService = raffleService;
        _hub = hub;
        _profanityFilter = profanityFilter;
        _rateLimiter = rateLimiter;
        _auditLog = auditLog;
        _outputCache = outputCache;
        _authRefSalt = jwtOptions.Value.Key;
    }

    private static IQueryable<Raffle> IncludeDetail(IQueryable<Raffle> query) => query
        .Include(r => r.Prizes).ThenInclude(p => p.WinningSeat).ThenInclude(s => s!.ReservedByUser);

    [HttpGet]
    [OutputCache(PolicyName = "PublicCatalog")]
    public async Task<ActionResult<List<RaffleSummaryDto>>> GetRaffles([FromQuery] string? status)
    {
        var query = IncludeDetail(_db.Raffles.Include(r => r.Seats)).AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<RaffleStatus>(status, true, out var parsedStatus))
        {
            query = query.Where(r => r.Status == parsedStatus);
        }

        var raffles = await query.OrderByDescending(r => r.CreatedAtUtc).ToListAsync();
        return Ok(raffles.Select(r => r.ToSummaryDto()).ToList());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<RaffleDetailDto>> GetRaffle(int id)
    {
        var raffle = await IncludeDetail(_db.Raffles
                .Include(r => r.Seats).ThenInclude(s => s.ReservedByUser)
                .Include(r => r.Seats).ThenInclude(s => s.Order))
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id);

        if (raffle is null) return NotFound();

        var callerUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Ok(raffle.ToDetailDto(callerUserId));
    }

    [HttpPost]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<RaffleDetailDto>> CreateRaffle(CreateRaffleRequest request)
    {
        if (TenantContext.Tenant!.Plan == PlanTier.Free)
        {
            var activeRaffleCount = await _db.Raffles.CountAsync(r =>
                r.Status == RaffleStatus.Open || r.Status == RaffleStatus.ReadyToDraw);
            if (activeRaffleCount >= PlanLimits.FreeMaxActiveRaffles)
            {
                return StatusCode(StatusCodes.Status402PaymentRequired, new
                {
                    message = $"The Free plan allows up to {PlanLimits.FreeMaxActiveRaffles} active raffles at a time. Upgrade to Pro for more."
                });
            }
        }

        var adminId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        var result = await _raffleService.CreateRaffleAsync(request, adminId);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Raffle.Create", "Raffle", result.Raffle!.Id.ToString(), result.Raffle.Title);

        return CreatedAtAction(nameof(GetRaffle), new { id = result.Raffle.Id }, result.Raffle);
    }

    [HttpPost("{id:int}/reserve")]
    [Authorize]
    public async Task<ActionResult<OrderDto>> ReserveSeats(int id, ReserveSeatsRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var result = await _raffleService.ReserveSeatsAsync(
            id, userId, request.SeatNumbers, request.ShippingName, request.ShippingAddress, request.ReturnUrlBase);

        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        return Ok(result.Order);
    }

    [HttpPost("{id:int}/seats/{seatId:int}/mark-paid")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<RaffleDetailDto>> MarkSeatPaid(int id, int seatId)
    {
        var result = await _raffleService.MarkSeatPaidAsync(id, seatId);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        await _auditLog.LogAsync(User, "Raffle.MarkSeatPaid", "Raffle", id.ToString(), $"seat {seatId}");
        return Ok(result.Raffle);
    }

    [HttpPost("{id:int}/seats/{seatId:int}/release")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<RaffleDetailDto>> ReleaseSeat(int id, int seatId)
    {
        var result = await _raffleService.ReleaseReservationAsync(id, seatId);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        await _auditLog.LogAsync(User, "Raffle.ReleaseSeat", "Raffle", id.ToString(), $"seat {seatId}");
        return Ok(result.Raffle);
    }

    [HttpPost("{id:int}/reservations/{orderId:int}/cancel")]
    [Authorize]
    public async Task<ActionResult<RaffleDetailDto>> CancelMyReservation(int id, int orderId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var result = await _raffleService.CancelMyReservationAsync(id, userId, orderId);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        return Ok(result.Raffle);
    }

    [HttpPost("{id:int}/reopen")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<RaffleDetailDto>> Reopen(int id)
    {
        var result = await _raffleService.ReopenAsync(id);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Raffle.Reopen", "Raffle", id.ToString());
        return Ok(result.Raffle);
    }

    [HttpPost("{id:int}/force-close")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<RaffleDetailDto>> ForceClose(int id)
    {
        var result = await _raffleService.ForceCloseAsync(id);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Raffle.ForceClose", "Raffle", id.ToString());
        return Ok(result.Raffle);
    }

    [HttpPost("{id:int}/draw")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<RaffleDetailDto>> Draw(int id)
    {
        var result = await _raffleService.DrawWinnerAsync(id);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Raffle.Draw", "Raffle", id.ToString(),
            $"winners computed ({result.Raffle!.Prizes.Count} prize(s), mode {result.Raffle.DrawMode}) - reveal pending");
        return Ok(result.Raffle);
    }

    // Reveals one prize at a time - the admin calls this once per prize,
    // whenever they're ready for the next "race", instead of the server
    // auto-cascading through all of them on a fixed timer.
    [HttpPost("{id:int}/draw/reveal-next")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<RaffleDetailDto>> RevealNext(int id)
    {
        var result = await _raffleService.RevealNextPrizeAsync(id);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Raffle.RevealNext", "Raffle", id.ToString());
        return Ok(result.Raffle);
    }

    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<RaffleDetailDto>> Cancel(int id)
    {
        var result = await _raffleService.CancelRaffleAsync(id);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Raffle.Cancel", "Raffle", id.ToString());
        return Ok(result.Raffle);
    }

    // ---- Live chat ---------------------------------------------------
    //
    // Verbatim mirror of AuctionsController's chat endpoints - REST for
    // sending, broadcast via the same SignalR group ("raffle-{tenantId}-
    // {raffleId}") seat updates already use.

    [HttpGet("{id:int}/chat")]
    public async Task<ActionResult<ChatHistoryDto>> GetChatMessages(int id)
    {
        var raffleExists = await _db.Raffles.AnyAsync(r => r.Id == id);
        if (!raffleExists) return NotFound();

        var messages = await _db.ChatMessages
            .Include(m => m.User)
            .Where(m => m.RaffleId == id)
            .OrderByDescending(m => m.SentAtUtc)
            .Take(ChatHistoryLimit)
            .AsNoTracking()
            .ToListAsync();

        messages.Reverse();

        var isAdminCaller = User.IsInRole(ApplicationDbContext.AdminRole);
        var me = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var adminUserIds = await GetAdminUserIdsAsync(messages.Select(m => m.UserId));

        return Ok(new ChatHistoryDto
        {
            Messages = messages
                .Select(m => m.ToDto(adminUserIds.Contains(m.UserId), _authRefSalt, includeUserId: isAdminCaller))
                .ToList(),
            MyAuthorRef = string.IsNullOrEmpty(me) ? string.Empty : ChatAuthorRef.For(_authRefSalt, "raffle", id, me)
        });
    }

    [HttpPost("{id:int}/chat")]
    [Authorize]
    public async Task<ActionResult<ChatMessageDto>> SendChatMessage(int id, SendChatMessageRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var raffle = await _db.Raffles.Include(r => r.Prizes).FirstOrDefaultAsync(r => r.Id == id);
        if (raffle is null) return NotFound();

        // The admin now paces reveals manually (one prize at a time, no
        // fixed cadence), so "drawn + prizeCount * RevealStepSeconds" is no
        // longer a valid estimate of when the sequence finishes. Chat stays
        // open through the whole live reveal and only closes once every
        // prize has actually been revealed, plus a short grace period after
        // the last one.
        var allPrizesRevealed = raffle.Prizes.Count > 0 && raffle.RevealedPrizeCount >= raffle.Prizes.Count;
        var chatClosed = raffle.Status == RaffleStatus.Cancelled
            || (raffle.Status == RaffleStatus.Drawn
                && allPrizesRevealed
                && raffle.LastRevealedAtUtc is not null
                && DateTime.UtcNow > raffle.LastRevealedAtUtc.Value.AddSeconds(RaffleDrawTiming.RevealGraceSeconds));
        if (chatClosed)
        {
            return BadRequest(new { message = "Chat is closed for this raffle." });
        }

        var isBlocked = await _db.ChatBlockedUsers.AnyAsync(b => b.UserId == userId);
        if (isBlocked)
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new { message = "You've been blocked from chat in this shop." });
        }

        var rateLimitError = _rateLimiter.CheckAndRecord(userId);
        if (rateLimitError is not null)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new { message = rateLimitError });
        }

        var trimmed = request.Content.Trim();
        if (trimmed.Length == 0)
        {
            return BadRequest(new { message = "Message can't be empty." });
        }

        var (filtered, wasFiltered) = _profanityFilter.Filter(trimmed);

        var message = new ChatMessage
        {
            RaffleId = id,
            UserId = userId,
            Content = filtered,
            WasFiltered = wasFiltered,
            SentAtUtc = DateTime.UtcNow
        };

        _db.ChatMessages.Add(message);
        await _db.SaveChangesAsync();

        var savedMessage = await _db.ChatMessages.Include(m => m.User).FirstAsync(m => m.Id == message.Id);
        var isAdmin = (await GetAdminUserIdsAsync(new[] { userId })).Contains(userId);
        var dto = savedMessage.ToDto(isAdmin, _authRefSalt, includeUserId: false);

        await _hub.Clients.Group(RaffleHub.GroupName(raffle.TenantId, id)).SendAsync("ChatMessageReceived", dto);

        return Ok(dto);
    }

    // Cross-references a batch of user ids against the Identity "Admin" role
    // in one query - identical to AuctionsController's helper of the same
    // name/shape.
    private async Task<HashSet<string>> GetAdminUserIdsAsync(IEnumerable<string> userIds)
    {
        var idSet = userIds.Distinct().ToList();
        if (idSet.Count == 0) return new HashSet<string>();

        var adminIds = await _db.UserRoles
            .Join(_db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { ur.UserId, r.Name })
            .Where(x => idSet.Contains(x.UserId) && x.Name == ApplicationDbContext.AdminRole)
            .Select(x => x.UserId)
            .ToListAsync();

        return adminIds.ToHashSet();
    }
}
