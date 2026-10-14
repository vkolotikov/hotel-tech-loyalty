import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = path.resolve(__dirname)
const css = fs.readFileSync(path.join(DIR, 'workspace.css'), 'utf8')
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1])
const family = (body: string) => /font-family:\s*'([^']+)'/.exec(body)?.[1]

describe('workspace type', () => {
  it('declares the three families, self-hosted', () => {
    for (const name of ['A Display', 'A Text', 'A Mono']) {
      expect(faces.some(f => family(f) === name), `${name} has no @font-face`).toBe(true)
    }
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
  })

  it('every face points at a file that exists and swaps in', () => {
    expect(faces.length, 'ten faces: 4 display, 3 text, 3 mono').toBe(10)
    for (const f of faces) {
      const url = /url\('\.\/fonts\/([^']+)'\)/.exec(f)?.[1]
      expect(url, `face without a local url: ${f}`).toBeDefined()
      expect(fs.existsSync(path.join(DIR, 'fonts', url!)), `${url} is missing`).toBe(true)
      expect(f).toContain('font-display: swap')
    }
  })

  it('every font file is a real woff2, not a saved error page', () => {
    const files = fs.readdirSync(path.join(DIR, 'fonts')).filter(n => n.endsWith('.woff2'))
    expect(files.length).toBe(10)
    for (const name of files) {
      const bytes = fs.readFileSync(path.join(DIR, 'fonts', name))
      expect(bytes.subarray(0, 4).toString('latin1'), `${name} is not a woff2`).toBe('wOF2')
      expect(bytes.length, `${name} is too small to be a font`).toBeGreaterThan(5000)
    }
  })

  it('draws Russian headings in a serif that has Cyrillic (Fraunces has none)', () => {
    const cyrillic = faces.find(f => family(f) === 'A Display' && f.includes('source-serif-4-cyrillic-wght'))
    expect(cyrillic).toBeDefined()
    expect(cyrillic).toMatch(/unicode-range:[^;]*U\+0400-045F/)
    expect(faces.filter(f => family(f) === 'A Display' && f.includes('fraunces')).every(f => !/U\+0400/.test(f))).toBe(true)
  })

  it('gives every face of a family the same style and weight range, so the subsets join into one face', () => {
    // A browser only stitches unicode-range subsets together when their descriptors match. With Source Serif 4
    // at 200 900 beside Fraunces at 100 900, Chrome picked the Fraunces group for weight 400 and set Russian
    // headings in Georgia (seen in the browser pass); its Cyrillic file was never even downloaded.
    const descriptors = (body: string) => `${/font-style:\s*([^;]+);/.exec(body)?.[1]} / ${/font-weight:\s*([^;]+);/.exec(body)?.[1]}`
    for (const name of ['A Display', 'A Text', 'A Mono']) {
      const seen = new Set(faces.filter(f => family(f) === name).map(descriptors))
      expect([...seen], `${name} faces disagree`).toHaveLength(1)
    }
  })

  it('lets font-a-display and font-a-mono win on headings (the neutraliser sits in :where, one class of specificity)', () => {
    // `[data-workspace] h1 { font-family: inherit }` has more specificity than a `.font-a-display` utility, so a
    // heading carrying the utility would stay in the text face. :where() keeps the rule at one class: it still
    // beats the admin's bare `h1, h2…`, and the utilities (emitted later) beat it.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...bare.matchAll(/(\[data-workspace\][^{}]*h[1-4][^{}]*)\{\s*font-family:\s*inherit;\s*\}/g)].map(m => m[1])
    expect(rules.length).toBeGreaterThan(0)
    for (const selectors of rules) {
      for (const selector of selectors.split(',').map(s => s.trim()).filter(Boolean)) {
        expect(selector, `${selector} out-ranks the font-a-* utilities`).toMatch(/^\[data-workspace\] :where\(h[1-4]\)$/)
      }
    }
  })

  it('ships the licences beside the files', () => {
    for (const name of ['OFL-Fraunces.txt', 'OFL-SourceSerif4.txt', 'OFL-InterTight.txt', 'OFL-IBMPlexMono.txt']) {
      expect(fs.existsSync(path.join(DIR, 'fonts', name)), `${name} is missing`).toBe(true)
    }
  })

  it("carries Source Serif 4's own copyright notice (Adobe), not the packager's", () => {
    const first = fs.readFileSync(path.join(DIR, 'fonts', 'OFL-SourceSerif4.txt'), 'utf8').split(/\r?\n/)[0]
    expect(first).toBe("Copyright 2014 - 2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.")
  })
})
