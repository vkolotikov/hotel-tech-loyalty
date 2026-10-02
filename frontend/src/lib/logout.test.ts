import { describe, expect, it, vi } from 'vitest'

/**
 * A page fires its requests together, so a deactivated account gets several
 * `staff_inactive` refusals at once (final review of Part C). The sign-out
 * runs once, and the first caller's reason is the one the sign-in screen
 * gives.
 */
const del = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock('./api', () => ({ api: { delete: del }, APP_BASE: '' }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => ({ logout: () => {} }) } }))

const location = { href: '' }
;(globalThis as unknown as { window: unknown }).window = { location }

const { logoutAndRedirect } = await import('./logout')

describe('logoutAndRedirect', () => {
  it('signs out once when several refused calls ask at the same time, and the first reason wins', async () => {
    await Promise.all([
      logoutAndRedirect('/login?reason=access_off'),
      logoutAndRedirect('/login'),
      logoutAndRedirect('/login'),
    ])

    expect(del).toHaveBeenCalledTimes(1)
    expect(location.href).toBe('/login?reason=access_off')
  })
})
