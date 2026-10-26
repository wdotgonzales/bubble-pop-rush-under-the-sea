import { describe, expect, it } from 'vitest'
import type { RoundPhase } from '../src/game/engine'
import { escapeAction } from '../src/game/keys'

const press = (phase: RoundPhase, extra: Partial<Parameters<typeof escapeAction>[0]> = {}) =>
  escapeAction({ key: 'Escape', repeat: false, phase, settingsOpen: false, ...extra })

describe('escapeAction', () => {
  it('pauses a round that is running', () => {
    expect(press('running')).toBe('pause')
  })

  it('carries on from the Paused screen', () => {
    expect(press('paused')).toBe('resume')
  })

  it('does nothing during the countdown or after the round', () => {
    expect(press('ready')).toBeNull()
    expect(press('finished')).toBeNull()
  })

  it('leaves Escape to the settings window while it is open', () => {
    // Escape closes the window; it must not also pause or resume the round underneath.
    expect(press('running', { settingsOpen: true })).toBeNull()
    expect(press('paused', { settingsOpen: true })).toBeNull()
  })

  it('ignores a held key that is only repeating', () => {
    expect(press('running', { repeat: true })).toBeNull()
    expect(press('paused', { repeat: true })).toBeNull()
  })

  it('ignores every other key', () => {
    for (const key of ['Enter', ' ', 'p', 'Esc', 'Tab']) {
      expect(press('running', { key })).toBeNull()
    }
  })
})
