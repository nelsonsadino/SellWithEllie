import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getProductCategories, getProducts } from '../api/products'
import ProductCard from '../components/ProductCard'
import Pagination from '../components/Pagination'
import Spinner from '../components/Spinner'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState({ items: [], totalPages: 0, totalCount: 0, page: 1 })
  const [categoryOptions, setCategoryOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const { addItem } = useCart()
  const { showToast } = useToast()

  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const sort = searchParams.get('sort') || 'newest'
  const page = parseInt(searchParams.get('page') || '1', 10)

  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    getProductCategories()
      .then(setCategoryOptions)
      .catch(() => {})
  }, [])

  const updateParam = (key, value, resetPage = true) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (resetPage) next.delete('page')
    setSearchParams(next)
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== search) updateParam('search', searchInput)
    }, 400)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    getProducts({ search, category, sort, page, pageSize: 8 })
      .then((data) => {
        if (!ignore) setResult(data)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [search, category, sort, page])

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
        <h1>Shop</h1>
        <p>
          {result.totalCount} product{result.totalCount === 1 ? '' : 's'} available
        </p>
      </div>

      <div className="filters-bar">
        <input
          type="search"
          placeholder="Search by name..."
          className="input"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select className="input" value={category} onChange={(e) => updateParam('category', e.target.value)}>
          <option value="">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="input" value={sort} onChange={(e) => updateParam('sort', e.target.value, false)}>
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="name">Name</option>
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : result.items.length === 0 ? (
        <p className="empty-state">No products match your search.</p>
      ) : (
        <>
          <div className="grid grid-cards">
            {result.items.map((product) => (
              <ProductCard key={product.id} product={product} onAddToCart={handleAddToCart} />
            ))}
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} onPageChange={(p) => updateParam('page', p, false)} />
        </>
      )}
    </div>
  )
}
