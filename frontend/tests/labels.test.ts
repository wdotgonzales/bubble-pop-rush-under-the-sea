import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../src/api/client'
import { OUTDATED_BUILD_NOTICE, bestScoreLabel, personalBestLabel, saveLabel, startFailureLabel } from '../src/state/labels'
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

describe('startFailureLabel', () => {
  it('tells the player to wait when rounds are limited', () => {
    expect(startFailureLabel(new ApiError(429, null, 'slow'))).toContain('Wait')
  })

  it('suggests checking the connection when the server cannot be reached', () => {
    expect(startFailureLabel(new NetworkError('offline'))).toContain('connection')
  })

  it('has a plain message for anything else', () => {
    expect(startFailureLabel(new ApiError(500, null, 'boom'))).toBe("Couldn't start a round. Please try again.")
    expect(startFailureLabel(new Error('x'))).toBe("Couldn't start a round. Please try again.")
  })

  it('never shows technical detail', () => {
    for (const error of [new ApiError(500, 'db_down', 'secret detail'), new NetworkError('ECONNRESET 10.0.0.1')]) {
      const text = startFailureLabel(error)
      expect(text).not.toContain('secret')
      expect(text).not.toContain('ECONN')
    }
  })
})

describe('saveLabel and the outdated notice', () => {
  it('say what is happening to the score', () => {
    expect(saveLabel('saving')).toBe('Saving score…')
    expect(saveLabel('failed')).toBe('Score not saved')
  })

  it('tells the player to reload an outdated build', () => {
    expect(OUTDATED_BUILD_NOTICE).toContain('Reload')
  })
})
