import type { Load } from './types'

/** The line under the turtle on the start screen. */
export function bestScoreLabel(best: Load<number>): string {
  if (best.status === 'loading') return 'Best Score: …'
  if (best.status === 'error') return 'Best Score: –'
  return best.data > 0 ? `Best Score: ${best.data}` : 'No score yet'
}

/** The line under the score on the game over screen. */
export function personalBestLabel(score: number, bestScore: number, isNewBest: boolean): string {
  return isNewBest ? `New Best: ${score}!` : `Personal Best: ${bestScore}`
}
