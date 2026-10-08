import { Component, type ReactNode } from 'react'

interface State {
  hasError: boolean
}

/** Last resort so an unexpected render error anywhere shows a plain
 * message instead of a blank page — important offline, where a failed
 * chunk fetch or a missing cached file is more likely than usual. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-crash-fallback" role="alert">
          <h1>Something went wrong</h1>
          <p>This page could not be shown. If you're offline, some content may not be saved on this device yet.</p>
          <button className="button button--primary" type="button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}
