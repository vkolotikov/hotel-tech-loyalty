import { useTranslation } from 'react-i18next'
import { Briefcase, Check, LayoutGrid } from 'lucide-react'
import { resolveImage } from '../../lib/api'
import { useBrandStore } from '../../stores/brandStore'
import { useBrandSwitch } from '../../hooks/useBrandSwitch'

/**
 * STEP ONE OF THE BUILDER: WHICH BRAND'S PAGE IS THIS.
 *
 * A landing page is the most strictly per-brand thing in this product — one
 * page per brand, its own address, its own Property, its own photographs —
 * and the builder has always known that while never once saying it. The
 * brand was a dropdown in the app's top bar, three screens away from the
 * page it decides, and a tenant with two brands could spend ten minutes
 * writing a headline for the wrong one before finding out.
 *
 * So the brand becomes the first thing on the screen, above the wizard and
 * above the editor's tabs alike: whose page this is, and how to go to
 * another one.
 *
 * ONE SWITCHING IDIOM, NOT TWO. Every button here calls `useBrandSwitch`,
 * which is `BrandSwitcher.tsx`'s own recipe (set the store, then invalidate
 * every query) lifted into a hook the two share. A second hand-written copy
 * is how one of the two screens ends up leaving stale data on the page after
 * a switch.
 *
 * The switch itself needs nothing else from this component: `LandingPages`
 * mounts both the wizard and the editor with `key={currentBrandId ?? 'org'}`,
 * so the change of store value remounts whichever is showing, and neither
 * can carry one brand's in-progress edits into another's screen.
 *
 * A SINGLE-BRAND ORG STILL SEES ITS NAME, and that is deliberate: the top-bar
 * `BrandSwitcher` hides itself below two brands because it is a control with
 * nothing to control, but this is a STATEMENT before it is a control. "This
 * is Glamour Salon's page" is worth saying to everybody; only the row of
 * other brands is worth withholding.
 */
export function LandingBrandStep() {
  const { t } = useTranslation()
  const { brands, currentBrandId, currentBrand } = useBrandStore()
  const switchBrand = useBrandSwitch()

  const selected = currentBrand()

  // "All brands" (`null`) is a real selection in this store and a real state
  // for this screen: the wizard still renders in it, because the backend can
  // resolve the org's default brand for a page that does not exist yet, while
  // the editor sits behind `BrandRequired`, which asks for a brand first.
  //
  // It gets its own SENTENCE rather than its own name. "You are editing All
  // brands' page" is not English and, worse, is not true — a landing page
  // belongs to exactly one brand, and in this state the tenant has not said
  // which. The default brand is named, because that is the one the page would
  // actually be built for, and the buttons below are how they change it.
  const fallback = brands.find(b => b.is_default) ?? brands[0]

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3 min-w-0">
        {selected?.logo_url ? (
          <img
            src={resolveImage(selected.logo_url) ?? undefined}
            alt=""
            className="w-9 h-9 rounded-lg object-cover border border-dark-border shrink-0"
          />
        ) : (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border border-dark-border"
            style={{ background: selected?.primary_color ?? 'rgba(255,255,255,0.06)' }}
          >
            {selected
              ? <Briefcase size={15} className="text-white" />
              : <LayoutGrid size={15} className="text-t-secondary" />}
          </div>
        )}

        <div className="min-w-0">
          <span className="block text-[11px] font-mono uppercase tracking-[0.14em] text-primary-500">
            {t('landing_pages.brand_step.kicker', 'Step 1 — Brand')}
          </span>
          <p className="text-sm font-semibold text-white truncate mt-0.5">
            {selected
              ? t('landing_pages.brand_step.title', {
                name: selected.name,
                defaultValue: 'You are editing {{name}}’s page',
              })
              : t('landing_pages.brand_step.unchosen', {
                name: fallback?.name ?? '',
                defaultValue: 'Pick a brand — this page would be built for {{name}}',
              })}
          </p>
        </div>
      </div>

      {brands.length > 1 && (
        <div className="space-y-2 border-t border-dark-border pt-3">
          <p className="text-xs text-t-secondary leading-relaxed">
            {t(
              'landing_pages.brand_step.note',
              'Each brand has its own page, its own web address and its own photographs. Switch brand to work on another one.',
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            {brands.map(b => {
              const active = b.id === currentBrandId

              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => switchBrand(b.id)}
                  className={'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors outline-none '
                    + 'focus-visible:ring-2 focus-visible:ring-primary-500/40 '
                    + (active
                      ? 'border-primary-500 bg-primary-500/[0.08] text-white'
                      : 'border-dark-border bg-dark-bg text-t-secondary hover:border-primary-500/40 hover:text-white')}
                >
                  <span
                    aria-hidden
                    className="w-3 h-3 rounded-sm shrink-0 border border-white/15"
                    style={{ background: b.primary_color ?? 'rgba(255,255,255,0.12)' }}
                  />
                  <span className="truncate max-w-[12rem]">{b.name}</span>
                  {active && <Check size={13} className="text-primary-500 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
