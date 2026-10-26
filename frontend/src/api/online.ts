/**
 * True when the browser knows it has no connection. It is a hint, not a promise: `true` from
 * the browser means "offline" for sure, but "online" can still mean no way out to the server,
 * so a request is what really decides. The game uses this only to skip a request that would
 * certainly fail, and to know when it is worth trying a waiting score again.
 */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
