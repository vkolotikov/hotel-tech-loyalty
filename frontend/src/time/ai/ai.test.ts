import { describe, expect, it } from 'vitest'
import type { CaptureDraft } from '../lib/types'
import { bodyOf, rowsOf, savable } from './captureLogic'
import { appendWords, audioFileName, elapsed, recorderMime, voiceFailure } from './voice'
import { partOfDay, progressOf, untimed, weekHeights } from '../today/todayLogic'

const draft = (extra: Partial<CaptureDraft> = {}): CaptureDraft => ({
  title: 'Deep clean 204', task_date: '2026-11-05', start_time: '10:00', duration_minutes: 90, estimated: false, priority: 'High',
  task_group: 'Housekeeping', task_category: 'Deep clean', person: 'u7', assigned_to_user_id: 7, employee_name: 'Anna Berzina',
  person_named: null, description: null, subtasks: [], ...extra,
})

describe('AI capture', () => {
  it('turns a checked draft into the planner’s task, its person by account and name', () => {
    expect(bodyOf(rowsOf([draft()])[0], { user_id: 7, name: 'Anna Berzina' })).toEqual({
      title: 'Deep clean 204', task_date: '2026-11-05', start_time: '10:00', end_time: '11:30', duration_minutes: 90, priority: 'High',
      task_group: 'Housekeeping', task_category: 'Deep clean', description: null, assigned_to_user_id: 7, employee_name: 'Anna Berzina',
    })
  })

  it('sends a draft with no day and nobody to the pool, and no start without a day', () => {
    const body = bodyOf({ ...draft({ task_date: null, start_time: '10:00' }), keep: true }, null)
    expect(body).toMatchObject({ task_date: null, start_time: null, pool_horizon: 'general', assigned_to_user_id: null })
  })

  it('saves only the kept drafts with a title', () => {
    const rows = rowsOf([draft(), draft({ title: '  ' }), draft({ title: 'Kept out' })])
    rows[2].keep = false
    expect(savable(rows).map(r => r.title)).toEqual(['Deep clean 204'])
  })
})

describe('voice', () => {
  it('picks a format the browser records, and names the file after it', () => {
    expect(recorderMime(m => m === 'audio/mp4')).toBe('audio/mp4')
    expect(recorderMime(() => false)).toBe('')
    expect(audioFileName('audio/webm;codecs=opus')).toBe('voice-note.webm')
    expect(audioFileName('audio/mp4')).toBe('voice-note.mp4')
  })

  it('reads a failure, appends dictation and shows the time', () => {
    expect(voiceFailure(503, 'x')).toBe('off')
    expect(voiceFailure(502, 'transcription_failed')).toBe('failed')
    expect(appendWords('First', ' second ')).toBe('First\nsecond')
    expect(appendWords('', 'only')).toBe('only')
    expect(elapsed(75)).toBe('1:15')
  })
})

describe('my day', () => {
  it('greets by the venue’s clock', () => {
    expect(partOfDay('08:10')).toBe('morning')
    expect(partOfDay('12:00')).toBe('afternoon')
    expect(partOfDay('19:30')).toBe('evening')
  })

  it('counts progress, lists the untimed and scales the week', () => {
    const me = { tasks: [{ id: 1, done: true, start_time: '09:00', priority_rank: 1 }, { id: 2, done: false, start_time: null, priority_rank: 2 }, { id: 3, done: false, start_time: null, priority_rank: 0 }], load_pct: 75 } as never
    expect(progressOf(me)).toEqual({ done: 1, total: 3, donePct: 33, loadPct: 75 })
    expect(untimed(me).map((t: { id: number }) => t.id)).toEqual([3, 2])
    expect(progressOf(null)).toEqual({ done: 0, total: 0, donePct: null, loadPct: null })
    expect(weekHeights([{ minutes: 240 }, { minutes: 480 }, { minutes: 0 }])).toEqual([50, 100, 0])
  })
})
