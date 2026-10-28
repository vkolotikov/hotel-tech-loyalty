import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { useFirstFocus } from '../lib/useFirstFocus'
import { useLook } from '../lib/look'
import { FormField, FormFoot, Toggle } from '../ui/formParts'
import { TierChip } from '../ui/TierChip'
import { afterSegmentChange, campaignsApi, previewKey } from './api'
import {
  kindOf, MAX_SEGMENT_DESCRIPTION, MAX_SEGMENT_NAME, previewOf, reasonBounds, ruleRow, segmentBody, segmentFormOf, segmentProblems,
  serverRuleProblem, toggledTier, withType, type RuleRow, type SegmentForm,
} from './campaignsMath'
import { ERRORS } from './errors'
import type { Segment, SegmentOptions } from './types'
import { OPERATOR_WORDS, REASON_WORDS, RULE_OP_WORDS, RULE_TYPE_WORDS, SEGMENT_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Make or change a segment (spec 2026-10-21 release 2 §6): a name, Everyone or rules (each a type, an operator and a
 * value that suits the type: tier chips, a number, days, a date), all or any of them, and a live count of the active
 * members it matches with ten of them, asked once typing pauses. The choices are the server's (`segments/options`).
 * Nothing is counted or saved while a rule has a problem: the shared service would skip such a rule and match more.
 */
export function SegmentDialog({ segment, options, onClose, initial, onSaved }: { segment: Segment | null; options: SegmentOptions; onClose: () => void; initial?: Segment; onSaved?: (segment: Segment) => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const [form, setForm] = useState<SegmentForm>(() => segmentFormOf(segment ?? initial ?? null, options))
  const [tried, setTried] = useState(false)

  const save = useMutation({
    mutationFn: () => (segment ? campaignsApi.updateSegment(segment.id, segmentBody(form, options)) : campaignsApi.createSegment(segmentBody(form, options))),
    onSuccess: (answer) => { afterSegmentChange(client); onSaved?.(answer.segment); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterSegmentChange(client) },
  })
  const update = (patch: Partial<SegmentForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }
  const setRule = (i: number, row: RuleRow) => update({ rules: form.rules.map((r, j) => (j === i ? row : r)) })

  // The live count: asked once the rules have no problem and typing paused.
  const body = previewOf(form, options)
  const key = body ? JSON.stringify(body) : null
  const [asked, setAsked] = useState<string | null>(key)
  useEffect(() => {
    if (key === asked) return undefined
    const timer = window.setTimeout(() => setAsked(key), 400)
    return () => window.clearTimeout(timer)
  }, [key, asked])
  const preview = useQuery({
    queryKey: previewKey(asked ?? ''),
    queryFn: () => campaignsApi.previewSegment(JSON.parse(asked ?? '{}')),
    enabled: asked !== null,
    placeholderData: keepPreviousData,
    retry: false,
  })

  const failure = save.isError ? failureOf(save.error) : null
  const server = serverRuleProblem(failure) ?? serverRuleProblem(preview.isError ? failureOf(preview.error) : null)
  const own = segmentProblems(form, options)
  const formProblems = tried ? own.form : {}
  // A rule not filled in yet is not called wrong before the first Save; any other problem shows as it is typed.
  const ruleProblem = (i: number): string | null => {
    const mine = own.rules[i]
    if (mine && (tried || mine !== 'no_value')) return mine
    return server?.index === i ? server.reason : null
  }
  const reason = (code: string, type?: string) =>
    t(`loyalty.campaigns.reason.${code in REASON_WORDS ? code : 'bad_rules'}`, REASON_WORDS[code] ?? REASON_WORDS.bad_rules, reasonBounds(type, options))
  const wholeProblem = formProblems.rules ?? (server && server.index === null ? server.reason : null)

  return (
    <Dialog title={segment ? t('loyalty.campaigns.segment.edit_title', 'Change {{name}}', { name: segment.name }) : t('loyalty.campaigns.segment.new_title', 'New segment')}
      onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        const p = segmentProblems(form, options)
        if (Object.keys(p.form).length === 0 && Object.keys(p.rules).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.campaigns.segment.name', 'Name')}
          problem={formProblems.name ? t('loyalty.campaigns.segment.problem.name', SEGMENT_PROBLEM_WORDS.name) : null}>
          <input ref={first} type="text" value={form.name} maxLength={MAX_SEGMENT_NAME} onChange={(e) => update({ name: e.target.value })} className={INPUT}
            placeholder={t('loyalty.campaigns.segment.name_example', 'e.g. Gold members not seen since summer')} />
        </FormField>
        <FormField label={t('loyalty.campaigns.segment.description', 'Description')} hint={t('loyalty.campaigns.segment.description_hint', 'Optional. Only staff see it.')}
          problem={formProblems.description ? t('loyalty.campaigns.segment.problem.description', SEGMENT_PROBLEM_WORDS.description) : null}>
          <input type="text" value={form.description} maxLength={MAX_SEGMENT_DESCRIPTION} onChange={(e) => update({ description: e.target.value })} className={INPUT} />
        </FormField>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-a-text-2">{t('loyalty.campaigns.segment.who', 'Who is in it')}</legend>
          <label className="flex items-start gap-2.5 text-sm text-a-text">
            <input type="radio" name="segment-who" checked={form.everyone} onChange={() => update({ everyone: true })} className="mt-0.5 accent-a-accent-text" />
            <span>
              <span className="block font-medium">{t('loyalty.campaigns.segment.everyone', 'Everyone')}</span>
              <span className="block text-xs text-a-text-2">{t('loyalty.campaigns.segment.everyone_hint', 'Every active member of the programme.')}</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-a-text">
            <input type="radio" name="segment-who" checked={!form.everyone}
              onChange={() => update({ everyone: false, rules: form.rules.length > 0 ? form.rules : [ruleRow(options)] })} className="mt-0.5 accent-a-accent-text" />
            <span className="block font-medium">{t('loyalty.campaigns.segment.by_rules', 'Members chosen by rules')}</span>
          </label>
        </fieldset>

        {!form.everyone && (
          <div className="space-y-3 rounded-xl border border-a-border p-3">
            <FormField label={t('loyalty.campaigns.segment.combine', 'Match')}>
              <select value={form.operator} onChange={(e) => update({ operator: e.target.value })} className={INPUT}>
                {options.operators.map(op => <option key={op} value={op}>{op in OPERATOR_WORDS ? t(`loyalty.campaigns.operator.${op}`, OPERATOR_WORDS[op]) : op}</option>)}
              </select>
            </FormField>
            <ol className="space-y-3">
              {form.rules.map((row, i) => (
                <RuleEditor key={i} index={i} row={row} options={options} problem={ruleProblem(i)} reason={reason}
                  onChange={(next) => setRule(i, next)} onRemove={() => update({ rules: form.rules.filter((_, j) => j !== i) })} />
              ))}
            </ol>
            {form.rules.length < options.max_rules && (
              <Button type="button" size="sm" variant="secondary" onClick={() => update({ rules: [...form.rules, ruleRow(options)] })}>
                <Plus size={14} aria-hidden />{t('loyalty.campaigns.segment.add_rule', 'Add rule')}
              </Button>
            )}
            {wholeProblem && <p className="text-xs font-medium text-a-danger">{reason(wholeProblem)}</p>}
          </div>
        )}

        <section aria-live="polite" className="space-y-2 rounded-xl bg-a-surface-2 p-3" data-preview="">
          {key === null ? (
            <p className="text-sm text-a-text-2">{t('loyalty.campaigns.segment.preview_wait', 'Fill in every rule to see who matches.')}</p>
          ) : preview.isError ? (
            <p className="text-sm text-a-danger">{t(...refusalKey('loyalty.campaigns', ERRORS, 'count', failureOf(preview.error)))}</p>
          ) : !preview.data ? (
            <p className="text-sm text-a-text-2">{t('loyalty.campaigns.segment.counting', 'Counting…')}</p>
          ) : (
            <>
              <p className={`text-sm text-a-text ${preview.isFetching || asked !== key ? 'opacity-70' : ''}`}>
                {t('loyalty.campaigns.segment.count', '{{number}} active members match · {{marketing}} of them agreed to marketing email', {
                  number: points(preview.data.count, locale), marketing: points(preview.data.marketing, locale),
                })}
              </p>
              {preview.data.sample.length > 0 && (
                <ul className="space-y-0.5 text-xs text-a-text-2" aria-label={t('loyalty.campaigns.segment.sample', 'Some of them')}>
                  {preview.data.sample.map(m => (
                    <li key={m.id} className="truncate">
                      <span className="text-a-text">{m.name || m.email || `#${m.id}`}</span>
                      {m.member_number && <span> · {m.member_number}</span>}
                      <span> · {t('loyalty.common.points_count', '{{points}} pts', { points: points(m.points, locale) })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.campaigns', ERRORS, 'segment', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose}
          save={segment ? t('loyalty.campaigns.segment.save', 'Save segment') : t('loyalty.campaigns.segment.create', 'Add segment')} />
      </form>
    </Dialog>
  )
}

/** One rule: its type, how it compares, and a value that suits the type. */
function RuleEditor({ index, row, options, problem, reason, onChange, onRemove }: {
  index: number
  row: RuleRow
  options: SegmentOptions
  problem: string | null
  reason: (code: string, type?: string) => string
  onChange: (row: RuleRow) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const look = useLook()
  const rt = options.types.find(x => x.type === row.type)
  const kind = kindOf(row.type, options)
  const n = index + 1
  const typeWord = (type: string) => (type in RULE_TYPE_WORDS ? t(`loyalty.campaigns.rule_type.${type}`, RULE_TYPE_WORDS[type]) : type)
  const opWord = (op: string) => {
    const key = `${row.type}_${op}`
    return key in RULE_OP_WORDS ? t(`loyalty.campaigns.rule_op.${key}`, RULE_OP_WORDS[key]) : op
  }
  const shownTiers = options.tiers.filter(tier => tier.is_active || row.tiers.includes(tier.id))

  return (
    <li data-rule={index} className="space-y-2 rounded-lg border border-a-border bg-a-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-a-text-2">{t('loyalty.campaigns.segment.rule_n', 'Rule {{n}}', { n })}</span>
        <button type="button" onClick={onRemove} aria-label={t('loyalty.campaigns.segment.remove_rule', 'Remove rule {{n}}', { n })}
          className="rounded p-1 text-a-text-2 hover:text-a-text">
          <X size={15} aria-hidden />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="sr-only">{t('loyalty.campaigns.segment.rule_type', 'Kind of rule {{n}}', { n })}</span>
          <select value={row.type} onChange={(e) => onChange(withType(row, e.target.value, options))} className={INPUT}>
            {options.types.map(x => <option key={x.type} value={x.type}>{typeWord(x.type)}</option>)}
            {!rt && <option value={row.type}>{row.type}</option>}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">{t('loyalty.campaigns.segment.rule_op', 'How rule {{n}} compares', { n })}</span>
          <select value={row.op} onChange={(e) => onChange({ ...row, op: e.target.value })} className={INPUT}>
            {(rt?.ops ?? []).map(op => <option key={op} value={op}>{opWord(op)}</option>)}
            {!(rt?.ops ?? []).includes(row.op) && <option value={row.op}>{row.op}</option>}
          </select>
        </label>
      </div>

      {kind === 'tiers' && (
        <div role="group" aria-label={t('loyalty.campaigns.segment.rule_tiers', 'Tiers of rule {{n}}', { n })} className="flex flex-wrap gap-2">
          {shownTiers.map(tier => (
            <Toggle key={tier.id} on={row.tiers.includes(tier.id)} onClick={() => onChange(toggledTier(row, tier.id, options))}>
              <TierChip tier={tier} theme={look.resolved} size="sm" />
            </Toggle>
          ))}
        </div>
      )}
      {(kind === 'days' || kind === 'points') && (
        <label className="flex items-center gap-2">
          <span className="sr-only">{t('loyalty.campaigns.segment.rule_value', 'Value of rule {{n}}', { n })}</span>
          <input type="number" inputMode="numeric" step={1} min={typeof rt?.min === 'number' ? rt.min : undefined} max={typeof rt?.max === 'number' ? rt.max : undefined}
            value={row.text} onChange={(e) => onChange({ ...row, text: e.target.value })} className={`${INPUT} max-w-[10rem]`} />
          <span className="text-sm text-a-text-2">
            {kind === 'days' ? t('loyalty.campaigns.segment.unit_days', 'days') : t('loyalty.campaigns.segment.unit_points', 'points')}
          </span>
        </label>
      )}
      {kind === 'date' && (
        <label className="block">
          <span className="sr-only">{t('loyalty.campaigns.segment.rule_value', 'Value of rule {{n}}', { n })}</span>
          <input type="date" min={typeof rt?.min === 'string' ? rt.min : undefined} max={typeof rt?.max === 'string' ? rt.max : undefined}
            value={row.text} onChange={(e) => onChange({ ...row, text: e.target.value })} className={`${INPUT} max-w-[12rem]`} />
        </label>
      )}
      {kind === 'date' && <p className="text-xs text-a-text-2">{t('loyalty.campaigns.segment.date_hint', 'Counted from midnight UTC on that day.')}</p>}

      {problem && <p className="text-xs font-medium text-a-danger">{reason(problem, row.type)}</p>}
    </li>
  )
}
