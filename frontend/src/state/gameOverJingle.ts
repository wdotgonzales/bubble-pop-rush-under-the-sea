// When the game over screen plays which tune. Plain rules, apart from the React hook that uses them.

export type Jingle = 'none' | 'over' | 'best'

/** How long the game over screen waits for the server before it plays its tune anyway. */
export const SETTLE_WAIT_MS = 600

/**
 * What to play now, or null for nothing. The tune normally plays as the game over screen
 * appears. If the server says in time that it is a new best, that flourish plays instead, so
 * two tunes do not talk over each other. If the answer comes late, the flourish follows the tune.
 */
export function nextJingle(played: Jingle, settled: boolean, newBest: boolean, waited: boolean): 'over' | 'best' | null {
  if (played === 'best') return null
  if (settled && newBest) return 'best'
  if (played === 'none' && (settled || waited)) return 'over'
  return null
}
