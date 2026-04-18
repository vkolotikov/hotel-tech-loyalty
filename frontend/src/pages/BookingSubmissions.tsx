import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Search, ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react'
import { money } from '../lib/money'

export function BookingSubmissions({ embedded = false }: { embedded?: boolean } = {}) {
  const [search, setSearch] = useState('')
  const [outcome, setOutcome] = useState('')
  const [page, setPage] = useState(1)

  const params: any = { page }
  if (search) params.search = search
  if (outcome) params.outcome = outcome

  const { data, isLoading } = useQuery({
    queryKey: ['booking-submissions', params],
    queryFn: () => api.get('/v1/admin/bookings/submissions', { params }).then(r => r.data),
  })

  const items = data?.data ?? []
  const lastPage = data?.last_page ?? 1

  const selectClass = 'bg-[#0f1c18] border border-white/[0.08] rounded-xl text-sm text-white px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/40'

  return (
    <div className="space-y-7">
      {!embedded && (
        <div>
          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ background: 'rgba(116,200,149,0.12)', color: '#74c895' }}>Submissions</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Booking Submissions</h1>
          <p className="text-sm text-gray-500 mt-1">Log of all booking attempts — successful and failed</p>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-2xl p-4 border border-white/[0.06]"
        style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))', boxShadow: '0 16px 30px rgba(0,0,0,0.18)' }}>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by guest name, email, reference..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#0f1c18] border border-white/[0.06] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            />
          </div>
          <select value={outcome} onChange={e => { setOutcome(e.target.value); setPage(1) }} className={selectClass}>
            <option value="">All Outcomes</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
        </div>
      </div>

      {/* Records */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-12"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : items.length === 0 ? (
          <div className="text-center text-gray-600 py-12 rounded-2xl border border-white/[0.06]"
            style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))' }}>
            No submissions yet.
          </div>
        ) : items.map((s: any) => (
          <div key={s.id}
            className="rounded-2xl p-4 transition-all hover:-translate-y-px"
            style={{
              background: `linear-gradient(180deg, rgba(22,35,30,0.96), rgba(19,33,29,0.98)), radial-gradient(circle at 100% 0, ${s.outcome === 'success' ? 'rgba(116,200,149,0.06)' : 'rgba(228,132,111,0.06)'}, transparent 35%)`,
              border: '1px solid rgba(255,255,255,0.05)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            }}>
            <div className="flex items-center gap-4 flex-wrap">
              {/* Outcome */}
              <div className="flex-shrink-0">
                {s.outcome === 'success'
                  ? <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/15 border border-emerald-500/20"><CheckCircle size={16} className="text-emerald-400" /></div>
                  : <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/20"><XCircle size={16} className="text-red-400" /></div>
                }
              </div>
              {/* Guest */}
              <div className="min-w-[140px] flex-1">
                <div className="text-sm font-semibold text-white">{s.guest_name || '—'}</div>
                <div className="text-[11px] text-gray-500">{s.guest_email || ''}</div>
              </div>
              {/* Unit */}
              <div className="text-xs text-gray-400 min-w-[100px]">{s.unit_name || s.unit_id || '—'}</div>
              {/* Dates */}
              <div className="text-xs text-gray-400 tabular-nums min-w-[140px]">
                {s.check_in && s.check_out ? `${s.check_in} → ${s.check_out}` : '—'}
              </div>
              {/* Total */}
              <div className="text-sm font-bold text-white tabular-nums min-w-[80px] text-right">
                {money(s.gross_total)}
              </div>
              {/* Method */}
              <div className="min-w-[70px] text-center">
                {s.payment_method && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.04] text-gray-400 border border-white/[0.06]">
                    {s.payment_method}
                  </span>
                )}
              </div>
              {/* Reference */}
              <div className="text-xs font-medium min-w-[80px] text-right" style={{ color: '#74c895' }}>{s.booking_reference || '—'}</div>
              {/* Time */}
              <div className="text-[10px] text-gray-600 min-w-[100px] text-right">{new Date(s.created_at).toLocaleString()}</div>
              {/* Error */}
              {s.failure_code && (
                <div className="w-full mt-1 pl-[52px]">
                  <span className="text-[11px] text-red-400/80">{s.failure_code}: {s.failure_message || ''}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Page {page} of {lastPage}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-2 rounded-xl text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
              style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}><ChevronLeft size={14} /></button>
            <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page === lastPage}
              className="p-2 rounded-xl text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
              style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
