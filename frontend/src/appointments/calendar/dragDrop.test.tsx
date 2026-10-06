import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppointmentSummary, CalendarMaster, Status } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { TimeGrid } = await import('./TimeGrid')
const { DragPreview } = await import('./DragPreview')
const { DropConfirm } = await import('./DropConfirm')
const { focusDialog } = await import('./focusDialog')
const { columnsFor } = await import('./calendarState')
const { releasedDrop, installTouchGuard } = await import('./useCardDrag')
const { pinnedColumnIndex, samePlace } = await import('./dragMath')
const { claimEscape, panelClosesOn, dropNotify, lengthNote } = await import('./dropDialog')

const emma: CalendarMaster = { id: 1, name: 'Emma', title: null, avatar: null, days: { '2026-10-06': { windows: [{ start: '09:00', end: '17:00' }], time_off: [] } } }
const appt = (id: number, start: string, end: string, status: Status): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end, duration_minutes: 45, service: { id: 1, name: 'Haircut' }, master: { id: 1, name: 'Emma' },
  client: { id: 5, name: 'Sophie', is_member: false }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})
const grid = (appointments: AppointmentSummary[], onDrop?: () => Promise<void>) => renderToStaticMarkup(
  <TimeGrid columns={columnsFor('day', '2026-10-06', [emma], null, '2026-10-06', 'en-GB')} appointments={appointments}
    now={{ date: '2026-10-06', minutes: 600 }} today="2026-10-06" selectedId={null} onSlot={() => {}} onOpen={() => {}} onDrop={onDrop} />,
)

describe('drag and resize on the grid', () => {
  it('lets live cards be dragged and stretched, only when the grid can save a drop', () => {
    const cards = [appt(1, '2026-10-06T10:00', '2026-10-06T10:45', 'confirmed'), appt(2, '2026-10-06T12:00', '2026-10-06T12:45', 'completed')]
    const html = grid(cards, async () => {})
    expect(html.match(/data-drag="move"/g)).toHaveLength(1)
    expect(html.match(/data-resize=""/g)).toHaveLength(1)
    expect(html).toContain('data-col="0"')
    expect(grid(cards)).not.toContain('data-drag')
  })

  it('previews the new place and says why it will not do', () => {
    const html = renderToStaticMarkup(<DragPreview top={10} height={54} label="Tue 14:30–15:15 · Emma" why="Outside Emma's hours" />)
    expect(html).toContain('Tue 14:30–15:15 · Emma')
    expect(html).toContain('Outside Emma')
  })

  it('asks before saving, with the client box only for a move, and shows a refusal', () => {
    const base = { onTell: () => {}, saving: false, onSave: () => {}, onCancel: () => {} }
    const move = renderToStaticMarkup(<DropConfirm {...base} title="Move Sophie to Tue 6 Oct 14:30 with Emma?" tell={{ email: 'sophie@example.test', checked: true, loading: false }} error={null} />)
    expect(move).toContain('Move Sophie to Tue 6 Oct 14:30 with Emma?')
    expect(move).toContain('Tell the client by email (sophie@example.test)')
    expect(move).toContain('Save')
    expect(move).toContain('Cancel')
    const resize = renderToStaticMarkup(<DropConfirm {...base} title="Make it 10:00–11:30?" tell={null} error={null} />)
    expect(resize).not.toContain('Tell the client')
    const refused = renderToStaticMarkup(<DropConfirm {...base} title="Make it 10:00–11:30?" tell={null} error={{ code: 'slot_taken', message: 'That time is not free for Emma. Choose another.' }} />)
    expect(refused).toContain('That time is not free for Emma')
  })
})

describe('a drop waiting for its Save', () => {
  const anna: CalendarMaster = { ...emma, id: 2, name: 'Anna' }
  const day = (date: string, masters = [emma, anna]) => columnsFor('day', date, masters, null, '2026-10-06', 'en-GB')
  const origin = { appt: appt(1, '2026-10-06T10:00', '2026-10-06T10:45', 'confirmed'), colIndex: 0, start: 600, length: 45 }

  it('keeps the column it was dropped on, not a position in the row', () => {
    const state = releasedDrop('move', origin, { colIndex: 1, start: 870, length: 45, why: null }, day('2026-10-06'))
    expect(state?.phase).toBe('confirming')
    expect(state?.column?.master.id).toBe(2)
    expect(state?.column?.date).toBe('2026-10-06')
    expect(releasedDrop('move', origin, { colIndex: 0, start: 600, length: 45, why: null }, day('2026-10-06'))).toBeNull()
    expect(releasedDrop('move', origin, { colIndex: 1, start: 870, length: 45, why: { reason: 'overlap' } }, day('2026-10-06'))).toBeNull()
  })

  it('follows that person and day when the columns change, and is gone with them', () => {
    const pinned = day('2026-10-06')[1]
    expect(pinnedColumnIndex(day('2026-10-06', [anna, emma]), pinned)).toBe(0)
    expect(pinnedColumnIndex(day('2026-10-07'), pinned)).toBe(-1)
    expect(pinnedColumnIndex(day('2026-10-06', [emma]), pinned)).toBe(-1)
  })
})

describe('touch on a card', () => {
  const fire = (target: EventTarget, type: string) => {
    const e = new Event(type, { cancelable: true })
    target.dispatchEvent(e)
    return e.defaultPrevented
  }

  it('holds the page still only while a card is dragged, with one listener there from the start', () => {
    const target = new EventTarget()
    let state: 'idle' | 'pressing' | 'dragging' = 'idle'
    const off = installTouchGuard(target, () => state)
    expect(fire(target, 'touchmove')).toBe(false)
    expect(fire(target, 'contextmenu')).toBe(false)
    state = 'pressing'
    expect(fire(target, 'touchmove')).toBe(false) // a swipe still scrolls
    expect(fire(target, 'contextmenu')).toBe(true) // no long-press menu over a card
    state = 'dragging'
    expect(fire(target, 'touchmove')).toBe(true)
    off()
    expect(fire(target, 'touchmove')).toBe(false)
  })
})

describe('the drop dialog and the focus', () => {
  it('focuses the dialog itself, brings it into view, and gives the focus back on close', () => {
    const calls: string[] = []
    const box = { focus: () => { calls.push('box.focus') }, scrollIntoView: () => { calls.push('box.scroll') } }
    const restore = focusDialog(box, { isConnected: true, focus: () => { calls.push('card.focus') } })
    expect(calls).toEqual(['box.focus', 'box.scroll'])
    restore()
    expect(calls).toEqual(['box.focus', 'box.scroll', 'card.focus'])
    focusDialog(box, { isConnected: false, focus: () => { calls.push('gone.focus') } })()
    expect(calls).not.toContain('gone.focus')
  })

  it('can take the focus while Save waits for the client details', () => {
    const html = renderToStaticMarkup(<DropConfirm title="Move Sophie?" tell={{ email: null, checked: true, loading: true }}
      onTell={() => {}} saving={false} error={null} onSave={() => {}} onCancel={() => {}} />)
    expect(html).toMatch(/<div[^>]*role="dialog"[^>]*tabindex="-1"/)
  })
})

const keyEvent = (key: string) => ({ key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } })
const drop = (props: Partial<Parameters<typeof DropConfirm>[0]>) => renderToStaticMarkup(
  <DropConfirm title="Move Sophie?" tell={null} onTell={() => {}} saving={false} error={null} onSave={() => {}} onCancel={() => {}} {...props} />,
)

describe('polish: the drag and the drop dialog', () => {
  it('claims Escape so an open panel stays, and never cancels a save in flight (F1)', () => {
    const calls: string[] = []
    const e = keyEvent('Escape')
    claimEscape(e, () => calls.push('cancel'))
    expect(e.defaultPrevented).toBe(true)
    expect(calls).toEqual(['cancel'])
    expect(panelClosesOn(e)).toBe(false)
    const busy = keyEvent('Escape')
    claimEscape(busy, () => calls.push('cancel'), true)
    expect(busy.defaultPrevented).toBe(true)
    expect(calls).toEqual(['cancel'])
    const other = keyEvent('Enter')
    claimEscape(other, () => calls.push('enter'))
    expect(other.defaultPrevented).toBe(false)
    expect(panelClosesOn(keyEvent('Escape'))).toBe(true)
  })

  it('after someone else changed it, says what happened and offers only Close (F2)', () => {
    const html = drop({ error: { code: 'stale', message: 'Someone else changed this appointment. The current details are shown.' } })
    expect(html).toContain('Someone changed this appointment meanwhile. The calendar now shows it as it is.')
    expect(html).not.toContain('The current details are shown')
    expect(html).not.toContain('Save</button>')
    expect(html).toContain('Close</button>')
  })

  it('redraws only when the snapped place changes (F5)', () => {
    const a = { colIndex: 1, start: 600, length: 45, why: null }
    const other = appt(9, '2026-10-06T10:00', '2026-10-06T10:45', 'confirmed')
    expect(samePlace(a, { ...a })).toBe(true)
    expect(samePlace(a, { ...a, start: 615 })).toBe(false)
    expect(samePlace(a, { ...a, colIndex: 2 })).toBe(false)
    expect(samePlace(a, { ...a, why: { reason: 'overlap' } })).toBe(false)
    expect(samePlace({ ...a, why: { reason: 'overlap', other } }, { ...a, why: { reason: 'overlap', other: { ...other, id: 10 } } })).toBe(false)
    expect(samePlace({ ...a, why: { reason: 'overlap', other } }, { ...a, why: { reason: 'overlap', other } })).toBe(true)
  })

  it('says the length becomes the new person’s own when staff never set one (F7)', () => {
    expect(lengthNote({ moving: true, from: 1, to: 2, lengthSetByStaff: false })).toBe(true)
    expect(lengthNote({ moving: true, from: 1, to: 2, lengthSetByStaff: true })).toBe(false)
    expect(lengthNote({ moving: true, from: 1, to: 1, lengthSetByStaff: false })).toBe(false)
    expect(lengthNote({ moving: false, from: 1, to: 2, lengthSetByStaff: false })).toBe(false)
    expect(lengthNote({ moving: true, from: 1, to: 2, lengthSetByStaff: undefined })).toBe(false) // details not loaded yet
    expect(drop({ note: "The length becomes Anna's normal length for this service." })).toContain('The length becomes Anna&#x27;s normal length for this service.') // React escapes the apostrophe
  })

  it('reads the arrow-key hint on the stop that takes the focus, not on the grid (F8)', () => {
    const html = grid([appt(1, '2026-10-06T10:00', '2026-10-06T10:45', 'confirmed')], async () => {})
    expect(html).not.toMatch(/<div class="flex"[^>]*aria-describedby/)
    const stop = html.match(/<[a-z]+[^>]*tabindex="0"[^>]*>/)?.[0] ?? ''
    expect(stop).toContain('aria-describedby="calendar-keys-hint"')
  })

  it('tells nobody, and says so, when the client’s details did not load (F9)', () => {
    const html = drop({ tell: { email: null, checked: true, loading: false, failed: true } })
    expect(html).toContain('The client&#x27;s details could not be loaded, so they will not be told.') // React escapes the apostrophe
    expect(html).not.toContain('type="checkbox"')
    expect(dropNotify({ moving: true, tell: true, detailsFailed: true })).toBe(false)
    expect(dropNotify({ moving: true, tell: true, detailsFailed: false })).toBe(true)
    expect(dropNotify({ moving: true, tell: false, detailsFailed: false })).toBe(false)
    expect(dropNotify({ moving: false, tell: true, detailsFailed: false })).toBe(false)
  })
})
