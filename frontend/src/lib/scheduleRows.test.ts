import { describe, expect, it } from 'vitest'
import { editFirstWindow, scheduleSaveError } from './scheduleRows'

describe('the full admin schedule form', () => {
  const rows = [
    { day_of_week: 1, start_time: '09:00:00', end_time: '13:00:00' },
    { day_of_week: 1, start_time: '14:00:00', end_time: '18:00:00' },
    { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00' },
  ]

  it('changes only the window it shows, so a split day made in the workspace stays two windows', () => {
    expect(editFirstWindow(rows, 1, 'start_time', '10:00')).toEqual([
      { day_of_week: 1, start_time: '10:00', end_time: '13:00:00' },
      { day_of_week: 1, start_time: '14:00:00', end_time: '18:00:00' },
      { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00' },
    ])
  })

  it('says why the server refused the hours', () => {
    expect(scheduleSaveError({ response: { status: 422, data: { message: 'These hours overlap another window on the same day.' } } }))
      .toBe('Failed to save schedule: These hours overlap another window on the same day.')
    expect(scheduleSaveError(new Error('Network Error'))).toBe('Failed to save schedule')
  })
})
