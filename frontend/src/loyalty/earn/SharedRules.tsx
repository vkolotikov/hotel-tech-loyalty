import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { OverviewButton } from '../overview/OverviewUI'
import { FormField } from '../ui/formParts'
import { refusalKey } from '../lib/errors'
import { ERRORS } from '../options/errors'
import { PROGRESS_BY_WORDS } from '../options/words'
import { useSay } from '../options/say'
import { problemText } from '../options/optionsMath'
import type { OptionsAnswer } from '../options/types'
import { earningUrl } from './model'
import type { EarnGuard } from './useLeaveGuard'
import { useOptionDraft } from './useOptionDraft'
import { useEarnWords } from './words'
import { EditorDialog, EditorFooter, EditorNote, EditorDisclosure, EditorSection } from '../editors/EditorUI'
import { useEditorWords } from '../editors/words'
import { useAdminWords } from '../management/words'

export function SharedRules({ answer, guard, kind = 'both' }: { answer: OptionsAnswer; guard: EarnGuard; full?: boolean; kind?: 'both' | 'points' | 'qualification' }) {
  const say = useEarnWords(), oldSay = useSay(), { t, i18n } = useTranslation()
  const ways = answer.ways.filter(w => (kind === 'points' ? ['points_expiry'] : kind === 'qualification' ? ['tier_progress'] : ['points_expiry', 'tier_progress']).includes(w.key))
  const draft = useOptionDraft('rules', ways, answer, guard)
  const expiry = draft.form.points_expiry, qualify = draft.form.tier_progress
  const value = expiry?.on ? expiry.values.points_expiry_months : '0'
  const [custom, setCustom] = useState(false)
  const def = answer.fields.points_expiry_months
  const presets = [0, 3, 6, 12, 24, 36].filter(n => n >= (def?.min ?? 0) && n <= (def?.max ?? Infinity))
  const customShown = custom || !presets.includes(Number(value))
  const disabled = !answer.can_change || draft.busy
  const error = (key: string) => draft.problems[key] ? problemText(draft.problems[key], oldSay, i18n.language) : null
  const setMonths = (v: string) => draft.edit('points_expiry', { on: v !== '0', values: { ...expiry.values, points_expiry_months: v } })
  const admin = useAdminWords(), editor = useEditorWords()
  const cancel = () => guard.go(kind === 'qualification' ? '/loyalty/program?tab=tiers' : earningUrl('earn'))
  if (!ways.length) return null
  return <EditorDialog area={kind === 'qualification' ? 'program' : 'options'} title={admin(kind === 'qualification' ? 'qualification' : 'pointsSettings')} section={admin(kind === 'qualification' ? 'levels' : 'earning')} icon={kind === 'qualification' ? 'steps' : 'clock'} tone={kind === 'qualification' ? 'cyan' : 'violet'} busy={draft.busy} onClose={cancel}>
    <form className="l-editor-form" noValidate onSubmit={e => { e.preventDefault(); draft.submit() }}><div className="l-editor-body l-editor-stack">
      {expiry && <EditorSection icon="clock" title={say('expiry')}><FormField label={say('expiry')} problem={customShown ? undefined : error('points_expiry_months')}><select value={customShown ? 'custom' : value} disabled={disabled} onChange={e => { if (e.target.value === 'custom') { setCustom(true); return }; setCustom(false); setMonths(e.target.value) }}>{presets.map(n => <option key={n} value={n}>{n === 0 ? say('never') : say('months', { n })}</option>)}<option value="custom">{say('custom')}</option></select></FormField>
        {customShown && <FormField label={say('customMonths')} problem={error('points_expiry_months')}><input type="text" inputMode="numeric" value={value} disabled={disabled} onChange={e => setMonths(e.target.value)} /></FormField>}
        <EditorNote icon="coin" title={editor('spendable')}>{editor('spendableLine')}</EditorNote></EditorSection>}
      {qualify && <><EditorSection icon="steps" title={say('qualify')}><div className="l-editor-choices" role="group" aria-label={say('qualify')}>{(answer.fields.tier_progress_by?.choices ?? []).map(choice => <OverviewButton key={choice} type="button" aria-pressed={qualify.values.tier_progress_by === choice} disabled={disabled} onClick={() => draft.edit('tier_progress', { values: { ...qualify.values, tier_progress_by: choice } })}>{t(`loyalty.options.choice.tier_progress_by.${choice}`, PROGRESS_BY_WORDS[choice] ?? choice)}</OverviewButton>)}</div>{error('tier_progress_by') && <p role="alert" className="text-a-danger">{error('tier_progress_by')}</p>}</EditorSection>
      <EditorNote icon="steps" title={admin('qualification')}>{say('qualificationLine')}</EditorNote><EditorDisclosure title={admin('advanced')}><p>{t('loyalty.options.hint.tier_progress_by', 'A change moves nobody at once: each member’s tier follows at their next visit or points.')}</p></EditorDisclosure></>}
      {draft.failure && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'save', draft.failure))}</Notice>}{draft.saved && <p role="status" className="l-earn-success">{say('saved')}</p>}
    </div><EditorFooter canSave={answer.can_change} onCancel={cancel} busy={draft.busy} dirty={draft.dirty} disabled={!answer.can_change || !draft.dirty} save={say('saveRules')} /></form>
  </EditorDialog>
}
