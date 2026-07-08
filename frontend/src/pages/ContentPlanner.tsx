import { lazy, Suspense, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Calendar, FileText, LayoutDashboard, RefreshCw, Settings2, Sparkles, Target } from 'lucide-react'
import toast from 'react-hot-toast'
import { cp } from '../components/ContentPlanner/lib'

const Dashboard = lazy(() => import('../components/ContentPlanner/Dashboard').then(m => ({ default: m.Dashboard })))
const StrategyView = lazy(() => import('../components/ContentPlanner/StrategyView').then(m => ({ default: m.StrategyView })))
const CalendarView = lazy(() => import('../components/ContentPlanner/CalendarView').then(m => ({ default: m.CalendarView })))
const PostsView = lazy(() => import('../components/ContentPlanner/PostsView').then(m => ({ default: m.PostsView })))
const SetupWizard = lazy(() => import('../components/ContentPlanner/SetupWizard').then(m => ({ default: m.SetupWizard })))

type Tab = 'dashboard' | 'strategy' | 'calendar' | 'posts' | 'setup'

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'strategy',  label: 'Strategy',  icon: Target },
  { key: 'calendar',  label: 'Calendar',  icon: Calendar },
  { key: 'posts',     label: 'Posts',     icon: FileText },
  { key: 'setup',     label: 'Setup',     icon: Settings2 },
]

const fallback = <div className="text-center text-t-secondary py-10 text-sm">Loading…</div>

export function ContentPlanner() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [openPostId, setOpenPostId] = useState<number | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['cp-profile'],
    queryFn: cp.getProfile,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="max-w-md rounded-lg border border-red-500/40 bg-red-500/10 p-6">
        <div className="flex items-center gap-2 text-red-300 mb-2">
          <AlertTriangle size={16} />
          <p className="text-sm font-semibold">Failed to load the content planner</p>
        </div>
        <p className="text-xs text-red-200/70 mb-4">Check your connection and try again.</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-sm font-medium text-white transition-colors"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    )
  }

  if (!data.exists || !data.profile) {
    return (
      <Suspense fallback={fallback}>
        <SetupWizard
          detected={data.detected_knowledge}
          onComplete={() => queryClient.invalidateQueries({ queryKey: ['cp-profile'] })}
        />
      </Suspense>
    )
  }

  const profile = data.profile
  const readinessPct = data.readiness?.overall ?? profile.knowledge_score

  const onOpenPost = (id: number) => {
    setOpenPostId(id)
    setTab('posts')
  }
  const clearOpenPost = () => setOpenPostId(null)
  const onNavigate = (t: 'strategy' | 'calendar' | 'posts' | 'setup') => setTab(t)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <Sparkles size={26} className="text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">AI Content Planner</h1>
            {profile.name && <p className="text-xs text-t-secondary mt-0.5">{profile.name}</p>}
          </div>
        </div>
        {readinessPct != null && (
          <button
            onClick={() => setTab('setup')}
            title="Setup readiness — click to improve"
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            Readiness {readinessPct}%
          </button>
        )}
      </div>

      {/* Tab pills */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-dark-surface border-dark-border text-t-secondary hover:text-white hover:border-dark-border2'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      <Suspense fallback={fallback}>
        {tab === 'dashboard' && <Dashboard profile={profile} readiness={data.readiness} onNavigate={onNavigate} />}
        {tab === 'strategy' && <StrategyView profile={profile} />}
        {tab === 'calendar' && <CalendarView profile={profile} onOpenPost={onOpenPost} />}
        {tab === 'posts' && <PostsView profile={profile} openPostId={openPostId} clearOpenPost={clearOpenPost} />}
        {tab === 'setup' && (
          <SetupWizard
            existing={profile}
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['cp-profile'] })
              toast.success('Profile updated')
              setTab('dashboard')
            }}
          />
        )}
      </Suspense>
    </div>
  )
}
