import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, Square } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Eyebrow } from '../../workspace/ui/Typography'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points, when } from '../lib/format'
import { ConfirmDialog } from '../ui/formParts'
import { afterPushChange, pushApi, pushKey } from './api'
import { ERRORS } from './errors'
import { CategoryName, Refusal, StatusBadge } from './parts'
import { PhonePreview } from './PhonePreview'
import { outcomesOf, progressOf, pushActions, pushSearch } from './pushMath'
import type { Push, PushOptions } from './types'
import { OUTCOME_HINT_WORDS, OUTCOME_WORDS } from './words'

/**
 * A push message that went out, or is going out (spec 2026-10-22 release 3 §5): how many members it was handed, how
 * many were pushed, and what came of the others, read again every 10 s while it sends; Cancel while it sends (what
 * went out stays out); Duplicate for a new draft. The message as it was sent is below.
 */
export function PushResults({ push: p, options }: { push: Push; options: PushOptions }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const timeZone = boot.venue.timezone
  const progress = progressOf(p)
  const actions = pushActions(p)
  const [stopping, setStopping] = useState(false)
  const n = (count: number) => points(count, locale)
  const outcomes = outcomesOf(p.results)

  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-2">
        <h2 className="break-words font-a-display text-3xl font-normal leading-tight text-a-text">{p.name}</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-a-text-2">
          <StatusBadge status={p.status} />
          <span><CategoryName category={p.category} /></span>
          <span>{p.segment ? t('loyalty.push.results.to', 'To {{segment}}', { segment: p.segment.name }) : t('loyalty.push.list.no_segment', 'No segment')}</span>
          {p.sent_by && <span>{t('loyalty.push.results.by', 'Sent by {{name}}', { name: p.sent_by })}</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="push-progress" className="min-w-0 space-y-3 rounded-2xl border border-a-border bg-a-surface p-5" data-progress={p.status}>
          <Eyebrow><span id="push-progress">{t('loyalty.push.results.title', 'How far it got')}</span></Eyebrow>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-a-text-2">{t('loyalty.push.outcome.sent', 'Pushed')}</dt>
              <dd className="font-a-display text-3xl font-light tabular-nums text-a-text">{n(p.results.sent)}</dd>
            </div>
            <div>
              <dt className="text-xs text-a-text-2">{t('loyalty.push.results.of', 'Of')}</dt>
              <dd className="font-a-display text-3xl font-light tabular-nums text-a-text">{n(progress.total)}</dd>
            </div>
          </dl>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
            aria-label={t('loyalty.push.results.progress', 'Handled so far')} className="h-2 overflow-hidden rounded-full bg-a-surface-2">
            <div className="h-full rounded-full bg-a-accent" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="text-sm text-a-text-2">
            {p.status === 'sending' && t('loyalty.push.results.sending', 'Sending, in batches of 100. This page updates every 10 seconds.')}
            {p.status === 'sent' && t('loyalty.push.results.done', 'Sent {{when}}.', { when: when(p.sent_at, locale, timeZone) })}
            {p.status === 'failed' && t('loyalty.push.results.stopped', 'Sending stopped before the end: {{sent}} were pushed, the rest were not.', { sent: n(p.results.sent) })}
            {p.status === 'cancelled' && t('loyalty.push.results.cancelled', 'Cancelled: {{sent}} were pushed before it stopped.', { sent: n(p.results.sent) })}
          </p>
          {p.status === 'sending' && p.last_progress_at && (
            <p className="text-xs text-a-text-2">{t('loyalty.push.results.last_progress', 'Last batch {{when}}.', { when: when(p.last_progress_at, locale, timeZone) })}</p>
          )}
          {outcomes.some(o => o.code !== 'sent') && (
            <ul className="space-y-2 border-t border-a-border pt-3" data-outcomes="">
              {outcomes.filter(o => o.code !== 'sent').map(o => (
                <li key={o.code} className="text-sm">
                  <span className="font-medium tabular-nums text-a-text">
                    {t('loyalty.push.results.outcome_count', '{{outcome}}: {{number}}', { outcome: t(`loyalty.push.outcome.${o.code}`, OUTCOME_WORDS[o.code]), number: n(o.count) })}
                  </span>
                  <span className="block text-xs text-a-text-2">{t(`loyalty.push.outcome_hint.${o.code}`, OUTCOME_HINT_WORDS[o.code])}</span>
                </li>
              ))}
            </ul>
          )}
          {progress.gone > 0 && (
            <p className="text-sm text-a-text-2">{t('loyalty.push.results.gone', '{{number}} were not reached: their member record was deleted or merged after it started.', { number: n(progress.gone) })}</p>
          )}
        </section>

        <section aria-labelledby="push-sent" className="min-w-0 space-y-2">
          <Eyebrow><span id="push-sent">{t('loyalty.push.results.message', 'The message')}</span></Eyebrow>
          <PhonePreview title={p.title} body={p.body} appName={boot.organization.name} titleGuide={options.title_guide} />
        </section>
      </div>

      <Actions push={p} cancel={actions.cancel} onCancel={() => setStopping(true)} />
      {stopping && <CancelDialog push={p} onClose={() => setStopping(false)} />}
    </div>
  )
}

/** Cancel (while it sends) and Duplicate. */
function Actions({ push: p, cancel, onCancel }: { push: Push; cancel: boolean; onCancel: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const duplicate = useMutation({
    mutationFn: () => pushApi.duplicate(p.id, t('loyalty.push.copy_name', '{{name}} (copy)', { name: p.name })),
    onSuccess: (copy) => {
      client.setQueryData(pushKey(copy.push.id), copy)
      afterPushChange(client, null)
      navigate({ pathname: '/loyalty/campaigns', search: pushSearch(copy.push.id) })
    },
  })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {cancel && <Button variant="danger" onClick={onCancel}><Square size={14} aria-hidden />{t('loyalty.push.results.cancel', 'Stop sending')}</Button>}
        <Button variant="secondary" loading={duplicate.isPending} onClick={() => duplicate.mutate()}>
          <Copy size={14} aria-hidden />{t('loyalty.push.editor.duplicate', 'Duplicate')}
        </Button>
      </div>
      {duplicate.isError && <Refusal family="duplicate" failure={failureOf(duplicate.error)} />}
    </div>
  )
}

/** The step before a sending message is stopped. */
function CancelDialog({ push: p, onClose }: { push: Push; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const stop = useMutation({
    mutationFn: () => pushApi.cancel(p.id),
    onSuccess: (answer) => {
      client.setQueryData(pushKey(p.id), answer)
      afterPushChange(client, p.id)
      onClose()
    },
    onError: (error) => { if (failureOf(error).code === 'not_sending') afterPushChange(client, p.id) },
  })
  const failure = stop.isError ? failureOf(stop.error) : null
  return (
    <ConfirmDialog title={t('loyalty.push.cancel.title', 'Stop sending {{name}}?', { name: p.name })}
      confirm={t('loyalty.push.cancel.confirm', 'Stop sending')} keep={t('loyalty.push.cancel.keep', 'Keep sending')}
      busy={stop.isPending} failure={failure && t(...refusalKey('loyalty.push', ERRORS, 'cancel', failure))}
      onConfirm={() => stop.mutate()} onClose={onClose}>
      <p>{t('loyalty.push.cancel.body', '{{sent}} pushes already went out and stay sent. The rest are not sent; it stops within one batch of 100.', { sent: points(p.results.sent, i18n.language || 'en') })}</p>
    </ConfirmDialog>
  )
}
