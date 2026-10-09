import { useEffect, useMemo, useRef, useState } from 'react'
import RaffleDuckSprite from './RaffleDuckSprite'
import { getDuckLook } from '../lib/duckRoster'

// Confetti burst shown when a winner is announced. Fixed table (not random)
// so re-renders never reshuffle it mid-fall.
const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 47 + 8) % 100,
  delay: (i % 7) * 0.09,
  duration: 1.7 + (i % 5) * 0.28,
  color: ['#ff5a5f', '#ffd23f', '#5cc8ff', '#7ed957', '#b388ff', '#ff9f43'][i % 6],
  spin: (i % 2 ? 1 : -1) * (240 + (i % 4) * 90),
}))

// Bigger fields get smaller ducks so a 30-seat race doesn't become a
// mile-long column. The actual sizes live in theme.css (data-density).
function densityFor(count) {
  if (count <= 10) return 'roomy'
  if (count <= 20) return 'snug'
  return 'tight'
}

// The step sizes below (and this whole file's pacing) were originally
// tuned for a 6s spin - an average-paced duck reaching the 80% cap right
// around when the spin ends. RaffleDetailPage's REPLAY_STEP_MS / the
// server's RaffleDrawTiming.RevealStepSeconds now run the spin for
// SPIN_DURATION_S instead, so every step is scaled down by the same ratio:
// same-shaped race (same bursts, same relative lead changes), just
// stretched to actually fill the longer window instead of hitting the cap
// in the first fifth of it and idling for the rest.
const SPIN_DURATION_S = 15
const STEP_SCALE = 6 / SPIN_DURATION_S

// A planned winner (replay only) races the pack for real - same random
// walk everyone else gets - for the first SURGE_START_FRAC of the spin, so
// it can genuinely fall behind a lucky bursty leader instead of visibly
// cruising on rails from the start. Only once that fraction of the clock
// has passed does it switch to a guaranteed close-the-gap-to-100 curve, so
// however far back it happens to be at that point, it still lands exactly
// on the line when the clock runs out - a real final push, sized to
// whatever gap actually built up rather than a fixed dramatic leap.
const SURGE_START_FRAC = 0.65

// Deterministic ease from wherever the winner actually is at the surge
// trigger up to 100 by the time the spin clock reaches SPIN_DURATION_S.
// `power` > 1 holds the push back at first and leans into it late (a
// last-second lunge for the line); < 1 gets moving right away and eases
// off. Either way frac(0) = 0 and frac(1) = 1 always, so it's guaranteed
// to reach the line exactly on time regardless of shape.
function plannedWinnerProgress(frac, power) {
  return Math.pow(Math.max(0, Math.min(1, frac)), power)
}

// Mirrors the spin-phase step formula below (non-burst step 1.6-3.6%,
// burst step 6-12%, both scaled by the duck's own pace and STEP_SCALE) to
// get that same duck's average %/second cruising speed over the 380ms tick
// - then the finish only has to ask for a little more of it, instead of
// picking some unrelated speed that either drags or teleports.
function cruiseSpeedPercentPerSec({ pace, burstChance }) {
  const perTick = pace * STEP_SCALE * ((1 - burstChance) * 2.6 + burstChance * 9)
  return perTick / 0.38
}

// One lane per contestant, plain 1D position (0-100%) per lane - no trig, no
// transform chains, nothing that needs pixel-level tuning to read correctly.
// During "spinning" every lane creeps forward at its own pace, occasionally
// erupting into a burst - real lead changes instead of a uniform crawl - and
// is capped short of the finish line, since the real winner isn't known yet;
// once resolved, only the winning lane gets released to actually finish.
//
// Everything else on screen is decoration on top of that: the water, lily
// pads, bushes and lane ropes scroll continuously, every duck bobs and
// paddles on its own rhythm, and each duck has its own name, colour and
// accessory (see lib/duckRoster.js).
export default function RaffleDuckRaceDraw({ pool, stage, reserverNameBySeat }) {
  const [positions, setPositions] = useState(() => Object.fromEntries(pool.map((n) => [n, 4])))
  const tickRef = useRef(null)
  const spinStartRef = useRef(0)
  // The resolved stage object (built fresh in RaffleDetailPage from the
  // server/replay's actual reveal payload) doesn't carry plannedWinnerSeat
  // itself, so this remembers whether the seat that just got announced is
  // the one the spinning phase was already gliding toward 100 - if so, the
  // resolve handler below has nothing left to do.
  const plannedWinnerRef = useRef(null)
  // Set once per round, the first tick where the planned winner's real
  // (raced, not scripted) position is read as the base for its closing
  // surge - see SURGE_START_FRAC above.
  const winnerSurgeStartRef = useRef(null)
  // Per-duck "personality" (a steady pace multiplier + how burst-prone it
  // is), assigned once per seat and kept stable for the life of this
  // component - without it every duck would statistically converge to the
  // same average pace and the race would read as one blob moving together.
  const personalityRef = useRef({})
  // Mirrors `positions` so the resolve handler can read the winner's exact
  // spot the instant the result lands, without making the spin-phase
  // interval (which fires every 380ms) depend on - and re-subscribe to -
  // `positions` itself.
  const positionsRef = useRef(positions)
  useEffect(() => {
    positionsRef.current = positions
  }, [positions])
  // How long the winner's final dash to the line takes. Distance-based
  // rather than a fixed snap: the server only tells us who won once the
  // spin is already over, so the winner might be anywhere in the pack at
  // that instant - a fixed-duration jump from wherever it happened to be
  // would cover wildly different distances at wildly different implied
  // speeds, reading as a teleport for anyone who was still near the back.
  // Keying the finish to that same duck's own cruising speed (see
  // cruiseSpeedPercentPerSec above), just a little quicker, means the last
  // stretch reads as a natural continuation of how it was already moving
  // rather than a sudden jump in speed.
  const [finishDurationS, setFinishDurationS] = useState(0.6)

  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev }
      pool.forEach((n) => {
        if (!(n in next)) next[n] = 4
      })
      return next
    })
    pool.forEach((n) => {
      if (!(n in personalityRef.current)) {
        personalityRef.current[n] = {
          pace: 0.6 + Math.random() * 0.8, // 0.6x-1.4x - some ducks are just faster
          burstChance: 0.08 + Math.random() * 0.1, // 8%-18% odds of a sprint on any tick
          // Only used if this seat ends up being a replay's plannedWinnerSeat
          // - shape of its guaranteed run to the line (see
          // plannedWinnerProgress above).
          easingPower: 0.7 + Math.random() * 1.1, // 0.7-1.8
        }
      }
    })
  }, [pool])

  useEffect(() => {
    if (stage.phase === 'spinning') {
      // Every prize is its own race - send the whole field back to the
      // start line rather than continuing from wherever last round's
      // non-winners happened to stop, so each reveal reads as a fresh heat.
      setPositions(Object.fromEntries(pool.map((n) => [n, 4])))
      spinStartRef.current = performance.now()
      winnerSurgeStartRef.current = null
      const plannedWinnerSeat = stage.plannedWinnerSeat ?? null
      plannedWinnerRef.current = plannedWinnerSeat
      // Slower cadence (was 220ms) and a much smaller baseline crawl (was a
      // flat 2-8% every tick) so the race actually takes time to develop -
      // the occasional burst is what creates the thrill of a sudden lead
      // change instead of everyone plodding forward in lockstep.
      tickRef.current = setInterval(() => {
        const elapsedFrac = (performance.now() - spinStartRef.current) / 1000 / SPIN_DURATION_S
        setPositions((prev) => {
          const next = {}
          for (const seatNumber of pool) {
            const current = prev[seatNumber] ?? 4
            const personality = personalityRef.current[seatNumber] ?? { pace: 1, burstChance: 0.14, easingPower: 1 }
            const rolledStep = () => {
              const isBurst = Math.random() < personality.burstChance
              return (isBurst ? 6 + Math.random() * 6 : 1.6 + Math.random() * 2) * personality.pace * STEP_SCALE
            }
            // The one seat we already know is winning (replay only - live
            // draws don't get told early): for real thrill it has to be
            // able to actually lose the lead, not just visibly cruise on
            // rails, so up to SURGE_START_FRAC of the clock it races on the
            // exact same random walk as everyone else - lucky bursts from
            // the pack can and do put it behind. Only past that point does
            // it switch to a guaranteed curve from wherever it actually
            // ended up, up to 100, timed to land exactly as the clock hits
            // SPIN_DURATION_S - a real final push sized to whatever gap it
            // happens to be facing, not a fixed dramatic leap. It's not
            // marked as "the winner" visually yet (isWinner stays false
            // until resolved) either way, so none of this spoils anything.
            if (seatNumber === plannedWinnerSeat) {
              if (elapsedFrac < SURGE_START_FRAC) {
                next[seatNumber] = Math.min(80, current + rolledStep())
                continue
              }
              if (!winnerSurgeStartRef.current) {
                winnerSurgeStartRef.current = { frac: elapsedFrac, pos: current }
              }
              const { frac: startFrac, pos: startPos } = winnerSurgeStartRef.current
              const surgeFrac = (elapsedFrac - startFrac) / Math.max(0.0001, 1 - startFrac)
              next[seatNumber] = startPos + (100 - startPos) * plannedWinnerProgress(surgeFrac, personality.easingPower)
              continue
            }
            next[seatNumber] = Math.min(80, current + rolledStep())
          }
          return next
        })
      }, 380)
      return () => clearInterval(tickRef.current)
    }

    if (stage.phase === 'resolved') {
      clearInterval(tickRef.current)
      if (stage.seatNumber != null) {
        const wasPlanned = plannedWinnerRef.current != null && plannedWinnerRef.current === stage.seatNumber
        const startPos = positionsRef.current[stage.seatNumber] ?? 4
        const distance = Math.max(0, 100 - startPos)
        if (wasPlanned) {
          // Replay: this seat was already gliding toward 100 on its own
          // deterministic curve throughout spinning (see plannedWinnerSeat
          // above) and should be at or essentially at the line already -
          // just a quick, fixed snap to close any last fraction of a
          // percent left by tick rounding, not a real "finish."
          setFinishDurationS(0.35)
        } else {
          const personality = personalityRef.current[stage.seatNumber] ?? { pace: 1, burstChance: 0.14 }
          // Live draw (or a prize a replay didn't pre-plan): the server
          // only names the winner once the spin is already over, so it
          // could be anywhere in the pack at this instant. Only a little
          // faster than this duck's own cruising speed (1.25x) - a
          // believable last push, not a different animation entirely.
          // Floor keeps a duck that's basically already at the line from
          // sitting through a near-zero-distance "transition" that reads
          // as a pause. Ceiling is a last resort, not a pacing choice: the
          // caller only holds each result on screen for REVEAL_HOLD_MS
          // (10s, see RaffleDetailPage) before starting the next round, so
          // a duck that was both far back and slow-paced needs *some* cap
          // or it gets cut off mid-glide - 8.5s leaves it enough headroom
          // to actually finish. It rarely binds; most finishes are well
          // under it.
          const finishSpeed = cruiseSpeedPercentPerSec(personality) * 1.25
          setFinishDurationS(Math.min(8.5, Math.max(0.45, distance / finishSpeed)))
        }
      }
      setPositions((prev) => ({ ...prev, [stage.seatNumber]: 100 }))
    }
    return undefined
  }, [stage.phase, stage.seatNumber, pool])

  const isSpinning = stage.phase === 'spinning'
  const isResolved = stage.phase === 'resolved'

  // Whoever is currently out in front gets their lane lit up. Only shown
  // once someone has actually pulled ahead of the pack.
  const leaderSeat = useMemo(() => {
    if (isResolved) return stage.seatNumber
    let best = null
    let bestPos = 4.5
    for (const seatNumber of pool) {
      const pos = positions[seatNumber] ?? 4
      if (pos > bestPos) {
        best = seatNumber
        bestPos = pos
      }
    }
    return best
  }, [isResolved, stage.seatNumber, pool, positions])

  return (
    <div className="raffle-race-pond" data-phase={stage.phase} data-density={densityFor(pool.length)} role="group" aria-label="Duck race">
      <div className="raffle-race-bank" aria-hidden="true">
        <div className="raffle-race-layer raffle-race-layer-bushes" />
        <div className="raffle-race-layer raffle-race-layer-tufts" />
        <div className="raffle-race-bank-edge">
          <div className="raffle-race-layer raffle-race-layer-pebbles" />
        </div>
        <span className="raffle-race-title">Duck Race!</span>
        <RaceClock running={isSpinning} />
      </div>

      <div className="raffle-race-water">
        <div className="raffle-race-water-fx" aria-hidden="true">
          <div className="raffle-race-layer raffle-race-layer-wave-a" />
          <div className="raffle-race-layer raffle-race-layer-wave-b" />
          <div className="raffle-race-layer raffle-race-layer-glints" />
          <div className="raffle-race-layer raffle-race-layer-lilies" />
        </div>

        <div className="raffle-race-finish" aria-hidden="true" />

        <ol className="raffle-race-lanes">
          {pool.map((seatNumber) => {
            const isWinner = isResolved && stage.seatNumber === seatNumber
            const isLeader = leaderSeat === seatNumber
            const look = getDuckLook(seatNumber)
            const style = {
              left: `${positions[seatNumber] ?? 4}%`,
              // Each duck bobs on its own rhythm so the field never pulses in unison.
              '--bob-dur': `${(0.72 + ((seatNumber * 37) % 40) / 100).toFixed(2)}s`,
              '--bob-delay': `-${(((seatNumber * 53) % 100) / 100).toFixed(2)}s`,
              ...(isWinner ? { '--finish-dur': `${finishDurationS.toFixed(2)}s` } : null),
            }
            return (
              <li key={seatNumber} className={`raffle-race-lane${isLeader ? ' raffle-race-lane-leading' : ''}${isWinner ? ' raffle-race-lane-winner' : ''}`}>
                <div className="raffle-race-name">
                  <span className="raffle-race-name-num">#{seatNumber}</span>
                  <span className="raffle-race-name-text" title={look.name}>
                    {reserverNameBySeat?.get(seatNumber) || look.name}
                  </span>
                </div>
                <div className="raffle-race-run">
                  <div className={`raffle-race-duck${isWinner ? ' raffle-race-duck-winner' : ''}`} style={style}>
                    <span className="raffle-race-wake" aria-hidden="true" />
                    <span className="raffle-race-ripple" aria-hidden="true" />
                    <span className="raffle-race-bob">
                      <RaffleDuckSprite seat={seatNumber} look={look} winner={isWinner} />
                    </span>
                    {isWinner && (
                      <span className="raffle-race-sparks" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {isResolved && (
        <div className="raffle-race-confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              style={{
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
                '--spin': `${c.spin}deg`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Stopwatch in the corner of the bank - runs while the ducks are racing,
// freezes on the finishing time once the winner is known. Purely decorative
// (aria-hidden): a screen reader shouldn't be read a value that changes ten
// times a second.
function RaceClock({ running }) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!running) return undefined
    const startedAt = performance.now()
    const id = setInterval(() => setElapsedMs(performance.now() - startedAt), 100)
    return () => clearInterval(id)
  }, [running])

  const tenths = Math.floor(elapsedMs / 100)
  const mm = String(Math.floor(tenths / 600)).padStart(2, '0')
  const ss = String(Math.floor((tenths % 600) / 10)).padStart(2, '0')
  return (
    <span className="raffle-race-clock" aria-hidden="true">
      {mm}:{ss}.{tenths % 10}
    </span>
  )
}
