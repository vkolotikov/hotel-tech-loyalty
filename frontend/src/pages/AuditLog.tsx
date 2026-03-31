import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ScrollText, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'
import { format } from 'date-fns'

const ACTION_COLORS: Record<string, string> = {
  member_created: 'bg-[#32d74b]/15 text-[#32d74b]',
  tier_created: 'bg-[#32d74b]/15 text-[#32d74b]',
  tier_upgraded: 'bg-[#32d74b]/15 text-[#32d74b]',
  member_updated: 'bg-[#3b82f6]/15 text-[#3b82f6]',
  tier_updated: 'bg-[#3b82f6]/15 text-[#3b82f6]',
  setting_updated: 'bg-[#3b82f6]/15 text-[#3b82f6]',
  points_awarded: 'bg-[#f59e0b]/15 text-[#f59e0b]',
  points_redeemed: 'bg-[#f59e0b]/15 text-[#f59e0b]',
  points_reversed: 'bg-[#ef4444]/15 text-[#ef4444]',
  tier_override: 'bg-[#f97316]/15 text-[#f97316]',
  tier_downgraded: 'bg-[#f97316]/15 text-[#f97316]',
  nfc_deactivated: 'bg-[#ef4444]/15 text-[#ef4444]',
  logo_uploaded: 'bg-[#8b5cf6]/15 text-[#8b5cf6]',
}
const DEFAULT_COLOR = 'bg-dark-surface3 text-[#a0a0a0]'

function ChangesCell({ oldValues, newValues }: { oldValues: any; newValues: any }) {
  const [expanded, setExpanded] = useState(false)
  const hasOld = oldValues && Object.keys(oldValues).length > 0
  const hasNew = newValues && Object.keys(newValues).length > 0
  if (!hasOld && !hasNew) return <span className="text-[#636366]">—</span>

  const keys = [...new Set([...Object.keys(newValues || {}), ...Object.keys(oldValues || {})])]
  const preview = keys.slice(0, 2).map(k => `${k}: ${newValues?.[k] ?? '—'}`).join(', ')

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-[#a0a0a0] hover:text-white">
        <span className="truncate max-w-[200px]">{preview}{keys.length > 2 ? ` +${keys.length - 2}` : ''}</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && (
        <div className="mt-2 text-[11px] space-y-1 bg-[#1a1a1a] rounded-lg p-2 border border-dark-border">
          {keys.map(k => (
            <div key={k} className="flex gap-2">
              <span className="text-[#636366] min-w-[80px]">{k}:</span>
              {hasOld && oldValues[k] !== undefined && (
                <span className="text-red-400 line-through">{String(oldValues[k])}</span>
              )}
              {hasNew && newValues[k] !== undefined && (
                <span className="text-green-400">{String(newValues[k])}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AuditLog() {
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [subjectType, setSubjectType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', search, action, subjectType, dateFrom, dateTo, page],
    queryFn: () => api.get('/v1/admin/audit-logs', {
      params: {
        search: search || undefined,
        action: action || undefined,
        subject_type: subjectType || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        page,
      },
    }).then(r => r.data),
  })

  const { data: actions } = useQuery({
    queryKey: ['audit-log-actions'],
    queryFn: () => api.get('/v1/admin/audit-logs/actions').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: subjectTypes } = useQuery({
    queryKey: ['audit-log-subject-types'],
    queryFn: () => api.get('/v1/admin/audit-logs/subject-types').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <ScrollText size={24} className="text-primary-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Log</h1>
            <p className="text-sm text-[#8e8e93] mt-0.5">Track all changes for compliance and operations</p>
          </div>
        </div>
      </div>

      <Card>
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input
              type="text"
              placeholder="Search descriptions..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-4 py-2 bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={action}
            onChange={e => { setAction(e.target.value); setPage(1) }}
            className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Actions</option>
            {(actions ?? []).map((a: string) => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select
            value={subjectType}
            onChange={e => { setSubjectType(e.target.value); setPage(1) }}
            className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Entities</option>
            {(subjectTypes ?? []).map((t: { value: string; label: string }) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="To"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#8e8e93] border-b border-dark-border">
                <th className="pb-3 font-medium">Timestamp</th>
                <th className="pb-3 font-medium">Action</th>
                <th className="pb-3 font-medium">Entity</th>
                <th className="pb-3 font-medium">User</th>
                <th className="pb-3 font-medium">Description</th>
                <th className="pb-3 font-medium">Changes</th>
                <th className="pb-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {isLoading ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(7).fill(0).map((_, j) => (
                      <td key={j} className="py-3"><div className="h-4 bg-dark-surface2 rounded animate-pulse w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : (data as any)?.data?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#636366]">
                    No audit logs found.
                  </td>
                </tr>
              ) : (
                ((data as any)?.data ?? []).map((log: any) => (
                  <tr key={log.id} className="hover:bg-dark-surface2 transition-colors">
                    <td className="py-3 text-xs text-[#a0a0a0] whitespace-nowrap">
                      {log.created_at ? format(new Date(log.created_at), 'MMM d, yyyy HH:mm') : '—'}
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${ACTION_COLORS[log.action] ?? DEFAULT_COLOR}`}>
                        {log.action?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="text-xs">
                        <span className="text-white font-medium">{log.subject_type_label}</span>
                        {log.subject_id && <span className="text-[#636366] ml-1">#{log.subject_id}</span>}
                      </div>
                    </td>
                    <td className="py-3 text-xs text-white">{log.causer_name ?? <span className="text-[#636366]">System</span>}</td>
                    <td className="py-3 text-xs text-[#a0a0a0] max-w-[200px] truncate">{log.description ?? '—'}</td>
                    <td className="py-3">
                      <ChangesCell oldValues={log.old_values} newValues={log.new_values} />
                    </td>
                    <td className="py-3 text-[11px] text-[#636366] font-mono">{log.ip_address ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(data as any)?.meta && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-border">
            <p className="text-sm text-[#8e8e93]">
              Showing {(data as any).meta.from ?? 0}–{(data as any).meta.to ?? 0} of {(data as any).meta.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-dark-border text-[#a0a0a0] rounded-lg disabled:opacity-50 hover:bg-dark-surface2 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= ((data as any).meta.last_page ?? 1)}
                className="px-3 py-1.5 text-sm border border-dark-border text-[#a0a0a0] rounded-lg disabled:opacity-50 hover:bg-dark-surface2 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
