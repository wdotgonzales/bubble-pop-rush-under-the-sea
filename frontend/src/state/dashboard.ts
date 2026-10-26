import { describeError } from '../diagnostics'
import type { Leaderboard } from '../types'
import type { Endpoints } from '../api/endpoints'
import type { Load } from './types'

/** The Dashboard shows the top ten. */
export const DASHBOARD_PAGE_SIZE = 10

/**
 * Fetch what the Dashboard shows: the first page of the board, as a value the screen can draw
 * whichever way it went.
 *
 * The board is public, so a player who is not signed in (opened outside Facebook, or signing in
 * failed) asks without the session token. Asking with it would first wait for a sign-in that may
 * never answer, and the Dashboard would sit on its loading state instead of showing the board.
 */
export async function fetchDashboardBoard(
  api: Pick<Endpoints, 'getLeaderboard'>,
  signedIn: boolean,
): Promise<Load<Leaderboard>> {
  try {
    const data = await api.getLeaderboard({ page: 1, pageSize: DASHBOARD_PAGE_SIZE, auth: signedIn })
    return { status: 'ready', data }
  } catch (error) {
    return { status: 'error', message: describeError(error) }
  }
}
