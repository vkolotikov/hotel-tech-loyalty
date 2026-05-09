import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Briefcase, Check, ChevronDown, LayoutGrid, Plus, Settings2 } from 'lucide-react'
import { useBrandStore } from '../stores/brandStore'
import { resolveImage } from '../lib/api'

/**
 * Top-bar dropdown that lets the admin switch the active brand context.
 *
 * Hidden when the org has ≤1 brand (decision #5 in MULTI_BRAND_PLAN.md) —
 * single-brand orgs never see this UI element. The moment a 2nd brand is
 * created via Settings → Brands, the switcher appears on the next page load.
 *
 * Switching brand triggers a full react-query invalidation so every page
 * re-fetches its data scoped to the new brand. This is heavier than
 * cherry-picking specific query keys but it's correct without us having to
 * audit every page for which queries depend on brand context.
 */
export function BrandSwitcher() {
  const { brands, currentBrandId, setCurrentBrand, currentBrand } = useBrandStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on click-outside.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  // Hide entirely for single-brand orgs.
  if (brands.length <= 1) return null

  const selected = currentBrand()

  const switchTo = (id: number | null) => {
    if (id !== currentBrandId) {
      setCurrentBrand(id)
      // Heavy hammer: invalidate everything so all pages refetch with the
      // new brand context. Cheaper than maintaining a per-page allowlist.
      qc.invalidateQueries()
    }
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 max-w-[200px] px-2.5 py-1.5 rounded-lg hover:bg-dark-surface2 transition-colors text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {selected?.logo_url ? (
          <img
            src={resolveImage(selected.logo_url) ?? undefined}
            alt=""
            className="w-5 h-5 rounded-sm object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
            style={{ background: selected?.primary_color ?? 'rgba(255,255,255,0.08)' }}
          >
            {selected
              ? <Briefcase size={11} className="text-white" />
              : <LayoutGrid size={11} className="text-t-secondary" />
            }
          </div>
        )}
        <span className="truncate text-white font-medium">
          {selected?.name ?? 'All brands'}
        </span>
        <ChevronDown size={14} className="text-t-secondary flex-shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-72 bg-dark-surface border border-dark-border rounded-xl shadow-2xl overflow-hidden z-50"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-dark-border bg-dark-bg/40">
            <p className="text-[10px] uppercase tracking-wide text-t-secondary font-bold">Brand</p>
          </div>

          {/* "All brands" — portfolio view */}
          <button
            type="button"
            onClick={() => switchTo(null)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-dark-surface2 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-md bg-accent/10 border border-accent/30 flex items-center justify-center flex-shrink-0">
              <LayoutGrid size={14} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">All brands</p>
              <p className="text-[11px] text-t-secondary">Portfolio view across {brands.length} brands</p>
            </div>
            {currentBrandId === null && <Check size={15} className="text-accent flex-shrink-0" />}
          </button>

          <div className="border-t border-dark-border" />

          {/* Brand list */}
          <div className="max-h-72 overflow-y-auto">
            {brands.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => switchTo(b.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-dark-surface2 transition-colors text-left"
              >
                {b.logo_url ? (
                  <img
                    src={resolveImage(b.logo_url) ?? undefined}
                    alt=""
                    className="w-8 h-8 rounded-md object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: b.primary_color ?? 'rgba(255,255,255,0.06)' }}
                  >
                    <Briefcase size={14} className="text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                    {b.name}
                    {b.is_default && (
                      <span className="text-[9px] font-bold uppercase tracking-wide text-t-secondary bg-dark-surface2 px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-t-secondary truncate">/{b.slug}</p>
                </div>
                {currentBrandId === b.id && <Check size={15} className="text-accent flex-shrink-0" />}
              </button>
            ))}
          </div>

          <div className="border-t border-dark-border" />

          {/* Footer actions */}
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/brands') }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-dark-surface2 transition-colors text-sm text-t-secondary hover:text-white"
          >
            <Settings2 size={14} />
            Manage brands
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/brands?new=1') }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-dark-surface2 transition-colors text-sm text-accent border-t border-dark-border"
          >
            <Plus size={14} />
            New brand
          </button>
        </div>
      )}
    </div>
  )
}
