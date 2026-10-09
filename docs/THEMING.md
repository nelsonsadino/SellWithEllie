# Theming

The storefront's whole look is driven by CSS custom properties ("design tokens"). One
shared component layer reads tokens; each **template** is just a different set of token
values. Light/dark is a separate axis.

## Files

| File | Role |
|------|------|
| `client/src/styles/tokens.css` | Every token, for every template × light/dark |
| `client/src/styles/theme.css` | The component layer — styles all classes, only ever `var(--token)` |
| `client/src/context/ThemeContext.jsx` | Stamps `data-theme-template` + `data-theme` on `<html>`; also exports the `TEMPLATES` list (key + label + description) shown in the admin theme picker |

`main.jsx` imports `tokens.css` before `theme.css`.

## How it's applied

`ThemeContext` reads the resolved tenant's `themeTemplate` and `themeMode` and sets:

```html
<html data-theme-template="fashion" data-theme="dark">
```

- `data-theme-template` — one of the 9 keys below. Absent template ⇒ the `:root` default
  (`marketstall`).
- `data-theme` — `"light"` or `"dark"` from an explicit choice; **absent** means "follow
  the OS" (`prefers-color-scheme`). The header toggle cycles *system → light → dark* and
  persists the visitor's choice in `localStorage('theme-mode')`; the shop's `themeMode`
  is the default when the visitor hasn't chosen.

## Token structure in `tokens.css`

```
:root { … }                                   /* marketstall / light — the flagship */

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { … }        /* marketstall / dark — OS-driven */
}
:root[data-theme='dark'] { … }                 /* marketstall / dark — explicit toggle */

:root[data-theme-template='warmwood'] { … }     /* warmwood / light */
@media (prefers-color-scheme: dark) {
  :root[data-theme-template='warmwood']:not([data-theme='light']) { … }
}
:root[data-theme-template='warmwood'][data-theme='dark'] { … }
/* …repeated for each of the other 8 templates… */
```

Every dark block **re-declares the full colour set** (never partially), so a colour is
always defined on a bare selector — a toggle can't leave a token undefined.

### Token groups

| Prefix | Examples | Themed? |
|--------|----------|---------|
| `--font-*` | `--font-body`, `--font-display`, `--font-heading`, `--font-mono` | per template |
| `--step-*` | `--step--1` … `--step-5` type scale | mostly shared |
| `--space-*` | `--space-1` … `--space-9` | mostly shared |
| `--color-*` | `--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-border-strong`, `--color-primary`, `--color-primary-contrast`, `--color-accent`, `--color-live`, `--color-up`, `--color-gold`, `--color-danger`, `--color-success`, `--color-muted-bg` (+ `-bg` / `-dark` variants) | per template × light/dark |
| `--radius-*` | `--radius-sm/md/lg/pill` | per template |
| `--shadow-*` | `--shadow-card`, `--shadow-sm`, `--shadow-pop` | per template × light/dark |
| `--border-thin` / `--border-heavy` | hairline widths | shared |
| `--transition-fast` / `--transition-base` | easing | shared |
| `--focus-ring` | the `:focus-visible` box-shadow | per template |
| `--max-width` | content column width | shared |

## The 9 templates

| Key | Character | Display / body fonts |
|-----|-----------|----------------------|
| `marketstall` *(default)* | Ink-on-paper trading floor: hairlines, squared geometry, one vermilion accent, mono figures | Bricolage Grotesque / Inter (+ JetBrains Mono) |
| `warmwood` | Warm, rounded, soft-shadowed, humanist | Piazzolla / Inter |
| `mono` | Black & white, single ink accent, zero radius, hard offset shadow | Schibsted Grotesk / Martian Mono |
| `petshop` | Friendly vet-boutique: teal + coral, very rounded | Baloo 2 / Nunito Sans |
| `sarisari` | Filipino corner store: bright yellow, soda-red heads, signage blue, loud | Anton / Archivo |
| `fashion` | Editorial boutique: ivory, near-black, book serif, oxblood accent, sharp corners, big air | Bodoni Moda / Jost |
| `tech` | Engineered: cool greys, electric blue, monospace headings, razor corners | JetBrains Mono / Public Sans |
| `autoparts` | Garage catalogue: steel grey, safety orange, heavy borders, zero radius | Oswald / Barlow |
| `hobby` | Craft & model store: kraft paper, forest green + brick, mustard, gently rounded | Zilla Slab / Karla |

Fonts are all loaded from Google Fonts in `client/index.html`.

### Per-template component tweaks

Beyond tokens, `theme.css` has a small `[data-theme-template='x'] …` section for
structural accents that aren't expressible as a token swap — e.g. `fashion` sets a much
larger hero title and wide letter-spacing on labels; `mono` and `autoparts` uppercase
buttons and thicken card borders; `petshop` rounds buttons/inputs to pills. Keep this
section small — most differences belong in the token values.

## Adding a new template

1. **`tokens.css`** — add the three blocks (`:root[data-theme-template='newkey']`, its
   `@media (prefers-color-scheme: dark)` variant, and its `[data-theme='dark']` variant),
   declaring the **full** colour set in each. Pick fonts and add them to the Google Fonts
   `<link>` in `client/index.html`.
2. **`theme.css`** — optionally add a `[data-theme-template='newkey'] …` block for
   structural accents.
3. **Server** — add `"newkey"` to `TenantDefaults.Templates` in
   `server/Data/TenantDefaults.cs`, and restart the API (the allow-list is validated on
   `PUT /api/tenant/theme`).
4. **Client** — add it to the `TEMPLATES` array exported from
   `client/src/context/ThemeContext.jsx` (key + label + short description) so it appears in
   the admin theme picker.
5. Verify at every breakpoint in light **and** dark, and check contrast (WCAG AA) for
   `--color-text` on `--color-bg`/`--color-surface` and `--color-primary-contrast` on
   `--color-primary`.

## Accessibility notes

- All 9 templates are intended to meet WCAG AA in light and dark. Re-check after any token
  change.
- Motion (carousel auto-advance, the auction ticker, the video-banner video, scroll-reveal)
  is disabled or frozen under `prefers-reduced-motion: reduce`.
- `--focus-ring` gives every custom control a visible `:focus-visible` outline.
