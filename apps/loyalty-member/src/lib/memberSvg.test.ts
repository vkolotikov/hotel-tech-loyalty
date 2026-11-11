import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberSvgXml } from './memberSvg'

const fixture = vi.hoisted(() => ({
  source: { name: 'ui-X', type: 'svg', hash: 'svg-test', uri: 'assets_eclipse_ui_x', width: 28, height: 28, downloaded: true, localUri: 'assets_eclipse_ui_x' },
  descriptors: [] as Record<string, unknown>[],
  copy: vi.fn(), read: vi.fn(), fetch: vi.fn(),
}))
vi.mock('expo-asset', () => ({ Asset: class {
  static fromModule() { return fixture.source }
  constructor(source: Record<string, unknown>) { fixture.descriptors.push(source) }
  localUri: string | null = null
  async downloadAsync() { const result = await fixture.copy(); this.localUri = result.localUri; return this }
} }))
vi.mock('expo-file-system', () => ({ File: class {
  constructor(private uri: string) {}
  text() { return fixture.read(this.uri) }
} }))

let id = 0
afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  vi.clearAllMocks(); fixture.descriptors.length = 0; fixture.source.hash = `svg-test-${++id}`
  fixture.copy.mockResolvedValue({ localUri: 'file:///cache/exact-icon.svg' })
  fixture.read.mockResolvedValue('<svg><path stroke="white" d="M1 1L2 2"/></svg>')
  fixture.fetch.mockRejectedValue(new TypeError('Cannot fetch Android resource identifier'))
  vi.stubGlobal('fetch', fixture.fetch)
})
describe('packaged member SVG assets', () => {
  it('copies dimensioned Android raw resources before reading the unchanged SVG', async () => {
    await expect(memberSvgXml(1)).resolves.toBe('<svg><path stroke="white" d="M1 1L2 2"/></svg>')
    expect(fixture.descriptors).toEqual([{ name: 'ui-X', type: 'svg', hash: fixture.source.hash, uri: 'assets_eclipse_ui_x' }])
    expect(fixture.read).toHaveBeenCalledWith('file:///cache/exact-icon.svg')
    expect(fixture.fetch).not.toHaveBeenCalled()
  })
  it('shares the in-flight copy and read across repeated icons', async () => {
    const [a,b] = await Promise.all([memberSvgXml(1), memberSvgXml(1)])
    expect(a).toBe(b); expect(fixture.copy).toHaveBeenCalledTimes(1); expect(fixture.read).toHaveBeenCalledTimes(1)
  })
  it('retries after a failed native copy instead of caching a rejected promise', async () => {
    fixture.copy.mockRejectedValueOnce(new Error('Temporary cache failure'))
    await expect(memberSvgXml(1)).rejects.toThrow('Temporary cache failure')
    await expect(memberSvgXml(1)).resolves.toContain('<svg>')
    expect(fixture.copy).toHaveBeenCalledTimes(2)
  })
})
