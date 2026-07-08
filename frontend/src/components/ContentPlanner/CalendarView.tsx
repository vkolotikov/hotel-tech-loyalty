import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, Loader, Plus, Sparkles, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  cp,
  errMsg,
  dateOnly,
  fmtDateISO,
  PLATFORM_META,
  PLATFORMS,
  STATUS_META,
  WEEKDAY_ROLE_META,
  type PlannerProfile,
  type Post,
} from './lib'

/* ─── Date helpers (local to calendar) ───────────────────────────── */

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const GEN_STAGES = [
  'Reading your strategy…',
  'Balancing content pillars…',
  'Mapping weekday roles…',
  'Writing platform-native drafts…',
  'Checking against recent posts…',
]

type ViewMode = 'month' | 'week' | 'list'

interface QuickCreateState {
  date: string
  platform: string
  topic: string
  goal: string
}

export function CalendarView({ profile, onOpenPost }: { profile: PlannerProfile; onOpenPost: (id: number) => void }) {
  const queryClient = useQueryClient()
  const [view, setView] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [platformFilter, setPlatformFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null)
  const [genRange, setGenRange] = useState<'week' | 'month' | null>(null)
  const [genInstructions, setGenInstructions] = useState('')
  const [genFillEmpty, setGenFillEmpty] = useState(true)
  const [genStage, setGenStage] = useState(0)

  const todayStr = fmtDateISO(new Date())

  const channelPlatforms = useMemo(() => {
    const list = (profile.channels ?? []).filter(c => c.active).map(c => c.platform)
    return list.length > 0 ? list : PLATFORMS
  }, [profile.channels])

  /* ── Visible range ── */
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = addDays(startOfWeek(monthEnd), 6)
  const weekStart = startOfWeek(anchor)
  const weekEnd = addDays(weekStart, 6)

  const rangeFrom = view === 'week' ? weekStart : gridStart
  const rangeTo = view === 'week' ? weekEnd : gridEnd
  const fromStr = fmtDateISO(rangeFrom)
  const toStr = fmtDateISO(rangeTo)
  const monthKey = `${fromStr}_${toStr}`

  const { data: postsResp, isLoading } = useQuery({
    queryKey: ['cp-posts', 'calendar', profile.id, monthKey],
    queryFn: () => cp.listPosts({ planner_profile_id: profile.id, from: fromStr, to: toStr }),
  })
  const posts: Post[] = postsResp?.data ?? []

  const filteredPosts = useMemo(
    () =>
      posts.filter(
        p =>
          (platformFilter.length === 0 || platformFilter.includes(p.platform)) &&
          (!statusFilter || p.status === statusFilter),
      ),
    [posts, platformFilter, statusFilter],
  )

  const postsByDate = useMemo(() => {
    const map: Record<string, Post[]> = {}
    for (const p of filteredPosts) {
      const d = dateOnly(p.scheduled_date)
      if (!d) continue
      ;(map[d] = map[d] || []).push(p)
    }
    for (const d of Object.keys(map)) {
      map[d].sort((a, b) => (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99'))
    }
    return map
  }, [filteredPosts])

  const monthPostCount = useMemo(() => {
    const from = fmtDateISO(monthStart)
    const to = fmtDateISO(monthEnd)
    return posts.filter(p => {
      const d = dateOnly(p.scheduled_date)
      return d && d >= from && d <= to
    }).length
  }, [posts, monthStart, monthEnd])

  /* ── Navigation ── */
  const goPrev = () => {
    setExpandedDay(null)
    setQuickCreate(null)
    setAnchor(view === 'week' ? addDays(anchor, -7) : new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))
  }
  const goNext = () => {
    setExpandedDay(null)
    setQuickCreate(null)
    setAnchor(view === 'week' ? addDays(anchor, 7) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))
  }
  const goToday = () => {
    setExpandedDay(null)
    setQuickCreate(null)
    setAnchor(new Date())
  }

  const monthTitle = anchor.toLocaleString('default', { month: 'long', year: 'numeric' })
  const title =
    view === 'week'
      ? `${weekStart.toLocaleString('default', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleString('default', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : monthTitle

  /* ── Mutations ── */
  const createMutation = useMutation({
    mutationFn: (payload: QuickCreateState) =>
      cp.createPost({
        planner_profile_id: profile.id,
        platform: payload.platform,
        topic: payload.topic,
        goal: payload.goal || undefined,
        scheduled_date: payload.date,
      }),
    onSuccess: () => {
      toast.success('Post created')
      queryClient.invalidateQueries({ queryKey: ['cp-posts'] })
      setQuickCreate(null)
    },
    onError: e => toast.error(errMsg(e)),
  })

  const generateMutation = useMutation({
    mutationFn: (payload: { planner_profile_id: number; start_date: string; end_date: string; fill_empty_only: boolean; instructions?: string }) =>
      cp.generateCalendar(payload),
    onSuccess: (resp: { created_count?: number }) => {
      toast.success(`${resp?.created_count ?? 0} posts planned`)
      queryClient.invalidateQueries({ queryKey: ['cp-posts'] })
      setGenRange(null)
      setGenInstructions('')
    },
    onError: e => toast.error(errMsg(e)),
  })

  // Cycle the staged progress messages while the calendar generation runs.
  useEffect(() => {
    if (!generateMutation.isPending) return
    setGenStage(0)
    const timer = setInterval(() => setGenStage(s => (s + 1) % GEN_STAGES.length), 8000)
    return () => clearInterval(timer)
  }, [generateMutation.isPending])

  const genFrom = genRange === 'week' ? weekStart : monthStart
  const genTo = genRange === 'week' ? weekEnd : monthEnd

  const startGeneration = () => {
    generateMutation.mutate({
      planner_profile_id: profile.id,
      start_date: fmtDateISO(genFrom),
      end_date: fmtDateISO(genTo),
      fill_empty_only: genFillEmpty,
      instructions: genInstructions.trim() || undefined,
    })
  }

  const togglePlatform = (p: string) =>
    setPlatformFilter(f => (f.includes(p) ? f.filter(x => x !== p) : [...f, p]))

  const openQuickCreate = (date: string) => {
    setExpandedDay(null)
    setQuickCreate({ date, platform: channelPlatforms[0], topic: '', goal: '' })
  }

  /* ── Render helpers ── */

  const statusBadge = (status: string) => {
    const meta = STATUS_META[status] ?? { label: status, color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' }
    return (
      <span
        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
        style={{ color: meta.color, backgroundColor: meta.bg }}
      >
        {meta.label}
      </span>
    )
  }

  const platformDot = (platform: string, size = 8) => (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: PLATFORM_META[platform]?.color ?? '#9ca3af' }}
    />
  )

  const renderQuickCreate = (alignRight: boolean) => {
    if (!quickCreate) return null
    return (
      <div
        onClick={e => e.stopPropagation()}
        className={`absolute top-8 z-30 w-64 rounded-lg border border-dark-border bg-dark-surface p-3 shadow-xl space-y-2 ${alignRight ? 'right-0' : 'left-0'}`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-white">New post · {quickCreate.date}</p>
          <button onClick={() => setQuickCreate(null)} className="text-t-secondary hover:text-white">
            <X size={14} />
          </button>
        </div>
        <select
          value={quickCreate.platform}
          onChange={e => setQuickCreate({ ...quickCreate, platform: e.target.value })}
          className="w-full rounded bg-dark-input border border-dark-border px-2 py-1.5 text-xs text-white outline-none focus:border-violet-500"
        >
          {channelPlatforms.map(p => (
            <option key={p} value={p}>{PLATFORM_META[p]?.label ?? p}</option>
          ))}
        </select>
        <input
          autoFocus
          value={quickCreate.topic}
          onChange={e => setQuickCreate({ ...quickCreate, topic: e.target.value })}
          placeholder="Topic"
          className="w-full rounded bg-dark-input border border-dark-border px-2 py-1.5 text-xs text-white placeholder-t-secondary outline-none focus:border-violet-500"
        />
        <input
          value={quickCreate.goal}
          onChange={e => setQuickCreate({ ...quickCreate, goal: e.target.value })}
          placeholder="Goal (optional)"
          className="w-full rounded bg-dark-input border border-dark-border px-2 py-1.5 text-xs text-white placeholder-t-secondary outline-none focus:border-violet-500"
        />
        <button
          onClick={() => {
            if (!quickCreate.topic.trim()) {
              toast.error('Please enter a topic')
              return
            }
            createMutation.mutate(quickCreate)
          }}
          disabled={createMutation.isPending}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-violet-600 hover:bg-violet-700 disabled:opacity-60 px-2 py-1.5 text-xs font-medium text-white transition-colors"
        >
          {createMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
          Create
        </button>
      </div>
    )
  }

  const renderMonthGrid = () => {
    const days: Date[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d)

    return (
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map(d => (
          <div key={d} className="py-1.5 text-center text-xs font-semibold text-t-secondary">{d}</div>
        ))}
        {days.map((day, idx) => {
          const dateStr = fmtDateISO(day)
          const dayPosts = postsByDate[dateStr] ?? []
          const isToday = dateStr === todayStr
          const inMonth = day.getMonth() === anchor.getMonth()
          const isExpanded = expandedDay === dateStr
          const shown = isExpanded ? dayPosts : dayPosts.slice(0, 3)
          const alignRight = idx % 7 >= 4

          return (
            <div
              key={dateStr}
              onClick={() => openQuickCreate(dateStr)}
              className={`relative min-h-28 cursor-pointer rounded-lg border p-1.5 transition-colors ${
                inMonth
                  ? 'border-dark-border bg-dark-surface hover:border-violet-500/60'
                  : 'border-dark-border/50 bg-dark-input/30 hover:border-violet-500/40'
              }`}
            >
              <p
                className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                  isToday ? 'bg-violet-600 text-white ring-2 ring-violet-500/40' : inMonth ? 'text-white' : 'text-t-secondary'
                }`}
              >
                {day.getDate()}
              </p>
              <div className="space-y-1">
                {shown.map(post => {
                  const meta = STATUS_META[post.status] ?? { label: post.status, color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' }
                  return (
                    <button
                      key={post.id}
                      onClick={e => {
                        e.stopPropagation()
                        onOpenPost(post.id)
                      }}
                      title={`${PLATFORM_META[post.platform]?.label ?? post.platform} · ${post.topic ?? 'Untitled'} (${meta.label})`}
                      className="flex w-full items-center gap-1.5 rounded border px-1.5 py-0.5 text-left text-[11px] text-white hover:brightness-125"
                      style={{ borderColor: meta.color, backgroundColor: meta.bg }}
                    >
                      {platformDot(post.platform, 7)}
                      <span className="truncate">{post.topic || 'Untitled'}</span>
                    </button>
                  )
                })}
                {!isExpanded && dayPosts.length > 3 && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setExpandedDay(dateStr)
                    }}
                    className="w-full text-left text-[11px] font-medium text-violet-400 hover:text-violet-300"
                  >
                    +{dayPosts.length - 3} more
                  </button>
                )}
                {isExpanded && dayPosts.length > 3 && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setExpandedDay(null)
                    }}
                    className="w-full text-left text-[11px] font-medium text-t-secondary hover:text-white"
                  >
                    Show less
                  </button>
                )}
              </div>
              {quickCreate?.date === dateStr && renderQuickCreate(alignRight)}
            </div>
          )
        })}
      </div>
    )
  }

  const renderWeek = () => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i))

    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        {days.map(day => {
          const dateStr = fmtDateISO(day)
          const dayPosts = postsByDate[dateStr] ?? []
          const isToday = dateStr === todayStr
          return (
            <div key={dateStr} className={`rounded-lg border p-2 ${isToday ? 'border-violet-500/60 bg-violet-500/5' : 'border-dark-border bg-dark-surface'}`}>
              <p className={`mb-2 text-xs font-semibold ${isToday ? 'text-violet-300' : 'text-white'}`}>
                {day.toLocaleString('default', { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
              <div className="space-y-2">
                {dayPosts.length === 0 && <p className="py-3 text-center text-[11px] text-t-secondary">—</p>}
                {dayPosts.map(post => (
                  <button
                    key={post.id}
                    onClick={() => onOpenPost(post.id)}
                    className="block w-full rounded-lg border border-dark-border bg-dark-input/50 p-2 text-left transition-colors hover:border-violet-500/60"
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-t-secondary">
                      {platformDot(post.platform)}
                      <span>{PLATFORM_META[post.platform]?.label ?? post.platform}</span>
                      {post.scheduled_time && <span className="ml-auto">{post.scheduled_time.slice(0, 5)}</span>}
                    </div>
                    <p className="text-xs font-medium text-white">{post.topic || 'Untitled'}</p>
                    {post.hook && <p className="mt-1 text-[11px] text-t-secondary line-clamp-2">{post.hook}</p>}
                    <div className="mt-1.5">{statusBadge(post.status)}</div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderList = () => {
    const dates = Object.keys(postsByDate).sort()
    if (dates.length === 0) {
      return <p className="py-10 text-center text-sm text-t-secondary">No posts in this range.</p>
    }
    return (
      <div className="space-y-5">
        {dates.map(dateStr => {
          const day = new Date(`${dateStr}T00:00:00`)
          return (
            <div key={dateStr}>
              <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${dateStr === todayStr ? 'text-violet-300' : 'text-t-secondary'}`}>
                {day.toLocaleString('default', { weekday: 'long', day: 'numeric', month: 'long' })}
                {dateStr === todayStr && ' · Today'}
              </p>
              <div className="space-y-1.5">
                {postsByDate[dateStr].map(post => (
                  <button
                    key={post.id}
                    onClick={() => onOpenPost(post.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-left transition-colors hover:border-violet-500/60"
                  >
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium text-white"
                      style={{ backgroundColor: `${PLATFORM_META[post.platform]?.color ?? '#9ca3af'}33` }}
                    >
                      {platformDot(post.platform, 7)}
                      {PLATFORM_META[post.platform]?.label ?? post.platform}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{post.topic || 'Untitled'}</span>
                    {post.pillar?.name && (
                      <span className="hidden shrink-0 text-[11px] text-t-secondary md:inline">{post.pillar.name}</span>
                    )}
                    {post.weekday_role && WEEKDAY_ROLE_META[post.weekday_role] && (
                      <span className="hidden shrink-0 rounded bg-dark-input px-1.5 py-0.5 text-[10px] text-t-secondary lg:inline">
                        {WEEKDAY_ROLE_META[post.weekday_role].label}
                      </span>
                    )}
                    {statusBadge(post.status)}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const emptyMonth = !isLoading && view === 'month' && monthPostCount === 0

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <CalendarDays size={20} className="text-violet-400" />
          {title}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={goPrev} className="rounded-lg border border-dark-border p-1.5 text-t-secondary hover:text-white hover:border-violet-500/60">
            <ChevronLeft size={16} />
          </button>
          <button onClick={goToday} className="rounded-lg border border-dark-border px-2.5 py-1.5 text-xs text-t-secondary hover:text-white hover:border-violet-500/60">
            Today
          </button>
          <button onClick={goNext} className="rounded-lg border border-dark-border p-1.5 text-t-secondary hover:text-white hover:border-violet-500/60">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-dark-border">
          {(['month', 'week', 'list'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => {
                setView(v)
                setExpandedDay(null)
                setQuickCreate(null)
              }}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === v ? 'bg-violet-600 text-white' : 'bg-dark-surface text-t-secondary hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setGenRange('week')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
          >
            <Sparkles size={14} />
            Generate week
          </button>
          <button
            onClick={() => setGenRange('month')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
          >
            <Sparkles size={14} />
            Generate month
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(PLATFORM_META).map(([key, meta]) => {
          const active = platformFilter.includes(key)
          return (
            <button
              key={key}
              onClick={() => togglePlatform(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-dark-border text-t-secondary hover:text-white'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </button>
          )
        })}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="ml-auto rounded-lg border border-dark-border bg-dark-input px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-500"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader size={22} className="animate-spin text-violet-400" />
        </div>
      ) : emptyMonth ? (
        <div className="rounded-lg border border-dark-border bg-dark-surface px-6 py-16 text-center">
          <CalendarDays size={40} className="mx-auto mb-4 text-violet-400" />
          <h3 className="text-base font-semibold text-white">No content planned for {monthTitle} yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-t-secondary">
            Let the AI plan a strategic month of posts based on your brand, pillars, and weekly rhythm — or switch views to add posts by hand.
          </p>
          <button
            onClick={() => setGenRange('month')}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            <Sparkles size={16} />
            Generate month
          </button>
        </div>
      ) : view === 'month' ? (
        renderMonthGrid()
      ) : view === 'week' ? (
        renderWeek()
      ) : (
        renderList()
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-dark-border bg-dark-surface px-4 py-2.5">
        {Object.entries(PLATFORM_META).map(([key, meta]) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-t-secondary">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        ))}
        <span className="mx-1 hidden h-3 w-px bg-dark-border sm:inline-block" />
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-t-secondary">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        ))}
      </div>

      {/* Generate modal */}
      {genRange && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-dark-border bg-dark-surface p-5">
            {generateMutation.isPending ? (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <Loader size={18} className="animate-spin text-violet-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Planning your {genRange === 'week' ? 'week' : 'month'}…
                  </h3>
                </div>
                <div className="space-y-2">
                  {GEN_STAGES.map((stage, i) => (
                    <div
                      key={stage}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                        i === genStage ? 'bg-violet-500/15 text-violet-300' : 'text-t-secondary'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${i === genStage ? 'animate-pulse bg-violet-400' : 'bg-dark-border'}`} />
                      {stage}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-t-secondary">
                  This can take 1–5 minutes. Please keep this window open.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Sparkles size={16} className="text-violet-400" />
                    Generate {genRange === 'week' ? 'week' : 'month'}
                  </h3>
                  <button onClick={() => setGenRange(null)} className="text-t-secondary hover:text-white">
                    <X size={16} />
                  </button>
                </div>
                <p className="rounded-lg border border-dark-border bg-dark-input/50 px-3 py-2 text-xs text-t-secondary">
                  {genFrom.toLocaleString('default', { day: 'numeric', month: 'long' })} —{' '}
                  {genTo.toLocaleString('default', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white">Instructions (optional)</label>
                  <textarea
                    value={genInstructions}
                    onChange={e => setGenInstructions(e.target.value)}
                    rows={3}
                    placeholder="e.g. Focus on our new feature launch, keep Fridays light"
                    className="w-full rounded-lg border border-dark-border bg-dark-input px-3 py-2 text-xs text-white placeholder-t-secondary outline-none focus:border-violet-500"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-white">
                  <input
                    type="checkbox"
                    checked={genFillEmpty}
                    onChange={e => setGenFillEmpty(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-dark-border bg-dark-input accent-violet-600"
                  />
                  Only fill empty days
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setGenRange(null)}
                    className="rounded-lg border border-dark-border px-3 py-1.5 text-xs text-t-secondary hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startGeneration}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
                  >
                    <Sparkles size={14} />
                    Start
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
