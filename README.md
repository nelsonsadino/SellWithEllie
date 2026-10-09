# SellWithEllie

A multi-tenant SaaS platform for running an online shop. A business signs up, gets its
own subdomain, and runs a product catalogue, live-bidding auctions, a cart and orders,
and a fully editable storefront — completely isolated from every other shop on the
platform.

The platform is business-agnostic: products are generic (name, category, price,
description, media). The shop seeded for local development, **Ellie's Friends**, is an
aquatics shop, but that's just one example of what the platform can host.

```
┌─────────────────┐   ┌──────────────────┐   ┌────────────────────┐
│  Storefront SPA  │   │  Marketing SPA   │   │  Platform console  │
│ {slug}.host      │   │  host / www.host │   │  admin.host        │
└────────┬────────┘   └────────┬─────────┘   └─────────┬──────────┘
         └──────────────┬──────┴───────────────────────┘
                        │  one React build, chosen by hostname
                ┌───────▼────────┐
                │  ASP.NET Core 8 │  JWT auth · SignalR · EF Core
                │      Web API    │  per-row tenant isolation
                └───────┬────────┘
                ┌───────▼────────┐
                │   SQL Server   │  one shared database
                └────────────────┘
```

## Stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | React 19 + Vite 8, React Router 7, hand-rolled CSS design-token system, `@microsoft/signalr` |
| Backend   | ASP.NET Core 8 Web API, ASP.NET Core Identity + JWT bearer, SignalR |
| Database  | EF Core 8 + SQL Server (LocalDB / Express / Azure SQL), shared DB with per-row `TenantId` isolation |
| Billing   | Xendit hosted checkout + webhooks (Free / Pro plans) |
| Storage   | Azure Blob Storage for uploaded product & storefront media (optional) |
| Email     | SMTP transactional email — welcome, order confirmation, auction win/outbid (optional) |
| Ops       | Serilog structured logging (console + rolling JSON file), `/health` liveness check, EF Core transient-fault retry, output caching on hot catalogue reads |

## Feature overview

- **Editable storefront** — each shop picks one of **9 design templates**, a light/dark
  default, edits all customer-facing copy, and builds its home page from re-orderable
  blocks (hero, carousel, video banner, product grid, feature grid, lookbook, newsletter,
  info strip, gallery, rich text, auction ticker, CTA).
- **Editable marketing site** — the platform's own landing page is block-driven and
  edited from the platform console.
- **Product catalogue** — search, category filter, sort, pagination, up to 5 photos/videos
  per product, wishlist, recently-viewed.
- **Cart & checkout** — fixed-price sales (mock payment) that create orders and mark stock
  sold. Customer order history; admin all-orders view.
- **Live auctions** — scheduled auctions with a starting price, minimum increment, timed
  close, optional Buy-It-Now, real-time price + bid history over SignalR, and a background
  service that opens/closes on schedule. Concurrent bids are race-safe (`rowversion`).
- **Live auction chat** — per-auction chat with profanity filter, per-user spam limiting,
  and admin moderation (block/unblock). Author identities are pseudonymous per auction.
- **Accounts & roles** — `PlatformAdmin` (runs the SaaS), `Admin` (runs one shop),
  `Customer` (browse / bid / buy). Email+password or Google / Facebook sign-in.
- **Self-serve signup** — create a shop from the marketing site; it's live immediately on
  the Free plan. Platform admins can also provision shops from the console.
- **Billing** — shops upgrade to Pro via Xendit; Free-plan caps (product listings, active
  auctions) are enforced server-side.
- **Platform console** — list / suspend / reactivate / create shops; edit the marketing
  site.
- **Transactional email** — welcome email on signup, order confirmation on checkout/
  buyout, and "you've been outbid"/"you won" auction alerts. Optional (SMTP) — every
  send is best-effort and never blocks the action it's attached to.
- **Admin audit log** — every product/auction change and chat block/unblock is recorded
  with who did it and when, viewable from the admin dashboard.
- **Production hardening** — structured logging, a `/health` endpoint, automatic retry on
  transient database errors, and short-TTL output caching on the highest-traffic public
  reads. See [docs/OPERATIONS.md](docs/OPERATIONS.md#capacity-notes) for the reasoning.

## Documentation

| Guide | For |
|-------|-----|
| **[docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md)** | Getting the app running on your machine |
| **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** | Every config key and environment variable |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | How the system is put together |
| **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** | Shipping it to production |
| **[docs/USER_MANUAL.md](docs/USER_MANUAL.md)** | Using the app — shoppers, shop admins, platform admins |
| **[docs/API.md](docs/API.md)** | HTTP + SignalR reference |
| **[docs/THEMING.md](docs/THEMING.md)** | The design-token system and adding templates |
| **[docs/OPERATIONS.md](docs/OPERATIONS.md)** | Running it: backups, migrations, monitoring, secrets |
| **[SECURITY.md](SECURITY.md)** | Security posture, what to configure, deferred items |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Dev workflow and conventions |
| **[CHANGELOG.md](CHANGELOG.md)** | Release history |

## 60-second start

Prerequisites: [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0),
[Node.js 20.19+](https://nodejs.org), and a SQL Server instance. Full details and secret
setup in **[docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md)**.

```bash
# 1. Backend secrets (minimum)
cd server
dotnet user-secrets set "Jwt:Key" "$(openssl rand -base64 32)"
dotnet user-secrets set "PlatformAdmin:Email" "owner@example.com"
dotnet user-secrets set "PlatformAdmin:Password" "ChangeMe!123"
dotnet user-secrets set "DemoShop:Slug" "demo"
dotnet user-secrets set "DemoShop:AdminEmail" "admin@demo.local"
dotnet user-secrets set "DemoShop:AdminPassword" "ChangeMe!123"
# edit server/appsettings.Development.json -> ConnectionStrings:DefaultConnection

# 2. Run the API (migrates + seeds on startup)
dotnet run                                   # https://localhost:7100  (+ /swagger)

# 3. Run the SPA
cd ../client
cp .env.example .env
npm install
npm run dev                                  # http://localhost:5173
```

Then open:

| URL | What |
|-----|------|
| `http://localhost:5173` | The demo storefront (`VITE_DEV_TENANT_SLUG`) |
| `http://www.localhost:5173` | Marketing site + signup |
| `http://admin.localhost:5173` | Platform console (log in with the `PlatformAdmin` account) |

> Change the seeded example passwords before doing anything real.

## Repository layout

```
.
├── client/                 React SPA (storefront + marketing + platform console)
│   ├── src/
│   │   ├── apps/            MarketingApp, PlatformApp entry trees
│   │   ├── components/      shared components + sections/ (home-page blocks)
│   │   ├── context/         Auth, Tenant, Theme, Cart, Toast, Confirm
│   │   ├── lib/             siteContext, sectionSchema, defaultContent
│   │   ├── pages/           routed pages (+ admin/, marketing/, platform/)
│   │   └── styles/          tokens.css (design tokens) + theme.css (components)
│   └── public/_headers      SPA security + cache headers for the host/CDN
├── server/                  ASP.NET Core Web API
│   ├── Controllers/         one per resource area
│   ├── Data/                ApplicationDbContext, DbInitializer, TenantDefaults
│   ├── Middleware/          TenantResolutionMiddleware
│   ├── Migrations/          EF Core migrations
│   ├── Models/ Dtos/ Mapping/ Services/ Hubs/ Config/
│   └── Program.cs           pipeline, auth, CORS, rate limiting, headers
├── docs/                    this documentation set
├── .github/workflows/       security.yml (npm audit + NuGet vuln scan)
├── SECURITY.md
└── CHANGELOG.md
```
