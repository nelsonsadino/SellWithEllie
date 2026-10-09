import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RaffleDuckRaceDraw from './RaffleDuckRaceDraw'
import RaffleInstantDraw from './RaffleInstantDraw'
import RaffleSeatIcon from './RaffleSeatIcon'
import RaffleWheelDraw from './RaffleWheelDraw'

const DEMO_POOL = [1, 2, 3, 4, 5, 6]
const DEMO_NAMES = new Map([
  [1, 'Maya S.'],
  [2, 'Jon C.'],
  [3, 'Ella R.'],
  [4, 'Ben T.'],
  [5, 'Priya K.'],
  [6, 'Noah D.'],
])

export const MODES = [
  {
    key: 'DuckRace',
    label: 'Duck Race',
    blurb: 'Every paid seat gets a duck. They race across the pond, and whoever crosses the line first wins.',
  },
  {
    key: 'Wheel',
    label: 'Spin the Wheel',
    blurb: 'One wheel, one slice per seat. It spins down and lands on the winner in front of everyone watching.',
  },
  {
    key: 'Instant',
    label: 'Instant Reveal',
    blurb: 'A deck shuffles itself, then one card flips over to show the winning seat. No waiting around.',
  },
  {
    key: 'LastManStanding',
    label: 'Last Man Standing',
    blurb: "Seats get eliminated one at a time, live, until only one is left holding the prize.",
  },
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A tiny seat grid that eliminates candidates one at a time while "spinning"
// and locks the survivor on "resolved" - the same chasing-pulse language
// RaffleDetailPage uses for a real Last Man Standing round, just looped here
// for a passerby to watch without needing an actual raffle open.
function LastManStandingDemo({ pool, stage }) {
  const [chasing, setChasing] = useState(null)

  useEffect(() => {
    if (stage.phase !== 'spinning') {
      setChasing(null)
      return undefined
    }
    let i = 0
    const id = setInterval(() => {
      setChasing(pool[i % pool.length])
      i += 1
    }, 260)
    return () => clearInterval(id)
  }, [stage.phase, pool])

  return (
    <div className="raffle-seat-grid raffle-modes-lastman" aria-hidden="true">
      {pool.map((seatNumber) => {
        const isWinner = stage.phase === 'resolved' && stage.seatNumber === seatNumber
        const isChasing = stage.phase === 'spinning' && chasing === seatNumber
        return (
          <div
            key={seatNumber}
            className={`raffle-seat raffle-seat-paid${isChasing ? ' raffle-seat-chasing' : ''}${isWinner ? ' raffle-seat-mine' : ''}`}
          >
            <RaffleSeatIcon className="raffle-seat-icon" />
            <span>{seatNumber}</span>
            <span className="raffle-seat-reserver">{DEMO_NAMES.get(seatNumber)}</span>
          </div>
        )
      })}
    </div>
  )
}

// Drives a fake spinning/resolved cycle so each mode's *real* draw component
// runs continuously for a visitor who has never opened an actual raffle -
// the same animation code a live draw uses, fed made-up seats instead of a
// server event. Keyed by mode from the parent, so switching tabs remounts
// this fresh and the new mode starts its own clean cycle.
export function ModeDemo({ mode }) {
  const [stage, setStage] = useState({ phase: 'spinning' })

  useEffect(() => {
    let cancelled = false
    // Duck Race paces itself against a real ~15s race internally; the other
    // three read a much shorter demo spin so the tab doesn't feel stalled.
    const spinMs = mode === 'DuckRace' ? 15000 : mode === 'Wheel' ? 4200 : 2600
    const holdMs = 3200

    async function loop() {
      while (!cancelled) {
        setStage({ phase: 'spinning' })
        await sleep(spinMs)
        if (cancelled) return
        const seatNumber = DEMO_POOL[Math.floor(Math.random() * DEMO_POOL.length)]
        setStage({
          phase: 'resolved',
          rank: 1,
          seatNumber,
          winnerDisplayName: DEMO_NAMES.get(seatNumber),
          description: 'a demo prize',
        })
        await sleep(holdMs)
        if (cancelled) return
      }
    }

    loop()
    return () => {
      cancelled = true
    }
  }, [mode])

  switch (mode) {
    case 'Instant':
      return <RaffleInstantDraw pool={DEMO_POOL} stage={stage} />
    case 'Wheel':
      return <RaffleWheelDraw pool={DEMO_POOL} stage={stage} reserverNameBySeat={DEMO_NAMES} />
    case 'DuckRace':
      return <RaffleDuckRaceDraw pool={DEMO_POOL} stage={stage} reserverNameBySeat={DEMO_NAMES} />
    case 'LastManStanding':
      return <LastManStandingDemo pool={DEMO_POOL} stage={stage} />
    default:
      return null
  }
}

// Evergreen (unlike RaffleSpotlight, which only shows when a real raffle is
// open) - a first-time visitor should be able to see what a raffle draw
// actually looks like before one happens to be running. The demos are the
// real draw-mode components fed made-up seats, not screenshots or a
// recorded clip, so what a visitor watches here is exactly what a real
// draw looks like.
export default function RaffleModesShowcase() {
  const [active, setActive] = useState('DuckRace')
  const activeMode = MODES.find((m) => m.key === active)

  return (
    <section className="container section-block">
      <div className="section-head">
        <span className="section-head-mark" aria-hidden="true" />
        <div className="section-head-label">
          <h2>Four ways to win a raffle</h2>
        </div>
        <Link to="/raffles" className="section-head-link">
          See open raffles
        </Link>
      </div>

      <p className="raffle-modes-intro">
        Every raffle plays out live on its own page, with real-time chat running alongside the draw - watch it happen
        and talk it through with everyone else who bought a seat. Pick a format below to see how each one actually
        draws its winner.
      </p>

      <div className="raffle-modes">
        <div className="raffle-modes-tabs" role="tablist" aria-label="Raffle draw formats">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active === m.key}
              className={`raffle-modes-tab${active === m.key ? ' is-active' : ''}`}
              onClick={() => setActive(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="raffle-modes-stage" role="tabpanel">
          <p className="raffle-modes-blurb">{activeMode.blurb}</p>
          <div className="raffle-modes-demo">
            <ModeDemo key={active} mode={active} />
          </div>
        </div>
      </div>

      <div className="raffle-modes-cta">
        <Link to="/raffles" className="btn btn-primary">
          Browse open raffles
        </Link>
      </div>
    </section>
  )
}
