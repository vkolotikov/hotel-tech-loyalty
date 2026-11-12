import { describe, expect, it } from 'vitest'
import { createAppLock } from './appLock'

describe('device app lock', () => {
  it('blocks a restored session before any background transition or authentication', () => {
    expect(createAppLock(true).getState().locked).toBe(true)
    expect(createAppLock(false).getState().locked).toBe(false)
  })

  it('only unlocks after successful authentication and allows retry after cancellation/error', async () => {
    const gate = createAppLock(true)
    await gate.unlock(async () => false)
    expect(gate.getState()).toEqual({ locked: true, busy: false })
    await gate.unlock(async () => { throw new Error('Device unavailable') })
    expect(gate.getState().locked).toBe(true)
    await gate.unlock(async () => true)
    expect(gate.getState()).toEqual({ locked: false, busy: false })
  })

  it('relocks on return after two minutes, including an inactive interval', async () => {
    const gate = createAppLock(true)
    await gate.unlock(async () => true)
    gate.change('inactive', 1_000)
    gate.change('background', 2_000)
    gate.change('active', 120_999)
    expect(gate.getState().locked).toBe(false)
    gate.change('background', 121_000)
    gate.change('active', 241_000)
    expect(gate.getState().locked).toBe(true)
  })

  it('ignores the authentication dialog inactive interval and duplicate unlock taps', async () => {
    const gate = createAppLock(true)
    let finish!: (success: boolean) => void
    let prompts = 0
    const unlock = gate.unlock(() => { prompts++; return new Promise<boolean>(resolve => { finish = resolve }) })
    await gate.unlock(async () => { prompts++; return true })
    gate.change('inactive', 1_000)
    gate.change('active', 121_000)
    finish(true)
    await unlock
    expect(prompts).toBe(1)
    expect(gate.getState().locked).toBe(false)
  })

  it('keeps an obsolete authentication result separate from a new session', async () => {
    const previous = createAppLock(true)
    let finish!: (success: boolean) => void
    const unlock = previous.unlock(() => new Promise<boolean>(resolve => { finish = resolve }))
    const next = createAppLock(true)
    finish(true)
    await unlock
    expect(next.getState().locked).toBe(true)
  })

  it('does not relock while disabled or immediately after the already-verified enable action', () => {
    const gate = createAppLock(false)
    gate.change('background', 1_000)
    gate.change('active', 121_000)
    expect(gate.getState().locked).toBe(false)
    gate.configure(true)
    expect(gate.getState().locked).toBe(false)
    gate.change('background', 122_000)
    gate.change('active', 242_000)
    expect(gate.getState().locked).toBe(true)
    gate.configure(false)
    expect(gate.getState().locked).toBe(false)
  })
})
