import type { CSSProperties, ReactNode } from 'react'
import Sparkle from './Sparkle'

export interface SparkleSpec {
  x: number
  y: number
  size: number
}

interface Props {
  /** cream: the pearl "play" button. aqua: the blue "share" button. */
  variant: 'cream' | 'aqua'
  /** Size in design pixels. */
  width: number
  height: number
  fontSize: number
  font?: 'roboto' | 'lilita'
  glow?: 'strong' | 'soft'
  sparkles?: readonly SparkleSpec[]
  icon?: ReactNode
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}

/** The glossy pearl button used on every screen. The label is live text. */
export default function PearlButton({
  variant,
  width,
  height,
  fontSize,
  font = 'lilita',
  glow = 'soft',
  sparkles = [],
  icon,
  disabled = false,
  onClick,
  children,
}: Props) {
  const style: CSSProperties = { width, height, fontSize }
  return (
    <button
      type="button"
      className={`pearl pearl-${variant} pearl-glow-${glow} pearl-font-${font}`}
      style={style}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="pearl-face" aria-hidden />
      <span className="pearl-gloss" aria-hidden />
      <span className="pearl-glint" aria-hidden />
      <span className="pearl-label">
        {icon}
        {children}
      </span>
      {sparkles.map((s, i) => (
        <Sparkle key={i} x={s.x} y={s.y} size={s.size} delay={i * 0.9} />
      ))}
    </button>
  )
}
