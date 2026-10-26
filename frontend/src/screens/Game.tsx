import { mapLoad } from '../state/load'
import { saveLabel } from '../state/labels'
import { useGameData } from '../state/useGameData'
import { useMuted } from '../state/useMuted'
import { useRoundFlow } from '../state/useRoundFlow'
import { useScoreSync } from '../state/useScoreSync'
import { useServices } from '../state/useServices'
import { usePickedLayout } from '../ui/usePickedLayout'
import { useViewport } from '../ui/useViewport'
import GameOverScreen from './GameOverScreen'
import PlayScreen from './PlayScreen'
import StartScreen from './StartScreen'

/** The real game: start screen, a round, and the game over screen with the leaderboard. */
export default function Game() {
  const { services, error } = useServices()
  const data = useGameData(services, error)
  const layout = usePickedLayout()
  const viewport = useViewport()
  const [muted, toggleMuted] = useMuted(services?.platform ?? null, data.boot === 'ready')
  const { screen, starting, begin, beginPractice, finish } = useRoundFlow(services, data.refresh)
  useScoreSync(services, data.boot === 'ready')

  // Until the pictures are ready, show nothing but the sea colour. Inside Facebook this is hidden
  // behind its own loading screen; in a browser it is a moment. It stops the pictures being swapped
  // for their in-memory copies while the screen is already showing.
  if (data.boot === 'booting') return <div className="boot-blank" />

  if (screen.name === 'play') {
    const { round, practice } = screen
    return (
      <PlayScreen
        key={round.round_id}
        round={round}
        muted={muted}
        onToggleMute={toggleMuted}
        onDone={(result) => finish(round, result, practice)}
      />
    )
  }

  if (screen.name === 'over') {
    const { save } = screen
    const knownBest = data.me.status === 'ready' ? data.me.data.player.best_score : 0
    return (
      <GameOverScreen
        layout={layout}
        score={screen.score}
        bestScore={save.status === 'saved' ? save.result.best_score : knownBest}
        isNewBest={save.status === 'saved' && save.result.is_new_best}
        bestLabel={save.status === 'saved' ? undefined : saveLabel(save.status)}
        board={data.board}
        starting={starting}
        onPlayAgain={() => void begin(viewport)}
        onRetryBoard={data.refresh}
      />
    )
  }

  // A practice round needs neither the server nor Facebook, so it is on offer whenever starting
  // a real round did not work, and from the start if the game could not connect to Facebook.
  const canPractice = screen.canPractice || data.boot === 'failed'

  return (
    <StartScreen
      layout={layout}
      bestScore={mapLoad(data.me, (me) => me.player.best_score)}
      muted={muted}
      onToggleMute={toggleMuted}
      onPlay={() => void begin(viewport)}
      onPractice={canPractice ? () => beginPractice(viewport) : undefined}
      starting={starting}
      notice={screen.notice ?? (data.boot === 'failed' ? 'Not connected to Facebook. Scores will not be saved.' : null)}
    />
  )
}
