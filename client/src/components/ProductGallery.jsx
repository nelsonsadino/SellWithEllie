import { useState } from 'react'
import ProductImage from './ProductImage'

// Shows a product's uploaded photos/videos (product.media) as a
// main-viewer-plus-thumbnails gallery. Falls back to the single cover image
// (or the category placeholder) for products that predate the media-upload
// feature or simply don't have any gallery items.
export default function ProductGallery({ media, imageUrl, category, alt }) {
  const items = media && media.length > 0 ? media : imageUrl ? [{ id: 'cover', url: imageUrl, mediaType: 'Image' }] : []
  const [activeIndex, setActiveIndex] = useState(0)
  const active = items[activeIndex]

  if (!active) {
    return <ProductImage src={null} category={category} alt={alt} />
  }

  return (
    <div className="product-gallery">
      {active.mediaType === 'Video' ? (
        <video src={active.url} controls className="pet-image" />
      ) : (
        <ProductImage src={active.url} alt={alt} />
      )}

      {items.length > 1 && (
        <div className="product-gallery-thumbs">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`product-gallery-thumb ${index === activeIndex ? 'is-active' : ''}`}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show ${item.mediaType === 'Video' ? 'video' : 'photo'} ${index + 1}`}
            >
              {item.mediaType === 'Video' ? <video src={item.url} muted /> : <img src={item.url} alt="" loading="lazy" />}
              {item.mediaType === 'Video' && <span className="product-gallery-thumb-badge">▶</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
