import { CONFIG, isValidField } from '@shared/spawn.js'
import type { FieldSize } from '@shared/spawn.js'
import type { RoundStart } from '../types'

/**
 * The bubble schedule is built from the game config, so a round is only playable
 * if this build and the server agree on its version. If they do not, the player
 * needs a newer build (the server would answer 409 on submit anyway).
 */
export function isRoundCompatible(round: Pick<RoundStart, 'config_version'>): boolean {
  return round.config_version === CONFIG.version
}

/**
 * The field a round was started with, or null if the server sent a shape this build would
 * not play on (it checks the same bounds, so this only happens if something is badly wrong).
 */
export function roundField(round: Pick<RoundStart, 'field_width' | 'field_height'>): FieldSize | null {
  return isValidField(round.field_width, round.field_height)
    ? { width: round.field_width, height: round.field_height }
    : null
}
