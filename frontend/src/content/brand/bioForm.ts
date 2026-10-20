import type { BioBody, BioPayload } from '../lib/types'

/** A page has at most eight buttons (spec 2026-10-19 §6.2). */
export const MAX_BUTTONS = 8
/** The landing-page name rule (LandingSlug::isValid): 3–63 lowercase letters and digits, single hyphens between. */
const NAME_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** An http(s) address with a host and no spaces: the portal's first check; the server's is the rule. */
const ADDRESS_RULE = /^https?:\/\/[^\s/?#]+\S*$/i

/** A button as the editor holds it: `key` keeps its row while it moves; `id` null for a button not saved yet. */
export interface BioButtonForm { key: string; id: number | null; label: string; destination: string }
/** The page as the editor holds it: text, '' for none. */
export interface BioForm { is_on: boolean; slug: string; title: string; line: string; show_posts: boolean; buttons: BioButtonForm[] }

/** The saved page, or — before its first save — off, with the suggested name and the latest posts shown. */
export function bioFormOf(bio: BioPayload): BioForm {
  const page = bio.page
  return {
    is_on: page?.is_on ?? false,
    slug: page?.slug ?? bio.suggested_name,
    title: page?.title ?? '',
    line: page?.line ?? '',
    show_posts: page?.show_posts ?? true,
    buttons: bio.buttons.map(b => ({ key: `b${b.id}`, id: b.id, label: b.label, destination: b.destination ?? '' })),
  }
}

/** The page as `PUT bio` takes it, in order: words trimmed, '' as null; a kept button with its id (it keeps its short link). */
export function bioBody(form: BioForm): BioBody {
  const words = (value: string): string | null => (value.trim() === '' ? null : value.trim())
  return {
    is_on: form.is_on,
    slug: form.slug.trim(),
    title: words(form.title),
    line: words(form.line),
    show_posts: form.show_posts,
    buttons: form.buttons.map(b => ({ ...(b.id === null ? {} : { id: b.id }), label: b.label.trim(), destination: b.destination.trim() })),
  }
}

/** What the name field keeps of a key press: lowercase, spaces as hyphens (the rest is bioProblems' to say). */
export const slugInput = (raw: string): string => raw.toLowerCase().replace(/\s+/g, '-')

/** The page's address for a name: the server's base (`base_url`) and the name. */
export const addressOf = (base: string, slug: string): string => `${base}${slug}`

/** What stops a save before it is sent: the name's shape, and each button's label and address (keys like the server's `errors`). */
export function bioProblems(form: BioForm): string[] {
  const out: string[] = []
  const slug = form.slug.trim()
  if (slug.length < 3 || slug.length > 63 || !NAME_RULE.test(slug)) out.push('slug')
  if (form.buttons.length > MAX_BUTTONS) out.push('buttons')
  form.buttons.forEach((b, i) => {
    if (b.label.trim() === '') out.push(`buttons.${i}.label`)
    if (!ADDRESS_RULE.test(b.destination.trim())) out.push(`buttons.${i}.destination`)
  })
  return out
}

/** A button moved one place up (-1) or down (1); past an end, the same list. */
export function moveButton(buttons: BioButtonForm[], index: number, by: -1 | 1): BioButtonForm[] {
  const to = index + by
  if (to < 0 || to >= buttons.length) return buttons
  const out = [...buttons]
  ;[out[index], out[to]] = [out[to], out[index]]
  return out
}

/** A new empty button at the end, while there are fewer than eight. */
export const addButton = (buttons: BioButtonForm[], key: string): BioButtonForm[] =>
  buttons.length >= MAX_BUTTONS ? buttons : [...buttons, { key, id: null, label: '', destination: '' }]

export const removeButton = (buttons: BioButtonForm[], index: number): BioButtonForm[] => buttons.filter((_, i) => i !== index)

/** The saved page's address when this form renames it (spec §6.1: the old address stops working), else null. */
export function renamedFrom(bio: BioPayload, form: BioForm): string | null {
  return bio.page && bio.url && form.slug.trim() !== bio.page.slug ? bio.url : null
}

/** The fields a refusal names: the name for the two name refusals, the buttons for too many, else the refused form's own. */
export function refusedFields(code: string, fields?: Record<string, string[]>): string[] {
  if (code === 'bio_name_invalid' || code === 'bio_name_taken') return ['slug']
  if (code === 'too_many_buttons') return ['buttons']
  return Object.keys(fields ?? {})
}

/** Where the keyboard goes after a move: the moved row's same arrow, or its other one at an end (that arrow is then off). */
export function focusAfterMove(buttons: readonly BioButtonForm[], index: number, by: -1 | 1): string | null {
  const to = index + by
  if (to < 0 || to >= buttons.length) return null
  const atEnd = to === 0 || to === buttons.length - 1
  const same = by < 0 ? 'up' : 'down'
  const other = by < 0 ? 'down' : 'up'
  return `[data-bio-row="${buttons[index].key}"] [data-move="${atEnd ? other : same}"]`
}

/** After a removal: the next row's Remove, else the previous row's, else "Add a button". */
export function focusAfterRemove(buttons: readonly BioButtonForm[], index: number): string {
  const next = buttons[index + 1] ?? buttons[index - 1]
  return next ? `[data-bio-row="${next.key}"] [data-remove]` : '[data-bio-add]'
}

/** The page to edit: read again first — another device may have changed it since this tab read it — else the copy held. */
export async function freshBio(refetch: () => Promise<{ data?: BioPayload }>, held: BioPayload): Promise<BioPayload> {
  try {
    return (await refetch()).data ?? held
  } catch {
    return held
  }
}
