// A local hardware transport. Loyalty reads and writes member records through its regular server endpoints.
const BRIDGE = 'http://127.0.0.1:17432/v1/reader'
const SESSION_KEY = 'loyalty:windows-reader'

const READER_STATES = ['waiting', 'no_reader', 'service', 'busy', 'unreadable'] as const
type ReaderState = (typeof READER_STATES)[number]
type PresentedCard = { state: 'card'; uid: string; presentation: string }
export type ReaderSnapshot = { state: ReaderState } | PresentedCard
export type WindowsReaderStatus = ReaderSnapshot['state'] | 'idle' | 'connecting' | 'offline'

export function parseReaderSnapshot(value: unknown): ReaderSnapshot | null {
  if (typeof value !== 'object' || value === null) return null
  const data = value as Record<string, unknown>
  if (data.version !== 1) return null
  const state = READER_STATES.find(status => status === data.state)
  if (state) return { state }

  const { uid, presentation } = data
  if (data.state !== 'card' || typeof uid !== 'string' || typeof presentation !== 'string'
    || ![8, 14, 16, 20].includes(uid.length) || !/^[\da-f]+$/i.test(uid)
    || presentation.length !== 32 || !/^[\da-f]+$/i.test(presentation)) return null
  return { state: 'card', uid, presentation }
}

export function newlyPresentedCard(snapshot: ReaderSnapshot, previous: string | null): PresentedCard | null {
  return snapshot.state === 'card' && snapshot.presentation !== previous ? snapshot : null
}

export function usedWindowsReader(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === '1' } catch { return false }
}

export function forgetWindowsReader() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* storage can be disabled */ }
}

/** Start from the connect button so the browser can ask to reach the companion app. */
export function watchWindowsReader(report: (snapshot: ReaderSnapshot | 'offline') => void): () => void {
  let stopped = false
  let reachable = false
  let request: AbortController | undefined
  let next: ReturnType<typeof setTimeout> | undefined
  const foreground = () => document.visibilityState !== 'hidden' && document.hasFocus()

  async function poll() {
    if (stopped) return
    if (!foreground()) {
      next = setTimeout(poll, 400)
      return
    }

    request = new AbortController()
    const timeout = setTimeout(() => request?.abort(), reachable ? 4000 : 30_000)
    try {
      const response = await fetch(BRIDGE, {
        signal: request.signal, headers: { 'X-HexaTech-Reader': '1' },
        credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      })
      const snapshot = response.ok ? parseReaderSnapshot(await response.json()) : null
      if (!snapshot) throw new Error('Reader response unavailable')
      if (stopped) return
      reachable = true
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* storage can be disabled */ }
      if (foreground()) report(snapshot)
      next = setTimeout(poll, 350)
    } catch {
      if (stopped) return
      report('offline')
      if (reachable) next = setTimeout(poll, 1500)
    } finally {
      clearTimeout(timeout)
      request = undefined
    }
  }

  void poll()
  return () => {
    stopped = true
    clearTimeout(next)
    request?.abort()
  }
}
