import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { activateTenant, createShop, deactivateTenant, getPlatformTenants } from '../../api/platform'
import { checkSlugAvailability } from '../../api/signup'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import { useToast } from '../../context/ToastContext'
import { buildShopUrl } from '../../lib/siteContext'

// Lazy-loaded: the marketing-site block editor is only needed by platform
// admins who open this tab, not by everyone who lands on the console.
const PlatformMarketingPanel = lazy(() => import('./PlatformMarketingPanel'))

export default function PlatformDashboardPage() {
  const [tab, setTab] = useState('shops')

  return (
    <div className="container section">
      <div className="page-header">
        <h1>Platform console</h1>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'shops' ? 'active' : ''}`} onClick={() => setTab('shops')}>
          Shops
        </button>
        <button className={`tab ${tab === 'marketing' ? 'active' : ''}`} onClick={() => setTab('marketing')}>
          Marketing site
        </button>
      </div>
      {tab === 'shops' ? (
        <ShopsPanel />
      ) : (
        <Suspense fallback={<Spinner />}>
          <PlatformMarketingPanel />
        </Suspense>
      )}
    </div>
  )
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ShopsPanel() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const { showToast } = useToast()

  const load = () => {
    setLoading(true)
    getPlatformTenants()
      .then(setTenants)
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  const toggleActive = async (tenant) => {
    setBusyId(tenant.id)
    try {
      if (tenant.isActive) {
        await deactivateTenant(tenant.id)
        showToast(`${tenant.name} deactivated.`, 'success')
      } else {
        await activateTenant(tenant.id)
        showToast(`${tenant.name} activated.`, 'success')
      }
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="admin-panel-header">
        <h2>Shops</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New shop
        </button>
      </div>

      <NewShopModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false)
          load()
        }}
      />

      {loading ? (
        <Spinner />
      ) : tenants.length === 0 ? (
        <p className="empty-state">No shops yet. Create the first one.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Products</th>
                <th>Created</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <a href={buildShopUrl(t.slug)} target="_blank" rel="noreferrer">
                      {t.name}
                    </a>
                  </td>
                  <td>{t.plan}</td>
                  <td>
                    <span className={`badge ${t.subscriptionStatus === 'PastDue' ? 'badge-danger' : 'badge-success'}`}>
                      {t.subscriptionStatus}
                    </span>
                  </td>
                  <td className="num">{t.productCount}</td>
                  <td>{new Date(t.createdAtUtc).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${t.isActive ? 'badge-success' : 'badge-danger'}`}>
                      {t.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="table-actions">
                    <button
                      className={`btn btn-small ${t.isActive ? 'btn-danger' : 'btn-secondary'}`}
                      disabled={busyId === t.id}
                      onClick={() => toggleActive(t)}
                    >
                      {t.isActive ? 'Suspend' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const EMPTY = {
  shopName: '',
  slug: '',
  adminDisplayName: '',
  adminEmail: '',
  adminPassword: '',
  plan: 'Free',
}

function NewShopModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY)
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugCheck, setSlugCheck] = useState(null) // { checking, available, reason }
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(null)
  const { showToast } = useToast()

  const effectiveSlug = slugTouched ? form.slug : slugify(form.shopName)

  useEffect(() => {
    if (!open) {
      // reset when the dialog is dismissed
      setForm(EMPTY)
      setSlugTouched(false)
      setSlugCheck(null)
      setError('')
      setCreated(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !effectiveSlug || effectiveSlug.length < 3) {
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
  }, [open, effectiveSlug])

  const shopUrl = useMemo(() => (effectiveSlug ? buildShopUrl(effectiveSlug) : ''), [effectiveSlug])

  const submit = async (e) => {
    e.preventDefault()
    setError('')

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
      const shop = await createShop({
        shopName: form.shopName,
        slug: effectiveSlug,
        adminDisplayName: form.adminDisplayName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        plan: form.plan,
      })
      showToast(`${shop.name} created.`, 'success')
      setCreated({ shop, email: form.adminEmail, password: form.adminPassword })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    const loginUrl = buildShopUrl(created.shop.slug, '/login')
    return (
      <Modal open={open} onClose={onClose} title="Shop created" size="sm">
        <p>
          <strong>{created.shop.name}</strong> is live on the {created.shop.plan} plan with a starter storefront.
          Give the owner these details:
        </p>
        <div className="callout">
          <p className="signup-slug-row">
            <span>Address</span>
            <a href={loginUrl} target="_blank" rel="noreferrer">
              {created.shop.slug}
            </a>
          </p>
          <p className="signup-slug-row">
            <span>Login email</span>
            <span>{created.email}</span>
          </p>
          <p className="signup-slug-row">
            <span>Temp password</span>
            <span>{created.password}</span>
          </p>
          <p className="hint">They should change the password after their first sign-in.</p>
        </div>
        <div className="admin-form-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              onCreated()
            }}
          >
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a shop" size="md">
      <form className="admin-form" onSubmit={submit}>
        {error && <p className="form-error">{error}</p>}

        <div className="form-group">
          <label htmlFor="ns-name">Shop name</label>
          <input
            id="ns-name"
            className="input"
            required
            value={form.shopName}
            onChange={(e) => setForm({ ...form, shopName: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="ns-slug">Shop address</label>
          <input
            id="ns-slug"
            className="input"
            required
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true)
              setForm({ ...form, slug: slugify(e.target.value) })
            }}
            placeholder="your-shop"
          />
          <div className="signup-slug-row">
            <span>{shopUrl}</span>
            {slugCheck?.checking && <span>Checking…</span>}
            {slugCheck && !slugCheck.checking && slugCheck.available && <span className="slug-status-ok">Available</span>}
            {slugCheck && !slugCheck.checking && slugCheck.available === false && (
              <span className="slug-status-taken">{slugCheck.reason || 'Unavailable'}</span>
            )}
          </div>
        </div>

        <div className="admin-form-grid">
          <div className="form-group">
            <label htmlFor="ns-owner">Owner’s name</label>
            <input
              id="ns-owner"
              className="input"
              required
              value={form.adminDisplayName}
              onChange={(e) => setForm({ ...form, adminDisplayName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="ns-email">Owner’s email</label>
            <input
              id="ns-email"
              type="email"
              className="input"
              required
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="ns-pass">Temporary password</label>
            <input
              id="ns-pass"
              type="text"
              className="input"
              required
              minLength={8}
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            />
            <span className="hint">8+ chars, with an uppercase, a lowercase, and a number.</span>
          </div>
          <div className="form-group">
            <label htmlFor="ns-plan">Plan</label>
            <select
              id="ns-plan"
              className="input"
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
            >
              <option value="Free">Free</option>
              <option value="Pro">Pro</option>
            </select>
          </div>
        </div>

        <div className="admin-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || slugCheck?.available === false}
          >
            {submitting ? 'Creating…' : 'Create shop'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
