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
  /** One page, best first: up to `page_size` rows. Empty when nobody has scored yet. */
  entries: LeaderboardEntry[]
  /** Which page this is (1-based) and how big pages are. */
  page: number
  page_size: number
  /** Players with a score over all pages, and how many pages that makes (0 when nobody has scored). */
  total: number
  total_pages: number
  /** The requesting player's own standing. Null when the request was not signed in: the board is public. */
  me: { rank: number | null; best_score: number } | null
}
