import { Link } from 'react-router-dom'

// Internal paths ("/products") route client-side; anything else (full URLs,
// mailto:, #anchors) renders a plain anchor.
//
// `to` comes from admin-authored storefront section data (hero/CTA button
// links etc.) with no server-side format validation - only a scheme
// allow-list here stands between that and a customer executing
// `javascript:`/`data:` URIs by clicking a shop's own button. isSafeHref
// rejects anything that isn't a bare relative/hash link, an http(s) URL, or
// a mailto: link.
function isSafeHref(value) {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value.startsWith('#')) return true
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const url = new URL(value, window.location.origin)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}

export default function SmartLink({ to, children, ...rest }) {
  if (typeof to === 'string' && to.startsWith('/')) {
    return (
      <Link to={to} {...rest}>
        {children}
      </Link>
    )
  }
  return (
    <a href={isSafeHref(to) ? to : '#'} {...rest}>
      {children}
    </a>
  )
}
