import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CreditCard, Download, Nfc, Plus, QrCode } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../LoyaltyProvider'
import { memberPath } from '../lib/links'
import { AddMemberDialog } from '../membership/AddMemberDialog'
import { afterCardChange } from '../scan/cardsApi'
import { Pager } from '../ui/Pager'
import { AssignCardDialog, BatchDialog, CardError, PairCardDialog, PrintedQrDialog } from './CardDialogs'
import { ManageTagDialog } from './ManageTagDialog'
import { cardBatchesKey, physicalCardsApi, physicalCardsKey, type PhysicalCard } from './api'
import { usePhysicalCardWords } from './words'

type OpenCard = { action: 'assign' | 'new-member' | 'pair' | 'qr'; card: PhysicalCard; uid?: string }
const CONTROL = 'w-full min-w-0 rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

export function PhysicalCardsPage() {
  const say = usePhysicalCardWords()
  const client = useQueryClient()
  const manages = useBoot().staff.can.manage_members
  const [open, setOpen] = useState<OpenCard | 'batch' | 'tag' | null>(null)
  const [batch, setBatch] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [saved, setSaved] = useState<{ key: string; number: string } | null>(null)
  const batches = useQuery({ queryKey: cardBatchesKey, queryFn: physicalCardsApi.batches })
  const stock = useQuery({
    queryKey: [...physicalCardsKey, batch, search, page],
    queryFn: () => physicalCardsApi.list({ batch_id: batch ?? undefined, q: search || undefined, page }),
  })
  const download = useMutation({
    mutationFn: async (batchId: number) => ({ batchId, blob: await physicalCardsApi.archive(batchId) }),
    onSuccess: ({ batchId, blob }) => {
      const link = document.createElement('a')
      const address = URL.createObjectURL(blob)
      link.href = address
      link.download = 'loyalty-cards-' + batchId + '.zip'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(address), 1000)
    },
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(typed.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [typed])

  const select = (id: number | null) => {
    setBatch(id)
    setPage(1)
    if (!download.isPending) download.reset()
  }
  const refresh = () => { void client.invalidateQueries({ queryKey: physicalCardsKey }) }
  const assigned = (card: PhysicalCard, memberId: number) => {
    afterCardChange(client, memberId)
    if (card.member && card.member.id !== memberId) afterCardChange(client, card.member.id)
    setOpen(null)
    setSaved({ key: 'assignedToMember', number: card.number })
  }
  const show = (action: OpenCard['action'], card: PhysicalCard, uid?: string) => {
    setSaved(null)
    setOpen({ action, card, uid })
  }
  const selected = typeof open === 'object' ? open : null

  return <div className="l-ov-page">
    <Link to="/loyalty" className="l-ov-link inline-flex items-center gap-1.5"><ArrowLeft size={15} aria-hidden />{say('members')}</Link>
    <header className="l-ov-page-heading">
      <h1>{say('title')}</h1>
      {manages && <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => { setSaved(null); setOpen('tag') }}><Nfc size={16} aria-hidden />{say('manageTag')}</Button>
        <Button onClick={() => { setSaved(null); setOpen('batch') }} disabled={!batches.data}><Plus size={16} aria-hidden />{say('newBatch')}</Button>
      </div>}
    </header>

    <div className="l-ov-panel space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1">
          <Field label={say('batch')}>
            <select className={CONTROL} value={batch ?? ''} onChange={event => select(event.target.value ? Number(event.target.value) : null)}>
              <option value="">{say('allBatches')}</option>
              {batches.data?.batches.map(item => <option key={item.id} value={item.id}>
                {item.first_number} – {item.last_number}
              </option>)}
            </select>
          </Field>
        </div>
        <div className="min-w-0 flex-1">
          <Field label={say('search')}>
            <input className={CONTROL} value={typed} type="search" placeholder="AF 10001" maxLength={24}
              onChange={event => setTyped(event.target.value)} />
          </Field>
        </div>
        {manages && batch !== null && <Button variant="secondary" loading={download.isPending} onClick={() => download.mutate(batch)}>
          <Download size={16} aria-hidden />{say('downloadBatch')}
        </Button>}
      </div>
      {batches.isError && <CardError error={batches.error} />}
      {download.isError && <CardError error={download.error} />}
      {saved && <Notice tone="success">{say(saved.key, { number: saved.number })}</Notice>}
      {stock.isError && <><CardError error={stock.error} /><Button variant="secondary" onClick={() => void stock.refetch()}>{say('retry')}</Button></>}
      {stock.isLoading && <Skeleton className="h-36" />}
      {stock.data && stock.data.total === 0 && <p className="text-sm text-a-text-2">{say(search || batch !== null ? 'noMatches' : 'noCards')}</p>}
      {stock.data && stock.data.total > 0 && <>
        <p role="status" className="text-sm text-a-text-2">{say('count', { count: stock.data.total })}</p>
        <ul className="divide-y divide-a-border rounded-xl border border-a-border">
          {stock.data.cards.map(card => <li key={card.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3">
            <span className="flex min-w-28 items-center gap-2 font-a-mono text-sm font-semibold text-a-text">
              <CreditCard size={17} className="text-a-accent-text" aria-hidden />{card.number}
            </span>
            <span className="min-w-28 text-sm text-a-text-2">{say('status.' + card.status)}</span>
            <span className="min-w-28 text-sm text-a-text-2">{say(card.uid === null ? 'nfcMissing' : 'nfcReady')}</span>
            <span className="min-w-24 flex-1 text-sm">
              {card.member && <Link className="l-ov-link" to={memberPath(card.member.id)}>{card.member.name ?? card.member.number}</Link>}
            </span>
            <div className="flex flex-wrap gap-1">
              {(manages || card.uid === null || card.status !== 'assigned') && <Button size="sm" variant="secondary" onClick={() => show('pair', card)}>
                <Nfc size={15} aria-hidden />{say(card.uid === null ? 'pair' : 'editNfc')}
              </Button>}
              {card.status !== 'assigned' && <Button size="sm" variant="secondary" onClick={() => show('assign', card)}>{say('assign')}</Button>}
              <Button size="sm" variant="ghost" onClick={() => show('qr', card)} aria-label={say('qrTitle', { number: card.number })}>
                <QrCode size={16} aria-hidden />{say('qr')}
              </Button>
            </div>
          </li>)}
        </ul>
        <Pager page={stock.data.page} pages={stock.data.pages} onPage={setPage} />
      </>}
    </div>

    {open === 'batch' && batches.data && <BatchDialog limit={batches.data.limit} onClose={() => setOpen(null)} onCreated={created => {
      void client.invalidateQueries({ queryKey: cardBatchesKey })
      select(created.id)
      setTyped('')
      setSearch('')
      setOpen(null)
      refresh()
    }} />}
    {open === 'tag' && <ManageTagDialog onClose={() => setOpen(null)} />}
    {selected?.action === 'pair' && <PairCardDialog initial={selected.card} onClose={() => setOpen(null)} onPaired={card => {
      if (card.member) afterCardChange(client, card.member.id)
      else refresh()
      setSaved({ key: 'paired', number: card.number })
    }} />}
    {selected?.action === 'assign' && <AssignCardDialog card={selected.card} onClose={() => setOpen(null)}
      onAssigned={memberId => assigned(selected.card, memberId)} onAdd={uid => show('new-member', selected.card, uid)} />}
    {selected?.action === 'new-member' && <AddMemberDialog physicalCard={{ ...selected.card, capturedUid: selected.uid }}
      onClose={() => setOpen(null)} onCreated={memberId => assigned(selected.card, memberId)} />}
    {selected?.action === 'qr' && <PrintedQrDialog card={selected.card} onClose={() => setOpen(null)} />}
  </div>
}
