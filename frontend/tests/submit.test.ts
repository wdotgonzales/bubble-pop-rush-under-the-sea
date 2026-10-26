import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../src/api/client'
import { RETRY_DELAYS_MS, submitWithRetry } from '../src/game/submit'

/** A send that fails with each of `errors` in turn, then succeeds. */
function flaky(errors: unknown[]) {
  const state = { calls: 0 }
  const send = async () => {
    const error = errors[state.calls]
    state.calls += 1
    if (error !== undefined) throw error
    return 'saved'
  }
  return { state, send }
}

function sleeper() {
  const waits: number[] = []
  return { waits, sleep: async (ms: number) => void waits.push(ms) }
}

describe('submitWithRetry', () => {
  it('sends once when it works', async () => {
    const { state, send } = flaky([])
    const { waits, sleep } = sleeper()
    expect(await submitWithRetry(send, { sleep })).toBe('saved')
    expect(state.calls).toBe(1)
    expect(waits).toEqual([])
  })

  it('tries again after a network error, waiting longer each time', async () => {
    const { state, send } = flaky([new NetworkError('offline'), new NetworkError('offline')])
    const { waits, sleep } = sleeper()
    expect(await submitWithRetry(send, { sleep })).toBe('saved')
    expect(state.calls).toBe(3)
    expect(waits).toEqual([RETRY_DELAYS_MS[0], RETRY_DELAYS_MS[1]])
  })

  it('tries again after a server error and after 429', async () => {
    const { state, send } = flaky([new ApiError(503, null, 'down'), new ApiError(429, 'rate_limited', 'slow')])
    const { sleep } = sleeper()
    expect(await submitWithRetry(send, { sleep })).toBe('saved')
    expect(state.calls).toBe(3)
  })

  it('gives up at once on an answer that will not change', async () => {
    for (const status of [404, 409, 410, 422]) {
      const { state, send } = flaky([new ApiError(status, null, 'no')])
      const { waits, sleep } = sleeper()
      await expect(submitWithRetry(send, { sleep })).rejects.toThrow('no')
      expect(state.calls).toBe(1)
      expect(waits).toEqual([])
    }
  })

  it('gives up after the last attempt and throws the last error', async () => {
    const errors = [1, 2, 3, 4, 5].map((n) => new NetworkError(`try ${n}`))
    const { state, send } = flaky(errors)
    const { waits, sleep } = sleeper()
    await expect(submitWithRetry(send, { sleep })).rejects.toThrow('try 4')
    expect(state.calls).toBe(RETRY_DELAYS_MS.length + 1)
    expect(waits).toEqual([...RETRY_DELAYS_MS])
  })

  it('waits at least as long as the server asked, within a limit', async () => {
    const { send } = flaky([new ApiError(429, null, 'slow', 4), new ApiError(429, null, 'slow', 600)])
    const { waits, sleep } = sleeper()
    await submitWithRetry(send, { sleep })
    expect(waits).toEqual([4000, 10_000])
  })
})
