import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Star, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'

interface Question {
  id: number
  kind: string
  label: string
  options?: { choices?: string[] } | null
}

interface Submission {
  id: number
  overall_rating: number | null
  nps_score: number | null
  comment: string | null
  redirected_externally: boolean
  external_platform: string | null
  ip: string | null
  user_agent: string | null
  anonymous_name: string | null
  anonymous_email: string | null
  submitted_at: string
  answers: Record<string, any> | null
  form: { id: number; name: string; type: string; questions: Question[] }
  member: { id: number; user: { name: string; email: string | null }; tier: { name: string } | null } | null
  guest: { id: number; full_name: string; email: string | null } | null
  invitation: { channel: string; metadata: any } | null
}

export function ReviewDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data } = useQuery<{ submission: Submission }>({
    queryKey: ['review-submission', id],
    queryFn: () => api.get(`/v1/admin/reviews/submissions/${id}`).then(r => r.data),
  })

  const s = data?.submission
  if (!s) return <div className="p-8 text-[#a0a0a0]">Loading…</div>

  const who = s.member?.user.name ?? s.guest?.full_name ?? s.anonymous_name ?? 'Anonymous'
  const email = s.member?.user.email ?? s.guest?.email ?? s.anonymous_email

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <button onClick={() => navigate('/reviews')} className="flex items-center gap-2 text-[#a0a0a0] hover:text-white text-sm mb-4">
        <ArrowLeft size={16} /> Back to reviews
      </button>

      <div className="bg-dark-surface border border-dark-border rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[#a0a0a0] text-xs uppercase tracking-wider mb-1">{s.form.name}</div>
            <h1 className="text-2xl font-bold text-white">{who}</h1>
            {email && <div className="text-[#a0a0a0] text-sm mt-1">{email}</div>}
            {s.member?.tier && <span className="inline-block mt-2 px-2 py-0.5 rounded bg-[#1e1e1e] text-amber-300 text-xs font-semibold">{s.member.tier.name}</span>}
          </div>
          <div className="text-right">
            {s.overall_rating !== null && (
              <div className="flex gap-0.5 justify-end mb-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} size={22} className={i <= (s.overall_rating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-[#444]'} />
                ))}
              </div>
            )}
            {s.nps_score !== null && (
              <div className="text-2xl font-bold text-white">NPS {s.nps_score}</div>
            )}
            <div className="text-xs text-[#a0a0a0] mt-1">{new Date(s.submitted_at).toLocaleString()}</div>
          </div>
        </div>

        {s.comment && (
          <div className="bg-[#151515] rounded-lg p-4 border-l-4 border-primary-500 text-[#e5e5e5] italic">
            "{s.comment}"
          </div>
        )}
      </div>

      {s.answers && Object.keys(s.answers).length > 0 && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6 mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Answers</h2>
          <div className="space-y-4">
            {s.form.questions.map(q => {
              const value = s.answers?.[q.id] ?? s.answers?.[String(q.id)]
              if (value === undefined || value === null || value === '') return null
              return (
                <div key={q.id}>
                  <div className="text-xs text-[#a0a0a0] uppercase tracking-wider mb-1">{q.label}</div>
                  <div className="text-white">{renderAnswer(q, value)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-dark-surface border border-dark-border rounded-xl p-6 text-xs text-[#a0a0a0] space-y-2">
        {s.redirected_externally && (
          <div className="flex items-center gap-2 text-emerald-300">
            <ExternalLink size={12} /> Guest was redirected to {s.external_platform ?? 'external site'} to share publicly.
          </div>
        )}
        {s.invitation && <div>Invitation channel: <span className="text-white">{s.invitation.channel}</span></div>}
        {s.ip && <div>IP: <span className="text-white">{s.ip}</span></div>}
        {s.user_agent && <div className="truncate">User agent: <span className="text-white">{s.user_agent}</span></div>}
      </div>
    </div>
  )
}

function renderAnswer(q: Question, value: any): React.ReactNode {
  if (q.kind === 'stars' || q.kind === 'scale' || q.kind === 'nps') {
    return <span className="font-semibold">{String(value)}</span>
  }
  if (q.kind === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (q.kind === 'multi_choice' && Array.isArray(value)) {
    return value.join(', ')
  }
  return String(value)
}
