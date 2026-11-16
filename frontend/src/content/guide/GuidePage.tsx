import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, BookOpen, ChevronDown, Search } from 'lucide-react'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { PageHeader } from '../ui/PageHeader'
import { TASKS, GROUPS, ACTION_KEYS, filterTasks, guideActions } from './guideTasks'

export function GuidePage() {
  const { t } = useTranslation(), boot = useBoot(), api = useApi(), brand = useBrandId()
  const [search, setSearch] = useState(''), [group, setGroup] = useState('all')
  const media = useQuery({ queryKey: ['content', brand, 'media'], queryFn: api.media })
  const brandQuery = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand })
  const site = useQuery({ queryKey: ['content', brand, 'site'], queryFn: api.site, enabled: Boolean(boot.profile) })
  const words = Object.fromEntries(TASKS.map(task => [task.id, `${t(`content.guide.tasks.${task.id}.title`)} ${t(`content.guide.tasks.${task.id}.body`)}`]))
  const tasks = filterTasks(search, group, words)
  return <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6" data-content-guide="">
    <PageHeader title={t('content.guide.title', 'Content guide')} />
    <div className="rounded-2xl border border-a-border bg-a-surface p-5 sm:p-6">
      <BookOpen size={24} aria-hidden className="mb-3 text-a-accent-text" />
      <h2 className="text-xl font-semibold text-a-text">{t('content.guide.heading', 'From first idea to published post')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-a-text-2">{t('content.guide.intro', 'Choose a task for a short walkthrough, then continue in your workspace. Opening this guide never starts AI work or a website scan.')}</p>
      {!boot.profile?.setup_completed && <p className="mt-3 text-sm text-a-text">{t(boot.staff.can_manage ? 'content.guide.setup_manager' : 'content.guide.setup_staff')}</p>}
      {boot.profile && <div className="mt-3 flex flex-wrap gap-2">
        {brandQuery.data && !brandQuery.data.channels.some(channel => channel.active) && <Link to={boot.staff.can_manage ? '/content/brand?section=channels' : '/content/write/new'} className="rounded-lg border border-a-border px-3 py-2 text-sm text-a-accent-text">{t(boot.staff.can_manage ? 'content.guide.next_channels' : 'content.guide.next_manual')}</Link>}
        {site.data?.pages.length === 0 && boot.staff.can_manage && <Link to="/content/brand?section=website" className="rounded-lg border border-a-border px-3 py-2 text-sm text-a-accent-text">{t('content.guide.next_scan')}</Link>}
      </div>}
    </div>
    <div className="space-y-3">
      <label className="block text-sm font-medium text-a-text">{t('content.guide.search', 'Find a task')}
        <span className="relative mt-1 block"><Search size={16} aria-hidden className="absolute left-3 top-3 text-a-text-2" /><input type="search" className="w-full rounded-xl border border-a-border bg-a-surface py-2.5 pr-3 pl-10 text-sm text-a-text" value={search} onChange={e => setSearch(e.target.value)} /></span>
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('content.guide.filter', 'Filter tasks')}>{GROUPS.map(key => <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)} className={`rounded-full border px-3 py-1.5 text-sm ${group === key ? 'border-a-accent-text bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2'}`}>{t(`content.guide.groups.${key}`)}</button>)}</div>
    </div>
    <div className="grid gap-3" aria-live="polite">
      {tasks.map((task, index) => <details key={task.id} className="group rounded-xl border border-a-border bg-a-surface" open={search.trim() ? true : undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-4 text-a-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-a-accent-text">
          <span className="font-a-mono text-xs text-a-text-2">{String(index + 1).padStart(2, '0')}</span><h2 className="flex-1 text-sm font-semibold">{t(`content.guide.tasks.${task.id}.title`)}</h2><ChevronDown size={16} aria-hidden className="shrink-0 group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-a-border p-4 sm:pl-12">
          <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-a-text-2">{t(`content.guide.tasks.${task.id}.body`)}</p>
          {task.id === 'media' && <p className="text-xs text-a-text-2">{media.data ? t('content.launch.upload_limit', { mb: Math.floor(media.data.max_upload_bytes / 1048576 * 10) / 10 }) : t('content.guide.media_limit')}</p>}
          {(task.id === 'setup' && !boot.staff.can_manage) && <p className="text-sm text-a-text-2">{t('content.guide.setup_staff')}</p>}
          <div className="flex flex-wrap gap-2">{guideActions(task.id, boot.staff.can_manage).map(to => <Link key={to} to={to} className="inline-flex items-center gap-1.5 rounded-lg border border-a-border px-3 py-2 text-sm font-medium text-a-accent-text hover:bg-a-surface-2">{t(`content.guide.actions.${ACTION_KEYS[to]}`)}<ArrowUpRight size={14} aria-hidden /></Link>)}</div>
        </div>
      </details>)}
      {tasks.length === 0 && <p className="py-6 text-sm text-a-text-2">{t('content.guide.empty', 'No matching tasks. Try a different word or choose All.')}</p>}
    </div>
  </div>
}
