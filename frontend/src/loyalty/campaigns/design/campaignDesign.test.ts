import { describe, expect, it } from 'vitest'
import en from '../../i18n/campaigndesign.en.json'
import ru from '../../i18n/campaigndesign.ru.json'
import de from '../../i18n/campaigndesign.de.json'
import fr from '../../i18n/campaigndesign.fr.json'
import es from '../../i18n/campaigndesign.es.json'
import { QueryClient } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FormField } from '../../ui/formParts'
import { afterSegmentChange, audienceKey, campaignsKey } from '../api'
import { pushAudienceKey } from '../../push/api'
import { smsAudienceKey } from '../../sms/api'

describe('Campaign redesign contracts', () => {
  it('names a filled message field from its label rather than its content', () => {
    const html = renderToStaticMarkup(createElement(FormField, { label: 'Message', children: createElement('textarea', { defaultValue: 'Member-only message' }) }))
    const label = html.match(/<span id="([^"]+)"/)?.[1]
    expect(label).toBeTruthy()
    expect(html).toContain(`aria-labelledby="${label}"`)
    expect(html).toContain('Member-only message')
  })
  it('ships complete translations with the same interpolation variables in all five languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
    for (const locale of [ru, de, fr, es]) {
      expect(Object.keys(locale).sort()).toEqual(Object.keys(en).sort())
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(locale[key].trim()).not.toBe('')
        expect(vars(locale[key])).toEqual(vars(en[key]))
      }
    }
  })
  it('refreshes all affected channel audience counts after a saved segment changes', () => {
    const client = new QueryClient()
    const keys = [audienceKey(3), pushAudienceKey(4), smsAudienceKey(5), campaignsKey(1)]
    for (const key of keys) client.setQueryData(key, { count: 10 })
    afterSegmentChange(client)
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    client.clear()
  })
})
