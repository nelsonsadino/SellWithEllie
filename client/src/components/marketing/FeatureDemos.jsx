import { useEffect, useState } from 'react'
import { MODES, ModeDemo } from '../RaffleModesShowcase'

const DEMO_POOL = [1, 2, 3, 4, 5, 6]
const DEMO_NAMES = new Map([
  [1, 'Maya S.'],
  [2, 'Jon C.'],
  [3, 'Ella R.'],
  [4, 'Ben T.'],
  [5, 'Priya K.'],
  [6, 'Noah D.'],
])

const DEMOS = [
  {
    key: 'listings',
    label: 'Listings & cart',
    title: 'The standard shop, done properly',
    body: 'Browse the catalogue, filter by category, add to cart and check out. Fixed prices, live stock counts, wishlist hearts - the familiar flow, kept separate from auctions so buyers never get confused.',
  },
  {
    key: 'auctions',
    label: 'Live auctions',
    title: 'Bids land in real time',
    body: 'Timed lots with a minimum increment and optional buy-it-now. Every bid updates instantly for everyone watching, and every lot has its own live chat.',
  },
  {
    key: 'raffles',
    label: 'Raffles',
    title: 'Sell seats, draw the winner live',
    body: 'Buyers reserve numbered seats, then you draw live in one of four formats - Duck Race, Spin the Wheel, Instant Reveal or Last Man Standing - and every raffle has its own live chat.',
  },
]

const PRODUCTS = [
  { name: 'Koi Guppy', cat: 'Guppy', price: 14 },
  { name: 'Crowntail Betta', cat: 'Betta', price: 18 },
  { name: 'Black Molly', cat: 'Molly', price: 12 },
]

// Plays like a short screen recording, but it is real markup driven by a
// timer: nothing to host, nothing to go stale, and it always matches the
// product because it *is* the product's own visual language.
function ListingsDemo() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 8), 900)
    return () => clearInterval(id)
  }, [])
  // steps 0-1 browse, 2 hover/click card 0, 3 added, 4 click card 1, 5 added, 6-7 show cart
  const added = step >= 3 ? (step >= 5 ? 2 : 1) : 0
  const clicking = step === 2 ? 0 : step === 4 ? 1 : null
  return (
    <div className="mkt-demo-shop">
      <div className="mkt-demo-shop-bar">
        <span>Shop</span>
        <span className="mkt-demo-shop-cart">
          Cart <b key={added} className="mkt-demo-pop">{added}</b>
        </span>
      </div>
      <div className="mkt-demo-shop-grid">
        {PRODUCTS.map((p, i) => (
          <div key={p.name} className={`mkt-demo-shop-card${clicking === i ? ' is-hover' : ''}`}>
            <div className="mkt-demo-shop-thumb" />
            <small>{p.cat}</small>
            <strong>{p.name}</strong>
            <span>${p.price}.00</span>
            <button type="button" tabIndex={-1} className={added > i ? 'is-done' : ''}>
              {added > i ? 'Added' : 'Add to cart'}
            </button>
          </div>
        ))}
      </div>
      {step >= 6 && <div className="mkt-demo-toast">2 items in your cart - Checkout</div>}
    </div>
  )
}

function AuctionDemo() {
  const [bid, setBid] = useState(1200)
  const [count, setCount] = useState(24)
  const [secs, setSecs] = useState(191)
  const [log, setLog] = useState(['Priya K. bid $1,200.00'])
  useEffect(() => {
    const names = ['Maya S.', 'Jon C.', 'Ella R.', 'Ben T.', 'Priya K.']
    const id = setInterval(() => {
      setBid((b) => {
        const next = b + 20
        setLog((l) => [`${names[Math.floor(Math.random() * names.length)]} bid $${next.toLocaleString()}.00`, ...l].slice(0, 3))
        return next
      })
      setCount((c) => c + 1)
    }, 1600)
    const tick = setInterval(() => setSecs((s) => (s <= 5 ? 191 : s - 1)), 1000)
    return () => {
      clearInterval(id)
      clearInterval(tick)
    }
  }, [])
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return (
    <div className="mkt-demo-auction">
      <div className="mkt-demo-auction-main">
        <span className="mkt-demo-flag">LIVE</span>
        <strong>LOT 014 - Vintage chair</strong>
        <div className="mkt-demo-auction-row">
          <span>Current bid</span>
          <b key={bid} className="mkt-demo-pop">${bid.toLocaleString()}.00</b>
        </div>
        <div className="mkt-demo-auction-row">
          <span>Bids</span>
          <b>{count}</b>
        </div>
        <div className="mkt-demo-auction-row">
          <span>Closes in</span>
          <b className="mkt-demo-live">
            00:{mm}:{ss}
          </b>
        </div>
      </div>
      <ul className="mkt-demo-auction-log" aria-hidden="true">
        {log.map((l, i) => (
          <li key={`${l}-${i}`}>{l}</li>
        ))}
      </ul>
      <ChatStrip kind="auctions" />
    </div>
  )
}

const CHAT = {
  auctions: ['Ben T.: going for it!', 'Maya S.: nice lot', 'Jon C.: bid placed'],
  raffles: ['Ella R.: come on seat 4!', 'Noah D.: good luck all', 'Priya K.: ducks are fast today'],
}

// Same idea as the real per-lot / per-draw chat: messages drift in beside the action.
function ChatStrip({ kind }) {
  const [n, setN] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setN((c) => (c % 3) + 1), 1800)
    return () => clearInterval(id)
  }, [])
  const lines = CHAT[kind]
  return (
    <div className="mkt-demo-chat" aria-hidden="true">
      <b>Live chat</b>
      {lines.slice(0, n).map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  )
}

function RaffleDemo() {
  const [mode, setMode] = useState(MODES[0].key)
  const active = MODES.find((m) => m.key === mode)
  return (
    <div className="mkt-demo-raffle">
      <div className="mkt-demo-modes" role="tablist" aria-label="Raffle draw formats">
        {MODES.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} className={mode === m.key ? 'is-active' : ''} onClick={() => setMode(m.key)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="mkt-demo-mode-blurb">{active.blurb}</p>
      <ModeDemo key={mode} mode={mode} />
      <ChatStrip kind="raffles" />
    </div>
  )
}

export default function FeatureDemos() {
  const [active, setActive] = useState('listings')
  const demo = DEMOS.find((d) => d.key === active)
  return (
    <div className="mkt-demos">
      <div className="mkt-demos-tabs" role="tablist" aria-label="Feature demos">
        {DEMOS.map((d) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            aria-selected={active === d.key}
            className={`mkt-demos-tab${active === d.key ? ' is-active' : ''}`}
            onClick={() => setActive(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="mkt-demos-body" role="tabpanel">
        <div className="mkt-demos-copy">
          <h3>{demo.title}</h3>
          <p>{demo.body}</p>
        </div>
        <div className="mkt-demos-screen" aria-label={`${demo.label} demo`}>
          <div className="mkt-demos-chrome" aria-hidden="true">
            <span />
            <span />
            <span />
            <em>Sample - looping</em>
          </div>
          <div className="mkt-demos-stage">
            {active === 'listings' && <ListingsDemo key="l" />}
            {active === 'auctions' && <AuctionDemo key="a" />}
            {active === 'raffles' && <RaffleDemo key="r" />}
          </div>
        </div>
      </div>
    </div>
  )
}
