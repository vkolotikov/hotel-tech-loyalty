import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThemeSwitch } from './ThemeSwitch'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k }) }))

describe('ThemeSwitch', () => {
  it('beside its words, keeps the hint on Auto as a title and draws no hover label', () => {
    const html = renderToStaticMarkup(<ThemeSwitch value="light" onChange={() => {}} />)
    expect(html).toContain('title="Auto follows this device"')
    expect(html).not.toContain('data-tip')
  })

  it('marks the pressed choice by weight as well as by colour, on the side panel and on a surface', () => {
    for (const tone of ['side', 'surface'] as const) {
      const html = renderToStaticMarkup(<ThemeSwitch value="dark" onChange={() => {}} tone={tone} />)
      const buttons = [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*class="([^"]*)"/g)]
      expect(buttons.map(m => m[1]), tone).toEqual(['false', 'true', 'false'])
      for (const [, pressed, cls] of buttons) {
        const classes = cls.split(' ')
        expect(classes, `${tone} pressed=${pressed}`).toContain(pressed === 'true' ? 'font-semibold' : 'font-medium')
        expect(classes, `${tone} pressed=${pressed}`).not.toContain(pressed === 'true' ? 'font-medium' : 'font-semibold')
      }
    }
  })

  it('in the slim side panel shows one label per button: the hover label, not the title as well', () => {
    const html = renderToStaticMarkup(<ThemeSwitch value="light" onChange={() => {}} vertical />)
    for (const label of ['Light', 'Dark', 'Auto']) expect(html).toContain(`data-tip="${label}"`)
    expect(html).not.toContain('title=')
    // The words stay as the buttons' names.
    expect(html).toMatch(/<span class="sr-only">Auto<\/span>/)
  })
})
