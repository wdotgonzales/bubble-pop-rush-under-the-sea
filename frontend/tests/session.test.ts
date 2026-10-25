import { describe, expect, it } from 'vitest'
import { SessionManager } from '../src/api/session'
import type { Player, SessionResponse } from '../src/types'
import { rejection } from './helpers'

const PLAYER: Player = { id: 'p1', display_name: 'Diver', avatar_url: null, best_score: 12 }

function setup(options: { expiresIn?: number; fail?: boolean } = {}) {
  let clock = 1_000_000
  let signatures = 0
  let sessions = 0
  const manager = new SessionManager({
    now: () => clock,
    platform: {
      getPlayer: () => ({ name: 'Diver', photoUrl: 'https://img.example/p.png' }),
      getSignedPlayerInfo: async () => `sig-${++signatures}`,
    },
    createSession: async (signature, name, photo): Promise<SessionResponse> => {
      sessions += 1
      await Promise.resolve()
      if (options.fail && sessions === 1) throw new Error('backend down')
      expect(name).toBe('Diver')
      expect(photo).toBe('https://img.example/p.png')
      return { token: `token-for-${signature}`, expires_in: options.expiresIn ?? 3600, player: PLAYER }
    },
  })
  return {
    manager,
    advance: (ms: number) => {
      clock += ms
    },
    counts: () => ({ signatures, sessions }),
  }
}

describe('session manager', () => {
  it('signs in once and reuses the token', async () => {
    const { manager, counts } = setup()
    expect(await manager.getToken()).toBe('token-for-sig-1')
    expect(await manager.getToken()).toBe('token-for-sig-1')
    expect(counts().sessions).toBe(1)
    expect(manager.player).toEqual(PLAYER)
  })

  it('shares one sign-in between overlapping callers', async () => {
    const { manager, counts } = setup()
    const tokens = await Promise.all([manager.getToken(), manager.getToken(), manager.getToken()])
    expect(tokens).toEqual(['token-for-sig-1', 'token-for-sig-1', 'token-for-sig-1'])
    expect(counts()).toEqual({ signatures: 1, sessions: 1 })
  })

  it('signs in again a minute before expiry, with a fresh signature', async () => {
    const { manager, advance, counts } = setup({ expiresIn: 3600 })
    await manager.getToken()
    advance(3600_000 - 61_000) // 61 s left: still fine
    expect(await manager.getToken()).toBe('token-for-sig-1')
    advance(2_000) // 59 s left: renew
    expect(await manager.getToken()).toBe('token-for-sig-2')
    expect(counts().sessions).toBe(2)
  })

  it('signs in again after the token is invalidated', async () => {
    const { manager } = setup()
    await manager.getToken()
    manager.invalidate()
    expect(await manager.getToken()).toBe('token-for-sig-2')
  })

  it('does not remember a failed sign-in', async () => {
    const { manager } = setup({ fail: true })
    const error = await rejection(manager.getToken())
    expect((error as Error).message).toBe('backend down')
    expect(manager.player).toBe(null)
    expect(await manager.getToken()).toBe('token-for-sig-2')
  })
})
