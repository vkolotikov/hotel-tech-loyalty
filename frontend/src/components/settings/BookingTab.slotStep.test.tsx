import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: 'en' } }),
}))

const { BookingTab } = await import('./BookingTab')

/** Nothing stored means 15 minutes on the server (ServiceCatalogue, the widget); the form must say 15 too. */
describe('BookingTab slot step', () => {
  it('shows the server default when nothing is stored', () => {
    const html = renderToStaticMarkup(
      <BookingTab getVal={() => ''} handleChange={() => {}} widgetToken="tok" cardClass="" cardStyle={{}} inputClass="" btnPrimary="" />,
    )
    const field = html.slice(html.indexOf('Slot Step'))
    expect(field).toMatch(/<option value="15"[^>]*selected=""/)
    expect(field.slice(0, field.indexOf('</select>'))).not.toMatch(/<option value="30"[^>]*selected=""/)
  })
})
