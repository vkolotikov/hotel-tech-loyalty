import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Voice } from '../lib/types'
import { changedFields } from './brandForms'
import { brandWith, profile, renderBrand } from './brandTesting'
import { SelectField, TagInput } from './inputs'
import { dnaForm, dnaProblems } from './sections/BrandDna'
import { PositioningSection, positioningFields, positioningForm } from './sections/Positioning'
import { RhythmSection, rhythmFields, rhythmForm } from './sections/Rhythm'
import { VoiceSection, voiceFields, voiceForm } from './sections/Voice'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const voice = {
  id: 1, tone: 'warm', style: 'Calm and close', formality_level: 'balanced', emoji_policy: 'light', hashtag_policy: null,
  sentence_style: 'short', point_of_view: 'brand', preferred_words: ['care'], forbidden_words: ['cheap'], claims_to_avoid: [],
  example_good_posts: null, example_bad_posts: null,
} as Voice

describe('VoiceSection', () => {
  // Plan C deferred: after a refused save the keyboard fell to the page; it goes to the first marked field, else Save.
  it('marks its Save button so a refusal can bring the keyboard back to the form', () => {
    expect(renderBrand(brandWith(), true, <VoiceSection brand={brandWith()} canEdit startOpen />)).toContain('data-section-save=""')
  })

  it('reads the voice in the reader\'s words', () => {
    const html = renderBrand(brandWith({ voice }), false, <VoiceSection brand={brandWith({ voice })} canEdit={false} />)
    expect(html).toContain('Warm')
    expect(html).toContain('A few')
    expect(html).toContain('Short sentences')
    expect(html).toContain('cheap')
  })

  it('shows a tone the list does not know as itself, pressed, so it is kept', () => {
    const odd = { ...voice, tone: 'Cosy and calm' }
    const html = renderBrand(brandWith({ voice: odd }), true, <VoiceSection brand={brandWith({ voice: odd })} canEdit startOpen />)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Cosy and calm</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Warm</)
  })

  it('sends only what the manager changed', () => {
    const brand = brandWith({ voice })
    expect(changedFields(voiceFields(voiceForm(brand)), voiceFields(voiceForm(brand)))).toEqual({})
    expect(changedFields(voiceFields(voiceForm(brand)), voiceFields({ ...voiceForm(brand), hashtag_policy: 'minimal' }))).toEqual({ hashtag_policy: 'minimal' })
  })
})

describe('PositioningSection', () => {
  it('reads positioning written as plain text, and never rewrites it unless edited', () => {
    const brand = brandWith({ profile: { ...profile, positioning: 'From quick cuts to healthy hair' as never } })
    const html = renderBrand(brand, false, <PositioningSection brand={brand} canEdit={false} />)
    expect(html).toContain('From quick cuts to healthy hair')
    // A valid definition list (Lighthouse): every row is one div of a dt and a dd, straight inside the dl.
    expect(html).not.toMatch(/<dl[^>]*>(?:(?!<\/dl>).)*<div[^>]*>\s*<div/s)
    expect(changedFields(positioningFields(positioningForm(brand)), positioningFields(positioningForm(brand)))).toEqual({})
  })

  it('saves the whole positioning when one part changes, keeping the parts it does not show', () => {
    const brand = brandWith({ profile: { ...profile, positioning: { old_way: 'Quick', extra: 'kept' } as never } })
    const changed = changedFields(positioningFields(positioningForm(brand)), positioningFields({ ...positioningForm(brand), beliefs: ['Care first'] }))
    expect(changed).toEqual({ positioning: { extra: 'kept', old_way: 'Quick', new_way: '', transformation: '', beliefs: ['Care first'] } })
  })
})

describe('RhythmSection', () => {
  it('lists a mix category the list does not know, so the total can be brought to 100 %', () => {
    const odd = brandWith({ profile: { ...profile, content_mix: { education: 50, seasonal_offers: 60 } } })
    const html = renderBrand(odd, true, <RhythmSection brand={odd} canEdit startOpen />)
    expect(html).toContain('Total 110 %')
    expect(html).toContain('seasonal_offers')
  })

  const brand = brandWith({ profile: { ...profile, weekly_rhythm: { monday: { role: 'proof', notes: 'Before and after' } }, content_mix: null, engagement_goals: ['bookings'], trend_mode: 'trend_aware' } })

  it('reads the week, the mix, the goals and the trends in the reader\'s words', () => {
    const html = renderBrand(brand, false, <RhythmSection brand={brand} canEdit={false} />)
    expect(html).toContain('Proof, a case')
    expect(html).toContain('Before and after')
    expect(html).toContain('The AI decides the mix.')
    expect(html).toContain('Bookings')
    expect(html).toContain('Trend-aware')
  })

  it('sends nothing for an untouched section, and an empty mix when the AI is to decide', () => {
    expect(changedFields(rhythmFields(rhythmForm(brand)), rhythmFields(rhythmForm(brand)))).toEqual({})
    const manual = { ...rhythmForm(brand), mixMode: 'manual' as const, mix: { education: 60, myths: 40 } }
    expect(changedFields(rhythmFields(rhythmForm(brand)), rhythmFields(manual))).toEqual({ content_mix: { education: 60, myths: 40 } })
  })

  it('offers the mix editor with its total and Balance', () => {
    const withMix = brandWith({ profile: { ...profile, content_mix: { education: 50, myths: 30 } } })
    const html = renderBrand(withMix, true, <RhythmSection brand={withMix} canEdit startOpen />)
    expect(html).toContain('Total 80 %')
    expect(html).toContain('Balance to 100 %')
  })
})

describe('fields the server cannot empty', () => {
  it('stops a Brand DNA save with no name, and marks the field', () => {
    expect(dnaProblems({ ...dnaForm(brandWith()), name: '  ' })).toEqual(['name'])
    expect(dnaProblems(dnaForm(brandWith()))).toEqual([])
  })

  it('offers no empty choice once a language is chosen', () => {
    const chosen = renderToStaticMarkup(<SelectField label="Language" value="en" options={[['en', 'English']]} empty="Choose a language" required onChange={() => {}} />)
    expect(chosen).not.toContain('Choose a language')
    const none = renderToStaticMarkup(<SelectField label="Language" value="" options={[['en', 'English']]} empty="Choose a language" required onChange={() => {}} />)
    expect(none).toContain('Choose a language')
  })
})

describe('lists with doubles', () => {
  it('shows a tag stored twice twice, each with its own remove button', () => {
    const html = renderToStaticMarkup(<TagInput label="Values" values={['Care', 'Care']} onChange={() => {}} />)
    expect(html.match(/aria-label="Remove Care"/g)).toHaveLength(2)
  })
})
