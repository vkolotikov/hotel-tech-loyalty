import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { dayLabel, money } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { amount, dayOf, followUp } from '../leads/leadLogic'
import { dueIn } from '../leads/listLogic'
import { ContactLinks } from '../leads/parts'
import { dueInLabel, dueInTone } from '../leads/leadWords'
import { rowOpens } from '../leads/recordLogic'
import { dealItem, stillOwed, type DealColumn, type DealRow } from './dealLogic'
import { DealStep, PayPill, useStep, type Step } from './DealStep'
import { nextStepWord } from '../tasks/taskWords'

/**
 * The deals as a list (round 2; round 5, owner 2026-11-12: "opening tabs, slides or popups"): a deal opens in its
 * lead's panel on the Deal tab — its name is the link (Ctrl-click still opens a tab), a press on the row's empty space
 * does the same — so round 2's "Show more" is gone: the Deal tab holds the money, the steps and the notes. On a wide
 * screen a row per deal under a header row — who, what it is for, the amount (and what is still owed), the payment (a
 * press opens it), the step in one compact control over a slim bar, the next step, its day and the owner; on a phone
 * a card.
 */
export function DealList({ deals, columns, onPay }: { deals: DealRow[]; columns: Record<DealColumn, boolean>; onPay: (deal: DealRow) => void }) {
  const { t } = useTranslation()
  const records = useRecords()
  const step = useStep()
  const name = (deal: DealRow) => deal.guest?.full_name || deal.guest?.email || t('crm.common.no_name', 'No name')
  const row = { step, href: (id: number) => records.href('lead', id, 'deal'), open: (id: number) => records.open('lead', id, 'deal') }
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-a-border text-left text-xs font-medium text-a-text-2">
              <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">{t('crm.deals.col_deal', 'Deal')}</th>
              {columns.product_details && <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">{t('crm.deals.col_item_short', 'For')}</th>}
              {columns.amount && <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('crm.deals.col_amount', 'Amount')}</th>}
              {columns.payment && <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.deals.col_payment', 'Payment')}</th>}
              {columns.fulfillment && <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.deals.col_step', 'Step')}</th>}
              {columns.next_action && <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">{t('crm.deals.col_next', 'Next step')}</th>}
              {columns.due_date && <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">{t('crm.deals.col_due', 'Due')}</th>}
              {columns.owner && <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">{t('crm.deals.col_owner', 'Owner')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-a-border">
            {deals.map(deal => <WideRow key={deal.id} deal={deal} name={name(deal)} columns={columns} onPay={() => onPay(deal)} {...row} />)}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-a-border md:hidden">
        {deals.map(deal => <PhoneCard key={deal.id} deal={deal} name={name(deal)} onPay={() => onPay(deal)} {...row} />)}
      </ul>
    </>
  )
}

function NextStep({ deal, lang }: { deal: DealRow; lang: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const next = followUp(deal, boot.venue.today)
  if (!next) return <span className="text-xs text-a-text-2">{deal.next_task_completed && deal.next_task_type ? t('crm.deals.next_done', 'Done') : '—'}</span>
  const due = dueIn(next.day, boot.venue.today)
  const tone = dueInTone(due)
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      <CalendarClock size={14} aria-hidden className={`mt-0.5 shrink-0 ${tone === 'danger' ? 'text-a-danger' : tone === 'pending' ? 'text-a-st-pending' : 'text-a-text-2'}`} />
      <span className="min-w-0">
        <span className="block truncate text-sm text-a-text">{nextStepWord(t, next.type) ?? t('crm.deals.next_untitled', 'Follow up')}</span>
        {due && <span className={`block text-xs ${tone === 'danger' ? 'font-medium text-a-danger' : tone === 'pending' ? 'font-medium text-a-st-pending' : 'text-a-text-2'}`}>{dueInLabel(t, due, lang)}</span>}
      </span>
    </span>
  )
}

interface RowProps {
  deal: DealRow
  name: string
  onPay: () => void
  step: Step
  href: (id: number) => string
  open: (id: number) => void
}

function Owed({ deal }: { deal: DealRow }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const paid = amount(deal.paid_amount)
  const owed = stillOwed(deal.total_value, deal.paid_amount)
  if (owed === null || owed <= 0 || paid === null || deal.payment_status === 'paid') return null
  return <span className="block text-xs font-medium text-a-st-pending">{t('crm.deals.owed', '{{amount}} still to pay', { amount: money(owed, boot.venue.currency, i18n.language) })}</span>
}

function WideRow({ deal, name, columns, onPay, step, href, open }: RowProps & { columns: Record<DealColumn, boolean> }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const value = amount(deal.total_value)
  const late = dueIn(deal.next_task_completed ? null : deal.next_task_due, boot.venue.today)?.state === 'late'
  const item = dealItem(deal)
  return (
    <tr onClick={e => { if (rowOpens(e.target as Element | null, e.defaultPrevented)) open(deal.id) }}
      className={`group cursor-pointer align-top transition-colors hover:bg-a-surface-2/60 ${step.busy(deal.id) ? 'opacity-60' : ''}`}>
      <td className="py-3 pl-4 pr-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <Link to={href(deal.id)} className="block truncate font-medium text-a-text hover:underline focus-visible:outline-2 focus-visible:outline-a-accent">{name}</Link>
            {deal.guest?.company && <p className="truncate text-xs text-a-text-2">{deal.guest.company}</p>}
          </div>
          <span className="shrink-0 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100"><ContactLinks guest={deal.guest} name={name} /></span>
        </div>
      </td>
      {columns.product_details && (
        <td className="hidden max-w-48 px-3 py-3 xl:table-cell">
          <span className="block truncate text-sm text-a-text">{item ?? '—'}</span>
          {((deal.num_rooms ?? 0) > 1 || (deal.event_pax ?? 0) > 0) && (
            <span className="block text-xs text-a-text-2">{(deal.num_rooms ?? 0) > 1 ? t('crm.deals.rooms', '{{count}} rooms', { count: deal.num_rooms ?? 0 }) : t('crm.deals.people', '{{count}} people', { count: deal.event_pax ?? 0 })}</span>
          )}
        </td>
      )}
      {columns.amount && (
        <td className="px-3 py-3 text-right tabular-nums">
          <span className="block font-medium text-a-text">{money(value, boot.venue.currency, lang)}</span>
          <Owed deal={deal} />
        </td>
      )}
      {columns.payment && <td className="px-3 py-2.5"><PayPill deal={deal} name={name} onPay={onPay} /></td>}
      {columns.fulfillment && <td className="px-3 py-3"><DealStep deal={deal} name={name} step={step} /></td>}
      {columns.next_action && <td className="hidden max-w-44 px-3 py-3 lg:table-cell"><NextStep deal={deal} lang={lang} /></td>}
      {columns.due_date && (
        <td className={`hidden whitespace-nowrap px-3 py-3 text-xs xl:table-cell ${late ? 'font-medium text-a-danger' : 'text-a-text-2'}`}>
          {deal.next_task_due && !deal.next_task_completed ? dayLabel(dayOf(deal.next_task_due), lang) : '—'}
        </td>
      )}
      {columns.owner && (
        <td className="hidden max-w-40 px-3 py-3 lg:table-cell">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={deal.assigned_to} size="sm" />
            <span className={`block truncate text-sm ${deal.assigned_to ? 'text-a-text' : 'font-medium text-a-st-pending'}`}>{deal.assigned_to || t('crm.deals.owner_none', 'Nobody yet')}</span>
          </span>
        </td>
      )}
    </tr>
  )
}

function PhoneCard({ deal, name, onPay, step, href }: RowProps) {
  const { i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  return (
    <li className={`space-y-2 px-4 py-3 ${step.busy(deal.id) ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={href(deal.id)} className="block truncate text-sm font-medium text-a-text hover:underline">{name}</Link>
          <p className="truncate text-xs text-a-text-2">{[deal.guest?.company, dealItem(deal)].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="shrink-0 text-right text-sm font-medium tabular-nums text-a-text">
          {money(amount(deal.total_value), boot.venue.currency, lang)}
          <Owed deal={deal} />
        </span>
      </div>
      <div className="flex items-start gap-3">
        <PayPill deal={deal} name={name} onPay={onPay} />
        <DealStep deal={deal} name={name} step={step} />
      </div>
      <NextStep deal={deal} lang={lang} />
    </li>
  )
}
