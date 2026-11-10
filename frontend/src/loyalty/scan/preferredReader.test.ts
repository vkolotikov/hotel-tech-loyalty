import { describe, expect, it } from 'vitest'
import { firstReader, physicalCardAttempt } from './preferredReader'
describe('door reading preference and reusable physical identity', () => {
  const env = { secure: true, camera: true, webNfc: true, webHid: true }
  it('leads with supported NFC, honours available fallbacks and never asks for permission', () => {
    expect(firstReader(env)).toBe('nfc')
    expect(firstReader({ ...env, webNfc: false })).toBe('camera')
    expect(firstReader({ ...env, secure: false })).toBe('camera')
    expect(firstReader(env, 'camera')).toBe('camera')
    expect(firstReader(env, 'usb')).toBe('usb')
    expect(firstReader({ ...env, webNfc: false }, 'nfc')).toBe('camera')
  })
  it('uses an explicit serial for physical taps while keeping record-only personal Wallet tokens personal', () => {
    expect(physicalCardAttempt({ source: 'nfc', code: 'personal-token', card: '04:AB:01:02' })).toEqual({ source: 'nfc', code: 'personal-token', card: '04:AB:01:02' })
    expect(physicalCardAttempt({ source: 'nfc', code: '04:AB:01:02', card: '04:AB:01:02' }).code).toBe('HTCARD:04:AB:01:02')
    expect(physicalCardAttempt({ source: 'nfc', code: 'personal-token', card: null }).code).toBe('personal-token')
  })
})
