# Local setup

Get the API and the SPA running on your machine. ~10 minutes.

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [.NET SDK](https://dotnet.microsoft.com/download/dotnet/8.0) | 8.0.x | `dotnet --version` |
| [Node.js](https://nodejs.org) | 20.19+ or 22.12+ | Vite 8 requires it; `node -v` |
| SQL Server | any | LocalDB, SQL Server Express, a container, or Azure SQL |
| `dotnet-ef` (optional) | 8.x | `dotnet tool install --global dotnet-ef` — only for creating migrations |

**Optional, only for specific features:**

- An [Azure Storage account](https://azure.microsoft.com/free/) — to test product / storefront **media uploads**.
- A [Xendit sandbox account](https://dashboard.xendit.co/register) + a tunnel like [ngrok](https://ngrok.com) — to test **billing**.
- Google Cloud / Meta developer apps — to test **social login**.

All three degrade gracefully: leave them unconfigured and those endpoints return `503`
while everything else works.

## 2. Get the code

```bash
git clone <your-repo-url>
cd "Ellies Friends"
```

## 3. Database

The dev connection string lives in `server/appsettings.Development.json`:

```json
"ConnectionStrings": {
  "DefaultConnection": "Server=YOURHOST\\SQLEXPRESS;Database=SellWithEllieDb;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True"
}
```

Edit `Server=…` for your setup. Common alternatives:

| Setup | Connection string `Server=` … |
|-------|-------------------------------|
| SQL Server Express | `Server=.\SQLEXPRESS;` |
| LocalDB | `Server=(localdb)\MSSQLLocalDB;` |
| Docker (`mcr.microsoft.com/mssql/server`) | `Server=localhost,1433;User Id=sa;Password=Your_password123;` (drop `Trusted_Connection`) |
| Azure SQL | the portal's ADO.NET string |

You don't need to create the database or tables — the API runs all migrations on startup.

## 4. Backend secrets

Nothing sensitive is committed. Everything below is set once via .NET
[user secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets) (stored
outside the repo). `UserSecretsId` is already declared in `Server.csproj`.

```bash
cd server

# ---- Required ----
dotnet user-secrets set "Jwt:Key" "<random string, 32+ characters>"

# ---- Platform owner (runs the SaaS itself) — skipped if unset ----
dotnet user-secrets set "PlatformAdmin:Email"    "owner@yourcompany.example"
dotnet user-secrets set "PlatformAdmin:Password" "ChangeMe!123"

# ---- Demo shop (seeded so a fresh clone isn't empty) ----
# Slug MUST match VITE_DEV_TENANT_SLUG in client/.env (default "demo").
dotnet user-secrets set "DemoShop:Slug"          "demo"
dotnet user-secrets set "DemoShop:Name"          "Ellie's Friends"
dotnet user-secrets set "DemoShop:AdminEmail"    "admin@demo.local"
dotnet user-secrets set "DemoShop:AdminPassword" "ChangeMe!123"

# ---- Optional: media uploads ----
dotnet user-secrets set "BlobStorage:ConnectionString" "DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"

# ---- Optional: billing ----
dotnet user-secrets set "Xendit:SecretKey"                 "xnd_development_..."
dotnet user-secrets set "Xendit:CallbackVerificationToken" "..."

# ---- Optional: social login ----
dotnet user-secrets set "ExternalAuth:GoogleClientId"     "...apps.googleusercontent.com"
dotnet user-secrets set "ExternalAuth:GoogleClientSecret" "..."
dotnet user-secrets set "ExternalAuth:FacebookAppId"      "..."
dotnet user-secrets set "ExternalAuth:FacebookAppSecret"  "..."
```

Full reference for every key: [CONFIGURATION.md](CONFIGURATION.md).

**Generate a JWT key:**

```bash
openssl rand -base64 32
```
```powershell
# Windows PowerShell 5.1
$b = New-Object byte[] 32
(New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
[Convert]::ToBase64String($b)
```

The API **refuses to start** if `Jwt:Key` is missing or shorter than 32 characters.

## 5. Run the API

```bash
cd server
dotnet run
```

- Applies pending migrations (`Database:MigrateOnStartup` defaults to `true`) and seeds
  the platform-owner + demo shop.
- Serves on **`https://localhost:7100`** (and `http://localhost:5100`).
- Swagger UI at **`https://localhost:7100/swagger`** (Development only). Click **Authorize**
  and paste a token from `POST /api/auth/login` to call protected endpoints.

First run will prompt to trust the ASP.NET dev certificate — accept it, or run
`dotnet dev-certs https --trust`.

## 6. Run the SPA

```bash
cd client
cp .env.example .env       # defaults are correct for local dev
npm install
npm run dev
```

Serves on **`http://localhost:5173`**.

`client/.env`:

| Var | Default | Meaning |
|-----|---------|---------|
| `VITE_API_BASE_URL` | `https://localhost:7100/api` | Where the SPA calls the API |
| `VITE_DEV_TENANT_SLUG` | `demo` | Which shop plain `localhost` maps to (must match `DemoShop:Slug`) |
| `VITE_ROOT_DOMAIN` | *(empty)* | Leave empty in dev; set in prod so `{slug}.domain` vs `domain` vs `admin.domain` are told apart |

If your API ports differ, update `VITE_API_BASE_URL` **and** the `AllowedOrigins` array in
`server/appsettings.Development.json`.

## 7. Open the three sites

Modern browsers resolve any `*.localhost` name to your machine — no hosts file needed.

| URL | Site | Log in as |
|-----|------|-----------|
| `http://localhost:5173` | Demo storefront | `DemoShop:AdminEmail` (admin) or register a customer |
| `http://acme.localhost:5173` | Another shop's storefront | — (after `acme` signs up) |
| `http://www.localhost:5173` | Marketing site + `/signup` | — |
| `http://admin.localhost:5173` | Platform console | `PlatformAdmin:Email` |

> Log in and change the seeded example passwords immediately.

## Common dev tasks

### Reset the database

```bash
# drop it, next `dotnet run` recreates + reseeds
dotnet ef database drop --project server -f
```

Or `DROP DATABASE SellWithEllieDb;` in your SQL client.

### Add a migration after changing a model

```bash
cd server
dotnet ef migrations add DescriptiveName
# applied automatically on next `dotnet run`
```

If the DLL is locked (server running under Visual Studio), stop it first, or verify
compilation only with:
`dotnet build --no-dependencies -p:UseAppHost=false -p:OutDir=<temp>`.

### Lint / build the client

```bash
cd client
npm run lint         # oxlint
npm run build         # production build into dist/
npm run preview       # serve the dist/ build locally
```

### Try live bidding

1. Log in as the demo admin → **Admin → Auctions** → create an auction (start time = now).
2. Open the auction page in a normal window and an incognito window as two different
   accounts and place bids — price and history update live in both.

### Try self-serve signup

`http://www.localhost:5173/signup` → pick a name + slug + admin password → you get a link
to `http://{slug}.localhost:5173/login`.

### Test billing locally

See [CONFIGURATION.md § Xendit](CONFIGURATION.md#xendit-billing) — needs `ngrok http 7100`
and a webhook URL in the Xendit dashboard.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| API won't start: "Jwt:Key is missing or too short" | Set `dotnet user-secrets set "Jwt:Key" "<32+ chars>"` |
| API won't start: SQL login/connect error | Fix `ConnectionStrings:DefaultConnection`; confirm the instance is running |
| SPA loads but every call fails / CORS error | `VITE_API_BASE_URL` must match the API URL; that origin must be in `AllowedOrigins` |
| "We couldn't find this shop" on the storefront | `VITE_DEV_TENANT_SLUG` must equal a real `Tenant.Slug` (`DemoShop:Slug`) |
| 401 immediately after logging in | Restart the API — old tokens lack the `sstamp` claim and are rejected once |
| "unknown design template" when saving theme | Restart the API so it picks up the current `TenantDefaults.Templates` list |
| Swagger 500 on a `[FromForm] IFormFile` action | Use `[FromForm] List<IFormFile>` (see the pattern in `ProductsController`) |
| `npm run dev` fails on Node version | Upgrade to Node 20.19+ / 22.12+ (Vite 8) |
| Upload returns 503 | `BlobStorage:ConnectionString` isn't set — expected; paste a hosted URL instead |
