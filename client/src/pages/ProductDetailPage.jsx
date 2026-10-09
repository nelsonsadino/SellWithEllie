import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getProduct } from '../api/products'
import ProductGallery from '../components/ProductGallery'
import ProductReviews, { RatingSummaryLine } from '../components/ProductReviews'
import RecentlyViewed from '../components/RecentlyViewed'
import RelatedProducts from '../components/RelatedProducts'
import Spinner from '../components/Spinner'
import WishlistButton from '../components/WishlistButton'
import { useCart } from '../context/CartContext'
import { useCurrency, useOptionalTenant } from '../context/TenantContext'
import { useToast } from '../context/ToastContext'
import { recordView } from '../lib/recentlyViewed'

export default function ProductDetailPage() {
  const { id } = useParams()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [qty, setQty] = useState(1)
  const [rating, setRating] = useState(null)
  const onReviews = useCallback((d) => setRating(d), [])
  const money = useCurrency()
  const lowAt = useOptionalTenant()?.lowStockThreshold ?? 5
  const { addItem, items } = useCart()
  const { showToast } = useToast()

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setNotFound(false)
    getProduct(id)
      .then((data) => {
        if (!ignore) {
          setProduct(data)
          recordView(data.id)
        }
      })
      .catch((err) => {
        if (!ignore && err.status === 404) setNotFound(true)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="container section">
        <Spinner />
      </div>
    )
  }

  if (notFound || !product) {
    return (
      <div className="container section empty-state">
        <h2>Product not found</h2>
        <Link to="/products" className="btn btn-primary">
          Back to shop
        </Link>
      </div>
    )
  }

  const inCartQty = items.find((i) => i.productId === product.id)?.quantity ?? 0
  const stock = product.stockQuantity ?? (product.inStock ? 1 : 0)
  const maxAddable = Math.max(0, stock - inCartQty)
  const canBuy = !product.isAuctionOnly && !product.activeAuctionId && maxAddable > 0
  const boundedQty = Math.min(Math.max(1, qty), Math.max(1, maxAddable))

  const handleAddToCart = async () => {
    try {
      await addItem(product.id, boundedQty)
      showToast(
        `${boundedQty} × ${product.name} added to your cart.`,
        'success'
      )
      setQty(1)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  return (
    <>
    <div className="container section pet-detail">
      <div className="pet-detail-image">
        <ProductGallery media={product.media} imageUrl={product.imageUrl} category={product.category} alt={product.name} />
      </div>
      <div className="pet-detail-info">
        <h1>{product.name}</h1>
        <RatingSummaryLine data={rating} />
        <p className="pet-card-meta">
          {product.category}
          {product.subcategory ? ` · ${product.subcategory}` : ''}
        </p>
        <div className="pet-detail-price-row">
          <p className="pet-detail-price">{money(product.price)}</p>
          <span className="pet-detail-save">
            <WishlistButton productId={product.id} productName={product.name} />
          </span>
        </div>
        <p>{product.description}</p>

        {product.activeAuctionId ? (
          <div className="callout">
            <p>This product is available exclusively through our live auction.</p>
            <Link to={`/auctions/${product.activeAuctionId}`} className="btn btn-primary btn-block">
              Go to auction
            </Link>
          </div>
        ) : product.isAuctionOnly ? (
          <div className="callout">
            <p>This product will be available soon through auction. Check back shortly!</p>
          </div>
        ) : (
          <>
            <p className="pet-detail-stock">
              {stock <= 0 ? (
                <span className="stock-out">Sold out</span>
              ) : stock <= lowAt ? (
                <span className="stock-low">Only {stock} left in stock</span>
              ) : (
                <span className="stock-in">{stock} in stock</span>
              )}
              {inCartQty > 0 && <span className="stock-incart"> · {inCartQty} in your cart</span>}
            </p>
            {canBuy && (
              <div className="qty-row">
                <label htmlFor="pd-qty">Quantity</label>
                <div className="qty-stepper">
                  <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={boundedQty <= 1}>
                    −
                  </button>
                  <input
                    id="pd-qty"
                    type="number"
                    min="1"
                    max={maxAddable}
                    value={boundedQty}
                    onChange={(e) => setQty(Math.max(1, Math.min(maxAddable, Math.trunc(Number(e.target.value) || 1))))}
                  />
                  <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(maxAddable, q + 1))} disabled={boundedQty >= maxAddable}>
                    +
                  </button>
                </div>
              </div>
            )}
            <button className="btn btn-primary btn-block" disabled={!canBuy} onClick={handleAddToCart}>
              {stock <= 0
                ? 'Sold out'
                : maxAddable <= 0
                  ? 'Max in cart'
                  : `Add ${boundedQty > 1 ? `${boundedQty} ` : ''}to cart`}
            </button>
          </>
        )}
      </div>
    </div>
    <ProductReviews productId={product.id} onLoaded={onReviews} />
    <RelatedProducts productId={product.id} onAddToCart={handleAddToCart} />
    <RecentlyViewed currentId={product.id} onAddToCart={handleAddToCart} />
    </>
  )
}
