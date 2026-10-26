// Screen sizes and scaling. Screens are laid out once, in the pixel sizes of the
// design, and the whole stage is scaled to fit the window. That keeps every screen
// identical to the design on any device, and bubbles round.

export type Layout = 'portrait' | 'landscape'
export type ScreenId = 'start' | 'over' | 'dashboard'

export interface DesignSize {
  readonly width: number
  readonly height: number
}

/** The mobile design is 390 x 844; the desktop design is 1024 wide. */
export const DESIGN_SIZE: Record<Layout, Record<ScreenId, DesignSize>> = {
  portrait: {
    start: { width: 390, height: 844 },
    over: { width: 390, height: 844 },
    dashboard: { width: 390, height: 844 },
  },
  landscape: {
    start: { width: 1024, height: 559 },
    over: { width: 1024, height: 576 },
    // The same stage as the game over screen: its picture has the big shell the panel sits on.
    dashboard: { width: 1024, height: 576 },
  },
}

/** A window at least this much wider than it is tall gets the desktop layout. */
export const LANDSCAPE_MIN_ASPECT = 1.15

/** Never blow a design up past this, even on a very large window. */
export const MAX_SCALE = 2.5

export function pickLayout(width: number, height: number): Layout {
  if (width <= 0 || height <= 0) return 'portrait'
  return width / height >= LANDSCAPE_MIN_ASPECT ? 'landscape' : 'portrait'
}

/** The largest scale at which the whole design fits the window. */
export function fitScale(
  viewportWidth: number,
  viewportHeight: number,
  design: DesignSize,
  max: number = MAX_SCALE,
): number {
  if (viewportWidth <= 0 || viewportHeight <= 0) return 1
  return Math.min(max, viewportWidth / design.width, viewportHeight / design.height)
}
