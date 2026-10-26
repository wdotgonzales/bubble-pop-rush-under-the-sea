import type { Leaderboard } from '../types'

export interface BoardRow {
  key: string
  rank: number
  name: string
  score: number
  /** The row belongs to the player looking at the board. */
  isMe: boolean
  /** Rank 1 gets the highlight from the design. */
  isLeader: boolean
}

export interface BoardView {
  rows: BoardRow[]
  /**
   * The player's own place when they are not among the rows shown, so someone at
   * rank 37 still sees where they stand. Null when they are in the list, or have
   * no score yet.
   */
  pinned: BoardRow | null
}

const FALLBACK_NAME = 'Diver'

/** The parts of the API answer the board is drawn from. */
export type BoardSource = Pick<Leaderboard, 'entries' | 'me'>

/** Turn the API answer into what the leaderboard draws. */
export function toBoardView(board: BoardSource): BoardView {
  const rows: BoardRow[] = board.entries.map((entry) => ({
    key: String(entry.rank),
    rank: entry.rank,
    name: entry.display_name.trim() || FALLBACK_NAME,
    score: entry.score,
    isMe: entry.is_me,
    isLeader: entry.rank === 1,
  }))

  const listed = rows.some((row) => row.isMe)
  const pinned: BoardRow | null =
    !listed && board.me !== null && board.me.rank !== null
      ? {
          key: 'me',
          rank: board.me.rank,
          name: 'You',
          score: board.me.best_score,
          isMe: true,
          isLeader: false,
        }
      : null

  return { rows, pinned }
}
