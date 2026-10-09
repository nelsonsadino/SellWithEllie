import { useEffect, useState } from 'react'

const pad = (n) => String(n).padStart(2, '0')

function formatRemaining(ms) {
  if (ms <= 0) return null
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return days > 0 ? `${days}d ${clock}` : clock
}

// A monospace HH:MM:SS countdown. Polite live region so screen readers hear the
// occasional update without being flooded every second.
export default function CountdownTimer({ target, onComplete, label }) {
  const [remainingText, setRemainingText] = useState(() => formatRemaining(new Date(target) - new Date()))

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = new Date(target) - new Date()
      const text = formatRemaining(diff)
      setRemainingText(text)
      if (!text) {
        clearInterval(interval)
        onComplete?.()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [target, onComplete])

  if (!remainingText) {
    return (
      <span className="countdown countdown-ended" role="timer">
        Ended
      </span>
    )
  }

  return (
    <span className="countdown" role="timer" aria-live="polite">
      {label ? <span className="countdown-label">{label}</span> : null}
      {remainingText}
    </span>
  )
}
