import { describe, expect, it } from 'vitest'
import { choosable, mayChange, mayDrop, mayGive, meOf, rightsOf } from './rights'
import { settingBody } from './tasks'
import type { Bootstrap } from './types'

const can = { plan_team: false, edit_people: false, team_buckets: false, manage_settings: false, manage_templates: true }
const staff = (planTeam: boolean): Pick<Bootstrap, 'staff'> => ({ staff: { id: 4, key: 'u4', name: 'Sam Staff', role: 'staff', can: { ...can, plan_team: planTeam } } })
const PEOPLE = [{ key: 'u4', name: 'Sam Staff' }, { key: 'u5', name: 'Anna Berzina' }, { key: 'n:Outside Cleaner', name: 'Outside Cleaner' }]

describe('who may put work on whose day (the planning mode, mirrored from the server)', () => {
  it('lets anyone change and give anyone\'s work when they may plan for the team', () => {
    const r = rightsOf(staff(true))
    expect(r).toEqual({ me: 'u4', others: true })
    expect(mayChange(r, { owner: 'u5' })).toBe(true)
    expect(mayGive(r, 'u5')).toBe(true)
    expect(mayDrop(r, { owner: 'u5' }, 'n:Outside Cleaner')).toBe(true)
    expect(choosable(r, PEOPLE).map(p => p.key)).toEqual(['u4', 'u5', 'n:Outside Cleaner'])
  })

  it('keeps a person who plans only their own day to their own and unassigned work', () => {
    const r = rightsOf(staff(false))
    expect(mayChange(r, { owner: 'u4' })).toBe(true)
    expect(mayChange(r, { owner: null })).toBe(true)
    expect(mayChange(r, { owner: 'u5' })).toBe(false)
    expect(mayChange(r, { owner: 'n:Outside Cleaner' })).toBe(false)
    expect([mayGive(r, 'u4'), mayGive(r, ''), mayGive(r, null), mayGive(r, 'u5')]).toEqual([true, true, true, false])
    // A drag: one's own task onto nobody's lane is fine, onto a colleague's not; a colleague's task never.
    expect(mayDrop(r, { owner: 'u4' }, null)).toBe(true)
    expect(mayDrop(r, { owner: 'u4' }, 'u5')).toBe(false)
    expect(mayDrop(r, { owner: 'u5' }, 'u4')).toBe(false)
    expect(choosable(r, PEOPLE).map(p => p.key)).toEqual(['u4'])
    // A colleague's task still shows whose it is.
    expect(choosable(r, PEOPLE, 'u5').map(p => p.key)).toEqual(['u4', 'u5'])
    expect(meOf(staff(false))).toEqual({ key: 'u4', user_id: 4, name: 'Sam Staff' })
  })
})

describe('a planner setting is sent as the full admin writes it', () => {
  it('keeps the work day as an object, numbers and the planning mode as they are, lists as JSON text', () => {
    expect(settingBody('business_hours_profile', { start: '08:00', end: '17:00' })).toEqual({ value: { start: '08:00', end: '17:00' } })
    expect(settingBody('planner_planning_mode', 'own')).toEqual({ value: 'own' })
    expect(settingBody('planner_work_hours_per_day', 7.5)).toEqual({ value: 7.5 })
    expect(settingBody('planner_groups', [{ name: 'Housekeeping' }])).toEqual({ value: '[{"name":"Housekeeping"}]' })
  })
})
