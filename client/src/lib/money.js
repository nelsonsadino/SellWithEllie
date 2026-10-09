// Formats an amount in a shop's chosen currency. The Intl output includes
// the currency symbol/code, so callers should NOT also prefix a "$".
const cache = new Map()

function formatterFor(currency) {
  const code = (currency || 'USD').toUpperCase()
  if (cache.has(code)) return cache.get(code)
  let fmt
  try {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: code })
  } catch {
    // Unknown code -> fall back to a plain number with the code appended.
    fmt = {
      format: (n) => `${code} ${Number(n || 0).toFixed(2)}`,
    }
  }
  cache.set(code, fmt)
  return fmt
}

export function formatMoney(amount, currency = 'USD') {
  return formatterFor(currency).format(Number(amount) || 0)
}
