import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A switch knob is an absolutely positioned round element slid with
 * `translate-x-*`. Without a `left-*` class it sits at its static position,
 * and inside a <button> (which centres its content) that is mid-track, so the
 * knob slides past the end of the track. Every knob names its left edge.
 */
const SRC = path.resolve(__dirname, '..')
function files(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) return rel === 'portal' || rel === 'appointments' ? [] : files(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}
function chunks(source: string): string[] {
  return [...source.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map(m => m[0])
}
const has = (chunk: string, re: RegExp) => re.test(chunk)

/** Every JSX `className={…}` expression with its string pieces joined, so classes split over `+` or template parts are seen whole. */
function classNameExpressions(source: string): string[] {
  const out: string[] = []
  const open = /className=\{/g
  while (open.exec(source)) {
    let depth = 1
    let i = open.lastIndex
    for (; i < source.length && depth > 0; i++) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') depth--
    }
    const expr = source.slice(open.lastIndex, i - 1)
    out.push(chunks(expr).map(c => c.slice(1, -1)).join(' '))
  }
  return out
}
const isBadKnob = (c: string) =>
  has(c, /(?<![\w:/-])absolute(?![\w-])/) &&
  has(c, /(?<![\w:/-])rounded-full(?![\w-])/) &&
  has(c, /(?<![\w:/-])-?translate-x-/) &&
  !has(c, /(?<![\w:/-])-?left-/)

describe('switch knobs', () => {
  it('every absolute round translate-x knob names a left edge', () => {
    const bad: string[] = []
    for (const file of files(SRC)) {
      for (const chunk of chunks(fs.readFileSync(file, 'utf8'))) {
        if (
          has(chunk, /(?<![\w:/-])absolute(?![\w-])/) &&
          has(chunk, /(?<![\w:/-])rounded-full(?![\w-])/) &&
          has(chunk, /(?<![\w:/-])-?translate-x-/) &&
          !has(chunk, /(?<![\w:/-])-?left-/)
        ) bad.push(`${path.relative(SRC, file).split(path.sep).join('/')}: ${chunk.slice(0, 90)}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('also holds for a className expression whose classes are split across strings', () => {
    const bad: string[] = []
    for (const file of files(SRC)) {
      for (const expr of classNameExpressions(fs.readFileSync(file, 'utf8'))) {
        if (isBadKnob(expr)) bad.push(`${path.relative(SRC, file).split(path.sep).join('/')}: ${expr.slice(0, 90)}`)
      }
    }
    expect(bad).toEqual([])
  })
})
