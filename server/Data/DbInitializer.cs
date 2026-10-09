using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Data;

// Seeds two independent things, both from configuration - nothing here
// hardcodes real credentials into source control:
//   1. The platform-owner account (PlatformAdmin role, no tenant) that
//      manages every shop on the SaaS.
//   2. Optionally, a demo shop (Tenant) with its own Admin account and a
//      handful of sample products, so a fresh clone isn't an empty platform.
//      The demo happens to be a pet shop - that's just one example of a
//      business this platform can host, not a constraint on what a shop
//      signing up for real can sell.
public static class DbInitializer
{
    public static async Task SeedAsync(IServiceProvider services, IConfiguration configuration, ILogger logger)
    {
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
        var db = services.GetRequiredService<ApplicationDbContext>();
        var tenantContext = services.GetRequiredService<ITenantContext>();

        foreach (var role in new[] { ApplicationDbContext.PlatformAdminRole, ApplicationDbContext.AdminRole, ApplicationDbContext.CustomerRole })
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }

        await SeedPlatformAdminAsync(userManager, configuration, logger);
        TenantDefaults.SeedMarketing(db);
        await SeedDemoTenantAsync(db, userManager, tenantContext, configuration, logger);
    }

    private static async Task SeedPlatformAdminAsync(UserManager<ApplicationUser> userManager, IConfiguration configuration, ILogger logger)
    {
        var email = configuration["PlatformAdmin:Email"];
        var password = configuration["PlatformAdmin:Password"];

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning(
                "PlatformAdmin:Email / PlatformAdmin:Password not configured - skipping platform-owner seeding. " +
                "Set them via dotnet user-secrets (dev) or app settings (production).");
            return;
        }

        // Query filters key off the *current* tenant context, which is null
        // here - exactly what we want, since this filters to platform-admin
        // (TenantId == null) accounts only.
        var existing = await userManager.FindByEmailAsync(email);
        if (existing is not null) return;

        var admin = new ApplicationUser
        {
            UserName = $"platform-{email}",
            Email = email,
            DisplayName = "Platform Owner",
            EmailConfirmed = true,
            TenantId = null
        };

        var result = await userManager.CreateAsync(admin, password);
        if (result.Succeeded)
        {
            await userManager.AddToRoleAsync(admin, ApplicationDbContext.PlatformAdminRole);
            logger.LogInformation("Seeded platform-owner account for {Email}", email);
        }
        else
        {
            logger.LogError("Failed to seed platform-owner account: {Errors}", string.Join("; ", result.Errors.Select(e => e.Description)));
        }
    }

    private static async Task SeedDemoTenantAsync(
        ApplicationDbContext db,
        UserManager<ApplicationUser> userManager,
        ITenantContext tenantContext,
        IConfiguration configuration,
        ILogger logger)
    {
        var slug = configuration["DemoShop:Slug"];
        if (string.IsNullOrWhiteSpace(slug))
        {
            logger.LogInformation("DemoShop:Slug not configured - skipping demo shop seeding.");
            return;
        }

        var tenant = db.Tenants.FirstOrDefault(t => t.Slug == slug);
        if (tenant is null)
        {
            tenant = new Tenant
            {
                Name = configuration["DemoShop:Name"] ?? "Ellie's Friends",
                Slug = slug,
                Plan = PlanTier.Pro,
                SubscriptionStatus = TenantSubscriptionStatus.Active,
                IsActive = true
            };
            db.Tenants.Add(tenant);
            await db.SaveChangesAsync();
            logger.LogInformation("Seeded demo tenant '{Slug}'", slug);
        }

        // Everything below is scoped to the demo tenant for the rest of this
        // (startup-only) service scope, so normal tenant-scoped inserts and
        // queries work exactly as they would inside a real request for it.
        tenantContext.SetTenant(tenant);

        // Backfill theming defaults for tenants created before those columns existed.
        if (string.IsNullOrWhiteSpace(tenant.ThemeTemplate) || string.IsNullOrWhiteSpace(tenant.ThemeMode))
        {
            tenant.ThemeTemplate = string.IsNullOrWhiteSpace(tenant.ThemeTemplate) ? "marketstall" : tenant.ThemeTemplate;
            tenant.ThemeMode = string.IsNullOrWhiteSpace(tenant.ThemeMode) ? "system" : tenant.ThemeMode;
            await db.SaveChangesAsync();
        }

        TenantDefaults.SeedStorefront(db, tenant);

        // Feature raffles on the home page without requiring a manual admin
        // step - the auction ticker section is opt-in-only (an admin must
        // add it deliberately), but the raffle expansion asked for raffles
        // to actually be visible on the front page, so this one is seeded.
        if (!db.TenantSections.IgnoreQueryFilters().Any(s => s.TenantId == tenant.Id && s.Kind == "raffleTicker"))
        {
            var nextPosition = (db.TenantSections.IgnoreQueryFilters()
                .Where(s => s.TenantId == tenant.Id)
                .Select(s => (int?)s.Position)
                .Max() ?? -1) + 1;
            db.TenantSections.Add(new TenantSection
            {
                TenantId = tenant.Id,
                Kind = "raffleTicker",
                Position = nextPosition,
                DataJson = System.Text.Json.JsonSerializer.Serialize(new { heading = "" })
            });
            db.SaveChanges();
        }

        var adminEmail = configuration["DemoShop:AdminEmail"];
        var adminPassword = configuration["DemoShop:AdminPassword"];
        ApplicationUser? shopAdmin = null;
        if (!string.IsNullOrWhiteSpace(adminEmail) && !string.IsNullOrWhiteSpace(adminPassword))
        {
            shopAdmin = await userManager.FindByEmailAsync(adminEmail);
            if (shopAdmin is null)
            {
                shopAdmin = new ApplicationUser
                {
                    UserName = $"t{tenant.Id}-{adminEmail}",
                    Email = adminEmail,
                    DisplayName = "Shop Admin",
                    EmailConfirmed = true,
                    TenantId = tenant.Id
                };

                var result = await userManager.CreateAsync(shopAdmin, adminPassword);
                if (result.Succeeded)
                {
                    await userManager.AddToRoleAsync(shopAdmin, ApplicationDbContext.AdminRole);
                    logger.LogInformation("Seeded demo shop admin for {Email}", adminEmail);
                }
                else
                {
                    logger.LogError("Failed to seed demo shop admin: {Errors}", string.Join("; ", result.Errors.Select(e => e.Description)));
                    shopAdmin = null;
                }
            }
        }

        if (!db.Products.Any())
        {
            db.Products.AddRange(
                new Product { Name = "Biscuit", Category = "Dog", Subcategory = "Golden Retriever", Price = 850.00m, Description = "8 months old. Friendly and energetic, loves belly rubs.", InStock = true },
                new Product { Name = "Luna", Category = "Cat", Subcategory = "British Shorthair", Price = 600.00m, Description = "5 months old. Calm lap cat, great with kids.", InStock = true },
                new Product { Name = "Kiwi", Category = "Bird", Subcategory = "Cockatiel", Price = 150.00m, Description = "3 months old. Whistles along to music.", InStock = true },
                new Product { Name = "Nibbles", Category = "Rabbit", Subcategory = "Holland Lop", Price = 120.00m, Description = "6 months old. Loves lettuce and cuddles.", InStock = true },
                new Product { Name = "Rocky", Category = "Dog", Subcategory = "Siberian Husky", Price = 950.00m, Description = "10 months old. A striking, high-energy husky available exclusively via auction.", InStock = true, IsAuctionOnly = true }
            );
            await db.SaveChangesAsync();
            logger.LogInformation("Seeded sample products for demo tenant '{Slug}'", slug);
        }

        // An always-empty auction ticker/raffle list makes a fresh clone (or
        // this demo shop) look unfinished. Seed one live auction on whichever
        // auction-only product exists (works for either the dog/cat seed set
        // above or a differently-themed catalogue someone's already loaded,
        // e.g. this demo tenant's actual aquatics products) and a couple of
        // open raffles, all attributed to the shop admin if one was seeded.
        var creatorId = shopAdmin?.Id ?? string.Empty;
        var now = DateTime.UtcNow;

        // Guard on "no auction currently running", not "no auction row at
        // all" - this demo tenant already has a history of past Closed/
        // Cancelled auctions, which shouldn't stop us from starting a fresh
        // live one. Auction<->Product is a strict one-to-one at the DB level
        // (unique index on ProductId) for the entity's whole lifetime, not
        // just while active, so a product that already has ANY auction row
        // - even a long-closed one - can never host another; pick one with
        // no auction history at all, same as AuctionsController.CreateAuction
        // would end up doing, and flag it IsAuctionOnly the same way it does.
        if (!db.Auctions.Any(a => a.Status == AuctionStatus.Active || a.Status == AuctionStatus.Scheduled))
        {
            var auctionedProductIds = db.Auctions.Select(a => a.ProductId).ToHashSet();
            var auctionProduct = db.Products
                .Where(p => !auctionedProductIds.Contains(p.Id))
                .OrderBy(p => p.Id)
                .FirstOrDefault();
            if (auctionProduct is not null)
            {
                auctionProduct.IsAuctionOnly = true;
                var auction = new Auction
                {
                    ProductId = auctionProduct.Id,
                    StartingPrice = Math.Max(1m, auctionProduct.Price * 0.6m),
                    MinIncrement = 1m,
                    BuyoutPrice = auctionProduct.Price * 2m,
                    StartTimeUtc = now.AddHours(-1),
                    EndTimeUtc = now.AddDays(3),
                    Status = AuctionStatus.Active,
                    CreatedByUserId = creatorId,
                    CreatedAtUtc = now
                };
                db.Auctions.Add(auction);
                await db.SaveChangesAsync();
                logger.LogInformation("Seeded a live sample auction on product '{Product}' for demo tenant '{Slug}'", auctionProduct.Name, slug);
            }
        }

        if (!db.Raffles.Any())
        {
            var raffles = new[]
            {
                new Raffle
                {
                    Title = "Starter Aquarium Kit Raffle",
                    SeatCount = 20,
                    SeatPrice = 5.00m,
                    Status = RaffleStatus.Open,
                    CreatedByUserId = creatorId,
                    CreatedAtUtc = now,
                    Prizes = { new RafflePrize { Rank = 1, Description = "A complete 20-gallon starter aquarium kit: tank, filter, heater and a bag of substrate." } }
                },
                new Raffle
                {
                    Title = "Show Betta Pair Raffle",
                    SeatCount = 10,
                    SeatPrice = 8.00m,
                    Status = RaffleStatus.Open,
                    CreatedByUserId = creatorId,
                    CreatedAtUtc = now,
                    Prizes = { new RafflePrize { Rank = 1, Description = "A matched pair of show-grade halfmoon bettas, your choice of colour once drawn." } }
                }
            };

            foreach (var raffle in raffles)
            {
                for (var i = 1; i <= raffle.SeatCount; i++)
                {
                    raffle.Seats.Add(new RaffleSeat { SeatNumber = i, Status = RaffleSeatStatus.Available });
                }
            }

            db.Raffles.AddRange(raffles);
            await db.SaveChangesAsync();
            logger.LogInformation("Seeded {Count} open sample raffles for demo tenant '{Slug}'", raffles.Length, slug);
        }

        await SeedDrawModeShowcaseRafflesAsync(db, userManager, tenant, creatorId, now, logger);
    }

    // A raffle with every seat still Available doesn't let anyone actually
    // see the Wheel / Duck Race / Last Man Standing draw - this seeds one
    // fully-paid, ReadyToDraw raffle per draw mode (so "Draw winner" works
    // immediately) plus one Instant-mode raffle in a realistic mixed state
    // (some paid, some reserved, some still open) to show off the ordinary
    // seat-picker experience too.
    //
    // Each mode is refreshed INDEPENDENTLY: if someone's already drawn the
    // seeded Wheel raffle but the Duck Race one is still sitting untouched,
    // a restart seeds a fresh Wheel raffle (title suffixed "#2", "#3", ...)
    // without touching Duck Race - otherwise testing one mode at a time
    // across restarts would either wastefully duplicate untouched raffles
    // or leave an already-drawn mode with nothing left to test.
    private static async Task SeedDrawModeShowcaseRafflesAsync(
        ApplicationDbContext db, UserManager<ApplicationUser> userManager, Tenant tenant, string creatorId, DateTime now, ILogger logger)
    {
        async Task<ApplicationUser> GetOrCreateDemoCustomerAsync(string email, string displayName)
        {
            var existing = await userManager.FindByEmailAsync(email);
            if (existing is not null) return existing;

            var user = new ApplicationUser
            {
                UserName = $"t{tenant.Id}-{email}",
                Email = email,
                DisplayName = displayName,
                EmailConfirmed = true,
                TenantId = tenant.Id
            };
            // Random, not a literal - nobody logs in as these seeded raffle
            // buyers interactively, so there's no reason to hardcode a
            // guessable credential into source (and a real risk if
            // DemoShop:* config were ever accidentally set in production).
            // The fixed "Demo" prefix and "!1" suffix guarantee Identity's
            // uppercase/lowercase/digit policy regardless of the random part.
            var randomPassword = $"Demo{Convert.ToHexString(RandomNumberGenerator.GetBytes(9))}!1";
            var result = await userManager.CreateAsync(user, randomPassword);
            if (result.Succeeded)
            {
                await userManager.AddToRoleAsync(user, ApplicationDbContext.CustomerRole);
                return user;
            }
            logger.LogError("Failed to seed demo raffle customer {Email}: {Errors}", email, string.Join("; ", result.Errors.Select(e => e.Description)));
            // Extremely unlikely (idempotent create on a fresh email) - fall
            // back to the shop admin as the buyer so seeding still succeeds.
            return (await userManager.FindByIdAsync(creatorId))!;
        }

        // Five buyers, not two - with only two names in the pool, every
        // raffle's winners necessarily alternate between the same two
        // people, which reads as "the draw keeps repeating" even though the
        // underlying seat selection is genuinely random each time. More
        // names makes the randomness actually visible.
        var maya = await GetOrCreateDemoCustomerAsync("maya.demo@sellwithellie.local", "Maya Santos");
        var jon = await GetOrCreateDemoCustomerAsync("jon.demo@sellwithellie.local", "Jon Cruz");
        var ella = await GetOrCreateDemoCustomerAsync("ella.demo@sellwithellie.local", "Ella Reyes");
        var ben = await GetOrCreateDemoCustomerAsync("ben.demo@sellwithellie.local", "Ben Tan");
        var priya = await GetOrCreateDemoCustomerAsync("priya.demo@sellwithellie.local", "Priya Kapoor");
        var buyerPool = new[] { maya, jon, ella, ben, priya };

        // Sample fixed-price sales across the last 30 days so the admin
        // Reports tab has real-looking data to show (best sellers, revenue
        // trend, categories). Only seeded once, and only when the shop has
        // no product orders yet - a real shop's history is never touched.
        if (db.OrderItems.Count(i => db.Products.Any(p => p.Id == i.ProductId)) < 10)
        {
            var shopProducts = db.Products.Where(p => !p.IsAuctionOnly).OrderBy(p => p.Id).ToList();
            if (shopProducts.Count > 0)
            {
                var rng = new Random(20260925);
                for (var i = 0; i < 40; i++)
                {
                    var buyer = buyerPool[rng.Next(buyerPool.Length)];
                    var at = DateTime.UtcNow.Date.AddDays(-rng.Next(0, 30)).AddHours(rng.Next(8, 21));
                    var order = new Order
                    {
                        UserId = buyer.Id,
                        OrderDateUtc = at,
                        Status = OrderStatus.Completed,
                        ShippingName = buyer.DisplayName ?? "Customer",
                        ShippingAddress = "Sample address",
                        PaymentProvider = "simulated",
                        TenantId = tenant.Id
                    };
                    // Skewed picks so a few products clearly outsell the rest.
                    var lineCount = rng.Next(1, 3);
                    for (var l = 0; l < lineCount; l++)
                    {
                        var idx = (int)Math.Floor(Math.Pow(rng.NextDouble(), 2) * shopProducts.Count);
                        var prod = shopProducts[idx];
                        var qty = rng.Next(1, 4);
                        order.Items.Add(new OrderItem
                        {
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            PriceAtPurchase = prod.Price,
                            Quantity = qty,
                            TenantId = tenant.Id
                        });
                    }
                    order.TotalAmount = order.Items.Sum(x => x.PriceAtPurchase * x.Quantity);
                    db.Orders.Add(order);
                }
                await db.SaveChangesAsync();
                logger.LogInformation("Seeded sample sales history for the demo tenant (Reports tab).");
            }
        }

        // Default shipping options + a welcome coupon so checkout has something to show.
        if (!db.ShippingMethods.IgnoreQueryFilters().Any(s => s.TenantId == tenant.Id))
        {
            db.ShippingMethods.AddRange(
                new ShippingMethod { TenantId = tenant.Id, Name = "Standard", Price = 4.99m, EstimatedDelivery = "5-7 business days", FreeOverSubtotal = 50m, SortOrder = 1 },
                new ShippingMethod { TenantId = tenant.Id, Name = "Express", Price = 12.99m, EstimatedDelivery = "1-3 business days", SortOrder = 2 },
                new ShippingMethod { TenantId = tenant.Id, Name = "Local pickup", Price = 0m, EstimatedDelivery = "Ready in 1 day", SortOrder = 3 });
        }
        if (!db.Coupons.IgnoreQueryFilters().Any(c => c.TenantId == tenant.Id))
        {
            db.Coupons.AddRange(
                new Coupon { TenantId = tenant.Id, Code = "WELCOME10", Type = CouponType.Percent, Value = 10m },
                new Coupon { TenantId = tenant.Id, Code = "SAVE5", Type = CouponType.FixedAmount, Value = 5m, MinSubtotal = 25m });
        }

        // A few sample reviews so ratings show up on the storefront.
        if (!db.ProductReviews.IgnoreQueryFilters().Any(r => r.TenantId == tenant.Id))
        {
            var reviewable = db.Products.Where(p => !p.IsAuctionOnly).OrderBy(p => p.Id).Take(6).ToList();
            var samples = new (int Rating, string Title, string Body)[]
            {
                (5, "Exactly as described", "Arrived well packed and looks even better in person. Would buy again."),
                (4, "Great find", "Lovely condition. Shipping took a couple of days longer than I hoped."),
                (5, "Perfect gift", "Bought this for a friend and they loved it."),
                (3, "Good, not amazing", "Nice piece but a little smaller than I pictured."),
                (5, "Five stars", "Seller was quick to reply and the item is gorgeous.")
            };
            for (var i = 0; i < reviewable.Count; i++)
            {
                for (var j = 0; j < 3; j++)
                {
                    var s = samples[(i + j) % samples.Length];
                    db.ProductReviews.Add(new ProductReview
                    {
                        TenantId = tenant.Id,
                        ProductId = reviewable[i].Id,
                        UserId = buyerPool[(i + j) % buyerPool.Length].Id,
                        Rating = s.Rating, Title = s.Title, Body = s.Body,
                        IsVerifiedPurchase = true,
                        CreatedAtUtc = DateTime.UtcNow.AddDays(-(i * 3 + j * 5 + 1))
                    });
                }
            }
        }
        await db.SaveChangesAsync();

        // Pays for `seatNumbers` on `raffle` as one completed Order split
        // between however many of them belong to `buyer` - mirrors exactly
        // what RaffleService.ReserveSeatsAsync + MarkSeatPaidAsync produce,
        // just constructed directly instead of driving the live endpoints.
        Order PaySeats(Raffle raffle, List<RaffleSeat> seats, ApplicationUser buyer, DateTime at)
        {
            var order = new Order
            {
                UserId = buyer.Id,
                OrderDateUtc = at,
                TotalAmount = raffle.SeatPrice * seats.Count,
                Status = OrderStatus.Completed,
                ShippingName = buyer.DisplayName,
                ShippingAddress = "Picked up in-store",
                PaymentProvider = "manual"
            };
            foreach (var seat in seats)
            {
                order.Items.Add(new OrderItem
                {
                    ProductId = 0,
                    ProductName = $"Seat #{seat.SeatNumber} – {raffle.Title}",
                    PriceAtPurchase = raffle.SeatPrice,
                    Quantity = 1
                });
                seat.Status = RaffleSeatStatus.Paid;
                seat.ReservedByUserId = buyer.Id;
                seat.ReservedAtUtc = at;
                seat.PaidAtUtc = at;
                seat.Order = order;
            }
            db.Orders.Add(order);
            return order;
        }

        Raffle BuildRaffle(string title, int seatCount, decimal seatPrice, RaffleDrawMode mode, params string[] prizeDescriptions)
        {
            var raffle = new Raffle
            {
                Title = title,
                SeatCount = seatCount,
                SeatPrice = seatPrice,
                Status = RaffleStatus.Open,
                DrawMode = mode,
                CreatedByUserId = creatorId,
                CreatedAtUtc = now
            };
            for (var i = 1; i <= seatCount; i++)
            {
                raffle.Seats.Add(new RaffleSeat { SeatNumber = i, Status = RaffleSeatStatus.Available });
            }
            for (var i = 0; i < prizeDescriptions.Length; i++)
            {
                raffle.Prizes.Add(new RafflePrize { Rank = i + 1, Description = prizeDescriptions[i] });
            }
            return raffle;
        }

        var paidAt = now.AddHours(-2);

        // Seeds one fully-paid, ReadyToDraw raffle for `baseTitle`'s mode,
        // but only if no raffle under that base title is currently still
        // Open/ReadyToDraw - otherwise a fresh numbered round is created so
        // this mode always has something ready to draw, independent of
        // whatever state the other modes' showcase raffles are in.
        async Task SeedOneReadyToDrawAsync(
            string baseTitle, int seatCount, decimal seatPrice, RaffleDrawMode mode, string[] prizeDescriptions)
        {
            var stillTestable = db.Raffles.Any(r =>
                r.Title.StartsWith(baseTitle) && (r.Status == RaffleStatus.Open || r.Status == RaffleStatus.ReadyToDraw));
            if (stillTestable) return;

            var round = db.Raffles.Count(r => r.Title.StartsWith(baseTitle)) + 1;
            var title = round > 1 ? $"{baseTitle} #{round}" : baseTitle;

            var raffle = BuildRaffle(title, seatCount, seatPrice, mode, prizeDescriptions);
            db.Raffles.Add(raffle);
            await db.SaveChangesAsync(); // seats/prizes need real ids before PaySeats can reference them

            // Round-robin every seat across all 5 buyers (one seat = one
            // order here, for maximum name variety) rather than a two-way
            // split, so a draw's winners are visibly spread across names.
            for (var i = 0; i < buyerPool.Length && i < raffle.SeatCount; i++)
            {
                var buyerSeats = raffle.Seats.Where(s => (s.SeatNumber - 1) % buyerPool.Length == i).ToList();
                if (buyerSeats.Count > 0) PaySeats(raffle, buyerSeats, buyerPool[i], paidAt);
            }
            raffle.Status = RaffleStatus.ReadyToDraw;
            await db.SaveChangesAsync();
            logger.LogInformation("Seeded ReadyToDraw showcase raffle '{Title}' ({Mode}) for demo tenant.", title, mode);
        }

        await SeedOneReadyToDrawAsync("Spin the Wheel Raffle", 8, 6.00m, RaffleDrawMode.Wheel,
            new[] { "A 10-gallon nano tank starter kit", "A bag of live aquarium plants" });
        await SeedOneReadyToDrawAsync("Duck Derby Raffle", 6, 7.50m, RaffleDrawMode.DuckRace,
            new[] { "A trio of assorted show guppies", "A premium aquarium filter", "A month of free fish food" });
        await SeedOneReadyToDrawAsync("Last One Standing Raffle", 6, 9.00m, RaffleDrawMode.LastManStanding,
            new[] { "A pair of dragon-scale bettas", "A 5-gallon desktop tank" });
        await SeedOneReadyToDrawAsync("Instant Reveal Raffle", 8, 5.00m, RaffleDrawMode.Instant,
            new[] { "A bag of premium fish flakes", "A magnetic tank cleaner" });

        // Mixed/Instant: refreshed the same way, but left in a realistic
        // in-progress state (some paid, some reserved, some still open) to
        // exercise the ordinary seat-picker flow rather than being drawable.
        const string mixedBaseTitle = "Mystery Tank Raffle";
        var mixedStillOpen = db.Raffles.Any(r => r.Title.StartsWith(mixedBaseTitle) && r.Status == RaffleStatus.Open);
        if (!mixedStillOpen)
        {
            var mixedRound = db.Raffles.Count(r => r.Title.StartsWith(mixedBaseTitle)) + 1;
            var mixedTitle = mixedRound > 1 ? $"{mixedBaseTitle} #{mixedRound}" : mixedBaseTitle;

            var mixedRaffle = BuildRaffle(mixedTitle, 10, 4.00m, RaffleDrawMode.Instant,
                new[] { "A surprise-grab-bag of tank accessories" });
            db.Raffles.Add(mixedRaffle);
            await db.SaveChangesAsync();

            PaySeats(mixedRaffle, mixedRaffle.Seats.Where(s => s.SeatNumber <= 4).ToList(), jon, paidAt);
            var reservedSeats = mixedRaffle.Seats.Where(s => s.SeatNumber is 5 or 6).ToList();
            var reservedOrder = new Order
            {
                UserId = maya.Id,
                OrderDateUtc = now.AddMinutes(-20),
                TotalAmount = mixedRaffle.SeatPrice * reservedSeats.Count,
                Status = OrderStatus.AwaitingPayment,
                ShippingName = maya.DisplayName,
                ShippingAddress = "Picked up in-store",
                PaymentProvider = "manual"
            };
            foreach (var seat in reservedSeats)
            {
                reservedOrder.Items.Add(new OrderItem
                {
                    ProductId = 0,
                    ProductName = $"Seat #{seat.SeatNumber} – {mixedRaffle.Title}",
                    PriceAtPurchase = mixedRaffle.SeatPrice,
                    Quantity = 1
                });
                seat.Status = RaffleSeatStatus.Reserved;
                seat.ReservedByUserId = maya.Id;
                seat.ReservedAtUtc = now.AddMinutes(-20);
                seat.Order = reservedOrder;
            }
            db.Orders.Add(reservedOrder);
            await db.SaveChangesAsync();
            logger.LogInformation("Seeded mixed-state showcase raffle '{Title}' for demo tenant.", mixedTitle);
        }
    }
}
