export const TASKS = [
  { id: 'setup', group: 'start' }, { id: 'week', group: 'start' },
  { id: 'approvals', group: 'collaborate' }, { id: 'media', group: 'create' },
  { id: 'versions', group: 'create' }, { id: 'links', group: 'share' },
  { id: 'publish', group: 'share' }, { id: 'ai', group: 'create' }, { id: 'exports', group: 'share' },
] as const
export type GuideTask = typeof TASKS[number]['id']
export const GROUPS = ['all', 'start', 'create', 'collaborate', 'share'] as const
export function filterTasks(search: string, group: string, text: Record<string, string>) {
  const q = search.trim().toLocaleLowerCase()
  return TASKS.filter(task => (group === 'all' || task.group === group) && (text[task.id] ?? '').toLocaleLowerCase().includes(q))
}
export function guideActions(task: GuideTask, manager: boolean): string[] {
  switch (task) {
    case 'setup': return manager ? ['/content/brand?section=overview', '/content/settings', '/content/brand?section=channels', '/content/brand?section=rhythm'] : []
    case 'week': return ['/content/write/new', '/content']
    case 'approvals': return ['/content/posts?status=needs_review', '/content/settings', ...(manager ? ['/content/brand?section=dates'] : [])]
    case 'media': return ['/content/media', '/content/posts']
    case 'versions': return ['/content/posts']
    case 'links': return manager ? ['/content/brand?section=website', '/content/promote', '/content/brand?section=links'] : ['/content/promote', '/content/write/new']
    case 'publish': return ['/content/posts?status=ready_to_publish']
    case 'ai': return ['/content/write/new']
    case 'exports': return ['/content/posts']
  }
}
export const ACTION_KEYS: Record<string, string> = {
  '/content/brand?section=overview': 'brand', '/content/settings': 'settings', '/content/brand?section=channels': 'channels',
  '/content/brand?section=rhythm': 'rhythm', '/content/write/new': 'write', '/content': 'plan',
  '/content/posts?status=needs_review': 'review', '/content/brand?section=dates': 'approval_settings',
  '/content/media': 'media', '/content/posts': 'posts', '/content/brand?section=website': 'website',
  '/content/promote': 'promote', '/content/brand?section=links': 'links', '/content/posts?status=ready_to_publish': 'ready',
}
