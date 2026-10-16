import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { PostCard, Slot } from '../lib/types'
import { plansFor, rangeFor } from './planMath'
import { GoalsLine } from './GoalsLine'
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

  it('says when it shows only part of the posts with no day, and links to all of them', () => {
    const out = html(<MemoryRouter><Tray posts={[post(1, { scheduled_date: null }), post(2, { scheduled_date: null })]} total={102} active={false} selectedId={null} onOpen={noop} /></MemoryRouter>)
    expect(out).toContain('Showing 2 of 102')
    expect(out).toMatch(/<a[^>]*href="\/content\/posts\?unscheduled=1"[^>]*>See all<\/a>/)
    expect(out).toContain('>102<')
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

describe('click-to-add in the week', () => {
  // Spec 2026-10-15 §4 and Review Focus 2: a "+" at the foot of each day from the venue's today on, named by its day.
  it('puts a "+" named by its day at the foot of today and the days ahead, none on days already gone', () => {
    const days = rangeFor('week', '2026-10-07').days
    const out = html(<WeekGrid plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} onAdd={noop} />)
    expect(out).toContain('data-add="2026-10-07"')
    expect(out).toContain('data-add="2026-10-11"')
    expect(out).not.toContain('data-add="2026-10-06"')
    expect(out).toContain('aria-label="New post on Wednesday 7 October"')
  })

  it('shows the "+" on hover and focus where the device hovers, and always where it cannot', () => {
    const days = rangeFor('week', '2026-10-07').days
    const out = html(<WeekGrid plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} onAdd={noop} />)
    const button = out.match(/<button[^>]*data-add="2026-10-07"[^>]*>/)?.[0] ?? ''
    expect(button).toContain('[@media(hover:hover)]:opacity-0')
    expect(button).toContain('[@media(hover:hover)]:group-hover:opacity-100')
    expect(button).toContain('focus-visible:opacity-100')
    expect(out).toMatch(/<section[^>]*class="group /)
  })

  it('takes no clicks where the Plan gives no onAdd', () => {
    const days = rangeFor('week', '2026-10-07').days
    expect(html(<WeekGrid plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} />)).not.toContain('data-add=')
  })

  // Review Focus 1: the click a drag's release fires over a day's empty space reaches the day, not the card. The tests
  // cannot drag, so the guard is read from the source: a new post from a day goes through the drag's consumeClick first.
  it('lets no drag release open a new post: the same guard as opening a card', () => {
    const source = fs.readFileSync(new URL('./PlanPage.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/const addOn = \(day: DateKey\) => \{\s*if \(drag\.consumeClick\(\) \|\| !canAdd\(day, today\)\) return/)
  })
})

describe('click-to-add in the month and the list', () => {
  it('puts a "+" in the corner of a month day from today on; the date number still opens the week', () => {
    const days = rangeFor('month', '2026-10-07').days
    const out = html(<MonthGrid plans={plansFor(days, [], [])} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop} onAdd={noop} />)
    expect(out).toContain('data-add="2026-10-07"')
    expect(out).not.toContain('data-add="2026-10-06"')
    expect(out).toMatch(/<button[^>]*data-add="2026-10-07"[^>]*class="[^"]*absolute right-1 top-1/)
    expect(out).toContain('aria-label="Wednesday 7 October"')
  })

  it('lists today and the days ahead with a "+" even when empty, and leaves out empty days already gone', () => {
    const days = rangeFor('list', '2026-10-07').days
    const out = html(<ListView plans={plansFor(days, [post(1, { scheduled_date: '2026-10-05' })], [])} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers} onAdd={noop} />)
    expect(out.match(/<section/g)).toHaveLength(6) // Monday (its post), then Wednesday to Sunday
    expect(out).not.toContain('list-2026-10-06')
    expect(out).toContain('data-add="2026-10-07"')
    expect(out).not.toContain('data-add="2026-10-05"')
    expect(out).toContain('Nothing planned')
  })
})

describe('best-time hints', () => {
  // Spec 2026-10-15 §5: an empty slot reads "Best around {{time}}".
  it('says when an empty slot is best posted, and nothing without a time', () => {
    expect(html(<SlotRow slot={{ date: '2026-10-07', platform: 'instagram' }} time="08:30" filling={false} aiPaused={false} onWrite={noop} onFill={noop} />)).toContain('Best around 08:30')
    expect(html(<SlotRow slot={{ date: '2026-10-07', platform: 'instagram' }} filling={false} aiPaused={false} onWrite={noop} onFill={noop} />)).not.toContain('Best around')
  })

  it('gives each slot of the week and of the list its platform\'s usual time', () => {
    const days = rangeFor('week', '2026-10-07').days
    const plans = plansFor(days, [], [{ date: '2026-10-08', platform: 'instagram' }])
    expect(html(<WeekGrid plans={plans} times={{ instagram: '19:00' }} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} />)).toContain('Best around 19:00')
    expect(html(<ListView plans={plans} times={{ instagram: '19:00' }} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers} />)).toContain('Best around 19:00')
  })
})

describe('GoalsLine', () => {
  // Spec 2026-10-15 §7: per platform "2 of 3 published · 1 planned", a met goal said in words, the streak and its nudge.
  it('says each platform\'s progress, a met goal in words, and the streak', () => {
    const out = html(<GoalsLine goals={{
      week: { from: '2026-10-05', to: '2026-10-11' },
      platforms: [{ platform: 'instagram', target: 3, published: 2, planned: 1 }, { platform: 'linkedin', target: 1, published: 1, planned: 0 }],
      streak: { weeks: 4, current_met: false, at_risk: false, short_by: 1 },
    }} />)
    expect(out).toContain('instagram: 2 of 3 published · 1 planned')
    expect(out).toMatch(/data-goal="linkedin" data-met="true"[\s\S]*?met</)
    expect(out).toContain('4-week streak')
    expect(out).toContain('Only posts marked published count.')
    expect(out).not.toContain('by Sunday')
  })

  it('from Friday, says how many more posts keep a running streak', () => {
    const out = html(<GoalsLine goals={{
      week: { from: '2026-10-05', to: '2026-10-11' },
      platforms: [{ platform: 'instagram', target: 3, published: 1, planned: 0 }],
      streak: { weeks: 4, current_met: false, at_risk: true, short_by: 2 },
    }} />)
    expect(out).toContain('Posts still needed by Sunday to keep your 4-week streak: 2')
  })
})

describe('a new post from the Plan before the brand is read', () => {
  // Release check (Task 11): the Plan sends a time only when it knows the channels; else the panel fills it once they arrive.
  it('leaves the time to the panel while the brand\'s channels are not read yet', () => {
    const source = fs.readFileSync(new URL('./PlanPage.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/panel\.openNew\(brandInfo\.data \? draft : \{ \.\.\.draft, time: undefined \}\)/)
    expect(source).toMatch(/time: brandInfo\.data \? times\[slot\.platform\] \?\? null : undefined/)
  })
})
