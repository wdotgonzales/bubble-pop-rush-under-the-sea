import { describe, expect, it } from 'vitest'
import {
  buttonTones,
  endTones,
  gameOverTones,
  goTones,
  newBestTones,
  popTones,
  tickTones,
  type Tone,
} from '../src/audio/sfx'

const everySound: Record<string, Tone[]> = {
  pop: popTones(0, false),
  popStreak: popTones(30, true),
  tick3: tickTones(3),
  tick1: tickTones(1),
  go: goTones(),
  button: buttonTones(),
  end: endTones(),
  gameOver: gameOverTones(),
  newBest: newBestTones(),
}

describe('the sounds', () => {
  it('are short, quiet enough to stack, and in a range that can be heard', () => {
    for (const [name, tones] of Object.entries(everySound)) {
      expect(tones.length).toBeGreaterThan(0)
      for (const tone of tones) {
        expect(tone.from).toBeGreaterThan(150)
        expect(tone.to).toBeGreaterThan(150)
        expect(Math.max(tone.from, tone.to)).toBeLessThan(4000)
        expect(tone.seconds).toBeGreaterThan(0)
        expect((tone.delay ?? 0) + tone.seconds).toBeLessThan(1.2)
        expect(tone.volume).toBeGreaterThan(0)
        expect(tone.volume).toBeLessThanOrEqual(0.2)
      }
      expect(name.length).toBeGreaterThan(0)
    }
  })
})

describe('popTones', () => {
  it('climbs with the streak', () => {
    const low = popTones(0, false)[0]
    const high = popTones(10, false)[0]
    expect(high && low && high.from > low.from).toBe(true)
  })

  it('stops climbing after a streak of twelve, and treats a negative streak as none', () => {
    expect(popTones(12, false)[0]?.from).toBe(popTones(99, false)[0]?.from)
    expect(popTones(-5, false)[0]?.from).toBe(popTones(0, false)[0]?.from)
  })

  it('rings twice for a pearl and once otherwise', () => {
    expect(popTones(3, true)).toHaveLength(2)
    expect(popTones(3, false)).toHaveLength(1)
  })
})

describe('tickTones', () => {
  it('makes the last beep higher than the others', () => {
    const last = tickTones(1)[0]
    const first = tickTones(3)[0]
    expect(last && first && last.from > first.from).toBe(true)
    expect(tickTones(2)[0]?.from).toBe(tickTones(3)[0]?.from)
  })
})

describe('the tunes', () => {
  it('has the three notes of the end of a round rising and spaced out', () => {
    const tones = endTones()
    expect(tones).toHaveLength(3)
    expect(tones.map((t) => t.from)).toEqual([...tones.map((t) => t.from)].sort((a, b) => a - b))
    expect(tones.map((t) => t.delay)).toEqual([0, 0.11, 0.22])
  })

  it('steps the game over tune down and lets the last note ring longest', () => {
    const tones = gameOverTones()
    const pitches = tones.map((t) => t.from)
    expect(pitches).toEqual([...pitches].sort((a, b) => b - a))
    const last = tones[tones.length - 1]
    expect(last && last.seconds > (tones[0]?.seconds ?? 1)).toBe(true)
  })

  it('climbs for a new best', () => {
    const climb = newBestTones().slice(0, 4).map((t) => t.from)
    expect(climb).toEqual([...climb].sort((a, b) => a - b))
  })
})
