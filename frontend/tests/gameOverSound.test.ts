import { describe, expect, it } from 'vitest'
import { nextJingle } from '../src/state/gameOverJingle'

describe('nextJingle', () => {
  it('waits while the server has not answered yet', () => {
    expect(nextJingle('none', false, false, false)).toBeNull()
  })

  it('plays the tune once the score is settled', () => {
    expect(nextJingle('none', true, false, false)).toBe('over')
  })

  it('plays the new best flourish instead of the tune when the answer is in time', () => {
    expect(nextJingle('none', true, true, false)).toBe('best')
  })

  it('plays the tune anyway when the server is slow', () => {
    expect(nextJingle('none', false, false, true)).toBe('over')
  })

  it('follows a late tune with the flourish, but only once', () => {
    expect(nextJingle('over', true, true, false)).toBe('best')
    expect(nextJingle('best', true, true, false)).toBeNull()
  })

  it('does not repeat the tune', () => {
    expect(nextJingle('over', true, false, false)).toBeNull()
    expect(nextJingle('over', false, false, true)).toBeNull()
  })

  it('gives a practice round and a saved score the same plain tune', () => {
    expect(nextJingle('none', true, false, false)).toBe('over')
  })
})
