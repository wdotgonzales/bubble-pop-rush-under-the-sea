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
import { OVER, overActions, playSparkles } from './geometry'

interface Props {
  layout: Layout
  score: number
  bestScore: number
  isNewBest: boolean
  /** Replaces the personal best line, for example while the score is still being saved. */
  bestLabel?: string
  board: Load<LeaderboardData>
  onPlayAgain: () => void
  /** Back to the start screen. Both buttons wait while the next round is being fetched. */
  onGoHome?: () => void
  /** The next round is being fetched: PLAY AGAIN waits. */
  starting?: boolean
  /** Share is only offered when there is something to do with the tap. */
  onShare?: () => void
  /** A share is under way (the card is being drawn or the dialog is open): SHARE waits. */
  sharing?: boolean
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
  bestLabel,
  board,
  onPlayAgain,
  onGoHome,
  starting = false,
  onShare,
  sharing = false,
  onRetryBoard,
}: Props) {
  const best = bestLabel ?? personalBestLabel(score, bestScore, isNewBest)

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
                disabled={sharing}
                onClick={onShare}
              >
                SHARE
              </PearlButton>
            )}
            {/* GO HOME and PLAY AGAIN share a row; alone, PLAY AGAIN is the wide button. */}
            <div className="over-buttons">
              {onGoHome && (
                <PearlButton
                  variant="aqua"
                  width={g.pair.home}
                  height={g.pair.height}
                  fontSize={g.pair.fontSize}
                  disabled={starting}
                  onClick={onGoHome}
                >
                  GO HOME
                </PearlButton>
              )}
              <PearlButton
                variant="cream"
                width={onGoHome ? g.pair.play : g.button.width}
                height={onGoHome ? g.pair.height : g.button.height}
                fontSize={onGoHome ? g.pair.fontSize : g.button.fontSize}
                sparkles={onGoHome ? g.pairSparkles : g.playSparkles}
                disabled={starting}
                onClick={onPlayAgain}
              >
                {starting ? 'DIVING…' : 'PLAY AGAIN'}
              </PearlButton>
            </div>
          </div>

          <Leaderboard state={board} variant="portrait" onRetry={onRetryBoard} />
        </section>
      </Scene>
    )
  }

  const g = OVER.landscape
  const slots = overActions(Boolean(onShare), Boolean(onGoHome))
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

      {onShare && slots.share && (
        <div className="abs" style={{ left: slots.share.left, top: slots.share.top }}>
          <PearlButton
            variant="aqua"
            width={slots.share.width}
            height={slots.share.height}
            fontSize={slots.share.fontSize}
            icon={<ShareIcon />}
            disabled={sharing}
            onClick={onShare}
          >
            SHARE
          </PearlButton>
        </div>
      )}
      {onGoHome && slots.home && (
        <div className="abs" style={{ left: slots.home.left, top: slots.home.top }}>
          <PearlButton
            variant="aqua"
            width={slots.home.width}
            height={slots.home.height}
            fontSize={slots.home.fontSize}
            disabled={starting}
            onClick={onGoHome}
          >
            GO HOME
          </PearlButton>
        </div>
      )}
      <div className="abs" style={{ left: slots.play.left, top: slots.play.top }}>
        <PearlButton
          variant="cream"
          width={slots.play.width}
          height={slots.play.height}
          fontSize={slots.play.fontSize}
          sparkles={playSparkles(slots.play.width)}
          disabled={starting}
          onClick={onPlayAgain}
        >
          {starting ? 'DIVING…' : 'PLAY AGAIN'}
        </PearlButton>
      </div>

      <div className="abs" style={g.board}>
        <Leaderboard state={board} variant="landscape" onRetry={onRetryBoard} />
      </div>
    </Scene>
  )
}
