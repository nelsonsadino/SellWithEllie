# Contributing

## Setup

Follow [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md). You need the API and the SPA both
running.

## Workflow

1. Branch off the default branch: `feat/short-name`, `fix/short-name`, `docs/short-name`.
2. Make the change. Keep it focused — one concern per PR.
3. Verify (below). Update docs in the same PR when behaviour, config, or the API changes.
4. Open a PR. `.github/workflows/security.yml` must stay green.

### Commit messages

Short imperative subject; body explains *why* if it isn't obvious.

```
Add video-banner block with upload

The storefront editor had no way to use a shop-supplied clip; carousel
slides only take images. New `videoBanner` section kind + a tenant media
upload endpoint that reuses the blob service.
```

## Verify before pushing

```bash
# client
cd client
npm run lint          # oxlint — must be clean (no errors)
npm run build          # must succeed

# server
cd ../server
dotnet build           # must succeed, 0 warnings
dotnet list package --vulnerable --include-transitive   # must be clean
```

If the API is running under Visual Studio and holds the build DLL, verify server
compilation without touching `bin/`:

```bash
dotnet build --no-dependencies -p:UseAppHost=false -p:OutDir=<a temp dir>
```

There is no automated test suite yet. When touching auth, tenancy, billing, or bidding,
manually exercise the relevant flow (see LOCAL_SETUP § "Common dev tasks") and note what
you checked in the PR.

## Code conventions

### Frontend (`client/`)

- React 19 function components + hooks. No class components.
- Plain CSS via the token system — **no** Tailwind, CSS-in-JS, or component libraries.
  Style with `var(--token)` in `styles/theme.css`; never hard-code a colour.
- State: React context (`context/`) for cross-cutting concerns; local `useState` otherwise.
- API calls go through `api/*.js` modules → `apiClient` (`api/client.js`). Don't `fetch`
  directly from a component.
- Match the surrounding file: import order, naming, comment density.

### Backend (`server/`)

- Nullable reference types + implicit usings are on.
- One controller per resource area; tenant-scoped controllers extend
  `TenantScopedControllerBase`.
- Every request/response body is a **DTO** (`Dtos/`), never a raw EF entity. Map in
  `Mapping/MappingExtensions.cs`.
- Guard every mutating endpoint with `[Authorize(Roles = …)]` server-side — hiding a UI
  button is never the only check.
- External dependencies (blob, Xendit, OAuth providers) **degrade gracefully**: if
  unconfigured, return `503`, don't throw.
- File-upload actions take `[FromForm] List<IFormFile> files` (a bare `[FromForm]
  IFormFile` breaks Swagger generation).

## Common recipes

### Add a database migration

```bash
cd server
dotnet ef migrations add DescriptiveName
```

Commit the generated files under `Migrations/` **and** the updated
`ApplicationDbContextModelSnapshot.cs`. It applies on the next `dotnet run` in dev; in prod
it's a deliberate step (see [docs/OPERATIONS.md](docs/OPERATIONS.md)).

### Add a storefront block type

1. `client/src/lib/sectionSchema.js` — a new entry: `label`, `description`, `fields`,
   `defaultData`. Field types: `text`, `textarea`, `number`, `toggle`, `list`, `itemList`,
   `slides`, `video`.
2. `client/src/components/sections/YourSection.jsx` — the component. Props: `{ data, index }`.
3. `client/src/components/SectionRenderer.jsx` — import it and add to the `REGISTRY` map;
   add the kind to `NO_REVEAL` if it's full-bleed / above the fold.
4. `client/src/styles/theme.css` — its styles, token-based, reduced-motion-safe.
5. `server/Data/TenantDefaults.cs` — add the kind string to `SectionKinds`. **Restart the
   API** — the allow-list is validated on section writes.

### Add a design template

See [docs/THEMING.md § Adding a new template](docs/THEMING.md#adding-a-new-template).

### Add a config key

Add it to `server/appsettings.json` with a safe default, read it in `Program.cs` /
`Config/*Settings.cs`, and document it in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
Secrets go through user secrets / env vars, never `appsettings.json`.

## Security-sensitive changes

Read [SECURITY.md](SECURITY.md). Anything touching auth, tenancy, CORS, rate limiting,
uploads, or the token pipeline should call out the security reasoning in the PR
description.
