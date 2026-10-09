# User manual

Three audiences:

- [**Shoppers**](#part-1--shoppers) — browsing, buying, and bidding on a shop.
- [**Shop admins**](#part-2--shop-admins) — running one shop.
- [**Platform admins**](#part-3--platform-admins) — running the whole platform.

Every screen is responsive and theme-aware. A **theme toggle** in the header cycles
*system → light → dark* for your browser; the shop chooses the default.

---

## Part 1 — Shoppers

### Finding your way around

| Where | What |
|-------|------|
| **Home** (`/`) | The shop's landing page — built by the shop from blocks (banners, featured products, a live auction ticker, and more). |
| **Shop** (`/products`) | The full catalogue. Search by name, filter by category, sort (newest / price / name), paginate. |
| **Product page** (`/products/:id`) | Photos/videos gallery, description, price, and either **Add to cart** or a link to its live auction. |
| **Auctions** (`/auctions`) | Every scheduled, live, and closed auction. |
| **Auction page** (`/auctions/:id`) | Current price, countdown, bid history, live chat, and the bid box. |
| **Saved** (`/wishlist`) | Products you've hearted. Stored on this device. |
| **Cart / Checkout** | Fixed-price items you're buying. |
| **Orders** (`/orders`) | Your purchase history (after logging in). |

Recently-viewed products appear near the bottom of product pages.

### Creating an account

**Register** (`/register`) with email + password, or use **Continue with Google /
Facebook** if the shop has enabled them. Passwords need 8+ characters with an
upper-case letter, a lower-case letter, and a digit. After 8 failed logins an account
locks for 10 minutes.

Accounts are **per shop** — the same email can be a customer at two different shops
independently.

If your session expires while you're using the site, you're sent to the login page and
returned to the page you were on after signing back in.

### Buying a fixed-price item

1. On a product page, **Add to cart** (only shown for in-stock, non-auction-only items).
2. Open the **cart**, review, **Checkout**.
3. Checkout records an **order** and marks the item sold. *Payment is simulated — no card
   is charged.*
4. See it under **Orders**.

### Bidding in an auction

1. Open an auction that is **Live**. You'll see the current price, a countdown, and the
   full bid history updating in real time as others bid.
2. Enter an amount that is **at least the current price + the minimum increment** and
   **Place a bid**.
3. If two people bid at the same instant, only one wins the race — the other gets a
   "someone just bid, please retry" message. Just bid again.
4. When the timer ends, the **highest bid wins**. The winner gets an order recorded the
   same way checkout does.

**Buy It Now.** If the seller set a buyout price, a **Buy now** option appears. Taking it
ends the auction immediately, you win at that price, and an order is recorded.

**Scheduled** auctions show a countdown to when bidding opens. **Closed / Cancelled**
auctions are read-only.

### Auction chat

Each live auction has a chat. You must be logged in to post. Messages are profanity-filtered
and rate-limited (a short gap between messages, and a cap per 20 seconds). Chat closes when
the auction closes. A shop admin can block a disruptive user from chat across the whole
shop. Your identity in chat is a per-auction pseudonym — other shoppers never see your
account id.

---

## Part 2 — Shop admins

You get an **Admin** account when you sign your shop up, or when a platform admin creates
the shop for you. Sign in on your shop's storefront and open **Admin** (`/admin`).

The dashboard has five tabs: **Products · Auctions · Orders · Storefront · Billing**.

### Products

- **Create / edit / delete** listings: name, category, optional subcategory, price,
  description, a cover image URL, an **in stock** flag, and an **auction-only** flag
  (hides *Add to cart* — the item is sold only via bidding).
- Category and subcategory are free text, so the same fields work for any kind of shop.
- **Photos / videos.** After saving a product once, a media section appears. Upload up to
  **5 files** (JPEG, PNG, WebP, GIF, MP4, WebM, MOV; 100 MB each by default). They show as
  a gallery on the product page. The cover image URL is still used for cards/lists; if you
  leave it blank the first uploaded photo is used.
  - Files are validated by their actual content, not just the extension.
  - If the shop hasn't configured media storage, uploads return an error asking you to
    paste a hosted URL instead.
- **Free plan cap:** a limited number of listings. Pro is unlimited. The limit is enforced
  when you try to create past it.

### Auctions

- **Create an auction** for a product: starting price, minimum bid increment, start time,
  end time, and an optional **Buy It Now** price (must be above the starting price). If the
  start time is now or in the past, the auction opens immediately; otherwise it's Scheduled
  and opens on its own.
- **Cancel** a scheduled or live auction. Closed auctions can't be changed.
- A product can have only one active/scheduled auction at a time.
- **Free plan cap:** a limited number of active/scheduled auctions at once.
- Auctions open and close on schedule automatically — you don't need to be online.

### Orders

Every order placed at your shop — via checkout or an auction win — with buyer, items,
totals, and status.

### Storefront

Three sub-tabs. **Changes are live for shoppers after you save** (they see them on their
next page load).

#### Theme

- **Template** — pick one of **9 designs**, each with its own palette, typography and
  geometry: *Marketstall* (default, ink-on-paper trading floor), *Warm Wood*, *Mono*,
  *Pet Shop*, *Sari-Sari Store*, *Fashion*, *Tech*, *Auto Parts*, *Hobby*. A live preview
  updates as you hover.
- **Default mode** — *system* (follow the visitor's OS), *light*, or *dark*. Visitors can
  still override this with the header toggle for their own browser.

#### Content (copy)

Edit customer-facing wording — navigation labels, home-page headings, the footer, empty
states, and more — grouped by area. Clear a field to fall back to the built-in default
text. Save applies to the whole storefront.

#### Home layout (block builder)

Your home page is an ordered list of **blocks**. **+ Add block**, then for each block:
**Edit** its fields (with a live preview), **Hide** / **Show** it, reorder with the
up/down arrows, or **Delete** it.

| Block | What it shows |
|-------|---------------|
| **Hero** | Big headline, sub-headline, up to two buttons. On a storefront it also shows a live "market board" (lots listed, live auctions, next close). |
| **Video banner** | A full-width autoplaying background video (your own upload or a URL) with optional heading/text/button over an adjustable dark overlay. Falls back to a poster image for visitors who prefer reduced motion. Height: short / tall / full. |
| **Carousel** | A rotating banner of slides — image, heading, text, optional button per slide. Auto-advance every N seconds (0 = off); pauses on hover, disabled under reduced motion. |
| **Product grid (live)** | Real products from your catalogue — set a heading, how many, and the sort order. |
| **Auction ticker (live)** | The scrolling strip of live auction prices and countdowns. |
| **Feature grid** | A heading plus a numbered row of short titled points. |
| **Feature (image + text)** | A large image beside a heading, paragraph and button — good for a shop story. Image can go left or right. |
| **Info strip** | A slim row of reassurances (free returns, secure checkout, delivery time). |
| **Newsletter signup** | A centred email capture (shows a thank-you; wire it to your mailing list later). |
| **Image gallery** | A grid of images by URL. |
| **Text block** | A heading and a paragraph. |
| **Call to action** | A centred prompt with one button. |

**Uploading a video for the Video banner:** open the block, use **Upload** (MP4 / WebM) or
paste a hosted URL, and add a poster image URL. If media storage isn't configured on the
server, use a URL.

> After a server restart is required for brand-new block types or template additions to be
> accepted when saving. If a save reports an unknown block/template, the server needs a
> restart.

### Billing

- Shows your current plan (**Free** or **Pro**) and subscription status.
- **Upgrade to Pro** opens Xendit's hosted checkout (GCash, Maya, or card). Your plan
  flips to Pro once Xendit confirms the payment.
- There is no self-serve cancel/downgrade yet — that routes to support.
- If billing isn't configured on the platform, this tab reports it's unavailable.

---

## Part 3 — Platform admins

The **platform console** runs the SaaS itself. Open `admin.<your-domain>` (locally
`http://admin.localhost:5173`) and sign in with the platform-owner account.

### Shops

- **List** every shop: name, address (slug), plan, subscription status, active/suspended.
- **Suspend / reactivate** a shop. This is independent of billing — use it for abuse or
  non-payment. A suspended shop's storefront stops serving.
- **Create a shop** from the console:
  - **Shop name** and **Shop address** (the subdomain slug — checked for availability as
    you type).
  - **Owner's name / email** and a **temporary password** you set. Give these to the shop
    owner; they sign in at `{slug}.<domain>/login` and should change the password.
  - **Plan** — Free or Pro.
  - The shop is created with the default storefront blocks and is live immediately.

### Marketing site

The platform's own landing page (`<your-domain>` / `www.`) is block-driven, edited the
same way as a shop's home layout:

- **Content** — headline, feature copy, plan descriptions.
- **Sections** — add / edit / reorder / hide / delete blocks (hero, feature grid, CTA,
  etc.).

Changes are live for visitors on their next load.

---

## Reference

- Roles and what each can do: [ARCHITECTURE.md § Authentication](ARCHITECTURE.md#authentication--sessions)
- The design templates and tokens: [THEMING.md](THEMING.md)
- Every API endpoint behind these screens: [API.md](API.md)
