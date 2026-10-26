import type { CSSProperties } from 'react'
import { PRACTICE_LABEL, bestScoreLabel } from '../state/labels'
import type { Load } from '../state/types'
import { art } from '../ui/art'
import BubbleField from '../ui/BubbleField'
import type { Layout } from '../ui/layout'
import PearlButton from '../ui/PearlButton'
import Scene from '../ui/Scene'
import SettingsButton from '../ui/SettingsButton'
import { START } from './geometry'

interface Props {
  layout: Layout
  bestScore: Load<number>
  onPlay: () => void
  /** Opens the Dashboard, the top-10 page. It waits while a round is being fetched. */
  onDashboard?: () => void
  /** Offered under the notice when a real round cannot be started: a round that needs no server. */
  onPractice?: () => void
  /** A round is being fetched: the button waits so a second tap cannot start another. */
  starting?: boolean
  /** A short problem to show under the button, for example no connection. */
  notice?: string | null
}

export default function StartScreen({
  layout,
  bestScore,
  onPlay,
  onDashboard,
  onPractice,
  starting = false,
  notice = null,
}: Props) {
  const g = START[layout]
  const turtle: CSSProperties = { ...g.turtle }

  return (
    <Scene layout={layout} screen="start">
      <BubbleField layout={layout} />

      <SettingsButton
        size={g.settings.size}
        style={{ position: 'absolute', left: g.settings.left, top: g.settings.top }}
      />

      <h1 className="game-title" style={{ left: g.title.left, top: g.title.top, width: g.title.width }}>
        <span className="title-bubble">Bubble</span>
        <span className="title-poprush">Pop Rush</span>
        <span className="title-sub">Under the Sea</span>
      </h1>

      <img className="start-turtle" src={art.turtleStart} alt="" draggable={false} style={turtle} />

      <p className="best-score" style={{ left: g.best.left, top: g.best.top, width: g.best.width }}>
        {bestScoreLabel(bestScore)}
      </p>

      <div className="start-action" style={{ left: g.button.left, top: g.button.top }}>
        <PearlButton
          variant="cream"
          font="roboto"
          glow="strong"
          width={g.button.width}
          height={g.button.height}
          fontSize={g.button.fontSize}
          sparkles={g.sparkles}
          disabled={starting}
          onClick={onPlay}
        >
          {starting ? 'DIVING…' : 'DIVE IN!'}
        </PearlButton>
      </div>

      {onDashboard && (
        <div className="start-action" style={{ left: g.dashboard.left, top: g.dashboard.top }}>
          <PearlButton
            variant="aqua"
            width={g.dashboard.width}
            height={g.dashboard.height}
            fontSize={g.dashboard.fontSize}
            disabled={starting}
            onClick={onDashboard}
          >
            DASHBOARD
          </PearlButton>
        </div>
      )}

      {notice && (
        <p className="start-notice" role="status" style={g.notice}>
          {notice}
        </p>
      )}

      {onPractice && (
        <button type="button" className="start-practice" style={g.practice} disabled={starting} onClick={onPractice}>
          {PRACTICE_LABEL}
        </button>
      )}
    </Scene>
  )
}
