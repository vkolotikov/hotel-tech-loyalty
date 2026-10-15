import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { PostCard, Slot } from '../lib/types'
import { plansFor, rangeFor } from './planMath'
import { ListView } from './ListView'
import { MonthGrid } from './MonthGrid'
import { PostCardView } from './PostCardView'
import { SlotRow } from './SlotRow'
import { Toolbar } from './Toolbar'
import { Tray } from './Tray'
import { WeekGrid } from './WeekGrid'
import { WeekStrip } from './WeekStrip'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const html = (el: ReactElement) => renderToStaticMarkup(el)
const post = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: null, status: 'draft',
  title: null, hook: `Hook ${id}`, topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', ...more,
})
const noop = () => {}
const handlers = { onOpen: noop, onWrite: noop, onFill: noop }

describe('PostCardView', () => {
  it('draws the platform, the time, the hook and the status, and names the card for a screen reader', () => {
    const out = html(<PostCardView post={post(1, { scheduled_time: '09:30', image_url: '/img/1.png' })} onOpen={noop} onPointerDown={noop} />)
    expect(out).toContain('data-platform="instagram"')
    expect(out).toContain('09:30')
    expect(out).toContain('Hook 1')
    expect(out).toContain('data-status="draft"')
    // The name starts with what the card shows (platform, time, words), then its status (WCAG 2.5.3, Lighthouse).
    expect(out).toContain('aria-label="instagram 09:30: Hook 1, draft"')
    expect(out).toContain('src="/img/1.png"')
    // A press on the thumbnail drags the card, not the browser's own image drag (which cancels the pointer).
    expect(out).toMatch(/<img[^>]*draggable="false"/)
    expect(out).toContain('data-movable="true"')
    expect(out).toContain('aria-describedby="content-move-hint"')
  })

  it('keeps a published post where it went out, and calls a post with no words an untitled post', () => {
    const out = html(<PostCardView post={post(2, { status: 'published', hook: null })} onOpen={noop} onPointerDown={noop} />)
    expect(out).toContain('data-movable="false"')
    expect(out).not.toContain('aria-describedby')
    expect(out).toContain('Untitled post')
  })

  it('tells a screen reader the time, and gives a card in the tray (no day to move from) no move hint', () => {
    const timed = html(<PostCardView post={post(4, { scheduled_time: '09:30' })} onOpen={noop} onPointerDown={noop} />)
    expect(timed).toContain('aria-label="instagram 09:30: Hook 4, draft"')
    expect(html(<PostCardView post={post(6)} onOpen={noop} onPointerDown={noop} />)).toContain('aria-label="instagram: Hook 6, draft"')
    const tray = html(<PostCardView post={post(5, { scheduled_date: null })} compact onOpen={noop} onPointerDown={noop} />)
    expect(tray).not.toContain('aria-describedby')
  })

  it('gives the words the card\'s whole width under the mark, time and status, clamped to three lines, so a narrow day cuts no word', () => {
    const out = html(<PostCardView post={post(3, { scheduled_time: '09:30' })} onOpen={noop} />)
    const words = out.match(/<span class="([^"]*)">Hook 3<\/span>/)?.[1] ?? ''
    expect(words).toContain('line-clamp-3')
    expect(words).toContain('break-words')
    // A block span keeps line-clamp from clamping (it needs -webkit-box).
    expect(words.split(' ')).not.toContain('block')
    expect(out.indexOf('data-status=')).toBeLessThan(out.indexOf('>Hook 3<'))
    expect(out.indexOf('09:30')).toBeLessThan(out.indexOf('>Hook 3<'))
  })
})

/** The narrowest width a grid insists on, in rem (its root's min-w-[…rem]). */
const minWidth = (out: string) => Number(out.match(/^<div class="[^"]*\bmin-w-\[(\d+(?:\.\d+)?)rem\]/)?.[1] ?? NaN)

describe('the grids beside the tray', () => {
  // At 1440 the page has about 54rem for a grid beside the side panel and the tray, at 1280 about 44rem:
  // a grid that insists on more scrolls sideways and cuts Sunday off.
  it('fit at 1280 and wider (42rem at most)', () => {
    const plans = plansFor(rangeFor('week', '2026-10-07').days, [], [])
    expect(minWidth(html(<WeekGrid plans={plans} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} />))).toBeLessThanOrEqual(42)
    const month = plansFor(rangeFor('month', '2026-10-07').days, [], [])
    expect(minWidth(html(<MonthGrid plans={month} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop} />))).toBeLessThanOrEqual(42)
  })
})

describe('SlotRow', () => {
  const slot: Slot = { date: '2026-10-07', platform: 'linkedin' }
  it('offers Write and Fill with AI; while filling, or with the budget used up, Fill waits', () => {
    expect(html(<SlotRow slot={slot} filling={false} aiPaused={false} onWrite={noop} onFill={noop} />)).toContain('aria-label="Empty linkedin slot"')
    const filling = html(<SlotRow slot={slot} filling aiPaused={false} onWrite={noop} onFill={noop} />)
    expect(filling).toContain('Writing…')
    // The attribute itself (disabled=""), not Tailwind's disabled: variant in a class.
    expect(filling).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Writing…/)
    expect(html(<SlotRow slot={slot} filling={false} aiPaused onWrite={noop} onFill={noop} />)).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Fill with AI/)
    expect(html(<SlotRow slot={slot} filling={false} aiPaused={false} onWrite={noop} onFill={noop} />)).not.toMatch(/\bdisabled=""/)
  })
})

describe('WeekStrip', () => {
  it('shows the four figures, and dashes until they are known', () => {
    const out = html(<WeekStrip figures={{ planned: 7, ready: 2, published: 3, open_slots: 4 }} pending={false} />)
    for (const label of ['Planned', 'Ready', 'Published', 'Empty slots']) expect(out).toContain(label)
    expect(out).toContain('>7<')
    expect(out).toContain('>4<')
    expect(html(<WeekStrip figures={undefined} pending />).match(/–/g)).toHaveLength(4)
  })
})

describe('WeekGrid', () => {
  it('draws seven drop days with today marked, each day\'s posts then its slots', () => {
    const plans = plansFor(rangeFor('week', '2026-10-07').days, [post(1), post(2, { scheduled_date: '2026-10-09' })], [{ date: '2026-10-08', platform: 'linkedin' }])
    const out = html(<WeekGrid plans={plans} today="2026-10-07" locale="en-GB" selectedId={2} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} />)
    expect(out.match(/data-drop-date="/g)).toHaveLength(7)
    expect(out).toMatch(/aria-current="date"[^>]*>.*>7</)
    expect(out).toContain('Hook 1')
    expect(out).toContain('aria-label="Empty linkedin slot"')
    expect(out).toContain('aria-current="true"') // the post open in the panel
    expect(out).toContain('Nothing planned')
  })
})

describe('MonthGrid', () => {
  it('shows a day\'s first three posts, how many more, and its empty slots', () => {
    const posts = [1, 2, 3, 4, 5].map(id => post(id))
    const plans = plansFor(rangeFor('month', '2026-10-07').days, posts, [{ date: '2026-10-07', platform: 'linkedin' }])
    const out = html(<MonthGrid plans={plans} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop} />)
    expect(out.match(/data-drop-date="/g)).toHaveLength(42)
    expect(out).toContain('Hook 3')
    expect(out).not.toContain('Hook 4')
    expect(out).toContain('+2 more')
    expect(out).toContain('Empty slots: 1')
  })
})

describe('ListView', () => {
  it('lists only the days that hold something, and says when nothing is planned', () => {
    const days = rangeFor('list', '2026-10-07').days
    const out = html(<ListView plans={plansFor(days, [post(1)], [])} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers} />)
    expect(out.match(/<section/g)).toHaveLength(1)
    expect(out).toContain('Today')
    expect(html(<ListView plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers} />))
      .toContain('Nothing planned this week.')
  })
})

describe('Tray', () => {
  it('is the drop target for "no day", with its count and a hint when empty', () => {
    const out = html(<Tray posts={[post(1, { scheduled_date: null })]} active={false} selectedId={null} onOpen={noop} />)
    expect(out).toContain('data-drop="tray"')
    expect(out).toContain('Unscheduled')
    expect(out).toContain('Hook 1')
    expect(html(<Tray posts={[]} active selectedId={null} onOpen={noop} />)).toContain('Drag a post here')
  })
})

describe('Toolbar', () => {
  const base = {
    view: 'week' as const, label: '5 Oct – 11 Oct 2026', refreshing: false, filter: { platforms: ['linkedin' as const], status: 'all' as const },
    platforms: ['instagram' as const, 'linkedin' as const], statuses: ['draft' as const, 'published' as const],
    onPrev: noop, onNext: noop, onToday: noop, onView: noop, onFilter: noop, onGenerate: noop,
  }

  it('names the range, offers the views and the chips, and Generate only to managers', () => {
    const out = html(<Toolbar {...base} viewLocked={false} canGenerate />)
    expect(out).toContain('5 Oct – 11 Oct 2026')
    expect(out).toMatch(/aria-pressed="true"[^>]*>Week</)
    expect(out).toMatch(/aria-pressed="true"[^>]*>.*linkedin/)
    expect(out).toContain('Generate')
    expect(out).toContain('<option value="published">published</option>')
    expect(html(<Toolbar {...base} viewLocked={false} canGenerate={false} />)).not.toContain('Generate')
  })

  it('has no view choice where the list is the only view', () => {
    expect(html(<Toolbar {...base} viewLocked canGenerate={false} />)).not.toContain('>Month<')
  })

  it('keeps Generate waiting while this month\'s AI budget is used up', () => {
    const out = html(<Toolbar {...base} viewLocked={false} canGenerate aiPaused />)
    expect(out).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:(?!<\/button>).)*Generate/s)
  })
})
