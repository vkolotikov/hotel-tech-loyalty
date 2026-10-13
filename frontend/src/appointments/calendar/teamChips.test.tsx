import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TeamChips, toggleHidden } from './TeamChips'
import type { CalendarMaster } from '../lib/types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k }) }))

const COLOURS = ['#3b7dd8', '#c46f1b']
const masters = [
  { id: 1, name: 'Marie', title: null, avatar: null, days: {}, color: COLOURS[0] },
  { id: 2, name: 'Anouk', title: null, avatar: null, days: {}, color: COLOURS[1] },
] as CalendarMaster[]

describe('team chips', () => {
  it('hides and shows people, never the last one, and forgets people who are gone', () => {
    expect(toggleHidden([], 1, [1, 2])).toEqual([1])
    expect(toggleHidden([1], 1, [1, 2])).toEqual([])
    expect(toggleHidden([1], 2, [1, 2])).toEqual([1])      // 2 is the last one visible: stays
    expect(toggleHidden([9, 1], 2, [1, 2])).toEqual([1])    // 9 left the team: dropped, 2 is still the last
  })

  it('is a named group of pressed buttons with each person\'s colour and count', () => {
    const html = renderToStaticMarkup(<TeamChips masters={masters} hidden={[2]} counts={{ 1: 3, 2: 0 }} onToggle={() => {}} />)
    expect(html).toMatch(/role="group"[^>]*aria-label="Team on the calendar"/)
    expect(html).toMatch(/aria-pressed="true"[^>]*>[\s\S]*?Marie/)
    expect(html).toMatch(/aria-pressed="false"[^>]*>[\s\S]*?Anouk/)
    expect(html).toContain(`--a-m:${COLOURS[0]}`)
  })

  // In the browser, going to the next day showed "Marie 3" (the day before) while the strip above showed dashes.
  it('while the next day loads over the last one, shows a dash for each count, not the last day\'s numbers', () => {
    const counts = (html: string) => [...html.matchAll(/<span class="font-a-mono[^"]*">([^<]*)<\/span>/g)].map(m => m[1])
    expect(counts(renderToStaticMarkup(<TeamChips masters={masters} hidden={[]} counts={{ 1: 3, 2: 0 }} onToggle={() => {}} />))).toEqual(['3', '0'])
    const pending = renderToStaticMarkup(<TeamChips masters={masters} hidden={[]} counts={{ 1: 3, 2: 0 }} onToggle={() => {}} pending />)
    expect(counts(pending)).toEqual(['—', '—'])
    expect(pending).toMatch(/aria-pressed="true"[^>]*>[\s\S]*?Marie/) // the chips themselves still work
  })

  it('says it is busy while the next day loads, as the Today strip does, and only then', () => {
    const group = (html: string) => html.match(/<div[^>]*role="group"[^>]*>/)?.[0] ?? ''
    expect(group(renderToStaticMarkup(<TeamChips masters={masters} hidden={[]} counts={{}} onToggle={() => {}} pending />))).toContain('aria-busy="true"')
    expect(group(renderToStaticMarkup(<TeamChips masters={masters} hidden={[]} counts={{}} onToggle={() => {}} />))).not.toContain('aria-busy')
  })

  it('is given the calendar\'s loading state by the page', () => {
    const page = readFileSync(new URL('./CalendarPage.tsx', import.meta.url), 'utf8')
    expect(page).toMatch(/<TeamChips[\s\S]*?pending=\{query\.isPlaceholderData\}[\s\S]*?\/>/)
  })

  it('says why the last visible person cannot be hidden', () => {
    const html = renderToStaticMarkup(<TeamChips masters={masters} hidden={[2]} counts={{}} onToggle={() => {}} />)
    expect(html).toMatch(/aria-disabled="true"[^>]*title="At least one person stays on the calendar"[^>]*>[\s\S]*?Marie|title="At least one person stays on the calendar"[^>]*aria-disabled="true"/)
  })
})
