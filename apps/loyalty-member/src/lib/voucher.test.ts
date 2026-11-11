import { afterEach, describe, expect, it, vi } from 'vitest'
import { openVoucher } from './voucher'

const state = vi.hoisted(() => ({ token: 'fixture-session', exists: false, uri: '', writes: [] as Uint8Array[] }))
const sharing = vi.hoisted(() => ({ isAvailableAsync: vi.fn(async () => true), shareAsync: vi.fn(async () => {}) }))
const fileReply = vi.hoisted(() => ({ download: vi.fn(async () => ({ bytes: new Uint8Array([37,80,68,70]), mime: 'application/pdf' })) }))
vi.mock('./api', () => ({ api: { offerAttachment: fileReply.download } }))
vi.mock('./session', () => ({ useSession: { getState: () => ({ token: state.token }) } }))
vi.mock('expo-sharing', () => sharing)
vi.mock('expo-crypto', () => ({ randomUUID: () => 'unique-fixture' }))
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    uri: string
    constructor(parent: string, leaf: string) { this.uri = `${parent}/${leaf}` }
    get exists() { return state.exists }
    create() { state.exists = true }
    delete() { state.exists = false }
  },
  File: class {
    uri: string
    constructor(dir: {uri:string}, leaf:string) { this.uri = `${dir.uri}/${leaf}`; state.uri = this.uri }
    async write(bytes:Uint8Array) { state.writes.push(bytes) }
  },
}))

afterEach(() => {
  state.token = 'fixture-session'; state.exists = false; state.writes = []; state.uri = ''
  vi.clearAllMocks()
  sharing.shareAsync.mockReset().mockResolvedValue(undefined)
  fileReply.download.mockReset().mockResolvedValue({ bytes: new Uint8Array([37,80,68,70]), mime: 'application/pdf' })
})

describe('native voucher sharing lifecycle', () => {
  it('shares original bytes from a unique cache path then deletes the copy', async () => {
    await openVoucher(12, '../voucher.pdf')
    expect(state.writes[0]).toEqual(new Uint8Array([37,80,68,70]))
    expect(sharing.shareAsync).toHaveBeenCalledWith('file:///cache/voucher-unique-fixture/voucher.pdf', expect.objectContaining({ mimeType:'application/pdf' }))
    expect(state.exists).toBe(false)
  })
  it('deletes private bytes after the system share sheet fails', async () => {
    sharing.shareAsync.mockRejectedValueOnce(new Error('no share target'))
    await expect(openVoucher(12, 'voucher.pdf')).rejects.toThrow('no share target')
    expect(state.exists).toBe(false)
  })
  it('does not create or share a file if sign-out happens during the request', async () => {
    fileReply.download.mockImplementationOnce(async () => { state.token = ''; return { bytes: new Uint8Array([37]), mime:'application/pdf' } })
    await expect(openVoucher(12, 'voucher.pdf')).rejects.toThrow('Account changed')
    expect(state.writes).toHaveLength(0)
    expect(sharing.shareAsync).not.toHaveBeenCalled()
  })
})
