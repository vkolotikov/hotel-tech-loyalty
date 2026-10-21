import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, ExternalLink, Square, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Eyebrow } from '../../workspace/ui/Typography'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points, when } from '../lib/format'
import { ConfirmDialog } from '../ui/formParts'
import { afterCampaignChange, campaignKey, campaignsApi } from './api'
import { DeleteDraft } from './CampaignEditor'
import { campaignActions, campaignPath, FULL_ADMIN_CAMPAIGNS, progressOf } from './campaignsMath'
import { EmailPreview } from './EmailPreview'
import { ERRORS } from './errors'
import { Refusal, StatusBadge } from './parts'
import type { Campaign } from './types'

/**
 * A campaign that went out, or is going out (spec 2026-10-21 release 2 §6): how many were sent, failed, and of how
 * many, read again every 10 s while it sends; Cancel while it sends (what went out stays out); Duplicate for a new
 * draft. The email as it was sent is below.
 */
export function CampaignResults({ campaign: c }: { campaign: Campaign }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const timeZone = boot.venue.timezone
  const progress = progressOf(c)
  const actions = campaignActions(c)
  const [stopping, setStopping] = useState(false)
  const n = (count: number) => points(count, locale)

  return (
    <div className="space-y-6">
      <Header campaign={c} />
      <section aria-labelledby="campaign-progress" className="max-w-2xl space-y-3 rounded-2xl border border-a-border bg-a-surface p-5" data-progress={c.status}>
        <Eyebrow><span id="campaign-progress">{t('loyalty.campaigns.results.title', 'How far it got')}</span></Eyebrow>
        <dl className="grid grid-cols-3 gap-4">
          <div>
            <dt className="text-xs text-a-text-2">{t('loyalty.campaigns.results.sent', 'Sent')}</dt>
            <dd className="font-a-display text-3xl font-light tabular-nums text-a-text">{n(c.sent_count)}</dd>
          </div>
          <div>
            <dt className="text-xs text-a-text-2">{t('loyalty.campaigns.results.failed', 'Failed')}</dt>
            <dd className={`font-a-display text-3xl font-light tabular-nums ${c.failed_count > 0 ? 'l-minus' : 'text-a-text'}`}>{n(c.failed_count)}</dd>
          </div>
          <div>
            <dt className="text-xs text-a-text-2">{t('loyalty.campaigns.results.of', 'Of')}</dt>
            <dd className="font-a-display text-3xl font-light tabular-nums text-a-text">{n(progress.total)}</dd>
          </div>
        </dl>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
          aria-label={t('loyalty.campaigns.results.progress', 'Sent so far')} className="h-2 overflow-hidden rounded-full bg-a-surface-2">
          <div className="h-full rounded-full bg-a-accent" style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="text-sm text-a-text-2">
          {c.status === 'sending' && t('loyalty.campaigns.results.sending', 'Sending, in batches of 100. This page updates every 10 seconds.')}
          {c.status === 'sent' && t('loyalty.campaigns.results.done', 'Sent {{when}}.', { when: when(c.sent_at, locale, timeZone) })}
          {c.status === 'failed' && t('loyalty.campaigns.results.stopped', 'Sending stopped before the end: {{sent}} were sent, the rest were not.', { sent: n(c.sent_count) })}
          {c.status === 'cancelled' && t('loyalty.campaigns.results.cancelled', 'Cancelled: {{sent}} were sent before it stopped.', { sent: n(c.sent_count) })}
        </p>
        {c.status === 'sending' && c.last_progress_at && (
          <p className="text-xs text-a-text-2">{t('loyalty.campaigns.results.last_progress', 'Last batch {{when}}.', { when: when(c.last_progress_at, locale, timeZone) })}</p>
        )}
        {progress.skipped > 0 && (
          <p className="text-sm text-a-text-2">{t('loyalty.campaigns.results.skipped', '{{number}} were not emailed: they withdrew their consent or unsubscribed after it started.', { number: n(progress.skipped) })}</p>
        )}
      </section>

      <Actions campaign={c} cancel={actions.cancel} onCancel={() => setStopping(true)} />

      <section aria-labelledby="campaign-sent" className="max-w-2xl space-y-2">
        <Eyebrow><span id="campaign-sent">{t('loyalty.campaigns.results.email', 'The email')}</span></Eyebrow>
        <EmailPreview html={c.body_html} />
      </section>

      {stopping && <CancelDialog campaign={c} onClose={() => setStopping(false)} />}
    </div>
  )
}

/** A draft the full admin made with parts the workspace does not write (an image, its own HTML): shown, not edited or sent here. */
export function ElsewhereDraft({ campaign: c }: { campaign: Campaign }) {
  const { t } = useTranslation()
  const [removing, setRemoving] = useState(false)
  return (
    <div className="space-y-6">
      <Header campaign={c} />
      <div className="max-w-2xl space-y-2">
        <Notice tone="info">{t('loyalty.campaigns.elsewhere.note', 'This draft was made in the full admin with parts this workspace does not edit, such as an image or its own HTML. Edit, test and send it there.')}</Notice>
        <Link to={FULL_ADMIN_CAMPAIGNS} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-a-accent-text hover:bg-a-accent/10">
          {t('loyalty.campaigns.elsewhere.open', 'Open campaigns in the full admin')}<ExternalLink size={14} aria-hidden />
        </Link>
      </div>
      <Actions campaign={c} cancel={false} onCancel={() => {}} onRemove={() => setRemoving(true)} />
      <section aria-labelledby="campaign-draft" className="max-w-2xl space-y-2">
        <Eyebrow><span id="campaign-draft">{t('loyalty.campaigns.preview.heading', 'Preview')}</span></Eyebrow>
        <EmailPreview html={c.body_html} />
      </section>
      {removing && <DeleteDraft id={c.id} name={c.name} onClose={() => setRemoving(false)} />}
    </div>
  )
}

function Header({ campaign: c }: { campaign: Campaign }) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0 space-y-2">
      <h1 className="font-a-display text-[40px] font-normal leading-none text-a-text">{c.name}</h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-a-text-2">
        <StatusBadge status={c.status} />
        <span>{c.segment ? t('loyalty.campaigns.results.to', 'To {{segment}}', { segment: c.segment.name }) : t('loyalty.campaigns.list.no_segment', 'No segment')}</span>
        {c.sent_by && <span>{t('loyalty.campaigns.results.by', 'Sent by {{name}}', { name: c.sent_by })}</span>}
      </div>
      {c.subject && <p className="text-sm text-a-text">{c.subject}</p>}
    </div>
  )
}

/** Cancel (while it sends), Duplicate, and Delete for a draft. */
function Actions({ campaign: c, cancel, onCancel, onRemove }: { campaign: Campaign; cancel: boolean; onCancel: () => void; onRemove?: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const duplicate = useMutation({
    mutationFn: () => campaignsApi.duplicate(c.id, t('loyalty.campaigns.copy_name', '{{name}} (copy)', { name: c.name })),
    onSuccess: (copy) => {
      client.setQueryData(campaignKey(copy.campaign.id), copy)
      afterCampaignChange(client, null)
      navigate(campaignPath(copy.campaign.id))
    },
  })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {cancel && <Button variant="danger" onClick={onCancel}><Square size={14} aria-hidden />{t('loyalty.campaigns.results.cancel', 'Stop sending')}</Button>}
        <Button variant="secondary" loading={duplicate.isPending} onClick={() => duplicate.mutate()}>
          <Copy size={14} aria-hidden />{t('loyalty.campaigns.editor.duplicate', 'Duplicate')}
        </Button>
        {onRemove && <Button variant="ghost" onClick={onRemove}><Trash2 size={14} aria-hidden />{t('loyalty.campaigns.editor.delete', 'Delete draft')}</Button>}
      </div>
      {duplicate.isError && <Refusal family="duplicate" failure={failureOf(duplicate.error)} />}
    </div>
  )
}

/** The step before a sending campaign is stopped. */
function CancelDialog({ campaign: c, onClose }: { campaign: Campaign; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const stop = useMutation({
    mutationFn: () => campaignsApi.cancel(c.id),
    onSuccess: (answer) => {
      client.setQueryData(campaignKey(c.id), answer)
      afterCampaignChange(client, c.id)
      onClose()
    },
    onError: (error) => { if (failureOf(error).code === 'not_sending') afterCampaignChange(client, c.id) },
  })
  const failure = stop.isError ? failureOf(stop.error) : null
  return (
    <ConfirmDialog title={t('loyalty.campaigns.cancel.title', 'Stop sending {{name}}?', { name: c.name })}
      confirm={t('loyalty.campaigns.cancel.confirm', 'Stop sending')} keep={t('loyalty.campaigns.cancel.keep', 'Keep sending')}
      busy={stop.isPending} failure={failure && t(...refusalKey('loyalty.campaigns', ERRORS, 'cancel', failure))}
      onConfirm={() => stop.mutate()} onClose={onClose}>
      <p>{t('loyalty.campaigns.cancel.body', '{{sent}} emails already went out and stay sent. The rest are not sent; it stops within one batch of 100.', { sent: points(c.sent_count, i18n.language || 'en') })}</p>
    </ConfirmDialog>
  )
}
