import { useEffect, useState } from 'react'
import { getRaffles } from '../api/raffles'
import RaffleCard from '../components/RaffleCard'
import Spinner from '../components/Spinner'

const TABS = ['Open', 'ReadyToDraw', 'Drawn']
const TAB_LABELS = { Open: 'Open', ReadyToDraw: 'Drawing soon', Drawn: 'Drawn' }

export default function RafflesPage() {
  const [status, setStatus] = useState('Open')
  const [raffles, setRaffles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    getRaffles(status)
      .then((data) => {
        if (!ignore) setRaffles(data)
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
        <h1>Raffles</h1>
        <p>Pick your seats, reserve them, and pay whenever you're ready.</p>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${status === t ? 'active' : ''}`} onClick={() => setStatus(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : raffles.length === 0 ? (
        <p className="empty-state">No {TAB_LABELS[status].toLowerCase()} raffles right now.</p>
      ) : (
        <div className="grid grid-cards">
          {raffles.map((r) => (
            <RaffleCard key={r.id} raffle={r} />
          ))}
        </div>
      )}
    </div>
  )
}
