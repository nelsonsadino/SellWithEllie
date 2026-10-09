import { Link } from 'react-router-dom'
import ProductImage from './ProductImage'
import { useCurrency } from '../context/TenantContext'

const labels = { Open: 'Open', ReadyToDraw: 'Drawing soon', Drawn: 'Drawn', Cancelled: 'Cancelled' }

export function statusInfo(raffle) {
  return { key: raffle.status.toLowerCase(), label: labels[raffle.status] || raffle.status }
}

export default function RaffleCard({ raffle }) {
  const money = useCurrency()
  const seatsLeft = raffle.availableSeatCount
  const topPrize = raffle.prizes?.[0]
  const morePrizes = raffle.prizes?.length > 1 ? ` +${raffle.prizes.length - 1} more` : ''
  const firstPlace = raffle.prizes?.find((p) => p.rank === 1)

  return (
    <div className="card raffle-card">
      <Link to={`/raffles/${raffle.id}`} className="pet-card-image-link">
        <ProductImage src={raffle.imageUrl} alt={raffle.title} />
        <span className={`badge raffle-status-${statusInfo(raffle).key} pet-card-badge`}>{statusInfo(raffle).label}</span>
      </Link>
      <div className="pet-card-body">
        <p className="pet-card-meta">
          {raffle.paidSeatCount}/{raffle.seatCount} seats paid
        </p>
        <div className="pet-card-heading">
          <h3>
            <Link to={`/raffles/${raffle.id}`}>{raffle.title}</Link>
          </h3>
        </div>
        <p className="auction-current-price">
          Prize <strong>{topPrize?.description}</strong>
          {morePrizes}
        </p>
        <p className="auction-buyout-hint">
          {money(raffle.seatPrice)} / seat {raffle.status === 'Open' && `· ${seatsLeft} left`}
        </p>
        {raffle.scheduledDrawAtUtc && (raffle.status === 'Open' || raffle.status === 'ReadyToDraw') && (
          <p className="auction-buyout-hint">Draw: {new Date(raffle.scheduledDrawAtUtc).toLocaleString()}</p>
        )}
        {raffle.status === 'Drawn' && firstPlace?.winnerDisplayName && (
          <p className="auction-buyout-hint">
            Won by {firstPlace.winnerDisplayName} (seat #{firstPlace.winningSeatNumber})
          </p>
        )}
        <Link to={`/raffles/${raffle.id}`} className="btn btn-primary btn-block">
          {raffle.status === 'Open' ? 'Pick seats' : 'View raffle'}
        </Link>
      </div>
    </div>
  )
}
