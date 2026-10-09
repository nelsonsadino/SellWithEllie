import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRaffles } from '../api/raffles'
import { useCurrency } from '../context/TenantContext'

const lot = (id) => `RAFFLE ${String(id).padStart(3, '0')}`

// Companion to AuctionTicker, same persistent-strip presentation. Raffles
// have no end-time/countdown (they close on seat sell-out or an admin
// action, not a clock), so this shows seats-remaining + price instead of a
// countdown.
export default function RaffleTicker({ inline = false }) {
  const money = useCurrency()
  const [open, setOpen] = useState([])

  useEffect(() => {
    let ignore = false
    getRaffles('Open')
      .then((data) => {
        if (!ignore) setOpen(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  const isLive = open.length > 0

  // Repeat the (possibly short) live list so the strip fills the width, then
  // double it for a seamless -50% scroll loop.
  let base = open
  while (base.length > 0 && base.length < 8) base = [...base, ...open]
  const items = isLive ? [...base, ...base] : []

  return (
    <div className={`ticker ${inline ? 'ticker-inline' : ''}`} aria-label="Live raffle ticker">
      <div className="ticker-inner">
        <span className={`ticker-flag ${isLive ? '' : 'is-idle'}`}>{isLive ? 'Live' : 'Raffles'}</span>
        {isLive ? (
          <div className="ticker-viewport">
            <div className="ticker-track">
              {items.map((r, i) => {
                const topPrize = r.prizes?.[0]?.description ?? r.title
                const morePrizes = r.prizes?.length > 1 ? ` +${r.prizes.length - 1} more` : ''
                return (
                  <Link key={`${r.id}-${i}`} to={`/raffles/${r.id}`} className="ticker-item">
                    <span className="ticker-lot">{lot(r.id)}</span>
                    <span className="ticker-name">
                      {topPrize}
                      {morePrizes}
                    </span>
                    <span className="ticker-price">{money(r.seatPrice)}/seat</span>
                    <span className="ticker-clock">
                      {r.availableSeatCount}/{r.seatCount} left
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ) : (
          <span className="ticker-idle-text">NO OPEN RAFFLES — CHECK BACK SOON</span>
        )}
      </div>
    </div>
  )
}
