// All the sound in the game: one audio context for the whole visit, with two volumes (music and
// effects) in front of it. Screens ask for sounds by name and never touch Web Audio themselves.
//
// Browsers only allow sound after a tap, so nothing is created until `unlock()` is called from
// one (the SoundProvider does it on the first tap anywhere). Every call is safe before that, when
// sound is off, or when the browser has no Web Audio: it simply does nothing.

import { STEP_SECONDS, chordStart, notesAt } from './music'
import { DEFAULT_AUDIO, gainFor, type AudioSettings } from './settings'
import {
  buttonTones,
  endTones,
  gameOverTones,
  goTones,
  newBestTones,
  playTones,
  popTones,
  tickTones,
  type Tone,
} from './sfx'
import { createMusicGraph, playNote, type MusicGraph } from './voices'

type ContextConstructor = typeof AudioContext

/** How far ahead the music is written into the audio clock, and how often that is topped up. */
const LOOKAHEAD_SECONDS = 0.6
const TOP_UP_MS = 150
/** Volume changes glide over this long, so a slider never clicks. */
const GLIDE_SECONDS = 0.03
/**
 * The music is kept well under the effects, so the pops stay clear on top of it. Rendering both
 * offline showed that at the default sliders the music sits about 7 dB below a pop, and that
 * turning the music slider right up lets it pass the pops, which is the player's choice.
 */
const MUSIC_TRIM = 0.4
/** A slider drag plays a sample pop, but not more often than this. */
const SAMPLE_GAP_MS = 140

export class AudioEngine {
  private context: AudioContext | null = null
  private musicBus: GainNode | null = null
  private effectsBus: GainNode | null = null
  private graph: MusicGraph | null = null
  private settings: AudioSettings = { ...DEFAULT_AUDIO }
  private timer: number | undefined
  private nextStep = 0
  private nextTime = 0
  private hidden = false
  private lastSample = 0

  /** Use these settings from now on. Safe to call at any time, with or without a context. */
  apply(settings: AudioSettings): void {
    this.settings = settings
    this.setBuses(false)
    this.syncMusic()
  }

  /** Call from a tap, click or key press. Creates the audio context the first time. */
  unlock(): void {
    try {
      if (!this.context) {
        const Constructor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: ContextConstructor }).webkitAudioContext
        if (!Constructor) return
        const context = new Constructor()
        // Overlapping pops and the music are kept from ever adding up to a crackle.
        const master = context.createDynamicsCompressor()
        master.threshold.value = -14
        master.knee.value = 12
        master.ratio.value = 6
        master.attack.value = 0.005
        master.release.value = 0.25
        master.connect(context.destination)
        const music = context.createGain()
        const effects = context.createGain()
        music.connect(master)
        effects.connect(master)
        this.context = context
        this.musicBus = music
        this.effectsBus = effects
        this.graph = createMusicGraph(context, music)
        this.setBuses(true)
      }
      if (!this.hidden && this.context.state === 'suspended') void this.context.resume().catch(() => undefined)
      this.syncMusic()
    } catch {
      this.close()
    }
  }

  /** The page was hidden or shown again: nothing should play while it is out of sight. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden
    const context = this.context
    if (!context) return
    if (hidden) void context.suspend().catch(() => undefined)
    else void context.resume().catch(() => undefined)
    this.syncMusic()
  }

  pop(streak: number, pearl: boolean): void {
    this.play(popTones(streak, pearl))
  }

  /** `secondsLeft` is 3, 2 or 1. */
  tick(secondsLeft: number): void {
    this.play(tickTones(secondsLeft))
  }

  go(): void {
    this.play(goTones())
  }

  button(): void {
    this.play(buttonTones())
  }

  end(): void {
    this.play(endTones())
  }

  gameOver(): void {
    this.play(gameOverTones())
  }

  newBest(): void {
    this.play(newBestTones())
  }

  /** A pop to hear how loud the effects are while dragging the slider. */
  sample(): void {
    const now = performance.now()
    if (now - this.lastSample < SAMPLE_GAP_MS) return
    this.lastSample = now
    this.play(popTones(4, false))
  }

  close(): void {
    this.stopMusic()
    const context = this.context
    this.context = null
    this.musicBus = null
    this.effectsBus = null
    this.graph = null
    if (context) void context.close().catch(() => undefined)
  }

  private play(tones: readonly Tone[]): void {
    const context = this.context
    const bus = this.effectsBus
    if (!context || !bus || context.state === 'closed') return
    if (this.hidden || !this.settings.sfxOn || this.settings.sfxVolume <= 0) return
    try {
      playTones(context, bus, tones, context.currentTime)
    } catch {
      // Sound is a nicety: never let it interrupt a round.
    }
  }

  private setBuses(immediate: boolean): void {
    const context = this.context
    if (!context || !this.musicBus || !this.effectsBus) return
    const music = this.settings.musicOn ? gainFor(this.settings.musicVolume) * MUSIC_TRIM : 0
    const effects = this.settings.sfxOn ? gainFor(this.settings.sfxVolume) : 0
    const glide = immediate ? 0.001 : GLIDE_SECONDS
    this.musicBus.gain.setTargetAtTime(music, context.currentTime, glide)
    this.effectsBus.gain.setTargetAtTime(effects, context.currentTime, glide)
  }

  /** Start or stop writing music, depending on whether anyone could hear it. */
  private syncMusic(): void {
    const wanted =
      this.context !== null && !this.hidden && this.settings.musicOn && this.settings.musicVolume > 0
    if (wanted && this.timer === undefined) this.startMusic()
    else if (!wanted && this.timer !== undefined) this.stopMusic()
  }

  private startMusic(): void {
    const context = this.context
    if (!context) return
    // Come back in at the start of the chord that was playing, so the pad is there at once.
    this.nextStep = chordStart(this.nextStep)
    this.nextTime = context.currentTime + 0.1
    this.topUp()
    this.timer = window.setInterval(this.topUp, TOP_UP_MS)
  }

  private stopMusic(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer)
    this.timer = undefined
  }

  /** Write the next stretch of music into the audio clock. */
  private topUp = (): void => {
    const context = this.context
    const graph = this.graph
    if (!context || !graph) return
    try {
      // After a stall, do not play the missed notes all at once: carry on from now.
      if (this.nextTime < context.currentTime) this.nextTime = context.currentTime + 0.05
      const horizon = context.currentTime + LOOKAHEAD_SECONDS
      while (this.nextTime < horizon) {
        for (const note of notesAt(this.nextStep)) playNote(context, graph, note, this.nextTime)
        this.nextStep += 1
        this.nextTime += STEP_SECONDS
      }
    } catch {
      this.stopMusic()
    }
  }
}
