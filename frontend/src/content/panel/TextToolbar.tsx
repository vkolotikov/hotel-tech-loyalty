import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Hash, Link2, ListPlus, Smile } from 'lucide-react'
import type { Snippet } from '../lib/types'
import { focusWasInside, outside } from '../ui/menuFocus'
import { PopMenu } from '../ui/PopMenu'
import { EmojiPicker } from './EmojiPicker'
import { linkToInsert, loadRecent, pushRecent, saveRecent, type InsertMode } from './toolbarMath'

const TOOL = 'rounded-md p-1.5 text-a-text-2 hover:bg-a-surface hover:text-a-text aria-expanded:bg-a-surface aria-expanded:text-a-text'

/** While a tool's box is open: an Escape anywhere closes it (claimed, so the panel stays), as does a press outside it. */
function useCloses(open: boolean, box: RefObject<HTMLDivElement | null>, button: RefObject<HTMLButtonElement | null>, close: () => void) {
  const latest = useRef(close)
  useEffect(() => { latest.current = close })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (focusWasInside(box.current, document.activeElement)) button.current?.focus()
      latest.current()
    }
    const onPress = (e: PointerEvent) => { if (outside(box.current, e.target)) latest.current() }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
    }
  }, [open, box, button])
}

/** A toolbar button with a box under it (the emoji picker, the address box). */
function ToolBox({ label, icon: Icon, open, onButton, onClose, children }: {
  label: string
  icon: typeof Smile
  open: boolean
  onButton: () => void
  onClose: () => void
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  useCloses(open, box, button, onClose)
  return (
    <div ref={box} className="relative">
      <button ref={button} type="button" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={onButton} className={TOOL}>
        <Icon size={16} aria-hidden />
      </button>
      {open && (
        <div id={id} role="dialog" aria-label={label} className="absolute left-0 top-full z-50 mt-1 animate-a-pop rounded-xl border border-a-border bg-a-surface p-2 text-a-text shadow-a-lg">
          {children}
        </div>
      )}
    </div>
  )
}

/** The address box behind Insert link when there is no link to put in yet. */
export function AddressBox({ onInsert }: { onInsert: (url: string) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [bad, setBad] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const id = useId()
  useEffect(() => { field.current?.focus() }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const url = linkToInsert(null, value)
    if (url) onInsert(url)
    else setBad(true)
  }
  return (
    <form onSubmit={submit} noValidate className="w-64 space-y-2">
      <label htmlFor={id} className="block text-xs font-medium text-a-text-2">{t('content.panel.link_address', 'Web address')}</label>
      <div className="flex gap-1.5">
        <input ref={field} id={id} type="url" inputMode="url" value={value} placeholder="https://" aria-invalid={bad || undefined}
          onChange={(e) => { setValue(e.target.value); setBad(false) }}
          className={`min-w-0 flex-1 rounded-lg border bg-a-surface px-2.5 py-1.5 text-sm text-a-text ${bad ? 'border-a-danger' : 'border-a-border'}`} />
        <button type="submit" className="rounded-lg bg-a-accent px-3 py-1.5 text-sm font-medium text-a-accent-ink hover:bg-a-accent-deep">
          {t('content.panel.insert', 'Insert')}
        </button>
      </div>
      {bad && <p className="text-xs text-a-danger">{t('content.panel.field_invalid', 'Check this field.')}</p>}
    </form>
  )
}

/**
 * The tools above the post text (spec 2026-10-21 §7.5): Emoji (a picker; the emoji goes in at the cursor), Insert link
 * (the post's short link, else the address in the Link field, else a box asks for one), Insert snippet and Insert
 * hashtag group (the brand's snippets go into the text; a hashtag group goes into the Hashtags field).
 */
export function TextToolbar({ onInsert, shortUrl, typedLink, snippets, groups, onHashtags }: {
  /**
   * Puts text in at the cursor: a snippet (`block`) on a line of its own when there is no cursor; a link (`word`) with a space
   * on each side where the text has none; an emoji (`inline`) just there.
   */
  onInsert: (text: string, mode: InsertMode) => void
  shortUrl: string | null
  /** What the Link field holds now. */
  typedLink: string
  snippets: Snippet[]
  groups: Snippet[]
  onHashtags: (tags: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<'emoji' | 'link' | null>(null)
  const [recent, setRecent] = useState(loadRecent)
  const flip = (tool: 'emoji' | 'link') => setOpen(o => (o === tool ? null : tool))
  const pickEmoji = (emoji: string) => {
    const next = pushRecent(recent, emoji)
    setRecent(next)
    saveRecent(next)
    setOpen(null)
    onInsert(emoji, 'inline')
  }
  const insertLink = () => {
    const url = linkToInsert(shortUrl, typedLink)
    if (url) onInsert(url, 'word')
    else flip('link')
  }
  const menu = (items: Snippet[]) => items.map(item => ({ id: String(item.id), label: item.name, sub: item.body }))

  return (
    <div role="group" aria-label={t('content.panel.tools', 'Text tools')} data-toolbar=""
      className="flex items-center gap-0.5 rounded-t-lg border border-b-0 border-a-border bg-a-surface-2 px-1 py-0.5">
      <ToolBox label={t('content.panel.tool_emoji', 'Emoji')} icon={Smile} open={open === 'emoji'} onButton={() => flip('emoji')} onClose={() => setOpen(null)}>
        <EmojiPicker recent={recent} onPick={pickEmoji} />
      </ToolBox>
      <ToolBox label={t('content.panel.tool_link', 'Insert link')} icon={Link2} open={open === 'link'} onButton={insertLink} onClose={() => setOpen(null)}>
        <AddressBox onInsert={(url) => { setOpen(null); onInsert(url, 'word') }} />
      </ToolBox>
      <PopMenu label={t('content.panel.insert_snippet', 'Insert snippet')} title={t('content.panel.insert_snippet', 'Insert snippet')} align="left" items={menu(snippets)}
        emptyText={t('content.brand.snippets.none_texts', 'No snippets yet.')}
        onPick={(id) => { const item = snippets.find(s => String(s.id) === id); if (item) onInsert(item.body, 'block') }} className={TOOL}>
        <ListPlus size={16} aria-hidden />
      </PopMenu>
      <PopMenu label={t('content.panel.tool_hashtags', 'Insert hashtag group')} title={t('content.panel.tool_hashtags', 'Insert hashtag group')} align="left" items={menu(groups)}
        emptyText={t('content.brand.snippets.none_groups', 'No hashtag groups yet.')}
        onPick={(id) => { const item = groups.find(s => String(s.id) === id); if (item) onHashtags(item.body) }} className={TOOL}>
        <Hash size={16} aria-hidden />
      </PopMenu>
    </div>
  )
}
