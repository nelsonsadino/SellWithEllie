// Client-only wishlist: a set of product ids in localStorage, per browser.
// Components subscribe to `wishlist:change` to stay in sync across the page.
const KEY = 'wishlist'
const EVENT = 'wishlist:change'

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.map(Number).filter(Boolean) : []
  } catch {
    return []
  }
}

function write(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]))
  } catch {
    /* private mode - in-memory only for this session */
  }
  window.dispatchEvent(new CustomEvent(EVENT))
}

export const getWishlist = () => read()
export const wishlistCount = () => read().length
export const isWishlisted = (id) => read().includes(Number(id))

export function toggleWishlist(id) {
  const n = Number(id)
  const ids = read()
  const next = ids.includes(n) ? ids.filter((x) => x !== n) : [...ids, n]
  write(next)
  return next.includes(n)
}

export function onWishlistChange(handler) {
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}
