import type { ContentApi } from '../lib/api'
import { parseHashtags } from '../lib/postText'
import type { BrandPayload, Platform, PostDetail, Template, TemplateFields, TemplateSuggestion } from '../lib/types'

/** A brand keeps at most this many templates (the server's ContentPlannerTemplate::MAX). */
export const MAX_TEMPLATES = 100

/** Each field's limit (the server's ContentRules::templateFields; spec 2026-10-16 §5.1). */
export const TEMPLATE_MAX = { name: 80, topic: 255, hook: 500, main_copy: 5000, cta: 255, tags: 30 } as const

/** The brand's templates, in the order they were made. */
export const templatesOf = (brand: BrandPayload | null): Template[] => brand?.templates ?? []

/** A template as its editor holds it: text, '' for "none", the hashtags as one line. */
export interface TemplateForm {
  name: string
  platform: Platform | ''
  pillar_name: string
  topic: string
  hook: string
  main_copy: string
  cta: string
  hashtags: string
}

export function templateForm(template: Template | TemplateSuggestion | null): TemplateForm {
  return {
    name: template?.name ?? '',
    platform: template?.platform ?? '',
    pillar_name: template?.pillar_name ?? '',
    topic: template?.topic ?? '',
    hook: template?.hook ?? '',
    main_copy: template?.main_copy ?? '',
    cta: template?.cta ?? '',
    hashtags: (template?.hashtags ?? []).join(' '),
  }
}

/** What the server would refuse, said first: no name, or more than 30 hashtags. */
export function templateProblem(form: TemplateForm): 'invalid' | 'too_many_tags' | null {
  if (form.name.trim() === '') return 'invalid'
  return parseHashtags(form.hashtags).length > TEMPLATE_MAX.tags ? 'too_many_tags' : null
}

/** Each field as the server takes it: trimmed, '' as null, the hashtags as a list. */
function fieldsOf(form: TemplateForm): Required<TemplateFields> {
  const text = (value: string) => (value.trim() === '' ? null : value.trim())
  return {
    name: form.name.trim(),
    platform: form.platform === '' ? null : form.platform,
    pillar_name: text(form.pillar_name),
    topic: text(form.topic),
    hook: text(form.hook),
    main_copy: text(form.main_copy),
    cta: text(form.cta),
    hashtags: parseHashtags(form.hashtags),
  }
}

/** What to send: every field for a new template, only what changed for one being edited (nothing for no change). */
export function templateBody(form: TemplateForm, original: Template | null): TemplateFields {
  const fields = fieldsOf(form)
  if (!original) return fields
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    const before = original[key as keyof TemplateFields]
    if (JSON.stringify(value) !== JSON.stringify(before)) out[key] = value
  }
  return out as TemplateFields
}

type SetTemplates = (templates: Template[]) => void

/** A new template, or an edit with only what changed (nothing sent for no change); the answer's list is kept. */
export async function saveTemplate(
  { api, setTemplates }: { api: Pick<ContentApi, 'createTemplate' | 'updateTemplate'>; setTemplates: SetTemplates },
  original: Template | null, form: TemplateForm,
): Promise<void> {
  const body = templateBody(form, original)
  if (original === null) {
    setTemplates((await api.createTemplate({ ...body, name: form.name.trim() })).templates)
    return
  }
  if (Object.keys(body).length === 0) return
  setTemplates((await api.updateTemplate(original.id, body)).templates)
}

export async function removeTemplate({ api, setTemplates }: { api: Pick<ContentApi, 'deleteTemplate'>; setTemplates: SetTemplates }, id: number): Promise<void> {
  setTemplates((await api.deleteTemplate(id)).templates)
}

/** The brand with a changed list of templates (every template endpoint answers the whole list). */
export const withTemplates = (brand: BrandPayload, templates: Template[]): BrandPayload => ({ ...brand, templates })

/** "Save as template" (spec §5.2): the post's words and platform, its pillar by name; the name is the topic, else the hook, cut to 80. */
export function templateFromPost(post: Pick<PostDetail, 'platform' | 'topic' | 'hook' | 'main_copy' | 'cta' | 'hashtags'>, pillarName: string | null): TemplateForm {
  const cut = (value: string | null, max: number) => (value ?? '').trim().slice(0, max)
  return {
    name: cut(post.topic, TEMPLATE_MAX.name) || cut(post.hook, TEMPLATE_MAX.name),
    platform: post.platform,
    pillar_name: pillarName ?? '',
    topic: cut(post.topic, TEMPLATE_MAX.topic),
    hook: cut(post.hook, TEMPLATE_MAX.hook),
    main_copy: cut(post.main_copy, TEMPLATE_MAX.main_copy),
    cta: cut(post.cta, TEMPLATE_MAX.cta),
    hashtags: post.hashtags.slice(0, TEMPLATE_MAX.tags).join(' '),
  }
}
