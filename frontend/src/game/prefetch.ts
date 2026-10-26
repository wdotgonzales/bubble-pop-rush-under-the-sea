// Fetching the next round while the player looks at the game over screen, so PLAY AGAIN
// starts at once instead of waiting for the server. A round fetched early is only used if it
// is still fresh and still fits the window; otherwise it is thrown away and a new one asked for.

import { isValidField } from '@shared/spawn.js'
import type { FieldSize } from '@shared/spawn.js'
import type { RoundStart } from '../types'

export interface Prefetched {
  round: RoundStart
  fetchedAt: number
}

/** A round is good for 24 hours; this is much shorter so a stale one is never played. */
export const MAX_AGE_MS = 5 * 60 * 1000

/** How far a fetched field may be from the one wanted now, per side, before the window is considered changed. */
const FIELD_TOLERANCE = 0.1

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= b * FIELD_TOLERANCE
}

/** The fetched round if it can be played in the current window now, else null. */
export function takeUsable(
  prefetched: Prefetched | null,
  wanted: FieldSize,
  now: number,
): RoundStart | null {
  if (!prefetched) return null
  const { round, fetchedAt } = prefetched
  if (now - fetchedAt > MAX_AGE_MS || now < fetchedAt) return null
  if (!isValidField(round.field_width, round.field_height)) return null
  if (!near(round.field_width, wanted.width) || !near(round.field_height, wanted.height)) return null
  return round
}
