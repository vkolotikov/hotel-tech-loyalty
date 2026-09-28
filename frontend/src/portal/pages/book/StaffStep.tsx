import { useTranslation } from 'react-i18next'
import { Card } from '../../ui/Card'
import type { Catalogue } from '../../lib/types'
import { mastersFor } from './steps'

/** Who the member wants, or "anyone available"; skipped by `nextStep` when there is only one choice. */
export function StaffStep({ catalogue, serviceId, value, onPick }: { catalogue: Catalogue; serviceId: number | null; value: number | null; onPick: (masterId: number | null) => void }) {
  const { t } = useTranslation()
  const options = [{ id: null as number | null, name: t('portal.book.any_staff', 'Anyone available'), title: null as string | null }, ...mastersFor(catalogue, serviceId)]
  return (
    <div className="space-y-3">
      <h2 tabIndex={-1} data-step-heading="staff" className="font-p-display text-xl">{t('portal.book.choose_staff', "Choose who you'd like")}</h2>
      {options.map(m => (
        <Card key={String(m.id)}>
          <button
            type="button"
            aria-pressed={value === m.id}
            className={`w-full text-left min-h-[44px] flex items-center justify-between p-4 rounded-p-card ${value === m.id ? 'font-semibold' : ''}`}
            onClick={() => onPick(m.id)}
          >
            <span>{m.name}{m.title && <span className="block text-sm text-p-text-2">{m.title}</span>}</span>
          </button>
        </Card>
      ))}
    </div>
  )
}
