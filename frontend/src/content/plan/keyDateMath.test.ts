import { describe, expect, it } from 'vitest'
import type { BrandPayload, KeyDate, OwnKeyDate } from '../lib/types'
import { daysCovered, holidayCountryOf, keyDateBody, keyDateForm, keyDateProblem, keyDatesByDay, keyOf, onDay } from './keyDateMath'
import { parsePrefs } from './prefs'

const boxing: KeyDate = { id: 'gb.boxing_day', kind: 'holiday', date: '2026-12-26', substitute: false, name_en: 'Boxing Day' }
const boxingInLieu: KeyDate = { ...boxing, date: '2026-12-28', substitute: true }
const offer: OwnKeyDate = { id: 4, kind: 'event', title: 'Autumn offer', details: null, start: '2026-09-28', end: '2026-10-08' }
const photographer: OwnKeyDate = { id: 5, kind: 'note', title: 'Photographer', details: 'At ten', start: '2026-10-01', end: null }
const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']

describe('keyOf', () => {
  // Review Focus 1: a substitute day shares its holiday's id; a list keyed by id alone drops or merges chips.
  it('gives every chip its own key: built-in days by kind, id, day and substitute; own ones by their id', () => {
    const keys = [boxing, boxingInLieu, { ...boxing, kind: 'marketing' as const }, offer, photographer].map(keyOf)
    expect(new Set(keys).size).toBe(5)
  })
})

describe('onDay and keyDatesByDay', () => {
  // Review Focus 2: an event that began before the shown week shows on each shown day it covers; a past note on its day.
  it('places an event on every day it covers, a note and a built-in day on theirs, and leaves out days without any', () => {
    const byDay = keyDatesByDay([offer, photographer, boxing], week)
    expect(Object.keys(byDay)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])
    expect(byDay['2026-10-08']).toEqual([offer])
    expect(keyDatesByDay([photographer], ['2026-10-01'])['2026-10-01']).toEqual([photographer])
    expect(onDay(boxing, '2026-12-26')).toBe(true)
    expect(onDay(boxing, '2026-12-27')).toBe(false)
  })
})

describe('holidayCountryOf', () => {
  const brand = (holiday_country: string | null, guess: string | null) => ({ profile: { holiday_country }, holiday_country_guess: guess }) as unknown as BrandPayload
  it('takes the brand’s choice, none, else the venue’s guess', () => {
    expect(holidayCountryOf(brand('US', 'GB'))).toBe('US')
    expect(holidayCountryOf(brand('none', 'GB'))).toBeNull()
    expect(holidayCountryOf(brand(null, 'GB'))).toBe('GB')
    expect(holidayCountryOf(brand(null, null))).toBeNull()
    expect(holidayCountryOf(undefined)).toBeNull()
  })
})

describe('the key date editor’s rules (spec 2026-10-16 §3.1)', () => {
  it('needs a title and a first day; an event lasts at most 31 days and never ends before it starts', () => {
    const form = { title: 'Spring sale', details: '', start: '2026-03-01', end: '2026-03-31' }
    expect(daysCovered('2026-03-01', '2026-03-31')).toBe(31)
    expect(keyDateProblem('event', form)).toBeNull()
    expect(keyDateProblem('event', { ...form, end: '2026-04-01' })).toBe('too_long')
    expect(keyDateProblem('event', { ...form, end: '2026-02-28' })).toBe('end_before_start')
    expect(keyDateProblem('event', { ...form, title: '   ' })).toBe('invalid')
    expect(keyDateProblem('note', { ...form, end: '2026-04-30' })).toBeNull() // a note's last day is never sent
  })

  it('sends everything for a new one, only the changes for one being edited, and no last day for a note', () => {
    expect(keyDateBody('note', { title: ' Photographer ', details: '', start: '2026-10-07', end: '2026-10-09' }, null))
      .toEqual({ kind: 'note', title: 'Photographer', details: null, start_date: '2026-10-07', end_date: null })
    expect(keyDateBody('event', { ...keyDateForm(offer, '2026-10-05'), title: 'Big offer' }, offer)).toEqual({ title: 'Big offer' })
    expect(keyDateForm(null, '2026-10-07')).toEqual({ title: '', details: '', start: '2026-10-07', end: '' })
  })
})

describe('the Key dates toggle on this device', () => {
  it('is on unless it was switched off', () => {
    expect(parsePrefs(null, [], []).keyDates).toBe(true)
    expect(parsePrefs(JSON.stringify({ keyDates: false }), [], []).keyDates).toBe(false)
    expect(parsePrefs(JSON.stringify({ keyDates: 'no' }), [], []).keyDates).toBe(true)
  })
})
