import { copyText, parseHashtags } from '../lib/postText'
import type { PostForm } from '../panel/panelState'

export const captionLimit = (platform: string): number | null => ({ x: 280, instagram: 2200, tiktok: 2200, linkedin: 3000, youtube: 5000, facebook: 63206 }[platform] ?? null)
export const defaultDestination = (platform: string) => !['instagram', 'tiktok'].includes(platform)
export function safeChannel(url: string | null | undefined): string | null {
  if (!url) return null
  try { return ['http:', 'https:'].includes(new URL(url).protocol) ? url : null } catch { return null }
}
export function caption(form: PostForm, destination: string | null, include: boolean): string {
  const text = copyText({ ...form, hashtags: parseHashtags(form.hashtags) })
  if (!include || !destination || text.split(/\s+/).includes(destination)) return text
  return [text, destination].filter(Boolean).join('\n\n')
}
