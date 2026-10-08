import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * A ratchet on `position: fixed` elements nested inside a surface that Glass
 * blurs. Any `backdrop-filter` makes its element the containing block for
 * fixed descendants (CSS Filter Effects 2), so a full-screen modal inside a
 * blurred panel shrinks to the panel and is clipped by it. glass.css gives a
 * backdrop-filter to the sidebar and header, the bottom navigation, every
 * menu, popover, sticky bar and modal panel drawn on a dark surface (the
 * overlay rule), and Tailwind's backdrop-blur classes add one in both styles.
 *
 * Render such a modal as a sibling of the blurred element (or through a
 * portal) instead. The count may only go down: when you remove one, lower the
 * baseline in the same commit; never raise it.
 *
 * Today's one: Inquiries.tsx's GuestPicker "New guest" modal inside the old
 * Add Inquiry modal, which is dead code (`false && showCreate`).
 */
const BASELINE = 1

const SRC = path.resolve(__dirname, '..')

// The surfaces the glass.css overlay rule matches.
const SURFACES = ['bg-dark-bg', 'bg-dark-surface', 'bg-dark-surface2', 'bg-dark-card', 'bg-panel', 'bg-panel-dim', 'bg-well']
const INLINE_FIXED = /position:\s*['"]fixed['"]/

function adminSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) return rel === 'portal' || rel === 'appointments' ? [] : adminSourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement
interface Element { classes: Set<string>; style: string; tag: string }

const isJsx = (node: ts.Node): node is JsxNode => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)

/** createPortal(…) renders elsewhere in the DOM: not nested, whatever the JSX says. */
const isPortal = (node: ts.Node, sf: ts.SourceFile) =>
  ts.isCallExpression(node) && /(^|\.)createPortal$/.test(node.expression.getText(sf))

/** Every static string in a className expression (literals, template parts, both sides of a ternary). */
function staticText(node: ts.Node): string {
  const parts: string[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      parts.push(n.text)
    } else if (ts.isTemplateExpression(n)) {
      parts.push(n.head.text)
      for (const span of n.templateSpans) {
        visit(span.expression)
        parts.push(span.literal.text)
      }
    } else {
      ts.forEachChild(n, visit)
    }
  }
  visit(node)
  return parts.join(' ')
}

function element(node: JsxNode, sf: ts.SourceFile): Element {
  const opening = ts.isJsxElement(node) ? node.openingElement : node
  let className = ''
  let style = ''
  for (const attr of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !attr.initializer) continue
    const name = attr.name.getText(sf)
    if (name === 'className') className = staticText(attr.initializer)
    if (name === 'style') style = attr.initializer.getText(sf)
  }
  return { classes: new Set(className.split(/\s+/).filter(Boolean)), style, tag: opening.tagName.getText(sf) }
}

const isFixed = (el: Element) => el.classes.has('fixed') || INLINE_FIXED.test(el.style)

/** Whether glass.css (or a backdrop-blur class) gives this element a backdrop-filter. */
function blurs(el: Element, parent: Element | undefined): boolean {
  const has = (c: string) => el.classes.has(c)
  if (has('hx-sidebar') || has('hx-header') || has('mobile-bottom-nav')) return true
  if ([...el.classes].some(c => c.startsWith('backdrop-blur'))) return true
  if (!SURFACES.some(has)) return false
  if (has('absolute') || has('fixed') || has('sticky') || INLINE_FIXED.test(el.style)) return true
  if (has('shadow-xl') || has('shadow-2xl')) return true
  // A modal panel directly inside a `fixed inset-0` scrim.
  return parent !== undefined && parent.classes.has('fixed') && parent.classes.has('inset-0')
}

/** The line of the first `fixed` element a JSX subtree renders in place (portals left out). */
function firstFixedLine(root: ts.Node, sf: ts.SourceFile): number | null {
  let line: number | null = null
  const visit = (n: ts.Node): void => {
    if (line !== null || isPortal(n, sf)) return
    if (isJsx(n) && isFixed(element(n, sf))) {
      line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(root)
  return line
}

interface Frame { el: Element; line: number; blurs: boolean }

/** `file:line` of every fixed element nested in a blurred one, with the blurred ancestor's line. */
function scanFile(file: string): string[] {
  const rel = path.relative(SRC, file).split(path.sep).join('/')
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

  // Components declared in this file that render a fixed element: using one
  // inside a blurred element nests that fixed element too.
  const fixedComponents = new Map<string, number>()
  const noteComponent = (name: string, body: ts.Node) => {
    if (!/^[A-Z]/.test(name)) return
    const line = firstFixedLine(body, sf)
    if (line !== null) fixedComponents.set(name, line)
  }
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) noteComponent(statement.name.text, statement)
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) noteComponent(decl.name.text, decl.initializer)
      }
    }
  }

  const found: string[] = []
  const walk = (node: ts.Node, stack: Frame[]): void => {
    if (isPortal(node, sf)) {
      ts.forEachChild(node, child => walk(child, []))
      return
    }
    if (!isJsx(node)) {
      ts.forEachChild(node, child => walk(child, stack))
      return
    }
    const el = element(node, sf)
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    const blurred = stack.find(frame => frame.blurs)
    if (blurred && isFixed(el)) {
      found.push(`${rel}:${line} (inside the blurred element at line ${blurred.line})`)
    } else if (blurred && fixedComponents.has(el.tag)) {
      found.push(`${rel}:${fixedComponents.get(el.tag)} (<${el.tag}> at line ${line}, inside the blurred element at line ${blurred.line})`)
    }
    const frame: Frame = { el, line, blurs: blurs(el, stack[stack.length - 1]?.el) }
    if (ts.isJsxElement(node)) for (const child of node.children) walk(child, [...stack, frame])
  }
  walk(sf, [])
  return found
}

describe('position: fixed inside a surface Glass blurs', () => {
  const files = adminSourceFiles(SRC)

  it('scans the admin source', () => {
    expect(files.length).toBeGreaterThan(150)
  })

  it(`has no more than ${BASELINE} fixed element(s) nested in a blurred surface`, () => {
    const found = files.flatMap(scanFile)
    const byFile = new Map<string, string[]>()
    for (const entry of found) {
      const file = entry.slice(0, entry.indexOf(':'))
      byFile.set(file, [...(byFile.get(file) ?? []), entry])
    }
    const listing = [...byFile].map(([file, entries]) => `${entries.length} ${file}\n  ${entries.join('\n  ')}`).join('\n')
    expect(
      found.length,
      `a fixed element inside a blurred surface is clipped to it in Glass; render it as a sibling or through a portal. Per file:\n${listing}`,
    ).toBeLessThanOrEqual(BASELINE)
  })
})
