import { describe, expect, it } from 'vitest'
import { CONFIG, DEFAULT_FIELD, generateSchedule, isValidField, replay } from '@shared/spawn.js'
import vectors from '@shared/spawn-vectors.json'
import { isRoundCompatible, roundField } from '../src/api/guard'

// The same golden vectors the server's tests and `node shared/check-vectors.mjs` use.
// Passing here proves the client toolchain really runs the shared generator, and that
// the server and this build agree.

describe('shared generator, through the client toolchain', () => {
  it('has the same config as the server', () => {
    expect(CONFIG).toEqual(vectors.config)
  })

  it('builds the same schedule as the server for every vector seed', () => {
    for (const { seed, field, bubbles } of vectors.schedules) {
      const got = generateSchedule(seed, { width: field[0], height: field[1] }).map((b) => [b.spawn_ms, b.x, b.y, b.kind, b.lifetime_ms])
      expect(got).toEqual(bubbles)
    }
  })

  it('scores the replay vectors the same as the server', () => {
    for (const { name, seed, field, taps, score, popped } of vectors.replays) {
      const result = replay(
        generateSchedule(seed, { width: field[0], height: field[1] }),
        taps.map(([t, x, y]) => ({ t, x, y })),
      )
      expect([name, result.score, result.popped]).toEqual([name, score, popped])
    }
  })

  it('has the portrait phone field as its default', () => {
    expect(CONFIG.field_height).toBeGreaterThan(CONFIG.field_width)
    expect(DEFAULT_FIELD).toEqual({ width: CONFIG.field_width, height: CONFIG.field_height })
    expect(generateSchedule(7)).toEqual(generateSchedule(7, DEFAULT_FIELD))
  })

  it('keeps every bubble inside whatever field the round uses', () => {
    for (const field of [
      { width: 29000, height: 14000 },
      { width: 16732, height: 20261 },
      { width: 8000, height: 8000 },
    ]) {
      for (const b of generateSchedule(99, field)) {
        expect(b.x).toBeGreaterThanOrEqual(b.radius)
        expect(b.x).toBeLessThanOrEqual(field.width - b.radius)
        expect(b.y).toBeGreaterThanOrEqual(b.radius)
        expect(b.y).toBeLessThanOrEqual(field.height - b.radius)
      }
    }
  })

  it('plays the same bubbles at the same moments on any field', () => {
    const timing = (field: { width: number; height: number }) =>
      generateSchedule(123, field).map((b) => [b.spawn_ms, b.kind, b.lifetime_ms])
    expect(timing({ width: 29000, height: 14000 })).toEqual(timing(DEFAULT_FIELD))
  })
})

describe('field bounds', () => {
  it('accepts sensible shapes and refuses absurd ones, like the server', () => {
    expect(isValidField(10000, 21640)).toBe(true)
    expect(isValidField(29000, 14000)).toBe(true)
    expect(isValidField(CONFIG.field_min, CONFIG.field_min)).toBe(true)
    expect(isValidField(CONFIG.field_max, CONFIG.field_max)).toBe(true)
    expect(isValidField(CONFIG.field_min - 1, 10000)).toBe(false)
    expect(isValidField(10000, CONFIG.field_max + 1)).toBe(false)
    expect(isValidField(8000, 36000)).toBe(false) // a sliver
    expect(isValidField(10000.5, 20000)).toBe(false)
    expect(isValidField(Number.NaN, 20000)).toBe(false)
  })

  it('reads the field out of a round, or gives null for a bad one', () => {
    expect(roundField({ field_width: 29000, field_height: 14000 })).toEqual({ width: 29000, height: 14000 })
    expect(roundField({ field_width: 5, field_height: 5 })).toBeNull()
  })
})

describe('config version guard', () => {
  it('accepts rounds built from the same config version', () => {
    expect(isRoundCompatible({ config_version: CONFIG.version })).toBe(true)
  })

  it('refuses rounds from another version', () => {
    expect(isRoundCompatible({ config_version: CONFIG.version + 1 })).toBe(false)
    expect(isRoundCompatible({ config_version: CONFIG.version - 1 })).toBe(false)
  })
})
