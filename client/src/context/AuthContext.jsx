import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../api/auth'
import { clearToken, decodeToken, isTokenExpired, setToken, setUnauthorizedHandler } from '../api/client'
import { useToast } from './ToastContext'

const AuthContext = createContext(null)
const USER_KEY = 'auth_user'
const AUTH_PATHS = /\/(login|register)(\/|$)/

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// True when we can tell the session is over: the JWT's exp has passed, or the
// stored expiry timestamp has. Checking the stored timestamp too means this
// still works after api/client.js has already wiped the token.
function sessionEnded(storedUser) {
  if (isTokenExpired()) return true
  const ts = storedUser?.expiresAtUtc ? Date.parse(storedUser.expiresAtUtc) : NaN
  return Number.isFinite(ts) && ts <= Date.now()
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser)
  const navigate = useNavigate()
  const { showToast } = useToast()
  const expiryTimer = useRef(null)

  const clearSession = useCallback(() => {
    clearToken()
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  // Session ended without the user asking: wipe local state, tell them, and
  // send them to /login with a return path so they land back where they were.
  const expireSession = useCallback(() => {
    clearSession()
    const { pathname, search } = window.location
    if (AUTH_PATHS.test(pathname)) return
    showToast('Your session has expired. Please sign in again.', 'info')
    navigate(`/login?returnTo=${encodeURIComponent(pathname + search)}`, { replace: true })
  }, [clearSession, navigate, showToast])

  // Register the "a protected call was rejected" hook in a layout effect so
  // it's in place before any child component's data-fetching effect runs.
  useLayoutEffect(() => {
    setUnauthorizedHandler(() => expireSession())
    return () => setUnauthorizedHandler(null)
  }, [expireSession])

  // On load, if the stored session is already over, bounce to login now
  // rather than after the first failed request.
  useLayoutEffect(() => {
    if (user && sessionEnded(user)) expireSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While the app stays open, log the user out the moment the token expires.
  useEffect(() => {
    clearTimeout(expiryTimer.current)
    const exp = decodeToken()?.exp
    if (!user || typeof exp !== 'number') return undefined
    const ms = exp * 1000 - Date.now()
    if (ms <= 0) {
      expireSession()
      return undefined
    }
    expiryTimer.current = setTimeout(expireSession, ms)
    return () => clearTimeout(expiryTimer.current)
  }, [user, expireSession])

  const persist = useCallback((authResponse) => {
    setToken(authResponse.token)
    const stored = {
      email: authResponse.email,
      displayName: authResponse.displayName,
      roles: authResponse.roles,
      expiresAtUtc: authResponse.expiresAtUtc,
    }
    localStorage.setItem(USER_KEY, JSON.stringify(stored))
    setUser(stored)
  }, [])

  const login = useCallback(
    async (email, password) => {
      const res = await authApi.login(email, password)
      persist(res)
      return res
    },
    [persist]
  )

  const register = useCallback(
    async (email, password, displayName) => {
      const res = await authApi.register(email, password, displayName)
      persist(res)
      return res
    },
    [persist]
  )

  // Finishes a Google/Facebook sign-in: the server already validated
  // everything and minted a normal JWT before redirecting back here (see
  // ExternalAuthController) - this just stores it exactly like a password
  // login would, from the fields the redirect handed back in the URL.
  const completeExternalLogin = useCallback(
    (authResponse) => {
      persist(authResponse)
    },
    [persist]
  )

  const logout = useCallback(() => {
    // Tell the server to revoke this account's tokens; don't wait on it or
    // let a failure block the local sign-out.
    authApi.logout().catch(() => {})
    clearSession()
  }, [clearSession])

  const isAdmin = Boolean(user?.roles?.includes('Admin'))
  const isPlatformAdmin = Boolean(user?.roles?.includes('PlatformAdmin'))

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin,
      isPlatformAdmin,
      login,
      register,
      completeExternalLogin,
      logout,
    }),
    [user, isAdmin, isPlatformAdmin, login, register, completeExternalLogin, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
