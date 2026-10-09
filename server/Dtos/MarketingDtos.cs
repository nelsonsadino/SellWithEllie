namespace SellWithEllie.Dtos;

// The platform's own marketing site content (GET /api/marketing/site, public;
// GET /api/platform/marketing, admin - which also includes hidden blocks).
public class MarketingSiteDto
{
    public Dictionary<string, string> Content { get; set; } = new();
    public List<SectionDto> Sections { get; set; } = new();
}
