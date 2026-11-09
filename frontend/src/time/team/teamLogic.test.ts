import { describe, expect, it } from 'vitest'
import type { Person } from '../lib/types'
import {
  canEditProfile, canSetSkills, choices, experienceRows, filterPeople, formOf, formProblem, hasChanges, hoursOf, loadBar,
  mayTake, mergePrefs, parsePrefs, profileBody, roleKind, sameSet, savePlan, skillsKind, skillsOf, teamFigures, teamTab,
  toggleIn, typeRoster, validateHours, workDays, type TeamForm,
} from './teamLogic'

function person(key: string, name: string, extra: Partial<Person> = {}, profile: Partial<Person['profile']> = {}): Person {
  const account = !key.startsWith('n:')
  return {
    key, user_id: account ? Number(key.slice(1)) : null, staff_id: account ? Number(key.slice(1)) + 100 : null, name,
    role: account ? 'staff' : null, department: null, manager: false, avatar_url: null, has_account: account,
    profile: { skills: null, knowledge: '', work_start: null, work_end: null, work_days: null, break_minutes: 0, ...profile },
    prefers: { groups: [], tasks: [] },
    experience: { done: 0, on_time: 0, groups: {} },
    today: { works: true, planned_minutes: 240, capacity_minutes: 480, load_pct: 50, window: { start: '09:00', end: '17:00' } },
    ...extra,
  }
}

const ANNA = person('u3', 'Anna Berzina', {
  department: 'Rooms',
  prefers: { groups: ['Housekeeping'], tasks: ['deep_clean'] },
  experience: { done: 14, on_time: 12, groups: { Housekeeping: { done: 10, on_time: 9, avg_minutes: 42 }, '—': { done: 4, on_time: 3, avg_minutes: 20 } } },
}, { skills: ['Housekeeping'], knowledge: 'Speaks Latvian and German', work_start: '08:00', work_end: '16:00', work_days: [1, 2, 3, 4, 5], break_minutes: 30 })
const BORIS = person('u9', 'Boris Ozols', {
  role: 'manager', manager: true,
  today: { works: true, planned_minutes: 540, capacity_minutes: 480, load_pct: 113, window: { start: '09:00', end: '18:00' } },
  experience: { done: 3, on_time: 3, groups: { Maintenance: { done: 3, on_time: 3, avg_minutes: 60 } } },
})
const CLEANER = person('n:Outside Cleaner', 'Outside Cleaner', { today: { works: false, planned_minutes: 0, capacity_minutes: 0, load_pct: null, window: { start: '09:00', end: '18:00' } } })

describe('reading a person', () => {
  it('reads the section from the address', () => {
    expect(teamTab(null)).toBe('people')
    expect(teamTab('types')).toBe('types')
    expect(teamTab('other')).toBe('people')
  })

  it('names the role, a name without an account apart', () => {
    expect(roleKind(ANNA)).toBe('staff')
    expect(roleKind(BORIS)).toBe('manager')
    expect(roleKind({ role: 'super_admin', has_account: true })).toBe('admin')
    expect(roleKind({ role: 'chef', has_account: true })).toBe('other')
    expect(roleKind(CLEANER)).toBe('none')
  })

  it('reads days and hours, the venue’s when the profile has none', () => {
    expect(workDays({ work_days: [5, 1, 3] })).toEqual([1, 3, 5])
    expect(workDays({ work_days: null })).toEqual([1, 2, 3, 4, 5, 6, 7])
    const venue = { start: '09:00', end: '18:00' }
    expect(hoursOf(ANNA.profile, venue)).toEqual({ start: '08:00', end: '16:00', own: true })
    expect(hoursOf(BORIS.profile, venue)).toEqual({ start: '09:00', end: '18:00', own: false })
  })

  it('reads the pool rule: managers and no list any type, an empty list nothing', () => {
    expect(skillsKind(BORIS)).toBe('manager')
    expect(skillsKind(CLEANER)).toBe('any')
    expect(skillsKind(person('u4', 'Dita', {}, { skills: [] }))).toBe('none')
    expect(skillsKind(ANNA)).toBe('some')
    expect(mayTake(ANNA, 'Housekeeping')).toBe(true)
    expect(mayTake(ANNA, 'Maintenance')).toBe(false)
    expect(mayTake(ANNA, null)).toBe(true)
    expect(mayTake(BORIS, 'Maintenance')).toBe(true)
  })

  it('draws today’s load, full at most, in its state', () => {
    expect(loadBar(ANNA.today)).toEqual({ pct: 50, width: 50, state: 'ok' })
    expect(loadBar(BORIS.today)).toEqual({ pct: 113, width: 100, state: 'over' })
    expect(loadBar(CLEANER.today)).toEqual({ pct: null, width: 0, state: 'none' })
    expect(loadBar(null)).toEqual({ pct: null, width: 0, state: 'none' })
  })

  it('lists the shown experience by type, the most done first, "—" as no type', () => {
    expect(experienceRows(ANNA.experience)).toEqual([
      { group: 'Housekeeping', done: 10, onTimePct: 90, avgMinutes: 42 },
      { group: null, done: 4, onTimePct: 75, avgMinutes: 20 },
    ])
  })
})

describe('the list', () => {
  const team = [ANNA, BORIS, CLEANER]

  it('finds people by name, department, knowledge, skills and preferred work', () => {
    expect(filterPeople(team, 'boris').map(p => p.key)).toEqual(['u9'])
    expect(filterPeople(team, 'rooms german').map(p => p.key)).toEqual(['u3'])
    expect(filterPeople(team, 'deep', { deep_clean: 'Deep clean' }).map(p => p.key)).toEqual(['u3'])
    expect(filterPeople(team, '')).toHaveLength(3)
  })

  it('counts the team today, its load read as the day board reads it', () => {
    // (240 + 540) of (480 + 480) planned; the cleaner is off.
    expect(teamFigures(team)).toEqual({ people: 3, accounts: 2, working: 2, load: 81, over: 1 })
    expect(teamFigures([]).load).toBeNull()
  })

  it('shows each type: who may take it, who prefers it and who has done most', () => {
    const [house, maint] = typeRoster(team, [{ name: 'Housekeeping', color: '#0ea5e9' }, { name: 'Maintenance', color: null }])
    expect(house.mayTake.map(p => p.key)).toEqual(['u3', 'u9', 'n:Outside Cleaner'])
    expect(house.everyone).toBe(true)
    expect(house.prefer.map(p => p.key)).toEqual(['u3'])
    expect(house.experienced.map(x => [x.person.key, x.done, x.onTimePct])).toEqual([['u3', 10, 90]])
    expect(maint.mayTake.map(p => p.key)).toEqual(['u9', 'n:Outside Cleaner'])
    expect(maint.everyone).toBe(false)
    expect(maint.experienced.map(x => x.person.key)).toEqual(['u9'])
  })
})

describe('the planner profile form', () => {
  const form = (extra: Partial<TeamForm> = {}): TeamForm => ({ ...formOf(ANNA), ...extra })

  it('starts from the person as they are', () => {
    expect(formOf(ANNA)).toEqual({
      knowledge: 'Speaks Latvian and German', work_start: '08:00', work_end: '16:00', days: [1, 2, 3, 4, 5], break_minutes: '30',
      any_type: false, skills: ['Housekeeping'], pref_groups: ['Housekeeping'], pref_tasks: ['deep_clean'],
    })
    expect(formOf(BORIS)).toMatchObject({ work_start: '', work_end: '', days: [1, 2, 3, 4, 5, 6, 7], any_type: true, skills: [] })
  })

  it('checks the hours: both or neither, and the end after the start', () => {
    expect(validateHours('', '')).toBeNull()
    expect(validateHours('08:00', '')).toBe('hours_both')
    expect(validateHours('', '16:00')).toBe('hours_both')
    expect(validateHours('16:00', '08:00')).toBe('hours_order')
    expect(validateHours('08:00', '08:00')).toBe('hours_order')
    expect(validateHours('08:00', '16:30')).toBeNull()
  })

  it('names the first problem, and none for a name without an account (only preferences)', () => {
    expect(formProblem(form(), 1000, ANNA)).toBeNull()
    expect(formProblem(form({ knowledge: 'x'.repeat(11) }), 10, ANNA)).toBe('knowledge')
    expect(formProblem(form({ work_end: '07:00' }), 1000, ANNA)).toBe('hours_order')
    expect(formProblem(form({ days: [] }), 1000, ANNA)).toBe('days')
    expect(formProblem(form({ break_minutes: '200' }), 1000, ANNA)).toBe('break')
    expect(formProblem(form({ break_minutes: '' }), 1000, ANNA)).toBe('break')
    expect(formProblem(form({ break_minutes: '12.5' }), 1000, ANNA)).toBe('break')
    expect(formProblem({ ...formOf(CLEANER), days: [] }, 1000, CLEANER)).toBeNull()
  })

  it('builds the profile body: empty hours and every day as null, days in order', () => {
    expect(profileBody(form({ knowledge: '  First aid  ', work_start: '', work_end: '', days: [7, 1, 3, 3], break_minutes: '45' }))).toEqual({
      knowledge: 'First aid', work_start: null, work_end: null, work_days: [1, 3, 7], break_minutes: 45,
    })
    expect(profileBody(form({ days: [1, 2, 3, 4, 5, 6, 7] })).work_days).toBeNull()
  })

  it('sends skills as null for any type, else the ticked ones (none is a list too)', () => {
    expect(skillsOf({ any_type: true, skills: ['Garden'] })).toBeNull()
    expect(skillsOf({ any_type: false, skills: [] })).toEqual([])
    expect(skillsOf({ any_type: false, skills: ['Garden', 'Garden'] })).toEqual(['Garden'])
  })

  it('knows who can have what: a profile needs an account, skills a staff member who is not a manager', () => {
    expect(canEditProfile(ANNA)).toBe(true)
    expect(canEditProfile(CLEANER)).toBe(false)
    expect(canSetSkills(ANNA)).toBe(true)
    expect(canSetSkills(BORIS)).toBe(false)
    expect(canSetSkills(CLEANER)).toBe(false)
  })

  it('plans only the writes that changed', () => {
    expect(hasChanges(savePlan(ANNA, form()))).toBe(false)
    // The same days in another order are no change.
    expect(savePlan(ANNA, form({ days: [5, 4, 3, 2, 1] })).profile).toBeNull()

    const hours = savePlan(ANNA, form({ work_start: '', work_end: '' }))
    expect(hours.profile).toMatchObject({ work_start: null, work_end: null })
    expect(hours.skills).toBeNull()
    expect(hours.prefs).toBeNull()

    expect(savePlan(ANNA, form({ any_type: true })).skills).toEqual({ staffId: 103, skills: null })
    expect(savePlan(ANNA, form({ skills: [] })).skills).toEqual({ staffId: 103, skills: [] })
    expect(savePlan(ANNA, form({ pref_tasks: [] })).prefs).toEqual({ groups: ['Housekeeping'], tasks: [] })

    // A manager's skills are never written; a name without an account gets only its preferences.
    expect(savePlan(BORIS, { ...formOf(BORIS), any_type: false, skills: ['Garden'] }).skills).toBeNull()
    const cleaner = savePlan(CLEANER, { ...formOf(CLEANER), knowledge: 'Windows', pref_groups: ['Housekeeping'] })
    expect(cleaner).toEqual({ profile: null, skills: null, prefs: { groups: ['Housekeeping'], tasks: [] } })
  })
})

describe('preferred work', () => {
  it('reads the setting as JSON text or an object, anything else as empty', () => {
    const map = { 'Anna Berzina': { groups: ['Housekeeping'], tasks: ['deep_clean'] }, Bad: 'x', 'Boris Ozols': { groups: 'no' } }
    expect(parsePrefs(JSON.stringify(map))).toEqual({ 'Anna Berzina': { groups: ['Housekeeping'], tasks: ['deep_clean'] }, 'Boris Ozols': { groups: [], tasks: [] } })
    expect(parsePrefs(map)).toEqual(parsePrefs(JSON.stringify(map)))
    expect(parsePrefs('not json')).toEqual({})
    expect(parsePrefs(['a'])).toEqual({})
    expect(parsePrefs(null)).toEqual({})
  })

  it('changes only this person’s entry, and removes it when both lists are empty', () => {
    const map = { 'Anna Berzina': { groups: ['Housekeeping'], tasks: [] }, 'Boris Ozols': { groups: ['Maintenance'], tasks: [] } }
    expect(mergePrefs(map, 'Anna Berzina', ['Garden', 'Garden'], ['mow'])).toEqual({
      'Anna Berzina': { groups: ['Garden'], tasks: ['mow'] }, 'Boris Ozols': { groups: ['Maintenance'], tasks: [] },
    })
    expect(mergePrefs(map, 'Anna Berzina', [], [])).toEqual({ 'Boris Ozols': { groups: ['Maintenance'], tasks: [] } })
    expect(mergePrefs({}, 'Dita', ['Garden'], [])).toEqual({ Dita: { groups: ['Garden'], tasks: [] } })
    // The map it was given stays as it was.
    expect(map['Anna Berzina'].groups).toEqual(['Housekeeping'])
  })
})

describe('small helpers', () => {
  it('toggles a value in a list', () => {
    expect(toggleIn([1, 2], 3)).toEqual([1, 2, 3])
    expect(toggleIn([1, 2, 3], 2)).toEqual([1, 3])
  })

  it('offers the known choices, then any the person still has', () => {
    expect(choices(['Housekeeping', 'Garden'], ['Garden', 'Old type'])).toEqual(['Housekeeping', 'Garden', 'Old type'])
  })

  it('compares lists as sets', () => {
    expect(sameSet([1, 2], [2, 1])).toBe(true)
    expect(sameSet(['a'], ['a', 'b'])).toBe(false)
  })
})
