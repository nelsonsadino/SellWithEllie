using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Mapping;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Read-only view of AuditLogEntries for shop admins - "who did what, and
// when" across products, auctions and chat moderation. Entries are written
// by IAuditLogService from the controllers that perform those actions.
[Route("api/audit-log")]
[Authorize(Roles = ApplicationDbContext.AdminRole)]
public class AuditLogController : TenantScopedControllerBase
{
    private readonly ApplicationDbContext _db;

    public AuditLogController(ApplicationDbContext db, ITenantContext tenantContext) : base(tenantContext)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<AuditLogEntryDto>>> GetAuditLog([FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.AuditLogEntries.AsNoTracking().OrderByDescending(e => e.CreatedAtUtc);

        var totalCount = await query.CountAsync();
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<AuditLogEntryDto>
        {
            Items = items.Select(e => e.ToDto()).ToList(),
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        });
    }
}
