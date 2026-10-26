import { CONFIG, generateSchedule } from '@shared/spawn.js'
import { ApiError, NetworkError } from './api/client'
import { isRoundCompatible, roundField } from './api/guard'
import type { Services } from './services'

/** The parts of the services the check walks through. */
export type DiagnosticServices = Pick<Services, 'platform' | 'api' | 'session'>

export type StepStatus = 'pending' | 'running' | 'ok' | 'error'

export interface Step {
  id: string
  label: string
  status: StepStatus
  detail: string
}

const LABELS: ReadonlyArray<readonly [string, string]> = [
  ['platform', 'Start the platform'],
  ['backend', 'Reach the backend'],
  ['signin', 'Sign in'],
  ['profile', 'Load the profile'],
  ['round', 'Start a round'],
]

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.code ? ` (${error.code})` : ''
    return `HTTP ${error.status}${code}: ${error.message}`
  }
  if (error instanceof NetworkError) {
    return `Network error: ${error.message} If the browser blocked it, this page's origin is probably missing from the server's CORS_ORIGINS.`
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Walk the whole path a real round takes, stopping at the first failure. It is the
 * first thing to open in a new environment (a Facebook staging build, say): it
 * shows exactly which hop is broken.
 */
export async function runDiagnostics(
  services: DiagnosticServices,
  report: (steps: Step[]) => void,
): Promise<boolean> {
  const steps: Step[] = LABELS.map(([id, label]) => ({ id, label, status: 'pending', detail: '' }))
  const publish = () => report(steps.map((step) => ({ ...step })))

  const run = async (id: string, work: () => Promise<string>): Promise<boolean> => {
    const step = steps.find((candidate) => candidate.id === id)
    if (!step) throw new Error(`unknown step ${id}`)
    step.status = 'running'
    publish()
    try {
      step.detail = await work()
      step.status = 'ok'
    } catch (error) {
      step.detail = describeError(error)
      step.status = 'error'
    }
    publish()
    return step.status === 'ok'
  }

  publish()
  const { platform, api, session } = services

  const ok =
    (await run('platform', async () => {
      await platform.init()
      platform.setLoadingProgress(100)
      await platform.start()
      const name = platform.getPlayer().name ?? 'no name from the SDK'
      return `${platform.kind} platform, player: ${name}`
    })) &&
    (await run('backend', async () => {
      const health = await api.health()
      return `status ${health.status}`
    })) &&
    (await run('signin', async () => {
      const signedIn = await session.signIn()
      return `signed in as "${signedIn.player.display_name}", best score ${signedIn.player.best_score}`
    })) &&
    (await run('profile', async () => {
      const me = await api.getMe()
      return me.rank === null ? 'no rank yet' : `rank ${me.rank}`
    })) &&
    (await run('round', async () => {
      const round = await api.startRound()
      if (!isRoundCompatible(round)) {
        throw new Error(
          `This build uses game config v${CONFIG.version} but the server uses v${round.config_version}. Rebuild the client.`,
        )
      }
      const field = roundField(round)
      if (!field) {
        throw new Error(`The server sent a play field of ${round.field_width} x ${round.field_height}, which is not valid.`)
      }
      const bubbles = generateSchedule(round.seed, field).length
      return `round ${round.round_id.slice(0, 8)}, seed ${round.seed}, ${bubbles} bubbles, field ${field.width} x ${field.height}, config v${round.config_version}`
    }))

  return ok
}
