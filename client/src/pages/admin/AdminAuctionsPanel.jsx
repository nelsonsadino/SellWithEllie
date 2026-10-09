import { useEffect, useState } from 'react'
import { cancelAuction, createAuction, getAuctions } from '../../api/auctions'
import { getProducts } from '../../api/products'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import { useConfirm } from '../../context/ConfirmContext'
import { useToast } from '../../context/ToastContext'
import { useCurrency } from '../../context/TenantContext'

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function AdminAuctionsPanel() {
  const money = useCurrency()
  const [auctions, setAuctions] = useState([])
  const [availableProducts, setAvailableProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()
  const confirm = useConfirm()

  const inHourLocal = toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000))
  const inDayLocal = toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000))

  const [form, setForm] = useState({
    productId: '',
    startingPrice: 50,
    minIncrement: 5,
    buyoutPrice: '',
    startTimeUtc: inHourLocal,
    endTimeUtc: inDayLocal,
  })

  const load = () => {
    setLoading(true)
    Promise.all([getAuctions(), getProducts({ pageSize: 100 })])
      .then(([auctionData, productData]) => {
        setAuctions(auctionData)
        setAvailableProducts(productData.items.filter((p) => !p.activeAuctionId))
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.productId) {
      showToast('Choose a product first.', 'error')
      return
    }
    const buyoutPrice = form.buyoutPrice === '' ? null : Number(form.buyoutPrice)
    if (buyoutPrice !== null && buyoutPrice <= Number(form.startingPrice)) {
      showToast('Buyout price must be higher than the starting price.', 'error')
      return
    }
    setSaving(true)
    try {
      await createAuction({
        productId: Number(form.productId),
        startingPrice: Number(form.startingPrice),
        minIncrement: Number(form.minIncrement),
        buyoutPrice,
        startTimeUtc: new Date(form.startTimeUtc).toISOString(),
        endTimeUtc: new Date(form.endTimeUtc).toISOString(),
      })
      showToast('Auction created.', 'success')
      setForm((f) => ({ ...f, productId: '', buyoutPrice: '' }))
      setShowForm(false)
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (auction) => {
    const ok = await confirm({
      title: `Cancel this auction?`,
      body: `The auction for ${auction.productName} will be cancelled and any bids voided.`,
      confirmLabel: 'Cancel auction',
      cancelLabel: 'Keep it',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await cancelAuction(auction.id)
      showToast('Auction cancelled.', 'success')
      load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="admin-panel-header">
        <h2>Auctions</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New auction
        </button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Set up a new auction" size="lg">
        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="form-group">
              <label htmlFor="a-product">Product</label>
              <select
                id="a-product"
                className="input"
                required
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
              >
                <option value="">Select a product...</option>
                {availableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="a-start-price">Starting price ($)</label>
              <input
                id="a-start-price"
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={form.startingPrice}
                onChange={(e) => setForm({ ...form, startingPrice: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="a-increment">Minimum increment ($)</label>
              <input
                id="a-increment"
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={form.minIncrement}
                onChange={(e) => setForm({ ...form, minIncrement: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="a-buyout">Buyout price ($, optional)</label>
              <input
                id="a-buyout"
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                placeholder="No buyout"
                value={form.buyoutPrice}
                onChange={(e) => setForm({ ...form, buyoutPrice: e.target.value })}
              />
              <p className="hint">Lets a bidder skip the auction and win instantly at this price.</p>
            </div>
            <div className="form-group">
              <label htmlFor="a-start">Start time</label>
              <input
                id="a-start"
                type="datetime-local"
                className="input"
                value={form.startTimeUtc}
                onChange={(e) => setForm({ ...form, startTimeUtc: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="a-end">End time</label>
              <input
                id="a-end"
                type="datetime-local"
                className="input"
                value={form.endTimeUtc}
                onChange={(e) => setForm({ ...form, endTimeUtc: e.target.value })}
              />
            </div>
          </div>
          <div className="admin-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create auction'}
            </button>
          </div>
        </form>
      </Modal>

      {loading ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Current bid</th>
                <th>Buyout</th>
                <th>Ends</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {auctions.map((a) => (
                <tr key={a.id}>
                  <td>{a.productName}</td>
                  <td>
                    <span className={`badge auction-status-${a.status.toLowerCase()}`}>{a.status}</span>
                  </td>
                  <td className="num">{money(a.currentHighestAmount ?? a.startingPrice)}</td>
                  <td className="num">{a.buyoutPrice ? money(a.buyoutPrice) : '—'}</td>
                  <td>{new Date(a.endTimeUtc).toLocaleString()}</td>
                  <td>
                    {(a.status === 'Active' || a.status === 'Scheduled') && (
                      <button className="btn btn-danger btn-small" onClick={() => handleCancel(a)}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
