// Turns the notes in music.ts into sound. Everything here takes a BaseAudioContext, so the same
// code plays in the browser and renders offline (which is how the music is checked without ears).

import { STEP_SECONDS, type Note } from './music'

export interface MusicGraph {
  /** Everything the music makes goes through here, then on to the volume. */
  input: GainNode
  pad: AudioNode
  pluck: AudioNode
  bass: AudioNode
}

/** The shared parts: a soft filter for the pad, and an echo that gives the tune its shimmer. */
export function createMusicGraph(ctx: BaseAudioContext, destination: AudioNode): MusicGraph {
  const input = ctx.createGain()
  input.gain.value = 1
  input.connect(destination)

  const pad = ctx.createBiquadFilter()
  pad.type = 'lowpass'
  pad.frequency.value = 1100
  pad.Q.value = 0.4
  pad.connect(input)

  const bass = ctx.createGain()
  bass.connect(input)

  const pluck = ctx.createGain()
  pluck.connect(input)

  // A dotted-eighth echo that fades and gets duller each time round.
  const delay = ctx.createDelay(1)
  delay.delayTime.value = STEP_SECONDS * 1.5
  const dull = ctx.createBiquadFilter()
  dull.type = 'lowpass'
  dull.frequency.value = 2400
  const feedback = ctx.createGain()
  feedback.gain.value = 0.38
  const wet = ctx.createGain()
  wet.gain.value = 0.5
  pluck.connect(delay)
  delay.connect(dull)
  dull.connect(feedback)
  feedback.connect(delay)
  dull.connect(wet)
  wet.connect(input)

  return { input, pad, pluck, bass }
}

/** Play one note of the music, starting at `when` (seconds on the context's clock). */
export function playNote(ctx: BaseAudioContext, graph: MusicGraph, note: Note, when: number): void {
  const length = note.steps * STEP_SECONDS
  switch (note.voice) {
    case 'pad': {
      // Two slightly out-of-tune triangles per note make it wide and slow to move. The next chord
      // fades in while this one is still fading out.
      for (const cents of [-7, 7]) {
        const level = note.level / 2
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = note.frequency
        osc.detune.value = cents
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.0001, when)
        gain.gain.linearRampToValueAtTime(level, when + 0.8)
        gain.gain.setValueAtTime(level, when + length)
        gain.gain.exponentialRampToValueAtTime(0.0001, when + length + 1.2)
        osc.connect(gain).connect(graph.pad)
        osc.start(when)
        osc.stop(when + length + 1.3)
      }
      return
    }
    case 'bass': {
      // A sine for the weight and a quiet octave above it, so a phone speaker that cannot play the
      // low note still gives a hint of it.
      for (const [multiple, share] of [
        [1, 1],
        [2, 0.55],
      ] as const) {
        const osc = ctx.createOscillator()
        osc.type = multiple === 1 ? 'sine' : 'triangle'
        osc.frequency.value = note.frequency * multiple
        const gain = ctx.createGain()
        const level = note.level * share
        gain.gain.setValueAtTime(0.0001, when)
        gain.gain.linearRampToValueAtTime(level, when + 0.015)
        gain.gain.exponentialRampToValueAtTime(0.0001, when + length * 0.95)
        osc.connect(gain).connect(graph.bass)
        osc.start(when)
        osc.stop(when + length)
      }
      return
    }
    case 'pluck': {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = note.frequency
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.linearRampToValueAtTime(note.level, when + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.5)
      osc.connect(gain).connect(graph.pluck)
      osc.start(when)
      osc.stop(when + 0.52)
      return
    }
  }
}
