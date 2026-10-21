import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { cardKey, membershipApi } from './api'
import { ERRORS } from './errors'
import type { CardData } from './types'
import './card.css'

/**
 * The member's card (spec 2026-10-21 release 2 §4.1): the QR code the member app shows — the desk's own Scan reads it —
 * with the member's name and number, and Print, which puts only the card on paper (card.css). The QR code is the
 * server's SVG, so it never depends on the server's image library.
 */
export function CardDialog({ memberId, onClose }: { memberId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: cardKey(memberId), queryFn: () => membershipApi.card(memberId), staleTime: 5 * 60_000, retry: false })

  return (
    <Dialog title={t('loyalty.membership.card.title', 'Member card')} onClose={onClose}>
      <div className="space-y-4">
        {query.isError && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'card', failureOf(query.error)))}</Notice>}
        {!query.data && !query.isError && <Skeleton className="h-56" />}
        {query.data && <PrintableCard card={query.data} />}
        <p className="text-sm text-a-text-2">{t('loyalty.membership.card.hint', 'The member can show this code at the desk instead of the app; Scan finds them by it.')}</p>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>{t('loyalty.membership.card.close', 'Close')}</Button>
          <Button type="button" disabled={!query.data} onClick={() => window.print()}><Printer size={15} aria-hidden />{t('loyalty.membership.card.print', 'Print')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** The card itself, the part that is printed. */
export function PrintableCard({ card }: { card: CardData }) {
  const { t } = useTranslation()
  const boot = useBoot()
  return (
    <div data-print-card="" className="flex flex-wrap items-center gap-4 rounded-2xl border border-a-border bg-a-surface p-4">
      <img src={card.qr_svg} width={160} height={160} alt={t('loyalty.membership.card.qr_alt', 'QR code of member number {{number}}', { number: card.member_number })}
        className="h-40 w-40 shrink-0 rounded-lg bg-a-surface" />
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-a-text-2">{boot.organization.name}</p>
        <p className="break-words font-a-display text-2xl text-a-text">{card.name}</p>
        <p className="font-a-mono text-sm text-a-text">{card.member_number}</p>
      </div>
    </div>
  )
}
