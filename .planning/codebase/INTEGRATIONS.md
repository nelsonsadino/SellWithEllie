# External Integrations

**Analysis Date:** 2026-10-09

## APIs & External Services

**Payments:**
- Xendit - subscription billing (Pro plan) and customer checkout sessions
  - Client: `System.Net.Http` typed client `XenditClient` in `server/Services/XenditClient.cs` (interface `server/Services/IXenditClient.cs`), registered with `AddHttpClient` in `server/Program.cs`
  - Base URL: `https://api.xendit.co`; subscription sessions posted to `/sessions`
  - Auth: `Xendit:SecretKey` (env/user-secrets)
  - Webhook verification: `Xendit:CallbackVerificationToken`
  - Per-tenant credentials: shops can connect their own Xendit account. Keys are encrypted at rest with `SecretCipher` (`server/Services/SecretCipher.cs`, AES-GCM, `v1:` prefix) using `Payments:EncryptionKey`. Tenant-level logic lives in `server/Services/TenantPaymentService.cs`.
  - Pricing and checkout: `server/Services/CheckoutService.cs`, `server/Services/CheckoutPricing.cs`, `server/Config/XenditSettings.cs`

**Email:**
- SMTP provider (not named in code; configured by host) - transactional email
  - Client: `System.Net.Mail.SmtpClient` in `server/Services/EmailSender.cs`, templates in `server/Services/EmailTemplates.cs`
  - Auth: `Email:SmtpUsername` / `Email:SmtpPassword`
  - Skipped with a debug log when `Email:SmtpHost` or `Email:FromAddress` is empty

**Social Login (OAuth):**
- Google - `Microsoft.AspNetCore.Authentication.Google`
  - Auth: `ExternalAuth:GoogleClientId`, `ExternalAuth:GoogleClientSecret`
  - Callback: `/signin-google`
- Facebook - `Microsoft.AspNetCore.Authentication.Facebook`
  - Auth: `ExternalAuth:FacebookAppId`, `ExternalAuth:FacebookAppSecret`
  - Callback: `/signin-facebook`, scopes `email`, fields `email` and `name`
- Both are registered only when both values are set. Sign-in uses the `ExternalAuthController.CookieScheme` cookie scheme (`server/Controllers/ExternalAuthController.cs`).

**Google Fonts:**
- Loaded from `https://fonts.googleapis.com` with preconnect to `https://fonts.gstatic.com` (`client/index.html`)

## Data Storage

**Databases:**
- Microsoft SQL Server
  - Connection: `ConnectionStrings:DefaultConnection`
  - ORM: Entity Framework Core 8 with `ApplicationDbContext` (`server/Data/ApplicationDbContext.cs`)
  - Migrations: `server/Migrations/` (latest `20260925044813_AddReviewsCouponsShippingGuest`), applied at startup when `Database:MigrateOnStartup` is true
  - Seeding: `server/Data/DbInitializer.cs`
  - Identity tables via ASP.NET Core Identity (`ApplicationUser`, `IdentityRole`)

**File Storage:**
- Azure Blob Storage - product photos and videos
  - Client: `Azure.Storage.Blobs` `BlobServiceClient` in `server/Services/BlobStorageService.cs` (interface `IBlobStorageService.cs`)
  - Connection: `BlobStorage:ConnectionString`
  - Container: `BlobStorage:ContainerName` (default `product-media`)
  - Size limit: `BlobStorage:MaxFileSizeBytes` (100 MB), validated in `server/Services/UploadValidation.cs`
  - When the connection string is unset, the service reports `IsConfigured` as false and uploads are unavailable
- Client-side media: `client/public/media/` (static poster image and webm video shipped with the SPA)

**Caching:**
- In-process only: `TenantCache` (singleton, `server/Services/TenantCache.cs`) and `ChatRateLimiter` (`server/Services/ChatRateLimiter.cs`). No Redis or distributed cache detected.

## Authentication & Identity

**Auth Provider:**
- Custom, built on ASP.NET Core Identity
  - Implementation: local accounts with password hashing via Identity; JWT bearer tokens issued by `server/Services/TokenService.cs` (issuer `SellWithEllieApi`, audience `SellWithEllieClient`, expiry 60 minutes by default)
  - Client token handling: `client/src/api/auth.js`, `client/src/api/client.js`. Tokens are sent as `Authorization: Bearer` headers and as `accessTokenFactory` for SignalR.
  - Signing key: `Jwt:Key`
  - External providers: Google and Facebook (see above)
  - Tenant resolution from host/subdomain: `server/Middleware/TenantResolutionMiddleware.cs`
  - Route guards: `client/src/components/RouteGuards.jsx`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Application Insights, or similar SDK)

**Logs:**
- Serilog to console and rolling file (`WriteTo.Console()` and `WriteTo.File(...)` in `server/Program.cs`)
- Compact JSON formatter (`Serilog.Formatting.Compact`) for structured output
- Request logging via `UseSerilogRequestLogging()`
- Audit trail stored in the database via `server/Services/AuditLogService.cs` and `client/src/api/auditLog.js`

**Health:**
- ASP.NET Core health checks, `database` check via `AddDbContextCheck<ApplicationDbContext>` (`server/Program.cs`)

## CI/CD & Deployment

**Hosting:**
- Not configured in the repo for the API. The SPA ships with Netlify/Cloudflare Pages-style headers in `client/public/_headers`.

**CI Pipeline:**
- GitHub Actions: `.github/workflows/security.yml` (security scanning; contents not analyzed in depth)

## Environment Configuration

**Required env vars (server, names only):**
- `ConnectionStrings__DefaultConnection`
- `Jwt__Key`
- `Xendit__SecretKey`, `Xendit__CallbackVerificationToken`
- `Payments__EncryptionKey`
- `BlobStorage__ConnectionString`
- `Email__SmtpHost`, `Email__FromAddress`, `Email__SmtpUsername`, `Email__SmtpPassword`
- `ExternalAuth__GoogleClientId`, `ExternalAuth__GoogleClientSecret` (optional)
- `ExternalAuth__FacebookAppId`, `ExternalAuth__FacebookAppSecret` (optional)
- `AllowedOrigins` (CORS list)

**Required env vars (client, names only, from `client/.env.example`):**
- `VITE_API_BASE_URL`
- `VITE_DEV_TENANT_SLUG`
- `VITE_ROOT_DOMAIN`

**Secrets location:**
- Development: .NET user-secrets (`UserSecretsId` in `server/Server.csproj`) and the git-ignored `client/.env` file. Values are not recorded in this document.
- Production: not specified in the repo. Expected to be environment variables or a secret store.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/billing/webhook` - Xendit billing callbacks, handled in `server/Controllers/BillingWebhookController.cs`
- `/signin-google` and `/signin-facebook` - OAuth callbacks handled by the authentication middleware
- `/hubs/auction` and `/hubs/raffle` - SignalR WebSocket endpoints (`server/Hubs/AuctionHub.cs`, `server/Hubs/RaffleHub.cs`), consumed by `client/src/components/AuctionChat.jsx`, `client/src/components/RaffleChat.jsx`, and `client/src/pages/AuctionDetailPage.jsx` / `RaffleDetailPage.jsx`

**Outgoing:**
- Xendit REST calls (`https://api.xendit.co`), see above
- SMTP email send, see above
- Azure Blob Storage upload and read, see above

---

*Integration audit: 2026-10-09*
