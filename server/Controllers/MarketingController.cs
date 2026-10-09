using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Data;
using SellWithEllie.Dtos;
using SellWithEllie.Mapping;

namespace SellWithEllie.Controllers;

// Public, tenant-independent read of the platform's own marketing site content.
// Editing lives in PlatformController (platform admins only).
[ApiController]
[Route("api/marketing")]
public class MarketingController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public MarketingController(ApplicationDbContext db)
    {
        _db = db;
    }

    [HttpGet("site")]
    public async Task<ActionResult<MarketingSiteDto>> GetSite()
    {
        var content = await _db.PlatformContents.AsNoTracking()
            .ToDictionaryAsync(c => c.Key, c => c.Value);
        var sections = await _db.PlatformSections.AsNoTracking()
            .Where(s => s.IsVisible)
            .OrderBy(s => s.Position)
            .ToListAsync();

        return Ok(new MarketingSiteDto
        {
            Content = content,
            Sections = sections.Select(s => s.ToDto()).ToList()
        });
    }
}
