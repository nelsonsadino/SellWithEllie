import * as signalR from '@microsoft/signalr'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cancelMyReservation, drawRaffleWinner, getRaffle, reserveSeats, revealNextRafflePrize } from '../api/raffles'
import { API_ROOT_URL, getToken } from '../api/client'
import RaffleChat from '../components/RaffleChat'
import { statusInfo } from '../components/RaffleCard'
import RaffleDuckRaceDraw from '../components/RaffleDuckRaceDraw'
import RaffleDuckSprite from '../components/RaffleDuckSprite'
import RaffleInstantDraw from '../components/RaffleInstantDraw'
import RaffleSeatIcon from '../components/RaffleSeatIcon'
import RaffleWheelDraw from '../components/RaffleWheelDraw'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { useCurrency, useTenant } from '../context/TenantContext'
import { useToast } from '../context/ToastContext'
import { getDuckLook } from '../lib/duckRoster'

const DRAW_MODE_LABELS = {
  Instant: 'Instant reveal',
  Wheel: 'Spin the wheel',
  DuckRace: 'Duck race',
  LastManStanding: 'Last man standing',
}

// How long the winner announcement (banner text, toast, seat-grid lock,
// prize list update) stays on screen before the next round is eligible to
// start. Purely a "give people time to read it" pause now - see
// WHEEL_SETTLE_MS below for what makes sure the wheel has actually stopped
// turning before that announcement appears in the first place. Starts
// counting the instant the result is decided, in parallel with (not after)
// DuckRace's own finish-line glide - see the cap in RaffleDuckRaceDraw,
// sized to comfortably fit inside this window.
const REVEAL_HOLD_MS = 10000
// Matches theme.css .raffle-wheel-settling's 4.2s transition (plus a small
// buffer for layout/paint) - like a real raffle wheel, the winner isn't
// announced until the wheel has visibly finished spinning down, not the
// instant the server decides the result. Only Wheel mode needs this; every
// other draw mode's own settle (a seat snapping to the finish line, an
// instant-reveal card appearing) is fast enough to announce immediately.
const WHEEL_SETTLE_MS = 4300
// Matches server/Services/RaffleDrawTiming.cs RevealStepSeconds - used only
// to pace the client-only replay simulation (see startReplay below), which
// has no server events to follow.
const REPLAY_STEP_MS = 15000

function ordinal(n) {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

// Patches the local seat array + recomputes the summary counts that the
// header displays, so a SignalR event never has to carry a full re-fetch.
function applySeatStatuses(raffle, seatNumbers, newStatus) {
  if (!raffle) return raffle
  const set = new Set(seatNumbers)
  const seats = raffle.seats.map((s) => (set.has(s.seatNumber) ? { ...s, status: newStatus, isMine: newStatus === 'Available' ? false : s.isMine } : s))
  return {
    ...raffle,
    seats,
    availableSeatCount: seats.filter((s) => s.status === 'Available').length,
    reservedSeatCount: seats.filter((s) => s.status === 'Reserved').length,
    paidSeatCount: seats.filter((s) => s.status === 'Paid').length,
  }
}

export default function RaffleDetailPage() {
  const money = useCurrency()
  const { id } = useParams()
  const raffleId = Number(id)
  const [raffle, setRaffle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(() => new Set())
  const [showReserveForm, setShowReserveForm] = useState(false)
  const [reserveForm, setReserveForm] = useState({ shippingName: '', shippingAddress: '' })
  const [reserving, setReserving] = useState(false)
  // drawStage: null (no draw in progress) | { phase: 'spinning' } | { phase:
  // 'resolved', rank, seatNumber, winnerDisplayName, description }. Always a
  // dramatization of a result the server already decided - never a second,
  // possibly-different local guess.
  const [drawStage, setDrawStage] = useState(null)
  // The current round's contestant pool (paid seat numbers), frozen for the
  // duration of one reveal step so the Wheel/DuckRace animations have a
  // stable list to land on, then shrunk by the just-revealed winner before
  // the next round's spin starts - mirrors the backend's own pool-shrinking rule.
  const [roundPool, setRoundPool] = useState([])
  const [chasingSeat, setChasingSeat] = useState(null)
  // The PrizeRevealed payload once it's actually ready to be announced
  // (banner text, toast, seat-grid lock, prize list) - null while a Wheel
  // round is still visibly spinning down toward it. Holding the raw payload
  // here (not just a boolean) means every new reveal is a distinct object
  // reference, so consecutive reveals always register as a change even when
  // announced back-to-back with no render in between.
  const [announcedReveal, setAnnouncedReveal] = useState(null)
  // The server fires RaffleDrawn immediately after the FINAL PrizeRevealed,
  // with no gap between them - so if that last round's own settle/hold
  // timeline (see the announcedReveal effect below) hasn't finished yet,
  // reacting to RaffleDrawn right away would cut its Wheel animation off
  // before it even starts settling. This flag defers the "sequence
  // complete" refetch/cleanup until that timeline finishes on its own.
  const raffleDrawnPendingRef = useRef(false)
  // raffle.drawMode never changes after a raffle is created, but the
  // SignalR handlers below are set up once (on mount) and would otherwise
  // close over a stale `raffle` that's still null at that point - this ref
  // stays current across renders so the handlers can read it later.
  const drawModeRef = useRef(null)
  // Whether THIS tab's SignalR connection has actually joined the raffle's
  // group yet. The draw can only be triggered once this is true - starting
  // the draw before the viewer who's about to trigger it is even listening
  // means they'd miss RaffleDrawStarted and the first PrizeRevealed (which
  // fire within milliseconds of each other), landing on the finished result
  // with nothing to watch. Admin's own "start the draw" action lives here
  // instead of on the admin table specifically so it can be gated on this.
  const [connectedToLive, setConnectedToLive] = useState(false)
  // Exposed to <RaffleChat> below so it reuses this connection instead of
  // opening a second one to the same group - see AuctionChat's fuller
  // comment on why this matters under many concurrent viewers.
  const [connection, setConnection] = useState(null)
  const [drawing, setDrawing] = useState(false)
  // Loading flag for the "reveal next prize" click - a separate action from
  // drawing (which only computes+commits winners) now that each prize's
  // race is its own admin-triggered step.
  const [revealingNext, setRevealingNext] = useState(false)
  // Replays are entirely client-side re-dramatizations of a result that's
  // already persisted in raffle.prizes - no server call, no new events.
  // replayTokenRef guards against a stale timer chain (from a stopped or
  // superseded replay) still writing state after the fact: each async step
  // checks its captured token against the current one before touching state.
  const [isReplaying, setIsReplaying] = useState(false)
  const replayTokenRef = useRef(0)
  const { isAuthenticated, isAdmin, user } = useAuth()
  const { tenant } = useTenant()
  const { showToast } = useToast()
  const confirm = useConfirm()

  const load = () => getRaffle(raffleId).then((data) => setRaffle(data))

  useEffect(() => {
    drawModeRef.current = raffle?.drawMode ?? null
  }, [raffle?.drawMode])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    getRaffle(raffleId)
      .then((data) => {
        if (!ignore) setRaffle(data)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [raffleId])

  useEffect(() => {
    // JoinRaffle/LeaveRaffle take (tenantId, raffleId) - mirrors the auction
    // hub's group scoping so one shop's raffle activity can never leak into
    // another's, even on a raw WebSocket with no per-connection tenant.
    if (!tenant?.id) return undefined

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_ROOT_URL}/hubs/raffle`, { accessTokenFactory: () => getToken() || '' })
      .withAutomaticReconnect()
      .build()

    connection.on('SeatsReserved', (payload) => {
      if (payload.raffleId !== raffleId) return
      setRaffle((prev) => applySeatStatuses(prev, payload.seatNumbers, 'Reserved'))
    })
    connection.on('SeatsPaid', (payload) => {
      if (payload.raffleId !== raffleId) return
      setRaffle((prev) => applySeatStatuses(prev, payload.seatNumbers, 'Paid'))
    })
    connection.on('SeatsReleased', (payload) => {
      if (payload.raffleId !== raffleId) return
      setRaffle((prev) => applySeatStatuses(prev, payload.seatNumbers, 'Available'))
    })
    connection.on('RaffleReadyToDraw', (payload) => {
      if (payload.raffleId !== raffleId) return
      setRaffle((prev) => (prev ? { ...prev, status: 'ReadyToDraw' } : prev))
    })
    connection.on('RaffleForceClosed', (payload) => {
      if (payload.raffleId !== raffleId) return
      setRaffle((prev) => {
        if (!prev) return prev
        const patched = applySeatStatuses(prev, payload.forfeitedSeatNumbers, 'Forfeited')
        return { ...patched, status: 'ReadyToDraw' }
      })
    })
    connection.on('RaffleDrawStarted', (payload) => {
      // Winners are computed and committed now, but nothing is revealed yet
      // - the admin triggers each prize's race individually from here on
      // (see RoundStarted below), so this just flips status and readies the
      // contestant pool without starting any animation.
      if (payload.raffleId !== raffleId) return
      setRaffle((prev) => {
        if (!prev) return prev
        setRoundPool(prev.seats.filter((s) => s.status === 'Paid').map((s) => s.seatNumber))
        return { ...prev, status: 'Drawn', revealedPrizeCount: 0 }
      })
      setAnnouncedReveal(null)
      raffleDrawnPendingRef.current = false
    })
    connection.on('RoundStarted', (payload) => {
      // Broadcast the instant the admin clicks "reveal next prize" - the
      // actual PrizeRevealed lands a few seconds later, giving the Wheel/
      // DuckRace/LastManStanding animation room to play out first.
      if (payload.raffleId !== raffleId) return
      setDrawStage({ phase: 'spinning' })
    })
    connection.on('PrizeRevealed', (payload) => {
      if (payload.raffleId !== raffleId) return
      // The result is known now, and the Wheel/DuckRace/Instant component
      // needs it immediately to know what to animate toward - but the
      // ANNOUNCEMENT (below) is deliberately separate, so a Wheel round
      // doesn't say who won while it's still visibly spinning.
      setDrawStage({
        phase: 'resolved',
        rank: payload.rank,
        seatNumber: payload.seatNumber,
        winnerDisplayName: payload.winnerDisplayName,
        description: payload.description,
      })
      if (drawModeRef.current === 'Wheel' && payload.seatNumber != null) {
        setTimeout(() => setAnnouncedReveal(payload), WHEEL_SETTLE_MS)
      } else {
        setAnnouncedReveal(payload)
      }
    })
    connection.on('RaffleDrawn', (payload) => {
      if (payload.raffleId !== raffleId) return
      // Don't clear/refetch immediately - see raffleDrawnPendingRef's
      // comment. The announcedReveal effect's own hold-timer picks this up
      // once the final round's settle+announcement has actually played out.
      raffleDrawnPendingRef.current = true
    })
    connection.on('RaffleCancelled', (payload) => {
      if (payload.raffleId !== raffleId) return
      setRaffle((prev) => (prev ? { ...prev, status: 'Cancelled' } : prev))
    })
    connection.on('RaffleReopened', (payload) => {
      if (payload.raffleId !== raffleId) return
      // Which specific seats came back from Forfeited isn't in this
      // payload, so a full refetch is simplest and correct here.
      load()
    })

    connection
      .start()
      .then(() => connection.invoke('JoinRaffle', tenant.id, raffleId))
      .then(() => setConnectedToLive(true))
      .catch(() => {
        /* live updates are a nice-to-have; the page still works without them,
           except the "start the draw" action below, which deliberately stays
           disabled until this succeeds - see connectedToLive above. */
      })

    connection.onreconnecting(() => setConnectedToLive(false))
    connection.onreconnected(() => connection.invoke('JoinRaffle', tenant.id, raffleId).then(() => setConnectedToLive(true)))

    setConnection(connection)

    return () => {
      connection.stop()
      setConnectedToLive(false)
      setConnection(null)
    }
  }, [raffleId, tenant?.id])

  // Applies a reveal once it's actually ready to be announced (immediately
  // for every mode but Wheel, after WHEEL_SETTLE_MS for Wheel - see the
  // PrizeRevealed handler above): updates raffle.prizes/revealedPrizeCount,
  // fires the congratulations toast, then holds for REVEAL_HOLD_MS before
  // clearing drawStage back to idle so the next round can start.
  useEffect(() => {
    if (!announcedReveal) return undefined
    const payload = announcedReveal

    setRaffle((prev) => {
      if (!prev) return prev
      const prizes = prev.prizes.map((p) =>
        p.rank === payload.rank
          ? { ...p, winningSeatNumber: payload.seatNumber, winnerDisplayName: payload.winnerDisplayName }
          : p
      )
      return { ...prev, prizes, revealedPrizeCount: (prev.revealedPrizeCount ?? 0) + 1 }
    })

    if (payload.seatNumber != null) {
      showToast(
        `🎉 Congratulations ${payload.winnerDisplayName ?? 'to our winner'}! Seat #${payload.seatNumber} takes the ${ordinal(payload.rank)} prize — ${payload.description}.`,
        'success'
      )
    }

    const timer = setTimeout(() => {
      setRoundPool((prev) => (payload.seatNumber ? prev.filter((n) => n !== payload.seatNumber) : prev))
      setChasingSeat(null)
      setDrawStage((prev) => (prev?.rank === payload.rank ? null : prev))
      setAnnouncedReveal(null)
      if (raffleDrawnPendingRef.current) {
        raffleDrawnPendingRef.current = false
        load() // full refetch as a consistency safety-net now that the sequence has actually finished displaying
      }
    }, REVEAL_HOLD_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcedReveal])

  // Last Man Standing's visual lives in the main seat grid itself (seats
  // getting "chased"/eliminated), so this just cycles which contestant is
  // currently highlighted while a round is spinning - purely decorative,
  // the real winner only ever comes from the PrizeRevealed event above.
  useEffect(() => {
    if (raffle?.drawMode !== 'LastManStanding' || drawStage?.phase !== 'spinning' || roundPool.length === 0) {
      return undefined
    }
    let i = 0
    const interval = setInterval(() => {
      setChasingSeat(roundPool[i % roundPool.length])
      i += 1
    }, 180)
    return () => clearInterval(interval)
  }, [raffle?.drawMode, drawStage?.phase, roundPool])

  const toggleSeat = (seat) => {
    if (raffle?.status !== 'Open' || seat.status !== 'Available') return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(seat.seatNumber)) next.delete(seat.seatNumber)
      else next.add(seat.seatNumber)
      return next
    })
  }

  const total = useMemo(() => (raffle ? selected.size * raffle.seatPrice : 0), [selected, raffle])

  const openReserveForm = () => {
    if (!isAuthenticated) {
      showToast('Please log in to reserve seats.', 'error')
      return
    }
    if (selected.size === 0) {
      showToast('Pick at least one seat first.', 'error')
      return
    }
    setReserveForm({ shippingName: user?.displayName || '', shippingAddress: '' })
    setShowReserveForm(true)
  }

  const handleReserve = async (e) => {
    e.preventDefault()
    setReserving(true)
    try {
      await reserveSeats(raffleId, {
        seatNumbers: Array.from(selected),
        shippingName: reserveForm.shippingName,
        shippingAddress: reserveForm.shippingAddress,
        returnUrlBase: window.location.origin,
      })
      showToast('Seats reserved! Pay now or pay later from this page.', 'success')
      setSelected(new Set())
      setShowReserveForm(false)
      await load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setReserving(false)
    }
  }

  const handleCancelReservation = async (orderId) => {
    try {
      await cancelMyReservation(raffleId, orderId)
      showToast('Reservation cancelled — those seats are free again.', 'success')
      await load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  // Deliberately lives here (not on the admin table) and is gated on
  // connectedToLive - see that state's comment for why triggering the draw
  // before this tab's own SignalR connection has joined would make the
  // person who just clicked it miss their own animation.
  const handleStartDraw = async () => {
    const prizeCount = raffle.prizes.length
    const ok = await confirm({
      title: 'Draw winners?',
      body: `This will compute winners for all ${prizeCount} prize(s) now (mode: ${DRAW_MODE_LABELS[raffle.drawMode] ?? raffle.drawMode}). You'll then reveal them live, one prize at a time, whenever you're ready. This cannot be undone.`,
      confirmLabel: 'Start the draw',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!ok) return
    setDrawing(true)
    try {
      await drawRaffleWinner(raffleId)
    } catch (err) {
      showToast(err.message, 'error')
      setDrawing(false)
    }
    // Left `drawing` true on success - the RaffleDrawStarted handler above
    // takes over the page's state from here.
  }

  // The per-prize "race" trigger - fires the next prize's reveal (lowest
  // rank first). Lives here (not the admin table) for the same reason as
  // handleStartDraw: gated on connectedToLive so the admin's own click never
  // misses its own animation.
  const handleRevealNext = async () => {
    setRevealingNext(true)
    try {
      await revealNextRafflePrize(raffleId)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setRevealingNext(false)
    }
  }

  useEffect(() => {
    // Invalidate any in-flight replay's timer chain when the page unmounts
    // (e.g. the viewer navigates away mid-replay) so it can't call setState
    // on a gone component.
    return () => {
      replayTokenRef.current += 1
    }
  }, [])

  const stopReplay = () => {
    replayTokenRef.current += 1
    setIsReplaying(false)
    setDrawStage(null)
    setRoundPool([])
    setChasingSeat(null)
    setAnnouncedReveal(null)
  }

  // Re-drives the exact same drawStage/roundPool state machine the live
  // RaffleDrawStarted/PrizeRevealed handlers use, but sourced from
  // raffle.prizes (already persisted) via local setTimeouts instead of
  // SignalR events - so every animation component just replays unchanged.
  // Order matches the server's own reveal order: lowest rank (least
  // prestigious prize) first, building up to the top prize last.
  const startReplay = async () => {
    if (isReplaying || raffle.status !== 'Drawn' || raffle.revealedPrizeCount < raffle.prizes.length) return
    const token = (replayTokenRef.current += 1)
    setIsReplaying(true)
    const orderedPrizes = [...raffle.prizes].sort((a, b) => b.rank - a.rank)
    let pool = raffle.seats.filter((s) => s.status === 'Paid').map((s) => s.seatNumber)
    setRoundPool(pool)
    for (const prize of orderedPrizes) {
      if (replayTokenRef.current !== token) return
      // Replay already knows the outcome (it's replaying a finished raffle),
      // unlike a live draw where the server only tells the client once the
      // spin is over. Passing it through now (RaffleDuckRaceDraw reads
      // plannedWinnerSeat) lets that duck's whole run be planned to land on
      // the line exactly as the spin ends, instead of jumping there after -
      // still not announced/highlighted until the real reveal below, so the
      // replay still plays out as if it were live.
      setDrawStage({ phase: 'spinning', plannedWinnerSeat: prize.winningSeatNumber ?? null })
      setAnnouncedReveal(null)
      await new Promise((resolve) => setTimeout(resolve, REPLAY_STEP_MS))
      if (replayTokenRef.current !== token) return
      const resolvedStage = {
        phase: 'resolved',
        rank: prize.rank,
        seatNumber: prize.winningSeatNumber ?? null,
        winnerDisplayName: prize.winnerDisplayName,
        description: prize.description,
      }
      setDrawStage(resolvedStage)
      // Same rule as the live path: a Wheel round isn't announced until it's
      // had time to actually finish spinning down.
      if (raffle.drawMode === 'Wheel' && resolvedStage.seatNumber != null) {
        await new Promise((resolve) => setTimeout(resolve, WHEEL_SETTLE_MS))
        if (replayTokenRef.current !== token) return
      }
      setAnnouncedReveal(resolvedStage)
      if (resolvedStage.seatNumber != null) {
        showToast(
          `🎉 Congratulations ${resolvedStage.winnerDisplayName ?? 'to our winner'}! Seat #${resolvedStage.seatNumber} took the ${ordinal(resolvedStage.rank)} prize — ${resolvedStage.description}.`,
          'success'
        )
      }
      await new Promise((resolve) => setTimeout(resolve, REVEAL_HOLD_MS))
      if (replayTokenRef.current !== token) return
      if (prize.winningSeatNumber != null) pool = pool.filter((n) => n !== prize.winningSeatNumber)
      setRoundPool(pool)
      setChasingSeat(null)
      setAnnouncedReveal(null)
    }
    if (replayTokenRef.current === token) {
      setDrawStage(null)
      setRoundPool([])
      setIsReplaying(false)
    }
  }

  if (loading) {
    return (
      <div className="container section">
        <Spinner />
      </div>
    )
  }

  if (!raffle) {
    return (
      <div className="container section empty-state">
        <h2>Raffle not found</h2>
        <Link to="/raffles" className="btn btn-primary">
          Back to raffles
        </Link>
      </div>
    )
  }

  const seatClass = (seat) => {
    if (seat.status === 'Available') return 'raffle-seat raffle-seat-available'
    if (seat.status === 'Paid') return `raffle-seat raffle-seat-paid${seat.isMine ? ' raffle-seat-mine' : ''}`
    if (seat.status === 'Reserved') return `raffle-seat raffle-seat-reserved${seat.isMine ? ' raffle-seat-mine' : ''}`
    return 'raffle-seat raffle-seat-forfeited'
  }

  const lockedRankBySeat = new Map(
    raffle.prizes.filter((p) => p.winningSeatNumber != null).map((p) => [p.winningSeatNumber, p.rank])
  )
  // Lets the duck race lanes (and anything else that only gets a bare seat
  // number, not the full seat object) show whose duck is whose.
  const reserverNameBySeat = new Map(raffle.seats.map((s) => [s.seatNumber, s.reservedByDisplayName ?? null]))

  // Reveal order is lowest rank first (mirrors the server) - used to tell
  // "not yet revealed" apart from "revealed, but no paid seat to award it
  // to" for prizes with no winner, and to know which prize is up next.
  const revealOrderedPrizes = [...raffle.prizes].sort((a, b) => b.rank - a.rank)
  const revealIndexByRank = new Map(revealOrderedPrizes.map((p, i) => [p.rank, i]))
  const allPrizesRevealed = raffle.prizes.length > 0 && (raffle.revealedPrizeCount ?? 0) >= raffle.prizes.length
  const nextPrize = revealOrderedPrizes[raffle.revealedPrizeCount ?? 0]
  // Reserve-seat panel only has anything to show while seats are still open
  // to buy or the caller already holds some - once a raffle is drawn (and
  // chat has moved to its own full-width section below) there's nothing
  // left for the side column, so the main column spans the full row instead
  // of leaving dead grid space where the panel used to be.
  const showSidePanel = raffle.status === 'Open' || raffle.myReservations?.length > 0

  return (
    <>
    <div className="container section auction-detail">
      <div className={`auction-detail-main${showSidePanel ? '' : ' auction-detail-main-full'}`}>
        <div>
          <h1>{raffle.title}</h1>
          <p className={`badge raffle-status-${statusInfo(raffle).key}`}>{statusInfo(raffle).label}</p>
          {isAdmin && raffle.status === 'ReadyToDraw' && (
            <div className="callout">
              <p>
                All prizes are ready to draw.{' '}
                {connectedToLive
                  ? "You're connected live — starting the draw here means you'll see every reveal as it happens."
                  : 'Connecting to live updates…'}
              </p>
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleStartDraw}
                disabled={!connectedToLive || drawing}
              >
                {drawing ? 'Drawing…' : 'Start the draw'}
              </button>
            </div>
          )}
          {raffle.prizes.map((p) => {
            const isRevealed = (revealIndexByRank.get(p.rank) ?? -1) < (raffle.revealedPrizeCount ?? 0)
            return (
              <p key={p.rank}>
                {ordinal(p.rank)} prize: <strong>{p.description}</strong>
                {p.winnerDisplayName || p.winningSeatNumber ? (
                  <> — 🎉 congratulations {p.winnerDisplayName ?? 'to our winner'} (seat #{p.winningSeatNumber})!</>
                ) : isRevealed ? (
                  <> — not awarded</>
                ) : raffle.status === 'Drawn' ? (
                  <> — reveal pending</>
                ) : null}
              </p>
            )
          })}
          <p className="pet-card-meta">
            {money(raffle.seatPrice)} per seat &middot; {raffle.paidSeatCount}/{raffle.seatCount} seats paid &middot;{' '}
            {DRAW_MODE_LABELS[raffle.drawMode] ?? raffle.drawMode}
          </p>
          {raffle.scheduledDrawAtUtc && (raffle.status === 'Open' || raffle.status === 'ReadyToDraw') && (
            <p className="hint">Drawing on {new Date(raffle.scheduledDrawAtUtc).toLocaleString()}</p>
          )}

          {drawStage && (
            <div className="raffle-draw-stage">
              <p className="raffle-draw-status">
                {drawStage.phase === 'resolved' && announcedReveal?.rank === drawStage.rank
                  ? drawStage.seatNumber != null
                    ? `🎉 Congratulations, ${drawStage.winnerDisplayName ?? 'our winner'}! Seat #${drawStage.seatNumber} wins the ${ordinal(drawStage.rank)} prize — ${drawStage.description}.`
                    : `${ordinal(drawStage.rank)} prize — not awarded (fewer paid seats than prizes)`
                  : drawStage.phase === 'resolved'
                    ? 'Landing on the winner…'
                    : 'Drawing...'}
              </p>
              {/* An unfilled prize (fewer paid seats than prizes) has no real
                  seat to land the wheel/race on - the status line above
                  already says "not awarded" plainly rather than leaving the
                  animation visually stuck mid-spin with nothing to settle on. */}
              {drawStage.phase === 'resolved' && drawStage.seatNumber == null ? null : (
                <>
                  {raffle.drawMode === 'Wheel' && (
                    <RaffleWheelDraw pool={roundPool} stage={drawStage} reserverNameBySeat={reserverNameBySeat} />
                  )}
                  {raffle.drawMode === 'DuckRace' && (
                    <RaffleDuckRaceDraw pool={roundPool} stage={drawStage} reserverNameBySeat={reserverNameBySeat} />
                  )}
                  {raffle.drawMode === 'Instant' && <RaffleInstantDraw pool={roundPool} stage={drawStage} />}
                  {raffle.drawMode === 'LastManStanding' && (
                    <p className="hint">Watch the seats below — eliminating contenders live.</p>
                  )}
                </>
              )}
            </div>
          )}
          {!drawStage && raffle.status === 'Drawn' && !isReplaying && !allPrizesRevealed && (
            <div className="callout">
              <p>
                Up next: the {ordinal(nextPrize?.rank ?? 0)} prize — <strong>{nextPrize?.description}</strong>.{' '}
                {isAdmin
                  ? connectedToLive
                    ? 'Ready when you are.'
                    : 'Connecting to live updates…'
                  : 'Waiting for the shop to start the next reveal.'}
              </p>
              {isAdmin && (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleRevealNext}
                  disabled={!connectedToLive || revealingNext}
                >
                  {revealingNext ? 'Starting…' : `Reveal the ${ordinal(nextPrize?.rank ?? 0)} prize`}
                </button>
              )}
            </div>
          )}
          {!drawStage && raffle.status === 'Drawn' && !isReplaying && allPrizesRevealed && (
            <div className="callout callout-success">
              <p>🏆 This raffle has been drawn — see the prize list above for winners.</p>
              <button className="btn btn-secondary" type="button" onClick={startReplay}>
                ▶ Watch replay
              </button>
            </div>
          )}
          {isReplaying && (
            <div className="callout">
              <p>Replaying the draw…</p>
              <button className="btn btn-ghost" type="button" onClick={stopReplay}>
                Stop replay
              </button>
            </div>
          )}
          {raffle.status === 'Cancelled' && (
            <div className="callout">
              <p>This raffle was cancelled.</p>
            </div>
          )}

          <div className="raffle-seat-grid">
            {raffle.seats.map((seat) => {
              const lockedRank = lockedRankBySeat.get(seat.seatNumber)
              const isChasing = raffle.drawMode === 'LastManStanding' && chasingSeat === seat.seatNumber
              const classes = [
                seatClass(seat),
                selected.has(seat.seatNumber) ? 'raffle-seat-selected' : '',
                isChasing ? 'raffle-seat-chasing' : '',
                lockedRank ? 'raffle-seat-locked' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={seat.id}
                  type="button"
                  className={classes}
                  disabled={raffle.status !== 'Open' || seat.status !== 'Available'}
                  onClick={() => toggleSeat(seat)}
                  title={
                    seat.reservedByDisplayName
                      ? `Seat #${seat.seatNumber} — ${seat.status} by ${seat.reservedByDisplayName}`
                      : `Seat #${seat.seatNumber} — ${seat.status}`
                  }
                  data-rank={lockedRank ? ordinal(lockedRank) : undefined}
                >
                  {raffle.drawMode === 'DuckRace' ? (
                    <span className="raffle-seat-duck-icon">
                      <RaffleDuckSprite seat={seat.seatNumber} look={getDuckLook(seat.seatNumber)} />
                    </span>
                  ) : (
                    <RaffleSeatIcon className="raffle-seat-icon" />
                  )}
                  <span>{seat.seatNumber}</span>
                  {seat.reservedByDisplayName && <span className="raffle-seat-reserver">{seat.reservedByDisplayName}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {showSidePanel && (
      <div className="auction-detail-panel">
        {raffle.status === 'Open' && !showReserveForm && (
          <>
            <p className="auction-current-price-large">
              {selected.size} seat{selected.size === 1 ? '' : 's'} selected — <strong>{money(total)}</strong>
            </p>
            {isAuthenticated ? (
              <button className="btn btn-primary btn-block" type="button" onClick={openReserveForm} disabled={selected.size === 0}>
                Reserve selected seats
              </button>
            ) : (
              <Link to="/login" className="btn btn-primary btn-block">
                Log in to reserve seats
              </Link>
            )}
          </>
        )}

        {showReserveForm && (
          <form className="bid-form buyout-form" onSubmit={handleReserve}>
            <p className="hint">
              Reserving holds {selected.size} seat{selected.size === 1 ? '' : 's'} ({money(total)}) for you. You can pay now
              or pay later from this page.
            </p>
            <label htmlFor="reserveShippingName">Full name</label>
            <input
              id="reserveShippingName"
              className="input"
              required
              value={reserveForm.shippingName}
              onChange={(e) => setReserveForm({ ...reserveForm, shippingName: e.target.value })}
            />
            <label htmlFor="reserveShippingAddress">Delivery / pickup address</label>
            <textarea
              id="reserveShippingAddress"
              className="input"
              required
              rows={2}
              value={reserveForm.shippingAddress}
              onChange={(e) => setReserveForm({ ...reserveForm, shippingAddress: e.target.value })}
            />
            <div className="buyout-form-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setShowReserveForm(false)} disabled={reserving}>
                Cancel
              </button>
              <button className="btn btn-accent btn-block" type="submit" disabled={reserving}>
                {reserving ? 'Reserving...' : `Confirm reservation - ${money(total)}`}
              </button>
            </div>
          </form>
        )}

        {raffle.myReservations?.length > 0 && (
          <div className="bid-history">
            <h3>Your seats</h3>
            <ul>
              {raffle.myReservations.map((r) => (
                <li key={r.orderId}>
                  <span>Seats {r.seatNumbers.join(', ')}</span>
                  <span>{money(r.totalAmount)}</span>
                  <span>
                    {r.orderStatus}
                    {r.paymentUrl && (
                      <a className="btn btn-accent btn-small" href={r.paymentUrl} target="_blank" rel="noopener noreferrer">
                        Pay now
                      </a>
                    )}
                    {raffle.status === 'Open' && r.orderStatus === 'AwaitingPayment' && (
                      <button className="btn btn-ghost btn-small" type="button" onClick={() => handleCancelReservation(r.orderId)}>
                        Cancel
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      )}
    </div>

    <div className="container section raffle-chat-section">
      <RaffleChat raffleId={raffleId} connection={connection} />
    </div>
    </>
  )
}
