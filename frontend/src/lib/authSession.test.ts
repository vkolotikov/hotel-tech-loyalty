import { describe, expect, it, vi } from 'vitest'
import { createSessionFence, storedSessionToken } from './authSession'

describe('account changes across tabs and in-flight requests', () => {
  it('takes token and identity from one envelope even when the legacy token write is interrupted', () => {
    const values = new Map([['auth_token', 'account-b'], ['loyalty-auth', JSON.stringify({ state: { token: 'account-a', user: { id: 1, user_type: 'staff' } }, version: 1 })]])
    const storage = { getItem: (key: string) => values.get(key) ?? null }
    expect(storedSessionToken(storage)).toBe('account-a')
    values.set('loyalty-auth', JSON.stringify({ state: { token: 'account-b', user: { id: 2, user_type: 'staff' } }, version: 1 }))
    expect(storedSessionToken(storage)).toBe('account-b')
    values.set('loyalty-auth', '{broken')
    expect(storedSessionToken(storage)).toBeNull()
    values.set('loyalty-auth', JSON.stringify({ state: { token: 'account-b', user: null } }))
    expect(storedSessionToken(storage)).toBeNull()
  })

  it('binds before synchronous store subscribers run, then publishes the completed identity', () => {
    let sharedToken = 'account-a'
    const fence = createSessionFence(() => sharedToken, vi.fn())
    let renderedUser = 'account-a'
    fence.subscribe(() => expect(renderedUser).toBe('account-b'))
    sharedToken = 'account-b'
    fence.bind(sharedToken, () => {
      expect(fence.check()).toBe(true)
      expect(fence.token()).toBe('account-b')
      renderedUser = 'account-b'
    })
  })
  it('blocks an old screen before it can borrow the next account token, without changing storage', () => {
    let sharedToken: string | null = 'account-a'
    const invalidate = vi.fn()
    const fence = createSessionFence(() => sharedToken, invalidate)
    const originalRequest = fence.version()
    sharedToken = 'account-b'
    expect(fence.check()).toBe(false)
    expect(fence.token()).toBe('account-a')
    expect(fence.blocked()).toBe(true)
    expect(sharedToken).toBe('account-b')
    expect(fence.check(originalRequest)).toBe(false)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('invalidates the screen on another tab logout or storage clear', () => {
    let sharedToken: string | null = 'account-a'
    const invalidate = vi.fn()
    const fence = createSessionFence(() => sharedToken, invalidate)
    sharedToken = null
    expect(fence.check()).toBe(false)
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('rejects stale success and error responses after a same-tab sign-in', () => {
    let sharedToken: string | null = 'account-a'
    const invalidate = vi.fn()
    const fence = createSessionFence(() => sharedToken, invalidate)
    const request = fence.version()
    sharedToken = 'account-b'
    fence.bind(sharedToken)
    expect(fence.check(request)).toBe(false)
    expect(fence.check()).toBe(true)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('does not reset the page on unchanged tokens or unrelated preference changes', () => {
    const fence = createSessionFence(() => 'account-a', vi.fn())
    const listener = vi.fn()
    const unsubscribe = fence.subscribe(listener)
    fence.bind('account-a')
    expect(fence.check()).toBe(true)
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})
