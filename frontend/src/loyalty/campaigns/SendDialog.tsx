import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Send } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { points } from '../lib/format'
import { afterCampaignChange, audienceKey, campaignKey, campaignsApi } from './api'
import { confirmationOf, sendRefusalRefreshes } from './campaignsMath'
import { Refusal } from './parts'
import { WhenChoice } from './ScheduleParts'
import { badTimeReason, defaultSendAt, laterProblem, scheduledWhen, scheduleRefusalRefreshes, timeProblemOf, venueClockNow, type SendMode } from './scheduleMath'
import type { Audience, Campaign } from './types'
import { NOT_REACHED_WORDS } from './words'
import { useCampaignWords } from './design/words'

/**
 * The step before a campaign goes out (spec 2026-10-21 release 2 §6). It says how many members it will email now — the
 * server's count of the segment's members who agreed to marketing email, are not unsubscribed and whose address is not
 * blocked, the members the pipeline is then handed — and how many of the segment will not get it, and why. The button
 * names that number, and the server starts nothing if the number or the draft changed meanwhile (`audience_changed`,
 * `changed`): the person is asked again with the new number. Before Send it names any double-braced word in the saved
 * subject or body that no tag fills (the server's `unknown_tags`): members would read it as written.
 *
 * Release 4: Send later. The same step offers a time on the venue's clock instead; the count is then "about this many
 * now" (it goes to whoever is eligible when it starts) and Schedule sets it, on the draft shown.
 */
export function SendDialog({ campaign, onClose, inline, onBusyChange }: { campaign: Campaign; onClose: () => void; inline?: ReactNode; onBusyChange?: (busy: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const w = useCampaignWords()
  const inFlight = useRef(false)
  const settled = () => { inFlight.current = false; onBusyChange?.(false) }
  const start = (run: () => void) => { if (inFlight.current) return; inFlight.current = true; onBusyChange?.(true); run() }
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const timeZone = boot.venue.timezone
  const client = useQueryClient()
  const [mode, setMode] = useState<SendMode>('now')
  const [at, setAt] = useState(() => defaultSendAt(boot.venue.today))
  const [tried, setTried] = useState(false)
  const audience = useQuery({ queryKey: audienceKey(campaign.id), queryFn: () => campaignsApi.audience(campaign.id), retry: false, staleTime: 0 })
  const schedule = useMutation({
    mutationFn: (sendAt: string) => campaignsApi.schedule(campaign.id, { send_at: sendAt, revision: campaign.revision }),
    onSuccess: (answer) => {
      client.setQueryData(campaignKey(campaign.id), { campaign: answer.campaign, options: answer.options })
      afterCampaignChange(client, campaign.id)
      onClose()
    },
    onError: (error) => { if (scheduleRefusalRefreshes(failureOf(error).code)) void client.invalidateQueries({ queryKey: campaignKey(campaign.id) }) },
    onSettled: settled,
  })
  const send = useMutation({
    mutationFn: (recipients: number) => campaignsApi.send(campaign.id, { recipients, revision: campaign.revision }),
    onSuccess: (answer) => {
      client.setQueryData(campaignKey(campaign.id), answer)
      afterCampaignChange(client, campaign.id)
      onClose()
    },
    onError: (error) => {
      const again = sendRefusalRefreshes(failureOf(error).code)
      if (again.audience) void audience.refetch()
      if (again.campaign) void client.invalidateQueries({ queryKey: campaignKey(campaign.id) })
    },
    onSettled: settled,
  })
  const a = audience.isError ? undefined : audience.data?.audience
  const said = a ? confirmationOf(a) : null
  const failure = send.isError ? failureOf(send.error) : null
  const scheduleFailure = schedule.isError ? failureOf(schedule.error) : null
  const later = mode === 'later'
  const busy = send.isPending || schedule.isPending

  const content = <>
      <section className={inline ? 'l-cm-panel l-cm-accent' : 'space-y-4 text-sm text-a-text'}>
        {inline && <><h2>{w('review')}</h2>{a && <div><strong className="l-cm-review-count">{points(a.reached, locale)}</strong><p className="l-cm-cyan">{w('eligible')}</p></div>}</>}
        <p className="font-medium">{campaign.subject}</p>
        <fieldset disabled={busy}><WhenChoice mode={mode} at={at} timeZone={timeZone} problem={later ? timeProblemOf(at, timeZone, tried, scheduleFailure) : null}
          onMode={(next) => { setMode(next); send.reset(); schedule.reset() }} onAt={(next) => { setAt(next); if (schedule.isError) schedule.reset() }} /></fieldset>
        {audience.isError && <Refusal family="audience" failure={failureOf(audience.error)} />}
        {audience.isError && <Button variant="secondary" onClick={() => { void audience.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>}
        {!a && !audience.isError && (
          <div role="status" className="space-y-2">
            <span className="sr-only">{t('loyalty.campaigns.send.counting', 'Counting who it will reach…')}</span>
            <Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-1/2" />
          </div>
        )}
        {a && said && !later && <Numbers audience={a} said={said} locale={locale} />}
        {a && said && later && (
          <p data-confirmation="later">
            {t('loyalty.campaigns.send.about_now', 'About {{number}} members of {{segment}} could receive it now. It goes to whoever can receive it at that moment, counted then.', {
              number: points(said.reached, locale), segment: a.segment.name,
            })}
          </p>
        )}
        {said?.state === 'ok' && campaign.unknown_tags.length > 0 && (
          <div data-unknown-tags="">
            <Notice tone="warning">{t('loyalty.campaigns.send.unknown_tags', 'The email holds {{tags}}, which no tag fills: members will read it as written.', { tags: campaign.unknown_tags.join(', ') })}</Notice>
          </div>
        )}
        {said?.state === 'ok' && !later && (
          <p className="text-a-text-2">{t('loyalty.campaigns.send.final', 'Once it starts it can be stopped, but emails already sent cannot be taken back.')}</p>
        )}
        {failure && <Refusal family="send" failure={failure} vars={{ reached: points(Number(failure.extra.reached ?? 0), locale), limit: points(Number(failure.extra.limit ?? a?.limit ?? 0), locale) }} />}
        {scheduleFailure && !badTimeReason(scheduleFailure) && <Refusal family="schedule" failure={scheduleFailure} />}
        {inline && <small>{w('reviewHint')}</small>}
      </section>
        <div className={inline ? 'l-cm-footer' : 'flex flex-wrap justify-end gap-2 pt-1'}>
          {inline && <div><p>{w('audienceSend')}</p><small>{w('draftOnly')}</small></div>}
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('loyalty.campaigns.send.keep', 'Not now')}</Button>
          {said?.state === 'ok' && !later && (
            <Button type="button" variant="danger" className={inline ? 'l-ov-button l-ov-primary' : ''} loading={send.isPending} disabled={audience.isFetching || busy} onClick={() => start(() => send.mutate(said.reached))}>
              <Send size={15} aria-hidden />
              {t('loyalty.campaigns.send.confirm', 'Send to {{number}} members', { number: points(said.reached, locale) })}
            </Button>
          )}
          {said && later && (
            <Button type="button" loading={schedule.isPending} disabled={audience.isFetching || busy} onClick={() => {
              setTried(true)
              if (laterProblem(at, venueClockNow(timeZone)) === null) start(() => schedule.mutate(at))
            }}>
              <CalendarClock size={15} aria-hidden />
              {t('loyalty.campaigns.send.schedule', 'Schedule for {{when}}', { when: scheduledWhen(at, locale) })}
            </Button>
          )}
        </div>
  </>
  return inline ? <div className="l-cm-send-layout">{inline}{content}</div> : <Dialog title={t('loyalty.campaigns.send.title', 'Send this campaign')} onClose={onClose} busy={busy}><div className="space-y-4 text-sm text-a-text">{content}</div></Dialog>
}

/** The numbers the confirmation rests on. */
function Numbers({ audience: a, said, locale }: { audience: Audience; said: ReturnType<typeof confirmationOf>; locale: string }) {
  const { t } = useTranslation()
  const n = (count: number) => points(count, locale)
  return (
    <div className="space-y-2" data-confirmation={said.state}>
      {said.state === 'ok' && (
        <p>{t('loyalty.campaigns.send.will_email', 'It will email {{number}} members of {{segment}}, starting now, under the venue’s name, each with an unsubscribe link.', { number: n(said.reached), segment: a.segment.name })}</p>
      )}
      {said.state === 'nobody' && (
        <Notice tone="warning">{t('loyalty.campaigns.send.nobody', 'Nobody in {{segment}} can receive it.', { segment: a.segment.name })}</Notice>
      )}
      {said.state === 'over' && (
        <Notice tone="warning">{t('loyalty.campaigns.send.over', 'It would reach {{number}} members, more than {{limit}}, the most one campaign may. Narrow the segment.', { number: n(said.reached), limit: n(a.limit) })}</Notice>
      )}
      {said.left_out > 0 && (
        <>
          <p className="text-a-text-2">{t('loyalty.campaigns.send.left_out', '{{number}} of its {{members}} members will not get it:', { number: n(said.left_out), members: n(a.members) })}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-a-text-2">
            {said.reasons.map(r => <li key={r.code}>{t(`loyalty.campaigns.not_reached.${r.code}`, NOT_REACHED_WORDS[r.code], { number: n(r.count) })}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}
