import { parseHashtags } from '../lib/postText'
import type { DateKey, Platform, PostDetail, PostFields, PostStatus, Rewrite, VisualBrief } from '../lib/types'
import type { NewDraft } from './PanelProvider'

/** The rewrites' English names, the fallback under the bundles' words (panelState.test.ts keeps them equal). */
export const REWRITE_TEXT: Record<Rewrite, string> = {
  shorter: 'Shorter', longer: 'Longer', professional: 'More professional', friendly: 'Friendlier', alternative: 'Another version',
}

/** The visual brief's fields the panel shows, and their English names. */
export const BRIEF_TEXT = {
  visual_type: 'Type', aspect_ratio: 'Format', style: 'Style', description: 'Description', scene: 'Scene',
  mood: 'Mood', composition: 'Composition', text_overlay: 'Text on the image', avoid: 'Avoid',
} satisfies Partial<Record<keyof VisualBrief, string>>

/** The post panel's fields as its inputs hold them: text, with '' for "none". */
export interface PostForm {
  platform: Platform
  scheduled_date: string
  scheduled_time: string
  status: PostStatus
  pillar_id: string
  audience_id: string
  language: string
  topic: string
  hook: string
  main_copy: string
  cta: string
  hashtags: string
}

const text = (value: string | null | undefined): string => value ?? ''

export function formOf(post: PostDetail): PostForm {
  return {
    platform: post.platform,
    scheduled_date: text(post.scheduled_date),
    scheduled_time: text(post.scheduled_time),
    status: post.status,
    pillar_id: post.pillar_id === null ? '' : String(post.pillar_id),
    audience_id: post.audience_id === null ? '' : String(post.audience_id),
    language: text(post.language),
    topic: text(post.topic),
    hook: text(post.hook),
    main_copy: text(post.main_copy),
    cta: text(post.cta),
    hashtags: post.hashtags.join(' '),
  }
}

/**
 * A new post: the slot's day and platform, or else the brand's own first
 * channel, or else the first platform HexaTech knows; a draft in the brand's language.
 */
export function newForm(draft: NewDraft, platforms: readonly Platform[], channels: readonly Platform[] = []): PostForm {
  return {
    platform: draft.platform ?? channels[0] ?? platforms[0] ?? 'instagram',
    scheduled_date: draft.date ?? '',
    scheduled_time: '',
    status: 'draft',
    pillar_id: '',
    audience_id: '',
    language: '',
    topic: '',
    hook: '',
    main_copy: '',
    cta: '',
    hashtags: '',
  }
}

/** Each field as the server takes it: '' is "none" (null); words are trimmed; the text keeps its lines. */
function valuesOf(form: PostForm) {
  const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())
  const id = (value: string): number | null => (value === '' ? null : Number(value))
  return {
    platform: form.platform,
    scheduled_date: orNull(form.scheduled_date) as DateKey | null,
    scheduled_time: orNull(form.scheduled_time),
    status: form.status,
    pillar_id: id(form.pillar_id),
    audience_id: id(form.audience_id),
    language: orNull(form.language),
    topic: orNull(form.topic),
    hook: orNull(form.hook),
    main_copy: form.main_copy.trim() === '' ? null : form.main_copy,
    cta: orNull(form.cta),
    hashtags: parseHashtags(form.hashtags),
  }
}
type Values = ReturnType<typeof valuesOf>

/** What changed since the post was loaded, as the server takes it. An emptied language is left out: a post keeps one. */
export function changes(base: PostForm, draft: PostForm): PostFields {
  const before = valuesOf(base)
  const after = valuesOf(draft)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(after) as (keyof Values)[]) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
    if (key === 'language' && after.language === null) continue
    out[key] = after[key]
  }
  return out as PostFields
}

export const isDirty = (base: PostForm, draft: PostForm): boolean => Object.keys(changes(base, draft)).length > 0

/** The form as loaded (`base`), as edited (`draft`), and the post it belongs to (null until a new post is created). */
export interface Editing { base: PostForm; draft: PostForm; post: PostDetail | null }

/**
 * The server's copy of the form (`fresh`) under the person's own edits: each
 * field they changed since `base` keeps their text, every other field takes
 * the server's. An AI answer, an action or a save that lands while they type
 * so never wipes what they typed.
 */
export function rebase(base: PostForm, draft: PostForm, fresh: PostForm): PostForm {
  const out = { ...fresh }
  for (const key of Object.keys(fresh) as (keyof PostForm)[]) {
    if (draft[key] !== base[key]) (out as Record<keyof PostForm, string>)[key] = draft[key]
  }
  return out
}

/** Whether a post version (`updated_at`) was saved after another. */
export const newer = (version: string, than: string): boolean => Date.parse(version) > Date.parse(than)

/** A new post as the server takes it: every field that holds something (the server sets the language from the brand). */
export function createBody(draft: PostForm): PostFields & { platform: Platform } {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(valuesOf(draft))) {
    if (value === null || (Array.isArray(value) && value.length === 0)) continue
    out[key] = value
  }
  return { ...(out as PostFields), platform: draft.platform }
}

const FIELDS: readonly (keyof PostForm)[] = ['platform', 'scheduled_date', 'scheduled_time', 'status', 'pillar_id', 'audience_id', 'language', 'topic', 'hook', 'main_copy', 'cta', 'hashtags']

/** The form fields a refused save names (Laravel's `errors`; `hashtags.0` is the hashtags field). */
export function invalidFields(fields: Record<string, string[]> | undefined): (keyof PostForm)[] {
  const named = new Set(Object.keys(fields ?? {}).map(name => name.split('.')[0]))
  return FIELDS.filter(key => named.has(key))
}
