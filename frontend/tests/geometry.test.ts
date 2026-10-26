import { describe, expect, it } from 'vitest'
import { OVER } from '../src/screens/geometry'

describe('Game Over layout on a wide screen', () => {
  const g = OVER.landscape
  const centre = (left: number, width: number) => left + width / 2

  it('puts a lone PLAY AGAIN under the score, not in the right-hand slot', () => {
    const score = centre(g.score.left, g.score.width)
    const button = centre(g.playAlone.left, g.play.width)
    expect(Math.abs(button - score)).toBeLessThanOrEqual(1)
  })

  it('keeps a lone PLAY AGAIN inside the left column, clear of the leaderboard', () => {
    expect(g.playAlone.left).toBeGreaterThan(g.panel.left)
    expect(g.playAlone.left + g.play.width).toBeLessThan(g.board.left)
  })

  it('still lays SHARE and PLAY AGAIN side by side when both are shown', () => {
    expect(g.share.left + g.share.width).toBeLessThan(g.play.left)
    expect(g.play.left + g.play.width).toBeLessThan(g.board.left)
  })
})
