/** On a big window the screens scale up, so the window grows with them (never smaller than life size). */
export function modalScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1
  return Math.min(1.7, Math.max(1, Math.min(width / 420, height / 600)))
}
