import { ApiError, NetworkError } from '../api/client'
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

/** Shown on the start screen when the build and the server disagree on the game rules. */
export const OUTDATED_BUILD_NOTICE = 'This version of the game is out of date. Reload to update it.'

/** Why a round could not be started, in words for the player. */
export function startFailureLabel(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return 'Too many rounds in a row. Wait a few seconds.'
  if (error instanceof NetworkError) return "Can't reach the game. Check your connection and try again."
  return "Couldn't start a round. Please try again."
}

/** What can be said about a score that has not been confirmed by the server. */
export type UnsavedStatus = 'saving' | 'queued' | 'failed' | 'practice'

/**
 * The line where the personal best goes while the score is on its way to the server, or when
 * it was not (or will not be) counted.
 */
export function saveLabel(status: UnsavedStatus): string {
  switch (status) {
    case 'saving':
      return 'Saving score…'
    case 'queued':
      return 'Will save later'
    case 'failed':
      return 'Score not saved'
    case 'practice':
      return 'Practice round'
  }
}

/** The button under a failed start that plays a round without the server. */
export const PRACTICE_LABEL = 'Play a practice round'
