import { pickLayout, type Layout } from './layout'
import { useViewport } from './useViewport'

/**
 * Portrait or landscape for the current window. `override` lets a design review
 * force one on a desktop browser (see the preview screens).
 */
export function usePickedLayout(override: Layout | null = null): Layout {
  const { width, height } = useViewport()
  return override ?? pickLayout(width, height)
}
