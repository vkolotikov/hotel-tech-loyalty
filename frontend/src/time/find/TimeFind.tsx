import { useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Mic, Moon, PanelLeft, Plus, Search, Sparkles, Sun, User, type LucideIcon } from 'lucide-react'
import type { WorkspaceNavItem } from '../../workspace/WorkspaceShell'
import { FindFrame, type FindGroup } from '../../workspace/find/FindFrame'
import { fold, type FindItem, type FindTarget } from '../../workspace/find/findCore'
import { usePeople } from '../lib/queries'

interface Hit extends FindItem { icon?: LucideIcon }

/** What Find can run beyond going somewhere: the frame's own runs, and the planner's quick actions. */
export type TimeRun = 'theme' | 'rail' | 'shortcuts' | 'new-task' | 'capture'

/**
 * HexaTech Time Planner's Find on the shared frame: the actions (a new task, AI capture, plan my day), the team's people
 * (their day on the planner), and the areas. Nothing is drawn, and nothing fetched, while it is closed.
 */
export function TimeFind(props: {
  open: boolean
  onClose: () => void
  onRun: (target: FindTarget) => void
  nav: WorkspaceNavItem[]
  dark: boolean
  slim: boolean
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  if (!props.open) return null
  return <FindPanel {...props} />
}

function FindPanel({ onClose, onRun, nav, dark, slim, fallbackFocus }: Parameters<typeof TimeFind>[0]) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const people = usePeople().data?.people ?? []
  const typed = query.trim()
  const matches = (label: string) => typed === '' || fold(label).includes(fold(typed))

  const actions: Hit[] = [
    { id: 'new-task', kind: 'action', label: t('time.find.new_task', 'Add a task'), go: { run: 'new-task' }, icon: Plus },
    { id: 'capture', kind: 'action', label: t('time.find.capture', 'Add tasks with AI (text or voice)'), go: { run: 'capture' }, icon: Mic },
    { id: 'plan', kind: 'action', label: t('time.find.plan', 'Plan my day with AI'), go: { to: '/time/plan?ai=me' }, icon: Sparkles },
    ...nav.map(item => ({ id: `go-${item.to}`, kind: 'action', label: item.label, sub: t('time.find.go_to', 'Go to'), go: { to: item.to }, icon: item.icon })),
    { id: 'theme', kind: 'action', label: dark ? t('time.find.theme_light', 'Switch to light') : t('time.find.theme_dark', 'Switch to dark'), go: { run: 'theme' }, icon: dark ? Sun : Moon },
    { id: 'rail', kind: 'action', label: slim ? t('workspace.shell.expand', 'Expand menu') : t('workspace.shell.collapse', 'Collapse menu'), go: { run: 'rail' }, icon: PanelLeft },
  ].filter(item => matches(item.label))

  const team: Hit[] = typed.length >= 1
    ? people.filter(p => matches(p.name)).slice(0, 6).map(p => ({
      id: `person-${p.key}`, kind: 'person', label: p.name, sub: t('time.find.their_day', 'Their day'),
      go: { to: `/time/plan?person=${encodeURIComponent(p.key)}` }, icon: User,
    }))
    : []
  const groups: FindGroup<Hit>[] = [
    { title: t('time.find.people', 'People'), items: team },
    { title: t('time.find.actions', 'Actions'), items: actions.slice(0, typed ? 8 : 14) },
  ].filter(group => group.items.length > 0)

  return (
    <FindFrame prompt={t('time.shell.find', 'Find a person or an action')} query={query} onQuery={setQuery}
      groups={groups} iconOf={item => item.icon ?? (item.kind === 'person' ? CalendarClock : Search)}
      onPick={(item) => { onRun(item.go); onClose() }}
      onShortcuts={() => { onRun({ run: 'shortcuts' }); onClose() }}
      onClose={onClose}
      waiting={null}
      fallbackFocus={fallbackFocus} />
  )
}
