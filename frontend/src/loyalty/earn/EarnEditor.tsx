import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { money, points } from '../lib/format'
import { refusalKey } from '../lib/errors'
import { ERRORS } from '../options/errors'
import { useSay, wayTitle } from '../options/say'
import { alwaysOn, previewOptions, sentenceOf } from '../options/optionsMath'
import { OverviewButton } from '../overview/OverviewUI'
import { FormField } from '../ui/formParts'
import type { OptionsAnswer, Way } from '../options/types'
import { EarnFields } from './EarnFields'
import { baseExample, earningUrl } from './model'
import { useOptionDraft } from './useOptionDraft'
import type { EarnGuard } from './useLeaveGuard'
import { useEarnWords } from './words'
import { EditorDialog, EditorFooter, EditorSection, EditorPreview, EditorArt, EditorNote, EditorDisclosure, EditorSwitch } from '../editors/EditorUI'
import { useEditorWords } from '../editors/words'
import { useAdminWords } from '../management/words'
import { ManagementFact } from '../management/ManagementUI'

export function EarnEditor({ way, answer, guard, bonus = false }: { way: Way; answer: OptionsAnswer; guard: EarnGuard; bonus?: boolean }) {
  const { t, i18n } = useTranslation(), say = useEarnWords(), oldSay = useSay(), boot = useBoot()
  const currency = boot.venue.currency, locale = i18n.language || 'en'
  const draft = useOptionDraft('editor', [way], answer, guard)
  const form = draft.form[way.key]
  const purchase = way.key === 'earn_rate'
  const title = purchase ? say('purchase') : wayTitle(oldSay, way.key)
  const [amount, setAmount] = useState('50')
  const editor = useEditorWords(), admin = useAdminWords()
  const unit = money(1, currency, locale)
  const rate = form.values.points_per_currency ?? String(answer.options.points_per_currency ?? '')
  const example = purchase && draft.valid ? baseExample(amount, rate) : null
  const text = sentenceOf(way.key, previewOptions(way, form, answer.options, answer.fields), { say: oldSay, currency, locale, rewards: answer.catalogue.rewards })
  const disabled = !answer.can_change || draft.busy
  const status = !alwaysOn(way) && <EditorSwitch label={title} checked={form.on} disabled={disabled} onChange={on => draft.edit(way.key, { on })} />
  const fields = <EarnFields way={way} form={form} answer={answer} problems={draft.problems} disabled={disabled} currency={currency} bonus={bonus} onChange={(key, value) => draft.edit(way.key, { values: { ...form.values, [key]: value } })} />
  const message = <>{draft.failure && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'save', draft.failure))}</Notice>}{draft.saved && <p role="status" className="l-earn-success">{say('saved')}</p>}</>
  const cancel = () => guard.go(earningUrl(bonus ? 'bonus' : 'earn', { selected: way.key }))
  const memberPreview = <EditorNote icon={way.key === 'referrals' ? 'people' : 'gift'} title={say('memberSees')}>{!form.on ? say('noBonus') : text}</EditorNote>
  return <EditorDialog area="options" title={purchase && answer.can_change ? say('editPurchase') : title} section={admin(bonus ? 'bonuses' : 'earning')} icon={bonus ? way.key === 'referrals' ? 'people' : 'gift' : 'coin'} tone={bonus ? 'violet' : 'cyan'} wide={!bonus} onClose={cancel} busy={draft.busy}>
    <form className="l-editor-form" noValidate onSubmit={e => { e.preventDefault(); draft.submit() }}><div className="l-editor-body"><div className={bonus ? 'l-editor-stack' : 'l-editor-columns'}><div className="l-editor-stack">
      {!answer.can_change && <Notice>{t('loyalty.options.read_only', 'Only an owner or a manager can change these. You see them as they are.')}</Notice>}
      <EditorSection icon={bonus ? 'gift' : 'coin'} title={bonus ? title : say('settings')}>
        {purchase ? <><div className="l-editor-two"><FormField label={say('ruleName')}><input value={title} readOnly /></FormField>{fields}</div><div className="l-earn-quick">{[1, 5, 10].filter(n => n >= (answer.fields.points_per_currency.min ?? 0) && n <= (answer.fields.points_per_currency.max ?? Infinity)).map(n => <OverviewButton key={n} type="button" aria-pressed={Number(rate) === n} disabled={disabled} onClick={() => draft.edit(way.key, { values: { ...form.values, points_per_currency: String(n) } })}>{say(n === 1 ? 'onePoint' : 'points', { n })}</OverviewButton>)}</div></> : fields}
        {status}
      </EditorSection>
      {purchase && <><EditorSection icon="people" title={say('levels')}><div className="l-editor-two"><FormField label={say('levels')}><input value={say('allLevels')} readOnly /></FormField><FormField label={editor('currency')}><input value={say('currency', { currency })} readOnly /></FormField></div><EditorNote title={editor('sharedRate')}>{say('sharedRate')} {say('eligible')}</EditorNote></EditorSection><EditorDisclosure title={say('advanced')}><p>{say('calculation')}</p><p>{say('deskLine')}</p></EditorDisclosure></>}
      {!purchase && !bonus && <EditorNote title={say('memberSees')}>{text}{(answer.not_used ?? []).includes(way.key) && <p>{t('loyalty.options.card.not_used', 'Your venue takes no bookings, so this gives nothing.')}</p>}</EditorNote>}
      {bonus && <>{memberPreview}<small>{say('messageNote')}</small></>}
      {message}
    </div>{!bonus && <EditorPreview><EditorArt kind="earnArt" label={say('baseRate')} title={purchase ? example === null ? say('invalidExample') : say('points', { n: points(example, locale) }) : title} line={purchase ? say('equation', { amount: money(Number(amount.replace(',', '.')), currency, locale), rate, unit }) : text} />
      <ManagementFact icon="people" label={admin('whoEarn')}>{say('allLevels')}</ManagementFact><ManagementFact icon="purchase" label={editor('calculation')}>{admin('basePoints')}</ManagementFact>
      {purchase && <EditorDisclosure title={say('amount')}><FormField label={say('amount')}><input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></FormField></EditorDisclosure>}
      <small>{say('illustrative')}</small>
    </EditorPreview>}</div></div><EditorFooter canSave={answer.can_change} onCancel={cancel} busy={draft.busy} dirty={draft.dirty} disabled={!answer.can_change || !draft.dirty} save={draft.pending ? say('saving') : bonus ? say('saveBonus') : say('save')} /></form>
  </EditorDialog>
}
