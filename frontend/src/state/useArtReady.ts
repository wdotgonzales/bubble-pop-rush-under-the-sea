import { useEffect, useState } from 'react'
import { artCache, artUrls } from '../ui/art'

/** Never keep the player looking at an empty screen longer than this. */
export const ART_WAIT_MS = 3000

/**
 * True once the screens' pictures have been downloaded and kept in memory, or after a short
 * limit. It depends only on the pictures, never on Facebook: outside Facebook (a browser opened
 * on the game's address) the SDK may never answer, and the game must still appear.
 */
export function useArtReady(limitMs: number = ART_WAIT_MS): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    const done = () => {
      if (live) setReady(true)
    }
    void Promise.all(artUrls.map((url) => artCache.keep(url))).then(done)
    const timer = window.setTimeout(done, limitMs)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [limitMs])
  return ready
}
