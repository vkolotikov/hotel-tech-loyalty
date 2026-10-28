import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { money, points } from '../lib/format'
import { OverviewButton } from '../overview/OverviewUI'
import { DesignDialog } from '../redesign/DesignUI'
import { useRedesignWords } from '../redesign/words'
import { OPTIONS_KEY, optionsApi } from '../options/optionsApi'
import { isOn, sentenceOf } from '../options/optionsMath'
import { LoadFailed, Loading } from '../options/parts'
import { groupOf } from '../options/groups'
import { useSay, wayLine, wayTitle } from '../options/say'
import { SetupBanner } from '../options/SetupBanner'
import { OptionsPage } from '../options/OptionsPage'
import type { OptionsAnswer, Way } from '../options/types'
import { ADVICE_WORDS } from '../options/words'
import { EarnEditor } from './EarnEditor'
import { SharedRules } from './SharedRules'
import { baseExample, earningUrl, earnLocation, filteredWays, type EarnStatus } from './model'
import { useLeaveGuard } from './useLeaveGuard'
import { useEarnWords } from './words'
import earnIcon from './assets/earn-selected.svg'
import './earn.css'

/** WE-01–03: server-described methods and existing partial saves, in the final Figma layout. */
export function EarnPage() {
  const query = useQuery({ queryKey: OPTIONS_KEY, queryFn: optionsApi.options, refetchOnWindowFocus: false })
  const location = useLocation(), navigate = useNavigate(), say = useEarnWords(), rd = useRedesignWords(), { t, i18n } = useTranslation(), oldSay = useSay()
  const boot = useBoot(), guard = useLeaveGuard()
  const [adding, setAdding] = useState(false)
  const data = query.data
  const state = earnLocation(location.search, data?.ways ?? [])
  const title = (way: Way) => way.key === 'earn_rate' ? say('purchase') : wayTitle(oldSay, way.key)
  const descriptions = { earn_rate: 'purchaseLine', points_on_spend: 'bookingLine', stamp_card: 'stampLine', check_in: 'checkinLine', desk_earn: 'deskShortLine', cashback: 'cashbackLine' } as const
  const description = (way: Way) => way.key in descriptions ? say(descriptions[way.key as keyof typeof descriptions]) : wayLine(oldSay, way.key)
  const locale = i18n.language || 'en', currency = boot.venue.currency, unit = money(1, currency, locale)
  const text = (way: Way) => data ? sentenceOf(way.key, data.options, { say: oldSay, currency, locale, rewards: data.catalogue.rewards }) : ''
  const warnings = (data?.advice ?? []).filter(a => a.level === 'warn' && ADVICE_WORDS[a.code]).length
  const groupWays = data?.ways.filter(w => groupOf(w.key) === state.tab) ?? []
  const visible = data ? filteredWays(data, state.tab, state.q, state.status, w => `${title(w)} ${description(w)}`) : []
  const selected = visible.find(w => w.key === state.selected) ?? visible[0]
  const editor = data?.ways.find(w => w.key === state.way)
  const active = groupWays.filter(w => isOn(w, data!.options) && !(data?.not_used ?? []).includes(w.key)).length
  const bonus = state.tab === 'bonus'
  const filters = (patch: { q?: string; status?: EarnStatus }) => navigate(earningUrl(state.tab, { selected: state.selected, q: state.q, status: state.status, ...patch }), { replace: true })
  const picked = (way: Way) => guard.go(earningUrl(state.tab, { selected: way.key, q: state.q, status: state.status }))
  const checks = <Link className="l-ov-link" to={earningUrl('overview')}>{say('checks')}{warnings ? ` (${warnings})` : ''}</Link>
  const discard = guard.destination && <DesignDialog title={say('discardTitle')} onClose={guard.keep} busy={guard.busy}><p>{say('discardLine')}</p><div className="l-rd-actions"><OverviewButton onClick={guard.keep}>{rd('keepEditing')}</OverviewButton><OverviewButton primary onClick={guard.discard}>{rd('discard')}</OverviewButton></div></DesignDialog>
  if (query.isError) return <div className="l-ov-page l-rd-page"><h1>{say('title')}</h1><LoadFailed error={query.error} onRetry={() => { void query.refetch() }} /></div>
  if (!data) return <div className="l-ov-page l-rd-page"><h1>{say('title')}</h1><Loading /></div>
  if (state.tab === 'overview') return <OptionsPage />
  if (editor && !bonus && state.tab !== 'rule') return <><EarnEditor key={editor.key} way={editor} answer={data} guard={guard} />{discard}</>
  return <div className="l-ov-page l-rd-page l-earn-page">
    <div className="l-ov-heading"><div><h1>{say(bonus ? 'bonuses' : state.tab === 'rule' ? 'rules' : 'title')}</h1><p>{say(bonus ? 'bonusLine' : state.tab === 'rule' ? 'sharedRulesLine' : 'line')}</p></div><div className="l-rd-actions">{bonus || state.tab === 'rule' ? <Link className="l-ov-button" to={earningUrl('earn')}>{say('earning')}</Link> : data.can_change && <><Link className="l-ov-button" to="/loyalty/options/setup">{rd('guidedSetup')}</Link><OverviewButton primary onClick={() => setAdding(true)}>{say('add')}</OverviewButton></>}</div></div>
    {!data.can_change && <Notice>{t('loyalty.options.read_only', 'Only an owner or a manager can change these. You see them as they are.')}</Notice>}
    {state.tab === 'rule' ? <><SharedRules answer={data} guard={guard} full />{checks}</> : <>
      <section className="l-earn-hero"><div><h2>{say(bonus ? 'bonusHero' : 'hero')}</h2><p>{say(bonus ? 'bonusHeroLine' : 'heroLine')}</p></div><small>{say(bonus ? 'activeBonuses' : 'activeMethods', { n: active })}</small></section>
      {!bonus && <div className="l-earn-filters"><label><span>{say('search')}</span><input value={state.q} placeholder={say('searchHint')} onChange={e => filters({ q: e.target.value })} /></label><label><span>{say('status')}</span><select value={state.status} onChange={e => filters({ status: e.target.value as EarnStatus })}><option value="all">{say('all')}</option><option value="active">{say('active')}</option><option value="off">{say('off')}</option></select></label></div>}
      <div className="l-earn-columns"><div className="l-earn-side"><section className="l-ov-panel l-earn-list"><div className="l-earn-heading"><h2>{say(bonus ? 'milestone' : 'everyday')}</h2>{!bonus && <small>{say('methods', { n: visible.length })}</small>}</div>
        {visible.map(way => <EarningRow key={way.key} way={way} answer={data} title={title(way)} description={description(way)} sentence={text(way)} selected={selected?.key === way.key} onSelect={() => picked(way)} onOpen={() => guard.go(earningUrl(state.tab, bonus ? { selected: way.key } : { way: way.key }))} />)}
        {!visible.length && <div className="l-earn-empty"><p>{say(groupWays.length ? 'noResults' : 'noMethods')}</p>{groupWays.length > 0 && <OverviewButton onClick={() => filters({ q: '', status: 'all' })}>{say('clear')}</OverviewButton>}</div>}
      </section>{bonus && <><SharedRules answer={data} guard={guard} /><Link className="l-ov-link" to="/loyalty/rewards?tab=referrals">{say('referralActivity')}</Link></>}</div>
      {selected && (bonus ? <EarnEditor key={selected.key} bonus way={selected} answer={data} guard={guard} /> : <aside className="l-earn-side"><section className="l-ov-panel l-earn-detail"><div className="l-earn-eyebrow"><span className="l-earn-preview-icon"><img src={earnIcon} alt="" /></span>{say('selected')}</div><h2 className="l-earn-detail-title">{title(selected)}</h2>
        <div className="l-earn-example">{selected.key === 'earn_rate' ? <><strong className="l-earn-big">{say('rate', { n: String(data.options.points_per_currency), unit })}</strong><p>{baseExample('50', String(data.options.points_per_currency)) === null ? say('invalidExample') : say('example', { amount: money(50, currency, locale), n: points(baseExample('50', String(data.options.points_per_currency))!, locale) })}</p></> : <p>{text(selected)}</p>}</div>
        <dl className="l-earn-facts"><dt>{say('available')}</dt><dd>{say('allLevels')}</dd><dt>{say('status')}</dt><dd>{say((data.not_used ?? []).includes(selected.key) ? 'unused' : isOn(selected, data.options) ? 'active' : 'off')}</dd></dl>
        {selected.key === 'earn_rate' && <div className="l-earn-divider"><strong>{say('baseExample')}</strong><p>{say('modifiers')}</p></div>}
        <Link className="l-ov-button l-ov-primary" to={earningUrl(state.tab, { way: selected.key })}>{data.can_change ? say('edit', { name: title(selected) }) : say('viewSettings')}</Link>
      </section><section className="l-ov-panel l-earn-detail"><h2>{say('extra')}</h2><p>{say('extraLine')}</p><Link className="l-ov-link" to={earningUrl('bonus')}>{say('manageBonuses')}</Link></section><Link className="l-ov-link" to={earningUrl('rule')}>{say('ruleLink')}</Link></aside>)}
      </div><footer className="l-earn-foot">{checks}{data.ways.some(w => groupOf(w.key) === 'more') && state.tab !== 'more' && <Link className="l-ov-link" to={earningUrl('more')}>{t('loyalty.options.group.more', 'More')}</Link>}</footer>
    </>}
    <SetupBanner />{discard}
    {adding && <DesignDialog title={say('choose')} onClose={() => setAdding(false)}><p>{say('chooseLine')}</p><div className="l-earn-chooser">{data.ways.filter(w => groupOf(w.key) === 'earn').map(way => <OverviewButton key={way.key} onClick={() => { setAdding(false); guard.go(earningUrl('earn', { way: way.key })) }}>{say('configure', { name: title(way) })}</OverviewButton>)}</div></DesignDialog>}
  </div>
}

function EarningRow({ way, answer, title, description, sentence, selected, onSelect, onOpen }: {
  way: Way; answer: OptionsAnswer; title: string; description: string; sentence: string; selected: boolean; onSelect: () => void; onOpen: () => void
}) {
  const say = useEarnWords(), { i18n } = useTranslation(), boot = useBoot()
  const on = isOn(way, answer.options), unused = (answer.not_used ?? []).includes(way.key)
  const summaries: Record<string, string> = {
    earn_rate: say('rateLine', { n: String(answer.options.points_per_currency), unit: money(1, boot.venue.currency, i18n.language) }),
    points_on_spend: say('bookingSummary'), stamp_card: say('stampSummary'), check_in: say('checkinSummary', { n: points(Number(answer.options.checkin_points), i18n.language) }),
    desk_earn: say('deskSummary'), cashback: say('cashbackSummary', { n: String(answer.options.cashback_percent) }), referrals: say('referralSummary'),
  }
  const simple = way.zero_off && groupOf(way.key) === 'bonus' && on ? `+${say('points', { n: points(Number(answer.options[way.zero_off]), i18n.language) })}` : summaries[way.key] ?? sentence
  return <div className={`l-earn-row ${selected ? 'l-earn-selected' : ''}`} data-way={way.key}>
    <button className="l-earn-row-content" type="button" aria-pressed={selected} onClick={onSelect}><span><strong>{title}</strong><small>{description}</small></span><span><span className="l-ov-link">{simple}</span><small className={on && !unused ? 'l-earn-on' : ''}>{say(unused ? 'unused' : on ? 'active' : 'off')}</small></span></button>
    <OverviewButton className="l-earn-open" aria-label={answer.can_change ? say('edit', { name: title }) : `${say('viewSettings')}: ${title}`} onClick={onOpen}>→</OverviewButton>
  </div>
}
