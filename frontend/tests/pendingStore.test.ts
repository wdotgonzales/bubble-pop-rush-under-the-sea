import { describe, expect, it } from 'vitest'
import { createPendingStore, type LocalStorageLike } from '../src/game/pendingStore'
import type { PendingScore } from '../src/game/pending'

const SCORE: PendingScore = { roundId: 'a', taps: [{ t: 1, x: 2, y: 3 }], durationMs: 30000, expiresAt: 9_999_999 }

function memoryLocal(): LocalStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

function memoryPlatform() {
  const data: Record<string, unknown> = {}
  return {
    data,
    getData: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
    setData: async (next: Record<string, unknown>) => void Object.assign(data, next),
  }
}

describe('createPendingStore', () => {
  it('writes to the platform and to the device, and reads both back', async () => {
    const platform = memoryPlatform()
    const local = memoryLocal()
    const store = createPendingStore(platform, local)
    await store.save([SCORE])
    expect(platform.data.pending_scores).toEqual([SCORE])
    expect(local.map.size).toBe(1)
    expect(await store.load()).toEqual([SCORE, SCORE])
  })

  it('still has the score when the platform cannot be reached (offline)', async () => {
    const local = memoryLocal()
    const offline = {
      getData: async () => {
        throw new Error('offline')
      },
      setData: async () => {
        throw new Error('offline')
      },
    }
    const store = createPendingStore(offline, local)
    await store.save([SCORE])
    expect(await store.load()).toEqual([SCORE])
  })

  it('still has the score when the device storage is blocked', async () => {
    const platform = memoryPlatform()
    const blocked: LocalStorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const store = createPendingStore(platform, blocked)
    await store.save([SCORE])
    expect(await store.load()).toEqual([SCORE])
  })

  it('works with no device storage at all', async () => {
    const platform = memoryPlatform()
    const store = createPendingStore(platform, null)
    await store.save([SCORE])
    expect(await store.load()).toEqual([SCORE])
  })

  it('reads a damaged local copy as empty', async () => {
    const local = memoryLocal()
    local.map.set('bpr:pending_local', '{not json')
    const store = createPendingStore(memoryPlatform(), local)
    expect(await store.load()).toEqual([])
  })

  it('does not wait forever for a platform that never answers', async () => {
    const local = memoryLocal()
    local.map.set('bpr:pending_local', JSON.stringify([SCORE]))
    const hanging = { getData: () => new Promise<Record<string, unknown>>(() => undefined), setData: async () => undefined }
    const store = createPendingStore(hanging, local, 20)
    expect(await store.load()).toEqual([SCORE])
  })
})
