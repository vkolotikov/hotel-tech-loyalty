import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** One guard for the independent bonus and shared-rules drafts; only one options write can run at a time. */
export function useLeaveGuard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [resetVersion, setResetVersion] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, boolean>>({})
  const dirty = Object.values(drafts).some(Boolean)
  const [destination, setDestination] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const writing = useRef(false)
  const mark = useCallback((id: string, value: boolean) => setDrafts(old => old[id] === value ? old : { ...old, [id]: value }), [])
  const begin = () => { if (writing.current) return false; writing.current = true; setBusy(true); return true }
  const end = () => { writing.current = false; setBusy(false) }
  const go = (to: string) => { if (writing.current || to === location.pathname + location.search + location.hash) return; if (dirty) setDestination(to); else navigate(to) }
  useEffect(() => {
    if (!dirty && !busy) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const leaving = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!link || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href)
      if (url.origin !== window.location.origin || url.href === window.location.href) return
      e.preventDefault(); e.stopPropagation()
      if (!writing.current) setDestination(url.pathname + url.search + url.hash)
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', leaving, true)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', leaving, true) }
  }, [dirty, busy])
  return { dirty, busy, resetVersion, mark, begin, end, go, destination, keep: () => setDestination(null), discard: () => { if (!destination || writing.current) return; setResetVersion(v => v + 1); setDrafts({}); setDestination(null); navigate(destination) } }
}
export type EarnGuard = ReturnType<typeof useLeaveGuard>
