import { describe, expect, it } from 'vitest'
import { CARD_HEIGHT, CARD_WIDTH, cardBubbles, cardWords, fitFontSize, shareText } from '../src/share/shareCard'

describe('share words', () => {
  it('says the score and how long the round was', () => {
    expect(shareText(57)).toContain('I scored 57 in 30 seconds')
    expect(shareText(1)).toContain('I scored 1 in 30 seconds')
  })

  it('splits the card text into the same three lines every time', () => {
    expect(cardWords(57)).toEqual({ before: 'I scored', score: '57', after: 'in 30 seconds!' })
    expect(cardWords(0).score).toBe('0')
  })
})

describe('fitFontSize', () => {
  // Text is 0.6 of the font size wide per character.
  const measure = (chars: number) => (size: number) => chars * size * 0.6

  it('keeps the largest size when the text fits', () => {
    expect(fitFontSize(measure(2), 520, 210)).toBe(210)
  })

  it('shrinks in proportion so the text just fits', () => {
    const size = fitFontSize(measure(8), 520, 210)
    expect(size).toBeLessThan(210)
    expect(measure(8)(size)).toBeLessThanOrEqual(520)
    expect(measure(8)(size + 2)).toBeGreaterThan(520)
  })

  it('never goes below the smallest readable size', () => {
    expect(fitFontSize(measure(40), 520, 210, 40)).toBe(40)
  })
})

describe('card bubbles', () => {
  it('are the same for the same score, so a card can be redrawn identically', () => {
    expect(cardBubbles(57)).toEqual(cardBubbles(57))
  })

  it('differ between scores', () => {
    expect(cardBubbles(57)).not.toEqual(cardBubbles(58))
  })

  // The text of the card, as boxes: [left, top, right, bottom].
  const TEXT_BOXES: ReadonlyArray<readonly [number, number, number, number]> = [
    [270, 20, 930, 110], // BUBBLE POP RUSH
    [480, 105, 720, 142], // UNDER THE SEA
    [150, 200, 630, 520], // the words on the plate
    [440, 562, 760, 612], // Can you beat me?
  ]

  function touches(b: { x: number; y: number; radius: number }, box: readonly [number, number, number, number]) {
    const nearestX = Math.max(box[0], Math.min(b.x, box[2]))
    const nearestY = Math.max(box[1], Math.min(b.y, box[3]))
    return Math.hypot(b.x - nearestX, b.y - nearestY) < b.radius
  }

  it('stay on the card and never touch the words', () => {
    for (let score = 0; score < 300; score++) {
      const bubbles = cardBubbles(score)
      expect(bubbles).toHaveLength(18)
      for (const b of bubbles) {
        expect(b.x - b.radius).toBeGreaterThanOrEqual(0)
        expect(b.x + b.radius).toBeLessThanOrEqual(CARD_WIDTH)
        expect(b.y - b.radius).toBeGreaterThanOrEqual(0)
        expect(b.y + b.radius).toBeLessThanOrEqual(CARD_HEIGHT)
        for (const box of TEXT_BOXES) expect(touches(b, box)).toBe(false)
      }
    }
  })
})
