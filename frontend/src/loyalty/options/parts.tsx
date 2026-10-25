import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Cake, Coins, DoorOpen, Gift, Hourglass, PiggyBank, ShoppingBag, Sparkles, Stamp, TrendingUp, Users, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { money } from '../lib/format'
import { named } from '../lib/forms'
import { FormField } from '../ui/formParts'
import { ERRORS } from './errors'
import { problemText, shown, type Problems, type WayForm } from './optionsMath'
import { useSay } from './say'
import type { CatalogueReward, FieldDef, Way } from './types'
import { CHOICE_WORDS, FIELD_WORDS, HINT_WORDS } from './words'

export const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text disabled:opacity-60'

/** Each way's mark; a way the workspace does not know wears the area's own. */
const WAY_ICONS: Record<string, LucideIcon> = {
  points_on_spend: Coins,
  points_expiry: Hourglass,
  welcome_bonus: Gift,
  birthday_bonus: Cake,
  referrals: Users,
  stamp_card: Stamp,
  check_in: DoorOpen,
  desk_earn: ShoppingBag,
  cashback: PiggyBank,
  tier_progress: TrendingUp,
}

export function WayIcon({ way, on }: { way: string; on: boolean }) {
  const Icon = WAY_ICONS[way] ?? Sparkles
  return (
    <span aria-hidden className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-a-accent/15 text-a-accent-text' : 'bg-a-surface-2 text-a-text-2'}`}>
      <Icon size={20} />
    </span>
  )
}

/**
 * An on/off switch: a real button that says whether it is on (`role="switch"`), Space and Enter toggle it. Its label
 * is the way's title, read by a screen reader with its state.
 */
export function Switch({ on, label, disabled = false, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${on ? 'border-transparent bg-a-accent' : 'border-a-border bg-a-surface-2'}`}>
      <span aria-hidden className={`inline-block h-5 w-5 rounded-full shadow-a-sm transition duration-150 ${on ? 'translate-x-6 bg-a-accent-ink' : 'translate-x-1 bg-a-surface'}`} />
    </button>
  )
}

/** What members get with a way, as it stands — the line that changes as someone types. */
export function Sentence({ children }: { children: ReactNode }) {
  return (
    <p data-sentence="" aria-live="polite" className="rounded-xl bg-a-surface-2 px-3.5 py-2.5 text-sm font-medium text-a-text">
      {children}
    </p>
  )
}

/**
 * A card's fields while it is on: a number as text (the language's decimal comma reads too), a choice as buttons, and
 * a reward from the catalogue. A field that counts only with another's value (a full card's points or reward) shows
 * only then. Each field says what is wrong with it under it.
 */
export function WayFields({ way, form, fields, rewards, problems, disabled, currency, locale, onChange }: {
  way: Way
  form: WayForm
  fields: Record<string, FieldDef>
  rewards: CatalogueReward[]
  problems: Problems
  disabled: boolean
  currency: string
  locale: string
  onChange: (key: string, text: string) => void
}) {
  const { t } = useTranslation()
  const say = useSay()
  const keys = way.fields.filter(key => key !== way.zero_off || form.on).filter(key => shown(key, form, fields))
  if (keys.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {keys.map(key => {
        const def = fields[key]
        const label = named('loyalty.options.field', FIELD_WORDS, key)
        const hint = named('loyalty.options.hint', HINT_WORDS, key)
        const labelText = label ? t(label[0], label[1], { money: money(1, currency, locale) }) : key
        const problem = problems[key] ? problemText(problems[key], say, locale) : null
        if (def?.type === 'enum') {
          return (
            <ChoiceField key={key} name={key} label={labelText} choices={def.choices ?? []} value={form.values[key] ?? ''} problem={problem}
              disabled={disabled} onChange={(value) => onChange(key, value)} />
          )
        }
        return (
          <div key={key} data-field={key} className={def?.type === 'reward' ? 'sm:col-span-2' : undefined}>
            <FormField label={labelText} hint={hint ? t(...hint) : undefined} problem={problem}>
              {def?.type === 'reward'
                ? <RewardSelect value={form.values[key] ?? ''} rewards={rewards} disabled={disabled} onChange={(value) => onChange(key, value)} />
                : (
                  <input type="text" inputMode={def?.type === 'decimal' ? 'decimal' : 'numeric'} value={form.values[key] ?? ''} disabled={disabled}
                    autoComplete="off" onChange={(e) => onChange(key, e.target.value)} className={`${INPUT} tabular-nums`} />
                )}
            </FormField>
          </div>
        )
      })}
    </div>
  )
}

/** A choice of the server's values, as a group of radio buttons (the arrow keys move between them). */
function ChoiceField({ name, label, choices, value, problem, disabled, onChange }: {
  name: string
  label: string
  choices: string[]
  value: string
  problem: string | null
  disabled: boolean
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const words = CHOICE_WORDS[name] ?? {}
  return (
    <fieldset data-field={name} className="sm:col-span-2" aria-describedby={problem ? `${id}-problem` : undefined}>
      <legend className="mb-1 block text-xs font-medium text-a-text-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map(choice => {
          const word = named(`loyalty.options.choice.${name}`, words, choice)
          const on = value === choice
          return (
            <label key={choice} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-a-accent-text ${on ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
              <input type="radio" name={`${id}-${name}`} value={choice} checked={on} disabled={disabled} onChange={() => onChange(choice)} className="sr-only" />
              {word ? t(...word) : choice}
            </label>
          )
        })}
      </div>
      {problem && <p id={`${id}-problem`} className="mt-1 text-xs font-medium text-a-danger">{problem}</p>}
    </fieldset>
  )
}

/** The rewards a full card may give (the catalogue's active ones); none yet says where to add one. */
function RewardSelect({ value, rewards, disabled, onChange, ...aria }: {
  value: string
  rewards: CatalogueReward[]
  disabled: boolean
  onChange: (value: string) => void
  /** What FormField puts on its control. */
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const { t } = useTranslation()
  if (rewards.length === 0) {
    return (
      <p data-no-rewards="" className="rounded-lg border border-dashed border-a-border px-3 py-2 text-sm text-a-text-2" {...aria}>
        {t('loyalty.options.no_rewards', 'Your catalogue has no rewards yet. Add one under Rewards, or let a full card give points.')}{' '}
        <Link to="/loyalty/rewards" className="font-medium text-a-accent-text hover:underline">{t('loyalty.options.open_rewards', 'Open Rewards')}</Link>
      </p>
    )
  }
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={INPUT} {...aria}>
      <option value="">{t('loyalty.options.choose_reward', 'Choose a reward…')}</option>
      {rewards.map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
    </select>
  )
}

/** While the options load, and when they could not. */
export function Loading() {
  const { t } = useTranslation()
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
      <div className="grid gap-3 xl:grid-cols-2"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
    </div>
  )
}

export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="max-w-xl space-y-3">
      <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'load', failureOf(error)))}</Notice>
      <Button variant="secondary" onClick={onRetry}>{t('loyalty.common.retry', 'Try again')}</Button>
    </div>
  )
}
