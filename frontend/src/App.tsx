import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL } from './config'
import { describeError, runDiagnostics, type Step } from './diagnostics'
import { createServices } from './services'

const MARK: Record<Step['status'], string> = { pending: '·', running: '…', ok: '✓', error: '✗' }
const COLOR: Record<Step['status'], string> = {
  pending: 'text-slate-400',
  running: 'text-sky-300',
  ok: 'text-emerald-300',
  error: 'text-rose-300',
}

// Starts a diagnostic run and reports back. Never throws: a failure while setting
// up (for example, no Facebook SDK) is shown as a failed step like any other.
function execute(onSteps: (steps: Step[]) => void, onDone: () => void) {
  let services
  try {
    services = createServices()
  } catch (error) {
    onSteps([{ id: 'setup', label: 'Set up', status: 'error', detail: describeError(error) }])
    onDone()
    return
  }
  void runDiagnostics(services, onSteps).finally(onDone)
}

/**
 * Temporary home screen: a connection check. It walks the real path (platform,
 * backend, sign-in, round) so a staged Facebook build can be verified end to end.
 * The game screens replace it in the next PRs.
 */
export default function App() {
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(true)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    execute(setSteps, () => setRunning(false))
  }, [])

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-4 p-4 font-mono text-sm">
      <h1 className="text-lg font-bold">Bubble Pop Rush: connection check</h1>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-300">
        <dt>Origin</dt>
        <dd className="break-all">{window.location.origin}</dd>
        <dt>API</dt>
        <dd className="break-all">{API_BASE_URL}</dd>
      </dl>

      <ol className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.id} className="rounded border border-slate-700 p-2">
            <span className={`mr-2 font-bold ${COLOR[step.status]}`}>{MARK[step.status]}</span>
            {step.label}
            {step.detail && <p className="mt-1 break-words text-slate-300">{step.detail}</p>}
          </li>
        ))}
      </ol>

      <button
        type="button"
        disabled={running}
        onClick={() => {
          setRunning(true)
          execute(setSteps, () => setRunning(false))
        }}
        className="min-h-12 rounded bg-sky-600 px-4 py-2 font-bold disabled:opacity-50"
      >
        {running ? 'Checking…' : 'Check again'}
      </button>
    </main>
  )
}
