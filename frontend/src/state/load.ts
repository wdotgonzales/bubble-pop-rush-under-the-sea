import type { Load } from './types'

/** Transform the value of a `Load` once it has arrived. */
export function mapLoad<T, U>(load: Load<T>, map: (value: T) => U): Load<U> {
  return load.status === 'ready' ? { status: 'ready', data: map(load.data) } : load
}
