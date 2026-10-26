import type { Platform } from './platform'

/**
 * Start the platform in the order Facebook expects: initialise, report loading
 * progress while the assets load, then tell it the game is ready.
 */
export async function bootPlatform(
  platform: Platform,
  preload: (onProgress: (fraction: number) => void) => Promise<void>,
): Promise<void> {
  await platform.init()
  platform.setLoadingProgress(5)
  await preload((fraction) => platform.setLoadingProgress(5 + Math.round(fraction * 90)))
  platform.setLoadingProgress(100)
  await platform.start()
}
