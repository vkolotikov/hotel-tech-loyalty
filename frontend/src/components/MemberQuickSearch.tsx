import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X, ArrowUp, ArrowDown, CornerDownLeft } from 'lucide-react'
import { api, resolveImage } from '../lib/api'
import { TierBadge } from './ui/TierBadge'

/**
 * Global Cmd+K (Ctrl+K on Windows / Linux) member quick-search.
 *
 * Mounted once at the Layout level. Listens for the chord globally so
 * staff can jump to any member from any admin page without leaving
 * what they were doing. Arrow keys + Enter for keyboard nav; Escape
 * to dismiss.
 *
 * The query hits the existing /v1/admin/members?search= endpoint
 * (debounced 200ms) — no new server work needed. It pages-1 so a
 * staffer searching "smith" sees the first ~20 results immediately.
 */
export function MemberQuickSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Global Cmd+K / Ctrl+K listener. Mounted once via Layout.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd-K / Ctrl-K opens
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
        return
      }
      // Escape closes
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Focus input when the modal mounts, reset state when it closes.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10)
    } else {
      setQ('')
      setDebouncedQ('')
      setHighlight(0)
    }
  }, [open])

  // Debounce so a 5k-member org doesn't get a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200)
    return () => clearTimeout(t)
  }, [q])

  const { data, isFetching } = useQuery({
    queryKey: ['quick-member-search', debouncedQ],
    queryFn: () => api.get('/v1/admin/members', { params: { search: debouncedQ, page: 1 } }).then(r => r.data),
    enabled: open && debouncedQ.length >= 2,
  })

  const results: any[] = (data?.data ?? []).slice(0, 8)

  const goTo = (m: any) => {
    setOpen(false)
    navigate(`/members/${m.id}`)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(results.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(0, h - 1))
    } else if (e.key === 'Enter' && results[highlight]) {
      e.preventDefault()
      goTo(results[highlight])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-3 border-b border-dark-border">
          <Search size={16} className="text-[#636366]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setHighlight(0) }}
            onKeyDown={onKeyDown}
            placeholder="Find a member by name, email, phone or number…"
            className="flex-1 bg-transparent text-white text-sm placeholder-[#636366] focus:outline-none"
          />
          <kbd className="text-[10px] text-[#636366] border border-dark-border rounded px-1.5 py-0.5">esc</kbd>
          <button onClick={() => setOpen(false)} className="text-[#636366] hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {debouncedQ.length < 2 ? (
            <div className="p-8 text-center text-sm text-[#636366]">
              Type at least 2 characters to search.
            </div>
          ) : isFetching && results.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#636366]">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#636366]">
              No members match "{debouncedQ}".
            </div>
          ) : (
            results.map((m, i) => {
              const active = i === highlight
              return (
                <button
                  key={m.id}
                  onClick={() => goTo(m)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-dark-border last:border-b-0 transition-colors ${active ? 'bg-dark-surface2' : 'hover:bg-dark-surface2'}`}
                >
                  {m.user?.avatar_url ? (
                    <img
                      src={resolveImage(m.user.avatar_url)!}
                      alt={m.user.name}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary-400">{m.user?.name?.charAt(0)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{m.user?.name}</div>
                    <div className="text-xs text-[#636366] truncate">
                      {m.user?.email || '—'} · #{m.member_number}
                    </div>
                  </div>
                  <TierBadge tier={m.tier?.name} color={m.tier?.color_hex} />
                  <div className="text-xs text-[#a0a0a0] font-semibold w-20 text-right">
                    {(m.current_points ?? 0).toLocaleString()} pts
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-3 px-3 py-2 border-t border-dark-border text-[11px] text-[#636366]">
          <span className="flex items-center gap-1"><ArrowUp size={10} /><ArrowDown size={10} /> navigate</span>
          <span className="flex items-center gap-1"><CornerDownLeft size={10} /> open</span>
          <span className="ml-auto">Cmd+K to toggle</span>
        </div>
      </div>
    </div>
  )
}
