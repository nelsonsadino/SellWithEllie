import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProduct } from '../api/products'
import ProductCard from '../components/ProductCard'
import Spinner from '../components/Spinner'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { getWishlist, onWishlistChange } from '../lib/wishlist'

export default function WishlistPage() {
  const [ids, setIds] = useState(() => getWishlist())
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const { addItem } = useCart()
  const { showToast } = useToast()

  useEffect(() => onWishlistChange(() => setIds(getWishlist())), [])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    Promise.all(ids.map((id) => getProduct(id).catch(() => null)))
      .then((rows) => {
        if (!ignore) setProducts(rows.filter(Boolean))
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [ids.join(',')])

  const handleAddToCart = async (product) => {
    try {
      await addItem(product.id)
      showToast(`${product.name} added to your cart.`, 'success')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  return (
    <div className="container section">
      <div className="page-header">
        <h1>Saved</h1>
        <p>{products.length ? `${products.length} item${products.length === 1 ? '' : 's'}` : 'Your saved items live here.'}</p>
      </div>

      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <div className="empty-state">
          <h2>Nothing saved yet</h2>
          <p>Tap the heart on any product to keep it here.</p>
          <Link to="/products" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Browse the shop
          </Link>
        </div>
      ) : (
        <div className="grid grid-cards">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} onAddToCart={handleAddToCart} />
          ))}
        </div>
      )}
    </div>
  )
}
