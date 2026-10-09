// A minimal front-view chair glyph: backrest, cushion, two legs. Colored via
// currentColor so it inherits whatever state color the seat button/card is
// already using (available/selected/reserved/paid/forfeited) with no extra
// props needed.
export default function RaffleSeatIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <rect x="6.5" y="3" width="11" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="11" width="16" height="5" rx="1" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 16v4M18 16v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
