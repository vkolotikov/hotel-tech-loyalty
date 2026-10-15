import { failureOf, type ContentApi } from '../lib/api'
import type { Audience, AudienceFields, BrandPayload, Channel, ChannelFields, Platform, Weekday } from '../lib/types'
import { asDays, asList, asText, changedFields, orNull } from './brandForms'

export interface AudienceForm {
  name: string; job_role: string; industry: string; country: string; business_size: string; language: string; description: string
  pain_points: string[]; goals: string[]; preferred_platforms: string[]; fears: string[]; objections: string[]; buying_triggers: string[]
  emotional_triggers: string[]; rational_triggers: string[]; questions: string[]; content_they_trust: string; desired_transformation: string
}

export const audienceForm = (a: Audience | null): AudienceForm => ({
  name: asText(a?.name), job_role: asText(a?.job_role), industry: asText(a?.industry), country: asText(a?.country),
  business_size: asText(a?.business_size), language: asText(a?.language), description: asText(a?.description),
  pain_points: asList(a?.pain_points), goals: asList(a?.goals), preferred_platforms: asList(a?.preferred_platforms),
  fears: asList(a?.fears), objections: asList(a?.objections), buying_triggers: asList(a?.buying_triggers),
  emotional_triggers: asList(a?.emotional_triggers), rational_triggers: asList(a?.rational_triggers), questions: asList(a?.questions),
  content_they_trust: asText(a?.content_they_trust), desired_transformation: asText(a?.desired_transformation),
})

export const audienceFields = (f: AudienceForm): AudienceFields => ({
  name: f.name.trim(), job_role: orNull(f.job_role), industry: orNull(f.industry), country: orNull(f.country),
  business_size: orNull(f.business_size), language: orNull(f.language), description: orNull(f.description),
  pain_points: f.pain_points, goals: f.goals, preferred_platforms: f.preferred_platforms, fears: f.fears, objections: f.objections,
  buying_triggers: f.buying_triggers, emotional_triggers: f.emotional_triggers, rational_triggers: f.rational_triggers, questions: f.questions,
  content_they_trust: orNull(f.content_they_trust), desired_transformation: orNull(f.desired_transformation),
})

export interface ChannelForm {
  platform: Platform; label: string; url: string; active: boolean; posts_per_week: string; days: Record<Weekday, boolean>; audience_id: string
  preferred_formats: string[]; emoji_policy: string; hashtag_policy: string; goal: string; role: string
  cta_style: string; visual_style: string; link_policy: string; tone_override: string; default_language: string
}

/** A channel as its form; a new one starts on Mon, Wed and Fri, three a week, named after its platform in the reader's words (`label`). */
export const channelForm = (c: Channel | null, platform: Platform, label?: string): ChannelForm => ({
  platform: c?.platform ?? platform, label: c ? asText(c.label) : label ?? platform, url: asText(c?.url), active: c ? c.active : true,
  posts_per_week: c ? (c.posts_per_week === null || c.posts_per_week === undefined ? '' : String(c.posts_per_week)) : '3',
  days: c ? asDays(c.frequency) : asDays({ mon: true, wed: true, fri: true }), audience_id: c?.audience_id ? String(c.audience_id) : '',
  preferred_formats: asList(c?.preferred_formats), emoji_policy: asText(c?.emoji_policy), hashtag_policy: asText(c?.hashtag_policy),
  goal: asText(c?.goal), role: asText(c?.role), cta_style: asText(c?.cta_style), visual_style: asText(c?.visual_style),
  link_policy: asText(c?.link_policy), tone_override: asText(c?.tone_override), default_language: asText(c?.default_language),
})

export const channelFields = (f: ChannelForm): ChannelFields => ({
  platform: f.platform, label: f.label.trim(), url: orNull(f.url), active: f.active,
  posts_per_week: f.posts_per_week.trim() === '' ? null : Math.max(0, Math.min(21, Math.round(Number(f.posts_per_week) || 0))),
  frequency: f.days, audience_id: f.audience_id === '' ? null : Number(f.audience_id), preferred_formats: f.preferred_formats,
  emoji_policy: orNull(f.emoji_policy), hashtag_policy: orNull(f.hashtag_policy), goal: orNull(f.goal), role: orNull(f.role),
  cta_style: orNull(f.cta_style), visual_style: orNull(f.visual_style), link_policy: orNull(f.link_policy),
  tone_override: orNull(f.tone_override), default_language: orNull(f.default_language),
})

type Adopt = (payload: BrandPayload) => void

/**
 * A new audience with everything it holds, or an edit by id with only what
 * changed since the form was opened (`base`; a change someone else made
 * meanwhile is not sent back); a person's edit is no longer the AI's assumption.
 */
export async function saveAudience(
  { api, adopt }: { api: Pick<ContentApi, 'createAudience' | 'updateAudience'>; adopt: Adopt },
  audience: Audience | null, form: AudienceForm, base: AudienceForm = audienceForm(audience),
): Promise<void> {
  if (audience === null) {
    adopt(await api.createAudience(audienceFields(form)))
    return
  }
  const fields: AudienceFields = changedFields(audienceFields(base), audienceFields(form))
  if (Object.keys(fields).length === 0) return
  adopt(await api.updateAudience(audience.id, audience.is_ai_assumed ? { ...fields, is_ai_assumed: false } : fields))
}

/**
 * Remove an audience; one that posts use answers 409 with their number, and
 * is removed only when `ask(posts)` says yes (null: kept). Any other refusal is passed on.
 */
export async function removeAudience(api: Pick<ContentApi, 'deleteAudience'>, id: number, ask: (posts: number) => boolean): Promise<BrandPayload | null> {
  try {
    return await api.deleteAudience(id, false)
  } catch (error) {
    const failure = failureOf(error)
    if (failure.code !== 'audience_in_use') throw error
    if (!ask(failure.posts ?? 0)) return null
    return api.deleteAudience(id, true)
  }
}

/** A new channel, or an edit by id with only what changed since the form was opened (`base`); either way the Plan and Posts are read again (slots follow channels). */
export async function saveChannel(
  { api, adopt, refresh }: { api: Pick<ContentApi, 'createChannel' | 'updateChannel'>; adopt: Adopt; refresh: () => void },
  channel: Channel | null, form: ChannelForm, base?: ChannelForm,
): Promise<void> {
  if (channel === null) {
    adopt(await api.createChannel(channelFields(form)))
  } else {
    const fields = changedFields(channelFields(base ?? channelForm(channel, channel.platform)), channelFields(form))
    if (Object.keys(fields).length === 0) return
    adopt(await api.updateChannel(channel.id, fields))
  }
  refresh()
}

export async function removeChannel(
  { api, adopt, refresh }: { api: Pick<ContentApi, 'deleteChannel'>; adopt: Adopt; refresh: () => void }, id: number,
): Promise<void> {
  adopt(await api.deleteChannel(id))
  refresh()
}
