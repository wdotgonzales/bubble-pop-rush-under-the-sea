import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { useSound } from '../audio/useSound'
import { modalScale } from './modalScale'
import PearlButton from './PearlButton'
import { useViewport } from './useViewport'

interface RowProps {
  label: string
  on: boolean
  volume: number
  onToggle: (on: boolean) => void
  onVolume: (volume: number) => void
}

/** One kind of sound: a switch to turn it off, and a slider for how loud it is. */
function SettingRow({ label, on, volume, onToggle, onVolume }: RowProps) {
  const labelId = useId()
  const percent = Math.round(volume * 100)
  const fill = { '--fill': `${percent}%` } as CSSProperties
  return (
    <div className="setting-row">
      <div className="setting-head">
        <span id={labelId} className="setting-label">
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          className="switch"
          onClick={() => onToggle(!on)}
        >
          <span className="switch-knob" aria-hidden />
        </button>
      </div>
      <div className="slider-line">
        <input
          type="range"
          className="slider"
          min={0}
          max={100}
          step={1}
          value={percent}
          disabled={!on}
          aria-label={`${label} volume`}
          style={fill}
          onChange={(event) => onVolume(Number(event.currentTarget.value) / 100)}
        />
        <span className="slider-value" aria-hidden>
          {percent}%
        </span>
      </div>
    </div>
  )
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled)'

/**
 * The window the gear opens. It sits over everything, so it works the same on every screen and in
 * both layouts. Escape, the backdrop and DONE close it; Tab stays inside it; the focus goes back
 * to the gear when it closes.
 */
export default function SettingsModal() {
  const { settings, update, closeSettings, engine } = useSound()
  const panel = useRef<HTMLElement>(null)
  const pressedBackdrop = useRef(false)
  const viewport = useViewport()
  const scale = modalScale(viewport.width, viewport.height)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSettings()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panel.current.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [closeSettings])

  return (
    <div
      className="modal-backdrop"
      // Closing needs the press and the release both on the backdrop, so letting go of a slider
      // outside the window does not close it.
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) closeSettings()
        pressedBackdrop.current = false
      }}
    >
      <section
        ref={panel}
        className="glass-panel settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        style={scale > 1 ? { transform: `scale(${scale})` } : undefined}
      >
        <span className="glass-rim" aria-hidden />
        <h2 id="settings-title" className="settings-title">
          Settings
        </h2>

        <SettingRow
          label="Music"
          on={settings.musicOn}
          volume={settings.musicVolume}
          onToggle={(on) => update({ musicOn: on })}
          onVolume={(volume) => update({ musicVolume: volume })}
        />
        <SettingRow
          label="Sound effects"
          on={settings.sfxOn}
          volume={settings.sfxVolume}
          onToggle={(on) => update({ sfxOn: on })}
          onVolume={(volume) => {
            update({ sfxVolume: volume })
            engine.sample()
          }}
        />

        <div className="settings-actions">
          <PearlButton variant="cream" width={200} height={64} fontSize={28} glow="strong" onClick={closeSettings}>
            DONE
          </PearlButton>
        </div>
      </section>
    </div>
  )
}
