import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { ArrowLeft, RefreshCw, Send, User, Calendar, DollarSign, MessageSquare, MapPin, ExternalLink, CheckCircle, XCircle, AlertTriangle, FileText } from 'lucide-react'

const STATUS_OPTIONS = ['new', 'confirmed', 'follow_up', 'waiting_invoice_payment', 'paid_verified', 'checked-in', 'checked-out', 'issue', 'done', 'cancelled', 'no-show']
const INVOICE_OPTIONS = ['not_applicable', 'to_issue', 'issued', 'waiting_funds', 'funds_received', 'none', 'draft', 'sent', 'paid', 'overdue']
const PAYMENT_STATUS_OPTIONS = ['pending', 'paid', 'invoice_waiting', 'channel_managed', 'open']

const PAYMENT_STATE_COLORS: Record<string, string> = {
  paid: 'bg-green-500/20 text-green-400',
  open: 'bg-red-500/20 text-red-400',
  pending: 'bg-red-500/20 text-red-400',
  invoice_waiting: 'bg-amber-500/20 text-amber-400',
  channel_managed: 'bg-teal-500/20 text-teal-400',
}

function paymentStateLabel(s: string) {
  if (s === 'invoice_waiting') return 'Invoice waiting'
  if (s === 'channel_managed') return 'Channel managed'
  if (s === 'not_applicable') return 'N/A'
  if (s === 'to_issue') return 'To issue'
  if (s === 'waiting_funds') return 'Waiting funds'
  if (s === 'funds_received') return 'Funds received'
  if (s === 'waiting_invoice_payment') return 'Waiting invoice'
  if (s === 'paid_verified') return 'Paid verified'
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

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
    onSuccess: () => {
      setNoteBody('')
      qc.invalidateQueries({ queryKey: ['booking-detail', id] })
      toast.success('Note added')
    },
    onError: () => toast.error('Failed to add note'),
  })

  const updateStatus = useMutation({
    mutationFn: (data: any) => api.patch(`/v1/admin/bookings/${id}/status`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking-detail', id] })
      toast.success('Updated')
    },
  })

  const handleSync = async () => {
    setSyncing(true)
    try {
      await api.post(`/v1/admin/bookings/${id}/sync`)
      qc.invalidateQueries({ queryKey: ['booking-detail', id] })
      toast.success('Synced from PMS')
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>
  }

  if (!booking) {
    return <div className="text-center text-gray-500 py-16">Booking not found</div>
  }

  const b = booking
  const nights = b.arrival_date && b.departure_date
    ? Math.ceil((new Date(b.departure_date).getTime() - new Date(b.arrival_date).getTime()) / 86400000)
    : 0
  const balanceDue = b.balance_due ?? Math.max(0, (b.price_total || 0) - (b.price_paid || 0))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/bookings" className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">
            {b.booking_reference || `Reservation #${b.reservation_id}`}
          </h1>
          <p className="text-sm text-gray-500">{b.apartment_name || 'Unknown unit'}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {b.guest_app_url && (
            <a href={b.guest_app_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-dark-700 hover:bg-dark-600 text-gray-300 px-3 py-2 rounded-lg text-xs">
              <ExternalLink size={12} /> Payment Page
            </a>
          )}
          {b.reservation_id && (
            <a href={`https://login.smoobu.com/en/booking/reservations/${b.reservation_id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-dark-700 hover:bg-dark-600 text-gray-300 px-3 py-2 rounded-lg text-xs">
              <ExternalLink size={12} /> Smoobu
            </a>
          )}
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-gray-300 px-3 py-2 rounded-lg text-sm">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Guest & Stay */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                  <User size={12} /> Guest
                </h3>
                <div className="space-y-2">
                  <div><span className="text-gray-500 text-xs">Name:</span> <span className="text-white text-sm">{b.guest_name || '—'}</span></div>
                  <div><span className="text-gray-500 text-xs">Email:</span> <span className="text-white text-sm">{b.guest_email || '—'}</span></div>
                  <div><span className="text-gray-500 text-xs">Phone:</span> <span className="text-white text-sm">{b.guest_phone || '—'}</span></div>
                  {b.guest && (
                    <Link to={`/guests/${b.guest.id}`} className="text-xs text-primary-400 hover:text-primary-300 inline-block mt-1">
                      View CRM Profile →
                    </Link>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                  <Calendar size={12} /> Stay
                </h3>
                <div className="space-y-2">
                  <div><span className="text-gray-500 text-xs">Arrival:</span> <span className="text-white text-sm">{b.arrival_date || '—'}</span></div>
                  <div><span className="text-gray-500 text-xs">Departure:</span> <span className="text-white text-sm">{b.departure_date || '—'}</span></div>
                  <div><span className="text-gray-500 text-xs">Nights:</span> <span className="text-white text-sm">{nights}</span></div>
                  <div><span className="text-gray-500 text-xs">Guests:</span> <span className="text-white text-sm">{b.adults || 0} adults, {b.children || 0} children</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Financials */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
              <DollarSign size={12} /> Financial
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-500">Total</div>
                <div className="text-lg font-bold text-white">{b.price_total ? `€${Number(b.price_total).toLocaleString()}` : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Paid</div>
                <div className="text-lg font-bold text-green-400">{b.price_paid ? `€${Number(b.price_paid).toLocaleString()}` : '€0'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Balance Due</div>
                <div className={`text-lg font-bold ${balanceDue > 0 ? 'text-red-400' : 'text-green-400/60'}`}>
                  {balanceDue > 0 ? `€${balanceDue.toLocaleString()}` : 'Settled'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Deposit</div>
                <div className="text-sm text-white">{b.deposit_amount ? `€${b.deposit_amount}` : '—'} {b.deposit_paid ? <CheckCircle size={10} className="inline text-green-400" /> : ''}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Prepayment</div>
                <div className="text-sm text-white">{b.prepayment_amount ? `€${b.prepayment_amount}` : '—'} {b.prepayment_paid ? <CheckCircle size={10} className="inline text-green-400" /> : ''}</div>
              </div>
            </div>

            {/* Payment status bar */}
            {b.payment_status && (
              <div className="flex items-center gap-3 mb-4 p-2.5 rounded-lg bg-dark-700/50">
                <span className="text-xs text-gray-500">Payment Status:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_STATE_COLORS[b.payment_status] || 'bg-gray-500/20 text-gray-400'}`}>
                  {paymentStateLabel(b.payment_status)}
                </span>
                {b.payment_method && <span className="text-xs text-gray-400 ml-auto">via {b.payment_method}</span>}
              </div>
            )}

            {/* Price Elements */}
            {b.price_elements?.length > 0 && (
              <div className="pt-4 border-t border-dark-700">
                <div className="text-xs text-gray-500 mb-2">Price Breakdown</div>
                {b.price_elements.map((pe: any) => (
                  <div key={pe.id} className="flex justify-between text-sm py-1">
                    <span className="text-gray-300">{pe.name || pe.element_type}</span>
                    <span className="text-white">€{Number(pe.amount || 0).toFixed(2)} × {pe.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Provider Notice */}
          {b.notice && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                <AlertTriangle size={12} /> Guest Notice
              </h3>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{b.notice}</pre>
            </div>
          )}

          {/* Notes */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
              <MessageSquare size={12} /> Internal Notes
            </h3>

            <div className="flex gap-2 mb-4">
              <input
                type="text" value={noteBody} onChange={e => setNoteBody(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
                onKeyDown={e => { if (e.key === 'Enter' && noteBody.trim()) addNote.mutate() }}
              />
              <button onClick={() => addNote.mutate()} disabled={!noteBody.trim() || addNote.isPending}
                className="px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg disabled:opacity-50">
                <Send size={14} />
              </button>
            </div>

            {b.notes?.length > 0 ? (
              <div className="space-y-3">
                {b.notes.map((n: any) => (
                  <div key={n.id} className="bg-dark-700 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs text-primary-400 font-medium">{n.staff?.hotel_name || 'Staff'}</span>
                      <span className="text-xs text-gray-600">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">{n.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600">No notes yet.</p>
            )}
          </div>

          {/* Submissions History */}
          {b.submissions?.length > 0 && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                <FileText size={12} /> Submission History
              </h3>
              <div className="space-y-2">
                {b.submissions.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between bg-dark-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.outcome === 'success' ? <CheckCircle size={14} className="text-green-400 flex-shrink-0" /> : <XCircle size={14} className="text-red-400 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-sm text-white">{s.guest_name || '—'}</div>
                        <div className="text-xs text-gray-500">{s.guest_email || ''}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      {s.gross_total && <div className="text-xs text-white">€{Number(s.gross_total).toFixed(2)}</div>}
                      <div className="text-[10px] text-gray-600">{new Date(s.created_at).toLocaleString()}</div>
                      {s.failure_code && <div className="text-[10px] text-red-400">{s.failure_code}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Operations */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
              <MapPin size={12} /> Operations
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Internal Status</label>
                <select
                  value={b.internal_status || 'new'}
                  onChange={e => updateStatus.mutate({ internal_status: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{paymentStateLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Invoice State</label>
                <select
                  value={b.invoice_state || 'not_applicable'}
                  onChange={e => updateStatus.mutate({ invoice_state: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {INVOICE_OPTIONS.map(s => <option key={s} value={s}>{paymentStateLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Payment Status</label>
                <select
                  value={b.payment_status || 'pending'}
                  onChange={e => updateStatus.mutate({ payment_status: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {PAYMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{paymentStateLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Amount Paid (€)</label>
                <input
                  type="number" step="0.01" min="0"
                  defaultValue={b.price_paid || 0}
                  onBlur={e => {
                    const val = parseFloat(e.target.value)
                    if (!isNaN(val) && val !== (b.price_paid || 0)) updateStatus.mutate({ price_paid: val })
                  }}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Booking Meta */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Reference</span><span className="text-white">{b.booking_reference || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Reservation ID</span><span className="text-white">{b.reservation_id || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="text-white">{b.booking_type || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Channel</span><span className="text-white">{b.channel_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Unit</span><span className="text-white">{b.apartment_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">State</span><span className="text-white">{b.booking_state || '—'}</span></div>
              {b.synced_at && (
                <div className="flex justify-between"><span className="text-gray-500">Last Synced</span><span className="text-gray-400 text-xs">{new Date(b.synced_at).toLocaleString()}</span></div>
              )}
              {b.created_at && (
                <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-gray-400 text-xs">{new Date(b.created_at).toLocaleString()}</span></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
