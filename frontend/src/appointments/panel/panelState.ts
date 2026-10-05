import type { ActionKey, ClientMessageInfo, ClientSummary, CreateBody, DateKey, PointsResult } from '../lib/types'
import { makeWall, minutesOf } from '../lib/wallClock'

export type Source = 'admin' | 'phone' | 'walk_in'

export interface CreateDraft {
  date: DateKey
  /** 'HH:mm' on the venue's clock, or null until one is chosen. */
  time: string | null
  masterId: number | null
  serviceId: number | null
  client: ClientSummary | null
  source: Source
  staffNotes: string
}

export interface PanelError { code: string; message: string }

export type PanelState =
  | { mode: 'closed' }
  | { mode: 'create'; draft: CreateDraft; key: string; saving: boolean; error: PanelError | null }
  | {
      mode: 'view'
      id: number
      sub: 'summary' | 'move' | 'confirm'
      action: ActionKey | null
      reason: string
      saving: boolean
      error: PanelError | null
      outcome: PointsResult | null
      /** What the last save told the client (Part D), shown once on the summary it returns to. */
      told: ClientMessageInfo | null
    }

export type PanelEvent =
  | { type: 'openCreate'; draft: Partial<CreateDraft> & { date: DateKey }; key: string }
  | { type: 'edit'; patch: Partial<CreateDraft>; key: string }
  | { type: 'openView'; id: number }
  | { type: 'startMove' }
  | { type: 'askConfirm'; action: ActionKey }
  | { type: 'setReason'; reason: string }
  | { type: 'back' }
  | { type: 'saving' }
  | { type: 'failed'; error: PanelError }
  | { type: 'created'; id: number; told?: ClientMessageInfo | null }
  | { type: 'done'; outcome: PointsResult | null; told?: ClientMessageInfo | null }
  | { type: 'close' }

export const CLOSED: PanelState = { mode: 'closed' }

export function emptyDraft(date: DateKey): CreateDraft {
  return { date, time: null, masterId: null, serviceId: null, client: null, source: 'admin', staffNotes: '' }
}

const viewOf = (id: number, told: ClientMessageInfo | null = null): PanelState => ({ mode: 'view', id, sub: 'summary', action: null, reason: '', saving: false, error: null, outcome: null, told })

/**
 * How often an open appointment is fetched again. Only while it is being
 * looked at: during a move, a confirmation or a save the panel keeps the
 * version the operator is acting on, so a change by someone else meets the
 * server's revision check ("changed by someone else") instead of slipping
 * silently into the form.
 */
export function detailPollMs(state: PanelState): number | false {
  return state.mode === 'view' && state.sub === 'summary' && !state.saving ? 30_000 : false
}

/** A fresh Idempotency-Key. One per draft: see the `edit` event. */
export function newKey(): string {
  return crypto.randomUUID()
}

export function canSave(draft: CreateDraft): boolean {
  return draft.client !== null && draft.serviceId !== null && draft.masterId !== null && draft.time !== null
}

export function draftBody(draft: CreateDraft): CreateBody | null {
  if (draft.client === null || draft.serviceId === null || draft.masterId === null || draft.time === null) return null
  const notes = draft.staffNotes.trim()
  return {
    client_id: draft.client.id,
    service_id: draft.serviceId,
    master_id: draft.masterId,
    start: makeWall(draft.date, minutesOf(draft.time)),
    source: draft.source,
    ...(notes ? { staff_notes: notes } : {}),
  }
}

export function panelReducer(state: PanelState, event: PanelEvent): PanelState {
  switch (event.type) {
    case 'close':
      return CLOSED
    case 'openCreate':
      return { mode: 'create', draft: { ...emptyDraft(event.draft.date), ...event.draft }, key: event.key, saving: false, error: null }
    case 'openView':
      return viewOf(event.id)
    default:
      break
  }

  if (state.mode === 'create') {
    switch (event.type) {
      case 'edit':
        // A changed draft is a different request, so it gets a new key; the
        // server refuses a key reused for a different body. The time is kept
        // as chosen: whether it is free for the new day, person or service is
        // the server's answer, which the form checks before it allows a save.
        return { ...state, draft: { ...state.draft, ...event.patch }, key: event.key, error: null }
      case 'saving':
        return { ...state, saving: true, error: null }
      case 'failed':
        // Same draft, same key: a retry replays the first attempt if it landed.
        return { ...state, saving: false, error: event.error }
      case 'created':
        return viewOf(event.id, event.told ?? null)
      default:
        return state
    }
  }

  if (state.mode === 'view') {
    switch (event.type) {
      case 'startMove':
        return { ...state, sub: 'move', action: null, error: null, outcome: null, told: null }
      case 'askConfirm':
        return { ...state, sub: 'confirm', action: event.action, reason: '', error: null, outcome: null, told: null }
      case 'setReason':
        return { ...state, reason: event.reason }
      case 'back':
        return { ...state, sub: 'summary', action: null, reason: '', error: null, told: null }
      case 'saving':
        return { ...state, saving: true, error: null }
      case 'failed':
        // Someone else changed it: show the current appointment, not a form
        // built on the old one.
        return event.error.code === 'stale'
          ? { ...state, sub: 'summary', action: null, reason: '', saving: false, error: event.error, told: null }
          : { ...state, saving: false, error: event.error, told: null }
      case 'done':
        return { ...state, sub: 'summary', action: null, reason: '', saving: false, error: null, outcome: event.outcome, told: event.told ?? null }
      default:
        return state
    }
  }

  return state
}
