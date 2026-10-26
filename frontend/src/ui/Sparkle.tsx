import type { CSSProperties } from 'react'

interface Props {
  /** Top-left of the sparkle's own box, relative to its parent, in pixels. */
  x: number
  y: number
  size: number
  /** Seconds. Offsets the twinkle so two sparkles on a button alternate. */
  delay?: number
}

const STAR =
  'M10 0 C10.8 5.5 14.5 9.2 20 10 C14.5 10.8 10.8 14.5 10 20 C9.2 14.5 5.5 10.8 0 10 C5.5 9.2 9.2 5.5 10 0Z'

/** A four-point sparkle with a soft glow. Decorative. */
export default function Sparkle({ x, y, size, delay = 0 }: Props) {
  const box = size * 1.5 // room for the glow around the star itself
  const style: CSSProperties = {
    left: x - size * 0.25,
    top: y - size * 0.25,
    width: box,
    height: box,
    animationDelay: `${delay}s`,
  }
  return (
    <svg className="sparkle" viewBox="-5 -5 30 30" style={style} aria-hidden>
      <path d={STAR} fill="#fff" />
    </svg>
  )
}
