import { Link, useNavigate } from 'react-router-dom'
import ProductImage from '../components/ProductImage'
import Spinner from '../components/Spinner'
import { useCart } from '../context/CartContext'
import { useCurrency } from '../context/TenantContext'
import { useToast } from '../context/ToastContext'

export default function CartPage() {
  const { items, total, loading, removeItem, setQuantity } = useCart()
  const money = useCurrency()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const handleRemove = async (productId) => {
    try {
      await removeItem(productId)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleQty = async (productId, quantity) => {
    try {
      await setQuantity(productId, quantity)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="container section">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="container section">
      <h1>Your cart</h1>
      {items.length === 0 ? (
        <div className="empty-state">
          <p>Your cart is empty.</p>
          <Link to="/products" className="btn btn-primary">
            Browse products
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <ul className="cart-list">
            {items.map((item) => {
              const outOfStock = item.availableStock <= 0
              const overStock = item.quantity > item.availableStock && !outOfStock
              return (
                <li key={item.id} className="cart-item">
                  <ProductImage src={item.productImageUrl} category={item.productCategory} alt={item.productName} className="cart-item-image" />
                  <div className="cart-item-info">
                    <Link to={`/products/${item.productId}`}>{item.productName}</Link>
                    <span className="cart-item-unit">{money(item.price)} each</span>
                    {outOfStock && <span className="badge badge-muted">Out of stock</span>}
                    {overStock && (
                      <span className="stock-low">Only {item.availableStock} left — quantity will be reduced at checkout</span>
                    )}
                  </div>
                  <div className="qty-stepper">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => handleQty(item.productId, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={Math.max(1, item.availableStock)}
                      value={item.quantity}
                      onChange={(e) => {
                        const n = Math.max(1, Math.trunc(Number(e.target.value) || 1))
                        handleQty(item.productId, Math.min(n, Math.max(1, item.availableStock)))
                      }}
                      aria-label={`Quantity of ${item.productName}`}
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => handleQty(item.productId, item.quantity + 1)}
                      disabled={item.quantity >= item.availableStock}
                    >
                      +
                    </button>
                  </div>
                  <span className="cart-item-price">{money(item.lineTotal ?? item.price * item.quantity)}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => handleRemove(item.productId)}>
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="cart-summary card">
            <h2>Summary</h2>
            <div className="cart-summary-row">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            <button className="btn btn-primary btn-block" onClick={() => navigate('/checkout')}>
              Proceed to checkout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
