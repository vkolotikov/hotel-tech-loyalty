import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WalletButtons } from './WalletButtons'

const boot = vi.hoisted(() => ({ wallets: undefined as { apple: boolean; google: boolean } | undefined }))
vi.mock('../PortalProvider', () => ({ usePortal: () => ({ data: { capabilities: { wallets: boot.wallets } } }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }))
vi.mock('../lib/portalApi', () => ({ portalApi: {}, apiMessage: (_error: unknown, fallback: string) => fallback }))
afterEach(() => { boot.wallets = undefined; vi.unstubAllGlobals() })

describe('member wallet availability', () => {
  it('offers no wallet action when setup flags are missing or both providers are off', () => {
    expect(renderToStaticMarkup(<WalletButtons />)).toBe('')
    boot.wallets = { apple: false, google: false }
    expect(renderToStaticMarkup(<WalletButtons />)).toBe('')
  })
  it('offers only the configured Google provider', () => {
    boot.wallets = { apple: false, google: true }
    const html = renderToStaticMarkup(<WalletButtons />)
    expect(html).toContain('Add to Google Wallet')
    expect(html).not.toContain('Add to Apple Wallet')
  })
  it('offers Apple only on an Apple device and when the server enables it', () => {
    boot.wallets = { apple: true, google: false }
    vi.stubGlobal('navigator', { userAgent: 'Android' })
    expect(renderToStaticMarkup(<WalletButtons />)).toBe('')
    vi.stubGlobal('navigator', { userAgent: 'iPhone' })
    expect(renderToStaticMarkup(<WalletButtons />)).toContain('Add to Apple Wallet')
    boot.wallets.apple = false
    expect(renderToStaticMarkup(<WalletButtons />)).toBe('')
  })
})
