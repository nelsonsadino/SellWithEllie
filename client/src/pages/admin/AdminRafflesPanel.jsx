import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  cancelRaffle,
  createRaffle,
  forceCloseRaffle,
  getRaffle,
  getRaffles,
  markSeatPaid,
  releaseSeat,
  reopenRaffle,
} from '../../api/raffles'
import Modal from '../../components/Modal'
import RaffleSeatIcon from '../../components/RaffleSeatIcon'
import Spinner from '../../components/Spinner'
import { useConfirm } from '../../context/ConfirmContext'
import { useToast } from '../../context/ToastContext'
import { useCurrency } from '../../context/TenantContext'

const DRAW_MODES = [
  { value: 'Instant', label: 'Instant reveal' },
  { value: 'Wheel', label: 'Spin the wheel' },
  { value: 'DuckRace', label: 'Duck race' },
  { value: 'LastManStanding', label: 'Last man standing' },
]

function ordinal(n) {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

const emptyForm = () => ({
  title: '',
  prizes: [{ description: '' }],
  imageUrl: '',
  seatCount: 10,
  seatPrice: 50,
  drawMode: 'Instant',
  scheduledDrawAtUtc: '',
})

export default function AdminRafflesPanel() {
  const money = useCurrency()
  const [raffles, setRaffles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const { showToast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const [form, setForm] = useState(emptyForm())

  const load = () => {
    setLoading(true)
    getRaffles()
      .then(setRaffles)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const loadDetail = (id) => {
    setDetailLoading(true)
    getRaffle(id)
      .then(setDetail)
      .finally(() => setDetailLoading(false))
  }

  const toggleExpand = (raffle) => {
    if (expandedId === raffle.id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(raffle.id)
    loadDetail(raffle.id)
  }

  const refreshExpanded = () => {
    load()
    if (expandedId) loadDetail(expandedId)
  }

  const updatePrize = (index, description) => {
    setForm((prev) => ({
      ...prev,
      prizes: prev.prizes.map((p, i) => (i === index ? { ...p, description } : p)),
    }))
  }

  const addPrize = () => {
    setForm((prev) => ({ ...prev, prizes: [...prev.prizes, { description: '' }] }))
  }

  const removePrize = (index) => {
    setForm((prev) => ({ ...prev, prizes: prev.prizes.filter((_, i) => i !== index) }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nonEmptyPrizes = form.prizes.filter((p) => p.description.trim())
    if (!form.title.trim() || nonEmptyPrizes.length === 0) {
      showToast('Title and at least one prize are required.', 'error')
      return
    }
    if (Number(form.seatCount) < 2) {
      showToast('A raffle needs at least 2 seats.', 'error')
      return
    }
    setSaving(true)
    try {
      await createRaffle({
        title: form.title,
        imageUrl: form.imageUrl || null,
        seatCount: Number(form.seatCount),
        seatPrice: Number(form.seatPrice),
        prizes: nonEmptyPrizes.map((p) => ({ description: p.description.trim() })),
        drawMode: form.drawMode,
        scheduledDrawAtUtc: form.scheduledDrawAtUtc ? new Date(form.scheduledDrawAtUtc).toISOString() : null,
      })
      showToast('Raffle created.', 'success')
      setForm(emptyForm())
      setShowForm(false)
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkPaid = async (raffleId, seat) => {
    try {
      await markSeatPaid(raffleId, seat.id)
      showToast(`Seat #${seat.seatNumber} marked paid.`, 'success')
      refreshExpanded()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleRelease = async (raffleId, seat) => {
    const ok = await confirm({
      title: 'Release this seat?',
      body: `Seat #${seat.seatNumber} - and every other seat reserved together with it in the same order - will be released back to Available.`,
      confirmLabel: 'Release seat',
      cancelLabel: 'Keep it',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await releaseSeat(raffleId, seat.id)
      showToast(`Seat #${seat.seatNumber} released.`, 'success')
      refreshExpanded()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleReopen = async (raffle) => {
    const ok = await confirm({
      title: 'Reopen this raffle?',
      body: `"${raffle.title}" will go back to Open - any seat forfeited by a force-close comes back to Available so it can accept reservations and payments again.`,
      confirmLabel: 'Reopen',
      cancelLabel: 'Keep it as-is',
      tone: 'primary',
    })
    if (!ok) return
    try {
      await reopenRaffle(raffle.id)
      showToast('Raffle reopened.', 'success')
      refreshExpanded()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleForceClose = async (raffle) => {
    const ok = await confirm({
      title: 'Force-close this raffle?',
      body: `Any unpaid seats in "${raffle.title}" will be forfeited and their reservations cancelled. This raffle will move to Ready to draw. This cannot be undone.`,
      confirmLabel: 'Force-close',
      cancelLabel: 'Keep it open',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await forceCloseRaffle(raffle.id)
      showToast('Raffle force-closed.', 'success')
      refreshExpanded()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  // Deliberately just navigates - it does NOT call drawRaffleWinner itself.
  // The staged reveal starts broadcasting within milliseconds of the draw
  // API call, and this tab's SignalR connection wouldn't be joined yet if
  // the draw fired before navigating: the admin would land on the already-
  // finished result having missed their own animation. The real "Start the
  // draw" button lives on RaffleDetailPage, gated on that connection being
  // live first.
  const handleGoDraw = (raffle) => {
    navigate(`/raffles/${raffle.id}`)
  }

  const handleCancel = async (raffle) => {
    const ok = await confirm({
      title: 'Cancel this raffle?',
      body: `"${raffle.title}" will be cancelled. This is only allowed while no seats have been paid.`,
      confirmLabel: 'Cancel raffle',
      cancelLabel: 'Keep it',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await cancelRaffle(raffle.id)
      showToast('Raffle cancelled.', 'success')
      refreshExpanded()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="admin-panel-header">
        <h2>Raffles</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New raffle
        </button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Set up a new raffle" size="lg">
        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="form-group">
              <label htmlFor="r-title">Title</label>
              <input
                id="r-title"
                className="input"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="r-image">Image URL (optional)</label>
              <input
                id="r-image"
                className="input"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="r-seats">Number of seats</label>
              <input
                id="r-seats"
                type="number"
                min="2"
                step="1"
                className="input"
                value={form.seatCount}
                onChange={(e) => setForm({ ...form, seatCount: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="r-price">Price per seat ($)</label>
              <input
                id="r-price"
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={form.seatPrice}
                onChange={(e) => setForm({ ...form, seatPrice: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="r-draw-mode">Draw type</label>
              <select
                id="r-draw-mode"
                className="input"
                value={form.drawMode}
                onChange={(e) => setForm({ ...form, drawMode: e.target.value })}
              >
                {DRAW_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="r-scheduled">Scheduled draw time (optional)</label>
              <input
                id="r-scheduled"
                type="datetime-local"
                className="input"
                value={form.scheduledDrawAtUtc}
                onChange={(e) => setForm({ ...form, scheduledDrawAtUtc: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Prizes</label>
            {form.prizes.map((p, i) => (
              <div key={i} className="table-actions" style={{ marginBottom: '0.5rem' }}>
                <input
                  className="input"
                  required
                  placeholder={`Prize #${i + 1} (${ordinal(i + 1)})`}
                  value={p.description}
                  onChange={(e) => updatePrize(i, e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => removePrize(i)}
                  disabled={form.prizes.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-small" onClick={addPrize}>
              + Add prize
            </button>
          </div>

          <div className="admin-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create raffle'}
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
                <th>Title</th>
                <th>Status</th>
                <th>Seats (paid/reserved/available)</th>
                <th>Prize</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {raffles.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td>{r.title}</td>
                    <td>
                      <span className={`badge raffle-status-${r.status.toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td className="num">
                      {r.paidSeatCount}/{r.reservedSeatCount}/{r.availableSeatCount} of {r.seatCount}
                    </td>
                    <td>
                      {r.prizes?.[0]?.description}
                      {r.prizes?.length > 1 ? ` +${r.prizes.length - 1} more` : ''}
                    </td>
                    <td className="num">{money(r.seatPrice)}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-small" onClick={() => toggleExpand(r)}>
                          {expandedId === r.id ? 'Hide seats' : 'Manage seats'}
                        </button>
                        {r.status === 'Open' && (
                          <button className="btn btn-danger btn-small" onClick={() => handleForceClose(r)}>
                            Force-close
                          </button>
                        )}
                        {r.status === 'ReadyToDraw' && (
                          <>
                            <button className="btn btn-primary btn-small" onClick={() => handleGoDraw(r)}>
                              Go draw winner
                            </button>
                            <button className="btn btn-secondary btn-small" onClick={() => handleReopen(r)}>
                              Reopen
                            </button>
                          </>
                        )}
                        {(r.status === 'Open' || r.status === 'ReadyToDraw') && r.paidSeatCount === 0 && (
                          <button className="btn btn-danger btn-small" onClick={() => handleCancel(r)}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={6}>
                        {detailLoading || !detail ? (
                          <Spinner />
                        ) : (
                          <div className="raffle-seat-grid-admin">
                            {detail.seats.map((seat) => (
                              <div key={seat.id} className={`raffle-seat-admin raffle-seat-admin-${seat.status.toLowerCase()}`}>
                                <RaffleSeatIcon className="raffle-seat-icon" />
                                <span>#{seat.seatNumber}</span>
                                <span className="hint">{seat.status}</span>
                                {seat.reservedByDisplayName && <span className="raffle-seat-reserver">{seat.reservedByDisplayName}</span>}
                                {seat.status === 'Reserved' && (
                                  <div className="raffle-seat-admin-actions">
                                    <button className="btn btn-primary btn-small" onClick={() => handleMarkPaid(r.id, seat)}>
                                      Mark paid
                                    </button>
                                    <button className="btn btn-secondary btn-small" onClick={() => handleRelease(r.id, seat)}>
                                      Release
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
