import { apiClient, API_BASE_URL } from './client'
import { siteContext } from '../lib/siteContext'

export const login = (email, password) => apiClient.post('/auth/login', { email, password })

export const register = (email, password, displayName) =>
  apiClient.post('/auth/register', { email, password, displayName })

// Revokes every token for this account server-side (rotates the security
// stamp). Best-effort: the client clears local state regardless.
export const logout = () => apiClient.post('/auth/logout', undefined, { auth: true })

// Kicks off "Continue with Google/Facebook": a full browser navigation (NOT
// a fetch - the identity provider's consent screen has to load in this same
// tab) to the API, which redirects to the provider and back, then lands the
// browser on this shop's own /login page with a JWT in the URL fragment.
// See server/Controllers/ExternalAuthController.cs for the full round trip
// and why the tenant is carried as a "slug" query param instead of relying
// on the usual X-Tenant-Slug header (a plain browser redirect can't set one).
//
// destPath (optional) is where the user was trying to go before they were
// sent to log in (e.g. /checkout) - a full-page redirect to the identity
// provider and back loses React Router's in-memory location state, so it's
// carried through as a query param on returnUrl instead, and read back by
// LoginPage once the sign-in completes.
export function externalLoginUrl(provider, destPath) {
  const loginUrl = new URL('/login', window.location.origin)
  if (destPath) loginUrl.searchParams.set('dest', destPath)

  const params = new URLSearchParams({ slug: siteContext.slug || '', returnUrl: loginUrl.toString() })
  return `${API_BASE_URL}/auth/external/${provider}/start?${params.toString()}`
}
