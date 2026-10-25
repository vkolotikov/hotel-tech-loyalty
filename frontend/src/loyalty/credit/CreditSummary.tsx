import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Wallet } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { money } from '../lib/format'
import type { MemberRow } from '../lib/types'
import type { CreditAfter } from './creditApi'
import { CreditDialog } from './CreditDialog'
import { creditActions, doneMessage, showsCredit, type CreditMode } from './creditMath'

/**
 * The credit on the Scan result (release 7, spec 2026-10-25 §3, R7-2: credit is spent at the desk only), when the venue
 * uses cashback or the member still holds some: the balance in the venue's currency, "Use credit" for whoever may
 * redeem and "Adjust" for a manager. The balance is the member row's; a write refreshes it with the member.
 */
export function CreditSummary({ member }: { member: MemberRow }) {
  const boot = useBoot()
  if (!showsCredit(boot.programme.ways, member.credit_balance)) return null
  return <Summary member={member} />
}

function Summary({ member }: { member: MemberRow }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const [dialog, setDialog] = useState<CreditMode | null>(null)
  const [done, setDone] = useState<{ mode: CreditMode; after: CreditAfter } | null>(null)
  const balance = member.credit_balance ?? 0
  const currency = boot.venue.currency
  const actions = creditActions(boot.staff.can, member)

  return (
    <div data-credit="" className="space-y-2 rounded-xl border border-a-border bg-a-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-a-text-2">{t('loyalty.credit.title', 'Credit')}</span>
          <span className="block font-a-display text-2xl tabular-nums text-a-text">{money(balance, currency, locale)}</span>
        </p>
        {actions.use && <Button onClick={() => { setDone(null); setDialog('use') }}><Wallet size={15} aria-hidden />{t('loyalty.credit.use_action', 'Use credit')}</Button>}
        {actions.adjust && <Button variant="ghost" size="sm" onClick={() => { setDone(null); setDialog('adjust') }}><Pencil size={14} aria-hidden />{t('loyalty.credit.adjust_action', 'Adjust')}</Button>}
      </div>
      {done && <Notice tone="success">{t(...doneMessage(done.mode, done.after, locale))}</Notice>}
      {dialog && (
        <CreditDialog mode={dialog} memberId={member.id} name={member.name} balance={balance} currency={currency}
          onClose={() => setDialog(null)} onDone={(after) => { setDialog(null); setDone({ mode: dialog, after }) }} />
      )}
    </div>
  )
}
