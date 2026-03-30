import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

interface Campaign {
  id: number
  name: string
  template: string
  status: string
  channel: string
  segment_rules: Record<string, any>
  sent_count: number
  email_sent_count: number
  opened_count: number
  scheduled_at: string | null
  created_at: string
}

interface EmailTemplate {
  id: number
  name: string
  subject: string
}

const SEGMENT_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond']
const CHANNELS = [
  { value: 'push', label: 'Push Only' },
  { value: 'email', label: 'Email Only' },
  { value: 'both', label: 'Push + Email' },
]

export function Notifications() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '',
    template: '',
    title: '',
    body: '',
    tier_filter: [] as string[],
    points_min: '',
    points_max: '',
    scheduled_at: '',
    channel: 'push',
    email_template_id: '',
    email_subject: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/v1/admin/campaigns').then(r => r.data),
  })

  const { data: templatesData } = useQuery({
    queryKey: ['email-templates-list'],
    queryFn: () => api.get('/v1/admin/email-templates').then(r => r.data),
  })
  const emailTemplates: EmailTemplate[] = templatesData?.templates ?? []

  const createMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/notifications/campaign', {
      name: form.name,
      template: form.template || `${form.title}\n\n${form.body}`,
      title: form.title,
      body: form.body,
      channel: form.channel,
      email_template_id: form.email_template_id ? Number(form.email_template_id) : undefined,
      email_subject: form.email_subject || undefined,
      segment_rules: {
        tiers: form.tier_filter.length > 0 ? form.tier_filter : undefined,
        points_min: form.points_min ? Number(form.points_min) : undefined,
        points_max: form.points_max ? Number(form.points_max) : undefined,
      },
      scheduled_at: form.scheduled_at || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign created and sent!')
      setShowCreate(false)
      setForm({ name: '', template: '', title: '', body: '', tier_filter: [], points_min: '', points_max: '', scheduled_at: '', channel: 'push', email_template_id: '', email_subject: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create campaign'),
  })

  const toggleTier = (tier: string) => {
    setForm(f => ({
      ...f,
      tier_filter: f.tier_filter.includes(tier)
        ? f.tier_filter.filter(t => t !== tier)
        : [...f.tier_filter, tier],
    }))
  }

  const statusColor: Record<string, string> = {
    draft: 'bg-dark-surface3 text-[#8e8e93]',
    scheduled: 'bg-[#ffd60a]/15 text-[#ffd60a]',
    sending: 'bg-[#0a84ff]/15 text-[#0a84ff]',
    sent: 'bg-[#32d74b]/15 text-[#32d74b]',
    failed: 'bg-[#ff375f]/15 text-[#ff375f]',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notification Campaigns</h1>
          <p className="text-sm text-[#8e8e93] mt-1">Send targeted push notifications and emails to members</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          + New Campaign
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-dark-surface rounded-xl p-5 border border-dark-border">
          <p className="text-sm text-[#8e8e93]">Total Campaigns</p>
          <p className="text-3xl font-bold text-white mt-1">{data?.total ?? 0}</p>
        </div>
        <div className="bg-dark-surface rounded-xl p-5 border border-dark-border">
          <p className="text-sm text-[#8e8e93]">Total Sent</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">
            {(data?.campaigns ?? []).reduce((s: number, c: Campaign) => s + (c.sent_count ?? 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-dark-surface rounded-xl p-5 border border-dark-border">
          <p className="text-sm text-[#8e8e93]">Avg Open Rate</p>
          <p className="text-3xl font-bold text-[#32d74b] mt-1">
            {(() => {
              const camps = data?.campaigns ?? []
              const totalSent = camps.reduce((s: number, c: Campaign) => s + (c.sent_count ?? 0), 0)
              const totalOpened = camps.reduce((s: number, c: Campaign) => s + (c.opened_count ?? 0), 0)
              return totalSent > 0 ? `${Math.round((totalOpened / totalSent) * 100)}%` : '—'
            })()}
          </p>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-border">
          <h2 className="font-semibold text-white">Recent Campaigns</h2>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-[#636366]">Loading...</div>
        ) : (data?.campaigns ?? []).length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[#8e8e93] font-medium">No campaigns yet</p>
            <p className="text-sm text-[#636366] mt-1">Create your first campaign to engage members</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-dark-surface2 text-[#8e8e93] text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">Campaign</th>
                <th className="px-6 py-3 text-left">Channel</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Segment</th>
                <th className="px-6 py-3 text-right">Push Sent</th>
                <th className="px-6 py-3 text-right">Email Sent</th>
                <th className="px-6 py-3 text-right">Opened</th>
                <th className="px-6 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {(data?.campaigns ?? []).map((c: Campaign) => (
                <tr key={c.id} className="hover:bg-dark-surface2 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-white">{c.name}</p>
                    <p className="text-[#636366] text-xs mt-0.5 truncate max-w-xs">{c.template?.split('\n')[0]}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                      c.channel === 'both' ? 'bg-[#8b5cf6]/15 text-[#8b5cf6]'
                      : c.channel === 'email' ? 'bg-[#0a84ff]/15 text-[#0a84ff]'
                      : 'bg-[#32d74b]/15 text-[#32d74b]'
                    }`}>
                      {c.channel === 'both' ? 'PUSH+EMAIL' : (c.channel ?? 'push').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor[c.status] ?? 'bg-dark-surface3 text-[#8e8e93]'}`}>
                      {c.status?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[#a0a0a0]">
                    {c.segment_rules?.tiers?.join(', ') || 'All members'}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-white">{(c.sent_count ?? 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-medium text-[#0a84ff]">{(c.email_sent_count ?? 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-medium text-[#32d74b]">{(c.opened_count ?? 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-[#8e8e93] text-xs">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Campaign Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-dark-border">
              <h2 className="text-lg font-bold text-white">Create Notification Campaign</h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Weekend Double Points"
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Notification Title */}
              <div>
                <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Notification Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Special Offer Just for You!"
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Notification Body */}
              <div>
                <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Message Body</label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Earn double points this weekend on all stays..."
                  rows={3}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              {/* Tier Segment Filter */}
              <div>
                <label className="block text-sm font-semibold text-[#a0a0a0] mb-2">Target Tiers (leave empty for all)</label>
                <div className="flex flex-wrap gap-2">
                  {SEGMENT_TIERS.map(tier => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => toggleTier(tier)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        form.tier_filter.includes(tier)
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-dark-surface2 text-[#8e8e93] border-dark-border hover:border-primary-500'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Points Filter */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Min Points</label>
                  <input
                    type="number"
                    value={form.points_min}
                    onChange={e => setForm(f => ({ ...f, points_min: e.target.value }))}
                    placeholder="e.g. 1000"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Max Points</label>
                  <input
                    type="number"
                    value={form.points_max}
                    onChange={e => setForm(f => ({ ...f, points_max: e.target.value }))}
                    placeholder="e.g. 10000"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Channel */}
              <div>
                <label className="block text-sm font-semibold text-[#a0a0a0] mb-2">Channel</label>
                <div className="flex gap-2">
                  {CHANNELS.map(ch => (
                    <button
                      key={ch.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, channel: ch.value }))}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        form.channel === ch.value
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-dark-surface2 text-[#8e8e93] border-dark-border hover:border-primary-500'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email Template (shown when email or both selected) */}
              {(form.channel === 'email' || form.channel === 'both') && (
                <div className="space-y-3 p-4 rounded-xl bg-[#0a84ff]/5 border border-[#0a84ff]/20">
                  <p className="text-xs font-semibold text-[#0a84ff] uppercase tracking-wide">Email Settings</p>
                  <div>
                    <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Email Template</label>
                    <select
                      value={form.email_template_id}
                      onChange={e => {
                        const tid = e.target.value
                        const tpl = emailTemplates.find(t => String(t.id) === tid)
                        setForm(f => ({
                          ...f,
                          email_template_id: tid,
                          email_subject: tpl?.subject ?? f.email_subject,
                        }))
                      }}
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select a template...</option>
                      {emailTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {emailTemplates.length === 0 && (
                      <p className="text-xs text-[#636366] mt-1">No templates yet. Create one in Email Templates first.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Subject Override (optional)</label>
                    <input
                      type="text"
                      value={form.email_subject}
                      onChange={e => setForm(f => ({ ...f, email_subject: e.target.value }))}
                      placeholder="Leave blank to use template subject"
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              )}

              {/* Schedule */}
              <div>
                <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Schedule (optional — blank = send now)</label>
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="p-6 border-t border-dark-border flex gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 border border-dark-border text-[#a0a0a0] py-2.5 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!form.name || !form.title || !form.body || createMutation.isPending || ((form.channel === 'email' || form.channel === 'both') && !form.email_template_id)}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending ? 'Sending...' : 'Send Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
