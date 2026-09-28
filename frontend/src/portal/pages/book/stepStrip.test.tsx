import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StepStrip } from './StepStrip'
import { STEPS, type Step } from './steps'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k, i18n: { language: 'en' } }),
}))

const labels: Record<Step, string> = { service: 'Service', staff: 'Who', when: 'When', review: 'Review', pay: 'Pay' }

function render(current: Step, locked: boolean) {
  return renderToStaticMarkup(
    <StepStrip steps={STEPS} current={current} labels={labels} ariaLabel="Book" locked={locked} onJump={() => {}} />,
  )
}

describe('StepStrip', () => {
  it('unlocked: every earlier step is a clickable button with no aria-disabled', () => {
    const html = render('review', false)
    // service, staff, when are all before "review" (index 3) — each rendered as a real <button>.
    expect(html.match(/<button/g)?.length).toBe(3)
    expect(html).not.toContain('aria-disabled')
    expect(html).not.toContain('disabled=""')
  })

  it('locked: every earlier step is disabled, with aria-disabled and no click handler reachable', () => {
    const html = render('pay', true)
    // service, staff, when, review are all before "pay" (index 4).
    expect(html.match(/<button/g)?.length).toBe(4)
    expect(html.match(/aria-disabled="true"/g)?.length).toBe(4)
    expect(html.match(/disabled=""/g)?.length).toBe(4)
  })

  // Task 21 browser pass: at 390px the phone-wide `button { min-height: 36px }` rule made "Service" sit ~8px
  // below "Who / When / Review / Pay", and each way back was a 20px-tall word. The strip now centres its
  // items and every way back gets the touch target (`p-tap`: 44px on coarse pointers).
  it('lines every step up on one centre line and gives each way back a touch-sized target', () => {
    const html = render('review', false)
    expect(html).toMatch(/<ol class="[^"]*\bitems-center\b/)
    expect(html.match(/<button[^>]*class="[^"]*\bp-tap\b[^"]*\binline-flex\b|<button[^>]*class="[^"]*\binline-flex\b[^"]*\bp-tap\b/g)?.length).toBe(3)
  })

  it('the current and later steps are plain text either way, never a button', () => {
    const locked = render('when', true)
    const unlocked = render('when', false)
    for (const html of [locked, unlocked]) {
      expect(html).toContain('aria-current="step"')
      // Only "service" and "staff" (the two steps before "when") can ever be buttons.
      expect(html.match(/<button/g)?.length).toBe(2)
    }
  })
})
