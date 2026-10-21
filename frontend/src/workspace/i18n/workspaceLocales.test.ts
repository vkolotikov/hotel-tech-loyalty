import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `workspace.${locale}.json`), 'utf8'))
}
function appointments(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../../appointments/i18n', `appointments.${locale}.json`), 'utf8'))
}
function content(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../../content/i18n', `content.${locale}.json`), 'utf8'))
}

/** The words that moved here with Content's frame (spec 2026-10-21 Loyalty §6.1), and the key each had in Content. */
const FROM_CONTENT: Record<string, string> = {
  'shell.workspace': 'shell.workspace',
  'shell.settings': 'shell.settings',
  'shell.help': 'shell.help',
  'shell.role.owner': 'shell.role.owner',
  'shell.role.manager': 'shell.role.manager',
  'shell.role.staff': 'shell.role.staff',
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}
function flatten(o: unknown, prefix = ''): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

describe('workspace bundle', () => {
  it('the five bundles carry exactly the same key set', () => {
    const en = flatten(bundle('en')).sort()
    expect(en.length).toBeGreaterThan(0)
    for (const locale of LOCALES) expect(flatten(bundle(locale)).sort(), `${locale} keys differ from en`).toEqual(en)
  })

  it('no value is empty', () => {
    for (const locale of LOCALES) {
      const json = bundle(locale)
      expect(flatten(json).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() }), locale).toEqual([])
    }
  })

  it('every placeholder in the English text survives in each translation', () => {
    const en = bundle('en')
    for (const key of flatten(en)) {
      const wanted = [...String(at(en, key)).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
      for (const locale of LOCALES) {
        const got = [...String(at(bundle(locale), key)).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
        expect(got, `${locale}:${key}`).toEqual(wanted)
      }
    }
  })

  it('the words moved without changing: each reads as the Appointments bundle reads the same key', () => {
    for (const locale of LOCALES) {
      const words = appointments(locale)
      for (const key of flatten(bundle(locale)).filter(k => !(k in FROM_CONTENT))) expect(at(bundle(locale), key), `${locale}:${key}`).toBe(at(words, key))
    }
  })

  it('the words of Content\'s frame moved without changing: each reads as Content\'s bundle reads it', () => {
    for (const locale of LOCALES) {
      const words = content(locale)
      for (const [key, was] of Object.entries(FROM_CONTENT)) expect(at(bundle(locale), key), `${locale}:${key}`).toBe(at(words, was))
    }
  })
})
