/**
 * The chat widget's settings as a form (ChatWidgetConfigController: GET/PUT widget-config): what the server holds, the
 * person's edits, what it would refuse, and the body to send. Every field and limit is the controller's validation;
 * the defaults are the ones the full admin shows for a field never saved. Pure: the tests render to a string.
 */

export const POSITIONS = ['bottom-right', 'bottom-left'] as const
export const WINDOW_STYLES = ['panel', 'popup', 'bubble', 'minimal', 'classic'] as const
export const LAUNCHER_SHAPES = ['circle', 'rounded-square', 'pill', 'square'] as const
export const LAUNCHER_ICONS = ['chat', 'message', 'support', 'quote', 'question', 'sales'] as const
export const LAUNCHER_ANIMATIONS = ['none', 'pulse', 'ring', 'bounce', 'shake'] as const
export const HEADER_STYLES = ['solid', 'gradient'] as const
export const AGENT_STATUSES = ['online', 'away', 'offline'] as const
export const TEMPLATES = ['classic', 'onyx_gold', 'ivory_minimal', 'emerald_suite', 'midnight_glass', 'boutique_rose', 'coastal_breeze', 'concierge'] as const
export const FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Montserrat', 'Nunito', 'Playfair Display', 'Georgia', 'system-ui'] as const
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export const LEAD_FIELDS = ['name', 'email', 'phone'] as const

export type Day = (typeof DAYS)[number]
export type LeadField = (typeof LEAD_FIELDS)[number]
export type Hours = Partial<Record<Day, { open: string; close: string }[]>>

/** The texts, by the most the server takes. */
export const TEXT_LIMITS = {
  company_name: 180,
  header_title: 80,
  header_subtitle: 120,
  welcome_title: 120,
  welcome_subtitle: 500,
  welcome_message: 1000,
  input_placeholder: 120,
  input_hint_text: 120,
  assistant_avatar_url: 500,
  branding_text: 120,
  offline_message: 500,
  handoff_whatsapp: 32,
  handoff_email: 190,
  timezone: 64,
  gdpr_consent_text: 500,
  rating_prompt_text: 200,
} as const

export type TextField = keyof typeof TEXT_LIMITS

export const COLOR_FIELDS = ['primary_color', 'header_gradient_end', 'header_text_color', 'user_bubble_color', 'user_bubble_text', 'bot_bubble_color', 'bot_bubble_text', 'chat_bg_color'] as const
export type ColorField = (typeof COLOR_FIELDS)[number]

export interface WidgetForm extends Record<TextField, string>, Record<ColorField, string> {
  is_active: boolean
  agent_status: (typeof AGENT_STATUSES)[number]
  widget_template: (typeof TEMPLATES)[number]
  position: (typeof POSITIONS)[number]
  window_style: (typeof WINDOW_STYLES)[number]
  launcher_shape: (typeof LAUNCHER_SHAPES)[number]
  launcher_icon: (typeof LAUNCHER_ICONS)[number]
  launcher_animation: (typeof LAUNCHER_ANIMATIONS)[number]
  launcher_size: number
  header_style: (typeof HEADER_STYLES)[number]
  font_family: string
  border_radius: number
  show_suggestions: boolean
  suggestions: string[]
  show_branding: boolean
  lead_capture_enabled: boolean
  lead_capture_fields: Record<LeadField, boolean>
  lead_capture_delay: number
  business_hours: Hours
  gdpr_consent_required: boolean
  rating_prompt_enabled: boolean
  inbox_sound_enabled: boolean
}

/** What GET widget-config answers (the saved row, or an unsaved template without an id). */
export type WidgetConfig = Partial<Record<string, unknown>> & { id?: number; widget_key?: string }

export const DEFAULT_PRIMARY = '#c9a84c'

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : value === 1 || value === '1' ? true : value === 0 || value === '0' ? false : fallback
}

function hoursOf(value: unknown): Hours {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Hours = {}
  for (const day of DAYS) {
    const slots = (value as Record<string, unknown>)[day]
    if (Array.isArray(slots)) {
      const clean = slots.filter((s): s is { open: string; close: string } => !!s && typeof s.open === 'string' && typeof s.close === 'string')
      if (clean.length) out[day] = clean.map(s => ({ open: s.open, close: s.close }))
    }
  }
  return out
}

/** The form for what the server holds. */
export function widgetForm(config: WidgetConfig | undefined): WidgetForm {
  const c = config ?? {}
  const fields = c.lead_capture_fields && typeof c.lead_capture_fields === 'object' ? c.lead_capture_fields as Record<string, unknown> : null
  const texts = Object.fromEntries((Object.keys(TEXT_LIMITS) as TextField[]).map(key => [key, text(c[key])])) as Record<TextField, string>
  const colors = Object.fromEntries(COLOR_FIELDS.map(key => [key, text(c[key])])) as Record<ColorField, string>
  return {
    ...texts,
    ...colors,
    primary_color: colors.primary_color || DEFAULT_PRIMARY,
    is_active: bool(c.is_active, true),
    agent_status: oneOf(c.agent_status, AGENT_STATUSES, 'online'),
    widget_template: oneOf(c.widget_template, TEMPLATES, 'classic'),
    position: oneOf(c.position, POSITIONS, 'bottom-right'),
    window_style: oneOf(c.window_style, WINDOW_STYLES, 'panel'),
    launcher_shape: oneOf(c.launcher_shape, LAUNCHER_SHAPES, 'circle'),
    launcher_icon: oneOf(c.launcher_icon, LAUNCHER_ICONS, 'chat'),
    launcher_animation: oneOf(c.launcher_animation, LAUNCHER_ANIMATIONS, 'none'),
    launcher_size: num(c.launcher_size, 40, 80, 56),
    header_style: oneOf(c.header_style, HEADER_STYLES, 'solid'),
    font_family: text(c.font_family) || 'Inter',
    border_radius: num(c.border_radius, 0, 24, 16),
    show_suggestions: bool(c.show_suggestions, true),
    suggestions: Array.isArray(c.suggestions) ? c.suggestions.filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, 6) : [],
    show_branding: bool(c.show_branding, true),
    lead_capture_enabled: bool(c.lead_capture_enabled, true),
    lead_capture_fields: {
      name: bool(fields?.name, true),
      email: bool(fields?.email, true),
      phone: bool(fields?.phone, false),
    },
    lead_capture_delay: num(c.lead_capture_delay, 0, 300, 0),
    business_hours: hoursOf(c.business_hours),
    gdpr_consent_required: bool(c.gdpr_consent_required, false),
    rating_prompt_enabled: bool(c.rating_prompt_enabled, false),
    inbox_sound_enabled: bool(c.inbox_sound_enabled, true),
  }
}

const NULLABLE_TEXTS: readonly TextField[] = (Object.keys(TEXT_LIMITS) as TextField[]).filter(key => key !== 'company_name')

/**
 * The body of PUT widget-config: every field the controller validates. The business's name is always sent — the
 * controller writes it as '' when it is missing, so leaving it out would wipe it. Empty texts and colours are null
 * (the widget's own default then).
 */
export function widgetPayload(form: WidgetForm): Record<string, unknown> {
  const out: Record<string, unknown> = { company_name: form.company_name.trim() }
  for (const key of NULLABLE_TEXTS) out[key] = form[key].trim() === '' ? null : form[key].trim()
  for (const key of COLOR_FIELDS) out[key] = form[key].trim() === '' ? null : form[key].trim().toLowerCase()
  return {
    ...out,
    is_active: form.is_active,
    agent_status: form.agent_status,
    widget_template: form.widget_template,
    position: form.position,
    window_style: form.window_style,
    launcher_shape: form.launcher_shape,
    launcher_icon: form.launcher_icon,
    launcher_animation: form.launcher_animation,
    launcher_size: form.launcher_size,
    header_style: form.header_style,
    font_family: form.font_family.trim().slice(0, 60) || 'Inter',
    border_radius: form.border_radius,
    show_suggestions: form.show_suggestions,
    suggestions: form.suggestions.map(s => s.trim()).filter(Boolean).slice(0, 6),
    show_branding: form.show_branding,
    lead_capture_enabled: form.lead_capture_enabled,
    lead_capture_fields: { ...form.lead_capture_fields },
    lead_capture_delay: form.lead_capture_delay,
    business_hours: form.business_hours,
    gdpr_consent_required: form.gdpr_consent_required,
    rating_prompt_enabled: form.rating_prompt_enabled,
    inbox_sound_enabled: form.inbox_sound_enabled,
  }
}

export function sameWidget(a: WidgetForm, b: WidgetForm): boolean {
  return JSON.stringify(widgetPayload(a)) === JSON.stringify(widgetPayload(b))
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const WHATSAPP = /^[+0-9 ()-]{6,32}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export type WidgetProblem =
  | { field: TextField; code: 'too_long' }
  | { field: ColorField; code: 'colour' }
  | { field: 'handoff_whatsapp'; code: 'whatsapp' }
  | { field: 'handoff_email'; code: 'email' }
  | { field: 'suggestions'; code: 'too_long' }
  | { field: Day; code: 'hours' }

/** What the server would refuse, and an opening time that ends before it starts. */
export function widgetProblems(form: WidgetForm): WidgetProblem[] {
  const out: WidgetProblem[] = []
  for (const key of Object.keys(TEXT_LIMITS) as TextField[]) {
    if (form[key].trim().length > TEXT_LIMITS[key]) out.push({ field: key, code: 'too_long' })
  }
  for (const key of COLOR_FIELDS) {
    if (form[key].trim() !== '' && !HEX.test(form[key].trim())) out.push({ field: key, code: 'colour' })
  }
  const whatsapp = form.handoff_whatsapp.trim()
  if (whatsapp && !WHATSAPP.test(whatsapp)) out.push({ field: 'handoff_whatsapp', code: 'whatsapp' })
  const email = form.handoff_email.trim()
  if (email && !EMAIL.test(email)) out.push({ field: 'handoff_email', code: 'email' })
  if (form.suggestions.some(s => s.trim().length > 120)) out.push({ field: 'suggestions', code: 'too_long' })
  for (const day of DAYS) {
    const slot = form.business_hours[day]?.[0]
    if (slot && (!TIME.test(slot.open) || !TIME.test(slot.close) || slot.open >= slot.close)) out.push({ field: day, code: 'hours' })
  }
  return out
}

export function problemOf(problems: readonly WidgetProblem[], field: WidgetProblem['field']): WidgetProblem | undefined {
  return problems.find(p => p.field === field)
}

/** The opening hours with a day switched on (9 to 5, as the full admin starts it) or off. */
export function setDayOpen(hours: Hours, day: Day, open: boolean): Hours {
  const next: Hours = { ...hours }
  if (open) next[day] = hours[day]?.length ? hours[day] : [{ open: '09:00', close: '17:00' }]
  else delete next[day]
  return next
}

/** The opening hours with a day's first opening or closing time changed. */
export function setDayTime(hours: Hours, day: Day, which: 'open' | 'close', value: string): Hours {
  const slots = hours[day] ?? [{ open: '09:00', close: '17:00' }]
  const first = { ...slots[0], [which]: value }
  return { ...hours, [day]: [first, ...slots.slice(1)] }
}

/** The working week, Monday to Friday. */
export const WEEKDAYS: readonly Day[] = ['mon', 'tue', 'wed', 'thu', 'fri']

/**
 * "Same hours Monday to Friday": every weekday gets the first opening of `from` (one press instead of five); the
 * weekend is left as it is. Nothing changes when `from` is closed.
 */
export function copyToWeekdays(hours: Hours, from: Day): Hours {
  const slot = hours[from]?.[0]
  if (!slot) return hours
  const next: Hours = { ...hours }
  for (const day of WEEKDAYS) next[day] = [{ open: slot.open, close: slot.close }]
  return next
}

/** The six suggestion boxes' values: the saved ones, then empty boxes. */
export function suggestionSlots(suggestions: readonly string[]): string[] {
  return Array.from({ length: 6 }, (_, i) => suggestions[i] ?? '')
}

/** The suggestions after box `i` changed: in order, empty boxes dropped. */
export function setSuggestion(suggestions: readonly string[], index: number, value: string): string[] {
  const slots = suggestionSlots(suggestions)
  slots[index] = value
  return slots.filter(s => s !== '')
}

/**
 * A template's look, as the full admin cascades it when one is picked (ChatbotWidget.tsx WIDGET_TEMPLATES); the
 * widget draws the template's own surfaces itself (htchat-tpl-* in public/widget/hotel-chat.js).
 */
export const TEMPLATE_LOOKS: Record<(typeof TEMPLATES)[number], Partial<WidgetForm>> = {
  classic: { window_style: 'panel', launcher_shape: 'circle', launcher_icon: 'chat', launcher_animation: 'none', header_style: 'solid', font_family: 'Inter', border_radius: 16, bot_bubble_color: '#f3f4f6', bot_bubble_text: '#1f2937', chat_bg_color: '#ffffff', header_text_color: '#ffffff' },
  onyx_gold: { primary_color: '#c9a84c', window_style: 'bubble', launcher_shape: 'circle', launcher_icon: 'chat', launcher_animation: 'ring', header_style: 'gradient', header_gradient_end: '#8a6f2d', font_family: 'Playfair Display', border_radius: 22, bot_bubble_color: '#1a1410', bot_bubble_text: '#f5e8c6', chat_bg_color: '#0f0c08', header_text_color: '#ffffff' },
  ivory_minimal: { primary_color: '#1f1f1f', window_style: 'minimal', launcher_shape: 'pill', launcher_icon: 'message', launcher_animation: 'none', header_style: 'solid', font_family: 'Inter', border_radius: 6, bot_bubble_color: '#f5f5f4', bot_bubble_text: '#1c1917', chat_bg_color: '#fafaf9', header_text_color: '#ffffff' },
  emerald_suite: { primary_color: '#10b981', window_style: 'panel', launcher_shape: 'rounded-square', launcher_icon: 'support', launcher_animation: 'pulse', header_style: 'gradient', header_gradient_end: '#065f46', font_family: 'Montserrat', border_radius: 18, bot_bubble_color: '#ecfdf5', bot_bubble_text: '#064e3b', chat_bg_color: '#ffffff', header_text_color: '#ffffff' },
  midnight_glass: { primary_color: '#6366f1', window_style: 'bubble', launcher_shape: 'circle', launcher_icon: 'chat', launcher_animation: 'pulse', header_style: 'gradient', header_gradient_end: '#0f172a', font_family: 'Poppins', border_radius: 24, bot_bubble_color: '#1e293b', bot_bubble_text: '#e0e7ff', chat_bg_color: '#0f172a', header_text_color: '#ffffff' },
  boutique_rose: { primary_color: '#be185d', window_style: 'popup', launcher_shape: 'circle', launcher_icon: 'sales', launcher_animation: 'bounce', header_style: 'gradient', header_gradient_end: '#831843', font_family: 'Playfair Display', border_radius: 20, bot_bubble_color: '#fdf2f8', bot_bubble_text: '#831843', chat_bg_color: '#fffbf7', header_text_color: '#ffffff' },
  coastal_breeze: { primary_color: '#0891b2', window_style: 'panel', launcher_shape: 'pill', launcher_icon: 'message', launcher_animation: 'none', header_style: 'gradient', header_gradient_end: '#155e75', font_family: 'Nunito', border_radius: 18, bot_bubble_color: '#ecfeff', bot_bubble_text: '#164e63', chat_bg_color: '#f0fdff', header_text_color: '#ffffff' },
  concierge: { primary_color: '#d97706', window_style: 'bubble', launcher_shape: 'circle', launcher_icon: 'support', launcher_animation: 'ring', header_style: 'gradient', header_gradient_end: '#1e293b', font_family: 'Georgia', border_radius: 22, bot_bubble_color: '#1e293b', bot_bubble_text: '#fde68a', chat_bg_color: '#0f172a', header_text_color: '#ffffff' },
}

/** The form with a template picked: its look over the current one; the brand colour stays unless the template has one. */
export function applyTemplate(form: WidgetForm, template: (typeof TEMPLATES)[number]): WidgetForm {
  return { ...form, ...TEMPLATE_LOOKS[template], widget_template: template }
}

/**
 * A template's swatch in the picker: its header, its chat's background and its answer bubble — the template's own
 * colours, or the current brand colour for a template that keeps it (Classic).
 */
export function templateSwatch(template: (typeof TEMPLATES)[number], currentPrimary: string): { header: string; background: string; bubble: string } {
  const look = TEMPLATE_LOOKS[template]
  const primary = look.primary_color ?? (HEX.test(currentPrimary.trim()) ? currentPrimary.trim() : DEFAULT_PRIMARY)
  const end = look.header_gradient_end ?? shade(primary, -30)
  return {
    header: look.header_style === 'gradient' ? `linear-gradient(135deg, ${primary} 0%, ${end} 100%)` : primary,
    background: look.chat_bg_color ?? '#ffffff',
    bubble: look.bot_bubble_color ?? '#f3f4f6',
  }
}

/** A colour a shade darker or lighter (-100…100), for the gradient's end when none was chosen. */
export function shade(hex: string, pct: number): string {
  const clean = HEX.test(hex) ? hex.replace('#', '') : DEFAULT_PRIMARY.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const n = Number.parseInt(full, 16)
  const step = Math.round(pct * 2.55)
  const channel = (v: number) => Math.min(255, Math.max(0, v + step)).toString(16).padStart(2, '0')
  return `#${channel(n >> 16)}${channel((n >> 8) & 0xff)}${channel(n & 0xff)}`
}

/** What the preview paints with: each colour as chosen, or the widget's own default for it. */
export function previewColours(form: WidgetForm): { primary: string; header: string; headerText: string; user: string; userText: string; bot: string; botText: string; background: string } {
  const valid = (value: string, fallback: string) => (HEX.test(value.trim()) ? value.trim() : fallback)
  const primary = valid(form.primary_color, DEFAULT_PRIMARY)
  const end = valid(form.header_gradient_end, shade(primary, -30))
  return {
    primary,
    header: form.header_style === 'gradient' ? `linear-gradient(135deg, ${primary} 0%, ${end} 100%)` : primary,
    headerText: valid(form.header_text_color, '#ffffff'),
    user: valid(form.user_bubble_color, primary),
    userText: valid(form.user_bubble_text, '#ffffff'),
    bot: valid(form.bot_bubble_color, '#f3f4f6'),
    botText: valid(form.bot_bubble_text, '#1f2937'),
    background: valid(form.chat_bg_color, '#ffffff'),
  }
}

/** The time zones the browser knows, with the saved one first when it is not among them. */
export function zoneChoices(current: string): string[] {
  let zones: string[]
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    zones = []
  }
  return current && !zones.includes(current) ? [current, ...zones] : zones
}
