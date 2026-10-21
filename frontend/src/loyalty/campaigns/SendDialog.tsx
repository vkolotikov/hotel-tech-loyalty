import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { failureOf } from '../lib/api'
import { points } from '../lib/format'
import { afterCampaignChange, audienceKey, campaignKey, campaignsApi } from './api'
import { confirmationOf, sendRefusalRefreshes } from './campaignsMath'
import { Refusal } from './parts'
import type { Audience, Campaign } from './types'
import { NOT_REACHED_WORDS } from './words'

/**
 * The step before a campaign goes out (spec 2026-10-21 release 2 §6). It says how many members it will email now — the
 * server's count of the segment's members who agreed to marketing email, are not unsubscribed and whose address is not
 * blocked, the members the pipeline is then handed — and how many of the segment will not get it, and why. The button
 * names that number, and the server starts nothing if the number or the draft changed meanwhile (`audience_changed`,
 * `changed`): the person is asked again with the new number.
 */
export function SendDialog({ campaign, tags, onClose }: { campaign: Campaign; tags: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const audience = useQuery({ queryKey: audienceKey(campaign.id), queryFn: () => campaignsApi.audience(campaign.id), retry: false, staleTime: 0 })
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
  })
  const a = audience.data?.audience
  const said = a ? confirmationOf(a) : null
  const failure = send.isError ? failureOf(send.error) : null

  return (
    <Dialog title={t('loyalty.campaigns.send.title', 'Send this campaign')} onClose={onClose} busy={send.isPending}>
      <div className="space-y-4 text-sm text-a-text">
        <p className="font-medium">{campaign.subject}</p>
        {audience.isError && <Refusal family="audience" failure={failureOf(audience.error)} />}
        {!a && !audience.isError && (
          <div role="status" className="space-y-2">
            <span className="sr-only">{t('loyalty.campaigns.send.counting', 'Counting who it will reach…')}</span>
            <Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-1/2" />
          </div>
        )}
        {a && said && <Numbers audience={a} said={said} locale={locale} />}
        {said?.state === 'ok' && tags && (
          <Notice tone="warning">{t('loyalty.campaigns.send.tags', 'The email holds a tag such as {{tag}}. Tags are not filled in: members will read it as written.', { tag: '{{member.name}}' })}</Notice>
        )}
        {said?.state === 'ok' && (
          <p className="text-a-text-2">{t('loyalty.campaigns.send.final', 'Once it starts it can be stopped, but emails already sent cannot be taken back.')}</p>
        )}
        {failure && <Refusal family="send" failure={failure} vars={{ reached: points(Number(failure.extra.reached ?? 0), locale), limit: points(Number(failure.extra.limit ?? a?.limit ?? 0), locale) }} />}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={send.isPending}>{t('loyalty.campaigns.send.keep', 'Not now')}</Button>
          {said?.state === 'ok' && (
            <Button type="button" variant="danger" loading={send.isPending} disabled={audience.isFetching} onClick={() => send.mutate(said.reached)}>
              <Send size={15} aria-hidden />
              {t('loyalty.campaigns.send.confirm', 'Send to {{number}} members', { number: points(said.reached, locale) })}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
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
