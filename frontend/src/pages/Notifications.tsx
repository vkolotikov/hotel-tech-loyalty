import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { PairTabs, CAMPAIGNS_TABS } from '../components/PairTabs'

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
  html_body: string
  category: string
}

interface AudiencePreview {
  total: number
  push_ready: number
  email_ready: number
  reachable: number
  sample: Array<{ id: number; name: string; email: string | null; tier: string | null; points: number; push: boolean; email_opt: boolean }>
}

type Step = 1 | 2 | 3 | 4

const CHANNELS = [
  { value: 'push', label: 'Push Only', desc: 'Members with the mobile app' },
  { value: 'email', label: 'Email Only', desc: 'Members with email opt-in' },
  { value: 'both', label: 'Push + Email', desc: 'Maximum reach' },
] as const

export function Notifications() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [showCreate, setShowCreate] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState({
    name: '',
    title: '',
    body: '',
    tier_filter: [] as string[],
    points_min: '',
    points_max: '',
    scheduled_at: '',
    channel: 'push' as 'push' | 'email' | 'both',
    email_template_id: '',
    email_subject: '',
    test_email: '',
  })

  const { data: tiersData } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })
  const tiers: { id: number; name: string }[] = tiersData?.tiers ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/v1/admin/campaigns').then(r => r.data),
  })

  const { data: templatesData } = useQuery({
    queryKey: ['email-templates-list'],
    queryFn: () => api.get('/v1/admin/email-templates').then(r => r.data),
  })
  const emailTemplates: EmailTemplate[] = templatesData?.templates ?? []

  const selectedTemplate = useMemo(
    () => emailTemplates.find(t => String(t.id) === form.email_template_id),
    [emailTemplates, form.email_template_id]
  )

  const segmentRules = useMemo(() => ({
    tiers: form.tier_filter.length > 0 ? form.tier_filter : undefined,
    points_min: form.points_min ? Number(form.points_min) : undefined,
    points_max: form.points_max ? Number(form.points_max) : undefined,
  }), [form.tier_filter, form.points_min, form.points_max])

  // Debounced audience preview — re-runs on segment/channel change
  const [audience, setAudience] = useState<AudiencePreview | null>(null)
  const [audienceLoading, setAudienceLoading] = useState(false)
  useEffect(() => {
    if (!showCreate) return
    setAudienceLoading(true)
    const handle = setTimeout(() => {
      api.post('/v1/admin/campaigns/preview-audience', { segment_rules: segmentRules, channel: form.channel })
        .then(r => setAudience(r.data))
        .catch(() => setAudience(null))
        .finally(() => setAudienceLoading(false))
    }, 250)
    return () => clearTimeout(handle)
  }, [segmentRules, form.channel, showCreate])

  const createMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/notifications/campaign', {
      name: form.name,
      template: `${form.title}\n\n${form.body}`,
      title: form.title,
      body: form.body,
      channel: form.channel,
      email_template_id: form.email_template_id ? Number(form.email_template_id) : undefined,
      email_subject: form.email_subject || undefined,
      segment_rules: segmentRules,
      scheduled_at: form.scheduled_at || undefined,
    }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success(r.data?.message || 'Campaign sent!')
      closeWizard()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to send'),
  })

  const testMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/campaigns/send-test', {
      email_template_id: form.email_template_id ? Number(form.email_template_id) : undefined,
      email_subject: form.email_subject || undefined,
      to_email: form.test_email || undefined,
    }),
    onSuccess: (r: any) => toast.success(r.data?.message || 'Test sent!'),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Test failed'),
  })

  const closeWizard = () => {
    setShowCreate(false)
    setStep(1)
    setForm({ name: '', title: '', body: '', tier_filter: [], points_min: '', points_max: '', scheduled_at: '', channel: 'push', email_template_id: '', email_subject: '', test_email: '' })
    setAudience(null)
  }

  const openWizard = () => {
    setShowCreate(true)
    setStep(1)
  }

  const toggleTier = (tier: string) => {
    setForm(f => ({
      ...f,
      tier_filter: f.tier_filter.includes(tier) ? f.tier_filter.filter(t => t !== tier) : [...f.tier_filter, tier],
    }))
  }

  const canAdvanceFrom = (s: Step): boolean => {
    if (s === 1) {
      if (form.channel === 'push') return !!form.title && !!form.body
      if (form.channel === 'email') return !!form.email_template_id
      return !!form.email_template_id && !!form.title && !!form.body
    }
    if (s === 2) return (audience?.reachable ?? 0) > 0
    if (s === 3) {
      if (!form.name) return false
      if (form.channel !== 'push' && !form.email_subject && !selectedTemplate) return false
      return true
    }
    return true
  }

  const statusColor: Record<string, string> = {
    draft: 'bg-dark-surface3 text-t-secondary',
    scheduled: 'bg-[#ffd60a]/15 text-[#ffd60a]',
    sending: 'bg-[#0a84ff]/15 text-[#0a84ff]',
    sent: 'bg-[#32d74b]/15 text-[#32d74b]',
    failed: 'bg-[#ff375f]/15 text-[#ff375f]',
  }

  const campaigns: Campaign[] = data?.campaigns ?? []
  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count ?? 0) + (c.email_sent_count ?? 0), 0)
  const totalOpened = campaigns.reduce((s, c) => s + (c.opened_count ?? 0), 0)
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : null

  return (
    <div className="space-y-6">
      <PairTabs tabs={CAMPAIGNS_TABS} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('notifications.title', 'Notification Campaigns')}</h1>
          <p className="text-sm text-t-secondary mt-1">{t('notifications.subtitle', 'Send targeted push notifications and email campaigns')}</p>
        </div>
        <button
          onClick={openWizard}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          {t('notifications.new_campaign', '+ New Campaign')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label={t('notifications.stats.total_campaigns', 'Total Campaigns')} value={data?.total ?? 0} tone="white" />
        <StatCard label={t('notifications.stats.push_sent', 'Push Sent')} value={campaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0)} tone="blue" />
        <StatCard label={t('notifications.stats.emails_sent', 'Emails Sent')} value={campaigns.reduce((s, c) => s + (c.email_sent_count ?? 0), 0)} tone="violet" />
        <StatCard label={t('notifications.stats.avg_open_rate', 'Avg Open Rate')} value={openRate !== null ? `${openRate}%` : '—'} tone="green" />
      </div>

      <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-border">
          <h2 className="font-semibold text-white">{t('notifications.recent.title', 'Recent Campaigns')}</h2>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-[#636366]">{t('notifications.recent.loading', 'Loading…')}</div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-t-secondary font-medium">{t('notifications.recent.no_campaigns', 'No campaigns yet')}</p>
            <p className="text-sm text-[#636366] mt-1">{t('notifications.recent.no_campaigns_sub', 'Create your first campaign to engage members')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-dark-surface2 text-t-secondary text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">{t('notifications.table.campaign', 'Campaign')}</th>
                <th className="px-6 py-3 text-left">{t('notifications.table.channel', 'Channel')}</th>
                <th className="px-6 py-3 text-left">{t('notifications.table.status', 'Status')}</th>
                <th className="px-6 py-3 text-left">{t('notifications.table.segment', 'Segment')}</th>
                <th className="px-6 py-3 text-right">{t('notifications.table.push', 'Push')}</th>
                <th className="px-6 py-3 text-right">{t('notifications.table.email', 'Email')}</th>
                <th className="px-6 py-3 text-right">{t('notifications.table.opened', 'Opened')}</th>
                <th className="px-6 py-3 text-left">{t('notifications.table.date', 'Date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {campaigns.map(c => (
                <tr key={c.id} onClick={() => navigate(`/notifications/${c.id}`)} className="hover:bg-dark-surface2 transition-colors cursor-pointer">
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
                      {c.channel === 'both' ? t('notifications.table.channel_both', 'PUSH+EMAIL') : (c.channel ?? 'push').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor[c.status] ?? 'bg-dark-surface3 text-t-secondary'}`}>
                      {c.status?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[#a0a0a0]">
                    {c.segment_rules?.tiers?.join(', ') || t('notifications.table.all_members', 'All members')}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-white">{(c.sent_count ?? 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-medium text-[#0a84ff]">{(c.email_sent_count ?? 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-medium text-[#32d74b]">{(c.opened_count ?? 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-t-secondary text-xs">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-4xl my-8">
            {/* Header with stepper */}
            <div className="p-5 border-b border-dark-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">{t('notifications.wizard.title_new', 'New Campaign')}</h2>
                <button onClick={closeWizard} className="text-[#636366] hover:text-white text-xl">&times;</button>
              </div>
              <Stepper current={step} />
            </div>

            <div className="p-6 min-h-[420px]">
              {step === 1 && (
                <Step1Channel
                  form={form}
                  setForm={setForm}
                  emailTemplates={emailTemplates}
                  selectedTemplate={selectedTemplate}
                />
              )}
              {step === 2 && (
                <Step2Audience
                  form={form}
                  tiers={tiers}
                  audience={audience}
                  loading={audienceLoading}
                  toggleTier={toggleTier}
                  setForm={setForm}
                />
              )}
              {step === 3 && (
                <Step3Details
                  form={form}
                  setForm={setForm}
                  selectedTemplate={selectedTemplate}
                />
              )}
              {step === 4 && (
                <Step4Review
                  form={form}
                  setForm={setForm}
                  audience={audience}
                  selectedTemplate={selectedTemplate}
                  onTestSend={() => testMutation.mutate()}
                  testPending={testMutation.isPending}
                />
              )}
            </div>

            <div className="p-5 border-t border-dark-border flex gap-3">
              <button
                onClick={closeWizard}
                className="border border-dark-border text-[#a0a0a0] px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
              >
                {t('notifications.wizard.cancel', 'Cancel')}
              </button>
              <div className="flex-1" />
              {step > 1 && (
                <button
                  onClick={() => setStep((s => (s - 1) as Step)(step))}
                  className="border border-dark-border text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
                >
                  {t('notifications.wizard.back', 'Back')}
                </button>
              )}
              {step < 4 ? (
                <button
                  onClick={() => setStep((s => (s + 1) as Step)(step))}
                  disabled={!canAdvanceFrom(step)}
                  className="bg-primary-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t('notifications.wizard.continue', 'Continue')}
                </button>
              ) : (
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !canAdvanceFrom(3) || (audience?.reachable ?? 0) === 0}
                  className="bg-primary-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createMutation.isPending ? t('notifications.wizard.sending', 'Sending…') : form.scheduled_at ? t('notifications.wizard.schedule_campaign', 'Schedule Campaign') : t('notifications.wizard.send_now', 'Send Now')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------

function StatCard({ label, value, tone }: { label: string; value: number | string; tone: 'white' | 'blue' | 'green' | 'violet' }) {
  const color = tone === 'blue' ? 'text-[#0a84ff]'
    : tone === 'green' ? 'text-[#32d74b]'
    : tone === 'violet' ? 'text-[#8b5cf6]'
    : 'text-white'
  return (
    <div className="bg-dark-surface rounded-xl p-5 border border-dark-border">
      <p className="text-sm text-t-secondary">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  )
}

function Stepper({ current }: { current: Step }) {
  const { t } = useTranslation()
  const steps = [
    { n: 1, label: t('notifications.wizard.steps.channel_template', 'Channel & Template') },
    { n: 2, label: t('notifications.wizard.steps.audience', 'Audience') },
    { n: 3, label: t('notifications.wizard.steps.details', 'Details') },
    { n: 4, label: t('notifications.wizard.steps.review_send', 'Review & Send') },
  ] as const
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2 flex-1">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            s.n < current ? 'bg-primary-600 text-white'
            : s.n === current ? 'bg-primary-500 text-white ring-4 ring-primary-500/20'
            : 'bg-dark-surface2 text-[#636366] border border-dark-border'
          }`}>
            {s.n < current ? '✓' : s.n}
          </div>
          <span className={`text-xs font-semibold ${s.n === current ? 'text-white' : 'text-[#636366]'} hidden md:inline`}>
            {s.label}
          </span>
          {i < steps.length - 1 && <div className="flex-1 h-px bg-dark-border" />}
        </div>
      ))}
    </div>
  )
}

// ---- Step 1: Channel & Template --------------------------------------

interface Step1Props {
  form: any
  setForm: (updater: (f: any) => any) => void
  emailTemplates: EmailTemplate[]
  selectedTemplate: EmailTemplate | undefined
}

function Step1Channel({ form, setForm, emailTemplates, selectedTemplate }: Step1Props) {
  const { t } = useTranslation()
  const showEmailSection = form.channel === 'email' || form.channel === 'both'
  const showPushSection = form.channel === 'push' || form.channel === 'both'

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">{t('notifications.wizard.step1.choose_channel', 'Choose a channel')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {CHANNELS.map(ch => (
            <button
              key={ch.value}
              onClick={() => setForm(f => ({ ...f, channel: ch.value }))}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                form.channel === ch.value
                  ? 'bg-primary-500/10 border-primary-500'
                  : 'bg-dark-surface2 border-dark-border hover:border-primary-500/50'
              }`}
            >
              <div className="text-sm font-bold text-white">{ch.label}</div>
              <div className="text-xs text-[#a0a0a0] mt-1">{ch.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {showEmailSection && (
        <div>
          <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">{t('notifications.wizard.step1.email_template', 'Email template')}</h3>
          {emailTemplates.length === 0 ? (
            <div className="bg-dark-surface2 rounded-xl border border-dark-border p-6 text-center">
              <p className="text-sm text-t-secondary">{t('notifications.wizard.step1.no_templates', 'No email templates yet.')}</p>
              <p className="text-xs text-[#636366] mt-1">{t('notifications.wizard.step1.no_templates_sub', 'Create one in Email Templates first.')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto">
              {emailTemplates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setForm(f => ({ ...f, email_template_id: String(t.id), email_subject: f.email_subject || t.subject }))}
                  className={`text-left rounded-xl border overflow-hidden transition-all ${
                    String(t.id) === form.email_template_id
                      ? 'border-primary-500 ring-2 ring-primary-500/40'
                      : 'border-dark-border hover:border-primary-500/60'
                  }`}
                >
                  <div className="h-28 bg-white overflow-hidden relative">
                    <iframe
                      srcDoc={t.html_body}
                      title={t.name}
                      className="w-[600px] h-[400px] origin-top-left pointer-events-none"
                      style={{ transform: 'scale(0.35)', transformOrigin: 'top left' }}
                      sandbox=""
                    />
                  </div>
                  <div className="p-3 bg-dark-surface2">
                    <p className="text-xs font-semibold text-white truncate">{t.name}</p>
                    <p className="text-[10px] text-[#636366] truncate mt-0.5">{t.subject}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedTemplate && (
            <p className="text-xs text-primary-400 mt-2">{t('notifications.wizard.step1.selected', { name: selectedTemplate.name, defaultValue: 'Selected: {{name}}' })}</p>
          )}
        </div>
      )}

      {showPushSection && (
        <div>
          <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">{t('notifications.wizard.step1.push_content', 'Push content')}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a0] mb-1 uppercase tracking-wide">{t('notifications.wizard.step1.title_label', 'Title')}</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={t('notifications.wizard.step1.title_placeholder', 'e.g. Special offer just for you!')}
                className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a0] mb-1 uppercase tracking-wide">{t('notifications.wizard.step1.body_label', 'Message body')}</label>
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder={t('notifications.wizard.step1.body_placeholder', 'Earn double points this weekend…')}
                rows={3}
                className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Step 2: Audience --------------------------------------------------

interface Step2Props {
  form: any
  tiers: { id: number; name: string }[]
  audience: AudiencePreview | null
  loading: boolean
  toggleTier: (t: string) => void
  setForm: (updater: (f: any) => any) => void
}

function Step2Audience({ form, tiers, audience, loading, toggleTier, setForm }: Step2Props) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">{t('notifications.wizard.step2.filter_tier', 'Filter by tier')}</h3>
          <p className="text-xs text-[#636366] mb-2">{t('notifications.wizard.step2.tier_help', 'Leave empty to target all tiers')}</p>
          <div className="flex flex-wrap gap-2">
            {tiers.map(tier => (
              <button
                key={tier.id}
                onClick={() => toggleTier(tier.name)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  form.tier_filter.includes(tier.name)
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-dark-surface2 text-t-secondary border-dark-border hover:border-primary-500'
                }`}
              >
                {tier.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">{t('notifications.wizard.step2.filter_points', 'Filter by points')}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#a0a0a0] mb-1">{t('notifications.wizard.step2.minimum', 'Minimum')}</label>
              <input
                type="number"
                value={form.points_min}
                onChange={e => setForm(f => ({ ...f, points_min: e.target.value }))}
                placeholder="0"
                className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-[#a0a0a0] mb-1">{t('notifications.wizard.step2.maximum', 'Maximum')}</label>
              <input
                type="number"
                value={form.points_max}
                onChange={e => setForm(f => ({ ...f, points_max: e.target.value }))}
                placeholder="∞"
                className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-dark-surface2 rounded-xl border border-dark-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t('notifications.wizard.step2.audience_title', 'Who will receive this')}</h3>
          {loading && <span className="text-[10px] text-[#636366]">{t('notifications.wizard.step2.updating', 'Updating…')}</span>}
        </div>

        <div className="text-center py-4 border-b border-dark-border mb-4">
          <div className={`text-5xl font-bold ${(audience?.reachable ?? 0) > 0 ? 'text-primary-400' : 'text-[#636366]'} leading-none`}>
            {audience?.reachable?.toLocaleString() ?? '—'}
          </div>
          <div className="text-xs text-[#a0a0a0] mt-2 uppercase tracking-wide">
            {form.channel === 'both'
              ? t('notifications.wizard.step2.reachable_on_push_email', 'Reachable on push or email')
              : t('notifications.wizard.step2.reachable_on', { channel: form.channel, defaultValue: 'Reachable on {{channel}}' })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
          <div>
            <div className="text-lg font-bold text-white">{audience?.total ?? 0}</div>
            <div className="text-[#636366] mt-0.5">{t('notifications.wizard.step2.match_filter', 'Match filter')}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[#32d74b]">{audience?.push_ready ?? 0}</div>
            <div className="text-[#636366] mt-0.5">{t('notifications.wizard.step2.push_ready', 'Push-ready')}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[#0a84ff]">{audience?.email_ready ?? 0}</div>
            <div className="text-[#636366] mt-0.5">{t('notifications.wizard.step2.email_opted', 'Email-opted')}</div>
          </div>
        </div>

        {(audience?.sample?.length ?? 0) > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[#a0a0a0] uppercase tracking-wide mb-2">{t('notifications.wizard.step2.sample_recipients', 'Sample recipients')}</p>
            <div className="space-y-1.5">
              {audience!.sample.map(m => (
                <div key={m.id} className="flex items-center justify-between text-xs bg-dark-surface rounded-md px-2 py-1.5">
                  <div className="truncate">
                    <span className="text-white font-medium">{m.name}</span>
                    {m.tier && <span className="text-[#636366] ml-2">· {m.tier}</span>}
                  </div>
                  <div className="text-[#636366] shrink-0 ml-2">{m.points.toLocaleString()} pts</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(audience?.reachable ?? 0) === 0 && !loading && (
          <p className="text-xs text-[#ff9500] mt-4 text-center">
            {t('notifications.wizard.step2.no_reachable', 'No reachable members for this segment + channel combination. Adjust filters or channel.')}
          </p>
        )}
      </div>
    </div>
  )
}

// ---- Step 3: Details ---------------------------------------------------

interface Step3Props {
  form: any
  setForm: (updater: (f: any) => any) => void
  selectedTemplate: EmailTemplate | undefined
}

function Step3Details({ form, setForm, selectedTemplate }: Step3Props) {
  const { t } = useTranslation()
  const showEmail = form.channel === 'email' || form.channel === 'both'

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <label className="block text-xs font-semibold text-[#a0a0a0] mb-1 uppercase tracking-wide">{t('notifications.wizard.step3.campaign_name', 'Campaign name')} <span className="text-[#636366] font-normal normal-case tracking-normal">{t('notifications.wizard.step3.campaign_name_hint', '(for your reference)')}</span></label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder={t('notifications.wizard.step3.campaign_name_placeholder', 'e.g. October weekend offer')}
          className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {showEmail && (
        <div>
          <label className="block text-xs font-semibold text-[#a0a0a0] mb-1 uppercase tracking-wide">{t('notifications.wizard.step3.email_subject', 'Email subject line')}</label>
          <input
            type="text"
            value={form.email_subject}
            onChange={e => setForm(f => ({ ...f, email_subject: e.target.value }))}
            placeholder={selectedTemplate?.subject || t('notifications.wizard.step3.subject_placeholder_fallback', 'Enter subject')}
            className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-[11px] text-[#636366] mt-1">{t('notifications.wizard.step3.subject_default_hint', 'Leave blank to use the template default:')} <span className="text-t-secondary">{selectedTemplate?.subject ?? '—'}</span></p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-[#a0a0a0] mb-1 uppercase tracking-wide">{t('notifications.wizard.step3.schedule', 'Schedule')}</label>
        <input
          type="datetime-local"
          value={form.scheduled_at}
          onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
          className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="text-[11px] text-[#636366] mt-1">{t('notifications.wizard.step3.schedule_hint', 'Leave blank to send immediately on review.')}</p>
      </div>
    </div>
  )
}

// ---- Step 4: Review ----------------------------------------------------

interface Step4Props {
  form: any
  setForm: (updater: (f: any) => any) => void
  audience: AudiencePreview | null
  selectedTemplate: EmailTemplate | undefined
  onTestSend: () => void
  testPending: boolean
}

function Step4Review({ form, setForm, audience, selectedTemplate, onTestSend, testPending }: Step4Props) {
  const { t } = useTranslation()
  const showEmail = form.channel === 'email' || form.channel === 'both'
  const showPush = form.channel === 'push' || form.channel === 'both'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t('notifications.wizard.step4.summary', 'Summary')}</h3>

        <ReviewRow label={t('notifications.wizard.step4.row.campaign', 'Campaign')} value={form.name || '—'} />
        <ReviewRow label={t('notifications.wizard.step4.row.channel', 'Channel')} value={form.channel === 'both' ? t('notifications.wizard.step4.channel_both', 'Push + Email') : form.channel === 'email' ? t('notifications.wizard.step4.channel_email_only', 'Email only') : t('notifications.wizard.step4.channel_push_only', 'Push only')} />
        <ReviewRow label={t('notifications.wizard.step4.row.recipients', 'Recipients')} value={audience?.reachable ? t('notifications.wizard.step4.recipients_count', { count: audience.reachable, defaultValue: '{{count}} members' }) : t('notifications.wizard.step4.recipients_none', 'None')} tone={(audience?.reachable ?? 0) > 0 ? 'ok' : 'warn'} />
        <ReviewRow label={t('notifications.wizard.step4.row.segment', 'Segment')} value={
          [
            form.tier_filter.length > 0
              ? t('notifications.wizard.step4.tiers_label', { tiers: form.tier_filter.join(', '), defaultValue: 'Tiers: {{tiers}}' })
              : t('notifications.wizard.step4.all_tiers', 'All tiers'),
            form.points_min ? `≥ ${form.points_min} pts` : null,
            form.points_max ? `≤ ${form.points_max} pts` : null,
          ].filter(Boolean).join(' · ')
        } />
        {showEmail && (
          <>
            <ReviewRow label={t('notifications.wizard.step4.row.email_template', 'Email template')} value={selectedTemplate?.name ?? '—'} />
            <ReviewRow label={t('notifications.wizard.step4.row.subject', 'Subject')} value={form.email_subject || selectedTemplate?.subject || '—'} />
          </>
        )}
        {showPush && (
          <>
            <ReviewRow label={t('notifications.wizard.step4.row.push_title', 'Push title')} value={form.title || '—'} />
            <ReviewRow label={t('notifications.wizard.step4.row.push_body', 'Push body')} value={form.body || '—'} />
          </>
        )}
        <ReviewRow label={t('notifications.wizard.step4.row.scheduled', 'Scheduled')} value={form.scheduled_at ? new Date(form.scheduled_at).toLocaleString() : t('notifications.wizard.step4.send_immediately', 'Send immediately')} />

        {showEmail && selectedTemplate && (
          <div className="pt-4 border-t border-dark-border">
            <p className="text-xs font-semibold text-[#a0a0a0] uppercase tracking-wide mb-2">{t('notifications.wizard.step4.send_test_email', 'Send test email')}</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={form.test_email}
                onChange={e => setForm(f => ({ ...f, test_email: e.target.value }))}
                placeholder={t('notifications.wizard.step4.test_placeholder', 'Leave blank to send to yourself')}
                className="flex-1 bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={onTestSend}
                disabled={testPending}
                className="bg-dark-surface2 border border-dark-border text-white px-4 py-2 rounded-lg text-xs font-semibold hover:border-primary-500 disabled:opacity-50 transition-colors"
              >
                {testPending ? t('notifications.wizard.step4.sending_test', 'Sending…') : t('notifications.wizard.step4.send_test', 'Send test')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">{t('notifications.wizard.step4.preview', 'Preview')}</h3>
        {showEmail && selectedTemplate ? (
          <div className="bg-white rounded-lg border border-dark-border overflow-hidden" style={{ height: 520 }}>
            <iframe
              srcDoc={selectedTemplate.html_body}
              title="Email preview"
              className="w-full h-full"
              sandbox=""
            />
          </div>
        ) : showPush ? (
          <div className="bg-dark-surface2 border border-dark-border rounded-2xl p-6">
            <div className="bg-[#0a0a0a] rounded-xl p-4 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-[#999] uppercase tracking-wide font-semibold">{t('notifications.wizard.step4.your_app', 'Your App')}</p>
                    <p className="text-[10px] text-[#666]">{t('notifications.wizard.step4.now', 'now')}</p>
                  </div>
                  <p className="text-sm font-bold text-white mt-0.5 truncate">{form.title || t('notifications.wizard.step4.push_placeholder_title', 'Push title')}</p>
                  <p className="text-xs text-[#ccc] mt-0.5 line-clamp-3">{form.body || t('notifications.wizard.step4.push_placeholder_body', 'Push message body preview')}</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-[#636366] text-center mt-4">{t('notifications.wizard.step4.push_preview_label', 'Push notification preview')}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ReviewRow({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  const vColor = tone === 'warn' ? 'text-[#ff9500]' : tone === 'ok' ? 'text-[#32d74b]' : 'text-white'
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-dark-border/50">
      <span className="text-xs text-[#a0a0a0] uppercase tracking-wide shrink-0">{label}</span>
      <span className={`text-sm font-medium ${vColor} text-right break-words`}>{value}</span>
    </div>
  )
}
