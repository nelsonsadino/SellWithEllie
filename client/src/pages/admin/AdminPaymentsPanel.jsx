import { useEffect, useState } from 'react'
import { getPaymentSettings, updatePaymentSettings } from '../../api/tenant'
import Spinner from '../../components/Spinner'
import { useTenant } from '../../context/TenantContext'
import { useToast } from '../../context/ToastContext'

// Common ISO 4217 codes. The server accepts any 3-letter code, so a shop
// with something exotic can still be set via the API.
const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'CNY', 'INR', 'SGD', 'HKD',
  'PHP', 'IDR', 'MYR', 'THB', 'VND', 'KRW', 'NZD', 'AED', 'SAR', 'ZAR', 'BRL', 'MXN',
]

export default function AdminPaymentsPanel() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')
  const [secretKey, setSecretKey] = useState('')
  const [webhookToken, setWebhookToken] = useState('')
  const [savingCurrency, setSavingCurrency] = useState(false)
  const [savingXendit, setSavingXendit] = useState(false)
  const { showToast } = useToast()
  const { refresh } = useTenant()

  const load = () => {
    setLoading(true)
    getPaymentSettings()
      .then((data) => {
        setSettings(data)
        setCurrency(data.currencyCode || 'USD')
      })
      .catch((err) => showToast(err.message || 'Could not load payment settings.', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveCurrency = async (e) => {
    e.preventDefault()
    setSavingCurrency(true)
    try {
      await updatePaymentSettings({ currencyCode: currency })
      showToast(`Currency set to ${currency}.`, 'success')
      await refresh()
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSavingCurrency(false)
    }
  }

  const connectXendit = async (e) => {
    e.preventDefault()
    if (!secretKey.trim() && !webhookToken.trim()) {
      showToast('Enter your Xendit secret key and webhook verification token.', 'error')
      return
    }
    setSavingXendit(true)
    try {
      await updatePaymentSettings({
        currencyCode: currency,
        xenditSecretKey: secretKey.trim() || undefined,
        xenditWebhookToken: webhookToken.trim() || undefined,
      })
      showToast('Xendit account connected. Customer checkout now collects payment into your account.', 'success')
      setSecretKey('')
      setWebhookToken('')
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSavingXendit(false)
    }
  }

  const disconnectXendit = async () => {
    setSavingXendit(true)
    try {
      await updatePaymentSettings({ currencyCode: currency, xenditSecretKey: '-', xenditWebhookToken: '-' })
      showToast('Xendit disconnected. Checkout falls back to the simulated flow.', 'success')
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSavingXendit(false)
    }
  }

  if (loading) return <Spinner />
  if (!settings) return <p className="form-error">Could not load payment settings.</p>

  return (
    <div>
      <div className="admin-panel-header">
        <h2>Payments</h2>
      </div>

      {/* ---- Currency ---- */}
      <form className="admin-form" onSubmit={saveCurrency}>
        <h3>Currency</h3>
        <p className="hint">
          The currency your prices, cart, orders and (if connected) Xendit invoices are shown and charged in.
          Product prices are stored as plain numbers — changing this does not convert them.
        </p>
        <div className="form-group" style={{ maxWidth: 220 }}>
          <label htmlFor="pm-currency">Shop currency</label>
          <select id="pm-currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {[...new Set([currency, ...CURRENCIES])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-form-actions">
          <button type="submit" className="btn btn-primary" disabled={savingCurrency || currency === settings.currencyCode}>
            {savingCurrency ? 'Saving…' : 'Save currency'}
          </button>
        </div>
      </form>

      {/* ---- Xendit ---- */}
      <div className="admin-form" style={{ marginTop: '2rem' }}>
        <h3>Receive customer payments (Xendit)</h3>

        {!settings.platformSupportsConnect ? (
          <div className="callout">
            <p>
              Connecting a payment account isn't enabled on this server yet. Checkout currently records orders without
              collecting payment.
            </p>
          </div>
        ) : (
          <>
            <p className="hint">
              Connect <strong>your own</strong> Xendit account so customer checkout payments (GCash, Maya, cards) land in
              your Xendit balance. Until you connect, checkout is simulated — an order is recorded but no money moves.
            </p>

            <p>
              Status:{' '}
              {settings.xenditConnected ? (
                <span className="badge badge-success">
                  Connected{settings.xenditSecretKeyHint ? ` (${settings.xenditSecretKeyHint})` : ''}
                </span>
              ) : (
                <span className="badge badge-muted">Not connected</span>
              )}
              {settings.xenditConnected && !settings.webhookTokenSet && (
                <span className="stock-low"> · webhook token missing — payments won't confirm</span>
              )}
            </p>

            <div className="callout">
              <p className="hint" style={{ marginTop: 0 }}>
                In your Xendit dashboard → <strong>Settings → Developers → Webhooks</strong>, set the <em>Invoices</em>{' '}
                paid &amp; expired callback URL to:
              </p>
              <p className="mono" style={{ wordBreak: 'break-all' }}>{settings.webhookUrl}</p>
              <p className="hint" style={{ marginBottom: 0 }}>
                Then copy that page's <strong>Verification Token</strong> and your API <strong>secret key</strong>{' '}
                (Settings → Developers → API Keys, starts with <code>xnd_</code>) into the form below.
              </p>
            </div>

            <form onSubmit={connectXendit}>
              <div className="form-group">
                <label htmlFor="pm-key">Xendit secret key</label>
                <input
                  id="pm-key"
                  type="password"
                  className="input"
                  placeholder={settings.xenditConnected ? 'Leave blank to keep the current key' : 'xnd_production_…'}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label htmlFor="pm-token">Webhook verification token</label>
                <input
                  id="pm-token"
                  type="password"
                  className="input"
                  placeholder={settings.webhookTokenSet ? 'Leave blank to keep the current token' : ''}
                  value={webhookToken}
                  onChange={(e) => setWebhookToken(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="admin-form-actions">
                {settings.xenditConnected && (
                  <button type="button" className="btn btn-danger" onClick={disconnectXendit} disabled={savingXendit}>
                    Disconnect
                  </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={savingXendit}>
                  {savingXendit ? 'Saving…' : settings.xenditConnected ? 'Update' : 'Connect Xendit'}
                </button>
              </div>
            </form>
            <p className="hint">
              Your keys are encrypted before storage and never shown again. The shop's Pro-plan subscription still bills
              through the platform, separately from this.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
