// Keeping the pictures in memory.
//
// The game preloads every image at start-up, but a preloaded image is only a hint to the
// browser's cache. If the connection drops later, a screen opened for the first time (Game Over,
// say) asks for its pictures again, the cache may no longer have them, and the player sees
// broken-image icons exactly when the network is gone. So each picture is fetched once, kept as
// a blob in memory, and the screens use the in-memory copy's address. Nothing about drawing a
// screen then needs the network.

export interface ArtCacheDeps {
  fetchFn: (url: string) => Promise<Response>
  /** Turns a downloaded picture into an address that works without the network (URL.createObjectURL). */
  makeUrl: (blob: Blob) => string
}

export interface ArtCache {
  /** The address to use for a picture: the in-memory copy if one was kept, else the original. */
  resolve(url: string): string
  /** Download a picture and keep it. Never rejects; on failure `resolve` keeps giving the original. */
  keep(url: string): Promise<void>
}

const TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

/**
 * A picture shown from a blob needs the right type or the browser will not draw it (an SVG
 * served as plain text would show as a broken image). Servers normally get it right; if one does
 * not, the file extension is used.
 */
export function withImageType(blob: Blob, url: string): Blob {
  if (blob.type.startsWith('image/')) return blob
  const extension = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? ''
  const type = TYPES[extension]
  return type ? new Blob([blob], { type }) : blob
}

export function createArtCache(deps: ArtCacheDeps): ArtCache {
  const kept = new Map<string, string>()
  const inFlight = new Map<string, Promise<void>>()

  async function download(url: string): Promise<void> {
    try {
      const response = await deps.fetchFn(url)
      if (!response.ok) return
      kept.set(url, deps.makeUrl(withImageType(await response.blob(), url)))
    } catch {
      // Offline or blocked: the screens fall back to the original address.
    }
  }

  return {
    resolve: (url) => kept.get(url) ?? url,
    keep(url) {
      if (kept.has(url)) return Promise.resolve()
      let pending = inFlight.get(url)
      if (!pending) {
        pending = download(url).finally(() => inFlight.delete(url))
        inFlight.set(url, pending)
      }
      return pending
    },
  }
}
