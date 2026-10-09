# Codebase Concerns

**Analysis Date:** 2026-10-09

## Tech Debt

**Automated test coverage is absent:**
- Issue: No test project or test files were found. No `*.Tests*`, `*.test.*`, or `*.spec.*` files exist in `server/` or `client/src/`. `client/package.json` has no `test` script and no vitest/jest dependency. Only `lint` (oxlint), `build`, and `dev` scripts exist.
- Files: `client/package.json`, `server/Server.csproj`, `.github/workflows/security.yml`
- Impact: Payment webhooks, checkout pricing (`server/Services/CheckoutPricing.cs`, `server/Services/CheckoutService.cs`), auction/raffle timing (`server/Services/AuctionService.cs`, `server/Services/RaffleService.cs`, `server/Services/RaffleDrawTiming.cs`), and tenant isolation have no regression protection.
- Fix approach: Add an xUnit project under `server/` for pricing, webhook token checks, and tenant scoping; add a Vitest setup in `client/` for `client/src/lib/money.js` and `client/src/lib/sectionSchema.js`. Wire both into CI.

**Large page and component files:**
- Issue: Several files exceed 400 lines and mix data fetching, state, and rendering.
- Files: `client/src/pages/RaffleDetailPage.jsx` (806 lines), `client/src/pages/admin/AdminProductsPanel.jsx` (572), `client/src/pages/admin/AdminRafflesPanel.jsx` (447), `client/src/components/SectionEditor.jsx` (442), `client/src/pages/marketing/LandingPage.jsx` (439), `client/src/pages/platform/PlatformDashboardPage.jsx` (389), `client/src/components/RaffleDuckRaceDraw.jsx` (357)
- Impact: Hard to review and change safely; regressions are likely when touching shared state.
- Fix approach: Extract hooks (for example a `useRaffle` hook from `RaffleDetailPage.jsx`) and sub-components into sibling files when next modifying them.

**Platform-wide Xendit webhook uses a single global token while tenant webhooks use per-tenant tokens:**
- Issue: `server/Controllers/BillingWebhookController.cs` compares `x-callback-token` against `_xenditSettings.CallbackVerificationToken` (platform billing), while `server/Controllers/PaymentsController.cs` compares against `_payments.GetWebhookToken(tenant)`. Two verification paths with different sources of truth.
- Files: `server/Controllers/BillingWebhookController.cs`, `server/Controllers/PaymentsController.cs`, `server/Services/TenantPaymentService.cs`
- Impact: Easy to misconfigure one path and not the other; the rules for empty tokens differ slightly (the tenant path also rejects an empty expected token explicitly, the billing path relies on `FixedTimeEquals` with the configured value).
- Fix approach: Put both paths behind one helper that rejects empty expected tokens and is covered by tests.

**Schema migrations run automatically on startup by default:**
- Issue: `server/appsettings.json` sets `Database:MigrateOnStartup` to `true`, and `server/Program.cs` runs migrations at startup when that flag is true.
- Files: `server/appsettings.json`, `server/Program.cs` (around line 490-495), `docs/DEPLOYMENT.md`
- Impact: Multiple instances starting at once can race on migrations; a bad migration blocks startup.
- Fix approach: Set `MigrateOnStartup` to `false` in production configuration and run `dotnet ef database update` as a deploy step (the code comment already recommends this).

**Client-side admin and demo credential handling in UI:**
- Issue: The platform dashboard shows a generated temporary admin password in plain text after shop creation.
- Files: `client/src/pages/platform/PlatformDashboardPage.jsx` (around lines 235-270)
- Impact: The password is held in React state and rendered on screen; it is visible to anyone looking at the screen.
- Fix approach: Show it once with a copy button and clear state on dismiss; or send credentials by email only.

## Known Bugs

No confirmed defects were reproduced during this analysis. Behavior below is inferred from reading code and needs runtime verification.

**Session-adjacent data persists in browser storage after sign-out:**
- Symptoms: `wishlist`, `recentlyViewed`, and `guestCart` data persist in `localStorage` across sign-in and sign-out.
- Files: `client/src/lib/wishlist.js`, `client/src/lib/recentlyViewed.js`, `client/src/lib/guestCart.js`, `client/src/context/AuthContext.jsx` (line 46 clears only `USER_KEY`)
- Trigger: Sign out on a shared browser, then another user signs in.
- Workaround: Clear site data manually.

## Security Considerations

**JWT stored in localStorage:**
- Risk: Any XSS in the SPA can read the bearer token from `localStorage`.
- Files: `client/src/api/client.js` (lines 10-18), `client/src/context/AuthContext.jsx` (lines 22, 96)
- Current mitigation: The client stores only the token and a user summary; no `dangerouslySetInnerHTML` was found in `client/src`. Strict headers are defined in `client/public/_headers`.
- Recommendations: Move the token to an httpOnly, Secure, SameSite cookie issued by the API, or keep the token short-lived (`Jwt:ExpiryMinutes` is 60 in `server/appsettings.json`) and add a refresh flow.

**Secret placeholders in committed configuration:**
- Risk: `server/appsettings.json` contains empty secret fields (`Jwt:Key`, `Xendit:SecretKey`, `Xendit:CallbackVerificationToken`, `Payments:EncryptionKey`, `Email:SmtpPassword`, `BlobStorage:ConnectionString`, `ExternalAuth:*Secret`). A developer who fills these in and does not use user-secrets could commit them.
- Files: `server/appsettings.json`, `server/appsettings.Development.json`
- Current mitigation: `.gitignore` excludes `server/appsettings.Development.json`, `server/appsettings.Production.json`, and `.env` / `.env.local`. `server/Program.cs` rejects a short `Jwt:Key` at startup. README documents `dotnet user-secrets`.
- Recommendations: Use Azure Key Vault or environment variables for production; add a secret-scanning step to `.github/workflows/security.yml`.

**Demo and seeded passwords documented in README:**
- Risk: `README.md` (lines 97-125) shows `ChangeMe!123` as example passwords for the platform owner and demo shop admin. If a seeded environment is deployed unchanged, these are live credentials.
- Files: `README.md`, `server/Data/DbInitializer.cs` (lines 43-68, 146-162)
- Current mitigation: README warns to change them before real use.
- Recommendations: Refuse to seed admin users with a password matching the README example in non-development environments.

**Dependency audit does not gate frontend builds on all severities:**
- Risk: `.github/workflows/security.yml` runs `npm audit --omit=dev --audit-level=moderate` but the NuGet check fails only on text matches for "Critical|High|Moderate" in `dotnet list package --vulnerable` output, which is brittle.
- Files: `.github/workflows/security.yml`
- Current mitigation: Both audits run on push.
- Recommendations: Use `dotnet list package --vulnerable --format json` and parse severity explicitly.

**CORS allows credentials with a configurable origin list:**
- Risk: `server/Program.cs` (lines 326-344) registers `AllowFrontend` with `AllowCredentials()`. The origin rule includes a wildcard-subdomain branch for `*.localhost` in development (not fully traced in this review). If that branch is reachable in production, cross-site credentialed requests may be possible.
- Files: `server/Program.cs`, `server/appsettings.json` (`AllowedOrigins`)
- Current mitigation: Origin list is read from configuration.
- Recommendations: Confirm the wildcard-subdomain branch is gated on `IsDevelopment()`.

**Forwarded headers trust depends on configuration:**
- Risk: `server/Program.cs` (around lines 399-409) clears `KnownProxies` and only trusts configured IPs. `KnownProxies` defaults to an empty array in `server/appsettings.json`, so forwarded client IPs are not trusted. Rate limiting on `auth` (`server/Program.cs` line 298) keys on the connection address unless proxies are configured.
- Files: `server/Program.cs`, `server/appsettings.json`
- Current mitigation: Comment in code requires setting `KnownProxies` behind an edge proxy.
- Recommendations: Document the required value per deployment in `docs/DEPLOYMENT.md`.

## Performance Bottlenecks

**Auction and raffle status polling:**
- Problem: Clients poll for auction and raffle state while a background service also advances status.
- Files: `server/Services/AuctionStatusBackgroundService.cs`, `client/src/components/CountdownTimer.jsx`, `client/src/components/AuctionTicker.jsx`, `client/src/components/RaffleTicker.jsx`
- Cause: Polling intervals are fixed in code; the server is not pushing updates except via SignalR hubs in `server/Hubs`.
- Improvement path: Use the existing SignalR hub (`@microsoft/signalr` is already a dependency) for status changes instead of polling.

**Large media in product galleries:**
- Problem: `BlobStorage:MaxFileSizeBytes` is 104857600 (100 MB) in `server/appsettings.json`.
- Files: `server/appsettings.json`, `server/Services/UploadValidation.cs`, `client/src/components/ProductMediaManager.jsx`
- Cause: Limit is high for product images and video.
- Improvement path: Lower the limit for images and keep a separate, higher limit for video; transcode on upload.

## Fragile Areas

**Tenant scoping across controllers:**
- Files: `server/Controllers/TenantScopedControllerBase.cs`, `server/Services/TenantContext.cs`, `server/Services/TenantCache.cs`, `server/Controllers/*.cs`
- Why fragile: Every tenant-scoped query must filter by tenant. Isolation depends on each controller and service applying it correctly; no global query filter was confirmed in this review.
- Safe modification: Add new endpoints by inheriting `TenantScopedControllerBase`; verify the tenant filter in each new query.
- Test coverage: None (see Test Coverage Gaps).

**Raffle draw timing and visual draws:**
- Files: `server/Services/RaffleService.cs`, `server/Services/RaffleDrawTiming.cs`, `client/src/components/RaffleWheelDraw.jsx`, `client/src/components/RaffleDuckRaceDraw.jsx`, `client/src/components/RaffleInstantDraw.jsx`
- Why fragile: Winner selection is computed on the server while animations are computed on the client; a mismatch in timing or seed can show a different winner than the one recorded.
- Safe modification: Keep the server as the single source of truth for the winner; treat the client animation as presentation only.
- Test coverage: None.

**Checkout pricing duplicated between server and client:**
- Files: `server/Services/CheckoutPricing.cs`, `server/Services/CheckoutService.cs`, `client/src/lib/money.js`, `client/src/pages/CheckoutPage.jsx`
- Why fragile: Displayed totals and charged totals can diverge if rounding or shipping rules change in one place only.
- Safe modification: Change pricing on the server first; have the client display the server quote.
- Test coverage: None.

## Scaling Limits

**In-memory caches and rate limiters:**
- Current capacity: Single process.
- Limit: `server/Services/TenantCache.cs` and `server/Services/ChatRateLimiter.cs` keep state in process memory; a multi-instance deploy will have per-instance limits and stale tenant data.
- Scaling path: Move to Redis or a distributed cache when running more than one instance.

**SignalR hubs on a single instance:**
- Current capacity: Single-node hub connections (`server/Hubs`).
- Limit: Without a backplane, broadcasts reach only clients connected to the same instance.
- Scaling path: Add the Azure SignalR Service or Redis backplane before horizontal scaling.

## Dependencies at Risk

**Build tooling pinned to bleeding-edge majors:**
- Risk: `client/package.json` depends on React 19.2.x and `@microsoft/signalr` ^10.0.11. `server/bin/Debug/net8.0` shows the server builds for net8.0, whose standard support ends in November 2026 (verify the exact date against Microsoft lifecycle docs).
- Impact: No security patches for the runtime after its end-of-support date.
- Migration plan: Move the server target to net9.0 or net10.0 and re-run tests (once they exist).

## Missing Critical Features

**Automated backup and restore verification:**
- Problem: `docs/OPERATIONS.md` describes backups but no automated restore test was found in the repository.
- Blocks: Confident disaster recovery for paying tenants.

**Email sending requires manual SMTP setup:**
- Problem: `Email:SmtpHost` and related values are empty in `server/appsettings.json`; `server/Services/EmailSender.cs` will not send without them.
- Blocks: Password-reset and order-notification flows in production unless configured.

## Test Coverage Gaps

**Payment webhooks:**
- What's not tested: Token verification and status transitions in `server/Controllers/PaymentsController.cs` and `server/Controllers/BillingWebhookController.cs`.
- Files: `server/Controllers/PaymentsController.cs`, `server/Controllers/BillingWebhookController.cs`
- Risk: A broken webhook can mark orders paid without payment, or reject real payments.
- Priority: High

**Auth and lockout:**
- What's not tested: Lockout after repeated failures (`server/Controllers/AuthController.cs` line 109 uses `lockoutOnFailure: true`) and token revocation (`server/Services/TokenService.cs`).
- Files: `server/Controllers/AuthController.cs`, `server/Services/TokenService.cs`
- Risk: Lockout or revocation regressions go unnoticed.
- Priority: High

**Upload validation:**
- What's not tested: `server/Services/UploadValidation.cs` file type and size checks used by `server/Services/BlobStorageService.cs`.
- Files: `server/Services/UploadValidation.cs`, `server/Services/BlobStorageService.cs`
- Risk: Unsafe file types reaching blob storage.
- Priority: High

**Client money and section schema helpers:**
- What's not tested: `client/src/lib/money.js`, `client/src/lib/sectionSchema.js`.
- Files: `client/src/lib/money.js`, `client/src/lib/sectionSchema.js`
- Risk: Currency formatting or section validation regressions.
- Priority: Medium

---

*Concerns audit: 2026-10-09*
