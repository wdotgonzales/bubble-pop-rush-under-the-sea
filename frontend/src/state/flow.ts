import type { ScoreOutcome } from '../game/pending'
import type { RoundStart, SubmitResult } from '../types'

/** What has happened to the score of a finished round. */
export type SaveState =
  | { status: 'saving' }
  | { status: 'saved'; result: SubmitResult }
  /** It did not get through yet; it is kept and will be sent when the connection allows. */
  | { status: 'queued' }
  /** The server refused it for good. */
  | { status: 'failed' }
  /** A round played without the server: it was never meant to be sent. */
  | { status: 'practice' }

export type FlowScreen =
  | {
      name: 'start'
      notice: string | null
      /** The last start did not work: offer a round that needs no server. */
      canPractice: boolean
    }
  | { name: 'play'; round: RoundStart; practice: boolean }
  | { name: 'over'; roundId: string; score: number; save: SaveState }

type OverScreen = Extract<FlowScreen, { name: 'over' }>

export interface View {
  width: number
  height: number
}

/**
 * A score's outcome arriving at any time, even after the player has moved on. It only changes the
 * game over screen of the same round: on the start screen (after GO HOME) or in a later round it
 * changes nothing, so a late answer can never bring an old game over screen back.
 */
export function settleScreen(current: FlowScreen, roundId: string, outcome: ScoreOutcome): FlowScreen {
  return current.name === 'over' && current.roundId === roundId ? applyOutcome(current, outcome) : current
}

/** The start screen as it is when the player chooses to go home: no problem to report. */
export function homeScreen(): FlowScreen {
  return { name: 'start', notice: null, canPractice: false }
}

/** The game over screen after the server (or the queue) has said something about the score. */
export function applyOutcome(screen: OverScreen, outcome: ScoreOutcome): OverScreen {
  switch (outcome.status) {
    case 'saved':
      // The server's score is the one that counts, so it replaces the one worked out locally.
      return { ...screen, score: outcome.result.score, save: { status: 'saved', result: outcome.result } }
    case 'queued':
      return { ...screen, save: { status: 'queued' } }
    case 'rejected':
      return { ...screen, save: { status: 'failed' } }
  }
}
