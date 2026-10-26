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

export const art = {
  bgPortrait,
  bgLandscapeStart,
  bgLandscapeOver,
  shellPortrait,
  settingsButton,
  splashIcon,
  turtleOver,
  turtleStart,
} as const

/** Everything worth having decoded before the first screen is shown. */
export const artUrls: readonly string[] = Object.values(art)
