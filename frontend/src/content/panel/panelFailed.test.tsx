import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap } from '../lib/types'
import { PanelFailed } from './PanelFailed'
import { PanelProvider } from './PanelProvider'

const boot = { brand: { id: 3, name: 'Lumière Salon' } } as unknown as Bootstrap

// Spec 2026-10-15 §3.3: a panel that breaks shows the portal's notice in the panel's place, with a way to close it.
describe('PanelFailed', () => {
  it('says the post could not be shown, in the panel\'s place, with Close', () => {
    const html = renderToStaticMarkup(
      <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PanelProvider><PanelFailed /></PanelProvider>
      </ContentContext.Provider>,
    )
    expect(html).toContain('data-panel=""')
    expect(html).toContain('role="alert"')
    expect(html).toContain('This post could not be shown. What you saved is safe.')
    expect(html).toMatch(/<button[^>]*>Close<\/button>/)
    // Final review: as wide as the panel (400 px), which the page makes room for when docked.
    expect(html).toContain('sm:w-[400px]')
    expect(html).not.toContain('sm:w-[480px]')
  })
})
