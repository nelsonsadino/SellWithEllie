# Security

How this app is hardened, what you still have to configure at deploy time, and
what's deliberately left for later.

## Applied in code

### Authentication
- **Account lockout is enforced.** `POST /api/auth/login` uses
  `SignInManager.CheckPasswordSignInAsync(lockoutOnFailure: true)`; 8 failed
  attempts locks the account for 10 minutes (returns `429`).
- **Per-IP rate limiting.** The `auth` limiter (login / register / OAuth start)
  is partitioned by client IP, 10/min. A generous per-IP global limiter
  (600/min) backstops everything else. *Behind a proxy/CDN this needs
  `KnownProxies` set (below) or every caller collapses into one bucket.*
- **Server-side revocation without a token store.** Access tokens carry a
  snapshot of the user's Identity `SecurityStamp` (`sstamp` claim), checked on
  every request in `JwtBearerEvents.OnTokenValidated` (current value cached 60s).
  `POST /api/auth/logout` rotates the stamp → every token for that account
  (any device) is rejected on its next call. A password change rotates it too.
- **Client session handling.** `api/client.js` refuses to send a request with an
  expired token and treats a `401` on an authenticated call as a dead session;
  `AuthContext` then clears local state and redirects to
  `/login?returnTo=<path>` (also on a proactive timer at token expiry).
- Auth events (successful login, failed login, lockout, logout) are logged via
  `ILogger`.

### Transport / headers (API)
- HSTS: 1 year, `includeSubDomains`, preload-eligible (non-Development only).
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none';
  base-uri 'none'; form-action 'none'` on API responses (Swagger path exempt).
- `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy` (all features off), `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`.
- `Cache-Control: no-store` on any response rendered for an authenticated user,
  so an edge cache never holds per-user data.
- `UseForwardedHeaders` so the real client IP / scheme reach rate limiting and
  logging.

### Uploads
- `UploadValidation.TryValidate` sniffs magic bytes (JPEG/PNG/GIF/WEBP/MP4/MOV/
  WEBM) and checks the extension is consistent, on top of the size and declared
  content-type checks. Applied to `POST /api/tenant/media` and
  `POST /api/products/{id}/media`.

### Chat
- Message DTOs no longer expose raw user GUIDs. Each message carries an opaque
  `authorRef` — `sha256(jwtKey | auctionId | userId)[:16]` — which is
  non-reversible and different per auction, so authors can't be correlated
  across rooms. Admins still get the real id from the authenticated history
  endpoint; blocking a live message resolves the `authorRef` back server-side.
- `ChatRateLimiter` sweeps idle entries on a timer (was an unbounded dictionary).
- Chatting on a `Closed` / `Cancelled` auction is rejected.
- An admin can't block themselves or another admin.

### Dependencies
- `System.Formats.Asn1` (High, GHSA-447r-wph3-92pm) and `Azure.Identity`
  (Moderate) pinned to patched versions; `Azure.Storage.Blobs` bumped.
  `dotnet list package --vulnerable` and `npm audit` are clean.
- `.github/workflows/security.yml` runs both on every push/PR and weekly.

### Operational
- `db.Database.Migrate()` on startup is gated by `Database:MigrateOnStartup`
  (default `true`). Set it `false` in production and migrate as a deliberate
  step.

---

## Configure at deploy time

### 1. Front the app with a CDN + WAF
Cloudflare, Azure Front Door, or CloudFront + AWS WAF, for both the SPA and the
API:
- TLS 1.3, HTTP/2 + HTTP/3
- OWASP Core Rule Set WAF
- L3/4 + L7 DDoS protection, bot mitigation
- edge rate limiting / geo rules
This is the layer that carries "use a CDN" — it complements, not replaces, the
app-level controls above.

### 2. Tell the API which proxies to trust
Otherwise `RemoteIpAddress` is the edge's IP and per-IP rate limiting / logs are
meaningless. Set the CDN's egress ranges:

```json
// appsettings.Production.json
"KnownProxies": ["203.0.113.10", "203.0.113.11"]
```
(or extend `Program.cs` to add `KnownNetworks` for CIDR ranges).

### 3. Serve the SPA with its own CSP + cache headers
The API's CSP does **not** protect the React app. The `client/public/_headers`
file covers Netlify / Cloudflare Pages. Equivalents:

**nginx**
```nginx
location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
location = /index.html {
    add_header Cache-Control "no-cache";
}
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://YOUR-BLOB-HOST; media-src 'self' blob: https://YOUR-BLOB-HOST; connect-src 'self' https://YOUR-API-HOST wss://YOUR-API-HOST; frame-ancestors 'none'; base-uri 'none'; object-src 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

**Azure Static Web Apps** — `staticwebapp.config.json`:
```json
{
  "globalHeaders": {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://YOUR-BLOB-HOST; media-src 'self' blob: https://YOUR-BLOB-HOST; connect-src 'self' https://YOUR-API-HOST wss://YOUR-API-HOST; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  },
  "routes": [
    { "route": "/assets/*", "headers": { "Cache-Control": "public, max-age=31536000, immutable" } },
    { "route": "/index.html", "headers": { "Cache-Control": "no-cache" } }
  ]
}
```

`style-src` still needs `'unsafe-inline'` because several components use inline
`style={...}`. Removing those (move to CSS classes) lets you drop it.

### 4. Optionally serve hashed assets from a dedicated CDN origin
Set Vite's `base` to `https://cdn.yourdomain.com/` and keep `crossorigin` on the
module scripts (already emitted).

---

## Deferred (larger changes)

### Move the access token out of `localStorage`
Today the JWT lives in `localStorage`, so an XSS bug could exfiltrate it. The
strict SPA CSP above is the mitigation. The fix is to switch to an
`HttpOnly; Secure; SameSite=Strict` cookie for the token plus a CSRF token
(double-submit or `SameSite` + custom header). This touches every API call,
CORS, and the SignalR handshake — do it as its own change with full auth
regression testing.

### Refresh tokens
Pair a short-lived access token (~15 min) with a rotating refresh token stored
`HttpOnly` and scoped to `/api/auth`. Add `POST /api/auth/refresh` (rotate +
re-issue) and have `api/client.js` retry once through it on a `401` before
redirecting to login. Needs a `RefreshToken` table + migration. The
`SecurityStamp` revocation above is the interim server-side kill switch.

### Auction hub access
`AuctionHub.JoinAuction` only checks the tenant+auction pair is real. That's
acceptable **today** because the same data is already public via
`GET /auctions/{id}` and `GET /auctions/{id}/chat` (no `[Authorize]`). If chat
or bid history ever becomes members-only, gate the hub with `[Authorize]` and a
per-connection tenant/role check.

### Anti-virus scanning on uploads
Magic-byte validation stops trivial spoofing but not a real malicious media
file. Run uploads through an AV scan (e.g. ClamAV, or the blob store's built-in
scanning) before the URL is used anywhere, and keep the blob container private,
serving via short-lived signed URLs instead of public read.
