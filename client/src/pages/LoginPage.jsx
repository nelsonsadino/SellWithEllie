import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { externalLoginUrl } from '../api/auth'
import { useAuth } from '../context/AuthContext'

const EXTERNAL_ERROR_MESSAGES = {
  no_email: "That account didn't share an email address with us, so we can't sign you in with it. Try email/password instead, or check the account's privacy settings.",
  account_error: "Something went wrong creating your account. Please try again, or use email/password.",
}

export default function LoginPage() {
  const { login, completeExternalLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Where to send the user after a successful login: the route a guard came
  // from (router state), or the `returnTo` an expired-session redirect added.
  // Captured once so it survives the URL being tidied up on re-render.
  const [destPath] = useState(
    () =>
      location.state?.from?.pathname ||
      new URLSearchParams(window.location.search).get('returnTo') ||
      undefined
  )

  // Lands here after "Continue with Google/Facebook" too: the server
  // already completed the sign-in and put the result in the URL fragment
  // (see ExternalAuthController) - a fragment, not a query string, so the
  // token is never sent in any HTTP request, including this page's own load.
  // A full-page redirect to the identity provider and back loses React
  // Router's in-memory state, so the intended destination (if any) travels
  // as a `dest` query param instead - see api/auth.js's externalLoginUrl.
  useEffect(() => {
    if (!window.location.hash) return

    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const token = hashParams.get('token')
    const authError = hashParams.get('authError')

    if (token) {
      completeExternalLogin({
        token,
        expiresAtUtc: hashParams.get('expiresAtUtc'),
        email: hashParams.get('email') || '',
        displayName: hashParams.get('displayName') || '',
        roles: (hashParams.get('roles') || '').split(',').filter(Boolean),
      })
      const dest = new URLSearchParams(window.location.search).get('dest') || '/'
      window.history.replaceState(null, '', window.location.pathname)
      navigate(dest, { replace: true })
    } else if (authError) {
      setError(EXTERNAL_ERROR_MESSAGES[authError] || 'Sign-in did not complete. Please try again.')
      window.history.replaceState(null, '', window.location.pathname)
    }
    // Only meant to run once, right after this page loads from the redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(form.email, form.password)
      navigate(destPath || '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container section auth-page">
      <form className="card auth-form" onSubmit={handleSubmit}>
        <h1>Log in</h1>
        {error && <p className="form-error">{error}</p>}
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <div className="auth-social">
          <a className="btn btn-secondary btn-block" href={externalLoginUrl('google', destPath)}>
            Continue with Google
          </a>
          <a className="btn btn-secondary btn-block" href={externalLoginUrl('facebook', destPath)}>
            Continue with Facebook
          </a>
        </div>

        <p className="auth-switch">
          No account? <Link to="/register">Sign up</Link>
        </p>
      </form>
    </div>
  )
}
