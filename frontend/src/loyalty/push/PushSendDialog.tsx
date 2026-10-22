import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Send } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { WhenChoice } from '../campaigns/ScheduleParts'
import { badTimeReason, defaultSendAt, laterProblem, scheduledWhen, scheduleRefusalRefreshes, timeProblemOf, venueClockNow, type SendMode } from '../campaigns/scheduleMath'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { points } from '../lib/format'
import { useFirstFocus } from '../lib/useFirstFocus'
import { afterPushChange, pushApi, pushAudienceKey, pushKey } from './api'
import { CategoryName, Refusal } from './parts'
import { confirmationOf, sendRefusalRefreshes } from './pushMath'
import type { Push, PushAudience } from './types'
import { NOT_REACHED_WORDS } from './words'

/**
 * The step before a push message goes out (spec 2026-10-22 release 3 §5). It says how many members it will reach now —
 * the server's count of the segment's members with push switched on, a phone with the app and this kind of message
 * not switched off, the members the job is then handed — and how many of the segment will not get it, and why. The
 * button names that number, and the server starts nothing if the number or the draft changed meanwhile
 * (`audience_changed`, `changed`): the person is asked again with the new number. "Not now" takes the focus first.
 * Release 4: Send later, a time on the venue's clock; the count is then "about this many now" (it goes to whoever can
 * receive it when it starts).
 */
export function PushSendDialog({ push, onClose }: { push: Push; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const boot = useBoot()
  const timeZone = boot.venue.timezone
  const first = useFirstFocus<HTMLButtonElement>()
  const [mode, setMode] = useState<SendMode>('now')
  const [at, setAt] = useState(() => defaultSendAt(boot.venue.today))
  const [tried, setTried] = useState(false)
  const audience = useQuery({ queryKey: pushAudienceKey(push.id), queryFn: () => pushApi.audience(push.id), retry: false, staleTime: 0 })
  const schedule = useMutation({
    mutationFn: (sendAt: string) => pushApi.schedule(push.id, { send_at: sendAt, revision: push.revision }),
    onSuccess: (answer) => {
      client.setQueryData(pushKey(push.id), { push: answer.push, options: answer.options })
      afterPushChange(client, push.id)
      onClose()
    },
    onError: (error) => { if (scheduleRefusalRefreshes(failureOf(error).code)) void client.invalidateQueries({ queryKey: pushKey(push.id) }) },
  })
  const send = useMutation({
    mutationFn: (recipients: number) => pushApi.send(push.id, { recipients, revision: push.revision }),
    onSuccess: (answer) => {
      client.setQueryData(pushKey(push.id), answer)
      afterPushChange(client, push.id)
      onClose()
    },
    onError: (error) => {
      const again = sendRefusalRefreshes(failureOf(error).code)
      if (again.audience) void audience.refetch()
      if (again.message) void client.invalidateQueries({ queryKey: pushKey(push.id) })
    },
  })
  const a = audience.data?.audience
  const said = a ? confirmationOf(a) : null
  const failure = send.isError ? failureOf(send.error) : null
  const scheduleFailure = schedule.isError ? failureOf(schedule.error) : null
  const later = mode === 'later'
  const busy = send.isPending || schedule.isPending

  return (
    <Dialog title={t('loyalty.push.send.title', 'Send this push message')} onClose={onClose} busy={busy}>
      <div className="space-y-4 text-sm text-a-text">
        <div className="space-y-0.5">
          <p className="break-words font-medium">{push.title}</p>
          <p className="text-a-text-2"><CategoryName category={push.category} /></p>
        </div>
        <WhenChoice mode={mode} at={at} timeZone={timeZone} problem={later ? timeProblemOf(at, timeZone, tried, scheduleFailure) : null}
          onMode={(next) => { setMode(next); send.reset(); schedule.reset() }} onAt={(next) => { setAt(next); if (schedule.isError) schedule.reset() }} />
        {audience.isError && <Refusal family="audience" failure={failureOf(audience.error)} />}
        {!a && !audience.isError && (
          <div role="status" className="space-y-2">
            <span className="sr-only">{t('loyalty.push.send.counting', 'Counting who it will reach…')}</span>
            <Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-1/2" />
          </div>
        )}
        {a && said && !later && <Numbers audience={a} said={said} locale={locale} />}
        {a && said && later && (
          <p data-confirmation="later">
            {t('loyalty.push.send.about_now', 'About {{number}} members of {{segment}} could receive it now. It goes to whoever can receive it at that moment, counted then.', {
              number: points(said.reached, locale), segment: a.segment.name,
            })}
          </p>
        )}
        {said?.state === 'ok' && !later && (
          <p className="text-a-text-2">{t('loyalty.push.send.final', 'Once it starts it can be stopped, but pushes already sent cannot be taken back. Each one also stays in the member’s inbox in the app.')}</p>
        )}
        {failure && <Refusal family="send" failure={failure} vars={{ reached: points(Number(failure.extra.reached ?? 0), locale), limit: points(Number(failure.extra.limit ?? a?.limit ?? 0), locale) }} />}
        {scheduleFailure && !badTimeReason(scheduleFailure) && <Refusal family="schedule" failure={scheduleFailure} />}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button ref={first} type="button" onClick={onClose} disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2 disabled:pointer-events-none disabled:opacity-50">
            {t('loyalty.push.send.keep', 'Not now')}
          </button>
          {said?.state === 'ok' && !later && (
            <Button type="button" variant="danger" loading={send.isPending} disabled={audience.isFetching} onClick={() => send.mutate(said.reached)}>
              <Send size={15} aria-hidden />
              {t('loyalty.push.send.confirm', 'Send to {{number}} members', { number: points(said.reached, locale) })}
            </Button>
          )}
          {said && later && (
            <Button type="button" loading={schedule.isPending} onClick={() => {
              setTried(true)
              if (laterProblem(at, venueClockNow(timeZone)) === null) schedule.mutate(at)
            }}>
              <CalendarClock size={15} aria-hidden />
              {t('loyalty.push.send.schedule', 'Schedule for {{when}}', { when: scheduledWhen(at, locale) })}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

/** The numbers the confirmation rests on. */
function Numbers({ audience: a, said, locale }: { audience: PushAudience; said: ReturnType<typeof confirmationOf>; locale: string }) {
  const { t } = useTranslation()
  const n = (count: number) => points(count, locale)
  return (
    <div className="space-y-2" data-confirmation={said.state}>
      {said.state === 'ok' && (
        <p>{t('loyalty.push.send.will_push', 'It will push to {{number}} members of {{segment}}, starting now.', { number: n(said.reached), segment: a.segment.name })}</p>
      )}
      {said.state === 'nobody' && (
        <Notice tone="warning">{t('loyalty.push.send.nobody', 'Nobody in {{segment}} can receive it.', { segment: a.segment.name })}</Notice>
      )}
      {said.state === 'over' && (
        <Notice tone="warning">{t('loyalty.push.send.over', 'It would reach {{number}} members, more than {{limit}}, the most one message may. Narrow the segment.', { number: n(said.reached), limit: n(a.limit) })}</Notice>
      )}
      {said.left_out > 0 && (
        <>
          <p className="text-a-text-2">{t('loyalty.push.send.left_out', '{{number}} of its {{members}} members will not get it:', { number: n(said.left_out), members: n(a.members) })}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-a-text-2">
            {said.reasons.map(r => <li key={r.code}>{t(`loyalty.push.not_reached.${r.code}`, NOT_REACHED_WORDS[r.code], { number: n(r.count) })}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}
