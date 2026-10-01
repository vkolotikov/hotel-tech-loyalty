import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import type { SetupPayload, SetupTeamMember } from '../lib/types'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { MemberTimeOff } from './MemberTimeOff'
import { TeamEditor } from './TeamEditor'

export function TeamTab({ data, refresh }: { data: SetupPayload; refresh: () => void }) {
  const { t } = useTranslation()
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<SetupTeamMember | 'new' | null>(null)
  const mine = data.team.find(m => m.id === data.my_team_member_id) ?? null
  const shown = data.team.filter(m => showInactive || m.is_active)

  return (
    <div className="space-y-5 pt-4">
      {!data.can_manage && (
        <section aria-labelledby="my-time-off" className="space-y-3 rounded-lg border border-a-border bg-a-surface p-4">
          <h2 id="my-time-off" className="text-sm font-semibold text-a-text">{t('appointments.setup.team.my_time_off', 'My time off')}</h2>
          {mine
            ? <MemberTimeOff member={mine} canEdit onChanged={refresh} />
            : <Notice tone="info">{t('appointments.setup.team.not_linked', 'Your sign-in is not linked to a team member yet. A manager can link it under Team.')}</Notice>}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-a-text-2">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          {t('appointments.setup.show_inactive', 'Show inactive')}
        </label>
        {data.can_manage && (
          <Button className="ml-auto" onClick={() => setEditing('new')}><Plus size={16} aria-hidden /> {t('appointments.setup.team.new', 'New team member')}</Button>
        )}
      </div>

      {shown.length === 0 && <p className="text-sm text-a-text-2">{t('appointments.setup.none_yet', 'Nothing here yet.')}</p>}
      {shown.length > 0 && (
        <ul className="divide-y divide-a-border rounded-lg border border-a-border bg-a-surface">
          {shown.map(m => (
            <li key={m.id}>
              <button type="button" onClick={() => setEditing(m)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-a-surface-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-a-text">{m.name}</span>
                  <span className="block text-xs text-a-text-2">
                    {[m.title, t('appointments.setup.team.services_count', 'Services: {{count}}', { count: m.services.length })].filter(Boolean).join(' · ')}
                    {!m.is_active && ` · ${t('appointments.setup.inactive', 'Inactive')}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <TeamEditor member={editing === 'new' ? null : editing} data={data} onClose={() => setEditing(null)} onChanged={refresh} />
      )}
    </div>
  )
}
