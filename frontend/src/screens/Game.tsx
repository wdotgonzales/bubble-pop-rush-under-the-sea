import SoundProvider from '../audio/SoundProvider'
import { useSound } from '../audio/useSound'
import { mapLoad } from '../state/load'
import { saveLabel } from '../state/labels'
import { useDashboardBoard } from '../state/useDashboardBoard'
import { useGameData, type GameData } from '../state/useGameData'
import { useGameOverSound } from '../state/useGameOverSound'
import { useArtReady } from '../state/useArtReady'
import { canShare } from '../state/share'
import { useRoundFlow } from '../state/useRoundFlow'
import { useScoreSync } from '../state/useScoreSync'
import { useServices } from '../state/useServices'
import { useShare } from '../state/useShare'
import type { Platform } from '../platform'
import type { Services } from '../services'
import type { Layout } from '../ui/layout'
import { usePickedLayout } from '../ui/usePickedLayout'
import { useViewport } from '../ui/useViewport'
import DashboardScreen from './DashboardScreen'
import GameOverScreen from './GameOverScreen'
import PlayScreen from './PlayScreen'
import StartScreen from './StartScreen'

/** The real game: start screen, a round, and the game over screen with the leaderboard. */
export default function Game() {
  const { services, error } = useServices()
  const data = useGameData(services, error)
  const layout = usePickedLayout()
  const viewport = useViewport()
  const flow = useRoundFlow(services, data.refresh)
  useScoreSync(services, data.boot === 'ready')
  const artReady = useArtReady()

  // Until the pictures are ready, show nothing but the sea colour: a moment, and at most a few
  // seconds. It stops the pictures being swapped for their in-memory copies while the screen is
  // already showing. It waits for the pictures only, never for Facebook (see useArtReady).
  if (!artReady) return <div className="boot-blank" />

  return (
    <SoundProvider platform={services?.platform ?? null} ready={data.boot === 'ready'}>
      <Screens
        layout={layout}
        viewport={viewport}
        data={data}
        flow={flow}
        services={services}
        platform={services?.platform ?? null}
      />
    </SoundProvider>
  )
}

interface ScreensProps {
  layout: Layout
  viewport: ReturnType<typeof useViewport>
  data: GameData & { refresh: () => void }
  flow: ReturnType<typeof useRoundFlow>
  services: Services | null
  platform: Platform | null
}

/** The Dashboard fetches its own board each time it opens, so it lives apart from the game's data. */
function Dashboard({ layout, services, onHome }: { layout: Layout; services: Services | null; onHome: () => void }) {
  const { board, retry } = useDashboardBoard(services)
  return <DashboardScreen layout={layout} board={board} onRetry={retry} onHome={onHome} />
}

function Screens({ layout, viewport, data, flow, services, platform }: ScreensProps) {
  const { screen, starting, begin, beginPractice, goHome, openDashboard, finish } = flow
  const { engine } = useSound()
  const { share, sharing } = useShare(platform)

  useGameOverSound(screen, engine)

  if (screen.name === 'play') {
    const { round, practice } = screen
    return (
      <PlayScreen
        key={round.round_id}
        round={round}
        onDone={(result) => finish(round, result, practice)}
        onGoHome={goHome}
      />
    )
  }

  if (screen.name === 'dashboard') {
    return <Dashboard layout={layout} services={services} onHome={goHome} />
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
        onGoHome={goHome}
        onShare={canShare(platform?.kind ?? null, save, screen.score) ? () => share(screen.score) : undefined}
        sharing={sharing}
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
      onPlay={() => void begin(viewport)}
      onDashboard={openDashboard}
      onPractice={canPractice ? () => beginPractice(viewport) : undefined}
      starting={starting}
      notice={screen.notice ?? (data.boot === 'failed' ? 'Not connected to Facebook. Scores will not be saved.' : null)}
    />
  )
}
