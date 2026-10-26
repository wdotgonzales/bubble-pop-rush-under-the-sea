// A round that needs no server, for when none can be reached. The bubbles come from the same
// shared schedule and the same engine as a real round, so it plays exactly the same; the
// difference is that nothing is sent, so it cannot reach the leaderboard.

import { CONFIG } from '@shared/spawn.js'
import { chooseField } from './field'
import { HUD_BAND_PX } from './hud'
import type { RoundStart } from '../types'

/** A random 32-bit seed, the same range the server draws from. */
export function randomSeed(): number {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return bytes[0]
}

export function practiceRound(
  view: { width: number; height: number },
  seed: number = randomSeed(),
  now: number = Date.now(),
): RoundStart {
  const field = chooseField(view.width, view.height, HUD_BAND_PX)
  const at = new Date(now)
  return {
    round_id: `practice-${now}`,
    seed,
    config_version: CONFIG.version,
    field_width: field.width,
    field_height: field.height,
    duration_ms: CONFIG.duration_ms,
    started_at: at.toISOString(),
    expires_at: at.toISOString(),
  }
}
