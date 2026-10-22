import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, Square } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Eyebrow } from '../../workspace/ui/Typography'
import { ScheduledPanel, ScheduleFailed } from '../campaigns/ScheduleParts'
import { isScheduled } from '../campaigns/scheduleMath'
import { SCHEDULE_PROBLEM_WORDS } from '../campaigns/words'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points, when } from '../lib/format'
import { ConfirmDialog } from '../ui/formParts'
import { afterSmsChange, smsApi, smsKey } from './api'
import { ERRORS } from './errors'
import { PhoneBubble, ReasonText, Refusal, StatusBadge } from './parts'
import { handled, outcomesOf, progressOf, smsActions, smsSearch } from './smsMath'
import type { Sms, SmsOptions } from './types'
import { OUTCOME_HINT_WORDS, OUTCOME_WORDS } from './words'

/**
 * An SMS campaign that went out, is going out, or waits for its time (spec 2026-10-22 release 4 §5): how many members
 * it was handed, how many Twilio took and the SMS parts it counted for them, what came of the others and the commonest
 * reasons Twilio gave, read again every 10 s while it sends; Cancel while it sends (what went out stays out); Duplicate
 * for a new draft. A scheduled one shows when it goes out, with Change time and Take back to a draft; one that could
 * not start when due, or that Twilio's account stopped, says why. The text as it was sent is below.
 */
export function SmsResults({ sms: s, options }: { sms: Sms; options: SmsOptions }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const timeZone = boot.venue.timezone
  const client = useQueryClient()
  const progress = progressOf(s)
  const actions = smsActions(s)
  const [stopping, setStopping] = useState(false)
  const n = (count: number) => points(count, locale)
  const outcomes = outcomesOf(s.results)
  const waiting = isScheduled(s.status)
  // A scheduled campaign that never started: failed with a schedule's reason, nobody handed to the job.
  const didNotStart = s.status === 'failed' && s.recipient_count === 0 && handled(s.results) === 0 && !!s.problem && s.problem in SCHEDULE_PROBLEM_WORDS
  const settle = (answer: { sms: Sms; options: SmsOptions }) => {
    client.setQueryData(smsKey(s.id), { sms: answer.sms, options: answer.options })
    afterSmsChange(client, s.id)
  }
  const reread = (error: unknown) => {
    afterSmsChange(client, s.id)
    throw error
  }

  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-2">
        <h2 className="break-words font-a-display text-3xl font-normal leading-tight text-a-text">{s.name}</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-a-text-2">
          <StatusBadge status={s.status} />
          <span>{s.segment ? t('loyalty.sms.results.to', 'To {{segment}}', { segment: s.segment.name }) : t('loyalty.sms.list.no_segment', 'No segment')}</span>
          {s.sent_by && !waiting && <span>{t('loyalty.sms.results.by', 'Sent by {{name}}', { name: s.sent_by })}</span>}
        </div>
      </div>

      {waiting && (
        <ScheduledPanel wall={s.scheduled_for} timeZone={timeZone} today={boot.venue.today} by={s.sent_by}
          onMove={(at) => smsApi.schedule(s.id, { send_at: at, revision: s.revision }).then(settle, reread)}
          onTakeBack={() => smsApi.unschedule(s.id).then(settle, reread)}
          refusal={(family, failure) => <Refusal family={family} failure={failure} />} />
      )}
      {didNotStart && <ScheduleFailed problem={s.problem ?? ''} wall={s.scheduled_for} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {!waiting && !didNotStart && (
          <section aria-labelledby="sms-progress" className="min-w-0 space-y-3 rounded-2xl border border-a-border bg-a-surface p-5" data-progress={s.status}>
            <Eyebrow><span id="sms-progress">{t('loyalty.sms.results.title', 'How far it got')}</span></Eyebrow>
            <dl className="grid grid-cols-3 gap-4">
              <div>
                <dt className="text-xs text-a-text-2">{t('loyalty.sms.outcome.sent', 'Sent')}</dt>
                <dd className="font-a-display text-3xl font-light tabular-nums text-a-text">{n(s.results.sent)}</dd>
              </div>
              <div>
                <dt className="text-xs text-a-text-2">{t('loyalty.sms.results.of', 'Of')}</dt>
                <dd className="font-a-display text-3xl font-light tabular-nums text-a-text">{n(progress.total)}</dd>
              </div>
              <div>
                <dt className="text-xs text-a-text-2">{t('loyalty.sms.results.parts', 'SMS parts')}</dt>
                <dd className="font-a-display text-3xl font-light tabular-nums text-a-text">{n(s.segments_sent)}</dd>
              </div>
            </dl>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
              aria-label={t('loyalty.sms.results.progress', 'Handled so far')} className="h-2 overflow-hidden rounded-full bg-a-surface-2">
              <div className="h-full rounded-full bg-a-accent" style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="text-sm text-a-text-2">
              {s.status === 'sending' && t('loyalty.sms.results.sending', 'Sending, in batches of 50. This page updates every 10 seconds.')}
              {s.status === 'sent' && t('loyalty.sms.results.done', 'Sent {{when}}.', { when: when(s.sent_at, locale, timeZone) })}
              {s.status === 'failed' && t('loyalty.sms.results.stopped', 'Sending stopped before the end: {{sent}} were sent, the rest were not.', { sent: n(s.results.sent) })}
              {s.status === 'cancelled' && t('loyalty.sms.results.cancelled', 'Cancelled: {{sent}} were sent before it stopped.', { sent: n(s.results.sent) })}
            </p>
            {s.status === 'failed' && s.problem && <p className="text-sm text-a-text" data-problem={s.problem}><ReasonText reason={s.problem} /></p>}
            {s.status === 'sending' && s.last_progress_at && (
              <p className="text-xs text-a-text-2">{t('loyalty.sms.results.last_progress', 'Last batch {{when}}.', { when: when(s.last_progress_at, locale, timeZone) })}</p>
            )}
            {outcomes.some(o => o.code !== 'sent') && (
              <ul className="space-y-2 border-t border-a-border pt-3" data-outcomes="">
                {outcomes.filter(o => o.code !== 'sent').map(o => (
                  <li key={o.code} className="text-sm">
                    <span className="font-medium tabular-nums text-a-text">
                      {t('loyalty.sms.results.outcome_count', '{{outcome}}: {{number}}', { outcome: t(`loyalty.sms.outcome.${o.code}`, OUTCOME_WORDS[o.code]), number: n(o.count) })}
                    </span>
                    <span className="block text-xs text-a-text-2">{t(`loyalty.sms.outcome_hint.${o.code}`, OUTCOME_HINT_WORDS[o.code])}</span>
                  </li>
                ))}
              </ul>
            )}
            {s.failures.length > 0 && (
              <div className="space-y-1 border-t border-a-border pt-3" data-failures="">
                <p className="text-xs font-medium text-a-text-2">{t('loyalty.sms.results.why_failed', 'Why Twilio did not send them')}</p>
                <ul className="space-y-1 text-sm">
                  {s.failures.map(f => (
                    <li key={f.reason}>
                      <span className="tabular-nums text-a-text">{t('loyalty.sms.results.failure_count', '{{number}}:', { number: n(f.count) })}</span> <ReasonText reason={f.reason} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {progress.gone > 0 && (
              <p className="text-sm text-a-text-2">{t('loyalty.sms.results.gone', '{{number}} were not reached: their member record was deleted or merged after it started.', { number: n(progress.gone) })}</p>
            )}
            <p className="text-xs text-a-text-2">{t('loyalty.sms.results.delivery', 'Sent means Twilio took it; whether each phone received it is shown in Twilio’s own logs.')}</p>
          </section>
        )}

        <section aria-labelledby="sms-sent" className="min-w-0 space-y-2">
          <Eyebrow><span id="sms-sent">{t('loyalty.sms.results.message', 'The text')}</span></Eyebrow>
          <PhoneBubble text={s.preview} from={options.twilio.from} sample={s.preview !== s.body} />
        </section>
      </div>

      <Actions sms={s} cancel={actions.cancel} onCancel={() => setStopping(true)} />
      {stopping && <CancelDialog sms={s} onClose={() => setStopping(false)} />}
    </div>
  )
}

/** Cancel (while it sends) and Duplicate. */
function Actions({ sms: s, cancel, onCancel }: { sms: Sms; cancel: boolean; onCancel: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const duplicate = useMutation({
    mutationFn: () => smsApi.duplicate(s.id, t('loyalty.sms.copy_name', '{{name}} (copy)', { name: s.name })),
    onSuccess: (copy) => {
      client.setQueryData(smsKey(copy.sms.id), copy)
      afterSmsChange(client, null)
      navigate({ pathname: '/loyalty/campaigns', search: smsSearch(copy.sms.id) })
    },
  })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {cancel && <Button variant="danger" onClick={onCancel}><Square size={14} aria-hidden />{t('loyalty.sms.results.cancel', 'Stop sending')}</Button>}
        <Button variant="secondary" loading={duplicate.isPending} onClick={() => duplicate.mutate()}>
          <Copy size={14} aria-hidden />{t('loyalty.sms.editor.duplicate', 'Duplicate')}
        </Button>
      </div>
      {duplicate.isError && <Refusal family="duplicate" failure={failureOf(duplicate.error)} />}
    </div>
  )
}

/** The step before a sending campaign is stopped. */
function CancelDialog({ sms: s, onClose }: { sms: Sms; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const stop = useMutation({
    mutationFn: () => smsApi.cancel(s.id),
    onSuccess: (answer) => {
      client.setQueryData(smsKey(s.id), answer)
      afterSmsChange(client, s.id)
      onClose()
    },
    onError: (error) => { if (failureOf(error).code === 'not_sending') afterSmsChange(client, s.id) },
  })
  const failure = stop.isError ? failureOf(stop.error) : null
  return (
    <ConfirmDialog title={t('loyalty.sms.cancel.title', 'Stop sending {{name}}?', { name: s.name })}
      confirm={t('loyalty.sms.cancel.confirm', 'Stop sending')} keep={t('loyalty.sms.cancel.keep', 'Keep sending')}
      busy={stop.isPending} failure={failure && t(...refusalKey('loyalty.sms', ERRORS, 'cancel', failure))}
      onConfirm={() => stop.mutate()} onClose={onClose}>
      <p>{t('loyalty.sms.cancel.body', '{{sent}} SMS already went out and stay sent. The rest are not sent; it stops before the next member.', { sent: points(s.results.sent, i18n.language || 'en') })}</p>
    </ConfirmDialog>
  )
}
