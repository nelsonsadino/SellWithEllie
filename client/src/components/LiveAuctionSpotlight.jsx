import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuctions } from '../api/auctions'
import AuctionChat from './AuctionChat'
import CountdownTimer from './CountdownTimer'
import ProductImage from './ProductImage'
import { useCurrency } from '../context/TenantContext'

const lot = (id) => `LOT ${String(id).padStart(3, '0')}`

// The one deliberately loud moment on an otherwise quiet storefront: a live
// auction is genuinely urgent, and the front page should say so. Renders
// nothing when no auction is active - this is a spotlight, not a permanent
// fixture, and an empty urgent-looking card would cry wolf.
export default function LiveAuctionSpotlight() {
  const money = useCurrency()
  const [auction, setAuction] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    getAuctions('Active')
      .then((rows) => {
        if (ignore) return
        const list = Array.isArray(rows) ? rows : []
        // Most contested lot first - the one visitors are most likely to
        // want to jump into, not just whichever the API happened to return first.
        const sorted = [...list].sort((a, b) => (b.bidCount ?? 0) - (a.bidCount ?? 0))
        setAuction(sorted[0] || null)
      })
      .catch(() => setAuction(null))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [])

  if (loading || !auction) return null

  const currentAmount = auction.currentHighestAmount ?? auction.startingPrice

  return (
    <section className="container section-block">
      <div className="spotlight">
        <div className="spotlight-main">
          <Link to={`/auctions/${auction.id}`} className="spotlight-image-link">
            <ProductImage src={auction.productImageUrl} category={auction.productCategory} alt={auction.productName} />
            <span className="spotlight-lot">{lot(auction.id)}</span>
          </Link>

          <div className="spotlight-body">
            <span className="spotlight-live-flag">
              <span className="live-dot" aria-hidden="true" />
              Bidding is open now
            </span>
            <h2 className="spotlight-title">
              <Link to={`/auctions/${auction.id}`}>{auction.productName}</Link>
            </h2>
            <p className="spotlight-sub">
              {auction.bidCount} bid{auction.bidCount === 1 ? '' : 's'} so far - every bid raises the floor by{' '}
              {money(auction.minIncrement)}.
            </p>

            <div className="spotlight-stats">
              <div className="spotlight-stat">
                <span className="spotlight-stat-key">{auction.currentHighestAmount ? 'Current bid' : 'Opening bid'}</span>
                <span className="spotlight-stat-val spotlight-stat-price">{money(currentAmount)}</span>
              </div>
              <div className="spotlight-stat">
                <span className="spotlight-stat-key">Closes in</span>
                <span className="spotlight-stat-val">
                  <CountdownTimer target={auction.endTimeUtc} />
                </span>
              </div>
            </div>

            <div className="spotlight-actions">
              <Link to={`/auctions/${auction.id}`} className="btn btn-primary btn-live">
                Place a bid now
              </Link>
              {auction.buyoutPrice && (
                <Link to={`/auctions/${auction.id}`} className="btn btn-secondary">
                  Buy now {money(auction.buyoutPrice)}
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="spotlight-chat">
          <AuctionChat auctionId={auction.id} />
        </div>
      </div>
    </section>
  )
}
