import { useState } from 'react'
import { mapLoad } from '../state/load'
import { useGameData } from '../state/useGameData'
import { useMuted } from '../state/useMuted'
import { useServices } from '../state/useServices'
import { usePickedLayout } from '../ui/usePickedLayout'
import GameStub from './GameStub'
import StartScreen from './StartScreen'

/** The real game: the start screen now, gameplay and game over in the next PRs. */
export default function Game() {
  const { services, error } = useServices()
  const data = useGameData(services, error)
  const layout = usePickedLayout()
  const [muted, toggleMuted] = useMuted(services?.platform ?? null, data.boot === 'ready')
  const [screen, setScreen] = useState<'start' | 'game'>('start')

  if (screen === 'game') return <GameStub layout={layout} onBack={() => setScreen('start')} />

  return (
    <StartScreen
      layout={layout}
      bestScore={mapLoad(data.me, (me) => me.player.best_score)}
      muted={muted}
      onToggleMute={toggleMuted}
      onPlay={() => setScreen('game')}
      notice={data.boot === 'failed' ? 'Not connected to Facebook. Scores will not be saved.' : null}
    />
  )
}
