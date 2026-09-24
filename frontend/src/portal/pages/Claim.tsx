import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { KeyRound, MailCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { apiMessage } from '../lib/portalApi'
import { Button } from '../ui/Button'
import { Field, INPUT_CLASS } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { PublicShell } from './PublicShell'

export function Claim() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Whether the code step was reached by mailing a fresh code, or by the
  // member saying they already hold one from the activation email — that
  // decides which intro sentence the code step shows.
  const [codeSource, setCodeSource] = useState<'sent' | 'have'>('sent')
  const emailInputRef = useRef<HTMLInputElement>(null)

  const sendCode = useMutation({
    mutationFn: (address: string) => api.post('/v1/auth/send-code', { email: address }).then(r => r.data),
    onSuccess: () => { setError(null); setCodeSource('sent'); setStep('code') },
    onError: e => {
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 429) { setError(t('portal.claim.rate_limited', 'A code was just sent. Please wait a minute before asking for another.')); setStep('code'); return }
      setError(apiMessage(e, t('portal.claim.send_failed', 'Could not send a code to that address.')))
    },
  })
  const claim = useMutation({
    mutationFn: (p: { code: string; password: string }) => api.post('/v1/auth/claim', { email, code: p.code, password: p.password, password_confirmation: p.password }).then(r => r.data),
    onSuccess: data => { setAuth(data.token, data.user, data.staff ?? null); navigate('/portal', { replace: true }) },
    onError: e => setError(apiMessage(e, t('portal.claim.claim_failed', 'That code did not work. Check it and try again.'))),
  })

  return (
    <PublicShell title={t('portal.shell.membership', 'My membership')}>
      <div className="text-center mb-6">
        <div className="w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center mx-auto mb-3">{step === 'email' ? <KeyRound size={20} aria-hidden /> : <MailCheck size={20} aria-hidden />}</div>
        <h1 className="font-p-display text-2xl">{t('portal.claim.title', 'Set up your account')}</h1>
        <p className="text-sm text-p-text-2 mt-1">
          {step === 'email'
            ? t('portal.claim.intro', 'Already a customer? Choose a password to see your points online.')
            : codeSource === 'have'
              ? t('portal.claim.enter_code', 'Enter the code from your email to {{email}}.', { email })
              : t('portal.claim.code_sent', "We've sent a 6-digit code to {{email}}.", { email })}
        </p>
      </div>
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}
      {notice && <div className="mb-4"><Notice tone="info">{notice}</Notice></div>}

      {step === 'email' ? (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); setError(null); const a = String(new FormData(e.currentTarget).get('email') ?? '').trim(); setEmail(a); sendCode.mutate(a) }}>
          <Field label={t('portal.claim.email', 'Your email')} hint={t('portal.claim.email_hint', 'Use the address the venue has on file for you')}><input ref={emailInputRef} name="email" type="email" required autoComplete="email" className={INPUT_CLASS} /></Field>
          <Button type="submit" full loading={sendCode.isPending}>{t('portal.claim.send_code', 'Send me a code')}</Button>
          <Button type="button" variant="ghost" full size="sm" onClick={() => {
            const input = emailInputRef.current
            const address = (input?.value ?? '').trim()
            if (!input || !address || !input.checkValidity()) { input?.focus(); return }
            setError(null); setEmail(address); setCodeSource('have'); setStep('code')
          }}>{t('portal.claim.have_code', 'I already have a code')}</Button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault(); setError(null)
          const fd = new FormData(e.currentTarget)
          const password = String(fd.get('password') ?? '')
          if (password !== String(fd.get('password_confirmation') ?? '')) { setError(t('portal.profile.password_mismatch', "Those two passwords don't match.")); return }
          claim.mutate({ code: String(fd.get('code') ?? '').trim(), password })
        }}>
          <Field label={t('portal.claim.code', '6-digit code')}><input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.claim.password', 'Choose a password')} hint={t('portal.profile.password_hint', 'At least 8 characters')}><input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.claim.password_confirm', 'Confirm password')}><input name="password_confirmation" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
          <Button type="submit" full loading={claim.isPending}>{t('portal.claim.finish', 'Finish setup')}</Button>
          <Button type="button" variant="ghost" full size="sm" disabled={sendCode.isPending} onClick={() => { setError(null); setNotice(null); sendCode.mutate(email, { onSuccess: () => setNotice(t('portal.claim.resent', 'A new code is on its way.')) }) }}>{t('portal.claim.resend', "Didn't get it? Send another code")}</Button>
          <Button type="button" variant="ghost" full size="sm" onClick={() => { setStep('email'); setError(null); setNotice(null) }}>{t('portal.claim.change_email', 'Use a different email')}</Button>
        </form>
      )}
      <p className="text-xs text-p-text-2 text-center mt-5">{t('portal.claim.already_set_up', 'Already set up?')} <Link to="/login" className="text-p-accent-deep">{t('portal.join.sign_in', 'Sign in')}</Link></p>
    </PublicShell>
  )
}
