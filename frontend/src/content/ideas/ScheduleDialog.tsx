import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { isDateKey } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { INPUT } from '../brand/inputs'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { Channel, DateKey, PostCard } from '../lib/types'
import { canAdd } from '../plan/addMath'
import { Dialog } from '../ui/Dialog'
import { PosterSelect } from '../ui/PosterSelect'
import { initialPoster, scheduleBody, scheduleDefaults, undoPoster } from './ideasMath'

/** Schedule (spec 2026-10-16 §4.2): a day from today on and the channel's usual time; the post goes to the Plan. */
export function ScheduleDialog({ post, today, channels, industry, onClose, onScheduled }: {
  post: PostCard
  today: DateKey
  channels: Channel[]
  industry: string | null
  onClose: () => void
  /** The post as the server moved it, and the poster Undo gives back (undefined: Schedule left it as it was). */
  onScheduled: (post: PostCard, undoPoster: number | null | undefined) => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const [form, setForm] = useState(() => scheduleDefaults(post.platform, channels, industry, today))
  // Who posts it (spec 2026-10-19 §4.1): the team, the post's own poster to start; sent only when changed.
  const team = useQuery({ queryKey: ['content', brand, 'team'], queryFn: api.team, staleTime: 300_000 })
  const members = team.data?.team ?? []
  const initial = initialPoster(post, members)
  const [picked, setPicked] = useState<string | null>(null)
  const poster = picked ?? initial
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = isDateKey(form.date) && canAdd(form.date, today)

  const save = async () => {
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const body = scheduleBody(post, form, poster, initial)
      const { post: moved } = await api.movePost(post.id, body)
      onScheduled(moved, undoPoster(body, initial))
    } catch (e) {
      // Its own family: only Schedule sends who posts it (5A-2 review).
      const [key, text] = errorKey('schedule', failureOf(e).code)
      setError(t(key, text))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('content.ideas.schedule_title', 'Schedule this post')} onClose={onClose} busy={busy}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.ideas.day', 'Day')}</span>
            <input type="date" value={form.date} min={today} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${INPUT} border-a-border`} />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.ideas.time', 'Time')}</span>
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`${INPUT} border-a-border`} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.fields.poster', 'Who posts it')}</span>
          <PosterSelect value={poster} onChange={setPicked} choices={members.map(m => ({ id: m.id, name: m.name }))} loading={team.isLoading} className={`${INPUT} border-a-border`} />
        </label>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex gap-2">
          <Button onClick={() => { void save() }} loading={busy} disabled={!ok}>{t('content.ideas.schedule_yes', 'Schedule')}</Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>{t('content.common.cancel', 'Cancel')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
