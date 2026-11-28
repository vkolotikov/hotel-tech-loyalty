import { PRESETS, embedContent, extractContent, renderEmailHtml, type Block, type EmailContent, type Palette, type Preset } from '../../lib/emailBuilder'
import { MEMBER_TAGS, templateTags } from '../leads/listLogic'

/**
 * Email templates in HexaTech CRM (round 5, owner 2026-11-12: "implement all features we have in our main platform"; a
 * CRM-only organisation has no full admin to make them in). What the server stores is the full admin's: a name, a
 * subject and an HTML body (EmailTemplateController: name and subject required, at most 255; the body required; the
 * category one of campaign, transactional, welcome; `is_active` on update). A body made in the designer carries its
 * blocks in an invisible comment (lib/emailBuilder.ts `embedContent`), so the full admin's builder and this one open
 * each other's templates. Pure: the tests render to a string.
 */

export interface EmailTemplate {
  id: number
  name: string
  subject: string
  html_body: string
  merge_tags?: string[] | null
  category: string | null
  is_active: boolean
  updated_at?: string | null
}

/** The categories the server takes (the full admin also offers two it refuses). */
export const CATEGORIES = ['campaign', 'transactional', 'welcome'] as const
export type Category = (typeof CATEGORIES)[number]

export const TEMPLATE_LIMITS = { name: 255, subject: 255 } as const

export type BodyMode = 'design' | 'html'

export interface TemplateForm {
  name: string
  subject: string
  category: Category
  is_active: boolean
  mode: BodyMode
  /** The designer's blocks; null for a body written as HTML, or a new template not started yet. */
  content: EmailContent | null
  html: string
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** A category the server takes: a preset's birthday or re-engagement is sent as a campaign. */
export function categoryOf(value: string | null | undefined): Category {
  return (CATEGORIES as readonly string[]).includes(value ?? '') ? (value as Category) : 'campaign'
}

/** The form for a saved template (the designer's when its body carries blocks, else its HTML), or a new one. */
export function templateForm(template: EmailTemplate | null): TemplateForm {
  if (!template) return { name: '', subject: '', category: 'campaign', is_active: true, mode: 'design', content: null, html: '' }
  const content = extractContent(template.html_body ?? '')
  return {
    name: template.name ?? '',
    subject: template.subject ?? '',
    category: categoryOf(template.category),
    is_active: template.is_active !== false,
    mode: content ? 'design' : 'html',
    content,
    html: template.html_body ?? '',
  }
}

/** Whether a new template still needs its start (a design or a blank page) before it can be written. */
export function needsStart(form: TemplateForm): boolean {
  return form.mode === 'design' && form.content === null
}

/** The body to save: the designer's HTML with its blocks kept inside, or the HTML as written. */
export function bodyHtml(form: TemplateForm): string {
  if (form.mode === 'design' && form.content) return embedContent(renderEmailHtml(form.content), form.content)
  return form.html
}

/** What the live preview shows: the email as it will look, its tags as written. */
export function previewHtml(form: TemplateForm): string {
  if (form.mode === 'design' && form.content) return renderEmailHtml(form.content)
  return form.html
}

export type TemplateProblem = 'name' | 'name_long' | 'subject' | 'subject_long' | 'body'

/** What the server would refuse. */
export function templateProblems(form: TemplateForm): TemplateProblem[] {
  const out: TemplateProblem[] = []
  const name = form.name.trim()
  const subject = form.subject.trim()
  if (!name) out.push('name')
  else if (name.length > TEMPLATE_LIMITS.name) out.push('name_long')
  if (!subject) out.push('subject')
  else if (subject.length > TEMPLATE_LIMITS.subject) out.push('subject_long')
  if (!bodyHtml(form).trim()) out.push('body')
  return out
}

/** The body of POST email-templates (new) or PUT email-templates/{id} (with the on/off switch). */
export function templatePayload(form: TemplateForm, isNew: boolean): Record<string, unknown> {
  return {
    name: form.name.trim(),
    subject: form.subject.trim(),
    html_body: bodyHtml(form),
    category: form.category,
    ...(isNew ? {} : { is_active: form.is_active }),
  }
}

export function sameTemplate(a: TemplateForm, b: TemplateForm): boolean {
  return JSON.stringify(templatePayload(a, false)) === JSON.stringify(templatePayload(b, false))
}

/** The body of POST email-templates for a copy: the same subject, body and category under a new name. */
export function copyPayload(template: EmailTemplate, name: string): Record<string, unknown> {
  return { name: name.slice(0, TEMPLATE_LIMITS.name), subject: template.subject, html_body: template.html_body, category: categoryOf(template.category) }
}

/** A text with `tag` put where the cursor was (replacing what was selected), and where the cursor goes after it. */
export function insertAt(value: string, start: number | null, end: number | null, tag: string): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start ?? value.length, value.length))
  const to = Math.max(from, Math.min(end ?? from, value.length))
  return { value: value.slice(0, from) + tag + value.slice(to), caret: from + tag.length }
}

export interface TagEntry {
  /** As written in a template: `{{first_name}}`. */
  tag: string
  name: string
  description: string
  /** Filled only from a loyalty member's record: the CRM refuses to send it to a contact who is no member. */
  member: boolean
}

/** The merge tags the server offers (`{ '{{tag}}': description }`), the ones every contact gets first. */
export function tagEntries(tags: Record<string, unknown> | null | undefined): TagEntry[] {
  const out = Object.entries(tags ?? {})
    .filter(([tag]) => /^\{\{[a-z_]+\}\}$/.test(tag))
    .map(([tag, description]) => {
      const name = tag.slice(2, -2)
      return { tag, name, description: typeof description === 'string' ? description : '', member: (MEMBER_TAGS as readonly string[]).includes(name) }
    })
  return [...out.filter(e => !e.member), ...out.filter(e => e.member)]
}

/** The member-only tags a template uses (it goes only to contacts who are loyalty members). */
export function memberTagsUsed(template: Pick<EmailTemplate, 'subject' | 'html_body'>): string[] {
  return templateTags(template).filter(tag => (MEMBER_TAGS as readonly string[]).includes(tag))
}

/* ─── The designer ────────────────────────────────────────────────────────── */

export type BlockType = Block['type']
export type FieldKind = 'line' | 'long' | 'url' | 'choice'
export interface BlockField { key: string; kind: FieldKind; options?: readonly string[] }

/** Each block's fields, as the full admin's builder edits them; `stats` edits its rows instead. */
export const BLOCK_FIELDS: Record<BlockType, readonly BlockField[]> = {
  heading: [{ key: 'content', kind: 'line' }, { key: 'align', kind: 'choice', options: ['left', 'center'] }],
  text: [{ key: 'content', kind: 'long' }, { key: 'align', kind: 'choice', options: ['left', 'center'] }],
  cta: [{ key: 'label', kind: 'line' }, { key: 'url', kind: 'url' }],
  image: [{ key: 'url', kind: 'url' }, { key: 'alt', kind: 'line' }],
  divider: [],
  spacer: [{ key: 'size', kind: 'choice', options: ['sm', 'md', 'lg'] }],
  quote: [{ key: 'content', kind: 'long' }, { key: 'author', kind: 'line' }],
  hero: [{ key: 'imageUrl', kind: 'url' }, { key: 'headline', kind: 'line' }, { key: 'subheadline', kind: 'line' }, { key: 'overlay', kind: 'choice', options: ['dark', 'light', 'none'] }],
  twoColumn: [{ key: 'leftHeading', kind: 'line' }, { key: 'leftText', kind: 'long' }, { key: 'rightHeading', kind: 'line' }, { key: 'rightText', kind: 'long' }],
  voucher: [{ key: 'title', kind: 'line' }, { key: 'value', kind: 'line' }, { key: 'code', kind: 'line' }, { key: 'terms', kind: 'long' }],
  stats: [],
  pointsBox: [{ key: 'value', kind: 'line' }, { key: 'label', kind: 'line' }],
  tierBadge: [{ key: 'label', kind: 'line' }],
}

/** The blocks offered to add, the everyday ones first; the last two are a loyalty member's. */
export const BLOCK_TYPES: readonly BlockType[] = ['heading', 'text', 'cta', 'image', 'divider', 'spacer', 'quote', 'hero', 'twoColumn', 'voucher', 'stats', 'pointsBox', 'tierBadge']

/** The default of a choice the block has not set (as lib/emailBuilder.ts renders it). */
const CHOICE_DEFAULT: Record<string, string> = { align: 'left', size: 'md', overlay: 'dark' }

/** The words a new block starts with, in the person's language. */
export interface StarterWords { heading: string; text: string; button: string; quote: string; label: string }

export function newBlock(type: BlockType, words: StarterWords): Block {
  switch (type) {
    case 'heading': return { type, content: words.heading, align: 'left' }
    case 'text': return { type, content: words.text, align: 'left' }
    case 'cta': return { type, label: words.button, url: '#' }
    case 'image': return { type, url: '', alt: '' }
    case 'divider': return { type }
    case 'spacer': return { type, size: 'md' }
    case 'quote': return { type, content: words.quote, author: '' }
    case 'hero': return { type, imageUrl: '', headline: words.heading, subheadline: '', overlay: 'dark' }
    case 'twoColumn': return { type, leftHeading: words.heading, leftText: words.text, rightHeading: words.heading, rightText: words.text }
    case 'voucher': return { type, title: words.heading, value: '', code: '', terms: '' }
    case 'stats': return { type, items: [{ value: '', label: words.label }, { value: '', label: words.label }, { value: '', label: words.label }] }
    case 'pointsBox': return { type, value: '{{points_balance}}', label: words.label }
    case 'tierBadge': return { type, label: '{{tier_name}}' }
  }
}

/** A block's field as text (a choice not set reads as its default). */
export function blockValue(block: Block, key: string): string {
  const value = (block as Record<string, unknown>)[key]
  if (typeof value === 'string') return value
  return CHOICE_DEFAULT[key] ?? ''
}

/** The block with one field changed (never its type). */
export function setBlockField(block: Block, key: string, value: string): Block {
  if (key === 'type') return block
  return { ...block, [key]: value } as Block
}

/** A stats block with one of its rows changed. */
export function setStatItem(block: Block, index: number, field: 'value' | 'label', value: string): Block {
  if (block.type !== 'stats') return block
  return { ...block, items: block.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)) }
}

/** The content with block `index` replaced. */
export function withBlock(content: EmailContent, index: number, block: Block): EmailContent {
  return { ...content, blocks: content.blocks.map((b, i) => (i === index ? block : b)) }
}

/** The look's colours the designer offers (the rest of the palette stays the design's). */
export const PALETTE_FIELDS: readonly (keyof Palette)[] = ['accent', 'headerBg', 'headerText', 'page']
export const FONTS: readonly EmailContent['font'][] = ['sans', 'serif', 'mixed']

/** The designs to start from: a plain page of our own, then the full admin's presets. */
export function starterContent(words: StarterWords & { footer: string }): EmailContent {
  const base = clone((PRESETS.find(p => p.id === 'ivory-welcome') ?? PRESETS[0]).content)
  return {
    ...base,
    styleId: 'crm-blank',
    logoText: '{{hotel_name}}',
    preheader: '',
    blocks: [newBlock('heading', words), newBlock('text', words), newBlock('cta', words)],
    footerText: words.footer,
  }
}

/** The form after a start was picked: the design's blocks, its subject when none is written yet, its category. */
export function startFrom(form: TemplateForm, content: EmailContent, preset?: Pick<Preset, 'defaultSubject' | 'category'>): TemplateForm {
  return {
    ...form,
    mode: 'design',
    content: clone(content),
    html: '',
    subject: form.subject || preset?.defaultSubject || '',
    category: preset ? categoryOf(preset.category) : form.category,
  }
}

/** The form in the other body mode: the designer's HTML to edit by hand, or back to the blocks (when there are any). */
export function switchMode(form: TemplateForm, mode: BodyMode): TemplateForm {
  if (mode === form.mode) return form
  if (mode === 'html') return { ...form, mode, html: form.content ? renderEmailHtml(form.content) : form.html }
  return form.content ? { ...form, mode } : form
}

export { PRESETS }
