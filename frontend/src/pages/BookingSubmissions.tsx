import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Search, ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react'

export function BookingSubmissions() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Booking Submissions</h1>
        <p className="text-sm text-gray-500 mt-1">Log of all booking attempts — successful and failed</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by guest name, email, reference..."
            className="w-full pl-9 pr-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <select value={outcome} onChange={e => { setOutcome(e.target.value); setPage(1) }}
          className="bg-dark-700 border border-dark-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500">
          <option value="">All Outcomes</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-700 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Outcome</th>
                <th className="text-left p-3">Guest</th>
                <th className="text-left p-3">Unit</th>
                <th className="text-left p-3">Dates</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">Reference</th>
                <th className="text-left p-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">No submissions yet.</td></tr>
              ) : items.map((s: any) => (
                <tr key={s.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                  <td className="p-3 text-gray-400 text-xs whitespace-nowrap">{new Date(s.created_at).toLocaleString()}</td>
                  <td className="p-3">
                    {s.outcome === 'success' ? (
                      <span className="inline-flex items-center gap-1 text-green-400 text-xs"><CheckCircle size={12} /> Success</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400 text-xs"><XCircle size={12} /> Failed</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="text-white text-sm">{s.guest_name || '—'}</div>
                    <div className="text-gray-500 text-xs">{s.guest_email || ''}</div>
                  </td>
                  <td className="p-3 text-gray-300">{s.unit_name || s.unit_id || '—'}</td>
                  <td className="p-3 text-gray-400 text-xs whitespace-nowrap">
                    {s.check_in && s.check_out ? `${s.check_in} → ${s.check_out}` : '—'}
                  </td>
                  <td className="p-3 text-right text-white font-medium">
                    {s.gross_total ? `€${Number(s.gross_total).toFixed(2)}` : '—'}
                  </td>
                  <td className="p-3 text-primary-400 text-xs">{s.booking_reference || '—'}</td>
                  <td className="p-3 text-red-400/80 text-xs max-w-[200px] truncate" title={s.failure_message || ''}>
                    {s.failure_code ? `${s.failure_code}: ${s.failure_message || ''}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {lastPage > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-dark-700">
            <span className="text-xs text-gray-500">Page {page} of {lastPage}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded bg-dark-700 text-gray-400 hover:text-white disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page === lastPage}
                className="p-1.5 rounded bg-dark-700 text-gray-400 hover:text-white disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
