import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootPlatform } from '../src/boot'
import type { Platform } from '../src/platform'
import { runPreload } from '../src/preload'

describe('runPreload', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reports progress up to 1 as tasks finish', async () => {
    const seen: number[] = []
    await runPreload([async () => 1, async () => 2, async () => 3, async () => 4], (f) => seen.push(f))
    expect(seen).toEqual([0.25, 0.5, 0.75, 1])
  })

  it('reports 1 straight away when there is nothing to load', async () => {
    const seen: number[] = []
    await runPreload([], (f) => seen.push(f))
    expect(seen).toEqual([1])
  })

  it('counts a failing task as done instead of rejecting', async () => {
    const seen: number[] = []
    await runPreload(
      [() => Promise.reject(new Error('missing image')), async () => 1],
      (f) => seen.push(f),
    )
    expect(seen.at(-1)).toBe(1)
  })

  it('counts a task that throws immediately as done', async () => {
    const seen: number[] = []
    await runPreload(
      [
        () => {
          throw new Error('sync failure')
        },
      ],
      (f) => seen.push(f),
    )
    expect(seen).toEqual([1])
  })

  it('gives up on a task that never finishes', async () => {
    const seen: number[] = []
    const done = runPreload([() => new Promise(() => undefined), async () => 1], (f) => seen.push(f), 3000)
    await vi.advanceTimersByTimeAsync(3000)
    await done
    expect(seen.at(-1)).toBe(1)
  })
})

describe('bootPlatform', () => {
  function fakePlatform(calls: string[], options: { failInit?: boolean } = {}): Platform {
    return {
      kind: 'mock',
      init: async () => {
        calls.push('init')
        if (options.failInit) throw new Error('no sdk')
      },
      setLoadingProgress: (percent) => calls.push(`progress:${percent}`),
      start: async () => {
        calls.push('start')
      },
      getSignedPlayerInfo: async () => 'signed',
      getPlayer: () => ({ name: null, photoUrl: null }),
      getData: async () => ({}),
      setData: async () => undefined,
      share: async () => undefined,
    }
  }

  it('initialises, reports progress while loading, then starts', async () => {
    const calls: string[] = []
    await bootPlatform(fakePlatform(calls), async (onProgress) => {
      calls.push('preload')
      onProgress(0.5)
      onProgress(1)
    })
    expect(calls).toEqual(['init', 'progress:5', 'preload', 'progress:50', 'progress:95', 'progress:100', 'start'])
  })

  it('stops at the first failure and never starts', async () => {
    const calls: string[] = []
    await expect(bootPlatform(fakePlatform(calls, { failInit: true }), async () => undefined)).rejects.toThrow(
      'no sdk',
    )
    expect(calls).toEqual(['init'])
  })
})
