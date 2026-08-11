import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Copy, Check } from 'lucide-react'
import { api } from '../../lib/api'
import toast from 'react-hot-toast'

/**
 * Profile, communication preferences and referral code.
 *
 * The marketing toggle here is the member-facing half of the compliance
 * gate: `marketing_consent` defaults to FALSE and campaigns now require
 * it, so this screen is how a member actually opts in. Framed as a plain
 * choice rather than a pre-ticked box, and it says explicitly that
 * service messages continue either way — because they do.
 */

interface Profile {
  user: {
    name: string
    email: string
    phone?: string | null
    date_of_birth?: string | null
    nationality?: string | null
  }
  member: {
    member_number: string
    referral_code?: string | null
    marketing_consent?: boolean
    email_notifications?: boolean
    push_notifications?: boolean
  }
}

export function PortalProfile() {
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery<Profile>({
    queryKey: ['portal-profile'],
    queryFn: () => api.get('/v1/member/profile').then(r => r.data),
  })

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put('/v1/member/profile', payload).then(r => r.data),
    onSuccess: () => {
      toast.success('Saved')
      qc.invalidateQueries({ queryKey: ['portal-profile'] })
    },
    onError: () => toast.error('Could not save your changes'),
  })

  const copyReferral = async () => {
    const code = data?.member?.referral_code
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy — select and copy the code manually')
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-20 text-t-secondary"><Loader2 className="animate-spin" size={22} /></div>
  }

  const member = data?.member

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">Profile</h1>

      {/* Uncontrolled, read on submit. Mirroring server state into
          useState needed an effect that re-fired on every refetch and
          would quietly discard whatever the member was mid-way through
          typing. `key` re-seeds the defaults when the profile actually
          changes. */}
      <form
        key={data?.user?.email ?? 'profile'}
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          save.mutate({
            name: String(fd.get('name') ?? ''),
            phone: String(fd.get('phone') ?? ''),
          })
        }}
        className="rounded-xl border border-dark-border bg-dark-surface p-4 space-y-3"
      >
        <Field label="Name">
          <input
            name="name"
            defaultValue={data?.user?.name ?? ''}
            className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm
                       text-white focus:border-primary-500 focus:outline-none"
          />
        </Field>

        <Field label="Email" hint="Contact us if you need to change this">
          <input
            value={data?.user?.email ?? ''}
            disabled
            className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm
                       text-t-secondary cursor-not-allowed"
          />
        </Field>

        <Field label="Phone">
          <input
            name="phone"
            defaultValue={data?.user?.phone ?? ''}
            placeholder="+371 20 000 000"
            className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm
                       text-white placeholder:text-t-secondary focus:border-primary-500 focus:outline-none"
          />
        </Field>

        <button
          type="submit"
          disabled={save.isPending}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50
                     text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          {save.isPending && <Loader2 size={14} className="animate-spin" />}
          Save changes
        </button>
      </form>

      <section className="rounded-xl border border-dark-border bg-dark-surface p-4 space-y-1">
        <h2 className="text-sm font-semibold mb-2">Communication</h2>

        <Toggle
          label="Offers and news by email"
          hint="Occasional emails about rewards, offers and events. You can turn this off at any time."
          checked={!!member?.marketing_consent}
          onChange={v => save.mutate({ marketing_consent: v })}
          disabled={save.isPending}
        />

        <Toggle
          label="Push notifications"
          hint="Points updates and reminders on your phone."
          checked={!!member?.push_notifications}
          onChange={v => save.mutate({ push_notifications: v })}
          disabled={save.isPending}
        />

        <p className="text-[11px] text-t-secondary pt-2 leading-relaxed">
          You'll still receive service messages about your account — password resets,
          reward confirmations and similar — regardless of these settings.
        </p>
      </section>

      {member?.referral_code && (
        <section className="rounded-xl border border-dark-border bg-dark-surface p-4">
          <h2 className="text-sm font-semibold mb-1">Invite a friend</h2>
          <p className="text-xs text-t-secondary mb-3">
            Share your code — you'll both be rewarded when they join.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2
                             font-mono text-sm tracking-widest text-center">
              {member.referral_code}
            </code>
            <button
              onClick={copyReferral}
              aria-label="Copy referral code"
              className="shrink-0 border border-dark-border rounded-lg p-2.5 text-t-secondary hover:text-white"
            >
              {copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
            </button>
          </div>
        </section>
      )}

      <p className="text-center text-[11px] text-t-secondary">
        Member number <span className="font-mono">{member?.member_number}</span>
      </p>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-t-secondary mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-t-secondary mt-1">{hint}</span>}
    </label>
  )
}

function Toggle({ label, hint, checked, onChange, disabled }: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[11px] text-t-secondary mt-0.5">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-50
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${
          checked ? 'bg-primary-600' : 'bg-dark-surface3'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
