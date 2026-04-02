import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { ArrowLeft, RefreshCw, Send, User, Calendar, DollarSign, MessageSquare, MapPin, ExternalLink, CheckCircle, XCircle, AlertTriangle, FileText } from 'lucide-react'

const STATUS_OPTIONS = ['new', 'confirmed', 'follow_up', 'waiting_invoice_payment', 'paid_verified', 'checked-in', 'checked-out', 'issue', 'done', 'cancelled', 'no-show']
const INVOICE_OPTIONS = ['not_applicable', 'to_issue', 'issued', 'waiting_funds', 'funds_received']
const PAYMENT_STATUS_OPTIONS = ['pending', 'paid', 'invoice_waiting', 'channel_managed', 'open']

const PAY_PILL: Record<string, string> = {
  paid:            'bg-emerald-500/15 text-emerald-400',
  open:            'bg-red-500/15 text-red-400',
  pending:         'bg-red-500/15 text-red-400',
  invoice_waiting: 'bg-amber-500/15 text-amber-400',
  channel_managed: 'bg-teal-500/15 text-teal-400',
}

function formatLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.06] overflow-hidden ${className}`}
      style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))', boxShadow: '0 16px 30px rgba(0,0,0,0.18)' }}>
      {children}
    </div>
  )
}

const selectClass = 'w-full px-3 py-2.5 bg-dark-surface border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500/40'

export function BookingDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [noteBody, setNoteBody] = useState('')
  const [syncing, setSyncing] = useState(false)

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking-detail', id],
    queryFn: () => api.get(`/v1/admin/bookings/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const addNote = useMutation({
    mutationFn: () => api.post(`/v1/admin/bookings/${id}/notes`, { body: noteBody }),
    onSuccess: () => { setNoteBody(''); qc.invalidateQueries({ queryKey: ['booking-detail', id] }); toast.success('Note added') },
    onError: () => toast.error('Failed to add note'),
  })

  const updateStatus = useMutation({
    mutationFn: (data: any) => api.patch(`/v1/admin/bookings/${id}/status`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['booking-detail', id] }); toast.success('Updated') },
  })

  const handleSync = async () => {
    setSyncing(true)
    try { await api.post(`/v1/admin/bookings/${id}/sync`); qc.invalidateQueries({ queryKey: ['booking-detail', id] }); toast.success('Synced') }
    catch { toast.error('Sync failed') }
    finally { setSyncing(false) }
  }

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!booking) return <div className="text-center text-gray-600 py-16">Booking not found</div>

  const b = booking
  const nights = b.arrival_date && b.departure_date ? Math.ceil((new Date(b.departure_date).getTime() - new Date(b.arrival_date).getTime()) / 86400000) : 0
  const balanceDue = b.balance_due ?? Math.max(0, (b.price_total || 0) - (b.price_paid || 0))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link to="/bookings" className="p-2.5 rounded-xl text-gray-500 hover:text-white transition-colors" style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-1"
            style={{ background: 'rgba(var(--color-primary-rgb, 116,200,149),0.12)', color: 'rgb(var(--color-primary-rgb, 116,200,149))' }}>
            Reservation
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{b.booking_reference || `#${b.reservation_id}`}</h1>
          <p className="text-sm text-gray-500">{b.apartment_name || 'Unknown unit'}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {b.guest_app_url && (
            <a href={b.guest_app_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white transition-colors"
              style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <ExternalLink size={12} /> Payment Page
            </a>
          )}
          {b.reservation_id && (
            <a href={`https://login.smoobu.com/en/booking/reservations/${b.reservation_id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white transition-colors"
              style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <ExternalLink size={12} /> Smoobu
            </a>
          )}
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition-colors"
            style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          {/* Guest & Stay */}
          <Card className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center gap-2">
                  <User size={12} className="text-emerald-400" /> Guest Information
                </h3>
                <div className="space-y-3">
                  {[
                    ['Name', b.guest_name],
                    ['Email', b.guest_email],
                    ['Phone', b.guest_phone],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex items-baseline gap-2">
                      <span className="text-[11px] text-gray-600 w-14 flex-shrink-0">{label}</span>
                      <span className="text-sm text-white font-medium">{val || '—'}</span>
                    </div>
                  ))}
                  {b.guest && (
                    <Link to={`/guests/${b.guest.id}`} className="inline-flex items-center gap-1 text-xs font-medium mt-2 text-primary-400">
                      View CRM Profile →
                    </Link>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center gap-2">
                  <Calendar size={12} className="text-blue-400" /> Stay Details
                </h3>
                <div className="space-y-3">
                  {[
                    ['Arrival', b.arrival_date],
                    ['Departure', b.departure_date],
                    ['Nights', nights],
                    ['Guests', `${b.adults || 0} adults, ${b.children || 0} children`],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex items-baseline gap-2">
                      <span className="text-[11px] text-gray-600 w-16 flex-shrink-0">{label}</span>
                      <span className="text-sm text-white font-medium">{val || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Financials */}
          <Card>
            <div className="relative">
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #74c895, #d98f45)' }} />
              <div className="p-6">
                <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-5 flex items-center gap-2">
                  <DollarSign size={12} className="text-amber-400" /> Financial Overview
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">Total</div>
                    <div className="text-xl font-bold text-white mt-1 tabular-nums">{b.price_total ? `€${Number(b.price_total).toLocaleString()}` : '—'}</div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">Paid</div>
                    <div className="text-xl font-bold text-emerald-400 mt-1 tabular-nums">{b.price_paid ? `€${Number(b.price_paid).toLocaleString()}` : '€0'}</div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">Balance</div>
                    <div className={`text-xl font-bold mt-1 tabular-nums ${balanceDue > 0 ? 'text-red-400' : 'text-emerald-400/50'}`}>
                      {balanceDue > 0 ? `€${balanceDue.toLocaleString()}` : 'Settled'}
                    </div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">Deposit</div>
                    <div className="text-sm text-white mt-1">{b.deposit_amount ? `€${b.deposit_amount}` : '—'} {b.deposit_paid ? <CheckCircle size={11} className="inline text-emerald-400" /> : ''}</div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">Prepayment</div>
                    <div className="text-sm text-white mt-1">{b.prepayment_amount ? `€${b.prepayment_amount}` : '—'} {b.prepayment_paid ? <CheckCircle size={11} className="inline text-emerald-400" /> : ''}</div>
                  </div>
                </div>

                {b.payment_status && (
                  <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[11px] text-gray-500 font-medium">Payment Status:</span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${PAY_PILL[b.payment_status] || 'bg-gray-500/15 text-gray-400'}`}>
                      {formatLabel(b.payment_status)}
                    </span>
                    {b.payment_method && <span className="text-xs text-gray-500 ml-auto">via {b.payment_method}</span>}
                  </div>
                )}

                {b.price_elements?.length > 0 && (
                  <div className="pt-4 border-t border-white/[0.06]">
                    <div className="text-[10px] text-gray-500 font-bold uppercase mb-3">Price Breakdown</div>
                    {b.price_elements.map((pe: any) => (
                      <div key={pe.id} className="flex justify-between text-sm py-1.5">
                        <span className="text-gray-400">{pe.name || pe.element_type}</span>
                        <span className="text-white font-medium tabular-nums">€{Number(pe.amount || 0).toFixed(2)} × {pe.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Guest Notice */}
          {b.notice && (
            <Card className="p-6">
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-3 flex items-center gap-2">
                <AlertTriangle size={12} className="text-amber-400" /> Guest Notice
              </h3>
              <div className="rounded-xl p-4" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{b.notice}</pre>
              </div>
            </Card>
          )}

          {/* Notes */}
          <Card className="p-6">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center gap-2">
              <MessageSquare size={12} className="text-blue-400" /> Internal Notes
            </h3>
            <div className="flex gap-2 mb-4">
              <input type="text" value={noteBody} onChange={e => setNoteBody(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 px-4 py-2.5 bg-dark-surface border border-white/[0.06] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500/40"
                onKeyDown={e => { if (e.key === 'Enter' && noteBody.trim()) addNote.mutate() }}
              />
              <button onClick={() => addNote.mutate()} disabled={!noteBody.trim() || addNote.isPending}
                className="px-4 py-2.5 rounded-xl text-white disabled:opacity-40 transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-rgb, 116,200,149)), #5ab4b2)' }}>
                <Send size={14} />
              </button>
            </div>
            {b.notes?.length > 0 ? (
              <div className="space-y-3">
                {b.notes.map((n: any) => (
                  <div key={n.id} className="rounded-xl p-4" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="text-xs font-bold text-primary-400">{n.staff?.hotel_name || 'Staff'}</span>
                      <span className="text-[10px] text-gray-600">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{n.body}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-600">No notes yet.</p>}
          </Card>

          {/* Submissions */}
          {b.submissions?.length > 0 && (
            <Card className="p-6">
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center gap-2">
                <FileText size={12} className="text-purple-400" /> Submission History
              </h3>
              <div className="space-y-2">
                {b.submissions.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl p-3 transition-all"
                    style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      {s.outcome === 'success' ? <CheckCircle size={15} className="text-emerald-400 flex-shrink-0" /> : <XCircle size={15} className="text-red-400 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-sm text-white font-medium">{s.guest_name || '—'}</div>
                        <div className="text-[11px] text-gray-500">{s.guest_email || ''}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      {s.gross_total && <div className="text-xs text-white font-semibold tabular-nums">€{Number(s.gross_total).toFixed(2)}</div>}
                      <div className="text-[10px] text-gray-600">{new Date(s.created_at).toLocaleString()}</div>
                      {s.failure_code && <div className="text-[10px] text-red-400 mt-0.5">{s.failure_code}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Operations */}
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center gap-2">
              <MapPin size={12} className="text-amber-400" /> Operations
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-1.5 uppercase tracking-wider">Status</label>
                <select value={b.internal_status || 'new'} onChange={e => updateStatus.mutate({ internal_status: e.target.value })} className={selectClass}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{formatLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-1.5 uppercase tracking-wider">Invoice</label>
                <select value={b.invoice_state || 'not_applicable'} onChange={e => updateStatus.mutate({ invoice_state: e.target.value })} className={selectClass}>
                  {INVOICE_OPTIONS.map(s => <option key={s} value={s}>{formatLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-1.5 uppercase tracking-wider">Payment</label>
                <select value={b.payment_status || 'pending'} onChange={e => updateStatus.mutate({ payment_status: e.target.value })} className={selectClass}>
                  {PAYMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{formatLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-1.5 uppercase tracking-wider">Paid (€)</label>
                <input type="number" step="0.01" min="0" defaultValue={b.price_paid || 0}
                  onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== (b.price_paid || 0)) updateStatus.mutate({ price_paid: v }) }}
                  className={selectClass} />
              </div>
            </div>
          </Card>

          {/* Meta */}
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-4">Details</h3>
            <div className="space-y-3">
              {[
                ['Reference', b.booking_reference],
                ['Reservation', b.reservation_id],
                ['Type', b.booking_type],
                ['Channel', b.channel_name],
                ['Unit', b.apartment_name],
                ['State', b.booking_state],
                ['Synced', b.synced_at ? new Date(b.synced_at).toLocaleString() : null],
                ['Created', b.created_at ? new Date(b.created_at).toLocaleString() : null],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label as string} className="flex justify-between text-sm">
                  <span className="text-gray-500 text-xs">{label}</span>
                  <span className="text-white text-xs font-medium text-right max-w-[180px] truncate">{val || '—'}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
