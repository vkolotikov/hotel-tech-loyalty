import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Keys built at run time (`setup.hours.problem.${problem}`) carry no fallback, so the stub reads them from
// the real English bundle: the test checks the words a person sees.
vi.mock('react-i18next', async () => {
  const en = (await import('../i18n/appointments.en.json')).default as Record<string, unknown>
  const lookup = (key: string): unknown => key.replace(/^appointments\./, '').split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), en)
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
        const found = lookup(key)
        const text = typeof fallback === 'string' ? fallback : typeof found === 'string' ? found : key
        return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
      },
      i18n: { language: 'en' },
    }),
  }
})

const { WeekEditor } = await import('./WeekEditor')
const { TimeOffEditor } = await import('./TimeOffEditor')

const rows = [
  { day_of_week: 1, start_time: '09:00', end_time: '13:00' },
  { day_of_week: 1, start_time: '14:00', end_time: '18:00' },
  { day_of_week: 0, start_time: '10:00', end_time: '24:00' },
]

describe('WeekEditor', () => {
  it('lists Monday first, shows each range, says Off for a day without hours, and offers to save', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={rows} readOnly={false} locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html.indexOf('Monday')).toBeLessThan(html.indexOf('Sunday'))
    expect(html).toContain('value="14:00"')
    expect(html).toContain('value="24:00"')
    expect(html).toContain('Off')
    expect(html).toContain('Copy to Monday–Friday')
    expect(html).toContain('Save hours')
  })

  it('says what is wrong with a day and will not save it', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={[{ day_of_week: 2, start_time: '17:00', end_time: '09:00' }]} readOnly={false} locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html).toContain('The end must be after the start.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Save hours/)
  })

  it('takes times from any keyboard: a phone number pad has no ":"', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={rows} readOnly={false} locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html).not.toContain('inputmode="numeric"')
    expect(html).not.toContain('inputMode="numeric"')
  })

  it('only shows the week when read-only', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={rows} readOnly locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html).not.toContain('Save hours')
    expect(html).not.toContain('Add hours')
  })
})

describe('TimeOffEditor', () => {
  const entries = [
    { id: 1, date: '2026-10-09', start_time: null, end_time: null, reason: 'Holiday' },
    { id: 2, date: '2026-10-12', start_time: '12:00', end_time: '14:00', reason: null },
  ]

  it('lists time off with all-day or the hours, and a way to remove each', () => {
    const html = renderToStaticMarkup(<TimeOffEditor entries={entries} canEdit locale="en-GB" today="2026-10-05" saving={false} onAdd={() => {}} onRemove={() => {}} />)
    expect(html).toContain('All day')
    expect(html).toContain('Holiday')
    expect(html).toContain('12:00–14:00')
    expect(html).toContain('Remove')
    expect(html).toContain('Add time off')
    expect(html).toContain('min="2026-10-05"')
  })

  it('says when nothing is planned, and offers nothing to someone who may not change it', () => {
    const html = renderToStaticMarkup(<TimeOffEditor entries={[]} canEdit={false} locale="en-GB" today="2026-10-05" saving={false} onAdd={() => {}} onRemove={() => {}} />)
    expect(html).toContain('No time off planned.')
    expect(html).not.toContain('Add time off')
  })
})
