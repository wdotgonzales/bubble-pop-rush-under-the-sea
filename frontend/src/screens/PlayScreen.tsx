import { radiusAt } from '@shared/spawn.js'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSound } from '../audio/useSound'
import { Effects } from '../game/effects'
import { GameRound, type RoundEvents, type RoundResult } from '../game/engine'
import { fitField, toField, type FieldFit } from '../game/fit'
import { HUD_GAP_PX, HUD_PILL_PX } from '../game/hud'
import { isPearl, tintFor } from '../game/palette'
import { drawFrame, drawnPosition } from '../game/render'
import type { RoundStart } from '../types'
import { art } from '../ui/art'
import PearlButton from '../ui/PearlButton'
import SettingsButton from '../ui/SettingsButton'

interface Props {
  /** The round the server issued: its seed and the play field it uses. */
  round: Pick<RoundStart, 'seed' | 'field_width' | 'field_height'>
  /** The round is over; called once, a moment after the time runs out. */
  onDone: (result: RoundResult) => void
}

type Overlay = '3' | '2' | '1' | 'go' | 'paused' | 'time' | null

/** The score, timer and sound button need at least this much room side by side. */
const HUD_MIN_WIDTH_PX = 290

/** 3, 2, 1, then the round starts. */
const COUNTDOWN_STEP_MS = 600
const GO_SHOWN_MS = 550
/** "Time!" stays up this long before the game over screen. */
const TIME_UP_MS = 900
const URGENT_SECONDS = 5

/** The round on a canvas. The rules are in game/engine.ts and the drawing in game/render.ts. */
export default function PlayScreen({ round, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const scoreBoxRef = useRef<HTMLDivElement>(null)
  const scoreRef = useRef<HTMLSpanElement>(null)
  const timeBoxRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)

  const [overlay, setOverlay] = useState<Overlay>('3')

  // The loop below starts once per round, so it reads what changes between renders from here.
  const { engine, settingsOpen } = useSound()
  const latest = useRef({ settingsOpen, onDone })
  const resumeRound = useRef<() => void>(() => undefined)
  const interruptRound = useRef<() => void>(() => undefined)
  useEffect(() => {
    latest.current = { settingsOpen, onDone }
  })

  // Opening the settings window stops the round, like switching to another app does.
  useEffect(() => {
    if (settingsOpen) interruptRound.current()
  }, [settingsOpen])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // The canvas draws the score text in this font, so have it ready.
    void document.fonts?.load("40px 'Lilita One'").catch(() => undefined)

    const effects = new Effects()

    let shown: Overlay = '3'
    const show = (next: Overlay) => {
      if (next === shown) return
      shown = next
      setOverlay(next)
    }

    let doneTimer: number | undefined
    const field = { width: round.field_width, height: round.field_height }
    const events: RoundEvents = {
      onPop: (event) => {
        const at = drawnPosition(event.bubble, event.t)
        effects.pop(performance.now(), {
          tint: tintFor(event.bubble),
          x: at.x,
          y: at.y,
          radius: Math.max(radiusAt(event.bubble, event.t), 700),
          points: event.bubble.points,
          streak: event.streak,
        })
        engine.pop(event.streak, isPearl(event.bubble))
      },
      onMiss: (event) => effects.miss(performance.now(), event.x, event.y),
      onFinish: () => {
        show('time')
        engine.end()
        doneTimer = window.setTimeout(() => latest.current.onDone(game.result()), TIME_UP_MS)
      },
    }
    const game: GameRound = new GameRound(round.seed, events, undefined, field)

    let raf = 0
    let countdownStart: number | null = null
    let lastTick = -1
    let goUntil = 0
    let cssWidth = 0
    let cssHeight = 0
    let ratio = 1
    let fit: FieldFit = fitField(0, 0, 0, field.width, field.height)
    let hudBand = HUD_GAP_PX + HUD_PILL_PX
    let shownScore = -1
    let shownSeconds = -1

    resumeRound.current = () => {
      if (game.phase !== 'paused') return
      game.resume(performance.now())
      show(null)
    }

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      if (width === cssWidth && height === cssHeight && dpr === ratio) return
      cssWidth = width
      cssHeight = height
      ratio = dpr
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      // The score and timer get a strip of their own along the top (more than 12 px on a
      // phone with a notch), and the field is fitted into what is left, so a bubble never
      // sits behind them.
      const hud = hudRef.current
      const top = hud ? parseFloat(getComputedStyle(hud).paddingTop) || 0 : 0
      hudBand = top + HUD_PILL_PX + HUD_GAP_PX
      fit = fitField(width, height, hudBand, field.width, field.height)
      // Line the HUD up with the playing column rather than the edges of a wide window.
      if (hud) {
        const hudWidth = Math.min(width, Math.max(fit.width, HUD_MIN_WIDTH_PX))
        hud.style.left = `${(width - hudWidth) / 2}px`
        hud.style.width = `${hudWidth}px`
      }
    }

    const updateHud = (now: number) => {
      if (game.score !== shownScore) {
        const grew = shownScore >= 0
        shownScore = game.score
        if (scoreRef.current) scoreRef.current.textContent = String(shownScore)
        const box = scoreBoxRef.current
        if (box && grew) {
          // Restart the little bounce.
          box.classList.remove('bump')
          void box.offsetWidth
          box.classList.add('bump')
        }
      }
      const seconds = Math.ceil(game.remaining(now) / 1000)
      if (seconds !== shownSeconds) {
        shownSeconds = seconds
        if (timeRef.current) timeRef.current.textContent = String(seconds)
        timeBoxRef.current?.classList.toggle('urgent', game.phase === 'running' && seconds <= URGENT_SECONDS)
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      resize()

      if (game.phase === 'ready') {
        if (latest.current.settingsOpen) {
          // The settings window is open: the countdown waits and starts again from 3.
          countdownStart = null
          lastTick = -1
          show('3')
        } else {
          countdownStart ??= now
          const step = Math.floor((now - countdownStart) / COUNTDOWN_STEP_MS)
          if (step >= 3) {
            game.start(now)
            goUntil = now + GO_SHOWN_MS
            show('go')
            engine.go()
          } else {
            show(String(3 - step) as Overlay)
            if (step !== lastTick) {
              lastTick = step
              engine.tick(3 - step)
            }
          }
        }
      } else {
        game.tick(now)
        if (shown === 'go' && now >= goUntil) show(null)
      }

      drawFrame({
        ctx,
        width: cssWidth,
        height: cssHeight,
        dpr: ratio,
        fit,
        now,
        roundMs: game.elapsed(now),
        hudBand,
        bubbles: game.visible(now),
        effects,
      })
      effects.prune(now)
      updateHud(now)
    }

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault()
      if (game.phase !== 'running') return
      const box = canvas.getBoundingClientRect()
      const at = toField(fit, event.clientX - box.left, event.clientY - box.top)
      game.tap(performance.now(), at.x, at.y)
    }

    // Switching apps or tabs, or opening the settings window, pauses the round. The time away is
    // never counted, and the player decides when to carry on. A countdown that was interrupted
    // starts again.
    const interrupt = () => {
      const now = performance.now()
      if (game.phase === 'running') {
        game.pause(now)
        if (game.isPaused) show('paused')
      } else if (game.phase === 'ready') {
        countdownStart = null
        lastTick = -1
        show('3')
      }
    }
    interruptRound.current = interrupt
    const onVisibility = () => {
      if (document.hidden) interrupt()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(doneTimer)
      canvas.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('visibilitychange', onVisibility)
      resumeRound.current = () => undefined
      interruptRound.current = () => undefined
    }
  }, [round.seed, round.field_width, round.field_height, engine])

  const sceneStyle = { '--scene-bg': `url("${art.bgPortrait}")` } as CSSProperties

  return (
    <div className="scene play-scene" data-layout="portrait" data-screen="play" style={sceneStyle}>
      <canvas ref={canvasRef} className="play-canvas" aria-label="The sea. Tap the bubbles to pop them." />

      <div ref={hudRef} className="hud">
        <div ref={scoreBoxRef} className="hud-pill hud-score">
          <span className="hud-label">Score</span>
          <span ref={scoreRef} className="hud-value">
            0
          </span>
        </div>
        <div ref={timeBoxRef} className="hud-pill hud-time">
          <span className="hud-label">Time</span>
          <span ref={timeRef} className="hud-value">
            30
          </span>
        </div>
        <SettingsButton size={46} />
      </div>

      {overlay === 'paused' ? (
        <div className="play-overlay play-overlay-dim" role="dialog" aria-label="Paused">
          <p className="play-word">Paused</p>
          <PearlButton variant="cream" font="roboto" glow="strong" width={240} height={72} fontSize={28} onClick={() => resumeRound.current()}>
            CONTINUE
          </PearlButton>
        </div>
      ) : (
        overlay && (
          <div className="play-overlay" aria-hidden>
            <p key={overlay} className={overlay === 'time' || overlay === 'go' ? 'play-word' : 'play-count'}>
              {overlay === 'go' ? 'Go!' : overlay === 'time' ? 'Time!' : overlay}
            </p>
          </div>
        )
      )}
    </div>
  )
}
