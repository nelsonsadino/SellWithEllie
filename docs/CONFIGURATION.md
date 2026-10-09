# Configuration reference

## Where settings come from

The API reads configuration in this order (later wins):

1. `server/appsettings.json` — non-secret defaults, committed
2. `server/appsettings.{Environment}.json` — e.g. `appsettings.Development.json`
3. **User secrets** (Development) — `dotnet user-secrets set "Section:Key" "value"`
4. **Environment variables** (Production) — `Section__Key` (double underscore)

**Never put secrets in `appsettings.json`.** Use user secrets locally and env vars /
Key Vault in production.

The SPA reads build-time variables from `client/.env` (see the end of this file). They are
baked into the bundle at `npm run build` — they are **not secret** and must not hold
secrets.

---

## Server configuration keys

### Core

| Key | Required | Default | Purpose |
|-----|----------|---------|---------|
| `ConnectionStrings:DefaultConnection` | **yes** | — | SQL Server connection string |
| `Database:MigrateOnStartup` | no | `true` | Run EF migrations on boot. Set `false` in production and migrate as a deliberate step |
| `AllowedOrigins` | yes (array) | `["http://localhost:5173"]` | Exact CORS origins to allow, in addition to the `*.localhost` / `*.RootDomain` predicate |
| `RootDomain` | prod | *(empty)* | Your apex domain, e.g. `sellwithellie.example`. Lets CORS allow `{slug}.RootDomain` and the OAuth flow validate redirect hosts. Leave empty in dev |
| `KnownProxies` | prod (array) | `[]` | IP addresses of your CDN / reverse proxy, so `X-Forwarded-For` is trusted and per-IP rate limiting sees the real client |
| `AllowedHosts` | no | `*` | Standard ASP.NET host filtering |

### `Jwt` — access tokens

| Key | Required | Default | Purpose |
|-----|----------|---------|---------|
| `Jwt:Key` | **yes** | — | HMAC signing key. **32+ characters** or the app refuses to start |
| `Jwt:Issuer` | no | `SellWithEllieApi` | `iss` claim, validated |
| `Jwt:Audience` | no | `SellWithEllieClient` | `aud` claim, validated |
| `Jwt:ExpiryMinutes` | no | `60` | Access-token lifetime |

Tokens also carry an `sstamp` claim (Identity security stamp) checked on every request;
`POST /api/auth/logout` rotates it to revoke every token for an account.

### `PlatformAdmin` — the SaaS owner account

| Key | Purpose |
|-----|---------|
| `PlatformAdmin:Email` | Seeded `PlatformAdmin` login. If unset, seeding is skipped |
| `PlatformAdmin:Password` | Seeded password — change it after first login |

### `DemoShop` — the seeded example shop

| Key | Purpose |
|-----|---------|
| `DemoShop:Slug` | Tenant slug. **Must equal `VITE_DEV_TENANT_SLUG`.** If unset, no demo shop is seeded |
| `DemoShop:Name` | Display name |
| `DemoShop:AdminEmail` / `DemoShop:AdminPassword` | Seeded shop-admin account for the demo shop |

### `BlobStorage` — uploaded media (optional)

| Key | Default | Purpose |
|-----|---------|---------|
| `BlobStorage:ConnectionString` | *(empty)* | Azure Storage connection string. **Empty ⇒ upload endpoints return `503`** and the admin pastes a hosted URL instead |
| `BlobStorage:ContainerName` | `product-media` | Container (auto-created on first upload, blobs public-read) |
| `BlobStorage:MaxFileSizeBytes` | `104857600` (100 MB) | Per-file cap |

Setup: Azure Portal → Storage account → **Access keys → Connection string**. Uploads are
also validated by magic bytes + extension (`Services/UploadValidation.cs`).

### `Xendit` — Pro-plan billing (optional)

| Key | Default | Purpose |
|-----|---------|---------|
| `Xendit:SecretKey` | *(empty)* | `xnd_development_…` (sandbox) or `xnd_production_…`. Empty ⇒ billing endpoints return `503` |
| `Xendit:CallbackVerificationToken` | *(empty)* | From Dashboard → Settings → Developers → Callbacks. Webhook `x-callback-token` is compared to this in fixed time |
| `Xendit:ProPlanAmount` | `1499` | Pro price, minor units |
| `Xendit:Currency` | `PHP` | |
| `Xendit:Country` | `PH` | |

<a id="xendit-billing"></a>**Local webhook testing:**

1. `ngrok http 7100` → copy the `https://….ngrok-free.app` URL.
2. Xendit Dashboard (test mode) → Settings → Developers → API Keys → copy the test secret
   into `Xendit:SecretKey`.
3. Settings → Developers → Callbacks → set the URL to
   `https://<ngrok>/api/billing/webhook`, subscribe to `recurring.plan.*` and
   `recurring.cycle.*`, copy the **Verification Token** into
   `Xendit:CallbackVerificationToken`. Restart the API.
4. Shop → Admin → **Billing → Upgrade to Pro** opens a real hosted checkout. Watch the API
   logs (or the ngrok inspector at `http://127.0.0.1:4040`) — the plan flips to Pro on
   `recurring.plan.activated`.

> The Xendit integration follows the published REST docs but was built against `HttpClient`,
> not the official SDK, and hasn't been exercised end-to-end against a live sandbox. Verify
> the `/sessions` request shape and webhook payloads before relying on it for revenue.

### `ExternalAuth` — Google / Facebook sign-in (optional, storefront customers only)

| Key | Purpose |
|-----|---------|
| `ExternalAuth:GoogleClientId` / `ExternalAuth:GoogleClientSecret` | Google OAuth web client |
| `ExternalAuth:FacebookAppId` / `ExternalAuth:FacebookAppSecret` | Meta app + Facebook Login product |

A provider is registered only when **both** of its values are set; otherwise its button
returns `503` and email/password keeps working.

**Google:** [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
Create Credentials → OAuth client ID → **Web application**. Configure the OAuth consent
screen (External). Under **Authorized redirect URIs** add exactly one, on the **API's**
domain: `https://<api-domain>/signin-google` (local: `https://localhost:7100/signin-google`).

**Facebook:** [Meta for Developers](https://developers.facebook.com/apps) → create an app →
add **Facebook Login** → Settings → **Valid OAuth Redirect URIs**:
`https://<api-domain>/signin-facebook`. App Settings → Basic → copy App ID + App Secret.
While in development mode only tester accounts can log in; go Live (and pass App Review for
`email`) before real customers rely on it.

> Social-login accounts have no password. There is no "add a password" flow yet, so such an
> account can only sign back in via the same provider (or another provider with the same
> email, which resolves to the same account).

### `Email` — transactional email (optional)

| Key | Default | Purpose |
|-----|---------|---------|
| `Email:SmtpHost` | *(empty)* | SMTP server host. **Empty (or no `FromAddress`) ⇒ sends are silently skipped** - registration, checkout, and bidding all work identically either way |
| `Email:SmtpPort` | `587` | SMTP port (587 = STARTTLS, the common default) |
| `Email:SmtpUsername` / `Email:SmtpPassword` | *(empty)* | SMTP auth. Leave both empty for a relay that doesn't require auth |
| `Email:EnableSsl` | `true` | STARTTLS/SSL on the SMTP connection |
| `Email:FromAddress` | *(empty)* | The "from" address customers see. Required (with `SmtpHost`) for sending to be considered configured |
| `Email:FromName` | `SellWithEllie` | The "from" display name |

Sends: welcome email on registration, order confirmation on checkout/buyout, "you've been
outbid" and "you won" auction alerts. Every send is best-effort and logged, never blocking
the action it's attached to - a bad SMTP password fails loudly in the logs, not to the
customer.

---

## Environment-variable form (production)

Map every `Section:Key` above to `Section__Key`. Arrays use an index:

```
ConnectionStrings__DefaultConnection = Server=...;Database=...;
Jwt__Key                             = <32+ chars>
Jwt__ExpiryMinutes                   = 60
Database__MigrateOnStartup           = false
PlatformAdmin__Email                 = owner@yourcompany.example
PlatformAdmin__Password              = <strong>
RootDomain                           = sellwithellie.example
AllowedOrigins__0                    = https://sellwithellie.example
AllowedOrigins__1                    = https://www.sellwithellie.example
AllowedOrigins__2                    = https://admin.sellwithellie.example
KnownProxies__0                      = 203.0.113.10
BlobStorage__ConnectionString        = DefaultEndpointsProtocol=https;AccountName=...
Xendit__SecretKey                    = xnd_production_...
Xendit__CallbackVerificationToken    = ...
ExternalAuth__GoogleClientId         = ...apps.googleusercontent.com
ExternalAuth__GoogleClientSecret     = ...
Email__SmtpHost                      = smtp.yourprovider.example
Email__SmtpUsername                  = ...
Email__SmtpPassword                  = ...
Email__FromAddress                   = orders@sellwithellie.example
```

---

## Client build variables (`client/.env`)

| Var | Example (prod) | Purpose |
|-----|----------------|---------|
| `VITE_API_BASE_URL` | `https://api.sellwithellie.example/api` | API base — include the `/api` suffix |
| `VITE_DEV_TENANT_SLUG` | `demo` | **Local dev only.** Which shop plain `localhost` maps to. Ignored once `VITE_ROOT_DOMAIN` is set and you use real subdomains |
| `VITE_ROOT_DOMAIN` | `sellwithellie.example` | Apex domain. `{slug}.` → storefront, bare / `www.` → marketing, `admin.` → console |

Set these as build-time variables in your CI / static host, or commit an environment-specific
`.env`. They are visible in the shipped bundle.

---

## Related

- Security headers (API + SPA), CSP, HSTS, rate limits: [../SECURITY.md](../SECURITY.md)
- Deploy-time wiring of all of the above: [DEPLOYMENT.md](DEPLOYMENT.md)
