// Everything the game needs from Facebook, behind one interface. The game never
// touches window.FBInstant directly, so it runs in a normal browser (mock) and
// inside Facebook (real) through the same code.

export interface PlatformPlayer {
  /**
   * Null when the SDK does not provide it. Instant Games SDK 8.0 (Zero Permissions)
   * removed player names and photos, so the game must not depend on them.
   */
  name: string | null
  photoUrl: string | null
}

export interface SharePayload {
  /** PNG as a base64 data URL, as the Instant Games share call expects. */
  imageBase64: string
  text: string
}

export interface Platform {
  readonly kind: 'facebook' | 'mock'
  /** Prepare the SDK. Call first. */
  init(): Promise<void>
  /** 0..100, shown by Facebook's loading screen. */
  setLoadingProgress(percent: number): void
  /** Tell Facebook loading is done and the game is ready to be played. */
  start(): Promise<void>
  /** The signed player info string the backend verifies at POST /session. */
  getSignedPlayerInfo(): Promise<string>
  getPlayer(): PlatformPlayer
  getData(keys: string[]): Promise<Record<string, unknown>>
  setData(data: Record<string, unknown>): Promise<void>
  share(payload: SharePayload): Promise<void>
}
