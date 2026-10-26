import { createContext, useContext } from 'react'
import type { AudioEngine } from './engine'
import type { AudioSettings } from './settings'

export interface SoundApi {
  engine: AudioEngine
  settings: AudioSettings
  /** Change some of the settings. The sound follows at once and the choice is saved. */
  update: (patch: Partial<AudioSettings>) => void
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
}

export const SoundContext = createContext<SoundApi | null>(null)

/** The game's sound and its settings window. Only works inside a SoundProvider. */
export function useSound(): SoundApi {
  const api = useContext(SoundContext)
  if (!api) throw new Error('useSound needs a SoundProvider around it')
  return api
}
