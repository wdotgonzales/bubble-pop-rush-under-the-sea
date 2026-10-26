// The picture a player shares from the game over screen, drawn on a canvas at the moment of the tap.
// It is drawn, not photographed from the screen: the game over screen changes with the window, but the
// card must look the same for everyone, and 1200 x 630 is the shape Facebook shows shared images in.
//
// Everything that is not drawing (the words, the text fitting, where the bubbles go) is a plain
// function, so it can be tested without a canvas.

import { CONFIG } from '@shared/spawn.js'
import { TINTS, type TintName } from '../ui/bubbleLayouts'
import { withTimeout } from '../api/timeout'

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

/** How long a round lasts, in whole seconds, as the server counts it. */
const ROUND_SECONDS = Math.round(CONFIG.duration_ms / 1000)

/** The message that goes with the picture in the share dialog. */
export function shareText(score: number): string {
  return `I scored ${score} in ${ROUND_SECONDS} seconds on Bubble Pop Rush! Can you beat me?`
}

/** The three lines on the card plate, so the words are in one place. */
export function cardWords(score: number): { before: string; score: string; after: string } {
  return { before: 'I scored', score: String(score), after: `in ${ROUND_SECONDS} seconds!` }
}

/**
 * The largest font size, up to `max`, at which `text` fits in `width`. `measure` returns the width
 * of the text at a font size. Text width grows in proportion to the font size, so one measurement
 * is enough; it is never smaller than `min`, so a very long score still reads.
 */
export function fitFontSize(measure: (size: number) => number, width: number, max: number, min = 40): number {
  const atMax = measure(max)
  if (atMax <= width) return max
  return Math.max(min, Math.floor((max * width) / atMax))
}

export interface CardBubble {
  x: number
  y: number
  radius: number
  tint: TintName
}

/** A small deterministic random sequence, so the same score always gives the same card. */
function sequence(seed: number): () => number {
  let state = (seed * 2654435761 + 12345) >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

const BUBBLE_TINTS: readonly TintName[] = ['cyan', 'pink', 'gold', 'green', 'violet', 'blue']

/**
 * Where the bubbles float. They keep to the sea around the plate and the words (the left edge, the
 * bottom left corner and the whole right side), so they never run into the text. The bubbles on the
 * right are drawn behind the turtle.
 */
export function cardBubbles(seed: number, count = 18): CardBubble[] {
  const random = sequence(seed)
  const out: CardBubble[] = []
  for (let i = 0; i < count; i++) {
    const radius = 10 + random() * 26
    const tint = BUBBLE_TINTS[i % BUBBLE_TINTS.length]
    if (i % 3 !== 0) {
      out.push({ x: 760 + random() * (CARD_WIDTH - 760 - radius), y: 150 + random() * 370, radius, tint })
    } else if (random() < 0.4) {
      out.push({ x: 18 + radius + random() * 20, y: 180 + random() * 380, radius, tint })
    } else {
      out.push({ x: 90 + random() * 320, y: 566 + random() * 40, radius: Math.min(radius, 22), tint })
    }
  }
  return out
}

function rgb(tint: TintName, alpha: number): string {
  const [r, g, b] = TINTS[tint].split(' ')
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawSea(ctx: CanvasRenderingContext2D) {
  const sea = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT)
  sea.addColorStop(0, '#2fbfd3')
  sea.addColorStop(0.45, '#0c7fa8')
  sea.addColorStop(1, '#03285a')
  ctx.fillStyle = sea
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // Light falling through the water from the top.
  for (const [x, spread, alpha] of [
    [250, 90, 0.1],
    [520, 120, 0.12],
    [820, 100, 0.1],
    [1040, 80, 0.08],
  ] as const) {
    const ray = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT * 0.9)
    ray.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
    ray.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = ray
    ctx.beginPath()
    ctx.moveTo(x - 24, 0)
    ctx.lineTo(x + 24, 0)
    ctx.lineTo(x + spread + 60, CARD_HEIGHT)
    ctx.lineTo(x - spread + 60, CARD_HEIGHT)
    ctx.closePath()
    ctx.fill()
  }
}

function drawBubble(ctx: CanvasRenderingContext2D, b: CardBubble) {
  const fill = ctx.createRadialGradient(b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.1, b.x, b.y, b.radius)
  fill.addColorStop(0, 'rgba(255, 255, 255, 0.55)')
  fill.addColorStop(0.6, rgb(b.tint, 0.3))
  fill.addColorStop(1, rgb(b.tint, 0.55))
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = rgb(b.tint, 0.85)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.beginPath()
  ctx.ellipse(b.x - b.radius * 0.35, b.y - b.radius * 0.4, b.radius * 0.22, b.radius * 0.12, -0.6, 0, Math.PI * 2)
  ctx.fill()
}

/** Text with a thick lavender edge and a pearl fill, like the GAME OVER title. */
function drawTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.font = `${size}px "Lilita One", "Coiny", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.save()
  ctx.shadowColor = '#3d2878'
  ctx.shadowOffsetY = size * 0.07
  ctx.shadowBlur = size * 0.03
  ctx.lineWidth = size * 0.17
  ctx.strokeStyle = '#a296e6'
  ctx.strokeText(text, x, y)
  ctx.restore()
  ctx.save()
  ctx.shadowColor = '#ddcbff'
  ctx.shadowBlur = size * 0.1
  ctx.lineWidth = size * 0.17
  ctx.strokeStyle = '#a296e6'
  ctx.strokeText(text, x, y)
  ctx.restore()
  const fill = ctx.createLinearGradient(0, y - size * 0.8, 0, y)
  fill.addColorStop(0, '#fcffff')
  fill.addColorStop(0.3, '#c4d0fb')
  fill.addColorStop(0.65, '#aea3e7')
  fill.addColorStop(1, '#e2acf2')
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

function drawPlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.shadowColor = 'rgba(11, 92, 128, 0.6)'
  ctx.shadowOffsetY = 10
  ctx.shadowBlur = 0
  roundedRect(ctx, x, y, w, h, 56)
  const face = ctx.createLinearGradient(0, y, 0, y + h)
  face.addColorStop(0, '#e7ffff')
  face.addColorStop(0.333, '#c9e5dd')
  face.addColorStop(0.667, '#dbc9e3')
  face.addColorStop(1, '#e3def3')
  ctx.fillStyle = face
  ctx.fill()
  ctx.restore()

  roundedRect(ctx, x, y, w, h, 56)
  ctx.lineWidth = 5
  ctx.strokeStyle = '#b6e7f3'
  ctx.stroke()
  roundedRect(ctx, x + 6, y + 6, w - 12, h - 12, 50)
  ctx.lineWidth = 4
  ctx.strokeStyle = '#f4fcf8'
  ctx.stroke()

  // The little white highlight at the top left of every pearl plate.
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.beginPath()
  ctx.ellipse(x + 62, y + 30, 34, 14, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Plain words on the plate, in the same plum as the game over screen's score. */
function drawPlateText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.font = `700 ${size}px Fredoka, ui-rounded, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#626087'
  ctx.fillText(text, x, y)
}

function drawScore(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  const family = '"Lilita One", "Coiny", system-ui, sans-serif'
  const size = fitFontSize(
    (s) => {
      ctx.font = `${s}px ${family}`
      return ctx.measureText(text).width
    },
    maxWidth,
    210,
  )
  ctx.font = `${size}px ${family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.save()
  ctx.shadowColor = 'rgba(61, 40, 120, 0.55)'
  ctx.shadowOffsetY = size * 0.04
  ctx.shadowBlur = size * 0.03
  ctx.lineWidth = size * 0.1
  ctx.strokeStyle = '#7a6cc7'
  ctx.strokeText(text, x, y)
  ctx.restore()
  const fill = ctx.createLinearGradient(0, y - size * 0.75, 0, y)
  fill.addColorStop(0, '#9b8cf0')
  fill.addColorStop(1, '#5d4fb8')
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

/** Draw the whole card. `turtle` is left out when the picture could not be loaded. */
export function drawShareCard(ctx: CanvasRenderingContext2D, score: number, turtle: CanvasImageSource | null) {
  const words = cardWords(score)
  drawSea(ctx)
  const bubbles = cardBubbles(score)
  for (const b of bubbles) drawBubble(ctx, b)

  drawTitle(ctx, 'BUBBLE POP RUSH', CARD_WIDTH / 2, 92, 82)
  ctx.font = '700 30px Fredoka, ui-rounded, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#b4f4ff'
  ctx.shadowColor = '#1b547a'
  ctx.shadowOffsetY = 2
  ctx.shadowBlur = 2
  ctx.fillText('UNDER THE SEA', CARD_WIDTH / 2, 134)
  ctx.shadowColor = 'transparent'

  const plate = { x: 70, y: 168, w: 640, h: 376 }
  drawPlate(ctx, plate.x, plate.y, plate.w, plate.h)
  const centre = plate.x + plate.w / 2
  drawPlateText(ctx, words.before, centre, plate.y + 86, 58)
  drawScore(ctx, words.score, centre, plate.y + 270, plate.w - 120)
  drawPlateText(ctx, words.after, centre, plate.y + 338, 52)

  if (turtle) {
    // The artwork is 190 x 124.
    const width = 430
    const height = Math.round((width * 124) / 190)
    ctx.drawImage(turtle, 735, 235, width, height)
  }

  ctx.font = '700 38px Fredoka, ui-rounded, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#b4f4ff'
  ctx.shadowColor = '#1b547a'
  ctx.shadowOffsetY = 3
  ctx.shadowBlur = 2
  ctx.fillText('Can you beat me?', CARD_WIDTH / 2, 598)
  ctx.shadowColor = 'transparent'
  ctx.shadowOffsetY = 0
}

function loadPicture(url: string): Promise<HTMLImageElement | null> {
  const loaded = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
  // A picture that never answers must not hold the share back: the card is fine without the turtle.
  return withTimeout(loaded, 3000).catch(() => null)
}

function cardFontsReady(): Promise<unknown> {
  if (!document.fonts) return Promise.resolve()
  const wanted = ['400 40px "Lilita One"', '700 40px Fredoka']
  // Waiting is capped: a font that does not arrive means a plainer card, not no card.
  return withTimeout(Promise.all(wanted.map((font) => document.fonts.load(font, 'Aa0'))), 3000).catch(() => undefined)
}

/** Make the card for a score and return it as a PNG data URL, the form Facebook's share call takes. */
export async function renderShareCard(score: number, turtleUrl: string): Promise<string> {
  const [turtle] = await Promise.all([
    loadPicture(turtleUrl),
    // The fonts are loaded with the game, but a card drawn before they are ready would fall back.
    cardFontsReady(),
  ])
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('The picture for sharing could not be drawn.')
  drawShareCard(ctx, score, turtle)
  try {
    return canvas.toDataURL('image/png')
  } catch (error) {
    // A browser can refuse to export a canvas that has had a picture drawn on it that it does not
    // trust. The card is fine without the turtle, and a card without it beats a SHARE that does nothing.
    if (!turtle) throw error
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
    const plain = document.createElement('canvas')
    plain.width = CARD_WIDTH
    plain.height = CARD_HEIGHT
    const plainCtx = plain.getContext('2d')
    if (!plainCtx) throw error
    drawShareCard(plainCtx, score, null)
    return plain.toDataURL('image/png')
  }
}
