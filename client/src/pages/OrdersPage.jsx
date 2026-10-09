import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getMyOrderCounts, getMyOrders } from '../api/orders'
import Pagination from '../components/Pagination'
import Spinner from '../components/Spinner'
import { useCurrency } from '../context/TenantContext'

const TABS = [
  { key: '', label: 'All' },
  { key: 'topay', label: 'To pay' },
  { key: 'toship', label: 'To ship' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'completed', label: 'Completed' }
]

const EMPTY = {
  '': "You haven't placed any orders yet.",
  topay: 'No orders waiting for payment.',
  toship: 'Nothing waiting to be shipped.',
  shipping: 'No orders on their way right now.',
  completed: 'No delivered orders yet.'
}

function stageBadge(o) {
  if (o.status === 'AwaitingPayment') return <span className="stock-low">Awaiting payment</span>
  if (o.status !== 'Completed') return <span className="pet-card-meta">{o.status}</span>
  if (o.fulfillment === 'Delivered') return <span className="stock-in">Delivered</span>
  if (o.fulfillment === 'Shipped') return <span className="badge badge-success">Shipped</span>
  return <span className="badge badge-muted">To ship</span>
}

export default function OrdersPage() {
  const money = useCurrency()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get('page') || '1', 10)
  const stage = searchParams.get('stage') || ''
  const [result, setResult] = useState({ items: [], totalPages: 0, totalCount: 0, page: 1 })
  const [counts, setCounts] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyOrderCounts().then(setCounts).catch(() => {})
  }, [])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    getMyOrders({ page, pageSize: 20, stage })
      .then((data) => {
        if (!ignore) setResult(data)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [page, stage])

  const setParams = (next) => {
    const p = {}
    if (next.stage) p.stage = next.stage
    if (next.page > 1) p.page = next.page
    setSearchParams(p)
  }

  return (
    <div className="container section">
      <h1>My orders</h1>
      <div className="tabs" role="tablist" aria-label="Order status">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={stage === t.key}
            className={`tab ${stage === t.key ? 'active' : ''}`}
            onClick={() => setParams({ stage: t.key, page: 1 })}
          >
            {t.label}
            {counts && (counts[t.key || 'all'] ?? 0) > 0 && <span className="tab-count">{counts[t.key || 'all']}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : result.items.length === 0 ? (
        <p className="empty-state">{EMPTY[stage] ?? EMPTY['']}</p>
      ) : (
        <>
          <ul className="order-list">
            {result.items.map((o) => (
              <li key={o.id} className="card order-list-item">
                <div>
                  <Link to={`/orders/${o.id}`}>
                    <strong>Order #{o.id}</strong>
                  </Link>{' '}
                  {stageBadge(o)}
                  <p className="pet-card-meta">
                    {new Date(o.orderDateUtc).toLocaleDateString()} &middot;{' '}
                    {o.items.reduce((n, i) => n + (i.quantity ?? 1), 0)} item(s)
                    {o.status === 'Completed' && o.fulfillment === 'Shipped' && o.trackingNumber && (
                      <> &middot; {o.carrier ? `${o.carrier} ` : ''}{o.trackingNumber}</>
                    )}
                    {o.fulfillment === 'Delivered' && o.deliveredAtUtc && (
                      <> &middot; delivered {new Date(o.deliveredAtUtc).toLocaleDateString()}</>
                    )}
                  </p>
                  {o.status === 'AwaitingPayment' && o.paymentUrl && (
                    <a href={o.paymentUrl} className="btn btn-primary btn-small">
                      Complete payment
                    </a>
                  )}
                </div>
                <span className="order-total">{money(o.totalAmount)}</span>
              </li>
            ))}
          </ul>
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onPageChange={(p) => setParams({ stage, page: p })}
          />
        </>
      )}
    </div>
  )
}
