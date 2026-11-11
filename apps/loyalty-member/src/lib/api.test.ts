import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, connectSession } from './api'

afterEach(() => vi.unstubAllGlobals())
function session() {
  let token: string | null = 'test-member-session'
  const signedOut = vi.fn()
  connectSession({ token: () => token, language: () => 'de', signedOut, memberRequired: async () => {} })
  return { signedOut, change: () => { token = 'different-test-session' } }
}

describe('authenticated private vouchers', () => {
  it('preserves original bytes and uses bearer headers, never URL credentials', async () => {
    session()
    const bytes = new Uint8Array([37, 80, 68, 70, 0, 255])
    const fetcher = vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'application/pdf' } }))
    vi.stubGlobal('fetch', fetcher)
    const reply = await api.offerAttachment(8)
    expect(reply.bytes).toEqual(bytes)
    expect(reply.mime).toBe('application/pdf')
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/v1\/member\/portal\/offers\/8\/attachment$/)
    expect(url).not.toContain('test-member-session')
    expect(options.headers).toMatchObject({ Authorization: 'Bearer test-member-session' })
    expect(options.redirect).toBe('error')
  })
  it('does not deliver bytes after account switching', async () => {
    const owner = session()
    vi.stubGlobal('fetch', async () => { owner.change(); return new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }) })
    await expect(api.offerAttachment(8)).rejects.toThrow()
  })
  it('handles removed attachments and expired sessions without automatic retries', async () => {
    const owner = session()
    const fetcher = vi.fn(async () => new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(api.offerAttachment(8)).rejects.toThrow()
    expect(owner.signedOut).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledOnce()
    fetcher.mockImplementation(async () => new Response('{}', { status: 404 }))
    await expect(api.offerAttachment(8)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('rejects HTML and files over the server maximum', async () => {
    session()
    vi.stubGlobal('fetch', async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }))
    await expect(api.offerAttachment(8)).rejects.toThrow()
    vi.stubGlobal('fetch', async () => new Response('%PDF', { headers: { 'content-type': 'application/pdf', 'content-length': String(5 * 1024 * 1024 + 1) } }))
    await expect(api.offerAttachment(8)).rejects.toThrow()
  })
})
