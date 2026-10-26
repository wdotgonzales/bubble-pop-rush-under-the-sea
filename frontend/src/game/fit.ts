// Where the playing field sits on the screen, and how to convert between the two.
//
// The field is always the same shape (10000 x 21640 units, the shape of a phone held
// upright), whatever the window is. It is scaled to fit and centred: on a phone it
// fills the screen, on a desktop window it is a centred column. A tap is converted
// back into field units, so every device plays the same round.
//
// The strip along the top of the window belongs to the score and the timer, so the field
// sits below it: a bubble can never appear behind them.

import { CONFIG } from '@shared/spawn.js'

export interface FieldFit {
  /** Screen pixels per field unit. */
  scale: number
  /** Where the field's top-left corner is, in screen pixels. */
  offsetX: number
  offsetY: number
  /** Size of the field on screen, in pixels. */
  width: number
  height: number
}

/**
 * Fit the field into the window, below `insetTop` pixels that are kept free for the HUD.
 */
export function fitField(
  viewportWidth: number,
  viewportHeight: number,
  insetTop = 0,
  fieldWidth: number = CONFIG.field_width,
  fieldHeight: number = CONFIG.field_height,
): FieldFit {
  const availableHeight = viewportHeight - insetTop
  if (viewportWidth <= 0 || availableHeight <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0, width: 0, height: 0 }
  }
  const scale = Math.min(viewportWidth / fieldWidth, availableHeight / fieldHeight)
  const width = fieldWidth * scale
  const height = fieldHeight * scale
  return {
    scale,
    offsetX: (viewportWidth - width) / 2,
    offsetY: insetTop + (availableHeight - height) / 2,
    width,
    height,
  }
}

/** Screen pixels (relative to the canvas) to field units. */
export function toField(fit: FieldFit, screenX: number, screenY: number): { x: number; y: number } {
  if (fit.scale <= 0) return { x: -1, y: -1 }
  return { x: (screenX - fit.offsetX) / fit.scale, y: (screenY - fit.offsetY) / fit.scale }
}

/** Field units to screen pixels (relative to the canvas). */
export function toScreen(fit: FieldFit, x: number, y: number): { x: number; y: number } {
  return { x: fit.offsetX + x * fit.scale, y: fit.offsetY + y * fit.scale }
}
