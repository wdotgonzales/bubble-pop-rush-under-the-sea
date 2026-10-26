import { useEffect, useState } from 'react'
import { CARD_HEIGHT, CARD_WIDTH, renderShareCard } from '../share/shareCard'
import { art } from '../ui/art'

/** Design review: the share card exactly as it is sent, with its size in the corner. */
export default function CardPreview({ score }: { score: number }) {
  const [card, setCard] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void renderShareCard(score, art.turtleOver).then((url) => {
      if (current) setCard(url)
    })
    return () => {
      current = false
    }
  }, [score])

  if (!card) return null
  // A data URL is base64 text: three bytes of picture for every four characters after the header.
  const kilobytes = Math.round(((card.length - card.indexOf(',') - 1) * 3) / 4 / 1024)
  return (
    <div style={{ background: '#222', minHeight: '100vh', padding: 16 }}>
      <img src={card} width={CARD_WIDTH} height={CARD_HEIGHT} alt={`Share card for a score of ${score}`} />
      <p style={{ color: '#ddd', font: '14px system-ui' }}>
        {CARD_WIDTH} x {CARD_HEIGHT}, {kilobytes} KB
      </p>
    </div>
  )
}
