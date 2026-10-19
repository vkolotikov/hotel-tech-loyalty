import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PopList, PopMenu } from './PopMenu'

describe('the shared menu (spec 2026-10-16 §3.5, §8)', () => {
  it('draws nothing without items, unless it has an empty line to say', () => {
    expect(renderToStaticMarkup(<PopMenu label="Insert" items={[]} onPick={() => {}} className="b">Insert</PopMenu>)).toBe('')
    const bell = renderToStaticMarkup(<PopMenu label="For you" items={[]} emptyText="Nothing new for you." onPick={() => {}} className="b">Bell</PopMenu>)
    expect(bell).toContain('aria-label="For you"')
  })

  // Review Focus 4: an open list with nothing in it says so.
  it('says its empty line when the list has no items', () => {
    expect(renderToStaticMarkup(<PopList id="l" items={[]} emptyText="Nothing new for you." onPick={() => {}} className="c" />)).toContain('Nothing new for you.')
  })

  it('marks the lines to notice, with a word for a screen reader, and draws the others as before', () => {
    const html = renderToStaticMarkup(
      <PopList id="l" markLabel="New" onPick={() => {}} className="c"
        items={[{ id: 'a', label: 'Maria commented: Autumn', sub: 'Love it · 5 Oct, 09:00', mark: true }, { id: 'b', label: 'Anna approved: Spring' }]} />,
    )
    expect(html.split('data-mark=""').length - 1).toBe(1)
    expect(html).toContain('<span class="sr-only">New: </span>')
    expect(html).toContain('<span class="block truncate text-sm font-medium text-a-text">Anna approved: Spring</span>')
  })
})

describe('PopList footer (spec 2026-10-19 §4.5: the bell’s morning email switch)', () => {
  it('draws a footer under the lines, also when the list is empty', () => {
    const html = renderToStaticMarkup(<PopList id="l" items={[]} onPick={() => {}} className="c" emptyText="Nothing new" footer={<span>Footer here</span>} />)
    expect(html).toMatch(/Nothing new.*data-menu-footer=""[^>]*><span>Footer here<\/span>/)
    expect(renderToStaticMarkup(<PopList id="l" items={[{ id: 'a', label: 'A' }]} onPick={() => {}} className="c" />)).not.toContain('data-menu-footer')
  })
})

// Final review: with a manager's long list of reminders (day one: every post nobody posts), the footer — the only place
// to switch the morning email on — sat below the list's scroll.
describe('PopList footer stays in view (final review)', () => {
  it('sticks to the bottom of the scrolling list, on the list’s own background', () => {
    const html = renderToStaticMarkup(<PopList id="l" items={[{ id: 'a', label: 'A' }]} onPick={() => {}} className="c" footer={<span>F</span>} />)
    expect(html).toMatch(/<li data-menu-footer="" class="[^"]*\bsticky\b[^"]*\bbottom-0\b[^"]*\bbg-a-surface\b/)
  })
})
