import type { Layout } from '../ui/layout'
import PearlButton from '../ui/PearlButton'
import Scene from '../ui/Scene'

/** Placeholder until the gameplay screen lands in the next PR. */
export default function GameStub({ layout, onBack }: { layout: Layout; onBack: () => void }) {
  return (
    <Scene layout={layout} screen="start">
      <div className="stub">
        <p className="stub-text">The dive starts here in the next update.</p>
        <PearlButton variant="cream" width={200} height={64} fontSize={26} onClick={onBack}>
          BACK
        </PearlButton>
      </div>
    </Scene>
  )
}
