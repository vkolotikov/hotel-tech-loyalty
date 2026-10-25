import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Nfc, Plus, PowerOff, Usb } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { failureOf } from '../lib/api'
import { ERRORS, errorKey, refusalKey } from '../lib/errors'
import { day } from '../lib/format'
import { useFirstFocus } from '../lib/useFirstFocus'
import { afterCardChange, cardsApi, cardsKey, type NfcCardRow } from '../scan/cardsApi'
import { detectEnv, hexWithColons, shortUid } from '../scan/scanMath'
import { UsbReader } from '../scan/UsbReader'
import { useWebNfc } from '../scan/useWebNfc'
import { CARD, CardHead } from './CardHead'
import { cardActions } from './memberMath'

const INPUT = 'w-full rounded-xl border border-a-border bg-a-surface px-4 py-3 font-a-mono text-base text-a-text'

/**
 * A member's NFC cards on their page (release 5, spec 2026-10-23 §3, R5-2): each card's ID (shortened), when it was
 * linked, when it was last used and whether it is on; "Link NFC card" (tap, USB reader or type the ID) and "Switch
 * off" with a confirmation, for whoever may edit the member (every staff member; the server decides). Linking does
 * not change the member's QR code or wallet pass.
 */
export function NfcCards({ member, locale, timeZone }: { member: { id: number; name: string; is_erased: boolean }; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: cardsKey(member.id), queryFn: () => cardsApi.list(member.id) })
  const actions = cardActions(member)
  const [dialog, setDialog] = useState<'link' | NfcCardRow | null>(null)
  const [done, setDone] = useState<'linked' | 'already' | 'off' | null>(null)
  const cards = query.data?.cards ?? []

  return (
    <section aria-labelledby="cards-title" className={CARD}>
      <CardHead id="cards-title" icon={Nfc} title={t('loyalty.member.cards_title', 'NFC cards')}>
        {actions.link && (
          <Button size="sm" variant="secondary" onClick={() => { setDone(null); setDialog('link') }}><Plus size={15} aria-hidden />{t('loyalty.member.cards_link', 'Link NFC card')}</Button>
        )}
      </CardHead>
      {done === 'linked' && <Notice tone="success">{t('loyalty.member.cards_linked', 'The card is linked. Scan finds the member by it now.')}</Notice>}
      {done === 'already' && <Notice tone="info">{t('loyalty.member.cards_already', 'This card was already linked to this member.')}</Notice>}
      {done === 'off' && <Notice tone="success">{t('loyalty.member.cards_switched_off', 'The card is switched off. Scan no longer finds the member by it.')}</Notice>}
      {query.isError && <Notice tone="danger">{t(...errorKey('load', failureOf(query.error)))}</Notice>}
      {!query.data && query.isLoading && <Skeleton className="h-12" />}
      {query.data && cards.length === 0 && <p className="text-sm text-a-text-2">{t('loyalty.member.cards_none', 'No NFC card is linked to this member.')}</p>}
      {cards.length > 0 && (
        <ul className="-mx-5 divide-y divide-a-border">
          {cards.map(card => (
            <li key={card.id} data-card={card.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 ${card.is_active ? '' : 'opacity-70'}`}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-a-mono text-sm text-a-text" title={hexWithColons(card.uid)}>{shortUid(card.uid)}</span>
                  {card.is_active
                    ? <span className="rounded-full bg-a-st-confirmed/[0.12] px-2 py-0.5 text-xs font-semibold text-a-st-confirmed">{t('loyalty.member.cards_on', 'On')}</span>
                    : <span className="rounded-full bg-a-surface-2 px-2 py-0.5 text-xs font-semibold text-a-text-2">{t('loyalty.member.cards_off', 'Switched off')}</span>}
                </span>
                <span className="block text-xs text-a-text-2">
                  {[
                    card.linked_at ? t('loyalty.member.cards_linked_on', 'Linked {{day}}', { day: day(card.linked_at, locale, timeZone) }) : null,
                    card.last_used_at
                      ? t('loyalty.member.cards_last_used', 'Last used {{day}}', { day: day(card.last_used_at, locale, timeZone) })
                      : t('loyalty.member.cards_not_used', 'Not used yet'),
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              {card.is_active && actions.off && (
                <Button size="sm" variant="ghost" onClick={() => { setDone(null); setDialog(card) }}><PowerOff size={14} aria-hidden />{t('loyalty.member.cards_switch_off', 'Switch off')}</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog === 'link' && <LinkNfcDialog memberId={member.id} name={member.name} onClose={() => setDialog(null)} onDone={(linked) => { setDialog(null); setDone(linked ? 'linked' : 'already') }} />}
      {dialog !== null && dialog !== 'link' && <SwitchOffDialog memberId={member.id} card={dialog} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setDone('off') }} />}
    </section>
  )
}

/** Link a card to this member: tap it (Web NFC), read it on a USB reader, or type its ID (a reader that types works too). */
function LinkNfcDialog({ memberId, name, onClose, onDone }: { memberId: number; name: string; onClose: () => void; onDone: (linked: boolean) => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const env = useMemo(() => detectEnv(), [])
  const field = useFirstFocus<HTMLInputElement>()
  const [typed, setTyped] = useState('')
  const [usb, setUsb] = useState(false)
  const link = useMutation({
    mutationFn: (uid: string) => cardsApi.link(memberId, uid),
    onSuccess: (answer) => { afterCardChange(client, memberId); onDone(answer.linked) },
  })
  // One tap links the card's own ID (its serial number), whatever its records carry; listening stops with it.
  const nfc = useWebNfc((attempt) => {
    if (attempt.card !== null && !link.isPending) link.mutate(attempt.card)
  }, true)
  const failure = link.isError ? failureOf(link.error) : null
  const submit = (e: FormEvent) => { e.preventDefault(); if (typed.trim() !== '' && !link.isPending) link.mutate(typed.trim()) }

  return (
    <Dialog title={t('loyalty.member.cards_link_title', 'Link an NFC card to {{name}}', { name })} onClose={onClose} busy={link.isPending}>
      <div className="space-y-4">
        {env.webNfc ? (
          nfc.listening
            ? (
              <div className="space-y-2 rounded-xl border border-a-border bg-a-surface-2 p-3">
                <p role="status" className="flex items-center gap-2 text-sm text-a-text"><Nfc size={20} className="shrink-0 animate-pulse text-a-accent-text" aria-hidden />{t('loyalty.scan.nfc_listening', 'Hold the card flat against the back of the phone or tablet.')}</p>
                <Button size="sm" variant="secondary" onClick={nfc.stop}>{t('loyalty.scan.nfc_stop', 'Stop NFC')}</Button>
              </div>
            )
            : <Button full className="py-3 text-base" onClick={nfc.start}><Nfc size={18} aria-hidden />{t('loyalty.member.cards_tap', 'Tap the card')}</Button>
        ) : <p className="text-sm text-a-text-2">{t('loyalty.scan.nfc_unsupported', 'NFC works in Chrome on Android phones and tablets; on this device scan the QR code or type the number.')}</p>}
        {nfc.trouble && nfc.trouble !== 'unsupported' && <Notice tone="warning">{t('loyalty.member.cards_tap_failed', 'The card could not be read here. Try again, or type its ID.')}</Notice>}

        {env.webHid && (usb
          ? <UsbReader onUid={(uid) => { if (!link.isPending) link.mutate(hexWithColons(uid)) }} />
          : <Button full variant="secondary" className="py-3 text-base" onClick={() => setUsb(true)}><Usb size={18} aria-hidden />{t('loyalty.member.cards_usb', 'Use a USB reader')}</Button>)}

        <form className="space-y-1.5" onSubmit={submit}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-a-text">{t('loyalty.member.cards_id', 'Card ID')}</span>
            <input ref={field} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className={INPUT} />
          </label>
          <p className="text-xs text-a-text-2">{t('loyalty.member.cards_id_hint', 'As printed on the card, or as a reader types it (hex or decimal).')}</p>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={link.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
            <Button type="submit" loading={link.isPending} disabled={typed.trim() === ''}>{t('loyalty.member.cards_link_do', 'Link card')}</Button>
          </div>
        </form>
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty', ERRORS, 'cards', failure))}</Notice>}
      </div>
    </Dialog>
  )
}

/** Switch a lost card off, after a confirmation. Linking it again later switches it back on. */
function SwitchOffDialog({ memberId, card, onClose, onDone }: { memberId: number; card: NfcCardRow; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const off = useMutation({
    mutationFn: () => cardsApi.off(memberId, card.id),
    onSuccess: () => { afterCardChange(client, memberId); onDone() },
  })
  const failure = off.isError ? failureOf(off.error) : null

  return (
    <Dialog title={t('loyalty.member.cards_off_title', 'Switch off card {{id}}', { id: shortUid(card.uid) })} onClose={onClose} busy={off.isPending}>
      <div className="space-y-4">
        <p className="text-sm text-a-text">{t('loyalty.member.cards_off_effect', 'Scan will no longer find the member by this card. The member’s QR code and wallet pass keep working. Linking the card again later switches it back on.')}</p>
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty', ERRORS, 'cards', failure))}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={off.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
          <Button type="button" variant="danger" loading={off.isPending} onClick={() => off.mutate()}>{t('loyalty.member.cards_switch_off', 'Switch off')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
