import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, BellRing, CalendarCheck, CalendarClock, ChevronRight, CircleHelp, Coins, Globe2, Mail, Users, Trophy, X } from 'lucide-react'
import { count, money, reportingValue } from '../lib/format'
import { countryName } from '../insights/insightsMath'
import { ActivityTrend, Change } from './ActivityTrend'
import { boardDay, type BoardValue, type CountryMix, type Filter, type TeamBoard } from './teamBoard'

type Detail = 'values' | 'countries' | 'days'
type Props = { board: TeamBoard; lang: string; showActions: (filter: Filter) => void; allCountries: boolean; setAllCountries: (all: boolean) => void }

export function TeamOverview({ board, lang, showActions, allCountries, setAllCountries }: Props) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<Detail | null>(null)
  const { portfolio: book, performance: period } = board
  const countries = allCountries ? book.countries : period.countries
  const showValue = (value: BoardValue, total: number) => value.valued || !total ? reportingValue(value, lang) : '—'
  const coverage = (value: BoardValue, total: number) => t('crm.team.value_coverage', { valued: count(value.valued, lang), total: count(total, lang) })
  const moneyButton = <button type="button" className="crm-team-info" aria-label={t('crm.team.value_details')} title={t('crm.team.value_details')} onClick={() => setDetail('values')}><CircleHelp size={15}/></button>
  return <div className="crm-team-overview">
    <section className="crm-team-metrics" aria-label={t('crm.team.performance')}>
      <div><div className="crm-team-metric-label"><Users size={16}/>{t('crm.team.total_leads')}</div>
        <strong className="crm-team-figure" key={book.total}>{count(book.total, lang)}</strong>
        <small>{t('crm.team.open_leads', { count: book.open })}</small></div>
      <div><div className="crm-team-metric-label"><Coins size={16}/>{t('crm.team.total_value')}{moneyButton}</div>
        <strong className="crm-team-figure crm-team-monies" key={book.total_value.amount}>{showValue(book.total_value, book.total)}</strong>
        <small>{coverage(book.total_value, book.total)}</small></div>
      <div><div className="crm-team-metric-label"><Coins size={16}/>{t('crm.team.pipeline_value')}{moneyButton}</div>
        <strong className="crm-team-figure crm-team-monies" key={book.open_value.amount}>{showValue(book.open_value, book.open)}</strong>
        <small>{coverage(book.open_value, book.open)}</small></div>
      <div><div className="crm-team-metric-label"><Trophy size={16}/>{t('crm.team.wins')}</div>
        <strong className="crm-team-figure" key={board.wins}>{count(board.wins, lang)}</strong>
        <Change value={period.win_change} board={board} lang={lang}/></div>
      <div><div className="crm-team-metric-label"><Coins size={16}/>{t('crm.team.won_value')}{moneyButton}</div>
        <strong className="crm-team-figure crm-team-monies" key={period.won_value.amount}>{showValue(period.won_value, board.wins)}</strong>
        <small>{coverage(period.won_value, board.wins)}</small></div>
    </section>
    <div className="crm-team-drawings">
      <ActivityTrend key={board.from} board={board} lang={lang} showDays={() => setDetail('days')}/>
      <section className="crm-team-markets crm-team-panel">
        <header className="crm-team-panel-head"><h2><Globe2 size={17}/>{t('crm.team.by_country')}</h2>
          <select className="crm-team-filter" value={allCountries ? 'all' : 'period'} aria-label={t('crm.team.country_period')} onChange={e => setAllCountries(e.target.value === 'all')}>
            <option value="period">{t(board.period === 'week' ? 'crm.team.week' : 'crm.team.month')}</option><option value="all">{t('crm.team.all_time')}</option>
          </select></header>
        <CountryRows mix={countries} lang={lang} limit={4}/>
        <div className="crm-team-market-foot"><span>{t('crm.team.country_missing', { count: countries.unknown })}</span>
          {countries.rows.length > 0 && <button type="button" className="crm-team-text-link" onClick={() => setDetail('countries')}>{t('crm.team.all_countries')}<ChevronRight size={14}/></button>}</div>
      </section>
    </div>
    <section className="crm-team-attention" aria-labelledby="crm-team-signals-heading"><h2 id="crm-team-signals-heading">{t('crm.team.work_signals')}</h2>
      <div className="crm-team-signals">
        <Signal label={t('crm.team.overdue')} value={book.overdue} lang={lang} icon={<CalendarClock/>} tone="risk" to="/crm/leads?due=overdue&sort=follow_up"/>
        <Signal label={t('crm.team.due_today')} value={book.due_today} lang={lang} icon={<CalendarCheck/>} tone="waiting" to="/crm/leads?due=today&sort=follow_up"/>
        <Signal label={t('crm.team.unanswered')} value={board.emails} lang={lang} icon={<Mail/>} tone="waiting" onClick={() => showActions('email')}/>
        <Signal label={t('crm.team.urgent_actions')} value={board.urgent} lang={lang} icon={<BellRing/>} tone="risk" onClick={() => showActions('urgent')}/>
      </div>
    </section>
    {detail && <DetailDialog title={t(detail === 'days' ? 'crm.team.daily_table' : detail === 'countries' ? 'crm.team.by_country' : 'crm.team.value_details')} close={() => setDetail(null)}>
      {detail === 'days' && <><p>{boardDay(board.from, lang)} – {boardDay(board.through, lang)}</p><table><thead><tr><th>{t('crm.team.date')}</th><th>{t('crm.team.leads')}</th><th>{t('crm.team.wins')}</th></tr></thead>
        <tbody>{board.days.map(d => <tr key={d.date}><th scope="row">{boardDay(d.date, lang)}</th><td>{count(d.leads, lang)}</td><td>{count(d.wins, lang)}</td></tr>)}</tbody></table>
        {board.undated_wins > 0 && <p>{t('crm.team.undated', { count: board.undated_wins })}</p>}</>}
      {detail === 'countries' && <><p>{t(allCountries ? 'crm.team.all_time' : board.period === 'week' ? 'crm.team.week' : 'crm.team.month')} · {t('crm.team.n_leads', { count: countries.total })}</p>
        <CountryRows mix={countries} lang={lang}/><p>{t('crm.team.country_missing', { count: countries.unknown })}</p></>}
      {detail === 'values' && <><p>{t('crm.team.amount_basis')}</p>
        <ValueDetails title={t('crm.team.total_value')} value={book.total_value} total={book.total} lang={lang}/>
        <ValueDetails title={t('crm.team.pipeline_value')} value={book.open_value} total={book.open} lang={lang}/>
        <ValueDetails title={t('crm.team.won_value')} value={period.won_value} total={board.wins} lang={lang}/>
        {board.undated_wins > 0 && <p>{t('crm.team.undated', { count: board.undated_wins })}</p>}</>}
    </DetailDialog>}
  </div>
}

function CountryRows({ mix, lang, limit }: { mix: CountryMix; lang: string; limit?: number }) {
  const { t } = useTranslation()
  if (!mix.rows.length) return <p className="crm-team-market-empty">{t(mix.total ? 'crm.team.no_countries' : 'crm.team.no_arrivals')}</p>
  const percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 })
  return <ul className="crm-team-country-list">{mix.rows.slice(0, limit).map(row => <li key={row.code}>
    <span className="crm-team-country-code" aria-hidden>{row.code}</span><div className="crm-team-country-name"><span>{countryName(row.code, lang)}</span>
      <i aria-hidden><i style={{ width: (100 * row.count / mix.rows[0].count) + '%' }}/></i></div>
    <b>{count(row.count, lang)}</b><span className="crm-team-percent">{percent.format(row.count / mix.total)}</span>
  </li>)}</ul>
}

function Signal({ label, value, lang, icon, tone, to, onClick }: {
  label: string; value: number; lang: string; icon: ReactNode; tone: string; to?: string; onClick?: () => void
}) {
  const inside = <><span className="crm-team-signal-icon" aria-hidden>{icon}</span><span className="crm-team-signal-label">{label}</span>
    <strong key={value}>{count(value, lang)}</strong><ArrowUpRight size={14} aria-hidden/></>
  return to ? <Link className="crm-team-signal" data-tone={value ? tone : 'quiet'} to={to}>{inside}</Link>
    : <button className="crm-team-signal" data-tone={value ? tone : 'quiet'} type="button" onClick={onClick}>{inside}</button>
}

function ValueDetails({ title, value, total, lang }: { title: string; value: BoardValue; total: number; lang: string }) {
  const { t } = useTranslation()
  return <section className="crm-team-value-detail"><h3>{title}</h3><strong>{value.valued || !total ? reportingValue(value, lang) : '—'}</strong>
    <p>{t('crm.team.value_coverage', { valued: count(value.valued, lang), total: count(total, lang) })}</p>
    {value.groups.some(g => g.included) && <dl>{value.groups.filter(g => g.included).map(g => <div key={g.currency}><dt>{g.currency}</dt><dd>{money(g.amount, g.currency, lang)}</dd></div>)}</dl>}
    {value.missing_currency > 0 && <p>{t('crm.leads.currency_to_review', { count: value.missing_currency })}</p>}
    {value.missing_rate > 0 && <p>{t('crm.leads.rate_missing', { count: value.missing_rate })}</p>}
    {value.converted && value.rate_date && <p>{t('crm.leads.rate_date', { date: new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value.rate_date + 'T12:00:00Z')) })}</p>}
  </section>
}

function DetailDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close() }
  }, [])
  return <dialog className="crm-team-detail" aria-labelledby="crm-team-detail-heading" ref={ref} onCancel={e => { e.stopPropagation(); e.preventDefault(); close() }}>
    <header><h2 id="crm-team-detail-heading">{title}</h2><button type="button" className="crm-team-icon" aria-label={t('crm.common.close')} onClick={close}><X size={18}/></button></header>
    {children}
  </dialog>
}
