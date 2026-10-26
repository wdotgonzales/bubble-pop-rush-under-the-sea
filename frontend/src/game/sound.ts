// A few short sounds made with the Web Audio API, so the game needs no audio files.
// Browsers only allow sound after a tap, so the context is created by `unlock()`, which
// the screen calls from the first tap. Every call is safe when sound is off or missing.

type ContextConstructor = typeof AudioContext

export class Sound {
  /** The sound switch on the screens. */
  muted = false
  private context: AudioContext | null = null

  /** Call from a tap or click. Creates the audio context the first time. */
  unlock(): void {
    try {
      if (!this.context) {
        const Constructor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: ContextConstructor }).webkitAudioContext
        if (!Constructor) return
        this.context = new Constructor()
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined)
    } catch {
      this.context = null
    }
  }

  /** A pop. The pitch climbs with the streak; a pearl rings twice. */
  pop(streak: number, pearl: boolean): void {
    const base = 520 * Math.pow(2, Math.min(streak, 12) / 24)
    this.tone(base, base * 1.7, 0.1, 0.16)
    if (pearl) this.tone(base * 1.5, base * 2.4, 0.16, 0.12, 0.06)
  }

  /** The end of the round: three rising notes. */
  end(): void {
    ;[660, 880, 1100].forEach((frequency, i) => this.tone(frequency, frequency, 0.22, 0.14, i * 0.11))
  }

  close(): void {
    const context = this.context
    this.context = null
    if (context) void context.close().catch(() => undefined)
  }

  private tone(from: number, to: number, seconds: number, volume: number, delay = 0): void {
    const context = this.context
    if (this.muted || !context || context.state !== 'running') return
    try {
      const start = context.currentTime + delay
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(from, start)
      oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(volume, start + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + seconds + 0.02)
    } catch {
      // Sound is a nicety: never let it interrupt a round.
    }
  }
}
