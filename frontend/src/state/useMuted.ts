import { useCallback, useEffect, useState } from 'react'
import type { Platform } from '../platform'

const MUTED_KEY = 'muted'

/**
 * The sound switch, remembered between visits through the platform's player data
 * (Facebook's, or localStorage when running outside Facebook).
 * `ready` waits for the platform to have started before reading it.
 */
export function useMuted(platform: Platform | null, ready: boolean): [boolean, () => void] {
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    if (!platform || !ready) return
    let cancelled = false
    platform
      .getData([MUTED_KEY])
      .then((data) => {
        if (!cancelled && data[MUTED_KEY] === true) setMuted(true)
      })
      .catch(() => undefined) // a failed read just means "not muted"
    return () => {
      cancelled = true
    }
  }, [platform, ready])

  const toggle = useCallback(() => {
    const next = !muted
    setMuted(next)
    void platform?.setData({ [MUTED_KEY]: next }).catch(() => undefined)
  }, [muted, platform])

  return [muted, toggle]
}
