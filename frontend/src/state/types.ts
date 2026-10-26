/** A value that is being fetched, arrived, or failed to arrive. */
export type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string }
