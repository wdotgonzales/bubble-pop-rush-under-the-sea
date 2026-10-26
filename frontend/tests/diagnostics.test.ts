import { describe, expect, it } from 'vitest'
import { CONFIG } from '@shared/spawn.js'
import { createApiClient } from '../src/api/client'
import { createEndpoints } from '../src/api/endpoints'
import { SessionManager } from '../src/api/session'
import { describeError, runDiagnostics, type Step } from '../src/diagnostics'
import { createMockPlatform } from '../src/platform/mock'
import { ApiError, NetworkError } from '../src/api/client'
import type { Services } from '../src/services'
import { fakeFetch, json } from './helpers'

const PLAYER = { id: 'p1', display_name: 'Diver', avatar_url: null, best_score: 7 }

function services(handler: Parameters<typeof fakeFetch>[0], signature: string | null = 'sig.payload'): Services {
  const platform = createMockPlatform({
    signature,
    name: 'Diver',
    storage: { getItem: () => null, setItem: () => undefined },
  })
  const { fetchFn } = fakeFetch(handler)
  const client = createApiClient({
    baseUrl: 'https://api.example.test/api',
    getToken: () => session.getToken(),
    invalidateToken: () => session.invalidate(),
    fetchFn,
  })
  const api = createEndpoints(client)
  const session = new SessionManager({ platform, createSession: api.createSession })
  return { platform, api, session }
}

function happyPath(configVersion = CONFIG.version, field = { width: 10000, height: 21640 }) {
  return (url: string) => {
    if (url.endsWith('/health')) return json({ status: 'ok' })
    if (url.endsWith('/session')) return json({ token: 't', expires_in: 3600, player: PLAYER })
    if (url.endsWith('/me')) return json({ player: PLAYER, rank: null })
    if (url.endsWith('/rounds/start')) {
      return json(
        {
          round_id: '8179e287-84af-4a48-9abe-fc0cb019086b',
          seed: 42,
          config_version: configVersion,
          field_width: field.width,
          field_height: field.height,
          duration_ms: 30000,
          started_at: '2026-10-25T08:00:00Z',
          expires_at: '2026-10-26T08:00:00Z',
        },
        201,
      )
    }
    return json({ detail: 'unexpected' }, 500)
  }
}

async function run(s: Services) {
  let last: Step[] = []
  const ok = await runDiagnostics(s, (steps) => {
    last = steps
  })
  return { ok, steps: last }
}

describe('connection check', () => {
  it('passes every step on the happy path', async () => {
    const { ok, steps } = await run(services(happyPath()))
    expect(ok).toBe(true)
    expect(steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
    expect(steps[2].detail).toContain('Diver')
    expect(steps[4].detail).toContain('seed 42')
  })

  it('stops at the first failure and leaves the rest pending', async () => {
    const handler = (url: string) => (url.endsWith('/session') ? json({ detail: 'invalid signed player info' }, 401) : happyPath()(url))
    const { ok, steps } = await run(services(handler))
    expect(ok).toBe(false)
    expect(steps.map((s) => s.status)).toEqual(['ok', 'ok', 'error', 'pending', 'pending'])
    expect(steps[2].detail).toContain('HTTP 401')
  })

  it('fails the round step when the server config is newer than this build', async () => {
    const { ok, steps } = await run(services(happyPath(CONFIG.version + 1)))
    expect(ok).toBe(false)
    expect(steps[4].status).toBe('error')
    expect(steps[4].detail).toContain('Rebuild the client')
  })

  it('shows the field the server chose', async () => {
    const { ok, steps } = await run(services(happyPath(CONFIG.version, { width: 29000, height: 14000 })))
    expect(ok).toBe(true)
    expect(steps[4].detail).toContain('field 29000 x 14000')
  })

  it('fails the round step when the server sends a field this build would not play on', async () => {
    const { ok, steps } = await run(services(happyPath(CONFIG.version, { width: 100, height: 100 })))
    expect(ok).toBe(false)
    expect(steps[4].status).toBe('error')
    expect(steps[4].detail).toContain('not valid')
  })

  it('reports a missing mock signature', async () => {
    const { steps } = await run(services(happyPath(), null))
    expect(steps[2].status).toBe('error')
    expect(steps[2].detail).toContain('make_test_signature')
  })
})

describe('describeError', () => {
  it('names the status and code of an API error', () => {
    expect(describeError(new ApiError(422, 'too_early', 'too_early'))).toBe('HTTP 422 (too_early): too_early')
  })

  it('points at CORS for a network error', () => {
    expect(describeError(new NetworkError('Failed to fetch'))).toContain('CORS_ORIGINS')
  })
})
