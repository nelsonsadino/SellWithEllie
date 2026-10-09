import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)

const MODES = ['system', 'light', 'dark']
export const TEMPLATES = [
  'marketstall',
  'warmwood',
  'mono',
  'petshop',
  'sarisari',
  'fashion',
  'tech',
  'autoparts',
  'hobby',
]
const MODE_KEY = 'theme-mode'
const TEMPLATE_KEY = 'theme-template' // dev/local override only; real value comes from the tenant

function readStored(key, allowed, fallback) {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

// Applies the storefront design template + light/dark mode to <html>.
//   template   - which of the selectable designs (from the tenant in shop mode,
//                fixed 'marketstall' for marketing/platform)
//   mode       - 'system' follows the OS; 'light'/'dark' force it and win over
//                the tenant's own default. Persisted per browser.
export function ThemeProvider({ children, template, defaultMode = 'system' }) {
  const [mode, setModeState] = useState(() => readStored(MODE_KEY, MODES, null) || defaultMode)
  const [devTemplate, setDevTemplate] = useState(() =>
    readStored(TEMPLATE_KEY, TEMPLATES, null)
  )

  const activeTemplate = template || devTemplate || 'marketstall'

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme-template', activeTemplate)
    if (mode === 'light' || mode === 'dark') {
      root.setAttribute('data-theme', mode)
    } else {
      root.removeAttribute('data-theme')
    }
  }, [activeTemplate, mode])

  const value = useMemo(
    () => ({
      template: activeTemplate,
      mode,
      setMode: (next) => {
        const m = MODES.includes(next) ? next : 'system'
        setModeState(m)
        try {
          localStorage.setItem(MODE_KEY, m)
        } catch {
          /* private mode / storage disabled - in-memory only */
        }
      },
      cycleMode: () => {
        const order = ['system', 'light', 'dark']
        const next = order[(order.indexOf(mode) + 1) % order.length]
        setModeState(next)
        try {
          localStorage.setItem(MODE_KEY, next)
        } catch {
          /* ignore */
        }
      },
      // Only used by the admin theme preview before it's saved to the tenant.
      previewTemplate: (t) => setDevTemplate(TEMPLATES.includes(t) ? t : null),
    }),
    [activeTemplate, mode]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
