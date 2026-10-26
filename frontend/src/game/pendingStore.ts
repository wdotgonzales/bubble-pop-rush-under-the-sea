// Where waiting scores are written down: the platform's player data (Facebook's, which
// follows the player between devices) AND this device's own localStorage. Facebook's call
// needs a connection, which is exactly when a score is likely to be waiting, so the local
// copy is what survives a page closed while offline. Reading merges both; the queue drops
// repeats by round id.

import type { Platform } from '../platform'
import type { PendingScore, PendingStore } from './pending'

const PLATFORM_KEY = 'pending_scores'
const LOCAL_KEY = 'bpr:pending_local'

/** Facebook's data call can hang with no connection; do not let that hold up the game. */
const LOAD_TIMEOUT_MS = 5000

export interface LocalStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** localStorage if it works (it can throw or be missing in private modes), else nothing. */
export function browserStorage(): LocalStorageLike | null {
  try {
    const probe = '__bpr_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

export function createPendingStore(
  platform: Pick<Platform, 'getData' | 'setData'>,
  local: LocalStorageLike | null = browserStorage(),
  timeoutMs: number = LOAD_TIMEOUT_MS,
): PendingStore {
  return {
    async load() {
      const found: unknown[] = []
      try {
        const data = await withTimeout(platform.getData([PLATFORM_KEY]), timeoutMs)
        const value = data[PLATFORM_KEY]
        if (Array.isArray(value)) found.push(...(value as unknown[]))
      } catch {
        // No connection, or no data: the local copy may still have it.
      }
      try {
        const raw = local?.getItem(LOCAL_KEY)
        const value: unknown = raw ? JSON.parse(raw) : null
        if (Array.isArray(value)) found.push(...(value as unknown[]))
      } catch {
        // A damaged local copy is treated as empty.
      }
      return found
    },

    async save(list: PendingScore[]) {
      // Local first and synchronous, so it lands even if the page closes during the slower call.
      try {
        local?.setItem(LOCAL_KEY, JSON.stringify(list))
      } catch {
        // Storage full or blocked: the in-memory queue still works for this visit.
      }
      try {
        await platform.setData({ [PLATFORM_KEY]: list })
      } catch {
        // Offline: the local copy has it.
      }
    },
  }
}
