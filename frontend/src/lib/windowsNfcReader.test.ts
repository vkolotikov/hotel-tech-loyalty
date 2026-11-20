import { describe, expect, it } from 'vitest'
import { newlyPresentedCard, parseReaderSnapshot } from './windowsNfcReader'

describe('the Windows reader protocol', () => {
  const presentation = '1'.repeat(32)
  const raw = { version: 1, state: 'card', uid: '00112233445566', presentation }

  it('only accepts a supported card UID from the companion protocol', () => {
    expect(parseReaderSnapshot(raw)).toEqual({ state: 'card', uid: raw.uid, presentation })
    expect(parseReaderSnapshot({ ...raw, version: 0 })).toBeNull()
    expect(parseReaderSnapshot({ ...raw, uid: '010800010A' })).toBeNull()
    expect(parseReaderSnapshot({ ...raw, presentation: '' })).toBeNull()
    expect(parseReaderSnapshot({ version: 1, state: 'service' })).toEqual({ state: 'service' })
    expect(parseReaderSnapshot({ version: 1, state: 'other' })).toBeNull()
  })

  it('produces one scan per presentation, even if the same card is placed back on the reader', () => {
    const first = parseReaderSnapshot(raw)!
    expect(newlyPresentedCard(first, null)).toEqual(first)
    expect(newlyPresentedCard(first, presentation)).toBeNull()
    expect(newlyPresentedCard({ state: 'waiting' }, presentation)).toBeNull()
    const returned = parseReaderSnapshot({ ...raw, presentation: '2'.repeat(32) })!
    expect(newlyPresentedCard(returned, presentation)).toEqual(returned)
  })
})
