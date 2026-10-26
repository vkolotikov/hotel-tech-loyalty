import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { day, points } from '../lib/format'
import { ConfirmDialog } from '../ui/formParts'
import { afterSegmentChange, campaignsApi, OPTIONS_KEY, SEGMENTS_KEY } from './api'
import { kindOf, reasonBounds, tierNames } from './campaignsMath'
import { ERRORS } from './errors'
import { LoadFailed, Loading, TabHead } from './parts'
import { SegmentDialog } from './SegmentDialog'
import type { Rule, Segment, SegmentOptions } from './types'
import { OPERATOR_WORDS, REASON_WORDS, RULE_OP_WORDS, RULE_TYPE_WORDS } from './words'
import { GetStarted } from '../ui/GetStarted'

/**
 * Segments (spec 2026-10-21 release 2 §6): the saved audiences, the full admin's too, each with its rules in words, how
 * many active members it matches now and when a campaign last went to it. A segment whose stored rules the workspace
 * would refuse (the shared service skips such a rule and would match more) says so; no campaign is sent to it.
 */
export function SegmentsTab() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const segments = useQuery({ queryKey: SEGMENTS_KEY, queryFn: campaignsApi.segments })
  const options = useQuery({ queryKey: OPTIONS_KEY, queryFn: campaignsApi.segmentOptions, staleTime: 60_000 })
  const [open, setOpen] = useState<{ kind: 'edit'; segment: Segment | null } | { kind: 'delete'; segment: Segment } | null>(null)
  const list = segments.data?.segments
  const opts = options.data
  const failed = segments.isError ? segments.error : options.isError ? options.error : null

  return (
    <>
      <TabHead line={<p>{t('loyalty.campaigns.segments.line', 'Who a campaign goes to: members chosen by tier, activity, points, when they joined, or everyone.')}</p>}>
        {opts && list && list.length > 0 && <Button size="sm" onClick={() => setOpen({ kind: 'edit', segment: null })}><Plus size={15} aria-hidden />{t('loyalty.campaigns.segments.new', 'New segment')}</Button>}
      </TabHead>

      {failed && !(list && opts) && <LoadFailed error={failed} onRetry={() => { void segments.refetch(); void options.refetch() }} />}
      {!(list && opts) && !failed && <Loading />}
      {list && opts && list.length === 0 && (
        <GetStarted name="segments" hue="rule" title={t('loyalty.campaigns.get_started.segments.title', 'Make your first segment')}
          line={t('loyalty.campaigns.get_started.segments.line', 'A segment is a group of members an email, a push message or an SMS goes to.')}
          steps={[
              { title: t('loyalty.campaigns.get_started.segments.s1_title', 'Name it'), line: t('loyalty.campaigns.get_started.segments.s1_line', 'For example, Gold members or Not seen for 60 days.') },
              { title: t('loyalty.campaigns.get_started.segments.s2_title', 'Choose its rules'), line: t('loyalty.campaigns.get_started.segments.s2_line', 'Tier, activity, points or when they joined, or everyone.') },
              { title: t('loyalty.campaigns.get_started.segments.s3_title', 'Send to it'), line: t('loyalty.campaigns.get_started.segments.s3_line', 'Pick it when you send an email, a push message or an SMS.') },
            ]}
          action={<Button onClick={() => setOpen({ kind: 'edit', segment: null })}><Plus size={15} aria-hidden />{t('loyalty.campaigns.segments.new', 'New segment')}</Button>} />
      )}
      {list && opts && list.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map(s => (
            <li key={s.id} data-segment={s.id} className="flex flex-col gap-3 rounded-2xl border border-a-border bg-a-surface p-4">
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-a-text">{s.name}</p>
                {s.description && <p className="text-sm text-a-text-2">{s.description}</p>}
              </div>
              <RulesText segment={s} options={opts} />
              {s.problem && (
                <Notice tone="warning">
                  {t('loyalty.campaigns.segments.problem', 'Rule {{n}} cannot be used: {{why}} No campaign is sent to this segment until it is fixed.', {
                    n: s.problem.index !== null ? s.problem.index + 1 : '–',
                    why: t(`loyalty.campaigns.reason.${s.problem.reason in REASON_WORDS ? s.problem.reason : 'bad_rules'}`, REASON_WORDS[s.problem.reason] ?? REASON_WORDS.bad_rules,
                      reasonBounds(s.problem.index !== null ? s.filters[s.problem.index]?.type : undefined, opts)),
                  })}
                </Notice>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <dt className="text-xs text-a-text-2">{t('loyalty.campaigns.segments.members', 'Members now')}</dt>
                  <dd className="font-a-display text-2xl font-light tabular-nums text-a-text">{points(s.members, locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-a-text-2">{t('loyalty.campaigns.segments.last_sent', 'Last sent')}</dt>
                  <dd className="text-sm text-a-text">{s.last_sent_at ? day(s.last_sent_at, locale, boot.venue.timezone) : t('loyalty.campaigns.segments.never', 'Not yet')}</dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="secondary" onClick={() => setOpen({ kind: 'edit', segment: s })}>
                  <Pencil size={14} aria-hidden />{t('loyalty.campaigns.segments.edit', 'Edit')}<span className="sr-only"> {s.name}</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen({ kind: 'delete', segment: s })}>
                  <Trash2 size={14} aria-hidden />{t('loyalty.campaigns.segments.delete', 'Delete')}<span className="sr-only"> {s.name}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {opts && open?.kind === 'edit' && <SegmentDialog segment={open.segment} options={opts} onClose={() => setOpen(null)} />}
      {open?.kind === 'delete' && <DeleteSegment segment={open.segment} onClose={() => setOpen(null)} />}
    </>
  )
}

/** A segment's rules in words: Everyone, or how they combine and each rule. */
export function RulesText({ segment, options }: { segment: Segment; options: SegmentOptions }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  if (segment.everyone) return <p className="text-sm text-a-text">{t('loyalty.campaigns.segments.everyone', 'Every active member')}</p>
  return (
    <div className="space-y-1 text-sm">
      {segment.filters.length > 1 && (
        <p className="text-a-text-2">{segment.operator in OPERATOR_WORDS ? t(`loyalty.campaigns.operator.${segment.operator}`, OPERATOR_WORDS[segment.operator]) : segment.operator}</p>
      )}
      <ul className="space-y-0.5">
        {segment.filters.map((rule, i) => <li key={i} className="text-a-text">{ruleWords(rule, options, t, locale)}</li>)}
      </ul>
    </div>
  )
}

type T = ReturnType<typeof useTranslation>['t']

/** One rule as a line: its type, its operator and its value ("Tier is one of Gold, Platinum"; "Last activity not active in the last 60 days"). */
function ruleWords(rule: Rule, options: SegmentOptions, t: T, locale: string): string {
  const type = rule.type in RULE_TYPE_WORDS ? t(`loyalty.campaigns.rule_type.${rule.type}`, RULE_TYPE_WORDS[rule.type]) : rule.type
  const opKey = `${rule.type}_${rule.op}`
  const op = opKey in RULE_OP_WORDS ? t(`loyalty.campaigns.rule_op.${opKey}`, RULE_OP_WORDS[opKey]) : rule.op
  const kind = kindOf(rule.type, options)
  let value = ''
  if (kind === 'tiers' && Array.isArray(rule.value)) {
    const { names, gone } = tierNames(rule.value.map(Number), options)
    value = [...names, ...(gone > 0 ? [t('loyalty.campaigns.segments.tiers_gone', '{{number}} removed tiers', { number: gone })] : [])].join(', ')
  } else if (kind === 'days') {
    value = t('loyalty.campaigns.segments.days', '{{number}} days', { number: points(Number(rule.value), locale) })
  } else if (kind === 'points') {
    value = points(Number(rule.value), locale)
  } else if (kind === 'date') {
    value = String(rule.value ?? '')
  } else if (kind === null && rule.value !== undefined && rule.value !== null) {
    value = Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value)
  }
  return [type, op, value].filter(Boolean).join(' ')
}

/** The step before a segment is deleted; a draft or a sending campaign that uses it keeps it (`in_use`, with their names). */
function DeleteSegment({ segment, onClose }: { segment: Segment; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => campaignsApi.deleteSegment(segment.id),
    onSuccess: () => { afterSegmentChange(client); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterSegmentChange(client) },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  const names = Array.isArray(failure?.extra.campaigns)
    ? (failure.extra.campaigns as { name?: unknown }[]).map(c => String(c.name ?? '')).filter(Boolean).join(', ')
    : ''
  return (
    <ConfirmDialog title={t('loyalty.campaigns.segments.delete_title', 'Delete {{name}}?', { name: segment.name })}
      confirm={t('loyalty.campaigns.segments.delete_confirm', 'Delete segment')} keep={t('loyalty.campaigns.segments.delete_keep', 'Keep it')}
      busy={remove.isPending} failure={failure && t(...refusalKey('loyalty.campaigns', ERRORS, 'remove_segment', failure), { names })}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('loyalty.campaigns.segments.delete_body', 'Members are not changed. Campaigns already sent to it keep their numbers. This cannot be undone.')}</p>
    </ConfirmDialog>
  )
}
