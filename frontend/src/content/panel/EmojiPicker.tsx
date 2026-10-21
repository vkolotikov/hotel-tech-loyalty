import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { EMOJI, EMOJI_GROUPS, type EmojiItem } from './emojiData'
import { gridMove, searchEmoji } from './toolbarMath'

const COLS = 8
const byChar = new Map(EMOJI.map(item => [item.char, item]))

/** A grid of emoji buttons, each named: one tab stop, the arrows, Home and End move inside it. */
function EmojiGrid({ items, onPick }: { items: EmojiItem[]; onPick: (emoji: string) => void }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-emoji]')]
    const next = gridMove(buttons.indexOf(document.activeElement as HTMLButtonElement), e.key, buttons.length, COLS)
    if (next === null || next < 0) return
    e.preventDefault()
    buttons[next]?.focus()
  }
  return (
    <div onKeyDown={onKey} className="grid grid-cols-8 gap-0.5">
      {items.map((item, i) => (
        <button key={item.char} type="button" data-emoji="" tabIndex={i === 0 ? 0 : -1} aria-label={item.name} title={item.name} onClick={() => onPick(item.char)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none hover:bg-a-surface-2">{item.char}</button>
      ))}
    </div>
  )
}

/**
 * The emoji picker behind the toolbar's Emoji button (spec 2026-10-21 §7.5): a search box (it takes the focus; Enter
 * picks the first match), the ones used last on this device, then the groups. Searching matches English words.
 */
export function EmojiPicker({ recent, onPick }: { recent: string[]; onPick: (emoji: string) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => { search.current?.focus() }, [])
  const found = query.trim() === '' ? null : searchEmoji(query, EMOJI)
  const used = recent.map(char => byChar.get(char) ?? { char, name: char, keys: [] })
  const title = 'mb-1 mt-2 font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2'

  return (
    <div className="w-[17.5rem] space-y-1">
      <input ref={search} type="search" aria-label={t('content.panel.emoji_search', 'Search emoji')} value={query}
        placeholder={t('content.panel.emoji_search', 'Search emoji')} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && found && found.length > 0) { e.preventDefault(); onPick(found[0].char) } }}
        className="w-full rounded-lg border border-a-border bg-a-surface px-2.5 py-1.5 text-sm text-a-text placeholder:text-a-text-2" />
      <div className="max-h-64 overflow-y-auto pr-1">
        {found !== null ? (
          found.length > 0
            ? <div className="pt-2"><EmojiGrid items={found} onPick={onPick} /></div>
            : <p role="status" className="px-1 py-3 text-sm text-a-text-2">{t('content.panel.emoji_none', 'No emoji match.')}</p>
        ) : (
          <>
            {used.length > 0 && (
              <section>
                <p className={title}>{t('content.panel.emoji_recent', 'Recent')}</p>
                <EmojiGrid items={used} onPick={onPick} />
              </section>
            )}
            {EMOJI_GROUPS.map(group => (
              <section key={group.id}>
                <p className={title}>{t(`content.panel.emoji_group.${group.id}`, group.label)}</p>
                <EmojiGrid items={group.items} onPick={onPick} />
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
