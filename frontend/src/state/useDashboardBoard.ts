import { useCallback, useEffect, useState } from 'react'
import type { Services } from '../services'
import type { Leaderboard } from '../types'
import { fetchDashboardBoard } from './dashboard'
import type { Load } from './types'

/**
 * The board for the Dashboard. It is fetched each time the Dashboard opens, so it is current rather
 * than what the game loaded at the start, and again when the player taps Try again. An answer that
 * arrives after the player has left is thrown away.
 */
export function useDashboardBoard(services: Services | null) {
  const [board, setBoard] = useState<Load<Leaderboard>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!services) return
    let current = true
    void fetchDashboardBoard(services.api, services.session.player !== null).then((value) => {
      if (current) setBoard(value)
    })
    return () => {
      current = false
    }
  }, [services, attempt])

  const retry = useCallback(() => {
    setBoard({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  // Without services there is nothing to ask, so say so rather than load for ever.
  const unavailable: Load<Leaderboard> = { status: 'error', message: 'The game is not connected.' }
  return { board: services ? board : unavailable, retry }
}
