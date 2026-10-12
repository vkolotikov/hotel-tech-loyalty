import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VisitSteps, visitSteps } from './VisitSteps'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k }) }))

/** The label inside the one <li> that carries aria-current, or null when none does. */
function current(html: string): string | null {
  return html.match(/<li[^>]*aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*/)?.[0].replace(/<[^>]+>/g, '') ?? null
}

describe('visit progress', () => {
  it('reads the status as the stage the visit is in', () => {
    expect(visitSteps('pending')!.map(s => s.state)).toEqual(['todo', 'todo', 'todo'])
    expect(visitSteps('confirmed')!.map(s => s.state)).toEqual(['now', 'todo', 'todo'])
    expect(visitSteps('in_progress')!.map(s => s.state)).toEqual(['done', 'now', 'todo'])
    expect(visitSteps('completed')!.map(s => s.state)).toEqual(['done', 'done', 'done'])
    expect(visitSteps('cancelled')).toBeNull()
    expect(visitSteps('no_show')).toBeNull()
  })

  it('is a named list whose current step is marked in the markup, not by colour alone', () => {
    const html = renderToStaticMarkup(<VisitSteps status="in_progress" />)
    expect(html).toMatch(/<ol[^>]*aria-label="Visit progress"/)
    expect(html).toMatch(/aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*In progress/)
    expect(current(html)).toBe('In progress')
    expect(html).not.toContain('In the chair') // a word for a salon; a clinic, a gym and a studio are not "in the chair"
    expect(current(renderToStaticMarkup(<VisitSteps status="confirmed" />))).toBe('Confirmed')
    expect(renderToStaticMarkup(<VisitSteps status="cancelled" />)).toBe('')
  })

  it('marks the last stage as current once the visit is completed, and none while it is only pending', () => {
    expect(current(renderToStaticMarkup(<VisitSteps status="completed" />))).toBe('Completed')
    expect(renderToStaticMarkup(<VisitSteps status="pending" />)).not.toContain('aria-current')
  })

  it('takes a class for its list', () => {
    expect(renderToStaticMarkup(<VisitSteps status="confirmed" className="mt-4" />)).toMatch(/<ol[^>]*class="[^"]*mt-4/)
  })
})
