interface Props {
  score: number
  width: number
  height: number
  fontSize: number
}

/** The pearl plate that shows the score of the round just played. */
export default function ScorePill({ score, width, height, fontSize }: Props) {
  return (
    <div className="score-pill" style={{ width, height }} role="status">
      <span className="score-pill-inset" aria-hidden />
      <span className="score-pill-reflection" aria-hidden />
      <span className="score-pill-text" style={{ fontSize }}>
        Your Score: {score}
      </span>
    </div>
  )
}
