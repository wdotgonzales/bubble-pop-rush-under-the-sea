import type {
  Leaderboard,
  MeResponse,
  RoundStart,
  SessionResponse,
  SubmitResult,
  Tap,
} from '../types'
import type { ApiClient } from './client'

/** One typed function per backend route. */
export function createEndpoints(client: ApiClient) {
  return {
    health: () => client.request<{ status: string }>('GET', '/health', { auth: false }),

    createSession: (signedPlayerInfo: string, displayName: string | null, avatarUrl: string | null) =>
      client.request<SessionResponse>('POST', '/session', {
        auth: false,
        body: { signed_player_info: signedPlayerInfo, display_name: displayName, avatar_url: avatarUrl },
      }),

    getMe: () => client.request<MeResponse>('GET', '/me'),

    startRound: () => client.request<RoundStart>('POST', '/rounds/start'),

    submitRound: (roundId: string, taps: readonly Tap[], clientDurationMs: number) =>
      client.request<SubmitResult>('POST', `/rounds/${encodeURIComponent(roundId)}/submit`, {
        body: { taps, client_duration_ms: clientDurationMs },
      }),

    getLeaderboard: () => client.request<Leaderboard>('GET', '/leaderboard'),
  }
}

export type Endpoints = ReturnType<typeof createEndpoints>
