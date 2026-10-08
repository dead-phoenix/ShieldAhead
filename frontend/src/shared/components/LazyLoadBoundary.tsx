import { Component, type ReactNode } from 'react'

interface LazyLoadBoundaryProps {
  children: ReactNode
  /** Shown in place of the failed section — the rest of the page keeps
   * working normally, since only this boundary's subtree unmounts. */
  fallback: ReactNode
}

interface LazyLoadBoundaryState {
  failed: boolean
}

/**
 * Catches a lazy-loaded chunk failing to fetch (e.g. offline, with nothing
 * cached for it yet) so it takes down only this one section, not the whole
 * page. Same pattern MapLoadBoundary already used for the map, generalised
 * so every lazy() call site can use it.
 */
export class LazyLoadBoundary extends Component<LazyLoadBoundaryProps, LazyLoadBoundaryState> {
  state: LazyLoadBoundaryState = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}
