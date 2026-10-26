import type { BoardRow } from '../state/leaderboardView'
import { toBoardView } from '../state/leaderboardView'
import type { Load } from '../state/types'
import type { Leaderboard as LeaderboardData } from '../types'
import type { Layout } from './layout'

interface Props {
  state: Load<LeaderboardData>
  variant: Layout
  onRetry: () => void
}

function Row({ row }: { row: BoardRow }) {
  const classes = ['board-row']
  if (row.isLeader) classes.push('board-row-leader')
  if (row.isMe) classes.push('board-row-me')
  return (
    <li className={classes.join(' ')}>
      <span className="rank-badge" data-wide={row.rank > 99 ? 'true' : undefined}>
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
export default function Leaderboard({ state, variant, onRetry }: Props) {
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
              {view.rows.map((row) => (
                <Row key={row.key} row={row} />
              ))}
            </ol>
            {variant === 'portrait' && <span className="board-fade" aria-hidden />}
          </div>
          {view.pinned && (
            <ul className="board-pinned">
              <Row row={view.pinned} />
            </ul>
          )}
        </>
      )
  }

  return (
    <section className={`board board-${variant}`} aria-label="Top 10 leaderboard">
      <h2 className="board-heading">Top-10 Leaderboard</h2>
      <div className="board-body">
        {body}
      </div>
    </section>
  )
}
