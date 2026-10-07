import { useTranslation } from 'react-i18next'
import type { ApiFailure } from '../lib/api'
import { Notice } from '../ui/Notice'

/** Why a setup save was refused: the server's field messages, a missing right, or a plain failure. */
export function FailureNotice({ failure }: { failure: ApiFailure | null }) {
  const { t } = useTranslation()
  if (!failure) return null
  const messages = Object.values(failure.fields ?? {}).flat()

  if (failure.code === 'not_allowed') return <Notice tone="danger">{failure.message || t('appointments.error.not_allowed')}</Notice>
  if (failure.code === 'deposits_unavailable') return <Notice tone="danger">{t('appointments.error.deposits_unavailable', failure.message)}</Notice>
  if (messages.length > 0) {
    return (
      <Notice tone="danger">
        <span>{t('appointments.setup.invalid', 'Please check what you entered:')}</span>
        <ul className="mt-1 list-disc pl-5">{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </Notice>
    )
  }
  return <Notice tone="danger">{failure.message || t('appointments.common.error', 'Something went wrong. Please try again.')}</Notice>
}
