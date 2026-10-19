import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { ContentContext } from '../ContentProvider'
import { bootFor } from '../brand/brandTesting'
import type { Bootstrap } from '../lib/types'
import { MorningEmailSwitch, MorningSwitchView } from './MorningEmailSwitch'

const render = (on: boolean | undefined) => {
  const boot = { ...bootFor(false), staff: { name: 'Sam', role: 'staff', can_manage: false, id: 7, morning_email: on } } as unknown as Bootstrap
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <MorningEmailSwitch />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('the morning email switch (spec 2026-10-19 §4.5)', () => {
  it('is a named switch showing the person’s own setting, off when the bootstrap does not say', () => {
    expect(render(true)).toMatch(/role="switch" aria-checked="true"/)
    expect(render(false)).toMatch(/role="switch" aria-checked="false"/)
    expect(render(undefined)).toMatch(/role="switch" aria-checked="false"/)
    expect(render(true)).toContain('Morning email: today’s posts')
    expect(render(true)).toContain('At 8 am, the posts you post today.')
  })
})

// Final review: a focused switch that turned `disabled` while saving dropped the focus, and the bell's menu closes on
// that blur — a keyboard user lost the menu, their place, and any "could not be saved" line.
describe('the switch while it saves (final review)', () => {
  it('says it is busy without the disabled attribute, so the focus and the bell’s menu stay', () => {
    const html = renderToStaticMarkup(<MorningSwitchView on busy failed={false} onFlip={() => {}} />)
    expect(html).toMatch(/role="switch"[^>]*aria-disabled="true"/)
    expect(html).not.toMatch(/role="switch"[^>]*\bdisabled=""/)
  })

  it('says when the setting could not be saved', () => {
    expect(renderToStaticMarkup(<MorningSwitchView on={false} busy={false} failed onFlip={() => {}} />)).toContain('The setting could not be saved. Please try again.')
  })
})
