import type { PreloadTask } from './preload'
import { artUrls } from './ui/art'

// Fonts the screens use, as CSS font shorthands. Loading them before the first
// screen avoids a flash of fallback text in the title.
const FONTS = [
  '700 40px DynaPuff',
  '900 20px Nunito',
  '900 20px Roboto',
  '400 40px Coiny',
  '400 30px "Lilita One"',
  '600 20px Fredoka',
  '700 20px Fredoka',
]

function loadImage(url: string): PreloadTask {
  return () =>
    new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => {
        // decode() keeps the first paint from stalling on a large picture.
        void image.decode().then(resolve, resolve)
      }
      image.onerror = () => resolve()
      image.src = url
    })
}

function loadFont(spec: string): PreloadTask {
  return () => (document.fonts ? document.fonts.load(spec, 'Aa') : Promise.resolve())
}

/** Everything to have ready before the first screen. */
export function assetTasks(): PreloadTask[] {
  return [...artUrls.map(loadImage), ...FONTS.map(loadFont)]
}
