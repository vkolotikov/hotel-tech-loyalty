import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { LiveLook } from '../lib/look'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))
vi.mock('../../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))
vi.mock('../../i18n', () => ({ SUPPORTED_LANGUAGES: [{ code: 'en', label: 'English' }, { code: 'ru', label: 'Русский' }] }))

import { FrameFooter, HelpList, PersonList, PhoneMenu, SettingsPanel } from './FrameFooter'

const look = (rail: 'full' | 'slim' = 'full'): LiveLook => ({ theme: 'dark', rail, resolved: 'dark', setTheme: () => {}, setRail: () => {} })
const wrap = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)
const props = { look: look(), fullAdmin: '/marketing' as string | null, person: 'Ada Lovelace', role: 'manager' as string | null, onLeave: () => true, onShortcuts: () => {}, onFind: () => {} }

describe('the side panel\'s foot (spec 2026-10-21 §4.1)', () => {
  it('offers Settings, Help & resources and the person with their role', () => {
    const html = wrap(<FrameFooter {...props} />)
    expect(html).toMatch(/aria-expanded="false"[^>]*>[\s\S]*?Settings/)
    expect(html).toMatch(/aria-haspopup="menu"[^>]*>[\s\S]*?Help &amp; resources/)
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Manager')
  })

  it('keeps every name while slim, for a screen reader and as the label beside the icon', () => {
    const html = wrap(<FrameFooter {...props} look={look('slim')} />)
    expect(html).toMatch(/data-tip="Settings"/)
    expect(html).toMatch(/<span class="sr-only">Settings<\/span>/)
  })

  it('opens Settings on the theme switch, the language and Full admin — only where there is one', () => {
    expect(wrap(<SettingsPanel {...props} />)).toContain('Full admin')
    expect(wrap(<SettingsPanel {...props} fullAdmin={null} />)).not.toContain('Full admin')
    const html = wrap(<SettingsPanel {...props} fullAdmin={null} />)
    expect(html).toContain('Language')
    expect(html).toMatch(/Light[\s\S]*Dark[\s\S]*Auto/)
  })

  it('lists Keyboard shortcuts and Find under Help & resources, as menu items', () => {
    const html = wrap(<HelpList onShortcuts={() => {}} onFind={() => {}} />)
    expect(html).toMatch(/role="menuitem"[^>]*>[\s\S]*?Keyboard shortcuts/)
    expect(html).toMatch(/role="menuitem"[^>]*>[\s\S]*?Find/)
  })

  it('lists Collapse menu and Sign out for the person, and Expand menu while slim', () => {
    expect(wrap(<PersonList look={look()} onLeave={() => true} />)).toMatch(/Collapse menu[\s\S]*Sign out/)
    expect(wrap(<PersonList look={look('slim')} onLeave={() => true} />)).toContain('Expand menu')
  })

  it('puts the same groups in the phone menu', () => {
    const html = wrap(<PhoneMenu {...props} />)
    for (const words of ['Ada Lovelace', 'Light', 'Language', 'Full admin', 'Keyboard shortcuts', 'Find', 'Sign out']) expect(html).toContain(words)
    expect(html).not.toContain('Collapse menu')
  })
})
