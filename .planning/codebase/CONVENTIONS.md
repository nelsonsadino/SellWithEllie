# Coding Conventions

**Analysis Date:** 2026-10-09

## Naming Patterns

**Files:**
- React components and pages: PascalCase `.jsx`, one component per file, filename equals the default export. Examples: `client/src/components/Modal.jsx`, `client/src/pages/CheckoutPage.jsx`, `client/src/pages/admin/AdminProductsPanel.jsx`
- Context providers: `client/src/context/<Name>Context.jsx`, exporting `<Name>Provider` and a `use<Name>` hook (`client/src/context/AuthContext.jsx` exports `AuthProvider` and `useAuth`; `client/src/context/ToastContext.jsx` exports `ToastProvider` and `useToast`)
- API modules: lowercase single-domain `.js` files under `client/src/api/` (`products.js`, `orders.js`, `auctions.js`), one per server controller area
- Utility/helper modules: camelCase `.js` under `client/src/lib/` (`money.js`, `guestCart.js`, `useReveal.js`)
- Server C#: PascalCase per type, one type per file. Controllers end in `Controller` (`server/Controllers/ProductsController.cs`), services use an `I`-prefixed interface plus implementation (`server/Services/IAuditLogService.cs` / `AuditLogService.cs`), DTOs live in `server/Dtos/` and end in `Dto` or `Dtos` (`ProductDtos.cs` holds `ProductDto`, `ProductMediaDto`), config POCOs end in `Settings` (`server/Config/JwtSettings.cs`)

**Functions (client):**
- camelCase for all functions. Exported React components are PascalCase.
- API functions are named by verb + noun and exported as arrow-function constants: `getProducts`, `getProduct`, `adjustStock`, `uploadProductMedia` (`client/src/api/products.js`)
- Hooks use the `use` prefix: `useAuth`, `useToast`, `useReveal`

**Functions (server):**
- PascalCase for all methods (C# standard). Async methods are suffixed `Async` where a service interface exposes them; controller actions are named by intent (`GetProducts`, `GetProduct`)

**Variables:**
- Client: camelCase. Module-level constants use UPPER_SNAKE_CASE (`RAW_BASE_URL`, `TOKEN_KEY`, `FOCUSABLE` in `client/src/components/Modal.jsx`, `API_BASE_URL` in `client/src/api/client.js`)
- Server private fields: underscore-prefixed camelCase (`_db`, `_blobStorage`, `_auditLog`, `_outputCache` in `server/Controllers/ProductsController.cs`). Constructor-injected base-class fields may use PascalCase (`protected readonly ITenantContext TenantContext` in `server/Controllers/TenantScopedControllerBase.cs`)
- Server constants: PascalCase (`MaxMediaPerProduct`, `AllowedContentTypes`)

**Types (server):**
- Models are plain classes in `server/Models/` (`Product.cs`, `Auction.cs`); enums are separate files named `<Thing>Status.cs` or `<Thing>DrawMode.cs` (`AuctionStatus.cs`, `RaffleDrawMode.cs`)
- DTO properties are auto-properties with explicit defaults: `public string Name { get; set; } = string.Empty;` and collections `= new();`
- Nullable reference types are enabled (`server/Server.csproj`: `<Nullable>enable</Nullable>`, `<ImplicitUsings>enable</ImplicitUsings>`). Use `?` for nullable values, and keep `string.Empty` defaults on non-null strings.

**Types (client):**
- No TypeScript. Client is plain JavaScript with JSX. Do not introduce `.ts`/`.tsx` files without a project-wide decision; there is no `tsconfig` in `client/`.
- PropTypes are not used. Prop contracts are documented in comments above the component.

## Code Style

**Formatting (client):**
- No Prettier config is present. Observed style: no semicolons, single quotes, 2-space indentation, trailing commas on multi-line objects and arrays are inconsistent.
- Match the style of the file you edit. Do not reformat unrelated lines.

**Formatting (server):**
- Standard C# style. Block-scoped namespaces are not used; file-scoped namespaces are used (`namespace SellWithEllie.Controllers;`). Keep this for new files.
- Opening braces on a new line for types and methods (Allman style), as seen in `server/Controllers/TenantScopedControllerBase.cs`.

**Linting (client):**
- `oxlint` is the linter (`client/package.json` script `"lint": "oxlint"`). Config: `client/.oxlintrc.json`.
- Enabled plugins: `react`, `oxc`. Rules enforced:
  - `react/rules-of-hooks`: error
  - `react/only-export-components`: warn, with `allowConstantExport: true`. Do not export non-component values from a `.jsx` file that also exports a component, except constants.
- No lint configuration exists for `server/`. Rely on the .NET compiler warnings.

## Import Organization

**Order (client, observed):**
1. React and React DOM (`import { useState } from 'react'`, `import { createPortal } from 'react-dom'`)
2. Third-party packages (`react-router-dom`, `@microsoft/signalr`)
3. Internal API modules (`../api/...`)
4. Internal context, components, and lib modules (`../context/...`, `../lib/...`)
5. Styles and assets last

**Path Aliases:**
- None configured. Use relative imports (`../api/client`, `../context/AuthContext`).

**Order (server, observed):**
- `using` directives for framework namespaces first (`Microsoft.AspNetCore.*`, `Microsoft.EntityFrameworkCore`), then project namespaces (`SellWithEllie.*`). `ImplicitUsings` is enabled, so do not re-add `System`, `System.Linq`, `System.Threading.Tasks`, or `System.Collections.Generic`.

## Error Handling

**Client (API layer):**
- All HTTP calls go through `request()` in `client/src/api/client.js`, exposed as `apiClient.get/post/put/patch/delete/postForm`. Do not call `fetch` directly from components.
- Errors are plain `Error` objects with a numeric `status` property. Status `0` means the network failed (`'Could not reach the server...'`). A 401 on an authenticated call clears the token and invokes the handler registered with `setUnauthorizedHandler`.
- Components catch errors and show user feedback via `useToast()` or inline state. Empty `catch {}` blocks with a comment are used only where a failure is intentionally ignored, e.g. `client/src/context/CartContext.jsx` skips out-of-stock guest-cart lines.
- Use optional catch binding (`catch {`) when the error value is unused.

**Server (controllers):**
- Return `IActionResult`/`ActionResult<T>` from controller actions. Use the built-in helpers: `NotFound()`, `BadRequest(new { message = "..." })`, `Unauthorized()`, `Conflict(...)`, `Ok(dto)`. Counts in the codebase: `BadRequest(` about 60 uses, `NotFound(` about 39, `Unauthorized(` about 10, `Conflict(` about 8.
- Error bodies are anonymous objects with a `message` property: `new { message = "Unknown shop." }` (`server/Controllers/TenantScopedControllerBase.cs`). Keep this shape for new error responses.
- Tenant-scoped controllers inherit `TenantScopedControllerBase` (`server/Controllers/TenantScopedControllerBase.cs`) and fail closed with a 404 when no tenant resolves. Every new shop-scoped controller must inherit it.
- Services and background jobs catch exceptions where a failure must not stop the loop (`server/Services/AuctionStatusBackgroundService.cs`, `server/Services/EmailSender.cs`).

**Pattern example (controller null check):**
```csharp
var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
if (product is null) return NotFound();
return Ok(product.ToDto());
```
(Pattern from `server/Controllers/ProductsController.cs`.)

## Logging

**Client:**
- Direct `console.*` calls are not used in `client/src` (no matches). Do not add `console.log` to committed code.

**Server:**
- Use `ILogger<T>` injected through the constructor. About 57 `ILogger`/`_logger.` usages exist across `server/`. Use structured message templates (`_logger.LogWarning("... {Id}", id)`), not string interpolation.

## Comments

**When to Comment:**
- Comments explain *why*, not *what*. The codebase uses long rationale comments for non-obvious decisions, e.g. the security note in `client/src/api/client.js` about client-side JWT decoding ("Never trusted for anything security-sensitive") and the `[NonAction]` explanation in `server/Controllers/TenantScopedControllerBase.cs`.
- Put a block comment above a component or service describing its contract and behavior (see `client/src/components/Modal.jsx`, `client/src/context/CartContext.jsx`).
- Section dividers in long API files use `// ---- Admin: inventory management ----`.

**JSDoc/TSDoc:**
- Not used in client. Use `//` line comments.
- C# uses `//` comments above members. XML doc comments (`///`) are not used.

## Function Design

**Size:** Keep API functions one-liners. Long UI components exist (admin panels, checkout); extract subcomponents into the same file when they are only used there.

**Parameters:**
- Client: prefer an options object for optional values (`request(path, { method, body, formData, auth })`), and default parameters (`getProducts(params = {})`).
- Server: use `[FromQuery]`, `[FromBody]`, and route parameters explicitly on action parameters. Clamp paging inputs (`pageSize = Math.Clamp(pageSize, 1, 50)`).

**Return Values:**
- Client API functions return the promise from `apiClient`, which resolves to parsed JSON.
- Server returns DTOs, not EF entities (`product.ToDto()`). Mapping lives in `server/Mapping/MappingExtensions.cs`.

## Module Design

**Exports:**
- Client: named exports for everything except React components, which use default export in `Modal.jsx`-style files and named exports for providers/hooks in `context/` files.
- Server: one public type per file, with the namespace matching the folder (`SellWithEllie.Services`).

**Barrel Files:**
- Not used. Import directly from the module file.

**Client state conventions:**
- Global state uses React Context providers in `client/src/context/`. Providers compose in `client/src/main.jsx` / `client/src/App.jsx`.
- Browser persistence is isolated in `client/src/lib/` (`guestCart.js`, `wishlist.js`, `recentlyViewed.js`). Read and write `localStorage` only through these modules.
- Money values are formatted with `formatMoney(amount, currency)` from `client/src/lib/money.js`. Do not prefix a currency symbol manually.

**Styling conventions (client):**
- Design tokens are CSS custom properties in `client/src/styles/tokens.css`, with theme overrides in `client/src/styles/theme.css` and fonts in `client/src/styles/fonts.css`. Use `var(--token-name)` in CSS. Do not hardcode colors or type sizes in components.
- Inline `style={{ }}` appears in about 22 files; prefer class names for anything reusable.

---

*Convention analysis: 2026-10-09*
