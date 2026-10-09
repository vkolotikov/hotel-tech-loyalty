import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../i18n', () => ({ applyServerLanguage: () => {} }))
vi.mock('../lib/queryClient', () => ({ queryClient: { clear: () => {} } }))

import { useAuthStore } from './authStore'

/**
 * The stored user is what every screen reads its industry from (sidebar
 * words, Settings → Industry, KPI tiles). It is written at sign-in, so an
 * industry switched afterwards must reach it through GET /v1/auth/me — the
 * owner switched to Services, the server saved it, and every reload still
 * showed MedTechAI (2026-10-07).
 */
describe('refreshUser', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 't',
      staff: null,
      user: { id: 7, name: 'V', email: 'v@example.test', user_type: 'staff', industry: 'medical', industry_explicit: true },
    })
  })

  it('takes the industry the server has now', () => {
    useAuthStore.getState().refreshUser({ id: 7, industry: 'services', industry_explicit: true })

    expect(useAuthStore.getState().user?.industry).toBe('services')
    expect(useAuthStore.getState().user?.industry_explicit).toBe(true)
  })

  it('keeps the stored industry when the answer carries none', () => {
    useAuthStore.getState().refreshUser({ id: 7 })

    expect(useAuthStore.getState().user?.industry).toBe('medical')
    expect(useAuthStore.getState().user?.industry_explicit).toBe(true)
  })

  it('ignores an answer about another user', () => {
    useAuthStore.getState().refreshUser({ id: 8, industry: 'services' })

    expect(useAuthStore.getState().user?.industry).toBe('medical')
  })

  it('takes the platform-admin flag when the answer carries it, and keeps it otherwise', () => {
    useAuthStore.getState().refreshUser({ id: 7, is_platform_admin: true })
    expect(useAuthStore.getState().user?.is_platform_admin).toBe(true)

    useAuthStore.getState().refreshUser({ id: 7 })
    expect(useAuthStore.getState().user?.is_platform_admin).toBe(true)

    useAuthStore.getState().refreshUser({ id: 7, is_platform_admin: false })
    expect(useAuthStore.getState().user?.is_platform_admin).toBe(false)
  })

  it('still brings the workspaces up to date', () => {
    useAuthStore.getState().refreshUser({ id: 7, workspaces: { appointments: { landing: true } } })

    expect(useAuthStore.getState().user?.workspaces).toEqual({ appointments: { landing: true } })
  })
})
