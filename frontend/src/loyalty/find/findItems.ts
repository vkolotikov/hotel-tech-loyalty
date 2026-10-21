import type { LucideIcon } from 'lucide-react'
import { Keyboard, LayoutGrid, Moon, PanelLeft, ScanLine, Sun, User } from 'lucide-react'
import type { FindGroup } from '../../workspace/find/FindFrame'
import { fold, type FindItem, type FindTarget } from '../../workspace/find/findCore'
import type { WorkspaceNavItem } from '../../workspace/WorkspaceShell'
import { memberPath } from '../lib/links'
import type { MemberRow } from '../lib/types'

export interface ActionWords { scan: string; goTo: string; toDark: string; toLight: string; collapse: string; expand: string; shortcuts: string }

/** Find's actions (spec 2026-10-21 §4.8): Scan, the areas, the other theme, the side panel (from 1024 px), the list of shortcuts. */
export function findActions(p: { nav: Pick<WorkspaceNavItem, 'to' | 'label'>[]; dark: boolean; wide: boolean; slim: boolean; words: ActionWords }): FindItem[] {
  return [
    { id: 'scan', kind: 'scan', label: p.words.scan, go: { to: '/loyalty/scan' } },
    ...p.nav.map(n => ({ id: `page:${n.to}`, kind: 'page', label: `${p.words.goTo} ${n.label}`, go: { to: n.to } })),
    { id: 'theme', kind: p.dark ? 'light' : 'dark', label: p.dark ? p.words.toLight : p.words.toDark, go: { run: 'theme' } },
    ...(p.wide ? [{ id: 'rail', kind: 'rail', label: p.slim ? p.words.expand : p.words.collapse, go: { run: 'rail' } }] : []),
    { id: 'shortcuts', kind: 'shortcuts', label: p.words.shortcuts, go: { run: 'shortcuts' } },
  ]
}

/** Find's groups: the actions whose words match (all of them for an empty box), then the members the server found. */
export function findGroups({ query, actions, members, labels }: {
  query: string
  actions: FindItem[]
  members: MemberRow[]
  labels: { actions: string; members: string; points: (n: number) => string }
}): FindGroup<FindItem>[] {
  const q = fold(query.trim())
  const matching = q === '' ? actions : actions.filter(a => fold(a.label).includes(q))
  const groups: FindGroup<FindItem>[] = []
  if (matching.length > 0) groups.push({ title: labels.actions, items: matching })
  if (members.length > 0) {
    groups.push({
      title: labels.members,
      items: members.map(m => ({
        id: `member:${m.id}`,
        kind: 'member',
        label: m.name || m.email || m.member_number || `#${m.id}`,
        sub: [m.member_number, labels.points(m.points)].filter(Boolean).join(' · '),
        go: { to: memberPath(m.id) },
      })),
    })
  }
  return groups
}

/** Only the answer to the words now in the box: an earlier search's members would sit under words they do not match. */
export function settledMembers(typed: string, asked: string, found: MemberRow[] | undefined): MemberRow[] {
  return typed.length >= 2 && typed === asked ? (found ?? []) : []
}

export function iconOf(item: FindItem): LucideIcon {
  switch (item.kind) {
    case 'scan': return ScanLine
    case 'page': return LayoutGrid
    case 'dark': return Moon
    case 'light': return Sun
    case 'rail': return PanelLeft
    case 'shortcuts': return Keyboard
    default: return User
  }
}

/** What a choice does that is not a page: the look's two, the list of shortcuts. */
export type FindRun = 'theme' | 'rail' | 'shortcuts'
export const runOf = (target: FindTarget): FindRun | null => ('run' in target ? (target.run as FindRun) : null)
