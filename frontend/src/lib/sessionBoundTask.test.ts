import { describe, expect, it, vi } from 'vitest'
import { createSessionFence } from './authSession'
import { sessionBoundTask } from './sessionBoundTask'

function pending() {
  let resolve!: (value: { id: number }) => void
  let reject!: (error: Error) => void
  const promise = new Promise<{ id: number }>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('SSO handoff session boundary', () => {
  it('does not let a late handoff overwrite an account signed in meanwhile', async () => {
    let token = 'previous'
    const fence = createSessionFence(() => token, vi.fn())
    const task = pending()
    const bind = vi.fn()
    const logout = vi.fn()
    sessionBoundTask(() => task.promise, bind, logout, fence)
    token = 'new-account'
    fence.bind(token)
    task.resolve({ id: 1 })
    await task.promise
    expect(bind).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
  })

  it('does not sign out another tab account on a late handoff failure', async () => {
    let token = 'previous'
    const invalidate = vi.fn()
    const fence = createSessionFence(() => token, invalidate)
    const task = pending()
    const logout = vi.fn()
    sessionBoundTask(() => task.promise, vi.fn(), logout, fence)
    token = 'other-tab'
    task.reject(new Error('expired SSO token'))
    await task.promise.catch(() => undefined)
    expect(logout).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledOnce()
    expect(token).toBe('other-tab')
  })

  it('aborts on unmount and ignores a response whose body finishes parsing later', async () => {
    const fence = createSessionFence(() => null, vi.fn())
    const task = pending()
    const success = vi.fn()
    const failure = vi.fn()
    let signal!: AbortSignal
    const cancel = sessionBoundTask((value) => { signal = value; return task.promise }, success, failure, fence)
    cancel()
    task.resolve({ id: 1 })
    await task.promise
    expect(signal.aborted).toBe(true)
    expect(success).not.toHaveBeenCalled()
    expect(failure).not.toHaveBeenCalled()
  })

  it('completes a current handoff and reports a current failure', async () => {
    const fence = createSessionFence(() => null, vi.fn())
    const success = vi.fn()
    const failure = vi.fn()
    const task = pending()
    sessionBoundTask(() => task.promise, success, failure, fence)
    task.resolve({ id: 7 })
    await task.promise
    expect(success).toHaveBeenCalledWith({ id: 7 })
    const failed = pending()
    sessionBoundTask(() => failed.promise, success, failure, fence)
    const error = new Error('invalid handoff')
    failed.reject(error)
    await failed.promise.catch(() => undefined)
    expect(failure).toHaveBeenCalledWith(error)
  })
})
