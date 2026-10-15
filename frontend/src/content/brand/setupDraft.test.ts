import { describe, expect, it } from 'vitest'
import { clearSetupStep, loadSetupStep, saveSetupStep } from './setupDraft'

const memory = () => {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, removeItem: (k: string) => { map.delete(k) }, map }
}

describe('the Guided setup place, per brand on this device', () => {
  it('keeps each brand\'s step under its own key', () => {
    const storage = memory()
    saveSetupStep(3, 2, storage)
    saveSetupStep(7, 5, storage)
    expect(storage.map.get('content:setup-draft:3')).toBe('2')
    expect(loadSetupStep(3, storage)).toBe(2)
    expect(loadSetupStep(7, storage)).toBe(5)
    expect(loadSetupStep(9, storage)).toBeNull()
  })

  it('forgets it when setup is finished, and reads anything odd as no place', () => {
    const storage = memory()
    saveSetupStep(3, 2, storage)
    clearSetupStep(3, storage)
    expect(loadSetupStep(3, storage)).toBeNull()
    storage.setItem('content:setup-draft:3', 'banana')
    expect(loadSetupStep(3, storage)).toBeNull()
    storage.setItem('content:setup-draft:3', '-1')
    expect(loadSetupStep(3, storage)).toBeNull()
  })

  it('works without storage at all (private windows), keeping nothing', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    expect(() => saveSetupStep(3, 1, broken)).not.toThrow()
    expect(loadSetupStep(3, broken)).toBeNull()
  })
})
