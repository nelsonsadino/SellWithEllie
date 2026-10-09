import { useCurrency } from '../context/TenantContext'

const STEPS = [
  { key: 'Processing', label: 'Order placed' },
  { key: 'Shipped', label: 'Shipped' },
  { key: 'Delivered', label: 'Delivered' }
]

const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

// Timeline for one order's fulfilment, plus the carrier/tracking line.
export function OrderTimeline({ order }) {
  if (order.status !== 'Completed') return null
  const at = STEPS.findIndex((s) => s.key === order.fulfillment)
  const dates = [order.orderDateUtc, order.shippedAtUtc, order.deliveredAtUtc]
  return (
    <div className="card order-track">
      <h2>Tracking</h2>
      <ol className="track-steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i <= at ? 'is-done' : ''} aria-current={i === at ? 'step' : undefined}>
            <span className="track-dot" aria-hidden="true">{i <= at ? '✓' : ''}</span>
            <strong>{s.label}</strong>
            <span className="pet-card-meta">{i <= at ? fmt(dates[i]) : ''}</span>
          </li>
        ))}
      </ol>
      {order.trackingNumber && (
        <p className="track-number">
          {order.carrier ? `${order.carrier} · ` : ''}Tracking no. <strong>{order.trackingNumber}</strong>
        </p>
      )}
      {order.shippingMethodName && <p className="pet-card-meta">Shipping method: {order.shippingMethodName}</p>}
    </div>
  )
}

export function OrderItemsCard({ order }) {
  const money = useCurrency()
  const subtotal = order.items.reduce((s, i) => s + (i.lineTotal ?? i.priceAtPurchase * (i.quantity ?? 1)), 0)
  return (
    <div className="card">
      <h2>Items</h2>
      <ul className="order-item-list">
        {order.items.map((i, idx) => (
          <li key={idx}>
            <span>
              {i.productName}
              {i.quantity > 1 && <span className="pet-card-meta"> × {i.quantity}</span>}
            </span>
            <span>{money(i.lineTotal ?? i.priceAtPurchase * (i.quantity ?? 1))}</span>
          </li>
        ))}
      </ul>
      <div className="cart-summary-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
      {order.discountAmount > 0 && (
        <div className="cart-summary-row"><span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span><span>−{money(order.discountAmount)}</span></div>
      )}
      {order.shippingMethodName && (
        <div className="cart-summary-row">
          <span>Shipping ({order.shippingMethodName})</span>
          <span>{order.shippingCost > 0 ? money(order.shippingCost) : 'Free'}</span>
        </div>
      )}
      <div className="cart-summary-row"><span>Total</span><strong>{money(order.totalAmount)}</strong></div>
    </div>
  )
}
