import { describe, expect, it, vi } from 'vitest'
import { ServiceStep } from './ServiceStep'
import { base, catalogue, render } from './testUtils'

// Every string goes through `t()`: this mock returns the KEY (with its count), never the English fallback,
// so any English written straight into the markup is left standing and visible to the assertion.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = (typeof fallback === 'object' ? fallback : opts) ?? {}
      return 'count' in vars ? `${k}(${String(vars.count)})` : k
    },
    i18n: { language: 'de' },
  }),
}))

describe('ServiceStep', () => {
  // Task 21 browser pass: in Russian and German the service cards still read "60 min".
  it('writes the duration through copy, not as English', () => {
    const html = render(<ServiceStep catalogue={catalogue} onPick={() => {}} />, base)
    expect(html).toContain('portal.book.duration(45)')
    expect(html).not.toMatch(/>\d+ min</)
  })

  // Task 21 "remove one accessory": the accent-coloured "Your price" under every discounted price repeated
  // what the struck-through list price and the "… applied" chip already say. It goes; the two prices keep
  // their names for screen readers, which previously heard two bare amounts in a row.
  it('names the two prices for screen readers without a visible "Your price" on every card', () => {
    const html = render(<ServiceStep catalogue={catalogue} onPick={() => {}} />, base)
    expect(html).toContain('<span class="sr-only">portal.book.list_price</span>')
    expect(html).toContain('<span class="sr-only">portal.book.your_price</span>')
    expect(html).not.toMatch(/<span class="[^"]*text-p-accent-deep[^"]*">portal\.book\.your_price/)
  })
})
