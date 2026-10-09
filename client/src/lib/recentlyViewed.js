// Last-N viewed product ids, most-recent first, in localStorage.
const KEY = 'recently-viewed'
const MAX = 12

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.map(Number).filter(Boolean) : []
  } catch {
    return []
  }
}

export const getRecentlyViewed = (excludeId) => {
  const ex = Number(excludeId)
  return read().filter((id) => id !== ex)
}

export function recordView(id) {
  const n = Number(id)
  if (!n) return
  try {
    const next = [n, ...read().filter((x) => x !== n)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}
