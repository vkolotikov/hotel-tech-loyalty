import { describe, expect, it } from 'vitest'
import { dropSaved } from './settingsEdits'

describe('dropSaved', () => {
  it('keeps edits the save did not send (a Style click saves only theme_style)', () => {
    const edited = { primary_color: '#c9a84c', company_name: 'Lakeside' }
    expect(dropSaved(edited, [{ key: 'theme_style', value: 'classic' }])).toEqual(edited)
  })

  it('drops the edits the save sent', () => {
    const edited = { primary_color: '#c9a84c', company_name: 'Lakeside' }
    expect(dropSaved(edited, [{ key: 'company_name', value: 'Lakeside' }])).toEqual({ primary_color: '#c9a84c' })
  })

  it('keeps an edit made again while the save was in flight', () => {
    const edited = { company_name: 'Lakeside Spa' }
    expect(dropSaved(edited, [{ key: 'company_name', value: 'Lakeside' }])).toEqual({ company_name: 'Lakeside Spa' })
  })

  it('compares as strings, the way the API stores values', () => {
    expect(dropSaved({ booking_enabled: 'true' }, [{ key: 'booking_enabled', value: true }])).toEqual({})
  })

  it('leaves the edits it was given untouched', () => {
    const edited = { company_name: 'Lakeside' }
    dropSaved(edited, [{ key: 'company_name', value: 'Lakeside' }])
    expect(edited).toEqual({ company_name: 'Lakeside' })
  })
})
