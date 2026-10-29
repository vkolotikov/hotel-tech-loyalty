import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { StatusChecks } from './SystemStatus'

describe('operational observations', () => {
  it('distinguishes failed, unavailable and unverified checks in every supported language', async () => {
    for (const language of ['en', 'de', 'fr', 'es', 'ru']) {
      await i18n.changeLanguage(language)
      const html = renderToStaticMarkup(<StatusChecks snapshot={{ checked_at: '2026-10-29T13:00:00Z', checks: [
        { key: 'email_failures', status: 'attention', count: 3 },
        { key: 'scheduler', status: 'unavailable' },
        { key: 'queue_delays', status: 'unobserved', count: 0 },
      ] }} />)
      expect(html).not.toMatch(/undefined|Invalid Date/)
      expect(html.match(/<h2/g)).toHaveLength(3)
      expect(html).toContain('2026-10-29T13:00:00Z')
    }
    await i18n.changeLanguage('en')
  })
})
