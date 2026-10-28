import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

import { LoyaltyContext } from '../LoyaltyProvider'
import { overviewScope } from '../overview/overviewMath'
import type { Bootstrap, Can, Features } from '../lib/types'
import { CURRENCY_KEY, LOOK_KEY, WALLET_KEY } from './api'
import { AppPage } from './AppPage'
import { CurrencyEditor } from './CurrencyTab'
import type { CurrencyPreview, LookAnswer, Wallet } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: false, redeem: false, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const boot = (c: Can, features: Features = { campaigns: true, wallet: true, push: true }): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière Spa', industry: 'beauty' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features,
  staff: { id: 5, name: 'Ada', role: c.manage_app ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', min_points: 0, is_active: true }, { id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true }] },
  counts: { members: 40, requests_waiting: 2 },
})
const wallet: Wallet = {
  apple_pass_type_id: 'pass.com.lumiere.members', apple_team_id: null, apple_organization_name: 'Lumière',
  apple_pass_background_color: 'rgb(13,13,13)', apple_pass_foreground_color: 'rgb(255,255,255)', apple_pass_label_color: 'gold',
  apple_cert_uploaded: true, apple_cert_password_set: true, apple_wwdr_uploaded: false, apple_ready: false,
  google_issuer_id: '3388000000012345', google_class_suffix: 'members', google_service_account_uploaded: true, google_ready: true, is_active: true,
  apple_missing: ['team_id', 'wwdr', 'new_rule'], google_missing: [],
}
const GOLD = { primary: '#c9a84c', background: '#0d0d0d', surface: '#161616', secondary: '#1e1e1e', text: '#ffffff', text_secondary: '#8e8e93', border: '#2c2c2c', success: '#32d74b', error: '#ff375f', warning: '#ffd60a', info: '#0a84ff' }
const look: LookAnswer = {
  look: { colors: { ...GOLD, primary: '#C9A84C' }, card_style: 'glass', radius: 20, button_style: 'outline', accent_intensity: 'bold', preset: 'gold_classic', logo_url: '/storage/org-1/logos/logo.png' },
  options: {
    colors: Object.keys(GOLD), card_styles: ['gradient', 'solid', 'glass'], button_styles: ['filled', 'outline', 'soft'], accent_intensities: ['subtle', 'vibrant', 'bold'],
    radius: { min: 0, max: 32 },
    presets: [{ key: 'gold_classic', name: 'Gold Classic', colors: GOLD }, { key: 'royal_sapphire', name: 'Royal Sapphire', colors: { ...GOLD, primary: '#3b82f6' } }],
    logo: { max_kb: 4096, max_edge: 4096, types: ['image/jpeg', 'image/png', 'image/webp'] },
  },
}

const render = (search: string, c: Can, features?: Features) => {
  const client = new QueryClient()
  const scope = overviewScope(boot(c, features))
  client.setQueryData([...WALLET_KEY, scope], { wallet })
  client.setQueryData([...LOOK_KEY, scope], look)
  client.setQueryData([...CURRENCY_KEY, scope], { currency: 'EUR', options: ['EUR', 'GBP', 'USD'] })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/loyalty/app?view=detailed${search.replace('?', '&')}`]}>
        <LoyaltyContext.Provider value={{ data: boot(c, features), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <AppPage />
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const manager = can({ manage_app: true })

describe('Card & app (release 2 §7)', () => {
  it('tells a staff member who opens it by address that it is a manager\'s, and shows nothing else', () => {
    const html = render('?tab=app', can({ manage_rewards: true, manage_program: true }))
    expect(text(html)).toContain('The wallet pass and the member app’s look are set by an owner or a manager.')
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('Pass Type ID')
  })

  it('shows the two tabs, the address\'s selected and the only tab stop', () => {
    const html = render('?tab=app', manager)
    // Release 10: each tab is a card in its colour with a line of what it holds.
    expect(html).toMatch(/role="tab" id="app-tab-app" aria-selected="true"[^>]*tabindex="0"[^>]*data-hue="tier"[\s\S]*?<span>Member app<\/span>[\s\S]*?The member app’s colours and logo/)
    expect(html).toMatch(/role="tab" id="app-tab-wallet" aria-selected="false"[^>]*tabindex="-1"[^>]*data-hue="gift"[\s\S]*?<span>Wallet pass<\/span>[\s\S]*?The card in Apple and Google Wallet/)
    expect(render('', manager)).toMatch(/id="app-tab-wallet" aria-selected="true"/)
  })

  it('says calmly that the plan has no wallet passes, without a form', () => {
    const html = render('', manager, { campaigns: true, wallet: false, push: true })
    expect(text(html)).toContain('Your plan does not include wallet passes')
    expect(html).not.toContain('Pass Type ID')
    expect(html).toContain('role="status"')
  })

  it('shows each pass ready or exactly what it lacks, the fields, the colours as Apple stores them, and a stored colour Apple cannot read', () => {
    const html = render('', manager)
    const words = text(html)
    expect(words).toMatch(/Apple Wallet Not ready Still needed: The Team ID\. Apple’s WWDR certificate\. new_rule/)
    expect(words).toContain('Google Wallet Ready Members can add their card.')
    expect(html).toContain('value="pass.com.lumiere.members"')
    expect(html).toContain('value="3388000000012345"')
    expect(words).toContain('Saved as rgb(13,13,13)')
    expect(html).toContain('value="#0d0d0d"')
    expect(html).toContain('value="gold"')
    expect(words).toContain('Choose a colour, or type one as #rrggbb.')
    expect(html).toMatch(/type="checkbox"[^>]*checked=""/)
  })

  it('lists the three files as there or not, with Replace over one that is there, and never a path or a secret', () => {
    const html = render('', manager)
    const words = text(html)
    expect(html).toMatch(/data-file="apple_cert"[\s\S]*?Uploaded[\s\S]*?Password saved[\s\S]*?Replace…/)
    expect(html).toMatch(/data-file="apple_wwdr"[\s\S]*?Not uploaded[\s\S]*?Upload…/)
    expect(html).toMatch(/data-file="google_service_account"[\s\S]*?Uploaded[\s\S]*?Replace…/)
    expect(words).not.toMatch(/wallet\/|\.p12"|password"/)
    expect(html).not.toContain('type="password"')
  })

  it('shows the presets, the chosen one pressed, every colour, the styles and the logo', () => {
    const html = render('?tab=app', manager)
    const words = text(html)
    expect(html).toMatch(/aria-pressed="true" data-preset="gold_classic"/)
    expect(html).toMatch(/aria-pressed="false" data-preset="royal_sapphire"/)
    expect(words).toContain('Gold Classic Warm gold on near black.')
    expect(html.match(/data-colour=""/g)).toHaveLength(11)
    for (const label of ['Accent', 'Quiet text', 'Second surface', 'Information']) expect(words).toContain(label)
    expect(html).toContain('value="#c9a84c"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Glass</)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Outline</)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Bold</)
    expect(words).toContain('20 px')
    expect(html).toMatch(/<img src="\/storage\/org-1\/logos\/logo.png" alt="The venue’s logo" loading="lazy"/)
    expect(words).toContain('Replace logo')
    expect(words).not.toContain('Not saved yet.')
  })

  it('draws the phone preview with the form\'s colours: a glass card, an outlined button, the top tier and the logo', () => {
    const html = render('?tab=app', manager)
    const svg = html.slice(html.indexOf('data-preview'))
    expect(svg).toContain('fill="#0d0d0d"')
    expect(svg).toMatch(/rx="20" fill="#c9a84c" fill-opacity="0.15" stroke="#c9a84c" stroke-opacity="0.3"/)
    expect(svg).toMatch(/rx="14" fill="none" fill-opacity="0" stroke="#c9a84c" stroke-width="2"/)
    expect(svg).toContain('Gold member')
    expect(svg).toContain('href="/storage/org-1/logos/logo.png"')
    expect(svg).toContain('Lumière Spa')
    expect(html).toMatch(/role="img" aria-labelledby="[^"]+"/)
  })
})

describe('Card & app: the currency (release 4, R4-5)', () => {
  const editor = (preview: CurrencyPreview | null = null) => renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <CurrencyEditor answer={{ currency: 'EUR', options: ['EUR', 'GBP', 'USD'] }} initialPreview={preview} />
    </QueryClientProvider>,
  )

  it('is the third tab, and shows the venue\'s currency chosen from the server\'s list', () => {
    const html = render('?tab=currency', manager)
    expect(html).toMatch(/role="tab" id="app-tab-currency" aria-selected="true"[^>]*tabindex="0"[^>]*data-hue="earn"[\s\S]*?<span>Currency<\/span>/)
    expect(html).toContain('<option value="EUR" selected="">EUR · Euro</option>')
    expect(html).toContain('<option value="GBP">GBP · British Pound</option>')
    expect(text(html)).toContain('Changing it relabels prices; it never converts them.')
    // Nothing chosen yet: Save does nothing.
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Save currency<\/button>/)
  })

  it('says what the change means before it is saved, with the way to keep the old one', () => {
    const html = text(editor({
      dry_run: true, from: 'EUR', to: 'GBP', relabel: { services: 3, extras: 1 }, payments: { mismatch: true, currency: 'EUR' },
      bookings: { total: 12, upcoming: 4 }, stays: { currency: 'EUR' },
    }))
    expect(html).toContain('Before you change EUR to GBP:')
    expect(html).toContain('Online payments are set up in EUR. Bookings priced in GBP would be paid at the venue until Stripe takes GBP')
    expect(html).toContain('12 appointments were booked in another currency (4 still to come).')
    expect(html).toContain('Stays are priced in EUR, set in the full admin’s booking settings.')
    expect(html).toContain('3 services and 1 extras get the GBP label.')
    expect(html).toContain('Change to GBP')
    expect(html).toContain('Keep EUR')
    expect(html).not.toContain('Save currency')
  })
})
