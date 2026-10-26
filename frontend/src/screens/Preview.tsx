import { useEffect, useState } from 'react'
import SoundProvider from '../audio/SoundProvider'
import { useSound } from '../audio/useSound'
import { chooseField } from '../game/field'
import { HUD_BAND_PX } from '../game/hud'
import { SAMPLE_BOARD } from '../previewData'
import type { Load } from '../state/types'
import type { Leaderboard } from '../types'
import type { Layout } from '../ui/layout'
import { usePickedLayout } from '../ui/usePickedLayout'
import GameOverScreen from './GameOverScreen'
import PlayScreen from './PlayScreen'
import StartScreen from './StartScreen'

function toCount(value: string | null, fallback: number): number {
  const parsed = Number(value)
  return value !== null && Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

function boardFor(name: string | null): Load<Leaderboard> {
  switch (name) {
    case 'loading':
      return { status: 'loading' }
    case 'error':
      return { status: 'error', message: 'preview' }
    case 'empty':
      return { status: 'ready', data: { entries: [], me: { rank: null, best_score: 0 } } }
    default:
      return { status: 'ready', data: SAMPLE_BOARD }
  }
}

/**
 * Design review: the screens with sample data and no network.
 *   ?preview=start | over | play   which screen (play runs a real round from &seed=, with no network)
 *   &layout=portrait | landscape   force a layout on any window
 *   &score=22&best=42&new=1   numbers on the game over screen
 *   &board=loading | error | empty   leaderboard states
 *   &notice=...&practice=1   the start screen's problem line and the practice link under it
 *   &settings=1   open the settings window on top of the screen
 */
export default function Preview({ params }: { params: URLSearchParams }) {
  return (
    <SoundProvider platform={null} ready={false}>
      {params.has('settings') && <OpenSettings />}
      <PreviewScreens params={params} />
    </SoundProvider>
  )
}

/** Opens the settings window as soon as it is drawn, for design review. */
function OpenSettings() {
  const { openSettings } = useSound()
  useEffect(() => {
    openSettings()
  }, [openSettings])
  return null
}

function PreviewScreens({ params }: { params: URLSearchParams }) {
  const forced = params.get('layout')
  const override: Layout | null = forced === 'portrait' || forced === 'landscape' ? forced : null
  const layout = usePickedLayout(override)
  const nothing = () => undefined
  // A round with no server: the field is chosen once, from the window it was opened in.
  const [field] = useState(() => chooseField(window.innerWidth, window.innerHeight, HUD_BAND_PX))

  if (params.get('preview') === 'play') {
    return (
      <PlayScreen
        round={{ seed: toCount(params.get('seed'), 12345), field_width: field.width, field_height: field.height }}
        onDone={nothing}
      />
    )
  }

  if (params.get('preview') === 'over') {
    return (
      <GameOverScreen
        layout={layout}
        score={toCount(params.get('score'), 22)}
        bestScore={toCount(params.get('best'), 42)}
        isNewBest={params.get('new') === '1'}
        board={boardFor(params.get('board'))}
        onPlayAgain={nothing}
        onShare={nothing}
        onRetryBoard={nothing}
      />
    )
  }

  return (
    <StartScreen
      layout={layout}
      bestScore={{ status: 'ready', data: toCount(params.get('best'), 42) }}
      onPlay={nothing}
      onPractice={params.get('practice') === '1' ? nothing : undefined}
      notice={params.get('notice')}
    />
  )
}
