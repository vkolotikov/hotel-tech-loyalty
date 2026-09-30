import { beforeEach, describe, expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('../../lib/api', () => ({ api: http }))

import { appointmentsApi, failureOf, onWorkspaceOff } from './api'

describe('appointmentsApi.calendar', () => {
  beforeEach(() => { http.get.mockReset() })

  it('asks for working windows unless the caller draws no grid', async () => {
    http.get.mockResolvedValue({ data: {} })

    await appointmentsApi.calendar('2026-10-05', '2026-10-11')
    await appointmentsApi.calendar('2026-10-05', '2026-10-11', { windows: false })

    expect(http.get.mock.calls[0][1].params).toMatchObject({ from: '2026-10-05', to: '2026-10-11', windows: 1 })
    expect(http.get.mock.calls[1][1].params).toMatchObject({ windows: 0 })
  })
})

describe('onWorkspaceOff', () => {
  const off = { response: { status: 403, data: { error: 'workspace_disabled', message: 'This workspace is not switched on for your organisation.' } } }
  const taken = { response: { status: 409, data: { error: 'slot_taken', message: 'That time is not free.' } } }

  beforeEach(() => { http.get.mockReset(); http.post.mockReset(); http.patch.mockReset() })

  it('tells the listener when a read or a write is refused because the workspace was switched off, and still fails the call', async () => {
    const heard = vi.fn()
    const stop = onWorkspaceOff(heard)
    http.get.mockRejectedValue(off)
    http.post.mockRejectedValue(off)
    http.patch.mockRejectedValue(off)

    await expect(appointmentsApi.calendar('2026-10-06', '2026-10-06')).rejects.toBe(off)
    await expect(appointmentsApi.act(7, { action: 'start', revision: 'r' })).rejects.toBe(off)
    await expect(appointmentsApi.move(7, { start: '2026-10-06T10:00', master_id: 1, revision: 'r' })).rejects.toBe(off)
    expect(heard).toHaveBeenCalledTimes(3)

    stop()
    await expect(appointmentsApi.calendar('2026-10-06', '2026-10-06')).rejects.toBe(off)
    expect(heard).toHaveBeenCalledTimes(3)
  })

  it('also tells the listener when the organisation\'s subscription has lapsed', async () => {
    const heard = vi.fn()
    const stop = onWorkspaceOff(heard)
    http.get.mockRejectedValue({ response: { status: 403, data: { error: 'subscription_required', message: 'Your subscription was canceled.' } } })

    await expect(appointmentsApi.calendar('2026-10-06', '2026-10-06')).rejects.toBeTruthy()
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stays quiet for any other refusal and for a success', async () => {
    const heard = vi.fn()
    const stop = onWorkspaceOff(heard)
    http.post.mockRejectedValue(taken)
    http.get.mockResolvedValue({ data: { clients: [] } })

    await expect(appointmentsApi.createBooking({ client_id: 5, service_id: 3, master_id: 1, start: '2026-10-06T10:00' }, 'key')).rejects.toBe(taken)
    await expect(appointmentsApi.searchClients('em')).resolves.toEqual({ clients: [] })
    expect(heard).not.toHaveBeenCalled()
    stop()
  })

  it('does not announce a refused bootstrap — that is the call the listener repeats, and the shell reads its answer', async () => {
    const heard = vi.fn()
    const stop = onWorkspaceOff(heard)
    http.get.mockRejectedValue(off)

    await expect(appointmentsApi.bootstrap()).rejects.toBe(off)
    expect(heard).not.toHaveBeenCalled()
    stop()
  })
})

describe('failureOf', () => {
  it('reads the workspace\'s error body', () => {
    expect(failureOf({ response: { status: 409, data: { error: 'slot_taken', message: 'That time is not free for Emma.' } } }))
      .toMatchObject({ status: 409, code: 'slot_taken', message: 'That time is not free for Emma.' })
  })

  it('carries the current appointment of a stale save and the matches of a possible duplicate', () => {
    expect(failureOf({ response: { status: 409, data: { error: 'stale', message: 'Changed', current: { id: 7 } } } }).current).toEqual({ id: 7 })
    expect(failureOf({ response: { status: 409, data: { error: 'possible_duplicate', message: 'Exists', matches: [{ id: 5 }] } } }).matches).toEqual([{ id: 5 }])
  })

  it('calls a validation error or any other shape unknown, keeping the server\'s sentence', () => {
    expect(failureOf({ response: { status: 422, data: { error: 'Validation failed', message: 'The start field is required.' } } }))
      .toMatchObject({ status: 422, code: 'unknown', message: 'The start field is required.' })
    expect(failureOf({ response: { status: 500, data: 'oops' } })).toMatchObject({ status: 500, code: 'unknown', message: '' })
  })

  it('calls no response at all a network failure, and no error nothing', () => {
    expect(failureOf(new Error('Network Error'))).toMatchObject({ status: 0, code: 'network', message: 'Network Error' })
    expect(failureOf(null)).toMatchObject({ status: 0, code: '', message: '' })
  })
})
