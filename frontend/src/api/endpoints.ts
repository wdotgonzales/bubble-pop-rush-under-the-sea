import type { FieldSize } from '@shared/spawn.js'
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

    /**
     * Start a round. `field` is the shape of play field the window can show in full; the
     * server checks it and answers with the one the round will really use. Without it the
     * server uses its default portrait field.
     */
    startRound: (field?: FieldSize) =>
      client.request<RoundStart>(
        'POST',
        '/rounds/start',
        field ? { body: { field_width: field.width, field_height: field.height } } : undefined,
      ),

    submitRound: (roundId: string, taps: readonly Tap[], clientDurationMs: number) =>
      client.request<SubmitResult>('POST', `/rounds/${encodeURIComponent(roundId)}/submit`, {
        body: { taps, client_duration_ms: clientDurationMs },
      }),

    getLeaderboard: () => client.request<Leaderboard>('GET', '/leaderboard'),
  }
}

export type Endpoints = ReturnType<typeof createEndpoints>
