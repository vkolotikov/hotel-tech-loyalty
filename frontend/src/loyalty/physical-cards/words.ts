import { useTranslation } from 'react-i18next'
import { failureOf } from '../lib/api'

const PREFIX = 'loyalty.physicalcards.'

export function usePhysicalCardWords() {
  const { t } = useTranslation()
  return (key: string, values?: Record<string, string | number>) => t(PREFIX + key, values)
}

const ERRORS = new Set(['bad_range', 'bad_uid', 'card_changed', 'card_elsewhere', 'card_in_use', 'card_number_exists', 'manager_only',
  'member_inactive', 'already_erased', 'invalid', 'staff_inactive', 'not_allowed', 'not_found', 'network', 'tag_in_use'])

export function physicalCardError(error: unknown): { key: string; number: string; company: string } {
  const failure = failureOf(error)
  const company = typeof failure.extra.source_company === 'string' ? failure.extra.source_company : ''
  const code = failure.code === 'card_in_use' && failure.extra.tag_in_use === true ? 'tag_in_use' : failure.code
  return {
    key: 'errors.' + (code === 'card_elsewhere' && company ? 'card_elsewhere_named' : ERRORS.has(code) ? code : 'unknown'),
    number: typeof failure.extra.number === 'string' ? failure.extra.number : '',
    company,
  }
}
