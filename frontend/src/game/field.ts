// Choosing the shape of the play field for a window.
//
// The field is a rectangle of game units whose shape the server records for each round (see
// DECISIONS.md, "PR 10b"). The game asks for one that matches the window, so the whole
// window is the playing area: a tall field on a phone, a wide one on a desktop, something
// in between on a tablet. A bubble's size in units never changes, so the size to draw it
// at is chosen first and the field is whatever fits in the window at that size.

import { CONFIG, DEFAULT_FIELD, isValidField } from '@shared/spawn.js'
import type { FieldSize } from '@shared/spawn.js'

/** A standard bubble's starting radius, in units. */
const BUBBLE_RADIUS_UNITS = CONFIG.kinds[0].radius

/** A standard bubble's radius on screen is this share of the window's shorter side... */
const RADIUS_SHARE = 0.17
/** ...but never smaller than this (fingers) or bigger than this (a mouse pointer needs no more). */
export const MIN_RADIUS_PX = 56
export const MAX_RADIUS_PX = 78

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * The field to ask for in a window of this size, with `reservedTop` pixels kept free along
 * the top for the score and timer. The result always passes `isValidField`.
 */
export function chooseField(viewportWidth: number, viewportHeight: number, reservedTop = 0): FieldSize {
  const availableHeight = viewportHeight - reservedTop
  if (!(viewportWidth > 0) || !(availableHeight > 0)) return DEFAULT_FIELD

  const shorter = Math.min(viewportWidth, availableHeight)
  const radiusPx = clamp(shorter * RADIUS_SHARE, MIN_RADIUS_PX, MAX_RADIUS_PX)
  // Pixels per unit. On a very large window the field would exceed the server's maximum, so
  // the bubbles grow a little instead.
  const scale = Math.max(radiusPx / BUBBLE_RADIUS_UNITS, viewportWidth / CONFIG.field_max, availableHeight / CONFIG.field_max)

  let width = clamp(Math.round(viewportWidth / scale), CONFIG.field_min, CONFIG.field_max)
  let height = clamp(Math.round(availableHeight / scale), CONFIG.field_min, CONFIG.field_max)
  // No slivers: the server refuses a field more than 3 times as long as it is wide. The
  // game then centres the field in the window with a margin.
  width = Math.min(width, CONFIG.field_max_ratio * height)
  height = Math.min(height, CONFIG.field_max_ratio * width)

  return isValidField(width, height) ? { width, height } : DEFAULT_FIELD
}
