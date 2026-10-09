import { useEffect, useRef } from 'react'

// Adds `.is-in` so CSS can fade + rise the element into view. Bulletproof:
// reveals immediately if already on screen, on scroll-in otherwise, and always
// within ~1.6s as a failsafe - a slow or missing IntersectionObserver can
// never leave content stuck invisible.
export function useReveal() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const reveal = () => el.classList.add('is-in')

    if (typeof IntersectionObserver === 'undefined') {
      reveal()
      return undefined
    }

    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      reveal()
      return undefined
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          reveal()
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -5% 0px', threshold: 0.05 }
    )
    io.observe(el)
    const failsafe = window.setTimeout(reveal, 1600)

    return () => {
      io.disconnect()
      window.clearTimeout(failsafe)
    }
  }, [])

  return ref
}
