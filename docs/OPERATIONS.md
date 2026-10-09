# Operations runbook

Running SellWithEllie in production. Pairs with [DEPLOYMENT.md](DEPLOYMENT.md) and
[../SECURITY.md](../SECURITY.md).

## Health & smoke checks

| Check | How | Healthy |
|-------|-----|---------|
| API up | `GET /api/marketing/site` | `200` with JSON |
| Liveness / readiness | `GET /health` | `200` `Healthy` - checks the app can reach its database, not just that the process is running. Unauthenticated, tenant-independent; point your load balancer / uptime monitor / orchestrator at it |
| Tenant resolution | `GET /api/tenant/current` + `X-Tenant-Slug: <slug>` | `200`; wrong slug → `404` |
| DB reachable | any of the above; or check host metrics | no `500`s in logs |
| Swagger closed | `GET /swagger` | `404` |
| WebSockets | open an auction page, place a bid from another session | live update within ~1 s |
| Security headers | `curl -sI <api>/api/marketing/site` | `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff` present |
| Auth'd cache | `curl -sI` an authed endpoint with a token | `Cache-Control: no-store` |

## Database

### Backups

Enable your platform's automated backups + point-in-time restore (Azure SQL: on by
default, 7 days; RDS: enable automated backups). Everything the platform owns lives in this
one database — losing it loses every shop.

### Migrations

- Production config: `Database__MigrateOnStartup = false`.
- Apply as a release step, **after** a backup:
  ```bash
  dotnet ef database update --project server --connection "<prod connection string>"
  ```
  or hand a DBA an idempotent script:
  ```bash
  dotnet ef migrations script --idempotent --project server -o migrate.sql
  ```
- Roll back the last migration (rare — prefer forward fixes):
  ```bash
  dotnet ef database update <PreviousMigrationName> --connection "<prod>"
  ```
- Current migrations: `InitialCreate`, `AddProductMediaAndAuctionBuyout`,
  `AddTenantThemingAndContent`, `AddChatMessagesAndBlocking`, `AddAuditLogEntries`
  (adds the `AuditLogEntries` table - run `dotnet ef migrations add AddAuditLogEntries`
  then `dotnet ef database update` since `dotnet` isn't available in every environment
  this app is edited from).

### Restore drill

Restore a backup into a scratch database quarterly, point a staging API at it, run the
smoke checks. An untested backup isn't a backup.

## Secrets & keys

| Secret | Rotation | Effect of rotating |
|--------|----------|--------------------|
| `Jwt:Key` | if leaked, or ~yearly | **Every existing token is invalidated** — all users must log in again. Do it during a low-traffic window |
| `BlobStorage:ConnectionString` | on storage-key rotation | New uploads use the new key; existing blob URLs keep working |
| `Xendit:SecretKey` / `Xendit:CallbackVerificationToken` | on Xendit key rotation | Update both together; restart the API; re-verify a test webhook |
| `ExternalAuth:*` | on provider secret rotation | Update; restart; test one sign-in per provider |
| `Email:SmtpPassword` | on mailbox/relay credential rotation | Update; restart; send a test registration/checkout and confirm delivery |
| `PlatformAdmin:Password` | after first login, then per policy | It only seeds when the account doesn't exist — change it via the app, not config, after first boot |

Store all of these in the host's secret store / Key Vault, never in `appsettings.json` or
the repo.

## User & session management

- **"Sign out everywhere" for one user:** they call `POST /api/auth/logout`, or trigger a
  password change — either rotates their Identity security stamp and every existing token
  for that account fails its next request (checked with a 60 s cache).
- **Force-logout everyone:** rotate `Jwt:Key` (see above).
- **Suspend a shop:** platform console → the shop → **Deactivate**. Its storefront stops
  serving immediately; data is retained. **Reactivate** to restore.
- **Locked-out account:** clears itself after 10 minutes. No admin action needed.

## Rate limiting

- `auth` policy: 10/min per client IP. Global backstop: 600/min per client IP.
- **Behind a CDN you must set `KnownProxies`** to the CDN's egress IPs, or every visitor
  is bucketed as the edge IP and legitimate traffic gets `429`s.
- Tune the global limit against real traffic (`Program.cs`, `AddRateLimiter`). SignalR
  messages over an established socket don't pass through it.

## Logging & monitoring

- Structured logging via Serilog: every request gets one summary line (path, status,
  elapsed ms) from `UseSerilogRequestLogging`, and every `ILogger<T>` call in the app -
  auth events (successful/failed login, lockout, logout with user id/tenant/IP),
  unhandled exceptions (with request path; the client only ever sees a generic message),
  audit-log write failures, background-service errors - flows through the same pipeline.
- Two sinks: console (human-readable, for local dev / `docker logs`) and a rolling
  newline-delimited-JSON file under `server/logs/log-<date>.json` (14 days retained,
  one file per day) - grep/`jq` it directly, or point a log shipper (Filebeat, Promtail,
  an App Service log stream) at the file for real error tracking without a paid APM.
  `Microsoft.AspNetCore`/`Microsoft.EntityFrameworkCore` are quieted to `Warning` so the
  file isn't dominated by framework noise.
- **Recommended addition:** an APM (Application Insights / OpenTelemetry) once request
  volume justifies it, for latency percentiles and distributed tracing - Serilog gives you
  the structured events, an APM gives you dashboards/alerting on top of them. Alert on:
  5xx rate, `429` spikes, failed-login spikes, DB connection failures, `/health` failures,
  background-service exceptions.
- **Admin activity:** `GET /api/audit-log` (shop Admin role) - who changed which product/
  auction and when, and every chat block/unblock. Written by `IAuditLogService`; a write
  failure there is logged but never blocks the action it's recording.

## Dependency hygiene

- `.github/workflows/security.yml` runs `npm audit --omit=dev --audit-level=moderate` and
  `dotnet list package --vulnerable` on every push/PR and weekly. Keep it green.
- To check locally:
  ```bash
  cd client && npm audit
  cd server && dotnet list package --vulnerable --include-transitive
  ```
- `System.Formats.Asn1` and `Azure.Identity` are pinned in `Server.csproj` to stay ahead
  of transitive advisories — bump the pins when newer patched versions ship.

## Background service

`AuctionStatusBackgroundService` opens/closes auctions on schedule. If it stops (unhandled
exception, host recycle), auctions stall in `Scheduled`/`Active` past their times. Watch
for its log lines; a healthy instance processes due auctions every cycle. It's safe to
restart the API to recover it.

## Capacity notes

This app is deliberately hardened as a **single, well-tuned instance** rather than a
horizontally-scaled cluster - see the tradeoffs below before reaching for a second
instance.

- **DB connection resiliency:** `UseSqlServer(...).EnableRetryOnFailure(...)` retries
  transient SQL Server errors (brief network blips, Azure SQL failovers) up to 5 times
  with backoff instead of surfacing a 500 - the single biggest "the site froze" risk for
  one instance talking to one database. `AddDbContextPool` was deliberately **not** used:
  it would silently reuse the `ITenantContext` captured on a pooled `ApplicationDbContext`
  instance's first construction across later, different-tenant requests - a cross-tenant
  data leak - for a GC-only win. The real per-request cost (opening a SQL connection) is
  already pooled automatically underneath by `Microsoft.Data.SqlClient`.
- **Output caching:** `GET /api/products`, `GET /api/products/categories`, and
  `GET /api/auctions` (the highest-traffic, fully public reads) are cached for 20 seconds
  via ASP.NET Core's output cache, varied by `X-Tenant-Slug`/`Host` so shops never share a
  cached response. Creating/editing/deleting a product or auction evicts the cache
  immediately (tag `catalog`), so admin changes are never stale. A traffic spike hits the
  cache, not the database, for these endpoints.
- **`/health`** lets infrastructure detect and restart a wedged instance automatically
  instead of it silently failing every request.
- Single API instance is fine well past a pilot with the above in place. To scale out to
  multiple instances: SignalR needs a **backplane** (Azure SignalR Service or Redis) or
  live bid/chat updates only reach clients on the same instance; the output cache above is
  in-memory per instance too (fine - it just means each instance independently caches for
  20 s, no cross-instance staleness). Sessions are stateless (JWT) so the API itself scales
  horizontally once those are addressed. This was evaluated and intentionally deferred -
  see the "harden the single instance" decision - revisit if/when a second instance is
  actually needed.
- The `sstamp` check adds one cached DB read per user per minute — negligible, but it's a
  read on the hot path; the 60 s cache TTL is the knob.
- SQL: the free/basic tiers auto-pause and cold-start. Move up a tier before real traffic.

## Incident quick reference

| Symptom | First checks |
|---------|--------------|
| All logins failing right after a deploy | Did `Jwt:Key` change? Old tokens are gone by design — expected once. Otherwise check `Jwt:*` config |
| Everyone getting `429` | `KnownProxies` not set behind the CDN; or the global limit is too low |
| Storefront: "We couldn't find this shop" | Tenant slug wrong, or the shop is deactivated |
| Live bidding not updating | WebSockets disabled on the API host; or SignalR backplane missing with >1 instance |
| Uploads failing with `503` | `BlobStorage:ConnectionString` missing/expired |
| Billing tab shows unavailable | `Xendit:*` not configured |
| Migration hangs startup | `Database__MigrateOnStartup` should be `false` in prod; migrate as a separate step |
| `/health` returning unhealthy | Database unreachable - check connection string / firewall / SQL tier is not paused |
| Order/welcome/auction emails not arriving | `Email:SmtpHost`/`Email:FromAddress` not configured, or check `server/logs/log-*.json` for a `Failed to send email` warning with the SMTP error |
| CSP blocking SPA assets | The SPA host's CSP (not the API's) is too strict; widen `connect-src`/`img-src` to your real API + blob origins |
