import { useEffect, useState } from 'react'
import { isWishlisted, onWishlistChange, toggleWishlist } from '../lib/wishlist'

// Heart toggle for a product. localStorage-backed, no account needed.
export default function WishlistButton({ productId, productName }) {
  const [saved, setSaved] = useState(() => isWishlisted(productId))
  const [popping, setPopping] = useState(false)

  useEffect(() => onWishlistChange(() => setSaved(isWishlisted(productId))), [productId])

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const now = toggleWishlist(productId)
    setSaved(now)
    if (now) {
      setPopping(true)
      setTimeout(() => setPopping(false), 340)
    }
  }

  return (
    <button
      type="button"
      className={`wishlist-btn ${saved ? 'is-saved' : ''} ${popping ? 'just-saved' : ''}`}
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName || 'item'} from saved` : `Save ${productName || 'item'}`}
      title={saved ? 'Saved' : 'Save'}
    >
      {saved ? '♥' : '♡'}
    </button>
  )
}
