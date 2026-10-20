import { useTranslation } from 'react-i18next'
import type { Person } from '../lib/types'

/** "Who posts it" (spec 2026-10-19 §4.1): Not set, then the people to choose from; the value is an id as text, '' for nobody. */
export function PosterSelect({ value, onChange, choices, className, invalid, loading }: {
  value: string
  onChange: (value: string) => void
  choices: Person[]
  className: string
  invalid?: boolean
  /** While the team loads: "Loading…", nothing to choose yet — not "Not set" for a post that has a poster (5A-2 review). */
  loading?: boolean
}) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <select value="" disabled aria-busy="true" onChange={() => {}} className={className}>
        <option value="">{t('content.common.loading', 'Loading…')}</option>
      </select>
    )
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className={className}>
      <option value="">{t('content.panel.fields.not_set', 'Not set')}</option>
      {choices.map(person => <option key={person.id} value={String(person.id)}>{person.name}</option>)}
    </select>
  )
}
