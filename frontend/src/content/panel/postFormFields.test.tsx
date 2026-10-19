import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))

import { newForm } from './panelState'
import { PostFormFields } from './PostFormFields'

const render = (posterId: string, team = [{ id: 3, name: 'Mia' }, { id: 7, name: 'Sam' }]) => renderToStaticMarkup(
  <PostFormFields form={{ ...newForm({ date: '2026-10-07', platform: 'instagram' }, ['instagram']), poster_id: posterId }} onChange={() => {}}
    platforms={['instagram']} statuses={['draft']} pillars={[]} audiences={[]} published={false} invalid={[]} locale="en" industry={null}
    snippets={[]} team={team} />,
)

describe('"Who posts it" in the panel (spec 2026-10-19 §4.1)', () => {
  it('offers Not set and the brand’s team, with the poster chosen', () => {
    const html = render('7')
    expect(html).toContain('Who posts it')
    expect(html).toMatch(/<option value="">Not set<\/option>/)
    expect(html).toMatch(/<option value="3">Mia<\/option>/)
    expect(html).toMatch(/<option value="7" selected="">Sam<\/option>/)
  })

  it('chooses Not set for nobody', () => {
    expect(render('')).toMatch(/<option value="" selected="">Not set<\/option>/)
  })
})
