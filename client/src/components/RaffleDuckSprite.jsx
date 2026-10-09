// One cartoon duck, side-on, facing right (the direction of the race). Pure
// SVG with no ids/defs, so any number of them can share a page. Each seat
// gets a body colour + an accessory from lib/duckRoster.js; the winner swaps
// its accessory for a crown.
const OUTLINE = '#3b2410'
const LINE = { stroke: OUTLINE, strokeWidth: 1.4, strokeLinejoin: 'round', strokeLinecap: 'round' }

export default function RaffleDuckSprite({ seat, look, winner = false }) {
  const { body, shade, beak, accessory } = look
  const badgeFont = String(seat).length > 2 ? 7.4 : 9.6

  return (
    <svg viewBox="0 -12 78 74" className="raffle-race-sprite" aria-hidden="true" focusable="false">
      {/* Silhouette: stroked at double width, then re-filled on top so only
          the outer half of the stroke survives and the seams between tail,
          body and head disappear. */}
      <g fill={body} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round">
        <polygon points="10,31 1,20 19,27" />
        <ellipse cx="34" cy="38" rx="26" ry="16" />
        <circle cx="54" cy="22" r="13" />
      </g>
      <g fill={body}>
        <polygon points="10,31 2.6,22 18,27.4" />
        <ellipse cx="34" cy="38" rx="25" ry="15" />
        <circle cx="54" cy="22" r="12" />
      </g>
      <ellipse cx="38" cy="45" rx="17" ry="6" fill="#fff" opacity="0.28" />

      <path
        className="raffle-race-wing"
        d="M19 34 Q29 25 44 32 Q42 42 28 42 Q18 42 19 34Z"
        fill={shade}
        {...LINE}
      />

      <rect x="25" y="42.5" width="20" height="10" rx="5" fill="#fff" stroke={OUTLINE} strokeWidth="1.1" />
      <text
        x="35"
        y="50.2"
        textAnchor="middle"
        fontSize={badgeFont}
        fontWeight="800"
        fontFamily="ui-monospace, Menlo, Consolas, monospace"
        fill={OUTLINE}
      >
        {seat}
      </text>

      <path d="M64 20 Q75 19 74 25 Q73 29 64 28Z" fill={beak} {...LINE} />
      <circle cx="56.5" cy="26.5" r="2.6" fill="#ff8fa3" opacity="0.55" />
      <circle cx="58" cy="18" r="3.5" fill="#fff" stroke={OUTLINE} strokeWidth="1.1" />
      <circle cx="59.2" cy="18" r="1.8" fill={OUTLINE} />

      {winner ? <Crown /> : <Accessory index={accessory} />}
    </svg>
  )
}

function Crown() {
  return (
    <g {...LINE}>
      <path d="M43 9 L45 -6 L50 2 L54 -8 L58 2 L63 -6 L65 9Z" fill="#ffd23f" />
      <circle cx="45" cy="-6" r="2" fill="#ff5a5f" />
      <circle cx="54" cy="-8" r="2" fill="#5cc8ff" />
      <circle cx="63" cy="-6" r="2" fill="#ff5a5f" />
    </g>
  )
}

// Ten accessories, all drawn around the head (centre 54,22 / radius 13).
function Accessory({ index }) {
  switch (index) {
    case 0: // strawberry on top of the head
      return (
        <g {...LINE}>
          <path d="M46 4 Q46 -4 54 -4 Q62 -4 62 4 Q62 12 54 15 Q46 12 46 4Z" fill="#e63946" />
          <g fill="#ffe066" stroke="none">
            <circle cx="50.5" cy="3" r="1" />
            <circle cx="57.5" cy="2" r="1" />
            <circle cx="54" cy="7" r="1" />
            <circle cx="50" cy="8.5" r="1" />
            <circle cx="58" cy="8" r="1" />
          </g>
          <path d="M47.5 -2 L54 -9 L60.5 -2 L56.5 -3.6 L54 -0.8 L51.5 -3.6Z" fill="#3fa34d" />
        </g>
      )
    case 1: // reindeer antlers + red nose
      return (
        <g {...LINE}>
          <g fill="none" stroke="#6b3f1d" strokeWidth="2.8">
            <path d="M47.5 12 L43 1 M43 1 L37.5 -1.5 M44.6 6 L39 6" />
            <path d="M60 11 L63.5 0 M63.5 0 L69 -2 M62.4 5 L68 5.5" />
          </g>
          <circle cx="73" cy="23.5" r="3.1" fill="#ff2d2d" />
        </g>
      )
    case 2: // party hat
      return (
        <g {...LINE}>
          <path d="M46.5 11.5 L54 -9 L61.5 11.5Z" fill="#ff5fa2" />
          <path d="M49.8 5.5 H58.2 M52 -0.4 H56" stroke="#fff176" strokeWidth="2" />
          <circle cx="54" cy="-10" r="3.2" fill="#ffe066" />
        </g>
      )
    case 3: // sunglasses
      return (
        <g {...LINE}>
          <path d="M52 15.5 L43.5 14" fill="none" strokeWidth="1.8" />
          <rect x="51.5" y="13.2" width="13" height="8.6" rx="3.4" fill="#20203a" />
          <path d="M54 16 L57 15.2" stroke="#fff" strokeWidth="1.3" opacity="0.8" />
        </g>
      )
    case 4: // top hat
      return (
        <g {...LINE}>
          <rect x="46.5" y="-8" width="15" height="17" rx="1.6" fill="#2b2b3a" />
          <rect x="46.5" y="2" width="15" height="4" fill="#d62839" strokeWidth="1" />
          <ellipse cx="54" cy="9.4" rx="13" ry="3.2" fill="#2b2b3a" />
        </g>
      )
    case 5: // sailor cap
      return (
        <g {...LINE}>
          <path d="M43.5 11 Q43 -3 54 -3 Q65 -3 64.5 11Z" fill="#fff" />
          <path d="M42.6 11 Q54 6 65.4 11 L64.4 14 Q54 9.5 43.6 14Z" fill="#1d4e89" />
          <circle cx="54" cy="-4" r="2.4" fill="#e63946" />
        </g>
      )
    case 6: // flower
      return (
        <g {...LINE}>
          <path d="M42 15 Q44 9 47 11" fill="#3fa34d" />
          <g fill="#ff6fb5">
            <circle cx="46" cy="4" r="3.6" />
            <circle cx="51" cy="7" r="3.6" />
            <circle cx="49.6" cy="12.4" r="3.6" />
            <circle cx="42.4" cy="12.4" r="3.6" />
            <circle cx="41" cy="7" r="3.6" />
          </g>
          <circle cx="46" cy="9" r="3" fill="#ffd23f" />
        </g>
      )
    case 7: // headphones
      return (
        <g {...LINE}>
          <path d="M46 15 Q48 -5 64 11" fill="none" stroke="#ff5e5b" strokeWidth="3.4" />
          <path d="M46 15 Q48 -5 64 11" fill="none" stroke={OUTLINE} strokeWidth="0.8" />
          <circle cx="47" cy="22" r="6.2" fill="#ff5e5b" />
          <circle cx="47" cy="22" r="3" fill="#ffb3b1" strokeWidth="1" />
        </g>
      )
    case 8: // bow tie
      return (
        <g {...LINE}>
          <path d="M47 35 L37 29.5 L37 40.5Z" fill="#e63946" />
          <path d="M47 35 L57 29.5 L57 40.5Z" fill="#e63946" />
          <circle cx="47" cy="35" r="3" fill="#b5252f" />
        </g>
      )
    default: // graduation cap
      return (
        <g {...LINE}>
          <path d="M47.5 8 L47.5 12.5 Q54 16 60.5 12.5 L60.5 8Z" fill="#2b2b3a" />
          <path d="M40 4 L54 -2 L68 4 L54 10Z" fill="#2b2b3a" />
          <path d="M65 5.4 L66.6 14" fill="none" stroke="#ffd23f" strokeWidth="1.6" />
          <circle cx="66.6" cy="15" r="1.7" fill="#ffd23f" />
        </g>
      )
  }
}
