import { describe, expect, it } from 'vitest'
import { groupBySubject, messageParties, splitMailBody } from './mailPresentation'

const parties = { from: ['"Alex Kim" <alex@example.test>'], to: ['sales@example.test'], cc: [] }
const row = (id: string, subject: string) => ({ id, subject, sent_at: null, participants: parties })

describe('CRM email reader', () => {
  it('matches the contact separately from the display name and checks carbon copies', () => {
    expect(messageParties(parties, 'ALEX@example.test')).toEqual({ direction: 'incoming', sender: 'Alex Kim' })
    expect(messageParties({ ...parties, cc: ['buyer@example.test'] }, 'buyer@example.test').direction).toBe('outgoing')
    expect(messageParties(parties, 'unrelated@example.test').direction).toBe('other')
  })

  it('groups repeated subjects in server order and keeps untitled messages separate', () => {
    const groups = groupBySubject([row('3', 'RE: AW: Proof'), row('2', 'Invoice'), row('1', 'proof'), row('a', ''), row('b', '')])
    expect(groups.map(g => g.messages.map(m => m.id))).toEqual([['3', '1'], ['2'], ['a'], ['b']])
  })

  it('collapses blank lines and separates a quoted tail without hiding inline answers', () => {
    expect(splitMailBody('Hi\r\n \r\n\r\n\r\nApproved.\n\nOn Tuesday Pat wrote:\n> Proof?')).toEqual({ current: 'Hi\n\nApproved.', quoted: 'On Tuesday Pat wrote:\n> Proof?' })
    expect(splitMailBody('> Price?\n€420.\n> Quantity?\n300.').quoted).toBe('')
    expect(splitMailBody('> original only').quoted).toBe('> original only')
  })
})
