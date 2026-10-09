import { useEffect, useState } from 'react'
import { createCheckoutSession, getBillingStatus } from '../../api/billing'
import Spinner from '../../components/Spinner'
import { useTenant } from '../../context/TenantContext'
import { useToast } from '../../context/ToastContext'

const PLAN_LIMITS = {
  Free: ['Up to 25 product listings', 'Up to 3 active/scheduled auctions at a time', 'Community support'],
  Pro: ['Unlimited product listings', 'Unlimited active auctions', 'Priority support'],
}

function formatAmount(amount, currency) {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency || 'PHP' }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

export default function AdminBillingPanel() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const { tenant } = useTenant()
  const { showToast } = useToast()

  const load = () => {
    setLoading(true)
    getBillingStatus()
      .then(setStatus)
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  const handleUpgrade = async () => {
    setBusy(true)
    try {
      const returnUrl = `${window.location.origin}/admin`
      const session = await createCheckoutSession(returnUrl, returnUrl)
      window.location.href = session.url
    } catch (err) {
      showToast(err.message, 'error')
      setBusy(false)
    }
  }

  if (loading) {
    return <Spinner />
  }

  if (!status) {
    return <p className="empty-state">Couldn't load billing information right now.</p>
  }

  const isPro = status.plan === 'Pro'
  const isPastDue = status.subscriptionStatus === 'PastDue'

  return (
    <div className="billing-panel">
      <div className="card billing-summary">
        <div>
          <p className="pet-card-meta">Current plan</p>
          <h2>
            {tenant?.name ? `${tenant.name} - ` : ''}
            {status.plan}
          </h2>
          <span className={`badge ${isPastDue ? 'badge-danger' : 'badge-success'}`}>{status.subscriptionStatus}</span>
        </div>
        <div className="billing-summary-actions">
          {isPro ? (
            <a className="btn btn-secondary" href="mailto:support@sellwithellie.example?subject=Cancel%20my%20subscription">
              Contact support to cancel
            </a>
          ) : (
            <button className="btn btn-primary" onClick={handleUpgrade} disabled={busy}>
              {busy ? 'Loading...' : `Upgrade to Pro - ${formatAmount(status.proPlanAmount, status.currency)}/mo`}
            </button>
          )}
        </div>
      </div>

      {isPastDue && (
        <div className="callout">
          <p>Your last payment didn't go through. We'll keep retrying automatically - update your payment method with your bank/e-wallet if it keeps failing.</p>
        </div>
      )}

      {isPro && (
        <p className="pet-card-meta">
          Billed via GCash, Maya, or card through Xendit. To change your payment method or cancel, email
          {' '}<a href="mailto:support@sellwithellie.example">support@sellwithellie.example</a> for now.
        </p>
      )}

      <div className="grid pricing-grid">
        {Object.entries(PLAN_LIMITS).map(([plan, features]) => (
          <div key={plan} className={`card pricing-card ${status.plan === plan ? 'pricing-card-current' : ''}`}>
            <h3>{plan}</h3>
            <ul className="pricing-features">
              {features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            {status.plan === plan && <span className="badge badge-muted">Current plan</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
