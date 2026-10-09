import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMarketingSite } from '../../api/marketing'
import FeatureDemos from '../../components/marketing/FeatureDemos'
import { TEMPLATE_CATALOG } from '../../lib/templateCatalog'

const ROOT = (import.meta.env.VITE_ROOT_DOMAIN || 'sellwithellie.com').trim()

function slugify(v) {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const STEPS = [
  {
    title: 'Claim your address',
    body: `Pick "yourshop.${ROOT}". It's yours in seconds — hosting, SSL and subdomain included.`,
  },
  {
    title: 'Choose a look',
    body: 'Nine designed templates — Pet Shop, Fashion, Tech, Auto Parts, and more. Each is a full type + colour + layout system. Switch anytime.',
  },
  {
    title: 'Add your lots',
    body: 'List a product at a fixed price, or open a timed auction with live bidding. Publish and you are selling.',
  },
]

const FEATURES = [
  {
    title: 'Listing page + add to cart',
    body: 'Searchable listings with categories, multiple photos and video, condition and price. Numbered lots, like a real catalogue.',
  },
  {
    title: 'Real-time auction house',
    body: 'Timed lots, live bids, optional buy-it-now, automatic close — and a market ticker across the top that never sleeps.',
  },
  {
    title: 'Raffles, four ways',
    body: 'Sell numbered seats, then draw the winner live — spin a wheel, race ducks, flip a card, or eliminate seats one at a time. Every draw has its own real-time chat.',
  },
  {
    title: 'Cart & checkout',
    body: 'A standard fixed-price shopping cart, kept separate from auctions so both flows stay simple for buyers.',
  },
  {
    title: 'Editable, no code',
    body: 'Rewrite any label and rearrange the whole home page as stacked blocks — hero, feature grid, gallery, CTA. No deploys, no developer.',
  },
  {
    title: 'Your own admin team',
    body: 'Invite staff as shop admins to manage listings, auctions and orders — scoped to your shop, and nobody else’s.',
  },
  {
    title: 'Your web address',
    body: `Every shop gets "yourshop.${ROOT}" out of the box. Custom domains are on the roadmap.`,
  },
]

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    tagline: 'Get your shop online',
    features: ['Up to 25 product listings', '3 concurrent auctions', 'Cart & checkout', 'All nine templates', 'Community support'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    cadence: 'per month',
    tagline: 'For shops that are growing',
    features: [
      'Unlimited product listings',
      'Unlimited concurrent auctions',
      'Cart & checkout',
      'All nine templates',
      'Priority support',
    ],
    cta: 'Go Pro',
    highlight: true,
  },
]

const FAQ = [
  {
    q: 'Do I need to know how to code?',
    a: 'No. You pick a template, edit text inline, and arrange the home page by dragging blocks. Everything is done from your shop’s admin.',
  },
  {
    q: 'What can I sell?',
    a: 'Anything physical. Categories are free-text, so a pet shop, a vintage-clothing seller, a parts dealer and a model-kit store all fit the same platform.',
  },
  {
    q: 'How do auctions work?',
    a: 'You set a start and end time, a starting price and a minimum increment, with an optional buy-it-now. Bids update live for everyone watching, and the lot closes itself.',
  },
  {
    q: 'How do raffles work?',
    a: 'You price a seat and name the prize (or prizes), buyers reserve and pay for numbered seats, and once they are sold you draw live — pick from four formats (spin the wheel, race ducks, flip a card, or eliminate seats one at a time). Every draw has its own live chat running alongside it.',
  },
  {
    q: 'Can I use my own domain?',
    a: `Your subdomain — yourshop.${ROOT} — is included and works immediately. Custom domains are planned.`,
  },
  {
    q: 'What’s in the Free plan?',
    a: '25 product listings, three auctions running at once, full cart and checkout, and every design template. Upgrade to Pro when you outgrow it.',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [content, setContent] = useState({})
  const [slug, setSlug] = useState('')

  useEffect(() => {
    let ignore = false
    getMarketingSite()
      .then((data) => {
        if (!ignore) setContent(data.content || {})
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  const t = useMemo(
    () => (key, fallback) => {
      const v = content[key]
      return v != null && v !== '' ? v : fallback
    },
    [content]
  )

  const goSignup = (e) => {
    e?.preventDefault()
    const s = slugify(slug)
    navigate(s ? `/signup?shop=${encodeURIComponent(s)}` : '/signup')
  }

  const ClaimField = ({ id }) => (
    <form className="mkt-claim" onSubmit={goSignup}>
      <span className="mkt-claim-field">
        <span className="mkt-claim-proto">https://</span>
        <input
          id={id}
          className="mkt-claim-input"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="your-shop"
          aria-label="Choose your shop address"
          autoComplete="off"
          spellCheck="false"
        />
        <span className="mkt-claim-root">.{ROOT}</span>
      </span>
      <button type="submit" className="btn btn-primary mkt-claim-btn">
        Claim it free →
      </button>
    </form>
  )

  return (
    <div className="mkt">
      {/* ---------------- HERO ---------------- */}
      <section className="mkt-hero">
        <div className="container mkt-hero-inner">
          <div className="mkt-hero-copy">
            <span className="eyebrow eyebrow-live">Listings, auctions &amp; raffles</span>
            <h1 className="mkt-hero-title">{t('hero.title', 'Your shop. Your address. Live today.')}</h1>
            <p className="mkt-hero-lead">
              {t(
                'hero.subtitle',
                `SellWithEllie gives you a full storefront with standard listings and cart, a real-time auction house, and live raffles — all on your own web address, with no code, no designers, and no month-long build.`
              )}
            </p>
            <ClaimField id="claim-hero" />
            <p className="mkt-hero-fineprint">Free forever plan · No card required · Yours in under a minute</p>
          </div>

          {/* on-brand storefront preview */}
          <div className="mkt-preview" aria-hidden="true">
            <div className="mkt-preview-bar">
              <span className="mkt-preview-dot" />
              <span className="mkt-preview-dot" />
              <span className="mkt-preview-dot" />
              <span className="mkt-preview-url">yourshop.{ROOT}</span>
            </div>
            <div className="mkt-preview-ticker">
              <span className="mkt-preview-flag">LIVE</span>
              <span className="mkt-preview-tape">
                LOT 014 &nbsp;VINTAGE CHAIR&nbsp; $240.00 &nbsp;<b>00:12:57</b>&nbsp;&nbsp;·&nbsp;&nbsp; LOT 021 &nbsp;FILM
                CAMERA&nbsp; $85.00 &nbsp;<b>01:40:09</b>
              </span>
            </div>
            <div className="mkt-preview-body">
              <div className="mkt-preview-h">The full catalogue</div>
              <div className="mkt-preview-grid">
                <div className="mkt-preview-card">
                  <div className="mkt-preview-thumb" />
                  <div className="mkt-preview-line" />
                  <div className="mkt-preview-price">$120.00</div>
                </div>
                <div className="mkt-preview-card">
                  <div className="mkt-preview-thumb" />
                  <div className="mkt-preview-line" />
                  <div className="mkt-preview-price">$64.00</div>
                </div>
                <div className="mkt-preview-card">
                  <div className="mkt-preview-thumb" />
                  <div className="mkt-preview-line" />
                  <div className="mkt-preview-price">$310.00</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- PROOF STRIP ---------------- */}
      <div className="mkt-strip">
        <div className="container mkt-strip-inner">
          <span>Built for</span>
          <span>Pet shops</span>
          <span>Vintage sellers</span>
          <span>Makers &amp; studios</span>
          <span>Gearheads</span>
          <span>Hobby &amp; model stores</span>
          <span>Collectors</span>
        </div>
      </div>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section className="container section" id="how">
        <div className="section-head">
          <span className="section-head-index">01</span>
          <span className="section-head-label">
            <h2>From zero to selling in three steps</h2>
          </span>
          <span />
        </div>
        <div className="mkt-steps">
          {STEPS.map((s, i) => (
            <div className="mkt-step" key={s.title}>
              <span className="mkt-step-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- FEATURE DEMOS ---------------- */}
      <section className="container section" id="demos">
        <div className="section-head">
          <span className="section-head-index">02</span>
          <span className="section-head-label">
            <h2>Three ways to sell, in action</h2>
          </span>
          <span />
        </div>
        <p className="mkt-lead">Sell at a fixed price with the standard listing page and cart, run timed auctions, or draw raffles live. Watch each one below.</p>
        <FeatureDemos />
      </section>

      {/* ---------------- TEMPLATES ---------------- */}
      <section className="mkt-templates-band" id="templates">
        <div className="container section">
          <div className="section-head">
            <span className="section-head-index">03</span>
            <span className="section-head-label">
              <h2>One platform. Nine looks.</h2>
            </span>
            <span />
          </div>
          <p className="mkt-lead">
            Every template is a complete design system — its own typefaces, colour, geometry and motion — not a colour swap.
            Pick the one that fits your shop, switch whenever you like.
          </p>
          <div className="mkt-templates">
            {TEMPLATE_CATALOG.map((tpl) => (
              <div className="mkt-template" key={tpl.key}>
                <div className="mkt-template-swatch">
                  {tpl.swatch.map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </div>
                <strong>{tpl.name}</strong>
                <span>{tpl.blurb}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- FEATURES ---------------- */}
      <section className="container section">
        <div className="section-head">
          <span className="section-head-index">04</span>
          <span className="section-head-label">
            <h2>Everything a shop needs, on day one</h2>
          </span>
          <span />
        </div>
        <div className="mkt-features">
          {FEATURES.map((f) => (
            <div className="mkt-feature" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- AUCTION ENGINE HIGHLIGHT ---------------- */}
      <section className="mkt-engine">
        <div className="container mkt-engine-inner">
          <div>
            <span className="eyebrow eyebrow-live">The auction engine</span>
            <h2>A live marketplace, not a listing page</h2>
            <p>
              Bids land in real time for everyone watching. Countdowns tick to the second. A ticker of open lots runs across
              the top of every page in your shop. Buyers feel the pressure — and you get the price.
            </p>
          </div>
          <div className="mkt-engine-figure" aria-hidden="true">
            <div className="mkt-engine-row">
              <span>CURRENT BID</span>
              <span className="mkt-engine-val">$1,240.00</span>
            </div>
            <div className="mkt-engine-row">
              <span>BIDS</span>
              <span className="mkt-engine-val">27</span>
            </div>
            <div className="mkt-engine-row">
              <span>CLOSES IN</span>
              <span className="mkt-engine-val mkt-engine-live">00:03:11</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- RAFFLE ENGINE HIGHLIGHT ---------------- */}
      <section className="mkt-engine mkt-engine-raffle">
        <div className="container mkt-engine-inner">
          <div>
            <span className="eyebrow eyebrow-raffle">The raffle room</span>
            <h2>Sell the seats, then draw it live</h2>
            <p>
              Price a seat, name the prize, and once every seat is paid for, draw the winner live in front of everyone
              who bought in — spin a wheel, race ducks, flip a card, or eliminate seats one at a time. Chat runs
              alongside the whole draw, not bolted on after.
            </p>
          </div>
          <div className="mkt-engine-figure" aria-hidden="true">
            <div className="mkt-engine-row">
              <span>SEATS SOLD</span>
              <span className="mkt-engine-val">6/6</span>
            </div>
            <div className="mkt-engine-row">
              <span>DRAW FORMATS</span>
              <span className="mkt-engine-val">4</span>
            </div>
            <div className="mkt-engine-row">
              <span>LIVE CHAT</span>
              <span className="mkt-engine-val mkt-engine-raffle-flag">ON</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- PRICING ---------------- */}
      <section className="container section" id="pricing">
        <div className="section-head">
          <span className="section-head-index">05</span>
          <span className="section-head-label">
            <h2>Simple pricing</h2>
          </span>
          <span />
        </div>
        <div className="mkt-pricing">
          {PLANS.map((plan) => (
            <div className={`mkt-plan ${plan.highlight ? 'is-highlight' : ''}`} key={plan.name}>
              {plan.highlight && <span className="mkt-plan-tag">Most popular</span>}
              <h3>{plan.name}</h3>
              <p className="mkt-plan-tagline">{plan.tagline}</p>
              <p className="mkt-plan-price">
                {plan.price} <span>/ {plan.cadence}</span>
              </p>
              <ul className="mkt-plan-features">
                {plan.features.map((feat) => (
                  <li key={feat}>{feat}</li>
                ))}
              </ul>
              <Link to="/signup" className={`btn ${plan.highlight ? 'btn-primary' : 'btn-secondary'} btn-block`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section className="container section">
        <div className="section-head">
          <span className="section-head-index">06</span>
          <span className="section-head-label">
            <h2>Questions</h2>
          </span>
          <span />
        </div>
        <div className="mkt-faq">
          {FAQ.map((item) => (
            <details className="mkt-faq-item" key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------------- FINAL CTA ---------------- */}
      <section className="mkt-final">
        <div className="container mkt-final-inner">
          <h2>Claim your shop’s address</h2>
          <p>Free forever plan. No card. Live in under a minute.</p>
          <ClaimField id="claim-final" />
        </div>
      </section>
    </div>
  )
}
