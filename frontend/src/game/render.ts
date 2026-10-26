// Draws one frame of a round on a canvas. It only reads what it is given: the state
// of the round and of the effects. The look of the bubbles follows the glossy ones on
// the menu screens (ui.css, .bubble).

import type { Bubble } from '@shared/spawn.js'
import type { VisibleBubble } from './engine'
import { easeOut, progress, type Effects } from './effects'
import type { FieldFit } from './fit'
import { isPearl, rgba, tintFor } from './palette'

export interface Frame {
  ctx: CanvasRenderingContext2D
  /** Canvas size in CSS pixels. */
  width: number
  height: number
  /** Device pixels per CSS pixel. */
  dpr: number
  fit: FieldFit
  /** Wall clock, ms. */
  now: number
  /** Round time, ms. Frozen while paused. */
  roundMs: number
  /** Height of the strip at the top that holds the score and the timer, in CSS pixels. */
  hudBand: number
  bubbles: readonly VisibleBubble[]
  effects: Effects
}

/** How far a bubble drifts from where it really is, in field units. Hit tests ignore it. */
export const WOBBLE_UNITS = 70

const FONT = "'Lilita One', 'Coiny', ui-rounded, system-ui, sans-serif"
const FADE_IN_MS = 110

export function drawFrame(frame: Frame): void {
  const { ctx, width, height, dpr, fit } = frame
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (fit.scale <= 0) return

  dimOutsideField(frame)
  for (const item of frame.bubbles) drawBubble(frame, item)
  drawRipples(frame)
  drawRings(frame)
  drawParticles(frame)
  drawFloaters(frame)
  drawToast(frame)
}

/**
 * On a window wider or taller than the field, shade what is outside it. The strip at the
 * top, where the score and timer are, counts as part of the playing column.
 */
function dimOutsideField({ ctx, width, height, fit, hudBand }: Frame): void {
  ctx.fillStyle = 'rgba(3, 31, 74, 0.38)'
  const right = fit.offsetX + fit.width
  if (fit.offsetX > 1) {
    ctx.fillRect(0, 0, fit.offsetX, height)
    ctx.fillRect(right, 0, width - right, height)
  }
  const left = Math.max(0, fit.offsetX)
  const columnWidth = Math.min(width, right) - left
  if (fit.offsetY - hudBand > 1) ctx.fillRect(left, hudBand, columnWidth, fit.offsetY - hudBand)
  const bottom = fit.offsetY + fit.height
  if (height - bottom > 1) ctx.fillRect(left, bottom, columnWidth, height - bottom)
}

/** Where a bubble is drawn, in field units: its real spot plus a slow drift. */
export function drawnPosition(bubble: Pick<Bubble, 'index' | 'x' | 'y'>, roundMs: number): { x: number; y: number } {
  return {
    x: bubble.x + Math.sin(roundMs / 520 + bubble.index * 1.7) * WOBBLE_UNITS,
    y: bubble.y + Math.cos(roundMs / 610 + bubble.index * 2.3) * WOBBLE_UNITS,
  }
}

function drawBubble(frame: Frame, { bubble, radius }: VisibleBubble): void {
  const { ctx, fit, roundMs } = frame
  const at = drawnPosition(bubble, roundMs)
  const cx = fit.offsetX + at.x * fit.scale
  const cy = fit.offsetY + at.y * fit.scale
  const r = radius * fit.scale
  if (r < 1) return

  const tint = tintFor(bubble)
  const pearl = isPearl(bubble)
  const fadeIn = Math.min(1, Math.max(0, (roundMs - bubble.spawn_ms) / FADE_IN_MS))

  ctx.save()
  ctx.globalAlpha = fadeIn

  // Glow around the bubble.
  const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.4)
  glow.addColorStop(0, rgba(tint, pearl ? 0.55 : 0.4))
  glow.addColorStop(1, rgba(tint, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2)
  ctx.fill()

  // Body: clear in the middle, tinted towards the edge, with colour pooling at the bottom right.
  const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  body.addColorStop(0, rgba(tint, pearl ? 0.22 : 0.05))
  body.addColorStop(0.52, rgba(tint, pearl ? 0.22 : 0.05))
  body.addColorStop(1, rgba(tint, pearl ? 0.6 : 0.42))
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  const pool = ctx.createRadialGradient(cx + r * 0.36, cy + r * 0.64, 0, cx + r * 0.36, cy + r * 0.64, r * 0.95)
  pool.addColorStop(0, rgba(tint, 0.55))
  pool.addColorStop(1, rgba(tint, 0))
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = pool
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
  ctx.restore()

  if (pearl) pearlSheen(ctx, cx, cy, r)

  // A light inner edge, then the rim.
  const inner = ctx.createRadialGradient(cx, cy, r * 0.74, cx, cy, r)
  inner.addColorStop(0, 'rgba(255, 255, 255, 0)')
  inner.addColorStop(1, 'rgba(255, 255, 255, 0.28)')
  ctx.fillStyle = inner
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.lineWidth = pearl ? 2 : 1.2
  ctx.strokeStyle = pearl ? rgba(tint, 0.95) : 'rgba(255, 255, 255, 0.55)'
  ctx.beginPath()
  ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.stroke()

  // Main highlight, top left, and a small glint bottom right.
  glossEllipse(ctx, cx - r * 0.38, cy - r * 0.52, r * 0.3, r * 0.24, -28, 0.95)
  glossEllipse(ctx, cx + r * 0.56, cy + r * 0.63, r * 0.16, r * 0.13, 0, 0.6)

  if (pearl) {
    // A star that twinkles, so a pearl is easy to spot.
    const twinkle = 0.65 + 0.35 * Math.sin(roundMs / 140 + bubble.index)
    star(ctx, cx + r * 0.42, cy - r * 0.46, r * 0.26 * twinkle, 'rgba(255, 255, 255, 0.95)')
  }
  ctx.restore()
}

/** A hint of pink and aqua across a pearl, like the shine on a real one. */
function pearlSheen(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  sheen.addColorStop(0, 'rgba(255, 170, 230, 0.28)')
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)')
  sheen.addColorStop(1, 'rgba(120, 240, 255, 0.34)')
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = sheen
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
  ctx.restore()
}

function glossEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  degrees: number,
  strength: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.scale(rx, ry)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  g.addColorStop(0, `rgba(255, 255, 255, ${strength})`)
  g.addColorStop(0.6, `rgba(255, 255, 255, ${strength * 0.37})`)
  g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string): void {
  if (size < 0.5) return
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.quadraticCurveTo(size * 0.12, -size * 0.12, size, 0)
  ctx.quadraticCurveTo(size * 0.12, size * 0.12, 0, size)
  ctx.quadraticCurveTo(-size * 0.12, size * 0.12, -size, 0)
  ctx.quadraticCurveTo(-size * 0.12, -size * 0.12, 0, -size)
  ctx.fill()
  ctx.restore()
}

function drawRings({ ctx, fit, now, effects }: Frame): void {
  for (const ring of effects.rings) {
    const p = progress(now, ring.born, ring.life)
    const radius = (ring.from + (ring.to - ring.from) * easeOut(p)) * fit.scale
    ctx.lineWidth = Math.max(1.5, 3.5 * (1 - p))
    ctx.strokeStyle = rgba([255, 255, 255], 0.85 * (1 - p))
    ctx.beginPath()
    ctx.arc(fit.offsetX + ring.x * fit.scale, fit.offsetY + ring.y * fit.scale, radius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawParticles({ ctx, fit, now, effects }: Frame): void {
  for (const particle of effects.particles) {
    const age = now - particle.born
    const p = progress(now, particle.born, particle.life)
    // Start fast and settle, with a little sink at the end.
    const travel = easeOut(p) * particle.life
    const x = fit.offsetX + (particle.x + particle.vx * travel) * fit.scale
    const y = fit.offsetY + (particle.y + particle.vy * travel + 0.0009 * age * age) * fit.scale
    const r = Math.max(1, particle.size * fit.scale * (1 - p * 0.6))
    ctx.fillStyle = rgba([255, 255, 255], 0.9 * (1 - p))
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = rgba(particle.tint, 0.55 * (1 - p))
    ctx.beginPath()
    ctx.arc(x, y, r * 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawRipples({ ctx, fit, now, effects }: Frame): void {
  for (const ripple of effects.ripples) {
    const p = progress(now, ripple.born, ripple.life)
    const radius = (260 + 780 * easeOut(p)) * fit.scale
    ctx.lineWidth = 2
    ctx.strokeStyle = rgba([220, 250, 255], 0.5 * (1 - p))
    ctx.beginPath()
    ctx.arc(fit.offsetX + ripple.x * fit.scale, fit.offsetY + ripple.y * fit.scale, radius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  fill: string,
  alpha: number,
): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `${Math.round(px)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(3, px * 0.18)
  ctx.strokeStyle = 'rgba(7, 78, 121, 0.85)'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawFloaters({ ctx, fit, now, effects }: Frame): void {
  for (const floater of effects.floaters) {
    const p = progress(now, floater.born, floater.life)
    const rise = 900 * easeOut(p)
    const alpha = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45
    const pop = 1 + 0.25 * Math.max(0, 1 - p * 6)
    const size = (floater.big ? 1500 : 1100) * fit.scale * pop
    outlinedText(
      ctx,
      floater.text,
      fit.offsetX + floater.x * fit.scale,
      fit.offsetY + (floater.y - rise) * fit.scale,
      size,
      floater.big ? '#ffe08a' : '#ffffff',
      alpha,
    )
  }
}

function drawToast({ ctx, fit, now, effects }: Frame): void {
  const toast = effects.toast
  if (!toast) return
  const p = progress(now, toast.born, toast.life)
  const scale = p < 0.14 ? 0.6 + (0.5 * p) / 0.14 : p < 0.25 ? 1.1 - 0.1 * ((p - 0.14) / 0.11) : 1
  const alpha = p > 0.72 ? 1 - (p - 0.72) / 0.28 : 1
  outlinedText(
    ctx,
    toast.text,
    fit.offsetX + fit.width / 2,
    fit.offsetY + fit.height * 0.24,
    1900 * fit.scale * scale,
    '#ffe08a',
    alpha,
  )
}
