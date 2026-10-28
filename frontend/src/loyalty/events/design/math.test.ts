import { describe, expect, it } from 'vitest'
import { bodyOf, newForm } from '../eventsMath'
import { eventChanges } from './math'
import { EVENT_DESIGN_WORDS } from './words'
import en from '../../i18n/eventdesign.en.json'
import ru from '../../i18n/eventdesign.ru.json'
import de from '../../i18n/eventdesign.de.json'
import fr from '../../i18n/eventdesign.fr.json'
import es from '../../i18n/eventdesign.es.json'

describe('Events editor integration', () => {
  it('updates only changed fields so another manager’s unrelated changes survive', () => {
    const body = bodyOf(newForm({ date: '2026-11-08', minutes: 720 }, false))
    expect(eventChanges(body, body)).toEqual({})
    expect(eventChanges({ ...body, capacity: 40, tier_ids: [2], admits: 'tiers' }, body)).toEqual({ capacity: 40, tier_ids: [2], admits: 'tiers' })
    expect(eventChanges({ ...body, location: null, points: 0 }, { ...body, location: 'Hall' })).toEqual({ location: null, points: 0 })
  })
  it('registers every Events design sentence and interpolation in all five languages', () => {
    expect(en).toEqual(EVENT_DESIGN_WORDS)
    const tokens = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort()
    for (const bundle of [ru,de,fr,es]) {
      expect(Object.keys(bundle).sort()).toEqual(Object.keys(en).sort())
      for (const [key, value] of Object.entries(en)) expect(tokens(bundle[key as keyof typeof bundle])).toEqual(tokens(value))
    }
  })
})
