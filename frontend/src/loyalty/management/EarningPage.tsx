import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { money, points } from '../lib/format'
import { OverviewButton } from '../overview/OverviewUI'
import { DesignDialog } from '../redesign/DesignUI'
import { useRedesignWords } from '../redesign/words'
import { OPTIONS_KEY, optionsApi } from '../options/optionsApi'
import { isOn, sentenceOf } from '../options/optionsMath'
import { LoadFailed, Loading } from '../options/parts'
import { groupOf } from '../options/groups'
import { useSay, wayTitle, wayLine } from '../options/say'
import { OptionsPage } from '../options/OptionsPage'
import type { Way } from '../options/types'
import { EarnEditor } from '../earn/EarnEditor'
import { ruleExample, earningUrl, earnLocation, filteredWays } from '../earn/model'
import { useLeaveGuard } from '../earn/useLeaveGuard'
import { useEarnWords } from '../earn/words'
import { ProgrammeSettings } from './ProgrammeSettings'
import { BonusBoostsPage } from './BonusBoostsPage'
import { ManagementColumns, ManagementFact, ManagementHeading, ManagementLabels, ManagementPanel, ManagementRow, ManagementSelection, ManagementStatus, ManagementVisual, ManagementOutcome } from './ManagementUI'
import { useAdminWords } from './words'
import { BONUSES, EARNING, POINTS_SETTINGS, QUALIFICATION } from './navigation'
import { earningIcon } from './earningIcon'
import '../earn/earn.css'
import '../earn/clean.css'

export function EarningPage() {
  const query = useQuery({ queryKey: OPTIONS_KEY, queryFn: optionsApi.options, refetchOnWindowFocus: false })
  const location = useLocation(), say = useEarnWords(), admin = useAdminWords(), rd = useRedesignWords(), { t, i18n } = useTranslation(), oldSay = useSay()
  const boot = useBoot(), guard = useLeaveGuard(), data = query.data
  const state = earnLocation(location.search, data?.ways ?? [])
  const title = (w: Way) => w.key === 'earn_rate' ? say('purchase') : wayTitle(oldSay, w.key)
  const unit = money(1, boot.venue.currency, i18n.language)
  const sentence = (w: Way) => data ? sentenceOf(w.key, data.options, { say: oldSay, currency: boot.venue.currency, locale: i18n.language, rewards: data.catalogue.rewards }) : ''
  const discard = guard.destination && <DesignDialog title={say('discardTitle')} onClose={guard.keep} busy={guard.busy}><p>{say('discardLine')}</p><div className="l-rd-actions"><OverviewButton onClick={guard.keep}>{rd('keepEditing')}</OverviewButton><OverviewButton primary onClick={guard.discard}>{rd('discard')}</OverviewButton></div></DesignDialog>
  if (new URLSearchParams(location.search).get('settings') === 'points') return <ProgrammeSettings kind="points" />
  if (state.tab === 'more') return <OptionsPage />
  if (!data) return <div className="l-ad-page">{query.isError ? <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} /> : <Loading />}</div>
  const editor = data.ways.find(w => w.key === state.way)
  if (editor) return <>{state.tab === 'bonus' ? <div className="l-ad-page"><OverviewButton disabled={guard.busy} onClick={() => guard.go(earningUrl('bonus', { selected: editor.key }))}>← {admin('bonuses')}</OverviewButton><EarnEditor key={editor.key} bonus way={editor} answer={data} guard={guard} /></div> : <EarnEditor key={editor.key} way={editor} answer={data} guard={guard} />}{discard}</>
  if (state.tab === 'bonus') return <BonusBoostsPage answer={data} guard={guard} />
  const visible = filteredWays(data, 'earn', state.q, state.status, w => `${title(w)} ${wayLine(oldSay, w.key)}`)
  const selected = visible.find(w => w.key === state.selected) ?? visible[0]
  const inherited = selected && ['points_on_spend', 'desk_earn'].includes(selected.key)
  const status = (w: Way) => (data.not_used ?? []).includes(w.key) ? 'unused' : isOn(w, data.options) ? 'active' : 'off'
  const badge = (w: Way) => <ManagementStatus state={status(w)}>{say(status(w))}</ManagementStatus>
  const go = (patch: Record<string, string>) => guard.go(earningUrl('earn', { selected: state.selected, q: state.q, status: state.status, ...patch }))
  const example = ruleExample(selected?.key ?? 'earn_rate', data, '50')
  return <div className="l-ad-page"><ManagementHeading title={admin('earning')} line={admin('earningLine')}><Link className="l-ov-button" to={POINTS_SETTINGS}>{admin('pointsSettings')}</Link></ManagementHeading>
    <ManagementColumns><div className="l-ad-stack"><ManagementPanel title={admin('earning')} count={say('activeMethods', { n: data.ways.filter(w => groupOf(w.key) === 'earn' && status(w) === 'active').length })}>
      <div className="l-ad-filters"><label><span>{say('search')}</span><input type="search" value={state.q} onChange={e => go({ q: e.target.value })} /></label><label><span>{say('status')}</span><select value={state.status} onChange={e => go({ status: e.target.value })}>{['all', 'active', 'off'].map(s => <option key={s} value={s}>{say(s as 'all' | 'active' | 'off')}</option>)}</select></label></div>
      <ManagementLabels first={say('ruleName')} value={say('memberSees')} status={say('status')} /><ul className="l-ad-list">{visible.map(w => <ManagementRow key={w.key} record={`way-${w.key}`} icon={earningIcon(w.key)} title={title(w)} caption={w.key === 'points_on_spend' || w.key === 'desk_earn' ? admin('inheritsPurchase') : wayLine(oldSay, w.key)} value={sentence(w)} status={badge(w)} selected={selected?.key === w.key} onSelect={() => go({ selected: w.key })} />)}</ul>
      {!visible.length && <p>{say(data.ways.some(w => groupOf(w.key) === 'earn') ? 'noResults' : 'noMethods')}</p>}{!visible.length && <OverviewButton onClick={() => go({ q: '', status: 'all' })}>{say('clear')}</OverviewButton>}
    </ManagementPanel><div className="l-ad-summary"><ManagementFact icon="expiry" label={admin('pointsSettings')}>{sentenceOf('points_expiry', data.options, { say: oldSay, currency: boot.venue.currency, locale: i18n.language, rewards: data.catalogue.rewards })}</ManagementFact><Link className="l-ov-link" to={POINTS_SETTINGS}>{t('loyalty.program.edit', 'Edit')}</Link></div>
      {data.ways.some(w => groupOf(w.key) === 'more') && <details className="l-ad-more"><summary>{admin('advanced')}</summary><Link className="l-ov-link" to="/loyalty/options?tab=more">{t('loyalty.options.group.more', 'More')}</Link></details>}
    </div>{selected && <ManagementSelection title={title(selected)} status={badge(selected)} onEdit={data.can_change ? () => guard.go(earningUrl('earn', { way: selected.key })) : undefined}>
      <ManagementVisual art="earnArt" label={say('memberSees')} title={selected.key === 'earn_rate' || inherited ? say('rate', { n: String(data.options.points_per_currency), unit }) : title(selected)} line={inherited ? admin('inheritsPurchase') : sentence(selected)} />
      <ManagementFact icon="people" label={admin('who')}>{say('allLevels')}</ManagementFact><ManagementFact icon="bookingSmall" label={admin('when')}>{wayLine(oldSay, selected.key)}</ManagementFact>
      {inherited && <p>{sentence(selected)}</p>}
      {(selected.key === 'earn_rate' || inherited) && <><ManagementOutcome label={admin('baseExample')} from={money(50, boot.venue.currency, i18n.language)} to={example === null ? say('invalidExample') : admin('pointsShort', { n: points(example, i18n.language) })} /><small>{admin('basePoints')}</small>{inherited && <Link className="l-ov-link" to={`${EARNING}&way=earn_rate`}>{admin('sharedRate')}</Link>}</>}
      {!data.can_change && <Link className="l-ov-link" to={earningUrl('earn', { way: selected.key })}>{say('viewSettings')}</Link>}<Link className="l-ov-link" to={BONUSES}>{admin('bonuses')}</Link><Link className="l-ov-link" to={QUALIFICATION}>{admin('qualification')}</Link>
    </ManagementSelection>}</ManagementColumns>{discard}
  </div>
}
