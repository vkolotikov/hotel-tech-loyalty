import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { apiMessage } from '../lib/portalApi'
import type { PortalThemeInput } from '../theme/applyPortalTheme'
import { Button } from '../ui/Button'
import { Field, INPUT_CLASS } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'
import { PublicShell, Problem } from './PublicShell'

interface JoinContext {
  organization: { id: number; name: string }
  accepting_joins: boolean
  starting_tier?: string
  welcome_bonus?: number
  theme?: PortalThemeInput & { logo_url?: string | null }
  error?: string
}

/**
 * Public member sign-up. Registration is tenant-scoped, so the link carries
 * the venue's widget token (`?org=`); without it the page says so rather
 * than guess a venue. `?ref=` pre-fills a friend's referral code.
 */
export function Join() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const orgToken = params.get('org') ?? ''
  const refCode = params.get('ref') ?? ''
  const [error, setError] = useState<string | null>(null)

  const { data: ctx, isLoading, isError } = useQuery<JoinContext>({
    queryKey: ['join-context', orgToken],
    queryFn: () => api.get(`/v1/public/join/${orgToken}`).then(r => r.data),
    enabled: !!orgToken,
    retry: false,
  })

  const register = useMutation({
    mutationFn: (payload: Record<string, string>) => api.post('/v1/auth/register', { ...payload, org_token: orgToken }).then(r => r.data),
    onSuccess: data => { setAuth(data.token, data.user, data.staff ?? null); navigate('/portal', { replace: true }) },
    onError: e => setError(apiMessage(e, t('portal.join.failed', 'Could not create your account.'))),
  })

  // The tab says "My membership" until the venue is known, then the venue's name.
  const genericTitle = t('portal.shell.membership', 'My membership')

  if (!orgToken) {
    return <PublicShell title={genericTitle}><Problem title={t('portal.join.incomplete_title', 'This link is incomplete')} body={t('portal.join.incomplete_body', "Sign-up links include a code that tells us which programme you're joining. Please use the link the venue gave you.")} /></PublicShell>
  }
  if (isLoading) return <PublicShell title={genericTitle}><PageSkeleton /></PublicShell>
  if (isError || !ctx?.accepting_joins) {
    return <PublicShell theme={ctx?.theme} title={genericTitle}><Problem title={t('portal.join.closed_title', "Sign-up isn't available")} body={ctx?.error || t('portal.join.closed_body', 'This sign-up link is not valid, or the programme is not open for new members yet. Please check with the venue.')} /></PublicShell>
  }

  return (
    <PublicShell theme={ctx.theme} title={ctx.organization.name}>
      <div className="text-center mb-6">
        {ctx.theme?.logo_url
          ? <img src={ctx.theme.logo_url} alt="" className="w-12 h-12 rounded-full object-cover mx-auto mb-3" />
          : <div className="w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center mx-auto mb-3"><Sparkles size={20} aria-hidden /></div>}
        <h1 className="font-p-display text-2xl">{t('portal.join.title', 'Join {{venue}}', { venue: ctx.organization.name })}</h1>
        <p className="text-sm text-p-text-2 mt-1">
          {ctx.welcome_bonus ? t('portal.join.with_bonus', 'Start with {{count}} points on us.', { count: ctx.welcome_bonus }) : t('portal.join.no_bonus', 'Earn points every time you visit.')}
        </p>
      </div>

      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}

      <form
        className="space-y-3"
        onSubmit={e => {
          e.preventDefault(); setError(null)
          const fd = new FormData(e.currentTarget)
          const password = String(fd.get('password') ?? '')
          if (password !== String(fd.get('password_confirmation') ?? '')) { setError(t('portal.profile.password_mismatch', "Those two passwords don't match.")); return }
          register.mutate({ name: String(fd.get('name') ?? ''), email: String(fd.get('email') ?? ''), phone: String(fd.get('phone') ?? ''), password, password_confirmation: password, referral_code: String(fd.get('referral_code') ?? '') })
        }}
      >
        <Field label={t('portal.join.name', 'Your name')}><input name="name" required autoComplete="name" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.email', 'Email')}><input name="email" type="email" required autoComplete="email" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.phone', 'Phone (optional)')}><input name="phone" type="tel" autoComplete="tel" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.password', 'Password')} hint={t('portal.profile.password_hint', 'At least 8 characters')}><input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.password_confirm', 'Confirm password')}><input name="password_confirmation" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.referral', 'Referral code (optional)')} hint={refCode ? t('portal.join.referral_prefilled', "Your friend's code is filled in — you'll both be rewarded") : t('portal.join.referral_hint', "If a friend gave you a code, you'll both be rewarded")}>
          <input name="referral_code" defaultValue={refCode} autoComplete="off" className={INPUT_CLASS} />
        </Field>
        <Button type="submit" full loading={register.isPending}>{t('portal.join.submit', 'Create my membership')}</Button>
      </form>

      <div className="mt-5 space-y-2 text-center text-xs text-p-text-2">
        <p>{t('portal.join.already', 'Already a member?')} <Link to="/login" className="text-p-accent-deep">{t('portal.join.sign_in', 'Sign in')}</Link></p>
        <p>{t('portal.join.existing', 'Been a customer for a while?')} <Link to="/portal/claim" className="text-p-accent-deep">{t('portal.join.set_up', 'Set up your existing account')}</Link></p>
      </div>
    </PublicShell>
  )
}
