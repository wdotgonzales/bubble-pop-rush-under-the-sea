import { describe, expect, it } from 'vitest'
import { modalScale } from '../src/ui/modalScale'

describe('modalScale', () => {
  it('is life size on a phone and on a small desktop window', () => {
    expect(modalScale(390, 844)).toBe(1)
    expect(modalScale(320, 480)).toBe(1)
    expect(modalScale(1024, 576)).toBe(1)
  })

  it('grows with a big window, limited by whichever side is short', () => {
    expect(modalScale(1917, 1047)).toBeGreaterThan(1.5)
    expect(modalScale(1917, 700)).toBeLessThan(1.3)
  })

  it('never grows past 1.7, even on a huge window', () => {
    expect(modalScale(5000, 3000)).toBe(1.7)
  })

  it('stays at 1 when the window size is not known yet', () => {
    expect(modalScale(0, 0)).toBe(1)
  })
})
