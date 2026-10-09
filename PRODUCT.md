# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Shoppers** — browse, buy, and bid across independently-run shops on the platform. Registered per shop (the same email can be a customer at two different shops independently).
- **Shop admins** — run one shop: catalogue, auctions, chat moderation, storefront customization, orders.
- **Platform admins** — run the SaaS itself: provision/suspend/reactivate shops, edit the platform's own marketing site.

## Product Purpose

SellWithEllie is a multi-tenant SaaS platform that lets any business spin up its own online shop — its own subdomain, product catalogue, live-bidding auctions, cart/checkout, and a fully editable storefront — completely isolated from every other shop on the platform. Success is a shop owner self-serve signing up and being live immediately on the Free plan, then running real commerce (fixed-price sales and live auctions) without custom development.

## Positioning

Live auctions with genuine real-time engagement are the mechanism a generic storefront builder can't easily copy: scheduled open/close, a minimum increment, optional Buy-It-Now, race-safe concurrent bidding (`rowversion`), live price/bid history over SignalR, and per-auction live chat with profanity filtering and admin moderation. This is deep, stateful functionality, not a bolted-on feature — it's the platform's wedge against fixed-price-only storefront tools.

## Operating Context

- Shop admins configure products (up to 5 photos/videos each), run scheduled auctions, moderate chat (block/unblock disruptive users), customize the storefront (one of 9 templates, light/dark default, re-orderable home-page blocks), and review all-orders plus an admin audit log.
- Platform admins provision/suspend/reactivate shops from the platform console and edit the platform's own marketing site (also block-driven).
- Shoppers search/filter/sort the catalogue, wishlist, checkout (simulated payment) or bid live, and chat pseudonymously per auction.
- **Ellie's Friends** is the platform's real first tenant — an aquatics shop (livestock like guppies and mollies) actually being launched on SellWithEllie, not placeholder seed data.

## Capabilities and Constraints

- Fixed-price checkout uses simulated payment only right now — no card is actually charged.
- Live auctions: starting price, minimum increment, timed close, optional Buy-It-Now; concurrent bids are race-safe via `rowversion`.
- Billing: Free/Pro plans via Xendit hosted checkout; Free-plan caps (product listings, active auctions) are enforced server-side.
- Multi-tenant isolation is per-row (`TenantId`) in one shared SQL Server database — not separate databases per shop.
- Optional integrations degrade gracefully rather than blocking the app: Xendit billing, Google/Facebook sign-in, Azure Blob Storage (media upload), and SMTP transactional email each return 503 only on the specific endpoints that need them when unconfigured.
- Roles: `PlatformAdmin` (runs the SaaS), `Admin` (runs one shop), `Customer` (browse/bid/buy) — a "shop" is a tenant business, a listed item is a "product"/auction "lot."

## Brand Commitments

- Platform name: **SellWithEllie**.
- **Ellie's Friends** — a real aquatics shop and the platform's first real tenant/business. Treat its identity, name, and category (aquatics/fish) as a genuine brand commitment, not disposable demo content.
- The platform core itself stays business-agnostic (products are generic: name, category, price, description, media) even though Ellie's Friends is aquatics-specific — do not bake aquatics-only assumptions into shared/platform-level surfaces (marketing site, platform console, generic templates).

## Evidence on Hand

- Pre-launch: no real customers, testimonials, case studies, or press yet. Future design work must not fabricate these.
- Local dev/demo data (seeded guppies, mollies, lot numbers, placeholder fish-icon art) exists only for local development — treat as illustrative, not final product content, unless the user confirms otherwise.

## Product Principles

1. Per-shop isolation is inviolable — no tenant ever sees another tenant's data, even while sharing one database.
2. Real-time engagement (live auctions + chat) is the platform's core wedge, not an add-on feature.
3. Business-agnostic by design — the shared storefront/catalogue system stays generic even as individual shops, like Ellie's Friends, bring their own category and voice.
4. Self-serve first — a shop is usable immediately after signup; paid tiers layer caps on top rather than gating core use.
5. Production-grade by default — structured logging, health checks, transient-fault retry, and graceful degradation of optional integrations rather than hard failures.

## Accessibility & Inclusion

All 9 storefront templates are required to meet WCAG AA in both light and dark themes; re-check after any design-token change.
