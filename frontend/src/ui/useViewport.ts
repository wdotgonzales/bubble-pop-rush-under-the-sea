import { useSyncExternalStore } from 'react'

export interface Viewport {
  width: number
  height: number
}

// One shared snapshot, replaced only when the size really changes, so React can
// compare snapshots by reference.
let current: Viewport = { width: 0, height: 0 }

function getSnapshot(): Viewport {
  const width = window.innerWidth
  const height = window.innerHeight
  if (width !== current.width || height !== current.height) current = { width, height }
  return current
}

const SERVER_SNAPSHOT: Viewport = { width: 0, height: 0 }

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange)
  window.addEventListener('orientationchange', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
    window.removeEventListener('orientationchange', onChange)
  }
}

/** The window size, updated on resize and rotation. */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT)
}
