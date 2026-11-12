import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Layers } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { currentBrand, setBrand, showsSwitcher, type BrandChoice } from '../lib/brand'
import { resolveImage } from '../../lib/api'
import { Popover } from '../ui/Menu'

/**
 * Which brand the CRM shows (owner 2026-11-09): every brand of the organisation together, or one. It stands where the
 * organisation's name stood in the header, and only when there is more than one brand to choose from. Choosing one
 * remembers it on this device and asks again for everything on screen; the server decides what each brand shows.
 */
export function BrandSwitcher() {
  const { t } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const brands = boot.brands ?? []
  if (!showsSwitcher(brands)) return <span className="truncate text-a-text-2">{boot.organization.name}</span>

  const chosen: BrandChoice = boot.brand_id ?? (currentBrand() === 'all' ? 'all' : currentBrand())
  const brand = typeof chosen === 'number' ? brands.find(b => b.id === chosen) ?? null : null
  const name = brand ? brand.name : t('crm.shell.brand_all', 'All brands')
  const choose = (next: BrandChoice) => {
    if (next === chosen) return
    setBrand(next)
    void qc.resetQueries()
  }

  return (
    <Popover align="left" width="w-72" label={t('crm.shell.brand_label', 'Brand: {{name}}. Choose another', { name })}
      className="inline-flex min-h-8 max-w-56 items-center gap-1.5 rounded-lg px-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent"
      button={<><BrandMark brand={brand} /><span className="truncate">{name}</span><ChevronDown size={14} aria-hidden className="shrink-0" /></>}>
      <p className="px-2.5 pb-1.5 pt-1 text-xs text-a-text-2">{t('crm.shell.brand_line', 'What the CRM shows: every brand, or one of them.')}</p>
      <ul role="listbox" aria-label={t('crm.shell.brand_choose', 'Choose a brand')}>
        {boot.all_brands !== false && (
          <Option on={chosen === 'all'} onChoose={() => choose('all')}>
            <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-a-surface-2 text-a-text-2"><Layers size={13} /></span>
            <span className="min-w-0 flex-1 truncate">{t('crm.shell.brand_all', 'All brands')}</span>
          </Option>
        )}
        {brands.map(b => (
          <Option key={b.id} on={chosen === b.id} onChoose={() => choose(b.id)}>
            <BrandMark brand={b} />
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            {b.is_default && <span className="shrink-0 text-xs text-a-text-2">{t('crm.shell.brand_default', 'Main')}</span>}
          </Option>
        ))}
      </ul>
    </Popover>
  )
}

function Option({ on, onChoose, children }: { on: boolean; onChoose: () => void; children: ReactNode }) {
  return (
    <li role="option" aria-selected={on}>
      <button type="button" data-close="" onClick={onChoose}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${on ? 'bg-a-accent/10 font-medium text-a-text' : 'text-a-text hover:bg-a-surface-2'}`}>
        {children}
        {on && <Check size={15} aria-hidden className="shrink-0 text-a-accent-text" />}
      </button>
    </li>
  )
}

/** A brand's logo, else its initial on its colour; all brands have none. */
function BrandMark({ brand }: { brand: { name: string; color: string | null; logo: string | null } | null }) {
  if (!brand) return <Layers size={14} aria-hidden className="shrink-0" />
  const logo = resolveImage(brand.logo)
  if (logo) return <img src={logo} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" />
  return (
    <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-a-surface-2 text-xs font-semibold text-a-text"
      style={brand.color ? { boxShadow: `inset 0 -3px 0 ${brand.color}` } : undefined}>
      {brand.name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  )
}
