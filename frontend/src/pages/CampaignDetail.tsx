import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Mail, Bell, Eye, Users, CheckCircle2, XCircle, Search } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../lib/api'

interface Recipient {
  id: number
  channel: 'push' | 'email'
  status: 'sent' | 'failed'
  email: string | null
  sent_at: string | null
  opened_at: string | null
  open_count: number
  error: string | null
  member: { id: number; name: string; email: string | null; tier: string | null } | null
}

interface Detail {
  campaign: {
    id: number
    name: string
    title: string
    body: string
    channel: string
    status: string
    sent_at: string | null
    scheduled_at: string | null
    created_at: string
    email_subject: string | null
    email_sent_count: number
    sent_count: number
    opened_count: number
  }
  push: { sent: number; failed: number }
  email: { sent: number; failed: number; opened: number; total_opens: number; open_rate: number }
  timeline: Array<{ hour: string; opens: number }>
  recipients: Recipient[]
}

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'all' | 'opened' | 'unopened' | 'failed'>('all')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<Detail>({
    queryKey: ['campaign', id],
    queryFn: () => api.get(`/v1/admin/campaigns/${id}`).then(r => r.data),
    refetchInterval: 15_000,
  })

  const filtered = useMemo(() => {
    const rs = data?.recipients ?? []
    const q = search.trim().toLowerCase()
    return rs.filter(r => {
      if (tab === 'opened' && !r.opened_at) return false
      if (tab === 'unopened' && (r.opened_at || r.channel !== 'email' || r.status !== 'sent')) return false
      if (tab === 'failed' && r.status !== 'failed') return false
      if (!q) return true
      return (
        (r.member?.name ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.member?.tier ?? '').toLowerCase().includes(q)
      )
    })
  }, [data, tab, search])

  if (isLoading || !data) {
    return <div className="p-8 text-[#a0a0a0]">Loading…</div>
  }

  const c = data.campaign

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <button
        onClick={() => navigate('/notifications')}
        className="flex items-center gap-2 text-[#a0a0a0] hover:text-white text-sm mb-4"
      >
        <ArrowLeft size={16} /> Back to campaigns
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{c.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-dark-surface2 text-[#a0a0a0] border border-dark-border">{c.channel}</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{c.status}</span>
            {c.sent_at && <span className="text-[#a0a0a0]">sent {new Date(c.sent_at).toLocaleString()}</span>}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Users size={18} />} label="Recipients" value={data.recipients.length} />
        <StatCard icon={<Bell size={18} />} label="Push Delivered" value={data.push.sent} sub={data.push.failed ? `${data.push.failed} failed` : ''} />
        <StatCard icon={<Mail size={18} />} label="Emails Delivered" value={data.email.sent} sub={data.email.failed ? `${data.email.failed} failed` : ''} />
        <StatCard icon={<Eye size={18} />} label="Open Rate" value={`${data.email.open_rate}%`} sub={`${data.email.opened}/${data.email.sent} opened · ${data.email.total_opens} total`} />
      </div>

      {/* Open timeline */}
      {data.timeline.length > 0 && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Opens over time</h3>
            <span className="text-xs text-[#a0a0a0]">Bucketed per hour</span>
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={data.timeline} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="hour" stroke="#666" tick={{ fill: '#a0a0a0', fontSize: 11 }} tickFormatter={v => v.slice(5, 13)} />
                <YAxis stroke="#666" tick={{ fill: '#a0a0a0', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                <Bar dataKey="opens" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recipients */}
      <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-dark-border flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-1 bg-[#1e1e1e] p-1 rounded-lg text-xs">
            {(['all', 'opened', 'unopened', 'failed'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md font-semibold capitalize transition-colors ${tab === t ? 'bg-primary-500 text-white' : 'text-[#a0a0a0] hover:text-white'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, tier"
              className="bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#151515] text-[#a0a0a0] text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left p-3 font-semibold">Recipient</th>
                <th className="text-left p-3 font-semibold">Channel</th>
                <th className="text-left p-3 font-semibold">Status</th>
                <th className="text-left p-3 font-semibold">Sent</th>
                <th className="text-left p-3 font-semibold">Opened</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-[#666]">No recipients match.</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-dark-border hover:bg-[#151515]">
                  <td className="p-3">
                    <div className="text-white font-medium">{r.member?.name ?? '—'}</div>
                    <div className="text-[#a0a0a0] text-xs">{r.email ?? r.member?.email ?? '—'}{r.member?.tier ? ` · ${r.member.tier}` : ''}</div>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${r.channel === 'email' ? 'bg-blue-500/15 text-blue-300' : 'bg-purple-500/15 text-purple-300'}`}>
                      {r.channel === 'email' ? <Mail size={11} /> : <Bell size={11} />} {r.channel}
                    </span>
                  </td>
                  <td className="p-3">
                    {r.status === 'sent' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300 text-xs"><CheckCircle2 size={12} /> Delivered</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-300 text-xs" title={r.error ?? ''}><XCircle size={12} /> Failed</span>
                    )}
                  </td>
                  <td className="p-3 text-[#a0a0a0] text-xs">{r.sent_at ? new Date(r.sent_at).toLocaleString() : '—'}</td>
                  <td className="p-3 text-xs">
                    {r.opened_at ? (
                      <div>
                        <div className="text-emerald-300">{new Date(r.opened_at).toLocaleString()}</div>
                        {r.open_count > 1 && <div className="text-[#a0a0a0]">{r.open_count}× opens</div>}
                      </div>
                    ) : r.channel === 'push' ? (
                      <span className="text-[#666]">—</span>
                    ) : (
                      <span className="text-[#a0a0a0]">Not yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-[#a0a0a0] text-xs uppercase tracking-wider mb-2">{icon} {label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-[#a0a0a0] mt-1">{sub}</div>}
    </div>
  )
}
