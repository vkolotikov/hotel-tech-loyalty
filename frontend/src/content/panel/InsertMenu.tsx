import { ListPlus } from 'lucide-react'
import type { Snippet } from '../lib/types'
import { PopMenu } from '../ui/PopMenu'

/**
 * "Insert" beside a field (spec 2026-10-15 §6): the brand's hashtag groups or snippets in the shared menu; picking one
 * hands it over. Nothing shows when the brand has none of that kind.
 */
export function InsertMenu({ label, items, onPick }: { label: string; items: Snippet[]; onPick: (item: Snippet) => void }) {
  return (
    <PopMenu label={label} items={items.map(item => ({ id: String(item.id), label: item.name, sub: item.body }))}
      onPick={(id) => { const item = items.find(s => String(s.id) === id); if (item) onPick(item) }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
      <ListPlus size={12} aria-hidden />{label}
    </PopMenu>
  )
}
