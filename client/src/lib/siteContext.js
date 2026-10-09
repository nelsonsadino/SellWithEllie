// Figures out which "site" this page load belongs to, purely from the
// browser's own hostname - there is no server round-trip involved, since
// the frontend and API can live on entirely different origins/ports (e.g.
// acme.localhost:5173 talking to localhost:7100) and the frontend has to
// know its own shop identity before it can even ask the API for anything.
//
// Three modes, matching the three things this SPA renders:
//   'shop'      - a storefront for one shop, e.g. acme.sellwithellie.example
//   'marketing' - the SaaS's own landing/signup site, the bare root domain
//   'platform'  - the platform-owner console, admin.sellwithellie.example
//
// Mirrors SellWithEllie/Middleware/TenantResolutionMiddleware.ReservedSubdomains -
// keep the two lists in sync if either changes.
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'app', 'admin', 'platform'])

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN || '').trim().toLowerCase()
const DEV_TENANT_SLUG = (import.meta.env.VITE_DEV_TENANT_SLUG || '').trim().toLowerCase() || null

function isLocalBareHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function resolveSiteContext(hostname = window.location.hostname) {
  const host = hostname.toLowerCase()

  if (isLocalBareHost(host)) {
    // Plain `localhost:5173` dev, no subdomain in play. Fall back to the
    // configured dev shop (if any) so the storefront still works without
    // requiring `*.localhost` hosts setup; otherwise treat it as marketing.
    return DEV_TENANT_SLUG
      ? { mode: 'shop', slug: DEV_TENANT_SLUG }
      : { mode: 'marketing', slug: null }
  }

  const labels = host.split('.')
  const firstLabel = labels[0]

  // `acme.localhost` (dev, real subdomain) - anything before ".localhost".
  if (labels.length >= 2 && labels[labels.length - 1] === 'localhost') {
    if (RESERVED_SUBDOMAINS.has(firstLabel)) {
      return firstLabel === 'admin' || firstLabel === 'platform'
        ? { mode: 'platform', slug: null }
        : { mode: 'marketing', slug: null }
    }
    return { mode: 'shop', slug: firstLabel }
  }

  if (!ROOT_DOMAIN) {
    // No production root domain configured and this isn't a *.localhost
    // host either - safest fallback is the marketing site rather than
    // guessing at a tenant.
    return { mode: 'marketing', slug: null }
  }

  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) {
    return { mode: 'marketing', slug: null }
  }

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = host.slice(0, -(ROOT_DOMAIN.length + 1))
    if (sub === 'admin' || sub === 'platform') {
      return { mode: 'platform', slug: null }
    }
    if (RESERVED_SUBDOMAINS.has(sub)) {
      return { mode: 'marketing', slug: null }
    }
    return { mode: 'shop', slug: sub }
  }

  // Unrecognized host (custom domain some day, or a typo) - default to
  // marketing rather than silently resolving to no tenant.
  return { mode: 'marketing', slug: null }
}

export const siteContext = resolveSiteContext()
// Builds the URL for a shop's own storefront from its slug, for use on the
// marketing site (e.g. linking a freshly-signed-up shop to its new home)
// and the platform console. Mirrors the same host-shape resolveSiteContext
// parses in reverse.
export function buildShopUrl(slug, path = '/') {
  const { protocol, port } = window.location
  const suffix = path.startsWith('/') ? path : `/${path}`

  if (ROOT_DOMAIN) {
    return `${protocol}//${slug}.${ROOT_DOMAIN}${suffix}`
  }

  const portPart = port ? `:${port}` : ''
  return `${protocol}//${slug}.localhost${portPart}${suffix}`
}
