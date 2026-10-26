import { describe, expect, it } from 'vitest'
import { CONFIG } from '@shared/spawn.js'
import { fitField, toField, toScreen } from '../src/game/fit'

describe('fitField', () => {
  it('fills a phone-shaped window exactly', () => {
    const fit = fitField(390, 844)
    expect(fit.scale).toBeCloseTo(390 / CONFIG.field_width, 6)
    // 390 x 844 is the field's shape to within a hundredth of a pixel.
    expect(fit.offsetX).toBeCloseTo(0, 1)
    expect(fit.offsetY).toBeCloseTo(0, 1)
    expect(fit.width).toBeCloseTo(390, 6)
    expect(fit.height).toBeCloseTo(844, 1)
  })

  it('centres a column in a wide window', () => {
    const fit = fitField(1400, 800)
    expect(fit.scale).toBeCloseTo(800 / CONFIG.field_height, 6)
    expect(fit.offsetY).toBeCloseTo(0, 6)
    expect(fit.offsetX).toBeCloseTo((1400 - fit.width) / 2, 6)
    expect(fit.offsetX).toBeGreaterThan(0)
  })

  it('centres the field from top to bottom in a window taller than it', () => {
    const fit = fitField(390, 1000)
    expect(fit.scale).toBeCloseTo(390 / CONFIG.field_width, 6)
    expect(fit.offsetX).toBeCloseTo(0, 6)
    expect(fit.offsetY).toBeCloseTo((1000 - fit.height) / 2, 6)
  })

  it('never scales beyond the window', () => {
    for (const [w, h] of [
      [320, 568],
      [412, 915],
      [1920, 1080],
      [600, 600],
    ]) {
      const fit = fitField(w, h)
      expect(fit.width).toBeLessThanOrEqual(w + 1e-6)
      expect(fit.height).toBeLessThanOrEqual(h + 1e-6)
    }
  })

  it('has no field in a window with no size', () => {
    expect(fitField(0, 0).scale).toBe(0)
    expect(fitField(300, 0).scale).toBe(0)
  })
})

describe('fitField with a strip kept free at the top', () => {
  it('puts the whole field below the strip', () => {
    for (const [w, h] of [
      [390, 844],
      [1280, 720],
      [768, 1024],
      [1920, 1080],
    ]) {
      const fit = fitField(w, h, 90)
      expect(fit.offsetY).toBeGreaterThanOrEqual(90 - 1e-9)
      expect(fit.offsetY + fit.height).toBeLessThanOrEqual(h + 1e-6)
      expect(fit.offsetX).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('fits the field into what is left, so a phone gives up a little width', () => {
    const fit = fitField(390, 844, 90)
    expect(fit.scale).toBeCloseTo((844 - 90) / CONFIG.field_height, 6)
    expect(fit.width).toBeLessThan(390)
    expect(fit.offsetX).toBeGreaterThan(0)
  })

  it('centres a short field in the space below the strip', () => {
    const fit = fitField(390, 1200, 90)
    expect(fit.offsetY).toBeCloseTo(90 + (1110 - fit.height) / 2, 6)
  })

  it('keeps taps in the strip outside the field', () => {
    const fit = fitField(390, 844, 90)
    expect(toField(fit, 195, 40).y).toBeLessThan(0)
  })

  it('has no field when the strip takes the whole window', () => {
    expect(fitField(390, 80, 90).scale).toBe(0)
  })
})

describe('toField and toScreen', () => {
  it('map the corners of the field', () => {
    const fit = fitField(1400, 800)
    const topLeft = toField(fit, fit.offsetX, fit.offsetY)
    expect(topLeft.x).toBeCloseTo(0, 6)
    expect(topLeft.y).toBeCloseTo(0, 6)
    const bottomRight = toField(fit, fit.offsetX + fit.width, fit.offsetY + fit.height)
    expect(bottomRight.x).toBeCloseTo(CONFIG.field_width, 3)
    expect(bottomRight.y).toBeCloseTo(CONFIG.field_height, 3)
  })

  it('are inverses of each other', () => {
    const fit = fitField(733, 1210)
    const there = toScreen(fit, 4321, 9876)
    const back = toField(fit, there.x, there.y)
    expect(back.x).toBeCloseTo(4321, 6)
    expect(back.y).toBeCloseTo(9876, 6)
  })

  it('put a tap beside the field outside it', () => {
    const fit = fitField(1400, 800)
    expect(toField(fit, 5, 100).x).toBeLessThan(0)
    expect(toField(fit, 1395, 100).x).toBeGreaterThan(CONFIG.field_width)
  })

  it('give a tap outside the field when there is no field', () => {
    const at = toField(fitField(0, 0), 10, 10)
    expect(at.x).toBeLessThan(0)
  })
})
