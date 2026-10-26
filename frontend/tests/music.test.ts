import { describe, expect, it } from 'vitest'
import { LOOP_STEPS, STEPS_PER_BAR, STEPS_PER_CHORD, STEP_SECONDS, chordStart, notesAt } from '../src/audio/music'

const allSteps = Array.from({ length: LOOP_STEPS }, (_, i) => i)

describe('the music', () => {
  it('is eight bars of eighth notes, about nineteen seconds', () => {
    expect(LOOP_STEPS).toBe(64)
    expect(LOOP_STEPS * STEP_SECONDS).toBeCloseTo(19.2, 5)
  })

  it('wraps round, so it can play for ever', () => {
    for (const step of allSteps) {
      expect(notesAt(step + LOOP_STEPS)).toEqual(notesAt(step))
      expect(notesAt(step + LOOP_STEPS * 7)).toEqual(notesAt(step))
    }
  })

  it('gives the same notes for the same step every time', () => {
    expect(notesAt(21)).toEqual(notesAt(21))
  })

  it('starts with a full pad chord and a bass note', () => {
    const first = notesAt(0)
    expect(first.filter((n) => n.voice === 'pad')).toHaveLength(4)
    expect(first.filter((n) => n.voice === 'bass')).toHaveLength(1)
  })

  it('changes chord every two bars, and only then', () => {
    const padSteps = allSteps.filter((s) => notesAt(s).some((n) => n.voice === 'pad'))
    expect(padSteps).toEqual([0, 16, 32, 48])
  })

  it('has four different chords', () => {
    const chords = [0, 16, 32, 48].map((s) =>
      notesAt(s)
        .filter((n) => n.voice === 'pad')
        .map((n) => Math.round(n.frequency))
        .join(','),
    )
    expect(new Set(chords).size).toBe(4)
  })

  it('keeps every note in a range that is audible and gentle', () => {
    for (const step of allSteps) {
      for (const note of notesAt(step)) {
        expect(Number.isFinite(note.frequency)).toBe(true)
        expect(note.frequency).toBeGreaterThan(70)
        expect(note.frequency).toBeLessThan(1600)
        expect(note.steps).toBeGreaterThan(0)
        expect(note.level).toBeGreaterThan(0)
        expect(note.level).toBeLessThanOrEqual(0.25)
      }
    }
  })

  it('plays a bass note on the first beat of every bar', () => {
    for (let bar = 0; bar < LOOP_STEPS / STEPS_PER_BAR; bar++) {
      expect(notesAt(bar * STEPS_PER_BAR).some((n) => n.voice === 'bass')).toBe(true)
    }
  })

  it('leaves air in the tune: some steps rest, and never two notes at once', () => {
    const plucks = allSteps.map((s) => notesAt(s).filter((n) => n.voice === 'pluck').length)
    expect(Math.max(...plucks)).toBe(1)
    expect(plucks.filter((n) => n === 0).length).toBeGreaterThan(10)
    expect(plucks.filter((n) => n === 1).length).toBeGreaterThan(20)
  })

  it('lets a pad note last its whole chord', () => {
    expect(notesAt(0).find((n) => n.voice === 'pad')?.steps).toBe(STEPS_PER_CHORD)
  })
})

describe('chordStart', () => {
  it('is the first step of the chord a step belongs to', () => {
    expect(chordStart(0)).toBe(0)
    expect(chordStart(15)).toBe(0)
    expect(chordStart(16)).toBe(16)
    expect(chordStart(40)).toBe(32)
    expect(chordStart(64 + 17)).toBe(64 + 16)
  })
})
