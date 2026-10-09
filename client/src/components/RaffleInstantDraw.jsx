import { useEffect, useState } from 'react'

// Each card in a fanning half rotates by its own amount (spread evenly
// across the half, not every card in the pile snapping to one shared
// angle) - that per-card spread is what actually makes it read as a fan
// instead of a block of cards sliding sideways together.
const FAN_SPREAD_DEG = 34

function fanAngleDeg(indexInHalf, half) {
  if (half <= 1) return 0
  return (indexInHalf / (half - 1) - 0.5) * FAN_SPREAD_DEG
}

// A physical card deck, not a shuffling-numbers readout: while spinning,
// the stack riffles twice - a real shuffle doesn't preview the outcome, so
// nothing flashes candidate numbers - then just sits there for the rest of
// the spin. On resolve, one card lifts off the stack and flips over to
// reveal the winning seat number; not-awarded prizes get the same flip
// with a plain "Not awarded" face instead of a number. The deck itself
// has one card per seat still in this round's pool - a raffle with 6
// seats shuffles 6 cards, not some unrelated fixed count.
export default function RaffleInstantDraw({ pool, stage }) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (stage.phase !== 'resolved') {
      setRevealed(false)
      return undefined
    }
    // Mounts in the hidden/offset state first, then flips this on next
    // frame so the slide-up + fade-in transition has something to animate
    // from instead of just appearing already in its end state.
    const id = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(id)
  }, [stage.phase])

  const isResolved = stage.phase === 'resolved'
  // Floor of 2 so a 1-seat (or momentarily empty) pool still renders a
  // sane left/right split instead of a degenerate single-card "fan".
  // Ceiling of 60 because a raffle's seatCount can go up to 2000
  // (CreateRaffleRequest) and this deck is 60 real, box-shadowed,
  // animated DOM elements - matching the seat count exactly stops being
  // "a fuller-looking deck" and starts being a performance problem well
  // before it gets anywhere near that.
  const cardCount = Math.min(60, Math.max(2, pool?.length ?? 0))
  const half = Math.ceil(cardCount / 2)

  return (
    <div className="raffle-instant-table" role="group" aria-label="Instant reveal">
      <div className={`raffle-instant-stack${stage.phase === 'spinning' ? ' raffle-instant-stack-shuffling' : ''}`} aria-hidden="true">
        {Array.from({ length: cardCount }, (_, i) => {
          const isLeft = i < half
          const halfSize = isLeft ? half : cardCount - half
          const angle = fanAngleDeg(isLeft ? i : i - half, halfSize)
          return (
            <span
              key={i}
              className={`raffle-instant-card-back raffle-instant-card-back-${isLeft ? 'left' : 'right'}`}
              style={{ '--card-idx': i, '--fan-angle': `${angle.toFixed(1)}deg` }}
            />
          )
        })}
      </div>

      {isResolved && (
        <div className="raffle-instant-reveal">
          <div className={`raffle-instant-flip${revealed ? ' raffle-instant-flip-show' : ''}`}>
            <div className="raffle-instant-flip-inner">
              <div className="raffle-instant-flip-front" aria-hidden="true" />
              <div className="raffle-instant-flip-back">
                {stage.seatNumber != null ? (
                  <>
                    <span className="raffle-instant-flip-seat">#{stage.seatNumber}</span>
                    {stage.winnerDisplayName && (
                      <span className="raffle-instant-flip-name">{stage.winnerDisplayName}</span>
                    )}
                  </>
                ) : (
                  <span className="raffle-instant-flip-back-empty">Not awarded</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
