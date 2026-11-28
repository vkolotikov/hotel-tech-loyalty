import { useQueryClient } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../CrmProvider'
import { setBrand } from '../lib/brand'

export function KnowledgeBrandPicker({ value, beforeChange, disabled }: {
  value: number | null
  beforeChange?: () => boolean
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const { brands = [] } = useBoot()
  const cache = useQueryClient()
  if (brands.length < 2) return null
  return (
    <label className="flex max-w-full items-center gap-2 rounded-xl border border-a-border bg-a-surface-2 px-3 py-2 text-sm">
      <Layers size={16} aria-hidden className="shrink-0 text-a-accent-text" />
      <span className="font-medium text-a-text-2">{t('crm.wizard.brand')}</span>
      <select className="min-w-0 max-w-60 rounded bg-a-surface-2 font-semibold text-a-text focus-visible:outline-2 focus-visible:outline-a-accent"
        value={value ?? ''} disabled={disabled} onChange={event => {
          const id = Number(event.target.value)
          if (!brands.some(b => b.id === id) || beforeChange?.() === false) return
          setBrand(id)
          void cache.resetQueries()
        }}>
        {value === null && <option value="" disabled>{t('crm.shell.brand_choose', 'Choose a brand')}</option>}
        {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </select>
    </label>
  )
}
