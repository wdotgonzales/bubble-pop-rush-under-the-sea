import DebugScreen from './screens/DebugScreen'
import Game from './screens/Game'
import Preview from './screens/Preview'

/**
 * Chooses what to show:
 *   ?debug=1     the connection check, for verifying a staged Facebook build
 *   ?preview=…   the screens with sample data, for design review
 *   otherwise    the game
 */
export default function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('debug')) return <DebugScreen />
  if (params.has('preview')) return <Preview params={params} />
  return <Game />
}
