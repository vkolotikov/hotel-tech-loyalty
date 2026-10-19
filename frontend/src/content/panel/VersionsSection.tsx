import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { BudgetStatus, Platform, PostDetail, PostGroup } from '../lib/types'
import { usePanel } from './PanelProvider'
import { aiAllowed, submitReady, versionChoices, versionNote, versionsBody } from './versionsMath'

const CHIP = 'rounded-full border px-2.5 py-1 text-xs font-medium'

/**
 * Versions per platform (spec 2026-10-19 §3): the post's group as chips (platform, status, day; this post marked; a
 * chip opens that version), Make versions… for the platforms not yet in it — adapted by the AI in the background or
 * copied as they are — and Unlink. While the AI works the panel says so; a version it did not adapt says why.
 * Everything waits while the post has unsaved edits: a version copies the post as saved.
 */
export function VersionsSection({ post, group, dirty, onPost }: {
  post: PostDetail
  /** The group as last read (the panel reads it again while the AI adapts); null when the post is in no group. */
  group: PostGroup | null
  dirty: boolean
  /** The post as the server answered (in its group, or out of it). */
  onPost: (post: PostDetail) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const panel = usePanel()
  const [making, setMaking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<number | null>(null)
  const choices = versionChoices(boot.platforms, post, group)
  const note = versionNote(group, post)
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.versions.${key}`, english, vars)
  const platformName = (p: Platform) => t(`content.platform.${p}`, p)

  const run = async (call: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await call()
    } catch (e) {
      const [key, text] = errorKey('version', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }
  const make = (platforms: Platform[], ai: boolean) => run(async () => {
    const answer = await api.makeVersions(post.id, platforms, ai)
    setMaking(false)
    setMade(answer.versions.length)
    onPost(answer.post)
  })
  const unlink = () => run(async () => {
    setMade(null)
    onPost((await api.unlinkGroup(post.id)).post)
  })

  return (
    <section aria-labelledby="content-versions-title" className="space-y-3">
      <h3 id="content-versions-title" className="flex items-center gap-2 font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">
        <Layers size={14} aria-hidden />{w('title', 'Versions')}
      </h3>
      {group ? (
        <ul data-versions="" className="flex flex-wrap gap-1.5">
          {group.posts.map(p => {
            const current = p.id === post.id
            const day = p.scheduled_date ? formatDate(p.scheduled_date, locale, { day: 'numeric', month: 'short' }) : w('no_day', 'No day')
            const line = [platformName(p.platform), t(`content.status.${p.status}`, p.status), day].join(' · ')
            return (
              <li key={p.id}>
                <button type="button" aria-current={current ? 'true' : undefined} disabled={current} onClick={() => { panel.open(p.id) }}
                  className={`${CHIP} ${current ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                  {line}{current && <span className="sr-only">{` (${w('this_one', 'This post')})`}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-a-text-2">{w('intro', 'The same post for other platforms. Each version is a post of its own.')}</p>
      )}
      {note?.kind === 'adapting' && <p role="status" className="text-xs text-a-text-2">{w('adapting', 'Adapting for {{platform}}…', { platform: platformName(note.platform) })}</p>}
      {note?.kind === 'adapting_others' && <p role="status" className="text-xs text-a-text-2">{w('adapting_others', 'The AI is adapting the versions…')}</p>}
      {note?.kind === 'kept' && (
        <Notice tone="warning">
          {note.reason === 'budget'
            ? w('kept_budget', 'The AI budget ran out; this version keeps the original text.')
            : w('kept_failed', 'The AI could not adapt this version; it keeps the original text.')}
        </Notice>
      )}
      {made !== null && <p role="status" className="text-xs text-a-text-2">{w('made', 'Versions made: {{count}}', { count: made })}</p>}
      {dirty && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      <div className="flex flex-wrap gap-2">
        {choices.length > 0 && (
          <Button size="sm" variant="secondary" disabled={dirty || busy} aria-expanded={making} onClick={() => setMaking(m => !m)}>
            <Layers size={14} aria-hidden />{w('make', 'Make versions…')}
          </Button>
        )}
        {group && (
          <Button size="sm" variant="ghost" disabled={dirty || busy} onClick={() => { void unlink() }}>{w('unlink', 'Unlink this post')}</Button>
        )}
      </div>
      {choices.length === 0 && <p className="text-xs text-a-text-2">{w('none_left', 'This post has a version for every platform.')}</p>}
      {making && choices.length > 0 && (
        <VersionsForm choices={choices} budget={boot.ai.status} busy={busy} dirty={dirty} onSubmit={(platforms, ai) => { void make(platforms, ai) }} onCancel={() => setMaking(false)} />
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}

/** The Make versions form (its own component, so a static render can draw it): the platforms, then the AI or a plain copy. */
export function VersionsForm({ choices, budget, busy, dirty, onSubmit, onCancel }: {
  choices: Platform[]
  budget: BudgetStatus
  busy: boolean
  /** The panel holds unsaved edits: nothing is made until they are saved (submitReady). */
  dirty: boolean
  onSubmit: (platforms: Platform[], ai: boolean) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const w = (key: string, english: string) => t(`content.versions.${key}`, english)
  const allowed = aiAllowed(budget)
  const [picked, setPicked] = useState<Platform[]>([])
  const [ai, setAi] = useState(allowed)
  const body = versionsBody(picked, choices, ai, budget)
  const withAi = ai && allowed

  return (
    <div data-versions-form="" className="space-y-3 rounded-lg border border-a-border bg-a-surface-2 p-3">
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-a-text-2">{w('platforms', 'For which platforms')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {choices.map(p => (
            <label key={p} className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={picked.includes(p)} onChange={(e) => setPicked(list => (e.target.checked ? [...list, p] : list.filter(x => x !== p)))} />
              {t(`content.platform.${p}`, p)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">{w('how', 'How')}</legend>
        <label className="flex items-center gap-2 text-sm text-a-text">
          <input type="radio" name="content-versions-how" checked={withAi} disabled={!allowed} onChange={() => setAi(true)} />
          {w('ai', 'Adapt with AI')}
        </label>
        <label className="flex items-center gap-2 text-sm text-a-text">
          <input type="radio" name="content-versions-how" checked={!withAi} onChange={() => setAi(false)} />
          {w('copy', 'Copy as is')}
        </label>
      </fieldset>
      {!allowed && <p className="text-xs text-a-text-2">{w('ai_paused', 'This month’s AI budget is used up: the versions copy the text as it is.')}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!submitReady(body, dirty)} loading={busy} onClick={() => { if (body && submitReady(body, dirty)) onSubmit(body.platforms, body.ai) }}>{w('submit', 'Make versions')}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>{t('content.common.cancel', 'Cancel')}</Button>
      </div>
    </div>
  )
}
