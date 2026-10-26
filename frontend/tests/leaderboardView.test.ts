import { describe, expect, it } from 'vitest'
import { toBoardView, type BoardSource } from '../src/state/leaderboardView'
import type { LeaderboardEntry } from '../src/types'

function entry(rank: number, name: string, score: number, isMe = false): LeaderboardEntry {
  return { rank, display_name: name, avatar_url: null, score, is_me: isMe }
}

describe('toBoardView', () => {
  it('keeps the order and marks only rank 1 as the leader', () => {
    const board: BoardSource = {
      entries: [entry(1, 'A', 55), entry(2, 'B', 52), entry(3, 'C', 49)],
      me: { rank: null, best_score: 0 },
    }
    const view = toBoardView(board)
    expect(view.rows.map((r) => r.name)).toEqual(['A', 'B', 'C'])
    expect(view.rows.map((r) => r.isLeader)).toEqual([true, false, false])
  })

  it('marks the player own row and pins nothing when they are listed', () => {
    const board: BoardSource = {
      entries: [entry(1, 'A', 55), entry(2, 'Me', 52, true)],
      me: { rank: 2, best_score: 52 },
    }
    const view = toBoardView(board)
    expect(view.rows[1].isMe).toBe(true)
    expect(view.pinned).toBeNull()
  })

  it('pins the player place when they are outside the top ten', () => {
    const board: BoardSource = {
      entries: [entry(1, 'A', 55)],
      me: { rank: 37, best_score: 12 },
    }
    const view = toBoardView(board)
    expect(view.pinned).toMatchObject({ rank: 37, score: 12, name: 'You', isMe: true })
  })

  it('pins nothing for a player with no score yet', () => {
    const board: BoardSource = { entries: [entry(1, 'A', 55)], me: { rank: null, best_score: 0 } }
    expect(toBoardView(board).pinned).toBeNull()
  })

  it('gives an empty board no rows and no pin', () => {
    const view = toBoardView({ entries: [], me: { rank: null, best_score: 0 } })
    expect(view).toEqual({ rows: [], pinned: null })
  })

  it('never shows a blank name', () => {
    const board: BoardSource = {
      entries: [entry(1, '   ', 5), entry(2, '', 4)],
      me: { rank: null, best_score: 0 },
    }
    expect(toBoardView(board).rows.map((r) => r.name)).toEqual(['Diver', 'Diver'])
  })

  it('gives every row a distinct key', () => {
    const board: BoardSource = {
      entries: [entry(1, 'Same', 9), entry(2, 'Same', 9)],
      me: { rank: 3, best_score: 1 },
    }
    const view = toBoardView(board)
    const keys = [...view.rows, view.pinned].map((r) => r?.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('shows only the rows for someone who is not signed in, with no place of their own to pin', () => {
    const board: BoardSource = { entries: [entry(1, 'A', 55), entry(2, 'B', 52)], me: null }
    const view = toBoardView(board)
    expect(view.rows).toHaveLength(2)
    expect(view.pinned).toBeNull()
  })
})
