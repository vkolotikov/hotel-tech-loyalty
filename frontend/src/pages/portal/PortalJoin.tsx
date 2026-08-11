import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'

/**
 * Public member sign-up.
 *
 * Registration is tenant-scoped, so the page has to know which programme
 * it is enrolling someone into. The join link carries the org's
 * `widget_token` — `/portal/join?org={token}` — the same public token the
 * booking, services and chat widgets already use. Without it the API
 * cannot resolve an org, and rather than guess (which used to mean picking
 * another tenant's tier and writing a member nobody could see) the page
 * says so plainly.
 */

interface JoinContext {
  organization: { id: number; name: string }
  accepting_joins: boolean
  starting_tier?: string
  welcome_bonus?: number
  error?: string
}

export function PortalJoin() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const orgToken = params.get('org') ?? ''
  const [error, setError] = useState<string | null>(null)

  const { data: ctx, isLoading, isError } = useQuery<JoinContext>({
    queryKey: ['join-context', orgToken],
    queryFn: () => api.get(`/v1/public/join/${orgToken}`).then(r => r.data),
    enabled: !!orgToken,
    retry: false,
  })

  const register = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      api.post('/v1/auth/register', { ...payload, org_token: orgToken }).then(r => r.data),
    onSuccess: (data) => {
      setAuth(data.token, data.user, data.staff ?? null)
      navigate('/portal', { replace: true })
    },
    onError: (e: unknown) => {
      const res = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response
      // Surface the first field error — "The email has already been taken"
      // is far more useful than a generic failure.
      const firstFieldError = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : null
      setError(firstFieldError || res?.data?.message || 'Could not create your account.')
    },
  })

  if (!orgToken) {
    return (
      <Shell>
        <Problem
          title="This link is incomplete"
          body="Sign-up links include a code that tells us which loyalty programme you're joining. Please use the link the hotel gave you."
        />
      </Shell>
    )
  }

  if (isLoading) {
    return <Shell><div className="flex justify-center py-10"><Loader2 className="animate-spin text-t-secondary" size={22} /></div></Shell>
  }

  if (isError || !ctx?.accepting_joins) {
    return (
      <Shell>
        <Problem
          title="Sign-up isn't available"
          body={ctx?.error || 'This sign-up link is not valid, or the programme is not open for new members yet. Please check with the hotel.'}
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="text-center mb-6">
        <div className="w-11 h-11 rounded-xl bg-primary-500/15 flex items-center justify-center mx-auto mb-3">
          <Sparkles size={20} className="text-primary-400" />
        </div>
        <h1 className="text-xl font-bold">Join {ctx.organization.name}</h1>
        <p className="text-sm text-t-secondary mt-1">
          {ctx.welcome_bonus
            ? `Start with ${ctx.welcome_bonus.toLocaleString()} points on us.`
            : 'Earn points every time you visit.'}
        </p>
      </div>

      {error && (
        <div className="flex gap-2 rounded-lg border border-error/40 bg-error/10 p-3 text-xs text-error mb-4">
          <AlertTriangle size={15} className="shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={e => {
          e.preventDefault()
          setError(null)
          const fd = new FormData(e.currentTarget)
          const password = String(fd.get('password') ?? '')
          if (password !== String(fd.get('password_confirmation') ?? '')) {
            setError("Those two passwords don't match.")
            return
          }
          register.mutate({
            name: String(fd.get('name') ?? ''),
            email: String(fd.get('email') ?? ''),
            phone: String(fd.get('phone') ?? ''),
            password,
            password_confirmation: password,
            referral_code: String(fd.get('referral_code') ?? ''),
          })
        }}
        className="space-y-3"
      >
        <Input name="name" label="Your name" required autoComplete="name" />
        <Input name="email" label="Email" type="email" required autoComplete="email" />
        <Input name="phone" label="Phone (optional)" type="tel" autoComplete="tel" />
        <Input
          name="password"
          label="Password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          hint="At least 8 characters"
        />
        <Input
          name="password_confirmation"
          label="Confirm password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Input name="referral_code" label="Referral code (optional)" hint="If a friend gave you a code, you'll both be rewarded" />

        <button
          type="submit"
          disabled={register.isPending}
          className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700
                     disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg"
        >
          {register.isPending && <Loader2 size={15} className="animate-spin" />}
          Create my membership
        </button>
      </form>

      <div className="mt-5 space-y-2 text-center">
        <p className="text-xs text-t-secondary">
          Already a member? <Link to="/login" className="text-primary-400 hover:text-primary-300">Sign in</Link>
        </p>
        {/* Imported customers already exist but have never set a password —
            they need the claim flow, not this one. */}
        <p className="text-xs text-t-secondary">
          Been a customer for a while?{' '}
          <Link to="/portal/claim" className="text-primary-400 hover:text-primary-300">
            Set up your existing account
          </Link>
        </p>
      </div>
    </Shell>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-dark-bg text-t-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-dark-surface border border-dark-border rounded-2xl p-6">
        {children}
      </div>
    </div>
  )
}

export function Problem({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <div className="w-11 h-11 rounded-xl bg-warning/15 flex items-center justify-center mx-auto mb-3">
        <AlertTriangle size={20} className="text-warning" />
      </div>
      <h1 className="text-base font-bold mb-1">{title}</h1>
      <p className="text-sm text-t-secondary">{body}</p>
      <Link to="/login" className="inline-block mt-4 text-sm text-primary-400 hover:text-primary-300">
        Go to sign in
      </Link>
    </div>
  )
}

export function Input({ label, hint, name, ...rest }: {
  label: string
  hint?: string
  name: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-t-secondary mb-1">{label}</span>
      <input
        name={name}
        {...rest}
        className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm
                   text-white placeholder:text-t-secondary focus:border-primary-500 focus:outline-none"
      />
      {hint && <span className="block text-[10px] text-t-secondary mt-1">{hint}</span>}
    </label>
  )
}
