using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SellWithEllie.Models;
using SellWithEllie.Services;

namespace SellWithEllie.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    private readonly ITenantContext _tenantContext;

    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, ITenantContext tenantContext)
        : base(options)
    {
        _tenantContext = tenantContext;
    }

    // Not tenant-scoped - this is the table tenant resolution itself queries.
    public DbSet<Tenant> Tenants => Set<Tenant>();

    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductMedia> ProductMediaItems => Set<ProductMedia>();
    public DbSet<Auction> Auctions => Set<Auction>();
    public DbSet<Bid> Bids => Set<Bid>();
    public DbSet<Raffle> Raffles => Set<Raffle>();
    public DbSet<RaffleSeat> RaffleSeats => Set<RaffleSeat>();
    public DbSet<RafflePrize> RafflePrizes => Set<RafflePrize>();
    public DbSet<CartItem> CartItems => Set<CartItem>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatBlockedUser> ChatBlockedUsers => Set<ChatBlockedUser>();
    public DbSet<AuditLogEntry> AuditLogEntries => Set<AuditLogEntry>();
    public DbSet<ProductReview> ProductReviews => Set<ProductReview>();
    public DbSet<Coupon> Coupons => Set<Coupon>();
    public DbSet<ShippingMethod> ShippingMethods => Set<ShippingMethod>();

    // Per-shop storefront customisation (copy overrides + home-page blocks).
    public DbSet<TenantContent> TenantContents => Set<TenantContent>();
    public DbSet<TenantSection> TenantSections => Set<TenantSection>();

    // The platform's own marketing site - not tenant-scoped.
    public DbSet<PlatformContent> PlatformContents => Set<PlatformContent>();
    public DbSet<PlatformSection> PlatformSections => Set<PlatformSection>();

    public const string PlatformAdminRole = "PlatformAdmin";
    public const string AdminRole = "Admin";
    public const string CustomerRole = "Customer";

    // Fixed GUIDs so the seeded roles are deterministic across migrations.
    private const string PlatformAdminRoleId = "1a2b3c4d-0000-0000-0000-000000000001";
    private const string AdminRoleId = "8f14e45f-ceea-467e-9575-2d8b0e5b2a1b";
    private const string CustomerRoleId = "3c1c1e9b-2f8b-4a3a-9c2e-6e0a1b2c3d4e";

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<IdentityRole>().HasData(
            new IdentityRole { Id = PlatformAdminRoleId, Name = PlatformAdminRole, NormalizedName = PlatformAdminRole.ToUpperInvariant() },
            new IdentityRole { Id = AdminRoleId, Name = AdminRole, NormalizedName = AdminRole.ToUpperInvariant() },
            new IdentityRole { Id = CustomerRoleId, Name = CustomerRole, NormalizedName = CustomerRole.ToUpperInvariant() }
        );

        // ---- Tenant -----------------------------------------------------
        builder.Entity<Tenant>(entity =>
        {
            entity.HasIndex(t => t.Slug).IsUnique();
            entity.Property(t => t.CurrencyCode).HasMaxLength(3).HasDefaultValue("USD");
            entity.Property(t => t.LowStockThreshold).HasDefaultValue(5);
        });

        // ---- ApplicationUser: scope logins/registration to the current
        // shop. TenantId is nullable, so this filter also correctly matches
        // ONLY platform-admin accounts (TenantId == null) when no tenant is
        // resolved (root-domain / platform requests).
        builder.Entity<ApplicationUser>(entity =>
        {
            entity.HasQueryFilter(u => u.TenantId == _tenantContext.TenantId);

            entity.HasOne(u => u.Tenant)
                  .WithMany()
                  .HasForeignKey(u => u.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ---- Product --------------------------------------------------------
        builder.Entity<Product>(entity =>
        {
            entity.Property(p => p.Price).HasColumnType("decimal(18,2)");
            entity.HasIndex(p => p.Category);
            entity.HasIndex(p => p.Name);
            entity.HasIndex(p => new { p.TenantId, p.CreatedAtUtc });
            entity.HasQueryFilter(p => p.TenantId == _tenantContext.TenantId);
        });

        // ---- ProductMedia -----------------------------------------------
        builder.Entity<ProductMedia>(entity =>
        {
            entity.HasQueryFilter(m => m.TenantId == _tenantContext.TenantId);

            entity.HasOne(m => m.Product)
                  .WithMany(p => p.Media)
                  .HasForeignKey(m => m.ProductId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ---- Auction --------------------------------------------------
        builder.Entity<Auction>(entity =>
        {
            entity.Property(a => a.StartingPrice).HasColumnType("decimal(18,2)");
            entity.Property(a => a.MinIncrement).HasColumnType("decimal(18,2)");
            entity.Property(a => a.CurrentHighestAmount).HasColumnType("decimal(18,2)");
            entity.Property(a => a.BuyoutPrice).HasColumnType("decimal(18,2)");
            entity.Property(a => a.RowVersion).IsRowVersion();
            entity.HasIndex(a => new { a.TenantId, a.EndTimeUtc });

            // AuctionStatusBackgroundService sweeps every tenant's auctions
            // every 15s via IgnoreQueryFilters() (it has to - it's finding
            // work across every shop, not one), so the TenantId-prefixed
            // index above can't serve it at all: neither of its queries
            // filters by TenantId. Without these, both of that service's
            // queries are a full table scan of every auction ever created,
            // forever, on a fixed schedule - these composite indexes turn
            // them into small index seeks instead, since Scheduled/Active
            // auctions are always a tiny fraction of the table.
            entity.HasIndex(a => new { a.Status, a.StartTimeUtc });
            entity.HasIndex(a => new { a.Status, a.EndTimeUtc });

            entity.HasQueryFilter(a => a.TenantId == _tenantContext.TenantId);

            entity.HasOne(a => a.Product)
                  .WithOne(p => p.Auction)
                  .HasForeignKey<Auction>(a => a.ProductId)
                  .OnDelete(DeleteBehavior.Cascade);

            // A separate relationship from Auction -> its current-highest Bid.
            // Restrict delete behavior here (the Bids collection below already
            // cascades) so SQL Server doesn't reject the schema for having two
            // possible cascade paths between the same two tables.
            entity.HasOne(a => a.CurrentHighestBid)
                  .WithMany()
                  .HasForeignKey(a => a.CurrentHighestBidId)
                  .OnDelete(DeleteBehavior.Restrict)
                  .IsRequired(false);
        });

        // ---- Raffle / RaffleSeat -------------------------------------
        builder.Entity<Raffle>(entity =>
        {
            entity.Property(r => r.SeatPrice).HasColumnType("decimal(18,2)");
            entity.Property(r => r.RowVersion).IsRowVersion();
            entity.HasIndex(r => new { r.TenantId, r.Status });
            entity.HasQueryFilter(r => r.TenantId == _tenantContext.TenantId);

            entity.HasMany(r => r.Seats)
                  .WithOne(s => s.Raffle)
                  .HasForeignKey(s => s.RaffleId)
                  .OnDelete(DeleteBehavior.Cascade);

        });

        builder.Entity<RafflePrize>(entity =>
        {
            entity.HasIndex(p => new { p.RaffleId, p.Rank }).IsUnique();
            entity.HasQueryFilter(p => p.TenantId == _tenantContext.TenantId);

            entity.HasOne(p => p.Raffle)
                  .WithMany(r => r.Prizes)
                  .HasForeignKey(p => p.RaffleId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Separate relationship from RafflePrize -> its winning seat.
            // Restrict, same multiple-cascade-paths gotcha as the old
            // Raffle.WinningSeatId config this replaces (Auction.
            // CurrentHighestBidId has the identical shape).
            entity.HasOne(p => p.WinningSeat)
                  .WithMany()
                  .HasForeignKey(p => p.WinningSeatId)
                  .OnDelete(DeleteBehavior.Restrict)
                  .IsRequired(false);
        });

        builder.Entity<RaffleSeat>(entity =>
        {
            entity.Property(s => s.RowVersion).IsRowVersion();
            entity.HasIndex(s => new { s.RaffleId, s.SeatNumber }).IsUnique();
            entity.HasIndex(s => s.OrderId);
            entity.HasQueryFilter(s => s.TenantId == _tenantContext.TenantId);

            entity.HasOne(s => s.ReservedByUser)
                  .WithMany()
                  .HasForeignKey(s => s.ReservedByUserId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(s => s.Order)
                  .WithMany()
                  .HasForeignKey(s => s.OrderId)
                  .OnDelete(DeleteBehavior.Restrict)
                  .IsRequired(false);
        });

        // ---- ChatMessage / ChatBlockedUser --------------------------------
        builder.Entity<ChatMessage>(entity =>
        {
            entity.Property(m => m.Content).HasMaxLength(1000);
            entity.HasIndex(m => new { m.AuctionId, m.SentAtUtc });
            entity.HasIndex(m => new { m.RaffleId, m.SentAtUtc });
            entity.HasQueryFilter(m => m.TenantId == _tenantContext.TenantId);

            entity.HasOne(m => m.Auction)
                  .WithMany()
                  .HasForeignKey(m => m.AuctionId)
                  .OnDelete(DeleteBehavior.Cascade)
                  .IsRequired(false);

            entity.HasOne(m => m.Raffle)
                  .WithMany()
                  .HasForeignKey(m => m.RaffleId)
                  .OnDelete(DeleteBehavior.Cascade)
                  .IsRequired(false);

            entity.HasOne(m => m.User)
                  .WithMany()
                  .HasForeignKey(m => m.UserId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ChatBlockedUser>(entity =>
        {
            entity.HasQueryFilter(b => b.TenantId == _tenantContext.TenantId);
            entity.HasIndex(b => new { b.TenantId, b.UserId }).IsUnique();

            entity.HasOne(b => b.User)
                  .WithMany()
                  .HasForeignKey(b => b.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ---- ProductReview / Coupon / ShippingMethod ----------------------
        builder.Entity<ProductReview>(entity =>
        {
            entity.HasQueryFilter(r => r.TenantId == _tenantContext.TenantId);
            entity.HasIndex(r => new { r.ProductId, r.UserId }).IsUnique();
            entity.Property(r => r.Title).HasMaxLength(120);
            entity.Property(r => r.Body).HasMaxLength(2000);
            entity.HasOne(r => r.Product).WithMany().HasForeignKey(r => r.ProductId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Coupon>(entity =>
        {
            entity.HasQueryFilter(c => c.TenantId == _tenantContext.TenantId);
            entity.HasIndex(c => new { c.TenantId, c.Code }).IsUnique();
            entity.Property(c => c.Code).HasMaxLength(40);
            entity.Property(c => c.Value).HasColumnType("decimal(18,2)");
            entity.Property(c => c.MinSubtotal).HasColumnType("decimal(18,2)");
        });

        builder.Entity<ShippingMethod>(entity =>
        {
            entity.HasQueryFilter(s => s.TenantId == _tenantContext.TenantId);
            entity.Property(s => s.Name).HasMaxLength(80);
            entity.Property(s => s.EstimatedDelivery).HasMaxLength(80);
            entity.Property(s => s.Price).HasColumnType("decimal(18,2)");
            entity.Property(s => s.FreeOverSubtotal).HasColumnType("decimal(18,2)");
        });

        // ---- AuditLogEntry ------------------------------------------------
        builder.Entity<AuditLogEntry>(entity =>
        {
            entity.HasQueryFilter(e => e.TenantId == _tenantContext.TenantId);
            entity.HasIndex(e => new { e.TenantId, e.CreatedAtUtc });
            entity.Property(e => e.ActorUserId).HasMaxLength(450);
            entity.Property(e => e.ActorDisplayName).HasMaxLength(256);
            entity.Property(e => e.Action).HasMaxLength(64);
            entity.Property(e => e.TargetType).HasMaxLength(64);
            entity.Property(e => e.TargetId).HasMaxLength(128);
            entity.Property(e => e.Details).HasMaxLength(1024);
        });

        // ---- Bid ----------------------------------------------------------
        builder.Entity<Bid>(entity =>
        {
            entity.Property(b => b.Amount).HasColumnType("decimal(18,2)");
            entity.HasQueryFilter(b => b.TenantId == _tenantContext.TenantId);

            entity.HasOne(b => b.Auction)
                  .WithMany(a => a.Bids)
                  .HasForeignKey(b => b.AuctionId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(b => b.User)
                  .WithMany()
                  .HasForeignKey(b => b.UserId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ---- CartItem -------------------------------------------------
        builder.Entity<CartItem>(entity =>
        {
            entity.HasIndex(c => new { c.UserId, c.ProductId }).IsUnique();
            entity.HasQueryFilter(c => c.TenantId == _tenantContext.TenantId);
            entity.Property(c => c.Quantity).HasDefaultValue(1);

            entity.HasOne(c => c.User)
                  .WithMany()
                  .HasForeignKey(c => c.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(c => c.Product)
                  .WithMany()
                  .HasForeignKey(c => c.ProductId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ---- Order / OrderItem -----------------------------------------
        builder.Entity<Order>(entity =>
        {
            entity.Property(o => o.TotalAmount).HasColumnType("decimal(18,2)");
            entity.Property(o => o.ShippingCost).HasColumnType("decimal(18,2)");
            entity.Property(o => o.DiscountAmount).HasColumnType("decimal(18,2)");
            entity.Property(o => o.ShippingMethodName).HasMaxLength(80);
            entity.Property(o => o.Carrier).HasMaxLength(60);
            entity.Property(o => o.TrackingNumber).HasMaxLength(80);
            entity.Property(o => o.CouponCode).HasMaxLength(40);
            entity.Property(o => o.GuestEmail).HasMaxLength(256);
            entity.Property(o => o.PaymentProvider).HasMaxLength(32).HasDefaultValue("simulated");
            entity.Property(o => o.PaymentReference).HasMaxLength(128);
            entity.HasIndex(o => new { o.TenantId, o.OrderDateUtc });
            entity.HasQueryFilter(o => o.TenantId == _tenantContext.TenantId);

            entity.HasOne(o => o.User)
                  .WithMany()
                  .HasForeignKey(o => o.UserId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<OrderItem>(entity =>
        {
            entity.Property(oi => oi.PriceAtPurchase).HasColumnType("decimal(18,2)");
            entity.Property(oi => oi.Quantity).HasDefaultValue(1);
            entity.HasQueryFilter(oi => oi.TenantId == _tenantContext.TenantId);

            entity.HasOne(oi => oi.Order)
                  .WithMany(o => o.Items)
                  .HasForeignKey(oi => oi.OrderId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ---- TenantContent / TenantSection --------------------------------
        builder.Entity<TenantContent>(entity =>
        {
            entity.HasQueryFilter(c => c.TenantId == _tenantContext.TenantId);
            entity.Property(c => c.Key).HasMaxLength(128);
            entity.HasIndex(c => new { c.TenantId, c.Key }).IsUnique();
        });

        builder.Entity<TenantSection>(entity =>
        {
            entity.HasQueryFilter(s => s.TenantId == _tenantContext.TenantId);
            entity.Property(s => s.Kind).HasMaxLength(64);
            entity.HasIndex(s => new { s.TenantId, s.Position });
        });

        // ---- PlatformContent / PlatformSection (not tenant-scoped) --------
        builder.Entity<PlatformContent>(entity =>
        {
            entity.Property(c => c.Key).HasMaxLength(128);
            entity.HasIndex(c => c.Key).IsUnique();
        });

        builder.Entity<PlatformSection>(entity =>
        {
            entity.Property(s => s.Kind).HasMaxLength(64);
            entity.HasIndex(s => s.Position);
        });
    }

    // Every ITenantScoped entity gets its TenantId stamped automatically on
    // insert, from whatever tenant this request/scope resolved to. This
    // means a controller can never forget to set it, and can never be
    // tricked into setting a different tenant's id.
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampTenantId();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        StampTenantId();
        return await base.SaveChangesAsync(cancellationToken);
    }

    private void StampTenantId()
    {
        var addedTenantScoped = ChangeTracker.Entries<ITenantScoped>()
            .Where(e => e.State == EntityState.Added);

        foreach (var entry in addedTenantScoped)
        {
            if (entry.Entity.TenantId == 0)
            {
                if (_tenantContext.TenantId is null)
                {
                    throw new InvalidOperationException(
                        "Attempted to create tenant-scoped data with no resolved tenant for this request.");
                }
                entry.Entity.TenantId = _tenantContext.TenantId.Value;
            }
        }
    }
}
