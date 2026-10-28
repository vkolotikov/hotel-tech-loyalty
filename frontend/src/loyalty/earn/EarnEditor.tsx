import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { money, points } from '../lib/format'
import { refusalKey } from '../lib/errors'
import { ERRORS } from '../options/errors'
import { useSay, wayTitle, wayLine } from '../options/say'
import { alwaysOn, previewOptions, sentenceOf } from '../options/optionsMath'
import { OverviewButton } from '../overview/OverviewUI'
import { FormField } from '../ui/formParts'
import type { OptionsAnswer, Way } from '../options/types'
import { EarnFields } from './EarnFields'
import { baseExample, earningUrl } from './model'
import { useOptionDraft } from './useOptionDraft'
import type { EarnGuard } from './useLeaveGuard'
import { useEarnWords } from './words'

export function EarnEditor({ way, answer, guard, bonus = false }: { way: Way; answer: OptionsAnswer; guard: EarnGuard; bonus?: boolean }) {
  const { t, i18n } = useTranslation(), say = useEarnWords(), oldSay = useSay(), boot = useBoot()
  const currency = boot.venue.currency, locale = i18n.language || 'en'
  const draft = useOptionDraft('editor', [way], answer, guard)
  const form = draft.form[way.key]
  const purchase = way.key === 'earn_rate'
  const title = purchase ? say('purchase') : wayTitle(oldSay, way.key)
  const [amount, setAmount] = useState('50')
  const [advanced, setAdvanced] = useState(false)
  const unit = money(1, currency, locale)
  const rate = form.values.points_per_currency ?? String(answer.options.points_per_currency ?? '')
  const example = purchase && draft.valid ? baseExample(amount, rate) : null
  const text = sentenceOf(way.key, previewOptions(way, form, answer.options, answer.fields), { say: oldSay, currency, locale, rewards: answer.catalogue.rewards })
  const disabled = !answer.can_change || draft.busy
  const status = !alwaysOn(way) && <FormField label={say('status')}><select value={form.on ? 'active' : 'off'} disabled={disabled} onChange={e => draft.edit(way.key, { on: e.target.value === 'active' })}><option value="active">{say('active')}</option><option value="off">{say('off')}</option></select></FormField>
  const fields = <EarnFields way={way} form={form} answer={answer} problems={draft.problems} disabled={disabled} currency={currency} bonus={bonus} onChange={(key, value) => draft.edit(way.key, { values: { ...form.values, [key]: value } })} />
  const message = <>{draft.failure && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'save', draft.failure))}</Notice>}{draft.saved && <p role="status" className="l-earn-success">{say('saved')}</p>}</>
  const memberPreview = <div className="l-earn-example" aria-live="polite"><small>{say('memberSees')}</small>{!form.on ? <strong>{say('noBonus')}</strong> : way.key === 'welcome_bonus' || way.key === 'birthday_bonus' ? <><h2>{say(way.key === 'welcome_bonus' ? 'welcomePreview' : 'birthdayPreview', { n: points(Number(previewOptions(way, form, answer.options, answer.fields)[way.zero_off!] ?? 0), locale) })}</h2><p>{say(way.key === 'welcome_bonus' ? 'thankYou' : 'birthdayThanks')}</p></> : <p>{text}</p>}</div>
  if (bonus) return <form className="l-ov-panel l-earn-detail l-earn-bonus-editor" noValidate onSubmit={e => { e.preventDefault(); draft.submit() }}>
    <small className="l-earn-eyebrow">{say(answer.can_change ? 'editBonus' : 'viewSettings')}</small><h2 className="l-earn-detail-title">{title}</h2>{status}{fields}
    {way.key !== 'referrals' && <dl className="l-earn-facts"><dt>{say('awardWhen')}</dt><dd>{say(way.key === 'birthday_bonus' ? 'birthday' : 'joins')}</dd></dl>}
    {memberPreview}<small>{say('messageNote')}</small>{message}
    {answer.can_change && <><OverviewButton primary type="submit" disabled={!draft.dirty || draft.busy}>{draft.pending ? say('saving') : say('saveBonus')}</OverviewButton><button type="button" className="l-ov-link l-earn-cancel" disabled={draft.busy || !draft.dirty} onClick={draft.reset}>{say('cancelChanges')}</button></>}
  </form>
  return <div className="l-ov-page l-rd-page l-earn-page">
    <button type="button" className="l-ov-link l-earn-back" disabled={draft.busy} onClick={() => guard.go(earningUrl('earn', { selected: way.key }))}>{say('allBack')}</button>
    <div className="l-ov-heading"><div><h1>{title}</h1><p>{purchase ? say('editLine') : wayLine(oldSay, way.key)}</p></div><Link className="l-ov-button" to="/loyalty/guide">{t('loyalty.overview.help', 'Help & guide')}</Link></div>
    {!answer.can_change && <Notice>{t('loyalty.options.read_only', 'Only an owner or a manager can change these. You see them as they are.')}</Notice>}
    <form noValidate onSubmit={e => { e.preventDefault(); draft.submit() }} className="l-earn-form">
      <div className="l-earn-columns"><section className="l-ov-panel l-earn-settings">
        <div className="l-earn-heading"><h2>{say('settings')}</h2><span className={`l-earn-state ${form.on ? 'l-earn-on' : ''}`}>{say(form.on ? 'active' : 'off')}</span></div>
        <FormField label={say('ruleName')}><input value={title} readOnly /></FormField>{status}
        <div className={purchase ? 'l-earn-rate-fields' : ''}>{fields}{purchase && <div><strong>{say('perUnit', { unit })}</strong><p>{say('currency', { currency })}</p></div>}</div>
        {purchase && <><div className="l-earn-quick"><small>{say('quick')}</small>{[1, 5, 10].filter(n => n >= (answer.fields.points_per_currency.min ?? 0) && n <= (answer.fields.points_per_currency.max ?? Infinity)).map(n => <OverviewButton key={n} type="button" disabled={disabled} onClick={() => draft.edit(way.key, { values: { ...form.values, points_per_currency: String(n) } })}>{say(n === 1 ? 'onePoint' : 'points', { n })}</OverviewButton>)}</div><div className="l-earn-two l-earn-divider"><div><span className="l-earn-label">{say('levels')}</span><div className="l-earn-readonly">{say('allLevels')}</div></div><div><span className="l-earn-label">{say('purchases')}</span><div className="l-earn-readonly">{say('eligible')}</div></div></div><p>{say('sharedRate')}</p>
          <section className="l-earn-inset"><div className="l-earn-heading"><strong>{say('advanced')}</strong><button type="button" className="l-ov-link" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>{say(advanced ? 'hide' : 'show')} {advanced ? '⌃' : '⌄'}</button></div><p>{say('advancedLine')}</p>{advanced && <p>{say('calculation')}</p>}</section>
          <section className="l-earn-tint"><strong>{say('desk')}</strong><p>{say('deskLine')}</p><Link className="l-ov-link" to={earningUrl('earn', { way: 'desk_earn' })}>{say('deskLink')}</Link></section></>}
        {!purchase && <div className="l-earn-tint" aria-live="polite"><p>{text}</p>{(answer.not_used ?? []).includes(way.key) && <p>{t('loyalty.options.card.not_used', 'Your venue takes no bookings, so this gives nothing.')}</p>}</div>}
        {message}
      </section><aside className="l-earn-side">
        <section className="l-ov-panel l-earn-detail"><small className="l-earn-eyebrow">{say('memberExample')}</small><h2>{say('seeEarn')}</h2>
          {purchase ? <><FormField label={say('amount')}><input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></FormField>
            <div className="l-earn-example" aria-live="polite">{example === null ? <p>{say('invalidExample')}</p> : <><strong className="l-earn-big">{say('points', { n: points(example, locale) })}</strong><p>{say('equation', { amount: money(Number(amount.replace(',', '.')), currency, locale), rate, unit })}</p></>}<small>{say('illustrative')}</small></div>
            <dl className="l-earn-facts"><dt>{say('level')}</dt><dd>{say('baseRate')}</dd><dt>{say('boost')}</dt><dd>{say('noBoost')}</dd></dl><p>{say('finalAmount')}</p></> : <div className="l-earn-example"><p>{text}</p></div>}
          <Link className="l-ov-link" to="/loyalty/program?tab=tiers">{say('viewLevels')}</Link><Link className="l-ov-link" to="/loyalty/program?tab=boosts">{say('viewBoosts')}</Link>
        </section><section className="l-ov-panel l-earn-detail"><strong>{say('separate')}</strong><p>{say('separateLine')}</p><Link className="l-ov-link" to={earningUrl('rule')}>{say('reviewRules')}</Link></section>
      </aside></div>
      <div className="l-earn-save-bar"><div><strong>{say('unsaved')}</strong><small>{say('historyKept')}</small></div><OverviewButton type="button" disabled={draft.busy} onClick={() => guard.go(earningUrl('earn', { selected: way.key }))}>{t('loyalty.options.card.cancel', 'Cancel')}</OverviewButton>{answer.can_change && <OverviewButton primary type="submit" disabled={!draft.dirty || draft.busy}>{draft.pending ? say('saving') : say('save')}</OverviewButton>}</div>
    </form>
  </div>
}
