import { useEffect, useState } from 'react'
import { getAuctions } from '../api/auctions'
import AuctionCard from '../components/AuctionCard'
import Spinner from '../components/Spinner'

const TABS = ['Active', 'Scheduled', 'Closed']

export default function AuctionsPage() {
  const [status, setStatus] = useState('Active')
  const [auctions, setAuctions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    getAuctions(status)
      .then((data) => {
        if (!ignore) setAuctions(data)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [status])

  return (
    <div className="container section">
      <div className="page-header">
        <h1>Auctions</h1>
        <p>Bid live on items available exclusively through auction.</p>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${status === t ? 'active' : ''}`} onClick={() => setStatus(t)}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : auctions.length === 0 ? (
        <p className="empty-state">No {status.toLowerCase()} auctions right now.</p>
      ) : (
        <div className="grid grid-cards">
          {auctions.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </div>
      )}
    </div>
  )
}
