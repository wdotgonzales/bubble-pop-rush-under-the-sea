import type { Platform } from './platform'

export interface MockOptions {
  /**
   * A signed player info string. Facebook's signature can only be made with the
   * app secret, so for local play generate one with the backend script:
   *   cd backend && python scripts/make_test_signature.py
   * It is valid for 10 minutes. Pass it as ?mock_signature=... in the URL.
   */
  signature: string | null
  name: string
  /** Where player data is kept. Defaults to localStorage, else memory. */
  storage?: MockStorage
}

export interface MockStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const KEY_PREFIX = 'bpr:'

function defaultStorage(): MockStorage {
  try {
    const probe = '__bpr_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    const memory = new Map<string, string>()
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
    }
  }
}

export function createMockPlatform(options: MockOptions): Platform {
  const storage = options.storage ?? defaultStorage()
  return {
    kind: 'mock',
    init: () => Promise.resolve(),
    setLoadingProgress: () => undefined,
    start: () => Promise.resolve(),
    getSignedPlayerInfo() {
      if (!options.signature) {
        return Promise.reject(
          new Error(
            'Mock sign-in needs a signature. Run "python scripts/make_test_signature.py" in backend/ ' +
              'and open this page with ?mock_signature=<value> (valid for 10 minutes).',
          ),
        )
      }
      return Promise.resolve(options.signature)
    },
    getPlayer: () => ({ name: options.name || null, photoUrl: null }),
    getData(keys) {
      const out: Record<string, unknown> = {}
      for (const key of keys) {
        const raw = storage.getItem(KEY_PREFIX + key)
        if (raw !== null) {
          try {
            out[key] = JSON.parse(raw)
          } catch {
            // A corrupt entry is treated as absent.
          }
        }
      }
      return Promise.resolve(out)
    },
    setData(data) {
      for (const [key, value] of Object.entries(data)) {
        storage.setItem(KEY_PREFIX + key, JSON.stringify(value))
      }
      return Promise.resolve()
    },
    share: () => Promise.reject(new Error('Sharing is only available inside Facebook.')),
  }
}
