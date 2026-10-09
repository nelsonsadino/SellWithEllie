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
public class AuctionsController : TenantScopedControllerBase
{
    // Chat messages are capped short and history is limited to the most
    // recent window - this is a live auction-room chat, not a permanent
    // message archive.
    private const int ChatHistoryLimit = 200;

    private readonly ApplicationDbContext _db;
    private readonly IAuctionService _auctionService;
    private readonly IHubContext<AuctionHub> _hub;
    private readonly IProfanityFilterService _profanityFilter;
    private readonly IChatRateLimiter _rateLimiter;
    private readonly IAuditLogService _auditLog;
    private readonly IOutputCacheStore _outputCache;
    private readonly string _authRefSalt;

    public AuctionsController(
        ApplicationDbContext db,
        IAuctionService auctionService,
        IHubContext<AuctionHub> hub,
        IProfanityFilterService profanityFilter,
        IChatRateLimiter rateLimiter,
        IAuditLogService auditLog,
        IOutputCacheStore outputCache,
        IOptions<JwtSettings> jwtOptions,
        ITenantContext tenantContext) : base(tenantContext)
    {
        _db = db;
        _auctionService = auctionService;
        _hub = hub;
        _profanityFilter = profanityFilter;
        _rateLimiter = rateLimiter;
        _auditLog = auditLog;
        _outputCache = outputCache;
        _authRefSalt = jwtOptions.Value.Key;
    }

    [HttpGet]
    [OutputCache(PolicyName = "PublicCatalog")]
    public async Task<ActionResult<List<AuctionSummaryDto>>> GetAuctions([FromQuery] string? status)
    {
        var query = _db.Auctions.Include(a => a.Product).Include(a => a.Bids).AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<AuctionStatus>(status, true, out var parsedStatus))
        {
            query = query.Where(a => a.Status == parsedStatus);
        }

        var auctions = await query.OrderBy(a => a.EndTimeUtc).ToListAsync();
        return Ok(auctions.Select(a => a.ToSummaryDto()).ToList());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AuctionDetailDto>> GetAuction(int id)
    {
        var auction = await _db.Auctions
            .Include(a => a.Product)
            .Include(a => a.CurrentHighestBid).ThenInclude(b => b!.User)
            .Include(a => a.Bids).ThenInclude(b => b.User)
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id);

        return auction is null ? NotFound() : Ok(auction.ToDetailDto());
    }

    [HttpPost]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<ActionResult<AuctionDetailDto>> CreateAuction(CreateAuctionRequest request)
    {
        if (request.EndTimeUtc <= request.StartTimeUtc)
        {
            return BadRequest(new { message = "End time must be after the start time." });
        }

        if (request.EndTimeUtc <= DateTime.UtcNow)
        {
            return BadRequest(new { message = "End time must be in the future." });
        }

        if (request.BuyoutPrice.HasValue && request.BuyoutPrice.Value <= request.StartingPrice)
        {
            return BadRequest(new { message = "Buyout price must be higher than the starting price." });
        }

        var product = await _db.Products.Include(p => p.Auction).FirstOrDefaultAsync(p => p.Id == request.ProductId);
        if (product is null)
        {
            return NotFound(new { message = "Product not found." });
        }

        if (product.Auction is not null &&
            (product.Auction.Status == AuctionStatus.Active || product.Auction.Status == AuctionStatus.Scheduled))
        {
            return Conflict(new { message = "This product already has an active or scheduled auction." });
        }

        if (TenantContext.Tenant!.Plan == PlanTier.Free)
        {
            var activeAuctionCount = await _db.Auctions.CountAsync(a =>
                a.Status == AuctionStatus.Active || a.Status == AuctionStatus.Scheduled);
            if (activeAuctionCount >= PlanLimits.FreeMaxActiveAuctions)
            {
                return StatusCode(StatusCodes.Status402PaymentRequired, new
                {
                    message = $"The Free plan allows up to {PlanLimits.FreeMaxActiveAuctions} active or scheduled auctions at a time. Upgrade to Pro for more."
                });
            }
        }

        var adminId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        var now = DateTime.UtcNow;

        var auction = new Auction
        {
            ProductId = product.Id,
            StartingPrice = request.StartingPrice,
            MinIncrement = request.MinIncrement,
            StartTimeUtc = request.StartTimeUtc,
            EndTimeUtc = request.EndTimeUtc,
            Status = request.StartTimeUtc <= now ? AuctionStatus.Active : AuctionStatus.Scheduled,
            BuyoutPrice = request.BuyoutPrice,
            CreatedByUserId = adminId,
            CreatedAtUtc = now
        };

        _db.Auctions.Add(auction);
        product.IsAuctionOnly = true;
        await _db.SaveChangesAsync();

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Auction.Create", "Auction", auction.Id.ToString(), product.Name);

        auction.Product = product;
        return CreatedAtAction(nameof(GetAuction), new { id = auction.Id }, auction.ToDetailDto());
    }

    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = ApplicationDbContext.AdminRole)]
    public async Task<IActionResult> CancelAuction(int id)
    {
        var auction = await _db.Auctions.FirstOrDefaultAsync(a => a.Id == id);
        if (auction is null) return NotFound();

        if (auction.Status is AuctionStatus.Closed or AuctionStatus.Cancelled)
        {
            return BadRequest(new { message = "This auction has already ended." });
        }

        auction.Status = AuctionStatus.Cancelled;
        await _db.SaveChangesAsync();

        await _outputCache.EvictByTagAsync("catalog", default);
        await _auditLog.LogAsync(User, "Auction.Cancel", "Auction", auction.Id.ToString());

        return NoContent();
    }

    [HttpPost("{id:int}/bids")]
    [Authorize]
    public async Task<ActionResult<BidDto>> PlaceBid(int id, PlaceBidRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var result = await _auctionService.PlaceBidAsync(id, userId, request.Amount);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        return Ok(result.Bid);
    }

    // Buying out an auction skips the remaining bidding entirely: the buyer
    // pays the admin-configured BuyoutPrice, the auction closes immediately,
    // and (per the simulated-payment approach used everywhere else in this
    // app) an Order is recorded directly - no real payment gateway call -
    // which is what represents "payment has been sent" before the close.
    [HttpPost("{id:int}/buyout")]
    [Authorize]
    public async Task<ActionResult<BuyoutResponseDto>> Buyout(int id, CheckoutRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var result = await _auctionService.BuyoutAsync(id, userId, request.ShippingName, request.ShippingAddress);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        return Ok(result.Response);
    }

    // ---- Live chat ---------------------------------------------------
    //
    // Deliberately a REST endpoint (not a Hub method) for sending, mirroring
    // PlaceBid above: validate/persist here, then broadcast the result via
    // the same SignalR group ("auction-{tenantId}-{auctionId}") bids
    // already use, so one connection/subscription on the client covers both.

    [HttpGet("{id:int}/chat")]
    public async Task<ActionResult<ChatHistoryDto>> GetChatMessages(int id)
    {
        var auctionExists = await _db.Auctions.AnyAsync(a => a.Id == id);
        if (!auctionExists) return NotFound();

        var messages = await _db.ChatMessages
            .Include(m => m.User)
            .Where(m => m.AuctionId == id)
            .OrderByDescending(m => m.SentAtUtc)
            .Take(ChatHistoryLimit)
            .AsNoTracking()
            .ToListAsync();

        messages.Reverse();

        // Only an admin (who can moderate) gets the real user ids; everyone
        // else gets opaque per-auction refs.
        var isAdminCaller = User.IsInRole(ApplicationDbContext.AdminRole);
        var me = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var adminUserIds = await GetAdminUserIdsAsync(messages.Select(m => m.UserId));

        return Ok(new ChatHistoryDto
        {
            Messages = messages
                .Select(m => m.ToDto(adminUserIds.Contains(m.UserId), _authRefSalt, includeUserId: isAdminCaller))
                .ToList(),
            MyAuthorRef = string.IsNullOrEmpty(me) ? string.Empty : ChatAuthorRef.For(_authRefSalt, "auction", id, me)
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

        var auction = await _db.Auctions.FirstOrDefaultAsync(a => a.Id == id);
        if (auction is null) return NotFound();

        if (auction.Status is AuctionStatus.Closed or AuctionStatus.Cancelled)
        {
            return BadRequest(new { message = "Chat is closed for this auction." });
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
            AuctionId = id,
            UserId = userId,
            Content = filtered,
            WasFiltered = wasFiltered,
            SentAtUtc = DateTime.UtcNow
        };

        _db.ChatMessages.Add(message);
        await _db.SaveChangesAsync();

        var savedMessage = await _db.ChatMessages.Include(m => m.User).FirstAsync(m => m.Id == message.Id);
        var isAdmin = (await GetAdminUserIdsAsync(new[] { userId })).Contains(userId);
        // Broadcast (and echo) carry only the opaque ref - never the user id.
        var dto = savedMessage.ToDto(isAdmin, _authRefSalt, includeUserId: false);

        await _hub.Clients.Group(AuctionHub.GroupName(auction.TenantId, id)).SendAsync("ChatMessageReceived", dto);

        return Ok(dto);
    }

    // Cross-references a batch of user ids against the Identity "Admin"
    // role in one query, so listing/sending chat messages doesn't need an
    // extra round trip per message to know whether to show the admin badge.
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
