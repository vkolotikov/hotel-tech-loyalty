# HexaTech Content — Release 1: the Shared Workspace Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the generic parts of HexaTech Appointments into `frontend/src/workspace/` and run Appointments on them, with no change anyone can see, so HexaTech Content (release 2) can be built on the same frame.

**Architecture:** A pure frontend refactor in five moves: styles, plain helpers, generalised helpers, UI pieces with their words, then Find, the shortcuts list and the side-panel frame. Each move is test-first. Appointments' existing suites lock its behaviour. Where stored keys or key bindings must stay exactly as they are (the look, the shortcuts), Appointments keeps a small *binding* module that sets its own keys on the shared engine, so those existing tests run unchanged. A final before/after pixel comparison of every Appointments screen, against an untouched copy of `origin/main`, proves nothing visible changed.

**Tech Stack:** React + TypeScript + Vite + Tailwind 3, and vitest 2 (node environment, static render, no DOM). The pixel comparison uses playwright-core 1.63.0, pngjs 7.0.0 and pixelmatch 7.1.0, installed in an untracked tools folder and never added to the repo.

**Spec:** `docs/superpowers/specs/2026-10-14-content-workspace-design.md`. This plan covers §6.1, §9 "Appointments unchanged" and §10 release 1. The way-in helpers (`appointments/lib/landing.ts`) and the `content` mood exclusion in `index.css` are part of §6.1 too, but they belong with HexaTech Content's server payload, so release 2's plan moves them.

## Global Constraints

- **Where:** worktree `C:\wamp64\www\Hexa-Tech-content`, branch `feature/content-workspace`. Its upstream is unset: never push it, and never commit `frontend/dist`, `public/spa` or `resources/spa-shell` on it.
- **Untracked work files:** ledger, tools and screenshots live in `C:\wamp64\www\Hexa-Tech-content\.superpowers\sdd\2026-10-14-content-workspace-r1\` (called `$R1` below). Task 1 makes `.superpowers/` git-ignored.
- **Shell:** Git Bash for the commands below, PowerShell only where a step says so. Edit files with the Edit/Write tools (CRLF and cp1252 hazards; the Bash tool halves backslashes in heredocs). Repo files are LF (`.gitattributes`: `* text=auto eol=lf`).
- **Frontend checks:** `cd frontend && npx tsc -b && npx vitest run <paths>`. Every full `npx vitest run` may fail **only** the tests listed in `$R1/baseline-failures.txt` (Task 1 Step 3: the 3 known `plannerMeta` failures, plus any clock time-bombs already failing on `origin/main`).
- **Invisible:** Appointments' DOM may gain only `data-workspace=""` on its root. Text, class lists, element order, stored keys (`appointments:look`, `appointments:brand`, `appointments:prefs`), routes and API calls stay as they are.
- **Shared core rules:** `frontend/src/workspace/` never imports from `frontend/src/appointments/` (or any other workspace folder), calls no API, and uses only `a-*` colour classes. Its stylesheet is scoped under `[data-workspace]`. Enforced by `workspace/tokens.test.ts` from Task 1 on.
- **Words:**
  - Every string the shared core draws comes from the `workspace.*` bundle (`frontend/src/workspace/i18n/workspace.{en,ru,de,fr,es}.json`), with values copied verbatim from the Appointments bundles by a script.
  - The Appointments bundles are read but never edited in release 1. Their files mix one-line and multi-line objects, so a scripted rewrite would reformat about 25 KB per language. The moved words stay there unused; a later clean-up may drop them.
- **No new npm dependency in the repo. No PHP change. No migration.**
- **Backend for the browser run (Task 7 only):** `C:\wamp64\www\Hexa-Tech-atelier`, whose app/routes source equals `origin/main`. Use PHP `/c/wamp64/bin/php/php8.4.20/php.exe`. Never print tokens or `.env` values; record every database change and undo it.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Cascade drift.** Rules now split across `workspace.css` and `appointments.css`, and components are re-composed through `WorkspaceShell`, `FindFrame` and `ShortcutsSheet`. Either could change a computed style or the order of elements while every static test passes.
   - Expected: pixel-identical screens.
   - Pinned by Task 7 Step 7: a base-vs-branch pixel comparison of every screen, light and dark, at 1440 and 390 px, with the slim rail.
2. **A moved word missing in Russian.** This would happen if the workspace bundle is not registered before the first render, or if a key typo falls back to English.
   - Expected: the same Russian text as before.
   - Pinned by Task 4's locale tests, the full-admin locale scan, and Task 7's Russian captures (calendar, Find, shortcuts, phone menu).
3. **Focus hand-back after Escape** from Find and from the list of shortcuts. Effects do not run in static tests.
   - Expected: focus returns to where it was (the Find button).
   - Pinned by Task 7 Steps 5–6 (`pixels.mjs keys`, run on base and branch).
4. **Fonts from their new folder.** The production build must still emit and reference the ten woff2 files.
   - Expected: the same faces are drawn.
   - Pinned by Task 7 Step 2 (the built CSS references ten font files that exist) and Task 8 Step 8 (the live font answers `wOF2`).
5. **A device's saved look and brand paint survive the release.** A device that chose Dark and slim keeps that choice.
   - Pinned by `appointments/lib/look.test.ts`, which stays unchanged and still asserts the `appointments:look` key (Task 3), and by Task 7's captures, which seed those exact keys.

---

## File map (end of release 1)

```
frontend/src/workspace/                    NEW — the shared core
  tokens.test.ts                           sweep: a-* only, no API, no workspace imports, CSS scoped
  WorkspaceShell.tsx (+ .test.tsx)         the frame: ink side panel, top bar, phone menu, <html> mark
  theme/workspace.css                      Atelier fonts, tokens (light/dark), shared rules, glance strip
  theme/fonts/*                            moved from appointments/theme/fonts
  theme/accent.ts (+ accent.test.ts)       moved
  theme/contrast.test.ts, fonts.test.ts    moved, re-pointed at workspace.css
  lib/wallClock.ts (+ test)                moved (DateKey/Wall declared here now)
  lib/useMedia.ts, handBack.ts (+ test), firstLetter.ts (+ test)   moved
  lib/look.ts (+ test)                     generic, keyed per workspace
  lib/shellMark.ts (+ test)                generic: markShell(root, name)
  lib/shortcuts.ts (+ test)                engine: each workspace passes its letters/arrows
  ui/Button, Field, Notice, Skeleton, Typography, fitFigure, ThemeSwitch (+ their tests)   moved
  ui/ShortcutsSheet.tsx (+ test)           generic: sections of rows
  find/findCore.ts (+ test)                FindItem/FindTarget, fold, focusTarget, firstFocus, nextActive, opensShortcuts
  find/FindFrame.tsx (+ findFrame.test)    Find's box + FindList (iconOf from the workspace)
  i18n/index.ts, workspace.{5}.json, workspaceLocales.test.ts
frontend/src/appointments/
  AppointmentsShell.tsx                    on WorkspaceShell
  theme/appointments.css                   only Appointments' own rules
  theme/appointmentsCss.test.ts            NEW
  lib/look.ts, lib/shortcuts.ts            bindings (same exports, same keys)
  find/FindDialog.tsx                      on FindFrame; find/findResults.ts loses the generic helpers
  ui/AppointmentsShortcuts.tsx (+ appointmentsShortcuts.test.tsx)   Appointments' rows for the sheet
frontend/src/theme/ownTokenDirs.ts (+ test)   one list of folders the admin sweeps skip
```

---

### Task 1: Shared stylesheet, fonts and accent (and the sweep scope)

**Files:**
- Create: `frontend/src/theme/ownTokenDirs.ts`, `frontend/src/theme/ownTokenDirs.test.ts`, `frontend/src/workspace/tokens.test.ts`, `frontend/src/workspace/theme/workspace.css`, `frontend/src/appointments/theme/appointmentsCss.test.ts`, `$R1/tools/move-modules.mjs`
- Move:
  - `appointments/theme/fonts/` → `workspace/theme/fonts/`
  - `appointments/theme/accent.ts` and `accent.test.ts` → `workspace/theme/`
  - `appointments/theme/contrast.test.ts` and `fonts.test.ts` → `workspace/theme/`
- Modify:
  - `frontend/src/appointments/theme/appointments.css` (whole file replaced)
  - `frontend/src/index.css:2`
  - `frontend/src/appointments/AppointmentsShell.tsx` (root element)
  - `frontend/src/appointments/AppointmentsShell.test.tsx:53-59`
  - `frontend/src/appointments/find/findDialog.test.tsx:141-147`
  - the seven sweep tests named in Step 6
  - `frontend/tailwind.config.js:135-136,204-205`
  - `frontend/src/workspace/theme/accent.ts` (comment)

**Interfaces:**
- Produces:
  - `OWN_TOKEN_DIRS: readonly string[]` from `src/theme/ownTokenDirs.ts`.
  - The `[data-workspace]` token scope with the same `--a-*` names as before.
  - `accentTokens`, `accentStyle`, `contrast`, `tint`, `triplet`, `FALLBACK_ACCENT`, `SURFACES`, and types `ThemeName` and `AccentTokens`, now from `src/workspace/theme/accent.ts` (API unchanged).
  - The `CORE` list in `workspace/tokens.test.ts`, which each later task extends.
  - The tool `$R1/tools/move-modules.mjs`: `node <tool> frontend/src <old>=<new> …`.

- [ ] **Step 1: Rig the worktree** (PowerShell for the junction; the lockfiles of `Hexa-Tech-portal` and this worktree are identical, checked 2026-10-14)

```powershell
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-content\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-portal\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content
diff -q ../Hexa-Tech-portal/frontend/package-lock.json frontend/package-lock.json && echo "lockfiles identical"
EX="$(git rev-parse --git-common-dir)/info/exclude"
git check-ignore -q .superpowers/probe || echo '.superpowers/' >> "$EX"
git check-ignore -v .superpowers/probe
mkdir -p .superpowers/sdd/2026-10-14-content-workspace-r1/tools
```
Expected: `lockfiles identical`, and a `check-ignore` line naming `info/exclude`.

- [ ] **Step 2: Write the move tool** to `$R1/tools/move-modules.mjs` (Write tool):

```js
// Moves files inside frontend/src with `git mv` and rewrites every relative import that points at them
// (static imports and exports, import(), vi.mock(), CSS @import), and the moved files' own relative imports.
// `new URL('…', import.meta.url)` reads are NOT rewritten: each task edits those by hand.
// Usage (from the repo root):
//   node .superpowers/sdd/2026-10-14-content-workspace-r1/tools/move-modules.mjs frontend/src old/a.ts=new/a.ts …
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [root, ...pairs] = process.argv.slice(2)
if (!root || pairs.length === 0) throw new Error('usage: move-modules.mjs <srcRoot> <old>=<new> …')
const ROOT = path.resolve(root)
const moves = new Map(pairs.map(pair => {
  const [from, to] = pair.split('=')
  const abs = [path.resolve(ROOT, from), path.resolve(ROOT, to)]
  if (!fs.existsSync(abs[0])) throw new Error(`missing: ${from}`)
  if (fs.existsSync(abs[1])) throw new Error(`already there: ${to}`)
  return abs
}))
const SUFFIXES = ['', '.ts', '.tsx', '.js', '.json', '/index.ts', '/index.tsx']
const SPEC = /((?:\bfrom|\bimport)\s*\(?\s*|\bvi\.mock\(\s*|@import\s+)(['"])(\.{1,2}\/[^'"]*)\2/g

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : []
  })
}

function resolveSpec(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  for (const suffix of SUFFIXES) {
    const file = base + suffix
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return { file, suffix }
  }
  return null
}

function specFor(fromFile, target, suffix) {
  let written = target
  if (suffix.startsWith('/index.')) written = path.dirname(target)
  else if (suffix) written = target.slice(0, -suffix.length)
  let rel = path.relative(path.dirname(fromFile), written).split(path.sep).join('/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel
}

let rewritten = 0
for (const file of walk(ROOT)) {
  const source = fs.readFileSync(file, 'utf8')
  const home = moves.get(file) ?? file
  const next = source.replace(SPEC, (all, lead, quote, spec) => {
    const hit = resolveSpec(file, spec)
    if (!hit) return all
    const target = moves.get(hit.file) ?? hit.file
    if (target === hit.file && home === file) return all
    const written = specFor(home, target, hit.suffix)
    return written === spec ? all : `${lead}${quote}${written}${quote}`
  })
  if (next !== source) { fs.writeFileSync(file, next); rewritten++ }
}
for (const [from, to] of moves) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  execFileSync('git', ['mv', from, to], { stdio: 'inherit' })
}
console.log(`moved ${moves.size} file(s), rewrote imports in ${rewritten} file(s)`)
```

- [ ] **Step 3: Record the baseline**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
R1=../.superpowers/sdd/2026-10-14-content-workspace-r1
npx tsc -b; echo "tsc exit $?"
npx vitest run > $R1/baseline-vitest.txt 2>&1; tail -6 $R1/baseline-vitest.txt
grep -E '^ FAIL ' $R1/baseline-vitest.txt | sort -u > $R1/baseline-failures.txt; cat $R1/baseline-failures.txt
npx eslint src/appointments src/theme src/components/switchKnobs.test.ts src/i18n/localeCompleteness.test.ts > $R1/baseline-eslint.txt 2>&1; echo "eslint exit $?"; tail -3 $R1/baseline-eslint.txt
```
Expected: `tsc exit 0`. The vitest summary shows only the known failures (3 `plannerMeta`, plus any clock time-bomb such as `portal/.../stayBook.test.tsx`); write them down. Keep the eslint result as the bar: no new problems later.

- [ ] **Step 4: Write the failing sweep-scope test** `frontend/src/theme/ownTokenDirs.test.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { OWN_TOKEN_DIRS } from './ownTokenDirs'

const SRC = path.resolve(__dirname, '..')
/** Every admin sweep that walks src/ and skips the folders with tokens of their own. */
const SWEEPS = [
  'components/switchKnobs.test.ts',
  'theme/brandFills.test.ts',
  'theme/fixedInBlur.test.ts',
  'theme/hxColours.test.ts',
  'theme/lightSweep.test.ts',
  'theme/onFill.test.ts',
  'theme/rawColourRatchet.test.ts',
]
const OWN_LIST = /rel === 'appointments'|\['portal', 'appointments'/

describe('folders the admin sweeps skip', () => {
  it('are the member portal, Appointments and the shared workspace core', () => {
    expect([...OWN_TOKEN_DIRS]).toEqual(['portal', 'appointments', 'workspace'])
  })

  for (const file of SWEEPS) {
    it(`${file} skips them through OWN_TOKEN_DIRS, not a list of its own`, () => {
      const source = fs.readFileSync(path.join(SRC, file), 'utf8')
      expect(source).toContain('OWN_TOKEN_DIRS')
      expect(source).not.toMatch(OWN_LIST)
    })
  }

  it('no other test walks src/ with a skip list of its own', () => {
    const tests = fs.readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .map(f => f.split(path.sep).join('/'))
      .filter(f => /\.test\.tsx?$/.test(f) && !SWEEPS.includes(f) && f !== 'theme/ownTokenDirs.test.ts')
    expect(tests.filter(f => OWN_LIST.test(fs.readFileSync(path.join(SRC, f), 'utf8')))).toEqual([])
  })
})
```

Run: `npx vitest run src/theme/ownTokenDirs.test.ts`
Expected: FAIL (cannot resolve `./ownTokenDirs`).

- [ ] **Step 5: Create** `frontend/src/theme/ownTokenDirs.ts`:

```ts
/**
 * Top-level folders under src/ that draw with tokens of their own and keep
 * their own sweeps: the member portal (p-*), the Appointments workspace and
 * the shared workspace core (Atelier a-*). The full admin's style sweeps skip
 * exactly these, from this one list (theme/ownTokenDirs.test.ts).
 */
export const OWN_TOKEN_DIRS: readonly string[] = ['portal', 'appointments', 'workspace']
```

- [ ] **Step 6: Point the seven sweeps at the list** (Edit tool, one edit each, plus an import line under the `vitest` import)
  - `src/components/switchKnobs.test.ts`:
    - Add `import { OWN_TOKEN_DIRS } from '../theme/ownTokenDirs'`.
    - Replace `return rel === 'portal' || rel === 'appointments' ? [] : files(full)` with `return OWN_TOKEN_DIRS.includes(rel) ? [] : files(full)`.
  - `src/theme/fixedInBlur.test.ts`:
    - Add `import { OWN_TOKEN_DIRS } from './ownTokenDirs'`.
    - Replace `rel === 'portal' || rel === 'appointments' ? [] : adminSourceFiles(full)` with `OWN_TOKEN_DIRS.includes(rel) ? [] : adminSourceFiles(full)`.
  - `src/theme/hxColours.test.ts` and `src/theme/onFill.test.ts`:
    - Add the same import.
    - Replace `rel === 'portal' || rel === 'appointments' ? [] : adminFiles(full)` with `OWN_TOKEN_DIRS.includes(rel) ? [] : adminFiles(full)`.
  - `src/theme/rawColourRatchet.test.ts`:
    - Add the same import.
    - Replace `rel === 'portal' || rel === 'appointments' ? [] : adminSourceFiles(full)` with `OWN_TOKEN_DIRS.includes(rel) ? [] : adminSourceFiles(full)`.
  - `src/theme/lightSweep.test.ts`:
    - Add the same import.
    - Replace `['portal', 'appointments', 'theme'].includes(rel)` with `[...OWN_TOKEN_DIRS, 'theme'].includes(rel)`.
    - In its two comments (lines 7 and 474), replace `portal/, appointments/` with `portal/, appointments/, workspace/`.
  - `src/theme/brandFills.test.ts`:
    - Add the same import.
    - Replace `sourceFiles(SRC, ['portal', 'appointments'])` with `sourceFiles(SRC, [...OWN_TOKEN_DIRS])`.

Run: `npx vitest run src/theme/ownTokenDirs.test.ts src/theme src/components/switchKnobs.test.ts`
Expected: PASS (the sweeps' counts are unchanged: no folder named `workspace` exists yet).

- [ ] **Step 7: Write the failing core sweep** `frontend/src/workspace/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The shared workspace core (spec 2026-10-14 §6.1) is drawn inside every
 * workspace, so its source keeps the strictest rules of them all:
 *
 *  1. Only `a-*` colour classes (appointments/tokens.test.ts says why).
 *  2. No API: the core draws and remembers; each workspace calls its own
 *     server through its own client.
 *  3. Nothing from a workspace: the core never imports from appointments/ or
 *     content/. A workspace builds on the core, never the other way round.
 *  4. Every rule in workspace.css is scoped under [data-workspace], so
 *     nothing here can restyle the full admin.
 *  5. No text under 12 px, and no hover lift on a device without hover.
 */
const DIR = path.resolve(__dirname)

/** What the shared core holds. Each task of release 1 adds its files here first. */
const CORE = [
  'theme/workspace.css',
  'theme/accent.ts',
]

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const ADMIN_CLASS = /(?:^|[\s'"`{(])(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|sm:|md:|lg:|xl:)*(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|fill|stroke)-(?:dark-[a-z0-9]+|primary-\d{2,3}|t-primary|t-secondary|t-muted|white|black|accent|error|warning|info|gray-\d{2,3}|emerald-\d{2,3})(?:\/\d+)?(?=[\s'"`)}])/
const PORTAL_CLASS = /(?:^|[\s'"`{(])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|placeholder|outline|rounded|shadow|font)-p-[a-z]/
const ANY_API = /\/v1\//
const FROM_A_WORKSPACE = /(?:\bfrom\s+|\bimport\s*\(\s*)['"](?:\.\.\/)+(?:appointments|content)\//

describe('shared workspace core sweep', () => {
  const files = sourceFiles(DIR)
  const rels = files.map(f => path.relative(DIR, f).split(path.sep).join('/'))

  it('holds the shared core', () => {
    expect(rels).toEqual(expect.arrayContaining(CORE))
  })

  for (const file of files) {
    const rel = path.relative(DIR, file).split(path.sep).join('/')
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const hits = (re: RegExp) => lines.map((line, i) => (re.test(line) ? `${i + 1}: ${line.trim()}` : null)).filter((x): x is string => x !== null)

    it(`${rel} uses only a-* colour classes`, () => {
      expect(hits(ADMIN_CLASS), `admin colour classes in ${rel}`).toEqual([])
      expect(hits(PORTAL_CLASS), `portal classes in ${rel}`).toEqual([])
    })

    it(`${rel} calls no API and imports nothing from a workspace`, () => {
      expect(hits(ANY_API), `${rel} references an API`).toEqual([])
      expect(hits(FROM_A_WORKSPACE), `${rel} imports from a workspace folder`).toEqual([])
    })
  }

  it('sets no text smaller than 12 px', () => {
    const small = files.flatMap(file => {
      const rel = path.relative(DIR, file)
      return [...fs.readFileSync(file, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter(m => Number(m[1]) < 12).map(m => `${rel}: ${m[0]}`)
    })
    expect(small).toEqual([])
  })

  it('lifts nothing on a bare :hover: on a touch screen the state sticks after a tap', () => {
    const bare = files.flatMap(file => {
      const rel = path.relative(DIR, file)
      return fs.readFileSync(file, 'utf8').split(/[\s"'`{}]+/).filter(tok => /^(?:[a-z-]+:)*hover:-?translate-[xy]/.test(tok)).map(tok => `${rel}: ${tok}`)
    })
    expect(bare).toEqual([])
  })

  it('every rule in the stylesheet is scoped under [data-workspace]', () => {
    const css = fs.readFileSync(path.join(DIR, 'theme/workspace.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(3)
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        expect(part.trim().startsWith('[data-workspace]'), `unscoped selector: ${part.trim()}`).toBe(true)
      }
    }
  })
})
```

In `frontend/src/appointments/AppointmentsShell.test.tsx`, in the first test (`'is the token scope, names the product…'`), add as its second line:

```ts
    expect(html).toContain('data-workspace=""')
```

Run: `npx vitest run src/workspace/tokens.test.ts src/appointments/AppointmentsShell.test.tsx`
Expected: FAIL: `holds the shared core` (empty folder), the stylesheet test (no `workspace.css`), and the new `data-workspace` assertion.

- [ ] **Step 8: Move the accent, its tests and the fonts**

```bash
cd /c/wamp64/www/Hexa-Tech-content
T=.superpowers/sdd/2026-10-14-content-workspace-r1/tools
node $T/move-modules.mjs frontend/src \
  appointments/theme/accent.ts=workspace/theme/accent.ts \
  appointments/theme/accent.test.ts=workspace/theme/accent.test.ts \
  appointments/theme/contrast.test.ts=workspace/theme/contrast.test.ts \
  appointments/theme/fonts.test.ts=workspace/theme/fonts.test.ts
git mv frontend/src/appointments/theme/fonts frontend/src/workspace/theme/fonts
git status --short | head -30
```
Expected: `moved 4 file(s), rewrote imports in 1 file(s)` (`AppointmentsShell.tsx` now imports `../workspace/theme/accent`), plus 14 font/licence renames.

In `frontend/src/workspace/theme/accent.ts`, change the comment line `* --a-surface-2 / --a-side tokens in appointments.css.` to `* --a-surface-2 / --a-side tokens in workspace.css.`.

- [ ] **Step 9: Create** `frontend/src/workspace/theme/workspace.css`. Its rules are copied verbatim from today's `appointments.css`, with `[data-appointments]` renamed to `[data-workspace]`:

```css
/*
 * The shared workspace core's stylesheet: the Atelier look every workspace
 * beside the full admin wears (HexaTech Appointments now, HexaTech Content
 * next). Every rule is scoped under [data-workspace], the attribute on a
 * workspace's root; a workspace's own rules live in its own stylesheet under
 * its own attribute ([data-appointments]).
 *
 * Workspace type (Atelier spec 4.4), self-hosted from fontsource (SIL OFL;
 * licences sit in ./fonts). Three families, read through --a-font-display /
 * -text / -mono below. Each family is cut into the same unicode subsets
 * fontsource ships, so a browser downloads only the files a page's characters
 * need. As in fontsource's own CSS, the wider "ext" subset comes first and the
 * base subset after it: where their ranges overlap (a few combining marks) the
 * later face wins.
 *
 * "A Display": Fraunces for Latin; Fraunces has no Cyrillic, so Russian
 * headings are set in Source Serif 4, a serif of the same temperament.
 * Every face of a family carries the same style and weight range (Source
 * Serif's axis starts at 200, but it is declared 100 900 like Fraunces): a
 * browser only joins unicode-range subsets whose descriptors match.
 */
@font-face {
  font-family: 'A Display';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/fraunces-latin-ext-wght.woff2') format('woff2');
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
}

@font-face {
  font-family: 'A Display';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/fraunces-latin-wght.woff2') format('woff2');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

@font-face {
  font-family: 'A Display';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/source-serif-4-cyrillic-ext-wght.woff2') format('woff2');
  unicode-range: U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}

@font-face {
  font-family: 'A Display';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/source-serif-4-cyrillic-wght.woff2') format('woff2');
  unicode-range: U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}

/* "A Text": Inter Tight, Latin and Cyrillic. */
@font-face {
  font-family: 'A Text';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/inter-tight-latin-ext-wght.woff2') format('woff2');
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
}

@font-face {
  font-family: 'A Text';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/inter-tight-latin-wght.woff2') format('woff2');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

@font-face {
  font-family: 'A Text';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/inter-tight-cyrillic-wght.woff2') format('woff2');
  unicode-range: U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}

/* "A Mono": IBM Plex Mono Medium, for times and small labels. */
@font-face {
  font-family: 'A Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./fonts/ibm-plex-mono-latin-ext-500.woff2') format('woff2');
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
}

@font-face {
  font-family: 'A Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./fonts/ibm-plex-mono-latin-500.woff2') format('woff2');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

@font-face {
  font-family: 'A Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./fonts/ibm-plex-mono-cyrillic-500.woff2') format('woff2');
  unicode-range: U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}

/*
 * Atelier tokens (spec 2026-10-12). Every colour is an `R G B` triplet so
 * Tailwind's `<alpha-value>` works. The light set is the default; the dark
 * set applies with data-theme="dark" on the same element. The accent tokens
 * here are the fallback brand's; the shell overrides them inline from the
 * organisation's brand colour (theme/accent.ts). contrast.test.ts pins every
 * text pair at 4.5:1 in both sets.
 */
[data-workspace] {
  --a-canvas: 244 246 248;
  --a-surface: 255 255 255;
  --a-surface-2: 238 242 245;
  --a-text: 27 42 52;
  --a-text-2: 84 98 110;
  --a-border: 221 227 232;

  --a-side: 14 26 36;
  --a-side-2: 31 45 56;
  --a-side-text: 232 238 242;
  --a-side-text-2: 169 186 196;

  --a-accent: 59 130 246;
  --a-accent-ink: 255 255 255;
  --a-accent-deep: 52 114 216;
  --a-accent-text: 41 91 172;
  --a-accent-rail: 59 130 246;
  --a-danger: 176 36 36;
  --a-danger-ink: 255 255 255;
  --a-now: 200 50 60;
  --a-now-ink: 255 255 255;
  --a-hatch: 84 98 110;
  --a-scrim: 14 26 36;

  --a-st-pending: 138 80 0;
  --a-st-confirmed: 18 100 58;
  --a-st-progress: 79 58 176;
  --a-st-completed: 44 70 108;
  --a-st-cancelled: 88 95 107;
  --a-st-noshow: 166 38 58;

  --a-shadow-sm: 0 1px 2px rgb(14 26 36 / 0.05);
  --a-shadow: 0 10px 30px rgb(14 26 36 / 0.10);
  --a-shadow-lg: 0 28px 70px rgb(14 26 36 / 0.20);
  --a-font-display: 'A Display', Georgia, 'Times New Roman', serif;
  --a-font-text: 'A Text', system-ui, sans-serif;
  --a-font-mono: 'A Mono', ui-monospace, 'SFMono-Regular', monospace;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;

  color-scheme: light;
  background-color: rgb(var(--a-canvas));
  color: rgb(var(--a-text));
  font-family: var(--a-font-text);
  font-size: 14px;
  line-height: 1.45;
  letter-spacing: 0;
  -webkit-font-smoothing: antialiased;
  transition: background-color 0.3s ease, color 0.3s ease;
}

[data-workspace][data-theme="dark"] {
  --a-canvas: 14 26 36;
  --a-surface: 19 35 47;
  --a-surface-2: 26 46 60;
  --a-text: 232 238 242;
  --a-text-2: 159 178 189;
  --a-border: 42 59 72;

  --a-side: 10 20 28;
  --a-side-2: 22 36 47;
  --a-side-text: 232 238 242;
  --a-side-text-2: 159 178 189;

  --a-accent: 59 130 246;
  --a-accent-ink: 255 255 255;
  --a-accent-deep: 52 114 216;
  --a-accent-text: 118 168 249;
  --a-accent-rail: 59 130 246;
  --a-danger: 255 138 155;
  --a-danger-ink: 14 26 36;
  --a-now: 255 122 128;
  --a-now-ink: 14 26 36;
  --a-hatch: 159 178 189;
  --a-scrim: 4 10 14;

  --a-st-pending: 240 179 90;
  --a-st-confirmed: 95 211 154;
  --a-st-progress: 179 166 255;
  --a-st-completed: 169 193 227;
  --a-st-cancelled: 163 173 184;
  --a-st-noshow: 255 138 155;

  --a-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.30);
  --a-shadow: 0 12px 32px rgb(0 0 0 / 0.42);
  --a-shadow-lg: 0 28px 70px rgb(0 0 0 / 0.55);

  color-scheme: dark;
}

/* The full admin gives headings the organisation's "mood" typeface and
   form controls a dark colour scheme, both globally (index.css). Neither
   belongs in a workspace. Screens opt in to the display face with
   `font-a-display` (and the mono face with `font-a-mono`). `:where()` keeps
   this rule at one class of specificity: it still beats the admin's bare
   `h1, h2…` rule, but a `font-a-*` utility (emitted later) beats it. Written
   as `[data-workspace] h1` it would out-rank the utilities and every
   heading would stay in the text face. */
[data-workspace] :where(h1),
[data-workspace] :where(h2),
[data-workspace] :where(h3),
[data-workspace] :where(h4) {
  font-family: inherit;
}

[data-workspace] select,
[data-workspace] input,
[data-workspace] input[type],
[data-workspace] textarea {
  color-scheme: inherit;
}

[data-workspace] ::-webkit-scrollbar-track {
  background: rgb(var(--a-surface-2));
}

[data-workspace] ::-webkit-scrollbar-thumb {
  background: rgb(var(--a-border));
}

/* Focus is always visible: accent-text on light surfaces, the rail's own text
   colour on the dark rail — and only there: the panel and the month are
   asides too, and white. Every accent LINE (this ring, the selected card's
   ring, the selected row, the setup tab, the today ring) is drawn in
   accent-text, never in the raw brand: accent.ts derives it to read 3:1 or
   better on every surface for every brand, and the brand itself does not
   (medical blue is 2.58:1 on surface-2). Fills keep the brand. The rail's
   rule is more specific, so it wins inside the panel. */
[data-workspace] :focus-visible {
  outline: 2px solid rgb(var(--a-accent-text));
  outline-offset: 2px;
}

[data-workspace] [data-rail] :focus-visible {
  outline-color: rgb(var(--a-side-text));
}

/* Places focus is only ever sent to by the workspace (a panel's heading, the
   page after a link) are not controls and draw no ring. */
[data-workspace] [tabindex="-1"]:focus-visible {
  outline: none;
}

/* Find's input is the box's one control and the focus never leaves it: instead
   of an outline round the input (a sharp rectangle inside the rounded box), its
   row shows the focus as a 2 px accent-text underline — the row's own bottom
   border, coloured, and 1 px more inside it so nothing moves. The input's
   outline is transparent, not none: forced-colours mode (Windows High
   Contrast) drops the row's colours and shadow, and paints this outline in the
   system colour instead, so the focus still shows there. */
[data-workspace] [data-find-row] input:focus-visible {
  outline: 2px solid transparent;
}

[data-workspace] [data-find-row]:focus-within {
  border-bottom-color: rgb(var(--a-accent-text));
  box-shadow: inset 0 -1px 0 rgb(var(--a-accent-text));
}

/* Accent fills on a brand that is almost the page colour keep an edge (Atelier spec 4.2):
   an inset line in accent-text, the same colour every accent line is drawn in. */
[data-workspace][data-accent-edge] .bg-a-accent {
  box-shadow: inset 0 0 0 1px rgb(var(--a-accent-text));
}

/* A 45 % accent fill (Appointments' current visit step) is a fill too: on such a brand it takes accent-text. */
[data-workspace][data-accent-edge] .bg-a-accent\/45 {
  background-color: rgb(var(--a-accent-text) / 0.45);
}

/* Form controls: a calm transition and the accent for ticks. */
[data-workspace] input,
[data-workspace] select,
[data-workspace] textarea {
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.3s ease;
}

[data-workspace] input[type="checkbox"],
[data-workspace] input[type="radio"] {
  accent-color: rgb(var(--a-accent));
}

/* The slim side panel names each icon beside it on keyboard focus and, where
   the device hovers, on hover. The label's look is this one rule; it draws
   nothing until a trigger below gives it `content`. */
[data-workspace] [data-rail-size="slim"] [data-tip]::after {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 50;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgb(var(--a-side-2));
  color: rgb(var(--a-side-text));
  font-size: 12px;
  font-weight: 500;
  box-shadow: var(--a-shadow);
  pointer-events: none;
}

[data-workspace] [data-rail-size="slim"] [data-tip]:focus-visible::after {
  content: attr(data-tip);
}

/* The slim panel's language control is a transparent select over a globe: the
   focus is on the select inside the labelled box, so the label follows it.
   Its own rule: a browser without :has() drops this one and keeps the rule above. */
[data-workspace] [data-rail-size="slim"] [data-tip]:has(:focus-visible)::after {
  content: attr(data-tip);
}

/* Hover only where the device hovers: on an iPad a tap leaves :hover on the
   icon, and its label would stay over the page until the next tap elsewhere. */
@media (hover: hover) {
  [data-workspace] [data-rail-size="slim"] [data-tip]:hover::after {
    content: attr(data-tip);
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-workspace],
  [data-workspace] * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    /* A glance strip staggers its tiles with animation-delay; without this they would wait invisible for it. */
    animation-delay: 0s !important;
  }
}
```

- [ ] **Step 10: Replace** `frontend/src/appointments/theme/appointments.css` with Appointments' own rules only (Write tool):

```css
/*
 * The Appointments workspace's own rules. The Atelier fonts, tokens and the
 * rules every workspace shares live in the shared core's stylesheet
 * (src/workspace/theme/workspace.css, imported just before this file); this
 * one adds what only Appointments draws. Every rule is scoped under
 * [data-appointments], which sits beside [data-workspace] on Appointments' root.
 */

/* Time off on the calendar: hatched, so it reads as blocked without relying on a colour. */
[data-appointments] .a-hatch {
  background-image: repeating-linear-gradient(135deg, rgb(var(--a-hatch) / 0.14) 0 6px, transparent 6px 12px);
}

/* A team member's calendar colour (spec §5.3), set as --a-m on the element from the server's palette. */
[data-appointments] .a-member-dot {
  background-color: var(--a-m);
}

[data-appointments] .a-member-ring {
  box-shadow: 0 0 0 2px var(--a-m);
}

/* A card in a narrow column (many people in a day, or a week) has no room
   for its time and the status word side by side. The time stays; the word
   is taken out of sight — not out of the page, so it is still read out as
   part of the card — and the status icon and the card's tone remain. */
[data-appointments] [data-density] {
  container-type: inline-size;
}

@container (max-width: 170px) {
  [data-appointments] [data-density] [data-status-word] {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

/* The Today strip (TodayStrip, a container of its own): four tiles in a row once each
   can be 156 px wide — "€1,234.50" in the display face, or three avatars and "+N" —
   so 4 × 156 + 3 × 12 px of gap; two by two below that. The screen's width cannot
   say this: the open panel and the side menu take their share of it. */
@container (min-width: 660px) {
  [data-appointments] [data-glance] {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* Each tile of the strip is a container of its own (TodayStrip), and each of
   its figures is as large as its tile allows, up to the design's 30 px: a
   tile has 104 to 228 px inside (1024 with the panel open to 1280 with it, two
   by two), and at 30 px "£1,234.50" takes 122 px, "€12,345.50" 139, "CHF
   1,234.50" 170, "UAH 125,000.00" 216. --a-fit is the figure's size in cqi at
   which it takes 98 % of its tile, from its measured width in ems
   (ui/fitFigure.ts), so the count and the time stay at 30 px everywhere and
   an amount shrinks only as far as it must. Below 18 px it stops shrinking:
   an amount with a currency code then wraps at the space before the number,
   and nothing runs out of its tile. */
[data-appointments] [data-glance] [data-fit] {
  font-size: clamp(1.125rem, calc(var(--a-fit, 100) * 1cqi), 1.875rem);
  overflow-wrap: anywhere;
}
```

In `frontend/src/index.css`, replace line 2 `@import './appointments/theme/appointments.css';` with:

```css
@import './workspace/theme/workspace.css';
@import './appointments/theme/appointments.css';
```

In `frontend/src/appointments/AppointmentsShell.tsx`, replace `<div data-appointments="" data-theme={look.resolved}` with `<div data-workspace="" data-appointments="" data-theme={look.resolved}`.

- [ ] **Step 11: Re-point the moved CSS tests** (Edit tool)
  - `frontend/src/workspace/theme/contrast.test.ts`:
    1. Replace `const DIR_APPOINTMENTS = fileURLToPath(new URL('..', import.meta.url))` with:
       ```ts
       /** The sources whose accent classes the line rule below sweeps: the shared core and every workspace built on it. */
       const SOURCE_DIRS = [fileURLToPath(new URL('..', import.meta.url)), fileURLToPath(new URL('../../appointments', import.meta.url))]
       ```
    2. Replace `new URL('./appointments.css', import.meta.url)` with `new URL('./workspace.css', import.meta.url)`.
    3. Replace every `[data-appointments]` with `[data-workspace]` (replace_all; this covers the doc comment too).
    4. Replace `` describe(`appointments tokens — ${theme}` `` with `` describe(`workspace tokens — ${theme}` ``, and `describe('appointments stylesheet structure'` with `describe('workspace stylesheet structure'`.
    5. Delete the two tests `it('a narrow card drops the status word from view without removing it from the page', …)` and `it('draws a team member\'s colour through --a-m: …', …)`. They move to Step 12.
    6. In the test `'draws every accent LINE and every accent TEXT in accent-text…'`, replace the three lines that build `sources` from `DIR_APPOINTMENTS` with:
       ```ts
           const sources = SOURCE_DIRS.flatMap(dir => readdirSync(dir, { recursive: true, encoding: 'utf8' })
             .filter(f => f.endsWith('.tsx') && !f.includes('.test.'))
             .map(f => readFileSync(join(dir, f), 'utf8'))).join('\n')
       ```
  - `frontend/src/workspace/theme/fonts.test.ts`:
    - Replace `path.join(DIR, 'appointments.css')` with `path.join(DIR, 'workspace.css')`.
    - Replace both regex fragments `\[data-appointments\]` with `\[data-workspace\]`.
    - In that test's comment, replace `[data-appointments] h1` with `[data-workspace] h1`.
  - `frontend/src/appointments/find/findDialog.test.tsx`:
    - In the test `'shows the focus on the input\'s row…'`, replace `new URL('../theme/appointments.css', import.meta.url)` with `new URL('../../workspace/theme/workspace.css', import.meta.url)`.
    - Replace both `\[data-appointments\] \[data-find-row\]` with `\[data-workspace\] \[data-find-row\]`.

- [ ] **Step 12: Create** `frontend/src/appointments/theme/appointmentsCss.test.ts` (the two moved tests, verbatim, plus one on what left):

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Appointments' own rules, on top of the shared Atelier stylesheet (src/workspace/theme/workspace.css). */
const css = readFileSync(new URL('./appointments.css', import.meta.url), 'utf8')

describe('appointments stylesheet', () => {
  it('holds no font, token block or focus rule of its own: those are the shared core\'s', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toContain('@font-face')
    expect(rules).not.toMatch(/--a-canvas\s*:/)
    expect(rules).not.toContain(':focus-visible')
  })

  it('a narrow card drops the status word from view without removing it from the page', () => {
    const tail = css.slice(css.indexOf('@container'))
    expect(css).toContain('container-type: inline-size')
    expect(tail).toMatch(/@container \(max-width: \d+px\)\s*\{\s*\[data-appointments\] \[data-density\] \[data-status-word\]/)
    expect(tail).not.toMatch(/display:\s*none/) // hidden from sight only: the word stays in the card's name
  })

  it('draws a team member\'s colour through --a-m: the dot and the ring rules exist, are scoped, and read the variable', () => {
    // The colour arrives as data from the server's palette and is set as --a-m on the element; no hex lives in the stylesheet.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const cls of ['a-member-dot', 'a-member-ring']) {
      const at = rules.indexOf(`.${cls} {`)
      expect(at, `no .${cls} rule`).toBeGreaterThanOrEqual(0)
      const selector = rules.slice(rules.lastIndexOf('}', at) + 1, at + cls.length + 1).trim()
      expect(selector.startsWith('[data-appointments]'), `unscoped: ${selector}`).toBe(true)
      const body = rules.slice(at, rules.indexOf('}', at))
      expect(body, cls).toContain('var(--a-m)')
      expect(body, cls).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    }
    expect(rules.slice(rules.indexOf('.a-member-dot {'), rules.indexOf('}', rules.indexOf('.a-member-dot {')))).toContain('background-color: var(--a-m)')
    expect(rules.slice(rules.indexOf('.a-member-ring {'), rules.indexOf('}', rules.indexOf('.a-member-ring {')))).toContain('box-shadow: 0 0 0 2px var(--a-m)')
  })
})
```

In `frontend/tailwind.config.js`:
- Replace the two comment lines above `a: {` with:
  ```js
          // Atelier workspace tokens — see src/workspace/theme/workspace.css.
          // Only the workspaces (src/workspace, src/appointments) use these; the admin sweeps skip them (src/theme/ownTokenDirs.ts).
  ```
- Replace `// Appointments workspace motion (src/appointments). Switched off under` / `// prefers-reduced-motion by the rule in appointments.css.` with:
  ```js
        // Workspace motion (src/workspace, src/appointments). Switched off under
        // prefers-reduced-motion by the rule in workspace.css.
  ```

- [ ] **Step 13: Run the tests**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
npx tsc -b && npx vitest run src/workspace src/appointments src/theme src/components/switchKnobs.test.ts src/i18n
```
Expected: all PASS (`src/workspace` has the sweep, accent, contrast and fonts tests).

```bash
npx vitest run > ../.superpowers/sdd/2026-10-14-content-workspace-r1/task1-vitest.txt 2>&1; tail -5 ../.superpowers/sdd/2026-10-14-content-workspace-r1/task1-vitest.txt
grep -E '^ FAIL ' ../.superpowers/sdd/2026-10-14-content-workspace-r1/task1-vitest.txt | sort -u | diff - ../.superpowers/sdd/2026-10-14-content-workspace-r1/baseline-failures.txt && echo "failures = baseline"
```
Expected: `failures = baseline`.

- [ ] **Step 14: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content
git add -A frontend/src frontend/tailwind.config.js
git status --short | grep -v '^[AMDR] ' ; git commit -q -F - <<'EOF'
Workspace core: the Atelier stylesheet, fonts and accent move to src/workspace

The fonts, tokens and every rule a workspace shares now live in
src/workspace/theme/workspace.css under [data-workspace]; Appointments keeps
only its own rules under [data-appointments] and carries both attributes on
its root. accent.ts and the token, contrast and font tests move with them.
The admin style sweeps skip one shared list of own-token folders, and a new
sweep keeps the core free of admin classes, APIs and workspace imports.
No visible change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```
Expected: the `git status` filter prints nothing (no unstaged or untracked source left behind).

---

### Task 2: Plain helpers move: the venue clock, media query, focus hand-back and first letter

**Files:**
- Move (tool):
  - `appointments/lib/wallClock.ts` (+ `wallClock.test.ts`) → `workspace/lib/`
  - `appointments/lib/useMedia.ts` → `workspace/lib/`
  - `appointments/lib/handBack.ts` (+ `handBack.test.ts`) → `workspace/lib/`
  - `appointments/lib/firstLetter.ts` (+ `firstLetter.test.ts`) → `workspace/lib/`
- Modify:
  - `frontend/src/workspace/lib/wallClock.ts:1` (declare the types)
  - `frontend/src/appointments/lib/types.ts:1-4` (re-export them)
  - `frontend/src/workspace/lib/handBack.test.ts` (source paths)
  - `frontend/src/workspace/tokens.test.ts` (`CORE`)

**Interfaces:**
- Consumes: the move tool (Task 1).
- Produces, all with their APIs unchanged:
  - `src/workspace/lib/wallClock.ts`: `dateOf`, `timeOf`, `minutesOf`, `wallMinutes`, `hhmm`, `makeWall`, `isDateKey`, `addDays`, `weekdayOf`, `weekOf`, `isoWeek`, `addMonths`, `monthGrid`, `venueNow`, `formatDate`, `formatInstant`, and types `DateKey` and `Wall`.
  - `src/workspace/lib/useMedia.ts`: `useMedia(query): boolean`.
  - `src/workspace/lib/handBack.ts`: `handBackFocus`, `isHandedBack`.
  - `src/workspace/lib/firstLetter.ts`: `firstLetter(name, fallback)`.
- `appointments/lib/types.ts` keeps exporting `DateKey` and `Wall`.

- [ ] **Step 1: Extend the inventory (failing)**: in `frontend/src/workspace/tokens.test.ts`, add to `CORE`:

```ts
  'lib/wallClock.ts',
  'lib/useMedia.ts',
  'lib/handBack.ts',
  'lib/firstLetter.ts',
```
Run: `cd frontend && npx vitest run src/workspace/tokens.test.ts`
Expected: FAIL on `holds the shared core`.

- [ ] **Step 2: Move**

```bash
cd /c/wamp64/www/Hexa-Tech-content
node .superpowers/sdd/2026-10-14-content-workspace-r1/tools/move-modules.mjs frontend/src \
  appointments/lib/wallClock.ts=workspace/lib/wallClock.ts \
  appointments/lib/wallClock.test.ts=workspace/lib/wallClock.test.ts \
  appointments/lib/useMedia.ts=workspace/lib/useMedia.ts \
  appointments/lib/handBack.ts=workspace/lib/handBack.ts \
  appointments/lib/handBack.test.ts=workspace/lib/handBack.test.ts \
  appointments/lib/firstLetter.ts=workspace/lib/firstLetter.ts \
  appointments/lib/firstLetter.test.ts=workspace/lib/firstLetter.test.ts
cd frontend && npx vitest run src/workspace/tokens.test.ts
```
Expected: about 35 files rewritten (the clock alone has about 30 importers). The sweep FAILs on `lib/wallClock.ts imports from a workspace folder`, because the tool rewrote its `./types` import to `../../appointments/lib/types`.

- [ ] **Step 3: Declare the clock's types in the core**

In `frontend/src/workspace/lib/wallClock.ts`, replace the line `import type { DateKey, Wall } from '../../appointments/lib/types'` with:

```ts
/** The venue's wall clock as the server sends and accepts it: 'YYYY-MM-DDTHH:mm'. Never an instant — do not pass it to `new Date()`. */
export type Wall = string
/** 'YYYY-MM-DD' */
export type DateKey = string
```

In `frontend/src/appointments/lib/types.ts`, replace its first four lines (the `Wall` comment, `export type Wall = string`, the `'YYYY-MM-DD'` comment and `export type DateKey = string`) with the lines below. The file uses both types in its own interfaces, so it imports them as well as re-exporting them:

```ts
/** A venue wall-clock time and a venue day: declared with the venue clock in the shared core. */
import type { DateKey, Wall } from '../../workspace/lib/wallClock'
export type { DateKey, Wall }
```

- [ ] **Step 4: Re-point the hand-back test's source reads**: in `frontend/src/workspace/lib/handBack.test.ts`, in the `describe('who hands the focus back, and who listens', …)` block, replace every `'../panel/` with `'../../appointments/panel/`, every `'../find/` with `'../../appointments/find/`, every `'../ui/` with `'../../appointments/ui/`, and every `'../calendar/` with `'../../appointments/calendar/` (replace_all for each).

- [ ] **Step 5: Run the tests**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
npx tsc -b && npx vitest run src/workspace src/appointments
grep -rn "appointments/" src/workspace --include=*.ts --include=*.tsx | grep -v "\.test\." ; echo "core imports from appointments: none above"
```
Expected: all PASS; the grep prints nothing.

- [ ] **Step 6: Full run and commit**

```bash
npx vitest run > ../.superpowers/sdd/2026-10-14-content-workspace-r1/task2-vitest.txt 2>&1
grep -E '^ FAIL ' ../.superpowers/sdd/2026-10-14-content-workspace-r1/task2-vitest.txt | sort -u | diff - ../.superpowers/sdd/2026-10-14-content-workspace-r1/baseline-failures.txt && echo "failures = baseline"
cd .. && git add -A frontend/src && git commit -q -F - <<'EOF'
Workspace core: the venue clock, media query, focus hand-back and first letter

Moved unchanged to src/workspace/lib; the clock now declares DateKey and
Wall itself and Appointments' types re-export them. No visible change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 3: Generalised helpers: the look, the `<html>` mark and the shortcut engine

**Files:**
- Create: `frontend/src/workspace/lib/look.ts`, `look.test.ts`, `shortcuts.ts`, `shortcuts.test.ts`
- Move (tool): `appointments/lib/shellMark.ts` (+ `shellMark.test.ts`) → `workspace/lib/`
- Rewrite: `frontend/src/appointments/lib/look.ts`, `frontend/src/appointments/lib/shortcuts.ts` (bindings)
- Modify: `frontend/src/workspace/lib/shellMark.ts`, `frontend/src/workspace/lib/shellMark.test.ts`, `frontend/src/appointments/AppointmentsShell.tsx` (the `markShell` call), `frontend/src/workspace/tokens.test.ts` (`CORE`)
- Unchanged, and they must pass: `frontend/src/appointments/lib/look.test.ts`, `frontend/src/appointments/lib/shortcuts.test.ts`

**Interfaces:**
- Produces, from `src/workspace/lib/look.ts`:
  - Types:
    ```ts
    export type ThemePref = 'light' | 'dark' | 'auto'
    export type RailSize = 'full' | 'slim'
    export interface Look { theme: ThemePref; rail: RailSize }
    export interface Paint { accent: string; initial: string }
    export interface LookKeys { look: string; paint: string }
    export type LiveLook = Look & { resolved: ThemeName; setTheme: (theme: ThemePref) => void; setRail: (rail: RailSize) => void }
    ```
  - Values: `DEFAULT_LOOK`, `parseLook(raw)`, `loadLook(keys)`, `saveLook(keys, look)`, `parsePaint(raw)`, `loadPaint(keys)`, `savePaint(keys, paint)`, `rememberPaint(keys, paint)`, `resolveTheme(pref, dark)`, `subscribeSystemDark(fn)`, `systemDark()`, `useLook(keys): LiveLook`.
- Produces `markShell(root: HTMLElement, name: string): () => void` from `src/workspace/lib/shellMark.ts`.
- Produces, from `src/workspace/lib/shortcuts.ts`:
  ```ts
  export type CommonShortcut = 'find' | 'help'
  export interface ShortcutKeys<S extends string> { letters: Partial<Record<string, S>>; arrows?: { left: S; right: S } }
  export interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null; defaultPrevented?: boolean; code?: string; shiftKey?: boolean }
  export interface ShortcutWindow { addEventListener: (type: 'keydown', fn: (e: KeyboardEvent) => void) => void; removeEventListener: (type: 'keydown', fn: (e: KeyboardEvent) => void) => void }
  export type ShortcutDocument = { querySelector: (s: string) => unknown } | undefined
  export function isTyping(target: EventTarget | null): boolean
  export function inDialog(target: EventTarget | null): boolean
  export function modalOpen(doc: ShortcutDocument): boolean
  export function shortcutFor<S extends string>(e: KeyLike, env: { modal: boolean }, keys: ShortcutKeys<S>): S | CommonShortcut | null
  export function onShortcuts<S extends string>(win: ShortcutWindow, doc: ShortcutDocument, keys: ShortcutKeys<S>, run: (hit: S | CommonShortcut, e: KeyboardEvent) => void): () => void
  ```
- `appointments/lib/look.ts` keeps exactly its exports: `DEFAULT_LOOK`, `parseLook`, `loadLook()`, `saveLook(look)`, `parseBrand`, `loadBrand()`, `saveBrand(brand)`, `rememberBrand(brand)`, `resolveTheme`, `subscribeSystemDark`, `systemDark`, `useLook()`, and types `ThemePref`, `RailSize`, `Look`, `Brand`. It adds `LOOK_KEYS`.
- `appointments/lib/shortcuts.ts` keeps exactly its exports: `Shortcut`, `KeyLike`, `isTyping`, `inDialog`, `modalOpen`, `shortcutFor(e, env)`, `onShortcuts(win, doc, run)`. It adds `APPOINTMENTS_KEYS`.

- [ ] **Step 1: Extend the inventory**: add to `CORE` in `workspace/tokens.test.ts`:

```ts
  'lib/look.ts',
  'lib/shellMark.ts',
  'lib/shortcuts.ts',
```

- [ ] **Step 2: Write the failing engine tests**

`frontend/src/workspace/lib/look.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_LOOK, loadLook, loadPaint, parsePaint, rememberPaint, saveLook, savePaint, type LookKeys } from './look'

const g = globalThis as unknown as { window?: unknown }
afterEach(() => { delete g.window })

function memory() {
  const store = new Map<string, string>()
  const writes: string[] = []
  g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(k); store.set(k, v) } } }
  return { store, writes }
}

const A: LookKeys = { look: 'appointments:look', paint: 'appointments:brand' }
const C: LookKeys = { look: 'content:look', paint: 'content:brand-paint' }

describe('a workspace look under its own keys', () => {
  it('keeps each workspace\'s look apart', () => {
    const { store } = memory()
    saveLook(A, { theme: 'dark', rail: 'slim' })
    saveLook(C, { theme: 'light', rail: 'full' })
    expect(store.get('appointments:look')).toBe('{"theme":"dark","rail":"slim"}')
    expect(store.get('content:look')).toBe('{"theme":"light","rail":"full"}')
    expect(loadLook(A)).toEqual({ theme: 'dark', rail: 'slim' })
    expect(loadLook(C)).toEqual({ theme: 'light', rail: 'full' })
    expect(loadLook({ look: 'nobody:look', paint: 'nobody:paint' })).toEqual(DEFAULT_LOOK)
  })

  it('keeps each workspace\'s paint apart, and writes it only when it changed', () => {
    const { store, writes } = memory()
    savePaint(A, { accent: '#c9a84c', initial: 'L' })
    expect(loadPaint(A)).toEqual({ accent: '#c9a84c', initial: 'L' })
    expect(loadPaint(C)).toBeNull()
    rememberPaint(A, { accent: '#c9a84c', initial: 'L' })
    expect(writes.filter(k => k === 'appointments:brand')).toHaveLength(1)
    rememberPaint(C, { accent: '#3b82f6', initial: 'F' })
    expect(store.get('content:brand-paint')).toBe('{"accent":"#3b82f6","initial":"F"}')
  })

  it('reads a damaged paint as no memory, and a capital hex as the same colour', () => {
    expect(parsePaint('{"accent":"blue","initial":"L"}')).toBeNull()
    expect(parsePaint('{"accent":"#ABCDEF","initial":"L"}')).toEqual({ accent: '#abcdef', initial: 'L' })
  })
})
```

`frontend/src/workspace/lib/shortcuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { onShortcuts, shortcutFor, type KeyLike, type ShortcutKeys } from './shortcuts'

type Mine = 'new' | 'today' | 'month' | 'prev' | 'next'
const KEYS: ShortcutKeys<Mine> = { letters: { n: 'new', t: 'today', m: 'month' }, arrows: { left: 'prev', right: 'next' } }
const NO_ARROWS: ShortcutKeys<'new'> = { letters: { n: 'new' } }
const body = { tagName: 'BODY', getAttribute: () => null, closest: () => null }
const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: body as unknown as EventTarget, ...extra })
const free = { modal: false }

describe('the shared shortcut engine', () => {
  it('reads each workspace\'s own letters, either case', () => {
    expect(shortcutFor(key('m'), free, KEYS)).toBe('month')
    expect(shortcutFor(key('M'), free, KEYS)).toBe('month')
    expect(shortcutFor(key('d'), free, KEYS)).toBeNull()
  })

  it('gives every workspace Find (Ctrl/⌘ K, "/") and the list of shortcuts ("?")', () => {
    expect(shortcutFor(key('k', { ctrlKey: true }), free, NO_ARROWS)).toBe('find')
    expect(shortcutFor(key('k', { metaKey: true }), free, NO_ARROWS)).toBe('find')
    expect(shortcutFor(key('/'), free, NO_ARROWS)).toBe('find')
    expect(shortcutFor(key('?'), free, NO_ARROWS)).toBe('help')
  })

  it('reaches the letters by their places on a Cyrillic layout, and Find and help by theirs', () => {
    expect(shortcutFor(key('ь', { code: 'KeyM' }), free, KEYS)).toBe('month')
    expect(shortcutFor(key('.', { code: 'Slash' }), free, KEYS)).toBe('find')
    expect(shortcutFor(key(',', { code: 'Slash', shiftKey: true }), free, KEYS)).toBe('help')
    // A Latin letter is never read by its place: AZERTY types "q" where a US keyboard has "a".
    expect(shortcutFor(key('q', { code: 'KeyA' }), free, KEYS)).toBeNull()
  })

  it('moves with the arrows only where the workspace gives them a meaning, and never on a grid stop', () => {
    expect(shortcutFor(key('ArrowLeft'), free, KEYS)).toBe('prev')
    expect(shortcutFor(key('ArrowRight'), free, KEYS)).toBe('next')
    expect(shortcutFor(key('ArrowLeft'), free, NO_ARROWS)).toBeNull()
    const stop = { ...body, closest: (s: string) => (s === '[data-stop]' ? {} : null) }
    expect(shortcutFor(key('ArrowRight', { target: stop as unknown as EventTarget }), free, KEYS)).toBeNull()
  })

  it('stays out of the way while typing and under a modal, except Ctrl K', () => {
    const input = { tagName: 'INPUT', getAttribute: () => 'text', closest: () => null }
    expect(shortcutFor(key('n', { target: input as unknown as EventTarget }), free, KEYS)).toBeNull()
    expect(shortcutFor(key('k', { ctrlKey: true, target: input as unknown as EventTarget }), free, KEYS)).toBe('find')
    expect(shortcutFor(key('n'), { modal: true }, KEYS)).toBeNull()
  })

  it('listens on a window and removes that same listener', () => {
    const listeners = new Set<(e: KeyboardEvent) => void>()
    const win = {
      addEventListener: (_: 'keydown', fn: (e: KeyboardEvent) => void) => { listeners.add(fn) },
      removeEventListener: (_: 'keydown', fn: (e: KeyboardEvent) => void) => { listeners.delete(fn) },
    }
    const hits: string[] = []
    const stop = onShortcuts(win, { querySelector: () => null }, KEYS, hit => { hits.push(hit) })
    for (const fn of listeners) fn(key('m') as unknown as KeyboardEvent)
    expect(hits).toEqual(['month'])
    stop()
    expect(listeners.size).toBe(0)
  })
})
```

Run: `cd frontend && npx vitest run src/workspace/lib/look.test.ts src/workspace/lib/shortcuts.test.ts`
Expected: FAIL (`./look` and `./shortcuts` do not exist in `src/workspace/lib`).

- [ ] **Step 3: Write** `frontend/src/workspace/lib/look.ts`:

```ts
import { useState, useSyncExternalStore } from 'react'
import type { ThemeName } from '../theme/accent'

/**
 * How a workspace looks on this device: the theme a person picked (Light by
 * default; Auto follows the device), the side panel's size, and the
 * organisation's accent and mark as this device last saw them (its "paint"),
 * so the frame is painted in them from the first frame of the next visit
 * instead of the fallback blue and an "H". Each workspace keeps these under
 * keys of its own (`LookKeys`), so a choice in one never changes another, and
 * apart from anything else it stores, which it may write whole.
 */
export type ThemePref = 'light' | 'dark' | 'auto'
export type RailSize = 'full' | 'slim'
export interface Look { theme: ThemePref; rail: RailSize }
/** The organisation's accent (#rrggbb) and mark (one letter or one emoji) as this device last saw them. */
export interface Paint { accent: string; initial: string }
/** Where a workspace keeps its look and its paint in localStorage. */
export interface LookKeys { look: string; paint: string }
/** The look as a frame draws and changes it: what useLook answers. */
export type LiveLook = Look & { resolved: ThemeName; setTheme: (theme: ThemePref) => void; setRail: (rail: RailSize) => void }

export const DEFAULT_LOOK: Look = { theme: 'light', rail: 'full' }

const THEMES: readonly string[] = ['light', 'dark', 'auto']
const RAILS: readonly string[] = ['full', 'slim']
const QUERY = '(prefers-color-scheme: dark)'

export function parseLook(raw: string | null): Look {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  } catch {
    value = null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_LOOK
  const v = value as Record<string, unknown>
  return {
    theme: typeof v.theme === 'string' && THEMES.includes(v.theme) ? (v.theme as ThemePref) : DEFAULT_LOOK.theme,
    rail: typeof v.rail === 'string' && RAILS.includes(v.rail) ? (v.rail as RailSize) : DEFAULT_LOOK.rail,
  }
}

export function loadLook(keys: LookKeys): Look {
  try {
    return parseLook(window.localStorage.getItem(keys.look))
  } catch {
    return DEFAULT_LOOK
  }
}

export function saveLook(keys: LookKeys, look: Look): void {
  try {
    window.localStorage.setItem(keys.look, JSON.stringify(look))
  } catch {
    /* a private window or a full store: the choice simply is not kept */
  }
}

/** A damaged value is simply no memory, never an error. */
export function parsePaint(raw: string | null): Paint | null {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  } catch {
    value = null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.accent)) return null
  if (typeof v.initial !== 'string') return null
  const initial = v.initial.trim()
  // One letter or one emoji (firstLetter); the few code points of headroom cover a letter that upper-cases to two.
  const length = Array.from(initial).length
  if (length < 1 || length > 4) return null
  return { accent: v.accent.toLowerCase(), initial }
}

export function loadPaint(keys: LookKeys): Paint | null {
  try {
    return parsePaint(window.localStorage.getItem(keys.paint))
  } catch {
    return null
  }
}

export function savePaint(keys: LookKeys, paint: Paint): void {
  try {
    window.localStorage.setItem(keys.paint, JSON.stringify({ accent: paint.accent, initial: paint.initial }))
  } catch {
    /* a private window or a full store: the next visit simply starts from the fallback */
  }
}

/** Saves the paint when it differs from what is stored; a bootstrap that changes nothing writes nothing. */
export function rememberPaint(keys: LookKeys, paint: Paint): void {
  const stored = loadPaint(keys)
  if (stored && stored.accent === paint.accent && stored.initial === paint.initial) return
  savePaint(keys, paint)
}

export function resolveTheme(pref: ThemePref, systemDarkNow: boolean): ThemeName {
  return pref === 'auto' ? (systemDarkNow ? 'dark' : 'light') : pref
}

function media(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null
}

export function subscribeSystemDark(onChange: () => void): () => void {
  const mq = media()
  if (!mq) return () => {}
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function systemDark(): boolean {
  return media()?.matches ?? false
}

export function useLook(keys: LookKeys): LiveLook {
  const [look, setLook] = useState<Look>(() => loadLook(keys))
  // The device's answer on the server render too: without a window it is simply false.
  const dark = useSyncExternalStore(subscribeSystemDark, systemDark, systemDark)
  const update = (patch: Partial<Look>) => {
    const next = { ...look, ...patch }
    saveLook(keys, next)
    setLook(next)
  }
  return {
    ...look,
    resolved: resolveTheme(look.theme, dark),
    setTheme: (theme) => update({ theme }),
    setRail: (rail) => update({ rail }),
  }
}
```

- [ ] **Step 4: Rewrite** `frontend/src/appointments/lib/look.ts` as the binding (Write tool):

```ts
import {
  loadLook as loadWith, loadPaint, rememberPaint, saveLook as saveWith, savePaint, useLook as useLookWith,
  type LiveLook, type Look, type LookKeys, type Paint,
} from '../../workspace/lib/look'

/**
 * The Appointments workspace's look on this device, on the shared core's
 * engine (src/workspace/lib/look.ts), under the keys it has always used —
 * `appointments:look` and `appointments:brand` — so nobody's choice is lost
 * when the code moved. Kept apart from `appointments:prefs`, which the
 * calendar writes whole.
 */
export type { Look, RailSize, ThemePref } from '../../workspace/lib/look'
export type Brand = Paint
export { DEFAULT_LOOK, parseLook, parsePaint as parseBrand, resolveTheme, subscribeSystemDark, systemDark } from '../../workspace/lib/look'

export const LOOK_KEYS: LookKeys = { look: 'appointments:look', paint: 'appointments:brand' }

export const loadLook = (): Look => loadWith(LOOK_KEYS)
export const saveLook = (look: Look): void => saveWith(LOOK_KEYS, look)
export const loadBrand = (): Brand | null => loadPaint(LOOK_KEYS)
export const saveBrand = (brand: Brand): void => savePaint(LOOK_KEYS, brand)
export const rememberBrand = (brand: Brand): void => rememberPaint(LOOK_KEYS, brand)
export const useLook = (): LiveLook => useLookWith(LOOK_KEYS)
```

- [ ] **Step 5: Write** `frontend/src/workspace/lib/shortcuts.ts`:

```ts
/**
 * Keyboard shortcuts for a workspace. Only Ctrl/⌘ K works while typing;
 * every other key waits until focus is out of fields and dialogs and no
 * modal is open; ← → on a focused grid stop ([data-stop]) belong to the
 * grid's own moves. A non-Latin layout reaches the same shortcuts by the
 * keys' places. Find (Ctrl/⌘ K, "/") and the list of shortcuts ("?") are the
 * same in every workspace; each workspace names its own letters and what the
 * arrows do (`ShortcutKeys`).
 */
export type CommonShortcut = 'find' | 'help'
export interface ShortcutKeys<S extends string> {
  /** Lower-case Latin letters and what each does; a non-Latin layout reaches each by its place ("n" by KeyN). */
  letters: Partial<Record<string, S>>
  /** What ← and → do, where they do anything. */
  arrows?: { left: S; right: S }
}
export interface KeyLike {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null; defaultPrevented?: boolean
  /** Where the key sits ("KeyN"), whatever the layout types there. */
  code?: string
  shiftKey?: boolean
}
export interface ShortcutWindow {
  addEventListener: (type: 'keydown', fn: (e: KeyboardEvent) => void) => void
  removeEventListener: (type: 'keydown', fn: (e: KeyboardEvent) => void) => void
}
export type ShortcutDocument = { querySelector: (s: string) => unknown } | undefined

interface ElementLike { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null; closest?: (s: string) => unknown }

const NOT_TEXT = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']

export function isTyping(target: EventTarget | null): boolean {
  const el = target as ElementLike | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NOT_TEXT.includes((el.getAttribute?.('type') ?? 'text').toLowerCase())
  if (el.isContentEditable) return true
  const role = el.getAttribute?.('role')
  return role === 'textbox' || role === 'combobox' || role === 'searchbox'
}

export function inDialog(target: EventTarget | null): boolean {
  return Boolean((target as ElementLike | null)?.closest?.('[role="dialog"], [role="alertdialog"]'))
}

export function modalOpen(doc: ShortcutDocument): boolean {
  return Boolean(doc?.querySelector('[aria-modal="true"]'))
}

const latinLetter = (key: string): boolean => /^\p{Script=Latin}$/u.test(key)

/**
 * The same keys by where they sit on a US keyboard, for a layout that types
 * something else there: on a Russian one, N types "т" and "/" types ".".
 * The character is read first, and a Latin letter (accented ones too) is never
 * read by its place, so a Latin layout (AZERTY, Dvorak, Spanish…) keeps its own
 * letters. The "/" place is read only for the Cyrillic layouts' own "." and
 * Shift ",": Latin layouts type "-", "!" or ";" there.
 */
function byPlace<S extends string>(e: KeyLike, keys: ShortcutKeys<S>): S | CommonShortcut | null {
  if (!e.code || latinLetter(e.key)) return null
  if (e.code === 'Slash') return e.shiftKey ? (e.key === ',' ? 'help' : null) : (e.key === '.' ? 'find' : null)
  const place = /^Key([A-Z])$/.exec(e.code)
  return place ? (keys.letters[place[1].toLowerCase()] ?? null) : null
}

export function shortcutFor<S extends string>(e: KeyLike, env: { modal: boolean }, keys: ShortcutKeys<S>): S | CommonShortcut | null {
  if (e.defaultPrevented || env.modal) return null
  // Ctrl/⌘ Shift K is left to the browser (Firefox's console).
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key.toLowerCase() === 'k' || (e.code === 'KeyK' && !latinLetter(e.key)))) return 'find'
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (isTyping(e.target) || inDialog(e.target)) return null
  if (e.key === '/') return 'find'
  if (e.key === '?') return 'help'
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (!keys.arrows || (e.target as ElementLike | null)?.closest?.('[data-stop]')) return null
    return e.key === 'ArrowLeft' ? keys.arrows.left : keys.arrows.right
  }
  return (e.key.length === 1 ? keys.letters[e.key.toLowerCase()] : undefined) ?? byPlace(e, keys)
}

/**
 * Listens for shortcuts on a window and says which one was pressed; the
 * returned function removes that same listener. The modal check is made at
 * the moment of each key, so a dialog that opens later is heard about.
 * The page that listens decides what each shortcut does, and calls
 * `preventDefault` on the keys it acts on.
 */
export function onShortcuts<S extends string>(
  win: ShortcutWindow,
  doc: ShortcutDocument,
  keys: ShortcutKeys<S>,
  run: (hit: S | CommonShortcut, e: KeyboardEvent) => void,
): () => void {
  const onKey = (e: KeyboardEvent) => {
    const hit = shortcutFor(e, { modal: modalOpen(doc) }, keys)
    if (hit) run(hit, e)
  }
  win.addEventListener('keydown', onKey)
  return () => win.removeEventListener('keydown', onKey)
}
```

- [ ] **Step 6: Rewrite** `frontend/src/appointments/lib/shortcuts.ts` as the binding (Write tool):

```ts
import {
  onShortcuts as listen, shortcutFor as shortcutWith,
  type CommonShortcut, type KeyLike, type ShortcutDocument, type ShortcutKeys, type ShortcutWindow,
} from '../../workspace/lib/shortcuts'

/**
 * The Appointments workspace's shortcuts (Atelier spec §5.2) on the shared
 * engine (src/workspace/lib/shortcuts.ts): N a new appointment, T today,
 * D / W / L the day, week and list views, ← → the previous or next day (week
 * in the week view). Find and the list of shortcuts come with the engine.
 */
export type Shortcut = 'find' | 'help' | 'new' | 'today' | 'prev' | 'next' | 'day' | 'week' | 'list'
export type { KeyLike } from '../../workspace/lib/shortcuts'
export { inDialog, isTyping, modalOpen } from '../../workspace/lib/shortcuts'

export const APPOINTMENTS_KEYS: ShortcutKeys<Exclude<Shortcut, CommonShortcut>> = {
  letters: { n: 'new', t: 'today', d: 'day', w: 'week', l: 'list' },
  arrows: { left: 'prev', right: 'next' },
}

export function shortcutFor(e: KeyLike, env: { modal: boolean }): Shortcut | null {
  return shortcutWith(e, env, APPOINTMENTS_KEYS)
}

export function onShortcuts(win: ShortcutWindow, doc: ShortcutDocument, run: (hit: Shortcut, e: KeyboardEvent) => void): () => void {
  return listen(win, doc, APPOINTMENTS_KEYS, run)
}
```

- [ ] **Step 7: Move and generalise the `<html>` mark**

```bash
cd /c/wamp64/www/Hexa-Tech-content
node .superpowers/sdd/2026-10-14-content-workspace-r1/tools/move-modules.mjs frontend/src \
  appointments/lib/shellMark.ts=workspace/lib/shellMark.ts \
  appointments/lib/shellMark.test.ts=workspace/lib/shellMark.test.ts
```

Replace the body of `frontend/src/workspace/lib/shellMark.ts` with:

```ts
/**
 * Marks <html> as a workspace while it is mounted (`data-shell="<name>"`,
 * e.g. `appointments`), the way the full admin's Layout marks it `admin`.
 * index.css leaves a workspace's mark out of the Branding "mood"
 * typography, whose (0,3,0) rules on .text-lg … .text-7xl would otherwise
 * replace the workspace's own faces, weights and italics. Returns the
 * cleanup, which puts back whatever mark was there before (or none).
 */
export function markShell(root: HTMLElement, name: string): () => void {
  const before = root.getAttribute('data-shell')
  root.setAttribute('data-shell', name)
  return () => {
    if (before === null) root.removeAttribute('data-shell')
    else root.setAttribute('data-shell', before)
  }
}
```

In `frontend/src/appointments/AppointmentsShell.tsx`, replace `useLayoutEffect(() => markShell(document.documentElement), [])` with `useLayoutEffect(() => markShell(document.documentElement, 'appointments'), [])`.

In `frontend/src/workspace/lib/shellMark.test.ts`:
1. Replace both `markShell(el)` with `markShell(el, 'appointments')`.
2. In `'is set by the shell before the first paint…'`:
   - Replace `new URL('../AppointmentsShell.tsx', import.meta.url)` with `new URL('../../appointments/AppointmentsShell.tsx', import.meta.url)`.
   - Replace `'useLayoutEffect(() => markShell(document.documentElement), [])'` with `"useLayoutEffect(() => markShell(document.documentElement, 'appointments'), [])"`.
   - Replace `shell.indexOf('markShell(document.documentElement)')` with `shell.indexOf('markShell(document.documentElement')`.
3. Add, inside `describe('markShell', …)`:
   ```ts
     it('marks any workspace by its name', () => {
       const { attrs, el } = fakeRoot('admin')
       const cleanup = markShell(el, 'content')
       expect(attrs.get('data-shell')).toBe('content')
       cleanup()
       expect(attrs.get('data-shell')).toBe('admin')
     })
   ```

- [ ] **Step 8: Run the tests**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
npx tsc -b && npx vitest run src/workspace src/appointments
git diff --stat HEAD -- src/appointments/lib/look.test.ts src/appointments/lib/shortcuts.test.ts
```
Expected: all PASS. The `git diff --stat` prints nothing: the Appointments look and shortcut tests ran unchanged against the bindings.

- [ ] **Step 9: Full run and commit**

```bash
npx vitest run > ../.superpowers/sdd/2026-10-14-content-workspace-r1/task3-vitest.txt 2>&1
grep -E '^ FAIL ' ../.superpowers/sdd/2026-10-14-content-workspace-r1/task3-vitest.txt | sort -u | diff - ../.superpowers/sdd/2026-10-14-content-workspace-r1/baseline-failures.txt && echo "failures = baseline"
cd .. && git add -A frontend/src && git commit -q -F - <<'EOF'
Workspace core: one look, one <html> mark and one shortcut engine for every workspace

The look is keyed per workspace, markShell takes the workspace's name, and
the shortcut engine reads each workspace's letters and arrows. Appointments
binds its own keys (appointments:look, appointments:brand; N T D W L ← →)
and keeps its exports, so its existing tests run unchanged. No visible change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 4: UI pieces and the shared words

**Files:**
- Move (tool): `appointments/ui/{Button.tsx, Field.tsx, Notice.tsx, Skeleton.tsx, Typography.tsx, fitFigure.ts, ThemeSwitch.tsx, primitives.test.tsx, themeSwitch.test.tsx, fitFigure.test.ts}` → `workspace/ui/`
- Create:
  - `frontend/src/workspace/i18n/index.ts`
  - `frontend/src/workspace/i18n/workspace.{en,ru,de,fr,es}.json` (generated)
  - `frontend/src/workspace/i18n/workspaceLocales.test.ts`
  - `$R1/tools/workspace-words.mjs`
- Modify:
  - `frontend/src/workspace/ui/ThemeSwitch.tsx`, `Skeleton.tsx`, `Typography.tsx`, `fitFigure.test.ts`
  - `frontend/src/workspace/theme/workspace.css` (+ the glance strip)
  - `frontend/src/appointments/theme/appointments.css` (− the glance strip)
  - `frontend/src/appointments/AppointmentsApp.tsx`
  - `frontend/src/i18n/localeCompleteness.test.ts`
  - `frontend/src/workspace/tokens.test.ts`

**Interfaces:**
- Produces, from `src/workspace/ui/`, all with props unchanged:
  - `Button`, `Field`, `Notice`, `Skeleton`, `CalendarSkeleton`
  - `PageTitle`, `SectionTitle`, `Eyebrow`, `Figure`
  - `ThemeSwitch({ value, onChange, vertical?, tone? })`
  - `fitCqi`, `emsOf`, `FIT_SHARE`
- Produces `registerWorkspaceLocales(): void` and `WORKSPACE_LOCALE_FILES` from `src/workspace/i18n/index.ts`.
- Produces the `workspace.*` keys in this task: `theme.label`, `theme.light`, `theme.dark`, `theme.auto`, `theme.auto_hint`, `common.loading`.
- Produces the tool `$R1/tools/workspace-words.mjs`: `node <tool> frontend/src key,key,…`.

- [ ] **Step 1: Extend the inventory**: add to `CORE`:

```ts
  'ui/Button.tsx',
  'ui/Field.tsx',
  'ui/Notice.tsx',
  'ui/Skeleton.tsx',
  'ui/Typography.tsx',
  'ui/fitFigure.ts',
  'ui/ThemeSwitch.tsx',
  'i18n/index.ts',
```

- [ ] **Step 2: Move the pieces**

```bash
cd /c/wamp64/www/Hexa-Tech-content
node .superpowers/sdd/2026-10-14-content-workspace-r1/tools/move-modules.mjs frontend/src \
  appointments/ui/Button.tsx=workspace/ui/Button.tsx \
  appointments/ui/Field.tsx=workspace/ui/Field.tsx \
  appointments/ui/Notice.tsx=workspace/ui/Notice.tsx \
  appointments/ui/Skeleton.tsx=workspace/ui/Skeleton.tsx \
  appointments/ui/Typography.tsx=workspace/ui/Typography.tsx \
  appointments/ui/fitFigure.ts=workspace/ui/fitFigure.ts \
  appointments/ui/ThemeSwitch.tsx=workspace/ui/ThemeSwitch.tsx \
  appointments/ui/primitives.test.tsx=workspace/ui/primitives.test.tsx \
  appointments/ui/themeSwitch.test.tsx=workspace/ui/themeSwitch.test.tsx \
  appointments/ui/fitFigure.test.ts=workspace/ui/fitFigure.test.ts
cd frontend && npx vitest run src/workspace/tokens.test.ts
```
Expected: the sweep FAILs on `ui/ThemeSwitch.tsx imports from a workspace folder` (the tool pointed its `../lib/look` at the Appointments binding) and on `i18n/index.ts` (not there yet).

In `frontend/src/workspace/ui/ThemeSwitch.tsx`, replace `import type { ThemePref } from '../../appointments/lib/look'` with `import type { ThemePref } from '../lib/look'`.

- [ ] **Step 3: Put the shared words on the workspace keys (failing)**

In `frontend/src/i18n/localeCompleteness.test.ts`:
1. In `SCAN_TARGETS`, after `path.join(SRC_DIR, 'appointments'),`, add `path.join(SRC_DIR, 'workspace'),`.
2. In `KEY_PREFIXES`, add `'workspace.'` at the end.
3. In `readLocale`, replace `return { ...common, portal, appointments }` with:
   ```ts
     // The shared workspace core registers its bundle under `workspace` the same way (src/workspace/i18n/index.ts).
     const workspaceFile = path.join(SRC_DIR, 'workspace/i18n', `workspace.${locale}.json`)
     const workspace = fs.existsSync(workspaceFile) ? JSON.parse(fs.readFileSync(workspaceFile, 'utf8')) : {}
     return { ...common, portal, appointments, workspace }
   ```

In `frontend/src/workspace/ui/ThemeSwitch.tsx`:
- Replace every `t('appointments.theme.` with `t('workspace.theme.` (replace_all, 5 calls).
- In `frontend/src/workspace/ui/Skeleton.tsx`, replace `t('appointments.common.loading', 'Loading…')` with `t('workspace.common.loading', 'Loading…')`.

Run: `npx vitest run src/i18n/localeCompleteness.test.ts`
Expected: FAIL. Each locale is missing the six `workspace.*` keys.

- [ ] **Step 4: Write the words tool** to `$R1/tools/workspace-words.mjs` (Write tool):

```js
// Copies words from the Appointments bundles into the shared workspace bundles, under the same dotted key, in all
// five languages. The Appointments bundles are only read: their files mix one-line and multi-line objects, so a
// rewrite would reformat them. Keys already in a workspace bundle are kept. A key that is not a string in every
// Appointments bundle stops the run before anything is written.
// Usage (from the repo root): node .superpowers/sdd/2026-10-14-content-workspace-r1/tools/workspace-words.mjs frontend/src theme.light,…
import fs from 'node:fs'
import path from 'node:path'

const [src, keyList] = process.argv.slice(2)
if (!src || !keyList) throw new Error('usage: workspace-words.mjs <frontend/src> <key,key,…>')
const keys = keyList.split(',').map(k => k.trim()).filter(Boolean)
const LOCALES = ['en', 'ru', 'de', 'fr', 'es']
const get = (o, key) => key.split('.').reduce((n, p) => (n && typeof n === 'object' ? n[p] : undefined), o)
function set(o, key, value) {
  const parts = key.split('.')
  let node = o
  for (const p of parts.slice(0, -1)) node = node[p] ??= {}
  node[parts[parts.length - 1]] = value
}
const writes = LOCALES.map(locale => {
  const from = path.join(src, 'appointments/i18n', `appointments.${locale}.json`)
  const to = path.join(src, 'workspace/i18n', `workspace.${locale}.json`)
  const words = JSON.parse(fs.readFileSync(from, 'utf8'))
  const bundle = fs.existsSync(to) ? JSON.parse(fs.readFileSync(to, 'utf8')) : {}
  for (const key of keys) if (typeof get(words, key) !== 'string') throw new Error(`${locale}: ${key} is not a string in ${from}`)
  for (const key of keys) set(bundle, key, get(words, key))
  return { to, bundle }
})
for (const { to, bundle } of writes) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.writeFileSync(to, JSON.stringify(bundle, null, 2) + '\n')
}
console.log(`copied ${keys.length} key(s) into ${writes.length} workspace bundles`)
```

Run:

```bash
cd /c/wamp64/www/Hexa-Tech-content
node .superpowers/sdd/2026-10-14-content-workspace-r1/tools/workspace-words.mjs frontend/src theme.label,theme.light,theme.dark,theme.auto,theme.auto_hint,common.loading
cat frontend/src/workspace/i18n/workspace.ru.json
```
Expected: `copied 6 key(s) into 5 workspace bundles`, and the Russian file holds `theme` and `common.loading` in Russian.

- [ ] **Step 5: Register the bundle, and test it**

`frontend/src/workspace/i18n/index.ts`:

```ts
import i18n from '../../i18n'
import en from './workspace.en.json'
import ru from './workspace.ru.json'
import de from './workspace.de.json'
import fr from './workspace.fr.json'
import es from './workspace.es.json'

/**
 * The words every workspace's frame shares (the theme switch, the side
 * panel, Find, the list of shortcuts), kept out of the admin's common.json so
 * a session that never opens a workspace never downloads them. Registered
 * under the `workspace` key of the `common` namespace, so call sites read
 * `t('workspace.theme.light')`. A workspace registers them when its chunk loads.
 */
export const WORKSPACE_LOCALE_FILES = { en, ru, de, fr, es } as const

let registered = false

export function registerWorkspaceLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(WORKSPACE_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { workspace: bundle }, true, true)
  }
  registered = true
}
```

`frontend/src/workspace/i18n/workspaceLocales.test.ts`:

```ts
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
      for (const key of flatten(bundle(locale))) expect(at(bundle(locale), key), `${locale}:${key}`).toBe(at(words, key))
    }
  })
})
```

In `frontend/src/appointments/AppointmentsApp.tsx`:
- Add `import { registerWorkspaceLocales } from '../workspace/i18n'` above `import { registerAppointmentsLocales } from './i18n'`.
- Replace the line `registerAppointmentsLocales()` with:
  ```ts
  registerWorkspaceLocales()
  registerAppointmentsLocales()
  ```

- [ ] **Step 6: Move the glance strip's rules into the core**: cut the last two rule blocks of `frontend/src/appointments/theme/appointments.css`. That is the `/* The Today strip (TodayStrip…` comment with its `@container (min-width: 660px)` block, and the `/* Each tile of the strip…` comment with its `[data-appointments] [data-glance] [data-fit]` rule. Then paste this into `frontend/src/workspace/theme/workspace.css`, just above `@media (prefers-reduced-motion: reduce) {`:

```css
/* A glance strip (Appointments' Today strip, TodayStrip: a container of its own): four tiles in a row once each
   can be 156 px wide — "€1,234.50" in the display face, or three avatars and "+N" —
   so 4 × 156 + 3 × 12 px of gap; two by two below that. The screen's width cannot
   say this: the open panel and the side menu take their share of it. */
@container (min-width: 660px) {
  [data-workspace] [data-glance] {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* Each tile of the strip is a container of its own (TodayStrip), and each of
   its figures is as large as its tile allows, up to the design's 30 px: a
   tile has 104 to 228 px inside (1024 with the panel open to 1280 with it, two
   by two), and at 30 px "£1,234.50" takes 122 px, "€12,345.50" 139, "CHF
   1,234.50" 170, "UAH 125,000.00" 216. --a-fit is the figure's size in cqi at
   which it takes 98 % of its tile, from its measured width in ems
   (ui/fitFigure.ts), so the count and the time stay at 30 px everywhere and
   an amount shrinks only as far as it must. Below 18 px it stops shrinking:
   an amount with a currency code then wraps at the space before the number,
   and nothing runs out of its tile. */
[data-workspace] [data-glance] [data-fit] {
  font-size: clamp(1.125rem, calc(var(--a-fit, 100) * 1cqi), 1.875rem);
  overflow-wrap: anywhere;
}
```

In `frontend/src/workspace/ui/fitFigure.test.ts`:
- Replace `new URL('../theme/appointments.css', import.meta.url)` with `new URL('../theme/workspace.css', import.meta.url)`.
- Replace `\[data-appointments\] \[data-glance\] \[data-fit\]` with `\[data-workspace\] \[data-glance\] \[data-fit\]`.
- Replace `read from appointments.css` with `read from workspace.css`.

In `frontend/src/workspace/ui/Typography.tsx`, replace `appointments.css` with `workspace.css` in the `Figure` comment.

- [ ] **Step 7: Run the tests**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
npx tsc -b && npx vitest run src/workspace src/appointments src/i18n src/theme
grep -rn "appointments\.theme\." src --include=*.ts --include=*.tsx | grep -v "\.test\." ; echo "no code reads appointments.theme.* any more"
```
Expected: all PASS (locale completeness included).

- [ ] **Step 8: Full run and commit**

```bash
npx vitest run > ../.superpowers/sdd/2026-10-14-content-workspace-r1/task4-vitest.txt 2>&1
grep -E '^ FAIL ' ../.superpowers/sdd/2026-10-14-content-workspace-r1/task4-vitest.txt | sort -u | diff - ../.superpowers/sdd/2026-10-14-content-workspace-r1/baseline-failures.txt && echo "failures = baseline"
cd .. && git add -A frontend/src && git commit -q -F - <<'EOF'
Workspace core: the UI pieces, the glance strip and the shared words

Button, Field, Notice, the skeletons, the type roles, the fitted figure and
the Light/Dark/Auto switch move to src/workspace/ui; the glance strip's
rules move to workspace.css. Their words now come from a workspace bundle
in five languages, copied from the Appointments bundles and registered when
the Appointments chunk loads. No visible change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 5: The list of shortcuts and Find's frame

**Files:**
- Move: `appointments/ui/ShortcutsSheet.tsx` → `workspace/ui/ShortcutsSheet.tsx` (git mv, then rewrite); `appointments/ui/shortcutsSheet.test.tsx` → `appointments/ui/appointmentsShortcuts.test.tsx` (git mv)
- Create:
  - `frontend/src/workspace/ui/shortcutsSheet.test.tsx`
  - `frontend/src/workspace/find/findCore.ts`, `findCore.test.ts`
  - `frontend/src/workspace/find/FindFrame.tsx`, `findFrame.test.tsx`
  - `frontend/src/appointments/ui/AppointmentsShortcuts.tsx`
- Rewrite: `frontend/src/appointments/find/FindDialog.tsx`, `frontend/src/appointments/find/findResults.ts`
- Modify:
  - `frontend/src/appointments/find/findResults.test.ts`
  - `frontend/src/appointments/find/findDialog.test.tsx`
  - `frontend/src/appointments/ui/appointmentsShortcuts.test.tsx`
  - `frontend/src/appointments/AppointmentsShell.tsx`
  - `frontend/src/workspace/lib/handBack.test.ts`
  - `frontend/src/workspace/tokens.test.ts`
  - the workspace bundles (tool)

**Interfaces:**
- Consumes: `handBackFocus` (Task 2), `SectionTitle` (Task 4), `registerWorkspaceLocales` (Task 4).
- Produces, from `src/workspace/find/findCore.ts`:
  ```ts
  export type FindTarget = { to: string } | { run: string }
  export interface FindItem { id: string; kind: string; label: string; sub?: string; go: FindTarget }
  export function fold(text: string): string
  export interface Focusable { isConnected: boolean; disabled?: boolean; focus: () => void }
  export function focusTarget<T extends Focusable>(before: T | null, body: unknown, fallbacks: (T | null)[]): T | null
  export function firstFocus<T>(slot: { current: T | undefined }, now: T): T
  export function opensShortcuts(key: string, query: string): boolean
  export function nextActive(ids: string[], current: string | null, delta: 1 | -1): string | null
  ```
- Produces, from `src/workspace/find/FindFrame.tsx`:
  - `FindGroup<I>`
  - `FindList<I extends FindItem>({ groups, activeId, onPick, onHover, iconOf })`
  - `FindFrame<I extends FindItem>({ prompt, query, onQuery, groups, iconOf, onPick, onShortcuts, onClose, waiting?, fallbackFocus? })`
- Produces, from `src/workspace/ui/ShortcutsSheet.tsx`:
  - `ShortcutRow { name: string; keys: string[][] }`
  - `ShortcutSection { title?: string; rows: ShortcutRow[] }`
  - `ShortcutsSheet({ open, onClose, sections, fallbackFocus? })`
- Produces `AppointmentsShortcuts({ open, onClose, modKey, fallbackFocus? })` from `src/appointments/ui/AppointmentsShortcuts.tsx`, and `iconOf` from `src/appointments/find/FindDialog.tsx`.
- `appointments/find/findResults.ts` keeps `FindTarget`, `FindItem`, `FindLabels`, `buildResults`, `latestAppointments`, `settledClients`, `findActions`.
- Produces these `workspace.*` keys: `shortcuts.title`, `shortcuts.or`, `shortcuts.help`, `find.title`, `find.none`, `find.count`, `find.hint_move`, `find.hint_open`, `find.hint_close`, `common.close`.

- [ ] **Step 1: Extend the inventory**: add to `CORE`:

```ts
  'ui/ShortcutsSheet.tsx',
  'find/findCore.ts',
  'find/FindFrame.tsx',
```

- [ ] **Step 2: Copy the words**

```bash
cd /c/wamp64/www/Hexa-Tech-content
node .superpowers/sdd/2026-10-14-content-workspace-r1/tools/workspace-words.mjs frontend/src shortcuts.title,shortcuts.or,shortcuts.help,find.title,find.none,find.count,find.hint_move,find.hint_open,find.hint_close,common.close
```
Expected: `copied 10 key(s) into 5 workspace bundles`.

- [ ] **Step 3: Write the failing core tests**

`frontend/src/workspace/find/findCore.test.ts`: this is the `nextActive`, `opensShortcuts`, `focusTarget` and `firstFocus` blocks moved verbatim from `appointments/find/findResults.test.ts`, plus `fold`:

```ts
import { describe, expect, it } from 'vitest'
import { firstFocus, focusTarget, fold, nextActive, opensShortcuts } from './findCore'

describe('fold', () => {
  it('lowers the case and takes the accents off, so "emilie" finds "Émilie"', () => {
    expect(fold('Émilie')).toBe('emilie')
    expect(fold('MIA')).toBe('mia')
  })
})

describe('nextActive', () => {
  const ids = ['a', 'b', 'c']
  it('moves down and up one option at a time', () => {
    expect(nextActive(ids, 'a', 1)).toBe('b')
    expect(nextActive(ids, 'c', -1)).toBe('b')
  })
  it('wraps at both ends', () => {
    expect(nextActive(ids, 'c', 1)).toBe('a')
    expect(nextActive(ids, 'a', -1)).toBe('c')
  })
  it('starts from the first option when the current one is gone, and has nowhere to go when there is nothing', () => {
    expect(nextActive(ids, 'zzz', 1)).toBe('b')
    expect(nextActive(ids, null, -1)).toBe('c')
    expect(nextActive([], 'a', 1)).toBeNull()
  })
})

describe('opensShortcuts', () => {
  it('is "?" in an empty box, the one place the footer says it works', () => {
    expect(opensShortcuts('?', '')).toBe(true)
    expect(opensShortcuts('?', 'a')).toBe(false) // a question mark in a search is a character
    expect(opensShortcuts('?', ' ')).toBe(false)
    expect(opensShortcuts('/', '')).toBe(false)
    expect(opensShortcuts('Enter', '')).toBe(false)
  })
})

describe('focusTarget', () => {
  const el = (isConnected = true, disabled?: boolean) => ({ isConnected, disabled, focus: () => {} })
  const body = {}
  it('is where the person was', () => {
    const before = el()
    expect(focusTarget(before, body, [el(), el()])).toBe(before)
  })
  it('falls back, in order, when the person was on nothing in particular (Safari leaves the page body after a click on a button)', () => {
    const button = el(), main = el()
    expect(focusTarget(body as never, body, [button, main])).toBe(button)
    expect(focusTarget(null, body, [button, main])).toBe(button)
    expect(focusTarget(body as never, body, [null, main])).toBe(main)
  })
  it('falls back when the place is gone from the page, and is nothing when nothing is left', () => {
    const button = el(), main = el()
    expect(focusTarget(el(false), body, [button, main])).toBe(button)
    expect(focusTarget(el(false), body, [el(false), main])).toBe(main)
    expect(focusTarget(el(false), body, [el(false)])).toBeNull()
    expect(focusTarget(null, body, [])).toBeNull()
  })
  it('skips a place that cannot take focus: a disabled button (Find is switched off when the workspace stops) goes to main', () => {
    const button = el(true, true), main = el()
    expect(focusTarget(null, body, [button, main])).toBe(main)
    expect(focusTarget(body as never, body, [button, main])).toBe(main)
    // Where the person was can be disabled by now, too.
    expect(focusTarget(button, body, [main])).toBe(main)
    expect(focusTarget(null, body, [button])).toBeNull()
    // An enabled control, and one with no `disabled` at all (main), are fine.
    const enabled = el(true, false)
    expect(focusTarget(null, body, [enabled, main])).toBe(enabled)
    expect(focusTarget(null, body, [button, main])).toBe(main)
  })
})

describe('firstFocus', () => {
  it('keeps where the focus was when a dialog first opened: React\'s development re-run finds the dialog\'s own button focused', () => {
    const card = { name: 'card' }, close = { name: 'close' }
    const slot: { current: { name: string } | null | undefined } = { current: undefined }
    expect(firstFocus(slot, card)).toBe(card)
    expect(firstFocus(slot, close)).toBe(card)
    expect(slot.current).toBe(card)
  })
  it('counts "nothing focused" as an answer, not as no answer', () => {
    const slot: { current: object | null | undefined } = { current: undefined }
    expect(firstFocus(slot, null)).toBeNull()
    expect(firstFocus(slot, { name: 'close' })).toBeNull()
  })
})
```

`frontend/src/workspace/find/findFrame.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FileText, Plus } from 'lucide-react'
import { FindFrame } from './FindFrame'
import type { FindItem } from './findCore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const items: FindItem[] = [
  { id: 'new', kind: 'action', label: 'New post', go: { to: '/content?new=1' } },
  { id: 'post-7', kind: 'post', label: 'Autumn menu', sub: 'Instagram · Thu 16 Oct', go: { to: '/content/posts/7' } },
]
const iconOf = (item: FindItem) => (item.kind === 'post' ? FileText : Plus)
const draw = (query = '', waiting: string | null = null, groups = [{ title: 'Posts', items }]) => renderToStaticMarkup(
  <FindFrame prompt="Find a post or action" query={query} onQuery={() => {}} groups={groups} iconOf={iconOf}
    onPick={() => {}} onShortcuts={() => {}} onClose={() => {}} waiting={waiting} />,
)
const tag = (html: string, pattern: RegExp): string => html.match(pattern)?.[0] ?? ''

describe('FindFrame', () => {
  it('is a modal named Find, over a scrim that closes it, with one combobox named by the workspace\'s prompt', () => {
    const html = draw()
    const dialog = tag(html, /<div[^>]*role="dialog"[^>]*>/)
    expect(dialog).toContain('aria-modal="true"')
    expect(dialog).toContain('aria-label="Find"')
    expect(tag(html, /<button[^>]*aria-label="Close"[^>]*>/)).toContain('bg-a-scrim/40')
    const input = tag(html, /<input[^>]*>/)
    expect(input).toContain('role="combobox"')
    expect(input).toContain('aria-label="Find a post or action"')
    expect(input).toContain('aria-controls="find-list"')
    expect((html.match(/<input/g) ?? []).length).toBe(1)
  })

  it('lists the workspace\'s groups with its own icons, the first option active', () => {
    const html = draw()
    expect(html).toContain('aria-label="Posts"')
    expect(tag(html, /<li[^>]*id="find-opt-new"[^>]*>/)).toContain('aria-selected="true"')
    expect(tag(html, /<li[^>]*id="find-opt-post-7"[^>]*>/)).toContain('aria-selected="false"')
    expect(html).toContain('lucide-plus')
    expect(html).toContain('lucide-file-text')
    expect(html).toContain('Instagram · Thu 16 Oct')
  })

  it('says how many results there are, and that nothing matches a query that found none', () => {
    expect(draw()).toContain('Results: 2')
    const none = draw('zzz', null, [])
    expect(none).toContain('Nothing matches “zzz”.')
  })

  it('shows the workspace\'s waiting line only while it is looking', () => {
    expect(draw('au', 'Looking for posts…')).toContain('Looking for posts…')
    expect(draw('au', null)).not.toContain('Looking for posts…')
  })

  it('names the keys in its footer, the list of shortcuts last', () => {
    const footer = draw().slice(draw().lastIndexOf('<div class="hidden items-center'))
    for (const word of ['move', 'open', 'close']) expect(footer).toContain(word)
    expect(footer).toMatch(/<kbd[^>]*>\?<\/kbd>This list<\/span>/)
    expect(footer.indexOf('>Esc<')).toBeLessThan(footer.indexOf('>?<'))
  })
})
```

`frontend/src/workspace/ui/shortcutsSheet.test.tsx`:

```tsx
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShortcutsSheet, type ShortcutSection } from './ShortcutsSheet'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en' },
  }),
}))

const sections: ShortcutSection[] = [
  { rows: [{ name: 'Find', keys: [['Ctrl K'], ['/']] }, { name: 'This list', keys: [['?']] }] },
  { title: 'On the plan', rows: [{ name: 'Previous or next week', keys: [['←', '→']] }, { name: 'Week, month, list', keys: [['W', 'M', 'L']] }] },
]
const draw = (open: boolean) => renderToStaticMarkup(<ShortcutsSheet open={open} onClose={() => {}} sections={sections} />)
const tag = (html: string, pattern: RegExp): string => html.match(pattern)?.[0] ?? ''

describe('ShortcutsSheet', () => {
  it('draws nothing while closed', () => {
    expect(draw(false)).toBe('')
  })

  it('is a modal dialog named Keyboard shortcuts, over a scrim that closes it', () => {
    const html = draw(true)
    const dialog = tag(html, /<div[^>]*role="dialog"[^>]*>/)
    expect(dialog).toContain('aria-modal="true"')
    expect(dialog).toContain('aria-label="Keyboard shortcuts"')
    expect(dialog).toContain('animate-a-pop')
    const scrim = tag(html, /<button[^>]*aria-label="Close"[^>]*>/)
    expect(scrim).toContain('bg-a-scrim/40')
    expect(scrim).toContain('tabindex="-1"')
  })

  it('draws each section: the first without a heading, a later one under its own eyebrow heading', () => {
    const html = draw(true)
    const lists = [...html.matchAll(/<dl class="([^"]*)">([\s\S]*?)<\/dl>/g)]
    expect(lists).toHaveLength(2)
    expect(lists[0][1]).toBe('mt-2 divide-y divide-a-border')
    expect(lists[1][1]).toBe('mt-1 divide-y divide-a-border')
    const heading = html.match(/<h3 class="([^"]*)">On the plan<\/h3>/)
    expect(heading?.[1]).toContain('font-a-mono')
    expect(html.indexOf('</dl>')).toBeLessThan(html.indexOf('On the plan'))
  })

  it('joins the ways to press one shortcut with "or", each key in its own kbd', () => {
    const html = draw(true)
    expect(html).toMatch(/<kbd[^>]*>Ctrl K<\/kbd>\s*<span[^>]*>or<\/span>\s*<kbd[^>]*>\/<\/kbd>/)
    expect(html).toMatch(/<kbd[^>]*>W<\/kbd><kbd[^>]*>M<\/kbd><kbd[^>]*>L<\/kbd>/)
    expect((html.match(/<kbd/g) ?? []).length).toBe(8)
  })

  it('has one Close button and no input', () => {
    const html = draw(true)
    expect(html.match(/<button[^>]*type="button"[^>]*>(?:(?!<\/button>)[\s\S])*Close<\/button>/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('<input')
  })

  // Effects do not run in a static render: the wiring is read from the source.
  it('remembers where the focus was once, so React\'s development re-run cannot replace it with its own Close button', () => {
    const source = readFileSync(new URL('./ShortcutsSheet.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/useRef<HTMLElement \| null \| undefined>\(undefined\)/)
    expect(source).toMatch(/firstFocus\(\w+, document\.activeElement instanceof HTMLElement \? document\.activeElement : null\)/)
    expect(source).not.toMatch(/const before = document\.activeElement/)
  })
})
```

Run: `cd frontend && npx vitest run src/workspace/find src/workspace/ui/shortcutsSheet.test.tsx`
Expected: FAIL (the modules do not exist yet).

- [ ] **Step 4: Write** `frontend/src/workspace/find/findCore.ts`:

```ts
/** Where choosing a Find result goes: to a page, or to something the workspace does itself (`run` names it). */
export type FindTarget = { to: string } | { run: string }
/** One choice in Find. `kind` is the workspace's own word for what it is; the workspace picks its icon by it. */
export interface FindItem { id: string; kind: string; label: string; sub?: string; go: FindTarget }

/** Lower case without accents, so "emilie" finds "Émilie". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export interface Focusable { isConnected: boolean; disabled?: boolean; focus: () => void }

/**
 * Where the focus goes when Find (or another dialog) closes: where the
 * person was; and when that was nothing in particular (the page body, which
 * is where Safari leaves it after a click on a button) or is gone, the first
 * fallback still on the page. A place that cannot take focus is no place: a
 * disabled button (Find's own, once the workspace has stopped) is skipped.
 */
export function focusTarget<T extends Focusable>(before: T | null, body: unknown, fallbacks: (T | null)[]): T | null {
  const candidates = before && before !== body ? [before, ...fallbacks] : fallbacks
  return candidates.find((c): c is T => c !== null && c.isConnected && c.disabled !== true) ?? null
}

/**
 * Where the focus was when a dialog opened, read once into `slot` (`undefined`
 * = not read yet; `null` = nothing in particular). React's development re-run
 * of a mount effect reads it again with the dialog's own button focused; the
 * first answer is the one that counts.
 */
export function firstFocus<T>(slot: { current: T | undefined }, now: T): T {
  if (slot.current === undefined) slot.current = now
  return slot.current
}

/** "?" in an empty box opens the list of shortcuts, as the footer says; with anything typed it is a character of the search. */
export function opensShortcuts(key: string, query: string): boolean {
  return key === '?' && query === ''
}

/** The option after (1) or before (-1) the current one, wrapping at both ends. A current option that is gone counts as the first. */
export function nextActive(ids: string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null
  const at = Math.max(0, current === null ? 0 : ids.indexOf(current))
  return ids[(at + delta + ids.length) % ids.length]
}
```

- [ ] **Step 5: Write** `frontend/src/workspace/find/FindFrame.tsx` (the JSX is the old `FindDialog`'s, unchanged):

```tsx
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, type LucideIcon } from 'lucide-react'
import { handBackFocus } from '../lib/handBack'
import { focusTarget, nextActive, opensShortcuts, type FindItem } from './findCore'

const LIST_ID = 'find-list'
const optionId = (id: string): string => `find-opt-${id}`

export interface FindGroup<I extends FindItem> { title: string; items: I[] }

/** The grouped, selectable results: a listbox the input points at with aria-activedescendant. */
export function FindList<I extends FindItem>({ groups, activeId, onPick, onHover, iconOf }: {
  groups: FindGroup<I>[]
  activeId: string | null
  onPick: (item: I) => void
  onHover: (id: string) => void
  /** The workspace's icon for each kind of result. */
  iconOf: (item: I) => LucideIcon
}) {
  return (
    <ul id={LIST_ID} role="listbox" className="max-h-[min(24rem,50vh)] overflow-y-auto p-2">
      {groups.map(group => (
        <li key={group.title} role="presentation" className="pb-1">
          <div aria-hidden className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-a-text-2">{group.title}</div>
          <ul role="group" aria-label={group.title}>
            {group.items.map(item => {
              const Icon = iconOf(item)
              const active = item.id === activeId
              return (
                <li key={item.id} id={optionId(item.id)} role="option" aria-selected={active}
                  onClick={() => onPick(item)} onMouseMove={() => { if (!active) onHover(item.id) }}
                  className={`flex scroll-mt-9 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${active ? 'bg-a-surface-2 ring-1 ring-inset ring-a-accent-text' : ''}`}>
                  <Icon size={16} aria-hidden className="shrink-0 text-a-text-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-a-text">{item.label}</span>
                    {item.sub && <span className="block truncate text-xs text-a-text-2">{item.sub}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}

const kbd = 'rounded-md border border-a-border px-1.5 font-a-mono text-xs text-a-text-2'

/**
 * Find's box, the same in every workspace: a modal over a scrim with one
 * input (a combobox over the result list), arrow keys and Enter, "?" in an
 * empty box for the list of shortcuts, Escape and Tab kept inside, and the
 * focus handed back to where it was when it closes (or to the fallbacks).
 * What it finds is the workspace's: the workspace holds the query, passes
 * the groups in, and hears which item was chosen; the frame never closes
 * itself on a choice.
 */
export function FindFrame<I extends FindItem>({ prompt, query, onQuery, groups, iconOf, onPick, onShortcuts, onClose, waiting, fallbackFocus }: {
  /** The input's name and placeholder ("Find a client, appointment or action"). */
  prompt: string
  query: string
  onQuery: (query: string) => void
  groups: FindGroup<I>[]
  iconOf: (item: I) => LucideIcon
  /** A result was chosen (Enter or a click). */
  onPick: (item: I) => void
  /** "?" in an empty box. */
  onShortcuts: () => void
  onClose: () => void
  /** A line under the list while the workspace is still looking ("Searching clients…"), or nothing. */
  waiting?: string | null
  /** Where the focus goes on close when the person was on nothing in particular (or the place is gone), tried in order. */
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)
  // Where the person was before Find opened, read once when it opens.
  const [before] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)))
  const items = groups.flatMap(g => g.items)
  const current = items.find(i => i.id === activeId) ?? items[0]
  const currentId = current?.id ?? null

  // Arrowing past the visible part of a long list brings the option into view.
  useEffect(() => {
    if (currentId) document.getElementById(optionId(currentId))?.scrollIntoView?.({ block: 'nearest' })
  }, [currentId])

  // Back to where the person was (or, if that was the page body or is gone, to the fallbacks), unless something else — a panel the choice opened — has taken the focus since.
  const fallbacks = useRef(fallbackFocus)
  useEffect(() => { fallbacks.current = fallbackFocus })
  useEffect(() => () => {
    const held = document.activeElement
    if (held && held !== document.body && held !== document.documentElement) return
    handBackFocus(focusTarget(before, document.body, (fallbacks.current ?? []).map(r => r.current)))
  }, [before])

  const focusInput = useCallback((el: HTMLInputElement | null) => { el?.focus({ preventScroll: true }) }, [])

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveId(nextActive(items.map(i => i.id), currentId, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter' && current) {
      e.preventDefault()
      onPick(current)
    } else if (opensShortcuts(e.key, query)) {
      // The footer's "? This list": the one place a question mark is not a character of the search.
      e.preventDefault()
      onShortcuts()
    }
  }
  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    // The input is the one control in the box: Tab would only leave it for the page behind the scrim.
    else if (e.key === 'Tab') e.preventDefault()
  }

  const typed = query.trim()
  const none = typed !== '' && items.length === 0
  const status = none
    ? t('workspace.find.none', 'Nothing matches “{{q}}”.', { q: typed })
    : t('workspace.find.count', 'Results: {{count}}', { count: items.length })

  return (
    <>
      <button type="button" aria-label={t('workspace.common.close', 'Close')} tabIndex={-1} onClick={onClose}
        className="fixed inset-0 z-50 cursor-default bg-a-scrim/40 animate-a-fade" />
      {/* Centred with auto margins, not translate: the pop animation ends on transform: none and would undo a translate. */}
      <div role="dialog" aria-modal="true" aria-label={t('workspace.find.title', 'Find')} onKeyDown={onPanelKey}
        onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault() }}
        className="fixed inset-x-0 top-24 z-50 mx-auto w-[min(40rem,calc(100%-2rem))] overflow-hidden rounded-2xl border border-a-border bg-a-surface text-a-text shadow-a-lg animate-a-pop">
        {/* The focus never leaves the input: the row shows it, as an underline (workspace.css, [data-find-row]). */}
        <div data-find-row="" className="flex items-center gap-3 border-b border-a-border px-4 py-3">
          <Search size={18} aria-hidden className="shrink-0 text-a-text-2" />
          <input ref={focusInput} value={query} onChange={(e) => { onQuery(e.target.value); setActiveId(null) }} onKeyDown={onInputKey}
            role="combobox" aria-expanded="true" aria-controls={LIST_ID} aria-autocomplete="list" aria-activedescendant={current ? optionId(current.id) : undefined}
            aria-label={prompt} placeholder={prompt} autoComplete="off" spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base text-a-text placeholder:text-a-text-2 sm:text-sm" />
        </div>

        <FindList groups={groups} activeId={currentId} onPick={onPick} onHover={setActiveId} iconOf={iconOf} />

        {none && <p aria-hidden className="px-4 pb-4 text-sm text-a-text-2">{status}</p>}
        {waiting && <p className="px-4 pb-3 text-xs text-a-text-2">{waiting}</p>}
        <p role="status" aria-live="polite" className="sr-only">{status}</p>

        <div className="hidden items-center gap-4 border-t border-a-border px-4 py-2 text-xs text-a-text-2 sm:flex">
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>↑</kbd><kbd className={kbd}>↓</kbd>{t('workspace.find.hint_move', 'move')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>Enter</kbd>{t('workspace.find.hint_open', 'open')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>Esc</kbd>{t('workspace.find.hint_close', 'close')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>?</kbd>{t('workspace.shortcuts.help', 'This list')}</span>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Generalise the list of shortcuts**

```bash
cd /c/wamp64/www/Hexa-Tech-content
git mv frontend/src/appointments/ui/ShortcutsSheet.tsx frontend/src/workspace/ui/ShortcutsSheet.tsx
git mv frontend/src/appointments/ui/shortcutsSheet.test.tsx frontend/src/appointments/ui/appointmentsShortcuts.test.tsx
```

Replace `frontend/src/workspace/ui/ShortcutsSheet.tsx` with (Write tool):

```tsx
import { Fragment, useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { firstFocus, focusTarget } from '../find/findCore'
import { handBackFocus } from '../lib/handBack'
import { SectionTitle } from './Typography'

/** One shortcut: its name and its keys. Each inner list is one way to press it; the ways are joined by "or". */
export interface ShortcutRow { name: string; keys: string[][] }
/** A group of rows. The first has no heading (the keys for every page); a later one names where its keys work. */
export interface ShortcutSection { title?: string; rows: ShortcutRow[] }

const kbd = 'rounded-md border border-a-border px-1.5 font-a-mono text-xs'

function Keys({ children }: { children: string[] }) {
  return <>{children.map(k => <kbd key={k} className={kbd}>{k}</kbd>)}</>
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="min-w-0 text-sm text-a-text">{name}</dt>
      <dd className="flex shrink-0 items-center gap-1.5 text-a-text-2">{children}</dd>
    </div>
  )
}

/**
 * The list of keyboard shortcuts behind "?": a modal sheet of the
 * workspace's own sections. The focus moves onto its Close button when it
 * opens and returns to where it was when it closes; Escape and the scrim
 * close it. Nothing is drawn while it is closed.
 */
export function ShortcutsSheet({ open, onClose, sections, fallbackFocus }: {
  open: boolean
  onClose: () => void
  sections: ShortcutSection[]
  /** Where the focus goes on close when the person was on nothing in particular (or the place is gone), tried in order. */
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  if (!open) return null
  return <ShortcutsPanel onClose={onClose} sections={sections} fallbackFocus={fallbackFocus} />
}

function ShortcutsPanel({ onClose, sections, fallbackFocus }: { onClose: () => void; sections: ShortcutSection[]; fallbackFocus?: RefObject<HTMLElement | null>[] }) {
  const { t } = useTranslation()
  const closeButton = useRef<HTMLButtonElement>(null)
  const fallbacks = useRef(fallbackFocus)
  useEffect(() => { fallbacks.current = fallbackFocus })
  const opener = useRef<HTMLElement | null | undefined>(undefined)

  // Read when the sheet has mounted, not while it renders: opened from Find, the focus is still in Find's box until Find has handed it back.
  // Read once: React's development re-run of this effect would find the Close button focused.
  useEffect(() => {
    const before = firstFocus(opener, document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const mine = closeButton.current
    mine?.focus({ preventScroll: true })
    return () => {
      // Unless something else has taken the focus since (the Close button itself still holding it is a development re-run, not a close).
      const held = document.activeElement
      if (held && held !== document.body && held !== document.documentElement && held !== mine) return
      handBackFocus(focusTarget(before, document.body, (fallbacks.current ?? []).map(r => r.current)))
    }
  }, [])

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Stopped here so the panel behind (which closes on Escape from the window) stays open.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    // One control in the sheet: Tab would only leave it for the page behind the scrim.
    else if (e.key === 'Tab') e.preventDefault()
  }

  const title = t('workspace.shortcuts.title', 'Keyboard shortcuts')
  const or = t('workspace.shortcuts.or', 'or')

  return (
    <>
      <button type="button" aria-label={t('workspace.common.close', 'Close')} tabIndex={-1} onClick={onClose}
        className="fixed inset-0 z-50 cursor-default bg-a-scrim/40 animate-a-fade" />
      {/* Centred with auto margins, not translate: the pop animation ends on transform: none and would undo a translate. */}
      <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onPanelKey}
        className="fixed inset-x-0 top-24 z-50 mx-auto max-h-[calc(100vh-8rem)] w-[min(30rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-a-border bg-a-surface p-5 text-a-text shadow-a-lg animate-a-pop focus:outline-none">
        <SectionTitle>{title}</SectionTitle>
        {sections.map((section, i) => (
          <Fragment key={section.title ?? i}>
            {section.title && <h3 className="mt-4 font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{section.title}</h3>}
            <dl className={`${section.title ? 'mt-1' : 'mt-2'} divide-y divide-a-border`}>
              {section.rows.map(row => (
                <Row key={row.name} name={row.name}>
                  {row.keys.map((way, j) => (
                    <Fragment key={way.join(' ')}>
                      {j > 0 && <span className="text-xs">{or}</span>}
                      <Keys>{way}</Keys>
                    </Fragment>
                  ))}
                </Row>
              ))}
            </dl>
          </Fragment>
        ))}
        <div className="mt-4 flex justify-end">
          <button ref={closeButton} type="button" onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-a-border bg-a-surface px-4 text-sm font-semibold text-a-text transition hover:bg-a-surface-2">
            {t('workspace.common.close', 'Close')}
          </button>
        </div>
      </div>
    </>
  )
}
```

Create `frontend/src/appointments/ui/AppointmentsShortcuts.tsx`:

```tsx
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutsSheet } from '../../workspace/ui/ShortcutsSheet'

/**
 * The list of shortcuts behind "?" in the Appointments workspace: the keys
 * for every page first, then the calendar's own under "On the calendar" —
 * the sheet opens anywhere, but the day, view and card keys work only there.
 */
export function AppointmentsShortcuts({ open, onClose, modKey, fallbackFocus }: {
  open: boolean
  onClose: () => void
  /** "Ctrl", or "⌘" on a Mac. */
  modKey: string
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  const { t } = useTranslation()
  return (
    <ShortcutsSheet open={open} onClose={onClose} fallbackFocus={fallbackFocus} sections={[
      { rows: [
        { name: t('appointments.shortcuts.find', 'Find'), keys: [[`${modKey} K`], ['/']] },
        { name: t('appointments.shell.new_appointment', 'New appointment'), keys: [['N']] },
        { name: t('appointments.shortcuts.help', 'This list'), keys: [['?']] },
      ] },
      { title: t('appointments.shortcuts.on_calendar', 'On the calendar'), rows: [
        { name: t('appointments.calendar.today', 'Today'), keys: [['T']] },
        { name: t('appointments.shortcuts.days', 'Previous or next day (week in the week view)'), keys: [['←', '→']] },
        { name: t('appointments.shortcuts.views', 'Day, week, list'), keys: [['D', 'W', 'L']] },
        { name: t('appointments.shortcuts.close', 'Close the panel'), keys: [['Esc']] },
        { name: t('appointments.shortcuts.card', 'Move a selected appointment'), keys: [['↑', '↓', '←', '→']] },
      ] },
    ]} />
  )
}
```

In `frontend/src/appointments/ui/appointmentsShortcuts.test.tsx`:
1. Replace `import { ShortcutsSheet } from './ShortcutsSheet'` with `import { AppointmentsShortcuts } from './AppointmentsShortcuts'`.
2. Replace `<ShortcutsSheet open={open} onClose={() => {}} modKey={modKey} />` with `<AppointmentsShortcuts open={open} onClose={() => {}} modKey={modKey} />`.
3. Replace `describe('ShortcutsSheet', () => {` with `describe('AppointmentsShortcuts', () => {`.
4. Delete the last test (`'remembers where the focus was once…'`) and the now-unused `import { readFileSync } from 'node:fs'`. That test lives in `workspace/ui/shortcutsSheet.test.tsx` now.

In `frontend/src/appointments/AppointmentsShell.tsx`:
- Replace `import { ShortcutsSheet } from './ui/ShortcutsSheet'` with `import { AppointmentsShortcuts } from './ui/AppointmentsShortcuts'`. The plain `git mv` above rewrote no imports, so the old line is still there.
- Replace `<ShortcutsSheet open={helpOpen}` with `<AppointmentsShortcuts open={helpOpen}`.

- [ ] **Step 7: Put Appointments' Find on the frame**: replace `frontend/src/appointments/find/findResults.ts` with (Write tool):

```ts
import type { AppointmentSummary, ClientSummary, DateKey } from '../lib/types'
import { dateOf, timeOf, wallMinutes } from '../../workspace/lib/wallClock'
import { fold } from '../../workspace/find/findCore'

/** Where choosing a result goes: to a page, or to something the shell does itself. */
export type FindTarget = { to: string } | { run: 'theme' | 'rail' | 'shortcuts' }
export interface FindItem { id: string; kind: 'action' | 'appointment' | 'client' | 'search'; label: string; sub?: string; go: FindTarget }
export interface FindLabels {
  actions: string; goTo: string; comingUp: string; appointments: string; clients: string; searchAll: (q: string) => string
  /** A day as the workspace writes it in the active language ("Wed 30 Sept"). */
  day: (date: DateKey) => string
}

const LIMIT = 6

function apptItem(a: AppointmentSummary, day: FindLabels['day']): FindItem {
  return {
    id: `appt-${a.id}`, kind: 'appointment',
    label: `${timeOf(a.start)} · ${a.client.name}`,
    sub: [a.service?.name, a.master?.name, day(dateOf(a.start))].filter(Boolean).join(' · '),
    go: { to: `/appointments?open=${a.id}&date=${dateOf(a.start)}` },
  }
}

export function buildResults({ query, actions, appointments, clients, now, labels }: {
  query: string; actions: FindItem[]; appointments: AppointmentSummary[]; clients: ClientSummary[]
  now: { date: DateKey; minutes: number }; labels: FindLabels
}): { title: string; items: FindItem[] }[] {
  const q = fold(query.trim())
  const live = appointments.filter(a => a.status !== 'cancelled')
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)
  // The same day can sit in more than one loaded range (a week and its day): list it once.
  const seen = new Set<number>()
  const unique = live.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)))

  if (q === '') {
    const comingUp = unique.filter(a => dateOf(a.start) === now.date && wallMinutes(a.start) >= now.minutes).slice(0, 3)
    // Every action: with nothing typed, the box is how a person finds out what it can do (typing narrows them to LIMIT).
    return [
      { title: labels.actions, items: actions },
      ...(comingUp.length ? [{ title: labels.comingUp, items: comingUp.map(a => apptItem(a, labels.day)) }] : []),
    ]
  }

  const hit = (...texts: (string | null | undefined)[]) => texts.some(t => t && fold(t).includes(q))
  const groups = [
    { title: labels.actions, items: actions.filter(a => hit(a.label, a.sub)).slice(0, LIMIT) },
    { title: labels.appointments, items: unique.filter(a => hit(a.client.name, a.service?.name, a.master?.name)).slice(0, LIMIT).map(a => apptItem(a, labels.day)) },
    { title: labels.clients, items: clients.slice(0, LIMIT).map((c): FindItem => ({
      id: `client-${c.id}`, kind: 'client', label: c.name, sub: [c.phone, c.email].filter(Boolean).join(' · ') || undefined,
      go: { to: `/appointments/clients/${c.id}` },
    })) },
  ].filter(g => g.items.length > 0)

  // From two letters the client list itself can be searched in full. Its item closes the Clients group, or is that group.
  if (q.length >= 2) {
    const raw = query.trim()
    const all: FindItem = { id: 'search-all', kind: 'search', label: labels.searchAll(raw), go: { to: `/appointments/clients?search=${encodeURIComponent(raw)}` } }
    const clientGroup = groups.find(g => g.items.some(i => i.kind === 'client'))
    if (clientGroup) clientGroup.items.push(all)
    else groups.push({ title: labels.clients, items: [all] })
  }
  return groups
}

/**
 * Every appointment the loaded calendars hold, once each. Calendars of
 * different ranges overlap, and one fetched earlier may still show an
 * appointment at the time it had before it was moved or cancelled: the copy
 * from the calendar fetched most recently wins (the first, on a tie).
 */
export function latestAppointments(entries: { updatedAt: number; appointments: AppointmentSummary[] }[]): AppointmentSummary[] {
  const best = new Map<number, { updatedAt: number; appointment: AppointmentSummary }>()
  for (const { updatedAt, appointments } of entries) {
    for (const appointment of appointments) {
      const kept = best.get(appointment.id)
      if (!kept || updatedAt > kept.updatedAt) best.set(appointment.id, { updatedAt, appointment })
    }
  }
  return [...best.values()].map(b => b.appointment)
}

/** The clients to list: the server's answer, and only when it is the answer to the words in the box now and they are two letters or more. */
export function settledClients(typed: string, debounced: string, data: ClientSummary[] | undefined): ClientSummary[] {
  return typed.length >= 2 && debounced === typed ? (data ?? []) : []
}

/**
 * The things Find can do without a search: start an appointment, go to a page
 * the person can see (the shell's own `nav` already leaves out what a person
 * may not open), time off, the theme, the menu and the list of keyboard
 * shortcuts. The words arrive translated, so this stays a plain function.
 */
export function findActions({ nav, canManage, wide, dark, slim, words }: {
  nav: { to: string; label: string }[]
  canManage: boolean
  /** The side menu only exists from 1024 px; below it there is nothing to collapse. */
  wide: boolean
  dark: boolean
  slim: boolean
  words: { newAppointment: string; goTo: string; timeOff: string; toDark: string; toLight: string; collapse: string; expand: string; shortcuts: string }
}): FindItem[] {
  const rail: FindItem = { id: 'rail', kind: 'action', label: slim ? words.expand : words.collapse, go: { run: 'rail' } }
  return [
    { id: 'new', kind: 'action', label: words.newAppointment, go: { to: '/appointments?new=1' } },
    ...nav.map((n): FindItem => ({
      id: `go-${n.to.replace(/^\/appointments\/?/, '') || 'calendar'}`, kind: 'action', label: n.label, sub: words.goTo, go: { to: n.to },
    })),
    { id: 'time-off', kind: 'action', label: words.timeOff, go: { to: canManage ? '/appointments/setup?tab=team' : '/appointments/setup' } },
    { id: 'theme', kind: 'action', label: dark ? words.toLight : words.toDark, go: { run: 'theme' } },
    ...(wide ? [rail] : []),
    { id: 'shortcuts', kind: 'action', label: words.shortcuts, go: { run: 'shortcuts' } },
  ]
}
```

Replace `frontend/src/appointments/find/FindDialog.tsx` with (Write tool):

```tsx
import { useEffect, useState, type RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarDays, Plus, Search, User, type LucideIcon } from 'lucide-react'
import { FindFrame } from '../../workspace/find/FindFrame'
import { formatDate, venueNow } from '../../workspace/lib/wallClock'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import type { CalendarPayload } from '../lib/types'
import { useVocab } from '../lib/vocab'
import { buildResults, latestAppointments, settledClients, type FindItem, type FindLabels, type FindTarget } from './findResults'

/** Appointments' icon for a result: a calendar day, a person, a magnifier, and a plus or an arrow for an action. */
export function iconOf(item: FindItem): LucideIcon {
  if (item.kind === 'appointment') return CalendarDays
  if (item.kind === 'client') return User
  if (item.kind === 'search') return Search
  return item.id === 'new' ? Plus : ArrowRight
}

/**
 * Appointments' Find, on the shared frame: clients (searched on the server
 * from two letters), appointments (the calendars already loaded) and
 * actions. Nothing is drawn, and nothing is fetched, while it is closed.
 */
export function FindDialog({ open, onClose, onRun, actions, fallbackFocus }: {
  open: boolean
  onClose: () => void
  onRun: (target: FindTarget) => void
  actions: FindItem[]
  /** Where the focus goes on close when the person was on nothing in particular (or the place is gone), tried in order. */
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  if (!open) return null
  return <FindPanel onClose={onClose} onRun={onRun} actions={actions} fallbackFocus={fallbackFocus} />
}

function FindPanel({ onClose, onRun, actions, fallbackFocus }: { onClose: () => void; onRun: (target: FindTarget) => void; actions: FindItem[]; fallbackFocus?: RefObject<HTMLElement | null>[] }) {
  const { t, i18n } = useTranslation()
  const vocab = useVocab()
  const boot = useBoot()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  // What the venue's clock says, read once when Find opens.
  const [now] = useState(() => venueNow(boot.venue.timezone))
  // Every calendar already loaded, the most recently fetched copy of each appointment.
  const [appointments] = useState(() => latestAppointments(
    queryClient.getQueriesData<CalendarPayload>({ queryKey: ['appointments', 'calendar'] }).map(([key, payload]) => ({
      updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt ?? 0,
      appointments: payload?.appointments ?? [],
    }))))

  // The server is asked once typing pauses; the state is set from the timer's callback.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const typed = query.trim()
  const asking = typed.length >= 2
  const search = useQuery({
    queryKey: ['appointments', 'find-clients', debounced],
    queryFn: () => appointmentsApi.searchClients(debounced).then(r => r.clients),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
    retry: false,
  })
  // Only the answer to the words now in the box: the clients of an earlier search would be shown under a heading they do not belong to.
  const clients = settledClients(typed, debounced, search.data)
  const waiting = asking && (debounced !== typed || search.isFetching)

  const labels: FindLabels = {
    actions: t('appointments.find.actions', 'Actions'),
    goTo: t('appointments.find.go_to', 'Go to'),
    comingUp: t('appointments.find.coming_up', 'Coming up today'),
    appointments: t('appointments.find.appointments', 'Appointments'),
    clients: vocab('clients'),
    searchAll: q => t('appointments.find.search_all', 'Search all clients for “{{q}}”', { q }),
    // The short day the drop confirm uses ("Wed 30 Sept", "ср, 30 сент."), in the calendar's own locale.
    day: date => formatDate(date, i18n.language || 'en', { weekday: 'short', day: 'numeric', month: 'short' }),
  }
  const groups = buildResults({ query, actions, appointments, clients, now, labels })

  return (
    <FindFrame prompt={t('appointments.find.open', 'Find a client, appointment or action')} query={query} onQuery={setQuery}
      groups={groups} iconOf={iconOf}
      onPick={(item) => { onRun(item.go); onClose() }}
      onShortcuts={() => { onRun({ run: 'shortcuts' }); onClose() }}
      onClose={onClose}
      waiting={waiting ? t('appointments.find.searching', 'Searching clients…') : null}
      fallbackFocus={fallbackFocus} />
  )
}
```

In `frontend/src/appointments/find/findResults.test.ts`:
1. Replace its import line from `'./findResults'` with:
   ```ts
   import { buildResults, findActions, latestAppointments, settledClients, type FindItem } from './findResults'
   import { fold } from '../../workspace/find/findCore'
   ```
2. Delete the four blocks `describe('nextActive', …)`, `describe('opensShortcuts', …)`, `describe('focusTarget', …)` and `describe('firstFocus', …)`. They are verbatim in `workspace/find/findCore.test.ts` now.

In `frontend/src/appointments/find/findDialog.test.tsx`:
1. Replace `import { FindDialog, FindList } from './FindDialog'` with:
   ```ts
   import { FindList } from '../../workspace/find/FindFrame'
   import { FindDialog, iconOf } from './FindDialog'
   ```
2. In `describe('FindList', …)`, replace `<FindList groups={groups} activeId={activeId} onPick={() => {}} onHover={() => {}} />` with `<FindList groups={groups} activeId={activeId} onPick={() => {}} onHover={() => {}} iconOf={iconOf} />`.
3. Replace `<FindList groups={[{ title: 'Actions', items: actions }]} activeId={null} onPick={() => {}} onHover={() => {}} />` with the same plus ` iconOf={iconOf}` before `/>`.

In `frontend/src/workspace/lib/handBack.test.ts`:
- Replace `'../../appointments/find/FindDialog.tsx'` with `'../find/FindFrame.tsx'` (replace_all).
- Replace `'../../appointments/ui/ShortcutsSheet.tsx'` with `'../ui/ShortcutsSheet.tsx'` (replace_all).

- [ ] **Step 8: Run the tests**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
npx tsc -b && npx vitest run src/workspace src/appointments src/i18n
```
Expected: all PASS. That includes `appointmentsShortcuts.test.tsx` with its assertions unchanged (every row, 15 kbd, the two lists and the heading) and `findDialog.test.tsx`.

- [ ] **Step 9: Full run and commit**

```bash
npx vitest run > ../.superpowers/sdd/2026-10-14-content-workspace-r1/task5-vitest.txt 2>&1
grep -E '^ FAIL ' ../.superpowers/sdd/2026-10-14-content-workspace-r1/task5-vitest.txt | sort -u | diff - ../.superpowers/sdd/2026-10-14-content-workspace-r1/baseline-failures.txt && echo "failures = baseline"
cd .. && git add -A frontend/src && git commit -q -F - <<'EOF'
Workspace core: the list of shortcuts and Find's frame

ShortcutsSheet draws a workspace's own sections of rows; Appointments passes
its rows through AppointmentsShortcuts. FindFrame holds Find's box (the
combobox, keys, footer and focus hand-back) and the generic helpers move to
findCore; Appointments' FindDialog keeps its search and results on top.
No visible change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 6: The frame: `WorkspaceShell`

**Files:**
- Create: `frontend/src/workspace/WorkspaceShell.tsx`, `frontend/src/workspace/WorkspaceShell.test.tsx`
- Rewrite: `frontend/src/appointments/AppointmentsShell.tsx`
- Modify: `frontend/src/workspace/lib/shellMark.test.ts`, `frontend/src/workspace/tokens.test.ts`, the workspace bundles (tool)
- Unchanged, and it must pass: `frontend/src/appointments/AppointmentsShell.test.tsx` (it gained only the Task 1 `data-workspace` line)

**Interfaces:**
- Consumes:
  - `LiveLook` (Task 3)
  - `AccentTokens` and `accentStyle` (Task 1)
  - `markShell` (Task 3)
  - `firstLetter` (Task 2)
  - `ThemeSwitch` (Task 4)
  - `AppointmentsShortcuts`, `FindDialog` (Task 5)
- Produces, from `src/workspace/WorkspaceShell.tsx`:
  - `WorkspaceNavItem { to: string; end: boolean; icon: LucideIcon; label: string }`
  - `WorkspaceShell({ workspace, look, accent, initial, organization?, product, person?, nav, fullAdmin, header, overlays?, children })`
- Produces these `workspace.*` keys: `shell.menu`, `shell.full_admin`, `shell.language`, `shell.sign_out`, `shell.collapse`, `shell.expand`.

- [ ] **Step 1: Extend the inventory and copy the words**: add `'WorkspaceShell.tsx',` to `CORE`, then:

```bash
cd /c/wamp64/www/Hexa-Tech-content
node .superpowers/sdd/2026-10-14-content-workspace-r1/tools/workspace-words.mjs frontend/src shell.menu,shell.full_admin,shell.language,shell.sign_out,shell.collapse,shell.expand
```

- [ ] **Step 2: Write the failing frame test** `frontend/src/workspace/WorkspaceShell.test.tsx`:

```tsx
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { CalendarDays, FileText } from 'lucide-react'
import { WorkspaceShell, type WorkspaceNavItem } from './WorkspaceShell'
import { accentTokens } from './theme/accent'
import type { LiveLook } from './lib/look'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))
vi.mock('../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))
vi.mock('../i18n', () => ({ SUPPORTED_LANGUAGES: [{ code: 'en', label: 'English' }, { code: 'ru', label: 'Русский' }] }))

const nav: WorkspaceNavItem[] = [
  { to: '/content', end: true, icon: CalendarDays, label: 'Plan' },
  { to: '/content/posts', end: false, icon: FileText, label: 'Posts' },
]
const look = (rail: 'full' | 'slim' = 'full'): LiveLook => ({ theme: 'light', rail, resolved: 'light', setTheme: () => {}, setRail: () => {} })

function render({ rail = 'full', fullAdmin = '/marketing' }: { rail?: 'full' | 'slim'; fullAdmin?: string | null } = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/content']}>
      <WorkspaceShell workspace="content" look={look(rail)} accent={accentTokens('#c9a84c', 'light')} initial="L"
        organization="Lumière Salon" product="HexaTech Content" person="Vitalij K" nav={nav} fullAdmin={fullAdmin}
        header={<p>the workspace header</p>} overlays={<p>an overlay</p>}>
        <main>page body</main>
      </WorkspaceShell>
    </MemoryRouter>,
  )
}

describe('WorkspaceShell', () => {
  it('is the token scope for the shared core and for the workspace by its name', () => {
    const html = render()
    const root = html.match(/^<div[^>]*>/)?.[0] ?? ''
    expect(root).toContain('data-workspace=""')
    expect(root).toContain('data-content=""')
    expect(root).not.toContain('data-appointments')
    expect(root).toContain('data-theme="light"')
    expect(root).toContain('--a-accent:201 168 76')
  })

  it('draws the workspace\'s areas, its header, its page and its overlays', () => {
    const html = render()
    expect(html).toContain('href="/content"')
    expect(html).toContain('href="/content/posts"')
    expect(html).toContain('the workspace header')
    expect(html).toContain('page body')
    expect(html).toContain('an overlay')
  })

  it('names the organisation, the product and the person, with their marks', () => {
    const html = render()
    expect(html).toContain('Lumière Salon')
    expect(html).toContain('HexaTech Content')
    expect(html).toContain('Vitalij K')
    expect(html).toMatch(/text-a-accent-ink">L</)
    expect(html).toMatch(/>V<\/span>/)
  })

  it('keeps a way back to the full admin, in the side panel and in the phone menu, only where there is one', () => {
    expect((render().match(/href="\/marketing"/g) ?? []).length).toBe(2)
    expect(render({ fullAdmin: null })).not.toContain('Full admin')
  })

  it('keeps every name in the slim side panel, for a screen reader and as a label beside the icon', () => {
    const html = render({ rail: 'slim' })
    expect(html).toContain('data-rail-size="slim"')
    expect(html).toContain('data-tip="Plan"')
    expect(html).toContain('data-tip="Expand menu"')
    expect(html).toContain('aria-expanded="false"')
  })

  // Effects do not run in a static render: the wiring is read from the source.
  it('marks <html> with the workspace\'s name before the first paint', () => {
    const source = readFileSync(new URL('./WorkspaceShell.tsx', import.meta.url), 'utf8')
    expect(source).toContain('useLayoutEffect(() => markShell(document.documentElement, workspace), [workspace])')
  })
})
```

Run: `cd frontend && npx vitest run src/workspace/WorkspaceShell.test.tsx`
Expected: FAIL (`./WorkspaceShell` does not exist).

- [ ] **Step 3: Write** `frontend/src/workspace/WorkspaceShell.tsx`. The JSX is today's `AppointmentsShell` frame, with Appointments' parts turned into props:

```tsx
import { useLayoutEffect, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe, LayoutGrid, LogOut, Menu, PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../i18n'
import { logoutAndRedirect } from '../lib/logout'
import { firstLetter } from './lib/firstLetter'
import type { LiveLook } from './lib/look'
import { markShell } from './lib/shellMark'
import { accentStyle, type AccentTokens } from './theme/accent'
import { ThemeSwitch } from './ui/ThemeSwitch'

export interface WorkspaceNavItem { to: string; end: boolean; icon: LucideIcon; label: string }

/**
 * A workspace's frame, the same for every workspace: an ink side panel that
 * collapses to icons (the organisation's mark, the workspace's own areas,
 * the Light/Dark/Auto switch, the way back to the full admin, the language,
 * the person and Sign out), and a top bar whose middle is the workspace's own
 * (`header`: its organisation line, Find and its main action), with the side
 * panel's secondary area folded into a menu below 1024 px. The root is the
 * token scope: `data-workspace` for the shared Atelier tokens and
 * `data-<workspace>` for the workspace's own rules. It marks
 * <html data-shell="<workspace>"> from the first paint, so the full admin's
 * mood typography stays out.
 */
export function WorkspaceShell({ workspace, look, accent, initial, organization, product, person, nav, fullAdmin, header, overlays, children }: {
  /** The workspace's name: its root attribute (`data-appointments`) and its <html> mark. */
  workspace: string
  look: LiveLook
  accent: AccentTokens
  /** The organisation's mark in the side panel: one letter or one emoji. */
  initial: string
  organization?: string
  /** The line under the organisation in the side panel: the workspace's name. */
  product: string
  /** The signed-in person's name; the avatar draws its first letter. */
  person?: string
  nav: WorkspaceNavItem[]
  /** Where "Full admin" goes, or null where there is no full admin (the Appointments plan). */
  fullAdmin: string | null
  header: ReactNode
  /** Dialogs drawn over the whole frame (Find, the list of shortcuts). */
  overlays?: ReactNode
  children: ReactNode
}) {
  const { t, i18n } = useTranslation()
  // <html data-shell="<workspace>"> keeps the full admin's Branding mood typography out, from the first paint.
  useLayoutEffect(() => markShell(document.documentElement, workspace), [workspace])
  const slim = look.rail === 'slim'
  const signOut = () => { void logoutAndRedirect('/login') }
  const language = (className: string) => (
    <label className="block">
      <span className="sr-only">{t('workspace.shell.language', 'Language')}</span>
      <select value={i18n.language?.slice(0, 2)} onChange={(e) => { void i18n.changeLanguage(e.target.value) }} className={className}>
        {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  )
  const scope = { [`data-${workspace}`]: '' } as Record<string, string>

  return (
    <div data-workspace="" {...scope} data-theme={look.resolved} data-accent-edge={accent.edge ? '' : undefined}
      style={accentStyle(accent) as CSSProperties} className="min-h-screen flex bg-a-canvas text-a-text">
      <aside data-rail="" data-rail-size={look.rail} aria-label={t('workspace.shell.menu', 'Menu')}
        className={`hidden lg:flex ${slim ? 'w-[76px]' : 'w-64'} shrink-0 flex-col gap-6 bg-a-side px-3 py-5 text-a-side-text transition-[width] duration-300 ease-out`}>
        <div className={`flex min-h-11 items-center gap-3 ${slim ? 'justify-center' : 'px-2'}`}>
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-a-accent font-a-display text-lg font-semibold text-a-accent-ink">{initial}</span>
          <div className={slim ? 'sr-only' : 'min-w-0'}>
            <div className="truncate text-[15px] font-semibold leading-tight">{organization}</div>
            <div className="truncate text-xs text-a-side-text-2">{product}</div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} data-tip={slim ? label : undefined}
              className={({ isActive }) => `relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${slim ? 'justify-center' : ''} ${isActive ? 'bg-a-side-2 text-a-side-text' : 'text-a-side-text-2 hover:bg-a-side-2/60 hover:text-a-side-text'}`}>
              {({ isActive }) => (
                <>
                  <Icon size={18} aria-hidden className="shrink-0" />
                  <span className={slim ? 'sr-only' : 'truncate'}>{label}</span>
                  {isActive && !slim && <span aria-hidden className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-a-accent-rail" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-a-side-2 pt-4">
          <ThemeSwitch value={look.theme} onChange={look.setTheme} vertical={slim} />
          {fullAdmin !== null && (
            <Link to={fullAdmin} data-tip={slim ? t('workspace.shell.full_admin', 'Full admin') : undefined}
              className={`relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text ${slim ? 'justify-center' : ''}`}>
              <LayoutGrid size={16} aria-hidden className="shrink-0" /><span className={slim ? 'sr-only' : ''}>{t('workspace.shell.full_admin', 'Full admin')}</span>
            </Link>
          )}
          {!slim && <div className="px-1">{language('w-full rounded-lg bg-a-side-2 text-a-side-text text-sm px-2 py-1.5 border border-a-side-2')}</div>}
          {/* Slim: a globe with the real picker laid over it, transparent. The select keeps its "Language" name and opens on click and on the keyboard; its own focus ring is invisible at zero opacity, so the wrapper draws one. The opened list is drawn from the select's own colours, not the wrapper's, hence the explicit bg and text. */}
          {slim && (
            <div data-tip={t('workspace.shell.language', 'Language')}
              className="relative flex min-h-10 items-center justify-center rounded-xl text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-a-side-text">
              <Globe size={16} aria-hidden />
              {language('absolute inset-0 h-full w-full cursor-pointer opacity-0 bg-a-side-2 text-a-side-text')}
            </div>
          )}
          <div className={`flex items-center gap-2 px-1 ${slim ? 'justify-center' : ''}`}>
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-a-side-2 text-xs font-semibold">{firstLetter(person, '')}</span>
            <span className={slim ? 'sr-only' : 'min-w-0 flex-1 truncate text-xs text-a-side-text-2'}>{person}</span>
            {!slim && (
              <button type="button" onClick={signOut} className="rounded-lg p-2 text-a-side-text-2 hover:text-a-side-text" aria-label={t('workspace.shell.sign_out', 'Sign out')}>
                <LogOut size={16} aria-hidden />
              </button>
            )}
          </div>
          {slim && (
            <button type="button" onClick={signOut} data-tip={t('workspace.shell.sign_out', 'Sign out')}
              className="relative flex min-h-10 w-full items-center justify-center rounded-xl text-a-side-text-2 hover:bg-a-side-2/60 hover:text-a-side-text">
              <LogOut size={16} aria-hidden /><span className="sr-only">{t('workspace.shell.sign_out', 'Sign out')}</span>
            </button>
          )}
          <button type="button" onClick={() => look.setRail(slim ? 'full' : 'slim')} aria-expanded={!slim}
            data-tip={slim ? t('workspace.shell.expand', 'Expand menu') : undefined}
            className={`relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text ${slim ? 'justify-center' : ''}`}>
            {slim ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
            <span className={slim ? 'sr-only' : ''}>{slim ? t('workspace.shell.expand', 'Expand menu') : t('workspace.shell.collapse', 'Collapse menu')}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 lg:px-6 bg-a-canvas border-b border-a-border">
          <nav className="flex lg:hidden items-center gap-1" aria-label={t('workspace.shell.menu', 'Menu')}>
            {nav.map(({ to, end, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={end} aria-label={label}
                className={({ isActive }) => `rounded-lg p-2 ${isActive ? 'bg-a-surface-2 text-a-text' : 'text-a-text-2'}`}>
                <Icon size={18} aria-hidden />
              </NavLink>
            ))}
          </nav>
          {header}
          {/* Below the width of the rail, what the rail's secondary area holds lives here. */}
          <details className="relative lg:hidden">
            <summary className="list-none cursor-pointer rounded-lg p-2 text-a-text-2 hover:text-a-text [&::-webkit-details-marker]:hidden" aria-label={t('workspace.shell.menu', 'Menu')}>
              <Menu size={18} aria-hidden />
            </summary>
            <div className="absolute right-0 top-full z-40 mt-2 w-56 animate-a-pop space-y-1 rounded-lg border border-a-border bg-a-surface p-2 shadow-lg">
              <div className="px-2 py-1 text-xs text-a-text-2 break-words">{person}</div>
              <div className="px-1 pb-1"><ThemeSwitch value={look.theme} onChange={look.setTheme} tone="surface" /></div>
              {fullAdmin !== null && (
                <Link to={fullAdmin} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-a-text hover:bg-a-surface-2">
                  <LayoutGrid size={16} aria-hidden /> {t('workspace.shell.full_admin', 'Full admin')}
                </Link>
              )}
              <div className="px-2 py-1">
                {language('w-full rounded-md border border-a-border bg-a-surface px-2 py-1.5 text-sm text-a-text')}
              </div>
              <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-a-text hover:bg-a-surface-2">
                <LogOut size={16} aria-hidden /> {t('workspace.shell.sign_out', 'Sign out')}
              </button>
            </div>
          </details>
        </header>
        {children}
      </div>
      {overlays}
    </div>
  )
}
```

- [ ] **Step 4: Rewrite** `frontend/src/appointments/AppointmentsShell.tsx` on the frame (Write tool):

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus, Search, Settings2, TrendingUp, Users, Wallet } from 'lucide-react'
import { WorkspaceShell, type WorkspaceNavItem } from '../workspace/WorkspaceShell'
import { firstLetter } from '../workspace/lib/firstLetter'
import { useMedia } from '../workspace/lib/useMedia'
import { accentTokens } from '../workspace/theme/accent'
import { Button } from '../workspace/ui/Button'
import { Notice } from '../workspace/ui/Notice'
import { useAppointments } from './AppointmentsProvider'
import { FindDialog } from './find/FindDialog'
import { findActions, type FindTarget } from './find/findResults'
import { failureOf } from './lib/api'
import { APP_NAME } from './lib/constants'
import { fullAdminPathFor } from './lib/landing'
import { loadBrand, rememberBrand, useLook } from './lib/look'
import { onShortcuts } from './lib/shortcuts'
import { useAppointmentsOnly } from './lib/useAppointmentsOnly'
import { useVocab } from './lib/vocab'
import { ChecklistBanner } from './setup/Checklist'
import { AppointmentsShortcuts } from './ui/AppointmentsShortcuts'

/**
 * The Appointments workspace on the shared frame (WorkspaceShell): its daily
 * areas in the side panel, with the organisation's brand colour as the
 * accent; in the top bar the organisation, Find (clients, appointments and
 * actions in one box) and New appointment; and the notices that explain why
 * something is not available. Nothing here links into the full admin except
 * the frame's one "Full admin" entry, and not even that on the Appointments
 * plan, which has no full admin.
 */
export function AppointmentsShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data, isLoading, isError, error, refetch } = useAppointments()
  const appointmentsOnly = useAppointmentsOnly()
  const [findOpen, setFindOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // The side panel, and with it "collapse the menu", exists from 1024 px (lg).
  const wide = useMedia('(min-width: 1024px)')
  const main = useRef<HTMLElement>(null)
  const findButton = useRef<HTMLButtonElement>(null)
  const arrived = useRef(false)

  // The link that led to a page is gone with the page it was on. Without
  // this the keyboard would start again from the top of the document.
  useEffect(() => {
    if (!arrived.current) { arrived.current = true; return }
    if (document.activeElement === document.body) main.current?.focus()
  }, [pathname])

  // Hooks stay above the early return below so their order never changes.
  const look = useLook()
  const slim = look.rail === 'slim'
  // While the bootstrap loads, the frame wears the accent and mark this device last saw (lib/look.ts) rather than the fallback blue and an H.
  const [remembered] = useState(loadBrand)
  const accent = accentTokens(data ? data.accent : remembered?.accent, look.resolved)
  const initial = data ? firstLetter(data.organization.name, 'H') : (remembered?.initial ?? 'H')
  const known = Boolean(data)
  const brandHex = accent.accent
  useEffect(() => { if (known) rememberBrand({ accent: brandHex, initial }) }, [known, brandHex, initial])

  const refusal = isError ? failureOf(error).code : ''
  const switchedOff = refusal === 'workspace_disabled'
  // The organisation's subscription is not active: nothing here can load, before or after the page was open.
  const lapsed = refusal === 'subscription_required'
  const stopped = switchedOff || lapsed
  // Find needs the workspace: not while it loads, and not once it has stopped. A box left open by a stop closes.
  const ready = Boolean(data) && !stopped
  if (findOpen && !ready) setFindOpen(false)
  if (helpOpen && !ready) setHelpOpen(false)

  // Shortcuts (spec §5.2) that belong to every page: Find, the list of shortcuts, a new appointment. The ones for the calendar
  // (today, the days, the views) are heard by the calendar page itself. None of them act while the workspace loads or has stopped.
  useEffect(() => {
    if (!ready) return
    return onShortcuts(window, document, (hit, e) => {
      if (hit === 'find') setFindOpen(true)
      else if (hit === 'help') setHelpOpen(true)
      else if (hit === 'new') navigate('/appointments?new=1')
      else return
      e.preventDefault()
    })
  }, [ready, navigate])

  // An organisation that never had the workspace: the route is not for them.
  if (switchedOff && !data) return <Navigate to="/" replace />

  const nav: WorkspaceNavItem[] = [
    { to: '/appointments', end: true, icon: CalendarDays, label: t('appointments.nav.calendar', 'Calendar') },
    { to: '/appointments/clients', end: false, icon: Users, label: vocab('clients') },
    ...(data?.staff.can_manage ? [
      { to: '/appointments/takings', end: false, icon: Wallet, label: t('appointments.nav.takings', 'Takings') },
      { to: '/appointments/insights', end: false, icon: TrendingUp, label: t('appointments.nav.insights', 'Insights') },
    ] : []),
    { to: '/appointments/setup', end: false, icon: Settings2, label: t('appointments.nav.setup', 'Setup') },
  ]

  // Find: what it can do (the pages are the ones this person sees above), and what each choice does.
  const findLabel = t('appointments.find.open', 'Find a client, appointment or action')
  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl'
  const findList = findActions({
    nav, canManage: Boolean(data?.staff.can_manage), wide, dark: look.resolved === 'dark', slim,
    words: {
      newAppointment: t('appointments.shell.new_appointment', 'New appointment'),
      goTo: t('appointments.find.go_to', 'Go to'),
      timeOff: t('appointments.find.time_off', 'Time off'),
      toDark: t('appointments.find.theme_dark', 'Switch to dark'),
      toLight: t('appointments.find.theme_light', 'Switch to light'),
      collapse: t('appointments.shell.collapse', 'Collapse menu'),
      expand: t('appointments.shell.expand', 'Expand menu'),
      shortcuts: t('appointments.find.shortcuts', 'Keyboard shortcuts'),
    },
  })
  const runFind = (target: FindTarget) => {
    if ('to' in target) navigate(target.to)
    else if (target.run === 'theme') look.setTheme(look.resolved === 'dark' ? 'light' : 'dark')
    else if (target.run === 'rail') look.setRail(slim ? 'full' : 'slim')
    else if (target.run === 'shortcuts') setHelpOpen(true)
  }

  return (
    <WorkspaceShell workspace="appointments" look={look} accent={accent} initial={initial}
      organization={data?.organization.name} product={data?.name ?? APP_NAME} person={data?.staff.name}
      nav={nav}
      // "Full admin" opens the same tool there (the calendar, the client list); anything else, the dashboard. None on the Appointments plan.
      fullAdmin={appointmentsOnly ? null : fullAdminPathFor(pathname)}
      header={<>
        <div className="hidden md:block min-w-0">
          <div className="text-sm font-semibold truncate">{data?.organization.name}</div>
          {data?.brand && data.brand.name !== data.organization.name && <div className="text-xs text-a-text-2 truncate">{data.brand.name}</div>}
        </div>
        {/* Find opens the one box for clients, appointments and actions. On a phone it keeps only its icon (and its name, for a screen reader). */}
        <button ref={findButton} type="button" onClick={() => { if (ready) setFindOpen(true) }} disabled={!ready} aria-label={findLabel} aria-haspopup="dialog"
          className="flex min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-a-border bg-a-surface p-2 text-left text-sm text-a-text-2 shadow-a-sm enabled:hover:border-a-text-2/40 disabled:opacity-60 sm:max-w-md sm:flex-1 sm:shrink sm:justify-start sm:px-3 lg:ml-4">
          <Search size={15} aria-hidden className="shrink-0" />
          <span className="hidden sm:inline min-w-0 truncate">{findLabel}</span>
          <kbd className="ml-auto hidden sm:inline shrink-0 rounded-md border border-a-border px-1.5 font-a-mono text-xs">{modKey} K</kbd>
        </button>
        {/* On a phone the header holds three areas, Find and the menu: the button keeps only its icon. */}
        <Link to="/appointments?new=1" aria-label={t('appointments.shell.new_appointment', 'New appointment')}
          className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full bg-a-accent px-3 sm:px-4 py-2 text-sm font-semibold text-a-accent-ink shadow-a-sm transition hover:bg-a-accent-deep [@media(hover:hover)]:hover:-translate-y-px whitespace-nowrap">
          <Plus size={16} aria-hidden /><span className="hidden sm:inline">{t('appointments.shell.new_appointment', 'New appointment')}</span>
        </Link>
      </>}
      overlays={<>
        {ready && <FindDialog open={findOpen} onClose={() => setFindOpen(false)} onRun={runFind} actions={findList} fallbackFocus={[findButton, main]} />}
        {ready && <AppointmentsShortcuts open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} fallbackFocus={[findButton, main]} />}
      </>}>
      {stopped && (
        <div className="p-6 max-w-xl space-y-3">
          <Notice tone="warning">
            {lapsed
              ? (appointmentsOnly
                ? t('appointments.shell.subscription_required_plan', 'Your organisation\'s subscription is not active, so the workspace cannot open. Your bookings are unchanged. Contact HexaTech to restore it.')
                : t('appointments.shell.subscription_required', 'Your organisation\'s subscription is not active, so the workspace cannot open. Your bookings are unchanged. An administrator can restore access under Billing in the full admin.'))
              : t('appointments.shell.switched_off', 'The appointments workspace has been switched off for your organisation. Your bookings are unchanged and remain in the full admin.')}
          </Notice>
          {!appointmentsOnly && (
            <Link to="/" className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
              {t('appointments.shell.open_full_admin', 'Open the full admin')}
            </Link>
          )}
        </div>
      )}

      {!stopped && isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}

      {!stopped && isError && !data && (
        <div className="p-6 max-w-xl space-y-3">
          <Notice tone="danger">{t('appointments.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={refetch}>{t('appointments.common.retry', 'Try again')}</Button>
        </div>
      )}

      {!stopped && data && (
        <>
          {!data.readiness.checklist.complete && !pathname.startsWith('/appointments/setup') && (
            <div className="px-4 pt-3">
              <ChecklistBanner checklist={data.readiness.checklist} />
            </div>
          )}
          <main ref={main} tabIndex={-1} className="flex-1 min-h-0">{children}</main>
        </>
      )}
    </WorkspaceShell>
  )
}
```

- [ ] **Step 5: Point the mark test at the frame**: in `frontend/src/workspace/lib/shellMark.test.ts`, replace the whole test `it('is set by the shell before the first paint…', …)` with:

```ts
  it('is set by the frame before the first paint and undone when it unmounts (as the full admin Layout does)', () => {
    // A static render runs no effects, so the wiring is read from the source.
    const frame = readFileSync(new URL('../WorkspaceShell.tsx', import.meta.url), 'utf8')
    expect(frame).toContain('useLayoutEffect(() => markShell(document.documentElement, workspace), [workspace])')
    // Appointments no longer marks <html> itself: the frame does, with its name.
    const shell = readFileSync(new URL('../../appointments/AppointmentsShell.tsx', import.meta.url), 'utf8')
    expect(shell).not.toContain('markShell')
    expect(shell).toContain('workspace="appointments"')
  })
```

- [ ] **Step 6: Run the tests**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
npx tsc -b && npx vitest run src/workspace src/appointments src/i18n src/theme src/components
git diff --numstat de20fc3a0 -- src/appointments/AppointmentsShell.test.tsx
```
Expected: all PASS. The `numstat` line reads `1	0	…AppointmentsShell.test.tsx`: the shell's test differs from `origin/main` only by the Task 1 `data-workspace` line.

- [ ] **Step 7: Full run, lint and commit**

```bash
npx vitest run > ../.superpowers/sdd/2026-10-14-content-workspace-r1/task6-vitest.txt 2>&1
grep -E '^ FAIL ' ../.superpowers/sdd/2026-10-14-content-workspace-r1/task6-vitest.txt | sort -u | diff - ../.superpowers/sdd/2026-10-14-content-workspace-r1/baseline-failures.txt && echo "failures = baseline"
npx eslint src/workspace src/appointments src/theme src/components/switchKnobs.test.ts src/i18n/localeCompleteness.test.ts; echo "eslint exit $?"
cd .. && git add -A frontend/src && git commit -q -F - <<'EOF'
Workspace core: the side-panel frame, WorkspaceShell

The ink side panel, the top bar's frame, the phone menu, the token-scope
root and the <html> mark are now one frame every workspace fills with its
own areas, header and overlays. AppointmentsShell keeps its bootstrap,
Find, shortcuts and notices and draws the same page as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```
Expected: `failures = baseline`. eslint reports no problem that is not in `$R1/baseline-eslint.txt`.

---

### Task 7: Prove nothing changed, and write it down

**Files:**
- Create: `$R1/tools/pixels.mjs`, `$R1/tools/package.json` (by npm, untracked)
- Modify: `docs/appointments-workspace.md` (new section, plus a deploy bullet)
- Temporary, undone in this task: a base worktree `C:\wamp64\www\Hexa-Tech-content-base`, local servers on 8012/5173, local migrations listed in Step 4.

**Interfaces:**
- Consumes the whole branch.
- Produces:
  - `$R1/shots/{base,new,diff}/*.png`
  - `$R1/pixels-compare.txt`
  - `$R1/keys-base.txt`, `$R1/keys-new.txt`
  - `$R1/build-check.txt`
  - `$R1/db-changes.md`

- [ ] **Step 1: Whole suites**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
R1=../.superpowers/sdd/2026-10-14-content-workspace-r1
npx tsc -b; echo "tsc exit $?"
npx vitest run > $R1/final-vitest.txt 2>&1; tail -5 $R1/final-vitest.txt
grep -E '^ FAIL ' $R1/final-vitest.txt | sort -u | diff - $R1/baseline-failures.txt && echo "failures = baseline"
```

- [ ] **Step 2: Build check** (development mode, into `$R1`, so no tracked build file changes)

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
R1=../.superpowers/sdd/2026-10-14-content-workspace-r1
npx vite build --mode development --outDir $R1/build --emptyOutDir > $R1/build-log.txt 2>&1; echo "build exit $?"
{
  echo "AppointmentsApp chunks: $(ls $R1/build/assets | grep -c '^AppointmentsApp-.*\.js$')"
  echo "index chunks holding data-workspace or data-appointments: $(grep -lE 'data-workspace|data-appointments' $R1/build/assets/index-*.js | wc -l)"
  CSS=$(ls $R1/build/assets/index-*.css | head -1)
  echo "fonts referenced by the CSS: $(grep -oE '[a-z0-9-]+-(wght|500)-[A-Za-z0-9_-]+\.woff2' "$CSS" | sort -u | wc -l)"
  for f in $(grep -oE '[a-z0-9-]+-(wght|500)-[A-Za-z0-9_-]+\.woff2' "$CSS" | sort -u); do test -f $R1/build/assets/$f || echo "MISSING $f"; done
} | tee $R1/build-check.txt
cd .. && git status --short frontend/dist public/spa resources/spa-shell; git checkout -- frontend/dist/stats.html 2>/dev/null; git status --short frontend/dist
```
Expected: `AppointmentsApp chunks: 1`, `index chunks holding …: 0`, `fonts referenced by the CSS: 10`, no `MISSING`, and no tracked build file changed. If a font name pattern does not match the build's naming, list `$R1/build/assets/*.woff2` and check all ten by name instead.

- [ ] **Step 3: Tools for the browser run**

```bash
cd /c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-14-content-workspace-r1/tools
npm init -y > /dev/null && npm install --no-audit --no-fund playwright-core@1.63.0 pngjs@7.0.0 pixelmatch@7.1.0
ls "$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe"
```

Write `$R1/tools/pixels.mjs` (Write tool):

```js
// Before/after pixel comparison of the Appointments workspace, and keyboard focus checks.
// One Vite dev server at a time serves http://localhost:5173 (base worktree, then this one); the API runs on :8012.
//   DAY=YYYY-MM-DD node pixels.mjs capture base | capture new | compare | keys
// The sign-in token is minted through tinker into memory, never printed, and deleted when the run ends.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import pngjs from 'pngjs'
import pixelmatch from 'pixelmatch'

const { PNG } = pngjs

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(HERE, '../shots')
const APP = 'http://localhost:5173'
const API = 'http://127.0.0.1:8012/api'
const PHP = 'C:/wamp64/bin/php/php8.4.20/php.exe'
const BACKEND = process.env.BACKEND ?? 'C:/wamp64/www/Hexa-Tech-atelier'
const EMAIL = 'appointments-tester@example.test'
const TOKEN_NAME = 'content-r1-pixels'
const DAY = process.env.DAY
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')

const tinker = code => execFileSync(PHP, ['artisan', 'tinker', `--execute=${code}`], { cwd: BACKEND, encoding: 'utf8' })
function mintToken() {
  const out = tinker(`echo App\\Models\\User::where('email', '${EMAIL}')->firstOrFail()->createToken('${TOKEN_NAME}')->plainTextToken;`)
  const token = out.match(/\d+\|[A-Za-z0-9]{20,}/)?.[0]
  if (!token) throw new Error('no token minted: check the tester account exists in the local database')
  return token
}
const dropTokens = () => tinker(`App\\Models\\User::where('email', '${EMAIL}')->firstOrFail()->tokens()->where('name', '${TOKEN_NAME}')->delete();`)

async function session(browser, token, { theme = 'light', rail = 'full', lang = 'en', width = 1440, height = 900 } = {}) {
  const me = await (await fetch(`${API}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()
  if (!me?.id) throw new Error('auth/me did not answer with a user')
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block',
    locale: lang === 'ru' ? 'ru-RU' : 'en-GB', timezoneId: 'Europe/London',
  })
  await context.addInitScript(([t, user, look, language]) => {
    localStorage.setItem('auth_token', t)
    localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token: t, user, staff: user.staff ?? null }, version: 1 }))
    localStorage.setItem('appointments:look', look)
    localStorage.setItem('admin_lang', language)
  }, [token, me, JSON.stringify({ theme, rail }), lang])
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date(`${DAY}T10:20:00Z`))
  return { context, page }
}

async function open(page, url) {
  await page.goto(`${APP}${url}`, { timeout: 90_000 })
  await page.waitForSelector('[data-appointments]', { timeout: 90_000 })
  await settle(page)
}
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 90_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
}

function screens(targets) {
  const cal = `/appointments?date=${DAY}`
  const press = k => async page => { await page.keyboard.press(k); await settle(page) }
  const list = [
    ['day', cal, {}, press('d')],
    ['week', cal, {}, press('w')],
    ['list', cal, {}, press('l')],
    ['panel', `/appointments?open=${targets.open}&date=${DAY}`, {}, null],
    ['clients', '/appointments/clients', {}, null],
    ['profile', `/appointments/clients/${targets.client}`, {}, null],
    ['setup', '/appointments/setup', {}, null],
    ['takings', '/appointments/takings', {}, null],
    ['insights', '/appointments/insights', {}, null],
    ['find', cal, {}, async page => { await page.keyboard.press('Control+k'); await page.waitForSelector('[role="dialog"] [role="combobox"]'); await settle(page) }],
    ['find-typed', cal, {}, async page => { await page.keyboard.press('Control+k'); await page.waitForSelector('[role="dialog"] [role="combobox"]'); await page.keyboard.type('mi'); await page.waitForTimeout(800); await settle(page) }],
    ['shortcuts', cal, {}, async page => { await page.keyboard.type('?'); await page.waitForSelector('[role="dialog"][aria-modal="true"]'); await settle(page) }],
    ['slim', cal, { rail: 'slim' }, null],
    ['phone', cal, { width: 390, height: 844 }, null],
    ['phone-menu', cal, { width: 390, height: 844 }, async page => { await page.click('header details > summary'); await settle(page) }],
  ]
  const out = []
  for (const [name, url, opts, act] of list) for (const theme of ['light', 'dark']) out.push({ file: `${name}-${theme}.png`, url, opts: { ...opts, theme }, act })
  for (const name of ['day', 'find', 'shortcuts', 'phone-menu']) {
    const s = list.find(x => x[0] === name)
    out.push({ file: `${name}-ru.png`, url: s[1], opts: { ...s[2], lang: 'ru' }, act: s[3] })
  }
  return out
}

async function capture(which) {
  if (!DAY) throw new Error('set DAY=YYYY-MM-DD')
  const dir = path.join(SHOTS, which)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const targetsFile = path.join(SHOTS, 'targets.json')
  const token = mintToken()
  const browser = await chromium.launch({ executablePath: CHROME })
  try {
    let targets = fs.existsSync(targetsFile) ? JSON.parse(fs.readFileSync(targetsFile, 'utf8')) : null
    if (!targets) {
      const { context, page } = await session(browser, token)
      const answer = page.waitForResponse(r => r.url().includes('/v1/admin/appointments/calendar') && r.status() === 200, { timeout: 90_000 })
      await open(page, `/appointments?date=${DAY}`)
      const json = await (await answer).json()
      const a = (json.appointments ?? []).find(x => x.client?.id)
      if (!a) throw new Error(`no appointment with a client on ${DAY}: pick another DAY`)
      targets = { open: a.id, client: a.client.id }
      fs.writeFileSync(targetsFile, JSON.stringify(targets))
      await context.close()
    }
    for (const s of screens(targets)) {
      const { context, page } = await session(browser, token, s.opts)
      await open(page, s.url)
      if (s.act) await s.act(page)
      await page.screenshot({ path: path.join(dir, s.file), fullPage: true, animations: 'disabled', caret: 'hide' })
      console.log(`${which}: ${s.file}`)
      await context.close()
    }
  } finally {
    await browser.close()
    dropTokens()
  }
}

function compare() {
  const base = path.join(SHOTS, 'base'), next = path.join(SHOTS, 'new'), diff = path.join(SHOTS, 'diff')
  fs.rmSync(diff, { recursive: true, force: true })
  fs.mkdirSync(diff, { recursive: true })
  const names = fs.readdirSync(base).filter(n => n.endsWith('.png')).sort()
  let bad = 0
  for (const n of names) {
    const fb = path.join(base, n), fn = path.join(next, n)
    if (!fs.existsSync(fn)) { console.log(`MISSING  ${n}`); bad++; continue }
    const a = PNG.sync.read(fs.readFileSync(fb)), b = PNG.sync.read(fs.readFileSync(fn))
    if (a.width !== b.width || a.height !== b.height) { console.log(`SIZE     ${n}: ${a.width}x${a.height} vs ${b.width}x${b.height}`); bad++; continue }
    const d = new PNG({ width: a.width, height: a.height })
    const count = pixelmatch(a.data, b.data, d.data, a.width, a.height, { threshold: 0, includeAA: true })
    if (count) { fs.writeFileSync(path.join(diff, n), PNG.sync.write(d)); bad++ }
    console.log(`${count ? 'DIFF' : 'SAME'}     ${n}${count ? ` (${count} px)` : ''}`)
  }
  console.log(`${names.length} screens, ${bad} differ`)
  process.exitCode = bad ? 1 : 0
}

async function keys() {
  if (!DAY) throw new Error('set DAY=YYYY-MM-DD')
  const token = mintToken()
  const browser = await chromium.launch({ executablePath: CHROME })
  const results = []
  try {
    const { context, page } = await session(browser, token)
    await open(page, `/appointments?date=${DAY}`)
    const findButton = page.locator('header button[aria-haspopup="dialog"]')
    const onFindButton = () => page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup') === 'dialog')
    await findButton.click()
    await page.waitForSelector('[role="dialog"] [role="combobox"]')
    results.push(['Find takes the focus into its input', await page.evaluate(() => document.activeElement?.getAttribute('role') === 'combobox')])
    await page.keyboard.press('Escape')
    results.push(['Escape closes Find and hands the focus back to its button', await onFindButton()])
    await findButton.focus()
    await page.keyboard.type('?')
    await page.waitForSelector('[role="dialog"][aria-modal="true"]')
    results.push(['The list of shortcuts takes the focus to its Close button', await page.evaluate(() => document.activeElement?.tagName === 'BUTTON' && document.activeElement.closest('[role="dialog"]') !== null)])
    await page.keyboard.press('Escape')
    results.push(['Escape closes the list and hands the focus back to the Find button', await onFindButton()])
    await page.keyboard.press('Control+k')
    await page.waitForSelector('[role="dialog"] [role="combobox"]')
    await page.keyboard.type('?')
    // The list has a heading (h2) and Find has none: wait for it, then count the open modals.
    await page.waitForSelector('[role="dialog"][aria-modal="true"] h2', { timeout: 10_000 }).catch(() => null)
    results.push(['"?" in an empty Find box closes Find and opens the list of shortcuts', await page.locator('[role="dialog"][aria-modal="true"]').count().then(n => n === 1)
      && await page.locator('[role="dialog"][aria-modal="true"] h2').count().then(n => n === 1)])
    await page.keyboard.press('Escape')
    await context.close()
  } finally {
    await browser.close()
    dropTokens()
  }
  for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  process.exitCode = results.every(r => r[1]) ? 0 : 1
}

const [mode, which] = process.argv.slice(2)
if (mode === 'capture') await capture(which)
else if (mode === 'compare') compare()
else if (mode === 'keys') await keys()
else throw new Error('usage: pixels.mjs capture base|new | compare | keys')
```

- [ ] **Step 4: Rig the base tree, the backend and the data** (record every database change in `$R1/db-changes.md`)

```bash
cd /c/wamp64/www/Hexa-Tech-content
git worktree add --detach ../Hexa-Tech-content-base de20fc3a0
```
```powershell
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-portal\frontend\node_modules
```
```bash
netstat -ano | grep -E ':(8012|5173) .*LISTENING' ; echo "ports above must be empty"
cd /c/wamp64/www/Hexa-Tech-atelier
/c/wamp64/bin/php/php8.4.20/php.exe artisan migrate:status 2>/dev/null | grep -E 'Pending' | tee /c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-14-content-workspace-r1/pending-before.txt
```
- From the pending list, apply **only** those of `2026_10_05_100000_create_client_messages`, `2026_10_06_100000_create_service_booking_payments` and `2026_10_12_100000_add_color_to_service_masters_table` that it lists. Use one command with one `--path=database/migrations/<file>.php` per pending file. The panel, Takings and the calendar's team colours read them.
- Record the batch number `migrate:status` shows for them in `$R1/db-changes.md`.
- If none are pending, write "no migration applied".

Pick a day with appointments (org 16, Lumière Salon):

```bash
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo json_encode(DB::table('service_bookings')->where('organization_id', 16)->selectRaw('cast(start_at as date) as d, count(*) as n')->groupByRaw('cast(start_at as date)')->orderByDesc('n')->limit(5)->get());"
```
Choose a weekday with at least 3 appointments. Call it `DAY`.

Start the API (background, Bash `run_in_background`):

```bash
cd /c/wamp64/www/Hexa-Tech-atelier && CORS_ALLOWED_ORIGINS=http://localhost:5173 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --port=8012 --no-reload
```

- [ ] **Step 5: Capture the base, and a control run**

Start the base tree's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content-base/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```
Then:

```bash
cd /c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-14-content-workspace-r1/tools
DAY=<DAY> node pixels.mjs capture base
DAY=<DAY> node pixels.mjs capture new      # control: still the BASE server
DAY=<DAY> node pixels.mjs compare | tee ../pixels-control.txt | tail -3
DAY=<DAY> node pixels.mjs keys | tee ../keys-base.txt
```
- Expected: 34 screens (15 screens in light and dark, plus 4 in Russian), `0 differ` (the method is deterministic), and all `PASS` in `keys-base.txt`.
- If a control pair differs, the screen is not deterministic (a live clock, a poll that landed, an animation). Make the script wait or settle longer for that screen, re-run the control, and only go on at `0 differ`.
- Stop the base Vite (TaskStop). Then confirm nothing listens on 5173 (`netstat -ano | grep ':5173 .*LISTENING'`). If a node PID remains, check its command line names `Hexa-Tech-content-base` (PowerShell `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select CommandLine`), then `taskkill //PID <pid> //F`.

- [ ] **Step 6: Capture the branch**

Start this worktree's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```
```bash
cd /c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-14-content-workspace-r1/tools
DAY=<DAY> node pixels.mjs capture new
DAY=<DAY> node pixels.mjs keys | tee ../keys-new.txt
```
Expected: 34 captures; all `PASS` in `keys-new.txt`.

- [ ] **Step 7: Compare**

```bash
DAY=<DAY> node pixels.mjs compare | tee ../pixels-compare.txt | tail -5
```
- Expected: `34 screens, 0 differ`.
- For any `DIFF`: open `shots/base/<name>`, `shots/new/<name>` and `shots/diff/<name>` with the Read tool, and find the cause. It will be a rule order, a class or an element order that differs from base. Fix it in the file of the task that introduced it, re-run that task's tests and this step, and commit the fix separately (`Workspace core: <what> draws as before`).
- Do not accept a difference as "close enough": the bar is zero.

- [ ] **Step 8: Look with your eyes**: open these with the Read tool and confirm each is a real, loaded screen (not a sign-in page, an error notice or an empty calendar):
  - `shots/new/day-light.png`
  - `shots/new/panel-dark.png`
  - `shots/new/find-typed-light.png`
  - `shots/new/shortcuts-ru.png`
  - `shots/new/phone-menu-dark.png`
  - `shots/new/slim-light.png`

  Write one line per screen in `$R1/eyes.md`. If any is not a real screen, the comparison proved nothing for it: fix the script or the data, then redo Steps 5 to 7.

- [ ] **Step 9: Undo everything temporary**

```bash
# servers: TaskStop the API and the branch Vite, then check
netstat -ano | grep -E ':(8012|5173) .*LISTENING' ; echo "must be empty"
cd /c/wamp64/www/Hexa-Tech-atelier
# only if Step 4 applied migrations: roll back exactly that batch. First check that `migrate:status` shows the newest
# batch number holding only the files Step 4 applied. Plain `migrate:rollback` undoes the last batch; `--step=N` would
# count migrations, not batches.
/c/wamp64/bin/php/php8.4.20/php.exe artisan migrate:rollback
/c/wamp64/bin/php/php8.4.20/php.exe artisan migrate:status 2>/dev/null | grep -E 'Pending' | diff - /c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-14-content-workspace-r1/pending-before.txt && echo "pending list as found"
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo App\Models\User::where('email','appointments-tester@example.test')->first()->tokens()->where('name','content-r1-pixels')->count();"
```
```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules
```
```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove ../Hexa-Tech-content-base && git worktree list | grep -c content-base
```
Expected: no listeners; `pending list as found`; token count `0`; worktree count `0`. Write each undo into `$R1/db-changes.md`.

- [ ] **Step 10: Write it down**: in `docs/appointments-workspace.md`, insert this section directly above `## Deploying it`:

```markdown
## The shared workspace core (HexaTech Content, release 1)

The generic parts of this workspace live in `frontend/src/workspace/`, so HexaTech Content (`/content`) can be built on
the same frame. They are:

- the Atelier stylesheet and fonts (`workspace/theme/workspace.css`, tokens under `[data-workspace]`)
- the accent maths
- the look: the per-device keys stay `appointments:look` and `appointments:brand`
- the `<html data-shell>` mark
- the shortcut engine
- the focus hand-back
- the venue clock
- the UI pieces
- the list of shortcuts
- Find's frame
- the side-panel frame, `WorkspaceShell`

Appointments keeps its own rules (`appointments.css`, `[data-appointments]`), its own words, and two binding modules
(`lib/look.ts`, `lib/shortcuts.ts`) that set its keys on the shared engines. The shared words are in
`workspace/i18n/workspace.*.json`, read as `workspace.*`. The Appointments bundles still hold copies of them, which no
code reads.

Rules the code keeps:

- `workspace/` never imports from a workspace folder, calls no API, and uses only `a-*` classes
  (`workspace/tokens.test.ts`).
- The admin sweeps skip one list of folders (`theme/ownTokenDirs.ts`).

How it was checked: a before/after pixel comparison of every Appointments screen against `origin/main`. That covered
light and dark, 1440 and 390 px, the slim rail, Russian, Find and the list of shortcuts, and showed 0 differing pixels.
Keyboard focus hand-back was checked in a real browser. The records are in the plan's ledger.
```

In the `## Deploying it` list, add after the `(Atelier release 2)` bullet:

```markdown
- (Content release 1) no migration and no PHP: the workspace's code moves into `frontend/src/workspace/`; nothing
  anyone sees changes, and per-device choices are kept.
```

- [ ] **Step 11: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content
git add docs/appointments-workspace.md && git commit -q -F - <<'EOF'
Document the shared workspace core and how release 1 was proved invisible

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 8: Release 1 to production (only after the owner says "yes, deploy")

**Files:** none on the feature branch. Work happens in a deploy worktree `C:\wamp64\www\Hexa-Tech-deploy-content-r1` on branch `deploy/content-r1`.

**Interfaces:**
- Consumes the feature tip.
- Produces `origin/main` = previous main + the source patch + the SPA build.

- [ ] **Step 1: Ask, and stop.** Tell the owner in a few lines what ships (no visible change, no migration, no PHP) and what was proved (the suites, the 0-pixel comparison, keyboard checks). Ask: "Release 1 is ready — deploy now?". **Do nothing further until the answer is yes.**

- [ ] **Step 2: Deploy worktree from the newest main**

```bash
cd /c/wamp64/www/Hexa-Tech
git fetch origin
TIP=$(git -C ../Hexa-Tech-content rev-parse feature/content-workspace); echo "$TIP"
git worktree add ../Hexa-Tech-deploy-content-r1 -B deploy/content-r1 origin/main
```
```powershell
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-deploy-content-r1\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-portal\frontend\node_modules
```

- [ ] **Step 3: The file list, guarded**

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r1
L=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-14-content-workspace-r1/deploy-files.txt
git diff --no-renames --name-status de20fc3a0 "$TIP" > "$L"; wc -l "$L"
grep -vE '^[AMD]\s+(frontend/src/|frontend/tailwind\.config\.js$|docs/)' "$L" && echo "STOP: a path outside the release-1 scope"
cut -f2 "$L" | xargs git diff --name-only de20fc3a0 origin/main -- | grep . && echo "STOP: main changed a file of this release since de20fc3a0 — merge by hand"
```
Expected: neither `STOP` line prints. If one does, stop and report to the owner.

- [ ] **Step 4: Apply (deletions with `git rm`), check parity, commit**

```bash
grep -E '^[AM]' "$L" | cut -f2 | xargs git checkout "$TIP" --
grep -E '^D' "$L" | cut -f2 | xargs -r git rm -q --
git diff --cached --stat | tail -1
git diff --cached "$TIP" -- $(cut -f2 "$L") | head -5; echo "(parity: nothing above)"
git commit -q -F - <<'EOF'
HexaTech Content release 1: the shared workspace core (no visible change)

Source patch from feature/content-workspace: the Atelier stylesheet, fonts,
accent, look, shortcut engine, UI pieces, Find's frame, the list of
shortcuts and the side-panel frame move from src/appointments to
src/workspace; Appointments runs on them unchanged (0 differing pixels on
every screen against main). No migration, no PHP.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: Tests on the artifact, build, commit the build.** The patch holds no PHP (Step 3's guard), so the PHP suites are not run, as with earlier frontend-only deploys.

```bash
R1=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-14-content-workspace-r1
cd frontend && npx tsc -b && npx vitest run > $R1/artifact-vitest.txt 2>&1; tail -5 $R1/artifact-vitest.txt
grep -E '^ FAIL ' $R1/artifact-vitest.txt | sort -u | diff - $R1/baseline-failures.txt && echo "failures = baseline"
npm run build > /dev/null 2>&1; echo "build exit $?"
cd .. && git add frontend/dist public/spa resources/spa-shell && git commit -q -m "Rebuild the admin SPA for the shared workspace core

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -3
```
Expected: `failures = baseline` (if main gained new known failures since the baseline, compare against a fresh `origin/main` run before going on), and `build exit 0`.

- [ ] **Step 6: Push**

```bash
OLD=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "$OLD"
git push origin deploy/content-r1:main
```

- [ ] **Step 7: Wait for Cloud to rebuild.** It takes about 140 s. Use Monitor with this until-loop rather than a sleep:

```bash
until NEW=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); [ -n "$NEW" ] && [ "$NEW" != "$OLD" ]; do sleep 15; done; echo "live: $NEW"
```

- [ ] **Step 8: Verify by content.** Cloud rebuilds the SPA, so file names differ from the local build.

```bash
APP=https://app.hexa-tech.uk
IDX=$(curl -s $APP/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
CHUNK=$(curl -s $APP$IDX | grep -o 'AppointmentsApp-[A-Za-z0-9_-]*\.js' | head -1); echo "$CHUNK"
echo "chunk has the frame's words: $(curl -s $APP/spa/assets/$CHUNK | grep -c 'workspace.shell.full_admin')"
echo "admin bundle free of the workspace: $(curl -s $APP$IDX | grep -c 'data-workspace')"
CSS=$(curl -s $APP/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.css' | head -1)
echo "CSS carries the core scope: $(curl -s $APP$CSS | grep -c '\[data-workspace\]')"
FONT=$(curl -s $APP$CSS | grep -o 'fraunces-latin-wght[A-Za-z0-9_-]*\.woff2' | head -1)
echo "font $FONT: $(curl -s $APP/spa/assets/$FONT | head -c 4)"
curl -s -o /dev/null -w "appointments page %{http_code}\n" $APP/appointments
```
- Expected:
  - the chunk has the frame's words: ≥ 1
  - the admin bundle is free of the workspace: `0`
  - the CSS carries the core scope: ≥ 1
  - the font starts `wOF2`
  - the appointments page answers `200`
- If `workspace.shell.full_admin` is not in `AppointmentsApp-*.js`, grep the chunks it imports (`grep -o '[A-Za-z]*-[A-Za-z0-9_-]*\.js'` in it) before calling it missing.

- [ ] **Step 9: Clean up and record**

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-deploy-content-r1\frontend\node_modules
```
```bash
cd /c/wamp64/www/Hexa-Tech && git worktree remove ../Hexa-Tech-deploy-content-r1 && git worktree list | grep -c deploy-content-r1
git log --oneline -1 origin/main
```
- Keep the branch `deploy/content-r1`.
- Record the production main hash, the push time and the verification output in `$R1/progress.md`.
- Tell the owner: release 1 is live; open `/appointments` once, and expect nothing to look different.
- Release 2 (HexaTech Content itself) gets its own plan next.
