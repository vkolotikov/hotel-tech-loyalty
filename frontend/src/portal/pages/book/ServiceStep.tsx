import { useTranslation } from 'react-i18next'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { Money } from '../../ui/Money'
import type { Catalogue, CatalogueService } from '../../lib/types'

/** The member's own catalogue: grouped by category, member price shown next to the list price. */
export function ServiceStep({ catalogue, onPick }: { catalogue: Catalogue; onPick: (serviceId: number) => void }) {
  const { t } = useTranslation()
  const groups = catalogue.categories.map(c => ({ ...c, services: catalogue.services.filter(s => s.category_id === c.id) })).filter(g => g.services.length)
  const orphans = catalogue.services.filter(s => !catalogue.categories.some(c => c.id === s.category_id))
  if (orphans.length) groups.push({ id: 0, name: '', slug: '', description: null, icon: null, image: null, color: null, services: orphans })
  const currency = catalogue.rules.currency
  return (
    <div className="space-y-6">
      {/* The step's heading: Book moves focus here after a step change (steps.ts's `focusTargetFor`). Visually
          hidden — the step strip above already shows where the member is. */}
      <h2 tabIndex={-1} data-step-heading="service" className="sr-only">{t('portal.book.heading_service', 'What would you like to book?')}</h2>
      {catalogue.pricing.automatic && <Chip tone="accent">{t('portal.book.member_price_note', '{{label}} applied', { label: catalogue.pricing.automatic.label })}</Chip>}
      {groups.map(g => (
        <section key={g.id} className="space-y-3">
          {g.name && <h2 className="font-p-display text-xl">{g.name}</h2>}
          {g.services.map(s => <ServiceCard key={s.id} service={s} currency={s.currency ?? currency} onPick={onPick} />)}
        </section>
      ))}
    </div>
  )
}

function ServiceCard({ service: s, currency, onPick }: { service: CatalogueService; currency: string; onPick: (id: number) => void }) {
  const { t } = useTranslation()
  const discounted = s.member_price < s.price
  return (
    <Card>
      <button
        type="button"
        className="w-full text-left flex items-start justify-between gap-4 min-h-[44px] p-4 rounded-p-card"
        onClick={() => onPick(s.id)}
      >
        <span>
          <span className="block font-medium">{s.name}</span>
          {s.short_description && <span className="block text-sm text-p-text-2 mt-0.5">{s.short_description}</span>}
          <span className="block text-xs text-p-text-2 mt-1">{t('portal.book.duration', '{{count}} min', { count: s.duration_minutes })}</span>
        </span>
        <span className="text-right shrink-0">
          {/* The struck list price and the "… applied" chip above say "your price" already; the labels are for screen readers. */}
          {discounted && <span className="block text-xs text-p-text-2 line-through"><span className="sr-only">{t('portal.book.list_price', 'List price')}</span><Money amount={s.price} currency={currency} /></span>}
          <span className="block font-p-display text-lg">{discounted && <span className="sr-only">{t('portal.book.your_price', 'Your price')}</span>}<Money amount={s.member_price} currency={currency} /></span>
        </span>
      </button>
    </Card>
  )
}
