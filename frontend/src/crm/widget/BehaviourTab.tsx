import { useTranslation } from 'react-i18next'
import { Clock, Copy, MessageCircle, ShieldCheck, UserCheck } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Select, TextArea, TextInput, Toggle } from '../ui/inputs'
import { PartCard, PartHeading, SectionedForm, TipField, TipToggle, type FormPart } from '../settings/formKit'
import { Problem } from './parts'
import type { ChatPart, WidgetPart } from './tabs'
import {
  DAYS, LEAD_FIELDS, TEXT_LIMITS, copyToWeekdays, problemOf, setDayOpen, setDayTime, zoneChoices, type Day, type LeadField,
  type TextField, type WidgetForm, type WidgetProblem,
} from './widgetForm'

/**
 * How the chat behaves with a visitor (widget-config), in four parts (round 5): asking for contact details, a way to a
 * person, consent and the rating prompt, and the opening hours with the offline message. The controller has no page
 * rules (which pages show the chat): pop-ups per page are the assistant's.
 */
export function BehaviourTab({ form, update, problems, canManage, venueZone, part, onPart, flagged }: {
  form: WidgetForm
  update: (patch: Partial<WidgetForm>) => void
  problems: WidgetProblem[]
  canManage: boolean
  venueZone: string
  part: ChatPart
  onPart: (next: ChatPart) => void
  flagged: ReadonlySet<WidgetPart>
}) {
  const { t, i18n } = useTranslation()
  const tooLong = (field: TextField) => problemOf(problems, field)
    ? <Problem>{t('crm.widget.too_long', 'Too long: at most {{max}} characters.', { max: TEXT_LIMITS[field] })}</Problem>
    : null
  const leadNames: Record<LeadField, string> = {
    name: t('crm.widget.chat.field_name', 'Name'),
    email: t('crm.widget.chat.field_email', 'Email'),
    phone: t('crm.widget.chat.field_phone', 'Phone'),
  }
  // Monday 2024-01-01 onwards: the weekday's name in the person's language.
  const dayName = (day: Day) => new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2024, 0, 1 + DAYS.indexOf(day))))
  const monday = form.business_hours.mon?.[0]

  const parts = ([
    { key: 'contact', icon: UserCheck, tone: 'accent', title: t('crm.widget.part.contact', 'Contact details') },
    { key: 'person', icon: MessageCircle, tone: 'progress', title: t('crm.widget.part.person', 'Talk to a person') },
    { key: 'privacy', icon: ShieldCheck, tone: 'neutral', title: t('crm.widget.part.privacy', 'Consent and ratings') },
    { key: 'hours', icon: Clock, tone: 'pending', title: t('crm.widget.part.hours', 'Opening hours') },
  ] as FormPart<ChatPart>[]).map(p => ({ ...p, flagged: flagged.has(p.key) }))

  return (
    <SectionedForm label={t('crm.widget.chat.parts', 'Parts of the behaviour')} idPrefix="widget-chat" parts={parts} value={part} onChange={onPart}>
      <fieldset disabled={!canManage} className="min-w-0">
        {part === 'contact' && (
          <PartCard>
            <TipToggle label={t('crm.widget.chat.lead', 'Ask visitors who they are')} checked={form.lead_capture_enabled} disabled={!canManage}
              tip={t('crm.widget.chat.lead_hint', 'A short form in the chat; what they give becomes a contact and a lead.')} onChange={on => update({ lead_capture_enabled: on })} />
            {form.lead_capture_enabled && (
              <>
                <fieldset>
                  <legend className="mb-1 text-xs font-medium text-a-text-2">{t('crm.widget.chat.fields', 'Ask for')}</legend>
                  <div className="flex flex-wrap gap-2">
                    {LEAD_FIELDS.map(field => (
                      <label key={field} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-a-border px-3 text-sm text-a-text">
                        <input type="checkbox" className="h-4 w-4 accent-a-accent-text" checked={form.lead_capture_fields[field]}
                          onChange={e => update({ lead_capture_fields: { ...form.lead_capture_fields, [field]: e.target.checked } })} />
                        {leadNames[field]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <TipField label={form.lead_capture_delay === 0
                  ? t('crm.widget.chat.delay_now', 'When: at the start of the chat')
                  : t('crm.widget.chat.delay', 'When: after {{n}} seconds', { n: form.lead_capture_delay })}>
                  {id => <input id={id} type="range" min={0} max={300} step={5} value={form.lead_capture_delay} onChange={e => update({ lead_capture_delay: Number(e.target.value) })} className="mt-2 w-full accent-a-accent-text" />}
                </TipField>
              </>
            )}
          </PartCard>
        )}

        {part === 'person' && (
          <PartCard>
            <div>
              <TipField label={t('crm.widget.chat.whatsapp', 'WhatsApp number')} tip={t('crm.widget.chat.whatsapp_hint', 'With the country code. Shows a WhatsApp button in the chat; empty hides it.')}>
                {id => <TextInput id={id} type="tel" value={form.handoff_whatsapp} placeholder="+44 20 7123 4567" onChange={e => update({ handoff_whatsapp: e.target.value })} />}
              </TipField>
              {problemOf(problems, 'handoff_whatsapp') && <Problem>{t('crm.widget.chat.whatsapp_bad', 'Use digits, spaces, + and brackets only (6 to 32).')}</Problem>}
            </div>
            <div>
              <TipField label={t('crm.widget.chat.email', 'Email when a visitor asks for a person')} tip={t('crm.widget.chat.email_hint', 'Once per conversation, so nobody waits unseen.')}>
                {id => <TextInput id={id} type="email" value={form.handoff_email} placeholder="team@example.com" onChange={e => update({ handoff_email: e.target.value })} />}
              </TipField>
              {problemOf(problems, 'handoff_email') && <Problem>{t('crm.widget.chat.email_bad', 'This does not look like an email address.')}</Problem>}
            </div>
          </PartCard>
        )}

        {part === 'privacy' && (
          <PartCard>
            <Toggle label={t('crm.widget.chat.consent', 'Ask for consent before the chat starts')} checked={form.gdpr_consent_required} disabled={!canManage}
              onChange={on => update({ gdpr_consent_required: on })} />
            {form.gdpr_consent_required && (
              <div>
                <TipField label={t('crm.widget.chat.consent_text', 'Consent text')}>
                  {id => <TextArea id={id} rows={2} value={form.gdpr_consent_text} placeholder={t('crm.widget.chat.consent_placeholder', 'By chatting with us you agree to our privacy policy.')}
                    onChange={e => update({ gdpr_consent_text: e.target.value })} />}
                </TipField>
                {tooLong('gdpr_consent_text')}
              </div>
            )}
            <Toggle label={t('crm.widget.chat.rating', 'Ask visitors to rate the chat when it is resolved')} checked={form.rating_prompt_enabled} disabled={!canManage}
              onChange={on => update({ rating_prompt_enabled: on })} />
            {form.rating_prompt_enabled && (
              <div>
                <TipField label={t('crm.widget.chat.rating_text', 'Question')}>
                  {id => <TextInput id={id} value={form.rating_prompt_text} placeholder={t('crm.widget.chat.rating_placeholder', 'How was your chat with us?')}
                    onChange={e => update({ rating_prompt_text: e.target.value })} />}
                </TipField>
                {tooLong('rating_prompt_text')}
              </div>
            )}
            <Toggle label={t('crm.widget.chat.sound', 'Play a sound in the inbox when a visitor writes')} checked={form.inbox_sound_enabled} disabled={!canManage}
              onChange={on => update({ inbox_sound_enabled: on })} />
          </PartCard>
        )}

        {part === 'hours' && (
          <PartCard>
            <PartHeading icon={Clock} title={t('crm.widget.chat.hours_title', 'Opening hours')}
              tip={t('crm.widget.chat.hours_line', 'Outside these hours the chat shows your offline message. No day set: always open.')}
              action={canManage && monday ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => update({ business_hours: copyToWeekdays(form.business_hours, 'mon') })}
                  title={t('crm.widget.chat.same_weekdays', 'Use Monday\'s hours for Tuesday to Friday')}>
                  <Copy size={14} aria-hidden />{t('crm.widget.chat.same_weekdays_short', 'Monday to all weekdays')}
                </Button>
              ) : undefined} />
            <TipField label={t('crm.widget.chat.zone', 'Time zone')}>
              {id => (
                <Select id={id} value={form.timezone} onChange={e => update({ timezone: e.target.value })}>
                  <option value="">{t('crm.widget.chat.zone_default', 'Not set (the server\'s)')}</option>
                  {zoneChoices(form.timezone || venueZone).map(zone => <option key={zone} value={zone}>{zone}</option>)}
                </Select>
              )}
            </TipField>
            <ul className="divide-y divide-a-border rounded-xl border border-a-border">
              {DAYS.map(day => {
                const slot = form.business_hours[day]?.[0]
                return (
                  <li key={day} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-1.5">
                    <span className="w-36 shrink-0">
                      <Toggle label={dayName(day)} checked={!!slot} disabled={!canManage} onChange={on => update({ business_hours: setDayOpen(form.business_hours, day, on) })} />
                    </span>
                    {slot ? (
                      <span className="flex items-center gap-2">
                        <label>
                          <span className="sr-only">{t('crm.widget.chat.opens', '{{day}} opens', { day: dayName(day) })}</span>
                          <TextInput type="time" value={slot.open} className="w-28" onChange={e => update({ business_hours: setDayTime(form.business_hours, day, 'open', e.target.value) })} />
                        </label>
                        <span aria-hidden className="text-sm text-a-text-2">–</span>
                        <label>
                          <span className="sr-only">{t('crm.widget.chat.closes', '{{day}} closes', { day: dayName(day) })}</span>
                          <TextInput type="time" value={slot.close} className="w-28" onChange={e => update({ business_hours: setDayTime(form.business_hours, day, 'close', e.target.value) })} />
                        </label>
                      </span>
                    ) : <span className="text-sm text-a-text-2">{t('crm.widget.chat.closed', 'Closed')}</span>}
                    {problemOf(problems, day) && <span className="basis-full"><Problem>{t('crm.widget.chat.hours_bad', 'The chat must open before it closes.')}</Problem></span>}
                  </li>
                )
              })}
            </ul>
            <div>
              <TipField label={t('crm.widget.chat.offline', 'Offline message')}>
                {id => <TextArea id={id} rows={3} value={form.offline_message} placeholder={t('crm.widget.chat.offline_placeholder', 'We are closed now. Leave a message and we will reply in the morning.')}
                  onChange={e => update({ offline_message: e.target.value })} />}
              </TipField>
              {tooLong('offline_message')}
            </div>
          </PartCard>
        )}
      </fieldset>
    </SectionedForm>
  )
}
