import { describe, expect, it } from 'vitest'
import { CONFIG, DEFAULT_FIELD, isValidField } from '@shared/spawn.js'
import { MAX_RADIUS_PX, MIN_RADIUS_PX, chooseField } from '../src/game/field'
import { fitField } from '../src/game/fit'
import { HUD_BAND_PX } from '../src/game/hud'

const standard = CONFIG.kinds[0].radius

/** The on-screen radius of a standard bubble when this field is fitted to this window. */
function radiusOnScreen(width: number, height: number) {
  const field = chooseField(width, height, HUD_BAND_PX)
  const fit = fitField(width, height, HUD_BAND_PX, field.width, field.height)
  return { field, fit, radius: standard * fit.scale }
}

const WINDOWS: ReadonlyArray<readonly [string, number, number]> = [
  ['small phone', 320, 568],
  ['phone', 390, 844],
  ['tall phone', 412, 915],
  ['phone, landscape', 844, 390],
  ['tablet upright', 768, 1024],
  ['tablet landscape', 1024, 768],
  ['laptop', 1280, 720],
  ['full HD', 1920, 1080],
  ['ultrawide', 3440, 1440],
  ['portrait monitor', 1080, 1920],
  ['tiny', 200, 300],
]

describe('chooseField', () => {
  for (const [name, width, height] of WINDOWS) {
    it(`asks for a field the server accepts: ${name}`, () => {
      const field = chooseField(width, height, HUD_BAND_PX)
      expect(isValidField(field.width, field.height)).toBe(true)
    })

    it(`fills the window below the HUD: ${name}`, () => {
      const { fit } = radiusOnScreen(width, height)
      // Whatever the shape, the field is the whole space below the HUD, to within a few pixels.
      // (A window past the limits, such as an ultrawide, may keep margins at the sides.)
      expect(fit.offsetY).toBeGreaterThanOrEqual(HUD_BAND_PX - 1e-6)
      expect(fit.offsetY + fit.height).toBeLessThanOrEqual(height + 1e-6)
      if (name !== 'ultrawide' && name !== 'tiny') {
        expect(fit.width).toBeGreaterThan(width - 4)
        expect(fit.height).toBeGreaterThan(height - HUD_BAND_PX - 4)
      }
    })
  }

  it('keeps a phone close to the original portrait field', () => {
    const field = chooseField(390, 844, HUD_BAND_PX)
    expect(field.width).toBe(10000)
    expect(field.height).toBeGreaterThan(18000)
    expect(field.height).toBeLessThan(DEFAULT_FIELD.height)
  })

  it('gives a desktop a wide field', () => {
    const field = chooseField(1280, 720, HUD_BAND_PX)
    expect(field.width).toBeGreaterThan(field.height)
    expect(field.width).toBeGreaterThan(20000)
  })

  it('fills a tablet upright with a field that is neither phone-tall nor wide', () => {
    const field = chooseField(768, 1024, HUD_BAND_PX)
    expect(field.height).toBeGreaterThan(field.width)
    expect(field.height / field.width).toBeLessThan(1.5)
  })

  it('draws a standard bubble at a comfortable size on every screen', () => {
    for (const [name, width, height] of WINDOWS) {
      if (name === 'tiny') continue
      const { radius } = radiusOnScreen(width, height)
      expect(radius).toBeGreaterThanOrEqual(MIN_RADIUS_PX - 2)
      expect(radius).toBeLessThanOrEqual(95)
    }
    // The ordinary cases sit in the intended range.
    for (const [width, height] of [
      [390, 844],
      [768, 1024],
      [1280, 720],
    ]) {
      const { radius } = radiusOnScreen(width, height)
      expect(radius).toBeGreaterThanOrEqual(MIN_RADIUS_PX)
      expect(radius).toBeLessThanOrEqual(MAX_RADIUS_PX + 0.5)
    }
  })

  it('keeps fingers happy: the smallest bubble you can still tap is at least 30 px across', () => {
    for (const [, width, height] of WINDOWS) {
      const { fit } = radiusOnScreen(width, height)
      expect(CONFIG.hit_min_radius * fit.scale * 2).toBeGreaterThan(30)
    }
  })

  it('falls back to the default field when there is no usable window', () => {
    expect(chooseField(0, 0)).toEqual(DEFAULT_FIELD)
    expect(chooseField(390, HUD_BAND_PX, HUD_BAND_PX)).toEqual(DEFAULT_FIELD)
    expect(chooseField(Number.NaN, 800)).toEqual(DEFAULT_FIELD)
  })

  it('never asks for a sliver, however stretched the window', () => {
    const field = chooseField(5000, 400, HUD_BAND_PX)
    expect(isValidField(field.width, field.height)).toBe(true)
    expect(field.width).toBeLessThanOrEqual(CONFIG.field_max_ratio * field.height)
  })
})
