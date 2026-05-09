import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, ChevronRight } from 'lucide-react'
import { useBrandStore } from '../stores/brandStore'

/**
 * Wrapper for brand-scoped admin pages (chatbot config, knowledge base,
 * widget appearance, popup rules, …). When the user has more than one
 * brand AND has "All brands" selected, render a clear empty state asking
 * them to pick a brand instead of silently showing one brand's data.
 *
 * Single-brand orgs are transparent — `currentBrandId` is null but the
 * only brand IS the default brand, so the backend resolves correctly and
 * we render the children straight through.
 *
 * Multi-brand orgs in "All brands" mode hit the empty state. The user
 * picks a brand from the top-bar switcher; once selected, this wrapper
 * becomes transparent again.
 */
export function BrandRequired({
  children,
  feature = 'this configuration',
}: {
  children: ReactNode
  /** What the user is trying to configure — used in the empty-state copy. */
  feature?: string
}) {
  const { brands, currentBrandId, setCurrentBrand } = useBrandStore()
  const navigate = useNavigate()

  const ambiguous = brands.length > 1 && currentBrandId === null
  if (!ambiguous) return <>{children}</>

  return (
    <div className="flex items-start justify-center pt-12 pb-24">
      <div className="max-w-md w-full bg-dark-surface border border-dark-border rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center mx-auto mb-4">
          <Briefcase size={22} className="text-accent" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Pick a brand to configure</h2>
        <p className="text-sm text-t-secondary mb-6 leading-relaxed">
          {feature.charAt(0).toUpperCase() + feature.slice(1)} is set per brand.
          Choose which brand to manage from the list below — you can switch back
          to portfolio view anytime from the top bar.
        </p>

        <div className="space-y-1.5 text-left">
          {brands.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => setCurrentBrand(b.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-surface2 transition-colors text-left"
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: b.primary_color ?? 'rgba(255,255,255,0.06)' }}
              >
                <Briefcase size={13} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{b.name}</p>
                <p className="text-[11px] text-t-secondary truncate font-mono">/{b.slug}</p>
              </div>
              <ChevronRight size={14} className="text-t-secondary flex-shrink-0" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => navigate('/brands')}
          className="mt-5 text-xs text-t-secondary hover:text-white transition-colors"
        >
          Manage brands →
        </button>
      </div>
    </div>
  )
}
