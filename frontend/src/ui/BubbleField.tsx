import type { CSSProperties } from 'react'
import { BUBBLES, TINTS } from './bubbleLayouts'
import type { Layout } from './layout'

/** Decorative bubbles that bob in place behind the menu. Purely visual. */
export default function BubbleField({ layout }: { layout: Layout }) {
  return (
    <div className="bubble-field" aria-hidden>
      {BUBBLES[layout].map((bubble, i) => {
        const delay = -(i * 0.9)
        const style = {
          left: bubble.x,
          top: bubble.y,
          width: bubble.size,
          height: bubble.size,
          '--size': `${bubble.size}px`,
          '--tint': TINTS[bubble.tint],
          // Each bubble gets its own rhythm so they never move in step.
          '--dur': `${5 + (i % 4) * 1.3}s`,
          '--delay': `${delay.toFixed(1)}s`,
        } as CSSProperties
        return <span key={i} className="bubble" style={style} />
      })}
    </div>
  )
}
