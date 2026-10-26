import { createApiClient } from './api/client'
import { createEndpoints, type Endpoints } from './api/endpoints'
import { SessionManager } from './api/session'
import { API_BASE_URL } from './config'
import { ScoreQueue } from './game/pending'
import { createPendingStore } from './game/pendingStore'
import { choosePlatform, type Platform } from './platform'

export interface Services {
  platform: Platform
  api: Endpoints
  session: SessionManager
  /** Finished rounds on their way to the server, kept until the server has answered. */
  scores: ScoreQueue
}

/** Wire the platform, the API client and the session together. */
export function createServices(
  search: string = window.location.search,
  isDev: boolean = import.meta.env.DEV,
): Services {
  const platform = choosePlatform(search, isDev)
  const client = createApiClient({
    baseUrl: API_BASE_URL,
    // The session manager is created below; these only run later, on a request.
    getToken: () => session.getToken(),
    invalidateToken: () => session.invalidate(),
  })
  const api = createEndpoints(client)
  const session = new SessionManager({ platform, createSession: api.createSession })
  const scores = new ScoreQueue({
    send: (score) => api.submitRound(score.roundId, score.taps, score.durationMs),
    store: createPendingStore(platform),
  })
  return { platform, api, session, scores }
}
