import { useEffect, useState } from 'react'
import { getProduct } from '../api/products'
import { getRecentlyViewed } from '../lib/recentlyViewed'
import ProductCard from './ProductCard'
import SectionHead from './SectionHead'

export default function RecentlyViewed({ currentId, onAddToCart, limit = 6 }) {
  const [products, setProducts] = useState([])

  useEffect(() => {
    let ignore = false
    const ids = getRecentlyViewed(currentId).slice(0, limit)
    if (ids.length === 0) {
      setProducts([])
      return undefined
    }
    Promise.all(ids.map((id) => getProduct(id).catch(() => null))).then((rows) => {
      if (!ignore) setProducts(rows.filter(Boolean))
    })
    return () => {
      ignore = true
    }
  }, [currentId, limit])

  if (products.length === 0) return null

  return (
    <section className="container section-block">
      <SectionHead title="Recently viewed" />
      <div className="grid grid-cards grid-cards-sm">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} onAddToCart={onAddToCart} />
        ))}
      </div>
    </section>
  )
}
