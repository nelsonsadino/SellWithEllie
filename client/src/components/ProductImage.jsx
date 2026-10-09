import { useId, useState } from 'react'

// Engraved-plate placeholder art, used when a product has no photo yet.
// Species get distinct silhouettes (a guppy's fan tail reads nothing like a
// betta's halfmoon spread or a molly's sleek torpedo body) with a whisper
// of engraving shade line, sparse and light rather than dense cross-hatch -
// a hint of the plate, not a texture fighting for attention. `currentColor`
// + a per-instance hatch pattern id (via useId) so every template's palette
// colors them for free with no id collisions when a grid renders many at once.
function EngravedPlate({ id, children }) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="0.85" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <pattern id={id} width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4.5" stroke="currentColor" strokeWidth="0.4" opacity="0.16" />
        </pattern>
      </defs>
      {children}
    </svg>
  )
}

function GuppyPlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <path d="M12 12 21 6 22 12 21 18Z" fill={hatch} opacity="0.85" />
      <path d="M8 9.6Q9.6 6.8 11.2 9.6Z" fill={hatch} />
      <ellipse cx="9" cy="12" rx="4" ry="2.6" fill={hatch} />
      <circle cx="6.3" cy="11.3" r=".6" fill="currentColor" stroke="none" />
    </EngravedPlate>
  )
}

function BettaPlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <path d="M10 12 21 4Q23.2 12 21 20Z" fill={hatch} opacity="0.8" />
      <path d="M6.5 10.4Q8 7.7 9.5 10.2Z" fill={hatch} opacity="0.6" />
      <ellipse cx="7.5" cy="12" rx="2.6" ry="1.8" fill={hatch} />
      <circle cx="5.2" cy="11.5" r=".55" fill="currentColor" stroke="none" />
    </EngravedPlate>
  )
}

function MollyPlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <path d="M15 12 20 9 18.6 12 20 15Z" fill={hatch} opacity="0.85" />
      <path d="M9.3 10.1Q11 6.8 12.8 10.1Z" fill={hatch} opacity="0.6" />
      <ellipse cx="9.5" cy="12" rx="5.5" ry="1.9" fill={hatch} />
      <circle cx="5" cy="11.6" r=".55" fill="currentColor" stroke="none" />
    </EngravedPlate>
  )
}

function GenericFishPlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <path d="M21 12c1 .8 2 1 2.5 0-.2-1-1-1.7-2.5-2" fill={hatch} opacity="0.7" />
      <path
        d="M21 12c-2.8-3.6-7-5.5-10.5-5.5C6.8 6.5 4 9 3 12c1 3 3.8 5.5 7.5 5.5 3.5 0 7.7-1.9 10.5-5.5Z"
        fill={hatch}
      />
      <circle cx="16.3" cy="10.5" r=".7" fill="currentColor" stroke="none" />
    </EngravedPlate>
  )
}

function BirdPlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <path
        d="M4 15c0-4.4 3.4-8 8-8 3 0 5.3 1.7 6.3 3.6.9-.2 2-.8 2.7-1.9-.1 2.1-1.3 3.4-2.4 4 .1 3.7-2.7 6.8-7.6 6.8-3 0-5.8-1.7-7-4.5Z"
        fill={hatch}
      />
      <path d="M9.5 18l-1.2 2.3M13.5 18.3l.4 2" fill="none" />
      <circle cx="8.5" cy="9.3" r=".7" fill="currentColor" stroke="none" />
    </EngravedPlate>
  )
}

function MammalPlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <ellipse cx="12" cy="16" rx="5.2" ry="4.2" fill={hatch} />
      <ellipse cx="5.3" cy="9.4" rx="2" ry="2.6" fill={hatch} opacity="0.85" />
      <ellipse cx="10.2" cy="6" rx="2" ry="2.6" fill={hatch} opacity="0.85" />
      <ellipse cx="14.8" cy="6" rx="2" ry="2.6" fill={hatch} opacity="0.85" />
      <ellipse cx="19.7" cy="9.4" rx="2" ry="2.6" fill={hatch} opacity="0.85" />
    </EngravedPlate>
  )
}

function ReptilePlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <path d="M3 17.5c2.8-.3 4.6-1.6 5-3.5.5-2.4 2.3-4 5-4.3 2-.2 3.3-1 4-2.7" fill="none" />
      <path d="M14.5 6.5 17 5l.5 2.7 2.5-.4-1 2.4 2 1.6-2.6.7" fill={hatch} opacity="0.85" />
      <path d="M8.5 13.2 6.7 15M11 12.3l-1 2.4" fill="none" />
      <circle cx="16" cy="7.3" r=".65" fill="currentColor" stroke="none" />
    </EngravedPlate>
  )
}

function ShellPlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <path
        d="M12 20c-4.4 0-7-2.5-7-6.2C5 10 7.7 7 12 7s7 3 7 6.8c0 1.9-1 3.1-2.6 3.1-1.7 0-2.6-1.2-2.6-2.9 0-1.4.8-2.3 2-2.3"
        fill={hatch}
      />
      <path d="M12 20v-3.2" fill="none" />
    </EngravedPlate>
  )
}

function CrustaceanPlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <path d="M5 13c0-3.6 3.2-6.5 7-6.5s7 2.9 7 6.5-3.2 6-7 6-7-2.4-7-6Z" fill={hatch} />
      <path d="M6 8.5 4 6.3M8.2 6.8 7 4.3" fill="none" />
      <path d="M6.5 12.5 4 13.5M6.8 15.5l-2 1.8M9.5 17.8l-1 2.3" fill="none" />
      <circle cx="9" cy="10.5" r=".65" fill="currentColor" stroke="none" />
    </EngravedPlate>
  )
}

function GenericPlate({ id }) {
  const hatch = `url(#${id})`
  return (
    <EngravedPlate id={id}>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5Z" fill={hatch} />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" fill="none" />
    </EngravedPlate>
  )
}

const PLATES = {
  guppy: GuppyPlate,
  betta: BettaPlate,
  molly: MollyPlate,
  fish: GenericFishPlate,
  bird: BirdPlate,
  mammal: MammalPlate,
  reptile: ReptilePlate,
  shell: ShellPlate,
  crustacean: CrustaceanPlate,
  generic: GenericPlate,
}

const CATEGORY_PLATE_KEY = {
  dog: 'mammal',
  cat: 'mammal',
  rabbit: 'mammal',
  hamster: 'mammal',
  bird: 'bird',
  guppy: 'guppy',
  betta: 'betta',
  molly: 'molly',
  fish: 'fish',
  goldfish: 'fish',
  cichlid: 'fish',
  shrimp: 'crustacean',
  snail: 'shell',
  reptile: 'reptile',
}

// Internal CSS classes below keep the original "pet-image" naming - purely
// cosmetic/internal, not user-facing, so renaming them isn't worth the churn.
export default function ProductImage({ src, category, alt, className = '' }) {
  const [loaded, setLoaded] = useState(false)
  const hatchId = useId()

  if (src) {
    return (
      <span className={`pet-image-wrap ${loaded ? '' : 'img-skeleton'} ${className}`.trim()}>
        <img
          src={src}
          alt={alt}
          className="pet-image"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' }}
        />
      </span>
    )
  }

  const plateKey = CATEGORY_PLATE_KEY[category?.toLowerCase()] || 'generic'
  const Plate = PLATES[plateKey]
  return (
    <div className={`pet-image pet-image-placeholder ${className}`} role="img" aria-label={alt}>
      <Plate id={`hatch-${hatchId}`} />
    </div>
  )
}
