import * as signalR from '@microsoft/signalr'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { buyoutAuction, getAuction, placeBid } from '../api/auctions'
import { API_ROOT_URL, getToken } from '../api/client'
import AuctionChat from '../components/AuctionChat'
import { statusInfo } from '../components/AuctionCard'
import CountdownTimer from '../components/CountdownTimer'
import ProductImage from '../components/ProductImage'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useCurrency, useTenant } from '../context/TenantContext'
import { useToast } from '../context/ToastContext'

function nextMinBid(auction) {
  if (!auction) return 0
  return auction.currentHighestAmount ? auction.currentHighestAmount + auction.minIncrement : auction.startingPrice
}

export default function AuctionDetailPage() {
  const money = useCurrency()
  const { id } = useParams()
  const auctionId = Number(id)
  const [auction, setAuction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bidAmount, setBidAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [closedInfo, setClosedInfo] = useState(null)
  const [showBuyoutForm, setShowBuyoutForm] = useState(false)
  const [buyoutForm, setBuyoutForm] = useState({ shippingName: '', shippingAddress: '' })
  const [buyingOut, setBuyingOut] = useState(false)
  // Exposed to <AuctionChat> below so it reuses this connection instead of
  // opening a second one to the same group - see AuctionChat's own comment.
  const [connection, setConnection] = useState(null)
  const { isAuthenticated, user } = useAuth()
  const { tenant } = useTenant()
  const { showToast } = useToast()

  useEffect(() => {
    let ignore = false
    setLoading(true)
    getAuction(auctionId)
      .then((data) => {
        if (!ignore) {
          setAuction(data)
          setBidAmount(nextMinBid(data).toFixed(2))
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [auctionId])

  useEffect(() => {
    // The Hub's JoinAuction/LeaveAuction take (tenantId, auctionId) so a
    // group name collision can never leak one shop's live bids into
    // another's - wait for the tenant id before joining anything.
    if (!tenant?.id) return undefined

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_ROOT_URL}/hubs/auction`, { accessTokenFactory: () => getToken() || '' })
      .withAutomaticReconnect()
      .build()

    connection.on('BidPlaced', (payload) => {
      if (payload.auctionId !== auctionId) return
      setAuction((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          currentHighestAmount: payload.currentHighestAmount,
          currentHighestBidderName: payload.bid.bidderDisplayName,
          bidCount: prev.bidCount + 1,
          bids: [payload.bid, ...prev.bids],
        }
      })
    })

    connection.on('AuctionStarted', (payload) => {
      if (payload.auctionId !== auctionId) return
      setAuction((prev) => (prev ? { ...prev, status: 'Active' } : prev))
    })

    connection.on('AuctionClosed', (payload) => {
      if (payload.auctionId !== auctionId) return
      setAuction((prev) => (prev ? { ...prev, status: 'Closed' } : prev))
      setClosedInfo(payload)
    })

    connection
      .start()
      .then(() => connection.invoke('JoinAuction', tenant.id, auctionId))
      .catch(() => {
        /* live updates are a nice-to-have; the page still works without them */
      })

    setConnection(connection)

    return () => {
      connection.stop()
      setConnection(null)
    }
  }, [auctionId, tenant?.id])

  const handleBid = async (e) => {
    e.preventDefault()
    if (!isAuthenticated) {
      showToast('Please log in to place a bid.', 'error')
      return
    }
    const amount = parseFloat(bidAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      showToast('Enter a valid bid amount.', 'error')
      return
    }
    setSubmitting(true)
    try {
      await placeBid(auctionId, amount)
      showToast('Your bid was placed!', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const openBuyoutForm = () => {
    if (!isAuthenticated) {
      showToast('Please log in to buy out this auction.', 'error')
      return
    }
    setBuyoutForm({ shippingName: user?.displayName || '', shippingAddress: '' })
    setShowBuyoutForm(true)
  }

  const handleBuyout = async (e) => {
    e.preventDefault()
    setBuyingOut(true)
    try {
      // The backend records a simulated "payment" (an Order, same as regular
      // checkout) and closes the auction atomically before this resolves -
      // so a successful response here already means payment has been sent
      // and the auction has ended in the buyer's favor.
      const { auction: updatedAuction } = await buyoutAuction(auctionId, buyoutForm)
      setAuction(updatedAuction)
      setClosedInfo({
        auctionId,
        winningBidderName: updatedAuction.currentHighestBidderName,
        winningAmount: updatedAuction.currentHighestAmount,
        wasBuyout: true,
      })
      setShowBuyoutForm(false)
      showToast('🎉 Congratulations - you bought it out!', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBuyingOut(false)
    }
  }

  if (loading) {
    return (
      <div className="container section">
        <Spinner />
      </div>
    )
  }

  if (!auction) {
    return (
      <div className="container section empty-state">
        <h2>Auction not found</h2>
        <Link to="/auctions" className="btn btn-primary">
          Back to auctions
        </Link>
      </div>
    )
  }

  const currentAmount = auction.currentHighestAmount ?? auction.startingPrice
  const minBid = nextMinBid(auction)

  return (
    <div className="container section auction-detail">
      <div className="auction-detail-main">
        <ProductImage src={auction.productImageUrl} category={auction.productCategory} alt={auction.productName} />
        <div>
          <h1>{auction.productName}</h1>
          <p className="pet-card-meta">{auction.productSubcategory}</p>
          <p>{auction.productDescription}</p>
        </div>
      </div>

      <div className="auction-detail-panel">
        <span className={`badge auction-status-${statusInfo(auction).key}`}>{statusInfo(auction).label}</span>

        <p className="auction-current-price-large">
          {auction.currentHighestAmount ? 'Current bid' : 'Starting price'}: <strong>{money(currentAmount)}</strong>
        </p>
        {auction.currentHighestBidderName && <p>Highest bidder: {auction.currentHighestBidderName}</p>}

        {auction.status === 'Active' && <CountdownTimer target={auction.endTimeUtc} label="Ends in" />}
        {auction.status === 'Scheduled' && <CountdownTimer target={auction.startTimeUtc} label="Starts in" />}

        {closedInfo && (
          <div className={`callout ${closedInfo.wasBuyout ? 'callout-success' : ''}`}>
            {closedInfo.wasBuyout ? (
              <p>
                🎉 Congratulations, you won by buyout! You paid {money(closedInfo.winningAmount)} and your order has
                been placed.
              </p>
            ) : closedInfo.winningBidderName ? (
              <p>
                🏆 Auction closed. Won by {closedInfo.winningBidderName} at {money(closedInfo.winningAmount)}.
              </p>
            ) : (
              <p>Auction closed with no bids.</p>
            )}
          </div>
        )}

        {auction.status === 'Active' && !closedInfo && auction.buyoutPrice && !showBuyoutForm && (
          <button className="btn btn-accent btn-block" type="button" onClick={openBuyoutForm}>
            Buy out now for {money(auction.buyoutPrice)}
          </button>
        )}

        {showBuyoutForm && (
          <form className="bid-form buyout-form" onSubmit={handleBuyout}>
            <p className="hint">
              Buying out ends the auction immediately at {money(auction.buyoutPrice)}. This is a demo checkout - no
              real payment is collected.
            </p>
            <label htmlFor="buyoutShippingName">Full name</label>
            <input
              id="buyoutShippingName"
              className="input"
              required
              value={buyoutForm.shippingName}
              onChange={(e) => setBuyoutForm({ ...buyoutForm, shippingName: e.target.value })}
            />
            <label htmlFor="buyoutShippingAddress">Delivery / pickup address</label>
            <textarea
              id="buyoutShippingAddress"
              className="input"
              required
              rows={2}
              value={buyoutForm.shippingAddress}
              onChange={(e) => setBuyoutForm({ ...buyoutForm, shippingAddress: e.target.value })}
            />
            <div className="buyout-form-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setShowBuyoutForm(false)} disabled={buyingOut}>
                Cancel
              </button>
              <button className="btn btn-accent btn-block" type="submit" disabled={buyingOut}>
                {buyingOut ? 'Processing payment...' : `Confirm buyout - ${money(auction.buyoutPrice)}`}
              </button>
            </div>
          </form>
        )}

        {auction.status === 'Active' &&
          !closedInfo &&
          !showBuyoutForm &&
          (isAuthenticated ? (
            <form className="bid-form" onSubmit={handleBid}>
              <label htmlFor="bidAmount">Your bid (min {money(minBid)})</label>
              <input
                id="bidAmount"
                type="number"
                step="0.01"
                min={minBid}
                className="input"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
              />
              <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
                {submitting ? 'Placing bid...' : 'Place bid'}
              </button>
            </form>
          ) : (
            <Link to="/login" className="btn btn-primary btn-block">
              Log in to bid
            </Link>
          ))}

        <div className="bid-history">
          <h3>Bid history</h3>
          {auction.bids.length === 0 ? (
            <p className="empty-state">No bids yet. Be the first!</p>
          ) : (
            <ul>
              {auction.bids.map((b) => (
                <li key={b.id}>
                  <span>{b.bidderDisplayName}</span>
                  <span>{money(b.amount)}</span>
                  <span>{new Date(b.placedAtUtc).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <AuctionChat auctionId={auctionId} connection={connection} />
      </div>
    </div>
  )
}
