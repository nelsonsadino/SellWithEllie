import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { trackOrder } from '../api/shop'
import { OrderItemsCard, OrderTimeline } from '../components/OrderTracker'
import { useToast } from '../context/ToastContext'

const EMAIL_KEY = 'guest-order-email'
const readEmail = () => {
  try {
    return localStorage.getItem(EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

// Order lookup for guests (order number + checkout email). Also the landing
// page after a guest checkout, so the shopper immediately sees their order.
export default function TrackOrderPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const { showToast } = useToast()
  const [orderId, setOrderId] = useState(params.get('order') || '')
  const [email, setEmail] = useState(readEmail())
  const [order, setOrder] = useState(null)
  const [busy, setBusy] = useState(false)

  const lookup = async (id, mail) => {
    setBusy(true)
    try {
      setOrder(await trackOrder(id, mail))
    } catch (err) {
      setOrder(null)
      showToast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Arriving with an order number and a remembered email -> look it up straight away.
  useEffect(() => {
    const id = params.get('order')
    const mail = readEmail()
    if (id && mail) lookup(id, mail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = (e) => {
    e.preventDefault()
    lookup(orderId.trim(), email.trim())
  }

  return (
    <div className="container section">
      {location.state?.justPlaced && <div className="callout callout-success">Thanks! Your order has been placed. A confirmation was emailed to you.</div>}
      {params.get('paid') === '1' && <div className="callout callout-success">Payment received — thank you!</div>}
      {params.get('payment') === 'failed' && <div className="callout">Payment wasn't completed.</div>}

      <h1>Track your order</h1>
      <form className="card track-form" onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="tk-order">Order number</label>
          <input id="tk-order" className="input" inputMode="numeric" required value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="tk-email">Email used at checkout</label>
          <input id="tk-email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Looking…' : 'Find my order'}
        </button>
        <p className="hint">
          Have an account? <Link to="/orders">See all your orders</Link>.
        </p>
      </form>

      {order && (
        <>
          <h2>Order #{order.id}</h2>
          <p className="pet-card-meta">
            Placed {new Date(order.orderDateUtc).toLocaleString()} · {order.status}
          </p>
          {order.status === 'AwaitingPayment' && order.paymentUrl && (
            <div className="callout">
              <p>This order is waiting for payment.</p>
              <a href={order.paymentUrl} className="btn btn-primary">Complete payment</a>
            </div>
          )}
          <OrderTimeline order={order} />
          <div className="card">
            <h2>Shipping to</h2>
            <p>{order.shippingName}</p>
            <p>{order.shippingAddress}</p>
          </div>
          <OrderItemsCard order={order} />
        </>
      )}
    </div>
  )
}
