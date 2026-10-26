import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // i18next's plural pick, as far as English needs it: the one-form fallback for a count of 1.
    t: (_k: string, fallback?: string, opts?: Record<string, unknown>) => {
      let text = opts && opts.count === 1 && typeof opts.defaultValue_one === 'string' ? opts.defaultValue_one : (fallback ?? _k)
      for (const [k, v] of Object.entries(opts ?? {})) text = text.split(`{{${k}}}`).join(String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))

import { StampCard } from './StampCard'
import { rewardPhrase, STAMP_COUNTED, STAMP_WORDS, stampFace, toGoPhrase } from './stampMath'
import type { MemberStamps } from './stampsApi'

const mine = (more: Partial<MemberStamps> = {}): MemberStamps => ({
  enabled: true,
  stamps_per_card: 10,
  reward: { kind: 'points', points: 1000 },
  card: { id: 4, number: 2, stamps_count: 7, stamps_needed: 10, completed_at: null, stamps: [] },
  completed_cards: 1,
  history: { stamps: [], cards: [] },
  ...more,
})

function render(data?: MemberStamps) {
  const client = new QueryClient()
  if (data) client.setQueryData(['portal-stamps'], data)
  return renderToStaticMarkup(<QueryClientProvider client={client}><StampCard /></QueryClientProvider>)
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the stamp card’s face', () => {
  it('is nothing while the venue does not use the stamp card', () => {
    expect(stampFace(undefined)).toBeNull()
    expect(stampFace({ enabled: false })).toBeNull()
  })

  it('a circle per stamp the card needs, filled for each visit, and how many are left', () => {
    const face = stampFace(mine())!
    expect(face.filled).toEqual([true, true, true, true, true, true, true, false, false, false])
    expect([face.count, face.needed, face.left, face.completed]).toEqual([7, 10, 3, 1])
  })

  it('before the first stamp of a card, an empty card of the venue’s size', () => {
    const face = stampFace(mine({ card: null, stamps_per_card: 6 }))!
    expect(face.filled).toEqual([false, false, false, false, false, false])
    expect(face.left).toBe(6)
  })

  it('says how many visits are left and what a full card gives, plural forms by count', () => {
    expect(toGoPhrase(stampFace(mine())!)).toEqual({ key: 'portal.stamps.to_go', fallback: STAMP_COUNTED.to_go[1], options: { count: 3, defaultValue_one: STAMP_COUNTED.to_go[0] } })
    expect(toGoPhrase(stampFace(mine({ card: { id: 4, number: 2, stamps_count: 10, stamps_needed: 10, completed_at: null, stamps: [] } }))!).key).toBe('portal.stamps.full')
    expect(rewardPhrase(stampFace(mine())!, 'en').options).toEqual({ count: 1000, defaultValue_one: STAMP_COUNTED.reward_points[0], points: '1,000' })
    expect(rewardPhrase(stampFace(mine({ reward: { kind: 'reward', reward_id: 3, reward_name: 'Coffee' } }))!, 'en'))
      .toEqual({ key: 'portal.stamps.reward_free', fallback: STAMP_WORDS.reward_free, options: { reward: 'Coffee' } })
  })
})

describe('the stamp card on Home', () => {
  it('draws the circles with the visits left and the reward, the count only in the circles’ label', () => {
    const html = render(mine())
    expect(html.match(/data-filled=""/g)?.length).toBe(7)
    expect(html.match(/w-8 h-8 rounded-full/g)?.length).toBe(10)
    expect(html).toContain('aria-label="7 of 10 stamps"')
    const words = text(html)
    expect(words).toContain('Stamp card')
    expect(words).not.toContain('7 of 10')
    expect(words).toContain('3 more visits to your reward')
    expect(words).toContain('Your reward: 1,000 points')
    expect(words).toContain('Cards completed: 1')
  })

  it('one visit left reads in the singular; a free reward names it', () => {
    const words = text(render(mine({ card: { id: 4, number: 2, stamps_count: 9, stamps_needed: 10, completed_at: null, stamps: [] }, reward: { kind: 'reward', reward_id: 3, reward_name: 'Coffee' }, completed_cards: 0 })))
    expect(words).toContain('1 more visit to your reward')
    expect(words).toContain('Your reward: a free Coffee')
    expect(words).not.toContain('Cards completed')
  })

  it('shows nothing while off, or before the answer arrives', () => {
    expect(render({ enabled: false })).toBe('')
    expect(render()).toBe('')
  })
})

describe('the stamp card’s bundles (portal.stamps)', () => {
  const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const
  const bundle = (l: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../i18n/stamps.${l}.json`), 'utf8')) as Record<string, string>
  const holes = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()

  it('the five carry the same keys, none empty, every placeholder kept', () => {
    const en = bundle('en')
    for (const l of LOCALES) {
      const b = bundle(l)
      expect(Object.keys(b).sort(), l).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(b)) {
        expect(v.trim(), `${l}:${k}`).not.toBe('')
        expect(holes(v), `${l}:${k}`).toEqual(holes(en[k]))
      }
    }
  })

  it('the English is the code’s, and every plural family has its four forms', () => {
    const en = bundle('en')
    for (const [k, v] of Object.entries(STAMP_WORDS)) expect(en[k], k).toBe(v)
    for (const [k, [one, other]] of Object.entries(STAMP_COUNTED)) {
      expect([en[`${k}_one`], en[`${k}_other`]], k).toEqual([one, other])
      for (const l of LOCALES) for (const form of ['one', 'few', 'many', 'other']) expect(typeof bundle(l)[`${k}_${form}`], `${l}:${k}_${form}`).toBe('string')
      expect(en[k], `${k} is a plural family only`).toBeUndefined()
    }
  })
})
