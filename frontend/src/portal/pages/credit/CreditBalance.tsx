import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Wallet } from 'lucide-react'
import { formatMoney } from '../../lib/money'
import { Card } from '../../ui/Card'
import { DateTime } from '../../ui/DateTime'
import { CREDIT_KEY, LINE_WORDS, creditApi, lineKind, showsCredit, showsNote, signedMoney, type MemberCredit } from './creditView'

/** The credit's sentence under its balance: where it is spent (R7-2: never online), or that none is earned any more. */
function CreditNote({ credit }: { credit: MemberCredit }) {
  const { t } = useTranslation()
  return (
    <p className="text-xs text-p-text-2">
      {!credit.enabled
        ? t('portal.credit.off', 'No new credit is earned; spend yours at the desk.')
        : credit.lines.length === 0
          ? t('portal.credit.none', 'Earn credit back from your next visit.')
          : t('portal.credit.at_desk', 'Spend it at the desk.')}
    </p>
  )
}

/**
 * The member's cashback credit on Home (release 7, spec 2026-10-25 §3; release 9: compact): "Credit: €12.40", where it
 * is spent, and the way to its history (Activity → Credit). Nothing at all while the venue gives no cashback and the
 * member holds none. Every figure is the server's.
 */
export function CreditBalance({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const { data } = useQuery({ queryKey: CREDIT_KEY, queryFn: creditApi.show, staleTime: 60_000 })
  if (!data || !showsCredit(data)) return null
  return (
    <Link to="/portal/activity?tab=credit" className={`block ${className}`} data-credit="">
      <Card className="p-4 p-lift h-full flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><Wallet size={18} aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-p-text tabular-nums">{t('portal.credit.balance', 'Credit: {{amount}}', { amount: formatMoney(data.balance, data.currency, i18n.language) })}</p>
          <CreditNote credit={data} />
        </div>
        <ChevronRight size={16} className="shrink-0 text-p-text-2" aria-hidden />
      </Card>
    </Link>
  )
}

/**
 * The credit's history, Activity's Credit tab (release 9; the lines `GET member/portal/credit` sends, newest first):
 * the balance, where it is spent, and each line with its sign. Read only.
 */
export function CreditHistory({ credit }: { credit: MemberCredit }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  return (
    <div className="space-y-3" data-credit-history="">
      <Card className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><Wallet size={18} aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-p-text tabular-nums">{t('portal.credit.balance', 'Credit: {{amount}}', { amount: formatMoney(credit.balance, credit.currency, locale) })}</p>
          <CreditNote credit={credit} />
        </div>
      </Card>
      {credit.lines.length > 0 && (
        <Card className="overflow-hidden">
          <ul aria-label={t('portal.credit.recent', 'Recent credit')} className="divide-y divide-p-border">
            {credit.lines.map(line => {
              const kind = lineKind(line)
              return (
                <li key={line.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate text-p-text">{t(`portal.credit.line.${kind}`, LINE_WORDS[kind])}{showsNote(line) ? ` · ${line.note}` : ''}</p>
                    {line.created_at && <p className="text-[11px] text-p-text-2"><DateTime iso={line.created_at} mode="datetime" /></p>}
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${line.amount > 0 ? 'text-p-success' : 'text-p-text-2'}`}>{signedMoney(line.amount, line.currency, locale)}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
