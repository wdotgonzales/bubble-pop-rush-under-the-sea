// The game rules for one round, with no screen, timer or framework in it. The caller
// passes in the clock, which makes the round easy to test and lets the game pause
// without anything else knowing about it.
//
// What the player sees must be what the server computes, so this uses the same
// schedule and the same hit test as the server (shared/spawn.js), and it records every
// tap in the exact format the server replays.

import { CONFIG, DEFAULT_FIELD, findHit, generateSchedule, radiusAt } from '@shared/spawn.js'
import type { Bubble, FieldSize, Tap } from '@shared/spawn.js'

// The server refuses a whole round that breaks any of these (backend/app/game/validator.py).
// The game drops such a tap instead, so an honest player is never refused. Keep in step.
export const MIN_TAP_GAP_MS = 25
export const MAX_TAPS = 400
export const MAX_TAPS_PER_SECOND = 16

export type RoundPhase = 'ready' | 'running' | 'paused' | 'finished'

/** hit: popped a bubble. miss: empty water. ignored: not recorded at all. */
export type TapOutcome = 'hit' | 'miss' | 'ignored'

export interface PopEvent {
  bubble: Bubble
  /** Where the player tapped, in field units. */
  x: number
  y: number
  /** Round time of the tap, in ms. */
  t: number
  /** Pops in a row, this one included. Only for show: the server does not know about it. */
  streak: number
}

export interface MissEvent {
  x: number
  y: number
  t: number
}

export interface RoundEvents {
  onPop?: (event: PopEvent) => void
  onMiss?: (event: MissEvent) => void
  onFinish?: () => void
}

export interface VisibleBubble {
  bubble: Bubble
  /** Current radius in field units, shrinking to 0 over the bubble's life. */
  radius: number
}

export interface RoundResult {
  /** Every accepted tap, in time order: the log that is submitted. */
  taps: Tap[]
  /** The score the server will compute from those taps. */
  score: number
  durationMs: number
}

export class GameRound {
  readonly schedule: readonly Bubble[]
  readonly durationMs: number
  /** The play field of this round: the one the server gave it. */
  readonly field: FieldSize

  private phase_: RoundPhase = 'ready'
  /** Play time banked before the current run, so pauses never count. */
  private playedMs = 0
  private runStart = 0
  private readonly log: Tap[] = []
  private readonly popped = new Set<number>()
  private score_ = 0
  private streak_ = 0
  private bestStreak_ = 0

  constructor(
    seed: number,
    private readonly events: RoundEvents = {},
    durationMs: number = CONFIG.duration_ms,
    field: FieldSize = DEFAULT_FIELD,
  ) {
    this.field = field
    this.schedule = generateSchedule(seed, field)
    this.durationMs = durationMs
  }

  get phase(): RoundPhase {
    return this.phase_
  }
  get score(): number {
    return this.score_
  }
  get isPaused(): boolean {
    return this.phase_ === 'paused'
  }
  get streak(): number {
    return this.streak_
  }
  get bestStreak(): number {
    return this.bestStreak_
  }
  get tapCount(): number {
    return this.log.length
  }

  /** Begin the round. The clock is whatever the caller uses, in ms (performance.now()). */
  start(now: number): void {
    if (this.phase_ !== 'ready') return
    this.phase_ = 'running'
    this.playedMs = 0
    this.runStart = now
  }

  pause(now: number): void {
    if (this.phase_ !== 'running') return
    this.playedMs += Math.max(0, now - this.runStart)
    this.phase_ = 'paused'
    if (this.playedMs >= this.durationMs) this.finish()
  }

  resume(now: number): void {
    if (this.phase_ !== 'paused') return
    this.runStart = now
    this.phase_ = 'running'
  }

  /** Round time in ms: 0 until start, frozen while paused, capped at the duration. */
  elapsed(now: number): number {
    if (this.phase_ === 'running') {
      return Math.min(this.durationMs, this.playedMs + Math.max(0, now - this.runStart))
    }
    return Math.min(this.durationMs, this.playedMs)
  }

  remaining(now: number): number {
    return this.durationMs - this.elapsed(now)
  }

  /** Call every frame. Ends the round once its time is up. */
  tick(now: number): void {
    if (this.phase_ === 'running' && this.playedMs + Math.max(0, now - this.runStart) >= this.durationMs) {
      this.playedMs = this.durationMs
      this.finish()
    }
  }

  /** The bubbles on screen right now: spawned, not yet expired, not popped. */
  visible(now: number): VisibleBubble[] {
    const t = Math.floor(this.elapsed(now))
    const out: VisibleBubble[] = []
    for (const bubble of this.schedule) {
      if (bubble.spawn_ms > t) break
      if (this.popped.has(bubble.index)) continue
      const radius = radiusAt(bubble, t)
      if (radius > 0) out.push({ bubble, radius })
    }
    return out
  }

  /** A tap at (x, y) in field units. */
  tap(now: number, x: number, y: number): TapOutcome {
    this.tick(now)
    if (this.phase_ !== 'running') return 'ignored'

    const t = Math.floor(this.elapsed(now))
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || px > this.field.width || py < 0 || py > this.field.height) return 'ignored'

    const n = this.log.length
    if (n >= MAX_TAPS) return 'ignored'
    if (n > 0 && t - this.log[n - 1].t < MIN_TAP_GAP_MS) return 'ignored'
    if (n >= MAX_TAPS_PER_SECOND && t - this.log[n - MAX_TAPS_PER_SECOND].t < 1000) return 'ignored'

    const tap: Tap = { t, x: px, y: py }
    this.log.push(tap)

    const bubble = findHit(this.schedule, tap, this.popped)
    if (bubble === null) {
      this.streak_ = 0
      this.events.onMiss?.({ x: px, y: py, t })
      return 'miss'
    }
    this.popped.add(bubble.index)
    this.score_ += bubble.points
    this.streak_ += 1
    this.bestStreak_ = Math.max(this.bestStreak_, this.streak_)
    this.events.onPop?.({ bubble, x: px, y: py, t, streak: this.streak_ })
    return 'hit'
  }

  /** The tap log and score to submit. Only meaningful once the round has finished. */
  result(): RoundResult {
    return { taps: this.log.map((tap) => ({ ...tap })), score: this.score_, durationMs: this.durationMs }
  }

  private finish(): void {
    if (this.phase_ === 'finished') return
    this.phase_ = 'finished'
    this.events.onFinish?.()
  }
}
