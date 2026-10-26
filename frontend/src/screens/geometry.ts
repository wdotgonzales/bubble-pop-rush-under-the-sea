import type { SparkleSpec } from '../ui/PearlButton'

// Where everything sits on each screen, in pixels of the Figma frames
// (390 x 844 for portrait, 1024 wide for landscape). The Scene scales it all.

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export const START = {
  portrait: {
    title: { left: 40, top: 180.45, width: 310 },
    turtle: { left: 108.4, top: 398.45, width: 173.25, height: 122.1 } satisfies Box,
    best: { left: 24, top: 548.55, width: 342 },
    // DIVE IN is the big button; DASHBOARD sits under it, smaller, so the first thing to tap is clear.
    button: { left: 65, top: 596, width: 260, height: 66, fontSize: 27 },
    sparkles: [
      { x: 244, y: -8, size: 20 },
      { x: -4, y: 50, size: 13 },
    ] satisfies SparkleSpec[],
    dashboard: { left: 85, top: 674, width: 220, height: 54, fontSize: 23 },
    settings: { left: 318, top: 24, size: 48 },
    notice: { left: 24, top: 740, width: 342 },
    practice: { left: 24, top: 774, width: 342 },
  },
  landscape: {
    title: { left: 387, top: 100, width: 250 },
    turtle: { left: 457, top: 268, width: 105, height: 74 } satisfies Box,
    best: { left: 387, top: 365, width: 250 },
    button: { left: 410, top: 399, width: 205, height: 54, fontSize: 24 },
    sparkles: [
      { x: 179, y: -7, size: 20 },
      { x: 0, y: 40, size: 13 },
    ] satisfies SparkleSpec[],
    dashboard: { left: 424, top: 461, width: 176, height: 44, fontSize: 20 },
    settings: { left: 614, top: 10, size: 37 },
    notice: { left: 262, top: 510, width: 500 },
    practice: { left: 332, top: 531, width: 360 },
  },
} as const

export const OVER = {
  portrait: {
    shell: { left: -5, top: 25, width: 390, height: 392 } satisfies Box,
    panel: { left: 24, top: 24, width: 342, height: 796 } satisfies Box,
    turtle: { width: 157, height: 116 },
    score: { width: 224, height: 56, fontSize: 30 },
    bestFontSize: 28,
    button: { width: 260, height: 60, fontSize: 32 },
    playSparkles: [
      { x: 241, y: -9, size: 19 },
      { x: -2, y: 38, size: 12 },
    ] satisfies SparkleSpec[],
    // GO HOME and PLAY AGAIN side by side: the panel is 310 wide inside its padding. GO HOME is the
    // shorter word, so PLAY AGAIN gets the wider button and both labels have room at this size.
    pair: { home: 128, play: 170, gap: 12, height: 60, fontSize: 23 },
    pairSparkles: [
      { x: 152, y: -9, size: 19 },
      { x: -2, y: 38, size: 12 },
    ] satisfies SparkleSpec[],
  },
  landscape: {
    panel: { left: 63, top: 64, width: 897, height: 466 } satisfies Box,
    titleScale: 1.463,
    title: { left: 154, top: 103 },
    turtle: { left: 215, top: 188, width: 248, height: 183 } satisfies Box,
    score: { left: 294, top: 282, width: 211, height: 83, fontSize: 29 },
    best: { left: 291, top: 383, width: 207, fontSize: 26 },
    board: { left: 667, top: 82, width: 280, height: 434 } satisfies Box,
  },
} as const

/**
 * The Dashboard: the top-10 page. On a phone it is one glass panel (the same one as the game over
 * screen) with the header, the board and HOME laid out inside it, so only the sizes are set here.
 * On the wide screen the board sits on the right and the title, the turtle and HOME in the left
 * column, as on the game over screen. The board is wider than the game over one: names are
 * longer here than "SeaExplorer" and there is room.
 */
export const DASHBOARD = {
  portrait: {
    panel: OVER.portrait.panel,
    turtle: { width: 78, height: 55 },
    titleFontSize: 42,
    home: { width: 260, height: 60, fontSize: 32 },
  },
  landscape: {
    panel: OVER.landscape.panel,
    title: { left: 63, top: 96, width: 507, fontSize: 70 },
    turtle: { left: 194, top: 196, width: 248, height: 183 } satisfies Box,
    count: { left: 63, top: 392, width: 507 },
    home: { left: 207, top: 436, width: 222, height: 70, fontSize: 34 },
    // Tall enough for ten rows and the player's own row under them, which the game over board is not.
    board: { left: 590, top: 76, width: 357, height: 442 } satisfies Box,
  },
} as const

/** A button on the wide game over screen, in design pixels. */
export interface ActionSlot {
  left: number
  top: number
  width: number
  height: number
  fontSize: number
}

export interface OverActions {
  share?: ActionSlot
  home?: ActionSlot
  play: ActionSlot
}

const ACTION_TOP = 436
const ACTION_HEIGHT = 70

/**
 * Where the buttons go on the wide game over screen. They always sit in one row under the score:
 * - PLAY AGAIN alone is centred under the score.
 * - With one other button, the two are laid out as in the design: that one on the left, PLAY AGAIN
 *   on the right.
 * - With SHARE and GO HOME and PLAY AGAIN, the three are a little smaller so they still fit in the
 *   left column, clear of the leaderboard.
 */
export function overActions(share: boolean, home: boolean): OverActions {
  const slot = (left: number, width: number, fontSize: number): ActionSlot => ({
    left,
    top: ACTION_TOP,
    width,
    height: ACTION_HEIGHT,
    fontSize,
  })
  if (share && home) {
    return { share: slot(133, 160, 26), home: slot(305, 160, 26), play: slot(477, 184, 26) }
  }
  if (share || home) {
    const other = slot(150, 222, 34)
    return { ...(share ? { share: other } : { home: other }), play: slot(404, 229, 34) }
  }
  return { play: slot(285, 229, 34) }
}

/** The sparkles on PLAY AGAIN follow its width, so they stay on the same corners. */
export function playSparkles(width: number): SparkleSpec[] {
  return [
    { x: width - 16, y: -9, size: 19 },
    { x: -2, y: 44, size: 12 },
  ]
}
