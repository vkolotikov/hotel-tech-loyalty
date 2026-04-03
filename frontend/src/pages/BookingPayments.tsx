import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAY_PILL: Record<string, string> = {
  paid:            'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  open:            'bg-red-500/15 text-red-400 border border-red-500/20',
  pending:         'bg-red-500/15 text-red-400 border border-red-500/20',
  invoice_waiting: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  channel_managed: 'bg-teal-500/15 text-teal-400 border border-teal-500/20',
}

function payLabel(s: string) {
  return s === 'invoice_waiting' ? 'Invoice waiting' : s === 'channel_managed' ? 'Channel managed' : s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
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

  const selectClass = 'bg-[#0f1c18] border border-white/[0.08] rounded-xl text-sm text-white px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/40'

  return (
    <div className="space-y-7">
      <div>
        <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2"
          style={{ background: 'rgba(116,200,149,0.12)', color: '#74c895' }}>Payments</div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Booking Payments</h1>
        <p className="text-sm text-gray-500 mt-1">Payment status and balance tracking for all bookings</p>
      </div>

      {/* Filter */}
      <div className="rounded-2xl p-4 border border-white/[0.06]"
        style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))', boxShadow: '0 16px 30px rgba(0,0,0,0.18)' }}>
        <select value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1) }} className={selectClass}>
          <option value="">All Payment States</option>
          <option value="open">Open (Balance Due)</option><option value="paid">Paid</option>
          <option value="invoice_waiting">Invoice Waiting</option><option value="channel_managed">Channel Managed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Records */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-12"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : items.length === 0 ? (
          <div className="text-center text-gray-600 py-12 rounded-2xl border border-white/[0.06]"
            style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))' }}>
            No payment records found.
          </div>
        ) : items.map((b: any) => {
          const balanceDue = b.balance_due ?? Math.max(0, (b.price_total || 0) - (b.price_paid || 0))
          return (
            <Link key={b.id} to={`/bookings/${b.id}`}
              className="block rounded-2xl p-4 transition-all hover:-translate-y-px hover:shadow-xl group"
              style={{
                background: `linear-gradient(180deg, rgba(22,35,30,0.96), rgba(19,33,29,0.98)), radial-gradient(circle at 100% 0, rgba(116,200,149,0.06), transparent 35%)`,
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
              }}>
              <div className="flex items-center gap-4 flex-wrap">
                {/* Guest */}
                <div className="min-w-[160px] flex-1">
                  <div className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">{b.guest_name || '—'}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{b.apartment_name || '—'} · {b.channel_name || '—'}</div>
                </div>
                {/* Stay */}
                <div className="text-xs text-gray-400 tabular-nums min-w-[150px]">
                  {b.arrival_date && b.departure_date ? `${new Date(b.arrival_date).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})} → ${new Date(b.departure_date).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})}` : '—'}
                </div>
                {/* Financial */}
                <div className="flex items-center gap-5 tabular-nums min-w-[260px] justify-end">
                  <div className="text-right">
                    <div className="text-[9px] text-gray-600 font-bold uppercase">Paid</div>
                    <div className="text-sm font-bold text-emerald-400">€{Number(b.price_paid || 0).toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-gray-600 font-bold uppercase">Due</div>
                    <div className={`text-sm font-bold ${balanceDue > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                      {balanceDue > 0 ? `€${Number(balanceDue).toFixed(2)}` : '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-gray-600 font-bold uppercase">Total</div>
                    <div className="text-sm font-bold text-white">€{Number(b.price_total || 0).toFixed(2)}</div>
                  </div>
                </div>
                {/* Tags */}
                <div className="flex items-center gap-2 min-w-[160px] justify-end">
                  {b.payment_status && (
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${PAY_PILL[b.payment_status] || 'bg-gray-500/15 text-gray-400 border border-gray-500/20'}`}>
                      {payLabel(b.payment_status)}
                    </span>
                  )}
                  {b.payment_method && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.04] text-gray-400 border border-white/[0.06]">
                      {b.payment_method}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Page {page} of {lastPage} · {data?.total ?? 0} total</span>
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
