import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAYMENT_STATE_COLORS: Record<string, string> = {
  paid: 'bg-green-500/20 text-green-400 border-green-500/30',
  open: 'bg-red-500/20 text-red-400 border-red-500/30',
  pending: 'bg-red-500/20 text-red-400 border-red-500/30',
  invoice_waiting: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  channel_managed: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
}

function paymentStateLabel(s: string) {
  if (s === 'invoice_waiting') return 'Invoice waiting'
  if (s === 'channel_managed') return 'Channel managed'
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

export function BookingPayments() {
  const [paymentStatus, setPaymentStatus] = useState('')
  const [page, setPage] = useState(1)

  const params: any = { page }
  if (paymentStatus) params.payment_status = paymentStatus

  const { data, isLoading } = useQuery({
    queryKey: ['booking-payments', params],
    queryFn: () => api.get('/v1/admin/bookings/payments', { params }).then(r => r.data),
  })

  const items = data?.data ?? []
  const lastPage = data?.last_page ?? 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Booking Payments</h1>
        <p className="text-sm text-gray-500 mt-1">Payment status and balance tracking for all bookings</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1) }}
          className="bg-dark-700 border border-dark-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500">
          <option value="">All Payment States</option>
          <option value="open">Open (Balance Due)</option>
          <option value="paid">Paid</option>
          <option value="invoice_waiting">Invoice Waiting</option>
          <option value="channel_managed">Channel Managed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-700 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left p-3">Guest</th>
                <th className="text-left p-3">Unit</th>
                <th className="text-left p-3">Channel</th>
                <th className="text-left p-3">Stay</th>
                <th className="text-right p-3">Paid</th>
                <th className="text-right p-3">Due</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">State</th>
                <th className="text-left p-3">Method</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-500">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-500">No payment records found.</td></tr>
              ) : items.map((b: any) => {
                const balanceDue = b.balance_due ?? Math.max(0, (b.price_total || 0) - (b.price_paid || 0))
                return (
                  <tr key={b.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                    <td className="p-3">
                      <Link to={`/bookings/${b.id}`} className="text-white font-medium hover:text-primary-400">
                        {b.guest_name || '—'}
                      </Link>
                      <div className="text-gray-500 text-xs">{b.guest_email || ''}</div>
                    </td>
                    <td className="p-3 text-gray-300 text-xs">{b.apartment_name || '—'}</td>
                    <td className="p-3 text-gray-400 text-xs">{b.channel_name || '—'}</td>
                    <td className="p-3 text-gray-400 text-xs whitespace-nowrap">
                      {b.arrival_date && b.departure_date ? `${b.arrival_date} → ${b.departure_date}` : '—'}
                    </td>
                    <td className="p-3 text-right text-green-400 font-medium">
                      €{Number(b.price_paid || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      {balanceDue > 0 ? (
                        <span className="text-red-400 font-medium">€{Number(balanceDue).toFixed(2)}</span>
                      ) : (
                        <span className="text-green-400/50 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-white font-medium">
                      €{Number(b.price_total || 0).toFixed(2)}
                    </td>
                    <td className="p-3">
                      {b.payment_status && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${PAYMENT_STATE_COLORS[b.payment_status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                          {paymentStateLabel(b.payment_status)}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-gray-400 text-xs">{b.payment_method || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {lastPage > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-dark-700">
            <span className="text-xs text-gray-500">Page {page} of {lastPage} ({data?.total ?? 0} total)</span>
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
