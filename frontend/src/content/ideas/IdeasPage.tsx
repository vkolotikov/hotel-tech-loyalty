import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useMedia } from '../../workspace/lib/useMedia'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { staffLocked } from '../lib/approval'
import { errorKey } from '../lib/errors'
import { putPost, refreshLists } from '../lib/planCache'
import type { IdeasColumn, IdeasPayload, Platform, PostCard } from '../lib/types'
import { useActiveStrategy } from '../lib/useActiveStrategy'
import { usePanel } from '../panel/PanelProvider'
import { PageHeader } from '../ui/PageHeader'
import { IdeaColumn } from './IdeaColumn'
import { QuickCapture } from './QuickCapture'
import { canEnter, COLUMN_TEXT, COLUMNS, columnOf, IDEAS_HINT_ID, inFlight, moveStatus, placeCard, seeAllLink, unscheduleBody } from './ideasMath'
import { ScheduleDialog } from './ScheduleDialog'

const INPUT = 'rounded-lg border border-a-border bg-a-surface px-2.5 py-1.5 text-sm text-a-text'

/**
 * Ideas (spec 2026-10-16 §4): every post without a day, by stage — four columns from 1024 px, one stage at a time with
 * a switch below. A card opens in the panel; it moves by drag, Shift + ← / → or "Move to…"; Schedule puts it on the
 * Plan with an Undo line. Filters: platform and pillar.
 */
export function IdeasPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const panel = usePanel()
  const wide = useMedia('(min-width: 1024px)')
  // Spec 2026-10-16 §6.2: while the brand's approvals are on, staff cannot move a card into Ready (the server refuses it).
  const locked = staffLocked(boot)
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [pillarId, setPillarId] = useState<number | null>(null)
  const [stage, setStage] = useState<IdeasColumn>('idea')
  const [dragging, setDragging] = useState<PostCard | null>(null)
  const [scheduling, setScheduling] = useState<PostCard | null>(null)
  // The post as scheduled, and the poster Undo gives back when Schedule changed it (5A-2 review; final review).
  const [undo, setUndo] = useState<{ moved: PostCard; poster: number | null | undefined } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A moved card is focused again in its new stage once the board is read again (its old place is gone).
  const refocus = useRef<number | null>(null)
  // One move of a card at a time: a second, sent before the first is saved, would carry the card's old version.
  const [moving] = useState(inFlight)

  const query = useQuery({ queryKey: ['content', brand, 'ideas', platform, pillarId], queryFn: () => api.ideas({ platform, pillar_id: pillarId }) })
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  // Nothing is said about the stages before the board is read (an empty stage would be a claim).
  const board = query.data
  const { strategy, known } = useActiveStrategy()
  const pillars = strategy?.pillars ?? []
  const pillarName = (id: number | null): string | null =>
    id === null || !known ? null : (pillars.find(p => p.id === id)?.name ?? t('content.posts.other_pillar', 'Another pillar'))

  useEffect(() => {
    const id = refocus.current
    if (id === null) return
    refocus.current = null
    document.querySelector<HTMLElement>(`[data-ideas] [data-post="${id}"]`)?.focus()
  }, [query.data])

  const fail = (family: 'idea' | 'move', e: unknown) => {
    const [key, text] = errorKey(family, failureOf(e).code)
    setError(t(key, text))
  }

  const move = async (post: PostCard, to: IdeasColumn) => {
    const status = moveStatus(post, to)
    if (status === null || !canEnter(to, locked) || !moving.start(post.id)) return
    setError(null)
    try {
      const { post: saved } = await api.savePost(post.id, { status, updated_at: post.updated_at })
      // An open panel keeps the post's timeline and reads it again (a move into review records a step): final review.
      putPost(queryClient, brand, saved)
      refocus.current = saved.id
      // The card in its new place at once, with its new version, for the next move (final review).
      queryClient.setQueryData<IdeasPayload>(['content', brand, 'ideas', platform, pillarId], old => (old ? placeCard(old, saved) : old))
    } catch (e) {
      fail('idea', e)
    } finally {
      moving.done(post.id)
    }
    await refreshLists(queryClient, brand)
  }
  const drop = (to: IdeasColumn) => {
    const post = dragging
    setDragging(null)
    if (post) void move(post, to)
  }
  const scheduled = (post: PostCard, poster: number | null | undefined) => {
    setScheduling(null)
    setUndo({ moved: post, poster })
    void refreshLists(queryClient, brand)
  }
  const unschedule = async () => {
    const last = undo
    if (!last) return
    setUndo(null)
    try {
      await api.movePost(last.moved.id, unscheduleBody(last.moved, last.poster))
    } catch (e) {
      fail('move', e)
    }
    await refreshLists(queryClient, brand)
  }

  const shown = wide ? COLUMNS : [stage]
  return (
    <div className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.ideas.title', 'Ideas')} />
      <p className="text-sm text-a-text-2">{t('content.ideas.intro', 'Posts without a day, by stage. Move a card to another stage, or schedule it onto the Plan.')}</p>
      <p id={IDEAS_HINT_ID} className="sr-only">{t('content.ideas.move_hint', 'Shift + ← or → moves the card to the stage beside it.')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('content.posts.platform', 'Platform')} value={platform ?? ''} className={INPUT}
          onChange={(e) => setPlatform(e.target.value === '' ? null : (e.target.value as Platform))}>
          <option value="">{t('content.posts.all_platforms', 'All platforms')}</option>
          {boot.platforms.map(p => <option key={p} value={p}>{t(`content.platform.${p}`, p)}</option>)}
        </select>
        {pillars.length > 0 && (
          <select aria-label={t('content.posts.pillar', 'Pillar')} value={pillarId ?? ''} className={INPUT}
            onChange={(e) => setPillarId(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">{t('content.posts.all_pillars', 'All pillars')}</option>
            {pillars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {!wide && (
        <div role="group" aria-label={t('content.ideas.stage', 'Stage')} className="grid grid-cols-2 gap-1 rounded-lg border border-a-border p-0.5 sm:grid-cols-4">
          {COLUMNS.map(c => (
            <button key={c} type="button" aria-pressed={stage === c} onClick={() => setStage(c)}
              className={`rounded-md px-2 py-1 text-xs font-medium ${stage === c ? 'bg-a-surface-2 text-a-text' : 'text-a-text-2 hover:text-a-text'}`}>
              {t(`content.ideas.column.${c}`, COLUMN_TEXT[c])}{board && <> <span className="tabular-nums">{board.columns[c].total}</span></>}
            </button>
          ))}
        </div>
      )}

      {undo && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-a-border bg-a-surface-2 px-3 py-2 text-sm text-a-text">
          <span>{t('content.ideas.scheduled', 'Scheduled for {{day}}.', { day: undo.moved.scheduled_date ? formatDate(undo.moved.scheduled_date, locale, { weekday: 'long', day: 'numeric', month: 'long' }) : '' })}</span>
          <Button size="sm" variant="secondary" onClick={() => { void unschedule() }}>{t('content.ideas.undo', 'Undo')}</Button>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {query.isError && (
        <div className="space-y-2">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {!board && !query.isError && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}

      {board && <div data-ideas="" className={wide ? 'grid grid-cols-4 items-start gap-4' : ''}>
        {shown.map(column => (
          <IdeaColumn key={column} column={column} posts={board.columns[column].posts} total={board.columns[column].total}
            seeAll={seeAllLink(column, { platform, pillarId })} locale={locale} now={query.dataUpdatedAt} pillarName={pillarName}
            draggable={wide} locked={locked} dropping={dragging !== null && columnOf(dragging.status) !== column && canEnter(column, locked)}
            onOpen={(id) => { panel.open(id) }} onMove={(post, to) => { void move(post, to) }} onSchedule={setScheduling}
            onDragStart={setDragging} onDragEnd={() => setDragging(null)} onDrop={() => drop(column)}>
            {column === 'idea' && <QuickCapture />}
          </IdeaColumn>
        ))}
      </div>}

      {scheduling && (
        <ScheduleDialog post={scheduling} today={boot.venue.today} channels={brandInfo.data?.channels ?? []} industry={boot.organization.industry}
          onClose={() => setScheduling(null)} onScheduled={scheduled} />
      )}
    </div>
  )
}
