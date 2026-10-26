import { describe, expect, it } from 'vitest'
import { bestScoreLabel, personalBestLabel } from '../src/state/labels'
import { mapLoad } from '../src/state/load'

describe('bestScoreLabel', () => {
  it('shows the score once it is known', () => {
    expect(bestScoreLabel({ status: 'ready', data: 42 })).toBe('Best Score: 42')
  })

  it('invites a first game when there is no score yet', () => {
    expect(bestScoreLabel({ status: 'ready', data: 0 })).toBe('No score yet')
  })

  it('shows a placeholder while loading and a dash on failure', () => {
    expect(bestScoreLabel({ status: 'loading' })).toBe('Best Score: …')
    expect(bestScoreLabel({ status: 'error', message: 'x' })).toBe('Best Score: –')
  })
})

describe('personalBestLabel', () => {
  it('celebrates a new best with the new score', () => {
    expect(personalBestLabel(50, 50, true)).toBe('New Best: 50!')
  })

  it('shows the standing best otherwise', () => {
    expect(personalBestLabel(22, 42, false)).toBe('Personal Best: 42')
  })
})

describe('mapLoad', () => {
  it('maps a ready value and passes loading and errors through', () => {
    expect(mapLoad({ status: 'ready', data: 2 }, (n) => n * 3)).toEqual({ status: 'ready', data: 6 })
    expect(mapLoad<number, number>({ status: 'loading' }, (n) => n)).toEqual({ status: 'loading' })
    const failed = { status: 'error', message: 'boom' } as const
    expect(mapLoad<number, number>(failed, (n) => n)).toBe(failed)
  })
})
