import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Wallet } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { money, when } from '../lib/format'
import type { MemberRow } from '../lib/types'
import { Pager } from '../ui/Pager'
import { CARD, CardHead } from '../member/CardHead'
import { creditApi, creditKey, type CreditAfter, type CreditLine } from './creditApi'
import { CreditDialog } from './CreditDialog'
import { creditActions, doneMessage, lineKind, showsCredit, showsNote, signedMoney, type CreditMode } from './creditMath'
import { ERRORS } from './errors'
import { LINE_WORDS } from './words'

type Member = MemberRow & { is_erased?: boolean }

/**
 * A member's cashback credit on their page (release 7, spec 2026-10-25 §3, R7-2), when the venue uses cashback or the
 * member still holds some: the balance in the venue's currency, "Use credit" for whoever may redeem (spent at the desk
 * only), "Adjust" for a manager, and the credit history, newest first, 25 a page. Release 9: the rate is Ways to earn's,
 * not repeated here; only a switched-off cashback is said.
 */
export function CreditPanel({ member, locale, timeZone }: { member: Member; locale: string; timeZone: string }) {
  const boot = useBoot()
  if (member.is_erased || !showsCredit(boot.programme.ways, member.credit_balance)) return null
  return <Panel member={member} locale={locale} timeZone={timeZone} />
}

function Panel({ member, locale, timeZone }: { member: Member; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<CreditMode | null>(null)
  const [done, setDone] = useState<{ mode: CreditMode; after: CreditAfter } | null>(null)
  const query = useQuery({ queryKey: [...creditKey(member.id), page], queryFn: () => creditApi.show(member.id, page), placeholderData: keepPreviousData })
  const data = query.data
  const balance = data?.balance ?? member.credit_balance ?? 0
  const currency = data?.currency ?? boot.venue.currency
  const enabled = data?.enabled ?? Boolean(boot.programme.ways?.cashback)
  const actions = creditActions(boot.staff.can, { ...member, credit_balance: balance })

  return (
    <section aria-labelledby="credit-title" className={CARD}>
      <CardHead id="credit-title" icon={Wallet} title={t('loyalty.credit.title', 'Credit')}>
        {actions.use && <Button size="sm" onClick={() => { setDone(null); setDialog('use') }}><Wallet size={15} aria-hidden />{t('loyalty.credit.use_action', 'Use credit')}</Button>}
        {actions.adjust && <Button size="sm" variant="secondary" onClick={() => { setDone(null); setDialog('adjust') }}><Pencil size={14} aria-hidden />{t('loyalty.credit.adjust_action', 'Adjust')}</Button>}
      </CardHead>
      <p data-credit-balance="" className="font-a-display text-4xl font-light leading-none tabular-nums text-a-text">{money(balance, currency, locale)}</p>
      {!enabled && <p className="text-sm text-a-text-2">{t('loyalty.credit.off', 'Cashback is switched off: nothing new is earned, and this credit can still be used at the desk.')}</p>}
      {done && <Notice tone="success">{t(...doneMessage(done.mode, done.after, locale))}</Notice>}
      {query.isError && <Notice tone="danger">{t(...refusalKey('loyalty.credit', ERRORS, 'load', failureOf(query.error)))}</Notice>}
      {!data && query.isLoading && <Skeleton className="h-16" />}
      {data && data.lines.length === 0 && <p className="text-sm text-a-text-2">{t('loyalty.credit.none', 'No credit yet.')}</p>}
      {data && data.lines.length > 0 && (
        <>
          <ul aria-label={t('loyalty.credit.history', 'Credit history')} className="-mx-5 divide-y divide-a-border">
            {data.lines.map(line => <Line key={line.id} line={line} locale={locale} timeZone={timeZone} />)}
          </ul>
          <Pager page={data.pagination.page} pages={data.pagination.pages} onPage={setPage} />
        </>
      )}
      {dialog && (
        <CreditDialog mode={dialog} memberId={member.id} name={member.name} balance={balance} currency={currency}
          onClose={() => setDialog(null)} onDone={(after) => { setDialog(null); setDone({ mode: dialog, after }) }} />
      )}
    </section>
  )
}

/** One line of the credit history: its signed amount, its kind (and a person's note), when, by whom, and the credit after it. */
function Line({ line, locale, timeZone }: { line: CreditLine; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const kind = lineKind(line)
  const tone = line.amount > 0 ? 'l-plus' : line.amount < 0 ? 'l-minus' : 'text-a-text-2'

  return (
    <li data-credit-line={line.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
      <span className={`w-20 shrink-0 text-right font-semibold tabular-nums sm:w-24 ${tone}`}>{signedMoney(line.amount, line.currency, locale)}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-a-text">
          {t(`loyalty.credit.line.${kind}`, LINE_WORDS[kind])}{showsNote(line) ? ` · ${line.note}` : ''}
        </span>
        <span className="block text-xs text-a-text-2">
          {[
            when(line.created_at, locale, timeZone),
            line.by ? t('loyalty.credit.by', 'by {{name}}', { name: line.by }) : null,
            t('loyalty.credit.line_balance', 'credit {{amount}}', { amount: money(line.balance_after, line.currency, locale) }),
          ].filter(Boolean).join(' · ')}
        </span>
      </span>
    </li>
  )
}
