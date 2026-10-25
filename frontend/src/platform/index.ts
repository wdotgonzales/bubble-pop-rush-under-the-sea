import { createFacebookPlatform } from './facebook'
import { createMockPlatform } from './mock'
import type { Platform } from './platform'

export type { Platform, PlatformPlayer, SharePayload } from './platform'

/**
 * Use the mock during local development, or whenever the URL asks for it
 * (?mock=1 or ?mock_signature=...). Otherwise the real Facebook SDK.
 */
export function choosePlatform(search: string, isDev: boolean): Platform {
  const params = new URLSearchParams(search)
  const signature = params.get('mock_signature')
  if (isDev || params.has('mock') || signature !== null) {
    return createMockPlatform({ signature, name: params.get('mock_name') ?? '' })
  }
  return createFacebookPlatform()
}
