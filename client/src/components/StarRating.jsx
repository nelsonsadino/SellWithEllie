// Read-only stars (supports halves via clip) or, with onChange, a radio-style picker.
export function Stars({ value = 0, size = 16 }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`} style={{ '--star-size': `${size}px` }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)))
        return (
          <span key={n} className="star" aria-hidden="true">
            <span className="star-fill" style={{ width: `${fill * 100}%` }}>
              ★
            </span>
            ★
          </span>
        )
      })}
    </span>
  )
}

export function StarPicker({ value, onChange }) {
  return (
    <div className="star-picker" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={`star-pick${n <= value ? ' is-on' : ''}`}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}
