import { describe, expect, it } from 'vitest'
import { createFacebookPlatform, type FBInstantSdk } from '../src/platform/facebook'
import { createMockPlatform, type MockStorage } from '../src/platform/mock'
import { choosePlatform } from '../src/platform'
import { rejection } from './helpers'

function memoryStorage(): MockStorage {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

describe('mock platform', () => {
  it('hands back the signature it was given', async () => {
    const platform = createMockPlatform({ signature: 'a.b', name: 'Tester', storage: memoryStorage() })
    expect(platform.kind).toBe('mock')
    expect(await platform.getSignedPlayerInfo()).toBe('a.b')
    expect(platform.getPlayer()).toEqual({ name: 'Tester', photoUrl: null })
  })

  it('has no name unless one is given', () => {
    const platform = createMockPlatform({ signature: null, name: '', storage: memoryStorage() })
    expect(platform.getPlayer()).toEqual({ name: null, photoUrl: null })
  })

  it('explains how to get a signature when there is none', async () => {
    const platform = createMockPlatform({ signature: null, name: '', storage: memoryStorage() })
    const error = await rejection(platform.getSignedPlayerInfo())
    expect((error as Error).message).toContain('make_test_signature')
  })

  it('stores player data and ignores corrupt entries', async () => {
    const storage = memoryStorage()
    const platform = createMockPlatform({ signature: null, name: '', storage })
    await platform.setData({ best: 42, prefs: { muted: true } })
    expect(await platform.getData(['best', 'prefs', 'missing'])).toEqual({ best: 42, prefs: { muted: true } })
    storage.setItem('bpr:best', '{not json')
    expect(await platform.getData(['best'])).toEqual({})
  })
})

describe('facebook platform', () => {
  function sdk(calls: string[]): FBInstantSdk {
    return {
      initializeAsync: async () => void calls.push('init'),
      setLoadingProgress: (p) => void calls.push(`progress ${p}`),
      startGameAsync: async () => void calls.push('start'),
      shareAsync: async (payload) => void calls.push(`share ${payload.intent} ${payload.text}`),
      player: {
        getName: () => 'Ada',
        getPhoto: () => 'https://img.example/ada.png',
        getSignedPlayerInfoAsync: async () => ({ getSignature: () => 'sig.payload' }),
        getDataAsync: async (keys) => Object.fromEntries(keys.map((k) => [k, 1])),
        setDataAsync: async () => void calls.push('set'),
      },
    }
  }

  it('maps each call onto the SDK', async () => {
    const calls: string[] = []
    const platform = createFacebookPlatform(sdk(calls))
    await platform.init()
    platform.setLoadingProgress(100)
    await platform.start()
    expect(await platform.getSignedPlayerInfo()).toBe('sig.payload')
    expect(platform.getPlayer()).toEqual({ name: 'Ada', photoUrl: 'https://img.example/ada.png' })
    expect(await platform.getData(['best'])).toEqual({ best: 1 })
    await platform.setData({ best: 2 })
    await platform.share({ imageBase64: 'data:image/png;base64,AAAA', text: 'I scored 22!' })
    expect(calls).toEqual(['init', 'progress 100', 'start', 'set', 'share SHARE I scored 22!'])
  })

  it('has no name or photo when the SDK offers none (SDK 8.0)', () => {
    const base = sdk([])
    const noNames: FBInstantSdk = {
      ...base,
      player: {
        getSignedPlayerInfoAsync: base.player.getSignedPlayerInfoAsync,
        getDataAsync: base.player.getDataAsync,
        setDataAsync: base.player.setDataAsync,
      },
    }
    const platform = createFacebookPlatform(noNames)
    expect(platform.getPlayer()).toEqual({ name: null, photoUrl: null })
  })

  it('treats an empty name as no name', () => {
    const base = sdk([])
    const platform = createFacebookPlatform({
      ...base,
      player: { ...base.player, getName: () => '', getPhoto: () => null },
    })
    expect(platform.getPlayer()).toEqual({ name: null, photoUrl: null })
  })

  it('says so when the SDK is missing', () => {
    expect(() => createFacebookPlatform(undefined)).toThrow('not loaded')
  })
})

describe('choosePlatform', () => {
  it('uses the mock in development and when the URL asks for it', () => {
    expect(choosePlatform('', true).kind).toBe('mock')
    expect(choosePlatform('?mock=1', false).kind).toBe('mock')
    expect(choosePlatform('?mock_signature=a.b&mock_name=Zed', false).kind).toBe('mock')
  })

  it('reads the mock name from the URL', () => {
    expect(choosePlatform('?mock_name=Zed', true).getPlayer().name).toBe('Zed')
  })
})
