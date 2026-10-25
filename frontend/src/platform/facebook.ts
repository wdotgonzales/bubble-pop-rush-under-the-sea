import type { Platform } from './platform'

// The parts of the Instant Games SDK we use. The SDK itself is loaded by the
// <script> tag in index.html (https://connect.facebook.net/en_US/fbinstant.8.0.js).
export interface FBInstantSdk {
  initializeAsync(): Promise<void>
  setLoadingProgress(percent: number): void
  startGameAsync(): Promise<void>
  shareAsync(payload: {
    intent: 'SHARE'
    image: string
    text: string
    data?: Record<string, unknown>
  }): Promise<void>
  player: {
    // Removed in SDK 8.0 (Zero Permissions); present in older SDKs.
    getName?(): string | null
    getPhoto?(): string | null
    getSignedPlayerInfoAsync(): Promise<{ getSignature(): string }>
    getDataAsync(keys: string[]): Promise<Record<string, unknown>>
    setDataAsync(data: Record<string, unknown>): Promise<void>
  }
}

declare global {
  interface Window {
    FBInstant?: FBInstantSdk
  }
}

/** Wrap the Instant Games SDK. Pass the SDK in tests; by default the page's own is used. */
export function createFacebookPlatform(injected?: FBInstantSdk): Platform {
  const sdk = injected ?? (typeof window === 'undefined' ? undefined : window.FBInstant)
  if (!sdk) {
    throw new Error(
      'The Facebook Instant Games SDK is not loaded. Open the game from Facebook, or add ?mock=1 to the URL.',
    )
  }
  return {
    kind: 'facebook',
    init: () => sdk.initializeAsync(),
    setLoadingProgress: (percent) => sdk.setLoadingProgress(percent),
    start: () => sdk.startGameAsync(),
    async getSignedPlayerInfo() {
      const info = await sdk.player.getSignedPlayerInfoAsync()
      return info.getSignature()
    },
    getPlayer: () => ({
      name: sdk.player.getName?.() || null,
      photoUrl: sdk.player.getPhoto?.() || null,
    }),
    getData: (keys) => sdk.player.getDataAsync(keys),
    setData: (data) => sdk.player.setDataAsync(data),
    share: (payload) =>
      sdk.shareAsync({ intent: 'SHARE', image: payload.imageBase64, text: payload.text, data: {} }),
  }
}
