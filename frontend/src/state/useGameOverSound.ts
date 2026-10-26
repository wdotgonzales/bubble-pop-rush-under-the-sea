import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../audio/engine'
import type { FlowScreen } from './flow'
import { SETTLE_WAIT_MS, nextJingle, type Jingle } from './gameOverJingle'

/** The sounds of the game over screen, once per round. */
export function useGameOverSound(screen: FlowScreen, engine: AudioEngine): void {
  const round = screen.name === 'over' ? screen.roundId : null
  const settled = screen.name === 'over' && screen.save.status !== 'saving'
  const newBest = screen.name === 'over' && screen.save.status === 'saved' && screen.save.result.is_new_best
  const played = useRef<{ round: string | null; jingle: Jingle }>({ round: null, jingle: 'none' })

  useEffect(() => {
    if (round === null) return
    if (played.current.round !== round) played.current = { round, jingle: 'none' }
    const play = (jingle: 'over' | 'best') => {
      played.current.jingle = jingle
      if (jingle === 'best') engine.newBest()
      else engine.gameOver()
    }
    const now = nextJingle(played.current.jingle, settled, newBest, false)
    if (now) {
      play(now)
      return
    }
    if (played.current.jingle !== 'none') return
    const timer = window.setTimeout(() => {
      const late = nextJingle(played.current.jingle, settled, newBest, true)
      if (late) play(late)
    }, SETTLE_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [round, settled, newBest, engine])
}
