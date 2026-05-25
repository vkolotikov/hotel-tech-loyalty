import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Users, UserPlus, Mail, Shield, Crown, X, RefreshCw, Edit2, Save, UserX, UserCheck,
  Check, Info, Wrench,
} from 'lucide-react'
import { useSettings } from '../lib/crmSettings'

/**
 * Settings → Team. Lists every staff member in the org and lets
 * admins invite new ones, change roles, toggle per-feature
 * permissions, and deactivate / reactivate accounts.
 *
 * Visible to super_admin + manager only (gated at the Settings
 * tab level). Only super_admins can grant the super_admin role —
 * managers can only invite up to "manager".
 */

type Role = 'super_admin' | 'manager' | 'staff'

const ROLE_META: Record<Role, { label: string; icon: any; color: string; desc: string }> = {
  super_admin: { label: 'Super Admin', icon: Crown,  color: '#fbbf24', desc: 'Full control including team & billing.' },
  manager:     { label: 'Manager',     icon: Shield, color: '#a78bfa', desc: 'Everything except team & billing.' },
  staff:       { label: 'Staff',       icon: Users,  color: '#22d3ee', desc: 'Per-feature permissions below.' },
}

interface StaffRow {
  id: number
  user_id: number
  name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  role: Role
  department: string | null
  is_active: boolean
  last_login_at: string | null
  /** When set, the staff has been invited but hasn't activated. ISO
   *  timestamp of when the current invite code expires (48h from issue).
   *  Null on activated rows. */
  invite_expires_at?: string | null
  can_award_points: boolean
  can_redeem_points: boolean
  can_manage_offers: boolean
  can_view_analytics: boolean
  allowed_nav_groups: string[] | null
  planner_skills: string[] | null
  is_me: boolean
}

interface TeamResponse {
  staff: StaffRow[]
  roles: Role[]
  available_groups: string[]
}

export function TeamSettings() {
  const qc = useQueryClient()
  const [inviting, setInviting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data, isLoading } = useQuery<TeamResponse>({
    queryKey: ['admin-team'],
    queryFn: () => api.get('/v1/admin/team').then(r => r.data),
  })

  const deactivate = useMutation({
    mutationFn: (id: number) => api.patch(`/v1/admin/team/${id}/deactivate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-team'] }); toast.success('Deactivated') },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Could not deactivate'),
  })
  const reactivate = useMutation({
    mutationFn: (id: number) => api.patch(`/v1/admin/team/${id}/reactivate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-team'] }); toast.success('Reactivated') },
  })
  const resend = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/team/${id}/resend`),
    onSuccess: () => toast.success('Invite re-sent'),
    onError: () => toast.error('Could not resend invite'),
  })

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-blue-500/10 via-purple-500/[0.05] to-amber-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
              <Users size={16} className="text-blue-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Team</h2>
              <p className="text-xs text-gray-500 mt-0.5 max-w-2xl leading-snug">
                Invite team members and assign roles. Invitees receive an email with a 6-digit code and a link to set their password.
              </p>
            </div>
          </div>
          <button onClick={() => setInviting(true)}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-md px-3 py-2 text-xs flex items-center gap-1.5">
            <UserPlus size={13} /> Invite teammate
          </button>
        </div>
      </div>

      {(() => {
        if (isLoading) {
          return (
            <div className="bg-dark-surface border border-dark-border rounded-xl p-8 text-center text-xs text-gray-500">
              Loading team…
            </div>
          )
        }
        if (!data?.staff.length) {
          return (
            <div className="bg-dark-surface border border-dark-border rounded-xl p-8 text-center text-xs text-gray-500">
              No team members yet. Invite your first one above.
            </div>
          )
        }
        // Split into pending (never logged in) and active. Pending rows
        // get their own card at the top with a more prominent Resend
        // button + the invite expiration countdown, since they're the
        // ones an admin needs to act on. Active rows render below in
        // the usual list. This replaces the previous flat list where
        // "Pending" was a small amber badge easily missed amid a list
        // of activated teammates.
        const pending = data.staff.filter(s => !s.last_login_at)
        const active  = data.staff.filter(s => !!s.last_login_at)
        const renderRow = (s: StaffRow) => editingId === s.id ? (
          <EditRow key={s.id} staff={s} availableRoles={data.roles} availableGroups={data.available_groups} onCancel={() => setEditingId(null)} onSaved={() => { setEditingId(null); qc.invalidateQueries({ queryKey: ['admin-team'] }) }} />
        ) : (
          <ViewRow
            key={s.id}
            staff={s}
            onEdit={() => setEditingId(s.id)}
            onDeactivate={() => deactivate.mutate(s.id)}
            onReactivate={() => reactivate.mutate(s.id)}
            onResend={() => resend.mutate(s.id)}
            resendPending={resend.isPending}
          />
        )

        return (
          <div className="space-y-4">
            {pending.length > 0 && (
              <div className="bg-amber-500/[0.04] border border-amber-500/30 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-500/[0.06] border-b border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <Mail size={13} className="text-amber-400" />
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Pending invitations
                    </span>
                    <span className="text-[10px] tabular-nums font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                      {pending.length}
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-300/60 hidden sm:inline">
                    Waiting for first sign-in
                  </span>
                </div>
                <div className="divide-y divide-amber-500/10">
                  {pending.map(renderRow)}
                </div>
              </div>
            )}

            {active.length > 0 && (
              <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
                {pending.length > 0 && (
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-white/[0.02] border-b border-dark-border">
                    <div className="flex items-center gap-2">
                      <Users size={13} className="text-gray-400" />
                      <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                        Active team
                      </span>
                      <span className="text-[10px] tabular-nums font-bold px-1.5 py-0.5 rounded bg-white/10 text-gray-300">
                        {active.length}
                      </span>
                    </div>
                  </div>
                )}
                <div className="divide-y divide-dark-border">
                  {active.map(renderRow)}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      <div className="bg-dark-bg/50 border border-dark-border rounded-lg p-3 text-[11px] text-gray-500 leading-relaxed">
        <p className="flex items-start gap-1.5">
          <Info size={11} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold text-blue-300">Tip:</span> Invites expire after 48 hours.
            Use <span className="text-white">Resend</span> on any teammate's row to send a fresh code.
            Deactivating revokes access immediately without deleting their activity history.
          </span>
        </p>
      </div>

      {inviting && (
        <InviteModal
          availableRoles={data?.roles ?? ['super_admin', 'manager', 'staff']}
          availableGroups={data?.available_groups ?? []}
          onClose={() => setInviting(false)}
          onInvited={() => { setInviting(false); qc.invalidateQueries({ queryKey: ['admin-team'] }) }}
        />
      )}
    </div>
  )
}

/* ───────────────────── View row ───────────────────── */

function ViewRow({ staff, onEdit, onDeactivate, onReactivate, onResend, resendPending = false }: {
  staff: StaffRow
  onEdit: () => void
  onDeactivate: () => void
  onReactivate: () => void
  onResend: () => void
  resendPending?: boolean
}) {
  const meta = ROLE_META[staff.role] ?? ROLE_META.staff
  const Icon = meta.icon
  const isPending = !staff.last_login_at
  const lastLogin = staff.last_login_at ? new Date(staff.last_login_at).toLocaleDateString() : null

  // Relative "expires in 36h" for pending rows. The invite code is
  // 48h-TTL per TeamController; once it's past, the user can still
  // hit Resend to mint a new one.
  let inviteExpiry: string | null = null
  if (isPending && staff.invite_expires_at) {
    const ms = new Date(staff.invite_expires_at).getTime() - Date.now()
    if (ms <= 0) {
      inviteExpiry = 'expired'
    } else if (ms < 60 * 60 * 1000) {
      inviteExpiry = `expires in ${Math.max(1, Math.round(ms / (60 * 1000)))}m`
    } else if (ms < 24 * 60 * 60 * 1000) {
      inviteExpiry = `expires in ${Math.round(ms / (60 * 60 * 1000))}h`
    } else {
      inviteExpiry = `expires in ${Math.round(ms / (24 * 60 * 60 * 1000))}d`
    }
  }

  return (
    <div className={'flex items-center gap-3 p-3 ' + (staff.is_active ? '' : 'opacity-50')}>
      <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: meta.color + '25', color: meta.color }}>
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-white truncate">{staff.name || '—'}</span>
          {staff.is_me && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 uppercase tracking-wide">You</span>}
          {!staff.is_active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 uppercase tracking-wide">Deactivated</span>}
          {inviteExpiry === 'expired' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 uppercase tracking-wide">Code expired</span>}
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5 truncate">{staff.email}</div>
      </div>
      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
        <span className="text-[10px] text-gray-600">
          {lastLogin ? `Last login: ${lastLogin}` : inviteExpiry ? inviteExpiry : 'Never logged in'}
        </span>
      </div>
      <div className="flex items-center gap-1 ml-1">
        {isPending && (
          // Pending rows get a labeled, primary-styled Resend button so
          // the action is obvious — was a tiny icon-only button before.
          <button onClick={onResend} disabled={resendPending} title="Resend invitation email"
            className="flex items-center gap-1 px-2 py-1.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-[11px] font-semibold disabled:opacity-50">
            <RefreshCw size={11} className={resendPending ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{resendPending ? 'Sending…' : 'Resend'}</span>
          </button>
        )}
        <button onClick={onEdit} title="Edit"
          className="p-1.5 rounded text-gray-500 hover:bg-dark-surface2 hover:text-white">
          <Edit2 size={13} />
        </button>
        {!staff.is_me && (staff.is_active ? (
          <button onClick={onDeactivate} title="Deactivate"
            className="p-1.5 rounded text-gray-500 hover:bg-red-500/15 hover:text-red-400">
            <UserX size={13} />
          </button>
        ) : (
          <button onClick={onReactivate} title="Reactivate"
            className="p-1.5 rounded text-gray-500 hover:bg-emerald-500/15 hover:text-emerald-400">
            <UserCheck size={13} />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ───────────────────── Edit row ───────────────────── */

function EditRow({ staff, availableRoles, availableGroups, onCancel, onSaved }: {
  staff: StaffRow
  availableRoles: Role[]
  availableGroups: string[]
  onCancel: () => void
  onSaved: () => void
}) {
  const settings = useSettings()
  const plannerGroups: string[] = settings.planner_groups ?? []
  const [form, setForm] = useState({
    role: staff.role,
    department: staff.department ?? '',
    can_award_points: staff.can_award_points,
    can_redeem_points: staff.can_redeem_points,
    can_manage_offers: staff.can_manage_offers,
    can_view_analytics: staff.can_view_analytics,
    // null / [] = unrestricted; non-empty array = whitelist. We
    // surface the same triple state on the UI via the "All sections"
    // option in the picker.
    allowed_nav_groups: staff.allowed_nav_groups,
    // Planner backlog pool skill allowlist. Same tri-state semantics
    // as allowed_nav_groups — null = "claim anything", non-empty
    // array = whitelist. The picker UI below collapses [] to null.
    planner_skills: staff.planner_skills,
  })

  const save = useMutation({
    mutationFn: () => api.put(`/v1/admin/team/${staff.id}`, form),
    onSuccess: () => { toast.success('Saved'); onSaved() },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Could not save'),
  })

  return (
    <div className="p-3 bg-dark-bg/60">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-white font-semibold">{staff.name} · <span className="text-gray-500 font-normal">{staff.email}</span></div>
        <div className="flex items-center gap-1">
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-md px-3 py-1.5 text-xs disabled:opacity-50 flex items-center gap-1">
            <Save size={11} /> {save.isPending ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onCancel} className="p-1.5 rounded text-gray-500 hover:text-white"><X size={13} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">Role</label>
          <div className="space-y-1.5">
            {availableRoles.map(r => {
              const meta = ROLE_META[r]
              const active = form.role === r
              const Icon = meta.icon
              return (
                <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))}
                  className={'w-full flex items-start gap-2 p-2 rounded-md border text-left transition-colors ' +
                    (active ? 'border-amber-500/60 bg-amber-500/[0.06]' : 'border-dark-border bg-dark-bg hover:bg-dark-surface2')}>
                  <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: meta.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white">{meta.label}</div>
                    <div className="text-[10px] text-gray-500">{meta.desc}</div>
                  </div>
                  {active && <Check size={13} className="text-amber-400 flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">Department (optional)</label>
          <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
            placeholder="e.g. Front desk"
            className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500 mb-3" />

          <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">Per-feature permissions</label>
          <div className="space-y-1 mb-3">
            <Toggle label="Award points"   value={form.can_award_points}   onChange={v => setForm(f => ({ ...f, can_award_points: v }))} />
            <Toggle label="Redeem points"  value={form.can_redeem_points}  onChange={v => setForm(f => ({ ...f, can_redeem_points: v }))} />
            <Toggle label="Manage offers"  value={form.can_manage_offers}  onChange={v => setForm(f => ({ ...f, can_manage_offers: v }))} />
            <Toggle label="View analytics" value={form.can_view_analytics} onChange={v => setForm(f => ({ ...f, can_view_analytics: v }))} />
          </div>

          {form.role === 'staff' && (
            <>
              <SectionPicker
                availableGroups={availableGroups}
                value={form.allowed_nav_groups}
                onChange={v => setForm(f => ({ ...f, allowed_nav_groups: v }))}
              />
              {plannerGroups.length > 0 && (
                <PlannerSkillsPicker
                  availableGroups={plannerGroups}
                  value={form.planner_skills}
                  onChange={v => setForm(f => ({ ...f, planner_skills: v }))}
                />
              )}
            </>
          )}
          {form.role !== 'staff' && (
            <div className="text-[11px] text-gray-500 leading-snug bg-dark-bg border border-dark-border rounded-md p-2.5">
              <span className="text-amber-300 font-semibold">{form.role === 'super_admin' ? 'Super admins' : 'Managers'}</span> always see every section + can claim any planner task. Restrictions only apply to the <span className="text-white">staff</span> role.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Whitelist picker for sidebar groups. Tri-state:
 *   - "All sections" (null) — no restriction; default for new staff.
 *   - One or more groups selected — only those visible to this user.
 *   - Zero groups selected — also "no restriction" (we coerce to null
 *     to keep API semantics simple).
 *
 * Overview + System are intentionally not pickable here — they're
 * locked-visible by Layout's ALWAYS_VISIBLE set so Dashboard and
 * Settings can never be hidden.
 */
function SectionPicker({ availableGroups, value, onChange }: {
  availableGroups: string[]
  value: string[] | null
  onChange: (v: string[] | null) => void
}) {
  const isAll = !value || value.length === 0
  const toggle = (g: string) => {
    const cur = value ?? []
    const next = cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g]
    onChange(next.length === 0 ? null : next)
  }
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">Sections this person can see</label>
      <button onClick={() => onChange(null)}
        className={'w-full flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs mb-1.5 transition-colors ' +
          (isAll ? 'border-emerald-500/60 bg-emerald-500/[0.06] text-emerald-300' : 'border-dark-border bg-dark-bg text-gray-400 hover:bg-dark-surface2')}>
        {isAll ? <Check size={12} /> : <span className="w-3" />}
        <span className="font-bold">All sections</span>
        <span className="text-[10px] text-gray-500 ml-auto">No restriction</span>
      </button>
      <div className="text-[10px] text-gray-600 mb-1.5">— or pick specific ones —</div>
      <div className="space-y-1">
        {availableGroups.map(g => {
          const checked = !isAll && (value ?? []).includes(g)
          return (
            <button key={g} onClick={() => toggle(g)}
              className={'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs transition-colors ' +
                (checked ? 'border-amber-500/60 bg-amber-500/[0.06] text-white' : 'border-dark-border bg-dark-bg text-gray-400 hover:bg-dark-surface2 hover:text-white')}>
              <span className={'w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ' + (checked ? 'bg-amber-400 border-amber-400' : 'border-gray-600')}>
                {checked && <Check size={9} className="text-black" />}
              </span>
              <span>{g}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Allowlist picker for planner backlog skills. When set, the staff
 * member can only see + claim Open-pool tasks whose task_group is in
 * the list. Tri-state mirrors SectionPicker above: null = no
 * restriction (claim anything), non-empty = whitelist. Coerce empty
 * array to null at the picker level for API parity.
 */
function PlannerSkillsPicker({ availableGroups, value, onChange }: {
  availableGroups: string[]
  value: string[] | null
  onChange: (v: string[] | null) => void
}) {
  const isAll = !value || value.length === 0
  const toggle = (g: string) => {
    const cur = value ?? []
    const next = cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g]
    onChange(next.length === 0 ? null : next)
  }
  return (
    <div className="mt-3">
      <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
        <Wrench size={11} />
        Planner: task groups this person can claim
      </label>
      <button onClick={() => onChange(null)}
        className={'w-full flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs mb-1.5 transition-colors ' +
          (isAll ? 'border-emerald-500/60 bg-emerald-500/[0.06] text-emerald-300' : 'border-dark-border bg-dark-bg text-gray-400 hover:bg-dark-surface2')}>
        <span className={'w-3 h-3 rounded-full flex-shrink-0 ' + (isAll ? 'bg-emerald-400' : 'border border-gray-600')} />
        <span className="font-semibold">Can claim anything in the pool</span>
      </button>
      <div className="grid grid-cols-2 gap-1">
        {availableGroups.map(g => {
          const checked = !isAll && (value ?? []).includes(g)
          return (
            <button key={g} onClick={() => toggle(g)}
              className={'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs transition-colors ' +
                (checked ? 'border-amber-500/60 bg-amber-500/[0.06] text-white' : 'border-dark-border bg-dark-bg text-gray-400 hover:bg-dark-surface2 hover:text-white')}>
              <span className={'w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ' + (checked ? 'bg-amber-400 border-amber-400' : 'border-gray-600')}>
                {checked && <Check size={9} className="text-black" />}
              </span>
              <span className="truncate">{g}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-600 mt-1.5 leading-snug">
        Empty = restricted to nothing. Managers always bypass this.
      </p>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-dark-surface2">
      <span className="text-xs text-gray-300">{label}</span>
      <span className={'w-9 h-5 rounded-full relative transition-colors ' + (value ? 'bg-emerald-500' : 'bg-dark-surface2')}>
        <span className={'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ' + (value ? 'translate-x-4' : '')} />
      </span>
    </button>
  )
}

/* ───────────────────── Invite modal ───────────────────── */

function InviteModal({ availableRoles, availableGroups, onClose, onInvited }: {
  availableRoles: Role[]
  availableGroups: string[]
  onClose: () => void
  onInvited: () => void
}) {
  const [form, setForm] = useState<{
    name: string
    email: string
    role: Role
    department: string
    allowed_nav_groups: string[] | null
  }>({
    name: '',
    email: '',
    role: 'staff',
    department: '',
    allowed_nav_groups: null,
  })

  const invite = useMutation({
    mutationFn: () => api.post('/v1/admin/team/invite', form),
    onSuccess: (res) => {
      toast.success(res.data?.message ?? 'Invite sent')
      onInvited()
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Could not send invite'),
  })

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-surface border border-dark-border rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <UserPlus size={16} /> Invite teammate
          </h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-dark-surface2 text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        <form onSubmit={e => { e.preventDefault(); invite.mutate() }} className="p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Full name</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Anna Schmidt"
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary-500" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Email</label>
            <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value.toLowerCase() }))}
              placeholder="anna@hotel.com"
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary-500" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">Role</label>
            <div className="space-y-1.5">
              {availableRoles.map(r => {
                const meta = ROLE_META[r]
                const active = form.role === r
                const Icon = meta.icon
                return (
                  <button key={r} type="button" onClick={() => setForm(f => ({ ...f, role: r }))}
                    className={'w-full flex items-start gap-2 p-2 rounded-md border text-left transition-colors ' +
                      (active ? 'border-amber-500/60 bg-amber-500/[0.06]' : 'border-dark-border bg-dark-bg hover:bg-dark-surface2')}>
                    <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: meta.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white">{meta.label}</div>
                      <div className="text-[10px] text-gray-500">{meta.desc}</div>
                    </div>
                    {active && <Check size={13} className="text-amber-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Department (optional)</label>
            <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              placeholder="e.g. Front desk"
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500" />
          </div>

          {form.role === 'staff' && (
            <SectionPicker
              availableGroups={availableGroups}
              value={form.allowed_nav_groups}
              onChange={v => setForm(f => ({ ...f, allowed_nav_groups: v }))}
            />
          )}

          <div className="bg-blue-500/[0.04] border border-blue-500/20 rounded-md p-2.5 flex items-start gap-2">
            <Mail size={13} className="text-blue-300 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-100/90 leading-relaxed">
              We'll email <span className="text-white font-semibold">{form.email || 'this address'}</span> a link + a 6-digit code. They set their own password on first login. Code expires in 48 hours.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-dark-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={invite.isPending || !form.name.trim() || !form.email.trim()}
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2">
              <UserPlus size={13} /> {invite.isPending ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
