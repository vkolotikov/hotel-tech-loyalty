import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  Image,
  Loader,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { resolveImage } from '../../lib/api'
import {
  cp,
  errMsg,
  dateOnly,
  scorePct,
  FUNNEL_STAGES,
  PLATFORM_META,
  PLATFORMS,
  POST_TYPES,
  STATUS_META,
  WEEKDAY_ROLE_META,
  type PlannerProfile,
  type Post,
} from './lib'

/* Platform copy length guidance (soft limits, chars). */
const PLATFORM_MAX: Record<string, number> = {
  linkedin: 3000,
  instagram: 2200,
  x: 280,
  tiktok: 2200,
  facebook: 5000,
}

const REWRITE_TYPES: Record<string, string> = {
  shorter: 'Shorter',
  longer: 'Longer',
  professional: 'More professional',
  friendly: 'More friendly',
  alternative: 'Alternative angle',
}

/* Score keys where a LOWER value is better. */
const INVERTED_SCORES = ['repetition_risk', 'sales_pressure']

const inputCls =
  'w-full rounded-lg border border-dark-border bg-dark-surface2 px-3 py-2 text-sm text-white placeholder-t-secondary outline-none focus:border-violet-500'
const labelCls = 'mb-1 block text-xs font-medium text-t-secondary'
const cardCls = 'rounded-lg border border-dark-border bg-dark-surface p-4'

function statusBadge(status: string) {
  const meta = STATUS_META[status] ?? { label: status, color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' }
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      {meta.label}
    </span>
  )
}

function platformDot(platform: string, size = 8) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: PLATFORM_META[platform]?.color ?? '#9ca3af' }}
    />
  )
}

function qualityColor(overall: number): string {
  if (overall >= 7) return '#34d399'
  if (overall >= 5) return '#fbbf24'
  return '#f87171'
}

export function PostsView({
  profile,
  openPostId,
  clearOpenPost,
}: {
  profile: PlannerProfile
  openPostId: number | null
  clearOpenPost: () => void
}) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [statusTab, setStatusTab] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ platform: 'linkedin', topic: '', goal: '', scheduled_date: '' })

  // A post opened from the calendar arrives via prop; adopt it once then clear.
  useEffect(() => {
    if (openPostId != null) {
      setSelectedId(openPostId)
      clearOpenPost()
    }
  }, [openPostId, clearOpenPost])

  const { data: listResp, isLoading: listLoading } = useQuery({
    queryKey: ['cp-posts', 'list', profile.id],
    queryFn: () => cp.listPosts({ planner_profile_id: profile.id, per_page: 100 }),
  })
  const allPosts: Post[] = listResp?.data ?? []

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of allPosts) counts[p.status] = (counts[p.status] ?? 0) + 1
    return counts
  }, [allPosts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allPosts
      .filter(
        p =>
          (!statusTab || p.status === statusTab) &&
          (platformFilter.length === 0 || platformFilter.includes(p.platform)) &&
          (!q || (p.topic ?? '').toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const da = dateOnly(a.scheduled_date)
        const db = dateOnly(b.scheduled_date)
        if (da && db) return db.localeCompare(da)
        if (da) return -1 // dated first, undated last
        if (db) return 1
        return b.id - a.id
      })
  }, [allPosts, statusTab, platformFilter, search])

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ['cp-post', selectedId],
    queryFn: () => cp.getPost(selectedId as number),
    enabled: selectedId != null,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      cp.createPost({
        planner_profile_id: profile.id,
        platform: createForm.platform,
        topic: createForm.topic,
        goal: createForm.goal || undefined,
        scheduled_date: createForm.scheduled_date || undefined,
      }),
    onSuccess: (resp: { post?: Post; id?: number }) => {
      toast.success('Post created')
      queryClient.invalidateQueries({ queryKey: ['cp-posts'] })
      setShowCreate(false)
      setCreateForm({ platform: 'linkedin', topic: '', goal: '', scheduled_date: '' })
      const newId = resp?.post?.id ?? resp?.id
      if (newId) setSelectedId(newId)
    },
    onError: e => toast.error(errMsg(e)),
  })

  const channelPlatforms = useMemo(() => {
    const list = (profile.channels ?? []).filter(c => c.active).map(c => c.platform)
    return list.length > 0 ? list : PLATFORMS
  }, [profile.channels])

  const togglePlatform = (p: string) =>
    setPlatformFilter(f => (f.includes(p) ? f.filter(x => x !== p) : [...f, p]))

  return (
    <div className="flex h-full min-h-[70vh]">
      {/* ── Left: list panel ── */}
      <div
        className={`${selectedId != null ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-dark-border md:w-80`}
      >
        <div className="space-y-3 border-b border-dark-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Posts</h2>
            <button
              onClick={() => setShowCreate(s => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
            >
              <Plus size={13} />
              New post
            </button>
          </div>

          {showCreate && (
            <div className="space-y-2 rounded-lg border border-dark-border bg-dark-surface2/40 p-3">
              <select
                value={createForm.platform}
                onChange={e => setCreateForm({ ...createForm, platform: e.target.value })}
                className={inputCls}
              >
                {channelPlatforms.map(p => (
                  <option key={p} value={p}>{PLATFORM_META[p]?.label ?? p}</option>
                ))}
              </select>
              <input
                autoFocus
                value={createForm.topic}
                onChange={e => setCreateForm({ ...createForm, topic: e.target.value })}
                placeholder="Topic"
                className={inputCls}
              />
              <input
                value={createForm.goal}
                onChange={e => setCreateForm({ ...createForm, goal: e.target.value })}
                placeholder="Goal (optional)"
                className={inputCls}
              />
              <input
                type="date"
                value={createForm.scheduled_date}
                onChange={e => setCreateForm({ ...createForm, scheduled_date: e.target.value })}
                className={inputCls}
              />
              <button
                onClick={() => {
                  if (!createForm.topic.trim()) {
                    toast.error('Please enter a topic')
                    return
                  }
                  createMutation.mutate()
                }}
                disabled={createMutation.isPending}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
              >
                {createMutation.isPending ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
                Create
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setStatusTab('')}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                statusTab === '' ? 'bg-violet-600 text-white' : 'bg-dark-surface2 text-t-secondary hover:text-white'
              }`}
            >
              All{allPosts.length > 0 && ` · ${allPosts.length}`}
            </button>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setStatusTab(t => (t === key ? '' : key))}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  statusTab === key ? 'text-white' : 'bg-dark-surface2 text-t-secondary hover:text-white'
                }`}
                style={statusTab === key ? { backgroundColor: meta.color, color: '#0b0b0e' } : undefined}
              >
                {meta.label}
                {(statusCounts[key] ?? 0) > 0 && ` · ${statusCounts[key]}`}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            {Object.entries(PLATFORM_META).map(([key, meta]) => {
              const active = platformFilter.includes(key)
              return (
                <button
                  key={key}
                  onClick={() => togglePlatform(key)}
                  title={meta.label}
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors ${
                    active ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-dark-border text-t-secondary hover:text-white'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                  {meta.short}
                </button>
              )
            })}
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-t-secondary" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search topics…"
              className={`${inputCls} pl-8`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="flex justify-center py-10">
              <Loader size={18} className="animate-spin text-violet-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-t-secondary">No posts match your filters.</p>
          ) : (
            filtered.map(p => {
              const overall = p.quality_score?.overall
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`block w-full border-b border-dark-border px-4 py-3 text-left transition-colors hover:bg-dark-surface2/40 ${
                    selectedId === p.id ? 'bg-violet-500/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{p.topic || 'Untitled'}</p>
                    {typeof overall === 'number' && (
                      <span
                        title={`Quality ${overall}/10`}
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: qualityColor(overall) }}
                      />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-t-secondary">
                    {platformDot(p.platform, 7)}
                    <span>{PLATFORM_META[p.platform]?.label ?? p.platform}</span>
                    {dateOnly(p.scheduled_date) && <span>{dateOnly(p.scheduled_date)}</span>}
                    <span className="ml-auto">{statusBadge(p.status)}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right: editor panel ── */}
      <div className={`${selectedId != null ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {selectedId == null ? (
          <div className="flex flex-1 items-center justify-center p-10 text-center">
            <div>
              <Sparkles size={32} className="mx-auto mb-3 text-violet-400/60" />
              <p className="text-sm text-t-secondary">Select a post or create one</p>
            </div>
          </div>
        ) : postLoading || !post ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader size={22} className="animate-spin text-violet-400" />
          </div>
        ) : (
          <PostDetail
            key={post.id}
            post={post}
            onBack={() => setSelectedId(null)}
            onSelect={setSelectedId}
          />
        )}
      </div>
    </div>
  )
}

/* ─── Detail editor ──────────────────────────────────────────────── */

function PostDetail({
  post,
  onBack,
  onSelect,
}: {
  post: Post
  onBack: () => void
  onSelect: (id: number) => void
}) {
  const queryClient = useQueryClient()
  const [edits, setEdits] = useState<Partial<Post>>({})
  const [hashtagInput, setHashtagInput] = useState('')
  const [showRewrite, setShowRewrite] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [publishUrl, setPublishUrl] = useState('')
  const [copyGuidance, setCopyGuidance] = useState('')   // one-shot guidance for Generate copy + Rewrite
  const [imageGuidance, setImageGuidance] = useState('')  // one-shot guidance for image generation

  const cur: Post = { ...post, ...edits }
  const dirty = Object.keys(edits).length > 0
  const set = <K extends keyof Post>(key: K, value: Post[K]) => setEdits(e => ({ ...e, [key]: value }))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cp-posts'] })
    queryClient.invalidateQueries({ queryKey: ['cp-post', post.id] })
  }

  const saveMutation = useMutation({
    mutationFn: () => cp.updatePost(post.id, edits as Record<string, unknown>),
    onSuccess: () => {
      toast.success('Post saved')
      setEdits({})
      invalidate()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const generateMutation = useMutation({
    mutationFn: () => cp.generateCopy(post.id, copyGuidance.trim() || undefined),
    onSuccess: () => {
      toast.success('Copy generated')
      setEdits({})
      setCopyGuidance('')
      invalidate()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const rewriteMutation = useMutation({
    mutationFn: (type: string) => cp.generateAlternative(post.id, type, copyGuidance.trim() || undefined),
    onSuccess: () => {
      toast.success('Variation generated')
      setCopyGuidance('')
      invalidate()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const applyVariationMutation = useMutation({
    mutationFn: (copy: string) => cp.updatePost(post.id, { main_copy: copy }),
    onSuccess: () => {
      toast.success('Variation applied')
      setEdits(e => {
        const { main_copy: _dropped, ...rest } = e
        return rest
      })
      invalidate()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const visualBriefMutation = useMutation({
    mutationFn: () => cp.generateVisualBrief(post.id),
    onSuccess: () => {
      toast.success('Visual brief generated')
      invalidate()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const qualityMutation = useMutation({
    mutationFn: () => cp.qualityCheck(post.id),
    onSuccess: () => {
      toast.success('Quality check complete')
      invalidate()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const imageMutation = useMutation({
    mutationFn: () => cp.generateImage(post.id, imageGuidance.trim() || undefined),
    onSuccess: () => {
      toast.success('Image generated')
      setImageGuidance('')
      invalidate()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const duplicateMutation = useMutation({
    mutationFn: () => cp.duplicatePost(post.id),
    onSuccess: (resp: { post?: Post; id?: number }) => {
      toast.success('Post duplicated')
      queryClient.invalidateQueries({ queryKey: ['cp-posts'] })
      const newId = resp?.post?.id ?? resp?.id
      if (newId) onSelect(newId)
    },
    onError: e => toast.error(errMsg(e)),
  })

  const markReadyMutation = useMutation({
    mutationFn: () => cp.markReady(post.id),
    onSuccess: () => {
      toast.success('Marked as ready')
      invalidate()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const markPublishedMutation = useMutation({
    mutationFn: () => cp.markPublished(post.id, publishUrl.trim() || undefined),
    onSuccess: () => {
      toast.success('Marked as published')
      setShowPublish(false)
      setPublishUrl('')
      invalidate()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => cp.deletePost(post.id),
    onSuccess: () => {
      toast.success('Post deleted')
      queryClient.invalidateQueries({ queryKey: ['cp-posts'] })
      onBack()
    },
    onError: e => toast.error(errMsg(e)),
  })

  const aiPending =
    generateMutation.isPending || rewriteMutation.isPending || visualBriefMutation.isPending || qualityMutation.isPending || imageMutation.isPending

  const handleGenerateCopy = () => {
    const hasCopy = Boolean(cur.main_copy) || 'main_copy' in edits
    if (hasCopy && !window.confirm('Generating will overwrite the current copy. Continue?')) return
    generateMutation.mutate()
  }

  const addHashtag = () => {
    const raw = hashtagInput.trim().replace(/,+$/, '')
    if (!raw) return
    const tag = raw.startsWith('#') ? raw : `#${raw}`
    const tags = cur.hashtags ?? []
    if (!tags.includes(tag)) set('hashtags', [...tags, tag])
    setHashtagInput('')
  }

  const removeHashtag = (tag: string) => set('hashtags', (cur.hashtags ?? []).filter(t => t !== tag))

  const copyToClipboard = () => {
    const parts = [cur.hook, cur.main_copy].filter(Boolean)
    const tags = (cur.hashtags ?? []).join(' ')
    if (tags) parts.push(tags)
    navigator.clipboard
      .writeText(parts.join('\n\n'))
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Could not copy to clipboard'))
  }

  const maxLen = PLATFORM_MAX[cur.platform]
  const copyLen = (cur.main_copy ?? '').length
  const overMax = maxLen != null && copyLen > maxLen

  const hookAlternatives = post.source_context?.hook_alternatives ?? []
  const mechanic = cur.engagement_mechanic
  const hasStrategyContext = Boolean(cur.strategic_reason || post.pillar?.name || post.audience?.name || mechanic?.type)
  const brief = post.visual_brief
  const quality = post.quality_score
  const platformMeta = PLATFORM_META[cur.platform]

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Save bar */}
      {dirty && (
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-violet-500/40 bg-violet-500/15 px-4 py-2 backdrop-blur-sm">
          <p className="text-xs font-medium text-violet-200">Unsaved changes</p>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setEdits({})}
              className="rounded-lg border border-dark-border px-3 py-1 text-xs text-t-secondary hover:text-white"
            >
              Discard
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              {saveMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4 p-4 md:p-6">
        {/* a) Header */}
        <div className="space-y-3">
          <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 md:hidden">
            <ArrowLeft size={13} />
            Back to posts
          </button>
          <div className="flex items-center gap-3">
            <input
              value={cur.topic ?? ''}
              onChange={e => set('topic', e.target.value)}
              placeholder="Post topic"
              className="w-full flex-1 border-b border-transparent bg-transparent text-lg font-semibold text-white placeholder-t-secondary outline-none focus:border-violet-500"
            />
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: `${platformMeta?.color ?? '#9ca3af'}33` }}
            >
              {platformDot(cur.platform, 7)}
              {platformMeta?.label ?? cur.platform}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div>
              <label className={labelCls}>Status</label>
              <select value={cur.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                {Object.entries(STATUS_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                value={dateOnly(cur.scheduled_date) ?? ''}
                onChange={e => set('scheduled_date', e.target.value || null)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Time</label>
              <input
                type="time"
                value={(cur.scheduled_time ?? '').slice(0, 5)}
                onChange={e => set('scheduled_time', e.target.value || null)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Post type</label>
              <select value={cur.post_type ?? ''} onChange={e => set('post_type', e.target.value || null)} className={inputCls}>
                <option value="">—</option>
                {Object.entries(POST_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Funnel stage</label>
              <select value={cur.funnel_stage ?? ''} onChange={e => set('funnel_stage', e.target.value || null)} className={inputCls}>
                <option value="">—</option>
                {Object.entries(FUNNEL_STAGES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          {cur.weekday_role && WEEKDAY_ROLE_META[cur.weekday_role] && (
            <span
              className="inline-flex items-center rounded-full bg-dark-surface2 px-2.5 py-1 text-[11px] text-t-secondary"
              title={WEEKDAY_ROLE_META[cur.weekday_role].desc}
            >
              Day role: {WEEKDAY_ROLE_META[cur.weekday_role].label}
            </span>
          )}
        </div>

        {/* b) Strategy context */}
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-300">Strategy context</h3>
          {hasStrategyContext ? (
            <div className="space-y-2 text-sm">
              {cur.strategic_reason && <p className="text-white">{cur.strategic_reason}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-t-secondary">
                {post.pillar?.name && <span>Pillar: <span className="text-white">{post.pillar.name}</span></span>}
                {post.audience?.name && <span>Audience: <span className="text-white">{post.audience.name}</span></span>}
              </div>
              {mechanic?.type && (
                <p className="text-xs text-t-secondary">
                  Engagement · <span className="capitalize text-white">{mechanic.type.replace(/_/g, ' ')}</span>
                  {mechanic.instruction && <> — {mechanic.instruction}</>}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-t-secondary">Generate copy to fill strategy context.</p>
          )}
        </div>

        {/* c) Content */}
        <div className={`${cardCls} space-y-3`}>
          <div>
            <label className={labelCls}>Hook</label>
            <textarea
              value={cur.hook ?? ''}
              onChange={e => set('hook', e.target.value)}
              rows={2}
              placeholder="The first line that stops the scroll"
              className={inputCls}
            />
          </div>
          {hookAlternatives.length > 0 && (
            <div>
              <label className={labelCls}>Hook alternatives — click to use</label>
              <div className="flex flex-wrap gap-1.5">
                {hookAlternatives.map((alt, i) => (
                  <button
                    key={i}
                    onClick={() => set('hook', alt)}
                    className="max-w-full truncate rounded-full border border-dark-border bg-dark-surface2 px-2.5 py-1 text-left text-[11px] text-t-secondary transition-colors hover:border-violet-500 hover:text-white"
                    title={alt}
                  >
                    {alt}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-t-secondary">Main copy</label>
              <span className={`text-[11px] ${overMax ? 'font-medium text-amber-400' : 'text-t-secondary'}`}>
                {copyLen}{maxLen != null && ` / ${maxLen}`}
              </span>
            </div>
            <textarea
              value={cur.main_copy ?? ''}
              onChange={e => set('main_copy', e.target.value)}
              rows={10}
              placeholder="Post copy"
              className={`${inputCls} ${overMax ? 'border-amber-500/70' : ''}`}
            />
          </div>
          <div>
            <label className={labelCls}>Short copy</label>
            <textarea
              value={cur.short_copy ?? ''}
              onChange={e => set('short_copy', e.target.value)}
              rows={3}
              placeholder="Condensed version (stories, X, captions)"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>CTA</label>
            <input
              value={cur.cta ?? ''}
              onChange={e => set('cta', e.target.value)}
              placeholder="Call to action"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Hashtags</label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dark-border bg-dark-surface2 px-2 py-1.5">
              {(cur.hashtags ?? []).map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300">
                  {tag}
                  <button onClick={() => removeHashtag(tag)} className="hover:text-white">
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                value={hashtagInput}
                onChange={e => setHashtagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addHashtag()
                  }
                }}
                onBlur={addHashtag}
                placeholder={(cur.hashtags ?? []).length === 0 ? 'Add hashtag + Enter' : ''}
                className="min-w-24 flex-1 bg-transparent py-0.5 text-xs text-white placeholder-t-secondary outline-none"
              />
            </div>
          </div>
        </div>

        {/* e) AI actions */}
        <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-300">AI tools</p>
        <textarea
          value={copyGuidance}
          onChange={e => setCopyGuidance(e.target.value.slice(0, 1000))}
          disabled={aiPending}
          rows={2}
          placeholder="Optional guidance for Generate/Rewrite — e.g. “make it more casual and mention our free trial”"
          className="mb-2 w-full resize-none rounded-lg border border-dark-border bg-dark-surface2 px-3 py-2 text-xs text-white placeholder-t-secondary outline-none focus:border-violet-500"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleGenerateCopy}
            disabled={aiPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
          >
            {generateMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generateMutation.isPending ? 'Generating… (30–90s)' : 'Generate copy'}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowRewrite(s => !s)}
              disabled={aiPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-xs font-medium text-white transition-colors hover:border-violet-500/60 disabled:opacity-60"
            >
              {rewriteMutation.isPending ? <Loader size={14} className="animate-spin" /> : null}
              Rewrite
              <ChevronDown size={13} />
            </button>
            {showRewrite && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowRewrite(false)} />
                <div className="absolute left-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-lg border border-dark-border bg-dark-surface shadow-xl">
                  {Object.entries(REWRITE_TYPES).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setShowRewrite(false)
                        rewriteMutation.mutate(key)
                      }}
                      className="block w-full px-3 py-2 text-left text-xs text-t-secondary transition-colors hover:bg-dark-surface2 hover:text-white"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {aiPending && <span className="text-[11px] text-t-secondary">AI is working — this can take up to 90 seconds…</span>}
        </div>
        <p className="mt-2 text-[11px] text-t-secondary">
          <span className="text-white">Generate copy</span> writes the full post from your strategy · <span className="text-white">Rewrite</span> makes a different version of what's there.
        </p>
        </div>

        {/* f) Variations */}
        {(post.variations ?? []).length > 0 && (
          <div className={`${cardCls} space-y-3`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-t-secondary">Variations</h3>
            {(post.variations ?? []).map(v => (
              <div key={v.id} className="rounded-lg border border-dark-border bg-dark-surface2/40 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium capitalize text-violet-300">
                    {REWRITE_TYPES[v.variation_type] ?? v.variation_type}
                  </span>
                  <button
                    onClick={() => applyVariationMutation.mutate(v.copy)}
                    disabled={applyVariationMutation.isPending}
                    className="inline-flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
                  >
                    <Check size={11} />
                    Use this
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-xs text-t-secondary line-clamp-4">{v.copy}</p>
              </div>
            ))}
          </div>
        )}

        {/* g) Visual brief */}
        <div className={`${cardCls} space-y-3`}>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-t-secondary">
              <Image size={13} />
              Visual brief
            </h3>
            <button
              onClick={() => visualBriefMutation.mutate()}
              disabled={aiPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:border-violet-500/60 disabled:opacity-60"
            >
              {visualBriefMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Generate visual brief
            </button>
          </div>
          {brief ? (
            <>
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                {(
                  [
                    ['Type', brief.visual_type],
                    ['Aspect ratio', brief.aspect_ratio],
                    ['Style', brief.style],
                    ['Mood', brief.mood],
                    ['Scene', brief.scene],
                    ['Composition', brief.composition],
                    ['Text overlay', brief.text_overlay],
                    ['Avoid', brief.avoid],
                  ] as const
                )
                  .filter(([, v]) => Boolean(v))
                  .map(([label, value]) => (
                    <div key={label}>
                      <p className="mb-0.5 font-medium text-t-secondary">{label}</p>
                      <p className="text-white">{value}</p>
                    </div>
                  ))}
                {brief.description && (
                  <div className="sm:col-span-2">
                    <p className="mb-0.5 font-medium text-t-secondary">Description</p>
                    <p className="text-white">{brief.description}</p>
                  </div>
                )}
                {brief.video_script && (
                  <div className="sm:col-span-2">
                    <p className="mb-0.5 font-medium text-t-secondary">Video script</p>
                    <p className="whitespace-pre-wrap text-white">{brief.video_script}</p>
                  </div>
                )}
              </div>

              {/* AI image */}
              <div className="mt-3 border-t border-dark-border/60 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                    <Image size={13} /> AI image
                  </p>
                  <div className="flex items-center gap-2">
                    {brief.image_url && (
                      <a
                        href={resolveImage(brief.image_url) ?? brief.image_url}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:border-violet-500/60"
                      >
                        <Download size={12} /> Download
                      </a>
                    )}
                    <button
                      onClick={() => imageMutation.mutate()}
                      disabled={aiPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
                    >
                      {imageMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {imageMutation.isPending ? 'Generating…' : brief.image_url ? 'Regenerate' : 'Generate image'}
                    </button>
                  </div>
                </div>

                <input
                  value={imageGuidance}
                  onChange={e => setImageGuidance(e.target.value.slice(0, 800))}
                  disabled={aiPending}
                  placeholder="Optional image direction — e.g. “darker background, no people, more minimal”"
                  className="mt-2 w-full rounded-lg border border-dark-border bg-dark-surface2 px-3 py-2 text-xs text-white placeholder-t-secondary outline-none focus:border-violet-500"
                />

                {imageMutation.isPending ? (
                  <div className="mt-3 flex aspect-square max-w-sm items-center justify-center rounded-lg border border-dashed border-dark-border bg-dark-surface2/40">
                    <div className="text-center">
                      <Loader size={20} className="mx-auto animate-spin text-violet-400" />
                      <p className="mt-2 text-[11px] text-t-secondary">Creating your image… (up to a minute)</p>
                    </div>
                  </div>
                ) : brief.image_url ? (
                  <a href={resolveImage(brief.image_url) ?? brief.image_url} target="_blank" rel="noreferrer" className="group mt-3 block max-w-sm">
                    <img
                      src={resolveImage(brief.image_url) ?? brief.image_url}
                      alt="Generated visual for this post"
                      className="w-full rounded-lg border border-dark-border transition-opacity group-hover:opacity-90"
                      loading="lazy"
                    />
                    <p className="mt-1 text-[10px] text-t-secondary">
                      {brief.image_model ?? 'AI'} · click to open full size
                    </p>
                  </a>
                ) : brief.image_status === 'failed' ? (
                  <p className="mt-2 text-[11px] text-red-300">{brief.image_error || 'Image generation failed. Try again.'}</p>
                ) : (
                  <p className="mt-2 text-[11px] text-t-secondary">
                    Generate a ready-to-post image from this brief with OpenAI.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-t-secondary">No visual brief yet — generate one to guide design.</p>
          )}
        </div>

        {/* h) Quality */}
        <div className={`${cardCls} space-y-3`}>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-t-secondary">
              <ShieldCheck size={13} />
              Quality
            </h3>
            <button
              onClick={() => qualityMutation.mutate()}
              disabled={aiPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:border-violet-500/60 disabled:opacity-60"
            >
              {qualityMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Run quality check
            </button>
          </div>
          {quality && typeof quality.overall === 'number' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold" style={{ color: qualityColor(quality.overall) }}>
                  {quality.overall}
                </span>
                <span className="text-xs text-t-secondary">/ 10</span>
                {quality.verdict && (
                  <span
                    className="ml-auto rounded px-2 py-0.5 text-[11px] font-medium capitalize"
                    style={{
                      color: quality.verdict === 'good' ? '#34d399' : quality.verdict === 'weak' ? '#f87171' : '#fbbf24',
                      backgroundColor:
                        quality.verdict === 'good'
                          ? 'rgba(52,211,153,0.15)'
                          : quality.verdict === 'weak'
                            ? 'rgba(248,113,113,0.15)'
                            : 'rgba(251,191,36,0.15)',
                    }}
                  >
                    {quality.verdict.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {Object.entries(quality.scores ?? {}).map(([key, value]) => {
                  const inverted = INVERTED_SCORES.includes(key)
                  const good = inverted ? value <= 3 : value >= 7
                  const mid = inverted ? value <= 5 : value >= 5
                  const color = good ? '#34d399' : mid ? '#fbbf24' : '#f87171'
                  return (
                    <div key={key} className="flex items-center gap-2 text-[11px]">
                      <span className="w-36 shrink-0 capitalize text-t-secondary">
                        {key.replace(/_/g, ' ')}
                        {inverted && ' ↓'}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-dark-surface2">
                        <div className="h-full rounded-full" style={{ width: `${scorePct(value)}%`, backgroundColor: color }} />
                      </div>
                      <span className="w-6 text-right text-white">{value}</span>
                    </div>
                  )
                })}
              </div>
              {(quality.flags ?? []).length > 0 && (
                <ul className="space-y-1">
                  {(quality.flags ?? []).map((flag, i) => (
                    <li key={i} className="text-[11px] text-amber-400">⚑ {flag}</li>
                  ))}
                </ul>
              )}
              {(quality.improvements ?? []).length > 0 && (
                <ul className="space-y-1">
                  {(quality.improvements ?? []).map((imp, i) => (
                    <li key={i} className="text-[11px] text-t-secondary">• {imp}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-xs text-t-secondary">Not checked yet — run a quality check to score this post against your strategy.</p>
          )}
        </div>

        {/* i) Footer actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-dark-border pt-4">
          <button
            onClick={copyToClipboard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-white transition-colors hover:border-violet-500/60"
          >
            <Clipboard size={13} />
            Copy to clipboard
          </button>
          <button
            onClick={() => duplicateMutation.mutate()}
            disabled={duplicateMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-white transition-colors hover:border-violet-500/60 disabled:opacity-60"
          >
            {duplicateMutation.isPending ? <Loader size={13} className="animate-spin" /> : <Copy size={13} />}
            Duplicate
          </button>
          <button
            onClick={() => markReadyMutation.mutate()}
            disabled={markReadyMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 px-3 py-1.5 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-60"
          >
            {markReadyMutation.isPending ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
            Mark ready
          </button>
          {showPublish ? (
            <span className="inline-flex items-center gap-1.5">
              <input
                autoFocus
                value={publishUrl}
                onChange={e => setPublishUrl(e.target.value)}
                placeholder="Published URL (optional)"
                className="w-56 rounded-lg border border-dark-border bg-dark-surface2 px-2.5 py-1.5 text-xs text-white placeholder-t-secondary outline-none focus:border-violet-500"
              />
              <button
                onClick={() => markPublishedMutation.mutate()}
                disabled={markPublishedMutation.isPending}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {markPublishedMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                Confirm
              </button>
              <button onClick={() => setShowPublish(false)} className="text-t-secondary hover:text-white">
                <X size={14} />
              </button>
            </span>
          ) : (
            <button
              onClick={() => setShowPublish(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-white transition-colors hover:border-violet-500/60"
            >
              <Check size={13} />
              Mark published
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm('Delete this post? This cannot be undone.')) deleteMutation.mutate()
            }}
            disabled={deleteMutation.isPending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-500/50 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-60"
          >
            {deleteMutation.isPending ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
        {post.published_url && (
          <p className="text-[11px] text-t-secondary">
            Published at:{' '}
            <a href={post.published_url} target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-300">
              {post.published_url}
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
