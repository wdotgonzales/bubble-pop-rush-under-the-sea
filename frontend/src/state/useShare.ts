import { useCallback, useMemo, useState } from 'react'
import { describeError } from '../diagnostics'
import type { Platform } from '../platform'
import { renderShareCard } from '../share/shareCard'
import { art } from '../ui/art'
import { createSharer } from './share'

/**
 * The SHARE button's behaviour: draw the card, open Facebook's share dialog, and report whether
 * a share is under way so the button can wait. Failures stay out of the player's way (see createSharer).
 */
export function useShare(platform: Platform | null) {
  const [sharing, setSharing] = useState(false)

  const sharer = useMemo(
    () =>
      platform
        ? createSharer({
            share: (payload) => platform.share(payload),
            render: (score) => renderShareCard(score, art.turtleOver),
            // Closing the dialog is a normal way for this to end, so it is a note, not an error.
            report: (error) => console.info('Share did not happen:', describeError(error)),
          })
        : null,
    [platform],
  )

  const share = useCallback(
    (score: number) => {
      if (!sharer) return
      setSharing(true)
      void sharer(score).finally(() => setSharing(false))
    },
    [sharer],
  )

  return { share, sharing }
}
