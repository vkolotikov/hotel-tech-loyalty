import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Mail, UserPlus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { moduleHome } from '../workspace/lib/landing'
import { inviteRoles, memberState, type TeamList } from './accountTeam'

/**
 * Team (owner 2026-11-02). An organisation that bought HexaTech Loyalty, Content or Appointments on its own has no full
 * admin, so its owners and managers invite colleagues, change their role and switch them off here. The server's team
 * endpoints decide everything (`/v1/admin/team`, AccessMap product `account`): who may change, the package's team limit,
 * the invitation email.
 */
export function AccountTeam() {
  const { t } = useTranslation()
  const { token, user, staff } = useAuthStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [limited, setLimited] = useState(false)

  const query = useQuery({
    queryKey: ['account-team'],
    queryFn: () => api.get<TeamList>('/v1/admin/team').then(r => r.data),
    enabled: Boolean(token) && user?.user_type === 'staff',
  })

  if (!token) return <Navigate to={`/login?redirect=${encodeURIComponent('/account/team')}`} replace />
  if (user?.user_type !== 'staff') return <Navigate to="/portal" replace />

  const canManage = ['super_admin', 'manager'].includes(staff?.role ?? '')
  const home = moduleHome(user) ?? '/'
  const roleName = (r: string) => r === 'super_admin' ? t('account.team.role.owner', 'Owner') : r === 'manager' ? t('account.team.role.manager', 'Manager') : t('account.team.role.staff', 'Staff')
  const reload = () => queryClient.invalidateQueries({ queryKey: ['account-team'] })
  const failed = (err: unknown) => {
    const response = (err as { response?: { status?: number; data?: { error?: string; message?: string; reason?: string } } })?.response
    if (response?.data?.reason === 'plan_limit') {
      setLimited(true)
      return t('account.team.limit', 'Your package has no room for another team member. Choose a larger package, or switch someone off first.')
    }
    return response?.data?.error && !/^[a-z_]+$/.test(response.data.error) ? response.data.error : response?.data?.message || t('account.products.failed', 'That did not work. Nothing was changed. Please try again.')
  }
  const run = async (key: string, call: () => Promise<unknown>, done: string) => {
    setBusy(key); setError(''); setNotice(''); setLimited(false)
    try {
      await call()
      setNotice(done)
      await reload()
      return true
    } catch (err) {
      setError(failed(err))
      return false
    } finally {
      setBusy(null)
    }
  }
  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    const sent = await run('invite', () => api.post('/v1/admin/team/invite', { name, email, role }), t('account.team.invited', { email, defaultValue: 'Invitation sent to {{email}}.' }))
    if (sent) { setName(''); setEmail(''); setRole('staff') }
  }

  const FIELD = 'w-full rounded-lg border border-hx-bdc7ce bg-white px-3 py-2 text-sm text-hx-1b2a34'
  const BUTTON = 'inline-flex min-h-10 items-center gap-2 rounded-lg bg-hx-0e1a24 px-4 text-sm font-medium text-hx-f4f6f8 disabled:opacity-60'
  const QUIET = 'inline-flex min-h-9 items-center gap-2 rounded-lg border border-hx-0e1a24/20 px-3 text-sm font-medium disabled:opacity-60'

  return (
    <main className="min-h-screen bg-hx-eaeef2 text-hx-1b2a34">
      <header className="bg-hx-0e1a24 px-5 py-8 text-hx-f4f6f8 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Link to={home} className="inline-flex min-h-10 items-center gap-2 rounded-sm text-sm text-hx-c1cdd4 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white">
            <ArrowLeft size={16} aria-hidden="true" /> {t('account.products.back', 'Back to your workspace')}
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{t('account.team.title', 'Team')}</h1>
          <p className="mt-2 text-sm text-hx-c1cdd4">{t('account.team.subtitle', 'Who can sign in to your workspaces.')}</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-0 sm:py-8">
        {notice && <p role="status" className="rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-800">{notice}</p>}
        {error && (
          <p role="alert" className="rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-800">
            {error} {limited && <Link to="/account/products" className="font-medium underline">{t('workspace.shell.plan', 'Plan & products')}</Link>}
          </p>
        )}

        {canManage && (
          <form onSubmit={invite} className="rounded-xl bg-hx-f4f6f8 p-5 shadow-sm" data-invite="">
            <h2 className="text-base font-semibold">{t('account.team.invite_title', 'Invite a colleague')}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm">{t('account.team.name', 'Name')}<input className={`mt-1 ${FIELD}`} value={name} onChange={e => setName(e.target.value)} required maxLength={191} /></label>
              <label className="text-sm">{t('account.team.email', 'Email')}<input className={`mt-1 ${FIELD}`} type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={191} /></label>
              <label className="text-sm">{t('account.team.role_label', 'Role')}
                <select className={`mt-1 ${FIELD}`} value={role} onChange={e => setRole(e.target.value)}>
                  {inviteRoles(query.data?.roles ?? ['manager', 'staff']).map(r => <option key={r} value={r}>{roleName(r)}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-hx-54626e">{t('account.team.roles_hint', 'Managers can change settings, the plan and the team; staff do the daily work.')}</p>
            <button type="submit" disabled={busy !== null} className={`mt-3 ${BUTTON}`}>
              <UserPlus size={16} aria-hidden="true" />{busy === 'invite' ? t('account.products.working', 'One moment…') : t('account.team.invite', 'Send invitation')}
            </button>
          </form>
        )}
        {!canManage && <p className="text-sm text-hx-54626e">{t('account.team.managers_only', 'Only an owner or a manager can change the team.')}</p>}

        {query.isLoading && <div className="h-32 animate-pulse rounded-xl bg-hx-f4f6f8" />}
        {query.isError && <p role="alert" className="rounded-lg bg-hx-f4f6f8 px-4 py-3 text-sm">{failed(query.error)}</p>}

        {query.data && (
          <section aria-labelledby="team-heading" className="rounded-xl bg-hx-f4f6f8 shadow-sm">
            <h2 id="team-heading" className="px-5 pt-5 text-base font-semibold">{t('account.team.members', 'Team members')}</h2>
            <ul className="mt-2 divide-y divide-hx-dde3e8">
              {query.data.staff.map(member => {
                const state = memberState(member)
                return (
                  <li key={member.id} data-member={member.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="font-medium wrap-break-word">{member.name ?? member.email}{member.is_me && <span className="ml-2 text-xs text-hx-54626e">{t('account.team.you', '(you)')}</span>}</div>
                      <div className="text-sm text-hx-54626e wrap-break-word">{member.email} · {roleName(member.role)}{state === 'invited' ? ` · ${t('account.team.invited_state', 'invitation sent')}` : state === 'off' ? ` · ${t('account.team.off', 'switched off')}` : ''}</div>
                    </div>
                    {canManage && !member.is_me && member.role !== 'super_admin' && (
                      <div className="flex flex-wrap gap-2">
                        {state === 'invited' && (
                          <button type="button" className={QUIET} disabled={busy !== null} onClick={() => run(`resend:${member.id}`, () => api.post(`/v1/admin/team/${member.id}/resend`), t('account.team.resent', 'Invitation sent again.'))}>
                            <Mail size={14} aria-hidden="true" />{t('account.team.resend', 'Send again')}
                          </button>
                        )}
                        {state !== 'off' && (
                          <button type="button" className={QUIET} disabled={busy !== null} onClick={() => run(`role:${member.id}`, () => api.put(`/v1/admin/team/${member.id}`, { role: member.role === 'manager' ? 'staff' : 'manager' }), t('account.team.role_changed', 'Role changed.'))}>
                            {member.role === 'manager' ? t('account.team.make_staff', 'Make staff') : t('account.team.make_manager', 'Make manager')}
                          </button>
                        )}
                        {state === 'off'
                          ? <button type="button" className={QUIET} disabled={busy !== null} onClick={() => run(`on:${member.id}`, () => api.patch(`/v1/admin/team/${member.id}/reactivate`), t('account.team.switched_on', 'They can sign in again.'))}>{t('account.team.switch_on', 'Switch on')}</button>
                          : <button type="button" className={QUIET} disabled={busy !== null} onClick={() => run(`off:${member.id}`, () => api.patch(`/v1/admin/team/${member.id}/deactivate`), t('account.team.switched_off', 'They can no longer sign in.'))}>{t('account.team.switch_off', 'Switch off')}</button>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
