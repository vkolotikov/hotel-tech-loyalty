import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Bot, Save, Plus, X, ChevronDown, ChevronUp, Info } from 'lucide-react'
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

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect (match customer language)' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ru', label: 'Russian' },
  { value: 'pl', label: 'Polish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ar', label: 'Arabic' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'hi', label: 'Hindi' },
  { value: 'uk', label: 'Ukrainian' },
]

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4.1', models: [
    { value: 'gpt-5.4-pro',      label: 'GPT-5.4 Pro — top-tier reasoning & luxury sales ★' },
    { value: 'gpt-5.4',          label: 'GPT-5.4 — flagship GPT-5 model' },
    { value: 'gpt-5',            label: 'GPT-5 — latest alias' },
    { value: 'gpt-5-mini',       label: 'GPT-5 Mini — fast GPT-5' },
    { value: 'gpt-5-nano',       label: 'GPT-5 Nano — fastest & cheapest GPT-5' },
    { value: 'gpt-4.1',          label: 'GPT-4.1 — best stable model for hospitality' },
    { value: 'gpt-4.1-mini',     label: 'GPT-4.1 Mini — fast & affordable' },
    { value: 'gpt-4.1-nano',     label: 'GPT-4.1 Nano — fastest response' },
    { value: 'gpt-4o',           label: 'GPT-4o — multimodal, highly capable' },
    { value: 'gpt-4o-mini',      label: 'GPT-4o Mini' },
    { value: 'o3',               label: 'o3 — deep reasoning (slow)' },
    { value: 'o4-mini',          label: 'o4-mini — fast reasoning' },
  ]},
  { value: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-opus-4-6', models: [
    { value: 'claude-opus-4-6',             label: 'Claude Opus 4.6 — most intelligent ★' },
    { value: 'claude-sonnet-4-6',           label: 'Claude Sonnet 4.6 — balanced speed & quality' },
    { value: 'claude-haiku-4-5-20251001',   label: 'Claude Haiku 4.5 — fastest & cheapest' },
  ]},
  { value: 'google', label: 'Google (Gemini)', defaultModel: 'gemini-2.5-pro', models: [
    { value: 'gemini-2.5-pro',              label: 'Gemini 2.5 Pro — best reasoning & context ★' },
    { value: 'gemini-2.5-flash',            label: 'Gemini 2.5 Flash — fast & cost-effective' },
    { value: 'gemini-2.5-flash-lite-preview-06-17', label: 'Gemini 2.5 Flash Lite — fastest' },
    { value: 'gemini-2.0-flash',            label: 'Gemini 2.0 Flash' },
  ]},
]

/** Provider → recommended model for a luxury sales agent */
const PROVIDER_RECOMMENDED: Record<string, string> = {
  openai: 'gpt-4.1',
  anthropic: 'claude-opus-4-6',
  google: 'gemini-2.5-pro',
}

export function ChatbotConfig() {
  const qc = useQueryClient()

  const { data: behavior, isLoading: loadingBehavior } = useQuery({
    queryKey: ['chatbot-behavior'],
    queryFn: () => api.get('/v1/admin/chatbot-config/behavior').then(r => r.data),
  })

  const [behaviorForm, setBehaviorForm] = useState<any>(null)
  const [newRule, setNewRule] = useState('')
  const bForm = behaviorForm ?? behavior ?? {}

  const { data: modelData, isLoading: loadingModel } = useQuery({
    queryKey: ['chatbot-model'],
    queryFn: () => api.get('/v1/admin/chatbot-config/model').then(r => r.data),
  })

  const [modelForm, setModelForm] = useState<any>(null)
  const mForm = modelForm ?? modelData ?? {}

  const saveBehavior = useMutation({
    mutationFn: (data: any) => api.put('/v1/admin/chatbot-config/behavior', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-behavior'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const saveModel = useMutation({
    mutationFn: (data: any) => api.put('/v1/admin/chatbot-config/model', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-model'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const handleSaveAll = async () => {
    try {
      await Promise.all([
        saveBehavior.mutateAsync(bForm),
        saveModel.mutateAsync(mForm),
      ])
      toast.success('Configuration saved')
      setBehaviorForm(null)
      setModelForm(null)
    } catch {
      // individual onError handlers already toasted
    }
  }

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

  const [showAdvanced, setShowAdvanced] = useState(false)
  const selectedProvider = PROVIDERS.find(p => p.value === (mForm.provider || 'openai'))
  const isLoading = loadingBehavior || loadingModel
  const isSaving = saveBehavior.isPending || saveModel.isPending

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

      {isLoading ? (
        <div className="text-center text-t-secondary py-12">Loading configuration...</div>
      ) : (
        <div className="space-y-6">
          {/* AI Model */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">AI Model</h2>
              <span className="text-xs text-t-secondary bg-dark-hover px-2 py-1 rounded-lg">
                ★ = recommended for luxury hospitality
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-t-secondary mb-1">Provider</label>
                <select
                  value={mForm.provider || 'openai'}
                  onChange={e => {
                    const providerKey = e.target.value
                    updateModel('provider', providerKey)
                    const recommended = PROVIDER_RECOMMENDED[providerKey]
                    if (recommended) updateModel('model_name', recommended)
                  }}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-t-secondary mb-1">Model</label>
                <select
                  value={mForm.model_name || 'gpt-4.1'}
                  onChange={e => updateModel('model_name', e.target.value)}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  {(selectedProvider?.models || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>

            {/* Advanced Settings */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1.5 text-xs text-t-secondary hover:text-white transition-colors"
              >
                {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Advanced Settings
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-4 border border-dark-border rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <label className="text-sm text-t-secondary">Temperature</label>
                        <span className="text-xs text-t-secondary">({(mForm.temperature ?? 0.7).toFixed(1)})</span>
                        <span title="Controls creativity. Lower = more factual, higher = more creative. 0.7 is recommended for hospitality.">
                          <Info size={11} className="text-t-secondary cursor-help" />
                        </span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={mForm.temperature ?? 0.7}
                        onChange={e => updateModel('temperature', parseFloat(e.target.value))}
                        className="w-full accent-primary-500"
                      />
                      <div className="flex justify-between text-xs text-t-secondary mt-0.5">
                        <span>Precise (0.0)</span><span>Creative (1.0)</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <label className="text-sm text-t-secondary">Max Response Tokens</label>
                        <span className="text-xs text-t-secondary">({mForm.max_tokens ?? 1024})</span>
                        <span title="Maximum length of AI response. 1024 allows ~750 words — good for detailed hotel info. Increase for very long answers.">
                          <Info size={11} className="text-t-secondary cursor-help" />
                        </span>
                      </div>
                      <input
                        type="range" min="200" max="4096" step="128"
                        value={mForm.max_tokens ?? 1024}
                        onChange={e => updateModel('max_tokens', parseInt(e.target.value))}
                        className="w-full accent-primary-500"
                      />
                      <div className="flex justify-between text-xs text-t-secondary mt-0.5">
                        <span>Short (200)</span><span>Detailed (4096)</span>
                      </div>
                    </div>
                  </div>
                  {/* Reasoning effort — only relevant for GPT-5.x models */}
                  {(mForm.model_name || '').startsWith('gpt-5') && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <label className="text-sm text-t-secondary">Reasoning Effort</label>
                        <span title="Controls how much GPT-5.x 'thinks' before answering. Higher effort = slower but deeper. For a fast sales chatbot, 'low' is ideal. Temperature is ignored unless set to 'none'.">
                          <Info size={11} className="text-t-secondary cursor-help" />
                        </span>
                      </div>
                      <select
                        value={mForm.reasoning_effort ?? 'low'}
                        onChange={e => updateModel('reasoning_effort', e.target.value)}
                        className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                      >
                        <option value="none">None — temperature active, fastest (like classic GPT)</option>
                        <option value="low">Low — light reasoning, fast responses ★ recommended for chat</option>
                        <option value="medium">Medium — balanced depth and speed</option>
                        <option value="high">High — deep reasoning, slower responses</option>
                        <option value="xhigh">xHigh — maximum reasoning, slowest (for complex analysis)</option>
                      </select>
                      {(mForm.reasoning_effort ?? 'low') !== 'none' && (
                        <p className="text-xs text-amber-400 mt-1">
                          Temperature and top_p are ignored when reasoning effort is active (none disables it).
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-t-secondary">
                    For luxury hospitality: temperature 0.7, tokens 1024–2048. Higher tokens for room descriptions & detailed policy explanations.
                    Note: o3/o4 reasoning models and GPT-5.x (with effort &gt; none) ignore temperature.
                  </p>
                </div>
              )}
            </div>
          </div>

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
                <select
                  value={bForm.language || 'en'}
                  onChange={e => updateBehavior('language', e.target.value)}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-t-secondary mb-1">Identity / Persona</label>
              <textarea
                value={bForm.identity || ''}
                onChange={e => updateBehavior('identity', e.target.value)}
                rows={5}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="You are a luxury hotel concierge AI assistant with deep knowledge of hospitality..."
              />
            </div>

            <div>
              <label className="block text-sm text-t-secondary mb-1">Goal</label>
              <textarea
                value={bForm.goal || ''}
                onChange={e => updateBehavior('goal', e.target.value)}
                rows={5}
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
                rows={6}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="Additional instructions for the AI assistant..."
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
            >
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
