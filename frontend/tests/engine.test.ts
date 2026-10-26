import { describe, expect, it } from 'vitest'
import { CONFIG, generateSchedule, mulberry32, replay } from '@shared/spawn.js'
import type { Tap } from '@shared/spawn.js'
import {
  GameRound,
  MAX_TAPS,
  MAX_TAPS_PER_SECOND,
  MIN_TAP_GAP_MS,
  type MissEvent,
  type PopEvent,
} from '../src/game/engine'

/** The server's rhythm rules, written out again here (backend/app/game/validator.py). */
function rhythmProblem(taps: Tap[]): string | null {
  for (let i = 1; i < taps.length; i++) {
    if (taps[i].t < taps[i - 1].t) return 'out of order'
    if (taps[i].t - taps[i - 1].t < MIN_TAP_GAP_MS) return 'too close'
  }
  for (let i = 0; i + MAX_TAPS_PER_SECOND < taps.length; i++) {
    if (taps[i + MAX_TAPS_PER_SECOND].t - taps[i].t < 1000) return 'too many in a second'
  }
  if (taps.length > MAX_TAPS) return 'too many taps'
  return null
}

const SEEDS = [1, 7, 42, 1234, 99999, 4242424242]
const ORIGIN = 5000 // an arbitrary clock reading for the start of the round

function started(seed = 42, events = {}) {
  const round = new GameRound(seed, events)
  round.start(ORIGIN)
  return round
}

describe('GameRound: scoring matches the server', () => {
  it('scores a player who taps every bubble exactly like the server replay', () => {
    for (const seed of SEEDS) {
      const round = started(seed)
      for (const bubble of round.schedule) round.tap(ORIGIN + bubble.spawn_ms + 100, bubble.x, bubble.y)
      round.tick(ORIGIN + CONFIG.duration_ms + 1)
      const { taps, score } = round.result()
      expect(round.phase).toBe('finished')
      expect(score).toBeGreaterThan(30)
      expect(score).toBe(replay(round.schedule, taps).score)
    }
  })

  it('agrees with the replay under a flood of random taps, and never breaks a server rule', () => {
    for (const seed of SEEDS) {
      const random = mulberry32(seed)
      const round = started(seed)
      for (let t = 0; t < CONFIG.duration_ms; t += 7) {
        round.tap(ORIGIN + t, random() % CONFIG.field_width, random() % CONFIG.field_height)
      }
      round.tick(ORIGIN + CONFIG.duration_ms)
      const { taps, score } = round.result()
      expect(taps.length).toBeGreaterThan(50) // mulberry32 returns whole numbers, hence the %
      expect(rhythmProblem(taps)).toBeNull()
      expect(score).toBe(replay(generateSchedule(seed), taps).score)
    }
  })
})

describe('GameRound: tap limiter', () => {
  it('drops a tap closer than 25 ms to the last one, and keeps one exactly 25 ms later', () => {
    const round = started()
    expect(round.tap(ORIGIN + 1000, 100, 100)).not.toBe('ignored')
    expect(round.tap(ORIGIN + 1010, 100, 100)).toBe('ignored')
    expect(round.tap(ORIGIN + 1024, 100, 100)).toBe('ignored')
    expect(round.tap(ORIGIN + 1025, 100, 100)).not.toBe('ignored')
    expect(round.tapCount).toBe(2)
  })

  it('allows 16 taps in a second and drops the 17th', () => {
    const round = started()
    // 16 taps 60 ms apart span 900 ms, so a 17th inside the same second is one too many.
    for (let i = 0; i < 16; i++) expect(round.tap(ORIGIN + 1000 + i * 60, 50, 50)).not.toBe('ignored')
    expect(round.tap(ORIGIN + 1000 + 16 * 60, 50, 50)).toBe('ignored')
    // Once the first of the 16 is more than a second old, there is room again.
    expect(round.tap(ORIGIN + 2000, 50, 50)).not.toBe('ignored')
  })

  it('never lets a button-masher produce a log the server would refuse', () => {
    const round = started()
    for (let t = 0; t < CONFIG.duration_ms; t += 11) round.tap(ORIGIN + t, 500, 500)
    expect(rhythmProblem(round.result().taps)).toBeNull()
  })

  it('stops at the server cap of 400 taps', () => {
    const round = started()
    // 16 taps a second, evenly spaced, for the whole round is 480 attempts.
    for (let i = 0; i < 480; i++) round.tap(ORIGIN + Math.floor(i * 62.5), 500, 500)
    expect(round.tapCount).toBe(MAX_TAPS)
    expect(rhythmProblem(round.result().taps)).toBeNull()
  })

  it('ignores taps outside the field and rounds the rest to whole units', () => {
    const round = started()
    expect(round.tap(ORIGIN + 500, -1, 100)).toBe('ignored')
    expect(round.tap(ORIGIN + 600, 100, CONFIG.field_height + 1)).toBe('ignored')
    expect(round.tap(ORIGIN + 700, CONFIG.field_width + 0.4, 100.6)).not.toBe('ignored')
    const [tap] = round.result().taps
    expect(tap).toEqual({ t: 200 + 500, x: CONFIG.field_width, y: 101 })
    expect(Number.isInteger(tap.t) && Number.isInteger(tap.x) && Number.isInteger(tap.y)).toBe(true)
  })
})

describe('GameRound: the clock', () => {
  it('ignores taps before the start, and while paused', () => {
    const round = new GameRound(42)
    expect(round.tap(ORIGIN + 500, 100, 100)).toBe('ignored')
    round.start(ORIGIN)
    round.pause(ORIGIN + 1000)
    expect(round.tap(ORIGIN + 1500, 100, 100)).toBe('ignored')
    expect(round.tapCount).toBe(0)
  })

  it('does not count paused time, so a tap after a long pause has the round time of before it', () => {
    const round = started()
    round.pause(ORIGIN + 5000)
    expect(round.elapsed(ORIGIN + 65_000)).toBe(5000)
    round.resume(ORIGIN + 65_000)
    expect(round.tap(ORIGIN + 65_100, 100, 100)).not.toBe('ignored')
    expect(round.result().taps[0].t).toBe(5100)
  })

  it('needs the full 30 seconds of play, however long the pauses were', () => {
    const round = started()
    round.pause(ORIGIN + 10_000)
    round.resume(ORIGIN + 100_000)
    round.tick(ORIGIN + 100_000 + 19_999)
    expect(round.phase).toBe('running')
    round.tick(ORIGIN + 100_000 + 20_000)
    expect(round.phase).toBe('finished')
  })

  it('finishes exactly once, and ignores a tap that arrives after the end', () => {
    let finished = 0
    const round = started(42, { onFinish: () => (finished += 1) })
    expect(round.tap(ORIGIN + CONFIG.duration_ms, 100, 100)).toBe('ignored')
    round.tick(ORIGIN + CONFIG.duration_ms + 5000)
    expect(round.phase).toBe('finished')
    expect(finished).toBe(1)
    expect(round.elapsed(ORIGIN + 999_999)).toBe(CONFIG.duration_ms)
  })

  it('keeps every logged tap inside the round, so the server accepts its time', () => {
    const round = started()
    for (let t = 0; t <= CONFIG.duration_ms + 200; t += 90) round.tap(ORIGIN + t, 100, 100)
    for (const tap of round.result().taps) expect(tap.t).toBeLessThanOrEqual(CONFIG.duration_ms)
  })
})

describe('GameRound: bubbles and streaks', () => {
  it('shows a bubble from its spawn until it expires, and not after it is popped', () => {
    const round = started(42)
    const first = round.schedule[0]
    expect(round.visible(ORIGIN + first.spawn_ms - 1).some((v) => v.bubble.index === first.index)).toBe(false)

    const shown = round.visible(ORIGIN + first.spawn_ms)
    const mine = shown.find((v) => v.bubble.index === first.index)
    expect(mine?.radius).toBe(first.radius)

    const half = round.visible(ORIGIN + first.spawn_ms + first.lifetime_ms / 2).find((v) => v.bubble.index === first.index)
    expect(half?.radius).toBe(Math.floor(first.radius / 2))

    expect(round.visible(ORIGIN + first.spawn_ms + first.lifetime_ms).some((v) => v.bubble.index === first.index)).toBe(false)

    expect(round.tap(ORIGIN + first.spawn_ms + 100, first.x, first.y)).toBe('hit')
    expect(round.visible(ORIGIN + first.spawn_ms + 150).some((v) => v.bubble.index === first.index)).toBe(false)
  })

  it('pops a bubble only once', () => {
    const round = started(42)
    const first = round.schedule[0]
    expect(round.tap(ORIGIN + first.spawn_ms + 100, first.x, first.y)).toBe('hit')
    expect(round.tap(ORIGIN + first.spawn_ms + 200, first.x, first.y)).toBe('miss')
    expect(round.score).toBe(first.points)
  })

  it('counts a streak of pops, resets it on empty water, and reports the best', () => {
    const pops: PopEvent[] = []
    const misses: MissEvent[] = []
    const round = started(42, { onPop: (e: PopEvent) => pops.push(e), onMiss: (e: MissEvent) => misses.push(e) })
    const [a, b, c] = round.schedule
    // A spot far from every bubble that exists early in the round.
    const empty = { x: 1, y: 1 }
    round.tap(ORIGIN + a.spawn_ms + 50, a.x, a.y)
    round.tap(ORIGIN + b.spawn_ms + 50, b.x, b.y)
    expect(round.streak).toBe(2)
    const outcome = round.tap(ORIGIN + b.spawn_ms + 100, empty.x, empty.y)
    expect(outcome).toBe('miss')
    expect(round.streak).toBe(0)
    round.tap(ORIGIN + c.spawn_ms + 50, c.x, c.y)
    expect(round.streak).toBe(1)
    expect(round.bestStreak).toBe(2)
    expect(pops.map((p) => p.streak)).toEqual([1, 2, 1])
    expect(pops[0].bubble.index).toBe(a.index)
    expect(misses).toEqual([{ x: 1, y: 1, t: b.spawn_ms + 100 }])
  })

  it('adds exactly the popped bubble\'s points, 1 for standard and 3 for a pearl', () => {
    const gains: number[] = []
    const seen = new Set<number>()
    const round = started(42, {
      onPop: (e: PopEvent) => {
        seen.add(e.bubble.points)
        gains.push(e.bubble.points)
      },
    })
    for (const bubble of round.schedule) round.tap(ORIGIN + bubble.spawn_ms + 100, bubble.x, bubble.y)
    expect([...seen].sort()).toEqual([1, 3])
    expect(round.score).toBe(gains.reduce((sum, points) => sum + points, 0))
  })
})

describe('GameRound on another field', () => {
  const WIDE = { width: 29000, height: 14000 }

  it('plays the schedule of its own field and scores it like the server', () => {
    const seed = 5150
    const round = new GameRound(seed, {}, undefined, WIDE)
    expect(round.schedule).toEqual(generateSchedule(seed, WIDE))
    round.start(0)
    for (const b of round.schedule) {
      round.tap(b.spawn_ms + 150, b.x, b.y)
    }
    round.tick(CONFIG.duration_ms + 1)
    const { taps, score } = round.result()
    expect(score).toBeGreaterThan(0)
    expect(replay(generateSchedule(seed, WIDE), taps).score).toBe(score)
  })

  it('accepts taps anywhere in its field and ignores those beyond it', () => {
    const round = new GameRound(1, {}, undefined, WIDE)
    round.start(0)
    expect(round.tap(100, 25000, 13000)).not.toBe('ignored')
    expect(round.tap(200, WIDE.width + 1, 100)).toBe('ignored')
    expect(round.tap(300, 100, WIDE.height + 1)).toBe('ignored')
    // The same point is outside the default portrait field.
    const portrait = new GameRound(1)
    portrait.start(0)
    expect(portrait.tap(100, 25000, 100)).toBe('ignored')
  })

  it('reports its field', () => {
    expect(new GameRound(1, {}, undefined, WIDE).field).toEqual(WIDE)
    expect(new GameRound(1).field).toEqual({ width: CONFIG.field_width, height: CONFIG.field_height })
  })
})
