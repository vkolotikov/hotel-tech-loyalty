import type { PillarRef, Template } from '../lib/types'
import type { NewDraft } from './PanelProvider'
import type { PostForm } from './panelState'

/** A blank (spec 2026-10-16 §5.1): "[" + 1–40 characters with no bracket or line break + "]". */
export const BLANK = /\[[^[\]\r\n]{1,40}\]/g

/** The fields that hold words: blanks are looked for there, and only there is text "replaced". */
const WORDS = ['topic', 'hook', 'main_copy', 'cta'] as const
type Words = Pick<PostForm, (typeof WORDS)[number]>

/** The blanks still in the topic, hook, text and call to action: each once, in the order it first appears. */
export function blanksIn(form: Words): string[] {
  const seen: string[] = []
  for (const key of WORDS) {
    for (const blank of form[key].match(BLANK) ?? []) if (!seen.includes(blank)) seen.push(blank)
  }
  return seen
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/** A template keeps its pillar by name (spec §5.1): the active strategy's active pillar of that name, else none (''). */
export function pillarIdByName(name: string | null, pillars: readonly PillarRef[]): string {
  if (!name) return ''
  const pillar = pillars.find(p => p.active && sameName(p.name, name))
  return pillar ? String(pillar.id) : ''
}

/** The words a template puts in a new post: its fields ('' where it has none), its hashtags as one line, its pillar by name. */
export function templateFields(template: Template, pillars: readonly PillarRef[]): NonNullable<NewDraft['fields']> {
  return {
    topic: template.topic ?? '',
    hook: template.hook ?? '',
    main_copy: template.main_copy ?? '',
    cta: template.cta ?? '',
    hashtags: template.hashtags.join(' '),
    pillar_id: pillarIdByName(template.pillar_name, pillars),
  }
}

/** Whether the template would replace words already written in the topic, hook, text or call to action (then the panel asks). */
export function replacesText(form: Words, template: Template): boolean {
  return WORDS.some(key => {
    const written = form[key].trim()
    const theirs = (template[key] ?? '').trim()
    return written !== '' && theirs !== '' && written !== theirs
  })
}

/**
 * The panel's Template menu (spec §5.3): the template's words replace the fields it has and the rest stay as written;
 * its platform and its pillar too where it names them (a pillar the active strategy lacks leaves the post's).
 */
export function applyTemplate(form: PostForm, template: Template, pillars: readonly PillarRef[]): PostForm {
  const pick = (key: (typeof WORDS)[number]) => {
    const theirs = template[key] ?? ''
    return theirs.trim() !== '' ? theirs : form[key]
  }
  const pillar = pillarIdByName(template.pillar_name, pillars)
  return {
    ...form,
    platform: template.platform ?? form.platform,
    pillar_id: pillar !== '' ? pillar : form.pillar_id,
    topic: pick('topic'),
    hook: pick('hook'),
    main_copy: pick('main_copy'),
    cta: pick('cta'),
    hashtags: template.hashtags.length > 0 ? template.hashtags.join(' ') : form.hashtags,
  }
}
