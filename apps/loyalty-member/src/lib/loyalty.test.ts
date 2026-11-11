import { describe, expect, it } from 'vitest'
import { loyaltyFeatures, loyaltyHelp, rewardTab, voucherName, offerNotification, singleFlight, walletEnabled, profileUpdate, profileSaved, rewardMessage } from './loyalty'
import { ApiError, failureFrom } from './failure'
import type { PortalBootstrap } from './types'

const boot = (loyalty: boolean, assigned = false): PortalBootstrap => ({
  capabilities: { loyalty, services: true, stays: true, events: true, wallets: { apple: true, google: false } },
  member: { membership_mode: assigned ? 'assigned' : 'earned', membership: { state: 'active', valid_until: null } },
} as PortalBootstrap)

describe('loyalty-only member features', () => {
  it('keeps assigned benefits and events with points off', () => {
    expect(loyaltyFeatures(boot(false, true))).toMatchObject({ points: false, benefits: true, events: true })
    expect(rewardTab('catalogue', false)).toBe('benefits')
    expect(rewardTab('codes', false)).toBe('codes')
  })
  it('fails closed for missing boot/member/provider flags and the wrong device', () => {
    expect(loyaltyFeatures(undefined)).toEqual({ points: false, benefits: false, events: false })
    expect(loyaltyFeatures({ ...boot(true), member: null })).toEqual({ points: false, benefits: false, events: false })
    expect(loyaltyHelp(boot(true)).capabilities).toMatchObject({ services: false, stays: false })
    expect(boot(true).capabilities.services).toBe(true)
    expect(walletEnabled(boot(true), 'ios', 'apple')).toBe(true)
    expect(walletEnabled(boot(true), 'android', 'apple')).toBe(false)
    expect(walletEnabled({ ...boot(true), capabilities: { ...boot(true).capabilities, wallets: undefined } }, 'ios', 'apple')).toBe(false)
  })
  it('does not overwrite a birthday refreshed from the venue during a name-only edit', () => {
    expect(profileUpdate('  Alex  ', '123', null)).toEqual({ name: 'Alex', phone: '123' })
    expect(profileUpdate('Alex', '123', '1991-01-01')).toMatchObject({ date_of_birth: '1991-01-01' })
    expect(profileUpdate('Alex', '123', '')).toMatchObject({ date_of_birth: null })
  })
  it('does not merge a delayed profile save into another signed-in member', () => {
    const current = { ...boot(true), member: { ...boot(true).member!, user: { id: 2, name: 'Member B', date_of_birth: '1992-02-02' } } } as PortalBootstrap
    expect(profileSaved(current, 1, { id: 1, name: 'Member A' }, profileUpdate('Member A', '', '1991-01-01'))).toBe(current)
    const saved = profileSaved(current, 2, { id: 2, name: 'Member B updated' }, profileUpdate('Member B updated', '123', null))
    expect(saved?.member?.user.name).toBe('Member B updated')
    expect(saved?.member?.user.date_of_birth).toBe('1992-02-02')
  })
  it('translates membership refusals instead of displaying the backend English sentence', () => {
    const error = new ApiError(failureFrom(422, { error:'membership_not_started', message:'Your membership has not started.' }))
    expect(rewardMessage(error, key => `fr:${key}`, 'fallback')).toBe('fr:portal.rewards.membership_not_started')
    expect(rewardMessage(new ApiError(failureFrom(422, {error:'membership_expired'})), key => `de:${key}`, 'fallback')).toBe('de:portal.rewards.membership_expired')
  })
})

describe('private offer attachments', () => {
  it('uses a safe file name with a permitted extension', () => {
    expect(voucherName('../../private.exe', 'application/pdf')).toBe('private.pdf')
    expect(voucherName('Summer voucher.pdf', 'application/pdf')).toBe('Summer voucher.pdf')
    expect(voucherName('photo', 'image/jpeg')).toBe('photo.jpg')
    expect(() => voucherName('bad.html', 'text/html')).toThrow()
  })
  it('only accepts explicit offer notification metadata', () => {
    expect(offerNotification({ type: 'new_offer', data: { offer_id: 12, attachment: { name: 'pass.pdf' } } })).toEqual({ id: 12, name: 'pass.pdf' })
    expect(offerNotification({ type: 'points', data: { offer_id: 12 } })).toBeNull()
    expect(offerNotification({ type: 'new_offer', data: { offer_id: '12' } })).toBeNull()
    expect(offerNotification({ type: 'new_offer', data: { offer_id: -1 } })).toBeNull()
  })
})

describe('one member action at a time', () => {
  it('refuses simultaneous redemption taps and releases after a rejected request', async () => {
    const run = singleFlight()
    let reject!: (reason: Error) => void
    let calls = 0
    const first = run(() => { calls++; return new Promise<void>((_ok, no) => { reject = no }) })
    await run(async () => { calls++ })
    expect(calls).toBe(1)
    reject(new Error('refused'))
    await expect(first).rejects.toThrow('refused')
    await run(async () => { calls++ })
    expect(calls).toBe(2)
  })
})
