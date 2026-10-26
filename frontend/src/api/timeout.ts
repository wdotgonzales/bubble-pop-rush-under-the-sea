/**
 * Give up waiting for `promise` after `ms` and reject with `message`. The work behind the promise is
 * not cancelled (a promise cannot be), but whoever was waiting is released with a clear error instead
 * of hanging, which is what a call into the Facebook SDK can do when it is not running inside Facebook.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = 'timed out'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}
