import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Star, Plus, Trash2, ExternalLink, Copy, Edit3, Link as LinkIcon } from 'lucide-react'
import { api, API_URL } from '../lib/api'

type Tab = 'submissions' | 'invitations' | 'forms' | 'integrations'

interface Form {
  id: number
  name: string
  type: 'basic' | 'custom'
  is_active: boolean
  is_default: boolean
  embed_key: string
  questions_count: number
  submissions_count: number
  config: Record<string, any>
}

interface Submission {
  id: number
  form_id: number
  overall_rating: number | null
  nps_score: number | null
  comment: string | null
  redirected_externally: boolean
  external_platform: string | null
  submitted_at: string
  form: { id: number; name: string; type: string }
  member: { user: { name: string } } | null
  guest: { full_name: string } | null
  anonymous_name: string | null
}

interface Integration {
  id: number
  platform: string
  display_name: string | null
  write_review_url: string
  is_enabled: boolean
}

interface Stats {
  avg_rating: number
  total: number
  nps: number
  distribution: Record<string, number>
  funnel: { invited: number; opened: number; submitted: number; redirected: number }
  timeline: Array<{ day: string; count: number; avg: number }>
}

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google',
  trustpilot: 'Trustpilot',
  tripadvisor: 'TripAdvisor',
  facebook: 'Facebook',
}

export function Reviews() {
  const [tab, setTab] = useState<Tab>('submissions')

  const { data: stats } = useQuery<Stats>({
    queryKey: ['review-stats'],
    queryFn: () => api.get('/v1/admin/reviews/stats').then(r => r.data),
  })

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reviews</h1>
          <p className="text-[#a0a0a0] text-sm mt-1">Collect guest feedback and route happy customers to public review sites.</p>
        </div>
      </div>

      {stats && <StatsRow stats={stats} />}

      <div className="flex gap-1 bg-[#1e1e1e] p-1 rounded-lg text-sm mb-4 w-fit">
        {(['submissions', 'invitations', 'forms', 'integrations'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md font-semibold capitalize transition-colors ${tab === t ? 'bg-primary-500 text-white' : 'text-[#a0a0a0] hover:text-white'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'submissions' && <SubmissionsTab />}
      {tab === 'invitations' && <InvitationsTab />}
      {tab === 'forms' && <FormsTab />}
      {tab === 'integrations' && <IntegrationsTab />}
    </div>
  )
}

function StatsRow({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <StatCard label="Avg Rating" value={stats.avg_rating.toFixed(2) + '★'} sub={`${stats.total} submissions · 30d`} />
      <StatCard label="NPS" value={String(stats.nps)} sub="Promoters − Detractors" />
      <StatCard label="Submit Rate" value={stats.funnel.invited > 0 ? `${Math.round(stats.funnel.submitted / stats.funnel.invited * 100)}%` : '—'} sub={`${stats.funnel.submitted} / ${stats.funnel.invited} invited`} />
      <StatCard label="External Redirects" value={String(stats.funnel.redirected)} sub="routed to Google etc." />
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="text-[#a0a0a0] text-xs uppercase tracking-wider mb-2">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-[#a0a0a0] mt-1">{sub}</div>
    </div>
  )
}

// ─── Submissions Tab ─────────────────────────────────────────────────────

function SubmissionsTab() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<{ rating?: number; redirected?: 'yes' | 'no' }>({})

  const { data } = useQuery<{ data: Submission[] }>({
    queryKey: ['review-submissions', filter],
    queryFn: () => api.get('/v1/admin/reviews/submissions', { params: filter }).then(r => r.data),
  })
  const subs = data?.data ?? []

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-dark-border flex gap-2 flex-wrap">
        <select
          value={filter.rating ?? ''}
          onChange={e => setFilter(f => ({ ...f, rating: e.target.value ? Number(e.target.value) : undefined }))}
          className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-1.5 text-xs text-white"
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} stars</option>)}
        </select>
        <select
          value={filter.redirected ?? ''}
          onChange={e => setFilter(f => ({ ...f, redirected: (e.target.value || undefined) as any }))}
          className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-1.5 text-xs text-white"
        >
          <option value="">Any redirect state</option>
          <option value="yes">Redirected externally</option>
          <option value="no">Kept internal</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#151515] text-[#a0a0a0] text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">Who</th>
              <th className="text-left p-3">Form</th>
              <th className="text-left p-3">Rating</th>
              <th className="text-left p-3">Comment</th>
              <th className="text-left p-3">Redirect</th>
              <th className="text-left p-3">When</th>
            </tr>
          </thead>
          <tbody>
            {subs.length === 0 && (
              <tr><td colSpan={6} className="p-10 text-center text-[#666]">No submissions yet.</td></tr>
            )}
            {subs.map(s => (
              <tr key={s.id} onClick={() => navigate(`/reviews/submissions/${s.id}`)} className="border-t border-dark-border hover:bg-[#151515] cursor-pointer">
                <td className="p-3 text-white">{s.member?.user.name ?? s.guest?.full_name ?? s.anonymous_name ?? 'Anonymous'}</td>
                <td className="p-3 text-[#a0a0a0] text-xs">{s.form.name}</td>
                <td className="p-3">
                  {s.overall_rating ? <StarDisplay value={s.overall_rating} /> : s.nps_score !== null ? <span className="text-white">NPS {s.nps_score}</span> : <span className="text-[#666]">—</span>}
                </td>
                <td className="p-3 text-[#a0a0a0] text-xs max-w-md truncate">{s.comment ?? '—'}</td>
                <td className="p-3 text-xs">
                  {s.redirected_externally ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300"><ExternalLink size={12} /> {PLATFORM_LABELS[s.external_platform ?? ''] ?? 'External'}</span>
                  ) : <span className="text-[#666]">—</span>}
                </td>
                <td className="p-3 text-[#a0a0a0] text-xs">{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={14} className={i <= value ? 'fill-amber-400 text-amber-400' : 'text-[#444]'} />
      ))}
    </div>
  )
}

// ─── Forms Tab ───────────────────────────────────────────────────────────

function FormsTab() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  const { data } = useQuery<{ forms: Form[] }>({
    queryKey: ['review-forms'],
    queryFn: () => api.get('/v1/admin/reviews/forms').then(r => r.data),
  })
  const forms = data?.forms ?? []

  const createMut = useMutation({
    mutationFn: (payload: { name: string; type: 'basic' | 'custom' }) =>
      api.post('/v1/admin/reviews/forms', payload).then(r => r.data),
    onSuccess: ({ form }) => {
      qc.invalidateQueries({ queryKey: ['review-forms'] })
      setShowCreate(false)
      navigate(`/reviews/forms/${form.id}`)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/reviews/forms/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-forms'] })
      toast.success('Form deleted')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Delete failed'),
  })

  const defaultForm = forms.find(f => f.is_default)
  const publicUrl = (form: Form) => `${API_URL}/review/${form.id}?key=${form.embed_key}`

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-primary-600 transition-colors"
        >
          <Plus size={16} /> New Form
        </button>
      </div>

      <div className="grid gap-3">
        {forms.map(f => (
          <div key={f.id} className="bg-dark-surface border border-dark-border rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-white font-semibold">{f.name}</h3>
                <span className="px-2 py-0.5 rounded bg-[#1e1e1e] text-[#a0a0a0] text-[10px] uppercase tracking-wider">{f.type}</span>
                {f.is_default && <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] uppercase tracking-wider">Default</span>}
                {!f.is_active && <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 text-[10px] uppercase tracking-wider">Inactive</span>}
              </div>
              <div className="text-xs text-[#a0a0a0] mt-1">
                {f.type === 'custom' ? `${f.questions_count ?? 0} questions` : 'Single rating'} · {f.submissions_count ?? 0} submissions
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-[#666]">
                <LinkIcon size={12} />
                <span className="truncate">{publicUrl(f)}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(publicUrl(f)); toast.success('Link copied') }}
                  className="text-primary-400 hover:text-primary-300"
                  title="Copy public link"
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => navigate(`/reviews/forms/${f.id}`)}
                className="border border-dark-border text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-dark-surface2 transition-colors flex items-center gap-1"
              >
                <Edit3 size={12} /> Edit
              </button>
              {!f.is_default && (
                <button
                  onClick={() => confirm(`Delete "${f.name}"? Submissions will be kept but unlinked.`) && deleteMut.mutate(f.id)}
                  className="border border-red-500/30 text-red-300 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
        {forms.length === 0 && (
          <div className="bg-dark-surface border border-dark-border rounded-xl p-10 text-center text-[#666]">No forms yet.</div>
        )}
      </div>

      {defaultForm && (
        <div className="mt-4 text-xs text-[#666]">
          The default form "<span className="text-[#a0a0a0]">{defaultForm.name}</span>" is used for automated post-stay invitations.
        </div>
      )}

      {showCreate && <CreateFormModal onClose={() => setShowCreate(false)} onCreate={createMut.mutate} pending={createMut.isPending} />}
    </div>
  )
}

function CreateFormModal({ onClose, onCreate, pending }: { onClose: () => void; onCreate: (p: { name: string; type: 'basic' | 'custom' }) => void; pending: boolean }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'basic' | 'custom'>('basic')

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-surface border border-dark-border rounded-xl w-full max-w-md">
        <div className="p-5 border-b border-dark-border">
          <h2 className="text-lg font-bold text-white">New Review Form</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-2">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Spa Experience"
              className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType('basic')}
              className={`p-3 rounded-lg border text-left transition-colors ${type === 'basic' ? 'border-primary-500 bg-primary-500/10' : 'border-dark-border bg-[#1e1e1e]'}`}
            >
              <div className="font-semibold text-white text-sm">Basic rating</div>
              <div className="text-xs text-[#a0a0a0] mt-1">Stars + comment, threshold redirect</div>
            </button>
            <button
              onClick={() => setType('custom')}
              className={`p-3 rounded-lg border text-left transition-colors ${type === 'custom' ? 'border-primary-500 bg-primary-500/10' : 'border-dark-border bg-[#1e1e1e]'}`}
            >
              <div className="font-semibold text-white text-sm">Custom form</div>
              <div className="text-xs text-[#a0a0a0] mt-1">Multi-question survey</div>
            </button>
          </div>
        </div>
        <div className="p-5 border-t border-dark-border flex gap-2 justify-end">
          <button onClick={onClose} className="border border-dark-border text-[#a0a0a0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors">Cancel</button>
          <button
            onClick={() => name.trim() && onCreate({ name: name.trim(), type })}
            disabled={!name.trim() || pending}
            className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-primary-600 transition-colors"
          >
            {pending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Integrations Tab ────────────────────────────────────────────────────

function IntegrationsTab() {
  const qc = useQueryClient()
  const { data } = useQuery<{ integrations: Integration[]; platforms: string[] }>({
    queryKey: ['review-integrations'],
    queryFn: () => api.get('/v1/admin/reviews/integrations').then(r => r.data),
  })
  const platforms = data?.platforms ?? []
  const integrations = data?.integrations ?? []

  const upsertMut = useMutation({
    mutationFn: (payload: Partial<Integration> & { platform: string }) =>
      api.post('/v1/admin/reviews/integrations', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-integrations'] })
      toast.success('Saved')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#a0a0a0] mb-2">
        When a basic-form rating meets the form's threshold, the reviewer is asked if they'd like to share on a public platform.
        Configure your public review URLs here.
      </p>
      {platforms.map(p => {
        const existing = integrations.find(i => i.platform === p)
        return <IntegrationRow key={p} platform={p} existing={existing} onSave={(payload) => upsertMut.mutate(payload)} />
      })}
    </div>
  )
}

function IntegrationRow({ platform, existing, onSave }: { platform: string; existing?: Integration; onSave: (p: any) => void }) {
  const [url, setUrl] = useState(existing?.write_review_url ?? '')
  const [enabled, setEnabled] = useState(existing?.is_enabled ?? true)

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4 flex items-center gap-3">
      <div className="w-28 shrink-0">
        <div className="text-white font-semibold">{PLATFORM_LABELS[platform] ?? platform}</div>
      </div>
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://g.page/.../review"
        className="flex-1 bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <label className="flex items-center gap-2 text-xs text-[#a0a0a0] cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        Enabled
      </label>
      <button
        onClick={() => url && onSave({ platform, write_review_url: url, is_enabled: enabled })}
        disabled={!url}
        className="bg-primary-500 text-white px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 hover:bg-primary-600 transition-colors"
      >
        Save
      </button>
    </div>
  )
}

// ─── Invitations Tab ─────────────────────────────────────────────────────
interface Invitation {
  id: number
  channel: string
  status: 'pending' | 'opened' | 'submitted' | 'redirected' | 'failed'
  sent_at: string | null
  opened_at: string | null
  submitted_at: string | null
  form: { id: number; name: string; type: string } | null
  guest: { id: number; full_name: string; email: string | null } | null
  member: { id: number; user: { name: string; email: string | null } } | null
  submission: { id: number; overall_rating: number | null } | null
}

interface FunnelCounts {
  pending: number
  opened: number
  submitted: number
  redirected: number
  failed: number
}

function InvitationsTab() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<string>('')

  const { data: funnel } = useQuery<FunnelCounts>({
    queryKey: ['review-invitations-funnel'],
    queryFn: () => api.get('/v1/admin/reviews/invitations/funnel').then(r => r.data),
  })

  const { data } = useQuery<{ data: Invitation[] }>({
    queryKey: ['review-invitations', statusFilter],
    queryFn: () => api.get('/v1/admin/reviews/invitations', {
      params: statusFilter ? { status: statusFilter } : {},
    }).then(r => r.data),
  })

  const invitations = data?.data ?? []
  const total = funnel ? funnel.pending + funnel.opened + funnel.submitted + funnel.redirected + funnel.failed : 0
  const openRate = total > 0 && funnel ? Math.round(((funnel.opened + funnel.submitted + funnel.redirected) / total) * 100) : 0
  const submitRate = total > 0 && funnel ? Math.round(((funnel.submitted + funnel.redirected) / total) * 100) : 0

  return (
    <div className="space-y-4">
      {funnel && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <FunnelStat label="Sent" value={total} tone="default" />
          <FunnelStat label="Opened" value={funnel.opened + funnel.submitted + funnel.redirected} sub={`${openRate}%`} tone="blue" />
          <FunnelStat label="Submitted" value={funnel.submitted + funnel.redirected} sub={`${submitRate}%`} tone="green" />
          <FunnelStat label="Redirected" value={funnel.redirected} tone="amber" />
          <FunnelStat label="Failed" value={funnel.failed} tone="red" />
        </div>
      )}

      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-1.5 text-sm text-white"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="opened">Opened</option>
          <option value="submitted">Submitted</option>
          <option value="redirected">Redirected</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#151515] text-[#a0a0a0]">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Recipient</th>
              <th className="text-left px-4 py-3 font-semibold">Form</th>
              <th className="text-left px-4 py-3 font-semibold">Channel</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Sent</th>
              <th className="text-left px-4 py-3 font-semibold">Result</th>
            </tr>
          </thead>
          <tbody>
            {invitations.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-[#666]">No invitations yet.</td></tr>
            )}
            {invitations.map(inv => {
              const name = inv.member?.user.name ?? inv.guest?.full_name ?? '—'
              const email = inv.member?.user.email ?? inv.guest?.email
              return (
                <tr key={inv.id} className="border-t border-dark-border">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{name}</div>
                    {email && <div className="text-xs text-[#a0a0a0]">{email}</div>}
                  </td>
                  <td className="px-4 py-3 text-[#e5e5e5]">{inv.form?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-[#a0a0a0] capitalize">{inv.channel}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3 text-[#a0a0a0]">{inv.sent_at ? new Date(inv.sent_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">
                    {inv.submission ? (
                      <button
                        onClick={() => navigate(`/reviews/submissions/${inv.submission!.id}`)}
                        className="text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1"
                      >
                        {inv.submission.overall_rating ? `${inv.submission.overall_rating}★` : 'View'}
                      </button>
                    ) : (
                      <span className="text-[#666]">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FunnelStat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone: 'default' | 'blue' | 'green' | 'amber' | 'red' }) {
  const color = {
    default: 'text-white',
    blue:    'text-blue-300',
    green:   'text-emerald-300',
    amber:   'text-amber-300',
    red:     'text-red-300',
  }[tone]
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="text-xs text-[#a0a0a0] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
      {sub && <div className="text-xs text-[#a0a0a0] mt-0.5">{sub}</div>}
    </div>
  )
}

function StatusBadge({ status }: { status: Invitation['status'] }) {
  const styles: Record<Invitation['status'], string> = {
    pending:    'bg-[#1e1e1e] text-[#a0a0a0]',
    opened:     'bg-blue-500/15 text-blue-300',
    submitted:  'bg-emerald-500/15 text-emerald-300',
    redirected: 'bg-amber-500/15 text-amber-300',
    failed:     'bg-red-500/15 text-red-300',
  }
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${styles[status]}`}>{status}</span>
}
