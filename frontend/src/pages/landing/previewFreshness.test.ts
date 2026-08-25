import { describe, expect, it } from 'vitest'
import {
  isPreviewUrlExpired, previewRefetchIntervalMs, PREVIEW_REFRESH_MARGIN_MS, PREVIEW_URL_TTL_MS,
} from './previewFreshness'

describe('PREVIEW_URL_TTL_MS', () => {
  it('is exactly 2 hours, matching LandingPageController::previewUrl()\'s now()->addHours(2)', () => {
    expect(PREVIEW_URL_TTL_MS).toBe(2 * 60 * 60 * 1000)
  })
})

describe('previewRefetchIntervalMs', () => {
  it('defaults to the TTL minus the margin', () => {
    expect(previewRefetchIntervalMs()).toBe(PREVIEW_URL_TTL_MS - PREVIEW_REFRESH_MARGIN_MS)
  })

  it('is strictly less than the TTL, so a real session always refetches before the signature dies', () => {
    expect(previewRefetchIntervalMs()).toBeLessThan(PREVIEW_URL_TTL_MS)
  })

  it('computes off explicit arguments rather than the module constants', () => {
    expect(previewRefetchIntervalMs(60_000, 10_000)).toBe(50_000)
  })

  it('clamps to zero rather than going negative when the margin meets or exceeds the TTL', () => {
    expect(previewRefetchIntervalMs(60_000, 60_000)).toBe(0)
    expect(previewRefetchIntervalMs(60_000, 90_000)).toBe(0)
  })
})

describe('isPreviewUrlExpired', () => {
  const mintedAt = 1_000_000

  it('is false the instant a URL is minted', () => {
    expect(isPreviewUrlExpired(mintedAt, mintedAt)).toBe(false)
  })

  it('is false anywhere inside the TTL window, including at the proactive-refetch boundary', () => {
    expect(isPreviewUrlExpired(mintedAt, mintedAt + previewRefetchIntervalMs())).toBe(false)
    expect(isPreviewUrlExpired(mintedAt, mintedAt + PREVIEW_URL_TTL_MS - 1)).toBe(false)
  })

  it('is true exactly at the TTL boundary and beyond — matches the signed route\'s own inclusive expiry check', () => {
    expect(isPreviewUrlExpired(mintedAt, mintedAt + PREVIEW_URL_TTL_MS)).toBe(true)
    expect(isPreviewUrlExpired(mintedAt, mintedAt + PREVIEW_URL_TTL_MS + 1)).toBe(true)
  })

  it('honours a custom ttlMs rather than hard-coding the 2-hour default', () => {
    expect(isPreviewUrlExpired(mintedAt, mintedAt + 5_000, 10_000)).toBe(false)
    expect(isPreviewUrlExpired(mintedAt, mintedAt + 10_000, 10_000)).toBe(true)
  })
})
