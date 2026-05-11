import { Component } from 'react'
import type { ReactNode } from 'react'

/**
 * Catches stale-chunk failures from React.lazy() and auto-reloads
 * the page so the user picks up the new build.
 *
 * Why: every prod deploy hashes the JS chunks. If a user has the
 * admin SPA open in a tab and a new build lands while they're
 * sitting on /bookings, clicking "View" tries to lazy-load
 * `BookingDetail-OLD-HASH.js` — which no longer exists on the
 * server. The fetch 404s, React's Suspense stalls forever (it
 * has no error UI), and the user sees the URL change but the
 * page stays blank. This was the "View button sometimes doesn't
 * open the page" bug.
 *
 * Strategy:
 *   1. First failure → set a sessionStorage flag, hard-reload.
 *      The browser fetches index.html again, which has fresh
 *      chunk references in the <script> tags.
 *   2. If the user lands here AGAIN after the reload (sentinel
 *      already set), don't loop — show a real error message.
 *
 * Only chunk-load failures are auto-handled. Other render errors
 * fall through to a generic error UI so we don't swallow real
 * bugs as if they were stale-chunk issues.
 */

const SENTINEL_KEY = 'htl_chunk_reload_attempted'

interface State { error: Error | null }

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const msg = (err as Error)?.message ?? String(err)
  const name = (err as Error)?.name ?? ''
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  )
}

export class ChunkErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    if (!isChunkLoadError(error)) return

    // First failure: set sentinel + reload to pick up the new build.
    // If we already reloaded once and still failed, give up and
    // render the error UI instead of looping.
    try {
      const already = sessionStorage.getItem(SENTINEL_KEY)
      if (already) return
      sessionStorage.setItem(SENTINEL_KEY, String(Date.now()))
      window.location.reload()
    } catch {
      // sessionStorage unavailable (private browsing edge case)
      // — fall through to error UI.
    }
  }

  render() {
    const { error } = this.state
    if (!error) {
      // Healthy path — clear the reload sentinel so a later chunk
      // error in this session gets ONE reload attempt of its own,
      // not lumped in with a previous one.
      try { sessionStorage.removeItem(SENTINEL_KEY) } catch {}
      return this.props.children
    }

    // Chunk error after a prior reload attempt → real error UI.
    if (isChunkLoadError(error)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
          <div className="max-w-md text-center">
            <h2 className="text-xl font-bold text-white mb-2">App updated — please reload</h2>
            <p className="text-sm text-gray-500 mb-6">
              A new version of the dashboard is available. Reload to pick up the new files.
            </p>
            <button
              onClick={() => {
                try { sessionStorage.removeItem(SENTINEL_KEY) } catch {}
                window.location.reload()
              }}
              className="bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-md px-5 py-2 text-sm">
              Reload
            </button>
          </div>
        </div>
      )
    }

    // Unrelated error — generic fallback so we don't silently
    // swallow a real bug.
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
        <div className="max-w-md text-center">
          <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-4">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-md px-5 py-2 text-sm">
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
