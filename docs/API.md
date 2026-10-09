# API reference

Base URL: `https://<api-host>/api`. Interactive docs (Development only):
`https://localhost:7100/swagger`.

## Conventions

### Tenant header

Every request that operates on a shop must identify it:

```
X-Tenant-Slug: acme
```

The SPA sends this on all storefront calls. Tenant-independent endpoints (signup, platform
console, `POST /api/billing/webhook`) don't need it. Tenant-scoped endpoints return **404**
if no tenant resolves.

### Authentication

```
Authorization: Bearer <jwt>
```

Get a token from `POST /api/auth/login` (or the social-login flow). Tokens last 60 minutes
and carry a security-stamp claim — after `POST /api/auth/logout` (or a password change)
every previous token for that account is rejected.

Roles: `PlatformAdmin`, `Admin`, `Customer`.

### Errors

Non-2xx responses are JSON: `{ "message": "human-readable reason" }`. `422`-style
validation errors from model binding use the standard ASP.NET `ValidationProblemDetails`
shape. Stack traces are never returned in production.

| Status | Meaning here |
|--------|--------------|
| `400` | Bad input / business rule violated (e.g. bid too low, auction ended) |
| `401` | Missing/expired/invalid token, or token's tenant ≠ resolved tenant |
| `403` | Authenticated but not allowed (wrong role, not your resource) |
| `404` | Not found, or no tenant resolved on a tenant-scoped route |
| `409` | Conflict (slug taken, email already registered, product already has an auction) |
| `429` | Rate limited, or account locked out |
| `503` | An optional dependency (blob storage / Xendit / a social provider) isn't configured |

### Rate limits

- `POST /api/auth/*`, `POST /api/signup`, `GET /api/auth/external/*` — **10 / minute per client IP**.
- Everything else — a generous **600 / minute per client IP** global backstop.

Behind a proxy/CDN, set `KnownProxies` (see [CONFIGURATION.md](CONFIGURATION.md)) or all
callers share one bucket.

---

## Endpoints

Legend: 🔓 public · 👤 any authenticated user · 🛠️ `Admin` · 🏛️ `PlatformAdmin`

### Auth — `/api/auth`

| Method | Path | Access | Notes |
|--------|------|--------|-------|
| POST | `/register` | 🔓 | Tenant-scoped. Creates a `Customer`. Returns `{ token, expiresAtUtc, email, displayName, roles }` |
| POST | `/login` | 🔓 | Same response shape. Generic error on bad email *or* password. Lockout after 8 failures |
| POST | `/logout` | 👤 | Rotates the security stamp → revokes all tokens for this account. `204` |
| GET | `/external/{google\|facebook}/start` | 🔓 | **Browser navigation, not fetch.** Query: `slug`, `returnUrl`. Redirects to the provider |
| GET | `/external/{google\|facebook}/callback` | 🔓 | Provider redirect target. Ends by redirecting the browser to `{slug host}/login#token=…` |

### Signup — `/api/signup`

| Method | Path | Access | Notes |
|--------|------|--------|-------|
| GET | `/check-slug?slug=acme` | 🔓 | `{ available: bool }` |
| POST | `/` | 🔓 | Creates a shop + its first `Admin`. Body: name, slug, admin email + password. Returns a token for the new admin |

### Tenant / storefront — `/api/tenant`

| Method | Path | Access | Notes |
|--------|------|--------|-------|
| GET | `/current` | 🔓 | Shop identity + `themeTemplate` + `themeMode` + `content` (map) + `sections` (visible, ordered) |
| GET | `/settings` | 🛠️ | Same, plus hidden sections — for the admin editor |
| PUT | `/theme` | 🛠️ | `{ themeTemplate, themeMode }`. `204` |
| PUT | `/content` | 🛠️ | `{ entries: { key: value } }`. Empty value reverts a key to its default. `204` |
| POST | `/sections` | 🛠️ | `{ kind, data, isVisible }` → the created `SectionDto` |
| PUT | `/sections/{id}` | 🛠️ | `{ kind, data, isVisible }` → updated `SectionDto` |
| DELETE | `/sections/{id}` | 🛠️ | `204` |
| PUT | `/sections/order` | 🛠️ | `{ orderedIds: [int] }`. `204` |
| POST | `/media` | 🛠️ | `multipart/form-data`, field `files` (one file). Image/video, magic-byte checked. → `{ url, isVideo }`. `503` if blob storage unconfigured |

`SectionDto` = `{ id, kind, position, isVisible, data }` where `data` is the block's parsed
JSON. Block `kind` values: `hero`, `carousel`, `videoBanner`, `uspStrip`, `lookbook`,
`newsletter`, `featureGrid`, `richText`, `gallery`, `cta`, `productGrid`, `auctionTicker`.

### Products — `/api/products`

| Method | Path | Access | Notes |
|--------|------|--------|-------|
| GET | `/` | 🔓 | Query: `search`, `category`, `sort` (`newest`/`price_asc`/`price_desc`/`name`), `page`, `pageSize`. → `{ items, page, totalPages, totalCount }` |
| GET | `/categories` | 🔓 | Distinct category strings |
| GET | `/{id}` | 🔓 | Includes media gallery + any active auction id |
| POST | `/` | 🛠️ | Create. Plan-gated (Free listing cap) |
| PUT | `/{id}` | 🛠️ | Update |
| DELETE | `/{id}` | 🛠️ | Delete (also removes its blob media) |
| POST | `/{id}/media` | 🛠️ | `multipart/form-data`, field `files` (up to 5 total). Magic-byte checked. `503` if unconfigured |
| DELETE | `/{id}/media/{mediaId}` | 🛠️ | `204` |

### Auctions — `/api/auctions`

| Method | Path | Access | Notes |
|--------|------|--------|-------|
| GET | `/` | 🔓 | Query: `status` (`Scheduled`/`Active`/`Closed`/`Cancelled`) |
| GET | `/{id}` | 🔓 | Current price, times, bid count, buyout price |
| POST | `/` | 🛠️ | Create. Body: productId, startingPrice, minIncrement, start/end times, optional buyoutPrice. Plan-gated (Free active-auction cap) |
| POST | `/{id}/cancel` | 🛠️ | Only Scheduled/Active |
| POST | `/{id}/bids` | 👤 | `{ amount }`. Must ≥ current + increment. Race-safe; loser gets `400` "please retry" |
| POST | `/{id}/buyout` | 👤 | Ends the auction immediately at the buyout price; records an order |
| GET | `/{id}/chat` | 🔓 | `{ messages: [ChatMessageDto], myAuthorRef }`. `messages[].userId` is present only for `Admin` callers |
| POST | `/{id}/chat` | 👤 | `{ content }`. Profanity-filtered, spam-limited, blocked-user-checked, rejected if auction closed. Broadcasts `ChatMessageReceived` |

`ChatMessageDto` = `{ id, auctionId, authorRef, userId?, displayName, isAdmin, content,
wasFiltered, sentAtUtc }`. `authorRef` is an opaque per-auction pseudonym.

### Chat moderation — `/api/chat` (🛠️ all)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/blocked-users` | Everyone currently blocked from chat in this shop |
| POST | `/block` | `{ userId? , authorRef? + auctionId? , reason? }`. Can't block yourself or another admin |
| DELETE | `/block/{userId}` | Unblock |

### Cart — `/api/cart` (👤 all, your own cart)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Line items + total |
| POST | `/{productId}` | Add / increment |
| DELETE | `/{productId}` | Remove |
| POST | `/checkout` | Creates an order, marks products sold, clears the cart (mock payment) |

### Orders — `/api/orders`

| Method | Path | Access | Notes |
|--------|------|--------|-------|
| GET | `/` | 👤 | Your orders |
| GET | `/{id}` | 👤 | Your order (or any, if `Admin`) |
| GET | `/admin/all` | 🛠️ | Every order in the shop |

### Billing — `/api/billing` (🛠️ except the webhook)

| Method | Path | Access | Notes |
|--------|------|--------|-------|
| GET | `/status` | 🛠️ | Current plan + subscription status. `503` if Xendit unconfigured |
| POST | `/create-checkout-session` | 🛠️ | Returns a Xendit hosted-checkout URL |
| POST | `/webhook` | 🔓 | `x-callback-token` verified in fixed time against `Xendit:CallbackVerificationToken`. Wrong/missing → `401` |

### Marketing site — `/api/marketing`

| Method | Path | Access | Notes |
|--------|------|--------|-------|
| GET | `/site` | 🔓 | `{ content, sections }` for the platform landing page (visible sections only) |

### Platform console — `/api/platform` (🏛️ all)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/tenants` | All shops with plan + status |
| POST | `/tenants` | Create a shop: name, slug, owner name/email, temp password, plan. Seeds default storefront |
| POST | `/tenants/{id}/deactivate` | Suspend |
| POST | `/tenants/{id}/activate` | Reactivate |
| GET | `/marketing` | Full marketing content + sections (incl. hidden) |
| PUT | `/marketing/content` | `{ entries }` |
| POST/PUT/DELETE | `/marketing/sections[/{id}]` | Block CRUD, same shape as tenant sections |
| PUT | `/marketing/sections/order` | `{ orderedIds }` |

---

## SignalR — `/hubs/auction`

WebSocket. Auth token on this path only is passed as `?access_token=<jwt>` (browsers can't
set headers on the handshake). Anonymous connections are allowed (the live feed is public,
same as the REST chat/bid history).

**Client → server**

| Method | Args |
|--------|------|
| `JoinAuction` | `(tenantId, auctionId)` — validated; joins group `auction-{tenantId}-{auctionId}` |
| `LeaveAuction` | `(tenantId, auctionId)` |

**Server → client**

| Event | Payload |
|-------|---------|
| `BidPlaced` | `{ auctionId, amount, bidderDisplayName, bidCount }` |
| `AuctionStarted` | `{ auctionId }` |
| `AuctionClosed` | `{ auctionId, winner…, closedViaBuyout }` |
| `ChatMessageReceived` | `ChatMessageDto` (opaque `authorRef`, never a user id) |
