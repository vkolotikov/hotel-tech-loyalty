import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { useToast } from '../ui/Toast'
import { useLeadChanged } from '../leads/leadData'
import { fulfilmentLabel } from './dealWords'

/** Change a deal's fulfilment step (`PATCH deals/{id}/stage`). */
export function useStep() {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const stage = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) => send('patch', `deals/${id}/stage`, { stage: next }),
    onSuccess: (_r, { next }) => { changed(); toast(t('crm.deals.deal_moved', 'Now: {{step}}', { step: fulfilmentLabel(t, next) })) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  return { set: (id: number, next: string) => stage.mutate({ id, next }), busy: (id: number) => stage.isPending && stage.variables?.id === id }
}

export type Step = ReturnType<typeof useStep>
