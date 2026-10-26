import { useCallback, useRef, useState } from 'react'
import { isRoundCompatible, roundField } from '../api/guard'
import { chooseField } from '../game/field'
import { HUD_BAND_PX } from '../game/hud'
import type { RoundResult } from '../game/engine'
import { submitWithRetry } from '../game/submit'
import type { Services } from '../services'
import type { RoundStart, SubmitResult } from '../types'
import { OUTDATED_BUILD_NOTICE, startFailureLabel } from './labels'

/** What happened to the score of a finished round. */
export type SaveState =
  | { status: 'saving' }
  | { status: 'saved'; result: SubmitResult }
  | { status: 'failed' }

export type FlowScreen =
  | { name: 'start'; notice: string | null }
  | { name: 'play'; round: RoundStart }
  | { name: 'over'; roundId: string; score: number; save: SaveState }

/**
 * The path through the game: start screen, a round, game over, and round again.
 * A round's score is sent in the background, so the game over screen shows at once and
 * the player can start the next round before the answer arrives.
 */
export function useRoundFlow(services: Services | null, onSaved: () => void) {
  const [screen, setScreen] = useState<FlowScreen>({ name: 'start', notice: null })
  // True from the tap on PLAY until the server has answered, so the button can wait.
  const [starting, setStarting] = useState(false)
  const busy = useRef(false)

  /**
   * Ask the server for a round and move to play, or back to the start screen with the reason.
   * The round's play field is chosen to fill the window, so `view` is the size to fill.
   */
  const begin = useCallback(async (view: { width: number; height: number }) => {
    if (busy.current) return
    if (!services) {
      setScreen({ name: 'start', notice: "Couldn't start the game. Please reload." })
      return
    }
    busy.current = true
    setStarting(true)
    try {
      const round = await services.api.startRound(chooseField(view.width, view.height, HUD_BAND_PX))
      if (!isRoundCompatible(round)) setScreen({ name: 'start', notice: OUTDATED_BUILD_NOTICE })
      else if (!roundField(round)) setScreen({ name: 'start', notice: startFailureLabel(null) })
      else setScreen({ name: 'play', round })
    } catch (error) {
      setScreen({ name: 'start', notice: startFailureLabel(error) })
    } finally {
      busy.current = false
      setStarting(false)
    }
  }, [services])

  /** The round ended: show the result now and send the score. */
  const finish = useCallback(
    (round: RoundStart, result: RoundResult) => {
      if (!services) return
      const roundId = round.round_id
      setScreen({ name: 'over', roundId, score: result.score, save: { status: 'saving' } })

      // Only touch the screen if it is still this round's, since the player may already be elsewhere.
      const update = (save: SaveState) =>
        setScreen((current) =>
          current.name === 'over' && current.roundId === roundId
            ? { ...current, score: save.status === 'saved' ? save.result.score : current.score, save }
            : current,
        )

      void submitWithRetry(() => services.api.submitRound(roundId, result.taps, result.durationMs)).then(
        (saved) => {
          update({ status: 'saved', result: saved })
          onSaved()
        },
        () => update({ status: 'failed' }),
      )
    },
    [services, onSaved],
  )

  return { screen, starting, begin, finish }
}
