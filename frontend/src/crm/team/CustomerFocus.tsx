import { ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, ChevronRight, Clock3, ListTodo, Mail, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { count, money } from '../lib/format'
import { actionLink, boardDay, type CustomerAttention, type CustomerRanking, type Filter, type Period, type TeamAction } from './teamBoard'
import './customerFocus.css'

type FocusFilter = 'needed' | 'waiting_week' | 'checkin'

export function CustomerFocus({ attention, ranking, period, allTime, setAllTime, showActions, rankingError, retry, lang }: {
  attention?: CustomerAttention; ranking?: CustomerRanking; period: Period; allTime: boolean; setAllTime: (all: boolean) => void
  showActions: (filter: Filter) => void; rankingError: boolean; retry: () => void; lang: string
}) {
  const { t } = useTranslation()
  const signals = [{ key: 'needed', icon: ListTodo }, { key: 'waiting_week', icon: ArrowDownLeft }, { key: 'checkin', icon: ArrowUpRight }] as const
  return <div className="crm-focus">
    {attention && <div className="crm-focus-signals">{signals.map(({ key, icon: Icon }) =>
      <button key={key} type="button" data-signal={key} data-active={attention[key] > 0} onClick={() => showActions(key)}>
        <span className="crm-focus-signal-label"><Icon size={18} aria-hidden/>{t(`crm.focus.${key}`)}</span>
        <strong>{count(attention[key], lang)}</strong><ChevronRight size={15} aria-hidden className="crm-focus-chevron"/>
      </button>)}</div>}
    <div className="crm-focus-columns">
      <section className="crm-focus-ranking">
        <header><div><h2>{t('crm.focus.top_customers')}</h2><p>{t('crm.focus.ranked_by')}</p></div>
          <div role="group" aria-label={t('crm.focus.customer_period')} className="crm-team-switch">
            <button type="button" aria-pressed={allTime} onClick={() => setAllTime(true)}>{t('crm.focus.all_time')}</button>
            <button type="button" aria-pressed={!allTime} onClick={() => setAllTime(false)}>{t(`crm.team.${period}`)}</button>
          </div></header>
        {rankingError && <p role="status" className="crm-team-notice">{t(ranking ? 'crm.team.stale' : 'crm.focus.failed')} <button type="button" onClick={retry}>{t('crm.common.retry')}</button></p>}
        {!ranking && !rankingError && <p role="status" className="crm-focus-empty">{t('crm.focus.loading')}</p>}
        {ranking && (ranking.rows.length ? <ol className="crm-focus-customers">{ranking.rows.map((customer, index) => {
          const Icon = customer.type === 'company' ? Building2 : UserRound
          const name = customer.name || customer.company || t('crm.focus.unnamed_customer', { id: customer.id })
          const wins = t(customer.wins === 1 ? 'crm.focus.wins_one' : 'crm.focus.wins_many', { n: count(customer.wins, lang) })
          return <li key={customer.type + customer.id}><Link to={'/crm/contacts?' + (customer.type === 'company' ? 'tab=companies&company=' : 'contact=') + customer.id}>
            <span className="crm-focus-rank" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
            <div className="crm-focus-identity"><strong>{name}</strong><small><Icon size={13} aria-hidden/>{customer.company && customer.company !== name && <>{customer.company} · </>}{wins}</small></div>
            <div className="crm-focus-value"><strong>{customer.amount === null ? '—' : (customer.converted ? '≈ ' : '') + money(customer.amount, customer.currency, lang)}</strong>
              {customer.valued < customer.wins && <small>{t('crm.team.value_coverage', { valued: count(customer.valued, lang), total: count(customer.wins, lang) })}</small>}</div>
          </Link></li>
        })}</ol> : <p className="crm-focus-empty">{t(allTime ? 'crm.focus.no_customers' : 'crm.focus.no_period_wins')}</p>)}
      </section>
      {attention && <div className="crm-focus-work">
        <FocusList title={t('crm.focus.priority_leads')} items={attention.top} empty={t('crm.focus.no_action')} kind="needed" open={showActions} lang={lang}/>
        <FocusList title={t('crm.focus.follow_up')} items={attention.followups} empty={t('crm.focus.no_followups')} kind="checkin" open={showActions} lang={lang}/>
      </div>}
    </div>
  </div>
}

function FocusList({ title, items, empty, kind, open, lang }: { title: string; items: TeamAction[]; empty: string; kind: FocusFilter; open: (filter: Filter) => void; lang: string }) {
  const { t } = useTranslation()
  return <section className="crm-focus-list" data-list={kind}><header><h2>{title}</h2>
    <button type="button" aria-label={t('crm.focus.see_list', { name: title })} onClick={() => open(kind)}>{t('crm.focus.view_all')}<ArrowRight size={14} aria-hidden/></button></header>
    {items.length ? <ul>{items.map(item => {
      const name = item.company || item.name || t('crm.team.unnamed', { id: item.lead_id })
      const age = item.age_days != null ? item.age_days === 0 ? t('crm.focus.under_day') : t('crm.focus.days', { n: count(item.age_days, lang) }) : ''
      const signal = item.signals.find(key => ['key_account','overdue','due_today','high_priority','large_company'].includes(key))
      const amount = Number(item.amount) > 0 && item.currency !== 'XXX' ? money(item.amount, item.currency, lang) : ''
      const reason = item.deadline && item.signals.includes('delivery_due') ? t('crm.team.delivery_date', { date: boardDay(item.deadline, lang) })
        : item.ai_reason && item.ai_reason !== 'routine' ? t(`crm.team.ai_${item.ai_reason}`) : signal ? t(`crm.team.signal_${signal}`) : ''
      const detail = [t(`crm.team.kind_${item.kind}`), reason, amount, item.owner || t('crm.dayplan.unassigned')].filter(Boolean).join(' · ')
      return <li key={item.key}><Link to={actionLink(item)} data-priority={item.priority} title={item.subject || undefined}>
        <div><strong>{name}</strong><small title={detail}>{detail}</small></div>
        {age ? <span className="crm-focus-age" data-long={(item.age_days ?? 0) >= 7}>{item.kind === 'checkin' ? <ArrowUpRight size={14} aria-hidden/> : item.kind === 'email' ? <Mail size={13} aria-hidden/> : <Clock3 size={13} aria-hidden/>}{age}</span>
          : <span className="crm-focus-age"><Clock3 size={13} aria-hidden/>{t(`crm.team.level_${item.priority}`)}</span>}</Link></li>
    })}</ul> : <p className="crm-focus-empty">{empty}</p>}</section>
}
