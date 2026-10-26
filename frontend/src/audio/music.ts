// The background music, written as data. One loop of eight bars (about 19 seconds) over four
// chords, with three parts: a soft pad that holds each chord, a bass note on the beat, and a
// light plucked tune that echoes. There are no audio files: the engine plays these notes with
// Web Audio, so the music adds nothing to the download and starts at once.
//
// This file only says which notes sound on which step. `voices.ts` turns them into sound.

export const BPM = 100
/** One step is an eighth note. */
export const STEP_SECONDS = 60 / BPM / 2
export const STEPS_PER_BAR = 8
export const LOOP_BARS = 8
export const LOOP_STEPS = STEPS_PER_BAR * LOOP_BARS
/** A chord lasts two bars. */
export const STEPS_PER_CHORD = STEPS_PER_BAR * 2

export type VoiceName = 'pad' | 'bass' | 'pluck'

export interface Note {
  voice: VoiceName
  /** Hertz. */
  frequency: number
  /** How long it is held, in steps. */
  steps: number
  /** Loudness of this note before the music volume is applied. */
  level: number
}

const mtof = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

interface Chord {
  /** MIDI numbers: root, third, fifth and a colour note, low to high. */
  tones: readonly [number, number, number, number]
}

// C major 7, A minor 7, F major 7, G 6: a warm, unhurried turn that comes back to the start.
const CHORDS: readonly Chord[] = [
  { tones: [48, 52, 55, 59] },
  { tones: [45, 48, 52, 55] },
  { tones: [41, 45, 48, 52] },
  { tones: [43, 47, 50, 52] },
]

// Which chord tone the tune plays on each step of a bar (null is a rest). Two bars of each chord
// use the two patterns in turn, so the tune is not a loop inside a loop.
const TUNE: readonly (readonly (number | null)[])[] = [
  [0, null, 2, 3, null, 2, 1, null],
  [1, null, 3, 2, null, 1, 3, 2],
]

const PAD_LEVEL = 0.03
const BASS_LEVEL = 0.2
const PLUCK_LEVEL = 0.14

/** The notes that begin on a step. Steps count up for ever; the loop wraps by itself. */
export function notesAt(step: number): Note[] {
  const whole = Math.floor(step)
  const s = ((whole % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS
  const bar = Math.floor(s / STEPS_PER_BAR)
  const inBar = s % STEPS_PER_BAR
  const chord = CHORDS[Math.floor(bar / 2)] ?? CHORDS[0]
  if (!chord) return []
  const notes: Note[] = []

  if (s % STEPS_PER_CHORD === 0) {
    for (const tone of chord.tones) {
      notes.push({ voice: 'pad', frequency: mtof(tone + 12), steps: STEPS_PER_CHORD, level: PAD_LEVEL })
    }
  }

  if (inBar === 0) notes.push({ voice: 'bass', frequency: mtof(chord.tones[0]), steps: 3, level: BASS_LEVEL })
  if (inBar === 5) notes.push({ voice: 'bass', frequency: mtof(chord.tones[2]), steps: 2, level: BASS_LEVEL * 0.6 })

  const pattern = TUNE[bar % 2] ?? TUNE[0]
  const index = pattern?.[inBar]
  if (index !== null && index !== undefined) {
    const tone = chord.tones[index]
    if (tone !== undefined) notes.push({ voice: 'pluck', frequency: mtof(tone + 24), steps: 1, level: PLUCK_LEVEL })
  }
  return notes
}

/** The first step of the chord that a step belongs to, so music can join in with its pad. */
export function chordStart(step: number): number {
  return Math.floor(step / STEPS_PER_CHORD) * STEPS_PER_CHORD
}
