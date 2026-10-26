import { describe, expect, it } from 'vitest'
import { DESIGN_SIZE, fitScale, MAX_SCALE, pickLayout } from '../src/ui/layout'

describe('pickLayout', () => {
  it('uses portrait on phones, in either direction of the question', () => {
    expect(pickLayout(390, 844)).toBe('portrait')
    expect(pickLayout(412, 915)).toBe('portrait')
  })

  it('uses landscape on a wide desktop window', () => {
    expect(pickLayout(1024, 576)).toBe('landscape')
    expect(pickLayout(1920, 1080)).toBe('landscape')
  })

  it('keeps a nearly square window in portrait', () => {
    expect(pickLayout(800, 760)).toBe('portrait')
    expect(pickLayout(900, 900)).toBe('portrait')
  })

  it('switches at the documented aspect ratio', () => {
    expect(pickLayout(1150, 1000)).toBe('landscape')
    expect(pickLayout(1149, 1000)).toBe('portrait')
  })

  it('falls back to portrait for a window with no size yet', () => {
    expect(pickLayout(0, 0)).toBe('portrait')
    expect(pickLayout(500, 0)).toBe('portrait')
  })
})

describe('fitScale', () => {
  const portrait = DESIGN_SIZE.portrait.start

  it('is exactly 1 when the window matches the design', () => {
    expect(fitScale(390, 844, portrait)).toBe(1)
  })

  it('shrinks to the tighter side so nothing is cut off', () => {
    // 360 wide is the limit: 360 / 390.
    expect(fitScale(360, 800, portrait)).toBeCloseTo(360 / 390, 6)
    // 700 tall is the limit: 700 / 844.
    expect(fitScale(390, 700, portrait)).toBeCloseTo(700 / 844, 6)
  })

  it('fits the desktop design into a 16:9 window', () => {
    const landscape = DESIGN_SIZE.landscape.over
    expect(fitScale(1024, 576, landscape)).toBe(1)
    expect(fitScale(1280, 720, landscape)).toBeCloseTo(1.25, 6)
  })

  it('never scales past the maximum', () => {
    expect(fitScale(5000, 5000, portrait)).toBe(MAX_SCALE)
  })

  it('returns 1 until the window has a size', () => {
    expect(fitScale(0, 0, portrait)).toBe(1)
  })
})
