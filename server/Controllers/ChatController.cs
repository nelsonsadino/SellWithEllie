using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SellWithEllie.Config;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Shop-wide chat moderation: an admin blocks a disruptive customer from
// chatting in ANY of that shop's auctions (not just the one where it
// happened), and can unblock them later. Separate from AuctionsController
// (which owns the messages themselves) since blocking isn't scoped to one
// auction.
[Route("api/chat")]
[Authorize(Roles = ApplicationDbContext.AdminRole)]
public class ChatController : TenantScopedControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IAuditLogService _auditLog;
    private readonly string _authRefSalt;

    public ChatController(
        ApplicationDbContext db,
        UserManager<ApplicationUser> userManager,
        IAuditLogService auditLog,
        IOptions<JwtSettings> jwtOptions,
        ITenantContext tenantContext) : base(tenantContext)
    {
        _db = db;
        _userManager = userManager;
        _auditLog = auditLog;
        _authRefSalt = jwtOptions.Value.Key;
    }

    [HttpGet("blocked-users")]
    public async Task<ActionResult<List<BlockedChatUserDto>>> GetBlockedUsers()
    {
        var blocked = await _db.ChatBlockedUsers
            .Include(b => b.User)
            .OrderByDescending(b => b.BlockedAtUtc)
            .AsNoTracking()
            .ToListAsync();

        return Ok(blocked.Select(b => new BlockedChatUserDto
        {
            UserId = b.UserId,
            DisplayName = b.User?.DisplayName ?? "A user",
            Reason = b.Reason,
            BlockedAtUtc = b.BlockedAtUtc
        }).ToList());
    }

    [HttpPost("block")]
    public async Task<IActionResult> BlockUser(BlockChatUserRequest request)
    {
        var adminId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

        // Target is given either directly (id) or as an opaque per-entity
        // ref off a live message - resolve the ref back to a real user.
        var targetId = request.UserId;
        if (string.IsNullOrEmpty(targetId) && !string.IsNullOrEmpty(request.AuthorRef))
        {
            if (request.AuctionId is int auctionId)
            {
                var authorIds = await _db.ChatMessages
                    .Where(m => m.AuctionId == auctionId)
                    .Select(m => m.UserId)
                    .Distinct()
                    .ToListAsync();
                targetId = authorIds.FirstOrDefault(
                    uid => ChatAuthorRef.For(_authRefSalt, "auction", auctionId, uid) == request.AuthorRef);
            }
            else if (request.RaffleId is int raffleId)
            {
                var authorIds = await _db.ChatMessages
                    .Where(m => m.RaffleId == raffleId)
                    .Select(m => m.UserId)
                    .Distinct()
                    .ToListAsync();
                targetId = authorIds.FirstOrDefault(
                    uid => ChatAuthorRef.For(_authRefSalt, "raffle", raffleId, uid) == request.AuthorRef);
            }
        }

        if (string.IsNullOrEmpty(targetId))
        {
            return NotFound(new { message = "User not found." });
        }

        if (string.Equals(targetId, adminId, StringComparison.Ordinal))
        {
            return BadRequest(new { message = "You can't block yourself." });
        }

        var targetUser = await _db.Users.FirstOrDefaultAsync(u => u.Id == targetId);
        if (targetUser is null)
        {
            return NotFound(new { message = "User not found." });
        }

        if (await _userManager.IsInRoleAsync(targetUser, ApplicationDbContext.AdminRole))
        {
            return BadRequest(new { message = "You can't block another admin from chat." });
        }

        var alreadyBlocked = await _db.ChatBlockedUsers.AnyAsync(b => b.UserId == targetId);
        if (alreadyBlocked)
        {
            return Conflict(new { message = "This user is already blocked from chat." });
        }

        _db.ChatBlockedUsers.Add(new ChatBlockedUser
        {
            UserId = targetId,
            BlockedByUserId = adminId,
            Reason = request.Reason,
            BlockedAtUtc = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();
        await _auditLog.LogAsync(User, "Chat.BlockUser", "User", targetId, request.Reason ?? targetUser.DisplayName);
        return NoContent();
    }

    [HttpDelete("block/{userId}")]
    public async Task<IActionResult> UnblockUser(string userId)
    {
        var block = await _db.ChatBlockedUsers.FirstOrDefaultAsync(b => b.UserId == userId);
        if (block is null) return NotFound();

        _db.ChatBlockedUsers.Remove(block);
        await _db.SaveChangesAsync();
        await _auditLog.LogAsync(User, "Chat.UnblockUser", "User", userId);
        return NoContent();
    }
}
