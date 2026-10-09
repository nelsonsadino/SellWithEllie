import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { externalLoginUrl } from '../api/auth'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)
    try {
      await register(form.email, form.password, form.displayName)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container section auth-page">
      <form className="card auth-form" onSubmit={handleSubmit}>
        <h1>Create an account</h1>
        {error && <p className="form-error">{error}</p>}

        <div className="auth-social">
          <a className="btn btn-secondary btn-block" href={externalLoginUrl('google')}>
            Continue with Google
          </a>
          <a className="btn btn-secondary btn-block" href={externalLoginUrl('facebook')}>
            Continue with Facebook
          </a>
        </div>

        <div className="auth-divider">
          <span>or sign up with email</span>
        </div>

        <div className="form-group">
          <label htmlFor="displayName">Name</label>
          <input
            id="displayName"
            required
            className="input"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </div>
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
            minLength={8}
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <span className="hint">At least 8 characters, with an uppercase letter, lowercase letter, and a number.</span>
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            required
            className="input"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Sign up'}
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  )
}
