import { siteContext } from '../lib/siteContext'

const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:7100/api'
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '')
export const API_ROOT_URL = API_BASE_URL.replace(/\/api$/, '')

const TOKEN_KEY = 'auth_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

// Called when a request that carried a token is rejected as unauthenticated,
// or the token is already past its expiry. AuthProvider registers a handler
// that clears the session and sends the user to /login. Kept as a plain
// module-level hook so non-React code (this file) can trigger it.
let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

// Decodes a JWT payload. Never trusted for anything security-sensitive - the
// server always re-derives identity from the signed token - only used for
// client-side display and to pre-empt an obviously-expired token.
export function decodeToken(token = getToken()) {
  if (!token) return null
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function getCurrentUserId() {
  return decodeToken()?.sub || null
}

// True only when we can see an `exp` and it has passed. Unknown / unparseable
// -> false, so the server stays the source of truth.
export function isTokenExpired(token = getToken()) {
  const exp = decodeToken(token)?.exp
  return typeof exp === 'number' && exp * 1000 <= Date.now()
}

async function request(path, { method = 'GET', body, formData, auth = false } = {}) {
  const headers = {}

  // A FormData body (file uploads) must NOT have a Content-Type set here -
  // the browser fills in "multipart/form-data; boundary=..." itself, which
  // the server needs to parse the parts correctly.
  if (!formData) {
    headers['Content-Type'] = 'application/json'
  }

  // Tells the API which shop this request belongs to. Only meaningful in
  // 'shop' mode - the marketing site and platform console have no single
  // tenant, so they talk to tenant-agnostic endpoints (signup, platform
  // admin, plain login) that don't need this header.
  if (siteContext.mode === 'shop' && siteContext.slug) {
    headers['X-Tenant-Slug'] = siteContext.slug
  }

  const hadToken = auth && !!getToken()

  if (auth) {
    const token = getToken()
    // Don't even send a call we know is stale - treat it as a session expiry.
    if (token && isTokenExpired(token)) {
      clearToken()
      onUnauthorized?.({ reason: 'expired' })
      const expiredError = new Error('Your session has expired. Please sign in again.')
      expiredError.status = 401
      throw expiredError
    }
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
    })
  } catch {
    const networkError = new Error('Could not reach the server. Check your connection and try again.')
    networkError.status = 0
    throw networkError
  }

  // A call that carried a token but came back 401 means the token is invalid
  // or expired server-side (incl. the tenant-mismatch guard). Anonymous 401s
  // - browsing a protected page while logged out - are left alone.
  if (response.status === 401 && hadToken) {
    clearToken()
    onUnauthorized?.({ reason: 'unauthorized' })
  }

  if (response.status === 204) return null

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data.message) ||
      (typeof data === 'string' && data) ||
      response.statusText ||
      'Something went wrong.'
    const error = new Error(message)
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

export const apiClient = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  postForm: (path, formData, opts) => request(path, { ...opts, method: 'POST', formData }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
}
