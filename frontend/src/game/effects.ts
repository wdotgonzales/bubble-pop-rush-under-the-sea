// The little animations around the game: pop bursts, rings, "+1" text, ripples where
// the player missed and the streak message. They are only for show: nothing here
// touches the score or the tap log. Positions are in field units and times in ms of
// the wall clock, so the renderer can draw any moment from the data alone.

/** Red, green, blue, 0 to 255. */
export type Tint = readonly [number, number, number]

export interface Particle {
  tint: Tint
  x: number
  y: number
  /** Field units per ms. */
  vx: number
  vy: number
  born: number
  life: number
  /** Radius in field units. */
  size: number
}

export interface Ring {
  tint: Tint
  x: number
  y: number
  born: number
  life: number
  /** Radius at the start and at the end, in field units. */
  from: number
  to: number
}

export interface Floater {
  x: number
  y: number
  born: number
  life: number
  text: string
  big: boolean
}

export interface Ripple {
  x: number
  y: number
  born: number
  life: number
}

export interface Toast {
  text: string
  born: number
  life: number
}

export interface PopLook {
  tint: Tint
  x: number
  y: number
  /** Bubble radius in field units when it popped. */
  radius: number
  points: number
  streak: number
}

const PARTICLE_LIFE_MS = 520
const RING_LIFE_MS = 380
const FLOATER_LIFE_MS = 750
const RIPPLE_LIFE_MS = 420
const TOAST_LIFE_MS = 1100
const MAX_PARTICLES = 160

/** The message for a streak of pops in a row, or null when this one is not a milestone. */
export function streakMessage(streak: number): string | null {
  if (streak < 5 || streak % 5 !== 0) return null
  if (streak === 5) return 'Nice!'
  if (streak === 10) return 'Great!'
  if (streak === 15) return 'Amazing!'
  return `${streak} in a row!`
}

export class Effects {
  particles: Particle[] = []
  rings: Ring[] = []
  floaters: Floater[] = []
  ripples: Ripple[] = []
  toast: Toast | null = null

  constructor(private readonly random: () => number = Math.random) {}

  pop(now: number, look: PopLook): void {
    const pearl = look.points > 1
    const count = pearl ? 16 : 10
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + this.random() * 0.5
      const speed = (look.radius * (0.9 + this.random() * 1.1)) / PARTICLE_LIFE_MS
      this.particles.push({
        tint: look.tint,
        x: look.x,
        y: look.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        born: now,
        life: PARTICLE_LIFE_MS * (0.7 + this.random() * 0.4),
        size: look.radius * (0.07 + this.random() * 0.07),
      })
    }
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES)

    this.rings.push({ tint: look.tint, x: look.x, y: look.y, born: now, life: RING_LIFE_MS, from: look.radius * 0.7, to: look.radius * 1.6 })
    this.floaters.push({
      x: look.x,
      y: look.y - look.radius * 0.6,
      born: now,
      life: FLOATER_LIFE_MS,
      text: `+${look.points}`,
      big: pearl,
    })

    const message = streakMessage(look.streak)
    if (message) this.toast = { text: message, born: now, life: TOAST_LIFE_MS }
  }

  miss(now: number, x: number, y: number): void {
    this.ripples.push({ x, y, born: now, life: RIPPLE_LIFE_MS })
    if (this.ripples.length > 12) this.ripples.shift()
  }

  /** Forget what has finished. Call once a frame. */
  prune(now: number): void {
    this.particles = this.particles.filter((p) => now - p.born < p.life)
    this.rings = this.rings.filter((r) => now - r.born < r.life)
    this.floaters = this.floaters.filter((f) => now - f.born < f.life)
    this.ripples = this.ripples.filter((r) => now - r.born < r.life)
    if (this.toast && now - this.toast.born >= this.toast.life) this.toast = null
  }

  get active(): boolean {
    return (
      this.particles.length > 0 ||
      this.rings.length > 0 ||
      this.floaters.length > 0 ||
      this.ripples.length > 0 ||
      this.toast !== null
    )
  }
}

/** 0 at the start of an effect, 1 at its end. */
export function progress(now: number, born: number, life: number): number {
  return Math.min(1, Math.max(0, (now - born) / life))
}

/** Starts fast and settles. */
export function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p)
}
