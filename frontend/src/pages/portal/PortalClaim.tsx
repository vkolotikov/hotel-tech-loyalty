import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2, KeyRound, AlertTriangle, MailCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { Shell, Input } from './PortalJoin'

/**
 * "Set up your existing account" — for members who exist but have never
 * had a password.
 *
 * This is the path every imported customer takes. The CSV import writes a
 * deliberately unusable password (nothing bcrypt can ever match), so those
 * members cannot sign in and must not be able to: their account is
 * verified by proving they control the email address it was imported
 * with, then choosing a password.
 *
 * Two steps, on purpose:
 *   1. Enter your email  → a six-digit code is sent to it
 *   2. Enter the code + a new password → signed in
 *
 * The step-1 response is deliberately identical whether or not the address
 * is on file, so this can't be used to discover who is a member.
 */
export function PortalClaim() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const sendCode = useMutation({
    mutationFn: (address: string) => api.post('/v1/auth/send-code', { email: address }).then(r => r.data),
    onSuccess: () => {
      setError(null)
      setStep('code')
    },
    onError: (e: unknown) => {
      const res = (e as { response?: { status?: number; data?: { error?: string; message?: string } } })?.response
      if (res?.status === 429) {
        // Rate limit is per email per minute — say so rather than
        // showing a bare "too many requests".
        setError('A code was just sent. Please wait a minute before asking for another.')
        setStep('code')
        return
      }
      setError(res?.data?.error || res?.data?.message || 'Could not send a code to that address.')
    },
  })

  const claim = useMutation({
    mutationFn: (payload: { code: string; password: string }) =>
      api.post('/v1/auth/claim', {
        email,
        code: payload.code,
        password: payload.password,
        password_confirmation: payload.password,
      }).then(r => r.data),
    onSuccess: (data) => {
      setAuth(data.token, data.user, data.staff ?? null)
      navigate('/portal', { replace: true })
    },
    onError: (e: unknown) => {
      const res = (e as { response?: { data?: { message?: string } } })?.response
      setError(res?.data?.message || 'That code did not work. Check it and try again.')
    },
  })

  return (
    <Shell>
      <div className="text-center mb-6">
        <div className="w-11 h-11 rounded-xl bg-primary-500/15 flex items-center justify-center mx-auto mb-3">
          {step === 'email' ? <KeyRound size={20} className="text-primary-400" /> : <MailCheck size={20} className="text-primary-400" />}
        </div>
        <h1 className="text-xl font-bold">Set up your account</h1>
        <p className="text-sm text-t-secondary mt-1">
          {step === 'email'
            ? 'Already a customer? Choose a password to see your points online.'
            : `We've sent a 6-digit code to ${email}.`}
        </p>
      </div>

      {error && (
        <div className="flex gap-2 rounded-lg border border-error/40 bg-error/10 p-3 text-xs text-error mb-4">
          <AlertTriangle size={15} className="shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-dark-border bg-dark-surface2 p-3 text-xs text-t-secondary mb-4">
          {notice}
        </div>
      )}

      {step === 'email' ? (
        <form
          onSubmit={e => {
            e.preventDefault()
            setError(null)
            const address = String(new FormData(e.currentTarget).get('email') ?? '').trim()
            setEmail(address)
            sendCode.mutate(address)
          }}
          className="space-y-3"
        >
          <Input
            name="email"
            label="Your email"
            type="email"
            required
            autoComplete="email"
            hint="Use the address the hotel has on file for you"
          />
          <button
            type="submit"
            disabled={sendCode.isPending}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700
                       disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg"
          >
            {sendCode.isPending && <Loader2 size={15} className="animate-spin" />}
            Send me a code
          </button>
        </form>
      ) : (
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
            claim.mutate({ code: String(fd.get('code') ?? '').trim(), password })
          }}
          className="space-y-3"
        >
          <Input
            name="code"
            label="6-digit code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
          />
          <Input
            name="password"
            label="Choose a password"
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
          <button
            type="submit"
            disabled={claim.isPending}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700
                       disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg"
          >
            {claim.isPending && <Loader2 size={15} className="animate-spin" />}
            Finish setup
          </button>

          <button
            type="button"
            onClick={() => {
              setError(null)
              setNotice(null)
              sendCode.mutate(email, {
                onSuccess: () => setNotice('A new code is on its way.'),
              })
            }}
            disabled={sendCode.isPending}
            className="w-full text-xs text-t-secondary hover:text-white disabled:opacity-50 py-1"
          >
            Didn't get it? Send another code
          </button>
          <button
            type="button"
            onClick={() => { setStep('email'); setError(null); setNotice(null) }}
            className="w-full text-xs text-t-secondary hover:text-white py-1"
          >
            Use a different email
          </button>
        </form>
      )}

      <p className="text-xs text-t-secondary text-center mt-5">
        Already set up? <Link to="/login" className="text-primary-400 hover:text-primary-300">Sign in</Link>
      </p>
    </Shell>
  )
}
