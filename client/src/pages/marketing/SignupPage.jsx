import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { checkSlugAvailability, signupShop } from '../../api/signup'
import { buildShopUrl } from '../../lib/siteContext'

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function SignupPage() {
  const [searchParams] = useSearchParams()
  const prefill = slugify(searchParams.get('shop') || '')

  const [form, setForm] = useState({
    shopName: prefill,
    slug: prefill,
    adminDisplayName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  })
  const [slugTouched, setSlugTouched] = useState(Boolean(prefill))
  const [slugCheck, setSlugCheck] = useState(null) // { checking, available, reason }
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const effectiveSlug = slugTouched ? form.slug : slugify(form.shopName)

  useEffect(() => {
    if (!effectiveSlug || effectiveSlug.length < 3) {
      setSlugCheck(null)
      return undefined
    }
    let ignore = false
    setSlugCheck({ checking: true })
    const timer = setTimeout(() => {
      checkSlugAvailability(effectiveSlug)
        .then((res) => {
          if (!ignore) setSlugCheck({ checking: false, ...res })
        })
        .catch(() => {
          if (!ignore) setSlugCheck(null)
        })
    }, 400)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [effectiveSlug])

  const shopUrlPreview = useMemo(() => (effectiveSlug ? buildShopUrl(effectiveSlug) : ''), [effectiveSlug])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.adminPassword !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!effectiveSlug || effectiveSlug.length < 3) {
      setError('Choose a shop address of at least 3 characters.')
      return
    }
    if (slugCheck && slugCheck.available === false) {
      setError(slugCheck.reason || 'That shop address is unavailable.')
      return
    }

    setSubmitting(true)
    try {
      const res = await signupShop({
        shopName: form.shopName,
        slug: effectiveSlug,
        adminDisplayName: form.adminDisplayName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
      })
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    const shopUrl = buildShopUrl(result.shop.slug, '/login')
    return (
      <div className="container section auth-page">
        <div className="card signup-card">
          <h1>Your shop is ready! 🎉</h1>
          <p>
            <strong>{result.shop.name}</strong> is live on the Free plan. Log in with the admin email and password you
            just chose to start adding products.
          </p>
          <a className="btn btn-primary btn-block" href={shopUrl}>
            Go to your shop
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="container section auth-page">
      <form className="card signup-card auth-form" onSubmit={handleSubmit}>
        <h1>Start your shop</h1>
        {error && <p className="form-error">{error}</p>}

        <div className="form-group">
          <label htmlFor="shopName">Shop name</label>
          <input
            id="shopName"
            required
            className="input"
            value={form.shopName}
            onChange={(e) => setForm({ ...form, shopName: e.target.value })}
            placeholder="Your Shop Name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="slug">Shop address</label>
          <input
            id="slug"
            required
            className="input"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true)
              setForm({ ...form, slug: slugify(e.target.value) })
            }}
            placeholder="your-shop-name"
          />
          <div className="signup-slug-row">
            <span>{shopUrlPreview}</span>
            {slugCheck?.checking && <span>Checking...</span>}
            {slugCheck && !slugCheck.checking && slugCheck.available && <span className="slug-status-ok">Available</span>}
            {slugCheck && !slugCheck.checking && slugCheck.available === false && (
              <span className="slug-status-taken">{slugCheck.reason || 'Unavailable'}</span>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="adminDisplayName">Your name</label>
          <input
            id="adminDisplayName"
            required
            className="input"
            value={form.adminDisplayName}
            onChange={(e) => setForm({ ...form, adminDisplayName: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="adminEmail">Your email</label>
          <input
            id="adminEmail"
            type="email"
            required
            className="input"
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="adminPassword">Password</label>
          <input
            id="adminPassword"
            type="password"
            required
            minLength={8}
            className="input"
            value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
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
          {submitting ? 'Creating your shop...' : 'Create my shop'}
        </button>

        <p className="auth-switch">
          Already run a shop with us? Head to your shop's own address and <Link to="/">log in there</Link>.
        </p>
      </form>
    </div>
  )
}
