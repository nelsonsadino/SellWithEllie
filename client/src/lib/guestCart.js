// Guest cart: [{ productId, quantity }] in localStorage, scoped per shop host.
const KEY = 'guest-cart'

export function readGuestCart() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(arr)
      ? arr
          .map((l) => ({ productId: Number(l.productId), quantity: Math.trunc(Number(l.quantity)) }))
          .filter((l) => l.productId > 0 && l.quantity > 0)
      : []
  } catch {
    return []
  }
}

export function writeGuestCart(lines) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines))
  } catch {
    /* storage unavailable - cart just won't persist */
  }
}

export function clearGuestCart() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
