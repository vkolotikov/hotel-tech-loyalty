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
import { TrayList } from './Tray'
import { FilterRow } from './FilterRow'
import { UnscheduledChip } from './UnscheduledChip'
import { WeekGrid } from './WeekGrid'
import { NumbersLine } from './NumbersLine'
import { PlanLegend } from './PlanLegend'

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
    // The name follows what the card shows (platform, time, its status, then its words: WCAG 2.5.3, Lighthouse).
    expect(out).toContain('aria-label="instagram 09:30: draft, Hook 1"')
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
    expect(timed).toContain('aria-label="instagram 09:30: draft, Hook 4"')
    expect(html(<PostCardView post={post(6)} onOpen={noop} onPointerDown={noop} />)).toContain('aria-label="instagram: draft, Hook 6"')
    const tray = html(<PostCardView post={post(5, { scheduled_date: null })} size="tray" onOpen={noop} onPointerDown={noop} />)
    expect(tray).not.toContain('aria-describedby')
  })

  // Release 7a (spec 2026-10-21 §6.4): the owner's month cards.
  it('draws a month card on the brand-tinted fill: its mark, time and status word, then up to four lines of its hook', () => {
    const out = html(<PostCardView post={post(7, { scheduled_time: '09:00', hook: 'You do not need a finished design' })} size="month" onOpen={noop} />)
    expect(out).toMatch(/class="[^"]*\bc-card\b/)
    expect(out).toContain('09:00')
    expect(out).toMatch(/data-status="draft"[^>]*>draft<\/span>/)
    expect(out).toMatch(/line-clamp-4[^"]*">You do not need a finished design/)
    expect(out).not.toContain('<img')
  })

  it('fills the open post\'s card with the brand, its secondary text on the ink', () => {
    const out = html(<PostCardView post={post(8, { scheduled_time: '09:00' })} size="month" selected onOpen={noop} />)
    expect(out).toMatch(/aria-current="true"[^>]*class="[^"]*bg-gradient-to-br from-a-accent to-a-accent-deep text-a-accent-ink/)
    expect(out).not.toMatch(/class="[^"]*\bc-card\b/)
    // Final review: at 80 % the ink read 2.9–3.6:1 on the default blue; the time and status take the ink itself.
    expect(out).not.toContain('text-a-accent-ink/80')
  })

  // Release check (Lighthouse, label in name): a month or week card shows its status before its words, so its name says
  // them in that order; a one-line card shows the status last, and its name too.
  it('names a card in the order it shows: the status before the words on a month or week card, after them on one line', () => {
    expect(html(<PostCardView post={post(11, { scheduled_time: '09:00' })} size="month" onOpen={noop} />)).toContain('aria-label="instagram 09:00: draft, Hook 11"')
    expect(html(<PostCardView post={post(12)} size="week" onOpen={noop} />)).toContain('aria-label="instagram: draft, Hook 12"')
    expect(html(<PostCardView post={post(13, { scheduled_time: '09:00' })} size="list" onOpen={noop} />)).toContain('aria-label="instagram 09:00: Hook 13, draft"')
  })

  // Release check (Lighthouse, label in name): the card's text is its parts with spaces between them (as its name says
  // them), and the mark's two letters are drawn by the stylesheet, not text a label has to repeat.
  it('reads as its name does: platform, time, status and words, spaced, without the mark\'s letters', () => {
    const out = html(<PostCardView post={post(14, { scheduled_time: '09:00' })} size="month" onOpen={noop} />)
    expect(out.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).toBe('instagram 09:00 draft Hook 14')
    expect(out).toMatch(/<span aria-hidden="true" data-short="ig" class="c-mark-short"><\/span>/)
  })

  // Final review: with the panel docked a day is 96–107 px wide, and "Needs review" ran into the next day ("Ne").
  it('lets the status word go under the mark and time when a day is too narrow, never past the card', () => {
    const out = html(<PostCardView post={post(10, { scheduled_time: '09:00', status: 'needs_review' })} size="month" onOpen={noop} />)
    expect(out).toMatch(/<span class="[^"]*\bflex-wrap\b/)
    const word = out.match(/<span data-status="needs_review"[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(word.split(' ')).toEqual(expect.arrayContaining(['ml-auto', 'max-w-full', 'truncate']))
    expect(word.split(' ')).not.toContain('shrink-0')
  })

  it('draws a list card in one line and a tray card in one line', () => {
    expect(html(<PostCardView post={post(9, { scheduled_time: '10:00' })} size="list" onOpen={noop} />)).toMatch(/truncate[^"]*">Hook 9</)
    expect(html(<PostCardView post={post(9)} size="tray" onOpen={noop} />)).toMatch(/truncate[^"]*">Hook 9</)
  })

  it('gives the words the card\'s whole width under the mark, time and status, clamped to six lines in a week, so a narrow day cuts no word', () => {
    const out = html(<PostCardView post={post(3, { scheduled_time: '09:30' })} onOpen={noop} />)
    const words = out.match(/<span class="([^"]*)">Hook 3<\/span>/)?.[1] ?? ''
    expect(words).toContain('line-clamp-6')
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

// Release 7a (spec 2026-10-21 §6.1): the period's numbers, one line under the Plan's title.
describe('NumbersLine', () => {
  it('says the numbers of the period in one line, and a dash for each until they are known', () => {
    expect(html(<NumbersLine figures={{ planned: 12, ready: 3, published: 5, open_slots: 2 }} pending={false} />)).toContain('Planned: 12 · Ready: 3 · Published: 5 · Empty slots: 2')
    expect(html(<NumbersLine figures={undefined} pending />)).toContain('Planned: – · Ready: – · Published: – · Empty slots: –')
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

  // Release 7a (spec 2026-10-21 §6.4): the owner's month — dimmed other months with their month, today, the open day.
  it('dims the days of another month and names their month, marks today, and outlines the open post\'s day', () => {
    const plans = plansFor(rangeFor('month', '2026-10-07').days, [post(1, { scheduled_date: '2026-10-07' })], [])
    const out = html(<MonthGrid plans={plans} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={1} dropDate={null} onDay={noop} onOpen={noop} />)
    expect(out).toMatch(/text-a-text-2[^>]*>28<\/button>(?:(?!data-drop-date).)*?>Sept?</s)
    expect(out).toMatch(/aria-current="date"[^>]*class="[^"]*rounded-full bg-a-accent[\s\S]*?>Today</)
    expect(out).toMatch(/data-drop-date="2026-10-07"[^>]*class="[^"]*ring-a-accent-text/)
    expect(out).toMatch(/<div class="[^"]*bg-a-surface[^"]*font-a-mono[^"]*">Mon<\/div>/)
  })
})

describe('PlanLegend', () => {
  it('says Draft and Key date under the grid, and how to open a post while none is open', () => {
    expect(html(<PlanLegend open={false} />)).toMatch(/Draft[\s\S]*Key date[\s\S]*Select a post to review its details/)
    expect(html(<PlanLegend open />)).not.toContain('Select a post')
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

// Release 7a (spec 2026-10-21 §6.2): the tray is the "Unscheduled (n)" chip's list; the chip is the drop target.
describe('Unscheduled', () => {
  it('is a chip with its count, the drop target for "no day", that opens its list', () => {
    const out = html(<UnscheduledChip posts={[post(1, { scheduled_date: null }), post(2, { scheduled_date: null })]} total={2} active={false} selectedId={null} onOpen={noop} />)
    expect(out).toMatch(/data-drop="tray"[^>]*aria-expanded="false"[^>]*>[\s\S]*?Unscheduled \(2\)/)
    expect(html(<UnscheduledChip posts={[]} active selectedId={null} onOpen={noop} />)).toMatch(/data-drop="tray"[^>]*class="[^"]*border-a-accent-text/)
  })

  it('lists the posts with no day, says when it is empty, and when it shows only part of them with the way to all', () => {
    expect(html(<TrayList posts={[post(1, { scheduled_date: null })]} selectedId={null} onOpen={noop} />)).toContain('Hook 1')
    expect(html(<TrayList posts={[]} selectedId={null} onOpen={noop} />)).toContain('Drag a post here')
    const out = html(<MemoryRouter><TrayList posts={[post(1, { scheduled_date: null }), post(2, { scheduled_date: null })]} total={102} selectedId={null} onOpen={noop} /></MemoryRouter>)
    expect(out).toContain('Showing 2 of 102')
    expect(out).toMatch(/<a[^>]*href="\/content\/posts\?unscheduled=1"[^>]*>See all<\/a>/)
  })
})

describe('FilterRow', () => {
  const row = {
    platforms: ['linkedin' as const, 'instagram' as const], filter: { platforms: ['linkedin' as const], status: 'all' as const },
    statuses: ['draft' as const, 'published' as const], onFilter: noop, keyDates: true, onKeyDates: noop, unscheduled: <span data-unscheduled="" />,
  }

  it('draws a chip per channel with its mark, and a tick while it shows', () => {
    const out = html(<FilterRow {...row} />)
    expect(out).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*linkedin(?:(?!<\/button>).)*data-tick=""/s)
    expect(out).toMatch(/aria-pressed="false"[^>]*>(?:(?!<\/button>).)*instagram<\/button>/s)
  })

  // Final review: with no filter every channel shows, so every chip is ticked (they all looked switched off).
  it('ticks every chip while no channel is hidden', () => {
    const out = html(<FilterRow {...row} filter={{ platforms: [], status: 'all' }} />)
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(2)
    expect(out.match(/data-tick=""/g)).toHaveLength(2)
  })

  it('offers Status as a menu chip that names the choice, Unscheduled, and Key dates as a switch', () => {
    expect(html(<FilterRow {...row} />)).toMatch(/aria-haspopup="menu"[^>]*>[\s\S]*?Status</)
    const out = html(<FilterRow {...row} filter={{ platforms: [], status: 'draft' }} />)
    expect(out).toMatch(/aria-haspopup="menu"[^>]*>[\s\S]*?Status: draft/)
    expect(out).toContain('data-unscheduled=""')
    expect(out).toMatch(/role="switch"[^>]*aria-checked="true"[\s\S]*?Key dates/)
  })
})

describe('Toolbar', () => {
  const base = {
    view: 'week' as const, label: '5 Oct – 11 Oct 2026', refreshing: false,
    onPrev: noop, onNext: noop, onToday: noop, onView: noop, onGenerate: noop,
  }

  it('names the range, offers the views, and Generate only to managers — the chips are the filter row\'s', () => {
    const out = html(<Toolbar {...base} viewLocked={false} canGenerate />)
    expect(out).toContain('5 Oct – 11 Oct 2026')
    expect(out).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>Week</)
    expect(out).not.toContain('linkedin')
    expect(out).toContain('Generate')
    expect(html(<Toolbar {...base} viewLocked={false} canGenerate={false} />)).not.toContain('Generate')
  })

  // Release 7a (spec 2026-10-21 §6.3): the owner's calendar bar.
  it('draws the period in the display face, back, forward and Today, then Generate and the views grouped', () => {
    const out = html(<Toolbar {...base} view="month" label="October 2026" viewLocked={false} canGenerate />)
    expect(out).toMatch(/<h2[^>]*font-a-display[^>]*>October 2026<\/h2>/)
    expect(out).toMatch(/aria-label="Previous"[\s\S]*aria-label="Next"[\s\S]*>Today</)
    expect(out).toMatch(/data-views=""[\s\S]*c-ai[\s\S]*Generate[\s\S]*role="radiogroup"[\s\S]*>Month<[\s\S]*>Week<[\s\S]*>List</)
    expect(out).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*tabindex="0"[^>]*>Month</)
    expect(out).toMatch(/role="radio"[^>]*aria-checked="false"[^>]*tabindex="-1"[^>]*>Week</)
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
    expect(out).toContain('aria-label="Add to Wednesday 7 October"')
    expect(out).toMatch(/<button[^>]*aria-haspopup="true"[^>]*data-add="2026-10-07"/)
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
    expect(source).toMatch(/const addOn = \(day: DateKey, choice: AddChoice = 'post'\) => \{\s*if \(drag\.consumeClick\(\) \|\| !canAdd\(day, today\)\) return/)
  })
})

describe('click-to-add in the month and the list', () => {
  it('puts a "+" in the corner of a month day from today on; the date number still opens the week', () => {
    const days = rangeFor('month', '2026-10-07').days
    const out = html(<MonthGrid plans={plansFor(days, [], [])} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop} onAdd={noop} />)
    expect(out).toContain('data-add="2026-10-07"')
    expect(out).not.toContain('data-add="2026-10-06"')
    expect(out).toMatch(/<div class="absolute right-1 top-1"><div data-menu="" data-side="below" data-align="right" class="relative[^"]*"><button[^>]*data-add="2026-10-07"/)
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

describe('key dates in the three views (spec 2026-10-16 §3.4)', () => {
  const holiday = { id: 'christmas', kind: 'holiday' as const, date: '2026-10-08', substitute: false, name_en: 'Christmas Day' }
  const pastNote = { id: 5, kind: 'note' as const, title: 'Photographer', details: null, start: '2026-10-05', end: null }

  it('puts a day’s chips under its name in the week and in the list — a past day too', () => {
    const days = rangeFor('week', '2026-10-07').days
    const keyDates = { '2026-10-08': [holiday], '2026-10-05': [pastNote] }
    const week = html(<WeekGrid plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers}
      keyDates={keyDates} observed={false} onKeyDate={noop} />)
    expect(week).toContain('aria-label="Public holiday: Christmas Day"')
    expect(week).toContain('aria-label="Note: Photographer"')
    // The list shows a past day that holds only a chip.
    const list = html(<ListView plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers}
      keyDates={keyDates} observed={false} onKeyDate={noop} />)
    expect(list).toContain('list-2026-10-05')
    expect(list).toContain('Photographer')
  })

  it('shows the first chip and how many more in a month day', () => {
    const days = rangeFor('month', '2026-10-07').days
    const out = html(<MonthGrid plans={plansFor(days, [], [])} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop}
      keyDates={{ '2026-10-08': [holiday, { ...pastNote, start: '2026-10-08' }] }} observed={false} onKeyDate={noop} />)
    expect(out).toContain('Christmas Day')
    // Final review: a plain span let the click reach the day (a new post) and no keyboard could reach the rest.
    expect(out).toMatch(/<button[^>]*>\+1 more<\/button>/)
  })
})

// Release check (Plan 4A-2 Task 12, eyes): at the foot of a week day the "+" menu opened downward, past the bottom of the
// calendar's scroll box, so it could not be seen without scrolling.
describe('the "+" menu opens where it can be seen', () => {
  it('opens upward from the foot of a week day, and from a month day in the last two weeks', () => {
    const week = html(<WeekGrid plans={plansFor(rangeFor('week', '2026-10-07').days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} onAdd={noop} />)
    expect(week).toMatch(/<div data-menu="" data-side="above"[^>]*><button[^>]*data-add="2026-10-07"/)
    const days = rangeFor('month', '2026-10-07').days
    const month = html(<MonthGrid plans={plansFor(days, [], [])} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop} onAdd={noop} />)
    expect(month).toMatch(/<div data-menu="" data-side="below"[^>]*><button[^>]*data-add="2026-10-07"/)
    expect(month).toMatch(new RegExp(`<div data-menu="" data-side="above"[^>]*><button[^>]*data-add="${days[days.length - 1]}"`))
  })

  // The same release check: on Sunday the week's menu ran past the calendar's right edge ("From a template…" was cut);
  // a month Monday's menu, opening leftward from its corner "+", would run past the left edge.
  it('opens toward the calendar: leftward at the week’s end, rightward from a month Monday', () => {
    const week = html(<WeekGrid plans={plansFor(rangeFor('week', '2026-10-07').days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} onAdd={noop} />)
    expect(week).toMatch(/<div data-menu="" data-side="above" data-align="left"[^>]*><button[^>]*data-add="2026-10-07"/)
    expect(week).toMatch(/<div data-menu="" data-side="above" data-align="right"[^>]*><button[^>]*data-add="2026-10-11"/)
    const month = html(<MonthGrid plans={plansFor(rangeFor('month', '2026-10-07').days, [], [])} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop} onAdd={noop} />)
    expect(month).toMatch(/<div data-menu="" data-side="below" data-align="left"[^>]*><button[^>]*data-add="2026-10-12"/)
    expect(month).toMatch(/<div data-menu="" data-side="below" data-align="right"[^>]*><button[^>]*data-add="2026-10-07"/)
  })
})

// Final review (Plan 4A-2): in the list, the last day's "+" menu opened below, out of the calendar's scroll box.
describe('the list view\'s "+" menus', () => {
  it('open upward from the last day shown, downward elsewhere', () => {
    const days = rangeFor('week', '2026-10-07').days
    const out = html(<ListView plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers} onAdd={noop} />)
    expect(out).toMatch(/<div data-menu="" data-side="below"[^>]*><button[^>]*data-add="2026-10-07"/)
    expect(out).toMatch(/<div data-menu="" data-side="above"[^>]*><button[^>]*data-add="2026-10-11"/)
  })
})
