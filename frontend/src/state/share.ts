// Sharing a score: when it is offered, and the one place a share is started from.
// Kept free of React and of the canvas so it can be tested on its own.

import { withTimeout } from '../api/timeout'
import type { Platform, SharePayload } from '../platform'
import { shareText } from '../share/shareCard'
import type { SaveState } from './flow'

/**
 * Whether the game over screen offers SHARE.
 * - Only inside Facebook: that is the only place the share call exists.
 * - Never for a practice round: it is not a real score, and nothing was saved.
 * - Never for a score the server refused: it is not a score the player can stand behind.
 * - Never for a score of 0: "I scored 0" is not something anyone wants to post.
 * A score still being saved, or waiting to be sent, can be shared: it is the player's own result.
 */
export function canShare(platformKind: Platform['kind'] | null, save: SaveState, score: number): boolean {
  if (platformKind !== 'facebook') return false
  if (save.status === 'practice' || save.status === 'failed') return false
  return score > 0
}

/** The longest the SHARE button waits for the share dialog to answer before it is released. */
export const SHARE_TIMEOUT_MS = 120_000

export interface SharerDeps {
  share: (payload: SharePayload) => Promise<void>
  /** Draws the card for a score and returns it as a PNG data URL. */
  render: (score: number) => Promise<string>
  /** Told about a share that did not happen (the player closing the dialog counts). Never throws. */
  report: (error: unknown) => void
  timeoutMs?: number
}

/**
 * Start a share. Resolves true when the player shared, false when they closed the dialog or
 * something failed: a share that does not work leaves the game exactly as it was, and the button
 * simply works again. A second tap while one is under way does nothing, so the dialog can never be
 * opened twice.
 */
export function createSharer(deps: SharerDeps): (score: number) => Promise<boolean> {
  let busy = false
  return async (score) => {
    if (busy) return false
    busy = true
    try {
      const imageBase64 = await deps.render(score)
      await withTimeout(
        deps.share({ imageBase64, text: shareText(score) }),
        deps.timeoutMs ?? SHARE_TIMEOUT_MS,
        'The share dialog did not answer.',
      )
      return true
    } catch (error) {
      deps.report(error)
      return false
    } finally {
      busy = false
    }
  }
}
