import { personalBestLabel } from '../state/labels'
import type { Load } from '../state/types'
import type { Leaderboard as LeaderboardData } from '../types'
import { art } from '../ui/art'
import GameOverTitle from '../ui/GameOverTitle'
import Leaderboard from '../ui/Leaderboard'
import type { Layout } from '../ui/layout'
import PearlButton from '../ui/PearlButton'
import Scene from '../ui/Scene'
import ScorePill from '../ui/ScorePill'
import { OVER } from './geometry'

interface Props {
  layout: Layout
  score: number
  bestScore: number
  isNewBest: boolean
  board: Load<LeaderboardData>
  onPlayAgain: () => void
  /** Share is only offered when there is something to do with the tap. */
  onShare?: () => void
  onRetryBoard: () => void
}

function ShareIcon() {
  return <img className="share-icon" src={art.splashIcon} alt="" width={32} height={35} draggable={false} />
}

export default function GameOverScreen({
  layout,
  score,
  bestScore,
  isNewBest,
  board,
  onPlayAgain,
  onShare,
  onRetryBoard,
}: Props) {
  const best = personalBestLabel(score, bestScore, isNewBest)

  if (layout === 'portrait') {
    const g = OVER.portrait
    return (
      <Scene layout="portrait" screen="over">
        <img className="shell" src={art.shellPortrait} alt="" draggable={false} style={g.shell} />
        <section className="glass-panel over-panel" style={g.panel}>
          <span className="glass-rim" aria-hidden />
          <GameOverTitle />

          <div className="over-results">
            <div className="over-turtle" style={g.turtle}>
              <img src={art.turtleOver} alt="" draggable={false} />
            </div>
            <ScorePill score={score} {...g.score} />
            <p className="personal-best" style={{ fontSize: g.bestFontSize }}>
              {best}
            </p>
          </div>

          <div className="over-actions">
            {onShare && (
              <PearlButton
                variant="aqua"
                width={g.button.width}
                height={g.button.height}
                fontSize={g.button.fontSize}
                icon={<ShareIcon />}
                onClick={onShare}
              >
                SHARE
              </PearlButton>
            )}
            <PearlButton
              variant="cream"
              width={g.button.width}
              height={g.button.height}
              fontSize={g.button.fontSize}
              sparkles={g.playSparkles}
              onClick={onPlayAgain}
            >
              PLAY AGAIN
            </PearlButton>
          </div>

          <Leaderboard state={board} variant="portrait" onRetry={onRetryBoard} />
        </section>
      </Scene>
    )
  }

  const g = OVER.landscape
  return (
    <Scene layout="landscape" screen="over">
      <section className="glass-panel" style={g.panel} aria-hidden>
        <span className="glass-rim" />
      </section>

      <div className="abs" style={{ left: g.title.left, top: g.title.top }}>
        <GameOverTitle scale={g.titleScale} />
      </div>

      <div className="over-turtle abs" style={g.turtle}>
        <img src={art.turtleOver} alt="" draggable={false} />
      </div>
      <div className="abs" style={{ left: g.score.left, top: g.score.top }}>
        <ScorePill score={score} width={g.score.width} height={g.score.height} fontSize={g.score.fontSize} />
      </div>
      <p
        className="personal-best abs"
        style={{ left: g.best.left, top: g.best.top, width: g.best.width, fontSize: g.best.fontSize }}
      >
        {best}
      </p>

      {onShare && (
        <div className="abs" style={{ left: g.share.left, top: g.share.top }}>
          <PearlButton
            variant="aqua"
            width={g.share.width}
            height={g.share.height}
            fontSize={g.share.fontSize}
            icon={<ShareIcon />}
            onClick={onShare}
          >
            SHARE
          </PearlButton>
        </div>
      )}
      <div className="abs" style={{ left: g.play.left, top: g.play.top }}>
        <PearlButton
          variant="cream"
          width={g.play.width}
          height={g.play.height}
          fontSize={g.play.fontSize}
          sparkles={g.playSparkles}
          onClick={onPlayAgain}
        >
          PLAY AGAIN
        </PearlButton>
      </div>

      <div className="abs" style={g.board}>
        <Leaderboard state={board} variant="landscape" onRetry={onRetryBoard} />
      </div>
    </Scene>
  )
}
