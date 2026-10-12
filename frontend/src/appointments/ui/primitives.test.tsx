import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './Button'
import { Figure, Eyebrow, PageTitle, SectionTitle } from './Typography'
import { CalendarSkeleton } from './Skeleton'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k }) }))

describe('workspace primitives', () => {
  it('titles use the display face; eyebrows the mono face', () => {
    expect(renderToStaticMarkup(<PageTitle>Takings</PageTitle>)).toMatch(/^<h1 class="[^"]*font-a-display[^"]*">Takings<\/h1>$/)
    expect(renderToStaticMarkup(<SectionTitle>Team</SectionTitle>)).toMatch(/^<h2 class="[^"]*font-a-display/)
    expect(renderToStaticMarkup(<Eyebrow>Today</Eyebrow>)).toMatch(/font-a-mono[^"]*uppercase/)
    expect(renderToStaticMarkup(<Figure>€470</Figure>)).toMatch(/font-a-display[^"]*tabular-nums/)
  })

  it('the primary button is the accent pill; danger text follows its own ink', () => {
    expect(renderToStaticMarkup(<Button>Save</Button>)).toMatch(/rounded-full[^"]*bg-a-accent[^"]*text-a-accent-ink/)
    expect(renderToStaticMarkup(<Button variant="danger">Cancel</Button>)).toContain('text-a-danger-ink')
    expect(renderToStaticMarkup(<Button variant="ghost">More</Button>)).toContain('text-a-accent-text')
  })

  it('the primary button lifts on hover only where the device hovers: on an iPad a tap must not leave it raised', () => {
    const html = renderToStaticMarkup(<Button>Save</Button>)
    expect(html).toContain('[@media(hover:hover)]:hover:-translate-y-px')
    expect(html.split(/\s+/).filter(c => c.startsWith('hover:') && c.includes('translate'))).toEqual([])
  })

  it('the calendar placeholder is announced, not read out cell by cell', () => {
    const html = renderToStaticMarkup(<CalendarSkeleton />)
    expect(html).toContain('role="status"')
    expect(html).toContain('Loading…')
    expect(html).toContain('animate-pulse')
  })
})
