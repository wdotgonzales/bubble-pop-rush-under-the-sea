// Shapes of the backend API (backend/app/schemas/*). Keep in step with them.

export type { Tap } from '@shared/spawn.js'

export interface Player {
  id: string
  display_name: string
  avatar_url: string | null
  best_score: number
}

export interface SessionResponse {
  token: string
  /** Seconds the token is valid for. */
  expires_in: number
  player: Player
}

export interface MeResponse {
  player: Player
  /** null until the player has a verified score above zero. */
  rank: number | null
}

export interface RoundStart {
  round_id: string
  seed: number
  config_version: number
  /** The play field this round uses, in game units. The schedule must be built with it. */
  field_width: number
  field_height: number
  duration_ms: number
  started_at: string
  expires_at: string
}

export interface SubmitResult {
  round_id: string
  status: 'accepted'
  score: number
  best_score: number
  is_new_best: boolean
  rank: number | null
}

export interface LeaderboardEntry {
  rank: number
  display_name: string
  avatar_url: string | null
  score: number
  /** True on the requesting player's own row. */
  is_me: boolean
}

export interface Leaderboard {
  /** Up to 10, best first. Empty when nobody has scored yet. */
  entries: LeaderboardEntry[]
  me: { rank: number | null; best_score: number }
}
