import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCurrency, useOptionalTenant } from '../context/TenantContext'
import ProductImage from './ProductImage'
import WishlistButton from './WishlistButton'

const lot = (id) => `LOT ${String(id).padStart(3, '0')}`

export default function ProductCard({ product, onAddToCart, addDisabled, featured = false }) {
  const money = useCurrency()
  const lowAt = useOptionalTenant()?.lowStockThreshold ?? 5
  const stock = product.stockQuantity ?? (product.inStock ? 1 : 0)
  const canBuy = !product.isAuctionOnly && !product.activeAuctionId && stock > 0
  const [added, setAdded] = useState(false)
  const timer = useRef(null)

  // First gallery image that isn't the cover - crossfades in on hover.
  const hoverImg = (product.media || []).map((m) => m.url).find((u) => u && u !== product.imageUrl)

  const handleAdd = async () => {
    await onAddToCart?.(product)
    setAdded(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className={`card pet-card ${featured ? 'pet-card-featured' : ''}`}>
      <Link to={`/products/${product.id}`} className="pet-card-image-link">
        <ProductImage src={product.imageUrl} category={product.category} alt={product.name} />
        {hoverImg && <img className="pet-card-img2" src={hoverImg} alt="" loading="lazy" aria-hidden="true" />}
        <span className="pet-card-lot">{lot(product.id)}</span>
        {featured && <span className="badge pet-card-badge pet-card-feature-badge">Specimen of note</span>}
        {!product.inStock && !product.activeAuctionId && <span className="badge badge-muted pet-card-badge">Sold out</span>}
        {product.activeAuctionId && <span className="badge badge-live pet-card-badge">Live auction</span>}
      </Link>
      <WishlistButton productId={product.id} productName={product.name} />

      <div className="pet-card-body">
        <p className="pet-card-meta">
          {product.category}
          {product.subcategory ? ` · ${product.subcategory}` : ''}
        </p>
        <div className="pet-card-heading">
          <h3>
            <Link to={`/products/${product.id}`}>{product.name}</Link>
          </h3>
          <span className="pet-card-price">{money(product.price)}</span>
        </div>

        {featured && product.description && <p className="pet-card-description">{product.description}</p>}

        {!product.isAuctionOnly && !product.activeAuctionId && stock > 0 && stock <= lowAt && (
          <p className="pet-card-stock stock-low">Only {stock} left</p>
        )}

        {product.activeAuctionId ? (
          <Link to={`/auctions/${product.activeAuctionId}`} className="btn btn-secondary btn-block">
            View auction
          </Link>
        ) : product.isAuctionOnly ? (
          <button className="btn btn-secondary btn-block" disabled>
            Auction only
          </button>
        ) : (
          <button
            className={`btn btn-primary btn-block ${added ? 'is-added' : ''}`}
            disabled={!canBuy || addDisabled}
            onClick={handleAdd}
          >
            {stock <= 0 ? 'Sold out' : added ? 'Added ✓' : 'Add to cart'}
          </button>
        )}
      </div>
    </div>
  )
}
