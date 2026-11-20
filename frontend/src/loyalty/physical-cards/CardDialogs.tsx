import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Plus, Usb } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { MemberPicker } from '../events/MemberPicker'
import { useFirstFocus } from '../lib/useFirstFocus'
import { hexWithColons } from '../scan/scanMath'
import { UsbReader } from '../scan/UsbReader'
import { physicalCardsApi, physicalCardsKey, type BatchRange, type CardBatch, type PhysicalCard } from './api'
import { physicalCardError, usePhysicalCardWords } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

export function CardError({ error, limit }: { error: unknown; limit?: number }) {
  const say = usePhysicalCardWords()
  const failure = physicalCardError(error)
  return <Notice tone="danger">{say(failure.key, { number: failure.number, ...(limit === undefined ? {} : { limit }) })}</Notice>
}

export function BatchDialog({ limit, onClose, onCreated }: { limit: number; onClose: () => void; onCreated: (batch: CardBatch) => void }) {
  const say = usePhysicalCardWords()
  const first = useFirstFocus<HTMLInputElement>()
  const [range, setRange] = useState<BatchRange>({ prefix: '', first: '', last: '' })
  const create = useMutation({ mutationFn: physicalCardsApi.create, onSuccess: ({ batch }) => onCreated(batch) })
  const change = (key: keyof BatchRange, value: string) => {
    setRange(old => ({ ...old, [key]: value }))
    if (create.isError) create.reset()
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!create.isPending) create.mutate(range)
  }

  return <Dialog title={say('newBatch')} onClose={onClose} busy={create.isPending}>
    <form onSubmit={submit} className="space-y-4">
      <Field label={say('prefix')}>
        <input ref={first} className={INPUT} value={range.prefix} placeholder="AF" maxLength={12} autoComplete="off"
          pattern="[A-Za-z0-9][A-Za-z0-9\-]{0,11}" onChange={event => change('prefix', event.target.value)} disabled={create.isPending} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={say('firstNumber')}>
          <input required className={INPUT} value={range.first} placeholder="10001" inputMode="numeric" pattern="[0-9]{1,9}"
            maxLength={9} autoComplete="off" onChange={event => change('first', event.target.value)} disabled={create.isPending} />
        </Field>
        <Field label={say('lastNumber')}>
          <input required className={INPUT} value={range.last} placeholder="10100" inputMode="numeric" pattern="[0-9]{1,9}"
            maxLength={9} autoComplete="off" onChange={event => change('last', event.target.value)} disabled={create.isPending} />
        </Field>
      </div>
      <p className="text-sm text-a-text-2">{say('rangeHint', { limit })}</p>
      {create.isError && <CardError error={create.error} limit={limit} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>{say('cancel')}</Button>
        <Button type="submit" loading={create.isPending}>{say('createBatch')}</Button>
      </div>
    </form>
  </Dialog>
}

export function PairCardDialog({ initial, onClose, onPaired }: { initial: PhysicalCard; onClose: () => void; onPaired: (card: PhysicalCard) => void }) {
  const say = usePhysicalCardWords()
  const client = useQueryClient()
  const [card, setCard] = useState(initial)
  const [uid, setUid] = useState('')
  const [usb, setUsb] = useState(false)
  const [lastPaired, setLastPaired] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const pair = useMutation({
    mutationFn: (value: string) => physicalCardsApi.pair(card, value),
    onError: error => {
      if (physicalCardError(error).key === 'errors.card_changed') {
        void client.invalidateQueries({ queryKey: physicalCardsKey })
      }
    },
    onSuccess: ({ card: saved, next }) => {
      onPaired(saved)
      if (!next || initial.uid !== null) {
        onClose()
        return
      }
      setLastPaired(saved.number)
      setUid('')
      setCard(next)
    },
  })

  useEffect(() => {
    if (!pair.isPending) field.current?.focus()
  }, [card.id, pair.isPending])

  const change = (value: string) => {
    setUid(value)
    if (pair.isError) pair.reset()
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!pair.isPending && uid.trim()) pair.mutate(uid.trim())
  }

  return <Dialog title={say('pairTitle', { number: card.number })} onClose={onClose} busy={pair.isPending}>
    <div className="space-y-4">
      {lastPaired !== null && <Notice tone="success">{say('paired', { number: lastPaired })}</Notice>}
      {initial.uid !== null && <p className="text-sm text-a-text-2">{say('currentUid', { uid: hexWithColons(initial.uid) })}</p>}
      <form onSubmit={submit} className="space-y-4">
        <Field label={say('uid')} hint={say('readerHint')}>
          <input ref={field} className={INPUT} value={uid} onChange={event => change(event.target.value)} maxLength={100}
            autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={pair.isPending} />
        </Field>
        {pair.isError && <CardError error={pair.error} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pair.isPending}>{say('done')}</Button>
          <Button type="submit" loading={pair.isPending} disabled={uid.trim() === ''}>{say('saveNfc')}</Button>
        </div>
      </form>
      <Button type="button" variant="ghost" onClick={() => setUsb(value => !value)} aria-expanded={usb}>
        <Usb size={16} aria-hidden />{say('readerOptions')}
      </Button>
      {usb && <UsbReader onUid={value => { if (!pair.isPending) change(hexWithColons(value)) }} />}
    </div>
  </Dialog>
}

export function AssignCardDialog({ card, onAdd, onClose, onAssigned }: {
  card: PhysicalCard; onAdd: () => void; onClose: () => void; onAssigned: (memberId: number) => void
}) {
  const say = usePhysicalCardWords()
  const first = useFirstFocus<HTMLInputElement>()
  const assign = useMutation({
    mutationFn: (memberId: number) => physicalCardsApi.assign(card.id, memberId),
    onSuccess: (_answer, memberId) => onAssigned(memberId),
  })

  return <Dialog title={say('assignTitle', { number: card.number })} onClose={onClose} busy={assign.isPending}>
    <div className="space-y-4">
      <MemberPicker label={say('findMember')} inputRef={first} action={member => (
        <Button type="button" size="sm" disabled={assign.isPending || !member.is_active} onClick={() => assign.mutate(member.id)}>
          {say(member.is_active ? 'assign' : 'inactiveMember')}
        </Button>
      )} />
      {assign.isError && <CardError error={assign.error} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={assign.isPending} onClick={onAdd}>
          <Plus size={16} aria-hidden />{say('newMember')}
        </Button>
        <Button type="button" variant="ghost" disabled={assign.isPending} onClick={onClose}>{say('cancel')}</Button>
      </div>
    </div>
  </Dialog>
}

export function PrintedQrDialog({ card, onClose }: { card: PhysicalCard; onClose: () => void }) {
  const say = usePhysicalCardWords()
  const qr = useQuery({ queryKey: ['loyalty', 'printed-qr', card.id], queryFn: () => physicalCardsApi.qr(card.id), retry: false })
  const title = say('qrTitle', { number: card.number })

  return <Dialog title={title} onClose={onClose}><div className="space-y-4">
    {qr.isLoading && <Skeleton className="mx-auto h-56 w-56" />}
    {qr.isError && <CardError error={qr.error} />}
    {qr.data && <>
      <img className="mx-auto rounded-lg" src={qr.data.qr_svg} alt={title} width={240} height={240} />
      <a href={qr.data.qr_svg} download={card.number + '.svg'} className="l-ov-button">
        <Download size={16} aria-hidden />{say('downloadQr')}
      </a>
    </>}
  </div></Dialog>
}
