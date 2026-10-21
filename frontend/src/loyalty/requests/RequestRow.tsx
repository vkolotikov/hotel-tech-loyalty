import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../LoyaltyProvider'
import { failureOf, type ApiFailure } from '../lib/api'
import { errorKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { when } from '../lib/format'
import { memberPath } from '../lib/links'
import type { BenefitRequest } from '../lib/types'
import { RequestStateBadge } from '../ui/RequestStateBadge'
import { requestActions, type RequestAction } from './requestMath'

/**
 * One benefit request with what can be done to it from where it stands (spec 2026-10-21 §4.4): Approve or Decline
 * while it waits, Mark done or Decline once approved. Decline asks why. After any step — or a refusal, since someone
 * else may have acted first — the queue, the member's page and the side panel's count are read again.
 */
export function RequestRow({ request, showMember = true, compact = false }: {
  request: BenefitRequest
  showMember?: boolean
  /** In a narrow card (a member's page, Scan): the state and the steps under the words, not beside them. */
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const api = useApi()
  const queryClient = useQueryClient()
  const [declining, setDeclining] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['loyalty', 'requests'] })
    void queryClient.invalidateQueries({ queryKey: ['loyalty', 'bootstrap'] })
    if (request.member) void queryClient.invalidateQueries({ queryKey: ['loyalty', 'member', request.member.id] })
  }
  const step = useMutation({
    mutationFn: (action: Exclude<RequestAction, 'decline'>) => (action === 'approve' ? api.approve(request.id) : api.done(request.id)),
    onMutate: () => setFailure(null),
    onSuccess: refresh,
    onError: (error) => { setFailure(failureOf(error)); refresh() },
  })

  const actions = requestActions(request.state)
  return (
    <li data-request={request.id} className={compact ? 'space-y-2 px-5 py-3' : 'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3'}>
      <div className={compact ? 'min-w-0' : 'min-w-0 flex-1'}>
        <p className="font-medium text-a-text">{request.benefit?.name ?? t('loyalty.requests.unknown_benefit', 'A benefit no longer in the programme')}</p>
        <p className="text-xs text-a-text-2">
          {showMember && request.member && (
            <><Link to={memberPath(request.member.id)} className="text-a-accent-text hover:underline">{request.member.name || request.member.member_number}</Link>{' · '}</>
          )}
          {t('loyalty.requests.asked', 'Asked {{when}}', { when: when(request.asked_at, i18n.language, boot.venue.timezone) })}
          {request.decline_reason && request.state === 'declined' && <> · “{request.decline_reason}”</>}
        </p>
        {failure && <div className="mt-2"><Notice tone="danger">{t(...errorKey('requests', failure))}</Notice></div>}
      </div>
      <div className={compact ? 'flex flex-wrap items-center gap-2' : 'contents'}>
      <RequestStateBadge state={request.state} />
      {actions.length > 0 && (
        <div className={compact ? 'ml-auto flex gap-2' : 'flex gap-2'}>
          {actions.includes('approve') && <Button size="sm" loading={step.isPending && step.variables === 'approve'} disabled={step.isPending} onClick={() => step.mutate('approve')}>{t('loyalty.requests.approve', 'Approve')}</Button>}
          {actions.includes('done') && <Button size="sm" loading={step.isPending && step.variables === 'done'} disabled={step.isPending} onClick={() => step.mutate('done')}>{t('loyalty.requests.done', 'Mark done')}</Button>}
          {actions.includes('decline') && <Button size="sm" variant="secondary" disabled={step.isPending} onClick={() => setDeclining(true)}>{t('loyalty.requests.decline', 'Decline')}</Button>}
        </div>
      )}
      </div>
      {declining && <DeclineDialog request={request} onClose={() => setDeclining(false)} onDone={refresh} />}
    </li>
  )
}

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

function DeclineDialog({ request, onClose, onDone }: { request: BenefitRequest; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const first = useFirstFocus<HTMLInputElement>()
  const decline = useMutation({
    mutationFn: () => api.decline(request.id, reason.trim()),
    onSuccess: () => { onDone(); onClose() },
    onError: onDone,
  })
  const short = reason.trim().length < 2
  const failure = decline.isError ? failureOf(decline.error) : null

  return (
    <Dialog title={t('loyalty.requests.decline_title', 'Decline {{benefit}}', { benefit: request.benefit?.name ?? '' })} onClose={onClose} busy={decline.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (!short) decline.mutate() }}>
        <Field label={t('loyalty.requests.decline_reason', 'Why')} hint={t('loyalty.requests.decline_hint', 'Kept with the request for the team; the member is not sent it.')}>
          <input type="text" value={reason} maxLength={255} ref={first} onChange={(e) => setReason(e.target.value)} className={INPUT}
            placeholder={t('loyalty.requests.decline_example', 'e.g. Fully booked tonight')} aria-invalid={tried && short} />
        </Field>
        {tried && short && <Notice tone="warning">{t('loyalty.requests.decline_needs_reason', 'Say why, in a few words.')}</Notice>}
        {failure && <Notice tone="danger">{t(...errorKey('requests', failure))}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={decline.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
          <Button type="submit" variant="danger" loading={decline.isPending}>{t('loyalty.requests.decline', 'Decline')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
