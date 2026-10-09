# Testing Patterns

**Analysis Date:** 2026-10-09

## Test Framework

**Runner:**
- None configured for `client/`. `client/package.json` has no test script and no test dependency (no Vitest, Jest, or Testing Library).
- None configured for `server/`. `server/Server.csproj` references no test SDK (no xUnit, NUnit, or MSTest), and no separate test project exists in the solution tree.
- Config files: none. No `vitest.config.*`, `jest.config.*`, or `playwright.config.*` present in `client/`.

**Assertion Library:**
- Not applicable. No assertion library is installed.

**Run Commands:**
```bash
npm run lint           # Only quality gate present: oxlint over client/ (runs `oxlint`)
npm run build          # vite build, catches import and syntax errors in client/
dotnet build           # Compiles server/ (Nullable + ImplicitUsings enabled)
```
No test, watch, or coverage commands exist.

## Test File Organization

**Location:**
- No test files exist in project source. A glob for `*.test.*` / `*.spec.*` finds matches only inside `client/node_modules/` (third-party packages), never in `client/src/` or `server/`.

**Naming:**
- Not established. If tests are added, use `<Name>.test.jsx` for client components and `<Name>Tests.cs` (or a `<Project>.Tests` project) for server code, matching common defaults for each stack.

**Structure:**
```
client/src/**/          # No __tests__ or co-located test files exist yet
server/                 # No *.Tests project exists yet
```

## Test Structure

**Suite Organization:**
- Not applicable. There are no existing suites to mirror.

**Patterns:**
- Not established by this codebase.

## Mocking

**Framework:** None installed.

**Patterns:**
- Not established. The one seam that would be easiest to mock is the HTTP layer: all client API calls go through `apiClient` in `client/src/api/client.js`, so a test can replace the module with a stub object exposing `get/post/put/patch/delete/postForm`.
- On the server, services are consumed through interfaces (`IAuditLogService`, `IBlobStorageService`, `IEmailSender`, `IXenditClient`, `ITenantContext` in `server/Services/`). These are the correct mocking boundaries when tests are written.

**What to Mock:**
- External services: payments (`IXenditClient`, `ITenantPaymentService`), email (`IEmailSender`), blob storage (`IBlobStorageService`).
- Browser APIs: `localStorage` (used by `client/src/api/client.js` and `client/src/lib/*`), `fetch`.
- The clock for `isTokenExpired` in `client/src/api/client.js` and auction timing in `server/Services/AuctionService.cs`.

**What NOT to Mock:**
- Pure helpers: `formatMoney` in `client/src/lib/money.js`, `decodeToken` logic, `UploadValidation` and `ReturnUrlValidator` in `server/Services/`. Test these directly.
- EF Core: prefer an in-memory or SQLite-backed `ApplicationDbContext` (`server/Data/ApplicationDbContext.cs`) over mocking `DbSet`.

## Fixtures and Factories

**Test Data:**
- None exist. Good candidates for first fixtures: a tenant and product seed based on `server/Data/TenantDefaults.cs` and `server/Data/DbInitializer.cs`.

**Location:**
- Not applicable.

## Coverage

**Requirements:** None enforced. No coverage tool configured.

**View Coverage:**
```bash
Not available. Requires adding a coverage tool first (e.g. vitest --coverage on client, coverlet on server).
```

## Test Types

**Unit Tests:**
- Not present. Highest-value first targets: `client/src/lib/money.js`, `client/src/lib/guestCart.js`, `client/src/lib/sectionSchema.js`, `client/src/api/client.js` (`decodeToken`, `isTokenExpired`), and server `server/Services/CheckoutPricing.cs`, `server/Services/RaffleDrawTiming.cs`, `server/Services/ReturnUrlValidator.cs`, `server/Services/SecretCipher.cs`.

**Integration Tests:**
- Not present. Candidates: controllers under `server/Controllers/` using `WebApplicationFactory`, with the tenant header `X-Tenant-Slug` (sent by `client/src/api/client.js`) to exercise `TenantScopedControllerBase`.

**E2E Tests:**
- Not used. No Playwright or Cypress setup exists.

## Common Patterns

**Async Testing:**
- Not established. Client API calls are `async` and return promises; when tests are added, use `await` with the stubbed `apiClient`.

**Error Testing:**
- Not established. The client error contract to assert against is in `client/src/api/client.js`: thrown `Error` with `status` set to `0` for network failure, `401` for an expired or rejected token, and the server's `message` body for other failures.
- Server error contract: assert on `NotFound`, `BadRequest`, or `Unauthorized` results with the anonymous `{ message }` body (see `server/Controllers/TenantScopedControllerBase.cs`).

## Gaps Summary

- Zero automated tests across both `client/` and `server/`.
- The only automated checks are `oxlint` (client) and the compiler (both).
- Any new non-trivial logic in `server/Services/` (pricing, raffle timing, payment webhooks in `server/Controllers/BillingWebhookController.cs`) should land with at least one test, given that these paths handle money and the webhook trust boundary.

---

*Testing analysis: 2026-10-09*
