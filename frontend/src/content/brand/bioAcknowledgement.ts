import type { BioPayload } from '../lib/types'
import { bioFormOf, type BioForm } from './bioForm'

/** Save returns buttons in submitted order. Match by the submitted local key, never the later row index. */
export function acknowledgeBio(submitted: BioForm, latest: BioForm, answer: BioPayload): { base: BioForm; draft: BioForm } {
  const base = bioFormOf(answer)
  base.buttons = base.buttons.map((button, index) => ({ ...button, key: submitted.buttons[index]?.key ?? button.key }))
  const draft = { ...base }
  for (const key of ['is_on', 'slug', 'title', 'line', 'show_posts'] as const) {
    if (latest[key] !== submitted[key]) Object.assign(draft, { [key]: latest[key] })
  }
  draft.buttons = latest.buttons.map(button => {
    const sent = submitted.buttons.find(row => row.key === button.key)
    const saved = base.buttons.find(row => row.key === button.key)
    if (!sent || !saved) return button
    return { ...saved, label: button.label === sent.label ? saved.label : button.label,
      destination: button.destination === sent.destination ? saved.destination : button.destination }
  })
  return { base, draft }
}
