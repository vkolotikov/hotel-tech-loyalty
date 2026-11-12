import { describe, expect, it } from 'vitest'
import {
  bucketOf, completeBody, draftOf, dueParts, dueState, groupByDay, groupDone, groupOpen, ofType, openingTab, readView, searchTasks, storedCustom,
  splitBuckets, taskBody, tasksQuery, validateTask, venueClock, venueDay, wallToInstant, writeView, type Task,
} from './taskLogic'

const RIGA = 'Europe/Riga'
const task = (id: number, due_at: string | null, extra: Partial<Task> = {}): Task => ({
  id, type: 'call', title: `Task ${id}`, description: null, due_at, completed_at: null, outcome: null, inquiry_id: null,
  guest_id: null, assigned_to: 4, assignee: { id: 4, name: 'Anna' }, ...extra,
})

describe('the tab and scope in the address', () => {
  it('opens on Today and Mine, and writes only what differs', () => {
    expect(readView(new URLSearchParams(''))).toEqual({ tab: 'today', who: 'mine', page: 1, type: '' })
    expect(readView(new URLSearchParams('tab=done&who=all&page=3'))).toEqual({ tab: 'done', who: 'all', page: 3, type: '' })
    expect(readView(new URLSearchParams('tab=later&who=x')).tab).toBe('today')
    const sp = writeView({ tab: 'overdue', who: 'all', page: 1 }, new URLSearchParams('page=4&keep=1'))
    expect(sp.toString()).toBe('keep=1&tab=overdue&who=all')
    // A chosen Today is written too, so it is kept even when empty (round 5).
    expect(writeView({ tab: 'today', who: 'mine', page: 1 }).toString()).toBe('tab=today')
  })

  it('opens where the work is when the address names no tab (round 5)', () => {
    expect(openingTab('done', { today: 0, overdue: 6 })).toBe('done')
    expect(openingTab('today', { today: 0, overdue: 6 })).toBe('today')
    expect(openingTab(null, null)).toBe('today')
    expect(openingTab(null, { today: 2, overdue: 6 })).toBe('today')
    expect(openingTab(null, { today: 0, overdue: 6, upcoming: 1 })).toBe('overdue')
    expect(openingTab('', { today: 0, overdue: 0, upcoming: 1 })).toBe('upcoming')
    expect(openingTab('later', { today: 0, overdue: 0, upcoming: 0 })).toBe('today')
  })

  it('keeps a stored task\'s own fields, without what older drawers put there by mistake', () => {
    expect(storedCustom({ custom_data: { room: 'Suite 4', priority: 'high', duration_minutes: 30, recurring: 'weekly' } })).toEqual({ room: 'Suite 4' })
    expect(storedCustom({ custom_data: null })).toEqual({})
    expect(storedCustom(null)).toEqual({})
  })

  it('reads the open ones at once (mine by account id) and the done ones a page at a time', () => {
    expect(tasksQuery({ tab: 'today', who: 'mine', page: 2 }, 4)).toEqual({ status: 'open', assigned_to: 4, per_page: 200 })
    expect(tasksQuery({ tab: 'upcoming', who: 'all', page: 1 }, 4)).toEqual({ status: 'open', assigned_to: undefined, per_page: 200 })
    expect(tasksQuery({ tab: 'done', who: 'mine', page: 2 }, 4)).toEqual({ status: 'completed', assigned_to: 4, page: 2, per_page: 50 })
  })
})

describe('the venue\'s clock', () => {
  it('reads an instant as the venue\'s day and time', () => {
    // 22:30 UTC on 7 Nov is 00:30 on 8 Nov in Riga (UTC+2 in winter).
    expect(venueDay('2026-11-07T22:30:00.000000Z', RIGA)).toBe('2026-11-08')
    expect(venueClock('2026-11-07T22:30:00Z', RIGA)).toEqual({ date: '2026-11-08', time: '00:30' })
    expect(venueDay(null, RIGA)).toBeNull()
    expect(venueDay('nonsense', RIGA)).toBeNull()
  })

  it('turns the venue\'s date and time into the instant, in winter and in summer', () => {
    expect(wallToInstant('2026-11-07', '14:00', RIGA)).toBe('2026-11-07T12:00:00.000Z')
    expect(wallToInstant('2026-07-07', '14:00', RIGA)).toBe('2026-07-07T11:00:00.000Z')
    expect(wallToInstant('2026-11-07', '09:30', 'America/New_York')).toBe('2026-11-07T14:30:00.000Z')
    expect(wallToInstant('2026-11-07', '', RIGA)).toBe('2026-11-06T22:00:00.000Z')
    expect(wallToInstant('2026-11-7', '14:00', RIGA)).toBeNull()
  })

  it('round-trips a time across the clock changes, and moves a skipped time forward', () => {
    for (const [date, time] of [['2026-03-28', '23:30'], ['2026-03-29', '05:00'], ['2026-10-25', '05:00'], ['2026-10-24', '12:00']] as const) {
      expect(venueClock(wallToInstant(date, time, RIGA), RIGA)).toEqual({ date, time })
    }
    // Riga springs from 03:00 to 04:00 on 29 March 2026: 03:30 does not exist and reads as 04:30.
    expect(venueClock(wallToInstant('2026-03-29', '03:30', RIGA), RIGA)).toEqual({ date: '2026-03-29', time: '04:30' })
  })
})

describe('buckets on the venue\'s day', () => {
  const today = '2026-11-07'
  it('puts a task in overdue, today or upcoming by the venue\'s day, a done one in done', () => {
    expect(bucketOf(task(1, '2026-11-06T21:59:00Z'), today, RIGA)).toBe('overdue') // 23:59 on the 6th in Riga
    expect(bucketOf(task(2, '2026-11-06T22:00:00Z'), today, RIGA)).toBe('today') // 00:00 on the 7th
    expect(bucketOf(task(3, '2026-11-07T21:30:00Z'), today, RIGA)).toBe('today') // 23:30 on the 7th
    expect(bucketOf(task(4, '2026-11-07T22:00:00Z'), today, RIGA)).toBe('upcoming')
    expect(bucketOf(task(5, null), today, RIGA)).toBe('upcoming')
    expect(bucketOf(task(6, '2026-01-01T00:00:00Z', { completed_at: '2026-01-02T00:00:00Z' }), today, RIGA)).toBe('done')
  })

  it('sorts each bucket soonest first with the undated last', () => {
    const b = splitBuckets([task(1, null), task(2, '2026-11-09T10:00:00Z'), task(3, '2026-11-08T10:00:00Z'), task(4, '2026-11-05T10:00:00Z')], today, RIGA)
    expect(b.upcoming.map(t => t.id)).toEqual([3, 2, 1])
    expect(b.overdue.map(t => t.id)).toEqual([4])
    expect(b.today).toEqual([])
  })

  it('groups upcoming tasks by the venue\'s day, the undated last', () => {
    const groups = groupByDay([task(1, null), task(2, '2026-11-08T21:30:00Z'), task(3, '2026-11-08T08:00:00Z'), task(4, '2026-11-09T08:00:00Z')], RIGA)
    // 21:30 UTC on the 8th is 23:30 on the 8th in Riga: the same day as 08:00 UTC.
    expect(groups.map(g => [g.day, g.tasks.map(t => t.id)])).toEqual([['2026-11-08', [3, 2]], ['2026-11-09', [4]], [null, [1]]])
  })

  it('searches the title, the notes and who it is for', () => {
    const list = [task(1, null, { title: 'Call Ada' }), task(2, null, { description: 'about the wedding' }), task(3, null, { assignee: { id: 9, name: 'Ben' } })]
    expect(searchTasks(list, 'ada').map(t => t.id)).toEqual([1])
    expect(searchTasks(list, 'WEDDING').map(t => t.id)).toEqual([2])
    expect(searchTasks(list, 'ben').map(t => t.id)).toEqual([3])
    expect(searchTasks(list, ' ').map(t => t.id)).toEqual([1, 2, 3])
  })
})

describe('the task form', () => {
  it('starts a new task for the person (and the lead), an existing one on the venue\'s clock', () => {
    expect(draftOf(null, RIGA, { me: 4, inquiryId: 12 })).toMatchObject({ type: 'follow_up', assignee: 4, inquiryId: 12, date: '', time: '' })
    expect(draftOf(task(1, '2026-11-07T12:00:00.000000Z', { type: 'demo' }), RIGA, { me: 9 })).toMatchObject({ type: 'demo', date: '2026-11-07', time: '14:00', assignee: 4 })
    expect(draftOf(task(1, '2026-11-06T22:00:00Z', { type: 'something_else' }), RIGA, { me: 9 })).toMatchObject({ type: 'custom', date: '2026-11-07', time: '' })
  })

  it('needs a title, a valid day, and a day for a time', () => {
    const base = draftOf(null, RIGA, { me: 4 })
    expect(validateTask(base)).toEqual({ title: 'required' })
    expect(validateTask({ ...base, title: 'x'.repeat(201) })).toEqual({ title: 'too_long' })
    expect(validateTask({ ...base, title: 'Call', time: '10:00' })).toEqual({ time: 'needs_date' })
    expect(validateTask({ ...base, title: 'Call', date: '07.11.2026' })).toEqual({ date: 'invalid' })
    expect(validateTask({ ...base, title: 'Call', date: '2026-11-07', time: '10:00' })).toEqual({})
  })

  it('sends the due time as the instant the venue\'s clock reads, the lead only on a new task', () => {
    const draft = { ...draftOf(null, RIGA, { me: 4, inquiryId: 12 }), title: ' Call Ada ', date: '2026-11-07', time: '14:00' }
    expect(taskBody(draft, RIGA, true)).toEqual({
      type: 'follow_up', title: 'Call Ada', description: null, due_at: '2026-11-07T12:00:00.000Z', assigned_to: 4, inquiry_id: 12,
      priority: 'normal', duration_minutes: null, recurring_rule: null,
    })
    expect(taskBody(draft, RIGA, false)).not.toHaveProperty('inquiry_id')
    expect(taskBody({ ...draft, date: '', time: '' }, RIGA, true).due_at).toBeNull()
    expect(taskBody({ ...draft, time: '' }, RIGA, true).due_at).toBe('2026-11-06T22:00:00.000Z')
  })

  it('reads and sends the plan (priority, length, repeat), the title following the type when none is written', () => {
    const stored = task(1, '2026-11-07T12:00:00.000000Z', { type: 'call', priority: 'high', duration_minutes: 45, recurring_rule: { freq: 'weekly' } })
    const draft = draftOf(stored, RIGA, { me: 9 })
    expect(draft).toMatchObject({ priority: 'high', duration: 45, repeat: 'weekly', time: '14:00' })
    // A length without a start time, or a repeat without a day, is not kept.
    expect(draftOf({ ...stored, due_at: '2026-11-06T22:00:00Z' }, RIGA, { me: 9 })).toMatchObject({ time: '', duration: null, repeat: 'weekly' })
    expect(draftOf({ ...stored, due_at: null }, RIGA, { me: 9 })).toMatchObject({ date: '', duration: null, repeat: 'none' })

    const body = taskBody({ ...draft, title: '' }, RIGA, false, 'Call · Ada Lovelace')
    expect(body).toMatchObject({ title: 'Call · Ada Lovelace', priority: 'high', duration_minutes: 45, recurring_rule: { freq: 'weekly' } })
    expect(validateTask({ ...draft, title: '' }, 'Call · Ada Lovelace')).toEqual({})
  })

  it('trims an outcome to the server\'s 60 characters and offers quick days from the venue\'s today', () => {
    expect(completeBody(' ')).toEqual({})
    expect(completeBody('x'.repeat(70)).outcome).toHaveLength(60)
    expect(dueParts('2026-11-06T22:00:00Z', RIGA)).toEqual({ day: '2026-11-07', time: null })
    expect(dueParts('2026-11-07T12:15:00Z', RIGA)).toEqual({ day: '2026-11-07', time: '14:15' })
  })
})

describe('round 2: every open task by day, types and due states', () => {
  const today = '2026-11-07'
  it('reads the All open tab and a type from the address, and writes them back', () => {
    expect(readView(new URLSearchParams('tab=open&type=call'))).toMatchObject({ tab: 'open', type: 'call' })
    expect(readView(new URLSearchParams('type=juggling')).type).toBe('')
    expect(writeView({ tab: 'open', who: 'mine', page: 1, type: 'email' }).toString()).toBe('tab=open&type=email')
    expect(tasksQuery({ tab: 'open', who: 'mine', page: 1 }, 4)).toEqual({ status: 'open', assigned_to: 4, per_page: 200 })
  })

  it('keeps one type (an unknown one is Other)', () => {
    const list = [task(1, null, { type: 'call' }), task(2, null, { type: 'email' }), task(3, null, { type: 'juggling' })]
    expect(ofType(list, 'call').map(t => t.id)).toEqual([1])
    expect(ofType(list, 'custom').map(t => t.id)).toEqual([3])
    expect(ofType(list, '').map(t => t.id)).toEqual([1, 2, 3])
  })

  it('says how a due time reads on the venue\'s day', () => {
    expect(dueState(task(1, '2026-11-06T10:00:00Z'), today, RIGA)).toBe('overdue')
    expect(dueState(task(2, '2026-11-07T10:00:00Z'), today, RIGA)).toBe('today')
    expect(dueState(task(3, '2026-11-07T22:30:00Z'), today, RIGA)).toBe('tomorrow') // 00:30 on the 8th in Riga
    expect(dueState(task(4, '2026-11-12T10:00:00Z'), today, RIGA)).toBe('later')
    expect(dueState(task(5, null), today, RIGA)).toBe('none')
    expect(dueState(task(6, null, { completed_at: '2026-11-07T10:00:00Z' }), today, RIGA)).toBe('done')
  })

  it('groups every open task: overdue together, then today, tomorrow, each day, no day last', () => {
    const groups = groupOpen([
      task(1, null), task(2, '2026-11-09T08:00:00Z'), task(3, '2026-11-08T08:00:00Z'), task(4, '2026-11-01T08:00:00Z'),
      task(5, '2026-11-05T08:00:00Z'), task(6, '2026-11-07T08:00:00Z'),
    ], today, RIGA)
    expect(groups.map(g => [g.kind, g.day, g.tasks.map(t => t.id)])).toEqual([
      ['overdue', null, [4, 5]], ['today', today, [6]], ['tomorrow', '2026-11-08', [3]], ['day', '2026-11-09', [2]], ['none', null, [1]],
    ])
  })

  it('groups the done ones by the venue\'s day they were done, latest first', () => {
    const groups = groupDone([
      task(1, null, { completed_at: '2026-11-05T10:00:00Z' }), task(2, null, { completed_at: '2026-11-07T21:30:00Z' }), task(3, null, { completed_at: '2026-11-07T08:00:00Z' }),
    ], RIGA)
    expect(groups.map(g => [g.day, g.tasks.map(t => t.id)])).toEqual([['2026-11-07', [2, 3]], ['2026-11-05', [1]]])
  })
})

