import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }))

const { AccessOffNotice } = await import('./AccessOffNotice')

describe('AccessOffNotice', () => {
  it('says why only when the API client sent the visitor here for that reason', () => {
    expect(renderToStaticMarkup(<AccessOffNotice reason="access_off" />)).toContain('Your access to this organisation has been switched off.')
    expect(renderToStaticMarkup(<AccessOffNotice reason={null} />)).toBe('')
    expect(renderToStaticMarkup(<AccessOffNotice reason="expired" />)).toBe('')
  })

  it('is said in all five languages', () => {
    for (const lang of ['en', 'ru', 'de', 'fr', 'es']) {
      const bundle = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../i18n/locales/${lang}/common.json`), 'utf8'))
      expect(typeof bundle.auth.access_off, lang).toBe('string')
    }
  })

  it('is shown on the sign-in screen', () => {
    const login = fs.readFileSync(path.resolve(__dirname, '../pages/Login.tsx'), 'utf8')
    expect(login).toContain("<AccessOffNotice reason={searchParams.get('reason')} />")
  })
})
