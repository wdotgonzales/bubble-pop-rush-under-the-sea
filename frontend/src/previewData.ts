import type { Leaderboard } from './types'

/** The leaderboard from the Figma mock-up, for design review without a backend. */
export const SAMPLE_BOARD: Leaderboard = {
  entries: [
    ['SeaExplorer', 55],
    ['PearlDiver', 52],
    ['LilvieGrap', 49],
    ['SeaHver', 46],
    ['SeaExplorer', 45],
    ['PearlHown', 33],
    ['PearlDiver', 33],
    ['SeaExplorer', 30],
    ['SeaLiliver', 29],
    ['SeaLiliver', 28],
  ].map(([name, score], i) => ({
    rank: i + 1,
    display_name: String(name),
    avatar_url: null,
    score: Number(score),
    is_me: false,
  })),
  me: { rank: 37, best_score: 22 },
}
