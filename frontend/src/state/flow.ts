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
