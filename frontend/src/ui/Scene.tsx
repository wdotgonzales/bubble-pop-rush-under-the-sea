import type { CSSProperties, ReactNode } from 'react'
import { art } from './art'
import { DESIGN_SIZE, fitScale, type Layout, type ScreenId } from './layout'
import { useViewport } from './useViewport'

interface Props {
  layout: Layout
  screen: ScreenId
  children: ReactNode
}

/**
 * The backdrop plus a fixed-size stage, scaled to fit the window. Children are
 * positioned in design pixels. On a phone the picture covers the whole window;
 * on the desktop layout the picture is part of the stage, so artwork that has to
 * line up with the panels (the big shell) always does. When the window is a different
 * shape from the stage, the strips around it show a blurred copy of the same scene and
 * the stage picture fades into it, so there is no hard edge.
 */
export default function Scene({ layout, screen, children }: Props) {
  const { width, height } = useViewport()
  const design = DESIGN_SIZE[layout][screen]
  const scale = fitScale(width, height, design)

  const sceneStyle = {
    '--scene-bg': `url("${art.bgPortrait}")`,
    '--scene-bg-wide': `url("${art.bgLandscapeStart}")`,
  } as CSSProperties
  const stageStyle: CSSProperties = {
    width: design.width,
    height: design.height,
    transform: `translate(-50%, -50%) scale(${scale})`,
  }
  const stageBackground =
    layout === 'landscape' ? (screen === 'over' ? art.bgLandscapeOver : art.bgLandscapeStart) : null

  return (
    <div className="scene" data-layout={layout} data-screen={screen} style={sceneStyle}>
      <div className="stage" style={stageStyle}>
        {stageBackground && <img className="stage-bg" src={stageBackground} alt="" draggable={false} />}
        {children}
      </div>
    </div>
  )
}
