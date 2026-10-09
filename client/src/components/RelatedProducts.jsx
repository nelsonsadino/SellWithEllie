import { useEffect, useState } from 'react'
import { getRelated } from '../api/shop'
import ProductCard from './ProductCard'
import SectionHead from './SectionHead'

export default function RelatedProducts({ productId, onAddToCart }) {
  const [products, setProducts] = useState([])

  useEffect(() => {
    let ignore = false
    getRelated(productId)
      .then((rows) => {
        if (!ignore) setProducts(rows)
      })
      .catch(() => {
        if (!ignore) setProducts([])
      })
    return () => {
      ignore = true
    }
  }, [productId])

  if (products.length === 0) return null

  return (
    <section className="container section-block">
      <SectionHead title="You might also like" />
      <div className="grid grid-cards grid-cards-sm">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} onAddToCart={onAddToCart} />
        ))}
      </div>
    </section>
  )
}
