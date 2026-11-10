import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { ConfirmDialog } from '../ui/formParts'
import { afterProgramChange, programApi } from './api'
import { ERRORS } from './errors'
import type { Tier, TierBenefit } from './types'

export function TakeOff({ tier, tb, onClose, onDone = onClose }: { tier: Tier; tb: TierBenefit; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => programApi.detachBenefit(tier.id, tb.id),
    onSuccess: () => { afterProgramChange(client, { benefits: true }); onDone() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterProgramChange(client, { benefits: true }) },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  return (
    <ConfirmDialog native title={t('loyalty.program.take_off.title', 'Take {{benefit}} off {{tier}}?', { benefit: tb.name, tier: tier.name })}
      confirm={t('loyalty.program.take_off.confirm', 'Take it off')} keep={t('loyalty.program.take_off.keep', 'Keep it')}
      busy={remove.isPending} failure={failure && t(...refusalKey('loyalty.program', ERRORS, 'tier_benefit', failure))}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('loyalty.program.take_off.body', 'Members of {{tier}} stop seeing it in the app and the portal. Requests they already made stay as they are.', { tier: tier.name })}</p>
    </ConfirmDialog>
  )
}
