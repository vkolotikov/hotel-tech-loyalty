import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Bot, Users, BedDouble, FileText, ClipboardList, LayoutDashboard, Settings as SettingsIcon,
  Eye, EyeOff, Save, Info, Zap, ArrowRight,
} from 'lucide-react'

/**
 * Settings → Menu. Lets admins hide / show the optional left-sidebar
 * groups so non-power-users see a focused menu instead of every
 * feature this platform happens to ship.
 *
 * Storage: `crm_settings.hidden_nav_groups` as a JSON array of group
 * labels (matching the `NavGroup.label` strings in Layout.tsx).
 * Layout reads the same key via `useSettings()` and filters them out
 * during `visibleGroups` composition.
 *
 * Locked groups (Overview + System) are intentionally not toggleable
 * — Overview holds the Dashboard, System holds Settings itself. Hide
 * System and you'd lose the way back.
 */

interface ToggleableGroup {
  label: string
  accent: string
  icon: any
  description: string
}

const TOGGLEABLE: ToggleableGroup[] = [
  { label: 'AI Chat',          accent: '#a78bfa', icon: Bot,           description: 'Engagement Hub + chatbot setup. Hide if you do not use website chat.' },
  { label: 'Members & Loyalty',accent: '#fbbf24', icon: Users,         description: 'Members, tiers, benefits, offers. Hide if you do not run a loyalty program.' },
  { label: 'Bookings',         accent: '#34d399', icon: BedDouble,     description: 'Reservations + Services + Rooms + Payments. Hide if you do not use the booking engine.' },
  { label: 'CRM & Marketing',  accent: '#f472b6', icon: FileText,      description: 'Leads, tasks, reports, companies, campaigns, reviews. The sales side.' },
  { label: 'Operations',       accent: '#22d3ee', icon: ClipboardList, description: 'Planner, brands, properties, scan. Day-to-day ops board.' },
]

const LOCKED: { label: string; icon: any; reason: string }[] = [
  { label: 'Overview', icon: LayoutDashboard, reason: 'Holds the Dashboard — the landing page after login.' },
  { label: 'System',   icon: SettingsIcon,    reason: 'Holds Settings (this page) + Billing + Audit Log. Hidden would lock you out.' },
]

export function MenuSettings() {
  const qc = useQueryClient()

  const { data: rawSettings } = useQuery<Record<string, any>>({
    queryKey: ['crm-settings'],
    queryFn: () => api.get('/v1/admin/crm-settings').then(r => r.data),
  })

  /**
   * Parse the saved list. The settings endpoint stores values as
   * JSON-encoded strings when the underlying is an array, so we
   * parse-on-read and JSON-encode-on-write. Default to empty (i.e.
   * nothing hidden) so a fresh org sees the full menu.
   */
  const saved: string[] = (() => {
    const v = rawSettings?.hidden_nav_groups
    if (!v) return []
    if (Array.isArray(v)) return v
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
  })()

  /**
   * Local dirty state — only persisted on Save. Lets the admin
   * preview the change with the live sidebar before committing.
   */
  const [hidden, setHidden] = useState<string[]>(saved)
  useEffect(() => { setHidden(saved) }, [rawSettings?.hidden_nav_groups])

  const save = useMutation({
    mutationFn: (next: string[]) => api.put('/v1/admin/crm-settings/hidden_nav_groups', { value: JSON.stringify(next) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-settings'] }); toast.success('Menu visibility saved') },
    onError: () => toast.error('Could not save'),
  })

  const toggle = (label: string) => {
    setHidden(h => h.includes(label) ? h.filter(x => x !== label) : [...h, label])
  }

  const dirty = JSON.stringify([...hidden].sort()) !== JSON.stringify([...saved].sort())
  const visibleCount = TOGGLEABLE.length - hidden.length + LOCKED.length

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-blue-500/10 via-cyan-500/[0.05] to-emerald-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
            <Eye size={16} className="text-blue-300" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Menu visibility</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-2xl leading-snug">
              Hide menu groups your team does not need. Hidden groups are dropped from the left sidebar for
              every user in the org — pages remain reachable by URL if anyone bookmarks them. Overview + System
              always stay visible so this page itself can never be hidden.
            </p>
            <p className="text-[11px] text-blue-200 mt-2 font-semibold">
              Currently showing: {visibleCount} of {TOGGLEABLE.length + LOCKED.length} groups
            </p>
          </div>
        </div>
      </div>

      <RerunWizardCard />


      <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-1">Toggleable groups</h3>
        <p className="text-[11px] text-gray-500 mb-3">Click a row to toggle visibility. The change previews instantly here; click Save to apply org-wide.</p>

        <div className="space-y-1.5">
          {TOGGLEABLE.map(g => {
            const isHidden = hidden.includes(g.label)
            const Icon = g.icon
            return (
              <button
                key={g.label}
                onClick={() => toggle(g.label)}
                className={'w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ' +
                  (isHidden
                    ? 'bg-dark-bg/50 border-dark-border opacity-50 hover:opacity-80'
                    : 'bg-dark-bg border-dark-border hover:border-' + g.accent)}>
                <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: g.accent + '25', color: g.accent }}>
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={'text-sm font-bold ' + (isHidden ? 'line-through text-gray-500' : 'text-white')}>
                    {g.label}
                  </div>
                  <div className="text-[11px] text-gray-500 line-clamp-1">{g.description}</div>
                </div>
                <div className={'flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-md ' +
                  (isHidden ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400')}>
                  {isHidden ? <><EyeOff size={11} /> Hidden</> : <><Eye size={11} /> Visible</>}
                </div>
              </button>
            )
          })}
        </div>

        <div className="border-t border-dark-border mt-4 pt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-500">
            {dirty ? <span className="text-amber-400 font-semibold">Unsaved changes</span> : 'No unsaved changes'}
          </p>
          <button
            onClick={() => save.mutate(hidden)}
            disabled={!dirty || save.isPending}
            className="bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2">
            <Save size={13} /> {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-1">Always visible (locked)</h3>
        <p className="text-[11px] text-gray-500 mb-3">These groups can't be hidden — they hold load-bearing pages.</p>

        <div className="space-y-1.5">
          {LOCKED.map(g => {
            const Icon = g.icon
            return (
              <div key={g.label} className="flex items-center gap-3 p-2.5 rounded-lg border border-dark-border bg-dark-bg/50">
                <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 bg-gray-500/15 text-gray-400">
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{g.label}</div>
                  <div className="text-[11px] text-gray-500">{g.reason}</div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-md bg-gray-500/10 text-gray-400">
                  <Info size={11} /> Locked
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * "Re-run setup wizard" card. Wipes the `onboarding_completed_at`
 * marker via the same crm-settings endpoint, then refreshes the
 * page. App.tsx polls /setup/status on mount, finds the org has no
 * loyalty tiers + no marker, and renders the wizard again.
 *
 * Lives in MenuSettings because that's where admins go to reshape
 * what their team sees — re-running the wizard is the natural way
 * to re-pick features without manually toggling each row.
 */
function RerunWizardCard() {
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const reset = async () => {
    setRunning(true)
    try {
      // The wizard gate (App.tsx) uses /setup/status which reads
      // both `setup_complete` (tiers) and `onboarding_completed_at`.
      // We clear the marker by writing an empty string; the wizard
      // will reset it on its next successful Launch.
      await api.put('/v1/admin/crm-settings/onboarding_completed_at', { value: 'null' })
      window.location.href = '/?rerun_setup=1'
    } catch {
      toast.error('Could not reset onboarding state')
      setRunning(false)
    }
  }
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
          <Zap size={16} className="text-amber-300" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">Re-run setup wizard</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Picks industry, features, and personal touches again. Existing data stays — switching the industry preset migrates inquiries by stage kind (no losses).</p>
          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold">
              Open wizard <ArrowRight size={12} />
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button onClick={reset} disabled={running}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-md px-3 py-1.5 text-xs disabled:opacity-50">
                {running ? 'Opening…' : 'Yes, open wizard'}
              </button>
              <button onClick={() => setConfirming(false)} disabled={running}
                className="text-xs text-gray-500 hover:text-white">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
