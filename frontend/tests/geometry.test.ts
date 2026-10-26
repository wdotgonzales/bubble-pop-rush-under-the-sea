import { describe, expect, it } from 'vitest'
import { OVER, overActions, playSparkles, type ActionSlot } from '../src/screens/geometry'

const g = OVER.landscape
const centreOf = (left: number, width: number) => left + width / 2

/** Every button the layout shows, left to right. */
function row(share: boolean, home: boolean): ActionSlot[] {
  const a = overActions(share, home)
  return [a.share, a.home, a.play].filter((slot): slot is ActionSlot => slot !== undefined)
}

const combinations: [string, boolean, boolean][] = [
  ['PLAY AGAIN alone', false, false],
  ['GO HOME and PLAY AGAIN', false, true],
  ['SHARE and PLAY AGAIN', true, false],
  ['SHARE, GO HOME and PLAY AGAIN', true, true],
]

describe('Game Over buttons on a wide screen', () => {
  for (const [name, share, home] of combinations) {
    describe(name, () => {
      const slots = row(share, home)

      it('shows one button for each thing offered, PLAY AGAIN always', () => {
        expect(slots).toHaveLength(1 + Number(share) + Number(home))
        expect(overActions(share, home).play).toBeTruthy()
      })

      it('keeps every button inside the left column, clear of the leaderboard', () => {
        for (const slot of slots) {
          expect(slot.left).toBeGreaterThan(g.panel.left)
          expect(slot.left + slot.width).toBeLessThan(g.board.left)
        }
      })

      it('puts them in one row, in order, without touching', () => {
        const tops = new Set(slots.map((s) => s.top))
        expect(tops.size).toBe(1)
        for (let i = 1; i < slots.length; i++) {
          const before = slots[i - 1]
          const next = slots[i]
          expect(before && next && before.left + before.width < next.left).toBe(true)
        }
      })

      it('centres the row under the score', () => {
        const first = slots[0]
        const last = slots[slots.length - 1]
        if (!first || !last) throw new Error('no buttons')
        const rowCentre = (first.left + last.left + last.width) / 2
        expect(Math.abs(rowCentre - centreOf(g.score.left, g.score.width))).toBeLessThanOrEqual(12)
      })

      it('keeps the label readable', () => {
        for (const slot of slots) expect(slot.fontSize).toBeGreaterThanOrEqual(26)
      })
    })
  }

  it('centres a lone PLAY AGAIN exactly under the score', () => {
    const play = overActions(false, false).play
    expect(Math.abs(centreOf(play.left, play.width) - centreOf(g.score.left, g.score.width))).toBeLessThanOrEqual(1)
  })

  it('keeps the two-button layout of the design when one button sits beside PLAY AGAIN', () => {
    const a = overActions(false, true)
    expect(a.home?.left).toBe(150)
    expect(a.play.left).toBe(404)
  })

  it('moves the sparkles with the width of PLAY AGAIN', () => {
    const wide = playSparkles(229)[0]
    const narrow = playSparkles(184)[0]
    expect(wide && narrow && wide.x - narrow.x).toBe(45)
  })
})

describe('Game Over buttons on a phone', () => {
  const p = OVER.portrait
  const inner = p.panel.width - 32

  it('fits GO HOME and PLAY AGAIN side by side inside the panel', () => {
    expect(p.pair.home + p.pair.gap + p.pair.play).toBeLessThanOrEqual(inner)
  })

  it('gives the longer word the wider button', () => {
    expect(p.pair.play).toBeGreaterThan(p.pair.home)
  })

  it('keeps the pair as tall as the single button, so the leaderboard loses no room', () => {
    expect(p.pair.height).toBe(p.button.height)
  })

  it('keeps the labels at a size that fits the narrower button', () => {
    expect(p.pair.fontSize).toBeGreaterThanOrEqual(22)
    expect(p.pair.fontSize).toBeLessThanOrEqual(p.button.fontSize)
  })
})
