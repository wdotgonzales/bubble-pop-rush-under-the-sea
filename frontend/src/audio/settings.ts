// What the player chose in the settings window: music and sound effects, each with a switch
// and a volume. Kept apart from the audio code so the rules (limits, defaults, the old mute
// switch) can be tested without a sound card.

export interface AudioSettings {
  musicOn: boolean
  /** 0 to 1, as the slider shows it. */
  musicVolume: number
  sfxOn: boolean
  /** 0 to 1, as the slider shows it. */
  sfxVolume: number
}

/** The music sits behind the game, so it starts quieter than the effects. */
export const DEFAULT_AUDIO: AudioSettings = {
  musicOn: true,
  musicVolume: 0.6,
  sfxOn: true,
  sfxVolume: 0.9,
}

/** Where the settings are kept: Facebook's player data, or localStorage outside Facebook. */
export const AUDIO_KEY = 'audio'
/** The old single mute switch. Read once, so someone who muted the game is not surprised by sound. */
export const LEGACY_MUTED_KEY = 'muted'
export const STORED_KEYS: string[] = [AUDIO_KEY, LEGACY_MUTED_KEY]

/** A volume the sliders and the saved data can both be trusted to hand over: 0 to 1, two decimals. */
export function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100
}

/** Read what was saved. Anything missing or damaged falls back to the default, field by field. */
export function parseAudioSettings(stored: Record<string, unknown>): AudioSettings {
  const raw = stored[AUDIO_KEY]
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const saved = raw as Record<string, unknown>
    return {
      musicOn: typeof saved.musicOn === 'boolean' ? saved.musicOn : DEFAULT_AUDIO.musicOn,
      musicVolume: clampVolume(saved.musicVolume, DEFAULT_AUDIO.musicVolume),
      sfxOn: typeof saved.sfxOn === 'boolean' ? saved.sfxOn : DEFAULT_AUDIO.sfxOn,
      sfxVolume: clampVolume(saved.sfxVolume, DEFAULT_AUDIO.sfxVolume),
    }
  }
  if (stored[LEGACY_MUTED_KEY] === true) return { ...DEFAULT_AUDIO, musicOn: false, sfxOn: false }
  return { ...DEFAULT_AUDIO }
}

/**
 * How loud a slider position is. Ears hear loudness on a curve, so a straight line from 0 to 1
 * would feel as if nothing happens until the very top. Squaring it spreads the change evenly.
 */
export function gainFor(volume: number): number {
  const v = clampVolume(volume, 0)
  return v * v
}
