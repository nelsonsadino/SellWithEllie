# Deployment

Three things to ship: the **database**, the **API**, and the **SPA**. Plus a **CDN/WAF**
in front. Read [CONFIGURATION.md](CONFIGURATION.md) and [../SECURITY.md](../SECURITY.md)
first.

## Topology

```
                    ┌────────── CDN + WAF (Cloudflare / Front Door / CloudFront) ──────────┐
                    │  TLS 1.3 · HTTP/3 · OWASP CRS · DDoS · edge cache · rate limiting     │
                    └───────┬───────────────────────────────────┬────────────────────────────┘
        {slug}.domain, www.domain, admin.domain │               │  api.domain
                    ┌───────▼────────┐                   ┌───────▼────────┐
                    │  Static host   │  dist/            │   API host     │  ASP.NET Core 8
                    │ (SWA/Netlify/  │  + _headers       │ (App Service / │  websockets ON
                    │  S3+CF/nginx)  │                   │  container)    │
                    └────────────────┘                   └───────┬────────┘
                                                         ┌───────▼────────┐
                                                         │  SQL database  │
                                                         └────────────────┘
```

## 1. Database

Any SQL Server: Azure SQL Database, SQL Server on a VM, RDS SQL Server, a container.

- Create an empty database and a login with `db_owner` on it (migrations create the schema).
- Keep the connection string for `ConnectionStrings__DefaultConnection`.
- **Migrations:** set `Database__MigrateOnStartup = false` in production and run migrations
  as a gated release step:
  ```bash
  dotnet ef database update --project server --connection "<prod connection string>"
  ```
  or generate an idempotent script for a DBA:
  ```bash
  dotnet ef migrations script --idempotent --project server -o migrate.sql
  ```
  Leaving it `true` is acceptable for small single-instance deploys but a slow or failed
  migration then blocks startup.

## 2. API

Target: **.NET 8**, **WebSockets enabled** (SignalR live bidding + chat).

### Build & publish

```bash
cd server
dotnet publish -c Release -o ./publish
```

Deploy `./publish` to your host (Azure App Service, a container, IIS, systemd + Kestrel,
etc.). For a container, a minimal `Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY server/ .
RUN dotnet publish -c Release -o /app/publish
FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "Server.dll"]
```

### Configuration

Set every key from [CONFIGURATION.md](CONFIGURATION.md#environment-variable-form-production)
as environment variables / app settings (or Key Vault references). Minimum for production:

```
ASPNETCORE_ENVIRONMENT              = Production
ConnectionStrings__DefaultConnection= ...
Jwt__Key                           = <32+ char secret>
Database__MigrateOnStartup         = false
RootDomain                         = sellwithellie.example
AllowedOrigins__0                  = https://sellwithellie.example
AllowedOrigins__1                  = https://www.sellwithellie.example
AllowedOrigins__2                  = https://admin.sellwithellie.example
KnownProxies__0                    = <your CDN egress IP>
PlatformAdmin__Email / __Password  = ...
```

Optional: `BlobStorage__*`, `Xendit__*`, `ExternalAuth__*`.

### What the API does at boot

- Applies migrations **iff** `Database__MigrateOnStartup=true`.
- Seeds the `PlatformAdmin` account and the demo shop **iff** their config is present.
  In production you usually set only `PlatformAdmin__*` and omit `DemoShop__*`.
- Emits HSTS + a strict `Content-Security-Policy` + `Permissions-Policy` +
  `Cross-Origin-*` headers on API responses (non-Development). Swagger is **not** served
  outside Development.

### Behind the CDN

`UseForwardedHeaders` is wired but only honours `X-Forwarded-*` from a loopback proxy by
default. List your CDN's egress IPs in `KnownProxies__*` or the real client IP is lost and
per-IP rate limiting collapses to one bucket.

## 3. SPA

Build the static bundle:

```bash
cd client
# set the prod build vars first — they are baked in:
#   VITE_API_BASE_URL=https://api.sellwithellie.example/api
#   VITE_ROOT_DOMAIN=sellwithellie.example
npm ci
npm run build          # -> client/dist/
```

Host `client/dist/` on any static host. `client/public/_headers` is copied into `dist/`
and applies on **Netlify / Cloudflare Pages**. For other hosts, replicate its headers:

- **nginx / Azure Static Web Apps:** header snippets are in [../SECURITY.md](../SECURITY.md#3-serve-the-spa-with-its-own-csp--cache-headers).
- **Cache:** `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`;
  `index.html` → `no-cache`.
- **SPA fallback:** route all unknown paths to `/index.html` (React Router owns routing).
- **CSP:** the SPA needs its **own** CSP from the host — the API's CSP does not protect it.
  Narrow the `_headers` `https:` wildcards to your real API + blob origins.

### Serving assets from a dedicated CDN origin (optional)

Set Vite `base` to your CDN origin (`vite.config.js` → `base: 'https://cdn.domain/'`) so
hashed `/assets/*` load from the CDN; keep `crossorigin` on the emitted module scripts.

## 4. DNS & the three sites

| Record | Points to | Serves |
|--------|-----------|--------|
| `sellwithellie.example` (A/ALIAS) | static host | marketing site |
| `www` (CNAME) | static host | marketing site |
| `admin` (CNAME) | static host | platform console |
| `*` (wildcard CNAME) | static host | every shop storefront |
| `api` (CNAME) | API host | the API |

`RootDomain` + `VITE_ROOT_DOMAIN` must both be `sellwithellie.example` so each site is
recognised.

**Wildcard custom domains** (`*.sellwithellie.example` → one storefront per shop) need a
host/plan that supports wildcard TLS. If yours doesn't (e.g. Azure Static Web Apps Free):

- Put **Cloudflare** (free) in front with a wildcard DNS record and its universal SSL, or
- Skip per-shop subdomains entirely and rely on the `X-Tenant-Slug` header path (already
  how the SPA talks to the API) — fine for a single pilot shop, just without pretty URLs.

Nothing in the backend changes either way — tenant resolution supports both.

## 5. Xendit (if billing is live)

Xendit Dashboard (Live mode) → add webhook `https://api.sellwithellie.example/api/billing/webhook`,
subscribe to `recurring.plan.*` + `recurring.cycle.*`, put its Verification Token in
`Xendit__CallbackVerificationToken` and your `xnd_production_…` key in `Xendit__SecretKey`.

## Post-deploy checklist

- [ ] `GET https://api.domain/api/tenant/current` with `X-Tenant-Slug: <a real slug>` → `200`
- [ ] `https://api.domain/swagger` → **404** (must not be public)
- [ ] Response headers on an API call include `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`
- [ ] SPA loads at the apex, `www.`, `admin.`, and a `{slug}.` host
- [ ] SPA response headers include its CSP and `/assets/*` are `immutable`-cached
- [ ] Log in as `PlatformAdmin` on `admin.domain`; create a shop; it resolves at `{slug}.domain`
- [ ] Place a bid from two sessions on one auction — both update live (WebSockets working)
- [ ] Upload a product image (if blob configured); confirm it renders from the blob URL
- [ ] `dotnet list package --vulnerable` and `npm audit` clean (CI: `.github/workflows/security.yml`)
- [ ] Seeded example passwords changed; `DemoShop__*` omitted in production
- [ ] Database backups / point-in-time restore enabled (see [OPERATIONS.md](OPERATIONS.md))

## Rollback

- **SPA:** redeploy the previous `dist/` (static hosts keep deploy history).
- **API:** redeploy the previous build/image.
- **Database:** migrations are not auto-reversed. To undo the last one:
  `dotnet ef database update <PreviousMigrationName> --connection "<prod>"`. Prefer
  forward-fixing; take a backup before any migration.
