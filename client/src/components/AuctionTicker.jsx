import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuctions } from '../api/auctions'
import { useCurrency } from '../context/TenantContext'

const pad = (n) => String(n).padStart(2, '0')
const lot = (id) => `LOT ${String(id).padStart(3, '0')}`

function shortRemaining(endIso) {
  const ms = new Date(endIso) - Date.now()
  if (ms <= 0) return 'CLOSED'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const clock = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
  return d > 0 ? `${d}D ${clock}` : clock
}

// The signature element: a persistent exchange-style ticker under the nav.
// Shows live lots + prices + countdowns; when nothing is live it still holds
// its place with the market state (next scheduled auction, or "market open").
export default function AuctionTicker({ inline = false }) {
  const money = useCurrency()
  const [active, setActive] = useState([])
  const [scheduled, setScheduled] = useState([])
  const [, setTick] = useState(0)

  useEffect(() => {
    let ignore = false
    Promise.all([getAuctions('Active'), getAuctions('Scheduled')])
      .then(([a, s]) => {
        if (ignore) return
        setActive(Array.isArray(a) ? a : [])
        setScheduled(Array.isArray(s) ? s : [])
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const isLive = active.length > 0
  const nextScheduled = [...scheduled].sort((a, b) => new Date(a.startTimeUtc) - new Date(b.startTimeUtc))[0]

  // Repeat the (possibly short) live list so the strip fills the width, then
  // double it for a seamless -50% scroll loop.
  let base = active
  while (base.length > 0 && base.length < 8) base = [...base, ...active]
  const items = isLive ? [...base, ...base] : []

  return (
    <div className={`ticker ${inline ? 'ticker-inline' : ''}`} aria-label="Live auction ticker">
      <div className="ticker-inner">
        <span className={`ticker-flag ${isLive ? '' : 'is-idle'}`}>{isLive ? 'Live' : 'Market'}</span>
        {isLive ? (
          <div className="ticker-viewport">
            <div className="ticker-track">
              {items.map((a, i) => (
                <Link key={`${a.id}-${i}`} to={`/auctions/${a.id}`} className="ticker-item">
                  <span className="ticker-lot">{lot(a.id)}</span>
                  <span className="ticker-name">{a.productName}</span>
                  <span className="ticker-price">
                    {money(a.currentHighestAmount ?? a.startingPrice)}
                  </span>
                  <span className="ticker-clock">{shortRemaining(a.endTimeUtc)}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <span className="ticker-idle-text">
            {nextScheduled
              ? `NEXT LOT OPENS IN ${shortRemaining(nextScheduled.startTimeUtc)} — ${nextScheduled.productName.toUpperCase()}`
              : 'NO LIVE LOTS — BROWSE THE FULL CATALOGUE'}
          </span>
        )}
      </div>
    </div>
  )
}
