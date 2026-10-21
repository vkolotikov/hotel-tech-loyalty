import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import type { BrandRef } from '../lib/types'
import { brandInitials } from './shellMath'
import { SideMenu } from './SideMenu'

const ITEM = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-a-text hover:bg-a-surface-2 focus-visible:bg-a-surface-2'

/** A brand's chip: its logo, else (none, or one that cannot be loaded) its initials on the brand colour. */
function Chip({ brand }: { brand: BrandRef | null }) {
  const [broken, setBroken] = useState<string | null>(null)
  return brand?.logo_url && broken !== brand.logo_url
    ? <img src={brand.logo_url} alt="" onError={() => setBroken(brand.logo_url)} className="h-7 w-7 shrink-0 rounded-lg object-cover" />
    : <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-a-accent text-xs font-semibold text-a-accent-ink">{brandInitials(brand?.name ?? '')}</span>
}

/**
 * The top bar's start (spec 2026-10-21 §4.2): the brand's chip and name — a menu of the brands when the person may use
 * more than one — then "/" and the page. A long name is cut, never pushing Find or the bell off the bar.
 */
export function BrandCrumb({ brand, brands, page, onChoose }: {
  brand: BrandRef | null
  brands: BrandRef[]
  page: string
  onChoose: (id: number) => void
}) {
  const { t } = useTranslation()
  const name = <span className="min-w-0 truncate text-sm font-semibold text-a-text">{brand?.name}</span>
  return (
    <nav aria-label={t('content.shell.breadcrumb', 'Breadcrumb')} className="flex min-w-0 items-center gap-2">
      {brands.length > 1 ? (
        <SideMenu label={t('content.shell.brand', 'Brand')} kind="menu" place="down" listClassName="w-64" wrapClassName="min-w-0"
          buttonClassName="flex min-w-0 max-w-full items-center gap-2 rounded-lg px-1 py-1 hover:bg-a-surface-2"
          face={<><Chip brand={brand} />{name}<ChevronDown size={14} aria-hidden className="shrink-0 text-a-text-2" /></>}>
          {brands.map(b => (
            <button key={b.id} type="button" role="menuitem" tabIndex={-1} aria-current={b.id === brand?.id ? 'true' : undefined}
              onClick={() => onChoose(b.id)} className={`${ITEM} ${b.id === brand?.id ? 'font-semibold' : ''}`}>
              <Chip brand={b} /><span className="min-w-0 truncate">{b.name}</span>
            </button>
          ))}
        </SideMenu>
      ) : (
        <span className="flex min-w-0 items-center gap-2 px-1"><Chip brand={brand} />{name}</span>
      )}
      <span aria-hidden className="text-a-text-2">/</span>
      <span aria-current="page" className="shrink-0 text-sm text-a-text">{page}</span>
    </nav>
  )
}
