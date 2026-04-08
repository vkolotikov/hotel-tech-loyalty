import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import {
  Eye, Search, Circle, Globe, Clock, MessageSquare,
  User, Flag, ExternalLink, Activity,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

type StatusFilter = 'online' | 'offline' | 'all'

export function Visitors() {
  const [status, setStatus] = useState<StatusFilter>('online')
  const [leadOnly, setLeadOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
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

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Eye className="w-6 h-6 text-primary-500" />
            Website Visitors
          </h1>
          <p className="text-sm text-gray-400">Live visitor identities — deduplicated by IP + browser fingerprint</p>
        </div>
        <div className="flex gap-3">
          <StatPill label="Online" value={stats.online} color="text-emerald-400" />
          <StatPill label="Offline" value={stats.offline} color="text-gray-400" />
          <StatPill label="Leads" value={stats.leads} color="text-amber-400" />
          <StatPill label="Total" value={stats.total} color="text-white" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex bg-dark-800 rounded-lg p-1">
          {(['online', 'offline', 'all'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-4 py-1.5 rounded-md text-sm capitalize transition ${
                status === s ? 'bg-primary-500 text-dark-900 font-semibold' : 'text-gray-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={leadOnly}
            onChange={e => setLeadOnly(e.target.checked)}
            className="w-4 h-4 accent-primary-500"
          />
          Leads only
        </label>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, IP, page..."
            className="w-full bg-dark-800 border border-dark-700 rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder-gray-500"
          />
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
        {/* Visitor list */}
        <div className="lg:col-span-1 bg-dark-800 rounded-lg border border-dark-700 overflow-y-auto">
          {isLoading && <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>}
          {!isLoading && visitors.length === 0 && (
            <div className="p-6 text-center text-gray-500 text-sm">No visitors found</div>
          )}
          {visitors.map((v: any) => (
            <button
              key={v.id}
              onClick={() => setSelectedId(v.id)}
              className={`w-full text-left p-4 border-b border-dark-700 hover:bg-dark-700/50 transition ${
                selectedId === v.id ? 'bg-dark-700' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  {v.is_online && (
                    <Circle className="w-3 h-3 absolute -bottom-0.5 -right-0.5 fill-emerald-500 text-emerald-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">
                      {v.display_name || v.email || v.visitor_ip || 'Anonymous'}
                    </span>
                    {v.is_lead && (
                      <Flag className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                    <Globe className="w-3 h-3" />
                    {[v.city, v.country].filter(Boolean).join(', ') || v.visitor_ip || '—'}
                  </div>
                  {v.current_page && (
                    <div className="text-xs text-gray-400 truncate mt-1">
                      📄 {v.current_page_title || v.current_page}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                    <span>{v.page_views_count || 0} views</span>
                    <span>·</span>
                    <span>{v.visit_count || 1} visits</span>
                    {v.last_seen_at && (
                      <>
                        <span>·</span>
                        <span>{formatDistanceToNow(new Date(v.last_seen_at), { addSuffix: true })}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 bg-dark-800 rounded-lg border border-dark-700 overflow-y-auto">
          {!selectedId && (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Select a visitor to view details
            </div>
          )}
          {selectedId && !detail && (
            <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
          )}
          {detail && (
            <div className="p-6">
              {/* Visitor header */}
              <div className="flex items-start justify-between mb-6 pb-6 border-b border-dark-700">
                <div className="flex gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-dark-700 flex items-center justify-center">
                      <User className="w-8 h-8 text-gray-400" />
                    </div>
                    {detail.visitor.is_online && (
                      <Circle className="w-4 h-4 absolute -bottom-0.5 -right-0.5 fill-emerald-500 text-emerald-500" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {detail.visitor.display_name || detail.visitor.email || 'Anonymous Visitor'}
                    </h2>
                    <p className="text-sm text-gray-400">
                      {detail.visitor.is_online ? (
                        <span className="text-emerald-400">● Online now</span>
                      ) : (
                        <span>Last seen {detail.visitor.last_seen_at && formatDistanceToNow(new Date(detail.visitor.last_seen_at), { addSuffix: true })}</span>
                      )}
                    </p>
                    {detail.visitor.is_lead && detail.visitor.guest && (
                      <Link
                        to={`/guests/${detail.visitor.guest.id}`}
                        className="inline-flex items-center gap-1 mt-1 text-xs text-amber-400 hover:underline"
                      >
                        <Flag className="w-3 h-3" />
                        Lead — view guest profile
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <Field label="IP Address" value={detail.visitor.visitor_ip} />
                <Field label="Country" value={detail.visitor.country} />
                <Field label="City" value={detail.visitor.city} />
                <Field label="Email" value={detail.visitor.email} />
                <Field label="Phone" value={detail.visitor.phone} />
                <Field label="First Seen" value={detail.visitor.first_seen_at ? format(new Date(detail.visitor.first_seen_at), 'PP p') : null} />
                <Field label="Visit Count" value={detail.visitor.visit_count} />
                <Field label="Page Views" value={detail.visitor.page_views_count} />
                <Field label="Messages" value={detail.visitor.messages_count} />
              </div>

              {detail.visitor.referrer && (
                <div className="mb-6">
                  <div className="text-xs uppercase text-gray-500 mb-1">Referrer</div>
                  <div className="text-sm text-gray-300 break-all">{detail.visitor.referrer}</div>
                </div>
              )}

              {/* Page view timeline */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary-500" />
                  Page View History ({detail.page_views?.length || 0})
                </h3>
                {(!detail.page_views || detail.page_views.length === 0) ? (
                  <p className="text-xs text-gray-500">No page views tracked yet</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                    {detail.page_views.map((pv: any) => (
                      <div key={pv.id} className="flex items-start gap-3 text-xs bg-dark-700/40 rounded p-2">
                        <Clock className="w-3 h-3 text-gray-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-gray-300 truncate">{pv.page_title || pv.page_url}</div>
                          {pv.page_title && (
                            <div className="text-gray-500 truncate text-[10px]">{pv.page_url}</div>
                          )}
                        </div>
                        <div className="text-gray-500 flex-shrink-0">
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
                  <MessageSquare className="w-4 h-4 text-primary-500" />
                  Chat Conversations ({detail.conversations?.length || 0})
                </h3>
                {(!detail.conversations || detail.conversations.length === 0) ? (
                  <p className="text-xs text-gray-500">No chat history</p>
                ) : (
                  <div className="space-y-2">
                    {detail.conversations.map((c: any) => (
                      <Link
                        key={c.id}
                        to={`/chat-inbox?id=${c.id}`}
                        className="flex items-center justify-between bg-dark-700/40 hover:bg-dark-700 rounded p-3 transition"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">
                            {c.visitor_name || `Conversation #${c.id}`}
                          </div>
                          <div className="text-xs text-gray-500">
                            {c.messages_count} messages · {c.channel} ·{' '}
                            <span className={`capitalize ${
                              c.status === 'active' ? 'text-emerald-400' :
                              c.status === 'waiting' ? 'text-amber-400' :
                              'text-gray-500'
                            }`}>{c.status}</span>
                            {c.lead_captured && <span className="text-amber-400"> · Lead captured</span>}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 flex-shrink-0 ml-3">
                          {c.last_message_at && formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="text-sm text-white truncate">{value || '—'}</div>
    </div>
  )
}
