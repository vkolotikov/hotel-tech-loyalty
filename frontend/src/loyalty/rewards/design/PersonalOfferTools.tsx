import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileText, Paperclip, Send, X, Download } from 'lucide-react'
import { MemberPicker } from '../../events/MemberPicker'
import { EditorDialog, EditorSection } from '../../editors/EditorUI'
import { OverviewButton } from '../../overview/OverviewUI'
import { Notice } from '../../../workspace/ui/Notice'
import { failureOf } from '../../lib/api'
import { OFFERS_KEY, rewardsApi } from '../api'
import type { Offer } from '../types'
import './personalOffers.css'

export function OfferMembers({ ids, members = [], onChange }: { ids: number[]; members?: { id: number; name: string }[]; onChange: (ids: number[]) => void }) {
  const { t } = useTranslation()
  const [names, setNames] = useState<Record<number, string>>(() => Object.fromEntries(members.map(m => [m.id, m.name])))
  return <div className="l-personal-members">
    <MemberPicker label={t('loyalty.personal.search')} action={member => <OverviewButton type="button" disabled={ids.includes(member.id)} onClick={() => { setNames(old => ({ ...old, [member.id]: member.name })); onChange([...ids, member.id]) }}>{t(ids.includes(member.id) ? 'loyalty.personal.selected' : 'loyalty.personal.select')}</OverviewButton>} />
    <p className="text-xs text-a-text-2" aria-live="polite">{t('loyalty.personal.selectedCount', { count: ids.length })}</p>
    <ul className="l-personal-chips">{ids.map(id => <li key={id}><span>{names[id] ?? members.find(m => m.id === id)?.name ?? `#${id}`}</span><button type="button" aria-label={t('loyalty.personal.removeMember', { name: names[id] ?? members.find(m => m.id === id)?.name ?? `#${id}` })} onClick={() => onChange(ids.filter(n => n !== id))}><X size={13} aria-hidden /></button></li>)}</ul>
  </div>
}

export function OfferAttachmentTile({ offer, manage, onBusyChange, onChange }: { offer: Offer; manage: boolean; onBusyChange?: (busy: boolean) => void; onChange?: () => void }) {
  const { t } = useTranslation(), qc = useQueryClient(), input = useRef<HTMLInputElement>(null)
  const change = useMutation({ mutationFn: async (file: File | null) => { if (file) await rewardsApi.uploadAttachment(offer.id, file); else await rewardsApi.removeAttachment(offer.id) }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: OFFERS_KEY }); onChange?.() } })
  useEffect(() => { onBusyChange?.(change.isPending); return () => { if (change.isPending) onBusyChange?.(false) } }, [change.isPending, onBusyChange])
  const download = useMutation({ mutationFn: () => rewardsApi.downloadAttachment(offer.id), onSuccess: blob => saveFile(blob, offer.attachment?.name ?? 'voucher') })
  const [invalid, setInvalid] = useState(false)
  return <section className="l-personal-file"><div className="l-personal-file-heading"><Paperclip size={16} aria-hidden /><strong>{t('loyalty.personal.attachment')}</strong></div>
    {offer.attachment ? <div className="l-personal-file-row"><FileText size={25} aria-hidden /><div><strong>{offer.attachment.name}</strong><small>{Math.max(1, Math.ceil(offer.attachment.bytes / 1024))} KB</small></div><OverviewButton type="button" disabled={download.isPending || change.isPending} onClick={() => download.mutate()} aria-label={t('loyalty.personal.download')}><Download size={15} aria-hidden /></OverviewButton></div> : <small>{t('loyalty.personal.fileHint')}</small>}
    {manage && <div className="flex flex-wrap gap-2"><input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" aria-label={t('loyalty.personal.attachment')} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > 5 * 1024 * 1024) { setInvalid(true); return }; setInvalid(false); change.mutate(file) }} /><OverviewButton disabled={change.isPending} onClick={() => input.current?.click()}>{t(offer.attachment ? 'loyalty.personal.replace' : 'loyalty.personal.upload')}</OverviewButton>{offer.attachment && <OverviewButton disabled={change.isPending} onClick={() => change.mutate(null)}>{t('loyalty.personal.remove')}</OverviewButton>}</div>}
    {(invalid || change.isError) && <Notice tone="danger">{t('loyalty.personal.fileError')}</Notice>}{download.isError && <Notice tone="danger">{t('loyalty.personal.downloadError')}</Notice>}
  </section>
}

export function SendOfferDialog({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const { t } = useTranslation()
  const [ids, setIds] = useState(offer.member_ids ?? []), key = useRef(crypto.randomUUID())
  const [sent, setSent] = useState(false), [mode, setMode] = useState<'selected' | 'all'>('selected'), [fileBusy, setFileBusy] = useState(false), choiceName = useId()
  const preview = useMutation({ mutationFn: () => rewardsApi.offerPreview(offer.id, ids, mode) })
  const send = useMutation({ mutationFn: () => rewardsApi.sendOffer(offer.id, preview.data!.member_ids, preview.data!.revision, key.current), onSuccess: () => setSent(true) })
  const busy = preview.isPending || send.isPending || fileBusy, available = ['live', 'upcoming'].includes(offer.state)
  const reset = () => { preview.reset(); send.reset(); key.current = crypto.randomUUID() }
  const reviewRef = useRef<HTMLElement>(null)
  useEffect(() => { if (preview.data) { reviewRef.current?.scrollIntoView({ block: 'end' }); reviewRef.current?.focus({ preventScroll: true }) } }, [preview.data])
  return <EditorDialog area="rewards" section={t('loyalty.personal.delivery')} title={offer.title} icon="ticket" tone="violet" busy={busy} onClose={onClose}>
    <div className="l-editor-body l-editor-stack"><p>{t('loyalty.personal.sendHint')}</p>
      {sent ? <Notice tone="success">{t('loyalty.personal.sent')}</Notice> : <>
        <fieldset className="l-editor-stack" disabled={preview.isPending || send.isPending}>
          <OfferAttachmentTile offer={offer} manage onBusyChange={setFileBusy} onChange={reset} />
          <EditorSection title={t('loyalty.personal.recipients')}><fieldset disabled={busy} className="l-editor-stack">
            <div className="l-offer-audience" role="radiogroup" aria-label={t('loyalty.personal.recipients')}>{(['selected', 'all'] as const).map(value => <label key={value} className="l-offer-audience-option"><input type="radio" name={choiceName} value={value} checked={mode === value} onChange={() => { setMode(value); reset() }} /><span className="l-offer-radio-mark" aria-hidden /><span className="l-offer-choice-label">{t(value === 'all' ? 'loyalty.personal.allRecipients' : 'loyalty.personal.selectedRecipients')}</span></label>)}</div>
            {mode === 'selected' ? <OfferMembers ids={ids} members={offer.members} onChange={next => { setIds(next); reset() }} /> : <small>{t('loyalty.personal.allHint')}</small>}
          </fieldset></EditorSection>
        </fieldset>
        {!available && <Notice tone="warning">{t('loyalty.personal.availableHint')}</Notice>}
        {preview.data && <section ref={reviewRef} tabIndex={-1} className="l-offer-send-review" aria-label={t('loyalty.personal.review')}><EditorSection title={t('loyalty.personal.review')}><small>{t('loyalty.personal.selectedCount', { count: preview.data.member_ids.length })}</small><strong>{preview.data.offer.title}</strong><p className="whitespace-pre-wrap text-sm text-a-text-2">{preview.data.offer.description}</p>{preview.data.offer.code && <code>{preview.data.offer.code}</code>}<small>{preview.data.offer.start_date} &ndash; {preview.data.offer.end_date}</small>{preview.data.offer.attachment && <p className="l-personal-file-heading"><Paperclip size={16} aria-hidden />{preview.data.offer.attachment.name}</p>}<div className="l-personal-counts"><div><strong>{preview.data.counts.email}</strong><span>{t('loyalty.personal.email')}</span></div><div><strong>{preview.data.counts.portal}</strong><span>{t('loyalty.personal.portal')}</span></div></div><small>{t('loyalty.personal.exclusions', { ineligible: preview.data.counts.ineligible, email: preview.data.counts.eligible - preview.data.counts.email, portal: preview.data.counts.portal_off })}</small><small>{t('loyalty.personal.consent')}</small></EditorSection></section>}
        {preview.isError && <Notice tone="danger">{t(failureOf(preview.error).code === 'too_many' ? 'loyalty.personal.tooMany' : 'loyalty.personal.previewError')}</Notice>}{send.isError && <Notice tone="danger">{t('loyalty.personal.sendError')}</Notice>}
      </>}
    </div><footer className="l-editor-footer"><OverviewButton disabled={busy} onClick={onClose}>{t(sent ? 'loyalty.personal.done' : 'loyalty.common.cancel')}</OverviewButton>{!sent && (preview.data ? <OverviewButton primary disabled={busy || !available || preview.data.counts.email + preview.data.counts.portal === 0} onClick={() => send.mutate()}><Send size={15} aria-hidden />{t('loyalty.personal.confirmSend')}</OverviewButton> : <OverviewButton primary disabled={busy || !available || (mode === 'selected' && ids.length === 0)} onClick={() => preview.mutate()}>{t('loyalty.personal.review')}</OverviewButton>)}</footer>
  </EditorDialog>
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
