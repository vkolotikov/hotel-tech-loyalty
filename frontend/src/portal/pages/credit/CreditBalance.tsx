import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Wallet } from 'lucide-react'
import { formatMoney } from '../../lib/money'
import { Card } from '../../ui/Card'
import { DateTime } from '../../ui/DateTime'
import { CREDIT_KEY, LINE_WORDS, RECENT_LINES, creditApi, lineKind, showsCredit, showsNote, signedMoney, type MemberCredit } from './creditView'

/**
 * The member's cashback credit on Home (release 7, spec 2026-10-25 §3): "Credit: €12.40", that it is spent at the desk
 * (R7-2: never online), and the latest lines. Nothing at all while the venue gives no cashback and the member holds
 * none. Every figure is the server's.
 */
export function CreditBalance() {
  const { data } = useQuery({ queryKey: CREDIT_KEY, queryFn: creditApi.show, staleTime: 60_000 })
  if (!data || !showsCredit(data)) return null
  return <Balance credit={data} />
}

function Balance({ credit }: { credit: MemberCredit }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const lines = credit.lines.slice(0, RECENT_LINES)

  return (
    <Card className="p-4 space-y-3" data-credit="">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><Wallet size={18} aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-p-text tabular-nums">{t('portal.credit.balance', 'Credit: {{amount}}', { amount: formatMoney(credit.balance, credit.currency, locale) })}</p>
          <p className="text-xs text-p-text-2">
            {credit.enabled
              ? t('portal.credit.at_desk', 'Spend it at the desk: ask the team to take it off your bill.')
              : t('portal.credit.off', 'New credit is no longer earned; what you have can still be spent at the desk.')}
          </p>
        </div>
      </div>
      {lines.length === 0 ? (
        <p className="text-xs text-p-text-2">{t('portal.credit.none', 'You get credit back on what you spend, from your next visit.')}</p>
      ) : (
        <ul aria-label={t('portal.credit.recent', 'Recent credit')} className="divide-y divide-p-border border-t border-p-border">
          {lines.map(line => {
            const kind = lineKind(line)
            return (
              <li key={line.id} className="flex items-center justify-between gap-3 pt-2.5 pb-0.5">
                <div className="min-w-0">
                  <p className="text-sm truncate text-p-text">{t(`portal.credit.line.${kind}`, LINE_WORDS[kind])}{showsNote(line) ? ` · ${line.note}` : ''}</p>
                  {line.created_at && <p className="text-[11px] text-p-text-2"><DateTime iso={line.created_at} mode="datetime" /></p>}
                </div>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${line.amount > 0 ? 'text-p-success' : 'text-p-text-2'}`}>{signedMoney(line.amount, line.currency, locale)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
