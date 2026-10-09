import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRaffles } from '../api/raffles'
import CountdownTimer from './CountdownTimer'
import ProductImage from './ProductImage'
import RaffleChat from './RaffleChat'
import { useCurrency } from '../context/TenantContext'

const raffleTag = (id) => `RAFFLE ${String(id).padStart(3, '0')}`

// The raffle equivalent of LiveAuctionSpotlight: the one other deliberately
// loud moment on the front page. Brass, not crimson - a raffle is exciting
// but it isn't the same last-bid urgency an auction is, and crimson stays
// reserved for that (see .spotlight-raffle in theme.css). Renders nothing
// when no raffle is open, same "spotlight, not a fixture" rule.
export default function RaffleSpotlight() {
  const money = useCurrency()
  const [raffle, setRaffle] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    getRaffles('Open')
      .then((rows) => {
        if (ignore) return
        const list = Array.isArray(rows) ? rows : []
        // The one most worth interrupting a browse for: whichever raffle
        // has the fewest seats left is closest to selling out - genuine
        // scarcity, not an arbitrary pick.
        const sorted = [...list].sort((a, b) => a.availableSeatCount - b.availableSeatCount)
        setRaffle(sorted[0] || null)
      })
      .catch(() => setRaffle(null))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [])

  if (loading || !raffle) return null

  const topPrize = raffle.prizes?.[0]
  const morePrizes = (raffle.prizes?.length || 0) - 1

  return (
    <section className="container section-block">
      <div className="spotlight spotlight-raffle">
        <div className="spotlight-main">
          <Link to={`/raffles/${raffle.id}`} className="spotlight-image-link">
            <ProductImage src={raffle.imageUrl} alt={raffle.title} />
            <span className="spotlight-lot">{raffleTag(raffle.id)}</span>
          </Link>

          <div className="spotlight-body">
            <span className="spotlight-live-flag">
              <span className="live-dot" aria-hidden="true" />
              Seats going fast
            </span>
            <h2 className="spotlight-title">
              <Link to={`/raffles/${raffle.id}`}>{raffle.title}</Link>
            </h2>
            <p className="spotlight-sub">
              Win <strong>{topPrize?.description}</strong>
              {morePrizes > 0 ? ` — plus ${morePrizes} more prize${morePrizes === 1 ? '' : 's'}` : ''}. Reserve now, pay
              whenever you're ready.
            </p>

            <div className="spotlight-stats">
              <div className="spotlight-stat">
                <span className="spotlight-stat-key">Seats left</span>
                <span className="spotlight-stat-val spotlight-stat-price">
                  {raffle.availableSeatCount}/{raffle.seatCount}
                </span>
              </div>
              <div className="spotlight-stat">
                <span className="spotlight-stat-key">{raffle.scheduledDrawAtUtc ? 'Drawing in' : 'Per seat'}</span>
                <span className="spotlight-stat-val">
                  {raffle.scheduledDrawAtUtc ? <CountdownTimer target={raffle.scheduledDrawAtUtc} /> : money(raffle.seatPrice)}
                </span>
              </div>
            </div>

            <div className="spotlight-actions">
              <Link to={`/raffles/${raffle.id}`} className="btn btn-primary btn-live">
                Pick your seats
              </Link>
              <Link to="/raffles" className="btn btn-secondary">
                View all raffles
              </Link>
            </div>
          </div>
        </div>

        <div className="spotlight-chat">
          <RaffleChat raffleId={raffle.id} />
        </div>
      </div>
    </section>
  )
}
