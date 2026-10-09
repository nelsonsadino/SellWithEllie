import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adjustStock,
  createProduct,
  deleteProduct,
  getInventory,
  getProductCategories,
  updateProduct,
} from '../../api/products'
import { updateInventorySettings } from '../../api/tenant'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import ProductMediaManager from '../../components/ProductMediaManager'
import Spinner from '../../components/Spinner'
import { useConfirm } from '../../context/ConfirmContext'
import { useCurrency, useTenant } from '../../context/TenantContext'
import { useToast } from '../../context/ToastContext'

const EMPTY_FORM = {
  name: '',
  category: '',
  subcategory: '',
  price: 0,
  description: '',
  imageUrl: '',
  stockQuantity: 1,
  inStock: true,
  isAuctionOnly: false,
}

const PAGE_SIZE = 25
const STOCK_FILTERS = [
  { value: '', label: 'All stock' },
  { value: 'in', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'auction', label: 'Auction only' },
]
const SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'stock_asc', label: 'Stock: low → high' },
  { value: 'stock_desc', label: 'Stock: high → low' },
  { value: 'price_asc', label: 'Price: low → high' },
  { value: 'price_desc', label: 'Price: high → low' },
  { value: 'newest', label: 'Newest' },
]

function StatusBadge({ product, lowAt }) {
  if (product.activeAuctionId) return <span className="badge auction-status-active">In auction</span>
  if (product.isAuctionOnly) return <span className="badge badge-muted">Auction only</span>
  if (product.stockQuantity <= 0) return <span className="badge badge-danger">Out of stock</span>
  if (product.stockQuantity <= lowAt) return <span className="badge auction-status-scheduled">Low stock</span>
  return <span className="badge badge-success">In stock</span>
}

// Inline stock editor: ± steppers plus a directly-editable number.
function StockCell({ product, onChange }) {
  const [value, setValue] = useState(String(product.stockQuantity))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setValue(String(product.stockQuantity))
  }, [product.stockQuantity])

  if (product.isAuctionOnly) return <span className="num" style={{ color: 'var(--color-text-muted)' }}>—</span>

  const send = async (body) => {
    setBusy(true)
    try {
      const updated = await adjustStock(product.id, body)
      onChange(updated)
    } catch (err) {
      setValue(String(product.stockQuantity))
      onChange(null, err.message)
    } finally {
      setBusy(false)
    }
  }

  const commit = () => {
    const n = Math.max(0, Math.trunc(Number(value) || 0))
    if (n !== product.stockQuantity) send({ setTo: n })
    else setValue(String(product.stockQuantity))
  }

  return (
    <div className="qty-stepper" aria-label={`Stock for ${product.name}`}>
      <button
        type="button"
        aria-label="Decrease stock"
        disabled={busy || product.stockQuantity <= 0}
        onClick={() => send({ adjustBy: -1 })}
      >
        −
      </button>
      <input
        type="number"
        min="0"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onBlur={commit}
      />
      <button type="button" aria-label="Increase stock" disabled={busy} onClick={() => send({ adjustBy: 1 })}>
        +
      </button>
    </div>
  )
}

export default function AdminProductsPanel() {
  const money = useCurrency()
  const { tenant, refresh } = useTenant()
  const { showToast } = useToast()
  const confirm = useConfirm()

  const [data, setData] = useState({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE, summary: null })
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])

  // filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [stockStatus, setStockStatus] = useState('')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)

  const [lowAtInput, setLowAtInput] = useState(String(tenant?.lowStockThreshold ?? 5))
  const [savingLowAt, setSavingLowAt] = useState(false)
  const [exporting, setExporting] = useState(false)

  // edit modal
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingMedia, setEditingMedia] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const lowAt = data.summary?.lowStockThreshold ?? tenant?.lowStockThreshold ?? 5

  // debounce the search box
  const searchTimer = useRef(null)
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [searchInput])

  const query = useMemo(
    () => ({ search, category, stockStatus, sort, page, pageSize: PAGE_SIZE }),
    [search, category, stockStatus, sort, page]
  )

  const load = useCallback(() => {
    setLoading(true)
    getInventory(query)
      .then(setData)
      .catch((err) => showToast(err.message || 'Could not load inventory.', 'error'))
      .finally(() => setLoading(false))
  }, [query, showToast])

  useEffect(load, [load])
  useEffect(() => {
    getProductCategories().then(setCategories).catch(() => {})
  }, [])

  const patchRow = (updated, errMessage) => {
    if (errMessage) {
      showToast(errMessage, 'error')
      return
    }
    setData((d) => ({
      ...d,
      items: d.items.map((p) => (p.id === updated.id ? updated : p)),
    }))
    // KPIs may have shifted (low/out counts, value) — refresh them quietly.
    getInventory(query).then((fresh) => setData((d) => ({ ...d, summary: fresh.summary }))).catch(() => {})
  }

  const saveLowAt = async (e) => {
    e.preventDefault()
    const n = Math.max(0, Math.trunc(Number(lowAtInput) || 0))
    setSavingLowAt(true)
    try {
      await updateInventorySettings(n)
      showToast(`Low-stock alert set to ${n} or fewer.`, 'success')
      await refresh()
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSavingLowAt(false)
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const all = await getInventory({ ...query, page: 1, pageSize: 1000 })
      const rows = [
        ['Name', 'Category', 'Subcategory', 'Price', 'Stock', 'Status', 'Auction only'],
        ...all.items.map((p) => [
          p.name,
          p.category,
          p.subcategory || '',
          p.price,
          p.isAuctionOnly ? '' : p.stockQuantity,
          p.activeAuctionId
            ? 'In auction'
            : p.isAuctionOnly
              ? 'Auction only'
              : p.stockQuantity <= 0
                ? 'Out of stock'
                : p.stockQuantity <= lowAt
                  ? 'Low stock'
                  : 'In stock',
          p.isAuctionOnly ? 'yes' : 'no',
        ]),
      ]
      const csv = rows
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\r\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      showToast(err.message || 'Export failed.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const startCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setEditingMedia([])
    setShowForm(true)
  }

  const startEdit = (product) => {
    setEditingId(product.id)
    setForm({
      name: product.name,
      category: product.category,
      subcategory: product.subcategory || '',
      price: product.price,
      description: product.description,
      imageUrl: product.imageUrl,
      stockQuantity: product.stockQuantity ?? 0,
      inStock: product.inStock,
      isAuctionOnly: product.isAuctionOnly,
    })
    setEditingMedia(product.media || [])
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        stockQuantity: Math.max(0, Math.trunc(Number(form.stockQuantity) || 0)),
      }
      if (editingId) {
        await updateProduct(editingId, payload)
        showToast('Product updated.', 'success')
        setShowForm(false)
        load()
      } else {
        const created = await createProduct(payload)
        setEditingId(created.id)
        setEditingMedia(created.media || [])
        showToast('Product created. Add photos or videos below, then Done.', 'success')
        load()
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (product) => {
    const ok = await confirm({
      title: `Delete ${product.name}?`,
      body: 'This permanently removes the product and its photos. It cannot be undone.',
      confirmLabel: 'Delete product',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteProduct(product.id)
      showToast('Product deleted.', 'success')
      load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const s = data.summary
  const totalPages = Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE))
  const filtersActive = search || category || stockStatus

  return (
    <div>
      <div className="admin-panel-header">
        <h2>Inventory</h2>
        <div className="table-actions">
          <button className="btn btn-secondary" onClick={exportCsv} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button className="btn btn-primary" onClick={startCreate}>
            + Add product
          </button>
        </div>
      </div>

      {/* KPIs */}
      {s && (
        <div className="inv-summary">
          <div className="inv-kpi">
            <span className="inv-kpi-value">{s.skuCount}</span>
            <span className="inv-kpi-label">Products</span>
          </div>
          <div className="inv-kpi">
            <span className="inv-kpi-value">{s.totalUnits}</span>
            <span className="inv-kpi-label">Units in stock</span>
          </div>
          <div className={`inv-kpi ${s.lowStockCount ? 'is-warn' : ''}`}>
            <span className="inv-kpi-value">{s.lowStockCount}</span>
            <span className="inv-kpi-label">Low stock</span>
          </div>
          <div className={`inv-kpi ${s.outOfStockCount ? 'is-danger' : ''}`}>
            <span className="inv-kpi-value">{s.outOfStockCount}</span>
            <span className="inv-kpi-label">Out of stock</span>
          </div>
          <div className="inv-kpi">
            <span className="inv-kpi-value">{money(s.inventoryValue)}</span>
            <span className="inv-kpi-label">Stock value</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="inv-toolbar">
        <input
          className="input"
          type="search"
          placeholder="Search name, category…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search inventory"
        />
        <select
          className="input"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setPage(1)
          }}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={stockStatus}
          onChange={(e) => {
            setStockStatus(e.target.value)
            setPage(1)
          }}
          aria-label="Filter by stock status"
        >
          {STOCK_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <form className="inv-lowat" onSubmit={saveLowAt}>
          <label htmlFor="inv-lowat">Low stock at ≤</label>
          <input
            id="inv-lowat"
            className="input"
            type="number"
            min="0"
            value={lowAtInput}
            onChange={(e) => setLowAtInput(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-secondary btn-small"
            disabled={savingLowAt || String(tenant?.lowStockThreshold ?? 5) === lowAtInput.trim()}
          >
            {savingLowAt ? '…' : 'Set'}
          </button>
        </form>
      </div>

      {loading ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <p className="empty-state">
          {filtersActive ? 'No products match these filters.' : 'No products yet. Add one to get started.'}
        </p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>
                      {product.category}
                      {product.subcategory ? <span className="pet-card-meta"> · {product.subcategory}</span> : ''}
                    </td>
                    <td className="num">{money(product.price)}</td>
                    <td>
                      <StockCell product={product} onChange={patchRow} />
                    </td>
                    <td>
                      <StatusBadge product={product} lowAt={lowAt} />
                    </td>
                    <td className="table-actions">
                      <button className="btn btn-secondary btn-small" onClick={() => startEdit(product)}>
                        Edit
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => handleDelete(product)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            {data.totalCount} product{data.totalCount === 1 ? '' : 's'}
            {filtersActive ? ' match' : ''}
          </p>
          {totalPages > 1 && <Pagination page={data.page} totalPages={totalPages} onPageChange={setPage} />}
        </>
      )}

      {/* Add / edit modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editingId ? 'Edit product' : 'New product'} size="lg">
        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="form-group">
              <label htmlFor="p-name">Name</label>
              <input id="p-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="p-category">Category</label>
              <input id="p-category" className="input" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="p-subcategory">Subcategory (optional)</label>
              <input id="p-subcategory" className="input" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="p-price">Price</label>
              <input
                id="p-price"
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p-image">Cover image URL</label>
              <input id="p-image" className="input" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
              <p className="hint">Shown in listings and cards. Leave blank to use the first uploaded photo.</p>
            </div>
            {!form.isAuctionOnly && (
              <div className="form-group">
                <label htmlFor="p-stock">Stock quantity</label>
                <input
                  id="p-stock"
                  type="number"
                  min="0"
                  step="1"
                  className="input"
                  value={form.stockQuantity}
                  onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                />
                <p className="hint">Units on hand. 0 shows the product as sold out. Decreases as customers buy.</p>
              </div>
            )}
          </div>

          {editingId ? (
            <ProductMediaManager productId={editingId} media={editingMedia} onChange={setEditingMedia} />
          ) : (
            <p className="hint">Save the product first to attach photos or videos to it.</p>
          )}

          <div className="form-group">
            <label htmlFor="p-description">Description</label>
            <textarea
              id="p-description"
              className="input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="admin-form-checkboxes">
            <label>
              <input
                type="checkbox"
                checked={form.isAuctionOnly}
                onChange={(e) => setForm({ ...form, isAuctionOnly: e.target.checked })}
              />
              Auction only — sold as a single lot via bidding (no quantity, hides "Add to cart")
            </label>
            {form.isAuctionOnly && (
              <label>
                <input type="checkbox" checked={form.inStock} onChange={(e) => setForm({ ...form, inStock: e.target.checked })} />
                Listed / available
              </label>
            )}
          </div>
          <div className="admin-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              {editingId ? 'Done' : 'Cancel'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create product'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
