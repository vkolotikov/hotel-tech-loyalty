import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Notice } from '../../workspace/ui/Notice'

/** `fallback`: drawn in place of the notice where the page's own layout is wrong for it (the panel). */
interface Props { message: string; reload: string; fallback?: ReactNode; children: ReactNode }

/**
 * Catches a page that breaks while it renders, so the person sees the
 * portal's own notice and a way to reload — not the app-wide fallback in
 * English with the raw error. The shell keys it by the address, so another
 * page starts fresh. (The notice itself is the alert: danger notices carry
 * role="alert".)
 */
export class ContentErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('A Content page could not be shown', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback
    return (
      <div className="max-w-xl space-y-3 p-6">
        <Notice tone="danger">{this.props.message}</Notice>
        <button type="button" onClick={() => window.location.reload()}
          className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
          {this.props.reload}
        </button>
      </div>
    )
  }
}
