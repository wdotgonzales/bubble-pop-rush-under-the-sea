import { useCallback, useEffect, useRef, useState } from 'react'
import { NetworkError } from '../api/client'
import { isRoundCompatible, roundField } from '../api/guard'
import { isOffline } from '../api/online'
import { chooseField } from '../game/field'
import { HUD_BAND_PX } from '../game/hud'
import type { RoundResult } from '../game/engine'
import { expiryOf } from '../game/pending'
import { practiceRound } from '../game/practice'
import { takeUsable, type Prefetched } from '../game/prefetch'
import type { Services } from '../services'
import type { RoundStart } from '../types'
import { homeScreen, settleScreen, type FlowScreen, type View } from './flow'
import { OUTDATED_BUILD_NOTICE, startFailureLabel } from './labels'

export type { FlowScreen, SaveState } from './flow'

/**
 * The path through the game: start screen, a round, game over, and round again.
 *
 * - A round's score is handed to the score queue, so the game over screen shows at once and
 *   the player can start the next round before the answer arrives (or while offline).
 * - The next round is fetched while the game over screen is showing.
 * - If a round cannot be started, the player can play a practice round that needs no server.
 */
export function useRoundFlow(services: Services | null, onSaved: () => void) {
  const [screen, setScreen] = useState<FlowScreen>({ name: 'start', notice: null, canPractice: false })
  // True from the tap on PLAY until the server has answered, so the button can wait.
  const [starting, setStarting] = useState(false)
  const busy = useRef(false)
  const prefetched = useRef<Prefetched | null>(null)
  const prefetching = useRef(false)
  const lastView = useRef<View | null>(null)
  const onSavedRef = useRef(onSaved)

  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  // Whatever happens to a score, at any time, even after the player has moved on.
  useEffect(() => {
    if (!services) return
    return services.scores.subscribe((roundId, outcome) => {
      setScreen((current) => settleScreen(current, roundId, outcome))
      if (outcome.status === 'saved') onSavedRef.current()
    })
  }, [services])

  /** Ask for the next round now, so PLAY AGAIN has one ready. Failure here is silent. */
  const prefetch = useCallback(() => {
    const view = lastView.current
    if (!services || !view || prefetching.current || isOffline()) return
    const wanted = chooseField(view.width, view.height, HUD_BAND_PX)
    if (takeUsable(prefetched.current, wanted, Date.now())) return
    prefetching.current = true
    services.api
      .startRound(wanted)
      .then((round) => {
        if (isRoundCompatible(round) && roundField(round)) prefetched.current = { round, fetchedAt: Date.now() }
      })
      .catch(() => undefined)
      .finally(() => {
        prefetching.current = false
      })
  }, [services])

  /**
   * Move to play with a round from the server (the one fetched ahead if it still fits, else a
   * new one), or back to the start screen with the reason. The round's play field is chosen to
   * fill the window, so `view` is the size to fill.
   */
  const begin = useCallback(
    async (view: View) => {
      if (busy.current) return
      if (!services) {
        setScreen({ name: 'start', notice: "Couldn't start the game. Please reload.", canPractice: true })
        return
      }
      busy.current = true
      setStarting(true)
      lastView.current = view
      try {
        const wanted = chooseField(view.width, view.height, HUD_BAND_PX)
        let round = takeUsable(prefetched.current, wanted, Date.now())
        prefetched.current = null
        if (!round) {
          if (isOffline()) throw new NetworkError('The browser is offline.')
          round = await services.api.startRound(wanted)
        }
        if (!isRoundCompatible(round)) {
          setScreen({ name: 'start', notice: OUTDATED_BUILD_NOTICE, canPractice: false })
        } else if (!roundField(round)) {
          setScreen({ name: 'start', notice: startFailureLabel(null), canPractice: true })
        } else {
          setScreen({ name: 'play', round, practice: false })
        }
      } catch (error) {
        setScreen({ name: 'start', notice: startFailureLabel(error), canPractice: true })
      } finally {
        busy.current = false
        setStarting(false)
      }
    },
    [services],
  )

  /** Back to the start screen. Not while a round is being fetched: that is about to change the screen. */
  const goHome = useCallback(() => {
    if (busy.current) return
    setScreen(homeScreen())
  }, [])

  /** Play a round that needs no server. Its score is shown but never sent. */
  const beginPractice = useCallback((view: View) => {
    lastView.current = view
    setScreen({ name: 'play', round: practiceRound(view), practice: true })
  }, [])

  /** The round ended: show the result now and hand the score to the queue. */
  const finish = useCallback(
    (round: RoundStart, result: RoundResult, practice: boolean) => {
      const roundId = round.round_id
      if (practice) {
        setScreen({ name: 'over', roundId, score: result.score, save: { status: 'practice' } })
        return
      }
      if (!services) return
      setScreen({ name: 'over', roundId, score: result.score, save: { status: 'saving' } })
      void services.scores.submit({
        roundId,
        taps: result.taps,
        durationMs: result.durationMs,
        expiresAt: expiryOf(round.expires_at, Date.now()),
      })
      prefetch()
    },
    [services, prefetch],
  )

  return { screen, starting, begin, beginPractice, goHome, finish }
}
