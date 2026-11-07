import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { nextStepWord } from './taskWords'

// The default text stands in for the translation, as i18next answers without a bundle.
const t = ((_key: string, fallback: string) => fallback) as unknown as TFunction

describe('nextStepWord', () => {
  it('names a task type’s code and keeps what a person typed', () => {
    expect(nextStepWord(t, 'call')).toBe('Call')
    expect(nextStepWord(t, 'follow_up')).toBe('Follow up')
    expect(nextStepWord(t, 'send_proposal')).toBe('Send a proposal')
    expect(nextStepWord(t, 'Call back on Friday')).toBe('Call back on Friday')
    expect(nextStepWord(t, 'constructor')).toBe('constructor')
  })

  it('says nothing for an empty step', () => {
    expect(nextStepWord(t, null)).toBeNull()
    expect(nextStepWord(t, '  ')).toBeNull()
    expect(nextStepWord(t, undefined)).toBeNull()
  })
})
