import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Send } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { timeProblemOf, WhenChoice } from '../campaigns/ScheduleParts'
import { badTimeReason, defaultSendAt, laterProblem, scheduledWhen, scheduleRefusalRefreshes, venueClockNow, type SendMode } from '../campaigns/scheduleMath'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { points } from '../lib/format'
import { useFirstFocus } from '../lib/useFirstFocus'
import { afterSmsChange, smsApi, smsAudienceKey, smsKey } from './api'
import { Refusal } from './parts'
import { confirmationOf, sendRefusalRefreshes } from './smsMath'
import type { Sms, SmsAudience } from './types'
import { NOT_REACHED_WORDS } from './words'

/**
 * The step before an SMS campaign goes out (spec 2026-10-22 release 4 §5, R4-4). It says how many members it will text
 * now — the server's count of the segment's members who turned on offers by SMS and have a number with its country
 * code, each number once, the members the job is then handed — how many of the segment will not get it and why, and
 * the cost hint: the SMS parts their copies come to, which Twilio bills to the venue. The button names the number, and
 * the server starts nothing if the number or the draft changed meanwhile (`audience_changed`, `changed`). Send later
 * picks a time on the venue's clock instead; the count is then "about this many now". "Not now" takes the focus first.
 */
export function SmsSendDialog({ sms, onClose }: { sms: Sms; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const boot = useBoot()
  const timeZone = boot.venue.timezone
  const first = useFirstFocus<HTMLButtonElement>()
  const [mode, setMode] = useState<SendMode>('now')
  const [at, setAt] = useState(() => defaultSendAt(boot.venue.today))
  const [tried, setTried] = useState(false)
  const audience = useQuery({ queryKey: smsAudienceKey(sms.id), queryFn: () => smsApi.audience(sms.id), retry: false, staleTime: 0 })
  const send = useMutation({
    mutationFn: (recipients: number) => smsApi.send(sms.id, { recipients, revision: sms.revision }),
    onSuccess: (answer) => {
      client.setQueryData(smsKey(sms.id), answer)
      afterSmsChange(client, sms.id)
      onClose()
    },
    onError: (error) => {
      const again = sendRefusalRefreshes(failureOf(error).code)
      if (again.audience) void audience.refetch()
      if (again.message) void client.invalidateQueries({ queryKey: smsKey(sms.id) })
    },
  })
  const schedule = useMutation({
    mutationFn: (sendAt: string) => smsApi.schedule(sms.id, { send_at: sendAt, revision: sms.revision }),
    onSuccess: (answer) => {
      client.setQueryData(smsKey(sms.id), { sms: answer.sms, options: answer.options })
      afterSmsChange(client, sms.id)
      onClose()
    },
    onError: (error) => { if (scheduleRefusalRefreshes(failureOf(error).code)) void client.invalidateQueries({ queryKey: smsKey(sms.id) }) },
  })
  const a = audience.data?.audience
  const said = a ? confirmationOf(a) : null
  const failure = send.isError ? failureOf(send.error) : null
  const scheduleFailure = schedule.isError ? failureOf(schedule.error) : null
  const later = mode === 'later'
  const busy = send.isPending || schedule.isPending
  const n = (count: number) => points(count, locale)

  return (
    <Dialog title={t('loyalty.sms.send.title', 'Send this SMS')} onClose={onClose} busy={busy}>
      <div className="space-y-4 text-sm text-a-text">
        <p className="line-clamp-3 whitespace-pre-line break-words font-medium">{sms.body}</p>
        <WhenChoice mode={mode} at={at} timeZone={timeZone} problem={later ? timeProblemOf(at, timeZone, tried, scheduleFailure) : null}
          onMode={(next) => { setMode(next); send.reset(); schedule.reset() }} onAt={(next) => { setAt(next); if (schedule.isError) schedule.reset() }} />
        {audience.isError && <Refusal family="audience" failure={failureOf(audience.error)} />}
        {!a && !audience.isError && (
          <div role="status" className="space-y-2">
            <span className="sr-only">{t('loyalty.sms.send.counting', 'Counting who it will reach…')}</span>
            <Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-1/2" />
          </div>
        )}
        {a && said && !later && <Numbers audience={a} said={said} locale={locale} />}
        {a && said && later && (
          <p data-confirmation="later">
            {t('loyalty.sms.send.about_now', 'About {{number}} members of {{segment}} could receive it now, about {{segments}} SMS. It goes to whoever can receive it at that moment, counted then.', {
              number: n(said.reached), segment: a.segment.name, segments: n(said.segments),
            })}
          </p>
        )}
        {said?.state === 'ok' && !later && (
          <p className="text-a-text-2">{t('loyalty.sms.send.final', 'Once it starts it can be stopped, but SMS already sent cannot be taken back. Twilio bills the venue for each SMS part.')}</p>
        )}
        {failure && <Refusal family="send" failure={failure} vars={{ reached: n(Number(failure.extra.reached ?? 0)), limit: n(Number(failure.extra.limit ?? a?.limit ?? 0)) }} />}
        {scheduleFailure && !badTimeReason(scheduleFailure) && <Refusal family="schedule" failure={scheduleFailure} />}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button ref={first} type="button" onClick={onClose} disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2 disabled:pointer-events-none disabled:opacity-50">
            {t('loyalty.sms.send.keep', 'Not now')}
          </button>
          {said?.state === 'ok' && !later && (
            <Button type="button" variant="danger" loading={send.isPending} disabled={audience.isFetching} onClick={() => send.mutate(said.reached)}>
              <Send size={15} aria-hidden />
              {t('loyalty.sms.send.confirm', 'Text {{number}} members', { number: n(said.reached) })}
            </Button>
          )}
          {said && later && (
            <Button type="button" loading={schedule.isPending} onClick={() => {
              setTried(true)
              if (laterProblem(at, venueClockNow(timeZone)) === null) schedule.mutate(at)
            }}>
              <CalendarClock size={15} aria-hidden />
              {t('loyalty.sms.send.schedule', 'Schedule for {{when}}', { when: scheduledWhen(at, locale) })}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

/** The numbers the confirmation rests on, with the cost hint. */
function Numbers({ audience: a, said, locale }: { audience: SmsAudience; said: ReturnType<typeof confirmationOf>; locale: string }) {
  const { t } = useTranslation()
  const n = (count: number) => points(count, locale)
  return (
    <div className="space-y-2" data-confirmation={said.state}>
      {said.state === 'ok' && (
        <>
          <p>{t('loyalty.sms.send.will_text', 'It will text {{number}} members of {{segment}}, starting now.', { number: n(said.reached), segment: a.segment.name })}</p>
          <p className="font-medium" data-cost="">
            {said.long
              ? t('loyalty.sms.send.cost_long', 'That is {{segments}} SMS in all: some copies are longer than one SMS, and each part is billed.', { segments: n(said.segments) })
              : t('loyalty.sms.send.cost', 'That is {{segments}} SMS in all, one each.', { segments: n(said.segments) })}
          </p>
        </>
      )}
      {said.state === 'nobody' && <Notice tone="warning">{t('loyalty.sms.send.nobody', 'Nobody in {{segment}} can receive it.', { segment: a.segment.name })}</Notice>}
      {said.state === 'over' && (
        <Notice tone="warning">{t('loyalty.sms.send.over', 'It would reach {{number}} members, more than {{limit}}, the most one campaign may. Narrow the segment.', { number: n(said.reached), limit: n(a.limit) })}</Notice>
      )}
      {said.left_out > 0 && (
        <>
          <p className="text-a-text-2">{t('loyalty.sms.send.left_out', '{{number}} of its {{members}} members will not get it:', { number: n(said.left_out), members: n(a.members) })}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-a-text-2">
            {said.reasons.map(r => <li key={r.code}>{t(`loyalty.sms.not_reached.${r.code}`, NOT_REACHED_WORDS[r.code], { number: n(r.count) })}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}
