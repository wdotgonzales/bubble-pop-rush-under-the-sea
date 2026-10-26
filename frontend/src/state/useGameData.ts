import { useCallback, useEffect, useReducer, useRef } from 'react'
import { assetTasks } from '../assets'
import { bootPlatform } from '../boot'
import { describeError } from '../diagnostics'
import { runPreload } from '../preload'
import type { Services } from '../services'
import type { Leaderboard, MeResponse } from '../types'
import type { Load } from './types'

export type BootStatus = 'booting' | 'ready' | 'failed'

export interface GameData {
  boot: BootStatus
  bootError: string | null
  me: Load<MeResponse>
  board: Load<Leaderboard>
}

type Action =
  | { type: 'booted' }
  | { type: 'boot-failed'; message: string }
  | { type: 'me'; value: Load<MeResponse> }
  | { type: 'board'; value: Load<Leaderboard> }

function reduce(state: GameData, action: Action): GameData {
  switch (action.type) {
    case 'booted':
      return { ...state, boot: 'ready' }
    case 'boot-failed':
      return { ...state, boot: 'failed', bootError: action.message }
    case 'me':
      return { ...state, me: action.value }
    case 'board':
      return { ...state, board: action.value }
  }
}

function initial(services: Services | null): GameData {
  return {
    boot: services ? 'booting' : 'failed',
    bootError: null,
    me: { status: 'loading' },
    board: { status: 'loading' },
  }
}

async function toLoad<T>(request: Promise<T>): Promise<Load<T>> {
  try {
    return { status: 'ready', data: await request }
  } catch (error) {
    return { status: 'error', message: describeError(error) }
  }
}

/**
 * Starts the platform, then loads the player's profile and the leaderboard.
 * The screens show a loading state for each part, or what went wrong, so a slow or
 * unreachable backend never leaves a blank screen.
 */
export function useGameData(services: Services | null, setupError: string | null) {
  const [state, dispatch] = useReducer(reduce, services, initial)
  const started = useRef(false)

  useEffect(() => {
    if (!services || started.current) return
    started.current = true
    void (async () => {
      try {
        await bootPlatform(services.platform, (onProgress) => runPreload(assetTasks(), onProgress))
        dispatch({ type: 'booted' })
      } catch (error) {
        dispatch({ type: 'boot-failed', message: describeError(error) })
      }
      // Load the data either way: each screen shows its own failure.
      const [me, board] = await Promise.all([toLoad(services.api.getMe()), toLoad(services.api.getLeaderboard())])
      dispatch({ type: 'me', value: me })
      dispatch({ type: 'board', value: board })
    })()
  }, [services])

  /** Fetch the profile and the board again, for example after a round. */
  const refresh = useCallback(() => {
    if (!services) return
    dispatch({ type: 'me', value: { status: 'loading' } })
    dispatch({ type: 'board', value: { status: 'loading' } })
    void Promise.all([toLoad(services.api.getMe()), toLoad(services.api.getLeaderboard())]).then(([me, board]) => {
      dispatch({ type: 'me', value: me })
      dispatch({ type: 'board', value: board })
    })
  }, [services])

  return { ...state, bootError: state.bootError ?? setupError, refresh }
}
