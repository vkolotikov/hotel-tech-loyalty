import { useState, type FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlignLeft, ArrowDown, ArrowUp, Award, BarChart3, ChevronDown, Coins, Columns2, Heading, Image, Images, Minus, MousePointerClick, MoveVertical,
  Paintbrush, Plus, Quote, Ticket, Trash2, type LucideIcon,
} from 'lucide-react'
import type { Block, EmailContent, Palette } from '../../lib/emailBuilder'
import { TextArea, TextInput } from '../ui/inputs'
import { ActionMenu } from '../ui/Menu'
import { moveItem, removeAt } from '../settings/lists'
import { TipField } from '../settings/formKit'
import {
  BLOCK_FIELDS, BLOCK_TYPES, FONTS, PALETTE_FIELDS, blockValue, newBlock, setBlockField, setStatItem, withBlock, type BlockType, type StarterWords,
} from './templateLogic'

export type ContentUpdate = (fn: (content: EmailContent) => EmailContent) => void
/** A text field that a merge tag can be put into: it says so when it takes the focus. */
export type TagBinding = (apply: (value: string) => void) => { onFocus: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void }

const BLOCK_ICON: Record<BlockType, LucideIcon> = {
  heading: Heading, text: AlignLeft, cta: MousePointerClick, image: Image, divider: Minus, spacer: MoveVertical, quote: Quote,
  hero: Images, twoColumn: Columns2, voucher: Ticket, stats: BarChart3, pointsBox: Coins, tierBadge: Award,
}

/** A block's first words, to tell it apart while it is folded. */
function summaryOf(block: Block): string {
  const fields = BLOCK_FIELDS[block.type].filter(f => f.kind === 'line' || f.kind === 'long')
  if (block.type === 'stats') return block.items.map(i => i.value || i.label).filter(Boolean).join(' · ')
  return fields.map(f => blockValue(block, f.key)).find(v => v.trim() !== '') ?? ''
}

/**
 * The designer's blocks (round 5; the full admin's EmailTemplates "Design" mode on the same block model): the email's
 * look folded at the top, then the blocks in order, one open at a time — each with its fields, moved or removed from
 * its menu — and "Add a block". Every text field takes a merge tag where its cursor is (`bind`).
 */
export function BlockEditor({ content, update, bind, words }: { content: EmailContent; update: ContentUpdate; bind: TagBinding; words: StarterWords }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const [look, setLook] = useState(false)
  const names = useBlockNames()
  const fieldName = useFieldNames()

  const add = (type: BlockType) => {
    update(c => ({ ...c, blocks: [...c.blocks, newBlock(type, words)] }))
    setOpen(content.blocks.length)
  }
  const move = (i: number, dir: -1 | 1) => {
    update(c => ({ ...c, blocks: moveItem(c.blocks, i, dir) }))
    setOpen(o => (o === i ? i + dir : o === i + dir ? i : o))
  }
  const remove = (i: number) => {
    update(c => ({ ...c, blocks: removeAt(c.blocks, i) }))
    setOpen(o => (o === null || o === i ? null : o > i ? o - 1 : o))
  }
  const setField = (i: number, key: string, value: string) => update(c => withBlock(c, i, setBlockField(c.blocks[i], key, value)))
  const paletteNames: Record<keyof Palette, string> = {
    accent: t('crm.templates.look.accent', 'Accent'),
    headerBg: t('crm.templates.look.header_bg', 'Header'),
    headerText: t('crm.templates.look.header_text', 'Header text'),
    page: t('crm.templates.look.page', 'Page'),
    surface: '', text: '', muted: '', accentText: '', divider: '', softBg: '',
  }
  const fontNames: Record<EmailContent['font'], string> = {
    sans: t('crm.templates.look.sans', 'Modern'),
    serif: t('crm.templates.look.serif', 'Classic'),
    mixed: t('crm.templates.look.mixed', 'Editorial'),
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
        <button type="button" aria-expanded={look} onClick={() => setLook(v => !v)}
          className="flex min-h-12 w-full items-center gap-2.5 rounded-2xl px-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-a-accent">
          <Paintbrush size={16} aria-hidden className="shrink-0 text-a-text-2" />
          <span className="min-w-0 flex-1 text-sm font-semibold text-a-text">{t('crm.templates.look.title', 'Look of the email')}</span>
          <span aria-hidden className="flex shrink-0 gap-1">
            {PALETTE_FIELDS.slice(0, 3).map(k => <span key={k} className="h-4 w-4 rounded-full border border-a-border" style={{ background: content.palette[k] }} />)}
          </span>
          <ChevronDown size={16} aria-hidden className={`shrink-0 text-a-text-2 transition-transform ${look ? 'rotate-180' : ''}`} />
        </button>
        {look && (
          <div className="space-y-4 border-t border-a-border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TipField label={t('crm.templates.look.logo', 'Name at the top')}>
                {id => <TextInput id={id} value={content.logoText} {...bind(v => update(c => ({ ...c, logoText: v })))} onChange={e => { const v = e.target.value; update(c => ({ ...c, logoText: v })) }} />}
              </TipField>
              <TipField label={t('crm.templates.look.preheader', 'Inbox preview line')} tip={t('crm.templates.look.preheader_tip', 'Shown after the subject in most inboxes, not in the email.')}>
                {id => <TextInput id={id} value={content.preheader ?? ''} {...bind(v => update(c => ({ ...c, preheader: v })))} onChange={e => { const v = e.target.value; update(c => ({ ...c, preheader: v })) }} />}
              </TipField>
            </div>
            <div role="group" aria-label={t('crm.templates.look.font', 'Typeface')}>
              <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.templates.look.font', 'Typeface')}</span>
              <div className="grid grid-cols-3 gap-2">
                {FONTS.map(f => (
                  <button key={f} type="button" aria-pressed={content.font === f} onClick={() => update(c => ({ ...c, font: f }))}
                    className={`min-h-10 rounded-xl border px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${content.font === f ? 'border-a-accent bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:border-a-text-2/40'}`}>{fontNames[f]}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PALETTE_FIELDS.map(key => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-medium text-a-text-2">{paletteNames[key]}</span>
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(content.palette[key]) ? content.palette[key] : '#000000'}
                    onChange={e => { const v = e.target.value; update(c => ({ ...c, palette: { ...c.palette, [key]: v } })) }}
                    className="h-9 w-full cursor-pointer rounded-lg border border-a-border bg-a-surface p-0.5" />
                </label>
              ))}
            </div>
            <TipField label={t('crm.templates.look.footer', 'Footer')}>
              {id => <TextArea id={id} rows={2} value={content.footerText} {...bind(v => update(c => ({ ...c, footerText: v })))} onChange={e => { const v = e.target.value; update(c => ({ ...c, footerText: v })) }} />}
            </TipField>
          </div>
        )}
      </div>

      <ol className="space-y-2" aria-label={t('crm.templates.blocks', 'Blocks')}>
        {content.blocks.map((block, i) => {
          const Icon = BLOCK_ICON[block.type] ?? AlignLeft
          const isOpen = open === i
          const name = names[block.type] ?? block.type
          return (
            <li key={i} className={`rounded-2xl border bg-a-surface shadow-a-sm ${isOpen ? 'border-a-accent/50' : 'border-a-border'}`}>
              <div className="flex min-h-12 items-center gap-1 pl-2 pr-1">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 text-left focus-visible:outline-2 focus-visible:outline-a-accent">
                  <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-a-surface-2 text-a-text-2"><Icon size={15} /></span>
                  <span className="shrink-0 text-sm font-medium text-a-text">{name}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-a-text-2">{summaryOf(block)}</span>
                </button>
                <ActionMenu label={t('crm.templates.block_menu', 'More for this {{block}}', { block: name.toLowerCase() })} items={[
                  { key: 'up', label: t('crm.templates.move_up', 'Move up'), icon: ArrowUp, disabled: i === 0, onSelect: () => move(i, -1) },
                  { key: 'down', label: t('crm.templates.move_down', 'Move down'), icon: ArrowDown, disabled: i === content.blocks.length - 1, onSelect: () => move(i, 1) },
                  'divider',
                  { key: 'remove', label: t('crm.templates.remove_block', 'Remove'), icon: Trash2, danger: true, onSelect: () => remove(i) },
                ]} />
              </div>
              {isOpen && (
                <div className="space-y-3 border-t border-a-border p-3">
                  {block.type === 'divider' && <p className="text-sm text-a-text-2">{t('crm.templates.divider_line', 'A thin line across the email.')}</p>}
                  {block.type === 'stats' && block.items.map((item, j) => (
                    <div key={j} className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="sr-only">{t('crm.templates.stat_value', 'Figure {{n}}', { n: j + 1 })}</span>
                        <TextInput value={item.value} placeholder={t('crm.templates.stat_value', 'Figure {{n}}', { n: j + 1 })}
                          {...bind(v => update(c => withBlock(c, i, setStatItem(c.blocks[i], j, 'value', v))))}
                          onChange={e => { const v = e.target.value; update(c => withBlock(c, i, setStatItem(c.blocks[i], j, 'value', v))) }} />
                      </label>
                      <label className="block">
                        <span className="sr-only">{t('crm.templates.stat_label', 'Caption {{n}}', { n: j + 1 })}</span>
                        <TextInput value={item.label} placeholder={t('crm.templates.stat_label', 'Caption {{n}}', { n: j + 1 })}
                          {...bind(v => update(c => withBlock(c, i, setStatItem(c.blocks[i], j, 'label', v))))}
                          onChange={e => { const v = e.target.value; update(c => withBlock(c, i, setStatItem(c.blocks[i], j, 'label', v))) }} />
                      </label>
                    </div>
                  ))}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {BLOCK_FIELDS[block.type].map(field => {
                      const value = blockValue(block, field.key)
                      const label = fieldName(field.key)
                      if (field.kind === 'choice') {
                        return (
                          <div key={field.key} role="group" aria-label={label} className="sm:col-span-2">
                            <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
                            <div className="flex flex-wrap gap-1.5">
                              {(field.options ?? []).map(option => (
                                <button key={option} type="button" aria-pressed={value === option} onClick={() => setField(i, field.key, option)}
                                  className={`min-h-9 rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${value === option ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                                  {fieldName(`choice_${option}`)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={field.key} className={field.kind === 'long' || BLOCK_FIELDS[block.type].length === 1 ? 'sm:col-span-2' : ''}>
                          <TipField label={label}>
                            {id => field.kind === 'long'
                              ? <TextArea id={id} rows={3} value={value} {...bind(v => setField(i, field.key, v))} onChange={e => setField(i, field.key, e.target.value)} />
                              : <TextInput id={id} type={field.kind === 'url' ? 'url' : 'text'} value={value} placeholder={field.kind === 'url' ? 'https://' : undefined}
                                  {...(field.kind === 'url' ? {} : bind(v => setField(i, field.key, v)))} onChange={e => setField(i, field.key, e.target.value)} />}
                          </TipField>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {content.blocks.length === 0 && <p className="rounded-xl border border-dashed border-a-border px-3 py-5 text-center text-sm text-a-text-2">{t('crm.templates.no_blocks', 'No blocks yet.')}</p>}
      <ActionMenu label={t('crm.templates.add_block', 'Add a block')} align="left"
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-a-border bg-a-surface px-3 text-sm font-semibold text-a-text hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent"
        button={<><Plus size={14} aria-hidden />{t('crm.templates.add_block', 'Add a block')}</>}
        items={BLOCK_TYPES.map(type => ({ key: type, label: names[type], icon: BLOCK_ICON[type], onSelect: () => add(type) }))} />
    </div>
  )
}

function useBlockNames(): Record<BlockType, string> {
  const { t } = useTranslation()
  return {
    heading: t('crm.templates.block.heading', 'Heading'),
    text: t('crm.templates.block.text', 'Text'),
    cta: t('crm.templates.block.cta', 'Button'),
    image: t('crm.templates.block.image', 'Image'),
    divider: t('crm.templates.block.divider', 'Divider'),
    spacer: t('crm.templates.block.spacer', 'Space'),
    quote: t('crm.templates.block.quote', 'Quote'),
    hero: t('crm.templates.block.hero', 'Large picture'),
    twoColumn: t('crm.templates.block.two_column', 'Two columns'),
    voucher: t('crm.templates.block.voucher', 'Voucher'),
    stats: t('crm.templates.block.stats', 'Figures'),
    pointsBox: t('crm.templates.block.points_box', 'Points (members)'),
    tierBadge: t('crm.templates.block.tier_badge', 'Tier (members)'),
  }
}

function useFieldNames(): (key: string) => string {
  const { t } = useTranslation()
  const names: Record<string, string> = {
    content: t('crm.templates.field.content', 'Text'),
    align: t('crm.templates.field.align', 'Alignment'),
    label: t('crm.templates.field.label', 'Label'),
    url: t('crm.templates.field.url', 'Web address'),
    alt: t('crm.templates.field.alt', 'What the image shows'),
    author: t('crm.templates.field.author', 'Author'),
    size: t('crm.templates.field.size', 'Height'),
    imageUrl: t('crm.templates.field.image_url', 'Image address'),
    headline: t('crm.templates.field.headline', 'Headline'),
    subheadline: t('crm.templates.field.subheadline', 'Line under it'),
    overlay: t('crm.templates.field.overlay', 'Shade'),
    leftHeading: t('crm.templates.field.left_heading', 'Left heading'),
    leftText: t('crm.templates.field.left_text', 'Left text'),
    rightHeading: t('crm.templates.field.right_heading', 'Right heading'),
    rightText: t('crm.templates.field.right_text', 'Right text'),
    title: t('crm.templates.field.title', 'Title'),
    value: t('crm.templates.field.value', 'Value'),
    code: t('crm.templates.field.code', 'Code'),
    terms: t('crm.templates.field.terms', 'Terms'),
    choice_left: t('crm.templates.field.choice_left', 'Left'),
    choice_center: t('crm.templates.field.choice_center', 'Centre'),
    choice_sm: t('crm.templates.field.choice_sm', 'Small'),
    choice_md: t('crm.templates.field.choice_md', 'Medium'),
    choice_lg: t('crm.templates.field.choice_lg', 'Large'),
    choice_dark: t('crm.templates.field.choice_dark', 'Dark'),
    choice_light: t('crm.templates.field.choice_light', 'Light'),
    choice_none: t('crm.templates.field.choice_none', 'None'),
  }
  return key => names[key] ?? key
}
