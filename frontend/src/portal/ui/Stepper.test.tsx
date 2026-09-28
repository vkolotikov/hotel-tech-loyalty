import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Stepper } from './Stepper'

describe('Stepper', () => {
  it('shows the value and disables the edge buttons at the limits', () => {
    const atMin = renderToStaticMarkup(<Stepper label="People" value={1} min={1} max={10} onChange={() => {}} />)
    expect(atMin).toContain('>1<')
    expect(atMin).toMatch(/aria-label="Fewer"[^>]*disabled/)
    const atMax = renderToStaticMarkup(<Stepper label="People" value={10} min={1} max={10} onChange={() => {}} />)
    expect(atMax).toMatch(/aria-label="More"[^>]*disabled/)
    expect(atMax).toContain('aria-live="polite"')
  })
})
