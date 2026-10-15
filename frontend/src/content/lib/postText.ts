import type { PostCard, PostDetail } from './types'

/** What a card, a list row and Find call a post: its hook, else its title, else its topic; '' when it has none. */
export function cardLine(post: Pick<PostCard, 'hook' | 'title' | 'topic'>): string {
  return [post.hook, post.title, post.topic].map(v => (v ?? '').trim()).find(v => v !== '') ?? ''
}

/** The post as text to paste into a network: hook, text, call to action and hashtags, a blank line apart. */
export function copyText(post: Pick<PostDetail, 'hook' | 'main_copy' | 'cta' | 'hashtags'>): string {
  const tags = post.hashtags.map(tag => tag.trim()).filter(Boolean).map(tag => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')
  return [post.hook, post.main_copy, post.cta, tags].map(v => (v ?? '').trim()).filter(Boolean).join('\n\n')
}

/** Hashtags as typed (spaces or commas between them) → the list the server stores. */
export function parseHashtags(text: string): string[] {
  return text.split(/[\s,]+/).map(tag => tag.trim()).filter(Boolean)
}
