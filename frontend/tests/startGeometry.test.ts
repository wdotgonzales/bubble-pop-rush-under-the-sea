import { describe, expect, it } from 'vitest'
import { DASHBOARD, OVER, START } from '../src/screens/geometry'
import { DESIGN_SIZE } from '../src/ui/layout'

const layouts = ['portrait', 'landscape'] as const

/** Roughly the height of the problem line (two short lines would not fit, one does) and the link. */
const NOTICE_LINE = 19
const PRACTICE_LINE = 27

describe('the start screen buttons', () => {
  for (const layout of layouts) {
    describe(layout, () => {
      const g = START[layout]
      const stage = DESIGN_SIZE[layout].start

      it('puts DASHBOARD under DIVE IN without touching it', () => {
        expect(g.dashboard.top).toBeGreaterThan(g.button.top + g.button.height)
      })

      it('keeps DIVE IN the bigger button', () => {
        expect(g.button.width).toBeGreaterThan(g.dashboard.width)
        expect(g.button.height).toBeGreaterThan(g.dashboard.height)
      })

      it('centres both buttons on the same line', () => {
        const dive = g.button.left + g.button.width / 2
        const dash = g.dashboard.left + g.dashboard.width / 2
        expect(Math.abs(dive - dash)).toBeLessThanOrEqual(1)
      })

      it('keeps the buttons clear of the best score above them', () => {
        expect(g.button.top).toBeGreaterThan(g.best.top + 25)
      })

      it('keeps the problem line and the practice link below DASHBOARD, inside the screen', () => {
        expect(g.notice.top).toBeGreaterThan(g.dashboard.top + g.dashboard.height)
        expect(g.practice.top).toBeGreaterThanOrEqual(g.notice.top + NOTICE_LINE)
        expect(g.practice.top + PRACTICE_LINE).toBeLessThanOrEqual(stage.height)
      })

      it('keeps every label readable', () => {
        expect(g.button.fontSize).toBeGreaterThanOrEqual(24)
        expect(g.dashboard.fontSize).toBeGreaterThanOrEqual(20)
      })

      it('keeps the sparkles on the corners of the smaller DIVE IN', () => {
        for (const s of g.sparkles) expect(s.y).toBeLessThanOrEqual(g.button.height)
      })
    })
  }
})

describe('the Dashboard', () => {
  it('uses the game over panel on a phone, so it matches the other screen', () => {
    expect(DASHBOARD.portrait.panel).toEqual(OVER.portrait.panel)
  })

  it('puts the wide board inside the panel, to the right of the left column', () => {
    const { board, panel, title, home, turtle, count } = DASHBOARD.landscape
    expect(board.left).toBeGreaterThan(panel.left)
    expect(board.left + board.width).toBeLessThan(panel.left + panel.width)
    expect(board.top).toBeGreaterThan(panel.top)
    expect(board.top + board.height).toBeLessThan(panel.top + panel.height)
    for (const box of [title, home, turtle, count]) expect(box.left + box.width).toBeLessThanOrEqual(board.left)
  })

  it('stacks the left column top to bottom without overlap', () => {
    const { title, turtle, count, home } = DASHBOARD.landscape
    expect(turtle.top).toBeGreaterThan(title.top + title.fontSize)
    expect(count.top).toBeGreaterThanOrEqual(turtle.top + turtle.height)
    expect(home.top).toBeGreaterThan(count.top + 24)
    expect(home.top + home.height).toBeLessThan(DASHBOARD.landscape.panel.top + DASHBOARD.landscape.panel.height)
  })

  it('has room in the wide board for ten rows and the places around them', () => {
    // heading, its padding, ten rows, the gap, the player's own row (all at the dense size).
    const needed = 9 + 30 + 6 + 10 * 35 + 4 + 35
    expect(DASHBOARD.landscape.board.height).toBeGreaterThanOrEqual(needed)
  })

  it('is as wide as the board needs for a long name', () => {
    // rank badge, row padding and gaps, score; the rest is for the name.
    const rest = DASHBOARD.landscape.board.width - 2 * 10 - 12 - 34 - 22 - 40
    expect(rest).toBeGreaterThanOrEqual(200)
  })

  it('has a stage for each layout', () => {
    expect(DESIGN_SIZE.portrait.dashboard).toEqual(DESIGN_SIZE.portrait.over)
    expect(DESIGN_SIZE.landscape.dashboard).toEqual(DESIGN_SIZE.landscape.over)
  })
})
