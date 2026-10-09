import { useEffect, useState } from 'react'
import { getAllOrders } from '../../api/orders'
import { updateFulfillment } from '../../api/shop'
import Pagination from '../../components/Pagination'
import Spinner from '../../components/Spinner'
import { useCurrency } from '../../context/TenantContext'
import { useToast } from '../../context/ToastContext'

const PAGE_SIZE = 25
const STATUSES = ['Processing', 'Shipped', 'Delivered']

function FulfillmentEditor({ order, onSaved }) {
  const { showToast } = useToast()
  const [status, setStatus] = useState(order.fulfillment)
  const [carrier, setCarrier] = useState(order.carrier || '')
  const [tracking, setTracking] = useState(order.trackingNumber || '')
  const [saving, setSaving] = useState(false)

  const dirty =
    status !== order.fulfillment || carrier !== (order.carrier || '') || tracking !== (order.trackingNumber || '')

  const save = async () => {
    setSaving(true)
    try {
      const updated = await updateFulfillment(order.id, { status, carrier, trackingNumber: tracking })
      onSaved(updated)
      showToast(
        status === order.fulfillment ? 'Tracking details saved.' : `Order #${order.id} marked ${status.toLowerCase()} — customer emailed.`,
        'success'
      )
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fulfil-editor">
      <select className="input" aria-label={`Fulfilment status for order ${order.id}`} value={status} onChange={(e) => setStatus(e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <input className="input" placeholder="Carrier" aria-label="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
      <input className="input" placeholder="Tracking no." aria-label="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} />
      <button className="btn btn-primary btn-small" disabled={!dirty || saving} onClick={save}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

export default function AdminOrdersPanel() {
  const money = useCurrency()
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ items: [], totalPages: 0, totalCount: 0, page: 1 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    getAllOrders({ page, pageSize: PAGE_SIZE })
      .then((data) => {
        if (!ignore) setResult(data)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [page])

  const replace = (updated) =>
    setResult((r) => ({ ...r, items: r.items.map((o) => (o.id === updated.id ? { ...o, ...updated, customerEmail: o.customerEmail } : o)) }))

  if (loading) return <Spinner />

  return (
    <div>
      <div className="admin-panel-header">
        <h2>Orders</h2>
      </div>
      {result.items.length === 0 ? (
        <p className="empty-state">No orders yet.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Fulfilment</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      #{o.id}
                      {o.isGuest && <span className="badge badge-muted"> Guest</span>}
                    </td>
                    <td>{o.customerEmail}</td>
                    <td>{new Date(o.orderDateUtc).toLocaleDateString()}</td>
                    <td>{o.items.length}</td>
                    <td>
                      {money(o.totalAmount)}
                      {o.couponCode && <div className="pet-card-meta">{o.couponCode}</div>}
                    </td>
                    <td>{o.status}</td>
                    <td>
                      {o.status === 'Completed' ? (
                        <FulfillmentEditor key={`${o.id}-${o.fulfillment}`} order={o} onSaved={replace} />
                      ) : (
                        <span className="pet-card-meta">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
