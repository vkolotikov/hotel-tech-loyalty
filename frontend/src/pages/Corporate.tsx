import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import { Plus, Search, ChevronLeft, ChevronRight, X, Building2, ChevronDown, ChevronUp, Sparkles, Loader2 } from 'lucide-react'
import { CustomFieldsForm, CustomFieldsDisplay } from '../components/CustomFields'

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-500/20 text-green-400',
  Expired: 'bg-red-500/20 text-red-400',
  Pending: 'bg-yellow-500/20 text-yellow-400',
  Suspended: 'bg-gray-500/20 text-gray-400',
}

const STATUSES = ['Active', 'Expired', 'Pending', 'Suspended']

const EMPTY_FORM = {
  company_name: '', industry: '', contact_person: '', contact_email: '', contact_phone: '',
  account_manager: '', contract_start: '', contract_end: '', negotiated_rate: '',
  rate_type: '', discount_percentage: '', annual_room_nights_target: '',
  payment_terms: '', credit_limit: '', billing_address: '', billing_email: '',
  tax_id: '', notes: '',
  custom_data: {} as Record<string, any>,
}

export function Corporate() {
  const qc = useQueryClient()
  const settings = useSettings()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [accountManager, setAccountManager] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('company_name')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [showCreate, setShowCreate] = useState(false)
  const [createTab, setCreateTab] = useState<'form' | 'ai'>('form')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [captureText, setCaptureText] = useState('')
  const [captureLoading, setCaptureLoading] = useState(false)
  const [captureResult, setCaptureResult] = useState<any>(null)

  const params: any = { page, per_page: 25, sort, dir }
  if (search) params.search = search
  if (status) params.status = status
  if (accountManager) params.account_manager = accountManager

  const { data, isLoading } = useQuery({
    queryKey: ['corporate-accounts', params],
    queryFn: () => api.get('/v1/admin/corporate-accounts', { params }).then(r => r.data),
  })

  const { data: detail } = useQuery({
    queryKey: ['corporate-account-detail', expandedId],
    queryFn: () => api.get(`/v1/admin/corporate-accounts/${expandedId}`).then(r => r.data),
    enabled: expandedId !== null,
  })

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/corporate-accounts', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['corporate-accounts'] }); setShowCreate(false); setForm({ ...EMPTY_FORM }); toast.success('Corporate account created') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error creating account'),
  })

  const accounts = data?.data ?? []
  const meta = data?.meta ?? {}

  const toggleSort = (col: string) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setDir('asc') }
  }

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary cursor-pointer hover:text-gray-300 select-none whitespace-nowrap" onClick={() => toggleSort(col)}>
      {label} {sort === col ? (dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  const fmt = (v: any) => v != null ? `${settings.currency_symbol}${Number(v).toLocaleString()}` : '—'
  const F = (name: keyof typeof form, value: string) => setForm(f => ({ ...f, [name]: value }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Corporate Accounts</h1>
          <p className="text-sm text-t-secondary mt-0.5">{meta.total ?? 0} total</p>
        </div>
        <button onClick={() => { setShowCreate(true); setForm({ ...EMPTY_FORM }) }} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors">
          <Plus size={15} /> Add Account
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
          <input type="text" placeholder="Search company, contact, email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="bg-dark-surface border border-dark-border rounded-lg text-sm text-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={accountManager} onChange={e => { setAccountManager(e.target.value); setPage(1) }}
          className="bg-dark-surface border border-dark-border rounded-lg text-sm text-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">All Managers</option>
          {settings.account_managers.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-border bg-dark-surface2">
              <tr>
                <th className="w-8 px-3 py-3" />
                <SortHeader col="company_name" label="Company" />
                <SortHeader col="industry" label="Industry" />
                <SortHeader col="contact_person" label="Contact" />
                <SortHeader col="account_manager" label="Manager" />
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Contract</th>
                <SortHeader col="negotiated_rate" label="Rate" />
                <SortHeader col="discount_percentage" label="Discount" />
                <SortHeader col="annual_revenue" label="Revenue" />
                <SortHeader col="status" label="Status" />
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {isLoading ? (
                <tr><td colSpan={10} className="text-center py-12 text-[#636366]">Loading...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-[#636366]">No corporate accounts found</td></tr>
              ) : accounts.map((a: any) => (
                <>
                  <tr key={a.id} onClick={() => setExpandedId(expandedId === a.id ? null : a.id)} className="hover:bg-dark-surface2/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-[#636366]">
                      {expandedId === a.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{a.company_name}</td>
                    <td className="px-4 py-3 text-[#a0a0a0]">{a.industry || '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{a.contact_person || '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{a.account_manager || '—'}</td>
                    <td className="px-4 py-3 text-[#a0a0a0] text-xs whitespace-nowrap">
                      {a.contract_start && a.contract_end ? `${a.contract_start} — ${a.contract_end}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{a.negotiated_rate != null ? fmt(a.negotiated_rate) : '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{a.discount_percentage != null ? `${a.discount_percentage}%` : '—'}</td>
                    <td className="px-4 py-3 text-primary-400 font-medium">{a.annual_revenue != null ? fmt(a.annual_revenue) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status] || 'bg-gray-500/20 text-t-secondary'}`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                  {expandedId === a.id && (
                    <tr key={`detail-${a.id}`}>
                      <td colSpan={10} className="bg-dark-bg px-6 py-5 border-t border-dark-border">
                        <DetailPanel account={a} detail={detail} currencySymbol={settings.currency_symbol} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
            <span className="text-xs text-t-secondary">Page {meta.current_page} of {meta.last_page} ({meta.total} results)</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-dark-surface2 text-[#a0a0a0] disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(p => Math.min(meta.last_page, p + 1))} disabled={page >= meta.last_page} className="p-1.5 rounded-lg hover:bg-dark-surface2 text-[#a0a0a0] disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowCreate(false); setCaptureResult(null); setCaptureText(''); setCreateTab('form') }}>
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-primary-400" />
                <h2 className="text-lg font-bold text-white">Add Corporate Account</h2>
              </div>
              <button onClick={() => { setShowCreate(false); setCaptureResult(null); setCaptureText(''); setCreateTab('form') }} className="text-[#636366] hover:text-white"><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-dark-border">
              <button onClick={() => setCreateTab('form')} className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${createTab === 'form' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-t-secondary hover:text-white'}`}>
                <Plus size={14} className="inline mr-1.5 -mt-0.5" />Manual Entry
              </button>
              <button onClick={() => setCreateTab('ai')} className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${createTab === 'ai' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-t-secondary hover:text-white'}`}>
                <Sparkles size={14} className="inline mr-1.5 -mt-0.5" />AI Capture
              </button>
            </div>

            {createTab === 'form' ? (
              <form onSubmit={e => { e.preventDefault(); createMutation.mutate(form) }} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Company Name *" value={form.company_name} onChange={v => F('company_name', v)} required />
                  <Select label="Industry" value={form.industry} onChange={v => F('industry', v)} options={settings.industries} />
                  <Input label="Contact Person" value={form.contact_person} onChange={v => F('contact_person', v)} />
                  <Input label="Contact Email" value={form.contact_email} onChange={v => F('contact_email', v)} type="email" />
                  <Input label="Contact Phone" value={form.contact_phone} onChange={v => F('contact_phone', v)} />
                  <Select label="Account Manager" value={form.account_manager} onChange={v => F('account_manager', v)} options={settings.account_managers} />
                  <Input label="Contract Start" value={form.contract_start} onChange={v => F('contract_start', v)} type="date" />
                  <Input label="Contract End" value={form.contract_end} onChange={v => F('contract_end', v)} type="date" />
                  <Input label="Negotiated Rate" value={form.negotiated_rate} onChange={v => F('negotiated_rate', v)} type="number" />
                  <Select label="Rate Type" value={form.rate_type} onChange={v => F('rate_type', v)} options={settings.rate_types} />
                  <Input label="Discount %" value={form.discount_percentage} onChange={v => F('discount_percentage', v)} type="number" />
                  <Input label="Annual Room Nights Target" value={form.annual_room_nights_target} onChange={v => F('annual_room_nights_target', v)} type="number" />
                  <Input label="Payment Terms" value={form.payment_terms} onChange={v => F('payment_terms', v)} />
                  <Input label="Credit Limit" value={form.credit_limit} onChange={v => F('credit_limit', v)} type="number" />
                  <Input label="Billing Email" value={form.billing_email} onChange={v => F('billing_email', v)} type="email" />
                  <Input label="Tax ID" value={form.tax_id} onChange={v => F('tax_id', v)} />
                </div>
                <Input label="Billing Address" value={form.billing_address} onChange={v => F('billing_address', v)} />
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Notes</label>
                  <textarea value={form.notes} onChange={e => F('notes', e.target.value)} rows={3}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                </div>
                <CustomFieldsForm
                  entity="corporate_account"
                  values={form.custom_data}
                  onChange={(next) => setForm(f => ({ ...f, custom_data: next }))}
                  inputClassName="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white transition-colors">Cancel</button>
                  <button type="submit" disabled={createMutation.isPending} className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg transition-colors disabled:opacity-50">
                    {createMutation.isPending ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-6">
                {!captureResult ? (
                  <div className="space-y-3">
                    <p className="text-xs text-t-secondary">Paste an email, contract excerpt, proposal, or meeting notes. AI will extract corporate account details automatically.</p>
                    <textarea value={captureText} onChange={e => setCaptureText(e.target.value)} rows={8}
                      placeholder="e.g. Following our meeting with Acme Corp (tech company), their travel manager Jane Doe (jane@acme.com, +1 555 0123) agreed to a corporate rate of $180/night with 15% discount. Contract runs Jan-Dec 2026, targeting 500 room nights. Payment net 30, credit limit $50,000. Tax ID: US12-3456789..."
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => { setShowCreate(false); setCaptureText('') }} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                      <button
                        onClick={async () => {
                          if (!captureText.trim()) return
                          setCaptureLoading(true)
                          try {
                            const res = await api.post('/v1/admin/crm-ai/capture-corporate', { text: captureText })
                            if (res.data.success) {
                              setCaptureResult(res.data.data)
                            } else {
                              toast.error(res.data.error || 'Failed to extract data')
                            }
                          } catch (e: any) {
                            toast.error(e.response?.data?.message || 'AI extraction failed')
                          } finally { setCaptureLoading(false) }
                        }}
                        disabled={captureLoading || !captureText.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {captureLoading ? <><Loader2 size={14} className="animate-spin" /> Extracting...</> : <><Sparkles size={14} /> Extract</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-xs text-purple-300">
                      AI extracted the following. Review and edit before creating the account.
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'company_name', label: 'Company Name *' },
                        { key: 'industry', label: 'Industry' },
                        { key: 'contact_person', label: 'Contact Person' },
                        { key: 'contact_email', label: 'Contact Email' },
                        { key: 'contact_phone', label: 'Contact Phone' },
                        { key: 'account_manager', label: 'Account Manager' },
                        { key: 'contract_start', label: 'Contract Start', type: 'date' },
                        { key: 'contract_end', label: 'Contract End', type: 'date' },
                        { key: 'negotiated_rate', label: 'Negotiated Rate', type: 'number' },
                        { key: 'rate_type', label: 'Rate Type' },
                        { key: 'discount_percentage', label: 'Discount %', type: 'number' },
                        { key: 'annual_room_nights_target', label: 'Annual Room Nights', type: 'number' },
                        { key: 'payment_terms', label: 'Payment Terms' },
                        { key: 'credit_limit', label: 'Credit Limit', type: 'number' },
                        { key: 'billing_email', label: 'Billing Email' },
                        { key: 'tax_id', label: 'Tax ID' },
                      ].map(({ key, label, type }) => (
                        <div key={key}>
                          <label className="block text-xs text-[#a0a0a0] mb-1">{label}</label>
                          <input type={type || 'text'} value={captureResult[key] ?? ''} onChange={e => setCaptureResult((r: any) => ({ ...r, [key]: e.target.value }))}
                            className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="block text-xs text-[#a0a0a0] mb-1">Billing Address</label>
                      <input type="text" value={captureResult.billing_address ?? ''} onChange={e => setCaptureResult((r: any) => ({ ...r, billing_address: e.target.value }))}
                        className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#a0a0a0] mb-1">Notes</label>
                      <textarea value={captureResult.notes ?? ''} onChange={e => setCaptureResult((r: any) => ({ ...r, notes: e.target.value }))} rows={3}
                        className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                    </div>
                    <div className="flex justify-between pt-1">
                      <button onClick={() => setCaptureResult(null)} className="text-sm text-[#636366] hover:text-white">Back</button>
                      <div className="flex gap-3">
                        <button onClick={() => { setShowCreate(false); setCaptureResult(null); setCaptureText('') }} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                        <button
                          onClick={async () => {
                            const r = captureResult
                            try {
                              await api.post('/v1/admin/corporate-accounts', {
                                company_name: r.company_name,
                                industry: r.industry || undefined,
                                contact_person: r.contact_person || undefined,
                                contact_email: r.contact_email || undefined,
                                contact_phone: r.contact_phone || undefined,
                                account_manager: r.account_manager || undefined,
                                contract_start: r.contract_start || undefined,
                                contract_end: r.contract_end || undefined,
                                negotiated_rate: r.negotiated_rate || undefined,
                                rate_type: r.rate_type || undefined,
                                discount_percentage: r.discount_percentage || undefined,
                                annual_room_nights_target: r.annual_room_nights_target || undefined,
                                payment_terms: r.payment_terms || undefined,
                                credit_limit: r.credit_limit || undefined,
                                billing_address: r.billing_address || undefined,
                                billing_email: r.billing_email || undefined,
                                tax_id: r.tax_id || undefined,
                                notes: r.notes || undefined,
                              })
                              qc.invalidateQueries({ queryKey: ['corporate-accounts'] })
                              toast.success(`Corporate account created for ${r.company_name}`)
                              setShowCreate(false); setCaptureResult(null); setCaptureText('')
                            } catch (e: any) {
                              toast.error(e.response?.data?.message || 'Failed to create account')
                            }
                          }}
                          disabled={!captureResult.company_name}
                          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                          Create Account
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailPanel({ account, detail, currencySymbol }: { account: any; detail: any; currencySymbol: string }) {
  const fmt = (v: any) => v != null ? `${currencySymbol}${Number(v).toLocaleString()}` : '—'
  const info = detail ?? account
  const ltv = detail?.ltv

  // CRM Phase 4: vitals strip pulls together LTV / open-pipeline / credit
  // utilization / last contact + renewal-soon chip into one glance.
  return (
    <div className="space-y-4">
      {ltv && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Vital label="Lifetime revenue" value={fmt(ltv.confirmed_revenue)} valueClass="text-emerald-400" />
          <Vital
            label={`Open pipeline · ${ltv.open_pipeline_count}`}
            value={fmt(ltv.open_pipeline_value)}
            valueClass="text-cyan-400"
          />
          <CreditMeter
            outstanding={ltv.outstanding}
            limit={info.credit_limit}
            pct={ltv.credit_pct}
            currencySymbol={currencySymbol}
          />
          <Vital
            label="Last contact"
            value={ltv.last_contact_at
              ? new Date(ltv.last_contact_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'No activity yet'}
            valueClass={ltv.last_contact_at ? 'text-white' : 'text-amber-400'}
          />
        </div>
      )}

      {ltv?.renewal_soon && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
          <span className="font-bold uppercase tracking-wide text-amber-300">Renewal soon</span>
          <span>Contract ends {info.contract_end} — within 60 days.</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoBlock label="Billing Email" value={info.billing_email || '—'} />
        <InfoBlock label="Tax ID" value={info.tax_id || '—'} />
        <InfoBlock label="Rate Type" value={info.rate_type || '—'} />
        <InfoBlock label="Payment Terms" value={info.payment_terms || '—'} />
      </div>
      {info.billing_address && <div><span className="text-xs text-t-secondary">Billing Address</span><p className="text-sm text-gray-300 mt-0.5">{info.billing_address}</p></div>}
      {info.notes && <div><span className="text-xs text-t-secondary">Notes</span><p className="text-sm text-gray-300 mt-0.5">{info.notes}</p></div>}

      <CustomFieldsDisplay entity="corporate_account" values={info.custom_data} />

      {detail?.recent_inquiries?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-t-secondary uppercase tracking-wide mb-2">Linked deals</h4>
          <div className="space-y-1">
            {detail.recent_inquiries.map((i: any) => (
              <a
                key={i.id}
                href={`/inquiries/${i.id}`}
                className="flex items-center justify-between bg-dark-surface2 rounded-lg px-3 py-2 text-xs hover:bg-dark-surface transition"
              >
                <span className="text-gray-300 flex-1 truncate">
                  {i.guest_name ?? `Inquiry #${i.id}`}
                  {i.inquiry_type && <span className="text-[#636366]"> · {i.inquiry_type}</span>}
                </span>
                <span className="text-[#636366] mr-3">{i.check_in ?? '—'}</span>
                <span className="text-primary-400 mr-3">{fmt(i.total_value)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${i.status === 'Confirmed' ? 'bg-green-500/20 text-green-400' : i.status === 'Lost' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>{i.status}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {detail?.recent_reservations?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-t-secondary uppercase tracking-wide mb-2">Recent reservations</h4>
          <div className="space-y-1">
            {detail.recent_reservations.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between bg-dark-surface2 rounded-lg px-3 py-2 text-xs">
                <span className="text-gray-300">{r.guest_name || r.reference}</span>
                <span className="text-[#636366]">{r.check_in} — {r.check_out}</span>
                <span className="text-primary-400">{fmt(r.total)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === 'Confirmed' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-t-secondary'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {detail && !detail.recent_reservations?.length && !detail.recent_inquiries?.length && (
        <p className="text-xs text-[#636366]">No recent reservations or inquiries for this account.</p>
      )}
    </div>
  )
}

function Vital({ label, value, valueClass = 'text-white' }: { label: string; value: any; valueClass?: string }) {
  return (
    <div className="bg-dark-bg border border-dark-border rounded-md p-2.5">
      <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">{label}</p>
      <p className={`text-sm font-bold tabular-nums mt-0.5 ${valueClass}`}>{value}</p>
    </div>
  )
}

function CreditMeter({ outstanding, limit, pct, currencySymbol }: {
  outstanding: number
  limit: number | null
  pct: number | null
  currencySymbol: string
}) {
  const fmt = (v: any) => v != null ? `${currencySymbol}${Number(v).toLocaleString()}` : '—'
  if (!limit || limit <= 0) {
    return <Vital label="Credit usage" value="No limit set" valueClass="text-t-secondary" />
  }
  const barColor = pct! >= 90 ? '#ef4444' : pct! >= 75 ? '#f59e0b' : '#10b981'
  return (
    <div className="bg-dark-bg border border-dark-border rounded-md p-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide font-bold text-t-secondary">
        <span>Credit · {pct}%</span>
        <span className="text-white tabular-nums normal-case">{fmt(outstanding)} / {fmt(limit)}</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-dark-surface2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return <div><span className="text-xs text-t-secondary">{label}</span><p className="text-sm text-gray-300 mt-0.5">{value}</p></div>
}

function Input({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs text-[#a0a0a0] mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-xs text-[#a0a0a0] mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
        <option value="">Select...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
