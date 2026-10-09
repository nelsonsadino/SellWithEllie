import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { checkout } from '../api/cart'
import { getShippingMethods, guestCheckout, quote } from '../api/shop'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { useCurrency } from '../context/TenantContext'

export default function CheckoutPage() {
  const money = useCurrency()
  const { items, total, refresh, clear } = useCart()
  const { user, isAuthenticated } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ shippingName: user?.displayName || '', shippingAddress: '', email: '' })
  const [methods, setMethods] = useState([])
  const [methodId, setMethodId] = useState(null)
  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState('')
  const [couponError, setCouponError] = useState('')
  const [pricing, setPricing] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getShippingMethods()
      .then((rows) => {
        setMethods(rows)
        setMethodId((cur) => cur ?? rows[0]?.id ?? null)
      })
      .catch(() => setMethods([]))
  }, [])

  // The server is the only source of truth for what you pay; this just previews it.
  useEffect(() => {
    if (items.length === 0) return undefined
    let ignore = false
    quote({ subtotal: total, shippingMethodId: methodId, couponCode: coupon || null })
      .then((q) => {
        if (ignore) return
        if (q.error && coupon) {
          setCouponError(q.error)
          setCoupon('')
        } else {
          setCouponError('')
          setPricing(q)
        }
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [total, methodId, coupon, items.length])

  if (items.length === 0) {
    return (
      <div className="container section empty-state">
        <p>Your cart is empty.</p>
        <Link to="/products" className="btn btn-primary">
          Browse products
        </Link>
      </div>
    )
  }

  const applyCoupon = (e) => {
    e.preventDefault()
    setCouponError('')
    setCoupon(couponInput.trim())
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    const common = {
      shippingName: form.shippingName,
      shippingAddress: form.shippingAddress,
      shippingMethodId: methodId,
      couponCode: coupon || null,
      returnUrlBase: window.location.origin
    }
    try {
      let order
      if (isAuthenticated) {
        order = await checkout(common)
        await refresh()
      } else {
        order = await guestCheckout({
          ...common,
          email: form.email,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
        })
        try {
          localStorage.setItem('guest-order-email', form.email.trim())
        } catch {
          /* ignore */
        }
        clear()
      }

      // Shop connected its own Xendit account -> finish payment on the
      // hosted invoice page. Otherwise the order is already complete.
      if (order.paymentUrl) {
        window.location.href = order.paymentUrl
        return
      }

      showToast('Order placed! Thank you.', 'success')
      navigate(isAuthenticated ? `/orders/${order.id}` : `/track?order=${order.id}`, { state: { justPlaced: true } })
    } catch (err) {
      showToast(err.message, 'error')
      setSubmitting(false)
    }
  }

  const grand = pricing?.total ?? total

  return (
    <div className="container section checkout-layout">
      <form className="card checkout-form" onSubmit={handleSubmit}>
        <h1>Checkout</h1>
        {!isAuthenticated && (
          <p className="callout">
            Checking out as a guest. <Link to="/login">Sign in</Link> instead to track orders in your account.
          </p>
        )}

        {!isAuthenticated && (
          <div className="form-group">
            <label htmlFor="email">Email (for your receipt and tracking)</label>
            <input
              id="email"
              type="email"
              className="input"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        )}
        <div className="form-group">
          <label htmlFor="shippingName">Full name</label>
          <input
            id="shippingName"
            className="input"
            required
            value={form.shippingName}
            onChange={(e) => setForm({ ...form, shippingName: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label htmlFor="shippingAddress">Delivery / pickup address</label>
          <textarea
            id="shippingAddress"
            className="input"
            required
            rows={3}
            value={form.shippingAddress}
            onChange={(e) => setForm({ ...form, shippingAddress: e.target.value })}
          />
        </div>

        {methods.length > 0 && (
          <fieldset className="ship-options">
            <legend>Shipping method</legend>
            {methods.map((m) => {
              const free = m.freeOverSubtotal != null && total >= m.freeOverSubtotal
              return (
                <label key={m.id} className={`ship-option${methodId === m.id ? ' is-selected' : ''}`}>
                  <input type="radio" name="ship" checked={methodId === m.id} onChange={() => setMethodId(m.id)} />
                  <span className="ship-option-main">
                    <strong>{m.name}</strong>
                    <span className="pet-card-meta">{m.estimatedDelivery}</span>
                  </span>
                  <span className="ship-option-price">{free || m.price === 0 ? 'Free' : money(m.price)}</span>
                </label>
              )
            })}
          </fieldset>
        )}

        <p className="hint">
          If this shop has connected a payment provider you'll be taken to a secure page to pay; otherwise the order is
          recorded without a charge.
        </p>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Placing order…' : `Place order - ${money(grand)}`}
        </button>
      </form>

      <div className="card checkout-summary">
        <h2>Order summary</h2>
        <ul className="order-item-list">
          {items.map((i) => (
            <li key={i.id}>
              <span>
                {i.productName}
                {i.quantity > 1 && <span className="pet-card-meta"> × {i.quantity}</span>}
              </span>
              <span>{money(i.lineTotal ?? i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>

        <form className="coupon-box" onSubmit={applyCoupon}>
          <label htmlFor="coupon" className="sr-only">Discount code</label>
          <input
            id="coupon"
            className="input"
            placeholder="Discount code"
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
          />
          <button className="btn btn-secondary" type="submit" disabled={!couponInput.trim()}>
            Apply
          </button>
        </form>
        {couponError && <p className="field-error" role="alert">{couponError}</p>}
        {pricing?.couponCode && <p className="coupon-applied">✓ {pricing.couponCode} applied</p>}

        <div className="cart-summary-row"><span>Subtotal</span><span>{money(total)}</span></div>
        {pricing?.discount > 0 && (
          <div className="cart-summary-row"><span>Discount</span><span>−{money(pricing.discount)}</span></div>
        )}
        {pricing && methodId != null && (
          <div className="cart-summary-row">
            <span>Shipping</span>
            <span>{pricing.shipping > 0 ? money(pricing.shipping) : 'Free'}</span>
          </div>
        )}
        <div className="cart-summary-row">
          <span>Total</span>
          <strong>{money(grand)}</strong>
        </div>
      </div>
    </div>
  )
}
