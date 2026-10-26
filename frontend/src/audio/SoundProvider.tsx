import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Platform } from '../platform'
import SettingsModal from '../ui/SettingsModal'
import { AudioEngine } from './engine'
import {
  AUDIO_KEY,
  DEFAULT_AUDIO,
  STORED_KEYS,
  clampVolume,
  parseAudioSettings,
  type AudioSettings,
} from './settings'
import { SoundContext, type SoundApi } from './useSound'

/** A slider drag changes the volume many times a second; the save waits for it to settle. */
const SAVE_DELAY_MS = 400

interface Props {
  /** Where the choices are kept. Null in design previews, where nothing is saved. */
  platform: Platform | null
  /** The platform has started, so its saved data can be read. */
  ready: boolean
  children: ReactNode
}

/**
 * Owns the one audio engine and the player's sound settings, shows the settings window, and
 * unlocks sound on the first tap. Buttons all get their tap sound from here too, so no screen
 * has to ask for it.
 */
export default function SoundProvider({ platform, ready, children }: Props) {
  const [engine] = useState(() => new AudioEngine())
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_AUDIO)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const current = useRef(settings)
  const touched = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const platformRef = useRef(platform)

  useEffect(() => {
    platformRef.current = platform
  }, [platform])

  const save = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = undefined
    void platformRef.current?.setData({ [AUDIO_KEY]: current.current }).catch(() => undefined)
  }, [])

  const update = useCallback(
    (patch: Partial<AudioSettings>) => {
      const next: AudioSettings = {
        ...current.current,
        ...patch,
        musicVolume: clampVolume(patch.musicVolume ?? current.current.musicVolume, current.current.musicVolume),
        sfxVolume: clampVolume(patch.sfxVolume ?? current.current.sfxVolume, current.current.sfxVolume),
      }
      touched.current = true
      current.current = next
      setSettings(next)
      engine.apply(next)
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(save, SAVE_DELAY_MS)
    },
    [engine, save],
  )

  // Read what was saved once the platform is ready, unless the player has already changed
  // something in the meantime (then their change wins).
  useEffect(() => {
    if (!platform || !ready) return
    let cancelled = false
    platform
      .getData(STORED_KEYS)
      .then((data) => {
        if (cancelled || touched.current) return
        const saved = parseAudioSettings(data)
        current.current = saved
        setSettings(saved)
        engine.apply(saved)
      })
      .catch(() => undefined) // a failed read just means the defaults
    return () => {
      cancelled = true
    }
  }, [platform, ready, engine])

  // Sound is allowed from the first tap or key press; buttons make their sound when pressed; and
  // nothing plays while the page is out of sight.
  useEffect(() => {
    const unlock = () => engine.unlock()
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button')) engine.button()
    }
    const onVisibility = () => engine.setHidden(document.hidden)
    document.addEventListener('pointerdown', unlock, true)
    document.addEventListener('keydown', unlock, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(saveTimer.current)
      engine.close()
    }
  }, [engine])

  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    if (saveTimer.current !== undefined) save()
  }, [save])

  const api = useMemo<SoundApi>(
    () => ({ engine, settings, update, settingsOpen, openSettings, closeSettings }),
    [engine, settings, update, settingsOpen, openSettings, closeSettings],
  )

  return (
    <SoundContext.Provider value={api}>
      {children}
      {settingsOpen && <SettingsModal />}
    </SoundContext.Provider>
  )
}
