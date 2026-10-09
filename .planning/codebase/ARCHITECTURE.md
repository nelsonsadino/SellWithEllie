<!-- refreshed: 2026-10-09 -->
# Architecture

**Analysis Date:** 2026-10-09

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Browser — one React/Vite build, three SPA trees chosen by hostname   │
│ `client/src/main.jsx` → `client/src/lib/siteContext.js`              │
├───────────────────┬─────────────────────────┬────────────────────────┤
│ {slug}.host       │ host / www.host         │ admin.host             │
│ `client/src/App`  │ `apps/MarketingApp.jsx` │ `apps/PlatformApp.jsx` │
│ (storefront)      │ (landing + signup)      │ (platform console)     │
└────────┬──────────┴────────────┬────────────┴───────────┬────────────┘
         │ REST JSON (X-Tenant-Slug, Bearer JWT) + SignalR WebSocket
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│ ASP.NET Core 8 pipeline — `server/Program.cs`                        │
│ ForwardedHeaders → HTTPS → CORS → `TenantResolutionMiddleware`       │
│ → RateLimiter → Authentication → tenant/JWT match → Authorization    │
│ → OutputCache → Controllers (`server/Controllers`) / Hubs            │
└────────┬─────────────────────────────────────────────┬───────────────┘
         ▼                                             ▼
┌──────────────────────────────┐      ┌────────────────────────────────┐
│ Services (`server/Services`) │      │ Hubs (`server/Hubs`)           │
│ domain + external clients    │      │ AuctionHub, RaffleHub          │
└────────┬─────────────────────┘      └────────────────────────────────┘
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│ EF Core — `server/Data/ApplicationDbContext.cs`                      │
│ global query filters on tenant-scoped entities; SaveChanges stamps   │
│ TenantId                                                             │
└────────┬─────────────────────────────────────────────────────────────┘
         ▼
   SQL Server (single shared database)
   + Azure Blob Storage (`server/Services/BlobStorageService.cs`)
   + Xendit payments/billing (`server/Services/XenditClient.cs`)
```

## Pattern Overview

**Overall:** Modular monolith. One ASP.NET Core API and one React SPA build, serving
many shops (multi-tenant, shared database with a `TenantId` discriminator). Layered
MVC-style backend with a service layer and EF Core; a context/provider-based React
frontend with a thin API client layer.

**Key Characteristics:**
- Tenant is resolved per request, not per deployment (`server/Middleware/TenantResolutionMiddleware.cs`).
- Fail-closed tenancy: controllers deriving from `TenantScopedControllerBase`
  (`server/Controllers/TenantScopedControllerBase.cs`) return 404 when no tenant resolves.
- Data isolation is enforced in the ORM, not by hand in each query
  (`server/Data/ApplicationDbContext.cs`).
- Deliberately a single API instance (see `docs/OPERATIONS.md` capacity notes); in-process
  state such as `ChatRateLimiter` and `TenantCache` is therefore acceptable.
- Real-time features are SignalR hubs plus one hosted background service for auction
  timing.

## Layers

**Presentation (HTTP):**
- Purpose: Route HTTP requests, validate input shape, map to DTOs.
- Location: `server/Controllers/`, `server/Dtos/`
- Contains: 20 controllers, each with `[Route("api/...")]`, plus request/response DTO records.
- Depends on: `server/Services/`, `server/Mapping/MappingExtensions.cs`
- Used by: Browser SPAs via `client/src/api/*.js`

**Real-time:**
- Purpose: Push live bid, auction, and raffle/chat updates.
- Location: `server/Hubs/AuctionHub.cs`, `server/Hubs/RaffleHub.cs`
- Mounted at: `/hubs/auction`, `/hubs/raffle` (`server/Program.cs`)
- Depends on: `server/Services/AuctionService.cs`, `server/Services/RaffleService.cs`
- Used by: `client/src/components/AuctionChat.jsx`, `RaffleChat.jsx`, ticker/spotlight components

**Application / domain services:**
- Purpose: Business rules (auction lifecycle, checkout pricing, raffles, chat moderation, audit).
- Location: `server/Services/` (34 files; interfaces prefixed `I` sit beside implementations)
- Contains: `AuctionService`, `CheckoutService`, `CheckoutPricing`, `RaffleService`,
  `RaffleDrawTiming`, `TokenService`, `AuditLogService`, `ProfanityFilterService`,
  `ChatRateLimiter`, `ReturnUrlValidator`, `SecretCipher`, `TenantPaymentService`
- Depends on: `server/Data/ApplicationDbContext.cs`, external clients
- Used by: Controllers, hubs, `server/Services/AuctionStatusBackgroundService.cs`

**Data access:**
- Purpose: Persistence and tenant scoping.
- Location: `server/Data/` (`ApplicationDbContext.cs`, `DbInitializer.cs`, `SlugRules.cs`, `TenantDefaults.cs`),
  `server/Models/` (entities), `server/Migrations/` (EF Core migrations, 2026-08 to 2026-09)
- Depends on: SQL Server via `UseSqlServer` (`server/Program.cs`)
- Used by: Services and some controllers directly

**Configuration:**
- Purpose: Strongly typed settings bound from `appsettings*.json`.
- Location: `server/Config/` (`JwtSettings`, `EmailSettings`, `XenditSettings`,
  `PaymentsSettings`, `BlobStorageSettings`, `ExternalAuthSettings`, `PlanLimits`)

**Frontend presentation:**
- Purpose: Render storefront, marketing, and admin UIs.
- Location: `client/src/pages/`, `client/src/components/`, `client/src/components/sections/`
- Contains: Route-level pages, reusable UI, and a section renderer that builds storefront
  home pages from tenant-configured section data (`components/SectionRenderer.jsx`).

**Frontend state:**
- Purpose: Cross-cutting client state via React context.
- Location: `client/src/context/` — `AuthContext`, `TenantContext`, `CartContext`,
  `ThemeContext`, `ToastContext`, `ConfirmContext`
- Depends on: `client/src/api/`, `client/src/lib/`

**Frontend API client:**
- Purpose: One module per backend resource, all going through a shared `request()` helper.
- Location: `client/src/api/` (`client.js` plus `auth.js`, `products.js`, `auctions.js`,
  `raffles.js`, `cart.js`, `orders.js`, `billing.js`, `platform.js`, `tenant.js`, and others)

## Data Flow

### Primary Storefront Request Path

1. Browser loads `{slug}` subdomain; `client/src/main.jsx` picks `App` via `siteContext`.
2. `client/src/context/TenantContext.jsx` fetches tenant settings (`client/src/api/tenant.js`).
3. Page component (e.g. `client/src/pages/ProductsPage.jsx`) calls `client/src/api/products.js`.
4. `client/src/api/client.js` `request()` attaches `X-Tenant-Slug` and, if present, `Authorization: Bearer`.
5. `server/Middleware/TenantResolutionMiddleware.cs` sets `ITenantContext` from header or host label.
6. `server/Controllers/ProductsController.cs` (extends `TenantScopedControllerBase`) calls the DB.
7. EF Core applies `TenantId` filter from `server/Data/ApplicationDbContext.cs`; result returned as DTO.

### Auction Bid Path

1. `client/src/pages/AuctionDetailPage.jsx` posts a bid through `client/src/api/auctions.js`.
2. `server/Controllers/AuctionsController.cs` delegates to `server/Services/AuctionService.cs`.
3. Service updates the `Auction` row; the `rowversion` token rejects racing writers
   (optimistic concurrency).
4. Accepted bid triggers a `BidPlaced` broadcast to group `auction-{tenantId}-{auctionId}`
   via `AuctionHub`; clients receive it in `AuctionDetailPage.jsx` / `AuctionTicker.jsx`.

### Background Auction Lifecycle

1. `server/Services/AuctionStatusBackgroundService.cs` (hosted service) wakes on an interval.
2. Flips `Scheduled → Active` and `Active → Closed` by time.
3. Broadcasts `AuctionStarted` / `AuctionClosed` through the hub.

### Authentication Flow

1. `client/src/api/auth.js` posts credentials to `server/Controllers/AuthController.cs`.
2. `server/Services/TokenService.cs` issues an HS256 JWT with `tid` and `sstamp` claims.
3. `client/src/api/client.js` stores the token (`localStorage`, key `auth_token`) and
   `client/src/context/AuthContext.jsx` manages session state and expiry redirects.
4. Each request is revalidated against the user's SecurityStamp in the JWT event handler in `server/Program.cs`.

**State Management:**
- Server: stateless per request; durable state lives in SQL Server. In-memory singletons
  hold caches and rate-limit counters.
- Client: React context providers plus `localStorage` for auth token, guest cart
  (`client/src/lib/guestCart.js`), wishlist, and recently viewed items.

## Key Abstractions

**ITenantScoped:**
- Purpose: Marks entities that belong to one shop.
- Examples: `server/Models/ITenantScoped.cs`, `server/Models/Product.cs`, `server/Models/Order.cs`
- Pattern: Interface with `TenantId`; EF global query filter plus automatic stamping on save.

**TenantScopedControllerBase:**
- Purpose: Base class enforcing a resolved tenant before any action runs.
- Examples: `server/Controllers/TenantScopedControllerBase.cs`
- Pattern: `IActionFilter` on `OnActionExecuting`; returns 404 if `TenantId` is null.

**Service interface + implementation pairs:**
- Purpose: Injectable seams for domain logic and external systems.
- Examples: `server/Services/IAuctionService.cs` / `AuctionService.cs`,
  `IRaffleService.cs` / `RaffleService.cs`, `IXenditClient.cs` / `XenditClient.cs`,
  `IEmailSender.cs` / `EmailSender.cs`
- Pattern: Lifetimes registered in `server/Program.cs` (scoped for per-request domain
  services, singleton for stateless or cross-request infrastructure).

**Section-driven storefront:**
- Purpose: Tenants compose their home page from ordered sections.
- Examples: `server/Models/TenantSection.cs`, `client/src/lib/sectionSchema.js`,
  `client/src/components/SectionRenderer.jsx`, `client/src/components/sections/*.jsx`
- Pattern: Data-driven registry mapping section type → React component.

**Theme templates:**
- Purpose: Per-tenant visual theme chosen from a catalogue.
- Examples: `client/src/lib/templateCatalog.js`, `client/src/context/ThemeContext.jsx`,
  `client/src/styles/tokens.css`, `client/src/styles/theme.css`

## Entry Points

**Backend host:**
- Location: `server/Program.cs`
- Triggers: Process start (`dotnet run`, IIS/Kestrel)
- Responsibilities: Registers DI, EF Core, Identity, JWT, SignalR, rate limiter, output
  cache, Serilog, health checks; builds the middleware pipeline; maps controllers and hubs.

**Background worker:**
- Location: `server/Services/AuctionStatusBackgroundService.cs`
- Triggers: Hosted service started with the app
- Responsibilities: Auction status transitions and broadcasts.

**Frontend bootstrap:**
- Location: `client/src/main.jsx`
- Triggers: Browser load of `index.html`
- Responsibilities: Selects one of three lazy-loaded trees by hostname and mounts it under
  `BrowserRouter`, `AuthProvider`, `ToastProvider`, `ConfirmProvider`, `ThemeProvider`.

**Storefront router:**
- Location: `client/src/App.jsx`
- Triggers: Hostname resolves to a shop slug
- Responsibilities: Declares storefront routes (`/products`, `/auctions`, `/raffles`,
  `/cart`, `/checkout`, `/orders` with `ProtectedRoute`, `/admin` with `AdminRoute`).

**Marketing and platform roots:**
- Locations: `client/src/apps/MarketingApp.jsx`, `client/src/apps/PlatformApp.jsx`
- Triggers: Hostname is the root domain or `admin.` subdomain.

**Webhooks:**
- Locations: `server/Controllers/PaymentsController.cs` (`api/payments/webhook`),
  `server/Controllers/BillingWebhookController.cs` (`api/billing/webhook`)
- Triggers: External payment provider callbacks; these are unauthenticated by JWT and must
  verify provider signatures.

## Architectural Constraints

- **Threading:** ASP.NET Core thread pool for requests; one hosted background loop for auction timing.
- **Global state:** Singletons in `server/Services/TenantCache.cs`, `ChatRateLimiter.cs`,
  `ProfanityFilterService.cs`, `TenantPaymentService.cs`. Safe only while the app runs as a single instance.
- **Tenant context:** `TenantContext` is scoped; never capture it in a singleton or in a
  pooled DbContext (`docs/ARCHITECTURE.md` documents why `AddDbContextPool` was rejected).
- **Circular imports:** None observed among the `client/src/lib/` modules that were checked;
  `client/src/api/client.js` imports `lib/siteContext.js` only.
- **Hostname-driven bootstrap:** Changing domain layout requires changes to `client/src/lib/siteContext.js` and server host handling together.

## Anti-Patterns

### Unscoped queries that bypass the tenant filter

**What happens:** Code calls `IgnoreQueryFilters()` or reads tenant data without a tenant check.
**Why it's wrong:** Leaks one shop's rows to another.
**Do this instead:** Keep the default filter. Use `IgnoreQueryFilters()` only in platform-admin
paths such as `server/Controllers/PlatformController.cs`, and make the tenant explicit there.

### Singleton services that hold tenant-specific data

**What happens:** Adding per-shop state to a singleton like `TenantCache` or a rate limiter keyed without tenant id.
**Why it's wrong:** Collisions across shops and stale data.
**Do this instead:** Key any cache or limiter by `TenantId` (as `ChatRateLimiter` and `TenantCache` do) and register per-request state as scoped.

### Direct `fetch` calls in components

**What happens:** Components call `fetch` directly instead of an API module.
**Why it's wrong:** Skips the shared auth header, tenant header, and 401 handling in `client/src/api/client.js`.
**Do this instead:** Add a function to the relevant `client/src/api/*.js` module and call `request()`.

## Error Handling

**Strategy:** Exceptions bubble to a global handler in production; controllers return
explicit status codes for expected failures; the client maps errors to toasts.

**Patterns:**
- `UseExceptionHandler` in `server/Program.cs` for unhandled errors (developer page in Development only).
- Controllers return `NotFound`, `BadRequest`, `Unauthorized`, or `429` (rate limit) with a `{ message }` body.
- Concurrency conflicts on auction rows return a retry-friendly error message.
- Client `request()` in `client/src/api/client.js` throws on non-2xx; `ToastContext` surfaces the message.

## Cross-Cutting Concerns

**Logging:** Serilog (`builder.Host.UseSerilog`) with console and rolling JSON file under `server/logs/`; request summary via `UseSerilogRequestLogging`.
**Validation:** DTO shape checks via ASP.NET Core model binding; upload checks in `server/Services/UploadValidation.cs`; return URLs checked by `server/Services/ReturnUrlValidator.cs`.
**Authentication:** ASP.NET Core Identity plus JWT bearer; tenant-bound tokens; SignalR token via `?access_token=` on hub paths only.
**Caching:** Output cache policy `PublicCatalog` for anonymous catalogue reads; in-memory `TenantCache` for tenant lookup.
**Rate limiting:** ASP.NET Core rate limiter middleware plus chat-specific limiter.

---

*Architecture analysis: 2026-10-09*
