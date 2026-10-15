import type { LucideIcon } from 'lucide-react'
import { CalendarDays, FileText, Keyboard, Moon, PanelLeft, Plus, Sun } from 'lucide-react'
import type { FindGroup } from '../../workspace/find/FindFrame'
import { fold, type FindItem, type FindTarget } from '../../workspace/find/findCore'
import type { WorkspaceNavItem } from '../../workspace/WorkspaceShell'
import { cardLine } from '../lib/postText'
import type { DateKey, Platform, PostCard } from '../lib/types'

export interface ActionWords { newPost: string; goTo: string; toDark: string; toLight: string; collapse: string; expand: string; shortcuts: string }

/** Find's actions (spec §4.7): a new post, the pages, the other theme, the side panel (from 1024 px), the list of shortcuts. */
export function findActions(p: { nav: Pick<WorkspaceNavItem, 'to' | 'label'>[]; dark: boolean; wide: boolean; slim: boolean; words: ActionWords }): FindItem[] {
  return [
    { id: 'new', kind: 'new', label: p.words.newPost, go: { run: 'new' } },
    ...p.nav.map(n => ({ id: `page:${n.to}`, kind: 'page', label: `${p.words.goTo} ${n.label}`, go: { to: n.to } })),
    { id: 'theme', kind: p.dark ? 'light' : 'dark', label: p.dark ? p.words.toLight : p.words.toDark, go: { run: 'theme' } },
    ...(p.wide ? [{ id: 'rail', kind: 'rail', label: p.slim ? p.words.expand : p.words.collapse, go: { run: 'rail' } }] : []),
    { id: 'shortcuts', kind: 'shortcuts', label: p.words.shortcuts, go: { run: 'shortcuts' } },
  ]
}

export interface FindLabels {
  actions: string
  posts: string
  untitled: string
  unscheduled: string
  platform: (platform: Platform) => string
  day: (date: DateKey) => string
}

/** Find's groups: the actions whose words match (all of them for an empty box), then the posts the server found. */
export function findGroups({ query, actions, posts, labels }: { query: string; actions: FindItem[]; posts: PostCard[]; labels: FindLabels }): FindGroup<FindItem>[] {
  const q = fold(query.trim())
  const matching = q === '' ? actions : actions.filter(a => fold(a.label).includes(q))
  const groups: FindGroup<FindItem>[] = []
  if (matching.length > 0) groups.push({ title: labels.actions, items: matching })
  if (posts.length > 0) {
    groups.push({
      title: labels.posts,
      items: posts.map(post => ({
        id: `post:${post.id}`,
        kind: 'post',
        label: cardLine(post) || labels.untitled,
        sub: `${labels.platform(post.platform)} · ${post.scheduled_date ? labels.day(post.scheduled_date) : labels.unscheduled}`,
        go: { run: `post:${post.id}` },
      })),
    })
  }
  return groups
}

/** The post a Find choice opens, or null for any other choice. */
export function postOf(target: FindTarget): number | null {
  if (!('run' in target)) return null
  const match = /^post:(\d+)$/.exec(target.run)
  return match ? Number(match[1]) : null
}

/** Only the answer to the words now in the box: an earlier search's posts would sit under words they do not match. */
export function settledPosts(typed: string, asked: string, found: PostCard[] | undefined): PostCard[] {
  return typed.length >= 2 && typed === asked ? (found ?? []) : []
}

export function iconOf(item: FindItem): LucideIcon {
  switch (item.kind) {
    case 'page': return CalendarDays
    case 'new': return Plus
    case 'dark': return Moon
    case 'light': return Sun
    case 'rail': return PanelLeft
    case 'shortcuts': return Keyboard
    default: return FileText
  }
}
