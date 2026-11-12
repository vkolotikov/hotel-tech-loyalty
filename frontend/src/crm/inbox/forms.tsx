import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { useRecords } from '../lib/useRecords'
import { SidePanel } from '../ui/SidePanel'
import { TextArea, TextInput } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { contactErrors, contactForm, contactPayload, leadErrors, leadForm, leadIdOf, leadPayload, type ContactForm, type LeadForm } from './inboxLogic'
import type { Conversation } from './types'
import { FIELD_ERROR_DEFAULTS } from './words'

function FieldError({ code }: { code?: 'email' | 'too_long' }) {
  const { t } = useTranslation()
  if (!code) return null
  return <span role="alert" className="mt-1 block text-xs text-a-danger">{t(`crm.inbox.field_error.${code}`, FIELD_ERROR_DEFAULTS[code])}</span>
}

/** The visitor's details and the team's notes on this chat (`PUT chat-inbox/{id}/contact`); no lead is made. */
export function ContactPanel({ conversation, onClose, onSaved }: { conversation: Conversation; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [form, setForm] = useState<ContactForm>(() => contactForm(conversation))
  const [tried, setTried] = useState(false)
  const errors = contactErrors(form)
  const save = useMutation({
    mutationFn: () => send('put', `chat-inbox/${conversation.id}/contact`, contactPayload(form)),
    onSuccess: () => { toast(t('crm.inbox.contact_saved', 'Contact details saved')); onSaved(); onClose() },
  })
  const set = (key: keyof ContactForm) => (value: string) => setForm(f => ({ ...f, [key]: value }))
  const submit = () => { setTried(true); if (Object.keys(errors).length === 0) save.mutate() }

  return (
    <SidePanel title={t('crm.inbox.contact_title', 'Contact details')} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
        <Button onClick={submit} loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
      </div>}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit() }}>
        <Field label={t('crm.inbox.name', 'Name')}>
          <TextInput value={form.visitor_name} maxLength={120} autoComplete="off" onChange={e => set('visitor_name')(e.target.value)} />
          {tried && <FieldError code={errors.visitor_name} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('crm.inbox.email', 'Email')}>
            <TextInput type="email" value={form.visitor_email} maxLength={180} autoComplete="off" onChange={e => set('visitor_email')(e.target.value)} />
            {tried && <FieldError code={errors.visitor_email} />}
          </Field>
          <Field label={t('crm.inbox.phone', 'Phone')}>
            <TextInput type="tel" value={form.visitor_phone} maxLength={30} autoComplete="off" onChange={e => set('visitor_phone')(e.target.value)} />
            {tried && <FieldError code={errors.visitor_phone} />}
          </Field>
          <Field label={t('crm.inbox.city', 'City')}>
            <TextInput value={form.visitor_city} maxLength={100} onChange={e => set('visitor_city')(e.target.value)} />
          </Field>
          <Field label={t('crm.inbox.country', 'Country')}>
            <TextInput value={form.visitor_country} maxLength={100} onChange={e => set('visitor_country')(e.target.value)} />
          </Field>
        </div>
        <Field label={t('crm.inbox.notes', 'Notes for the team')} hint={t('crm.inbox.notes_hint', 'Only your team sees these.')}>
          <TextArea rows={4} value={form.agent_notes} maxLength={5000} onChange={e => set('agent_notes')(e.target.value)} />
          {tried && <FieldError code={errors.agent_notes} />}
        </Field>
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
        <button type="submit" className="sr-only">{t('crm.common.save', 'Save')}</button>
      </form>
    </SidePanel>
  )
}

/**
 * Make a lead (and a contact) of this chat (`POST chat-inbox/{id}/capture-lead`), then open it in its panel. Round 5:
 * `onOwnAction` tells the alerts as the request leaves that the hot leads are about to rise by the person's own doing
 * (and gives back a way to take that back if the request fails).
 */
export function LeadPanel({ conversation, onClose, onSaved, onOwnAction }: { conversation: Conversation; onClose: () => void; onSaved: () => void; onOwnAction?: () => () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const records = useRecords()
  const own = useRef<(() => void) | null>(null)
  const [form, setForm] = useState<LeadForm>(() => leadForm(conversation))
  const [tried, setTried] = useState(false)
  const [made, setMade] = useState<number | null>(null)
  const errors = leadErrors(form)
  const save = useMutation({
    mutationFn: () => send<{ inquiry_id?: number }>('post', `chat-inbox/${conversation.id}/capture-lead`, leadPayload(form)),
    onMutate: () => { own.current = onOwnAction?.() ?? null },
    onError: () => { own.current?.(); own.current = null },
    onSuccess: answer => { setMade(leadIdOf(answer) ?? 0); toast(t('crm.inbox.lead_made', 'Lead created')); onSaved() },
  })
  const set = (key: keyof LeadForm) => (value: string) => setForm(f => ({ ...f, [key]: value }))
  const submit = () => { setTried(true); if (Object.keys(errors).length === 0) save.mutate() }

  if (made !== null) {
    return (
      <SidePanel title={t('crm.inbox.lead_title', 'Capture as lead')} onClose={onClose}
        footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t('crm.common.close', 'Close')}</Button></div>}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-a-st-confirmed/12 text-a-st-confirmed"><CheckCircle2 size={22} /></span>
          <p className="font-a-display text-xl text-a-text">{t('crm.inbox.lead_made', 'Lead created')}</p>
          <p className="max-w-sm text-sm text-a-text-2">{t('crm.inbox.lead_made_line', 'The lead and its contact are in your CRM, linked to this chat.')}</p>
          {made > 0 && (
            <Link to={records.href('lead', made)} onClick={onClose} className="inline-flex items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep">
              {t('crm.inbox.open_lead', 'Open the lead')}<ArrowRight size={15} aria-hidden />
            </Link>
          )}
        </div>
      </SidePanel>
    )
  }

  return (
    <SidePanel title={t('crm.inbox.lead_title', 'Capture as lead')} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
        <Button onClick={submit} loading={save.isPending}>{t('crm.inbox.lead_create', 'Create the lead')}</Button>
      </div>}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit() }}>
        <p className="text-sm text-a-text-2">{t('crm.inbox.lead_line', 'A new lead and contact are made from this chat. An email you already have joins its contact.')}</p>
        <Field label={t('crm.inbox.name', 'Name')}>
          <TextInput value={form.name} maxLength={120} autoComplete="off" onChange={e => set('name')(e.target.value)} />
          {tried && <FieldError code={errors.name} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('crm.inbox.email', 'Email')}>
            <TextInput type="email" value={form.email} maxLength={180} autoComplete="off" onChange={e => set('email')(e.target.value)} />
            {tried && <FieldError code={errors.email} />}
          </Field>
          <Field label={t('crm.inbox.phone', 'Phone')}>
            <TextInput type="tel" value={form.phone} maxLength={30} autoComplete="off" onChange={e => set('phone')(e.target.value)} />
            {tried && <FieldError code={errors.phone} />}
          </Field>
        </div>
        <Field label={t('crm.inbox.lead_notes', 'What they want (optional)')}>
          <TextArea rows={4} value={form.notes} maxLength={2000} onChange={e => set('notes')(e.target.value)} />
          {tried && <FieldError code={errors.notes} />}
        </Field>
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
        <button type="submit" className="sr-only">{t('crm.inbox.lead_create', 'Create the lead')}</button>
      </form>
    </SidePanel>
  )
}
