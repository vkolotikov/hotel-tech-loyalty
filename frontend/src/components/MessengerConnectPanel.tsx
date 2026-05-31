import { useState, useEffect, useCallback } from 'react'
import {
  Facebook, Plus, RefreshCw, Trash2, AlertCircle, CheckCircle2,
  ExternalLink, Loader2, X, MessageCircle, ChevronRight, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

/**
 * Settings → Integrations → Facebook Messenger connection panel.
 *
 * Drives the customer-facing OAuth flow against our admin endpoints
 * (see app/Http/Controllers/Api/V1/Admin/MessengerIntegrationController.php).
 * Replaces the artisan `messenger:connect-page` CLI bridge with a
 * real UI customers can use to self-onboard.
 *
 * Flow:
 *   1. Mount → fetch /config + list of connected accounts
 *   2. User clicks "Connect Facebook Page" → load FB JS SDK on demand,
 *      init with our app_id, FB.login() with required scopes
 *   3. Got short-lived user token → POST /list-pages → backend exchanges
 *      to long-lived + returns the user's manageable Pages
 *   4. User picks a Page from the modal → POST /connect → backend creates
 *      the ChatChannelAccount + subscribes the Page to webhooks
 *   5. New row appears in the connected list
 *
 * Per-row actions: Verify (force token health check), Reconnect (when
 * status=reauth_required), Disconnect (with confirm + smart Meta-sub
 * handling via the backend).
 *
 * The FB SDK is lazy-loaded only when the user actually clicks Connect
 * — keeps it out of the initial admin bundle for orgs that never use
 * Messenger.
 */

interface MessengerConfig {
  configured: boolean
  app_id: string
  graph_version: string
  required_scopes: string[]
  subscribed_fields: string[]
}

interface MessengerAccount {
  id: number
  channel: string
  external_id: string
  display_name: string | null
  display_avatar_url: string | null
  status: 'active' | 'reauth_required' | 'disconnected'
  brand_id: number | null
  token_verified_at: string | null
  last_webhook_at: string | null
  last_error: string | null
  connected_by_user_id: number | null
  created_at: string | null
  updated_at: string | null
}

interface PageOption {
  id: string
  name: string
  picture_url: string | null
  access_token: string
  already_connected: boolean
}

declare global {
  interface Window {
    FB?: any
    fbAsyncInit?: () => void
  }
}

function loadFbSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already loaded — just re-init in case appId changed mid-session.
    if (window.FB) {
      try { window.FB.init({ appId, cookie: true, xfbml: false, version }) } catch { /* noop */ }
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      try {
        window.FB.init({ appId, cookie: true, xfbml: false, version })
        resolve()
      } catch (e: any) {
        reject(new Error(`FB.init failed: ${e?.message || 'unknown'}`))
      }
    }
    script.onerror = () => reject(new Error('Could not load the Facebook JS SDK — check network / ad blockers'))
    document.head.appendChild(script)
  })
}

function fbLogin(scope: string): Promise<{ accessToken: string; userID: string }> {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('FB SDK not loaded'))
      return
    }
    window.FB.login(
      (response: any) => {
        if (response?.authResponse?.accessToken) {
          resolve({
            accessToken: response.authResponse.accessToken,
            userID: response.authResponse.userID,
          })
        } else {
          reject(new Error('Facebook login was cancelled or denied'))
        }
      },
      { scope, return_scopes: true, auth_type: 'rerequest' }
    )
  })
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`
  return `${Math.round(diff / 86_400_000)} d ago`
}

export function MessengerConnectPanel() {
  const [config, setConfig] = useState<MessengerConfig | null>(null)
  const [accounts, setAccounts] = useState<MessengerAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [availablePages, setAvailablePages] = useState<PageOption[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, listRes] = await Promise.all([
        api.get('/v1/admin/integrations/messenger/config'),
        api.get('/v1/admin/integrations/messenger'),
      ])
      setConfig(cfgRes.data)
      setAccounts(listRes.data?.data ?? [])
      setError(null)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Failed to load Messenger integration state')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const startConnect = async () => {
    if (!config?.configured) {
      toast.error('Messenger app credentials not configured on the server')
      return
    }
    setConnecting(true)
    try {
      await loadFbSdk(config.app_id, config.graph_version)
      const auth = await fbLogin(config.required_scopes.join(','))
      const { data } = await api.post('/v1/admin/integrations/messenger/list-pages', {
        user_token: auth.accessToken,
      })
      const pages: PageOption[] = data?.data ?? []
      if (pages.length === 0) {
        toast.error('No Facebook Pages found that you can manage with messaging access')
        return
      }
      setAvailablePages(pages)
      setPickerOpen(true)
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Connection flow failed')
    } finally {
      setConnecting(false)
    }
  }

  const pickPage = async (page: PageOption) => {
    setConnecting(true)
    try {
      const { data } = await api.post('/v1/admin/integrations/messenger', {
        page_id: page.id,
        page_token: page.access_token,
        display_name: page.name,
        avatar_url: page.picture_url,
      })
      setAccounts(prev => [data, ...prev.filter(a => a.id !== data.id)])
      setPickerOpen(false)
      toast.success(`Connected ${page.name}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Could not connect this Page')
    } finally {
      setConnecting(false)
    }
  }

  const verifyAccount = async (account: MessengerAccount) => {
    try {
      const { data } = await api.post(`/v1/admin/integrations/messenger/${account.id}/verify`)
      setAccounts(prev => prev.map(a => (a.id === data.id ? data : a)))
      toast.success(data.status === 'active' ? 'Token still healthy' : 'Token needs to be re-connected')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Verify failed')
    }
  }

  const reconnectAccount = async (account: MessengerAccount) => {
    if (!config?.configured) return
    try {
      await loadFbSdk(config.app_id, config.graph_version)
      const auth = await fbLogin(config.required_scopes.join(','))
      const { data: pages } = await api.post('/v1/admin/integrations/messenger/list-pages', {
        user_token: auth.accessToken,
      })
      const matching: PageOption | undefined = (pages?.data ?? []).find((p: PageOption) => p.id === account.external_id)
      if (!matching) {
        toast.error(`The Facebook account you logged in with does not manage ${account.display_name}`)
        return
      }
      const { data } = await api.post(`/v1/admin/integrations/messenger/${account.id}/reconnect`, {
        page_token: matching.access_token,
      })
      setAccounts(prev => prev.map(a => (a.id === data.id ? data : a)))
      toast.success('Reconnected')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Reconnect failed')
    }
  }

  const disconnectAccount = async (account: MessengerAccount) => {
    if (!window.confirm(`Disconnect ${account.display_name}? Messages to this Page will stop arriving in Engagement.`)) return
    try {
      await api.delete(`/v1/admin/integrations/messenger/${account.id}`)
      setAccounts(prev => prev.filter(a => a.id !== account.id))
      toast.success('Disconnected')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Disconnect failed')
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b border-dark-border">
        <div className="w-10 h-10 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
          <Facebook size={20} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Facebook Messenger</h3>
            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400">Live</span>
          </div>
          <p className="text-xs text-t-secondary mt-0.5 leading-relaxed">
            Receive Messenger DMs in <strong className="text-white">Engagement</strong> and reply via AI or live agent.
            Each connected Page channels into a single inbox.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-1.5 rounded-md text-t-secondary hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Not-configured (Meta env credentials missing) */}
      {!loading && config && !config.configured && (
        <div className="p-4 bg-amber-500/[0.06] border-b border-amber-500/20">
          <div className="flex items-start gap-2 text-xs">
            <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-200 font-semibold">Server not configured for Messenger yet.</p>
              <p className="text-amber-300/80 mt-1">
                Your platform owner needs to provision a Meta Developer App and add{' '}
                <code className="px-1.5 py-0.5 bg-amber-500/[0.10] rounded text-[10px]">META_APP_ID</code>,{' '}
                <code className="px-1.5 py-0.5 bg-amber-500/[0.10] rounded text-[10px]">META_APP_SECRET</code> and{' '}
                <code className="px-1.5 py-0.5 bg-amber-500/[0.10] rounded text-[10px]">META_WEBHOOK_VERIFY_TOKEN</code>{' '}
                to the production environment. See <code className="px-1.5 py-0.5 bg-amber-500/[0.10] rounded text-[10px]">apps/loyalty/MESSENGER_INTEGRATION.md</code> in the codebase for the full setup.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="p-8 flex items-center justify-center text-t-secondary text-xs">
          <Loader2 size={14} className="animate-spin mr-2" /> Loading…
        </div>
      )}

      {/* Error fallback */}
      {!loading && error && (
        <div className="p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Connected pages list */}
      {!loading && !error && accounts.length > 0 && (
        <div className="divide-y divide-dark-border">
          {accounts.map(a => (
            <ConnectedRow
              key={a.id}
              account={a}
              onVerify={() => verifyAccount(a)}
              onReconnect={() => reconnectAccount(a)}
              onDisconnect={() => disconnectAccount(a)}
              configReady={Boolean(config?.configured)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && accounts.length === 0 && config?.configured && (
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/[0.10] border border-blue-500/25 flex items-center justify-center mx-auto mb-3">
            <MessageCircle size={20} className="text-blue-400" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">No Facebook Page connected yet</p>
          <p className="text-xs text-t-secondary leading-relaxed max-w-md mx-auto mb-4">
            Connect your Facebook Page to capture DMs as leads, auto-respond with your AI, or chat as a human agent — all from Engagement.
          </p>
          <ul className="text-[11px] text-t-secondary space-y-1 mb-4 text-left max-w-xs mx-auto">
            <li className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />You stay in control — admin can disconnect anytime</li>
            <li className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />We never see your Facebook password</li>
            <li className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />Tokens encrypted at rest in our database</li>
          </ul>
        </div>
      )}

      {/* CTA footer */}
      {!loading && !error && config?.configured && (
        <div className="p-3 bg-dark-bg/40 border-t border-dark-border flex items-center justify-between gap-3">
          <p className="text-[11px] text-t-secondary">
            {accounts.length === 0 ? 'Connect a Page to get started' : `${accounts.length} Page${accounts.length === 1 ? '' : 's'} connected`}
          </p>
          <button
            onClick={startConnect}
            disabled={connecting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
          >
            {connecting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Connect Facebook Page
          </button>
        </div>
      )}

      {/* Page-picker modal */}
      {pickerOpen && (
        <PagePickerModal
          pages={availablePages}
          onPick={pickPage}
          onClose={() => setPickerOpen(false)}
          busy={connecting}
        />
      )}
    </div>
  )
}

// ─── ConnectedRow ────────────────────────────────────────────────────

function ConnectedRow({
  account, onVerify, onReconnect, onDisconnect, configReady,
}: {
  account: MessengerAccount
  onVerify: () => void
  onReconnect: () => void
  onDisconnect: () => void
  configReady: boolean
}) {
  const statusMeta = {
    active:           { label: 'Active',          cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 },
    reauth_required:  { label: 'Reconnect needed', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',     icon: AlertCircle },
    disconnected:     { label: 'Disconnected',    cls: 'bg-red-500/15 text-red-300 border-red-500/30',            icon: X },
  }[account.status] ?? { label: account.status, cls: 'bg-white/[0.06] text-gray-300', icon: AlertCircle }

  return (
    <div className="p-4 flex items-start gap-3">
      {account.display_avatar_url ? (
        // eslint-disable-next-line jsx-a11y/img-redundant-alt
        <img
          src={account.display_avatar_url}
          alt={`${account.display_name ?? 'Page'} avatar`}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-dark-bg"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
          <Facebook size={16} className="text-blue-400" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-white truncate">{account.display_name || `Page ${account.external_id}`}</h4>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${statusMeta.cls}`}>
            <statusMeta.icon size={9} />
            {statusMeta.label}
          </span>
        </div>
        <div className="text-[11px] text-t-secondary mt-1 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Clock size={10} />
            Last received {relativeTime(account.last_webhook_at)}
          </span>
          {account.token_verified_at && (
            <span className="inline-flex items-center gap-1">
              Token checked {relativeTime(account.token_verified_at)}
            </span>
          )}
          <span className="text-t-secondary/60">ID {account.external_id}</span>
        </div>
        {account.last_error && (
          <div className="mt-2 text-[11px] text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded px-2 py-1.5 flex items-start gap-1.5">
            <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
            <span className="break-words">{account.last_error}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onVerify}
          className="p-1.5 rounded-md text-t-secondary hover:text-white hover:bg-white/[0.04]"
          title="Verify token health"
        >
          <RefreshCw size={13} />
        </button>
        {account.status === 'reauth_required' && configReady && (
          <button
            onClick={onReconnect}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
          >
            <ExternalLink size={11} /> Reconnect
          </button>
        )}
        <button
          onClick={onDisconnect}
          className="p-1.5 rounded-md text-t-secondary hover:text-red-400 hover:bg-red-500/[0.08]"
          title="Disconnect"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── PagePickerModal ─────────────────────────────────────────────────

function PagePickerModal({
  pages, onPick, onClose, busy,
}: {
  pages: PageOption[]
  onPick: (page: PageOption) => void
  onClose: () => void
  busy: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-dark-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Pick a Page to connect</h3>
            <p className="text-[11px] text-t-secondary mt-0.5">
              These are the Facebook Pages you can manage with messaging access.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-t-secondary hover:text-white hover:bg-white/[0.04]">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {pages.map(p => (
            <button
              key={p.id}
              disabled={busy || p.already_connected}
              onClick={() => onPick(p)}
              className="w-full p-3 flex items-center gap-3 border-b border-dark-border hover:bg-white/[0.02] transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {p.picture_url ? (
                // eslint-disable-next-line jsx-a11y/img-redundant-alt
                <img
                  src={p.picture_url}
                  alt={`${p.name} avatar`}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-dark-bg"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <Facebook size={16} className="text-blue-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                <p className="text-[11px] text-t-secondary mt-0.5">ID {p.id}</p>
              </div>
              {p.already_connected ? (
                <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 inline-flex items-center gap-1">
                  <CheckCircle2 size={10} /> Connected
                </span>
              ) : (
                <ChevronRight size={14} className="text-t-secondary flex-shrink-0" />
              )}
            </button>
          ))}
          {pages.length === 0 && (
            <div className="p-8 text-center text-xs text-t-secondary">No Pages available.</div>
          )}
        </div>
      </div>
    </div>
  )
}
