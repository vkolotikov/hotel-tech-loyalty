import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Search, X, Loader2, User, FileText, Briefcase, Hotel, Star, Crown,
} from 'lucide-react'
import { api } from '../lib/api'

/**
 * Cmd+K global search across guests, inquiries, corporate accounts,
 * reservations and loyalty members. Triggered by Cmd+K / Ctrl+K
 * anywhere in the app. Mounted once at the Layout root.
 *
 * Backend: GET /v1/admin/search/global?q=…&limit=5
 * Returns up to 5 results per source type, ordered intentionally
 * (customers first, then inquiries, then companies / reservations / members).
 *
 * Keyboard:
 *   - ↑ / ↓ to navigate
 *   - Enter to open
 *   - Esc to close
 */

type ResultType = 'customer' | 'inquiry' | 'company' | 'reservation' | 'member'

type Result = {
  type: ResultType
  id: number
  title: string
  subtitle: string
  badge: string | null
  url: string
}

const TYPE_META: Record<ResultType, { label: string; icon: any; color: string }> = {
  customer:    { label: 'Customer',    icon: User,      color: 'text-blue-400' },
  inquiry:     { label: 'Inquiry',     icon: FileText,  color: 'text-amber-400' },
  company:     { label: 'Company',     icon: Briefcase, color: 'text-purple-400' },
  reservation: { label: 'Reservation', icon: Hotel,     color: 'text-emerald-400' },
  member:      { label: 'Member',      icon: Crown,     color: 'text-primary-400' },
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Defense-in-depth: close the modal on any route change. The internal
  // navigate() call already closes via setOpen(false) on the result-click
  // path, but if some other code path navigates while the modal is open
  // (e.g. a programmatic redirect) the modal would otherwise stay mounted
  // with its z-50 fixed-inset backdrop sitting on top of the sidebar —
  // every nav click then closes the modal instead of routing, which
  // looks identical to "the menu is stuck".
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Cmd+K / Ctrl+K to open from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQ('')
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) {
      // Focus the input on next tick — needs the modal to be mounted first.
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Debounced query — only fire when the search term is 2+ chars and the
  // user has paused for 180ms.
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 180)
    return () => clearTimeout(t)
  }, [q])

  const { data, isFetching } = useQuery<{ results: Result[] }>({
    queryKey: ['global-search', debounced],
    queryFn: () => api.get('/v1/admin/search/global', { params: { q: debounced } }).then(r => r.data),
    enabled: open && debounced.trim().length >= 2,
    placeholderData: prev => prev,
  })

  const results = data?.results ?? []

  // Reset highlight when the result list changes.
  useEffect(() => { setActiveIdx(0) }, [results])

  // Arrow + enter navigation.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(i + 1, Math.max(0, results.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const r = results[activeIdx]
        if (r) {
          navigate(r.url)
          setOpen(false)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, results, activeIdx, navigate])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fixed top-[12vh] left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50 pointer-events-none">
        <div className="bg-dark-surface border border-dark-border rounded-2xl shadow-2xl overflow-hidden pointer-events-auto">
          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border">
            <Search size={16} className="text-gray-500" />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search customers, inquiries, companies, reservations…"
              className="flex-1 bg-transparent text-white placeholder-gray-600 outline-none text-sm"
              autoFocus
            />
            {isFetching ? <Loader2 size={13} className="animate-spin text-gray-500" /> : null}
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {q.trim().length < 2 ? (
              <div className="px-4 py-8 text-center text-xs text-t-secondary">
                Type at least 2 characters. <span className="text-gray-600">↑ ↓ Enter Esc</span>
              </div>
            ) : results.length === 0 && !isFetching ? (
              <div className="px-4 py-8 text-center text-xs text-t-secondary">
                Nothing matches "<span className="text-white">{q}</span>" yet.
              </div>
            ) : (
              <div className="py-1">
                {results.map((r, i) => {
                  const meta = TYPE_META[r.type] ?? TYPE_META.customer
                  const Icon = meta.icon
                  return (
                    <button
                      key={r.type + '-' + r.id}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => { navigate(r.url); setOpen(false) }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        activeIdx === i ? 'bg-primary-500/10' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/[0.04]`}>
                        <Icon size={13} className={meta.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate flex items-center gap-1.5">
                          <span className="truncate">{r.title}</span>
                          {r.badge === 'VIP' && <Star size={9} className="text-amber-400 flex-shrink-0" />}
                        </div>
                        {r.subtitle && <div className="text-[11px] text-gray-500 truncate">{r.subtitle}</div>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {r.badge && r.badge !== 'VIP' && (
                          <span className="text-[10px] text-t-secondary uppercase tracking-wider">{r.badge}</span>
                        )}
                        <span className="text-[9px] uppercase tracking-wider font-bold text-gray-600">{meta.label}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-dark-border bg-dark-surface2/40 flex items-center justify-between text-[10px] text-gray-600">
            <div><kbd className="font-mono px-1 py-0.5 rounded bg-white/5 text-gray-400">⌘K</kbd> to open</div>
            <div className="flex items-center gap-2">
              <kbd className="font-mono px-1 py-0.5 rounded bg-white/5 text-gray-400">↑↓</kbd> nav
              <kbd className="font-mono px-1 py-0.5 rounded bg-white/5 text-gray-400">↵</kbd> open
              <kbd className="font-mono px-1 py-0.5 rounded bg-white/5 text-gray-400">esc</kbd> close
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
