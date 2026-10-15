import { describe, expect, it } from 'vitest'
import { CalendarDays, FileText } from 'lucide-react'
import type { PostCard } from '../lib/types'
import { findActions, findGroups, iconOf, postOf, settledPosts } from './findItems'

const words = { newPost: 'New post', goTo: 'Go to', toDark: 'Switch to dark', toLight: 'Switch to light', collapse: 'Collapse menu', expand: 'Expand menu', shortcuts: 'Keyboard shortcuts' }
const nav = [{ to: '/content', label: 'Plan' }]
const post = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: null, status: 'draft',
  title: null, hook: `Hook ${id}`, topic: null, pillar_id: null, image_url: null, updated_at: 'x', ...more,
})
const labels = { actions: 'Actions', posts: 'Posts', untitled: 'Untitled post', unscheduled: 'Unscheduled', platform: (p: string) => p, day: (d: string) => `day ${d}` }

describe('findActions', () => {
  it('a new post, the pages, the other theme, the side panel only where there is one, and the shortcuts', () => {
    const light = findActions({ nav, dark: false, wide: true, slim: false, words })
    expect(light.map(a => a.label)).toEqual(['New post', 'Go to Plan', 'Switch to dark', 'Collapse menu', 'Keyboard shortcuts'])
    expect(light[1].go).toEqual({ to: '/content' })
    const phone = findActions({ nav, dark: true, wide: false, slim: true, words })
    expect(phone.map(a => a.label)).toEqual(['New post', 'Go to Plan', 'Switch to light', 'Keyboard shortcuts'])
  })
})

describe('findGroups', () => {
  const actions = findActions({ nav, dark: false, wide: true, slim: false, words })

  it('shows every action for an empty box, and only the matching ones (accents folded) as you type', () => {
    expect(findGroups({ query: '', actions, posts: [], labels })).toEqual([{ title: 'Actions', items: actions }])
    expect(findGroups({ query: 'PLAN', actions, posts: [], labels })[0].items.map(i => i.label)).toEqual(['Go to Plan'])
    const accented = [{ id: 'x', kind: 'page', label: 'Écrire', go: { to: '/x' } }]
    expect(findGroups({ query: 'ecr', actions: accented, posts: [], labels })[0].items).toHaveLength(1)
  })

  it('lists the posts the server found, with their platform and day (or Unscheduled)', () => {
    const groups = findGroups({ query: 'hook', actions, posts: [post(1), post(2, { scheduled_date: null, hook: null })], labels })
    const posts = groups.find(g => g.title === 'Posts')!.items
    expect(posts.map(p => [p.label, p.sub])).toEqual([['Hook 1', 'instagram · day 2026-10-07'], ['Untitled post', 'instagram · Unscheduled']])
    expect(postOf(posts[0].go)).toBe(1)
  })
})

describe('the rest', () => {
  it('opens a post only for a post choice; shows only the answer to the words in the box; draws each kind\'s icon', () => {
    expect(postOf({ run: 'post:12' })).toBe(12)
    expect(postOf({ run: 'theme' })).toBeNull()
    expect(postOf({ to: '/content' })).toBeNull()
    expect(settledPosts('aut', 'aut', [post(1)])).toHaveLength(1)
    expect(settledPosts('autu', 'aut', [post(1)])).toEqual([])
    expect(settledPosts('a', 'a', [post(1)])).toEqual([])
    expect(iconOf({ id: 'p', kind: 'post', label: '', go: { run: 'post:1' } })).toBe(FileText)
    expect(iconOf({ id: 'g', kind: 'page', label: '', go: { to: '/content' } })).toBe(CalendarDays)
  })
})
