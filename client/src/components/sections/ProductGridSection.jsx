import { useEffect, useState } from 'react'
import { getProducts } from '../../api/products'
import { useCart } from '../../context/CartContext'
import { useContent } from '../../context/TenantContext'
import { useToast } from '../../context/ToastContext'
import ProductCard from '../ProductCard'
import SectionHead from '../SectionHead'
import Spinner from '../Spinner'

// Live block: real products from this shop, with add-to-cart handled here.
export default function ProductGridSection({ data = {}, index }) {
  const { heading, limit = 4, sort = 'newest' } = data
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const { addItem } = useCart()
  const { showToast } = useToast()
  const t = useContent()

  useEffect(() => {
    let ignore = false
    setLoading(true)
    getProducts({ pageSize: Math.max(1, Math.min(Number(limit) || 4, 24)), sort })
      .then((res) => {
        if (!ignore) setProducts(res.items || [])
      })
      .catch(() => {
        if (!ignore) setProducts([])
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [limit, sort])

  const handleAddToCart = async (product) => {
    try {
      await addItem(product.id)
      showToast(`${product.name} added to your cart.`, 'success')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  return (
    <section className="container section-block">
      <SectionHead
        index={index}
        title={heading || t('home.products.heading', 'New lots')}
        link={{ to: '/products', label: t('home.products.seeAll', 'View all') }}
      />
      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cards">
          {products.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
              featured={i === 0 && products.length > 2}
            />
          ))}
        </div>
      )}
    </section>
  )
}
