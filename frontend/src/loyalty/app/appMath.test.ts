import { describe, expect, it } from 'vitest'
import { sectionAfter } from '../ui/sections'
import type { Can } from '../lib/types'
import {
  APP_TABS, appAccess, appleRgb, applyPreset, chosenPreset, currencyChanged, currencyLabel, currencyWarnings, fileState, hexOf, lookBody, lookChanged, lookFormOf, lookProblems, lookServerProblems, passReady,
  pickerValue, previewPaint, previewTier, replaces, rgbHex, searchFor, svgId, tabFrom, walletBody, walletFormOf, walletProblems,
  walletServerProblems, walletShownProblems,
} from './appMath'
import type { CurrencyPreview, Look, LookOptions, Wallet } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: false, redeem: false, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const GOLD = { primary: '#c9a84c', background: '#0d0d0d', surface: '#161616', secondary: '#1e1e1e', text: '#ffffff', text_secondary: '#8e8e93', border: '#2c2c2c', success: '#32d74b', error: '#ff375f', warning: '#ffd60a', info: '#0a84ff' }
const SAPPHIRE = { primary: '#3b82f6', background: '#0a0f1e', surface: '#111827', secondary: '#1f2937', text: '#f8fafc', text_secondary: '#94a3b8', border: '#1f2a3a', success: '#22c55e', error: '#ef4444', warning: '#eab308', info: '#06b6d4' }
const options: LookOptions = {
  colors: Object.keys(GOLD),
  card_styles: ['gradient', 'solid', 'glass'],
  button_styles: ['filled', 'outline', 'soft'],
  accent_intensities: ['subtle', 'vibrant', 'bold'],
  radius: { min: 0, max: 32 },
  presets: [{ key: 'gold_classic', name: 'Gold Classic', colors: GOLD }, { key: 'royal_sapphire', name: 'Royal Sapphire', colors: SAPPHIRE }],
  logo: { max_kb: 4096, max_edge: 4096, types: ['image/jpeg', 'image/png', 'image/webp'] },
}
const look = (more: Partial<Look> = {}): Look => ({ colors: { ...GOLD }, card_style: 'gradient', radius: 16, button_style: 'filled', accent_intensity: 'vibrant', preset: null, logo_url: null, ...more })
const wallet = (more: Partial<Wallet> = {}): Wallet => ({
  apple_pass_type_id: null, apple_team_id: null, apple_organization_name: null,
  apple_pass_background_color: 'rgb(13,13,13)', apple_pass_foreground_color: 'rgb(255,255,255)', apple_pass_label_color: 'rgb(201,168,76)',
  apple_cert_uploaded: false, apple_cert_password_set: false, apple_wwdr_uploaded: false, apple_ready: false,
  google_issuer_id: null, google_class_suffix: null, google_service_account_uploaded: false, google_ready: false, is_active: true,
  apple_missing: ['pass_type_id', 'team_id', 'certificate', 'wwdr'], google_missing: ['issuer_id', 'class_suffix', 'service_account'], ...more,
})

describe('the tab in the address and who sees the page (release 2 §7)', () => {
  it('reads ?tab=, the wallet pass for none or anything else, and round-trips', () => {
    expect(tabFrom('?tab=app')).toBe('app')
    expect(tabFrom('?tab=wallet')).toBe('wallet')
    expect(tabFrom('')).toBe('wallet')
    expect(tabFrom('?tab=offers')).toBe('wallet')
    expect(searchFor('wallet')).toBe('')
    expect(searchFor('app')).toBe('?tab=app')
    expect(tabFrom('?tab=currency')).toBe('currency')
    for (const tab of ['wallet', 'app', 'currency'] as const) expect(tabFrom(searchFor(tab))).toBe(tab)
  })

  it('moves with the arrows, Home and End, wrapping; nothing for another key', () => {
    expect(sectionAfter(APP_TABS, 'wallet', 'ArrowRight')).toBe('app')
    expect(sectionAfter(APP_TABS, 'app', 'ArrowRight')).toBe('currency')
    expect(sectionAfter(APP_TABS, 'currency', 'ArrowRight')).toBe('wallet')
    expect(sectionAfter(APP_TABS, 'wallet', 'ArrowLeft')).toBe('currency')
    expect(sectionAfter(APP_TABS, 'app', 'Home')).toBe('wallet')
    expect(sectionAfter(APP_TABS, 'wallet', 'End')).toBe('currency')
    expect(sectionAfter(APP_TABS, 'wallet', 'Enter')).toBeNull()
  })

  it('is a manager\'s page; the wallet pass also needs the plan', () => {
    expect(appAccess(can({ manage_app: true }), { campaigns: true, wallet: true, push: true })).toEqual({ manage: true, wallet: true })
    expect(appAccess(can({ manage_app: true }), { campaigns: true, wallet: false, push: true })).toEqual({ manage: true, wallet: false })
    expect(appAccess(can({ manage_rewards: true, manage_program: true }), { campaigns: true, wallet: true, push: true }).manage).toBe(false)
  })
})

describe('colours in the two forms', () => {
  it('reads #rgb and #rrggbb in any case as lower-case #rrggbb, and nothing else', () => {
    expect(hexOf('#C9A84C')).toBe('#c9a84c')
    expect(hexOf(' #fff ')).toBe('#ffffff')
    expect(hexOf('c9a84c')).toBeNull()
    expect(hexOf('red')).toBeNull()
    expect(hexOf('#12345')).toBeNull()
    expect(hexOf(null)).toBeNull()
    expect(pickerValue('#ABC')).toBe('#aabbcc')
    expect(pickerValue('rgb(1,2,3)')).toBe('#000000')
  })

  it('turns a stored pass colour into #rrggbb and back into the triple Apple reads', () => {
    expect(rgbHex('rgb(13,13,13)')).toBe('#0d0d0d')
    expect(rgbHex('rgb( 201 , 168, 76 )')).toBe('#c9a84c')
    expect(rgbHex('RGB(255,255,255)')).toBe('#ffffff')
    expect(rgbHex('#fff')).toBe('#ffffff')
    expect(rgbHex('rgb(256,0,0)')).toBeNull()
    expect(rgbHex('red')).toBeNull()
    expect(appleRgb('#0d0d0d')).toBe('rgb(13,13,13)')
    expect(appleRgb('#C9A84C')).toBe('rgb(201,168,76)')
    for (const hex of ['#000000', '#ffffff', '#3b82f6']) expect(rgbHex(appleRgb(hex))).toBe(hex)
  })
})

describe('the wallet pass form', () => {
  it('starts from the saved fields, colours as #rrggbb, a colour Apple cannot read kept as it is and flagged at once', () => {
    const form = walletFormOf(wallet({ apple_pass_type_id: 'pass.com.x', apple_pass_label_color: 'gold', is_active: false }))
    expect(form).toEqual({
      apple_pass_type_id: 'pass.com.x', apple_team_id: '', apple_organization_name: '', apple_pass_background_color: '#0d0d0d',
      apple_pass_foreground_color: '#ffffff', apple_pass_label_color: 'gold', google_issuer_id: '', google_class_suffix: '', is_active: false,
    })
    expect(walletShownProblems(form, false, undefined)).toEqual({ apple_pass_label_color: 'colour' })
  })

  it('checks the identifiers\' shapes, which may each stay empty', () => {
    const form = walletFormOf(wallet())
    expect(walletProblems(form)).toEqual({})
    expect(walletProblems({ ...form, apple_pass_type_id: 'com.venue', apple_team_id: 'abc', google_issuer_id: '12-3', google_class_suffix: 'a b', apple_pass_background_color: '#12' }))
      .toEqual({ apple_pass_type_id: 'pass_type_id', apple_team_id: 'team_id', google_issuer_id: 'issuer_id', google_class_suffix: 'class_suffix', apple_pass_background_color: 'colour' })
    expect(walletProblems({ ...form, apple_pass_type_id: 'pass.com.venue.loyalty', apple_team_id: 'abcde12345', google_issuer_id: '3388000000012345', google_class_suffix: 'members_1.0' })).toEqual({})
    expect(walletProblems({ ...form, apple_organization_name: 'x'.repeat(192) })).toEqual({ apple_organization_name: 'organization_name' })
  })

  it('sends empty as none, the Team ID in capitals and the colours as Apple reads them', () => {
    const body = walletBody({ ...walletFormOf(wallet()), apple_team_id: ' abcde12345 ', apple_pass_type_id: ' pass.com.x ', apple_pass_label_color: '#FFF' })
    expect(body).toEqual({
      apple_pass_type_id: 'pass.com.x', apple_team_id: 'ABCDE12345', apple_organization_name: null,
      apple_pass_background_color: 'rgb(13,13,13)', apple_pass_foreground_color: 'rgb(255,255,255)', apple_pass_label_color: 'rgb(255,255,255)',
      google_issuer_id: null, google_class_suffix: null, is_active: true,
    })
    expect(Object.keys(body)).not.toContain('apple_cert_password')
  })

  it('names the server\'s field errors in its own words', () => {
    expect(walletServerProblems({ apple_team_id: ['x'], apple_pass_foreground_color: ['x'], is_active: ['x'] }))
      .toEqual({ apple_team_id: 'team_id', apple_pass_foreground_color: 'colour' })
  })

  it('is ready when nothing is missing, and knows each file as there, never sent, or gone', () => {
    expect(passReady([])).toBe(true)
    expect(passReady(['switched_off'])).toBe(false)
    const w = wallet({ apple_cert_uploaded: true, apple_wwdr_uploaded: true, google_service_account_uploaded: true, apple_missing: ['wwdr_gone'], google_missing: [] })
    expect(fileState('apple_cert', w)).toBe('set')
    expect(fileState('apple_wwdr', w)).toBe('gone')
    expect(fileState('google_service_account', w)).toBe('set')
    expect(fileState('apple_cert', wallet())).toBe('none')
    expect(replaces('set')).toBe(true)
    expect(replaces('gone')).toBe(false)
    expect(replaces('none')).toBe(false)
  })
})

describe('the member app\'s look', () => {
  it('starts from the saved look, a colour stored as #ABC read as #aabbcc, no preset applied yet', () => {
    const form = lookFormOf(look({ colors: { ...GOLD, text: '#FFF', border: 'grey' }, preset: 'gold_classic' }), options)
    expect(form.colors.text).toBe('#ffffff')
    expect(form.colors.border).toBe('grey')
    expect(form.preset).toBeNull()
    expect(lookProblems(form, options)).toEqual({ 'colors.border': 'colour' })
  })

  it('applies a preset\'s colours and sends it only once applied', () => {
    const form = lookFormOf(look(), options)
    expect(lookBody(form, options)).toEqual({ colors: GOLD, card_style: 'gradient', radius: 16, button_style: 'filled', accent_intensity: 'vibrant' })
    const applied = applyPreset(form, options.presets[1])
    expect(applied.colors).toEqual(SAPPHIRE)
    expect(lookBody({ ...applied, colors: { ...applied.colors, primary: '#3B82F6' } }, options)).toEqual({
      colors: SAPPHIRE, card_style: 'gradient', radius: 16, button_style: 'filled', accent_intensity: 'vibrant', preset: 'royal_sapphire',
    })
  })

  it('refuses a style not in the server\'s lists and a radius outside its range', () => {
    const form = lookFormOf(look(), options)
    expect(lookProblems({ ...form, card_style: 'neon', button_style: '', accent_intensity: 'loud', radius: 33 }, options))
      .toEqual({ card_style: 'card_style', button_style: 'button_style', accent_intensity: 'accent_intensity', radius: 'radius' })
    expect(lookProblems({ ...form, radius: 2.5 }, options)).toEqual({ radius: 'radius' })
    expect(lookServerProblems({ 'colors.primary': ['x'], radius: ['x'], other: ['x'] })).toEqual({ 'colors.primary': 'colour', radius: 'radius' })
  })

  it('shows the preset applied, else the saved one, and whether its colours were changed since', () => {
    const form = lookFormOf(look(), options)
    expect(chosenPreset(form, null, options)).toBeNull()
    expect(chosenPreset(form, 'gold_classic', options)).toEqual({ key: 'gold_classic', changed: false })
    expect(chosenPreset({ ...form, colors: { ...form.colors, primary: '#000000' } }, 'gold_classic', options)).toEqual({ key: 'gold_classic', changed: true })
    expect(chosenPreset(applyPreset(form, options.presets[1]), 'gold_classic', options)).toEqual({ key: 'royal_sapphire', changed: false })
    expect(chosenPreset(form, 'retired_preset', options)).toBeNull()
  })

  it('knows when the form holds something unsaved', () => {
    const saved = look({ colors: { ...GOLD, text: '#FFFFFF' } })
    const form = lookFormOf(saved, options)
    expect(lookChanged(form, saved, options)).toBe(false)
    expect(lookChanged({ ...form, radius: 8 }, saved, options)).toBe(true)
    expect(lookChanged({ ...form, colors: { ...form.colors, info: '#000000' } }, saved, options)).toBe(true)
    expect(lookChanged(applyPreset(form, options.presets[0]), saved, options)).toBe(true)
  })
})

describe('the phone preview', () => {
  it('draws the card in the accent with the background as its ink, and glass with the text', () => {
    const form = lookFormOf(look(), options)
    const paint = previewPaint(form, GOLD, options)
    expect(paint.card).toBe('gradient')
    expect(paint.cardInk).toBe(GOLD.background)
    expect(paint.c.primary).toBe(GOLD.primary)
    const glass = previewPaint({ ...form, card_style: 'glass' }, GOLD, options)
    expect([glass.card, glass.cardInk, glass.cardInk2]).toEqual(['glass', GOLD.text, GOLD.text_secondary])
    expect(previewPaint({ ...form, card_style: 'neon' }, GOLD, options).card).toBe('gradient')
  })

  it('fills, tints or outlines the button, and keeps the radius in range', () => {
    const form = lookFormOf(look(), options)
    expect(previewPaint(form, GOLD, options).button).toEqual({ fill: GOLD.primary, fillOpacity: 1, stroke: null, ink: GOLD.background })
    expect(previewPaint({ ...form, button_style: 'soft' }, GOLD, options).button).toEqual({ fill: GOLD.primary, fillOpacity: 0.125, stroke: null, ink: GOLD.primary })
    expect(previewPaint({ ...form, button_style: 'outline' }, GOLD, options).button).toEqual({ fill: null, fillOpacity: 0, stroke: GOLD.primary, ink: GOLD.primary })
    expect(previewPaint({ ...form, radius: 99 }, GOLD, options).radius).toBe(32)
  })

  it('shows a colour still being typed as saved', () => {
    const form = lookFormOf(look(), options)
    expect(previewPaint({ ...form, colors: { ...form.colors, primary: '#3b8' } }, GOLD, options).c.primary).toBe('#33bb88')
    expect(previewPaint({ ...form, colors: { ...form.colors, primary: '#3b' } }, GOLD, options).c.primary).toBe(GOLD.primary)
  })

  it('wears the programme\'s highest active tier, and makes ids an SVG reference can hold', () => {
    expect(previewTier([{ name: 'Silver', is_active: true }, { name: 'Gold', is_active: true }, { name: 'Black', is_active: false }])).toBe('Gold')
    expect(previewTier([])).toBeNull()
    expect(svgId(':r1:')).toBe('lr1')
    expect(svgId('«r2»')).toBe('lr2')
  })
})

describe('the currency (release 4, R4-5)', () => {
  const preview = (more: Partial<CurrencyPreview> = {}): CurrencyPreview => ({
    dry_run: true, from: 'EUR', to: 'GBP', relabel: { services: 0, extras: 0 }, payments: { mismatch: false, currency: null },
    bookings: { total: 0, upcoming: 0 }, stays: null, ...more,
  })

  it('names a code in the language, and shows the bare code where there is no name', () => {
    expect(currencyLabel('EUR', 'en')).toBe('EUR · Euro')
    expect(currencyLabel('GBP', 'de')).toBe('GBP · Britisches Pfund')
    expect(currencyLabel('QQQ', 'en')).toBe('QQQ')
  })

  it('saves only another code from the list', () => {
    expect(currencyChanged('EUR', 'GBP', ['EUR', 'GBP'])).toBe(true)
    expect(currencyChanged('EUR', 'EUR', ['EUR', 'GBP'])).toBe(false)
    expect(currencyChanged('EUR', 'XYZ', ['EUR', 'GBP'])).toBe(false)
  })

  it('says nothing when the dry run found nothing, so the change is saved at once', () => {
    expect(currencyWarnings(preview())).toEqual([])
  })

  it('lists payments first, then the bookings that keep theirs, the stays priced apart and the relabelled prices', () => {
    expect(currencyWarnings(preview({
      relabel: { services: 3, extras: 1 }, payments: { mismatch: true, currency: 'EUR' }, bookings: { total: 12, upcoming: 4 }, stays: { currency: 'EUR' },
    }))).toEqual([
      { key: 'payments', currency: 'EUR' },
      { key: 'bookings', total: 12, upcoming: 4 },
      { key: 'stays', currency: 'EUR' },
      { key: 'relabel', services: 3, extras: 1 },
    ])
    expect(currencyWarnings(preview({ relabel: { services: 0, extras: 2 } }))).toEqual([{ key: 'relabel', services: 0, extras: 2 }])
    // A mismatch the server could not name is no sentence to say.
    expect(currencyWarnings(preview({ payments: { mismatch: true, currency: null } }))).toEqual([])
  })
})
