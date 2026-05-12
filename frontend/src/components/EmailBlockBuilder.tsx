import { useState } from 'react'
import {
  Type, Heading as HeadingIcon, Image as ImageIcon, MousePointerClick,
  Minus, MoveVertical, ChevronUp, ChevronDown, Trash2, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'

/**
 * Block-based email builder. Output is inline-styled HTML that renders
 * across Gmail / Outlook / Apple Mail without external stylesheets.
 *
 * Source of truth is the `blocks` array (persisted as body_blocks).
 * body_html is regenerated from blocks on every change and sent as the
 * authoritative payload at send-time. Editing on a later session
 * resumes from blocks; HTML-only legacy campaigns fall back to the
 * raw HTML editor (handled by the parent component).
 */

export type BlockAlign = 'left' | 'center' | 'right'

export type Block =
  | { id: string; type: 'heading';  text: string; level: 1 | 2 | 3; align: BlockAlign; color: string }
  | { id: string; type: 'text';     text: string; color: string;    align: BlockAlign; fontSize: number }
  | { id: string; type: 'button';   text: string; url: string;      bgColor: string;   textColor: string; align: BlockAlign }
  | { id: string; type: 'image';    src: string;  alt: string;      width: number;     align: BlockAlign; link: string }
  | { id: string; type: 'divider';  color: string }
  | { id: string; type: 'spacer';   height: number }

const uid = () => Math.random().toString(36).slice(2, 9)

export function createBlock(type: Block['type']): Block {
  switch (type) {
    case 'heading':
      return { id: uid(), type: 'heading', text: 'Your headline', level: 1, align: 'left', color: '#1a1a1a' }
    case 'text':
      return { id: uid(), type: 'text', text: 'Write something here…', color: '#555555', align: 'left', fontSize: 15 }
    case 'button':
      return { id: uid(), type: 'button', text: 'Click here', url: 'https://', bgColor: '#c9a84c', textColor: '#0e0e0e', align: 'center' }
    case 'image':
      return { id: uid(), type: 'image', src: 'https://via.placeholder.com/600x300?text=Image', alt: '', width: 100, align: 'center', link: '' }
    case 'divider':
      return { id: uid(), type: 'divider', color: '#e5e5e5' }
    case 'spacer':
      return { id: uid(), type: 'spacer', height: 24 }
  }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const escTextWithBreaks = (s: string) =>
  esc(s).replace(/\r?\n/g, '<br>')
const safeUrl = (u: string) => {
  const t = (u || '').trim()
  if (!t) return '#'
  if (/^(javascript|data):/i.test(t)) return '#'
  return t
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case 'heading': {
      const size = b.level === 1 ? 32 : b.level === 2 ? 24 : 18
      return `<h${b.level} style="margin:24px 24px 12px;font-size:${size}px;font-weight:bold;text-align:${b.align};color:${esc(b.color)};line-height:1.25;">${escTextWithBreaks(b.text)}</h${b.level}>`
    }
    case 'text': {
      return `<p style="margin:0 24px 16px;font-size:${b.fontSize}px;line-height:1.6;text-align:${b.align};color:${esc(b.color)};">${escTextWithBreaks(b.text)}</p>`
    }
    case 'button': {
      return `<div style="text-align:${b.align};padding:8px 24px 16px;"><a href="${esc(safeUrl(b.url))}" style="background:${esc(b.bgColor)};color:${esc(b.textColor)};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;font-size:14px;">${escTextWithBreaks(b.text)}</a></div>`
    }
    case 'image': {
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" style="max-width:${b.width}%;height:auto;display:inline-block;border:0;" />`
      const wrapped = b.link ? `<a href="${esc(safeUrl(b.link))}">${img}</a>` : img
      return `<div style="text-align:${b.align};padding:8px 24px;">${wrapped}</div>`
    }
    case 'divider': {
      return `<div style="padding:8px 24px;"><hr style="border:none;border-top:1px solid ${esc(b.color)};margin:0;" /></div>`
    }
    case 'spacer': {
      const h = Math.max(4, Math.min(160, b.height))
      return `<div style="height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</div>`
    }
  }
}

export function renderBlocksToHtml(blocks: Block[]): string {
  if (!blocks.length) return ''
  const body = blocks.map(renderBlock).join('\n')
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1a1a1a;">${body}</div>`
}

/* ─── Template presets ────────────────────────────────────────────── */

export const TEMPLATE_BLOCKS: Record<string, { label: string; subject: string; blocks: Block[] }> = {
  newsletter: {
    label: 'Newsletter',
    subject: "What's new this month",
    blocks: [
      { id: uid(), type: 'heading', text: 'Monthly Update', level: 1, align: 'center', color: '#c9a84c' },
      { id: uid(), type: 'text', text: 'Hi {{member.name}},', color: '#1a1a1a', align: 'left', fontSize: 16 },
      { id: uid(), type: 'text', text: "A quick look at what's been happening this month, plus a few things on the horizon you'll want to know about.", color: '#555555', align: 'left', fontSize: 15 },
      { id: uid(), type: 'divider', color: '#e5e5e5' },
      { id: uid(), type: 'heading', text: 'Story one', level: 2, align: 'left', color: '#1a1a1a' },
      { id: uid(), type: 'text', text: 'Your copy here…', color: '#555555', align: 'left', fontSize: 15 },
      { id: uid(), type: 'heading', text: 'Story two', level: 2, align: 'left', color: '#1a1a1a' },
      { id: uid(), type: 'text', text: 'Your copy here…', color: '#555555', align: 'left', fontSize: 15 },
      { id: uid(), type: 'spacer', height: 16 },
      { id: uid(), type: 'button', text: 'View on our site', url: 'https://', bgColor: '#c9a84c', textColor: '#0e0e0e', align: 'center' },
    ],
  },
  winback: {
    label: 'Win-back',
    subject: 'We miss you, {{member.name}}',
    blocks: [
      { id: uid(), type: 'heading', text: "It's been a while", level: 1, align: 'center', color: '#1a1a1a' },
      { id: uid(), type: 'text', text: 'Hi {{member.name}},', color: '#1a1a1a', align: 'left', fontSize: 16 },
      { id: uid(), type: 'text', text: "We noticed it's been a few months. As a {{member.tier}} member, you've earned {{member.points}} points so far — here's a little bonus to bring you back.", color: '#555555', align: 'left', fontSize: 15 },
      { id: uid(), type: 'spacer', height: 8 },
      { id: uid(), type: 'heading', text: '+500 bonus points', level: 2, align: 'center', color: '#c9a84c' },
      { id: uid(), type: 'text', text: 'On your next booking, this month only', color: '#888888', align: 'center', fontSize: 13 },
      { id: uid(), type: 'spacer', height: 8 },
      { id: uid(), type: 'button', text: 'Book your next stay', url: 'https://', bgColor: '#1a1a1a', textColor: '#ffffff', align: 'center' },
    ],
  },
  offer: {
    label: 'Offer spotlight',
    subject: 'Exclusive for {{member.tier}} members',
    blocks: [
      { id: uid(), type: 'heading', text: 'Members only', level: 3, align: 'center', color: '#c9a84c' },
      { id: uid(), type: 'heading', text: 'Your exclusive offer', level: 1, align: 'center', color: '#1a1a1a' },
      { id: uid(), type: 'text', text: 'Hi {{member.name}},', color: '#1a1a1a', align: 'left', fontSize: 16 },
      { id: uid(), type: 'text', text: "As a thank you for being one of our most loyal guests, we'd like to share something special with you.", color: '#555555', align: 'left', fontSize: 15 },
      { id: uid(), type: 'heading', text: '25% off your next stay', level: 2, align: 'center', color: '#1a1a1a' },
      { id: uid(), type: 'text', text: 'Valid for bookings made before the end of this month.', color: '#888888', align: 'center', fontSize: 13 },
      { id: uid(), type: 'button', text: 'Claim now', url: 'https://', bgColor: '#c9a84c', textColor: '#0e0e0e', align: 'center' },
    ],
  },
  tier: {
    label: 'Tier promotion',
    subject: 'Welcome to {{member.tier}}, {{member.name}}',
    blocks: [
      { id: uid(), type: 'heading', text: 'Tier upgrade', level: 3, align: 'center', color: '#0e0e0e' },
      { id: uid(), type: 'heading', text: 'Welcome to {{member.tier}}', level: 1, align: 'center', color: '#0e0e0e' },
      { id: uid(), type: 'text', text: 'Congratulations, {{member.name}}!', color: '#1a1a1a', align: 'left', fontSize: 16 },
      { id: uid(), type: 'text', text: "You've reached a new tier in our loyalty programme. From now on, every stay earns you more, and you'll enjoy these new benefits:", color: '#555555', align: 'left', fontSize: 15 },
      { id: uid(), type: 'text', text: "• Priority room upgrades\n• Complimentary breakfast\n• Late checkout when available", color: '#555555', align: 'left', fontSize: 15 },
      { id: uid(), type: 'spacer', height: 8 },
      { id: uid(), type: 'text', text: 'Current balance: {{member.points}} points', color: '#888888', align: 'center', fontSize: 14 },
    ],
  },
  blank: {
    label: 'Blank',
    subject: '',
    blocks: [
      { id: uid(), type: 'heading', text: 'Your headline', level: 1, align: 'left', color: '#1a1a1a' },
      { id: uid(), type: 'text', text: 'Write something here…', color: '#555555', align: 'left', fontSize: 15 },
    ],
  },
}

/* ─── Builder component ───────────────────────────────────────────── */

interface Props {
  blocks: Block[]
  onChange: (next: Block[]) => void
  /** Called when admin clicks one of the per-block "Insert variable"
   * chips, so the parent can echo the variable into the focused
   * text/heading/button block. */
}

const BLOCK_META: Record<Block['type'], { label: string; icon: any }> = {
  heading: { label: 'Heading',  icon: HeadingIcon },
  text:    { label: 'Text',     icon: Type },
  button:  { label: 'Button',   icon: MousePointerClick },
  image:   { label: 'Image',    icon: ImageIcon },
  divider: { label: 'Divider',  icon: Minus },
  spacer:  { label: 'Spacer',   icon: MoveVertical },
}

const VAR_CHIPS: { token: string; label: string }[] = [
  { token: '{{member.name}}',          label: 'Name' },
  { token: '{{member.first_name}}',    label: 'First' },
  { token: '{{member.tier}}',          label: 'Tier' },
  { token: '{{member.points}}',        label: 'Points' },
  { token: '{{member.member_number}}', label: 'Member #' },
]

export function EmailBlockBuilder({ blocks, onChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(blocks[0]?.id ?? null)

  const updateBlock = (id: string, patch: Partial<Block>) => {
    onChange(blocks.map(b => (b.id === id ? ({ ...b, ...patch } as Block) : b)))
  }
  const move = (id: string, delta: -1 | 1) => {
    const i = blocks.findIndex(b => b.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= blocks.length) return
    const copy = blocks.slice()
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    onChange(copy)
  }
  const remove = (id: string) => {
    onChange(blocks.filter(b => b.id !== id))
    if (activeId === id) setActiveId(null)
  }
  const add = (type: Block['type']) => {
    const b = createBlock(type)
    onChange([...blocks, b])
    setActiveId(b.id)
  }

  return (
    <div className="space-y-3">
      {/* Block list */}
      <div className="space-y-2">
        {blocks.length === 0 && (
          <div className="rounded-lg border border-dashed border-dark-border p-8 text-center text-t-secondary text-sm">
            No blocks yet. Add one below to start building.
          </div>
        )}
        {blocks.map((b, i) => {
          const Meta = BLOCK_META[b.type]
          const isActive = activeId === b.id
          return (
            <div
              key={b.id}
              className={`rounded-lg border transition-colors ${
                isActive ? 'border-primary-500/60 bg-dark-surface2' : 'border-dark-border bg-dark-surface'
              }`}
            >
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                onClick={() => setActiveId(isActive ? null : b.id)}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${isActive ? 'bg-primary-500/20 text-primary-300' : 'bg-dark-surface2 text-t-secondary'}`}>
                  <Meta.icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{Meta.label}</p>
                  <p className="text-[11px] text-t-secondary truncate">{describeBlock(b)}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); move(b.id, -1) }}
                    disabled={i === 0}
                    title="Move up"
                    className="p-1 rounded hover:bg-dark-surface3 text-t-secondary disabled:opacity-30"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); move(b.id, 1) }}
                    disabled={i === blocks.length - 1}
                    title="Move down"
                    className="p-1 rounded hover:bg-dark-surface3 text-t-secondary disabled:opacity-30"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(b.id) }}
                    title="Delete block"
                    className="p-1 rounded hover:bg-red-500/15 text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {isActive && (
                <div className="border-t border-dark-border px-3 py-3 space-y-2">
                  <BlockEditor block={b} onChange={patch => updateBlock(b.id, patch)} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add row */}
      <div className="border-t border-dark-border pt-3">
        <p className="text-[11px] text-t-secondary mb-1.5">Add block</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(BLOCK_META) as Block['type'][]).map(t => {
            const M = BLOCK_META[t]
            return (
              <button
                key={t}
                onClick={() => add(t)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-dark-surface2 hover:bg-dark-surface3 text-[#d0d0d0] hover:text-white border border-dark-border transition-colors"
              >
                <M.icon size={13} /> {M.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function describeBlock(b: Block): string {
  switch (b.type) {
    case 'heading': return `H${b.level} · ${b.text || '(empty)'}`
    case 'text':    return (b.text || '(empty)').replace(/\n/g, ' · ').slice(0, 60)
    case 'button':  return `"${b.text}" → ${b.url || '(no link)'}`
    case 'image':   return b.alt || b.src || '(no image)'
    case 'divider': return `Line · ${b.color}`
    case 'spacer':  return `${b.height}px`
  }
}

/* ─── Per-block editor ────────────────────────────────────────────── */

function BlockEditor({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  switch (block.type) {
    case 'heading':
      return (
        <>
          <Field label="Text">
            <TextWithVars value={block.text} onChange={v => onChange({ text: v })} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Size">
              <select value={block.level} onChange={e => onChange({ level: Number(e.target.value) as 1 | 2 | 3 })} className={selectCls}>
                <option value={1}>Large (H1)</option>
                <option value={2}>Medium (H2)</option>
                <option value={3}>Small (H3)</option>
              </select>
            </Field>
            <Field label="Align"><AlignPicker value={block.align} onChange={v => onChange({ align: v })} /></Field>
            <Field label="Color"><ColorInput value={block.color} onChange={v => onChange({ color: v })} /></Field>
          </div>
        </>
      )
    case 'text':
      return (
        <>
          <Field label="Body">
            <TextWithVars value={block.text} onChange={v => onChange({ text: v })} multiline rows={4} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Size">
              <select value={block.fontSize} onChange={e => onChange({ fontSize: Number(e.target.value) })} className={selectCls}>
                <option value={12}>12px</option>
                <option value={13}>13px</option>
                <option value={14}>14px</option>
                <option value={15}>15px (default)</option>
                <option value={16}>16px</option>
                <option value={18}>18px</option>
              </select>
            </Field>
            <Field label="Align"><AlignPicker value={block.align} onChange={v => onChange({ align: v })} /></Field>
            <Field label="Color"><ColorInput value={block.color} onChange={v => onChange({ color: v })} /></Field>
          </div>
        </>
      )
    case 'button':
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Label">
              <TextWithVars value={block.text} onChange={v => onChange({ text: v })} />
            </Field>
            <Field label="Link URL">
              <input value={block.url} onChange={e => onChange({ url: e.target.value })} placeholder="https://" className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Background"><ColorInput value={block.bgColor} onChange={v => onChange({ bgColor: v })} /></Field>
            <Field label="Text color"><ColorInput value={block.textColor} onChange={v => onChange({ textColor: v })} /></Field>
            <Field label="Align"><AlignPicker value={block.align} onChange={v => onChange({ align: v })} /></Field>
          </div>
        </>
      )
    case 'image':
      return (
        <>
          <Field label="Image URL">
            <input value={block.src} onChange={e => onChange({ src: e.target.value })} placeholder="https://…/image.jpg" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Alt text">
              <input value={block.alt} onChange={e => onChange({ alt: e.target.value })} placeholder="Describe the image" className={inputCls} />
            </Field>
            <Field label="Click-through URL (optional)">
              <input value={block.link} onChange={e => onChange({ link: e.target.value })} placeholder="https://" className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Width: ${block.width}%`}>
              <input type="range" min={20} max={100} step={5} value={block.width} onChange={e => onChange({ width: Number(e.target.value) })} className="w-full accent-primary-500" />
            </Field>
            <Field label="Align"><AlignPicker value={block.align} onChange={v => onChange({ align: v })} /></Field>
          </div>
        </>
      )
    case 'divider':
      return (
        <Field label="Color"><ColorInput value={block.color} onChange={v => onChange({ color: v })} /></Field>
      )
    case 'spacer':
      return (
        <Field label={`Height: ${block.height}px`}>
          <input type="range" min={4} max={120} step={4} value={block.height} onChange={e => onChange({ height: Number(e.target.value) })} className="w-full accent-primary-500" />
        </Field>
      )
  }
}

/* ─── Small helpers ───────────────────────────────────────────────── */

const inputCls  = 'w-full bg-dark-bg border border-dark-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
const selectCls = inputCls

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-t-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}

function AlignPicker({ value, onChange }: { value: BlockAlign; onChange: (v: BlockAlign) => void }) {
  const opts: { v: BlockAlign; icon: any }[] = [
    { v: 'left',   icon: AlignLeft },
    { v: 'center', icon: AlignCenter },
    { v: 'right',  icon: AlignRight },
  ]
  return (
    <div className="inline-flex bg-dark-bg border border-dark-border rounded-lg p-0.5 w-full">
      {opts.map(o => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`flex-1 py-1 rounded text-xs flex items-center justify-center ${
            value === o.v ? 'bg-primary-500/20 text-primary-300' : 'text-t-secondary hover:text-white'
          }`}
        >
          <o.icon size={13} />
        </button>
      ))}
    </div>
  )
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-dark-border bg-dark-bg cursor-pointer flex-shrink-0"
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={inputCls + ' font-mono'}
      />
    </div>
  )
}

/**
 * Text input + variable insertion chips. Tracks the textarea ref so
 * clicking a chip inserts at the cursor instead of appending.
 */
function TextWithVars({
  value, onChange, multiline = false, rows = 2,
}: {
  value: string; onChange: (v: string) => void; multiline?: boolean; rows?: number
}) {
  const [ref, setRef] = useState<HTMLTextAreaElement | HTMLInputElement | null>(null)

  const insert = (token: string) => {
    if (!ref) { onChange(value + token); return }
    const start = ref.selectionStart ?? value.length
    const end   = ref.selectionEnd ?? value.length
    const next  = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ref.focus()
      ref.selectionStart = ref.selectionEnd = start + token.length
    })
  }

  return (
    <div className="space-y-1">
      {multiline ? (
        <textarea
          ref={el => setRef(el)}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          className={inputCls + ' resize-y'}
        />
      ) : (
        <input
          ref={el => setRef(el)}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
        />
      )}
      <div className="flex flex-wrap gap-1">
        {VAR_CHIPS.map(v => (
          <button
            key={v.token}
            type="button"
            onClick={() => insert(v.token)}
            title={v.token}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary-500/10 text-primary-300 hover:bg-primary-500/20 transition-colors"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}
