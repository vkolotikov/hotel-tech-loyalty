import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Bot, BookOpen } from 'lucide-react'
import { SectionNav, sectionAfter } from './SectionNav'
import { FilterChip, Toolbar } from './Toolbar'
import { Card } from './Card'

describe('the CRM building blocks (round 2)', () => {
  it('moves between sections with the arrow keys, Home and End, round the ends', () => {
    const keys = ['behaviour', 'knowledge', 'teach'] as const
    expect(sectionAfter(keys, 'behaviour', 'ArrowRight')).toBe('knowledge')
    expect(sectionAfter(keys, 'teach', 'ArrowRight')).toBe('behaviour')
    expect(sectionAfter(keys, 'behaviour', 'ArrowLeft')).toBe('teach')
    expect(sectionAfter(keys, 'knowledge', 'End')).toBe('teach')
    expect(sectionAfter(keys, 'knowledge', 'Home')).toBe('behaviour')
    expect(sectionAfter(keys, 'knowledge', 'a')).toBeNull()
  })

  it('draws the sections as one tab list with the chosen one selected and what waits beside its title', () => {
    const html = renderToStaticMarkup(
      <SectionNav label="Sections" idPrefix="s" panelId="p" value="teach" onChange={() => {}} sections={[
        { key: 'behaviour', icon: Bot, title: 'Behaviour', caption: 'How it speaks' },
        { key: 'teach', icon: BookOpen, title: 'Answers to fix', badge: 3, tone: 'ai' },
      ]} />,
    )
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)?.length).toBe(2)
    expect(html).toMatch(/id="s-teach"[^>]*aria-selected="true"[^>]*tabindex="0"|aria-selected="true"[^>]*id="s-teach"/)
    expect(html).toContain('How it speaks')
    expect(html).toContain('>3</span>')
  })

  it('a toolbar holds the controls and the active filters; a card says what it holds', () => {
    const html = renderToStaticMarkup(
      <Toolbar actions={<button type="button">Export</button>} chips={<FilterChip label="Stage: Proposal" onRemove={() => {}} removeLabel="Remove" />}>
        <input aria-label="Search" />
      </Toolbar>,
    )
    expect(html).toContain('Export')
    expect(html).toContain('aria-label="Remove: Stage: Proposal"')
    const card = renderToStaticMarkup(<Card title="Pipeline" description="Open leads by stage" icon={Bot} tone="accent"><p>body</p></Card>)
    expect(card).toContain('Open leads by stage')
    expect(card).toContain('body')
  })
})
