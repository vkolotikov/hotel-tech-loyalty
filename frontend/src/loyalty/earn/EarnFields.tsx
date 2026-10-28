import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FormField } from '../ui/formParts'
import { NumberControl } from '../redesign/DesignUI'
import { OverviewButton } from '../overview/OverviewUI'
import { money } from '../lib/format'
import { problemText, shown, type Problems, type WayForm } from '../options/optionsMath'
import { CHOICE_WORDS, FIELD_WORDS, HINT_WORDS } from '../options/words'
import { useSay } from '../options/say'
import type { OptionsAnswer, Way } from '../options/types'
import { useEarnWords } from './words'

export function EarnFields({ way, form, answer, problems, disabled, currency, onChange, bonus = false }: {
  way: Way; form: WayForm; answer: OptionsAnswer; problems: Problems; disabled: boolean; currency: string;
  onChange: (key: string, value: string) => void; bonus?: boolean
}) {
  return <div className="l-earn-fields">{way.fields.filter(key => shown(key, form, answer.fields)).map(key => <EarnField key={key} field={key} way={way} form={form} answer={answer} problems={problems} disabled={disabled || !form.on} currency={currency} onChange={onChange} bonus={bonus} />)}</div>
}

function EarnField({ field, way, form, answer, problems, disabled, currency, onChange, bonus }: {
  field: string; way: Way; form: WayForm; answer: OptionsAnswer; problems: Problems; disabled: boolean; currency: string;
  onChange: (key: string, value: string) => void; bonus?: boolean
}) {
  const { t, i18n } = useTranslation(), say = useEarnWords(), oldSay = useSay(), id = useId()
  const def = answer.fields[field]
  if (!def) return null
  const label = bonus && way.zero_off === field ? say('bonusPoints') : t(`loyalty.options.field.${field}`, FIELD_WORDS[field] ?? field, { money: money(1, currency, i18n.language) })
  const problem = problems[field] ? problemText(problems[field], oldSay, i18n.language) : null
  const value = form.values[field] ?? ''
  const hint = field !== 'points_per_currency' && HINT_WORDS[field] ? t(`loyalty.options.hint.${field}`, HINT_WORDS[field]) : null
  if (def.type === 'int' || def.type === 'decimal') return <div data-field={field} className="l-earn-field">
    <span className="l-earn-label">{label}</span>
    <NumberControl label={label} value={value} onValue={v => onChange(field, v)} min={way.zero_off === field && form.on ? Math.max(1, def.min ?? 0) : def.min ?? 0} max={def.max ?? undefined}
      step={def.type === 'decimal' ? .01 : 1} disabled={disabled} invalid={Boolean(problem)} aria-describedby={problem ? `${id}-error` : undefined} />
    {problem && <p className="l-earn-error" id={`${id}-error`} role="alert">{problem}</p>}
    {hint && <small>{hint}</small>}
    {bonus && way.zero_off === field && <><div className="l-earn-quick">{[100, 250, 500].filter(n => n >= (def.min ?? 0) && n <= (def.max ?? Infinity)).map(n => <OverviewButton key={n} type="button" disabled={disabled} onClick={() => onChange(field, String(n))}>{n}</OverviewButton>)}</div><small>{say('pickAmount')}</small></>}
  </div>
  const choices = CHOICE_WORDS[field] ?? {}
  return <div data-field={field}><FormField label={label} problem={problem} hint={hint ?? undefined}>
    <select value={value} disabled={disabled} onChange={e => onChange(field, e.target.value)}>
      {def.type === 'reward' ? <><option value="">{t('loyalty.options.choose_reward', 'Choose a reward…')}</option>{answer.catalogue.rewards.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</> : (def.choices ?? []).map(choice => <option key={choice} value={choice}>{t(`loyalty.options.choice.${field}.${choice}`, choices[choice] ?? choice)}</option>)}
    </select>
  </FormField>{def.type === 'reward' && !answer.catalogue.rewards.length && <p><Link className="l-ov-link" to="/loyalty/rewards">{t('loyalty.options.open_rewards', 'Open Rewards')}</Link></p>}</div>
}
