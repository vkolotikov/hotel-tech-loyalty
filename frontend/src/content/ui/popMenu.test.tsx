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
