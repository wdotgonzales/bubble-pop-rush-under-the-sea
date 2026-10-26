import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * The last safety net: if drawing a screen throws, show a plain message with a way out instead of
 * a blank page. A waiting score is not lost by this; it is written down before it is sent.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('The game stopped unexpectedly:', error)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="crash" role="alert">
        <p className="crash-text">Something went wrong.</p>
        <button type="button" className="crash-button" onClick={() => window.location.reload()}>
          Reload the game
        </button>
      </div>
    )
  }
}
