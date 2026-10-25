import type { Platform } from '../platform'
import type { Player, SessionResponse } from '../types'

/** Sign in again this long before the token actually expires. */
const REFRESH_MARGIN_MS = 60_000

export interface SessionDeps {
  platform: Pick<Platform, 'getSignedPlayerInfo' | 'getPlayer'>
  createSession: (
    signedPlayerInfo: string,
    displayName: string | null,
    avatarUrl: string | null,
  ) => Promise<SessionResponse>
  /** Injected for tests. */
  now?: () => number
}

/**
 * Holds the one-hour session token and renews it. Facebook's signed player info
 * is only accepted for 10 minutes, so a renewal always asks Facebook for a fresh one.
 */
export class SessionManager {
  private token: string | null = null
  private expiresAt = 0
  private pending: Promise<SessionResponse> | null = null
  private current: Player | null = null
  private readonly deps: SessionDeps

  constructor(deps: SessionDeps) {
    this.deps = deps
  }

  /** The signed-in player as of the last sign-in, or null before the first. */
  get player(): Player | null {
    return this.current
  }

  /** A valid token, signing in first if there is none or it is about to expire. */
  async getToken(): Promise<string> {
    const now = (this.deps.now ?? Date.now)()
    if (this.token && now < this.expiresAt - REFRESH_MARGIN_MS) return this.token
    const session = await this.signIn()
    return session.token
  }

  /** Forget the token, e.g. after the server rejected it. */
  invalidate(): void {
    this.token = null
    this.expiresAt = 0
  }

  /** Sign in now. Callers that overlap share one request. */
  signIn(): Promise<SessionResponse> {
    if (!this.pending) {
      this.pending = this.doSignIn().finally(() => {
        this.pending = null
      })
    }
    return this.pending
  }

  private async doSignIn(): Promise<SessionResponse> {
    const info = this.deps.platform.getPlayer()
    const signature = await this.deps.platform.getSignedPlayerInfo()
    const session = await this.deps.createSession(signature, info.name, info.photoUrl)
    this.token = session.token
    this.expiresAt = (this.deps.now ?? Date.now)() + session.expires_in * 1000
    this.current = session.player
    return session
  }
}
