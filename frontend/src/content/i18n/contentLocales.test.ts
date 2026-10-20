import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ERRORS } from '../lib/errors'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const

/** Keys the code builds at run time (`content.status.${s}` and the like); src/i18n/localeCompleteness.test.ts sees only literal keys. */
const FAMILIES: Record<string, readonly string[]> = {
  platform: ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'],
  status: ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived'],
  'plan.view': ['week', 'month', 'list'],
  'generate.preset': ['this_week', 'next_week', 'this_month', 'custom'],
  'generate.problem': ['missing', 'order', 'too_long', 'past'],
  'panel.ai.rewrite_type': ['shorter', 'longer', 'professional', 'friendly', 'alternative'],
  'panel.ai.brief_field': ['visual_type', 'aspect_ratio', 'style', 'description', 'scene', 'mood', 'composition', 'text_overlay', 'avoid'],
  // Spec 2026-10-16 §3.1: a key date's kind (the day names themselves are tied to the server by DayWordsTest.php).
  'keydates.kind': ['holiday', 'marketing', 'industry', 'event', 'note'],
  'plan.add': ['post', 'template', 'note', 'event'],
  'ideas.column': ['idea', 'draft', 'review', 'ready'],
  // Spec 2026-10-16 §6.4: the approval steps in the timeline.
  'timeline.event': ['sent_for_approval', 'approved', 'sent_back', 'changed_after_approval'],
  // Spec §8: the bell's lines by kind.
  'bell.kind': ['waiting', 'approved', 'sent_back', 'comment', 'to_post', 'not_posted'],
  // Spec 2026-10-19 §5.5: what the panel says a save does to a short link.
  'links.note': ['pending', 'moving', 'clearing', 'off', 'reviving'],
  // Spec 2026-10-20 §4.2: what stops the promote dialog before anything is sent.
  'promote.dialog.problem': ['no_pages', 'too_many_pages', 'no_channels', 'per_page', 'per_week', 'too_many_posts', 'order', 'too_long', 'past'],
  ...Object.fromEntries(Object.entries(ERRORS).map(([family, words]) => [`${family}.error`, Object.keys(words)])),
}

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `content.${locale}.json`), 'utf8'))
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}
function flatten(o: unknown, prefix = ''): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

describe('content bundle', () => {
  for (const locale of LOCALES) {
    it(`${locale}: every key built at run time is translated`, () => {
      const json = bundle(locale)
      const missing = Object.entries(FAMILIES).flatMap(([family, keys]) =>
        keys.map(k => `${family}.${k}`).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() }))
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([])
    })

    it(`${locale}: no value is empty, and every {{name}} of the English text is kept`, () => {
      const json = bundle(locale)
      const en = bundle('en')
      expect(flatten(json).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() })).toEqual([])
      const names = (s: unknown) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
      const lost = flatten(en).filter(k => JSON.stringify(names(at(en, k))) !== JSON.stringify(names(at(json, k))))
      expect(lost, `${locale} changes the {{…}} names of: ${lost.join(', ')}`).toEqual([])
    })
  }

  // Final review (Plan 3B): "1 copies", "Ещё 5 поста", "1 Wochen in Folge". The bundles keep one key per word (no
  // _one/_few/_many), so a count stands where no noun has to agree with it: after a colon, or in brackets.
  it('every count reads right at 1, 2 and 5: no noun follows the number', () => {
    const COUNTED = ['plan.goals.at_risk', 'plan.goals.streak', 'panel.repeat.copies', 'panel.repeat.stop_confirm', 'brand.channels.per_week', 'ideas.see_all', 'panel.blanks', 'flags.comments', 'bell.label_count', 'versions.made', 'flags.versions', 'links.clicks', 'links.from_bio', 'links.bar', 'flags.clicks', 'bio.clicks_30d',
      // Release 6 (spec 2026-10-20 §5).
      'promote.numbers', 'promote.selected', 'promote.removed', 'promote.tab_articles', 'promote.tab_pages', 'promote.dialog.pages', 'promote.dialog.more',
      'promote.run.done', 'promote.run.writing', 'promote.run.stopped', 'site.scanned']
    for (const locale of LOCALES) {
      const json = bundle(locale)
      const wrong = COUNTED.filter(key => {
        // English "a 4-week streak" is a compound, right at every number; an abbreviation ("нед.") agrees with none.
        const text = String(at(json, key)).replace(/\{\{(count|weeks)\}\}-week streak/g, locale === 'en' ? 'N' : '$&')
        return /\{\{(count|weeks)\}\}[\s-]+\p{L}+(?![\p{L}.])/u.test(text)
      })
      expect(wrong, `${locale}: ${wrong.join(', ')}`).toEqual([])
    }
  })

  it('the five bundles carry exactly the same key set', () => {
    const en = flatten(bundle('en')).sort()
    for (const locale of LOCALES) expect(flatten(bundle(locale)).sort(), `${locale} keys differ from en`).toEqual(en)
  })
})
