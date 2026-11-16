import { describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/api', () => ({ api: {} }))
import { submitWork, type WorkAttempt } from './submitWork'
import type { ContentWork, WorkInput } from '../lib/launchTypes'
const input: WorkInput = { action: 'rewrite', post_id: 41, request_key: 'same-request', type: 'shorter', guidance: 'Keep my tone' }
describe('queued work transport ownership', () => {
  it('records original key and input before awaiting transport; reconnect can submit them verbatim', async () => {
    const states: WorkAttempt[] = []
    const api = { startWork: vi.fn(async () => { expect(states[0]).toMatchObject({ input, sending: true }); throw new Error('Timeout after acceptance') }) }
    await submitWork(api, input, state => states.push(state))
    expect(states.at(-1)).toMatchObject({ input, id: null, rejected: false, sending: false, error: 'network' })
    await submitWork(api, states.at(-1)!.input, state => states.push(state))
    expect(api.startWork.mock.calls[0]).toEqual(api.startWork.mock.calls[1])
  })
  it('keeps definitive setup refusals distinct from uncertain transport failures', async () => {
    for (const status of [403, 422, 500, 502]) {
      const states: WorkAttempt[] = []
      await submitWork({ startWork: async () => { throw { response: { status, data: { error: 'ai_model_unpriced' } } } } }, input, state => states.push(state))
      expect(states.at(-1)).toMatchObject({ error: 'ai_model_unpriced', rejected: status < 500, sending: false })
    }
  })
  it('retains the accepted run identity for reopening and polling', async () => {
    const states: WorkAttempt[] = []
    const work = { id: 76, status: 'queued', can_cancel: true } as ContentWork
    expect(await submitWork({ startWork: async () => ({ work }) }, input, state => states.push(state))).toBe(work)
    expect(states.at(-1)).toEqual({ input, id: 76, sending: false, rejected: false, error: null })
  })
})
