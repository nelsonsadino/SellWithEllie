import { useEffect, useState } from 'react'
import SmartLink from '../SmartLink'
import ProductImage from '../ProductImage'
import { useOptionalTenant } from '../../context/TenantContext'
import { getProducts } from '../../api/products'
import { getAuctions } from '../../api/auctions'

const pad = (n) => String(n).padStart(2, '0')

function nextClose(auctions) {
  const live = auctions
    .map((a) => new Date(a.endTimeUtc))
    .filter((d) => d - Date.now() > 0)
    .sort((a, b) => a - b)[0]
  if (!live) return null
  const s = Math.max(0, Math.floor((live - Date.now()) / 1000))
  const d = Math.floor(s / 86400)
  const clock = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
  return d > 0 ? `${d}D ${clock}` : clock
}

// The hero doubles as a market board: headline + actions on the left, a live
// data panel (lots listed / auctions running / next close / address) on the
// right. The panel only appears inside a real storefront (TenantProvider);
// on the marketing site the hero centres itself instead.
export default function HeroSection({ data = {} }) {
  const { title, subtitle, primaryLabel, primaryHref, secondaryLabel, secondaryHref } = data
  const tenantCtx = useOptionalTenant()
  const showBoard = tenantCtx != null

  const [lots, setLots] = useState(null)
  const [specimens, setSpecimens] = useState([])
  const [auctions, setAuctions] = useState([])
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!showBoard) return undefined
    let ignore = false
    Promise.all([getProducts({ pageSize: 4, sort: 'newest' }), getAuctions('Active')])
      .then(([p, a]) => {
        if (ignore) return
        setLots(typeof p?.totalCount === 'number' ? p.totalCount : null)
        setSpecimens(Array.isArray(p?.items) ? p.items : [])
        setAuctions(Array.isArray(a) ? a : [])
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [showBoard])

  useEffect(() => {
    if (!showBoard) return undefined
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [showBoard])

  const close = nextClose(auctions)
  const addr = tenantCtx?.tenant?.slug ? `${tenantCtx.tenant.slug}.market` : null

  return (
    <section className="hero hero-specimen">
      {showBoard && (
        <div className="accession-ledger" aria-label="Collection status">
          <span className="accession-ledger-item">
            <span className="accession-ledger-key">Specimens catalogued</span>
            <span className={`accession-ledger-val ${lots == null ? 'is-empty' : ''}`}>
              {lots == null ? '—' : pad(lots)}
            </span>
          </span>
          <span className="accession-ledger-item">
            <span className="accession-ledger-key">On active bid</span>
            <span className={`accession-ledger-val ${auctions.length > 0 ? 'is-live' : 'is-empty'}`}>
              {auctions.length > 0 && <span className="live-dot" aria-hidden="true" />}
              {pad(auctions.length)}
            </span>
          </span>
          <span className="accession-ledger-item">
            <span className="accession-ledger-key">Next acquisition closes</span>
            <span className={`accession-ledger-val ${close ? 'is-live' : 'is-empty'}`}>
              {close || '—:—:—'}
            </span>
          </span>
          {addr && (
            <span className="accession-ledger-item accession-ledger-addr">
              <span className="accession-ledger-key">Collection</span>
              <span className="accession-ledger-val is-addr">{addr}</span>
            </span>
          )}
        </div>
      )}

      <div className={`hero-inner hero-inner-vitrine ${showBoard ? '' : 'hero-inner-solo'}`}>
        <div className="hero-copy">
          {title && <h1 className="hero-title">{title}</h1>}
          {subtitle && <p className="hero-lead">{subtitle}</p>}
        </div>

        {showBoard && specimens.length > 0 && (
          <div className="vitrine-wall" aria-hidden="true">
            {specimens.slice(0, 4).map((p, i) => (
              <SmartLink
                to={`/products/${p.id}`}
                className="vitrine-case"
                key={p.id}
                style={{ '--vitrine-i': i }}
                tabIndex={-1}
              >
                <ProductImage src={p.imageUrl} category={p.category} alt="" />
                <span className="vitrine-case-label">{String(p.id).padStart(3, '0')}</span>
              </SmartLink>
            ))}
          </div>
        )}

        {(primaryLabel || secondaryLabel) && (
          <div className="hero-actions">
            {primaryLabel && (
              <SmartLink to={primaryHref || '/products'} className="btn btn-primary">
                {primaryLabel}
              </SmartLink>
            )}
            {secondaryLabel && (
              <SmartLink to={secondaryHref || '/auctions'} className="btn btn-secondary">
                {secondaryLabel}
              </SmartLink>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
