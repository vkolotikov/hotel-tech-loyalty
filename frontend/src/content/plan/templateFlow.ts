import { failureOf, type ContentApi } from '../lib/api'
import { suggestedTimes } from '../lib/bestTimes'
import type { Channel, DateKey, PillarRef, Platform, PostDetail, PostFields, Slot, Template } from '../lib/types'
import type { NewDraft, PanelApi } from '../panel/PanelProvider'
import { templateFields } from '../panel/templateApply'
import { newPostDraft, usualTimes } from './addMath'

/**
 * "From a template… → Use" (spec 2026-10-16 §5.3): a new post on the day — the template's platform, else the day's first
 * open slot's, else the brand's first channel — at that channel's usual time, filled with the template (its pillar by name).
 */
export function templateDraft(
  day: DateKey, template: Template, slots: readonly Slot[], channels: readonly Channel[], industry: string | null | undefined, pillars: readonly PillarRef[],
): NewDraft {
  const base = newPostDraft(day, slots, channels, industry)
  const time = template.platform
    ? usualTimes(channels, industry)[template.platform] ?? suggestedTimes(template.platform, industry)[0] ?? null
    : base.time ?? null
  return { date: day, platform: template.platform ?? base.platform, time, fields: templateFields(template, pillars) }
}

/** What "Write with AI" works with: the calls, a way to keep a post the server answered with, and the panel. */
export interface TemplateFlow {
  api: Pick<ContentApi, 'createPost' | 'write'>
  /** Puts the post into the panel's cache and reads the lists again. */
  keep: (post: PostDetail) => void
  panel: Pick<PanelApi, 'guard' | 'open' | 'noteWriting'>
}

/**
 * "Write with AI", first half: the new post is made and kept, marked as being written, and opened in the panel. The
 * panel asks first about edits it holds; kept, nothing is made (null) — no post the person never sees open.
 */
export async function startPost(flow: TemplateFlow, body: PostFields & { platform: Platform }): Promise<PostDetail | null> {
  if (!flow.panel.guard()) return null
  const { post } = await flow.api.createPost(body)
  flow.keep(post)
  flow.panel.noteWriting(post.id, { failed: null })
  flow.panel.open(post.id)
  return post
}

/** Second half: the AI writes the post following the template; the panel takes its answer, or learns why it stopped. */
export async function writeInto(flow: TemplateFlow, postId: number, templateId: number): Promise<void> {
  try {
    const { post } = await flow.api.write(postId, null, templateId)
    flow.keep(post)
    // Only this post's note: another post may still be written from its template.
    flow.panel.noteWriting(postId, null)
  } catch (e) {
    flow.panel.noteWriting(postId, { failed: failureOf(e).code })
  }
}
