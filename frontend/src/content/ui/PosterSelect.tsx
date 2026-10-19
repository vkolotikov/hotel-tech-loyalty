import { useTranslation } from 'react-i18next'
import type { Person } from '../lib/types'

/** "Who posts it" (spec 2026-10-19 §4.1): Not set, then the people to choose from; the value is an id as text, '' for nobody. */
export function PosterSelect({ value, onChange, choices, className, invalid }: {
  value: string
  onChange: (value: string) => void
  choices: Person[]
  className: string
  invalid?: boolean
}) {
  const { t } = useTranslation()
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className={className}>
      <option value="">{t('content.panel.fields.not_set', 'Not set')}</option>
      {choices.map(person => <option key={person.id} value={String(person.id)}>{person.name}</option>)}
    </select>
  )
}
