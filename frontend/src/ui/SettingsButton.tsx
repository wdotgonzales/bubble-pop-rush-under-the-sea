import type { CSSProperties } from 'react'
import { useSound } from '../audio/useSound'
import { art } from './art'

interface Props {
  /** Diameter in design pixels. */
  size: number
  style?: CSSProperties
}

/** The gear in the corner. It opens the settings window. It looks the same whatever the sound settings are. */
export default function SettingsButton({ size, style }: Props) {
  const { openSettings } = useSound()
  return (
    <button
      type="button"
      className="settings-btn"
      style={{ width: size, height: size, ...style }}
      aria-label="Settings"
      aria-haspopup="dialog"
      onClick={openSettings}
    >
      <img src={art.settingsButton} alt="" draggable={false} />
    </button>
  )
}
