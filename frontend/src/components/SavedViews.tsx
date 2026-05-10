import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { Bookmark, BookmarkPlus, X, Star, StarOff } from 'lucide-react'

/**
 * Per-user pinned filter combinations for any list page. Today the
 * Sales Pipeline page uses it; Phase 4 will hang Tasks and Reservations
 * off the same component by passing a different `page` prop.
 *
 * The view's `filters` JSON is whatever the host page deems is its
 * filter state. The component is dumb about its shape — it stores
 * verbatim and hands it back via `onApply`.
 */

export interface SavedView {
  id: number
  name: string
  page: string
  filters: Record<string, any>
  is_pinned: boolean
  sort_order: number
}

interface Props<F> {
  page: string
  currentFilters: F
  /** True when at least one filter is non-default — enables the Save button. */
  hasActiveFilters: boolean
  /** Apply a saved view's filters back onto the page state. */
  onApply: (filters: F) => void
}

export function SavedViews<F extends Record<string, any>>({
  page, currentFilters, hasActiveFilters, onApply,
}: Props<F>) {
  const qc = useQueryClient()
  const [savingName, setSavingName] = useState<string | null>(null)

  const { data: views } = useQuery<SavedView[]>({
    queryKey: ['saved-views', page],
    queryFn: () => api.get('/v1/admin/saved-views', { params: { page } }).then(r => r.data),
  })

  const create = useMutation({
    mutationFn: () => api.post('/v1/admin/saved-views', {
      page,
      name: savingName,
      filters: currentFilters,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-views', page] })
      toast.success('View saved')
      setSavingName(null)
    },
    onError: () => toast.error('Could not save'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/saved-views/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-views', page] })
      toast.success('Removed')
    },
  })

  const togglePin = useMutation({
    mutationFn: ({ id, is_pinned }: { id: number; is_pinned: boolean }) =>
      api.put(`/v1/admin/saved-views/${id}`, { is_pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-views', page] }),
  })

  const pinned = (views ?? []).filter(v => v.is_pinned)
  const unpinned = (views ?? []).filter(v => !v.is_pinned)

  if (!views?.length && !hasActiveFilters) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {pinned.map(v => (
        <ViewChip
          key={v.id}
          view={v}
          onApply={() => onApply(v.filters as F)}
          onUnpin={() => togglePin.mutate({ id: v.id, is_pinned: false })}
          onDelete={() => {
            if (window.confirm(`Delete view "${v.name}"?`)) remove.mutate(v.id)
          }}
        />
      ))}

      {unpinned.length > 0 && (
        <UnpinnedDropdown
          views={unpinned}
          onApply={(v) => onApply(v.filters as F)}
          onPin={(id) => togglePin.mutate({ id, is_pinned: true })}
          onDelete={(id) => remove.mutate(id)}
        />
      )}

      {hasActiveFilters && (
        savingName !== null ? (
          <div className="flex items-center gap-1 bg-dark-bg border border-accent/40 rounded-lg pl-2 pr-1 py-0.5">
            <input
              value={savingName}
              onChange={e => setSavingName(e.target.value)}
              placeholder="View name"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && savingName.trim()) create.mutate()
                if (e.key === 'Escape') setSavingName(null)
              }}
              className="bg-transparent border-0 text-xs text-white placeholder-t-secondary outline-none w-32"
            />
            <button
              onClick={() => savingName.trim() && create.mutate()}
              disabled={!savingName.trim() || create.isPending}
              className="text-xs font-bold text-accent hover:text-accent/80 disabled:opacity-40 px-1.5"
            >
              Save
            </button>
            <button
              onClick={() => setSavingName(null)}
              className="p-1 text-t-secondary hover:text-white"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSavingName('')}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-dark-border text-xs text-t-secondary hover:text-white hover:border-accent/40"
            title="Save current filters as a view"
          >
            <BookmarkPlus size={11} /> Save view
          </button>
        )
      )}
    </div>
  )
}

function ViewChip({ view, onApply, onUnpin, onDelete }: {
  view: SavedView
  onApply: () => void
  onUnpin: () => void
  onDelete: () => void
}) {
  return (
    <div className="group flex items-center bg-dark-bg border border-dark-border rounded-lg overflow-hidden hover:border-accent/40 transition">
      <button
        onClick={onApply}
        className="flex items-center gap-1.5 pl-2.5 pr-2 py-1 text-xs font-semibold text-white hover:bg-dark-surface2"
      >
        <Bookmark size={11} className="text-accent" />
        {view.name}
      </button>
      <div className="opacity-0 group-hover:opacity-100 transition flex items-center border-l border-dark-border">
        <button
          onClick={onUnpin}
          className="p-1.5 text-t-secondary hover:text-white"
          title="Unpin"
        >
          <StarOff size={10} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-t-secondary hover:text-red-400"
          title="Delete view"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  )
}

function UnpinnedDropdown({ views, onApply, onPin, onDelete }: {
  views: SavedView[]
  onApply: (v: SavedView) => void
  onPin: (id: number) => void
  onDelete: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2 py-1 rounded-lg border border-dark-border text-xs text-t-secondary hover:text-white hover:border-accent/40"
      >
        +{views.length} more
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 w-56 bg-dark-surface border border-dark-border rounded-lg shadow-2xl z-30 overflow-hidden"
          onMouseLeave={() => setOpen(false)}
        >
          {views.map(v => (
            <div key={v.id} className="group flex items-center hover:bg-dark-surface2">
              <button
                onClick={() => { onApply(v); setOpen(false) }}
                className="flex-1 text-left px-3 py-2 text-xs text-white"
              >
                {v.name}
              </button>
              <button
                onClick={() => onPin(v.id)}
                className="p-2 text-t-secondary opacity-0 group-hover:opacity-100 hover:text-amber-300"
                title="Pin"
              >
                <Star size={11} />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete view "${v.name}"?`)) onDelete(v.id)
                }}
                className="p-2 text-t-secondary opacity-0 group-hover:opacity-100 hover:text-red-400"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
