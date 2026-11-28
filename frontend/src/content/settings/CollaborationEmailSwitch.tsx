import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot } from '../ContentProvider'
import type { Bootstrap } from '../lib/types'

export function CollaborationEmailSwitch() {
  const { t } = useTranslation(), boot = useBoot(), api = useApi(), client = useQueryClient()
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false)
  const on = boot.staff.collaboration_email === true
  const flip = async () => {
    if (busy) return
    setBusy(true); setFailed(false)
    try {
      const answer = await api.setCollaborationEmail(!on)
      client.setQueriesData<Bootstrap>({ queryKey: ['content', 'bootstrap'] }, old => old && old.staff.id === boot.staff.id ? { ...old, staff: { ...old.staff, collaboration_email: answer.on } } : old)
      void client.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <section className="space-y-2 rounded-xl border border-a-border bg-a-surface p-4">
    <label className="flex items-start gap-3 text-sm text-a-text"><input type="checkbox" checked={on} disabled={busy} onChange={() => { void flip() }} className="mt-1" />
      <span><span className="block font-semibold">{t('content.collaboration.email', 'Email me about reviews and mentions')}</span><span className="mt-1 block text-xs text-a-text-2">{t('content.collaboration.email_hint', 'Off until you choose it. Sends review updates and explicit mentions you receive in Content. Morning email is a separate setting.')}</span></span>
    </label>
    {failed && <p role="alert" className="text-sm text-a-danger">{t('content.bell.morning_failed', 'The setting could not be saved. Please try again.')}</p>}
  </section>
}
