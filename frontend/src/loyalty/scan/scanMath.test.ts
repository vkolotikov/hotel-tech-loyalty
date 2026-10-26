import { describe, expect, it } from 'vitest'
import type { ApiFailure } from '../lib/api'
import {
  cameraAttempt, cameraFailure, cardToLink, detectEnv, fieldAttempt, hexWithColons, isRepeat, linkCarriesMember, looksLikeAppCode,
  looksLikeCardId, looksLikeMemberNumber, modeState, nfcAttempt, nfcFailure, nfcState, refocusAfter, REPEAT_MS, scanTrouble, shortUid,
  usbAttempt, fieldAfter, gotNoAnswer, keyFor, REPLAY_MS, type ScanEnv,
} from './scanMath'
import { decodeRecord } from './useWebNfc'

const env = (more: Partial<ScanEnv> = {}): ScanEnv => ({ secure: true, camera: true, webNfc: true, webHid: true, ...more })
const failure = (code: string, extra: Record<string, unknown> = {}): ApiFailure => ({ status: 404, code, extra })
const named = (name: string) => Object.assign(new Error(name), { name })

describe('a scan that got no answer (release 9)', () => {
  const fresh = () => 'new-key'
  const last = { code: 'LS-001001', where: 'place=3', key: 'old-key', at: 1_000 }
  it('sends the same code again with its own key, at the same place, within the replay window', () => {
    expect(keyFor('LS-001001', 'place=3', last, 1_000 + 60_000, fresh)).toBe('old-key')
    expect(keyFor('LS-001002', 'place=3', last, 2_000, fresh)).toBe('new-key')
    expect(keyFor('LS-001001', 'desk', last, 2_000, fresh)).toBe('new-key')
    expect(keyFor('LS-001001', 'place=3', last, 1_000 + REPLAY_MS, fresh)).toBe('new-key')
    expect(keyFor('LS-001001', 'place=3', null, 2_000, fresh)).toBe('new-key')
  })
  it('only a lost answer, the server’s trouble or a scan still being checked counts as no answer', () => {
    expect(gotNoAnswer({ status: 0, code: 'network', extra: {} })).toBe(true)
    expect(gotNoAnswer({ status: 503, code: 'unknown', extra: {} })).toBe(true)
    expect(gotNoAnswer({ status: 409, code: 'in_progress', extra: {} })).toBe(true)
    expect(gotNoAnswer({ status: 404, code: 'not_found', extra: {} })).toBe(false)
    expect(gotNoAnswer({ status: 410, code: 'used_up', extra: {} })).toBe(false)
    expect(gotNoAnswer({ status: 422, code: 'invalid', extra: {} })).toBe(false)
  })
  it('clears the field after a scan unless the next code was begun meanwhile', () => {
    expect(fieldAfter('LS-001001', 'LS-001001')).toBe('')
    expect(fieldAfter(' LS-001001 ', 'LS-001001')).toBe('')
    expect(fieldAfter('LS-00', 'LS-001001')).toBe('LS-00')
  })
})

describe('which ways of scanning a device offers', () => {
  it('reads nothing where there is no browser (the tests, a server render)', () => {
    expect(detectEnv()).toEqual({ secure: false, camera: false, webNfc: false, webHid: false })
  })

  it('the camera needs https and a camera; NFC needs Web NFC; the USB reader needs WebHID', () => {
    expect(modeState('camera', env())).toBe('ready')
    expect(modeState('camera', env({ secure: false }))).toBe('insecure')
    expect(modeState('camera', env({ camera: false }))).toBe('unsupported')
    expect(modeState('nfc', env())).toBe('ready')
    expect(modeState('nfc', env({ webNfc: false }))).toBe('unsupported')
    expect(modeState('usb', env({ webHid: false }))).toBe('unsupported')
  })

  it('the NFC panel: unsupported, starting, listening, or the failure', () => {
    expect(nfcState(env({ webNfc: false }), false, null)).toBe('unsupported')
    expect(nfcState(env(), false, 'unsupported')).toBe('unsupported')
    expect(nfcState(env(), false, null)).toBe('starting')
    expect(nfcState(env(), true, null)).toBe('listening')
    expect(nfcState(env(), false, 'denied')).toBe('denied')
    expect(nfcState(env(), true, 'unreadable')).toBe('unreadable')
  })
})

describe('the camera’s and NFC’s failures as sentences', () => {
  it('names the camera’s', () => {
    expect(cameraFailure(named('NotAllowedError'))).toBe('denied')
    expect(cameraFailure(named('NotFoundError'))).toBe('absent')
    expect(cameraFailure(named('OverconstrainedError'))).toBe('absent')
    expect(cameraFailure(named('NotReadableError'))).toBe('busy')
    expect(cameraFailure(new Error('boom'))).toBe('unknown')
    expect(cameraFailure(null)).toBe('unknown')
  })

  it('names Web NFC’s', () => {
    expect(nfcFailure(named('NotAllowedError'))).toBe('denied')
    expect(nfcFailure(named('NotSupportedError'))).toBe('unsupported')
    expect(nfcFailure(named('NotReadableError'))).toBe('off')
    expect(nfcFailure('weird')).toBe('unknown')
  })
})

describe('what a code looks like', () => {
  it('the app’s code, however the punctuation was bent', () => {
    expect(looksLikeAppCode('{"type":"hotel_loyalty","member_number":"LS-001001","version":2}')).toBe(true)
    expect(looksLikeAppCode('ÜÄtzpeÄÖÄhotel?lozaltzÄ,Ämember?numberÄÖÄLSß001001Ä*')).toBe(true)
    expect(looksLikeAppCode('{"token":"abc"}')).toBe(true)
    expect(looksLikeAppCode('LS-001001')).toBe(false)
  })

  it('a member number', () => {
    for (const yes of ['LS-001001', '#HL-2026-000001', 'M012345', 'ls001001', '001001']) expect(looksLikeMemberNumber(yes), yes).toBe(true)
    for (const no of ['hello', 'https://x.example/a', '12', '{"a":1}']) expect(looksLikeMemberNumber(no), no).toBe(false)
  })

  it('a card’s ID: hex of 4 to 10 bytes with separators or letters, or 8 to 17 decimal digits', () => {
    for (const yes of ['04:A2:B3:C4', '04a2b3c4d5e6f7', '04 A2 B3 C4', '0077771716', '12345678', '1304792892040951']) expect(looksLikeCardId(yes), yes).toBe(true)
    for (const no of ['LS-001001', '001001', '04a2b', 'a2b3c4', '', '123456789012345678']) expect(looksLikeCardId(no), no).toBe(false)
  })

  it('a link that carries a member', () => {
    expect(linkCarriesMember('https://venue.example/card?member_number=LS-001001')).toBe(true)
    expect(linkCarriesMember('https://venue.example/members/LS-001001')).toBe(true)
    expect(linkCarriesMember('https://venue.example/?token=abc')).toBe(true)
    expect(linkCarriesMember('https://venue.example/menu')).toBe(false)
    expect(linkCarriesMember('LS-001001')).toBe(false)
  })

  it('shows a card’s ID as people read it, and short on the member’s page', () => {
    expect(hexWithColons('04a2b3c4')).toBe('04:A2:B3:C4')
    expect(shortUid('04a2b3c4')).toBe('04:A2:B3:C4')
    expect(shortUid('04a2b3c4d5e6f7')).toBe('04:A2:…:E6:F7')
    expect(shortUid('')).toBe('')
  })
})

describe('what a tap sends', () => {
  const serial = '04:a2:b3:c4:d5:e6:f7'

  it('the card’s serial number when it carries nothing else', () => {
    expect(nfcAttempt(serial, [])).toEqual({ code: serial, source: 'nfc', card: serial })
    expect(nfcAttempt(serial, [{ recordType: 'url', text: 'https://venue.example/menu' }])).toEqual({ code: serial, source: 'nfc', card: serial })
  })

  it('a text record with the app’s code or a member number wins over the serial, which stays the card to link', () => {
    const json = '{"type":"hotel_loyalty","member_number":"LS-001001","version":2}'
    expect(nfcAttempt(serial, [{ recordType: 'text', text: 'Hello' }, { recordType: 'text', text: json }])).toEqual({ code: json, source: 'nfc', card: serial })
    expect(nfcAttempt(serial, [{ recordType: 'text', text: ' LS-001001 ' }])).toEqual({ code: 'LS-001001', source: 'nfc', card: serial })
    expect(nfcAttempt(serial, [{ recordType: 'mime', mediaType: 'application/json', text: json }])?.code).toBe(json)
    expect(nfcAttempt(serial, [{ recordType: 'url', text: 'https://venue.example/members/LS-001001' }])?.code).toBe('https://venue.example/members/LS-001001')
  })

  it('a tag without a serial sends its record; one with neither sends nothing', () => {
    expect(nfcAttempt('', [{ recordType: 'text', text: 'LS-001001' }])).toEqual({ code: 'LS-001001', source: 'nfc', card: null })
    expect(nfcAttempt(undefined, [{ recordType: 'text', text: 'Hello' }])).toBeNull()
  })

  it('reads a record’s text in its own encoding, and nothing from a record it cannot read', () => {
    const bytes = new TextEncoder().encode('LS-001001')
    expect(decodeRecord({ recordType: 'text', encoding: 'utf-8', data: new DataView(bytes.buffer) }).text).toBe('LS-001001')
    expect(decodeRecord({ recordType: 'url', data: new DataView(new TextEncoder().encode('https://x.example/m/LS-1').buffer) }).text).toBe('https://x.example/m/LS-1')
    expect(decodeRecord({ recordType: 'smart-poster', data: new DataView(bytes.buffer) }).text).toBeNull()
    expect(decodeRecord({ recordType: 'text' }).text).toBeNull()
  })

  it('the same card again within a moment is one tap', () => {
    expect(isRepeat(null, 'a', 1000)).toBe(false)
    expect(isRepeat({ code: 'a', at: 1000 }, 'a', 1000 + REPEAT_MS - 1)).toBe(true)
    expect(isRepeat({ code: 'a', at: 1000 }, 'a', 1000 + REPEAT_MS)).toBe(false)
    expect(isRepeat({ code: 'a', at: 1000 }, 'b', 1001)).toBe(false)
  })
})

describe('the other ways in', () => {
  it('a USB reader’s hex is sent and linked with colons; the camera’s text as decoded; the field’s trimmed', () => {
    expect(usbAttempt('04a2b3c4')).toEqual({ code: '04:A2:B3:C4', source: 'usb', card: '04:A2:B3:C4' })
    expect(cameraAttempt('{"a":1}')).toEqual({ code: '{"a":1}', source: 'camera', card: null })
    expect(fieldAttempt(' LS-001001 ')).toEqual({ code: 'LS-001001', source: 'field', card: null })
    expect(fieldAttempt('0077771716')).toEqual({ code: '0077771716', source: 'field', card: '0077771716' })
  })

  it('the field takes the focus back after the field and the USB reader, not after the camera or a tap', () => {
    expect(refocusAfter('field')).toBe(true)
    expect(refocusAfter('usb')).toBe(true)
    expect(refocusAfter('camera')).toBe(false)
    expect(refocusAfter('nfc')).toBe(false)
  })
})

describe('what a refused scan says and offers', () => {
  const tap = nfcAttempt('04:a2:b3:c4', [])!

  it('a card nobody has offers to link it', () => {
    expect(scanTrouble(failure('not_found'), tap)).toBe('card_unknown')
    expect(cardToLink('card_unknown', tap)).toBe('04:a2:b3:c4')
    expect(scanTrouble(failure('not_found'), fieldAttempt('04 A2 B3 C4'))).toBe('card_unknown')
  })

  it('a card switched off here offers to link it again, even when it was typed', () => {
    const typed = fieldAttempt('LS1')
    expect(scanTrouble(failure('inactive', { card: 'off' }), typed)).toBe('card_off')
    expect(cardToLink('card_off', typed)).toBe('LS1')
  })

  it('a member number nobody has, the camera’s code, a switched-off member and a used-up code offer nothing', () => {
    expect(scanTrouble(failure('not_found'), fieldAttempt('LS-999999'))).toBe('refusal')
    expect(scanTrouble(failure('not_found'), cameraAttempt('{"member_number":"LS-9"}'))).toBe('refusal')
    expect(scanTrouble(failure('inactive'), tap)).toBe('refusal')
    expect(scanTrouble(failure('used_up'), tap)).toBe('refusal')
    expect(cardToLink('refusal', tap)).toBeNull()
  })
})
