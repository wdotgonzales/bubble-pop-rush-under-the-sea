// Scores that have not reached the server yet.
//
// A finished round is worth keeping until the server has either accepted it or refused it
// for good. So a round is written down BEFORE it is sent (if the page closes mid-send, the
// score is still there next time), and stays written down until the answer is final:
//
//   accepted            -> forget it, tell the screen
//   4xx (not 429)       -> the server decided; sending again changes nothing -> forget it
//   network, 429, 5xx   -> keep it and try again later (the submit is idempotent, so a repeat
//                          can never count twice)
//   past its expiry     -> forget it; the server would refuse it
//
// See DECISIONS.md, "PR 11".

import { ApiError, isRetryable } from '../api/client'
import type { SubmitResult, Tap } from '../types'
import { submitWithRetry, type RetryOptions } from './submit'

export interface PendingScore {
  roundId: string
  taps: Tap[]
  durationMs: number
  /** When the server stops accepting this round, in epoch milliseconds. */
  expiresAt: number
}

/** What became of a round's score. `queued` is not final: it will be tried again. */
export type ScoreOutcome =
  | { status: 'saved'; result: SubmitResult }
  | { status: 'queued' }
  | { status: 'rejected' }

/** Where the waiting scores are written down. Best effort: a failure never stops the game. */
export interface PendingStore {
  load(): Promise<unknown>
  save(list: PendingScore[]): Promise<void>
}

/** More than this many waiting scores means something is badly wrong; the oldest go first. */
export const MAX_PENDING = 10

/** The server never takes more than this many taps (backend/app/game/config.py). */
const MAX_TAPS = 400

/** A round with no readable expiry is kept this long, a little under the server's 24 hours. */
const FALLBACK_LIFETIME_MS = 23 * 60 * 60 * 1000

/** When a round stops being accepted, from the `expires_at` the server gave. */
export function expiryOf(expiresAt: string, now: number): number {
  const parsed = Date.parse(expiresAt)
  return Number.isFinite(parsed) ? parsed : now + FALLBACK_LIFETIME_MS
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function parseOne(item: unknown): PendingScore | null {
  if (!isRecord(item)) return null
  const { roundId, taps, durationMs, expiresAt } = item
  if (typeof roundId !== 'string' || roundId.length === 0 || roundId.length > 64) return null
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return null
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return null
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null
  const clean: Tap[] = []
  for (const tap of taps) {
    if (!isRecord(tap) || !isInt(tap.t) || !isInt(tap.x) || !isInt(tap.y)) return null
    clean.push({ t: tap.t, x: tap.x, y: tap.y })
  }
  return { roundId, taps: clean, durationMs, expiresAt }
}

/**
 * Read whatever was stored. Stored data can be missing, old, hand-edited or cut off, so
 * anything that is not a complete, unexpired score is skipped rather than trusted.
 */
export function parsePending(raw: unknown, now: number): PendingScore[] {
  if (!Array.isArray(raw)) return []
  const found: PendingScore[] = []
  for (const item of raw) {
    const score = parseOne(item)
    if (!score || score.expiresAt <= now) continue
    if (found.some((other) => other.roundId === score.roundId)) continue
    found.push(score)
    if (found.length >= MAX_PENDING) break
  }
  return found
}

export interface QueueDeps {
  send: (score: PendingScore) => Promise<SubmitResult>
  store: PendingStore
  now?: () => number
  /** Waits between the tries made right after a round (tests make them instant). */
  retry?: RetryOptions
}

type Listener = (roundId: string, outcome: ScoreOutcome) => void

/** A transport problem or a server hiccup is worth another try; so is anything we did not expect. */
function worthKeeping(error: unknown): boolean {
  return !(error instanceof ApiError) || isRetryable(error)
}

export class ScoreQueue {
  private readonly items = new Map<string, PendingScore>()
  private readonly sending = new Set<string>()
  private readonly listeners = new Set<Listener>()
  private flushing: Promise<void> | null = null
  private writes: Promise<void> = Promise.resolve()
  private readonly deps: QueueDeps

  constructor(deps: QueueDeps) {
    this.deps = deps
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /** How many scores are waiting. */
  get size(): number {
    return this.items.size
  }

  /** Hear about every change to a score's fate. Returns the way to stop listening. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  /** Load scores left over from an earlier visit. Safe to call more than once. */
  async restore(): Promise<void> {
    let raw: unknown = []
    try {
      raw = await this.deps.store.load()
    } catch {
      // Nothing readable: carry on with an empty queue.
    }
    for (const score of parsePending(raw, this.now())) {
      if (!this.items.has(score.roundId)) this.items.set(score.roundId, score)
    }
    this.trim()
  }

  /**
   * A round has finished. Write it down, then send it, patiently: a few quick tries with
   * pauses, and if they all fail the score stays queued for later.
   */
  async submit(score: PendingScore): Promise<void> {
    this.items.set(score.roundId, score)
    this.trim()
    this.persist() // not awaited: the write must start before the send, but need not finish
    await this.attempt(score, true)
  }

  /** Try each waiting score once, oldest first, stopping at the first one that cannot get through. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.flushAll().finally(() => {
        this.flushing = null
      })
    }
    return this.flushing
  }

  private async flushAll(): Promise<void> {
    for (const score of [...this.items.values()]) {
      if (!this.items.has(score.roundId) || this.sending.has(score.roundId)) continue
      if (!(await this.attempt(score, false))) return
    }
  }

  /** Returns false when the score could not get through for a reason that will probably also stop the next. */
  private async attempt(score: PendingScore, patient: boolean): Promise<boolean> {
    if (score.expiresAt <= this.now()) {
      this.settle(score, { status: 'rejected' })
      return true
    }
    this.sending.add(score.roundId)
    try {
      const send = () => this.deps.send(score)
      const result = patient ? await submitWithRetry(send, this.deps.retry) : await send()
      this.settle(score, { status: 'saved', result })
      return true
    } catch (error) {
      if (worthKeeping(error)) {
        if (patient) this.notify(score.roundId, { status: 'queued' })
        return false
      }
      this.settle(score, { status: 'rejected' })
      return true
    } finally {
      this.sending.delete(score.roundId)
    }
  }

  /** The answer is final: forget the score and say so. */
  private settle(score: PendingScore, outcome: ScoreOutcome): void {
    this.items.delete(score.roundId)
    this.persist()
    this.notify(score.roundId, outcome)
  }

  private notify(roundId: string, outcome: ScoreOutcome): void {
    for (const listener of this.listeners) listener(roundId, outcome)
  }

  /** Drop the oldest waiting scores beyond the limit (one that is being sent is left alone). */
  private trim(): void {
    for (const [roundId, score] of this.items) {
      if (this.items.size <= MAX_PENDING) break
      if (this.sending.has(roundId)) continue
      this.settle(score, { status: 'rejected' })
    }
  }

  /** Write the current list. Writes run one after another, each saving what is waiting at that moment. */
  private persist(): void {
    this.writes = this.writes
      .then(() => this.deps.store.save([...this.items.values()]))
      .catch(() => undefined)
  }
}
