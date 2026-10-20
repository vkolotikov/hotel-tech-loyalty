import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useMedia } from '../../workspace/lib/useMedia'
import { formatDate, isDateKey } from '../../workspace/lib/wallClock'
import { Notice } from '../../workspace/ui/Notice'
import { CalendarSkeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { PLAN_REFRESH_MS, UNDO_MS } from '../lib/constants'
import { errorKey } from '../lib/errors'
import { putInPlans, refreshLists } from '../lib/planCache'
import { onShortcuts } from '../lib/shortcuts'
import type { BuiltInDay, DateKey, GenerateRun, KeyDate, OwnKeyDate, OwnKind, PostCard, PostDetail, PromotionRun, Slot } from '../lib/types'
import { usePanel } from '../panel/PanelProvider'
import { isPromoting, planNote } from '../promote/promoteMath'
import { PromotingLine } from '../promote/PromotingLine'
import { usePromotionWatch } from '../promote/useSite'
import { DragGhost } from './DragGhost'
import { GenerateDialog } from './GenerateDialog'
import { GeneratingLine } from './GeneratingLine'
import { isRunning, runEnded, runNote, useGenerationRun } from './generateRun'
import { ListView } from './ListView'
import { MonthGrid } from './MonthGrid'
import { createMover, keyMove, leavesRange, movedDate, undoOf, type DropTarget } from './moveMath'
import { filtered, keepWithinBrand, opensAfterFill, plansFor, presentPlatforms, rangeFor, rangeLabel, shiftDate, slotKey } from './planMath'
import { canAdd, newPostDraft, usualTimes, type AddChoice } from './addMath'
import { GoalsLine } from './GoalsLine'
import { KeyDateEditor } from './KeyDateEditor'
import { KeyDayCard } from './KeyDayCard'
import { TemplatePicker } from './TemplatePicker'
import { holidayCountryOf, isBuiltIn, keyDatesByDay } from './keyDateMath'
import { showGoals } from './goalsMath'
import { MOVE_HINT_ID } from './PostCardView'
import { loadPrefs, savePrefs, type PlanPrefs } from './prefs'
import { Toolbar } from './Toolbar'
import { Tray } from './Tray'
import { useCardDrag } from './useCardDrag'
import { WeekGrid } from './WeekGrid'
import { WeekStrip } from './WeekStrip'

/** The line under the toolbar after a move (with its Undo) or a refusal. */
interface Note { tone: 'info' | 'danger'; text: string; undo: (() => void) | null }

/**
 * The Plan, HexaTech Content's home (spec §4.2): the week (or the month, or
 * the list — the only view below 1024 px) on the venue's clock, the This
 * week strip, empty slots to write or fill, the Unscheduled tray, drag and
 * Shift+arrow moves with Undo, and Generate for managers. It is read again
 * every minute and when the window comes back.
 */
export function PlanPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  // The brand on screen when an answer comes back (a Fill takes a while; the brand may change meanwhile).
  const brandNow = useRef(brand)
  useEffect(() => { brandNow.current = brand }, [brand])
  const panel = usePanel()
  const queryClient = useQueryClient()
  const wide = useMedia('(min-width: 1024px)')
  const [prefs, setPrefs] = useState<PlanPrefs>(() => loadPrefs(boot.platforms, boot.statuses))
  // The day to open on is the server's: a computer whose clock or zone is off still opens on the venue's week.
  const [date, setDate] = useState<DateKey>(boot.venue.today)
  const [note, setNote] = useState<Note | null>(null)
  // The note the pointer or the keyboard focus is on waits. Tied to that note, so a line that goes away under the
  // pointer (Undo) does not hold the next one.
  const [heldNote, setHeldNote] = useState<Note | null>(null)
  const held = note !== null && heldNote === note
  const [filling, setFilling] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  // A holiday or special day's card, and an event or note being written (spec 2026-10-16 §3.4).
  const [dayCard, setDayCard] = useState<{ day: DateKey; keyDate: BuiltInDay } | null>(null)
  const [keyDateEdit, setKeyDateEdit] = useState<{ kind: OwnKind; keyDate: OwnKeyDate | null; day: DateKey } | null>(null)
  // "+ → From a template…" (spec 2026-10-16 §5.3): the day the picker is open for.
  const [picking, setPicking] = useState<DateKey | null>(null)
  const [params, setParams] = useSearchParams()

  // A link names a day (?date=…, the post links): adopted while rendering, then cleared from the address.
  const linkDate = params.get('date')
  const [adopted, setAdopted] = useState<string | null>(null)
  if (linkDate !== adopted) {
    setAdopted(linkDate)
    if (linkDate !== null && isDateKey(linkDate)) setDate(linkDate)
  }
  useEffect(() => { if (params.has('date')) setParams({}, { replace: true }) }, [params, setParams])

  useEffect(() => { savePrefs(prefs) }, [prefs])
  // The Undo line stays while the pointer or the keyboard focus is on it (8 s are short for a keyboard).
  useEffect(() => {
    if (!note || held) return
    const timer = window.setTimeout(() => setNote(null), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [note, held])

  const view = wide ? prefs.view : 'list'
  const range = rangeFor(view, date)
  const query = useQuery({
    queryKey: ['content', brand, 'plan', range.from, range.to],
    queryFn: () => api.plan(range.from, range.to),
    refetchInterval: PLAN_REFRESH_MS,
    refetchOnWindowFocus: true,
    placeholderData: keepWithinBrand(brand),
  })
  const refresh = () => refreshLists(queryClient, brand)
  // A Generate run on the queue worker (2026-10-20), followed through the query the dialog shares: when one seen
  // running ends — the dialog open or closed — the plan is read again and the note says how it went.
  const generation = useGenerationRun()
  const seenRun = useRef<GenerateRun | undefined>(generation.data)
  useEffect(() => {
    if (runEnded(seenRun.current, generation.data)) {
      void refreshLists(queryClient, brand)
      setNote({ ...runNote(generation.data, t), undo: null })
    }
    seenRun.current = generation.data
  }, [generation.data, queryClient, brand, t])
  // A promotion finishing on the queue worker (spec 2026-10-20 §5): the watcher reads the plan again; the note says so.
  const onPromoted = useCallback((run: PromotionRun) => {
    // The posts added, or that none were (final review, 6-2: "added: 0" read like news).
    if (run.status === 'finished') setNote({ ...planNote(run, t), undo: null })
  }, [t])
  const promotion = usePromotionWatch(onPromoted)

  // The brand's channels (the same read as the panel's): what a new post from a day starts on, and each platform's usual time.
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const channels = useMemo(() => brandInfo.data?.channels ?? [], [brandInfo.data])
  const industry = boot.organization.industry
  const times = useMemo(() => usualTimes(channels, industry), [channels, industry])
  const templates = brandInfo.data?.templates ?? []
  // This week's posting goals and the streak (spec 2026-10-15 §7), read with the plan.
  const goals = useQuery({ queryKey: ['content', brand, 'goals'], queryFn: api.goals, refetchInterval: PLAN_REFRESH_MS, refetchOnWindowFocus: true })

  // A card moved out of the week by keyboard: once its new week is read, focus it there.
  const [follow, setFollow] = useState<number | null>(null)
  const [focusCard, setFocusCard] = useState<{ id: number; seq: number } | null>(null)
  const followed = follow !== null && !query.isPlaceholderData && (query.data?.posts ?? []).some(p => p.id === follow)
  if (followed) {
    setFocusCard({ id: follow, seq: (focusCard?.seq ?? 0) + 1 })
    setFollow(null)
  }
  useEffect(() => {
    if (!focusCard) return
    const frame = window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-post="${focusCard.id}"]`)?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [focusCard])

  // This page's shortcuts (spec §4.7): this week, back and forward, the views. The shell hears Find, ? and N.
  useEffect(() => onShortcuts(window, document, (hit, e) => {
    if (hit === 'today') setDate(boot.venue.today)
    else if (hit === 'prev') setDate(d => shiftDate(view, d, -1))
    else if (hit === 'next') setDate(d => shiftDate(view, d, 1))
    else if (hit === 'week' || hit === 'month' || hit === 'list') {
      if (!wide) return // the list is the only view on a narrow screen
      setPrefs(p => (p.view === hit ? p : { ...p, view: hit }))
    } else return
    e.preventDefault()
  }), [boot.venue.today, view, wide])

  const data = query.data
  const shown = useMemo(() => filtered(data?.posts ?? [], data?.slots ?? [], prefs.filter), [data, prefs.filter])
  const plans = plansFor(range.days, shown.posts, shown.slots)
  const chips = presentPlatforms(boot.platforms, data?.posts ?? [], data?.slots ?? [], prefs.filter.platforms)
  const selectedId = panel.target?.kind === 'post' ? panel.target.id : null
  const aiPaused = boot.ai.status === 'over'
  const today = boot.venue.today
  const dayName = (day: DateKey) => formatDate(day, locale, { weekday: 'short', day: 'numeric', month: 'short' })
  // The range's key dates by day, while the layer shows; a substitute day says "observed" for the United States.
  const keyDates = prefs.keyDates ? keyDatesByDay(data?.key_dates ?? [], range.days) : undefined
  const observed = holidayCountryOf(brandInfo.data) === 'US'

  // A saved move shows at once, on every plan read, in the post's cached copy and in the panel when it shows that post.
  const { noteMoved } = panel
  const mover = useMemo(() => createMover({
    api,
    place: (card) => {
      putInPlans(queryClient, brand, card)
      queryClient.setQueryData<PostDetail>(['content', brand, 'post', card.id], old => (old ? { ...old, ...card } : old))
      noteMoved(card)
    },
    refresh: () => refreshLists(queryClient, brand),
  }), [api, queryClient, brand, noteMoved])

  /** One move: saved at once, the plan read again, a line with Undo for 8 seconds (spec §4.2). A refusal says why. */
  const move = async (post: PostCard, to: DateKey | null, undoable: boolean, focus: boolean, time?: string | null) => {
    const result = await mover(post, to, time)
    if (!result.ok) {
      if (result.code === 'busy') return // the same card's last move is still on its way
      const [key, text] = errorKey('move', result.code)
      setNote({ tone: 'danger', text: t(key, text), undo: null })
      return
    }
    // A keyboard move leaves the focus on the card at its new place.
    if (focus) window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-post="${post.id}"]`)?.focus())
    setNote(undoable
      ? {
          tone: 'info',
          text: to === null ? t('content.plan.moved_tray', 'Moved to Unscheduled') : t('content.plan.moved', 'Moved to {{day}}', { day: dayName(to) }),
          undo: () => { const back = undoOf(post, result.moved); void move(back.post, back.to, false, false, back.time) },
        }
      : { tone: 'info', text: t('content.plan.undone', 'Move undone'), undo: null })
  }

  const drag = useCardDrag((post: PostCard, target: DropTarget) => {
    const to = movedDate(post.scheduled_date, target)
    if (to !== undefined) void move(post, to, true, false)
  })

  const onCardKeyDown = (e: KeyboardEvent<HTMLButtonElement>, post: PostCard) => {
    const to = keyMove(post.scheduled_date, e.key, e.shiftKey)
    if (to === undefined) return
    e.preventDefault()
    if (post.status === 'published') {
      const [key, text] = errorKey('move', 'published_cannot_move')
      setNote({ tone: 'danger', text: t(key, text), undo: null })
      return
    }
    // Past Sunday or Monday: show the card's new week and focus it there once it is read.
    if (leavesRange(to, range)) { setDate(to); setFollow(post.id) }
    void move(post, to, true, true)
  }

  // The click a drag's release fires is not an opening.
  const openPost = (id: number) => { if (!drag.consumeClick()) panel.open(id) }
  // The usual time only once the brand's channels are read; before that the panel gives it when they arrive.
  const write = (slot: Slot) => { panel.openNew({ date: slot.date, platform: slot.platform, time: brandInfo.data ? times[slot.platform] ?? null : undefined }) }
  const fill = async (slot: Slot) => {
    setFilling(slotKey(slot))
    const madeFor = brand
    try {
      const { post } = await api.fill(slot.date, slot.platform)
      if (!opensAfterFill(madeFor, brandNow.current)) return // the brand changed while the AI wrote: this post belongs to the other one
      queryClient.setQueryData(['content', brand, 'post', post.id], post)
      await refresh()
      panel.open(post.id)
    } catch (error) {
      const [key, text] = errorKey('fill', failureOf(error).code)
      setNote({ tone: 'danger', text: t(key, text), undo: null })
      void refresh() // the slot may be taken, or the post written after all
    } finally {
      setFilling(null)
    }
  }

  // A day's empty space or its "+" (spec 2026-10-15 §4). The click a drag's release fires over a day's empty space is
  // not one (Review Focus 1): the same guard as opening a card. The plan's own slots, before the platform filter.
  const addOn = (day: DateKey, choice: AddChoice = 'post') => {
    if (drag.consumeClick() || !canAdd(day, today)) return
    if (choice === 'note' || choice === 'event') {
      setKeyDateEdit({ kind: choice, keyDate: null, day })
      return
    }
    // "From a template…" (offered only when the brand has templates) opens the template picker (spec 2026-10-16 §5.3).
    if (choice === 'template') {
      setPicking(day)
      return
    }
    const draft = newPostDraft(day, data?.slots ?? [], channels, industry)
    panel.openNew(brandInfo.data ? draft : { ...draft, time: undefined })
  }

  const dropTarget = drag.state?.target ?? null

  // A chip: a built-in day opens its card; an event or note its editor.
  const onKeyDate = (keyDate: KeyDate, day: DateKey) => {
    if (isBuiltIn(keyDate)) setDayCard({ day, keyDate })
    else setKeyDateEdit({ kind: keyDate.kind, keyDate, day })
  }
  // "Write a post for it": a new post on the day, the day's name as its topic.
  const writeFor = (day: DateKey, topic: string) => {
    setDayCard(null)
    const draft = newPostDraft(day, data?.slots ?? [], channels, industry)
    panel.openNew({ ...(brandInfo.data ? draft : { ...draft, time: undefined }), fields: { topic } })
  }
  const dropDate = dropTarget?.kind === 'day' ? dropTarget.date : null
  const handlers = { onOpen: openPost, onWrite: write, onFill: (slot: Slot) => { void fill(slot) }, onCardKeyDown }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <Toolbar view={view} viewLocked={!wide} label={rangeLabel(view, range, date, locale)} refreshing={query.isFetching && !query.isLoading}
        canGenerate={boot.staff.can_manage} filter={prefs.filter} platforms={chips} statuses={boot.statuses}
        onPrev={() => setDate(shiftDate(view, date, -1))} onNext={() => setDate(shiftDate(view, date, 1))}
        onToday={() => setDate(boot.venue.today)}
        onView={(v) => setPrefs({ ...prefs, view: v })} onFilter={(filter) => setPrefs({ ...prefs, filter })}
        onGenerate={() => setGenerating(true)} aiPaused={aiPaused}
        keyDates={prefs.keyDates} onKeyDates={(on) => setPrefs({ ...prefs, keyDates: on })} />

      {view !== 'month' && (
        <div className="space-y-3 px-4 pb-3 lg:px-6">
          <WeekStrip figures={data?.figures} pending={!data || query.isPlaceholderData} />
          {showGoals(goals.data, range, today) && <GoalsLine goals={goals.data} />}
        </div>
      )}

      {query.isError && (
        <div className="px-4 pb-3 lg:px-6"><Notice tone="danger">{t('content.plan.load_failed', 'The plan could not be refreshed. What you see may be out of date.')}</Notice></div>
      )}

      {isRunning(generation.data) && <div className="px-4 pb-3 lg:px-6"><GeneratingLine run={generation.data} /></div>}
      {isPromoting(promotion.data) && <div className="px-4 pb-3 lg:px-6"><PromotingLine run={promotion.data} /></div>}

      {note && (
        <div className="px-4 pb-3 lg:px-6">
          {note.tone === 'danger' ? <Notice tone="danger">{note.text}</Notice> : (
            <div role="status" onMouseEnter={() => setHeldNote(note)} onMouseLeave={() => setHeldNote(null)} onFocus={() => setHeldNote(note)} onBlur={() => setHeldNote(null)}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-a-border bg-a-surface-2 px-3.5 py-2.5 text-sm text-a-text animate-a-fade">
              <span>{note.text}</span>
              {note.undo && (
                <button type="button" onClick={() => { const undo = note.undo; setNote(null); undo?.() }} className="font-semibold text-a-accent-text hover:underline">
                  {t('content.plan.undo', 'Undo')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 lg:px-6 xl:flex-row">
        <div className="min-h-[24rem] min-w-0 flex-1 overflow-auto rounded-xl border border-a-border bg-a-surface shadow-a-sm">
          {query.isLoading && <CalendarSkeleton />}
          {!query.isLoading && view === 'week' && (
            <WeekGrid plans={plans} today={today} locale={locale} selectedId={selectedId} dropDate={dropDate} fillingKey={filling} aiPaused={aiPaused} times={times} onAdd={addOn}
              keyDates={keyDates} observed={observed} onKeyDate={onKeyDate} templates={templates.length > 0}
              {...handlers} onCardPointerDown={drag.begin} />
          )}
          {!query.isLoading && view === 'month' && (
            <MonthGrid plans={plans} date={date} today={today} locale={locale} selectedId={selectedId} dropDate={dropDate} onAdd={addOn}
              keyDates={keyDates} observed={observed} onKeyDate={onKeyDate} templates={templates.length > 0}
              onDay={(day) => { setDate(day); setPrefs({ ...prefs, view: 'week' }) }}
              onOpen={openPost} onCardPointerDown={drag.begin} onCardKeyDown={onCardKeyDown} />
          )}
          {!query.isLoading && view === 'list' && (
            <ListView plans={plans} today={today} locale={locale} selectedId={selectedId} fillingKey={filling} aiPaused={aiPaused} {...handlers} times={times} onAdd={addOn}
              keyDates={keyDates} observed={observed} onKeyDate={onKeyDate} templates={templates.length > 0} />
          )}
        </div>
        <div className="xl:w-64 xl:shrink-0">
          <Tray posts={data?.unscheduled ?? []} total={data?.unscheduled_total} active={dropTarget?.kind === 'tray'} selectedId={selectedId}
            onOpen={openPost} onCardPointerDown={wide ? drag.begin : undefined} onCardKeyDown={onCardKeyDown} />
        </div>
      </div>

      <p id={MOVE_HINT_ID} className="sr-only">{t('content.plan.move_hint', 'Shift and the left or right arrow moves it a day.')}</p>
      {drag.state && <DragGhost post={drag.state.post} x={drag.state.x} y={drag.state.y} />}
      {generating && <GenerateDialog today={today} onClose={() => setGenerating(false)} onDone={() => { void refresh() }} />}
      {dayCard && (
        <KeyDayCard day={dayCard.day} keyDate={dayCard.keyDate} observed={observed} canWrite={canAdd(dayCard.day, today)}
          onWrite={(topic) => writeFor(dayCard.day, topic)} onClose={() => setDayCard(null)} />
      )}
      {keyDateEdit && <KeyDateEditor kind={keyDateEdit.kind} keyDate={keyDateEdit.keyDate} day={keyDateEdit.day} onClose={() => setKeyDateEdit(null)} />}
      {picking && <TemplatePicker day={picking} templates={templates} slots={data?.slots ?? []} channels={channels} onClose={() => setPicking(null)} />}
    </div>
  )
}
