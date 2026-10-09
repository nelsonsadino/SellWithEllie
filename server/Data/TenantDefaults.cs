using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Models;

namespace SellWithEllie.Data;

// Allowed values for the theming fields, plus the starter storefront blocks a
// brand-new shop gets so its home page isn't blank. Referenced by
// TenantController (validation) and by signup / seeding (provisioning).
public static class TenantDefaults
{
    public static readonly HashSet<string> Templates =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "marketstall", "warmwood", "mono",
            "petshop", "sarisari", "fashion", "tech", "autoparts", "hobby"
        };

    public static readonly HashSet<string> Modes =
        new(StringComparer.OrdinalIgnoreCase) { "system", "light", "dark" };

    public static readonly HashSet<string> SectionKinds =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "hero", "carousel", "uspStrip", "lookbook", "newsletter",
            "featureGrid", "richText", "gallery", "cta", "productGrid", "auctionTicker",
            "videoBanner", "raffleTicker"
        };

    private static string Json(object value) => JsonSerializer.Serialize(value);

    public static List<TenantSection> DefaultStorefrontSections(string shopName) => new()
    {
        new TenantSection
        {
            Kind = "hero",
            Position = 0,
            DataJson = Json(new
            {
                title = $"Welcome to {shopName}",
                subtitle = "A small shop with a considered selection. New pieces added often - buy at a fixed price, or bid in a live auction.",
                primaryLabel = "Shop all",
                primaryHref = "/products",
                secondaryLabel = "Live auctions",
                secondaryHref = "/auctions"
            })
        },
        new TenantSection
        {
            Kind = "uspStrip",
            Position = 1,
            DataJson = Json(new
            {
                items = new[]
                {
                    new { title = "Free returns", body = "within 30 days" },
                    new { title = "Secure checkout", body = "protected end to end" },
                    new { title = "Ships in 2 days", body = "tracked delivery" }
                }
            })
        },
        new TenantSection
        {
            Kind = "carousel",
            Position = 2,
            DataJson = Json(new
            {
                autoplay = 6,
                slides = new[]
                {
                    new { image = "", heading = "New arrivals", text = "Fresh picks added every week.", buttonLabel = "Shop new in", buttonHref = "/products" },
                    new { image = "", heading = "Bidding is live", text = "Catch a piece before it closes.", buttonLabel = "View auctions", buttonHref = "/auctions" }
                }
            })
        },
        new TenantSection
        {
            Kind = "productGrid",
            Position = 3,
            DataJson = Json(new { heading = "New arrivals", limit = 8, sort = "newest" })
        },
        new TenantSection
        {
            Kind = "featureGrid",
            Position = 4,
            DataJson = Json(new
            {
                heading = "",
                items = new[]
                {
                    new { title = "Considered selection", body = "Every item is chosen and checked before it goes up." },
                    new { title = "Secure checkout", body = "Your account and orders are protected end to end." },
                    new { title = "Live auctions", body = "Bid in real time on limited pieces." }
                }
            })
        },
        new TenantSection
        {
            Kind = "newsletter",
            Position = 5,
            DataJson = Json(new
            {
                heading = "Get first look",
                body = "New arrivals and restocks, straight to your inbox. No spam.",
                placeholder = "you@email.com",
                buttonLabel = "Subscribe"
            })
        },
        new TenantSection
        {
            Kind = "cta",
            Position = 6,
            DataJson = Json(new
            {
                title = "See something you like?",
                body = "New pieces are added continually. Make an account to save your cart and check out.",
                buttonLabel = "Browse everything",
                buttonHref = "/products"
            })
        }
    };

    // Provisions the default blocks for a shop. Safe to call more than once -
    // it no-ops if the shop already has any blocks. TenantId is set explicitly
    // so this works whether or not the DbContext scope is bound to the tenant.
    public static void SeedStorefront(ApplicationDbContext db, Tenant tenant)
    {
        var alreadySeeded = db.TenantSections
            .IgnoreQueryFilters()
            .Any(s => s.TenantId == tenant.Id);
        if (alreadySeeded) return;

        var sections = DefaultStorefrontSections(tenant.Name);
        foreach (var section in sections)
        {
            section.TenantId = tenant.Id;
        }
        db.TenantSections.AddRange(sections);
        db.SaveChanges();
    }

    public static List<PlatformSection> DefaultMarketingSections() => new()
    {
        new PlatformSection
        {
            Kind = "hero",
            Position = 0,
            DataJson = Json(new
            {
                title = "Run your own online shop - in minutes",
                subtitle =
                    "A ready-made storefront with product listings, live bidding auctions, and a shopping cart. Sign up, pick your web address, and start selling today.",
                primaryLabel = "Start your shop free",
                primaryHref = "/signup"
            })
        },
        new PlatformSection
        {
            Kind = "featureGrid",
            Position = 1,
            DataJson = Json(new
            {
                heading = "Everything your shop needs",
                items = new[]
                {
                    new { title = "Full product catalog", body = "Searchable listings with category, price, description and photos." },
                    new { title = "Live auctions", body = "Run timed auctions on your rarer items with real-time bidding." },
                    new { title = "Cart & checkout", body = "A standard shopping cart for straightforward fixed-price sales." },
                    new { title = "Your own admin team", body = "Invite staff as shop admins - scoped to your shop only." }
                }
            })
        },
        new PlatformSection
        {
            Kind = "cta",
            Position = 2,
            DataJson = Json(new
            {
                title = "Start selling today",
                body = "Free to start. Upgrade to Pro when you grow.",
                buttonLabel = "Create your shop",
                buttonHref = "/signup"
            })
        }
    };

    public static void SeedMarketing(ApplicationDbContext db)
    {
        if (db.PlatformSections.Any()) return;
        db.PlatformSections.AddRange(DefaultMarketingSections());
        db.SaveChanges();
    }
}
