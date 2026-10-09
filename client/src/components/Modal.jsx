import { useCallback, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'

let openCount = 0

// An accessible modal dialog: rendered in a portal on <body>, labelled by its
// title, focus-trapped, Esc- and backdrop-dismissible, and it restores focus to
// whatever was focused before it opened. Body scroll is locked while any modal
// is open (openCount handles nested/stacked modals).
export default function Modal({ open, onClose, title, children, footer, size = 'md', initialFocusRef }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const previouslyFocused = useRef(null)

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const nodes = dialogRef.current?.querySelectorAll(FOCUSABLE)
      if (!nodes || nodes.length === 0) {
        e.preventDefault()
        return
      }
      const list = Array.from(nodes).filter((n) => n.offsetParent !== null || n === document.activeElement)
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    openCount += 1
    document.body.style.overflow = 'hidden'

    const focusTarget =
      initialFocusRef?.current || dialogRef.current?.querySelector(FOCUSABLE) || dialogRef.current
    focusTarget?.focus()

    return () => {
      openCount = Math.max(0, openCount - 1)
      if (openCount === 0) document.body.style.overflow = ''
      const el = previouslyFocused.current
      if (el && typeof el.focus === 'function') el.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        {title && (
          <div className="modal-header">
            <h2 className="modal-title" id={titleId}>
              {title}
            </h2>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
              ✕
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
