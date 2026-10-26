import type { CSSProperties } from 'react'

interface Letter {
  ch: string
  /** Box of the rotated letter in the 310 x 72 title frame of the mobile design. */
  x: number
  y: number
  w: number
  h: number
  rotate: number
  font: 'coiny' | 'lilita'
}

// Read from the Figma title: each letter is placed and tilted by hand.
const LETTERS: readonly Letter[] = [
  { ch: 'G', x: 6.8, y: 2.06, w: 46.342, h: 55.485, rotate: -9, font: 'coiny' },
  { ch: 'A', x: 42.84, y: -0.42, w: 40.221, h: 52.947, rotate: -5, font: 'coiny' },
  { ch: 'M', x: 76.84, y: -2.67, w: 51.371, h: 53.227, rotate: -4, font: 'coiny' },
  { ch: 'E', x: 121, y: 0.09, w: 34.867, h: 50.586, rotate: -1, font: 'coiny' },
  { ch: 'O', x: 160.76, y: 0, w: 41.721, h: 51.366, rotate: 2, font: 'coiny' },
  { ch: 'V', x: 195.71, y: 0.68, w: 36.407, h: 52.18, rotate: 4, font: 'lilita' },
  { ch: 'E', x: 226.51, y: 3.4, w: 39.84, h: 53.771, rotate: 7, font: 'coiny' },
  { ch: 'R', x: 257.38, y: 6.8, w: 43.379, h: 55.016, rotate: 9, font: 'coiny' },
]

// Small highlights on the letters.
const SHINES: ReadonlyArray<readonly [number, number]> = [
  [13.27, 21.76],
  [54.07, 16.32],
  [86.03, 13.6],
  [128.91, 10.2],
  [170.31, 11.56],
  [204.31, 15.64],
  [241.71, 19.72],
  [274.41, 25.84],
]

const TITLE_WIDTH = 310
const TITLE_HEIGHT = 72
const FONT_SIZE = 49.64

/** "GAME OVER" in chunky tilted letters. `scale` enlarges it for the desktop layout. */
export default function GameOverTitle({ scale = 1 }: { scale?: number }) {
  const frame = {
    width: TITLE_WIDTH * scale,
    height: TITLE_HEIGHT * scale,
    '--k': scale,
  } as CSSProperties
  return (
    <h1 className="over-title" style={frame} aria-label="Game Over">
      {LETTERS.map((l, i) => (
        <span
          key={i}
          className={`over-letter over-letter-${l.font}`}
          aria-hidden
          style={{
            left: l.x * scale,
            top: l.y * scale,
            width: l.w * scale,
            height: l.h * scale,
            fontSize: FONT_SIZE * scale,
          }}
        >
          <span className="over-letter-turn" style={{ transform: `rotate(${l.rotate}deg)` }}>
            <span className="over-letter-outline">{l.ch}</span>
            <span className="over-letter-fill">{l.ch}</span>
          </span>
        </span>
      ))}
      {SHINES.map(([x, y], i) => (
        <span
          key={`s${i}`}
          className="over-shine"
          aria-hidden
          style={{ left: x * scale, top: y * scale, width: 3.4 * scale, height: 6.12 * scale }}
        />
      ))}
    </h1>
  )
}
