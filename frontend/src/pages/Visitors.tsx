import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  Eye, Search, Globe, Clock, MessageSquare, MessageCircle,
  User, Flag, ExternalLink, Activity, Users, Wifi, WifiOff,
  Mail, Phone, Star, ArrowUpRight, RefreshCw, Trash2,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'

type StatusFilter = 'online' | 'offline' | 'all'

export function Visitors() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StatusFilter>('online')
  const [leadOnly, setLeadOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['visitors', status, leadOnly, search],
    queryFn: () => api.get('/v1/admin/visitors', {
      params: {
        status,
        lead_only: leadOnly ? 1 : undefined,
        search: search || undefined,
      },
    }).then(r => r.data),
    refetchInterval: 10000,
  })

  const visitors = data?.data || []
  const stats = data?.stats || { online: 0, offline: 0, leads: 0, total: 0 }

  const { data: detail } = useQuery({
    queryKey: ['visitor-detail', selectedId],
    queryFn: () => api.get(`/v1/admin/visitors/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
    refetchInterval: 15000,
  })

  const startChat = useMutation({
    mutationFn: (visitorId: number) => api.post(`/v1/admin/visitors/${visitorId}/start-chat`).then(r => r.data),
    onSuccess: (data) => {
      navigate(`/chat-inbox?id=${data.conversation_id}`)
    },
    onError: () => toast.error('Failed to open chat'),
  })

  const deleteVisitor = useMutation({
    mutationFn: (visitorId: number) => api.delete(`/v1/admin/visitors/${visitorId}`).then(r => r.data),
    onSuccess: () => {
      toast.success('Visitor removed')
      setSelectedId(null)
      queryClient.invalidateQueries({ queryKey: ['visitors'] })
    },
    onError: () => toast.error('Failed to remove visitor'),
  })

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Permanently delete "${name}" and all their page views and chat conversations? This cannot be undone.`)) return
    deleteVisitor.mutate(id)
  }

  const selectedVisitor = useMemo(() => detail?.visitor, [detail])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/30 flex items-center justify-center">
            <Eye className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Live Visitors</h1>
            <p className="text-sm text-t-secondary">Real-time visitor tracking — deduplicated by IP + browser fingerprint</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dark-border text-t-secondary hover:text-white hover:border-dark-border2 text-sm transition"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Wifi}
          label="Online Now"
          value={stats.online}
          color="emerald"
          active={status === 'online'}
          onClick={() => setStatus('online')}
        />
        <StatCard
          icon={WifiOff}
          label="Offline"
          value={stats.offline}
          color="gray"
          active={status === 'offline'}
          onClick={() => setStatus('offline')}
        />
        <StatCard
          icon={Star}
          label="Leads"
          value={stats.leads}
          color="amber"
          active={leadOnly}
          onClick={() => setLeadOnly(v => !v)}
        />
        <StatCard
          icon={Users}
          label="All Visitors"
          value={stats.total}
          color="blue"
          active={status === 'all' && !leadOnly}
          onClick={() => { setStatus('all'); setLeadOnly(false) }}
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, IP, or page..."
          className="w-full bg-dark-surface border border-dark-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/60"
        />
      </div>

      {/* Two-pane */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Visitor list */}
        <div className="lg:col-span-2 bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {visitors.length} visitor{visitors.length !== 1 ? 's' : ''}
            </h3>
            <span className="text-xs text-t-secondary capitalize">{leadOnly ? 'leads · ' : ''}{status}</span>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {isLoading && <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>}
            {!isLoading && visitors.length === 0 && (
              <div className="p-12 text-center">
                <Users className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No visitors found</p>
              </div>
            )}
            {visitors.map((v: any) => (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(v.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(v.id) }}
                className={`group w-full text-left p-4 border-b border-dark-border/50 hover:bg-dark-surface2 transition cursor-pointer relative ${
                  selectedId === v.id ? 'bg-primary-500/5 border-l-2 border-l-primary-500' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      v.is_lead ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-dark-surface2 border border-dark-border'
                    }`}>
                      <User className={`w-5 h-5 ${v.is_lead ? 'text-amber-400' : 'text-gray-400'}`} />
                    </div>
                    {v.is_online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-dark-surface" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-white truncate">
                        {v.display_name || v.email || v.visitor_ip || 'Anonymous'}
                      </span>
                      {v.is_lead && (
                        <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Lead</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                      <Globe className="w-3 h-3 flex-shrink-0" />
                      {[v.city, v.country].filter(Boolean).join(', ') || v.visitor_ip || '—'}
                    </div>
                    {v.current_page && (
                      <div className="text-xs text-gray-400 truncate mt-1 flex items-center gap-1">
                        <Activity className="w-3 h-3 flex-shrink-0 text-primary-400" />
                        <span className="truncate">{v.current_page_title || v.current_page}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-500">
                      <span className="bg-dark-surface2 px-1.5 py-0.5 rounded">{v.page_views_count || 0} views</span>
                      <span className="bg-dark-surface2 px-1.5 py-0.5 rounded">{v.visit_count || 1} visits</span>
                      {v.last_seen_at && (
                        <span className="ml-auto text-gray-600">{formatDistanceToNow(new Date(v.last_seen_at), { addSuffix: true })}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(v.id, v.display_name || v.email || v.visitor_ip || 'Anonymous') }}
                  title="Delete visitor"
                  className="absolute top-2 right-2 p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-600/10 opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-3 bg-dark-surface border border-dark-border rounded-xl overflow-hidden min-h-[640px]">
          {!selectedId && (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 p-12">
              <div className="w-16 h-16 rounded-2xl bg-dark-surface2 border border-dark-border flex items-center justify-center mb-4">
                <Eye className="w-7 h-7 text-gray-600" />
              </div>
              <p className="text-sm">Select a visitor to see details</p>
            </div>
          )}
          {selectedId && !detail && (
            <div className="p-12 text-center text-gray-500 text-sm">Loading visitor details...</div>
          )}
          {detail && selectedVisitor && (
            <>
              {/* Detail header */}
              <div className="p-6 border-b border-dark-border bg-gradient-to-br from-dark-surface to-dark-surface2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                        selectedVisitor.is_lead ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-dark-surface3 border border-dark-border'
                      }`}>
                        <User className={`w-8 h-8 ${selectedVisitor.is_lead ? 'text-amber-400' : 'text-gray-400'}`} />
                      </div>
                      {selectedVisitor.is_online && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-dark-surface" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        {selectedVisitor.display_name || selectedVisitor.email || 'Anonymous Visitor'}
                      </h2>
                      <div className="flex items-center gap-3 mt-1 text-sm">
                        {selectedVisitor.is_online ? (
                          <span className="text-emerald-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Online now
                          </span>
                        ) : (
                          <span className="text-gray-500">
                            Last seen {selectedVisitor.last_seen_at && formatDistanceToNow(new Date(selectedVisitor.last_seen_at), { addSuffix: true })}
                          </span>
                        )}
                        {selectedVisitor.is_lead && (
                          <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                            <Flag className="w-3 h-3 inline mr-1" /> Lead
                          </span>
                        )}
                      </div>
                      {selectedVisitor.is_lead && selectedVisitor.guest && (
                        <Link
                          to={`/guests/${selectedVisitor.guest.id}`}
                          className="inline-flex items-center gap-1 mt-2 text-xs text-primary-400 hover:text-primary-300"
                        >
                          View guest profile <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startChat.mutate(selectedVisitor.id)}
                      disabled={startChat.isPending}
                      className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {startChat.isPending ? 'Opening...' : 'Start Chat'}
                    </button>
                    <button
                      onClick={() => handleDelete(selectedVisitor.id, selectedVisitor.display_name || selectedVisitor.email || selectedVisitor.visitor_ip || 'Anonymous Visitor')}
                      disabled={deleteVisitor.isPending}
                      title="Delete visitor"
                      className="flex items-center gap-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/30 px-3 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-3 gap-3 mt-5">
                  <QuickStat label="Page Views" value={selectedVisitor.page_views_count || 0} />
                  <QuickStat label="Visits" value={selectedVisitor.visit_count || 1} />
                  <QuickStat label="Messages" value={selectedVisitor.messages_count || 0} />
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Contact + Location grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="IP Address" value={selectedVisitor.visitor_ip} mono />
                  <Field label="Country" value={selectedVisitor.country} />
                  <Field label="City" value={selectedVisitor.city} />
                  <Field label="Email" value={selectedVisitor.email} icon={Mail} />
                  <Field label="Phone" value={selectedVisitor.phone} icon={Phone} />
                  <Field label="First Seen" value={selectedVisitor.first_seen_at ? format(new Date(selectedVisitor.first_seen_at), 'PP') : null} />
                </div>

                {selectedVisitor.referrer && (
                  <div className="bg-dark-surface2 rounded-lg p-3 border border-dark-border">
                    <div className="text-[10px] uppercase text-gray-500 mb-1 font-semibold">Came From</div>
                    <a href={selectedVisitor.referrer} target="_blank" rel="noreferrer" className="text-xs text-primary-400 hover:underline break-all flex items-center gap-1">
                      {selectedVisitor.referrer} <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </div>
                )}

                {/* Page view timeline */}
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary-400" />
                    Page Journey
                    <span className="text-xs text-gray-500 font-normal">({detail.page_views?.length || 0})</span>
                  </h3>
                  {(!detail.page_views || detail.page_views.length === 0) ? (
                    <div className="bg-dark-surface2 rounded-lg p-4 text-center text-xs text-gray-500 border border-dark-border border-dashed">
                      No page views tracked yet
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-2">
                      {detail.page_views.map((pv: any, i: number) => (
                        <div key={pv.id} className="flex items-start gap-3 bg-dark-surface2 rounded-lg p-2.5 border border-dark-border/50 hover:border-primary-500/30 transition">
                          <div className="w-6 h-6 rounded-full bg-primary-500/10 flex items-center justify-center text-[10px] text-primary-400 font-bold flex-shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white truncate font-medium">{pv.title || pv.url}</div>
                            {pv.title && (
                              <div className="text-[10px] text-gray-500 truncate">{pv.url}</div>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500 flex items-center gap-1 flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(pv.viewed_at), { addSuffix: true })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Linked conversations */}
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary-400" />
                    Chat History
                    <span className="text-xs text-gray-500 font-normal">({detail.conversations?.length || 0})</span>
                  </h3>
                  {(!detail.conversations || detail.conversations.length === 0) ? (
                    <div className="bg-dark-surface2 rounded-lg p-4 text-center text-xs text-gray-500 border border-dark-border border-dashed">
                      No conversations yet — click <span className="text-primary-400">Start Chat</span> to begin one
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {detail.conversations.map((c: any) => (
                        <Link
                          key={c.id}
                          to={`/chat-inbox?id=${c.id}`}
                          className="flex items-center justify-between bg-dark-surface2 hover:bg-dark-surface3 rounded-lg p-3 border border-dark-border/50 hover:border-primary-500/30 transition"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate font-medium">
                              {c.visitor_name || `Conversation #${c.id}`}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                              <span>{c.messages_count} messages</span>
                              <span>·</span>
                              <span>{c.channel}</span>
                              <span>·</span>
                              <span className={`capitalize ${
                                c.status === 'active' ? 'text-emerald-400' :
                                c.status === 'waiting' ? 'text-amber-400' :
                                'text-gray-500'
                              }`}>{c.status}</span>
                              {c.lead_captured && <span className="text-amber-400">· Lead captured</span>}
                            </div>
                          </div>
                          <div className="text-[10px] text-gray-500 flex-shrink-0 ml-3 text-right">
                            {c.last_message_at && formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, active, onClick }: any) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    gray:    'text-gray-400 bg-gray-500/10 border-gray-500/30',
    amber:   'text-amber-400 bg-amber-500/10 border-amber-500/30',
    blue:    'text-blue-400 bg-blue-500/10 border-blue-500/30',
  }
  return (
    <button
      onClick={onClick}
      className={`text-left bg-dark-surface border rounded-xl p-4 transition ${
        active ? 'border-primary-500/60 ring-2 ring-primary-500/20' : 'border-dark-border hover:border-dark-border2'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        {active && <span className="text-[10px] uppercase text-primary-400 font-bold">Active</span>}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-t-secondary mt-0.5">{label}</div>
    </button>
  )
}

function QuickStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-dark-surface3/50 rounded-lg p-3 border border-dark-border/50">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-[10px] uppercase text-gray-500 font-semibold mt-0.5">{label}</div>
    </div>
  )
}

function Field({ label, value, mono, icon: Icon }: { label: string; value: any; mono?: boolean; icon?: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500 mb-1 font-semibold flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={`text-sm text-white truncate ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  )
}
