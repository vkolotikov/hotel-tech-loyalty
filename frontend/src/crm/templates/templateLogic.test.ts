import { describe, expect, it } from 'vitest'
import { embedContent, extractContent, renderEmailHtml } from '../../lib/emailBuilder'
import {
  BLOCK_FIELDS, BLOCK_TYPES, PRESETS, blockValue, bodyHtml, categoryOf, copyPayload, insertAt, memberTagsUsed, needsStart, newBlock,
  previewHtml, sameTemplate, setBlockField, setStatItem, startFrom, starterContent, switchMode, tagEntries, templateForm, templatePayload,
  templateProblems, withBlock, type EmailTemplate,
} from './templateLogic'

const words = { heading: 'Hello', text: 'Write here.', button: 'Call us', quote: 'Quote', label: 'Caption' }
const designed = starterContent({ ...words, footer: '© {{current_year}}' })
const saved: EmailTemplate = { id: 3, name: 'Quote follow-up', subject: 'Your quote', html_body: embedContent(renderEmailHtml(designed), designed), category: 'birthday', is_active: true }

describe('an email template as a form', () => {
  it('opens a designed body in the designer, a hand-written one as HTML, and a new one waiting for its start', () => {
    const form = templateForm(saved)
    expect(form).toMatchObject({ name: 'Quote follow-up', mode: 'design', category: 'campaign', is_active: true })
    expect(form.content?.blocks).toHaveLength(3)
    expect(templateForm({ ...saved, html_body: '<p>Hi {{hotel_name}}</p>' })).toMatchObject({ mode: 'html', content: null, html: '<p>Hi {{hotel_name}}</p>' })
    const fresh = templateForm(null)
    expect(needsStart(fresh)).toBe(true)
    expect(needsStart(startFrom(fresh, designed))).toBe(false)
  })

  it('sends only the categories the server takes', () => {
    expect(categoryOf('welcome')).toBe('welcome')
    expect(categoryOf('re-engagement')).toBe('campaign')
    expect(categoryOf(null)).toBe('campaign')
  })

  it('saves the designer\'s HTML with its blocks kept inside, so either editor opens it again', () => {
    const form = templateForm(saved)
    const body = bodyHtml(form)
    expect(extractContent(body)).toEqual(form.content)
    expect(previewHtml(form)).not.toContain('<!--builder:')
    expect(templatePayload(form, true)).toEqual({ name: 'Quote follow-up', subject: 'Your quote', html_body: body, category: 'campaign' })
    expect(templatePayload({ ...form, is_active: false }, false)).toMatchObject({ is_active: false })
    expect(sameTemplate(form, templateForm(saved))).toBe(true)
    expect(sameTemplate(form, { ...form, subject: 'Other' })).toBe(false)
  })

  it('refuses what the server would: no name, no subject, too long, no body', () => {
    expect(templateProblems(templateForm(null))).toEqual(['name', 'subject', 'body'])
    expect(templateProblems({ ...templateForm(saved), name: 'x'.repeat(256), subject: ' ' })).toEqual(['name_long', 'subject'])
    expect(templateProblems(templateForm(saved))).toEqual([])
  })

  it('starts from a design: its blocks, its subject when none is written, its category as the server takes it', () => {
    const birthday = PRESETS.find(p => p.category === 'birthday')!
    const started = startFrom(templateForm(null), birthday.content, birthday)
    expect(started.subject).toBe(birthday.defaultSubject)
    expect(started.category).toBe('campaign')
    expect(started.content).not.toBe(birthday.content)
    expect(startFrom({ ...templateForm(null), subject: 'Mine' }, birthday.content, birthday).subject).toBe('Mine')
    expect(starterContent({ ...words, footer: 'F' })).toMatchObject({ logoText: '{{hotel_name}}', footerText: 'F' })
  })

  it('switches to HTML with the designer\'s email, and back to the blocks only when there are some', () => {
    const form = templateForm(saved)
    const html = switchMode(form, 'html')
    expect(html.mode).toBe('html')
    expect(html.html).toBe(renderEmailHtml(form.content!))
    expect(switchMode(html, 'design').mode).toBe('design')
    const plain = templateForm({ ...saved, html_body: '<p>x</p>' })
    expect(switchMode(plain, 'design')).toBe(plain)
  })

  it('copies a template under a new name', () => {
    expect(copyPayload(saved, 'Copy of Quote follow-up')).toEqual({ name: 'Copy of Quote follow-up', subject: 'Your quote', html_body: saved.html_body, category: 'campaign' })
  })
})

describe('merge tags', () => {
  it('puts a tag where the cursor was, over a selection, and moves the cursor after it', () => {
    expect(insertAt('Hello !', 6, 6, '{{first_name}}')).toEqual({ value: 'Hello {{first_name}}!', caret: 20 })
    expect(insertAt('Hello you', 6, 9, '{{first_name}}')).toEqual({ value: 'Hello {{first_name}}', caret: 20 })
    expect(insertAt('Hi', null, null, '{{x}}')).toEqual({ value: 'Hi{{x}}', caret: 7 })
    expect(insertAt('Hi', 99, 2, '{{x}}')).toEqual({ value: 'Hi{{x}}', caret: 7 })
  })

  it('lists the server\'s tags, the ones every contact gets first, a member\'s marked', () => {
    const entries = tagEntries({ '{{first_name}}': 'Member first name', '{{hotel_name}}': 'Hotel/brand name', 'bad': 'x' })
    expect(entries.map(e => [e.name, e.member])).toEqual([['hotel_name', false], ['first_name', true]])
    expect(tagEntries(null)).toEqual([])
  })

  it('finds the member-only tags a template uses', () => {
    expect(memberTagsUsed({ subject: 'Hi {{first_name}}', html_body: '{{hotel_name}} {{points_balance}}' })).toEqual(['first_name', 'points_balance'])
    expect(memberTagsUsed({ subject: 'Hi', html_body: '{{hotel_name}}' })).toEqual([])
  })
})

describe('the designer\'s blocks', () => {
  it('offers every block type with its fields, and starts each in the person\'s words', () => {
    expect([...BLOCK_TYPES].sort()).toEqual(Object.keys(BLOCK_FIELDS).sort())
    for (const type of BLOCK_TYPES) expect(newBlock(type, words).type).toBe(type)
    expect(newBlock('heading', words)).toEqual({ type: 'heading', content: 'Hello', align: 'left' })
    expect(newBlock('cta', words)).toEqual({ type: 'cta', label: 'Call us', url: '#' })
  })

  it('reads and changes a block\'s field, a choice not set reading as its default', () => {
    const spacer = { type: 'spacer' as const }
    expect(blockValue(spacer, 'size')).toBe('md')
    expect(setBlockField(spacer, 'size', 'lg')).toEqual({ type: 'spacer', size: 'lg' })
    expect(setBlockField(spacer, 'type', 'text')).toBe(spacer)
    const stats = newBlock('stats', words)
    expect(setStatItem(stats, 1, 'value', '19:30')).toMatchObject({ items: [{ value: '' }, { value: '19:30' }, { value: '' }] })
    const content = withBlock(designed, 0, { type: 'heading', content: 'New', align: 'center' })
    expect(content.blocks[0]).toEqual({ type: 'heading', content: 'New', align: 'center' })
    expect(content.blocks[1]).toBe(designed.blocks[1])
  })
})
