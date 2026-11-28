import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Confirm } from '../ui/Confirm'
import { useToast } from '../ui/Toast'
import { useLeadChanged } from './leadData'
import { impactOf } from './leadLogic'
import type { DeleteImpact } from './leadTypes'
import { impactLabel } from './leadWords'

/**
 * Delete a lead after saying what goes with it (`GET inquiries/{id}/delete-impact`, then `DELETE inquiries/{id}`); from
 * its own page the person lands on the list again, from its panel the panel closes (`onDeleted`).
 */
export function DeleteLead({ leadId, name, onClose, back = false, onDeleted }: { leadId: number; name: string; onClose: () => void; back?: boolean; onDeleted?: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const changed = useLeadChanged()
  const impact = useQuery({
    queryKey: ['crm', 'leads', 'delete-impact', leadId],
    queryFn: () => get<DeleteImpact>(`inquiries/${leadId}/delete-impact`),
    staleTime: 0,
  })
  const remove = useMutation({
    mutationFn: () => send('delete', `inquiries/${leadId}`),
    onSuccess: () => { changed(); toast(t('crm.leads.deleted', 'Lead deleted')); onClose(); onDeleted?.(); if (back) navigate('/crm/leads') },
  })
  const goes = impactOf(impact.data).filter(row => row.key !== 'reservations')
  const kept = impactOf(impact.data).find(row => row.key === 'reservations')
  return (
    <Confirm title={t('crm.leads.delete_title', 'Delete the lead for {{name}}?', { name })} confirm={t('crm.common.delete', 'Delete')}
      busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('crm.leads.delete_line', 'This cannot be undone. The contact stays.')}</p>
      {impact.isLoading && <p className="mt-2">{t('crm.common.loading', 'Loading…')}</p>}
      {goes.length > 0 && (
        <>
          <p className="mt-3 font-medium text-a-text">{t('crm.leads.delete_goes', 'Goes with it:')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {goes.map(row => <li key={row.key}>{impactLabel(t, row.key, row.count)}</li>)}
          </ul>
        </>
      )}
      {kept && <p className="mt-3">{impactLabel(t, kept.key, kept.count)}</p>}
      {remove.isError && <div className="mt-3"><Notice tone="danger">{errorText(t, remove.error)}</Notice></div>}
    </Confirm>
  )
}
