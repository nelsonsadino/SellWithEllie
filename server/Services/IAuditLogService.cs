using System.Security.Claims;

namespace SellWithEllie.Services;

// Records an admin action to the AuditLogEntries table. Every call is
// best-effort: a failure here (e.g. a transient DB blip) is logged and
// swallowed rather than propagated, so audit logging can never break the
// admin action it's recording.
public interface IAuditLogService
{
    Task LogAsync(ClaimsPrincipal actor, string action, string? targetType = null, string? targetId = null, string? details = null, CancellationToken cancellationToken = default);
}
