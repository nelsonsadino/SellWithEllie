import { useEffect, useRef, useState } from 'react'

// Same palette as the duck race's confetti burst, so a raffle's various
// draw modes read as one family of "celebratory randomness" colors instead
// of each picking its own. Cycled by slice index, not by seat number, so
// it stays a clean repeating rainbow regardless of which seats are left in
// the pool.
const SLICE_COLORS = ['#ff5a5f', '#ffd23f', '#5cc8ff', '#7ed957', '#b388ff', '#ff9f43']

// Angle convention throughout: degrees measured clockwise from straight up
// (12 o'clock) - this matches CSS conic-gradient's own default `from 0deg`
// exactly, so slice boundaries and label positions use the same numbers
// with no conversion. x/y offsets come from plain trig computed once in JS
// (not chained CSS transforms), so there's nothing fragile to get backwards.
export default function RaffleWheelDraw({ pool, stage, reserverNameBySeat }) {
  const [rotation, setRotation] = useState(0)
  const spinRef = useRef(null)
  const rotationRef = useRef(0)

  const n = pool.length
  const sliceAngle = n > 0 ? 360 / n : 360

  useEffect(() => {
    rotationRef.current = rotation
  }, [rotation])

  useEffect(() => {
    if (stage.phase === 'spinning') {
      spinRef.current = setInterval(() => {
        setRotation((r) => r + 16)
      }, 50)
      return () => clearInterval(spinRef.current)
    }

    if (stage.phase === 'resolved') {
      clearInterval(spinRef.current)
      const idx = pool.indexOf(stage.seatNumber)
      if (idx === -1) return undefined
      const sliceCenter = idx * sliceAngle + sliceAngle / 2
      const current = rotationRef.current
      const currentMod = ((current % 360) + 360) % 360
      // How far (clockwise, always forward) until sliceCenter sits under the
      // fixed top pointer, plus a few extra full turns for a proper spin-down.
      const delta = (360 - sliceCenter - currentMod + 360) % 360
      setRotation(current + delta + 360 * 3)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.phase, stage.seatNumber])

  return (
    <div className="raffle-wheel-wrap">
      <div className="raffle-wheel-pointer" aria-hidden="true" />
      <div
        className={`raffle-wheel ${stage.phase === 'resolved' ? 'raffle-wheel-settling' : 'raffle-wheel-spinning'}`}
        style={{
          transform: `rotate(${rotation}deg)`,
          background:
            n > 0
              ? `conic-gradient(${pool
                  .map((_, i) => {
                    const start = (i * sliceAngle).toFixed(3)
                    const end = ((i + 1) * sliceAngle).toFixed(3)
                    const color = SLICE_COLORS[i % SLICE_COLORS.length]
                    return `${color} ${start}deg ${end}deg`
                  })
                  .join(', ')})`
              : 'var(--color-surface)',
        }}
      >
        {pool.map((seatNumber, i) => {
          const theta = ((i * sliceAngle + sliceAngle / 2) * Math.PI) / 180
          const x = 50 + 36 * Math.sin(theta)
          const y = 50 - 36 * Math.cos(theta)
          const name = reserverNameBySeat?.get(seatNumber)
          return (
            <span key={seatNumber} className="raffle-wheel-label" style={{ left: `${x}%`, top: `${y}%` }}>
              <span className="raffle-wheel-label-num">#{seatNumber}</span>
              {name && <span className="raffle-wheel-label-name">{name}</span>}
            </span>
          )
        })}
        <span className="raffle-wheel-hub" aria-hidden="true" />
      </div>
    </div>
  )
}
