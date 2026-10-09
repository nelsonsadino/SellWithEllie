<!-- refreshed: 2026-10-09 -->
# Technology Stack

**Analysis Date:** 2026-10-09

## Languages

**Primary:**
- C# (.NET 8, `net8.0`, Nullable and ImplicitUsings enabled) - all backend code in `server/` (controllers, services, hubs, EF Core model)
- JavaScript (ES modules, JSX) - all frontend code in `client/src/`

**Secondary:**
- SQL (T-SQL via EF Core migrations) - schema in `server/Migrations/`
- HTML/CSS - `client/index.html`, styling in `client/src/`

## Runtime

**Environment:**
- .NET SDK / ASP.NET Core runtime 8.0 - `server/Server.csproj` (`TargetFramework` net8.0)
- Node.js - version not pinned (no `.nvmrc` or `engines` field found); `client/` is ESM (`"type": "module"`)

**Package Managers:**
- NuGet (via `Server.csproj` PackageReference entries) - no lockfile detected for server
- npm - `client/package.json`
  - Lockfile: present (`client/package-lock.json`)

## Frameworks

**Core (server):**
- ASP.NET Core 8 (`Microsoft.NET.Sdk.Web`) - HTTP API, SignalR hubs, rate limiting, CORS, health checks (`server/Program.cs`)
- Entity Framework Core 8.0.10 (`Microsoft.EntityFrameworkCore.SqlServer`) - ORM; `ApplicationDbContext` in `server/Data/ApplicationDbContext.cs`
- ASP.NET Core Identity 8.0.10 (`Microsoft.AspNetCore.Identity.EntityFrameworkCore`) - users/roles, stored in SQL Server
- SignalR (built into ASP.NET Core) - real-time auction and raffle chat, hubs in `server/Hubs/AuctionHub.cs` and `server/Hubs/RaffleHub.cs`
- Swashbuckle.AspNetCore 6.6.2 - Swagger/OpenAPI (`AddSwaggerGen` in `server/Program.cs`)

**Core (client):**
- React 19 (`react`, `react-dom` ^19.2.8) - UI, entry in `client/src/App.jsx` and `client/src/apps/`
- React Router 7 (`react-router-dom` ^7.18.3) - client routing
- `@microsoft/signalr` ^10.0.11 - browser SignalR client for chat (`client/src/components/AuctionChat.jsx`, `client/src/components/RaffleChat.jsx`)

**Testing:**
- Not detected. No test framework or test project found in `client/package.json` or `server/Server.csproj`.

**Build/Dev:**
- Vite 8 (`vite` ^8.2.2) - dev server and bundler; config in `client/vite.config.js`
- `@vitejs/plugin-react` ^6.1.0 - React fast refresh and JSX transform
- `rollup-plugin-visualizer` ^7.1.1 - bundle analysis, enabled by `vite build --mode analyze` (outputs `dist/bundle-stats.html`)
- oxlint ^1.79.0 - linter; config in `client/.oxlintrc.json`, run with `npm run lint`
- EF Core Tools / Design 8.0.10 (private assets) - `dotnet ef` migrations tooling

## Key Dependencies

**Critical (server):**
- `Microsoft.AspNetCore.Authentication.JwtBearer` 8.0.10 - bearer token auth; settings in `server/Config/JwtSettings.cs`, token issuance in `server/Services/TokenService.cs`
- `Microsoft.AspNetCore.Authentication.Google` 8.0.10 and `...Facebook` 8.0.10 - social login, registered conditionally in `server/Program.cs`
- `Microsoft.EntityFrameworkCore.SqlServer` 8.0.10 - SQL Server provider, with `EnableRetryOnFailure` (5 retries, 10 s max delay)
- `Azure.Storage.Blobs` 12.24.0 - product media storage, `server/Services/BlobStorageService.cs`
- `Azure.Identity` 1.13.2 - pinned for security patch level (transitive via `Microsoft.Data.SqlClient`)
- `System.Formats.Asn1` 8.0.1 - pinned to a patched version (see the comment block in `server/Server.csproj`)
- `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore` 8.0.10 - `database` health check

**Critical (client):**
- `react` / `react-dom` 19.x - core rendering
- `react-router-dom` 7.x - routing; all three site entries and the admin/platform panels are route-split
- `@microsoft/signalr` 10.x - realtime chat transport

**Infrastructure (server):**
- `Serilog.AspNetCore` 8.0.3, `Serilog.Sinks.Console` 6.0.0, `Serilog.Sinks.File` 6.0.0, `Serilog.Formatting.Compact` 3.0.0 - structured logging to console and file (`server/Program.cs`)
- `Swashbuckle.AspNetCore` 6.6.2 - API docs

**Infrastructure (client):**
- Google Fonts (loaded from CSS in `client/index.html`) - Anton, Archivo, Baloo 2, Barlow, Bodoni Moda, Bricolage Grotesque, Inter, JetBrains Mono, Jost, Karla, Martian Mono, Nunito Sans, Oswald, Piazzolla, Public Sans, Schibsted Grotesk, Zilla Slab. Self-hosted font also present: `client/public/fonts/prata-latin-400.woff2`.

## Configuration

**Server environment:**
- Configuration via ASP.NET Core `appsettings.json` (`server/appsettings.json`) plus `appsettings.Development.json` and .NET user-secrets (`UserSecretsId` in `server/Server.csproj`).
- Sections (keys are empty in the committed file and must be supplied via user-secrets or environment variables):
  - `ConnectionStrings:DefaultConnection` - SQL Server connection string
  - `Database:MigrateOnStartup` - `true` by default, runs EF migrations at startup
  - `Jwt:Issuer`, `Jwt:Audience`, `Jwt:Key`, `Jwt:ExpiryMinutes` (60)
  - `Xendit:SecretKey`, `Xendit:CallbackVerificationToken`, `Xendit:ProPlanAmount` (1499), `Xendit:Currency` (PHP), `Xendit:Country` (PH)
  - `ExternalAuth:GoogleClientId`, `ExternalAuth:GoogleClientSecret`, `ExternalAuth:FacebookAppId`, `ExternalAuth:FacebookAppSecret`
  - `BlobStorage:ConnectionString`, `BlobStorage:ContainerName` (`product-media`), `BlobStorage:MaxFileSizeBytes` (104857600)
  - `Payments:EncryptionKey` (base64 32-byte key), `Payments:InvoiceExpirySeconds` (3600)
  - `Email:SmtpHost`, `Email:SmtpPort` (587), `Email:SmtpUsername`, `Email:SmtpPassword`, `Email:EnableSsl`, `Email:FromAddress`, `Email:FromName`
  - `AllowedOrigins` (CORS, default `http://localhost:5173`), `AllowedHosts`, `KnownProxies`
- Settings classes: `server/Config/*.cs` (`XenditSettings`, `JwtSettings`, `BlobStorageSettings`, `EmailSettings`, `ExternalAuthSettings`, `PaymentsSettings`, `PlanLimits`).
- Missing settings are logged as warnings at startup (for example Xendit and Payments in `server/Program.cs`), and the affected feature degrades rather than failing startup.

**Client environment (Vite, `import.meta.env`):**
- `VITE_API_BASE_URL` - API base, default `https://localhost:7100/api` (`client/src/api/client.js`)
- `VITE_DEV_TENANT_SLUG` - dev-only tenant slug override (`client/src/lib/siteContext.js`)
- `VITE_ROOT_DOMAIN` - root domain for tenant subdomains (`client/src/lib/siteContext.js`, `client/src/pages/marketing/LandingPage.jsx`; default `sellwithellie.com` on the landing page)
- Template: `client/.env.example`. A local `client/.env` file exists; it was not read and its contents are not recorded here.

**Build:**
- `client/vite.config.js` - React plugin, conditional visualizer, manual `vendor` chunk for react, react-router, and signalr
- `server/Server.csproj` - package references and `net8.0` target
- `client/public/_headers` - Netlify/Cloudflare-style security headers (CSP, HSTS, X-Frame-Options) and cache rules for `/assets/*` and `/index.html`

## Platform Requirements

**Development:**
- .NET 8 SDK
- Node.js with npm (version not pinned)
- SQL Server instance reachable via `ConnectionStrings:DefaultConnection`
- HTTPS dev certificate for the API at `https://localhost:7100` (default `VITE_API_BASE_URL`)
- Vite dev server on port 5173 (allowed by CORS in `server/appsettings.json`)

**Production:**
- ASP.NET Core 8 host behind a reverse proxy; `UseForwardedHeaders` is configured for `X-Forwarded-For` and `X-Forwarded-Proto` (`server/Program.cs`)
- SQL Server (Azure SQL implied by `Azure.Identity` and `Azure.Storage.Blobs` usage, not confirmed in config)
- Static SPA host (Netlify or Cloudflare Pages format per `client/public/_headers`; other hosts described in a `SECURITY.md` referenced there, not present in the repo)

---

*Stack analysis: 2026-10-09*
