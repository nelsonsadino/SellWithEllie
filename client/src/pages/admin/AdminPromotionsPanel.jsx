import { useCallback, useEffect, useState } from 'react'
import {
  createCoupon,
  createShippingMethod,
  deleteCoupon,
  deleteShippingMethod,
  getAllShippingMethods,
  getCoupons,
  setCouponActive
} from '../../api/shop'
import Spinner from '../../components/Spinner'
import { useCurrency } from '../../context/TenantContext'
import { useToast } from '../../context/ToastContext'

const blankCoupon = { code: '', type: 0, value: '', minSubtotal: '', maxUses: '', expiresAtUtc: '' }
const blankShip = { name: '', price: '', estimatedDelivery: '', freeOverSubtotal: '' }

export default function AdminPromotionsPanel() {
  const money = useCurrency()
  const { showToast } = useToast()
  const [coupons, setCoupons] = useState(null)
  const [methods, setMethods] = useState(null)
  const [cForm, setCForm] = useState(blankCoupon)
  const [sForm, setSForm] = useState(blankShip)

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([getCoupons(), getAllShippingMethods()])
    setCoupons(c)
    setMethods(m)
  }, [])

  useEffect(() => {
    load().catch((err) => showToast(err.message, 'error'))
  }, [load, showToast])

  const run = async (fn, ok) => {
    try {
      await fn()
      if (ok) showToast(ok, 'success')
      await load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const addCoupon = (e) => {
    e.preventDefault()
    run(async () => {
      await createCoupon({
        code: cForm.code,
        type: Number(cForm.type),
        value: Number(cForm.value),
        minSubtotal: Number(cForm.minSubtotal) || 0,
        maxUses: cForm.maxUses ? Number(cForm.maxUses) : null,
        expiresAtUtc: cForm.expiresAtUtc ? new Date(cForm.expiresAtUtc).toISOString() : null
      })
      setCForm(blankCoupon)
    }, 'Coupon created.')
  }

  const addMethod = (e) => {
    e.preventDefault()
    run(async () => {
      await createShippingMethod({
        name: sForm.name,
        price: Number(sForm.price) || 0,
        estimatedDelivery: sForm.estimatedDelivery,
        freeOverSubtotal: sForm.freeOverSubtotal ? Number(sForm.freeOverSubtotal) : null,
        isActive: true
      })
      setSForm(blankShip)
    }, 'Shipping option added.')
  }

  if (!coupons || !methods) return <Spinner />

  return (
    <div className="promo-panel">
      <div className="admin-panel-header">
        <h2>Discount codes</h2>
      </div>
      <form className="card promo-form" onSubmit={addCoupon}>
        <input className="input" required placeholder="CODE" aria-label="Code" value={cForm.code} onChange={(e) => setCForm({ ...cForm, code: e.target.value })} />
        <select className="input" aria-label="Type" value={cForm.type} onChange={(e) => setCForm({ ...cForm, type: e.target.value })}>
          <option value={0}>% off</option>
          <option value={1}>Amount off</option>
        </select>
        <input className="input" required type="number" min="0.01" step="0.01" placeholder="Value" aria-label="Value" value={cForm.value} onChange={(e) => setCForm({ ...cForm, value: e.target.value })} />
        <input className="input" type="number" min="0" step="0.01" placeholder="Min spend" aria-label="Minimum spend" value={cForm.minSubtotal} onChange={(e) => setCForm({ ...cForm, minSubtotal: e.target.value })} />
        <input className="input" type="number" min="1" placeholder="Max uses" aria-label="Maximum uses" value={cForm.maxUses} onChange={(e) => setCForm({ ...cForm, maxUses: e.target.value })} />
        <input className="input" type="date" aria-label="Expires" value={cForm.expiresAtUtc} onChange={(e) => setCForm({ ...cForm, expiresAtUtc: e.target.value })} />
        <button className="btn btn-primary">Add code</button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th><th>Discount</th><th>Min spend</th><th>Used</th><th>Expires</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 && (
              <tr><td colSpan={7} className="empty-state">No codes yet.</td></tr>
            )}
            {coupons.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.code}</strong></td>
                <td>{c.type === 0 ? `${c.value}%` : money(c.value)}</td>
                <td>{c.minSubtotal > 0 ? money(c.minSubtotal) : '—'}</td>
                <td>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                <td>{c.expiresAtUtc ? new Date(c.expiresAtUtc).toLocaleDateString() : 'Never'}</td>
                <td>
                  <button className="btn btn-secondary btn-small" onClick={() => run(() => setCouponActive(c.id, !c.isActive))}>
                    {c.isActive ? 'Active' : 'Paused'}
                  </button>
                </td>
                <td>
                  <button className="btn btn-secondary btn-small" onClick={() => run(() => deleteCoupon(c.id), 'Coupon deleted.')}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-panel-header" style={{ marginTop: '2rem' }}>
        <h2>Shipping options</h2>
      </div>
      <form className="card promo-form" onSubmit={addMethod}>
        <input className="input" required placeholder="Name (e.g. Standard)" aria-label="Name" value={sForm.name} onChange={(e) => setSForm({ ...sForm, name: e.target.value })} />
        <input className="input" required type="number" min="0" step="0.01" placeholder="Price" aria-label="Price" value={sForm.price} onChange={(e) => setSForm({ ...sForm, price: e.target.value })} />
        <input className="input" placeholder="Estimate (e.g. 3-5 days)" aria-label="Estimated delivery" value={sForm.estimatedDelivery} onChange={(e) => setSForm({ ...sForm, estimatedDelivery: e.target.value })} />
        <input className="input" type="number" min="0" step="0.01" placeholder="Free over…" aria-label="Free over subtotal" value={sForm.freeOverSubtotal} onChange={(e) => setSForm({ ...sForm, freeOverSubtotal: e.target.value })} />
        <button className="btn btn-primary">Add option</button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Price</th><th>Estimate</th><th>Free over</th><th /></tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td>{m.price > 0 ? money(m.price) : 'Free'}</td>
                <td>{m.estimatedDelivery || '—'}</td>
                <td>{m.freeOverSubtotal != null ? money(m.freeOverSubtotal) : '—'}</td>
                <td>
                  <button className="btn btn-secondary btn-small" onClick={() => run(() => deleteShippingMethod(m.id), 'Shipping option removed.')}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
