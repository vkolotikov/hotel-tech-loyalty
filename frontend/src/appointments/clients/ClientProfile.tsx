import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { appointmentsApi, failureOf } from '../lib/api'
import { useVocab } from '../lib/vocab'
import { Notice } from '../ui/Notice'
import { ClientProfileView } from './ClientProfileView'

export function ClientProfile() {
  const { t, i18n } = useTranslation()
  const vocab = useVocab()
  const { id } = useParams()
  const clientId = id && /^\d+$/.test(id) ? Number(id) : null

  const query = useQuery({
    queryKey: ['appointments', 'client', clientId],
    queryFn: () => appointmentsApi.client(clientId!),
    enabled: clientId !== null,
  })

  return (
    <div>
      <div className="px-6 pt-4">
        <Link to="/appointments/clients" className="text-sm font-semibold text-a-accent-deep underline-offset-2 hover:underline">← {vocab('clients')}</Link>
      </div>
      {query.isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {(clientId === null || query.isError) && (
        <div className="p-6 max-w-xl">
          <Notice tone="danger">
            {clientId !== null && failureOf(query.error).code !== 'client_not_found'
              ? t('appointments.common.error', 'Something went wrong. Please try again.')
              : t('appointments.client.not_found', 'This client no longer exists.')}
          </Notice>
        </div>
      )}
      {query.data && <ClientProfileView profile={query.data} locale={i18n.language || 'en'} />}
    </div>
  )
}
