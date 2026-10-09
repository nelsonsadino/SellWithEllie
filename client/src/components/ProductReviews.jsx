import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteReview, getReviews, postReview } from '../api/shop'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Stars, StarPicker } from './StarRating'

export function RatingSummaryLine({ data }) {
  if (!data || data.count === 0) return <span className="pet-card-meta">No reviews yet</span>
  return (
    <a className="rating-line" href="#reviews">
      <Stars value={data.average} />
      <span>
        {data.average.toFixed(1)} ({data.count} review{data.count === 1 ? '' : 's'})
      </span>
    </a>
  )
}

export default function ProductReviews({ productId, onLoaded }) {
  const { isAuthenticated, isAdmin } = useAuth()
  const { showToast } = useToast()
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ rating: 0, title: '', body: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    return getReviews(productId).then((d) => {
      setData(d)
      onLoaded?.(d)
    })
  }, [productId, onLoaded])

  useEffect(() => {
    load().catch(() => setData({ count: 0, average: 0, breakdown: [], reviews: [] }))
  }, [load])

  const submit = async (e) => {
    e.preventDefault()
    if (form.rating < 1) {
      showToast('Pick a star rating first.', 'error')
      return
    }
    setSaving(true)
    try {
      await postReview(productId, form)
      setForm({ rating: 0, title: '', body: '' })
      showToast('Thanks for your review!', 'success')
      await load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    try {
      await deleteReview(productId, id)
      await load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  if (!data) return null
  const max = Math.max(1, ...data.breakdown.map((b) => b.count))

  return (
    <section id="reviews" className="container section-block reviews">
      <h2>Customer reviews</h2>
      <div className="reviews-layout">
        <div className="reviews-summary card">
          <div className="reviews-score">{data.count ? data.average.toFixed(1) : '–'}</div>
          <Stars value={data.average} size={20} />
          <p className="pet-card-meta">{data.count} review{data.count === 1 ? '' : 's'}</p>
          <ul className="reviews-bars">
            {data.breakdown.map((b) => (
              <li key={b.stars}>
                <span>{b.stars}★</span>
                <span className="reviews-bar">
                  <span style={{ width: `${(b.count / max) * 100}%` }} />
                </span>
                <span>{b.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="reviews-main">
          {isAuthenticated ? (
            data.mine ? (
              <p className="hint">You've reviewed this product. Thank you!</p>
            ) : (
              <form className="card review-form" onSubmit={submit}>
                <h3>Write a review</h3>
                <StarPicker value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
                <div className="form-group">
                  <label htmlFor="rv-title">Headline (optional)</label>
                  <input id="rv-title" className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="rv-body">Your review</label>
                  <textarea id="rv-body" className="input" rows={3} required minLength={3} maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                </div>
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? 'Posting…' : 'Post review'}
                </button>
              </form>
            )
          ) : (
            <p className="hint">
              <Link to="/login">Sign in</Link> to leave a review.
            </p>
          )}

          {data.reviews.length === 0 ? (
            <p className="empty-state">Be the first to review this product.</p>
          ) : (
            <ul className="review-list">
              {data.reviews.map((r) => (
                <li key={r.id} className="review">
                  <div className="review-head">
                    <Stars value={r.rating} />
                    {r.title && <strong>{r.title}</strong>}
                  </div>
                  <p>{r.body}</p>
                  <p className="pet-card-meta">
                    {r.author} · {new Date(r.createdAtUtc).toLocaleDateString()}
                    {r.isVerifiedPurchase && <span className="badge badge-verified">Verified purchase</span>}
                    {(isAdmin || data.mine === r.id) && (
                      <button type="button" className="link-button" onClick={() => remove(r.id)}>
                        Delete
                      </button>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
