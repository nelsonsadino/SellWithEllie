# Changelog

Notable changes to SellWithEllie. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); dates are `YYYY-MM-DD`.

## [Unreleased]

### Added

- **Production hardening for scale on a single instance:** structured logging (Serilog,
  console + rolling JSON file, replacing ad-hoc `Console.WriteLine` at startup), a
  `/health` liveness endpoint, automatic retry on transient SQL Server errors
  (`EnableRetryOnFailure`), and short-TTL, tag-evicted output caching on the highest-
  traffic public reads (`GET /api/products`, `/api/products/categories`,
  `/api/auctions`). See `docs/OPERATIONS.md#capacity-notes` for what was deliberately
  deferred (multi-instance scale-out / SignalR backplane) and why.
- **Transactional email** (optional, SMTP) — welcome email on signup, order confirmation
  on checkout/buyout, and auction outbid/won alerts (`IEmailSender`, `Email:*` config).
- **Admin audit log** — `AuditLogEntry` + `GET /api/audit-log`, recording every product/
  auction change and chat block/unblock with who and when. New **Admin → Audit log** tab.
- **Editable storefront (CMS).** Per-tenant design template, light/dark default, editable
  copy (`TenantContent` + `useContent()`), and a re-orderable home-page block builder
  (`TenantSection` + `SectionRenderer`). Admin UI under **Admin → Storefront**
  (Theme / Content / Home layout).
- **9 design templates** — `marketstall` (default), `warmwood`, `mono`, `petshop`,
  `sarisari`, `fashion`, `tech`, `autoparts`, `hobby` — each with its own palette,
  typography, and geometry, via a CSS design-token system (`styles/tokens.css` +
  `styles/theme.css`). Full light/dark for every template.
- **Block types:** `hero` (with live market board), `carousel`, `videoBanner`, `uspStrip`,
  `lookbook`, `newsletter`, `featureGrid`, `richText`, `gallery`, `cta`, `productGrid`
  (live), `auctionTicker` (live).
- **Video banner block** + `POST /api/tenant/media` upload endpoint (image/video, magic-byte
  validated), and a `video` field type in the block editor (upload or URL).
- **Editable marketing site** — the platform landing page is block-driven (`PlatformContent`
  / `PlatformSection`), edited from the platform console.
- **Live auction chat** — `POST/GET /api/auctions/{id}/chat`, SignalR `ChatMessageReceived`,
  profanity filter, per-user spam limiting, admin block/unblock (`/api/chat/*`).
- **Create a shop from the platform console** — `POST /api/platform/tenants` with owner
  details + a temporary password; seeds the default storefront.
- **Buy It Now** on auctions — `POST /api/auctions/{id}/buyout`.
- **Wishlist** and **recently-viewed** on the storefront (client-side).
- Theme toggle (system / light / dark) in every header; real modal dialogs replace
  `window.confirm`; skip link; `prefers-reduced-motion` respected throughout.
- **Documentation set** under `docs/` (architecture, local setup, configuration,
  deployment, user manual, API, theming, operations) + `CONTRIBUTING.md`, `SECURITY.md`,
  this changelog.

### Security

- **Account lockout is now enforced** on login (`SignInManager.CheckPasswordSignInAsync`
  with `lockoutOnFailure`); returns `429` when locked.
- **Per-IP rate limiting** — the `auth` limiter is partitioned by client IP; added a
  600/min per-IP global backstop. `UseForwardedHeaders` + `KnownProxies` config so the
  real client IP is seen behind a CDN.
- **Server-side token revocation without a token store** — tokens carry an `sstamp`
  (Identity security stamp) claim checked on every request; `POST /api/auth/logout` rotates
  it to invalidate every token for an account.
- **Client session expiry** — `api/client.js` won't send an expired token and treats a
  `401` on an authed call as a dead session; `AuthContext` redirects to
  `/login?returnTo=<path>` (and on a proactive timer at token expiry).
- **Security headers** — strict `Content-Security-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` on API responses;
  configured HSTS (1 yr, `includeSubDomains`, preload); `Cache-Control: no-store` on
  authenticated responses. `client/public/_headers` ships a CSP + cache policy for the SPA
  host.
- **Upload validation** — magic-byte + extension consistency check
  (`Services/UploadValidation.cs`) on both media upload endpoints.
- **Chat hardening** — message DTOs expose an opaque per-auction `authorRef` instead of the
  user GUID; `ChatRateLimiter` sweeps idle entries (was unbounded); chatting on a
  closed/cancelled auction is rejected; admins can't block themselves or another admin.
- **Dependencies** — pinned patched `System.Formats.Asn1` (High advisory) and
  `Azure.Identity` (Moderate); bumped `Azure.Storage.Blobs`. `.github/workflows/security.yml`
  runs `npm audit` + `dotnet list package --vulnerable` on every push/PR and weekly.

### Changed

- `db.Database.Migrate()` on startup is now gated by `Database:MigrateOnStartup`
  (default `true`).
- `GET /api/auctions/{id}/chat` returns `{ messages, myAuthorRef }` (was a bare array);
  `messages[].userId` is present only for `Admin` callers.
- Frontend upgraded to React 19 + Vite 8 + React Router 7; linting via `oxlint`.

### Migration notes

- New EF migrations: `AddTenantThemingAndContent`, `AddChatMessagesAndBlocking` (plus the
  pre-existing `InitialCreate`, `AddProductMediaAndAuctionBuyout`). Applied on startup in
  dev; run as a deliberate step in production.
- **On the first API start after these changes, every existing token is rejected once**
  (no `sstamp` claim) — users log in again; the client handles it gracefully.
- Adding a new block kind or design template requires an API restart before saves that use
  it are accepted.
