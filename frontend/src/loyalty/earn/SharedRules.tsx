import { useState } from 'react'
import { Link } from 'react-router-dom'
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

export function SharedRules({ answer, guard, full = false }: { answer: OptionsAnswer; guard: EarnGuard; full?: boolean }) {
  const say = useEarnWords(), oldSay = useSay(), { t, i18n } = useTranslation()
  const ways = answer.ways.filter(w => ['points_expiry', 'tier_progress'].includes(w.key))
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
  if (!ways.length) return null
  return <form className="l-ov-panel l-earn-shared" noValidate onSubmit={e => { e.preventDefault(); draft.submit() }}>
    <h2>{say('sharedRules')}</h2><p>{say('sharedRulesLine')}</p>
    <div className="l-earn-two">
      {expiry && <div><FormField label={say('expiry')} problem={customShown ? undefined : error('points_expiry_months')}><select value={customShown ? 'custom' : value} disabled={disabled} onChange={e => { if (e.target.value === 'custom') { setCustom(true); return }; setCustom(false); setMonths(e.target.value) }}>{presets.map(n => <option key={n} value={n}>{n === 0 ? say('never') : say('months', { n })}</option>)}<option value="custom">{say('custom')}</option></select></FormField>
        {customShown && <FormField label={say('customMonths')} problem={error('points_expiry_months')}><input type="text" inputMode="numeric" value={value} disabled={disabled} onChange={e => setMonths(e.target.value)} /></FormField>}
      </div>}
      {qualify && <FormField label={say('qualify')} problem={error('tier_progress_by')}><select value={qualify.values.tier_progress_by} disabled={disabled} onChange={e => draft.edit('tier_progress', { values: { ...qualify.values, tier_progress_by: e.target.value } })}>{(answer.fields.tier_progress_by?.choices ?? []).map(choice => <option key={choice} value={choice}>{t(`loyalty.options.choice.tier_progress_by.${choice}`, PROGRESS_BY_WORDS[choice] ?? choice)}</option>)}</select></FormField>}
    </div><p>{say('qualificationLine')}</p>
    {full && <p>{t('loyalty.options.hint.tier_progress_by', 'A change moves nobody at once: each member’s tier follows at their next visit or points.')}</p>}
    {draft.failure && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'save', draft.failure))}</Notice>}{draft.saved && <p role="status" className="l-earn-success">{say('saved')}</p>}
    <div className="l-earn-heading">{!full && <Link className="l-ov-link" to={earningUrl('rule')}>{say('reviewAll')}</Link>}{answer.can_change && <div className="l-rd-actions">{draft.dirty && <button type="button" className="l-ov-link" disabled={draft.busy} onClick={draft.reset}>{say('cancelChanges')}</button>}<OverviewButton type="submit" disabled={!draft.dirty || draft.busy}>{say('saveRules')}</OverviewButton></div>}</div>
  </form>
}
