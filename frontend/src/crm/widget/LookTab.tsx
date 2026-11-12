import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, ImagePlus, MessageSquareText, Palette, Power, SquareMousePointer, Trash2, Type } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { resolveImage } from '../../lib/api'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { InfoTip } from '../ui/InfoTip'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { PartCard, SectionedForm, TipField, TipToggle, type FormPart } from '../settings/formKit'
import { LAUNCHER_ICON } from './icons'
import { ColourField, Choice, Disclosure, Problem } from './parts'
import type { LookPart, WidgetPart } from './tabs'
import { WidgetPreview } from './WidgetPreview'
import {
  DEFAULT_PRIMARY, FONTS, LAUNCHER_ANIMATIONS, LAUNCHER_ICONS, LAUNCHER_SHAPES, TEMPLATES, TEXT_LIMITS, WINDOW_STYLES,
  applyTemplate, problemOf, setSuggestion, shade, suggestionSlots, templateSwatch, type ColorField, type TextField, type WidgetConfig,
  type WidgetForm, type WidgetProblem,
} from './widgetForm'

const SWATCHES = ['#c9a84c', '#2d6a4f', '#1d4ed8', '#7c3aed', '#dc2626', '#0891b2', '#ea580c', '#16a34a', '#4f46e5', '#be185d']

/**
 * How the chat looks on the website (widget-config), in six parts the person moves between (round 5, owner 2026-11-12:
 * the Look was one 2,800 px page): on the website, the style, the launcher, the words, the suggested questions, the
 * picture — beside a sketch of the result that stays in view on a wide screen. Saved together with the conversation
 * settings (one form for the whole widget).
 */
export function LookTab({ form, update, problems, canManage, widgetKey, part, onPart, flagged }: {
  form: WidgetForm
  update: (patch: Partial<WidgetForm>) => void
  problems: WidgetProblem[]
  canManage: boolean
  widgetKey: readonly unknown[]
  part: LookPart
  onPart: (next: LookPart) => void
  flagged: ReadonlySet<WidgetPart>
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const avatarInput = useRef<HTMLInputElement>(null)
  const colourProblem = (field: ColorField) => problemOf(problems, field) ? t('crm.widget.bad_colour', 'Use a colour code like #1d4ed8.') : undefined
  const tooLong = (field: TextField) => problemOf(problems, field)
    ? <Problem>{t('crm.widget.too_long', 'Too long: at most {{max}} characters.', { max: TEXT_LIMITS[field] })}</Problem>
    : null
  const textField = (field: TextField, label: string, placeholder: string, long = false) => (
    <div>
      <TipField label={label}>
        {id => long
          ? <TextArea id={id} rows={2} value={form[field]} placeholder={placeholder} onChange={e => update({ [field]: e.target.value })} />
          : <TextInput id={id} value={form[field]} placeholder={placeholder} onChange={e => update({ [field]: e.target.value })} />}
      </TipField>
      {tooLong(field)}
    </div>
  )

  const avatar = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return send<{ assistant_avatar_url: string }>('post', 'widget-config/upload-avatar', body)
    },
    onSuccess: ({ assistant_avatar_url }) => {
      // The upload is saved at once (the controller writes it): the saved settings and the form both take it.
      qc.setQueryData<WidgetConfig>(widgetKey, old => ({ ...(old ?? {}), assistant_avatar_url }))
      update({ assistant_avatar_url })
      say(t('crm.widget.look.avatar_saved', 'Picture saved.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  const templateNames: Record<(typeof TEMPLATES)[number], string> = {
    classic: t('crm.widget.template.classic', 'Classic'),
    onyx_gold: t('crm.widget.template.onyx_gold', 'Onyx gold'),
    ivory_minimal: t('crm.widget.template.ivory_minimal', 'Ivory minimal'),
    emerald_suite: t('crm.widget.template.emerald_suite', 'Emerald'),
    midnight_glass: t('crm.widget.template.midnight_glass', 'Midnight glass'),
    boutique_rose: t('crm.widget.template.boutique_rose', 'Boutique rose'),
    coastal_breeze: t('crm.widget.template.coastal_breeze', 'Coastal'),
    concierge: t('crm.widget.template.concierge', 'Night concierge'),
  }
  const windowNames: Record<(typeof WINDOW_STYLES)[number], string> = {
    panel: t('crm.widget.window.panel', 'Panel'),
    popup: t('crm.widget.window.popup', 'Pop-up'),
    bubble: t('crm.widget.window.bubble', 'Bubble'),
    minimal: t('crm.widget.window.minimal', 'Minimal'),
    classic: t('crm.widget.window.classic', 'Classic'),
  }
  const shapeNames: Record<(typeof LAUNCHER_SHAPES)[number], string> = {
    circle: t('crm.widget.shape.circle', 'Circle'),
    'rounded-square': t('crm.widget.shape.rounded', 'Rounded square'),
    pill: t('crm.widget.shape.pill', 'Pill'),
    square: t('crm.widget.shape.square', 'Square'),
  }
  const iconNames: Record<(typeof LAUNCHER_ICONS)[number], string> = {
    chat: t('crm.widget.icon.chat', 'Chat'),
    message: t('crm.widget.icon.message', 'Message'),
    support: t('crm.widget.icon.support', 'Headset'),
    quote: t('crm.widget.icon.quote', 'Quote'),
    question: t('crm.widget.icon.question', 'Question'),
    sales: t('crm.widget.icon.sales', 'Megaphone'),
  }
  const animationNames: Record<(typeof LAUNCHER_ANIMATIONS)[number], string> = {
    none: t('crm.widget.animation.none', 'None'),
    pulse: t('crm.widget.animation.pulse', 'Pulse'),
    ring: t('crm.widget.animation.ring', 'Rings'),
    bounce: t('crm.widget.animation.bounce', 'Bounce'),
    shake: t('crm.widget.animation.shake', 'Shake'),
  }
  const avatarSrc = form.assistant_avatar_url ? resolveImage(form.assistant_avatar_url) : null
  const colourTrouble = problems.some(p => p.code === 'colour' && p.field !== 'primary_color')

  const parts: FormPart<LookPart>[] = [
    { key: 'site', icon: Power, tone: form.is_active ? 'success' : 'neutral', title: t('crm.widget.part.site', 'On the website') },
    { key: 'style', icon: Palette, tone: 'accent', title: t('crm.widget.part.style', 'Style') },
    { key: 'launcher', icon: SquareMousePointer, tone: 'progress', title: t('crm.widget.part.launcher', 'Launcher') },
    { key: 'words', icon: Type, tone: 'pending', title: t('crm.widget.part.words', 'Words') },
    { key: 'questions', icon: MessageSquareText, tone: 'ai', title: t('crm.widget.part.questions', 'Questions') },
    { key: 'picture', icon: ImagePlus, tone: 'neutral', title: t('crm.widget.part.picture', 'Picture') },
  ].map(p => ({ ...p, flagged: flagged.has(p.key as LookPart) })) as FormPart<LookPart>[]

  const preview = (
    <div className="space-y-2" aria-label={t('crm.widget.preview.heading', 'Preview')} role="group">
      <div className="flex items-center gap-1.5 px-1">
        <Eye size={15} aria-hidden className="text-a-text-2" />
        <p className="text-sm font-semibold text-a-text">{t('crm.widget.preview.heading', 'Preview')}</p>
        <InfoTip text={t('crm.widget.preview.line', 'Changes show here as you make them.')} align="right" />
      </div>
      <WidgetPreview form={form} />
    </div>
  )

  return (
    <SectionedForm label={t('crm.widget.look.parts', 'Parts of the look')} idPrefix="widget-look" parts={parts} value={part} onChange={onPart} aside={preview}>
      <fieldset disabled={!canManage} className="min-w-0">
        {part === 'site' && (
          <PartCard>
            <TipToggle label={t('crm.widget.look.active', 'The chat shows on your website')} checked={form.is_active} disabled={!canManage}
              tip={t('crm.widget.look.active_hint', 'Switched off, the code stays on your site but shows nothing.')} onChange={on => update({ is_active: on })} />
            <Choice label={t('crm.widget.look.status', 'Your team is shown as')} value={form.agent_status} disabled={!canManage} columns="grid-cols-3"
              onChange={value => update({ agent_status: value })} options={[
                { value: 'online', label: t('crm.widget.status.online', 'Online') },
                { value: 'away', label: t('crm.widget.status.away', 'Away') },
                { value: 'offline', label: t('crm.widget.status.offline', 'Offline') },
              ]} />
          </PartCard>
        )}

        {part === 'style' && (
          <PartCard>
            <div role="group" aria-label={t('crm.widget.look.template', 'Template')}>
              <div className="mb-1 flex items-center gap-1">
                <span className="text-xs font-medium text-a-text-2">{t('crm.widget.look.template', 'Template')}</span>
                <InfoTip text={t('crm.widget.look.template_hint', 'Picking one sets its colours, font and launcher; change any of them after.')} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TEMPLATES.map(id => {
                  const on = form.widget_template === id
                  const swatch = templateSwatch(id, form.primary_color)
                  return (
                    <button key={id} type="button" aria-pressed={on} disabled={!canManage} onClick={() => update(applyTemplate(form, id))}
                      className={`rounded-xl border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-60 ${on ? 'border-a-accent bg-a-accent/10' : 'border-a-border bg-a-surface hover:border-a-text-2/40'}`}>
                      <span aria-hidden className="block h-10 overflow-hidden rounded-lg border border-a-border" style={{ background: swatch.background }}>
                        <span className="block h-3" style={{ background: swatch.header }} />
                        <span className="ml-1.5 mt-1.5 block h-2 w-3/5 rounded-full" style={{ background: swatch.bubble }} />
                        <span className="ml-auto mr-1.5 mt-1 block h-2 w-2/5 rounded-full" style={{ background: swatch.header }} />
                      </span>
                      <span className="mt-1 block truncate px-0.5 text-xs font-medium text-a-text">{templateNames[id]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.widget.look.brand', 'Main colour')}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('crm.widget.look.brand', 'Main colour')}>
                  {SWATCHES.map(colour => (
                    <button key={colour} type="button" aria-pressed={form.primary_color.toLowerCase() === colour} disabled={!canManage}
                      aria-label={colour} onClick={() => update({ primary_color: colour })}
                      className={`h-8 w-8 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-a-accent ${form.primary_color.toLowerCase() === colour ? 'border-a-text' : 'border-transparent'}`}
                      style={{ background: colour }} />
                  ))}
                </div>
              </div>
              <div className="mt-2 max-w-xs">
                <ColourField label={t('crm.widget.look.brand_code', 'Main colour code')} hideLabel value={form.primary_color} fallback={DEFAULT_PRIMARY} disabled={!canManage}
                  problem={colourProblem('primary_color')} onChange={primary_color => update({ primary_color })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Choice label={t('crm.widget.look.position', 'Corner')} value={form.position} disabled={!canManage} columns="grid-cols-2"
                onChange={value => update({ position: value })} options={[
                  { value: 'bottom-left', label: t('crm.widget.look.left', 'Bottom left') },
                  { value: 'bottom-right', label: t('crm.widget.look.right', 'Bottom right') },
                ]} />
              <TipField label={t('crm.widget.look.window', 'Window')}>
                {id => (
                  <Select id={id} value={form.window_style} onChange={e => update({ window_style: e.target.value as WidgetForm['window_style'] })}>
                    {WINDOW_STYLES.map(w => <option key={w} value={w}>{windowNames[w]}</option>)}
                  </Select>
                )}
              </TipField>
              <TipField label={t('crm.widget.look.font', 'Font')}>
                {id => (
                  <Select id={id} value={form.font_family} onChange={e => update({ font_family: e.target.value })}>
                    {!(FONTS as readonly string[]).includes(form.font_family) && <option value={form.font_family}>{form.font_family}</option>}
                    {FONTS.map(font => <option key={font} value={font}>{font}</option>)}
                  </Select>
                )}
              </TipField>
              <TipField label={t('crm.widget.look.corners', 'Rounded corners: {{n}} px', { n: form.border_radius })}>
                {id => <input id={id} type="range" min={0} max={24} step={1} value={form.border_radius} onChange={e => update({ border_radius: Number(e.target.value) })} className="mt-2 w-full accent-a-accent-text" />}
              </TipField>
            </div>
            <Disclosure label={t('crm.widget.look.colours_title', 'Header and bubbles')} open={!canManage || colourTrouble}>
              <div className="space-y-4">
                <Choice label={t('crm.widget.look.header', 'Header')} value={form.header_style} disabled={!canManage} columns="grid-cols-2"
                  onChange={value => update(value === 'gradient' && !form.header_gradient_end ? { header_style: value, header_gradient_end: shade(form.primary_color, -30) } : { header_style: value })}
                  options={[
                    { value: 'solid', label: t('crm.widget.look.solid', 'One colour') },
                    { value: 'gradient', label: t('crm.widget.look.gradient', 'Gradient') },
                  ]} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {form.header_style === 'gradient' && (
                    <ColourField label={t('crm.widget.look.gradient_end', 'Gradient ends in')} value={form.header_gradient_end} fallback={shade(form.primary_color, -30)} disabled={!canManage}
                      problem={colourProblem('header_gradient_end')} onChange={header_gradient_end => update({ header_gradient_end })} />
                  )}
                  <ColourField label={t('crm.widget.look.header_text', 'Header text')} value={form.header_text_color} fallback="#ffffff" disabled={!canManage}
                    problem={colourProblem('header_text_color')} onChange={header_text_color => update({ header_text_color })} />
                  <ColourField label={t('crm.widget.look.visitor_bubble', 'Visitor\'s bubble')} value={form.user_bubble_color} fallback={form.primary_color} disabled={!canManage}
                    problem={colourProblem('user_bubble_color')} onChange={user_bubble_color => update({ user_bubble_color })} />
                  <ColourField label={t('crm.widget.look.visitor_text', 'Visitor\'s text')} value={form.user_bubble_text} fallback="#ffffff" disabled={!canManage}
                    problem={colourProblem('user_bubble_text')} onChange={user_bubble_text => update({ user_bubble_text })} />
                  <ColourField label={t('crm.widget.look.bot_bubble', 'Answer bubble')} value={form.bot_bubble_color} fallback="#f3f4f6" disabled={!canManage}
                    problem={colourProblem('bot_bubble_color')} onChange={bot_bubble_color => update({ bot_bubble_color })} />
                  <ColourField label={t('crm.widget.look.bot_text', 'Answer text')} value={form.bot_bubble_text} fallback="#1f2937" disabled={!canManage}
                    problem={colourProblem('bot_bubble_text')} onChange={bot_bubble_text => update({ bot_bubble_text })} />
                  <ColourField label={t('crm.widget.look.background', 'Chat background')} value={form.chat_bg_color} fallback="#ffffff" disabled={!canManage}
                    problem={colourProblem('chat_bg_color')} onChange={chat_bg_color => update({ chat_bg_color })} />
                </div>
                <p className="text-xs text-a-text-2">{t('crm.widget.look.colours_hint', 'Leave a code empty to use the template\'s colour.')}</p>
              </div>
            </Disclosure>
          </PartCard>
        )}

        {part === 'launcher' && (
          <PartCard>
            <Choice label={t('crm.widget.look.shape', 'Shape')} value={form.launcher_shape} disabled={!canManage} columns="grid-cols-2 sm:grid-cols-4"
              onChange={value => update({ launcher_shape: value })} options={LAUNCHER_SHAPES.map(id => ({ value: id, label: shapeNames[id] }))} />
            <Choice label={t('crm.widget.look.icon', 'Icon')} value={form.launcher_icon} disabled={!canManage} columns="grid-cols-2 sm:grid-cols-3"
              onChange={value => update({ launcher_icon: value })}
              options={LAUNCHER_ICONS.map(id => {
                const Icon = LAUNCHER_ICON[id]
                return { value: id, label: iconNames[id], icon: <Icon size={16} aria-hidden className="shrink-0" /> }
              })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TipField label={t('crm.widget.look.size', 'Size: {{n}} px', { n: form.launcher_size })}>
                {id => <input id={id} type="range" min={40} max={80} step={2} value={form.launcher_size} onChange={e => update({ launcher_size: Number(e.target.value) })} className="mt-2 w-full accent-a-accent-text" />}
              </TipField>
              <TipField label={t('crm.widget.look.animation', 'Movement')}>
                {id => (
                  <Select id={id} value={form.launcher_animation} onChange={e => update({ launcher_animation: e.target.value as WidgetForm['launcher_animation'] })}>
                    {LAUNCHER_ANIMATIONS.map(a => <option key={a} value={a}>{animationNames[a]}</option>)}
                  </Select>
                )}
              </TipField>
            </div>
          </PartCard>
        )}

        {part === 'words' && (
          <PartCard>
            {textField('company_name', t('crm.widget.look.company', 'Your business name'), '')}
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('header_title', t('crm.widget.look.header_title', 'Title'), t('crm.widget.preview.title', 'Chat with us'))}
              {textField('header_subtitle', t('crm.widget.look.header_subtitle', 'Line under the title'), t('crm.widget.look.header_subtitle_placeholder', 'We usually reply in minutes'))}
            </div>
            {textField('welcome_title', t('crm.widget.look.welcome_title', 'Welcome heading'), t('crm.widget.look.welcome_title_placeholder', 'Hi! How can we help?'))}
            {textField('welcome_subtitle', t('crm.widget.look.welcome_subtitle', 'Welcome text'), t('crm.widget.look.welcome_subtitle_placeholder', 'Ask about prices, opening hours or a booking.'), true)}
            {textField('welcome_message', t('crm.widget.look.welcome_message', 'First message in the chat'), t('crm.widget.preview.hello', 'Hello! How can I help you today?'), true)}
            <Disclosure label={t('crm.widget.look.box_title', 'The message box')} open={!canManage || !!(form.input_placeholder || form.input_hint_text)}>
              <div className="grid gap-4 sm:grid-cols-2">
                {textField('input_placeholder', t('crm.widget.look.placeholder', 'Inside the message box'), t('crm.widget.preview.placeholder', 'Type a message…'))}
                {textField('input_hint_text', t('crm.widget.look.hint', 'Hint under the message box'), t('crm.widget.look.hint_placeholder', 'Press Enter to send'))}
              </div>
            </Disclosure>
          </PartCard>
        )}

        {part === 'questions' && (
          <PartCard>
            <TipToggle label={t('crm.widget.look.show_suggestions', 'Show buttons with common questions')} checked={form.show_suggestions} disabled={!canManage}
              tip={t('crm.widget.look.suggestions_hint', 'Up to six, on the welcome screen. A tap sends the question.')} onChange={on => update({ show_suggestions: on })} />
            {form.show_suggestions && (
              <ol className="grid gap-2 sm:grid-cols-2">
                {suggestionSlots(form.suggestions).map((value, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-a-surface-2 text-xs font-semibold text-a-text-2">{i + 1}</span>
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">{t('crm.widget.look.suggestion_n', 'Question {{n}}', { n: i + 1 })}</span>
                      <TextInput value={value} maxLength={120} placeholder={t('crm.widget.look.suggestion_n', 'Question {{n}}', { n: i + 1 })}
                        onChange={e => update({ suggestions: setSuggestion(form.suggestions, i, e.target.value) })} />
                    </label>
                  </li>
                ))}
              </ol>
            )}
          </PartCard>
        )}

        {part === 'picture' && (
          <PartCard>
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-a-border bg-a-surface-2 text-a-text-2">
                {avatarSrc ? <img src={avatarSrc} alt={t('crm.widget.look.avatar_alt', 'The assistant\'s picture')} className="h-full w-full object-cover" /> : <ImagePlus size={22} aria-hidden />}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => avatarInput.current?.click()} loading={avatar.isPending}><ImagePlus size={14} aria-hidden />{t('crm.widget.look.upload', 'Upload a picture')}</Button>
                    {form.assistant_avatar_url && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => update({ assistant_avatar_url: '' })}><Trash2 size={14} aria-hidden />{t('crm.widget.look.remove', 'Remove')}</Button>
                    )}
                    <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" tabIndex={-1} aria-hidden
                      onChange={e => { const file = e.target.files?.[0]; if (file) avatar.mutate(file); e.target.value = '' }} />
                  </div>
                )}
                <p className="flex items-center gap-1 text-xs text-a-text-2">
                  {t('crm.widget.look.avatar_short', 'Square PNG or JPG, 2 MB at most')}
                  <InfoTip text={t('crm.widget.look.avatar_hint', 'A square PNG or JPG, at most 2 MB. Saved as soon as it is uploaded.')} />
                </p>
              </div>
            </div>
            <div className="space-y-3 border-t border-a-border pt-4">
              <TipToggle label={t('crm.widget.look.show_branding', 'Show a line under the chat')} checked={form.show_branding} disabled={!canManage} onChange={on => update({ show_branding: on })} />
              {form.show_branding && textField('branding_text', t('crm.widget.look.branding', 'The line'), t('crm.widget.preview.branding', 'Powered by your business'))}
            </div>
          </PartCard>
        )}
      </fieldset>
    </SectionedForm>
  )
}

