import { useTheme } from '../context/ThemeContext'

const NEXT_LABEL = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const ICON = {
  system: '🖥️',
  light: '☀️',
  dark: '🌙',
}

// Cycles OS → light → dark. Shows the current mode as visible text (not icon
// only) and announces what a press will do.
export default function ThemeToggle() {
  const { mode, cycleMode } = useTheme()

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycleMode}
      aria-label={`Theme: ${mode}. Switch to ${NEXT_LABEL[mode]}.`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {ICON[mode]}
      </span>
      <span>{mode === 'system' ? 'Auto' : mode[0].toUpperCase() + mode.slice(1)}</span>
    </button>
  )
}
