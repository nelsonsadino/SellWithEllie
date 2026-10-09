import { Link } from 'react-router-dom'
import CountdownTimer from './CountdownTimer'
import ProductImage from './ProductImage'
import { useCurrency } from '../context/TenantContext'

const lot = (id) => `LOT ${String(id).padStart(3, '0')}`

// A closed auction that drew a bid was acquired, not merely ended - the
// specimen-cabinet state vocabulary distinguishes the two rather than
// labeling both "Closed".
export function statusInfo(auction) {
  if (auction.status === 'Closed' && auction.bidCount > 0) {
    return { key: 'accessioned', label: 'Accessioned' }
  }
  const labels = { Scheduled: 'Scheduled', Active: 'Live', Closed: 'Closed', Cancelled: 'Cancelled' }
  return { key: auction.status.toLowerCase(), label: labels[auction.status] || auction.status }
}

export default function AuctionCard({ auction }) {
  const money = useCurrency()
  const currentAmount = auction.currentHighestAmount ?? auction.startingPrice

  return (
    <div className="card auction-card">
      <Link to={`/auctions/${auction.id}`} className="pet-card-image-link">
        <ProductImage src={auction.productImageUrl} category={auction.productCategory} alt={auction.productName} />
        <span className="pet-card-lot">{lot(auction.id)}</span>
        <span className={`badge auction-status-${statusInfo(auction).key} pet-card-badge`}>{statusInfo(auction).label}</span>
      </Link>
      <div className="pet-card-body">
        <p className="pet-card-meta">
          {auction.bidCount} bid{auction.bidCount === 1 ? '' : 's'}
        </p>
        <div className="pet-card-heading">
          <h3>
            <Link to={`/auctions/${auction.id}`}>{auction.productName}</Link>
          </h3>
        </div>
        <p className="auction-current-price">
          {auction.currentHighestAmount ? 'Current bid' : 'Opening'} <strong>{money(currentAmount)}</strong>
        </p>
        {auction.status === 'Active' && auction.buyoutPrice && (
          <p className="auction-buyout-hint">Buy now {money(auction.buyoutPrice)}</p>
        )}
        {auction.status === 'Active' && <CountdownTimer target={auction.endTimeUtc} label="Closes in" />}
        {auction.status === 'Scheduled' && <CountdownTimer target={auction.startTimeUtc} label="Opens in" />}
        <Link to={`/auctions/${auction.id}`} className="btn btn-primary btn-block">
          {auction.status === 'Active' ? 'Place a bid' : 'View lot'}
        </Link>
      </div>
    </div>
  )
}
