# Codebase Structure

**Analysis Date:** 2026-10-09

## Directory Layout

```
SellWithEllie/                     # repo root
├── client/                        # React + Vite SPA (all three front-end trees)
│   ├── src/
│   │   ├── main.jsx               # Hostname-based bootstrap
│   │   ├── App.jsx                # Storefront router
│   │   ├── apps/                  # MarketingApp, PlatformApp roots
│   │   ├── api/                   # One module per backend resource + client.js
│   │   ├── components/            # Shared UI; sections/ and marketing/ subfolders
│   │   ├── context/               # React context providers
│   │   ├── lib/                   # Pure helpers, site context, catalogues, guest storage
│   │   ├── pages/                 # Route-level pages; admin/, marketing/, platform/ subfolders
│   │   └── styles/                # fonts.css, tokens.css, theme.css
│   ├── public/                    # Static assets (media/, _headers)
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .oxlintrc.json             # Linter config
├── server/                        # ASP.NET Core 8 API (SellWithEllie.csproj)
│   ├── Program.cs                 # Host, DI, middleware pipeline, endpoint mapping
│   ├── Config/                    # Strongly typed settings classes
│   ├── Controllers/               # API controllers (api/* routes)
│   ├── Data/                      # ApplicationDbContext, DbInitializer, tenant seed helpers
│   ├── Dtos/                      # Request/response records per domain
│   ├── Hubs/                      # SignalR hubs
│   ├── Json/                      # JSON converters
│   ├── Mapping/                   # Entity → DTO mapping extensions
│   ├── Middleware/                # TenantResolutionMiddleware
│   ├── Migrations/                # EF Core migrations + snapshot
│   ├── Models/                    # EF entities and enums
│   ├── Services/                  # Domain services, interfaces, external clients
│   ├── Properties/                # launchSettings.json
│   ├── appsettings.json           # Base configuration
│   └── appsettings.Development.json
├── docs/                          # Human docs: ARCHITECTURE, API, CONFIGURATION, DEPLOYMENT, OPERATIONS, THEMING, USER_MANUAL
├── .github/workflows/             # CI (security.yml)
├── .claude/, .agents/             # Agent skill and tooling config (not application code)
├── .impeccable/                   # Design tooling state
├── .planning/                     # GSD planning artifacts (excluded from app analysis)
├── CHANGELOG.md, README.md, CONTRIBUTING.md, SECURITY.md, PRODUCT.md
└── skills-lock.json
```

Generated and excluded from source reads: `server/bin/`, `server/obj/`, `server/.vs/`,
`client/node_modules/`, `client/dist/` (build output).

## Directory Purposes

**`client/src/api/`:**
- Purpose: HTTP access layer, one file per backend area.
- Contains: `client.js` (shared `request()`, token storage, 401 handling), `auth.js`,
  `auctions.js`, `raffles.js`, `products.js`, `cart.js`, `orders.js`, `billing.js`,
  `platform.js`, `tenant.js`, `marketing.js`, `signup.js`, `chat.js`, `reports.js`,
  `auditLog.js`, `shop.js`
- Key files: `client/src/api/client.js`

**`client/src/components/`:**
- Purpose: Reusable UI widgets.
- Contains: Flat list of ~40 components (e.g. `ProductCard.jsx`, `AuctionCard.jsx`,
  `Navbar.jsx`, `Modal.jsx`, `RouteGuards.jsx`), plus:
  - `components/sections/`: storefront section types rendered by `SectionRenderer.jsx`
  - `components/marketing/`: `FeatureDemos.jsx`
- Key files: `client/src/components/SectionRenderer.jsx`, `client/src/components/RouteGuards.jsx`

**`client/src/pages/`:**
- Purpose: One component per route.
- Contains: storefront pages at top level (`HomePage.jsx`, `ProductDetailPage.jsx`,
  `AuctionDetailPage.jsx`, `CheckoutPage.jsx`, `OrdersPage.jsx`, `LoginPage.jsx`, etc.),
  plus subfolders:
  - `pages/admin/`: `Admin*Panel.jsx` panels (products, orders, auctions, raffles, billing, storefront, reports, audit log, payments, promotions)
  - `pages/marketing/`: `LandingPage.jsx`, `MarketingLayout.jsx`, `SignupPage.jsx`
  - `pages/platform/`: `PlatformDashboardPage.jsx`, `PlatformLoginPage.jsx`, `PlatformMarketingPanel.jsx`
- Key files: `client/src/pages/AdminDashboardPage.jsx`, `client/src/pages/HomePage.jsx`

**`client/src/context/`:**
- Purpose: Global React state providers.
- Contains: `AuthContext.jsx`, `TenantContext.jsx`, `CartContext.jsx`, `ThemeContext.jsx`,
  `ToastContext.jsx`, `ConfirmContext.jsx`

**`client/src/lib/`:**
- Purpose: Non-component logic.
- Contains: `siteContext.js` (hostname detection), `templateCatalog.js`, `sectionSchema.js`,
  `defaultContent.js`, `money.js`, `guestCart.js`, `wishlist.js`, `recentlyViewed.js`,
  `duckRoster.js`, `useReveal.js`

**`client/src/styles/`:**
- Purpose: Global CSS. `tokens.css` (design tokens), `theme.css` (theme application), `fonts.css`.

**`server/Controllers/`:**
- Purpose: HTTP endpoints. One controller per resource.
- Contains: 20 files, e.g. `ProductsController.cs` (`api/products`), `AuctionsController.cs`,
  `RafflesController.cs`, `CheckoutService` is not here; checkout routes are in `OrdersController.cs`
  and `CartController.cs`. `ReviewsController.cs` is nested under `api/products/{productId}`.
  `TenantScopedControllerBase.cs` is the shared base, not an endpoint.
- Key files: `server/Controllers/TenantScopedControllerBase.cs`, `server/Controllers/PlatformController.cs`

**`server/Services/`:**
- Purpose: Business logic and integrations. 34 files.
- Contains: Interface/implementation pairs (`I*.cs` beside `*.cs`), plus helpers
  (`CheckoutPricing.cs`, `RaffleDrawTiming.cs`, `ChatAuthorRef.cs`, `EmailTemplates.cs`,
  `UploadValidation.cs`, `SecretCipher.cs`).
- Key files: `server/Services/AuctionService.cs`, `server/Services/CheckoutService.cs`,
  `server/Services/RaffleService.cs`, `server/Services/AuctionStatusBackgroundService.cs`

**`server/Models/`:**
- Purpose: EF Core entities and enums.
- Contains: `Product.cs`, `Auction.cs`, `Bid.cs`, `Order.cs`, `OrderItem.cs`, `CartItem.cs`,
  `Raffle.cs`, `RafflePrize.cs`, `RaffleSeat.cs`, `Tenant.cs`, `TenantContent.cs`,
  `TenantSection.cs`, `ApplicationUser.cs`, `ChatMessage.cs`, `Coupon.cs`, `ShippingMethod.cs`,
  `AuditLogEntry.cs`, `PlatformContent.cs`, `ITenantScoped.cs`, and `*Status.cs` / `*Mode.cs` enums.

**`server/Data/`:**
- Purpose: Persistence setup.
- Contains: `ApplicationDbContext.cs` (model config, query filters, SaveChanges override),
  `DbInitializer.cs` (seed), `SlugRules.cs`, `TenantDefaults.cs`.

**`server/Migrations/`:**
- Purpose: EF Core schema history. Do not hand-edit; generate with `dotnet ef migrations add`.
- Contains: Timestamped `*.cs` + `*.Designer.cs` pairs, and `ApplicationDbContextModelSnapshot.cs`.

**`server/Dtos/`:**
- Purpose: API contracts per domain (`AuctionDtos.cs`, `ProductDtos.cs`, `OrderDtos.cs`, `RaffleDtos.cs`, etc.).

**`server/Config/`:**
- Purpose: Option classes bound from `appsettings.json` sections.

## Key File Locations

**Entry Points:**
- `server/Program.cs`: Backend host and pipeline
- `client/src/main.jsx`: Frontend bootstrap
- `client/src/App.jsx`: Storefront routes
- `client/src/apps/MarketingApp.jsx`, `client/src/apps/PlatformApp.jsx`: Other two trees

**Configuration:**
- `server/appsettings.json`, `server/appsettings.Development.json`: Backend settings
- `client/vite.config.js`: Build and dev-server config
- `client/.env.example`: Frontend env template (`VITE_API_BASE_URL`, `VITE_ROOT_DOMAIN`, `VITE_DEV_TENANT_SLUG`)
- `client/.oxlintrc.json`: Lint config
- `docs/CONFIGURATION.md`: Full settings reference

**Core Logic:**
- `server/Services/`: Domain rules
- `server/Controllers/`: HTTP surface
- `client/src/api/`: Client-to-server contract

**Testing:**
- No dedicated test project was found in the repository tree.

## Naming Conventions

**Files:**
- Backend: PascalCase per type, one type per file. Interfaces `IName.cs`. Controllers `*Controller.cs`. DTO files `*Dtos.cs`. Migrations `YYYYMMDDHHMMSS_Name.cs`.
- Frontend components and pages: PascalCase `.jsx`, e.g. `client/src/components/AuctionCard.jsx`, `client/src/pages/CheckoutPage.jsx`.
- Frontend non-component modules: camelCase `.js`, e.g. `client/src/api/auctions.js`, `client/src/lib/guestCart.js`.
- Panels: `Admin<Area>Panel.jsx` in `client/src/pages/admin/`.
- Page components: `<Name>Page.jsx`.

**Directories:**
- Backend: PascalCase, plural for collections (`Controllers`, `Services`, `Models`).
- Frontend: lowercase, singular or plural per content (`api`, `components`, `pages`, `lib`).

**Routes:**
- Backend: `api/[controller]` kebab-case where multi-word (`api/audit-log`, `api/shipping-methods`, `api/payments/webhook`).
- Frontend: kebab-case or single word paths (`/track`, `/orders/:id`).

## Where to Add New Code

**New storefront page:**
- Page: `client/src/pages/<Name>Page.jsx`
- Route: register in `client/src/App.jsx`; wrap with `ProtectedRoute` if login is required
- API calls: add to `client/src/api/<area>.js`

**New admin panel:**
- Panel: `client/src/pages/admin/Admin<Area>Panel.jsx`
- Mount: from `client/src/pages/AdminDashboardPage.jsx`

**New API endpoint for a shop resource:**
- Controller: `server/Controllers/<Area>Controller.cs`, deriving from `TenantScopedControllerBase`
- DTOs: `server/Dtos/<Area>Dtos.cs`
- Logic: `server/Services/I<Area>Service.cs` plus implementation, registered in `server/Program.cs`
- Entity: `server/Models/<Entity>.cs`, implementing `ITenantScoped`, with a `DbSet` and filter in `server/Data/ApplicationDbContext.cs`
- Migration: `server/Migrations/` via EF tooling

**New section type for storefront home:**
- Component: `client/src/components/sections/<Name>Section.jsx`
- Register in: `client/src/components/SectionRenderer.jsx`; schema in `client/src/lib/sectionSchema.js`

**New theme template:**
- Entry: `client/src/lib/templateCatalog.js`; styles in `client/src/styles/`

**New real-time event:**
- Hub method or broadcast: `server/Hubs/AuctionHub.cs` or `server/Hubs/RaffleHub.cs`
- Client listener: the relevant page or ticker component under `client/src/components/`

**Shared helpers:**
- Backend: `server/Mapping/MappingExtensions.cs` for mapping, `server/Services/` for logic
- Frontend: `client/src/lib/`, and formatting in `client/src/lib/money.js`

## Special Directories

**`server/Migrations/`:**
- Purpose: EF Core migration history
- Generated: Yes (by `dotnet ef`), with manual review
- Committed: Yes

**`server/bin/`, `server/obj/`:**
- Purpose: .NET build output
- Generated: Yes
- Committed: No (ignored by `.gitignore`)

**`server/.vs/`:**
- Purpose: Visual Studio cache and user state
- Generated: Yes
- Committed: No

**`client/node_modules/`, `client/dist/`:**
- Purpose: Dependencies and Vite build output
- Generated: Yes
- Committed: No

**`client/public/`:**
- Purpose: Static files served as-is (video media, `_headers`)
- Generated: No
- Committed: Yes

**`.planning/`:**
- Purpose: GSD planning and codebase maps
- Generated: Yes
- Committed: Per team preference

---

*Structure analysis: 2026-10-09*
