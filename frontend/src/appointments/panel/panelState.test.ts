import { describe, expect, it } from 'vitest'
import { CLOSED, canSave, draftBody, emptyDraft, panelReducer, type PanelState } from './panelState'
import type { ClientSummary } from '../lib/types'

const sophie: ClientSummary = { id: 5, name: 'Sophie Williams', phone: '+44 7700 900123', email: null, member: null }

function open(): Extract<PanelState, { mode: 'create' }> {
  const state = panelReducer(CLOSED, { type: 'openCreate', key: 'key-1', draft: { date: '2026-10-06', time: '10:00', masterId: 1 } })
  if (state.mode !== 'create') throw new Error('not in create mode')
  return state
}

describe('panelReducer — create', () => {
  it('opens with the slot prefilled and everything else empty', () => {
    const state = open()
    expect(state.draft).toEqual({ date: '2026-10-06', time: '10:00', masterId: 1, serviceId: null, client: null, source: 'admin', staffNotes: '' })
    expect(state).toMatchObject({ key: 'key-1', saving: false, error: null })
  })

  it('keeps the key across a failed save and changes it when the draft changes', () => {
    let state: PanelState = open()
    state = panelReducer(state, { type: 'saving' })
    state = panelReducer(state, { type: 'failed', error: { code: 'network', message: 'Timed out' } })
    // A retry of the same draft must reuse the key: if the first attempt did
    // reach the server, the second answers with that appointment.
    expect(state).toMatchObject({ mode: 'create', key: 'key-1', saving: false, error: { code: 'network' } })

    state = panelReducer(state, { type: 'edit', patch: { staffNotes: 'Running late' }, key: 'key-2' })
    // A changed draft is a different request: the old key would be refused.
    expect(state).toMatchObject({ mode: 'create', key: 'key-2', error: null })
  })

  it('keeps what was typed when a save fails', () => {
    let state: PanelState = panelReducer(open(), { type: 'edit', patch: { client: sophie, serviceId: 3, staffNotes: 'Allergic to lavender' }, key: 'k2' })
    state = panelReducer(panelReducer(state, { type: 'saving' }), { type: 'failed', error: { code: 'slot_taken', message: 'Taken' } })
    expect(state.mode === 'create' && state.draft).toMatchObject({ client: sophie, serviceId: 3, staffNotes: 'Allergic to lavender', time: '10:00' })
  })

  it('keeps the slot\'s time while the rest is chosen — the form checks it against the server\'s free times', () => {
    // Clicking 10:00 in Emma's column and then choosing the service must not
    // throw the 10:00 away. Whether 10:00 is still free for that service is
    // the server's answer (CreateForm: "That time is no longer free").
    let state: PanelState = panelReducer(open(), { type: 'edit', patch: { serviceId: 3 }, key: 'k' })
    expect(state.mode === 'create' && state.draft.time).toBe('10:00')
    state = panelReducer(state, { type: 'edit', patch: { date: '2026-10-07' }, key: 'k2' })
    expect(state.mode === 'create' && state.draft).toMatchObject({ date: '2026-10-07', time: '10:00', masterId: 1, serviceId: 3 })
    state = panelReducer(state, { type: 'edit', patch: { time: null }, key: 'k3' })
    expect(state.mode === 'create' && state.draft.time).toBeNull()
  })

  it('a saved appointment opens in the panel', () => {
    const state = panelReducer(panelReducer(open(), { type: 'saving' }), { type: 'created', id: 42 })
    expect(state).toEqual({ mode: 'view', id: 42, sub: 'summary', action: null, reason: '', saving: false, error: null, outcome: null })
  })

  it('ignores edits and saves when it is not creating', () => {
    expect(panelReducer(CLOSED, { type: 'edit', patch: { staffNotes: 'x' }, key: 'k' })).toBe(CLOSED)
    expect(panelReducer(CLOSED, { type: 'saving' })).toBe(CLOSED)
  })
})

describe('panelReducer — view', () => {
  const view = () => panelReducer(CLOSED, { type: 'openView', id: 7 })

  it('asks before an action and goes back without doing it', () => {
    let state = panelReducer(view(), { type: 'askConfirm', action: 'cancel' })
    state = panelReducer(state, { type: 'setReason', reason: 'Client rang' })
    expect(state).toMatchObject({ mode: 'view', sub: 'confirm', action: 'cancel', reason: 'Client rang' })
    expect(panelReducer(state, { type: 'back' })).toMatchObject({ sub: 'summary', action: null, reason: '', error: null })
  })

  it('returns to the summary with the outcome when an action is done', () => {
    let state = panelReducer(view(), { type: 'askConfirm', action: 'complete' })
    state = panelReducer(panelReducer(state, { type: 'saving' }), { type: 'done', outcome: { awarded: 900, reason: null } })
    expect(state).toMatchObject({ sub: 'summary', action: null, saving: false, error: null, outcome: { awarded: 900, reason: null } })
  })

  it('a stale save goes back to the summary, where the current appointment is shown', () => {
    let state = panelReducer(view(), { type: 'startMove' })
    expect(state).toMatchObject({ sub: 'move' })
    state = panelReducer(panelReducer(state, { type: 'saving' }), { type: 'failed', error: { code: 'stale', message: 'Changed' } })
    expect(state).toMatchObject({ sub: 'summary', saving: false, error: { code: 'stale' } })
  })

  it('any other failure stays where the user was', () => {
    let state = panelReducer(view(), { type: 'startMove' })
    state = panelReducer(panelReducer(state, { type: 'saving' }), { type: 'failed', error: { code: 'slot_taken', message: 'Taken' } })
    expect(state).toMatchObject({ sub: 'move', saving: false, error: { code: 'slot_taken' } })
  })

  it('close closes from anywhere', () => {
    expect(panelReducer(view(), { type: 'close' })).toBe(CLOSED)
    expect(panelReducer(open(), { type: 'close' })).toBe(CLOSED)
  })
})

describe('canSave / draftBody', () => {
  it('needs a client, a service, a person and a time', () => {
    const full = { ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie }
    expect(canSave(full)).toBe(true)
    for (const missing of [{ time: null }, { masterId: null }, { serviceId: null }, { client: null }]) {
      expect(canSave({ ...full, ...missing })).toBe(false)
      expect(draftBody({ ...full, ...missing })).toBeNull()
    }
  })

  it('sends the start as the venue\'s wall clock, never an instant', () => {
    const body = draftBody({ ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie, source: 'walk_in', staffNotes: '  Firm pressure ' })
    expect(body).toEqual({ client_id: 5, service_id: 3, master_id: 1, start: '2026-10-06T10:00', source: 'walk_in', staff_notes: 'Firm pressure' })
    expect(draftBody({ ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie })).not.toHaveProperty('staff_notes')
  })
})
