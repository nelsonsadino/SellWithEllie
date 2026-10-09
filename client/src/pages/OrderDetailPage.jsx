import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getOrder } from '../api/orders'
import { OrderItemsCard, OrderTimeline } from '../components/OrderTracker'
import Spinner from '../components/Spinner'

export default function OrderDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getOrder(id)
      .then(setOrder)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="container section">
        <Spinner />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="container section empty-state">
        <h2>Order not found</h2>
        <Link to="/orders" className="btn btn-primary">
          Back to orders
        </Link>
      </div>
    )
  }

  return (
    <div className="container section">
      {location.state?.justPlaced && <div className="callout callout-success">Thanks! Your order has been placed.</div>}
      {new URLSearchParams(location.search).get('paid') === '1' && (
        <div className="callout callout-success">Payment received — thank you! Your order is confirmed.</div>
      )}
      {new URLSearchParams(location.search).get('payment') === 'failed' && (
        <div className="callout">Payment wasn't completed. You can try again below.</div>
      )}
      <h1>Order #{order.id}</h1>
      <p className="pet-card-meta">
        Placed {new Date(order.orderDateUtc).toLocaleString()} &middot; {order.status}
      </p>

      {order.status === 'AwaitingPayment' && (
        <div className="callout">
          <p>This order is waiting for payment.</p>
          {order.paymentUrl && (
            <a href={order.paymentUrl} className="btn btn-primary">
              Complete payment
            </a>
          )}
        </div>
      )}

      <OrderTimeline order={order} />

      <div className="card">
        <h2>Shipping to</h2>
        <p>{order.shippingName}</p>
        <p>{order.shippingAddress}</p>
      </div>

      <OrderItemsCard order={order} />
    </div>
  )
}
