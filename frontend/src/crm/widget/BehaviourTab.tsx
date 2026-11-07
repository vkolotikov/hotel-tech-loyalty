import { useTranslation } from 'react-i18next'
import { Clock, MessageCircle, ShieldCheck, UserCheck } from 'lucide-react'
import { Field } from '../../workspace/ui/Field'
import { Card } from '../ui/Card'
import { Select, TextArea, TextInput, Toggle } from '../ui/inputs'
import { Problem } from './parts'
import {
  DAYS, LEAD_FIELDS, TEXT_LIMITS, problemOf, setDayOpen, setDayTime, zoneChoices, type Day, type LeadField, type TextField,
  type WidgetForm, type WidgetProblem,
} from './widgetForm'

/**
 * How the chat behaves with a visitor (widget-config): asking for contact details, opening hours and the offline
 * message, a way to reach a person, consent and the rating prompt, and the inbox's sound. The controller has no
 * page rules (which pages show the chat): pop-ups per page are the assistant's (AI assistant → Pop-ups).
 */
export function BehaviourTab({ form, update, problems, canManage, venueZone }: {
  form: WidgetForm
  update: (patch: Partial<WidgetForm>) => void
  problems: WidgetProblem[]
  canManage: boolean
  venueZone: string
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

  return (
    <fieldset disabled={!canManage} className="min-w-0 space-y-5">
      <Card title={t('crm.widget.chat.lead_title', 'Ask for contact details')} icon={UserCheck}>
        <div className="space-y-4">
          <Toggle label={t('crm.widget.chat.lead', 'Ask visitors who they are')} checked={form.lead_capture_enabled} disabled={!canManage}
            hint={t('crm.widget.chat.lead_hint', 'A short form in the chat; what they give becomes a contact and a lead.')} onChange={on => update({ lead_capture_enabled: on })} />
          {form.lead_capture_enabled && (
            <>
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-a-text-2">{t('crm.widget.chat.fields', 'Ask for')}</legend>
                <div className="flex flex-wrap gap-4">
                  {LEAD_FIELDS.map(field => (
                    <label key={field} className="flex cursor-pointer items-center gap-2 text-sm text-a-text">
                      <input type="checkbox" className="h-4 w-4 accent-a-accent-text" checked={form.lead_capture_fields[field]}
                        onChange={e => update({ lead_capture_fields: { ...form.lead_capture_fields, [field]: e.target.checked } })} />
                      {leadNames[field]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label={form.lead_capture_delay === 0
                ? t('crm.widget.chat.delay_now', 'When: at the start of the chat')
                : t('crm.widget.chat.delay', 'When: after {{n}} seconds', { n: form.lead_capture_delay })}>
                <input type="range" min={0} max={300} step={5} value={form.lead_capture_delay} onChange={e => update({ lead_capture_delay: Number(e.target.value) })} className="mt-2 w-full accent-a-accent-text" />
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card title={t('crm.widget.chat.hours_title', 'Opening hours')} icon={Clock}>
        <div className="space-y-4">
          <p className="text-sm text-a-text-2">{t('crm.widget.chat.hours_line', 'Outside these hours the chat shows your offline message. No day set: always open.')}</p>
          <Field label={t('crm.widget.chat.zone', 'Time zone')}>
            <Select value={form.timezone} onChange={e => update({ timezone: e.target.value })}>
              <option value="">{t('crm.widget.chat.zone_default', 'Not set (the server\'s)')}</option>
              {zoneChoices(form.timezone || venueZone).map(zone => <option key={zone} value={zone}>{zone}</option>)}
            </Select>
          </Field>
          <ul className="space-y-2">
            {DAYS.map(day => {
              const slot = form.business_hours[day]?.[0]
              return (
                <li key={day} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="w-32 shrink-0">
                    <Toggle label={dayName(day)} checked={!!slot} disabled={!canManage} onChange={on => update({ business_hours: setDayOpen(form.business_hours, day, on) })} />
                  </span>
                  {slot ? (
                    <span className="flex items-center gap-2">
                      <label>
                        <span className="sr-only">{t('crm.widget.chat.opens', '{{day}} opens', { day: dayName(day) })}</span>
                        <TextInput type="time" value={slot.open} className="w-28" onChange={e => update({ business_hours: setDayTime(form.business_hours, day, 'open', e.target.value) })} />
                      </label>
                      <span className="text-sm text-a-text-2">–</span>
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
            <Field label={t('crm.widget.chat.offline', 'Offline message')}>
              <TextArea rows={2} value={form.offline_message} placeholder={t('crm.widget.chat.offline_placeholder', 'We are closed now. Leave a message and we will reply in the morning.')}
                onChange={e => update({ offline_message: e.target.value })} />
            </Field>
            {tooLong('offline_message')}
          </div>
        </div>
      </Card>

      <Card title={t('crm.widget.chat.person_title', 'Talk to a person')} icon={MessageCircle}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label={t('crm.widget.chat.whatsapp', 'WhatsApp number')} hint={t('crm.widget.chat.whatsapp_hint', 'With the country code. Shows a WhatsApp button in the chat; empty hides it.')}>
              <TextInput type="tel" value={form.handoff_whatsapp} placeholder="+44 20 7123 4567" onChange={e => update({ handoff_whatsapp: e.target.value })} />
            </Field>
            {problemOf(problems, 'handoff_whatsapp') && <Problem>{t('crm.widget.chat.whatsapp_bad', 'Use digits, spaces, + and brackets only (6 to 32).')}</Problem>}
          </div>
          <div>
            <Field label={t('crm.widget.chat.email', 'Email when a visitor asks for a person')} hint={t('crm.widget.chat.email_hint', 'Once per conversation, so nobody waits unseen.')}>
              <TextInput type="email" value={form.handoff_email} placeholder="team@example.com" onChange={e => update({ handoff_email: e.target.value })} />
            </Field>
            {problemOf(problems, 'handoff_email') && <Problem>{t('crm.widget.chat.email_bad', 'This does not look like an email address.')}</Problem>}
          </div>
        </div>
      </Card>

      <Card title={t('crm.widget.chat.privacy_title', 'Consent, ratings and sound')} icon={ShieldCheck}>
        <div className="space-y-4">
          <Toggle label={t('crm.widget.chat.consent', 'Ask for consent before the chat starts')} checked={form.gdpr_consent_required} disabled={!canManage}
            onChange={on => update({ gdpr_consent_required: on })} />
          {form.gdpr_consent_required && (
            <div>
              <Field label={t('crm.widget.chat.consent_text', 'Consent text')}>
                <TextArea rows={2} value={form.gdpr_consent_text} placeholder={t('crm.widget.chat.consent_placeholder', 'By chatting with us you agree to our privacy policy.')}
                  onChange={e => update({ gdpr_consent_text: e.target.value })} />
              </Field>
              {tooLong('gdpr_consent_text')}
            </div>
          )}
          <Toggle label={t('crm.widget.chat.rating', 'Ask visitors to rate the chat when it is resolved')} checked={form.rating_prompt_enabled} disabled={!canManage}
            onChange={on => update({ rating_prompt_enabled: on })} />
          {form.rating_prompt_enabled && (
            <div>
              <Field label={t('crm.widget.chat.rating_text', 'Question')}>
                <TextInput value={form.rating_prompt_text} placeholder={t('crm.widget.chat.rating_placeholder', 'How was your chat with us?')}
                  onChange={e => update({ rating_prompt_text: e.target.value })} />
              </Field>
              {tooLong('rating_prompt_text')}
            </div>
          )}
          <Toggle label={t('crm.widget.chat.sound', 'Play a sound in the inbox when a visitor writes')} checked={form.inbox_sound_enabled} disabled={!canManage}
            onChange={on => update({ inbox_sound_enabled: on })} />
        </div>
      </Card>
    </fieldset>
  )
}
