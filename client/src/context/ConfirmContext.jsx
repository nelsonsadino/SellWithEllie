import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Modal from '../components/Modal'

const ConfirmContext = createContext(null)

const DEFAULTS = {
  title: 'Are you sure?',
  body: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  tone: 'primary', // 'primary' | 'danger'
}

// Promise-based confirmation dialog to replace window.confirm. Usage:
//   const confirm = useConfirm()
//   if (!(await confirm({ title, body, confirmLabel, tone: 'danger' }))) return
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolverRef = useRef(null)
  const confirmBtnRef = useRef(null)

  const confirm = useCallback((opts = {}) => {
    setState({ ...DEFAULTS, ...opts })
    return new Promise((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const settle = useCallback((result) => {
    resolverRef.current?.(result)
    resolverRef.current = null
    setState(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={state != null}
        onClose={() => settle(false)}
        title={state?.title}
        size="sm"
        initialFocusRef={confirmBtnRef}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => settle(false)}>
              {state?.cancelLabel}
            </button>
            <button
              type="button"
              ref={confirmBtnRef}
              className={`btn ${state?.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => settle(true)}
            >
              {state?.confirmLabel}
            </button>
          </>
        }
      >
        {state?.body && <p>{state.body}</p>}
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider')
  return ctx
}
