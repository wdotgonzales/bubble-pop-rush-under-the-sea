// Sending a finished round. The submit route's contract (see DECISIONS.md): a 4xx means
// the server has decided and sending again will not change it; a network error, 429 or
// 5xx is worth trying again. The submit is idempotent, so a repeat never double-counts.

import { ApiError, isRetryable } from '../api/client'

/** Waits between attempts, so four tries in all. */
export const RETRY_DELAYS_MS: readonly number[] = [800, 2500, 6000]

/** Never wait longer than this for a server's Retry-After. */
const MAX_WAIT_MS = 10_000

export interface RetryOptions {
  delays?: readonly number[]
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Run `send`, trying again on errors that are worth it. Throws the last error. */
export async function submitWithRetry<T>(send: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const delays = options.delays ?? RETRY_DELAYS_MS
  const sleep = options.sleep ?? realSleep
  for (let attempt = 0; ; attempt++) {
    try {
      return await send()
    } catch (error) {
      if (!isRetryable(error) || attempt >= delays.length) throw error
      const asked = error instanceof ApiError && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : 0
      await sleep(Math.min(MAX_WAIT_MS, Math.max(delays[attempt], asked)))
    }
  }
}
