import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getCurrentTenant } from '../api/tenant'
import { DEFAULT_CONTENT } from '../lib/defaultContent'
import { formatMoney } from '../lib/money'

const TenantContext = createContext(null)

// Only ever mounted for 'shop' mode (see App.jsx) - the marketing site and
// platform console aren't scoped to a single tenant, so they don't use this.
// The tenant payload now also carries the shop's chosen design template, its
// copy overrides, and the ordered blocks that make up its home page.
export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await getCurrentTenant()
      setTenant(data)
      setError(null)
      return data
    } catch (err) {
      // A 404 here means the resolved subdomain/slug doesn't match any shop.
      setError(err)
      throw err
    }
  }, [])

  useEffect(() => {
    let ignore = false
    getCurrentTenant()
      .then((data) => {
        if (!ignore) setTenant(data)
      })
      .catch((err) => {
        if (!ignore) setError(err)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  const value = {
    tenant,
    loading,
    error,
    refresh,
    content: tenant?.content || {},
    sections: tenant?.sections || [],
    currency: tenant?.currencyCode || 'USD',
    lowStockThreshold: tenant?.lowStockThreshold ?? 5,
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within a TenantProvider')
  return ctx
}

// For components shared with the marketing/platform apps (no TenantProvider):
// returns null instead of throwing.
export function useOptionalTenant() {
  return useContext(TenantContext)
}

// Returns a format(amount) function bound to this shop's currency. Safe
// outside a TenantProvider (defaults to USD).
export function useCurrency() {
  const ctx = useContext(TenantContext)
  const currency = ctx?.currency || ctx?.tenant?.currencyCode || 'USD'
  return (amount) => formatMoney(amount, currency)
}

// t(key, fallback) - the shop's override, else the shipped default, else the
// fallback passed at the call site. Safe to use outside a TenantProvider
// (marketing/platform), where it just returns defaults.
export function useContent() {
  const ctx = useContext(TenantContext)
  const overrides = ctx?.content || {}
  return (key, fallback = '') => {
    const override = overrides[key]
    if (override != null && override !== '') return override
    return DEFAULT_CONTENT[key] ?? fallback
  }
}
