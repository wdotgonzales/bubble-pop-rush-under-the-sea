// Bubble colours, shared with the decorative bubbles on the menu screens.

import type { Bubble } from '@shared/spawn.js'
import { TINTS } from '../ui/bubbleLayouts'
import type { Tint } from './effects'

function parse(triplet: string): Tint {
  const [r, g, b] = triplet.split(' ').map(Number)
  return [r, g, b]
}

/** Gold is kept for pearls, so a plain bubble is never mistaken for one. */
const PLAIN: readonly Tint[] = [TINTS.pink, TINTS.green, TINTS.violet, TINTS.cyan, TINTS.blue].map(parse)

export const PEARL_TINT: Tint = parse(TINTS.gold)

export function isPearl(bubble: Pick<Bubble, 'points'>): boolean {
  return bubble.points > 1
}

/** Each bubble keeps one colour for its whole life, picked from its index. */
export function tintFor(bubble: Pick<Bubble, 'index' | 'points'>): Tint {
  return isPearl(bubble) ? PEARL_TINT : PLAIN[bubble.index % PLAIN.length]
}

export function rgba(tint: Tint, alpha: number): string {
  return `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`
}
