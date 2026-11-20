import { useTranslation } from 'react-i18next'
import { failureOf } from '../lib/api'

const PREFIX = 'loyalty.physicalcards.'

export function usePhysicalCardWords() {
  const { t } = useTranslation()
  return (key: string, values?: Record<string, string | number>) => t(PREFIX + key, values)
}

const ERRORS = new Set(['bad_range', 'bad_uid', 'card_changed', 'card_elsewhere', 'card_in_use', 'card_number_exists', 'manager_only',
  'member_inactive', 'already_erased', 'invalid', 'staff_inactive', 'not_allowed', 'not_found', 'network'])

export function physicalCardError(error: unknown): { key: string; number: string } {
  const failure = failureOf(error)
  return {
    key: 'errors.' + (ERRORS.has(failure.code) ? failure.code : 'unknown'),
    number: typeof failure.extra.number === 'string' ? failure.extra.number : '',
  }
}
