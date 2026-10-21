import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageBoundary } from './PageBoundary'

// Plan C's review: one broken page showed the app-wide fallback in English, with the raw error.
describe('PageBoundary', () => {
  it('turns a page that broke into the portal\'s notice with a way to reload', () => {
    expect(PageBoundary.getDerivedStateFromError()).toEqual({ failed: true })
    const boundary = new PageBoundary({ message: 'This page could not be shown.', reload: 'Reload the page', children: null })
    boundary.state = { failed: true }
    const html = renderToStaticMarkup(<>{boundary.render()}</>)
    expect(html).toContain('role="alert"')
    expect(html).toContain('This page could not be shown.')
    expect(html).toContain('>Reload the page<')
  })

  it('shows the fallback it was given in place of its own notice', () => {
    const boundary = new PageBoundary({ message: 'x', reload: 'y', fallback: <aside>The panel could not be shown</aside>, children: null })
    boundary.state = { failed: true }
    const html = renderToStaticMarkup(<>{boundary.render()}</>)
    expect(html).toContain('The panel could not be shown')
    expect(html).not.toContain('>y<')
  })

  it('shows the page when nothing broke', () => {
    expect(renderToStaticMarkup(<PageBoundary message="x" reload="y"><p>The page</p></PageBoundary>)).toContain('The page')
  })
})
