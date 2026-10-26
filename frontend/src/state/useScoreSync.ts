import { useEffect } from 'react'
import { isOffline } from '../api/online'
import type { Services } from '../services'

/** While scores are waiting, try again this often (a tick that finds nothing waiting costs nothing). */
export const SYNC_INTERVAL_MS = 30_000

/**
 * Keeps waiting scores moving. Scores left from an earlier visit are loaded once the platform
 * is ready, and the queue is tried again whenever it could newly work: the connection comes
 * back, the game becomes visible again, or on a timer.
 */
export function useScoreSync(services: Services | null, ready: boolean): void {
  useEffect(() => {
    if (!services || !ready) return
    const { scores } = services
    let stopped = false

    const flush = () => {
      if (!stopped && scores.size > 0 && !isOffline()) void scores.flush()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') flush()
    }

    void scores.restore().then(flush)
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(flush, SYNC_INTERVAL_MS)

    return () => {
      stopped = true
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [services, ready])
}
