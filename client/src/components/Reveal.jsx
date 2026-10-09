import { useReveal } from '../lib/useReveal'

// Fades + lifts its children into view on first scroll. `as` lets it wrap
// without adding an extra layout box where one isn't wanted.
export default function Reveal({ children, className = '', style }) {
  const ref = useReveal()
  return (
    <div ref={ref} className={`reveal ${className}`.trim()} style={style}>
      {children}
    </div>
  )
}
