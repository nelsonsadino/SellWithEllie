using System.Security.Claims;
using SellWithEllie.Data;
using SellWithEllie.Models;

namespace SellWithEllie.Services;

public class AuditLogService : IAuditLogService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<AuditLogService> _logger;

    public AuditLogService(ApplicationDbContext db, ILogger<AuditLogService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task LogAsync(ClaimsPrincipal actor, string action, string? targetType = null, string? targetId = null, string? details = null, CancellationToken cancellationToken = default)
    {
        var userId = actor.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown";
        var displayName = actor.FindFirstValue("displayName");
        if (string.IsNullOrWhiteSpace(displayName))
        {
            displayName = actor.FindFirstValue(ClaimTypes.Email) ?? "Unknown";
        }

        try
        {
            _db.AuditLogEntries.Add(new AuditLogEntry
            {
                ActorUserId = userId,
                ActorDisplayName = displayName,
                Action = action,
                TargetType = targetType,
                TargetId = targetId,
                Details = details,
                CreatedAtUtc = DateTime.UtcNow
            });
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log entry for action {Action}.", action);
        }
    }
}
