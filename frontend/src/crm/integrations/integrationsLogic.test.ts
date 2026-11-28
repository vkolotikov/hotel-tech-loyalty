import { describe, expect, it } from 'vitest'
import {
  TOKEN_PLACEHOLDER, accountTone, ago, budgetTone, canReconnect, checkTone, connectBody, curlSnippet, dayBars, dayOfMonth, exampleBrandId,
  featureFallback, featureRows, guideText, intakeEndpoint, isKnownCheck, isKnownFeature, leftCents, mailPayload, mailPreview, mailProblems,
  meterWidth, pageChoices, pickTab, planPackages, sameMail, snippetToken, tabsFor, tokenLabelProblem, tokenSlug, tokenTitle, usd, webSnippet,
  withTab, type GuideWords, type MailSettings, type MessengerAccount, type MessengerConfig,
} from './integrationsLogic'

const WORDS: GuideWords = {
  title: 'T', intro: 'I', endpoint: 'E', replace: 'R', required: 'Req', optional: 'Opt',
  fields: { source: 's', name: 'n', email: 'e', brand: 'b', phone: 'p', company: 'c', position: 'po', description: 'd', amount: 'a', externalId: 'x', submittedAt: 'at' },
  brands: 'Brands', noBrands: 'none', defaultBrand: 'default', example: 'Ex', response: 'Resp', responseLine: 'RL', notes: 'N', noteLimit: 'L', noteHoneypot: 'H', noteServer: 'S', web: 'W',
}

describe('sections', () => {
  it('shows a manager every section and a staff member only the sender, keeping the tab in the address', () => {
    expect(tabsFor(true)).toEqual(['leads', 'email', 'ai', 'channels'])
    expect(tabsFor(false)).toEqual(['email'])
    expect(pickTab('ai', tabsFor(true))).toBe('ai')
    expect(pickTab('ai', tabsFor(false))).toBe('email')
    expect(pickTab(null, tabsFor(true))).toBe('leads')
    expect(withTab(new URLSearchParams('tab=ai&x=1'), 'leads', 'leads').toString()).toBe('x=1')
    expect(withTab(new URLSearchParams('x=1'), 'channels', 'leads').toString()).toBe('x=1&tab=channels')
  })
})

describe('tokens', () => {
  it('names a token as the server does and refuses what the server refuses', () => {
    expect(tokenSlug('Website form')).toBe('website_form')
    expect(tokenSlug('  FDS.Card--Builder ')).toBe('fds_card_builder')
    expect(tokenSlug('---')).toBe('token')
    expect(tokenTitle('website_form')).toBe('website form')
    const existing = [{ id: 1, label: 'website_form', last_used_at: null, created_at: null }]
    expect(tokenLabelProblem('', existing)).toBe('required')
    expect(tokenLabelProblem('   ', existing)).toBe('required')
    expect(tokenLabelProblem('<script>', existing)).toBe('characters')
    expect(tokenLabelProblem('a'.repeat(81), existing)).toBe('too_long')
    expect(tokenLabelProblem('Website Form', existing)).toBe('taken')
    expect(tokenLabelProblem('Zapier 2.0', existing)).toBeNull()
  })
})

describe('the lead intake guide', () => {
  const brands = [{ id: 4, name: 'Spa', is_default: false }, { id: 3, name: 'Hotel', is_default: true }]

  it('builds the address, picks the default brand and shows the placeholder until a token is there', () => {
    expect(intakeEndpoint('https://app.example.test/')).toBe('https://app.example.test/api/v1/integrations/leads')
    expect(exampleBrandId(brands)).toBe(3)
    expect(exampleBrandId([{ id: 9, name: 'A', is_default: false }])).toBe(9)
    expect(exampleBrandId([])).toBeNull()
    expect(snippetToken(null)).toBe(TOKEN_PLACEHOLDER)
    expect(snippetToken('  ')).toBe(TOKEN_PLACEHOLDER)
    expect(snippetToken(' 12|abc ')).toBe('12|abc')
  })

  it('writes a runnable cURL and a web example that keeps the token on the server', () => {
    const curl = curlSnippet('https://x.test/api/v1/integrations/leads', '12|abc', 3)
    expect(curl).toContain('curl -X POST https://x.test/api/v1/integrations/leads')
    expect(curl).toContain('Authorization: Bearer 12|abc')
    expect(curl).toContain('"brand_id": 3,')
    expect(curlSnippet('u', 't', null)).not.toContain('brand_id')
    const web = webSnippet('https://x.test/api/v1/integrations/leads', 3)
    expect(web).toContain('value="3"')
    expect(web).toContain("fetch('https://x.test/api/v1/integrations/leads'")
    expect(web).toContain('import.meta.env.CRM_API_TOKEN')
    expect(web).not.toContain('12|abc')
  })

  it('lists the brands and says to replace the placeholder only while it is the placeholder', () => {
    const guide = guideText(WORDS, 'https://x.test/api/v1/integrations/leads', TOKEN_PLACEHOLDER, brands)
    expect(guide).toContain('- 3 → Hotel (default)')
    expect(guide).toContain('- 4 → Spa')
    expect(guide).toContain('> R')
    expect(guide).toContain('Authorization: Bearer YOUR_API_TOKEN')
    const real = guideText(WORDS, 'u', '12|abc', [])
    expect(real).not.toContain('> R')
    expect(real).toContain('- none')
    expect(real).toContain('Authorization: Bearer 12|abc')
  })
})

describe('the sender', () => {
  const settings: MailSettings = {
    from_name: null, reply_to: null, defaults: { from_name: 'Harbour Clinic', reply_to: 'desk@harbour.test' },
    identity: { from_name: 'Harbour Clinic', from_address: 'noreply@platform.test', reply_to: 'desk@harbour.test' }, can_change: true,
  }

  it('checks a name and an address as the server does, and sends empty as cleared', () => {
    expect(mailProblems({ from_name: 'Harbour', reply_to: '' })).toEqual({})
    expect(mailProblems({ from_name: 'A\nB', reply_to: '' }).from_name).toBe('characters')
    expect(mailProblems({ from_name: 'A <b>', reply_to: '' }).from_name).toBe('characters')
    expect(mailProblems({ from_name: 'a'.repeat(101), reply_to: '' }).from_name).toBe('too_long')
    expect(mailProblems({ from_name: '', reply_to: 'not an address' }).reply_to).toBe('invalid')
    expect(mailProblems({ from_name: '', reply_to: 'hello@harbour.test' })).toEqual({})
    expect(mailPayload({ from_name: '  ', reply_to: ' Hello@Harbour.test ' })).toEqual({ from_name: null, reply_to: 'hello@harbour.test' })
    expect(sameMail({ from_name: 'A ', reply_to: 'X@y.z' }, { from_name: 'A', reply_to: 'x@y.z' })).toBe(true)
  })

  it('previews the draft, else the organisation\'s own name and email, always from the platform address', () => {
    expect(mailPreview(settings, { from_name: '', reply_to: '' })).toEqual({
      fromName: 'Harbour Clinic', fromAddress: 'noreply@platform.test', replyTo: 'desk@harbour.test', nameIsDefault: true, replyIsDefault: true,
    })
    expect(mailPreview(settings, { from_name: 'Harbour Riga', reply_to: 'Hello@harbour.test' })).toMatchObject({ fromName: 'Harbour Riga', replyTo: 'hello@harbour.test', nameIsDefault: false })
    expect(mailPreview(settings, { from_name: '', reply_to: 'broken' }).replyTo).toBeNull()
    expect(mailPreview({ ...settings, defaults: { from_name: 'X', reply_to: null } }, { from_name: '', reply_to: '' }).replyTo).toBeNull()
  })
})

describe('AI usage', () => {
  it('draws the allowance, what is left and its tone, with no bar without an allowance', () => {
    expect(meterWidth({ status: 'under', used_cents: 1000, cap_cents: 2500, percent: 40 })).toBe(40)
    expect(meterWidth({ status: 'over', used_cents: 3000, cap_cents: 2500, percent: 120 })).toBe(100)
    expect(meterWidth({ status: 'unlimited', used_cents: 10, cap_cents: null, percent: null })).toBeNull()
    expect(leftCents({ status: 'over', used_cents: 3000, cap_cents: 2500, percent: 120 })).toBe(0)
    expect(leftCents({ status: 'under', used_cents: 1000, cap_cents: 2500, percent: 40 })).toBe(1500)
    expect([budgetTone('under'), budgetTone('warn'), budgetTone('over'), budgetTone('unlimited')]).toEqual(['success', 'pending', 'danger', 'neutral'])
    expect(usd(1234, 'en')).toBe('$12.34')
  })

  it('scales the days to the highest one, marks today, and keeps an empty month flat', () => {
    const bars = dayBars([{ day: '2026-11-01', cost_cents: 0, calls: 0 }, { day: '2026-11-02', cost_cents: 1, calls: 1 }, { day: '2026-11-03', cost_cents: 200, calls: 4 }], '2026-11-03')
    expect(bars.map(b => [b.height, b.today])).toEqual([[0, false], [4, false], [100, true]])
    expect(dayBars([{ day: '2026-11-01', cost_cents: 0, calls: 0 }], '2026-11-01')[0].height).toBe(0)
    expect(dayOfMonth('2026-11-04')).toBe(4)
  })

  it('orders the features by spend with their share, and names an unknown one as the ledger does', () => {
    expect(featureRows([{ feature: 'a', cost_cents: 100, calls: 1 }, { feature: 'b', cost_cents: 300, calls: 9 }]).map(r => [r.feature, r.share])).toEqual([['b', 75], ['a', 25]])
    expect(featureRows([{ feature: 'a', cost_cents: 0, calls: 3 }])[0].share).toBe(0)
    expect(isKnownFeature('crm_draft')).toBe(true)
    expect(isKnownFeature('inquiry_brief')).toBe(false)
    expect(featureFallback('inquiry_brief')).toBe('Inquiry brief')
    expect(planPackages({ modules: ['content', 'crm'], tiers: { content: 'pro', crm: 'lite' } })).toEqual([{ module: 'content', tier: 'pro' }, { module: 'crm', tier: 'lite' }])
    expect(planPackages({ modules: null, tiers: null })).toEqual([])
  })
})

describe('Messenger', () => {
  const config: MessengerConfig = { configured: true, app_id: '1', graph_version: 'v25.0', required_scopes: ['pages_messaging'], subscribed_fields: ['messages'] }
  const account = (status: string): MessengerAccount => ({ id: 1, channel: 'messenger', external_id: '111', display_name: 'Harbour', display_avatar_url: null, status, brand_id: null, token_verified_at: null, last_webhook_at: null, last_error: null, created_at: null })

  it('words each state and offers Reconnect only for a dead token on a server set up for it', () => {
    expect([accountTone('active'), accountTone('reauth_required'), accountTone('disconnected'), accountTone('x')]).toEqual(['success', 'pending', 'danger', 'neutral'])
    expect([checkTone('ok'), checkTone('warn'), checkTone('fail'), checkTone('unknown')]).toEqual(['success', 'pending', 'danger', 'neutral'])
    expect(isKnownCheck('messages_field')).toBe(true)
    expect(isKnownCheck('other')).toBe(false)
    expect(canReconnect(account('reauth_required'), config)).toBe(true)
    expect(canReconnect(account('active'), config)).toBe(false)
    expect(canReconnect(account('reauth_required'), { ...config, configured: false })).toBe(false)
  })

  it('offers pages not yet connected first, and connects one for the chosen brand', () => {
    const pages = [
      { id: '2', name: 'B', picture_url: null, access_token: 't2', already_connected: true },
      { id: '3', name: 'C', picture_url: null, access_token: 't3', already_connected: false },
      { id: '1', name: 'A', picture_url: 'https://p.test/a.png', access_token: 't1', already_connected: false },
    ]
    expect(pageChoices(pages).map(p => p.id)).toEqual(['1', '3', '2'])
    expect(connectBody(pages[2], 5)).toEqual({ page_id: '1', page_token: 't1', display_name: 'A', avatar_url: 'https://p.test/a.png', brand_id: 5 })
    expect(connectBody(pages[1], null)).toEqual({ page_id: '3', page_token: 't3', display_name: 'C' })
  })

  it('says how long ago a message came', () => {
    const now = Date.parse('2026-11-12T12:00:00Z')
    expect(ago(null, now)).toBeNull()
    expect(ago('2026-11-12T11:59:30Z', now)).toBe('now')
    expect(ago('2026-11-12T11:55:00Z', now)).toEqual({ value: -5, unit: 'minute' })
    expect(ago('2026-11-12T09:00:00Z', now)).toEqual({ value: -3, unit: 'hour' })
    expect(ago('2026-11-10T12:00:00Z', now)).toEqual({ value: -2, unit: 'day' })
  })
})
