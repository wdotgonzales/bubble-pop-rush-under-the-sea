import { CONFIG } from '@shared/spawn.js'
import type { RoundStart } from '../types'

/**
 * The bubble schedule is built from the game config, so a round is only playable
 * if this build and the server agree on its version. If they do not, the player
 * needs a newer build (the server would answer 409 on submit anyway).
 */
export function isRoundCompatible(round: Pick<RoundStart, 'config_version'>): boolean {
  return round.config_version === CONFIG.version
}
