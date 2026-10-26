import type { RoundPhase } from './engine'

/** What the Escape key does to a round. */
export type EscapeAction = 'pause' | 'resume' | null

interface KeyPress {
  key: string
  /** The key is being held down and the keyboard is repeating it. */
  repeat: boolean
  phase: RoundPhase
  /** The settings window is open. It owns Escape then: Escape closes it. */
  settingsOpen: boolean
}

/**
 * Escape pauses a round that is running and, on the Paused screen, carries on with it: the same
 * key both ways, as in most games. It does nothing during the countdown or once the round is over,
 * while the settings window is open (Escape closes that), or when the key is only repeating
 * because it is held down (the screen would flicker between the two).
 */
export function escapeAction({ key, repeat, phase, settingsOpen }: KeyPress): EscapeAction {
  if (key !== 'Escape' || repeat || settingsOpen) return null
  if (phase === 'running') return 'pause'
  if (phase === 'paused') return 'resume'
  return null
}
