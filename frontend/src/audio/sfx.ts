// The short sounds of the game, as lists of tones. Each tone glides from one pitch to another
// while it fades in and out. Keeping them as plain data means they can be checked in a test
// (nothing too long, too loud or out of range) and played by the engine with one small function.

export interface Tone {
  /** Hertz at the start. */
  from: number
  /** Hertz at the end. */
  to: number
  seconds: number
  volume: number
  /** Seconds after the sound is asked for. */
  delay?: number
  type?: OscillatorType
}

/** A pop. The pitch climbs with the streak; a pearl rings twice. */
export function popTones(streak: number, pearl: boolean): Tone[] {
  const base = 520 * Math.pow(2, Math.min(Math.max(streak, 0), 12) / 24)
  const tones: Tone[] = [{ from: base, to: base * 1.7, seconds: 0.1, volume: 0.16 }]
  if (pearl) tones.push({ from: base * 1.5, to: base * 2.4, seconds: 0.16, volume: 0.12, delay: 0.06 })
  return tones
}

/** The countdown: the last beep, just before the round, is a little higher. */
export function tickTones(secondsLeft: number): Tone[] {
  const frequency = secondsLeft <= 1 ? 659 : 523
  return [{ from: frequency, to: frequency, seconds: 0.11, volume: 0.13 }]
}

/** The round begins: two bright notes and a sparkle. */
export function goTones(): Tone[] {
  return [
    { from: 784, to: 784, seconds: 0.12, volume: 0.14 },
    { from: 1175, to: 1175, seconds: 0.3, volume: 0.14, delay: 0.1 },
    { from: 1568, to: 2093, seconds: 0.25, volume: 0.07, delay: 0.2 },
  ]
}

/** A soft bloop for every button. */
export function buttonTones(): Tone[] {
  return [{ from: 380, to: 640, seconds: 0.08, volume: 0.1 }]
}

/** Time is up: three rising notes. */
export function endTones(): Tone[] {
  return [660, 880, 1100].map((frequency, i) => ({
    from: frequency,
    to: frequency,
    seconds: 0.22,
    volume: 0.14,
    delay: i * 0.11,
  }))
}

/** The game over screen appears: four notes stepping down to rest. */
export function gameOverTones(): Tone[] {
  return [659, 587, 523, 440].map((frequency, i, all) => ({
    from: frequency,
    to: frequency,
    seconds: i === all.length - 1 ? 0.6 : 0.2,
    volume: 0.12,
    delay: i * 0.17,
    type: 'triangle' as const,
  }))
}

/** A new personal best: a quick climb, held on the top note, with a sparkle above it. */
export function newBestTones(): Tone[] {
  const climb = [523, 659, 784, 1047].map((frequency, i) => ({
    from: frequency,
    to: frequency,
    seconds: i === 3 ? 0.5 : 0.14,
    volume: 0.13,
    delay: i * 0.09,
  }))
  return [...climb, { from: 2093, to: 2637, seconds: 0.4, volume: 0.06, delay: 0.3 }]
}

/** Play the tones on a context, through `out`, starting at `now`. */
export function playTones(ctx: BaseAudioContext, out: AudioNode, tones: readonly Tone[], now: number): void {
  for (const tone of tones) {
    const start = now + (tone.delay ?? 0)
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = tone.type ?? 'sine'
    oscillator.frequency.setValueAtTime(tone.from, start)
    if (tone.to !== tone.from) oscillator.frequency.exponentialRampToValueAtTime(tone.to, start + tone.seconds)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(tone.volume, start + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.seconds)
    oscillator.connect(gain).connect(out)
    oscillator.start(start)
    oscillator.stop(start + tone.seconds + 0.02)
  }
}
