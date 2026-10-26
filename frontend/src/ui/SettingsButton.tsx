import type { CSSProperties } from 'react'
import { art } from './art'

interface Props {
  /** Diameter in design pixels. */
  size: number
  muted: boolean
  onToggle: () => void
  style?: CSSProperties
}

/** The gear in the corner. In this game it is the sound switch. */
export default function SettingsButton({ size, muted, onToggle, style }: Props) {
  return (
    <button
      type="button"
      className="settings-btn"
      style={{ width: size, height: size, ...style }}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      aria-pressed={muted}
      onClick={onToggle}
    >
      <img src={art.settingsButton} alt="" draggable={false} />
      {muted && <span className="settings-muted" aria-hidden />}
    </button>
  )
}
