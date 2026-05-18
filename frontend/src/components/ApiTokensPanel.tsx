import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, Plus, Copy, Trash2, AlertCircle, Loader2, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

/**
 * Personal API tokens — for external systems pushing leads into the CRM
 * via POST /v1/integrations/leads (Sanctum personal access tokens).
 *
 * Shown inside Settings → Integrations. Each token belongs to the
 * authenticated user; pushed leads land in that user's organisation.
 *
 * Security shape:
 *   - Plaintext token is shown ONCE on creation. We display it in a
 *     copy-to-clipboard box with a warning, and never show it again.
 *   - Subsequent listings show only the label, last-used time, and a
 *     revoke button.
 *   - Revocation is immediate.
 */

type Token = {
  id: number
  name: string
  label: string
  last_used_at: string | null
  created_at: string | null
}

type CreatedToken = Token & { token: string; warning: string }

export function ApiTokensPanel() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [justCreated, setJustCreated] = useState<CreatedToken | null>(null)
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api.get('/v1/admin/api-tokens').then(r => r.data),
  })

  const tokens: Token[] = data?.tokens ?? []

  const createMutation = useMutation({
    mutationFn: (label: string) => api.post('/v1/admin/api-tokens', { label }).then(r => r.data),
    onSuccess: (resp: CreatedToken) => {
      setJustCreated(resp)
      setNewLabel('')
      setCreating(false)
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Could not create token')
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/api-tokens/${id}`).then(r => r.data),
    onSuccess: () => {
      toast.success('Token revoked')
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
    onError: () => toast.error('Could not revoke token'),
  })

  const copyToken = () => {
    if (!justCreated) return
    navigator.clipboard.writeText(justCreated.token)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => toast.error('Could not copy'))
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
      style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))' }}>
      <div className="px-5 py-3.5 flex items-center gap-3 border-b border-white/[0.04]">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500/[0.12]">
          <Key size={15} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">API Tokens</div>
          <div className="text-[11px] text-gray-500 truncate">For external systems pushing leads via the public API</div>
        </div>
        <button onClick={() => { setCreating(true); setJustCreated(null) }}
          disabled={creating}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/20 hover:bg-amber-500/25 disabled:opacity-40 transition">
          <Plus size={12} /> New token
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-[12px] leading-relaxed text-gray-400">
          Generate a personal access token, then paste it into the third-party system's <code className="font-mono text-amber-300 text-[11px]">CRM_API_TOKEN</code> env var. Leads it pushes land in this account. Revoke instantly if a token leaks.
        </p>

        {/* Endpoint reference */}
        <div className="rounded-lg border border-white/[0.04] bg-black/30 p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Endpoint</div>
          <code className="block font-mono text-[11px] text-emerald-300 break-all">
            POST {window.location.origin}/api/v1/integrations/leads
          </code>
          <code className="block font-mono text-[10px] text-gray-500 mt-1">
            Authorization: Bearer &lt;token&gt;
          </code>
        </div>

        {/* New-token form */}
        {creating && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 space-y-2">
            <label className="block text-[11px] font-semibold text-amber-300 uppercase tracking-wider">Token label</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. FDS Card Builder"
                autoFocus
                maxLength={80}
                className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm text-white placeholder-gray-600"
              />
              <button onClick={() => createMutation.mutate(newLabel.trim())}
                disabled={!newLabel.trim() || createMutation.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 transition">
                {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Generate
              </button>
              <button onClick={() => { setCreating(false); setNewLabel('') }}
                className="text-xs text-gray-500 hover:text-white px-2 py-2">
                Cancel
              </button>
            </div>
            <p className="text-[10px] text-gray-500">
              Label is your reminder of what the token is for. Letters, numbers, spaces, underscores, dashes, dots only.
            </p>
          </div>
        )}

        {/* Just-created token (one-time display) */}
        {justCreated && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-amber-300">Copy this token now</div>
                <div className="text-[11px] text-gray-400 mt-0.5">It will not be shown again. If you lose it, revoke and create a new one.</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2.5 py-2 rounded bg-black/40 text-emerald-300 font-mono text-[11px] break-all">
                {justCreated.token}
              </code>
              <button onClick={copyToken}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition flex-shrink-0">
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <button onClick={() => setJustCreated(null)}
              className="text-[11px] text-gray-500 hover:text-white">
              I've saved it — dismiss
            </button>
          </div>
        )}

        {/* Existing tokens */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-gray-500" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-500">
            No tokens yet. Click <strong className="text-amber-400">New token</strong> to create one.
          </div>
        ) : (
          <div className="space-y-1.5">
            {tokens.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-white/[0.04] bg-black/20">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{t.label}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleString()}` : 'Never used yet'}
                    {t.created_at && <> · Created {new Date(t.created_at).toLocaleDateString()}</>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Revoke "${t.label}"? Any external system using this token will immediately stop working.`)) {
                      revokeMutation.mutate(t.id)
                    }
                  }}
                  disabled={revokeMutation.isPending}
                  className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded transition disabled:opacity-40"
                  title="Revoke this token"
                >
                  <Trash2 size={11} /> Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
