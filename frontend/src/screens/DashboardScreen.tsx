import type { CSSProperties } from 'react'
import { diversLabel } from '../state/labels'
import type { Load } from '../state/types'
import type { Leaderboard as LeaderboardData } from '../types'
import { art } from '../ui/art'
import Leaderboard from '../ui/Leaderboard'
import type { Layout } from '../ui/layout'
import PearlButton from '../ui/PearlButton'
import Scene from '../ui/Scene'
import { DASHBOARD } from './geometry'

interface Props {
  layout: Layout
  board: Load<LeaderboardData>
  onRetry: () => void
  /** Back to the start screen. */
  onHome: () => void
}

const HEADING = 'Top 10 Divers'

/** How many players have a score, once the board has arrived. Empty (but still taking its room) until then. */
function countOf(board: Load<LeaderboardData>): string {
  return board.status === 'ready' ? diversLabel(board.data.total) : ''
}

/**
 * The Dashboard: the top ten on a page of their own, reached from the start screen, with HOME
 * back to it. It is the game over screen's board, with medals for the first three places.
 */
export default function DashboardScreen({ layout, board, onRetry, onHome }: Props) {
  const count = countOf(board)

  if (layout === 'portrait') {
    const g = DASHBOARD.portrait
    return (
      <Scene layout="portrait" screen="dashboard">
        <section className="glass-panel dash-panel" style={g.panel}>
          <span className="glass-rim" aria-hidden />

          <header className="dash-header">
            <img className="dash-turtle" src={art.turtleStart} alt="" draggable={false} width={g.turtle.width} height={g.turtle.height} />
            <h1 className="dash-title" style={{ fontSize: g.titleFontSize }}>
              Dashboard
            </h1>
          </header>

          <Leaderboard state={board} variant="portrait" heading={HEADING} medals animate onRetry={onRetry} />

          <p className="dash-count">{count}</p>
          <PearlButton variant="aqua" width={g.home.width} height={g.home.height} fontSize={g.home.fontSize} onClick={onHome}>
            HOME
          </PearlButton>
        </section>
      </Scene>
    )
  }

  const g = DASHBOARD.landscape
  const turtle: CSSProperties = { ...g.turtle }
  return (
    <Scene layout="landscape" screen="dashboard">
      <section className="glass-panel" style={g.panel} aria-hidden>
        <span className="glass-rim" />
      </section>

      <h1 className="dash-title abs" style={{ left: g.title.left, top: g.title.top, width: g.title.width, fontSize: g.title.fontSize }}>
        Dashboard
      </h1>

      <img className="dash-turtle abs" src={art.turtleStart} alt="" draggable={false} style={turtle} />

      <p className="dash-count abs" style={{ left: g.count.left, top: g.count.top, width: g.count.width }}>
        {count}
      </p>

      <div className="abs" style={{ left: g.home.left, top: g.home.top }}>
        <PearlButton variant="aqua" width={g.home.width} height={g.home.height} fontSize={g.home.fontSize} onClick={onHome}>
          HOME
        </PearlButton>
      </div>

      <div className="abs" style={g.board}>
        <Leaderboard state={board} variant="landscape" heading={HEADING} medals animate dense onRetry={onRetry} />
      </div>
    </Scene>
  )
}
