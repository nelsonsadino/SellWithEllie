# Architecture

## Big picture

One React build, one API deployment, one database. Which **shop (tenant)** a request
belongs to is resolved per request, not per deployment.

```
Browser ── hostname ──► one of three SPA trees (client/src/main.jsx)
                          ├─ {slug}.host        → App.jsx           (storefront)
                          ├─ host / www.host    → apps/MarketingApp (landing + signup)
                          └─ admin.host         → apps/PlatformApp  (console)
        │
        │  every API call carries  X-Tenant-Slug: {slug}  (shop mode only)
        ▼
ASP.NET Core pipeline (server/Program.cs)
  ForwardedHeaders → HTTPS redirect → CORS → TenantResolutionMiddleware
  → RateLimiter → Authentication → tenant/JWT match → Authorization → Controllers / Hub
        │
        ▼
EF Core (Data/ApplicationDbContext.cs)
  global query filters add  WHERE TenantId = @current  to every tenant-scoped table
  SaveChanges override stamps TenantId on every new tenant-scoped row
        │
        ▼
SQL Server — one shared database
```

## The three front-end "sites"

`client/src/lib/siteContext.js` inspects `window.location.hostname` once, before anything
mounts, and `main.jsx` renders one of three independent trees:

| Hostname | Tree | Purpose | Tenant? |
|----------|------|---------|---------|
| `{slug}.yourdomain.com` / `{slug}.localhost` | `src/App.jsx` | The storefront | Yes — `slug` |
| `yourdomain.com` / `www.yourdomain.com` | `src/apps/MarketingApp.jsx` | Landing page + self-serve signup | No |
| `admin.yourdomain.com` | `src/apps/PlatformApp.jsx` | Platform-owner console | No |

In local dev with no `VITE_ROOT_DOMAIN`, plain `localhost:5173` is treated as the shop
named by `VITE_DEV_TENANT_SLUG` (default `demo`), so the storefront works with no
hosts-file edits. Any `*.localhost` subdomain resolves to your machine automatically in
modern browsers.

The storefront always sends `X-Tenant-Slug` **explicitly** (not relying on its own
hostname) because the SPA and API can live on entirely different domains.

## Multi-tenancy

**Data isolation.** Every tenant-owned table implements `ITenantScoped` and has a
`TenantId` column: `Products`, `Auctions`, `Bids`, `CartItems`, `Orders`, `OrderItems`,
`ProductMedia`, `TenantContent`, `TenantSection`, `ChatMessage`, `ChatBlockedUser`, and
shop-level `ApplicationUser` rows.

`ApplicationDbContext` adds a global query filter (`x => x.TenantId == _tenantContext.TenantId`)
to each of these, so every query is automatically narrowed to the current tenant. The
`SaveChanges`/`SaveChangesAsync` override stamps `TenantId` onto every newly-added
tenant-scoped entity. A controller has to opt **out** (`IgnoreQueryFilters()`) to see
another shop's rows — the default is safe.

**Which tenant is current?** `Middleware/TenantResolutionMiddleware.cs` resolves it once
per request, in order:

1. `X-Tenant-Slug` request header (how the SPA always talks to the API), then
2. the first label of the `Host` header (`acme.example.com` → `acme`).

`ITenantContext` (scoped) holds the result. Tenant-scoped controllers extend
`TenantScopedControllerBase`, which **404s the whole request** if no tenant resolved —
failing closed.

**Auth is tenant-bound.** A shop user's JWT carries a `tid` (tenant id) claim. A
middleware in `Program.cs` returns `401` if the token's tenant doesn't match the resolved
tenant, so a token minted for one shop can't be replayed against another. Platform-admin
tokens carry no `tid` and skip the check.

**Live bidding is isolated too.** SignalR groups are `auction-{tenantId}-{auctionId}` and
`AuctionHub.JoinAuction` validates the pair exists before adding a connection, so an
auction-id collision between two shops can't cross live updates.

## Authentication & sessions

- **Password hashing:** ASP.NET Core Identity (PBKDF2). Policy: 8+ chars, upper + lower +
  digit. Lockout: 8 failed attempts → 10-minute lock (returns `429`).
- **Tokens:** JWT bearer, HS256, 60-minute lifetime (`Jwt:ExpiryMinutes`), issuer +
  audience + lifetime validated, 30 s clock skew. The SPA stores the token in
  `localStorage` and sends it as `Authorization: Bearer …`.
- **Server-side revocation:** each token carries an `sstamp` claim — a snapshot of the
  user's Identity `SecurityStamp`. `JwtBearerEvents.OnTokenValidated` compares it to the
  current value (cached 60 s). `POST /api/auth/logout` rotates the stamp, invalidating
  every token for that account on all devices. A password change rotates it too.
- **Client expiry handling:** `api/client.js` won't send a request with an expired token,
  and treats a `401` on an authenticated call as a dead session. `AuthContext` then
  clears local state and redirects to `/login?returnTo=<path>` (also on a proactive timer
  at token expiry), so an expired session lands the user on login with their destination
  preserved.
- **Social login:** Google / Facebook, storefront customers only. Because providers don't
  allow wildcard redirect URIs, the whole OAuth round trip happens on the API's fixed
  domain (`/signin-google`, `/signin-facebook`); the shop slug is carried through and back,
  `ExternalAuthController` finds-or-creates the `Customer` account, mints a normal JWT, and
  redirects the browser to that shop's `/login` with the token in the URL **fragment**
  (never sent in an HTTP request). See `CONFIGURATION.md` for provider setup.

## Real-time (SignalR)

Hub: `/hubs/auction`. Group: `auction-{tenantId}-{auctionId}`. The browser can't set an
`Authorization` header on the WebSocket handshake, so the token is passed as
`?access_token=…` on that path only (`Program.cs` `OnMessageReceived`).

| Event | Sent when | Payload |
|-------|-----------|---------|
| `BidPlaced` | A bid is accepted | auction id, new amount, bidder display name, bid count |
| `AuctionStarted` | The background service opens a scheduled auction | `{ auctionId }` |
| `AuctionClosed` | Timer ends, or a Buy-It-Now completes | auction id, winner info, `closedViaBuyout` |
| `ChatMessageReceived` | A chat message is posted | `ChatMessageDto` (opaque `authorRef`, no user id) |

## Background jobs

`Services/AuctionStatusBackgroundService.cs` is a hosted service that wakes on a short
interval to flip `Scheduled → Active` at start time and `Active → Closed` at end time,
broadcasting `AuctionStarted` / `AuctionClosed`. This means auctions open and close on
schedule even with nobody watching.

## Concurrency safety

Auction rows have a SQL Server `rowversion` used as an EF Core optimistic-concurrency
token. Two bids racing to become the new highest can't both win — the loser gets a clear
"someone just bid, please retry" error instead of a corrupted price.

## Production hardening & cross-cutting services

The app runs as a single, well-tuned instance rather than a horizontally-scaled cluster
(a deliberate choice, not an oversight — see [OPERATIONS.md](OPERATIONS.md#capacity-notes)
for the reasoning and what scaling out would require). What "hardened single instance"
means concretely:

- **Structured logging** (`Program.cs`, `builder.Host.UseSerilog`) — every request logs
  one summary line, and every `ILogger<T>` call app-wide (auth events, unhandled
  exceptions, audit-log failures, background-service errors) is written as structured
  data to both the console and a rolling JSON file (`server/logs/`), so production issues
  are diagnosable without attaching a debugger or waiting on an APM contract.
- **`/health`** — a liveness/readiness endpoint that actually checks the database, for
  load balancers and orchestrators to detect a wedged instance.
- **Transient-fault retry** (`AddDbContext` + `EnableRetryOnFailure`) — brief SQL Server
  blips/failovers are retried automatically instead of surfacing as a 500. `AddDbContextPool`
  was considered and rejected: it would reuse the `ITenantContext` captured on a pooled
  context's first construction across later requests for different tenants — a cross-
  tenant data leak — to save an allocation that's already cheap relative to the DB call
  itself.
- **Output caching** (`IOutputCacheStore`, policy `"PublicCatalog"`) — the public,
  unauthenticated catalogue reads (`GET /api/products`, `.../categories`,
  `GET /api/auctions`) are cached for 20s, varied by `X-Tenant-Slug`/`Host` so shops never
  share a response, and evicted immediately (tag `"catalog"`) on any admin product/auction
  write — so a traffic spike is absorbed by the cache, not the database, without ever
  serving one shop's stale data to another or missing an admin's own edit.
- **Transactional email** (`IEmailSender` / `EmailSender`) — same graceful-degradation
  shape as `IBlobStorageService`/`IXenditClient`: unconfigured means every send is a
  logged no-op, never a failed request. Fired from `AuthController` (welcome),
  `CartController`/`AuctionService` (order confirmation on checkout/buyout),
  `AuctionService` (outbid), and `AuctionStatusBackgroundService` (won).
- **Admin audit log** (`IAuditLogService` → `AuditLogEntry`, `GET /api/audit-log`) — an
  append-only, tenant-scoped record of who changed which product/auction and every chat
  block/unblock. Denormalized (actor name captured from the JWT at write time) so it stays
  readable even if that admin's account is later renamed or removed; a write failure is
  logged and swallowed rather than failing the action it's recording.

## The storefront CMS

### Content (copy overrides)

`TenantContent` is a per-tenant key/value store. The client resolves a string through
`useContent()` → `t(key, fallback)`:

```
tenant.content[key]  →  DEFAULT_CONTENT[key] (client/src/lib/defaultContent.js)  →  fallback arg
```

Nothing breaks when a key is unset. The platform's marketing site mirrors this with
`PlatformContent`.

### Blocks (home-page sections)

`TenantSection` rows: `Kind` + `Position` + `IsVisible` + opaque `DataJson`.
`components/SectionRenderer.jsx` maps `kind → component`; `lib/sectionSchema.js` drives
the generic block editor and the default data for each kind. Because `DataJson` is opaque,
**new block types never need a migration** — only an entry in `sectionSchema.js`, a
component in `components/sections/`, a line in `SectionRenderer`'s registry, and the kind
string added to `server/Data/TenantDefaults.cs` (`SectionKinds`).

Block kinds: `hero`, `carousel`, `videoBanner`, `uspStrip`, `lookbook`, `newsletter`,
`featureGrid`, `richText`, `gallery`, `cta`, `productGrid` (live data), `auctionTicker`
(live data).

The platform marketing site uses the same renderer over `PlatformSection` rows.

### Theming

`data-theme-template` (one of 9) and `data-theme` (`light` / `dark`, or absent = follow
OS) are set on `<html>` by `context/ThemeContext.jsx` from the resolved tenant's
`ThemeTemplate` / `ThemeMode`. `styles/tokens.css` defines every design token per template
× light/dark; `styles/theme.css` is the component layer that only ever reads tokens. See
[THEMING.md](THEMING.md).

## Request lifecycle (a storefront page load)

1. `main.jsx` picks the storefront tree from the hostname.
2. `TenantProvider` calls `GET /api/tenant/current` with `X-Tenant-Slug`.
3. `TenantResolutionMiddleware` sets `ITenantContext`; `TenantController` returns identity
   + `themeTemplate` + `themeMode` + `content` + visible `sections`.
4. `ThemeContext` stamps `<html>`; `SectionRenderer` renders the blocks; live blocks
   (`productGrid`, `auctionTicker`) fetch their own data.
5. Authenticated calls attach the bearer token; the tenant/JWT-match middleware guards
   cross-shop replay.

## Data model (tenant-scoped unless noted)

| Entity | Notes |
|--------|-------|
| `Tenant` *(not scoped)* | slug, name, plan, subscription status, `ThemeTemplate`, `ThemeMode`, `IsActive` |
| `ApplicationUser` | Identity user; shop users have `TenantId`, platform admins have `null` |
| `Product` / `ProductMedia` | generic listing; up to 5 media items |
| `Auction` / `Bid` | scheduled/active/closed/cancelled; `BuyoutPrice`, `rowversion` |
| `CartItem` / `Order` / `OrderItem` | fixed-price purchase flow (mock payment) |
| `TenantContent` / `TenantSection` | storefront copy + home-page blocks |
| `ChatMessage` / `ChatBlockedUser` | per-auction chat + shop-wide chat blocks |
| `AuditLogEntry` | append-only admin action log (product/auction/chat moderation) |
| `PlatformContent` / `PlatformSection` *(not scoped)* | marketing-site copy + blocks |
