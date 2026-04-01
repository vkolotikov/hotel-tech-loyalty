import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Bot, Save, Plus, X, Sliders } from 'lucide-react'
import toast from 'react-hot-toast'

const SALES_STYLES = [
  { value: 'consultative', label: 'Consultative', desc: 'Ask questions, understand needs, then recommend' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Proactively push offers and upsells' },
  { value: 'passive', label: 'Passive', desc: 'Only offer when explicitly asked' },
  { value: 'educational', label: 'Educational', desc: 'Inform and educate, let guest decide' },
]

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
]

const REPLY_LENGTHS = [
  { value: 'concise', label: 'Concise', desc: '1-2 sentences' },
  { value: 'moderate', label: 'Moderate', desc: '2-4 sentences' },
  { value: 'detailed', label: 'Detailed', desc: 'Thorough responses' },
]

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', models: [
    { value: 'gpt-5.4', label: 'GPT-5.4 (most capable)' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano (fastest)' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'o3-mini', label: 'o3-mini (reasoning)' },
  ]},
  { value: 'anthropic', label: 'Anthropic', models: [
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (most capable)' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
  ]},
  { value: 'google', label: 'Google', models: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (latest)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ]},
]

type Tab = 'behavior' | 'model'

export function ChatbotConfig() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('behavior')

  // ─── Behavior Config ───
  const { data: behavior, isLoading: loadingBehavior } = useQuery({
    queryKey: ['chatbot-behavior'],
    queryFn: () => api.get('/v1/admin/chatbot-config/behavior').then(r => r.data),
  })

  const [behaviorForm, setBehaviorForm] = useState<any>(null)
  const [newRule, setNewRule] = useState('')

  // Sync form when data loads
  const bForm = behaviorForm ?? behavior ?? {}

  const saveBehavior = useMutation({
    mutationFn: (data: any) => api.put('/v1/admin/chatbot-config/behavior', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-behavior'] })
      toast.success('Behavior config saved')
      setBehaviorForm(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  // ─── Model Config ───
  const { data: modelData, isLoading: loadingModel } = useQuery({
    queryKey: ['chatbot-model'],
    queryFn: () => api.get('/v1/admin/chatbot-config/model').then(r => r.data),
  })

  const [modelForm, setModelForm] = useState<any>(null)
  const mForm = modelForm ?? modelData ?? {}

  const saveModel = useMutation({
    mutationFn: (data: any) => api.put('/v1/admin/chatbot-config/model', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-model'] })
      toast.success('Model config saved')
      setModelForm(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const updateBehavior = (key: string, value: any) => {
    setBehaviorForm((prev: any) => ({ ...(prev ?? behavior ?? {}), [key]: value }))
  }

  const updateModel = (key: string, value: any) => {
    setModelForm((prev: any) => ({ ...(prev ?? modelData ?? {}), [key]: value }))
  }

  const addRule = () => {
    if (!newRule.trim()) return
    const rules = [...(bForm.core_rules || []), newRule.trim()]
    updateBehavior('core_rules', rules)
    setNewRule('')
  }

  const removeRule = (index: number) => {
    const rules = (bForm.core_rules || []).filter((_: any, i: number) => i !== index)
    updateBehavior('core_rules', rules)
  }

  const selectedProvider = PROVIDERS.find(p => p.value === (mForm.provider || 'openai'))

  const isLoading = loadingBehavior || loadingModel

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bot className="text-primary-500" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-white">Chatbot Configuration</h1>
          <p className="text-sm text-t-secondary">Configure how your AI assistant behaves and responds to guests</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-surface border border-dark-border rounded-lg p-1 w-fit">
        {[
          { key: 'behavior' as Tab, label: 'AI Behavior', icon: Bot },
          { key: 'model' as Tab, label: 'Model Settings', icon: Sliders },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-primary-600 text-white' : 'text-t-secondary hover:text-white'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center text-t-secondary py-12">Loading configuration...</div>
      ) : tab === 'behavior' ? (
        /* ═══ BEHAVIOR TAB ═══ */
        <div className="space-y-6">
          {/* Identity Section */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Assistant Identity</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-t-secondary mb-1">Assistant Name</label>
                <input
                  type="text"
                  value={bForm.assistant_name || ''}
                  onChange={e => updateBehavior('assistant_name', e.target.value)}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="Hotel Assistant"
                />
              </div>
              <div>
                <label className="block text-sm text-t-secondary mb-1">Language</label>
                <input
                  type="text"
                  value={bForm.language || 'en'}
                  onChange={e => updateBehavior('language', e.target.value)}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="en"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-t-secondary mb-1">Identity / Persona</label>
              <textarea
                value={bForm.identity || ''}
                onChange={e => updateBehavior('identity', e.target.value)}
                rows={3}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="You are a luxury hotel concierge AI assistant with deep knowledge of hospitality..."
              />
            </div>

            <div>
              <label className="block text-sm text-t-secondary mb-1">Goal</label>
              <textarea
                value={bForm.goal || ''}
                onChange={e => updateBehavior('goal', e.target.value)}
                rows={2}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="Help guests with loyalty program questions, recommend experiences, and increase engagement..."
              />
            </div>
          </div>

          {/* Personality Section */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Personality & Style</h2>

            <div>
              <label className="block text-sm text-t-secondary mb-2">Sales Style</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {SALES_STYLES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => updateBehavior('sales_style', s.value)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      (bForm.sales_style || 'consultative') === s.value
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-dark-border hover:border-dark-border2'
                    }`}
                  >
                    <div className="text-sm font-medium text-white">{s.label}</div>
                    <div className="text-xs text-t-secondary mt-1">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-t-secondary mb-1">Tone</label>
                <select
                  value={bForm.tone || 'professional'}
                  onChange={e => updateBehavior('tone', e.target.value)}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-t-secondary mb-1">Reply Length</label>
                <div className="flex gap-2">
                  {REPLY_LENGTHS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => updateBehavior('reply_length', r.value)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                        (bForm.reply_length || 'moderate') === r.value
                          ? 'border-primary-500 bg-primary-500/10 text-white'
                          : 'border-dark-border text-t-secondary hover:border-dark-border2'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Rules Section */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Core Rules</h2>
            <p className="text-sm text-t-secondary">Rules the assistant must always follow</p>

            <div className="space-y-2">
              {(bForm.core_rules || []).map((rule: string, i: number) => (
                <div key={i} className="flex items-center gap-2 bg-dark-surface rounded-lg px-3 py-2">
                  <span className="text-sm text-white flex-1">{rule}</span>
                  <button onClick={() => removeRule(i)} className="text-red-400 hover:text-red-300">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newRule}
                onChange={e => setNewRule(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRule()}
                className="flex-1 bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="Add a rule..."
              />
              <button
                onClick={addRule}
                className="bg-primary-600 text-white px-3 py-2 rounded-lg hover:bg-primary-700 text-sm"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Escalation & Fallback */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Escalation & Fallback</h2>

            <div>
              <label className="block text-sm text-t-secondary mb-1">Escalation Policy</label>
              <textarea
                value={bForm.escalation_policy || ''}
                onChange={e => updateBehavior('escalation_policy', e.target.value)}
                rows={2}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="If the guest asks to speak to a human, politely offer to connect them with the front desk..."
              />
            </div>

            <div>
              <label className="block text-sm text-t-secondary mb-1">Fallback Message</label>
              <input
                type="text"
                value={bForm.fallback_message || ''}
                onChange={e => updateBehavior('fallback_message', e.target.value)}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="I'm sorry, I couldn't process your request. Please contact our front desk for assistance."
              />
            </div>

            <div>
              <label className="block text-sm text-t-secondary mb-1">Custom Instructions</label>
              <textarea
                value={bForm.custom_instructions || ''}
                onChange={e => updateBehavior('custom_instructions', e.target.value)}
                rows={3}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="Additional instructions for the AI assistant..."
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={() => saveBehavior.mutate(bForm)}
              disabled={saveBehavior.isPending}
              className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
            >
              <Save size={16} />
              {saveBehavior.isPending ? 'Saving...' : 'Save Behavior Config'}
            </button>
          </div>
        </div>
      ) : (
        /* ═══ MODEL TAB ═══ */
        <div className="space-y-6">
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">AI Model Configuration</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-t-secondary mb-1">Provider</label>
                <select
                  value={mForm.provider || 'openai'}
                  onChange={e => {
                    updateModel('provider', e.target.value)
                    const prov = PROVIDERS.find(p => p.value === e.target.value)
                    if (prov) updateModel('model_name', prov.models[0].value)
                  }}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-t-secondary mb-1">Model</label>
                <select
                  value={mForm.model_name || 'gpt-4o'}
                  onChange={e => updateModel('model_name', e.target.value)}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  {(selectedProvider?.models || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-white">Parameters</h2>

            {/* Temperature */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-t-secondary">Temperature</span>
                <span className="text-white font-mono">{mForm.temperature ?? 0.7}</span>
              </div>
              <input
                type="range" min="0" max="2" step="0.05"
                value={mForm.temperature ?? 0.7}
                onChange={e => updateModel('temperature', parseFloat(e.target.value))}
                className="w-full accent-primary-500"
              />
              <div className="flex justify-between text-xs text-dark-border2">
                <span>Precise</span><span>Creative</span>
              </div>
            </div>

            {/* Top P */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-t-secondary">Top P</span>
                <span className="text-white font-mono">{mForm.top_p ?? 1.0}</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.05"
                value={mForm.top_p ?? 1.0}
                onChange={e => updateModel('top_p', parseFloat(e.target.value))}
                className="w-full accent-primary-500"
              />
            </div>

            {/* Max Tokens */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-t-secondary">Max Tokens</span>
                <span className="text-white font-mono">{mForm.max_tokens ?? 500}</span>
              </div>
              <input
                type="range" min="50" max="4096" step="50"
                value={mForm.max_tokens ?? 500}
                onChange={e => updateModel('max_tokens', parseInt(e.target.value))}
                className="w-full accent-primary-500"
              />
              <div className="flex justify-between text-xs text-dark-border2">
                <span>50</span><span>4096</span>
              </div>
            </div>

            {/* Frequency Penalty */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-t-secondary">Frequency Penalty</span>
                <span className="text-white font-mono">{mForm.frequency_penalty ?? 0}</span>
              </div>
              <input
                type="range" min="0" max="2" step="0.1"
                value={mForm.frequency_penalty ?? 0}
                onChange={e => updateModel('frequency_penalty', parseFloat(e.target.value))}
                className="w-full accent-primary-500"
              />
            </div>

            {/* Presence Penalty */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-t-secondary">Presence Penalty</span>
                <span className="text-white font-mono">{mForm.presence_penalty ?? 0}</span>
              </div>
              <input
                type="range" min="0" max="2" step="0.1"
                value={mForm.presence_penalty ?? 0}
                onChange={e => updateModel('presence_penalty', parseFloat(e.target.value))}
                className="w-full accent-primary-500"
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={() => saveModel.mutate(mForm)}
              disabled={saveModel.isPending}
              className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
            >
              <Save size={16} />
              {saveModel.isPending ? 'Saving...' : 'Save Model Config'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
