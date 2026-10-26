import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError, createApiClient } from '../src/api/client'
import { createEndpoints, leaderboardPath } from '../src/api/endpoints'
import { DASHBOARD_PAGE_SIZE, fetchDashboardBoard } from '../src/state/dashboard'
import type { Leaderboard } from '../src/types'
import { fakeFetch, json } from './helpers'

const BASE = 'https://api.example.test/api'

const BOARD: Leaderboard = {
  entries: [{ rank: 1, display_name: 'SnappyWhale482', avatar_url: null, score: 55, is_me: false }],
  page: 1,
  page_size: 10,
  total: 1,
  total_pages: 1,
  me: null,
}

describe('leaderboardPath', () => {
  it('asks for the default page with no query', () => {
    expect(leaderboardPath()).toBe('/leaderboard')
    expect(leaderboardPath({})).toBe('/leaderboard')
  })

  it('adds only the parts that were given', () => {
    expect(leaderboardPath({ page: 2 })).toBe('/leaderboard?page=2')
    expect(leaderboardPath({ pageSize: 10 })).toBe('/leaderboard?page_size=10')
    expect(leaderboardPath({ page: 3, pageSize: 25 })).toBe('/leaderboard?page=3&page_size=25')
  })

  it('does not put the sign-in choice in the address', () => {
    expect(leaderboardPath({ page: 1, auth: false })).toBe('/leaderboard?page=1')
  })
})

describe('getLeaderboard', () => {
  function endpoints(getToken: () => Promise<string | null>) {
    const { fetchFn, calls } = fakeFetch(() => json(BOARD))
    const api = createEndpoints(createApiClient({ baseUrl: BASE, getToken, fetchFn }))
    return { api, calls }
  }

  it('is signed in unless it is told otherwise', async () => {
    const { api, calls } = endpoints(async () => 'tok-1')
    await api.getLeaderboard()
    expect(calls[0].url).toBe(`${BASE}/leaderboard`)
    expect(calls[0].headers.Authorization).toBe('Bearer tok-1')
  })

  it('goes without the token, and without asking for one, when auth is off', async () => {
    let asked = 0
    const { api, calls } = endpoints(async () => {
      asked += 1
      return 'tok-1'
    })
    await api.getLeaderboard({ page: 1, pageSize: 10, auth: false })
    expect(calls[0].url).toBe(`${BASE}/leaderboard?page=1&page_size=10`)
    expect(calls[0].headers.Authorization).toBe(undefined)
    // Asking for a token would wait for a Facebook sign-in that may never come.
    expect(asked).toBe(0)
  })
})

describe('fetchDashboardBoard', () => {
  function stub(result: Leaderboard | Error) {
    const asked: unknown[] = []
    const api = {
      getLeaderboard: async (query?: unknown) => {
        asked.push(query)
        if (result instanceof Error) throw result
        return result
      },
    }
    return { api, asked }
  }

  it('asks for the first ten', async () => {
    const { api, asked } = stub(BOARD)
    await fetchDashboardBoard(api, true)
    expect(DASHBOARD_PAGE_SIZE).toBe(10)
    expect(asked[0]).toMatchObject({ page: 1, pageSize: 10 })
  })

  it('is signed in for a player who is signed in', async () => {
    const { api, asked } = stub(BOARD)
    await fetchDashboardBoard(api, true)
    expect(asked[0]).toMatchObject({ auth: true })
  })

  it('does not wait for a sign-in when the player is not signed in', async () => {
    const { api, asked } = stub(BOARD)
    await fetchDashboardBoard(api, false)
    expect(asked[0]).toMatchObject({ auth: false })
  })

  it('hands back the board once it arrives', async () => {
    const { api } = stub(BOARD)
    expect(await fetchDashboardBoard(api, false)).toEqual({ status: 'ready', data: BOARD })
  })

  it('turns a failure into a value the screen can show, not a thrown error', async () => {
    const offline = await fetchDashboardBoard(stub(new NetworkError('offline')).api, true)
    expect(offline.status).toBe('error')
    const refused = await fetchDashboardBoard(stub(new ApiError(503, null, 'down')).api, true)
    expect(refused).toMatchObject({ status: 'error' })
  })
})
