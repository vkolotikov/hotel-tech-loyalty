import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { SendReviewButton } from '../components/SendReviewButton'
import toast from 'react-hot-toast'
import { ArrowLeft, RefreshCw, Send, User, Calendar, DollarSign, MessageSquare, MapPin, ExternalLink, CheckCircle, XCircle, AlertTriangle, FileText, CreditCard, Undo2, X, Loader2 } from 'lucide-react'
import { money } from '../lib/money'

const STATUS_OPTIONS = ['new', 'confirmed', 'follow_up', 'waiting_invoice_payment', 'paid_verified', 'checked-in', 'checked-out', 'issue', 'done', 'cancelled', 'no-show']
const INVOICE_OPTIONS = ['not_applicable', 'to_issue', 'issued', 'waiting_funds', 'funds_received']
const PAYMENT_STATUS_OPTIONS = ['pending', 'paid', 'invoice_waiting', 'channel_managed', 'open']

const PAY_PILL: Record<string, string> = {
  paid:                'bg-emerald-500/15 text-emerald-400',
  open:                'bg-red-500/15 text-red-400',
  pending:             'bg-red-500/15 text-red-400',
  invoice_waiting:     'bg-amber-500/15 text-amber-400',
  channel_managed:     'bg-teal-500/15 text-teal-400',
  refunded:            'bg-amber-500/15 text-amber-300',
  partially_refunded:  'bg-amber-500/15 text-amber-300',
  disputed:            'bg-red-500/15 text-red-300',
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
  const { t } = useTranslation()
  const [noteBody, setNoteBody] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState<'' | 'duplicate' | 'fraudulent' | 'requested_by_customer'>('')

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
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to update booking'),
  })

  const refundMutation = useMutation({
    mutationFn: (data: { amount?: number; reason?: string }) =>
      api.post(`/v1/admin/bookings/${id}/refund`, data),
    onSuccess: (res: any) => {
      setRefundOpen(false); setRefundAmount(''); setRefundReason('')
      qc.invalidateQueries({ queryKey: ['booking-detail', id] })
      // Surface side-effect summary returned by the backend so staff
      // know what happened beyond just the Stripe charge.
      const o = res?.data?.refund_outcome
      if (o) {
        const bits = [
          o.is_full ? 'Full refund' : 'Partial refund',
          o.reversed_points > 0 ? `${o.reversed_points} pts reversed` : null,
          o.pms_cancelled ? 'PMS cancelled' : (o.is_full ? 'PMS cancel needed manually' : null),
          o.email_sent ? 'Guest emailed' : 'No email sent',
        ].filter(Boolean).join(' · ')
        toast.success(bits)
      } else {
        toast.success('Refund issued')
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Refund failed'),
  })

  const handleSync = async () => {
    setSyncing(true)
    try { await api.post(`/v1/admin/bookings/${id}/sync`); qc.invalidateQueries({ queryKey: ['booking-detail', id] }); toast.success('Synced') }
    catch { toast.error('Sync failed') }
    finally { setSyncing(false) }
  }

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!booking) return <div className="text-center text-gray-600 py-16">{t('bookingDetail.not_found', 'Booking not found')}</div>

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
            {t('bookingDetail.header.reservation_badge', 'Reservation')}
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{b.booking_reference || `#${b.reservation_id}`}</h1>
          <p className="text-sm text-gray-500">{b.apartment_name || t('bookingDetail.header.unknown_unit', 'Unknown unit')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {b.guest_app_url && (
            <a href={b.guest_app_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white transition-colors"
              style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <ExternalLink size={12} /> {t('bookingDetail.header.payment_page', 'Payment Page')}
            </a>
          )}
          {b.reservation_id && (
            <a href={`https://login.smoobu.com/en/booking/reservations/${b.reservation_id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white transition-colors"
              style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <ExternalLink size={12} /> {t('bookingDetail.header.smoobu', 'Smoobu')}
            </a>
          )}
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition-colors"
            style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {t('bookingDetail.header.refresh', 'Refresh')}
          </button>
          {b.guest_email && (
            <SendReviewButton target={{ email: b.guest_email, name: b.guest_name }} />
          )}
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
                  <User size={12} className="text-emerald-400" /> {t('bookingDetail.guest.title', 'Guest Information')}
                </h3>
                <div className="space-y-3">
                  {[
                    [t('bookingDetail.guest.name',  'Name'),  b.guest_name],
                    [t('bookingDetail.guest.email', 'Email'), b.guest_email],
                    [t('bookingDetail.guest.phone', 'Phone'), b.guest_phone],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex items-baseline gap-2">
                      <span className="text-[11px] text-gray-600 w-14 flex-shrink-0">{label}</span>
                      <span className="text-sm text-white font-medium">{val || '—'}</span>
                    </div>
                  ))}
                  {b.guest && (
                    <Link to={`/guests/${b.guest.id}`} className="inline-flex items-center gap-1 text-xs font-medium mt-2 text-primary-400">
                      {t('bookingDetail.guest.view_crm', 'View CRM Profile →')}
                    </Link>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center gap-2">
                  <Calendar size={12} className="text-blue-400" /> {t('bookingDetail.stay.title', 'Stay Details')}
                </h3>
                <div className="space-y-3">
                  {[
                    [t('bookingDetail.stay.arrival',   'Arrival'),   b.arrival_date ? new Date(b.arrival_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null],
                    [t('bookingDetail.stay.departure', 'Departure'), b.departure_date ? new Date(b.departure_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null],
                    [t('bookingDetail.stay.nights',    'Nights'),    nights],
                    [t('bookingDetail.stay.guests',    'Guests'),    t('bookingDetail.stay.guests_value', { adults: b.adults || 0, children: b.children || 0, defaultValue: '{{adults}} adults, {{children}} children' })],
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
                  <DollarSign size={12} className="text-amber-400" /> {t('bookingDetail.financial.title', 'Financial Overview')}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">{t('bookingDetail.financial.total', 'Total')}</div>
                    <div className="text-xl font-bold text-white mt-1 tabular-nums">{money(b.price_total)}</div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">{t('bookingDetail.financial.paid', 'Paid')}</div>
                    <div className="text-xl font-bold text-emerald-400 mt-1 tabular-nums">{money(b.price_paid || 0)}</div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">{t('bookingDetail.financial.balance', 'Balance')}</div>
                    <div className={`text-xl font-bold mt-1 tabular-nums ${balanceDue > 0 ? 'text-red-400' : 'text-emerald-400/50'}`}>
                      {balanceDue > 0 ? money(balanceDue) : t('bookingDetail.financial.settled', 'Settled')}
                    </div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">{t('bookingDetail.financial.deposit', 'Deposit')}</div>
                    <div className="text-sm text-white mt-1">{money(b.deposit_amount)} {b.deposit_paid ? <CheckCircle size={11} className="inline text-emerald-400" /> : ''}</div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase">{t('bookingDetail.financial.prepayment', 'Prepayment')}</div>
                    <div className="text-sm text-white mt-1">{money(b.prepayment_amount)} {b.prepayment_paid ? <CheckCircle size={11} className="inline text-emerald-400" /> : ''}</div>
                  </div>
                </div>

                {b.payment_status && (
                  <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[11px] text-gray-500 font-medium">{t('bookingDetail.financial.payment_status_label', 'Payment Status:')}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${PAY_PILL[b.payment_status] || 'bg-gray-500/15 text-gray-400'}`}>
                      {formatLabel(b.payment_status)}
                    </span>
                    {b.payment_method && <span className="text-xs text-gray-500 ml-auto">via {b.payment_method}</span>}
                  </div>
                )}

                {/* Stripe / mock payment panel — visible whenever a Stripe
                    payment intent is attached OR the booking came through
                    the mock channel. Gives staff one-click access to the
                    Stripe dashboard + refund button. */}
                {(b.payment_method === 'stripe' || b.payment_method === 'mock' || b.stripe_payment_intent_id) && (
                  <div className="mb-5 p-4 rounded-xl" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold flex items-center gap-2">
                        <CreditCard size={12} className={b.payment_method === 'mock' ? 'text-amber-400' : 'text-blue-400'} />
                        {b.payment_method === 'mock' ? 'Mock payment' : 'Stripe payment'}
                      </h4>
                      {b.stripe_payment_intent_id && b.payment_method !== 'mock' && (
                        <a
                          href={`https://dashboard.stripe.com/payments/${b.stripe_payment_intent_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          Open in Stripe <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {b.stripe_payment_intent_id && (
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-500">{t('bookingDetail.financial.intent_id', 'Intent ID')}</span>
                          <span className="text-gray-300 font-mono truncate text-right">{b.stripe_payment_intent_id}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-500">{t('bookingDetail.financial.method', 'Method')}</span>
                        <span className="text-white capitalize">{b.payment_method || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">{t('bookingDetail.financial.charged', 'Charged')}</span>
                        <span className="text-white tabular-nums">{money(b.price_paid || 0)}</span>
                      </div>
                      {b.refunded_amount > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-500">{t('bookingDetail.financial.refunded', 'Refunded')}</span>
                            <span className="text-amber-300 tabular-nums">−{money(b.refunded_amount)}</span>
                          </div>
                          {b.refunded_at && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t('bookingDetail.financial.refunded_at', 'Refunded at')}</span>
                              <span className="text-gray-300">{new Date(b.refunded_at).toLocaleString()}</span>
                            </div>
                          )}
                          {b.last_refund_id && b.payment_method !== 'mock' && (
                            <div className="flex justify-between gap-3">
                              <span className="text-gray-500">{t('bookingDetail.financial.refund_id', 'Refund ID')}</span>
                              <span className="text-gray-300 font-mono truncate text-right">{b.last_refund_id}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {b.payment_status === 'disputed' && (
                      <p className="text-[11px] text-red-300/80 mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
                        ⚠ Chargeback opened on this payment. Stripe is holding the funds pending review. Reply to the dispute from your Stripe Dashboard before issuing a refund.
                      </p>
                    )}
                    {b.payment_method === 'mock' && (
                      <p className="text-[11px] text-amber-300/80 mt-3">
                        This booking was created in Mock Mode — no real charge was made.
                      </p>
                    )}
                    {(b.payment_status === 'paid' || b.payment_status === 'partially_refunded') && (
                      <button
                        onClick={() => setRefundOpen(true)}
                        className="mt-3 w-full px-3 py-2 rounded-lg text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors inline-flex items-center justify-center gap-2"
                      >
                        <Undo2 size={12} /> {t('bookingDetail.refund.title', 'Issue refund')}
                      </button>
                    )}
                  </div>
                )}

                {b.price_elements?.length > 0 && (
                  <div className="pt-4 border-t border-white/[0.06]">
                    <div className="text-[10px] text-gray-500 font-bold uppercase mb-3">{t('bookingDetail.financial.price_breakdown', 'Price Breakdown')}</div>
                    {b.price_elements.map((pe: any) => (
                      <div key={pe.id} className="flex justify-between text-sm py-1.5">
                        <span className="text-gray-400">{pe.name || pe.element_type}</span>
                        <span className="text-white font-medium tabular-nums">{money(pe.amount || 0)} × {pe.quantity}</span>
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
              <MessageSquare size={12} className="text-blue-400" /> {t('bookingDetail.notes.title', 'Internal Notes')}
            </h3>
            <div className="flex gap-2 mb-4">
              <input type="text" value={noteBody} onChange={e => setNoteBody(e.target.value)}
                placeholder={t('bookingDetail.notes.placeholder', 'Add a note…')}
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
                      <span className="text-xs font-bold text-primary-400">{n.staff?.hotel_name || t('bookingDetail.notes.staff_fallback', 'Staff')}</span>
                      <span className="text-[10px] text-gray-600">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{n.body}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-600">{t('bookingDetail.notes.empty', 'No notes yet.')}</p>}
          </Card>

          {/* Submissions */}
          {b.submissions?.length > 0 && (
            <Card className="p-6">
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center gap-2">
                <FileText size={12} className="text-purple-400" /> {t('bookingDetail.submissions_title', 'Submission History')}
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
                      {s.gross_total && <div className="text-xs text-white font-semibold tabular-nums">{money(s.gross_total)}</div>}
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
              <MapPin size={12} className="text-amber-400" /> {t('bookingDetail.operations.title', 'Operations')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-1.5 uppercase tracking-wider">{t('bookingDetail.operations.status', 'Status')}</label>
                <select value={b.internal_status || 'new'} onChange={e => updateStatus.mutate({ internal_status: e.target.value })} className={selectClass}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{formatLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-1.5 uppercase tracking-wider">{t('bookingDetail.operations.invoice', 'Invoice')}</label>
                <select value={b.invoice_state || 'not_applicable'} onChange={e => updateStatus.mutate({ invoice_state: e.target.value })} className={selectClass}>
                  {INVOICE_OPTIONS.map(s => <option key={s} value={s}>{formatLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-1.5 uppercase tracking-wider">{t('bookingDetail.operations.payment', 'Payment')}</label>
                <select value={b.payment_status || 'pending'} onChange={e => updateStatus.mutate({ payment_status: e.target.value })} className={selectClass}>
                  {PAYMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{formatLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium block mb-1.5 uppercase tracking-wider">{t('bookingDetail.operations.paid_amount', 'Paid (€)')}</label>
                <input key={`paid-${b.price_paid}`} type="number" step="0.01" min="0" defaultValue={b.price_paid || 0}
                  onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== (b.price_paid || 0)) updateStatus.mutate({ price_paid: v }) }}
                  className={selectClass} />
              </div>
            </div>
          </Card>

          {/* Meta */}
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-4">{t('bookingDetail.meta.title', 'Details')}</h3>
            <div className="space-y-3">
              {[
                [t('bookingDetail.meta.reference',   'Reference'),   b.booking_reference],
                [t('bookingDetail.meta.reservation', 'Reservation'), b.reservation_id],
                [t('bookingDetail.meta.type',        'Type'),        b.booking_type],
                [t('bookingDetail.meta.channel',     'Channel'),     b.channel_name],
                [t('bookingDetail.meta.unit',        'Unit'),        b.apartment_name],
                [t('bookingDetail.meta.state',       'State'),       b.booking_state],
                [t('bookingDetail.meta.synced',      'Synced'),      b.synced_at ? new Date(b.synced_at).toLocaleString() : null],
                [t('bookingDetail.meta.created',     'Created'),     b.created_at ? new Date(b.created_at).toLocaleString() : null],
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

      {/* Refund modal */}
      {refundOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-300">
                  <Undo2 size={15} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{t('bookingDetail.refund.title', 'Issue refund')}</p>
                  <p className="text-[11px] text-t-secondary">{t('bookingDetail.refund.subtitle', 'Stripe will return funds in 5–10 business days')}</p>
                </div>
              </div>
              <button onClick={() => setRefundOpen(false)} className="text-[#636366] hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] mb-1">
                  {t('bookingDetail.refund.amount_label', 'Amount')} <span className="text-[#636366] font-normal">{t('bookingDetail.refund.amount_hint', { total: money(b.price_total || 0), defaultValue: '(leave empty for full refund of {{total}})' })}</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder={String(b.price_total ?? '')}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] mb-1">{t('bookingDetail.refund.reason_label', 'Reason')} <span className="text-[#636366] font-normal">{t('bookingDetail.refund.reason_optional', '(optional)')}</span></label>
                <select
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value as any)}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  <option value="">{t('bookingDetail.refund.reasons.none', '— No reason —')}</option>
                  <option value="requested_by_customer">{t('bookingDetail.refund.reasons.requested_by_customer', 'Requested by customer')}</option>
                  <option value="duplicate">{t('bookingDetail.refund.reasons.duplicate', 'Duplicate charge')}</option>
                  <option value="fraudulent">{t('bookingDetail.refund.reasons.fraudulent', 'Fraudulent')}</option>
                </select>
              </div>
              {b.payment_method === 'mock' && (
                <p className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                  This is a mock booking — no real refund will be issued. The payment status will just flip to <code className="font-mono">refunded</code>.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-dark-border">
              <button onClick={() => setRefundOpen(false)} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">{t('actions.cancel', 'Cancel')}</button>
              <button
                onClick={() => refundMutation.mutate({
                  amount: refundAmount ? Number(refundAmount) : undefined,
                  reason: refundReason || undefined,
                })}
                disabled={refundMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg flex items-center gap-2"
              >
                {refundMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
