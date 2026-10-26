import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Crown, Gift, Users } from 'lucide-react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: 'en' } }),
}))

import { FigureTile, FigureTiles } from './FigureTiles'
import { GetStarted, GetStartedExample, SectionIntro } from './GetStarted'
import { SectionCards, SectionCount } from './SectionCards'
import { sectionAfter } from './sections'

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('a row of section cards (release 10, the owner\'s Figma 171:401)', () => {
  it('moves with the arrow keys (wrapping), Home and End, and nothing else', () => {
    const ids = ['tiers', 'benefits', 'places', 'boosts'] as const
    expect(sectionAfter(ids, 'tiers', 'ArrowRight')).toBe('benefits')
    expect(sectionAfter(ids, 'boosts', 'ArrowRight')).toBe('tiers')
    expect(sectionAfter(ids, 'tiers', 'ArrowLeft')).toBe('boosts')
    expect(sectionAfter(ids, 'places', 'ArrowDown')).toBe('boosts')
    expect(sectionAfter(ids, 'places', 'ArrowUp')).toBe('benefits')
    expect(sectionAfter(ids, 'places', 'Home')).toBe('tiers')
    expect(sectionAfter(ids, 'tiers', 'End')).toBe('boosts')
    expect(sectionAfter(ids, 'tiers', 'Enter')).toBeNull()
    expect(sectionAfter([], 'x', 'ArrowRight')).toBeNull()
  })

  it('is a tab list with one tab stop, each card in its colour with its line, the chosen one filled and outlined', () => {
    const html = renderToStaticMarkup(
      <SectionCards label="Program sections" idPrefix="p" panelId="panel" value="b" onChange={() => {}}
        items={[
          { id: 'a', icon: Crown, hue: 'tier', title: 'Tiers', caption: 'Levels and what reaches them', badge: <SectionCount value="4" /> },
          { id: 'b', icon: Gift, hue: 'rule', title: 'Benefits', caption: 'Perks each tier includes', badge: <SectionCount waiting value="2" waitingLabel="to check" /> },
        ]} />,
    )
    expect(html).toMatch(/role="tablist" aria-label="Program sections" class="grid grid-cols-2[^"]*lg:grid-cols-2"/)
    expect(html).toMatch(/role="tab" id="p-a" aria-selected="false" aria-controls="panel" tabindex="-1" data-section="a" data-hue="tier"[^>]*border-a-border bg-a-surface/)
    expect(html).toMatch(/role="tab" id="p-b" aria-selected="true" aria-controls="panel" tabindex="0" data-section="b" data-hue="rule"[^>]*l-hue-card/)
    // The chosen card's title reads in its colour; the others in the text colour.
    expect(html).toMatch(/l-hue-text"><span>Benefits<\/span>/)
    expect(html).toMatch(/text-a-text"><span>Tiers<\/span>/)
    expect(text(html)).toContain('Tiers 4 Levels and what reaches them Benefits 2 to check Perks each tier includes')
    expect(html).toMatch(/data-state="pending"[^>]*>2<span class="sr-only"> to check/)
  })
})

describe('an empty section that teaches (the owner\'s Figma 163:322, 163:400)', () => {
  const steps = [{ title: 'Name it', line: 'One' }, { title: 'Choose', line: 'Two' }, { title: 'Start', line: 'Three' }]

  it('says Get started, its heading, the numbered steps and the action, in the section\'s colour', () => {
    const html = renderToStaticMarkup(<GetStarted name="places" hue="place" title="Add your first entrance" line="Why." steps={steps} action={<button type="button">Add</button>} />)
    expect(html).toMatch(/<section data-get-started="places" data-hue="place" aria-label="Add your first entrance" class="l-hue-panel/)
    expect(text(html)).toContain('Get started Add your first entrance Why. 1 Name it One 2 Choose Two 3 Start Three Add')
    expect(html).not.toContain('data-managers-only')
  })

  it('without an action says who sets it up — the default, the page\'s own words, or nothing when the page says it', () => {
    expect(text(renderToStaticMarkup(<GetStarted name="x" hue="tier" title="T" line="L" steps={steps} />))).toContain('An owner or a manager sets this up.')
    expect(text(renderToStaticMarkup(<GetStarted name="x" hue="tier" title="T" line="L" steps={steps} who="Managers create events." />))).toContain('Managers create events.')
    expect(renderToStaticMarkup(<GetStarted name="x" hue="tier" title="T" line="L" steps={steps} who={null} />)).not.toContain('data-managers-only')
  })

  it('an optional one says so, and can show an example in figures beside the steps', () => {
    const html = renderToStaticMarkup(
      <GetStarted name="boosts" hue="gift" optional title="T" line="L" steps={steps}
        example={<GetStartedExample hue="gift" title="Double-points weekend" figures="100 → 200 points" line="×2 boost" />} />,
    )
    expect(text(html)).toContain('Optional T')
    expect(html).toMatch(/xl:grid-cols-\[minmax\(0,1fr\)_minmax\(16rem,22rem\)\]/)
    expect(html).toMatch(/data-example="" data-hue="gift" class="l-hue-card[\s\S]*Example[\s\S]*Double-points weekend[\s\S]*l-hue-text[^>]*>100 → 200 points/)
  })

  it('a section\'s opening line sits in its colour', () => {
    expect(renderToStaticMarkup(<SectionIntro hue="rule">Create once.</SectionIntro>)).toBe('<p data-section-intro="" data-hue="rule" class="l-hue-panel rounded-xl border px-4 py-3 text-sm text-a-text">Create once.</p>')
  })
})

describe('figures as tiles (the owner\'s Figma 131:3945)', () => {
  it('shows each figure large with what it counts; one that leads on is a button in its colour', () => {
    const html = renderToStaticMarkup(
      <FigureTiles label="Members in figures">
        <FigureTile name="active" icon={Users} hue="tier" label="Active members" value="51" note="of 53" />
        <FigureTile name="benefits" icon={Gift} hue="rule" label="Benefits to give" value="4" onClick={() => {}} />
      </FigureTiles>,
    )
    expect(html).toMatch(/<ul aria-label="Members in figures"/)
    expect(text(html)).toContain('Active members 51 of 53')
    expect(html).toMatch(/data-figure="active" data-hue="tier"><div/)
    expect(html).toMatch(/data-figure="benefits" data-hue="rule"><button type="button" data-leads="" class="l-hue-panel/)
  })
})
