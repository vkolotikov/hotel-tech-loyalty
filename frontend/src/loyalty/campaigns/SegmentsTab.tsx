import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
import { LoadFailed, Loading } from './parts'
import { SegmentDialog } from './SegmentDialog'
import type { Rule, Segment, SegmentOptions } from './types'
import { OPERATOR_WORDS, REASON_WORDS, RULE_OP_WORDS, RULE_TYPE_WORDS } from './words'
import { useCampaignWords } from './design/words'
import { deniedRead } from './design/readState'

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

  const w = useCampaignWords()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const visible = list?.filter(s => s.name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale))) ?? []
  const selected = visible.find(s => s.id === selectedId) ?? visible[0]
  return <>
    {failed && <LoadFailed error={failed} onRetry={() => { void segments.refetch(); void options.refetch() }} />}
    {!(list && opts) && !failed && <Loading />}
    {list && opts && !deniedRead(failed) && <div className="l-cm-segments"><section className="l-cm-panel"><header className="l-cm-panel-head"><h2>{t('loyalty.campaigns.tab.segments', 'Segments')}</h2><span className="l-cm-badge">{w('saved', { number: points(list.length, locale) })}</span></header><label className="l-cm-field"><span>{w('searchSegments')}</span><input type="search" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} /></label>
      <ul className="l-cm-rows">{visible.map(s => <li key={s.id} data-segment={s.id}><button className="l-cm-segment-row" aria-pressed={s.id === selected?.id} onClick={() => setSelectedId(s.id)}><span><strong>{s.name}</strong><small>{s.everyone ? t('loyalty.campaigns.segments.everyone', 'Every active member') : t(`loyalty.campaigns.operator.${s.operator}`, OPERATOR_WORDS[s.operator] ?? s.operator)}</small>{s.problem && <small>{t('loyalty.campaigns.editor.segment_problem', '{{name}} (a rule needs fixing)', { name: s.name })}</small>}</span><span><strong>{points(s.members, locale)}</strong><small>{w('matches')}</small></span><span aria-hidden>→</span></button></li>)}</ul>
      {visible.length === 0 && <p>{w('noSegments')}</p>}<Button className="l-ov-button l-ov-primary" disabled={!!failed} onClick={() => setOpen({ kind: 'edit', segment: null })}>+ {t('loyalty.campaigns.segments.new', 'New segment')}</Button><small>{w('segmentCounts')}</small>
    </section><section className="l-cm-panel l-cm-accent">{selected ? <><h2>{selected.name}</h2>{selected.description && <p>{selected.description}</p>}<RulesText segment={selected} options={opts} />{selected.problem && <Notice tone="warning">{t('loyalty.campaigns.segments.problem', 'Rule {{n}} cannot be used: {{why}} No campaign is sent to this segment until it is fixed.', { n: selected.problem.index !== null ? selected.problem.index + 1 : '–', why: t(`loyalty.campaigns.reason.${selected.problem.reason in REASON_WORDS ? selected.problem.reason : 'bad_rules'}`, REASON_WORDS[selected.problem.reason] ?? REASON_WORDS.bad_rules, reasonBounds(selected.problem.index !== null ? selected.filters[selected.problem.index]?.type : undefined, opts)) })}</Notice>}
      <dl className="l-cm-facts"><dt>{t('loyalty.campaigns.segments.members', 'Members now')}</dt><dd>{points(selected.members, locale)}</dd><dt>{t('loyalty.campaigns.segments.last_sent', 'Last sent')}</dt><dd>{selected.last_sent_at ? day(selected.last_sent_at, locale, boot.venue.timezone) : t('loyalty.campaigns.segments.never', 'Not yet')}</dd></dl><Button className="l-ov-button" variant="secondary" disabled={!!failed} onClick={() => setOpen({ kind: 'edit', segment: selected })}>{w('editRules')}</Button><Button className="l-ov-button" variant="ghost" disabled={!!failed} onClick={() => setOpen({ kind: 'delete', segment: selected })}>{t('loyalty.campaigns.segments.delete', 'Delete')}</Button>
    </> : <p>{w('chooseSegment')}</p>}</section></div>}
    {opts && open?.kind === 'edit' && <SegmentDialog segment={open.segment} options={opts} onClose={() => setOpen(null)} onSaved={s => { setSelectedId(s.id); setSearch('') }} />}
    {open?.kind === 'delete' && <DeleteSegment segment={open.segment} onClose={() => setOpen(null)} />}
  </>
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
