import { describe, expect, it } from 'vitest'
import {
  AUDIO_KEY,
  DEFAULT_AUDIO,
  LEGACY_MUTED_KEY,
  clampVolume,
  gainFor,
  isSilent,
  parseAudioSettings,
} from '../src/audio/settings'

describe('clampVolume', () => {
  it('keeps a good volume and rounds it to two decimals', () => {
    expect(clampVolume(0.5, 1)).toBe(0.5)
    expect(clampVolume(0.333333, 1)).toBe(0.33)
  })

  it('holds a volume inside 0 to 1', () => {
    expect(clampVolume(-3, 1)).toBe(0)
    expect(clampVolume(7, 0)).toBe(1)
  })

  it('uses the fallback for anything that is not a number', () => {
    expect(clampVolume('loud', 0.4)).toBe(0.4)
    expect(clampVolume(Number.NaN, 0.4)).toBe(0.4)
    expect(clampVolume(Infinity, 0.4)).toBe(0.4)
    expect(clampVolume(undefined, 0.4)).toBe(0.4)
  })
})

describe('parseAudioSettings', () => {
  it('plays music and effects when nothing was saved', () => {
    expect(parseAudioSettings({})).toEqual(DEFAULT_AUDIO)
  })

  it('reads what was saved', () => {
    const saved = { musicOn: false, musicVolume: 0.25, sfxOn: true, sfxVolume: 0.5 }
    expect(parseAudioSettings({ [AUDIO_KEY]: saved })).toEqual(saved)
  })

  it('repairs a damaged save field by field instead of throwing it all away', () => {
    const parsed = parseAudioSettings({ [AUDIO_KEY]: { musicOn: 'yes', musicVolume: 9, sfxVolume: 'x', sfxOn: false } })
    expect(parsed).toEqual({ ...DEFAULT_AUDIO, musicVolume: 1, sfxOn: false })
  })

  it('ignores a save that is not an object', () => {
    expect(parseAudioSettings({ [AUDIO_KEY]: 'loud' })).toEqual(DEFAULT_AUDIO)
    expect(parseAudioSettings({ [AUDIO_KEY]: [1, 2] })).toEqual(DEFAULT_AUDIO)
    expect(parseAudioSettings({ [AUDIO_KEY]: null })).toEqual(DEFAULT_AUDIO)
  })

  it('keeps a player who muted the game with the old switch silent', () => {
    expect(parseAudioSettings({ [LEGACY_MUTED_KEY]: true })).toEqual({ ...DEFAULT_AUDIO, musicOn: false, sfxOn: false })
  })

  it('lets the new settings win over the old switch', () => {
    const saved = { ...DEFAULT_AUDIO, musicOn: true }
    expect(parseAudioSettings({ [AUDIO_KEY]: saved, [LEGACY_MUTED_KEY]: true })).toEqual(saved)
  })

  it('does not return the shared default object, so nobody can change it by accident', () => {
    expect(parseAudioSettings({}) === DEFAULT_AUDIO).toBe(false)
  })
})

describe('gainFor', () => {
  it('is silent at 0 and full at 1', () => {
    expect(gainFor(0)).toBe(0)
    expect(gainFor(1)).toBe(1)
  })

  it('rises on a curve, so the middle of the slider is quieter than half', () => {
    expect(gainFor(0.5)).toBe(0.25)
    expect(gainFor(0.8)).toBeLessThan(0.8)
  })

  it('never goes up when the slider goes down', () => {
    let last = -1
    for (let v = 0; v <= 1; v += 0.05) {
      const g = gainFor(v)
      expect(g).toBeGreaterThanOrEqual(last)
      last = g
    }
  })
})

describe('isSilent', () => {
  it('is not silent while anything can be heard', () => {
    expect(isSilent(DEFAULT_AUDIO)).toBe(false)
    expect(isSilent({ ...DEFAULT_AUDIO, musicOn: false })).toBe(false)
    expect(isSilent({ ...DEFAULT_AUDIO, sfxOn: false })).toBe(false)
  })

  it('is silent when both are off, or both are turned right down', () => {
    expect(isSilent({ ...DEFAULT_AUDIO, musicOn: false, sfxOn: false })).toBe(true)
    expect(isSilent({ ...DEFAULT_AUDIO, musicVolume: 0, sfxVolume: 0 })).toBe(true)
    expect(isSilent({ musicOn: true, musicVolume: 0, sfxOn: false, sfxVolume: 1 })).toBe(true)
  })
})
