import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentErrorBoundary } from './ContentErrorBoundary'

// Plan C's review: one broken page showed the app-wide fallback in English, with the raw error.
describe('ContentErrorBoundary', () => {
  it('turns a page that broke into the portal\'s notice with a way to reload', () => {
    expect(ContentErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true })
    const boundary = new ContentErrorBoundary({ message: 'This page could not be shown.', reload: 'Reload the page', children: null })
    boundary.state = { failed: true }
    const html = renderToStaticMarkup(<>{boundary.render()}</>)
    expect(html).toContain('role="alert"')
    expect(html).toContain('This page could not be shown.')
    expect(html).toContain('>Reload the page<')
  })

  it('shows the page when nothing broke', () => {
    expect(renderToStaticMarkup(<ContentErrorBoundary message="x" reload="y"><p>The page</p></ContentErrorBoundary>)).toContain('The page')
  })
})
