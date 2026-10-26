import type { CSSProperties } from 'react'
import type { BoardRow } from '../state/leaderboardView'
import { toBoardView } from '../state/leaderboardView'
import type { Load } from '../state/types'
import type { Leaderboard as LeaderboardData } from '../types'
import type { Layout } from './layout'

interface Props {
  state: Load<LeaderboardData>
  variant: Layout
  onRetry: () => void
  /** The title above the rows. */
  heading?: string
  /** Gold, silver and bronze badges for the first three places. */
  medals?: boolean
  /** The rows rise into place one after another when they arrive. */
  animate?: boolean
  /** Slightly shorter rows on the wide screen, so ten rows and the player's own row all fit. */
  dense?: boolean
}

const DEFAULT_HEADING = 'Top-10 Leaderboard'

interface RowProps {
  row: BoardRow
  /** Position in the list, for the order the rows rise in. */
  index?: number
  medals?: boolean
}

function Row({ row, index = 0, medals = false }: RowProps) {
  const classes = ['board-row']
  if (row.isLeader) classes.push('board-row-leader')
  if (row.isMe) classes.push('board-row-me')
  const style = { '--i': index } as CSSProperties
  return (
    <li className={classes.join(' ')} style={style}>
      <span
        className="rank-badge"
        data-wide={row.rank > 99 ? 'true' : undefined}
        data-medal={medals && row.rank <= 3 ? row.rank : undefined}
      >
        {row.rank}
      </span>
      <span className="board-name">{row.name}</span>
      <span className="board-score">{row.score}</span>
    </li>
  )
}

function SkeletonRows() {
  return (
    <ol className="board-list" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i} className="board-row board-row-skeleton">
          <span className="rank-badge rank-badge-skeleton" />
          <span className="skeleton-bar" style={{ width: `${48 + ((i * 17) % 34)}%` }} />
        </li>
      ))}
    </ol>
  )
}

/** The top-10 board, with a loading, an error and an empty state. */
export default function Leaderboard({
  state,
  variant,
  onRetry,
  heading = DEFAULT_HEADING,
  medals = false,
  animate = false,
  dense = false,
}: Props) {
  let body
  if (state.status === 'loading') {
    body = <SkeletonRows />
  } else if (state.status === 'error') {
    body = (
      <div className="board-message" role="alert">
        <p>Can&rsquo;t reach the leaderboard right now.</p>
        <button type="button" className="board-retry" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  } else {
    const view = toBoardView(state.data)
    body =
      view.rows.length === 0 ? (
        <div className="board-message">
          <p>No scores yet. Be the first to pop!</p>
        </div>
      ) : (
        <>
          <div className="board-scroll">
            <ol className="board-list">
              {view.rows.map((row, index) => (
                <Row key={row.key} row={row} index={index} medals={medals} />
              ))}
            </ol>
            {variant === 'portrait' && <span className="board-fade" aria-hidden />}
          </div>
          {view.pinned && (
            <ul className="board-pinned">
              <Row row={view.pinned} medals={medals} />
            </ul>
          )}
        </>
      )
  }

  return (
    <section
      className={`board board-${variant}${animate ? ' board-animate' : ''}${dense ? ' board-dense' : ''}`}
      aria-label={heading === DEFAULT_HEADING ? 'Top 10 leaderboard' : heading}
    >
      <h2 className="board-heading">{heading}</h2>
      <div className="board-body">
        {body}
      </div>
    </section>
  )
}
