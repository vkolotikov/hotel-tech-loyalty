import { describe, expect, it } from 'vitest'
import {
  canUseSuggested, coachTab, driftTone, durationBars, figuresOf, gaps, knowledgeProblem, mergeNotes, minutesValue, personDraftBody, readinessState, readinessWhere, speedPct,
  taskEntry, taskRows, typeEntry, typeRows, typicalWrite, weeksOf, withTaskDraft, withTypeDraft,
} from './coachLogic'
import {
  applyProgress, blocks, blocksLength, cutBlocks, dayLink, followUps, historyFor, pending, proposalText, questionOf, sourcesOf, suggestions, type ChatMessage,
} from '../assistant/assistantLogic'
import type { AssistantProposal } from '../lib/types'

describe('the AI coach', () => {
  it('keeps teaching the AI a manager’s section and reads the learning window', () => {
    expect(coachTab('knowledge', true)).toBe('knowledge')
    expect(coachTab('knowledge', false)).toBe('overview')
    expect(coachTab('nonsense', true)).toBe('overview')
    expect(coachTab('people', false)).toBe('people')
    expect(weeksOf('12')).toBe(12)
    expect(weeksOf('5')).toBe(8)
    expect(weeksOf(null)).toBe(8)
  })

  it('shows a manager the team’s figures and anyone else their own', () => {
    const totals = { tasks: 40, done: 30, on_time_pct: 80, late_open: 3, clocked: 12, clocked_pct: 40, accuracy_pct: 110 }
    const mine = { person: 'u3', name: 'Anna', has_account: true, tasks: 10, done: 8, on_time_pct: 75, completion_pct: 80, late_open: 1, clocked: 2, accuracy_pct: 95, types: [], strengths: [], support: [] }
    const learning = { from: '', to: '', weeks: 8, totals, types: [], tasks: [], people: [mine], leaders: [] }
    expect(figuresOf({ learning }, true)).toBe(totals)
    expect(figuresOf({ learning }, false)).toEqual({ tasks: 10, done: 8, on_time_pct: 75, late_open: 1, clocked: 2, clocked_pct: 25, accuracy_pct: 95 })
    expect(figuresOf({ learning: { ...learning, people: [] } }, false).done).toBe(0)
  })

  it('offers the furthest-behind gaps first, each where it is filled', () => {
    const items = [{ code: 'about', pct: 100 }, { code: 'history', pct: 40 }, { code: 'skills', pct: 0 }, { code: 'rules', pct: 0 }]
    expect(gaps(items).map(i => i.code)).toEqual(['rules', 'skills', 'history'])
    expect(readinessWhere('rules')).toBe('knowledge')
    expect(readinessWhere('hours')).toBe('team')
    expect(readinessWhere('clocked')).toBeNull()
    expect([readinessState(20), readinessState(50), readinessState(80)]).toEqual(['low', 'mid', 'high'])
  })

  it('colours a drift of a fifth either way and offers a suggestion only when there is something new to write down', () => {
    expect([driftTone(null), driftTone(125), driftTone(75), driftTone(100)]).toEqual(['none', 'over', 'under', 'ok'])
    expect(canUseSuggested({ suggested: 45, typical: null, advice: 'set_typical' })).toBe(true)
    expect(canUseSuggested({ suggested: 45, typical: 45, advice: 'ok' })).toBe(false)
    expect(canUseSuggested({ suggested: 45, typical: null, advice: 'few' })).toBe(false)
    expect(canUseSuggested({ suggested: null, typical: null, advice: 'ok' })).toBe(false)
    expect([speedPct(1.2), speedPct(0.8), speedPct(null)]).toEqual([20, -20, null])
  })

  it('draws planned against real, each bar against the longer of the two', () => {
    expect(durationBars({ planned_median: 60, real_median: 90 })).toEqual({ planned: 67, real: 100 })
    expect(durationBars({ planned_median: 90, real_median: 60 })).toEqual({ planned: 100, real: 67 })
    expect(durationBars({ planned_median: 45, real_median: null })).toEqual({ planned: 100, real: null })
    expect(durationBars({ planned_median: null, real_median: null })).toEqual({ planned: 0, real: null })
  })

  it('builds the editor’s rows from the settings and writes back only what a row says', () => {
    const types = typeRows([{ name: 'Cleaning', icon: null, color: '#00f' }, { name: 'Desk', icon: null, color: null }],
      { Cleaning: { notes: 'Rooms first', typical_minutes: 40, best_time: 'morning' } })
    expect(types).toEqual([
      { type: 'Cleaning', color: '#00f', notes: 'Rooms first', minutes: '40', best_time: 'morning' },
      { type: 'Desk', color: null, notes: '', minutes: '', best_time: '' },
    ])
    expect(typeEntry(types[0])).toEqual({ notes: 'Rooms first', typical_minutes: 40, best_time: 'morning' })
    expect(typeEntry(types[1])).toBeNull()
    const tasks = taskRows([{ key: 'room', label: 'Room', icon: 'bed', color: '#0f0', groups: ['Cleaning'] }], {})
    expect(taskEntry({ ...tasks[0], minutes: '25' })).toEqual({ notes: '', typical_minutes: 25 })
  })

  it('checks lengths and texts before saving', () => {
    const context = { about: '', rules: '', goals: '' }
    const row = { type: 'Cleaning', color: null, notes: '', minutes: '', best_time: '' }
    expect([minutesValue(''), minutesValue('30'), minutesValue('3'), minutesValue('7.5'), minutesValue('721')]).toEqual([null, 30, undefined, undefined, undefined])
    expect(knowledgeProblem(context, [row], [])).toBeNull()
    expect(knowledgeProblem(context, [{ ...row, minutes: '1000' }], [])).toBe('minutes')
    expect(knowledgeProblem({ ...context, goals: 'x'.repeat(1001) }, [row], [])).toBe('goals')
    expect(knowledgeProblem(context, [{ ...row, notes: 'x'.repeat(601) }], [])).toBe('note')
  })

  it('saves over the notes as they are now: touched rows set or removed, the rest kept', () => {
    const fresh = { A: { notes: 'a', typical_minutes: 10 }, B: { notes: 'b', typical_minutes: null } }
    expect(mergeNotes(fresh, { A: null, C: { notes: 'c', typical_minutes: 5 } })).toEqual({ B: fresh.B, C: { notes: 'c', typical_minutes: 5 } })
  })

  it('writes a typical-length fix into the right map, keeping the rest of the entry', () => {
    const types = { Cleaning: { notes: 'Rooms first', typical_minutes: 30, best_time: 'morning' } }
    expect(typicalWrite({ type_name: 'Cleaning', minutes: 45 }, types, {})).toEqual({
      key: 'planner_type_notes', value: { Cleaning: { notes: 'Rooms first', typical_minutes: 45, best_time: 'morning' } },
    })
    expect(typicalWrite({ task_key: 'room', minutes: 25 }, types, {})).toEqual({ key: 'planner_task_notes', value: { room: { notes: '', typical_minutes: 25 } } })
    expect(typicalWrite({ type_name: 'Cleaning', minutes: 2 }, types, {})).toBeNull()
  })

  it('takes from a draft only what the AI wrote', () => {
    expect(personDraftBody({ job_title: ' Receptionist ', knowledge: '', strengths: 'Calm', develop: ' ' })).toEqual({ job_title: 'Receptionist', strengths: 'Calm' })
    const row = { type: 'Desk', color: null, notes: 'Keep', minutes: '20', best_time: 'any' }
    expect(withTypeDraft(row, { notes: '', typical_minutes: 30, best_time: null })).toEqual({ ...row, minutes: '30' })
    const task = { key: 'k', label: 'K', color: '#000', groups: [], notes: '', minutes: '' }
    expect(withTaskDraft(task, { notes: 'New', typical_minutes: null })).toEqual({ ...task, notes: 'New' })
  })
})

describe('the AI assistant', () => {
  const msg = (role: 'user' | 'assistant', content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: content, role, content, ...extra })

  it('sends the last messages, starting with the person’s', () => {
    const list = [msg('assistant', 'kept reply'), msg('user', 'q1'), msg('assistant', 'a1'), msg('user', '  q2  '), msg('user', ' ')]
    expect(historyFor(list)).toEqual([{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }])
    expect(historyFor([msg('assistant', 'only')])).toEqual([])
  })

  it('offers a manager the team’s questions and anyone else their own', () => {
    expect(suggestions(true, true, 'Cleaning')).toContain('best_at')
    expect(suggestions(true, true, null)).not.toContain('best_at')
    expect(suggestions(false, false, null)[0]).toBe('plan_my_day')
    expect(suggestions(false, true, null)[0]).toBe('plan_tomorrow_team')
  })

  it('words a proposal and knows which are still to apply', () => {
    const t = ((_key: string, fallback: string, vars: Record<string, unknown> = {}) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''))) as never
    const p: AssistantProposal = { id: 'p1', kind: 'create', title: 'Fix lamp', person: { key: 'u2', name: 'Boris' }, date: null, minutes: 30, request: { method: 'post', path: 'planner/tasks', body: {} } }
    expect(proposalText(t, p, 'en', { h: 'h', min: 'min' })).toBe('Add “Fix lamp” for Boris without a day (30 min)')
    const move: AssistantProposal = { id: 'p2', kind: 'move', title: 'Fix lamp', date: null, request: { method: 'patch', path: 'planner/tasks/1/move', body: {} } }
    expect(proposalText(t, move, 'en', { h: 'h', min: 'min' })).toBe('Move “Fix lamp” back to the backlog')
    expect(pending(msg('assistant', 'x', { proposals: [p, move], outcome: { p1: 'done' } })).map(x => x.id)).toEqual(['p2'])
  })

  it('writes an answer out as blocks cut where the writing has got to', () => {
    const all = blocks('Plan:\n- Anna: rooms\n- Boris: desk\nDone.')
    expect(blocksLength(all)).toBe(5 + 11 + 11 + 5)
    expect(cutBlocks(all, 0)).toEqual([])
    expect(cutBlocks(all, 3)).toEqual([{ kind: 'p', text: 'Pla' }])
    expect(cutBlocks(all, 5 + 4)).toEqual([{ kind: 'p', text: 'Plan:' }, { kind: 'ul', items: ['Anna'] }])
    expect(cutBlocks(all, 5 + 11 + 2)).toEqual([{ kind: 'p', text: 'Plan:' }, { kind: 'ul', items: ['Anna: rooms', 'Bo'] }])
    expect(cutBlocks(all, 999)).toEqual(all)
  })

  it('names what an answer looked at, offers what to ask next, and knows where a change is seen', () => {
    expect(sourcesOf(['propose_changes', 'get_people', 'get_pool', 'get_pool', 'unknown'])).toEqual(['get_pool', 'get_people'])
    expect(sourcesOf(undefined)).toEqual([])
    const withChanges = msg('assistant', 'x', { proposals: [{ id: 'p', kind: 'move', title: 'T', request: { method: 'patch', path: 'planner/tasks/1/move', body: {} } }] })
    expect(followUps(withChanges)).toEqual(['why', 'other'])
    expect(followUps(msg('assistant', 'x'))).toEqual(['plan_it'])
    expect(followUps(msg('user', 'x'))).toEqual([])
    expect(dayLink({ date: '2026-11-29' })).toBe('/time/plan?date=2026-11-29')
    expect(dayLink({ date: null })).toBeNull()
  })

  it('takes a question from the address, and says how far an apply has got', () => {
    expect(questionOf(new URLSearchParams('q=%20who%20is%20free%3F%20'))).toBe('who is free?')
    expect(questionOf(new URLSearchParams('q=a'))).toBeNull()
    expect(questionOf(new URLSearchParams(''))).toBeNull()
    expect(applyProgress(null)).toBeNull()
    expect(applyProgress({ ids: ['a', 'b', 'c'], at: 'b' })).toEqual([1, 3])
    expect(applyProgress({ ids: ['a', 'b'], at: null })).toEqual([0, 2])
  })

  it('reads a reply as paragraphs and lists, with no markup', () => {
    expect(blocks('## Plan\n- **Anna**: rooms\n- Boris: desk\n\nDone.')).toEqual([
      { kind: 'p', text: 'Plan' }, { kind: 'ul', items: ['Anna: rooms', 'Boris: desk'] }, { kind: 'p', text: 'Done.' },
    ])
  })
})
