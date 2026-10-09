import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The floating AI launcher sits above the page, the header (z-35) and the
 * mobile bar's layer, but under drawers and modals (z-50). On their layer it
 * painted over their bottom-right corner, where the main button lives
 * ("Create inquiry", "Save changes").
 */
const aiChat = readFileSync(new URL('./AiChat.tsx', import.meta.url), 'utf8')

describe('AI launcher layer', () => {
  it('stays under drawers and modals', () => {
    const at = aiChat.indexOf('aria-label="Open AI Assistant"')
    const opening = aiChat.lastIndexOf('<', at)
    const className = aiChat.slice(opening, at).match(/className="([^"]*)"/)?.[1] ?? ''
    expect(className).toMatch(/(?:^|\s)fixed(?:\s|$)/)
    expect(className).toMatch(/(?:^|\s)z-40(?:\s|$)/)
  })
})
