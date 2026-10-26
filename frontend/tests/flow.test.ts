import { describe, expect, it } from 'vitest'
import { CONFIG, generateSchedule, isValidField } from '@shared/spawn.js'
import { MAX_AGE_MS, takeUsable } from '../src/game/prefetch'
import { practiceRound } from '../src/game/practice'
import { applyOutcome, dashboardScreen, homeScreen, settleScreen, type FlowScreen } from '../src/state/flow'
import { PRACTICE_LABEL, saveLabel } from '../src/state/labels'
import type { RoundStart } from '../src/types'

type Over = Extract<FlowScreen, { name: 'over' }>

const OVER: Over = { name: 'over', roundId: 'r1', score: 9, save: { status: 'saving' } }

describe('applyOutcome', () => {
  it('shows the server score once saved', () => {
    const result = { round_id: 'r1', status: 'accepted' as const, score: 7, best_score: 12, is_new_best: false, rank: 3 }
    const next = applyOutcome(OVER, { status: 'saved', result })
    expect(next.score).toBe(7)
    expect(next.save).toEqual({ status: 'saved', result })
  })

  it('shows that the score is waiting, keeping the score', () => {
    expect(applyOutcome(OVER, { status: 'queued' })).toEqual({ ...OVER, save: { status: 'queued' } })
  })

  it('shows that the server refused it', () => {
    expect(applyOutcome(OVER, { status: 'rejected' })).toEqual({ ...OVER, save: { status: 'failed' } })
  })

  it('moves a waiting score to saved when it finally gets through', () => {
    const waiting = applyOutcome(OVER, { status: 'queued' })
    const result = { round_id: 'r1', status: 'accepted' as const, score: 9, best_score: 9, is_new_best: true, rank: 1 }
    expect(applyOutcome(waiting, { status: 'saved', result }).save.status).toBe('saved')
  })
})

describe('saveLabel', () => {
  it('has a line for every state a score can be in', () => {
    expect(saveLabel('saving')).toBe('Saving score…')
    expect(saveLabel('queued')).toBe('Will save later')
    expect(saveLabel('failed')).toBe('Score not saved')
    expect(saveLabel('practice')).toBe('Practice round')
  })

  it('keeps those lines short enough for the personal best line', () => {
    for (const status of ['saving', 'queued', 'failed', 'practice'] as const) {
      expect(saveLabel(status).length).toBeLessThanOrEqual(16)
    }
  })

  it('names the practice button', () => {
    expect(PRACTICE_LABEL).toContain('practice')
  })
})

describe('practiceRound', () => {
  const phone = { width: 390, height: 844 }
  const desktop = { width: 1280, height: 720 }

  it('is a playable round for this build', () => {
    for (const view of [phone, desktop]) {
      const round = practiceRound(view, 42, 1_000)
      expect(round.config_version).toBe(CONFIG.version)
      expect(isValidField(round.field_width, round.field_height)).toBe(true)
      expect(round.duration_ms).toBe(CONFIG.duration_ms)
      expect(generateSchedule(round.seed, { width: round.field_width, height: round.field_height }).length).toBeGreaterThan(20)
    }
  })

  it('fits the window like a real round', () => {
    expect(practiceRound(desktop, 1, 1).field_width).toBeGreaterThan(practiceRound(desktop, 1, 1).field_height)
    expect(practiceRound(phone, 1, 1).field_height).toBeGreaterThan(practiceRound(phone, 1, 1).field_width)
  })

  it('is recognisable as practice, and different each time', () => {
    expect(practiceRound(phone, 1, 1000).round_id).toBe('practice-1000')
    expect(practiceRound(phone, 1, 1000).round_id).not.toBe(practiceRound(phone, 1, 2000).round_id)
  })

  it('draws a 32-bit seed when none is given', () => {
    for (let i = 0; i < 20; i++) {
      const { seed } = practiceRound(phone)
      expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true)
    }
  })
})

describe('takeUsable (the round fetched ahead)', () => {
  const field = { width: 10000, height: 19231 }
  const round: RoundStart = {
    round_id: 'next',
    seed: 5,
    config_version: CONFIG.version,
    field_width: 10000,
    field_height: 19231,
    duration_ms: 30000,
    started_at: '2026-10-26T08:00:00Z',
    expires_at: '2026-10-27T08:00:00Z',
  }
  const fetched = (at: number) => ({ round, fetchedAt: at })

  it('uses a fresh round that fits', () => {
    expect(takeUsable(fetched(1000), field, 2000)).toBe(round)
  })

  it('has nothing when nothing was fetched', () => {
    expect(takeUsable(null, field, 0)).toBeNull()
  })

  it('throws away an old round', () => {
    expect(takeUsable(fetched(0), field, MAX_AGE_MS)).toBe(round)
    expect(takeUsable(fetched(0), field, MAX_AGE_MS + 1)).toBeNull()
  })

  it('throws away a round from the future (a clock that moved back)', () => {
    expect(takeUsable(fetched(5000), field, 1000)).toBeNull()
  })

  it('accepts a small change of window but not a turned phone', () => {
    expect(takeUsable(fetched(0), { width: 10400, height: 19800 }, 1)).toBe(round)
    expect(takeUsable(fetched(0), { width: 19231, height: 10000 }, 1)).toBeNull()
  })

  it('throws away a round with a field the build would not play', () => {
    const bad = { round: { ...round, field_width: 5 }, fetchedAt: 0 }
    expect(takeUsable(bad, { width: 5, height: 19231 }, 1)).toBeNull()
  })
})

describe('going home', () => {
  it('shows the start screen with nothing to report and no practice offer', () => {
    expect(homeScreen()).toEqual({ name: 'start', notice: null, canPractice: false })
  })

  it('is not brought back to the game over screen by a score that arrives late', () => {
    const home = homeScreen()
    const result = { round_id: 'r1', status: 'accepted' as const, score: 9, best_score: 9, is_new_best: false, rank: 1 }
    expect(settleScreen(home, 'r1', { status: 'saved', result }) === home).toBe(true)
    expect(settleScreen(home, 'r1', { status: 'queued' }) === home).toBe(true)
  })

  it('still settles the game over screen of the same round', () => {
    expect(settleScreen(OVER, 'r1', { status: 'queued' })).toEqual({ ...OVER, save: { status: 'queued' } })
  })

  it('leaves the game over screen of a later round alone', () => {
    expect(settleScreen(OVER, 'r0', { status: 'queued' }) === OVER).toBe(true)
  })
})

describe('the Dashboard screen', () => {
  it('is its own screen, with nothing to carry', () => {
    expect(dashboardScreen()).toEqual({ name: 'dashboard' })
  })

  it('is left alone by a score arriving late', () => {
    // A score saved while the player is looking at the board must not pull them to a game over screen.
    const result = { round_id: 'r1', status: 'accepted' as const, score: 7, best_score: 12, is_new_best: false, rank: 3 }
    expect(settleScreen(dashboardScreen(), 'r1', { status: 'saved', result })).toEqual({ name: 'dashboard' })
    expect(settleScreen(dashboardScreen(), 'r1', { status: 'queued' })).toEqual({ name: 'dashboard' })
  })

  it('goes back to a start screen with no problem to report', () => {
    expect(homeScreen()).toEqual({ name: 'start', notice: null, canPractice: false })
  })
})
