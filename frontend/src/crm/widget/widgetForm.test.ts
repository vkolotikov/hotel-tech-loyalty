import { describe, expect, it } from 'vitest'
import { BUILDERS, builderSteps, shortKey } from './embed'
import { WIDGET_TABS, pickTab, withTab } from './tabs'
import {
  COLOR_FIELDS, TEMPLATES, TEXT_LIMITS, applyTemplate, copyToWeekdays, previewColours, sameWidget, setDayOpen, setDayTime,
  setSuggestion, shade, suggestionSlots, templateSwatch, widgetForm, widgetPayload, widgetProblems,
} from './widgetForm'

/** The keys ChatWidgetConfigController::update validates (its rules array, by name). */
const CONTROLLER_KEYS = [
  'company_name', 'header_title', 'header_subtitle', 'welcome_message', 'welcome_title', 'welcome_subtitle', 'input_placeholder',
  'input_hint_text', 'show_suggestions', 'suggestions', 'assistant_avatar_url', 'branding_text', 'agent_status', 'primary_color',
  'widget_template', 'header_text_color', 'user_bubble_color', 'user_bubble_text', 'bot_bubble_color', 'bot_bubble_text',
  'chat_bg_color', 'font_family', 'border_radius', 'show_branding', 'header_style', 'header_gradient_end', 'window_style',
  'launcher_animation', 'launcher_size', 'position', 'icon_style', 'launcher_shape', 'launcher_icon', 'lead_capture_enabled',
  'lead_capture_fields', 'lead_capture_delay', 'offline_message', 'handoff_whatsapp', 'handoff_email', 'is_active',
  'business_hours', 'timezone', 'gdpr_consent_required', 'gdpr_consent_text', 'inbox_sound_enabled', 'rating_prompt_enabled',
  'rating_prompt_text',
]

describe('the widget form (widget-config)', () => {
  it('sends every field the controller validates except the unused icon style, and nothing else', () => {
    const body = widgetPayload(widgetForm(undefined))
    expect(Object.keys(body).sort()).toEqual(CONTROLLER_KEYS.filter(k => k !== 'icon_style').sort())
  })

  it('always sends the business name, which the controller would otherwise blank', () => {
    expect(widgetPayload(widgetForm({ company_name: null })).company_name).toBe('')
    expect(widgetPayload(widgetForm({ company_name: ' Hotel Riga ' })).company_name).toBe('Hotel Riga')
  })

  it('reads the saved row, with the full admin\'s defaults where nothing was saved', () => {
    const form = widgetForm({ primary_color: null, launcher_size: '64', lead_capture_fields: { phone: true }, business_hours: { mon: [{ open: '09:00', close: '17:00' }], xyz: [] }, suggestions: ['A', '', 7] })
    expect(form.primary_color).toBe('#c9a84c')
    expect(form.launcher_size).toBe(64)
    expect(form.lead_capture_fields).toEqual({ name: true, email: true, phone: true })
    expect(form.business_hours).toEqual({ mon: [{ open: '09:00', close: '17:00' }] })
    expect(form.suggestions).toEqual(['A'])
    expect(form.is_active).toBe(true)
  })

  it('sends empty texts and colours as null (the widget\'s own default)', () => {
    const body = widgetPayload({ ...widgetForm(undefined), header_title: '  ', bot_bubble_color: '', user_bubble_color: '#ABCDEF' })
    expect(body.header_title).toBeNull()
    expect(body.bot_bubble_color).toBeNull()
    expect(body.user_bubble_color).toBe('#abcdef')
  })

  it('sees no change in what was just loaded, and a change once a field moves', () => {
    const saved = widgetForm({ header_title: 'Hi' })
    expect(sameWidget(saved, widgetForm({ header_title: 'Hi' }))).toBe(true)
    expect(sameWidget({ ...saved, header_title: 'Hi ' }, saved)).toBe(true)
    expect(sameWidget({ ...saved, position: 'bottom-left' }, saved)).toBe(false)
  })

  it('names what the server would refuse', () => {
    const form = { ...widgetForm(undefined), header_title: 'x'.repeat(TEXT_LIMITS.header_title + 1), chat_bg_color: 'blue', handoff_whatsapp: 'call us', handoff_email: 'nope', business_hours: { tue: [{ open: '18:00', close: '09:00' }] } }
    expect(widgetProblems(form).map(p => `${p.field}:${p.code}`).sort()).toEqual(['chat_bg_color:colour', 'handoff_email:email', 'handoff_whatsapp:whatsapp', 'header_title:too_long', 'tue:hours'])
    expect(widgetProblems(widgetForm(undefined))).toEqual([])
  })

  it('keeps every colour field a hex code or empty', () => {
    for (const key of COLOR_FIELDS) {
      expect(widgetProblems({ ...widgetForm(undefined), [key]: '#fff' })).toEqual([])
      expect(widgetProblems({ ...widgetForm(undefined), [key]: '#12345' }).map(p => p.field)).toContain(key)
    }
  })
})

describe('opening hours', () => {
  it('opens a day 9 to 5, changes its times, and closes it by leaving it out (the server reads absent as closed)', () => {
    const open = setDayOpen({}, 'sat', true)
    expect(open).toEqual({ sat: [{ open: '09:00', close: '17:00' }] })
    expect(setDayTime(open, 'sat', 'close', '13:00')).toEqual({ sat: [{ open: '09:00', close: '13:00' }] })
    expect(setDayOpen(open, 'sat', false)).toEqual({})
  })

  it('copies Monday\'s hours to Tuesday to Friday and leaves the weekend alone', () => {
    const hours = { mon: [{ open: '08:00', close: '18:00' }], wed: [{ open: '10:00', close: '12:00' }], sat: [{ open: '10:00', close: '14:00' }] }
    const next = copyToWeekdays(hours, 'mon')
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) expect(next[day]).toEqual([{ open: '08:00', close: '18:00' }])
    expect(next.sat).toEqual([{ open: '10:00', close: '14:00' }])
    expect(next.sun).toBeUndefined()
    expect(copyToWeekdays({ tue: [{ open: '09:00', close: '17:00' }] }, 'mon')).toEqual({ tue: [{ open: '09:00', close: '17:00' }] })
  })
})

describe('suggested questions', () => {
  it('edits six boxes and keeps the filled ones in order', () => {
    expect(suggestionSlots(['A'])).toEqual(['A', '', '', '', '', ''])
    expect(setSuggestion(['A', 'B'], 3, 'D')).toEqual(['A', 'B', 'D'])
    expect(setSuggestion(['A', 'B'], 0, '')).toEqual(['B'])
  })
})

describe('templates and the preview', () => {
  it('cascades a template\'s look and keeps the words', () => {
    const form = applyTemplate({ ...widgetForm(undefined), header_title: 'Hi' }, 'onyx_gold')
    expect(form).toMatchObject({ widget_template: 'onyx_gold', window_style: 'bubble', header_style: 'gradient', font_family: 'Playfair Display', header_title: 'Hi' })
  })

  it('keeps the brand colour when the template has none of its own', () => {
    expect(applyTemplate({ ...widgetForm(undefined), primary_color: '#123456' }, 'classic').primary_color).toBe('#123456')
  })

  it('draws each template\'s swatch in its own colours, Classic in the current brand colour', () => {
    expect(templateSwatch('onyx_gold', '#123456')).toEqual({ header: 'linear-gradient(135deg, #c9a84c 0%, #8a6f2d 100%)', background: '#0f0c08', bubble: '#1a1410' })
    expect(templateSwatch('classic', '#123456')).toEqual({ header: '#123456', background: '#ffffff', bubble: '#f3f4f6' })
    expect(templateSwatch('classic', 'nope').header).toBe('#c9a84c')
    for (const id of TEMPLATES) expect(templateSwatch(id, '#123456').header).toBeTruthy()
  })

  it('paints the preview with the chosen colours or the widget\'s defaults', () => {
    const c = previewColours({ ...widgetForm(undefined), primary_color: '#1d4ed8', header_style: 'gradient', header_gradient_end: '', user_bubble_color: '' })
    expect(c.user).toBe('#1d4ed8')
    expect(c.header).toBe(`linear-gradient(135deg, #1d4ed8 0%, ${shade('#1d4ed8', -30)} 100%)`)
    expect(shade('#808080', 10)).toBe('#9a9a9a')
    expect(shade('#ffffff', 50)).toBe('#ffffff')
  })
})

describe('install', () => {
  it('knows the tabs Get started links to', () => {
    expect(pickTab('install', WIDGET_TABS, 'look')).toBe('install')
    expect(pickTab('x', WIDGET_TABS, 'look')).toBe('look')
    expect(withTab(new URLSearchParams('a=1'), 'tab', 'install', 'look').toString()).toBe('a=1&tab=install')
    expect(withTab(new URLSearchParams('tab=install'), 'tab', 'look', 'look').toString()).toBe('')
  })

  it('shortens a key for display and keeps a short one', () => {
    expect(shortKey('3f2a9c1e-1111-2222-3333-44444444b81d')).toBe('3f2a9c1e…b81d')
    expect(shortKey('abc')).toBe('abc')
    expect(shortKey(null)).toBe('')
  })

  it('has a line for each site builder', () => {
    const t = ((_: string, d: string) => d) as never
    expect(builderSteps(t).map(b => b.key)).toEqual([...BUILDERS])
    expect(builderSteps(t).every(b => b.steps.length > 20)).toBe(true)
  })
})
