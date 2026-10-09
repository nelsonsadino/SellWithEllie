using System.Text.Json;

namespace SellWithEllie.Dtos;

// Public storefront bootstrap payload (GET /api/tenant/current): shop identity
// plus everything the frontend needs to render the shop in its chosen design -
// theme, copy overrides, and the ordered visible home-page blocks.
public class TenantInfoDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Plan { get; set; } = string.Empty;

    public string ThemeTemplate { get; set; } = "marketstall";
    public string ThemeMode { get; set; } = "system";

    // ISO 4217 code the storefront formats all prices in.
    public string CurrencyCode { get; set; } = "USD";

    // At or below this many units, a product shows "Only N left".
    public int LowStockThreshold { get; set; } = 5;

    public Dictionary<string, string> Content { get; set; } = new();
    public List<SectionDto> Sections { get; set; } = new();
}

// Admin view (GET /api/tenant/settings): includes hidden blocks too.
public class TenantSettingsDto
{
    public string ThemeTemplate { get; set; } = "marketstall";
    public string ThemeMode { get; set; } = "system";
    public Dictionary<string, string> Content { get; set; } = new();
    public List<SectionDto> Sections { get; set; } = new();
}

public class SectionDto
{
    public int Id { get; set; }
    public string Kind { get; set; } = string.Empty;
    public int Position { get; set; }
    public bool IsVisible { get; set; }
    public JsonElement Data { get; set; }
}

public class UpdateThemeRequest
{
    public string ThemeTemplate { get; set; } = "marketstall";
    public string ThemeMode { get; set; } = "system";
}

// Upsert map of key -> value. An empty/whitespace value deletes the override
// so that key falls back to the shipped default.
public class UpsertContentRequest
{
    public Dictionary<string, string> Entries { get; set; } = new();
}

public class SectionWriteRequest
{
    public string Kind { get; set; } = string.Empty;
    public bool IsVisible { get; set; } = true;
    public JsonElement Data { get; set; }
}

public class ReorderRequest
{
    public List<int> OrderedIds { get; set; } = new();
}
