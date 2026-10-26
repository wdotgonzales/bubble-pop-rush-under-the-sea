import type { Layout } from './layout'

export type TintName = 'pink' | 'gold' | 'green' | 'violet' | 'cyan' | 'blue'

/** "R G B" triplets, used as `rgb(var(--tint) / alpha)` in the stylesheet. */
export const TINTS: Record<TintName, string> = {
  pink: '255 143 216',
  gold: '255 211 107',
  green: '141 255 158',
  violet: '197 139 255',
  cyan: '111 243 255',
  blue: '127 181 255',
}

export interface BubbleSpec {
  /** Position and diameter in design pixels, as placed in the Figma frames. */
  x: number
  y: number
  size: number
  tint: TintName
}

const CYCLE: TintName[] = ['cyan', 'pink', 'gold', 'green', 'violet', 'blue']

// Positions copied from the "Floating bubbles" frames of the Start screens.
const landscape: Array<[number, number, number]> = [
  [229, 130, 45],
  [180, 237, 23],
  [284, 269, 25],
  [234, 340, 41],
  [290, 426, 17],
  [439, 77, 23],
  [377, 161, 17],
  [556, 81, 24],
  [619, 105, 17],
  [631, 172, 14],
  [613, 240, 20],
  [405, 247, 13],
  [724, 110, 34],
  [737, 219, 18],
  [797, 199, 41],
  [846, 296, 19],
  [754, 365, 45],
]

export const BUBBLES: Record<Layout, BubbleSpec[]> = {
  portrait: [
    { x: 304, y: 767, size: 25, tint: 'cyan' },
    { x: 60, y: 748, size: 20, tint: 'blue' },
    { x: 324, y: 568, size: 42, tint: 'violet' },
    { x: 36, y: 508, size: 42, tint: 'green' },
    { x: 322, y: 417, size: 23, tint: 'pink' },
    { x: 27, y: 370, size: 17, tint: 'blue' },
    { x: 352, y: 329, size: 19, tint: 'pink' },
    { x: 19, y: 265, size: 21, tint: 'gold' },
    { x: 338, y: 205, size: 20, tint: 'pink' },
    { x: 282, y: 127, size: 29, tint: 'gold' },
    { x: 57, y: 124, size: 27, tint: 'pink' },
  ],
  landscape: landscape.map(([x, y, size], i) => ({ x, y, size, tint: CYCLE[i % CYCLE.length] })),
}
