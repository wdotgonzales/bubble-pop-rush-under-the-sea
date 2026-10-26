import { describe, expect, it } from 'vitest'
import { Effects, easeOut, progress, streakMessage, type PopLook } from '../src/game/effects'

const look = (over: Partial<PopLook> = {}): PopLook => ({
  tint: [255, 143, 216],
  x: 5000,
  y: 9000,
  radius: 1500,
  points: 1,
  streak: 1,
  ...over,
})

describe('streakMessage', () => {
  it('cheers at every fifth pop in a row', () => {
    expect(streakMessage(5)).toBe('Nice!')
    expect(streakMessage(10)).toBe('Great!')
    expect(streakMessage(15)).toBe('Amazing!')
    expect(streakMessage(20)).toBe('20 in a row!')
    expect(streakMessage(35)).toBe('35 in a row!')
  })

  it('is quiet in between', () => {
    for (const n of [0, 1, 2, 4, 6, 9, 11, 19, 21]) expect(streakMessage(n)).toBeNull()
  })
})

describe('Effects', () => {
  it('adds a burst, a ring and "+1" text for a pop', () => {
    const fx = new Effects(() => 0.5)
    fx.pop(1000, look())
    expect(fx.particles).toHaveLength(10)
    expect(fx.rings).toHaveLength(1)
    expect(fx.floaters).toHaveLength(1)
    expect(fx.floaters[0].text).toBe('+1')
    expect(fx.floaters[0].big).toBe(false)
  })

  it('makes a pearl bigger, with more sparks and "+3"', () => {
    const fx = new Effects(() => 0.5)
    fx.pop(0, look({ points: 3 }))
    expect(fx.particles).toHaveLength(16)
    expect(fx.floaters[0].text).toBe('+3')
    expect(fx.floaters[0].big).toBe(true)
  })

  it('shows a streak message only at a milestone', () => {
    const fx = new Effects(() => 0.5)
    fx.pop(0, look({ streak: 4 }))
    expect(fx.toast).toBeNull()
    fx.pop(10, look({ streak: 5 }))
    expect(fx.toast?.text).toBe('Nice!')
  })

  it('draws a ripple for a miss and keeps only the latest few', () => {
    const fx = new Effects()
    for (let i = 0; i < 30; i++) fx.miss(i, 100, 100)
    expect(fx.ripples.length).toBeLessThanOrEqual(12)
  })

  it('caps the number of sparks', () => {
    const fx = new Effects(() => 0.5)
    for (let i = 0; i < 100; i++) fx.pop(0, look({ points: 3 }))
    expect(fx.particles.length).toBeLessThanOrEqual(160)
  })

  it('forgets effects once they have finished', () => {
    const fx = new Effects(() => 0.5)
    fx.pop(0, look({ streak: 5 }))
    fx.miss(0, 1, 1)
    expect(fx.active).toBe(true)
    fx.prune(300)
    expect(fx.active).toBe(true)
    fx.prune(5000)
    expect(fx.active).toBe(false)
    expect(fx.toast).toBeNull()
  })
})

describe('progress and easeOut', () => {
  it('clamp to 0..1', () => {
    expect(progress(50, 100, 200)).toBe(0)
    expect(progress(200, 100, 200)).toBeCloseTo(0.5, 6)
    expect(progress(900, 100, 200)).toBe(1)
  })

  it('easeOut starts fast and ends at 1', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
  })
})
