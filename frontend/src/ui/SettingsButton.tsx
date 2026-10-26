import type { CSSProperties } from 'react'
import { isSilent } from '../audio/settings'
import { useSound } from '../audio/useSound'
import { art } from './art'

interface Props {
  /** Diameter in design pixels. */
  size: number
  style?: CSSProperties
}

/** The gear in the corner. It opens the settings window; a slash across it means nothing can be heard. */
export default function SettingsButton({ size, style }: Props) {
  const { settings, openSettings } = useSound()
  const silent = isSilent(settings)
  return (
    <button
      type="button"
      className="settings-btn"
      style={{ width: size, height: size, ...style }}
      aria-label={silent ? 'Settings (sound is off)' : 'Settings'}
      aria-haspopup="dialog"
      onClick={openSettings}
    >
      <img src={art.settingsButton} alt="" draggable={false} />
      {silent && <span className="settings-muted" aria-hidden />}
    </button>
  )
}
