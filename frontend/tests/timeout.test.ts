import { describe, expect, it } from 'vitest'
import { withTimeout } from '../src/api/timeout'
import { rejection } from './helpers'

describe('withTimeout', () => {
  it('passes the result through when it arrives in time', async () => {
    expect(await withTimeout(Promise.resolve(7), 50)).toBe(7)
  })

  it('passes an error through when the work fails in time', async () => {
    const error = await rejection(withTimeout(Promise.reject(new Error('boom')), 50))
    expect((error as Error).message).toBe('boom')
  })

  it('rejects with the message when the work never finishes', async () => {
    const error = await rejection(withTimeout(new Promise<number>(() => undefined), 10, 'too slow'))
    expect((error as Error).message).toBe('too slow')
  })

  it('wraps something that is not an Error', async () => {
    const error = await rejection(withTimeout(Promise.reject('plain text'), 50))
    expect(error instanceof Error).toBe(true)
  })
})
