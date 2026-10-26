// Every image the screens use, in one place. The vector files come from Figma;
// see frontend/src/assets/art/README.md for how they were exported.
import bgLandscapeOver from '../assets/art/bg-landscape-over.jpg'
import bgLandscapeStart from '../assets/art/bg-landscape-start.jpg'
import bgPortrait from '../assets/art/bg-portrait.jpg'
import settingsButton from '../assets/art/settings-button.svg'
import shellPortrait from '../assets/art/shell-portrait.webp'
import splashIcon from '../assets/art/splash-icon.svg'
import turtleOver from '../assets/art/turtle-over.svg'
import turtleStart from '../assets/art/turtle-start.svg'
import { createArtCache, type ArtCache } from './artCache'

/** The original address of every picture, as the build produced it. */
const sources = {
  bgPortrait,
  bgLandscapeStart,
  bgLandscapeOver,
  shellPortrait,
  settingsButton,
  splashIcon,
  turtleOver,
  turtleStart,
} as const

/** Pictures kept in memory once they have been downloaded (see artCache.ts). */
export const artCache: ArtCache = createArtCache({
  fetchFn: (url) => fetch(url),
  makeUrl: (blob) => URL.createObjectURL(blob),
})

/**
 * The address to draw each picture from. It is read when a screen is drawn, so once a picture
 * has been kept in memory the screens use that copy and never ask the network for it again.
 */
export const art: { readonly [K in keyof typeof sources]: string } = Object.defineProperties(
  {} as { [K in keyof typeof sources]: string },
  Object.fromEntries(
    Object.entries(sources).map(([name, url]) => [
      name,
      { enumerable: true, get: () => artCache.resolve(url) },
    ]),
  ),
)

/** Everything worth having downloaded and decoded before the first screen is shown. */
export const artUrls: readonly string[] = Object.values(sources)
