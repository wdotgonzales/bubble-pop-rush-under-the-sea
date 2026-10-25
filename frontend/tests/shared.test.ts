import { describe, expect, it } from 'vitest'
import { CONFIG, generateSchedule, replay } from '@shared/spawn.js'
import vectors from '@shared/spawn-vectors.json'
import { isRoundCompatible } from '../src/api/guard'

// The same golden vectors the server's tests and `node shared/check-vectors.mjs` use.
// Passing here proves the client toolchain really runs the shared generator, and that
// the server and this build agree.

describe('shared generator, through the client toolchain', () => {
  it('has the same config as the server', () => {
    expect(CONFIG).toEqual(vectors.config)
  })

  it('builds the same schedule as the server for every vector seed', () => {
    for (const { seed, bubbles } of vectors.schedules) {
      const got = generateSchedule(seed).map((b) => [b.spawn_ms, b.x, b.y, b.kind, b.lifetime_ms])
      expect(got).toEqual(bubbles)
    }
  })

  it('scores the replay vectors the same as the server', () => {
    for (const { name, seed, taps, score, popped } of vectors.replays) {
      const result = replay(
        generateSchedule(seed),
        taps.map(([t, x, y]) => ({ t, x, y })),
      )
      expect([name, result.score, result.popped]).toEqual([name, score, popped])
    }
  })

  it('uses the portrait field', () => {
    expect(CONFIG.field_height).toBeGreaterThan(CONFIG.field_width)
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
