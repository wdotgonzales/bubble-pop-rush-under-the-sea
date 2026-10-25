import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError, createApiClient, isRetryable } from '../src/api/client'
import { fakeFetch, json, rejection } from './helpers'

const BASE = 'https://api.example.test/api'

function client(handler: Parameters<typeof fakeFetch>[0], extra: Partial<Parameters<typeof createApiClient>[0]> = {}) {
  const { fetchFn, calls } = fakeFetch(handler)
  const api = createApiClient({ baseUrl: BASE, getToken: async () => 'tok-1', fetchFn, ...extra })
  return { api, calls }
}

describe('api client', () => {
  it('sends the bearer token and parses JSON', async () => {
    const { api, calls } = client(() => json({ ok: true }))
    expect(await api.request('GET', '/me')).toEqual({ ok: true })
    expect(calls[0].url).toBe(`${BASE}/me`)
    expect(calls[0].method).toBe('GET')
    expect(calls[0].headers.Authorization).toBe('Bearer tok-1')
  })

  it('omits the token when auth is off', async () => {
    const { api, calls } = client(() => json({ status: 'ok' }))
    await api.request('GET', '/health', { auth: false })
    expect(calls[0].headers.Authorization).toBe(undefined)
  })

  it('sends a JSON body with a content type', async () => {
    const { api, calls } = client(() => json({}))
    await api.request('POST', '/x', { body: { a: 1 } })
    expect(calls[0].body).toEqual({ a: 1 })
    expect(calls[0].headers['Content-Type']).toBe('application/json')
  })

  it('tolerates a trailing slash on the base URL', async () => {
    const { fetchFn, calls } = fakeFetch(() => json({}))
    const api = createApiClient({ baseUrl: `${BASE}///`, getToken: async () => null, fetchFn })
    await api.request('GET', '/health', { auth: false })
    expect(calls[0].url).toBe(`${BASE}/health`)
  })

  it('maps an error with a plain message', async () => {
    const { api } = client(() => json({ detail: 'round not found' }, 404))
    const error = await rejection(api.request('POST', '/rounds/x/submit'))
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).code).toBe(null)
    expect((error as ApiError).message).toBe('round not found')
  })

  it('maps an error with a machine-readable code', async () => {
    const { api } = client(() => json({ detail: { code: 'too_early' } }, 422))
    const error = (await rejection(api.request('POST', '/x'))) as ApiError
    expect(error.status).toBe(422)
    expect(error.code).toBe('too_early')
  })

  it('copes with a validation error list and a non-JSON error page', async () => {
    const list = client(() => json({ detail: [{ msg: 'bad' }] }, 422))
    const a = (await rejection(list.api.request('POST', '/x'))) as ApiError
    expect(a.status).toBe(422)
    expect(a.code).toBe(null)

    const html = client(() => new Response('<html>Bad gateway</html>', { status: 502 }))
    const b = (await rejection(html.api.request('GET', '/x'))) as ApiError
    expect(b.status).toBe(502)
    expect(b.message).toBe('HTTP 502')
  })

  it('reads Retry-After on a 429', async () => {
    const { api } = client(() => json({ detail: 'slow down' }, 429, { 'Retry-After': '60' }))
    const error = (await rejection(api.request('POST', '/rounds/start'))) as ApiError
    expect(error.status).toBe(429)
    expect(error.retryAfterSeconds).toBe(60)
  })

  it('turns a failed fetch into a NetworkError', async () => {
    const { api } = client(() => {
      throw new TypeError('Failed to fetch')
    })
    const error = await rejection(api.request('GET', '/x'))
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).message).toBe('Failed to fetch')
  })

  it('times out a request that never answers', async () => {
    const { api } = client(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
      { timeoutMs: 20 },
    )
    const error = await rejection(api.request('GET', '/slow'))
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).message).toContain('timed out')
  })

  it('on a 401, drops the token, signs in again and retries once', async () => {
    const tokens = ['old', 'new']
    let invalidated = 0
    let n = 0
    const { api, calls } = client(
      () => (n++ === 0 ? json({ detail: 'token expired' }, 401) : json({ ok: true })),
      {
        getToken: async () => tokens.shift() ?? 'extra',
        invalidateToken: () => {
          invalidated += 1
        },
      },
    )
    expect(await api.request('GET', '/me')).toEqual({ ok: true })
    expect(invalidated).toBe(1)
    expect(calls).toHaveLength(2)
    expect(calls[0].headers.Authorization).toBe('Bearer old')
    expect(calls[1].headers.Authorization).toBe('Bearer new')
  })

  it('gives up if the retry is also a 401', async () => {
    const { api, calls } = client(() => json({ detail: 'nope' }, 401))
    const error = (await rejection(api.request('GET', '/me'))) as ApiError
    expect(error.status).toBe(401)
    expect(calls).toHaveLength(2)
  })

  it('does not retry a 401 on an unauthenticated call', async () => {
    const { api, calls } = client(() => json({ detail: 'invalid signed player info' }, 401))
    await rejection(api.request('POST', '/session', { auth: false }))
    expect(calls).toHaveLength(1)
  })
})

describe('isRetryable', () => {
  it('retries network errors, 429 and 5xx only', () => {
    expect(isRetryable(new NetworkError('x'))).toBe(true)
    expect(isRetryable(new ApiError(429, null, 'x'))).toBe(true)
    expect(isRetryable(new ApiError(500, null, 'x'))).toBe(true)
    expect(isRetryable(new ApiError(503, null, 'x'))).toBe(true)
  })

  it('drops everything else: the round is finished for good', () => {
    for (const status of [400, 401, 404, 409, 410, 422]) {
      expect(isRetryable(new ApiError(status, null, 'x'))).toBe(false)
    }
    expect(isRetryable(new Error('boom'))).toBe(false)
  })
})
