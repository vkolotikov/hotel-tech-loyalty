import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Upload, Wallet, Apple, Smartphone, Loader2, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'

/**
 * Apple Wallet + Google Wallet config page.
 *
 * One-time setup per organization. Customer uploads their cert files
 * (Apple Pass Type ID .p12, WWDR .pem, Google service account JSON)
 * then the member endpoints start emitting passes that members can
 * tap-to-add to Wallet from the mobile app.
 *
 * The .p12 password is masked — admins re-enter when changing.
 */

interface Config {
  apple_pass_type_id: string | null
  apple_team_id: string | null
  apple_organization_name: string | null
  apple_pass_background_color: string
  apple_pass_foreground_color: string
  apple_pass_label_color: string
  apple_cert_uploaded: boolean
  apple_cert_password_set: boolean
  apple_wwdr_uploaded: boolean
  apple_ready: boolean
  google_issuer_id: string | null
  google_class_suffix: string | null
  google_service_account_uploaded: boolean
  google_ready: boolean
  is_active: boolean
}

export function WalletConfig() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<{ config: Config }>({
    queryKey: ['wallet-config'],
    queryFn: () => api.get('/v1/admin/wallet-config').then(r => r.data),
  })

  const [form, setForm] = useState({
    apple_pass_type_id: '', apple_team_id: '', apple_organization_name: '',
    apple_pass_background_color: 'rgb(13,13,13)',
    apple_pass_foreground_color: 'rgb(255,255,255)',
    apple_pass_label_color: 'rgb(201,168,76)',
    apple_cert_password: '',
    google_issuer_id: '', google_class_suffix: 'hotel_loyalty',
    is_active: true,
  })

  useEffect(() => {
    if (data?.config) {
      const c = data.config
      setForm({
        apple_pass_type_id: c.apple_pass_type_id ?? '',
        apple_team_id: c.apple_team_id ?? '',
        apple_organization_name: c.apple_organization_name ?? '',
        apple_pass_background_color: c.apple_pass_background_color ?? 'rgb(13,13,13)',
        apple_pass_foreground_color: c.apple_pass_foreground_color ?? 'rgb(255,255,255)',
        apple_pass_label_color: c.apple_pass_label_color ?? 'rgb(201,168,76)',
        apple_cert_password: '',
        google_issuer_id: c.google_issuer_id ?? '',
        google_class_suffix: c.google_class_suffix ?? 'hotel_loyalty',
        is_active: c.is_active,
      })
    }
  }, [data?.config])

  const config = data?.config

  const saveMutation = useMutation({
    mutationFn: () => api.put('/v1/admin/wallet-config', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wallet-config'] }); toast.success('Wallet config saved') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const uploadMutation = (endpoint: string, label: string) => useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      if (endpoint === '/v1/admin/wallet-config/apple-cert' && form.apple_cert_password) {
        fd.append('password', form.apple_cert_password)
      }
      return api.post(endpoint, fd)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wallet-config'] }); toast.success(`${label} uploaded`) },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Upload failed'),
  })

  const uploadCert  = uploadMutation('/v1/admin/wallet-config/apple-cert', 'Apple Pass Type ID cert')
  const uploadWwdr  = uploadMutation('/v1/admin/wallet-config/apple-wwdr', 'Apple WWDR cert')
  const uploadGoogleSA = uploadMutation('/v1/admin/wallet-config/google-service-account', 'Google service account')

  const FileInput = ({ label, mutation, accept }: { label: string; mutation: any; accept: string }) => (
    <label className="flex items-center gap-2 bg-dark-surface2 border border-dark-border text-[#a0a0a0] hover:text-white text-xs px-3 py-2 rounded-lg cursor-pointer w-fit">
      {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
      <span>{label}</span>
      <input type="file" accept={accept} className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) mutation.mutate(f)
        e.target.value = ''
      }} />
    </label>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet size={20} className="text-primary-400" /> Wallet passes
        </h1>
        <p className="text-sm text-t-secondary mt-0.5">
          Let members add their loyalty card to Apple Wallet or Google Wallet. One-time setup per platform.
        </p>
      </div>

      {/* Status strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReadyTile label="Apple Wallet" ready={!!config?.apple_ready} hint="Pass Type ID + cert + WWDR + Team ID required" />
        <ReadyTile label="Google Wallet" ready={!!config?.google_ready} hint="Issuer ID + Class Suffix + service account JSON required" />
      </div>

      {isLoading ? (
        <p className="text-center text-[#636366] py-8 text-sm">Loading…</p>
      ) : (
        <>
          {/* Apple */}
          <Card>
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Apple size={16} /> Apple Wallet
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <Field label="Pass Type Identifier" hint="e.g. pass.com.hotelloyalty.loyalty"
                value={form.apple_pass_type_id} onChange={v => setForm(f => ({ ...f, apple_pass_type_id: v }))} />
              <Field label="Team Identifier" hint="10-character Apple Team ID"
                value={form.apple_team_id} onChange={v => setForm(f => ({ ...f, apple_team_id: v }))} />
              <Field label="Organization name" hint="Shown as the pass issuer to members"
                value={form.apple_organization_name} onChange={v => setForm(f => ({ ...f, apple_organization_name: v }))} />
              <Field label=".p12 cert password" hint="Leave blank to keep current"
                type="password" value={form.apple_cert_password}
                onChange={v => setForm(f => ({ ...f, apple_cert_password: v }))} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <Field label="Background color" hint="e.g. rgb(13,13,13)"
                value={form.apple_pass_background_color}
                onChange={v => setForm(f => ({ ...f, apple_pass_background_color: v }))} />
              <Field label="Foreground color" hint="Main text"
                value={form.apple_pass_foreground_color}
                onChange={v => setForm(f => ({ ...f, apple_pass_foreground_color: v }))} />
              <Field label="Label color" hint="Field labels (smaller text)"
                value={form.apple_pass_label_color}
                onChange={v => setForm(f => ({ ...f, apple_pass_label_color: v }))} />
            </div>

            <div className="space-y-2 pt-3 border-t border-dark-border">
              <div className="flex items-center gap-3 text-xs">
                <CertStatus ok={!!config?.apple_cert_uploaded} label=".p12 cert" />
                <FileInput label="Upload .p12" accept=".p12,application/x-pkcs12" mutation={uploadCert} />
              </div>
              <div className="flex items-center gap-3 text-xs">
                <CertStatus ok={!!config?.apple_wwdr_uploaded} label="WWDR cert" />
                <FileInput label="Upload WWDR .pem" accept=".pem,.cer,application/x-x509-ca-cert" mutation={uploadWwdr} />
              </div>
              <p className="text-[11px] text-[#636366] mt-2 flex items-start gap-1.5">
                <Info size={11} className="mt-0.5 flex-shrink-0" />
                <span>
                  Need WWDR? Download from <a href="https://www.apple.com/certificateauthority/" target="_blank" rel="noreferrer" className="text-primary-400 hover:underline">apple.com/certificateauthority</a>.
                  Generate the .p12 from your Pass Type ID in the Apple Developer portal (Keychain → export).
                </span>
              </p>
            </div>
          </Card>

          {/* Google */}
          <Card>
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Smartphone size={16} /> Google Wallet
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <Field label="Issuer ID" hint="From Google Pay & Wallet Console"
                value={form.google_issuer_id} onChange={v => setForm(f => ({ ...f, google_issuer_id: v }))} />
              <Field label="Loyalty Class suffix" hint="Used to namespace all passes. Pre-create the class with this ID."
                value={form.google_class_suffix} onChange={v => setForm(f => ({ ...f, google_class_suffix: v }))} />
            </div>

            <div className="space-y-2 pt-3 border-t border-dark-border">
              <div className="flex items-center gap-3 text-xs">
                <CertStatus ok={!!config?.google_service_account_uploaded} label="Service account JSON" />
                <FileInput label="Upload .json" accept=".json,application/json" mutation={uploadGoogleSA} />
              </div>
              <p className="text-[11px] text-[#636366] mt-2 flex items-start gap-1.5">
                <Info size={11} className="mt-0.5 flex-shrink-0" />
                <span>
                  Open the <a href="https://pay.google.com/business/console/" target="_blank" rel="noreferrer" className="text-primary-400 hover:underline">Google Pay & Wallet Console</a>,
                  create a Loyalty Class (use the suffix above), and a service account with "Wallet Object Issuer" role.
                  Download its JSON key and upload here.
                </span>
              </p>
            </div>
          </Card>

          {/* Save / activate */}
          <Card>
            <label className="flex items-center gap-2 text-sm text-[#e0e0e0] mb-3 cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Wallet passes are active (members can add passes from the mobile app)
            </label>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              {saveMutation.isPending ? 'Saving…' : 'Save configuration'}
            </button>
          </Card>
        </>
      )}
    </div>
  )
}

function ReadyTile({ label, ready, hint }: { label: string; ready: boolean; hint: string }) {
  return (
    <div className={`rounded-xl p-4 border ${ready ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-dark-border bg-dark-surface'}`}>
      <div className="flex items-center gap-2 mb-1">
        {ready ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-[#636366]" />}
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-dark-surface3 text-[#a0a0a0]'}`}>
          {ready ? 'Ready' : 'Not configured'}
        </span>
      </div>
      <p className="text-[11px] text-[#636366]">{hint}</p>
    </div>
  )
}

function CertStatus({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${ok ? 'text-emerald-400' : 'text-[#636366]'}`}>
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      <span>{label} — {ok ? 'uploaded' : 'missing'}</span>
    </span>
  )
}

function Field({ label, hint, value, onChange, type = 'text' }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-t-secondary mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
      {hint && <p className="text-[10px] text-[#636366] mt-1">{hint}</p>}
    </div>
  )
}
