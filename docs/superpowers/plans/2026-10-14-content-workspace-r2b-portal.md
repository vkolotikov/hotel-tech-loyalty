# HexaTech Content — Release 2, Plan B: the Portal's Daily Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give HexaTech Content its portal at `/content`, so staff can plan and write posts on a week calendar:
- the Atelier frame;
- the Plan (week, month and list; This week strip; empty slots with Write and Fill with AI; the Unscheduled tray; drag and Shift+arrow moves with Undo; Generate for managers);
- the post panel (fields, save with the stale check, AI tools, actions);
- Find and the shortcut sheet;
- five languages throughout.

**Architecture:**
- **Where it lives.** A lazily loaded app in `frontend/src/content/`, mounted at `/content/*` beside `/appointments/*`. It sits on the shared workspace core (`src/workspace/`: frame, look, shortcuts engine, Find frame, wall clock, UI pieces).
- **Server.** It talks only to the `/v1/admin/content/*` API that Plan A built.
- **Brand.** Every call names the one brand the portal works on (in its address, so the full admin's request hook leaves it alone).
- **Panel.** The post panel is app-level state: it stays open across pages, and everything that would drop an unsaved edit asks first.
- **Testing.** Logic lives in small pure modules with node tests. Components are proved by static-render tests, the way Appointments is tested.

**Tech Stack:**
- React 19, TypeScript 5.9, Vite 5.
- React Router 7 (`BrowserRouter`), TanStack Query 5, react-i18next 17.
- Tailwind 3 with the Atelier `a-*` tokens.
- lucide-react icons; vitest 2 (node environment, `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-10-14-content-workspace-design.md`. This plan covers:
- §4.1–§4.3 and §4.7 (rail, Plan, panel, header, Find, shortcuts)
- §5.1 in the screens (managers' buttons)
- §5.2's notices
- §6.1's mood-typography exclusion
- §6.2 (except the Posts, Strategy and Brand pages)
- §6.7 (brand choice and switcher)
- §6.8 (time on the venue's clock)
- §8 (words, refusals, accessibility)
- the portal half of §9

Later plans:
- **Plan C:** the Posts, Strategy and Brand pages (§4.4–§4.6).
- **Plan D:** the way in from the full admin, the retirements, the remaining release-1 minors and the deploy.

All of release 2 ships in one deploy at the end of Plan D, after the owner's "yes, deploy".

**Plan A's server (built, on this branch):**
- `GET bootstrap`.
- Plan and posts:
  - `GET plan?from&to`, `GET find?q`;
  - `POST posts`, `GET/PUT/DELETE posts/{id}`;
  - `POST posts/{id}/move|duplicate|mark-ready|mark-published|write|rewrite|quality|visual-brief|image`.
- Generation: `POST slots/fill`, `POST generate`.
- Strategy and brand: `GET strategies`, `GET strategies/{id}`, `GET brand`.
- Refusal codes: listed in `docs/content-workspace.md`. A brand a restricted member may not use answers 403 with `code: brand_not_allowed` (and `error`/`message` = a sentence).
- `brand_id` is read from the **query string only**.

## Global Constraints

- **Branch:**
  - Worktree `C:\wamp64\www\Hexa-Tech-content`, branch `feature/content-workspace` (Plan A's tip `cc21007f1`).
  - Upstream unset: never push.
  - Never commit `frontend/dist`, `public/spa` or `resources/spa-shell`.
- **Ledger and tools:**
  - `.superpowers/sdd/2026-10-14-content-workspace-r2b-portal/`, called `$R2B` below.
  - This is exactly the directory `sdd-workspace` prints for this plan file.
- **Frontend commands** (Git Bash):
  - Types: `cd frontend && npx tsc -b`.
  - Tests: `$R2B/vt.sh <paths…>` (vitest, colours stripped, exit code kept).
  - Lint: `cd frontend && npx eslint src/content src/workspace src/App.tsx`.
- **Baseline** (recorded in Task 1):
  - The full vitest run has exactly 3 failing tests, all in `src/lib/plannerMeta.test.ts`.
  - `npx eslint .` has exactly 1 error, in `src/theme/tailwindTokens.test.ts`.
  - Anything beyond these is ours to fix.
- **Portal rules** (enforced by `src/content/tokens.test.ts` from Task 1):
  - Only Atelier `a-*` colour classes and the `c-*` classes `theme/content.css` defines.
  - Every API path is `/v1/admin/content/…`.
  - Nothing is imported from `src/appointments/`.
  - No text under 12 px; a hover lift only as `[@media(hover:hover)]:hover:-translate-y-px`.
  - Accent lines and text use `-a-accent-text`; only fills use `bg-a-accent`, as `workspace/theme/contrast.test.ts` enforces.
- **Words:**
  - Every visible word comes through `t('content.…', 'English fallback')`.
  - Every key exists in all five bundles `src/content/i18n/content.{en,ru,de,fr,es}.json`, with the same key set and no empty value.
  - A refusal is shown in the portal's own words per code (`lib/errors.ts`), never the server's message.
- **React lint (eslint-plugin-react-hooks 7):**
  - No synchronous `setState` inside an effect; adjust state while rendering, or set it from a callback, timer or promise.
  - No reading `ref.current` while rendering.
  - No component defined inside another component.
  - Contexts and hooks that live beside a component carry `// eslint-disable-next-line react-refresh/only-export-components`, as `AppointmentsProvider` does.
- **Time:**
  - "Today" and the shown week come from the venue's clock: `boot.venue.today` (the server's) or `venueNow(boot.venue.timezone)` inside an event handler.
  - Never the browser's zone, and never `new Date()` while rendering.
- **Server:** no PHP change. If the portal finds a server bug, add a failing PHP test and the fix in the same task, and write a `Ruling:` line in the ledger.
- **Escapes:** write no `\u` escape sequences through the Write/Edit tools, and no shell `printf` with backslashes (it turned `\E` into ESC in Plan A). Write files with the Write/Edit tools.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A card dropped from a stale copy.** Another device moved or changed the post, or it was deleted.
   - Expected: the move is refused, the portal says so in its own words, and the plan is read again. Nothing moves twice, and Undo never acts on a refused move.
   - Pinned by Task 5's `moveMath.test.ts` (`movePost` turns a 409 into `changed_elsewhere`; `refetchAfter` asks for a new read) and Task 6's `PlanPage` wiring.
2. **Unsaved edits about to be lost:** closing the panel, opening another post, switching brand, or leaving the site; and a save from a copy someone else changed.
   - Expected: the portal asks first, and a refused save offers "Load their version" instead of silently overwriting.
   - Pinned by Task 2's `mayDrop` test, Task 7's `panelState.test.ts` (dirty detection, changed fields only) and the conflict branch in `PostPanel`.
3. **The venue's "today" when this computer's clock or zone is different.**
   - Expected: the Plan opens on the venue's week, and today is highlighted by the venue's date.
   - Pinned by Task 6's `PlanPage.test.tsx` "opens on the venue's week even when this computer's clock is days out".
4. **A phone (390 px), and the first paint before the width is known.**
   - Expected: the Plan is the list (no seven crushed columns); the brand switcher stays reachable; the panel takes the full width.
   - Pinned by Task 6's "below 1024 px the Plan is the list" (static rendering has no width, so it is the narrow case) and Task 2's shell test that the switcher is outside the `md:` block.
5. **A brand this device remembers that the person may no longer use.** This covers a staff member re-assigned to another brand, and a brand deleted since.
   - Expected: the portal forgets it and opens on the person's default brand, never a dead end.
   - Pinned by Task 1's `loadBootstrap` tests (a `brand_not_allowed` refusal is retried without a brand, and the stored brand is forgotten; any other refusal passes through).

---

## File map

```
frontend/src/content/
  ContentApp.tsx                 routes under /content/*, guard, word registration          (Task 2, 6, 7)
  ContentProvider.tsx            bootstrap per brand, useBoot/useApi/useBrandId, switchBrand (Task 2)
  ContentShell.tsx               the frame: header, notices, Find/shortcuts/panel overlays   (Task 2, 7, 9)
  lib/constants.ts types.ts api.ts brand.ts links.ts look.ts shortcuts.ts platforms.ts
      postText.ts errors.ts languages.ts                                                       (Task 1, 7)
  i18n/index.ts content.{en,ru,de,fr,es}.json contentLocales.test.ts                          (Task 1)
  theme/content.css contentCss.test.ts                                                         (Task 2)
  tokens.test.ts                                                                               (Task 1)
  ui/PlatformMark.tsx StatusDot.tsx Dialog.tsx ContentShortcuts.tsx                            (Task 4, 5, 9)
  panel/PanelProvider.tsx panelState.ts PostPanel.tsx PostFormFields.tsx PostLink.tsx
        AiTools.tsx PostActions.tsx                                                            (Task 2, 7, 8)
  plan/planMath.ts prefs.ts moveMath.ts generateMath.ts useCardDrag.ts
       PostCardView.tsx SlotRow.tsx WeekStrip.tsx WeekGrid.tsx MonthGrid.tsx ListView.tsx Tray.tsx
       Toolbar.tsx DragGhost.tsx GenerateDialog.tsx PlanPage.tsx                               (Task 3–6)
  find/findItems.ts ContentFind.tsx                                                            (Task 9)
frontend/src/App.tsx             /content/* route; the copilot stays out of /content            (Task 2)
frontend/src/index.css           imports content.css; mood typography excludes data-shell="content" (Task 2)
frontend/src/theme/ownTokenDirs.ts (+test)   'content' joins the folders the admin sweeps skip  (Task 2)
frontend/src/i18n/localeCompleteness.test.ts  scans src/content, resolves content.*             (Task 2)
frontend/src/workspace/theme/contrast.test.ts sweeps src/content's accent classes too           (Task 2)
frontend/src/workspace/theme/moodExclusion.test.ts  NEW                                         (Task 2)
docs/content-workspace.md        the portal half of the runbook                                 (Task 10)
```

---

### Task 1: Rig, the API layer, brand memory, the shared bits and every word

**Files:**
- Create:
  - `frontend/src/content/lib/{constants,types,api,brand,links,look,shortcuts,platforms,postText,errors}.ts`
  - `frontend/src/content/i18n/index.ts`, `frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`
- Test:
  - `frontend/src/content/lib/{api,brand,postText,errors,shortcuts}.test.ts`
  - `frontend/src/content/i18n/contentLocales.test.ts`, `frontend/src/content/tokens.test.ts`
- Rig: `$R2B/vt.sh`, the baselines

**Interfaces:**
- Produces:
  - `APP_NAME`, `PLAN_REFRESH_MS = 60_000`, `UNDO_MS = 8_000`, `MAX_RANGE_DAYS = 62`.
  - Types: `Platform`, `PostStatus`, `Rewrite`, `BudgetStatus`, `BrandRef`, `Bootstrap`, `PostCard`, `PostDetail`, `VisualBrief`, `Quality`, `Slot`, `PlanFigures`, `PlanPayload`, `PostFields`, `Variation`, `GenerateBody`, `GenerateResult`, `StrategySummary`, `PillarRef`, `StrategyDetail`, `ChannelRef`, `AudienceRef`, `BrandPayload`, `DateKey`.
  - `contentUrl(path, brand)` and `contentApi(brand)` (type `ContentApi`), with `onWorkspaceOff(listener)`.
  - `failureOf(error): ApiFailure {status, code, message, post?, fields?}`.
  - `deviceStorage()`, `storedBrand(storage)`, `rememberBrand(storage, id)`, `forgetBrand(storage)`, `loadBootstrap(asked, storage, fetch)`, `BRAND_KEY`.
  - `loginPath(location)`, `fullAdminPath(canManage)`.
  - `LOOK_KEYS`, `loadBrandPaint()`, `rememberBrandPaint(paint)`, `useLook()`.
  - `CONTENT_KEYS` and `onShortcuts(win, doc, run)` (type `Shortcut`).
  - `PLATFORM_SHORT`.
  - `cardLine(post)`, `copyText(post)`, `parseHashtags(text)`.
  - `ERRORS`, `ErrorFamily`, `errorKey(family, code): [key, fallback]`.
  - `registerContentLocales()`, `CONTENT_LOCALE_FILES`.

- [ ] **Step 1: Rig and baselines** (Git Bash)

```bash
cd /c/wamp64/www/Hexa-Tech-content
S=/c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills
R2B=$($S/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-14-content-workspace-r2b-portal.md) && echo "$R2B"
test -e frontend/node_modules/.bin/vitest && echo "node_modules present"
```
Write `$R2B/vt.sh` with the Write tool:

```bash
#!/usr/bin/env bash
# Vitest on the given paths, colours stripped, summary last, exit code kept: vt.sh src/content
set -o pipefail
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx vitest run "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -40
```
```bash
chmod +x "$R2B/vt.sh"
cd /c/wamp64/www/Hexa-Tech-content/frontend
npx tsc -b && echo "tsc clean"
"$R2B/vt.sh" > "$R2B/baseline-vitest.txt"; grep -E "Tests |FAIL " "$R2B/baseline-vitest.txt"
npx eslint . > "$R2B/baseline-eslint.txt" 2>&1; tail -3 "$R2B/baseline-eslint.txt"
```
- Expected: `node_modules present`, `tsc clean`, `Tests 3 failed | … passed` with the three `plannerMeta` failures, and `1 problem (1 error…)`.
- If the worktree has no `frontend/node_modules`, stop and junction it from `C:\wamp64\www\Hexa-Tech\frontend\node_modules`, as release 1 did, with `cmd /c mklink /J`.

- [ ] **Step 2: Write the failing tests**

`frontend/src/content/lib/api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ list: [] as { method: string; url: string; body?: unknown; config?: unknown }[], fail: null as unknown }))
vi.mock('../../lib/api', () => {
  const record = (method: string) => (url: string, a?: unknown, b?: unknown) => {
    const bodyless = method === 'get' || method === 'delete'
    calls.list.push({ method, url, body: bodyless ? undefined : a, config: bodyless ? a : b })
    return calls.fail ? Promise.reject(calls.fail) : Promise.resolve({ data: { ok: true } })
  }
  return { api: { get: record('get'), post: record('post'), put: record('put'), delete: record('delete') } }
})

import { contentApi, contentUrl, failureOf, onWorkspaceOff } from './api'

const last = () => calls.list[calls.list.length - 1]

describe('contentUrl', () => {
  it('writes the brand into the address, or an empty one, so the full admin\'s request hook leaves it alone', () => {
    expect(contentUrl('plan', 7)).toBe('/v1/admin/content/plan?brand_id=7')
    expect(contentUrl('bootstrap', null)).toBe('/v1/admin/content/bootstrap?brand_id=')
    expect(contentUrl('find?q=a', 3)).toBe('/v1/admin/content/find?q=a&brand_id=3')
  })
})

describe('contentApi', () => {
  it('sends every call under the prefix, with its brand, and the plan range as parameters', async () => {
    calls.fail = null
    const api = contentApi(5)
    await api.plan('2026-10-05', '2026-10-11')
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/plan?brand_id=5', config: { params: { from: '2026-10-05', to: '2026-10-11' } } })
    await api.savePost(9, { hook: 'New', updated_at: '2026-10-05T06:00:00.000000Z' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/posts/9?brand_id=5', body: { hook: 'New' } })
    await api.movePost(9, { updated_at: 'x', scheduled_date: null })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/move?brand_id=5', body: { scheduled_date: null } })
    await api.fill('2026-10-07', 'instagram')
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/slots/fill?brand_id=5', body: { date: '2026-10-07', platform: 'instagram' } })
  })

  it('treats a generation that wrote nothing (503 with its report) as a result to show', async () => {
    const report = { status: 'failed', created_count: 0, posts: [], skipped: [], failed_windows: [{ start_date: '2026-10-05', end_date: '2026-10-11', reason: 'provider_unavailable' }] }
    calls.fail = { response: { status: 503, data: report } }
    await expect(contentApi(5).generate({ from: '2026-10-05', to: '2026-10-11', fill_empty_only: true })).resolves.toEqual(report)
    calls.fail = null
  })

  it('tells its listeners when a call is refused because Content was switched off, and still fails the call', async () => {
    const heard = vi.fn()
    const stop = onWorkspaceOff(heard)
    calls.fail = { response: { status: 403, data: { error: 'workspace_disabled', message: 'x' } } }
    await expect(contentApi(5).plan('2026-10-05', '2026-10-11')).rejects.toBeTruthy()
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    calls.fail = null
  })
})

describe('failureOf', () => {
  it('reads the code, the post of a stale save, the fields of a refused form, and a missing answer', () => {
    expect(failureOf(null)).toEqual({ status: 0, code: '', message: '' })
    expect(failureOf(new Error('offline'))).toMatchObject({ status: 0, code: 'network' })
    expect(failureOf({ response: { status: 409, data: { error: 'changed_elsewhere', message: 'm', post: { id: 4 } } } }))
      .toMatchObject({ status: 409, code: 'changed_elsewhere', post: { id: 4 } })
    expect(failureOf({ response: { status: 422, data: { message: 'The hook field…', errors: { hook: ['too long'] } } } }))
      .toMatchObject({ status: 422, code: 'invalid', fields: { hook: ['too long'] } })
    expect(failureOf({ response: { status: 500, data: '<html>' } })).toMatchObject({ status: 500, code: 'unknown' })
  })

  it('reads the shared brand middleware\'s code, which sits in `code` beside a sentence in `error`', () => {
    const refusal = { response: { status: 403, data: { error: 'You do not have access to this brand.', message: 'You do not have access to this brand.', code: 'brand_not_allowed' } } }
    expect(failureOf(refusal).code).toBe('brand_not_allowed')
  })
})
```

`frontend/src/content/lib/brand.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import { BRAND_KEY, forgetBrand, loadBootstrap, rememberBrand, storedBrand } from './brand'
import type { Bootstrap } from './types'

function store(entries: Record<string, string> = {}) {
  return {
    entries,
    getItem: (k: string) => (k in entries ? entries[k] : null),
    setItem: (k: string, v: string) => { entries[k] = v },
    removeItem: (k: string) => { delete entries[k] },
  }
}
const admin = (id: number | null) => JSON.stringify({ state: { currentBrandId: id }, version: 0 })

describe('storedBrand', () => {
  it('prefers the brand this device used here last, then the full admin\'s current choice, then none', () => {
    expect(storedBrand(store({ [BRAND_KEY]: '4', 'loyalty-brand': admin(9) }))).toBe(4)
    expect(storedBrand(store({ 'loyalty-brand': admin(9) }))).toBe(9)
    expect(storedBrand(store({ 'loyalty-brand': admin(null) }))).toBeNull() // "All brands" is not a brand
    expect(storedBrand(store())).toBeNull()
    expect(storedBrand(null)).toBeNull()
  })

  it('ignores anything that is not a positive whole id', () => {
    for (const bad of ['abc', '0', '-3', '1.5', '', 'null']) expect(storedBrand(store({ [BRAND_KEY]: bad }))).toBeNull()
    expect(storedBrand(store({ 'loyalty-brand': '{not json' }))).toBeNull()
  })

  it('remembers and forgets this device\'s brand', () => {
    const s = store()
    rememberBrand(s, 12)
    expect(s.entries[BRAND_KEY]).toBe('12')
    forgetBrand(s)
    expect(BRAND_KEY in s.entries).toBe(false)
  })
})

describe('loadBootstrap', () => {
  const boot = { brand: { id: 3, name: 'Main' } } as unknown as Bootstrap

  it('asks for the stored brand, and on brand_not_allowed forgets it and asks for the person\'s default', async () => {
    const s = store({ [BRAND_KEY]: '8' })
    const fetch = vi.fn((brand: number | null) => (brand === 8
      ? Promise.reject({ response: { status: 403, data: { code: 'brand_not_allowed', error: 'You do not have access to this brand.' } } })
      : Promise.resolve(boot)))
    await expect(loadBootstrap(8, s, fetch)).resolves.toBe(boot)
    expect(fetch.mock.calls.map(c => c[0])).toEqual([8, null])
    expect(BRAND_KEY in s.entries).toBe(false)
  })

  it('passes any other refusal through untouched, and never retries a request that named no brand', async () => {
    const off = { response: { status: 403, data: { error: 'workspace_disabled' } } }
    await expect(loadBootstrap(8, store(), () => Promise.reject(off))).rejects.toBe(off)
    const notAllowed = { response: { status: 403, data: { code: 'brand_not_allowed' } } }
    const fetch = vi.fn(() => Promise.reject(notAllowed))
    await expect(loadBootstrap(null, store(), fetch)).rejects.toBe(notAllowed)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
```

`frontend/src/content/lib/postText.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cardLine, copyText, parseHashtags } from './postText'

describe('cardLine', () => {
  it('is the hook, else the title, else the topic, skipping blanks', () => {
    expect(cardLine({ hook: 'Hook', title: 'Title', topic: 'Topic' })).toBe('Hook')
    expect(cardLine({ hook: '  ', title: 'Title', topic: 'Topic' })).toBe('Title')
    expect(cardLine({ hook: null, title: null, topic: 'Topic' })).toBe('Topic')
    expect(cardLine({ hook: null, title: '', topic: null })).toBe('')
  })
})

describe('copyText', () => {
  it('joins hook, text, call to action and hashtags with a blank line, adding the # a tag lacks', () => {
    expect(copyText({ hook: 'Three colours for October', main_copy: 'Warm tones are back.\nBook now.', cta: 'Book online', hashtags: ['autumn', '#hair'] }))
      .toBe('Three colours for October\n\nWarm tones are back.\nBook now.\n\nBook online\n\n#autumn #hair')
    expect(copyText({ hook: null, main_copy: 'Only text', cta: '  ', hashtags: [] })).toBe('Only text')
  })
})

describe('parseHashtags', () => {
  it('splits on spaces and commas and drops empties', () => {
    expect(parseHashtags(' #autumn, hair  #colour,,')).toEqual(['#autumn', 'hair', '#colour'])
    expect(parseHashtags('')).toEqual([])
  })
})
```

`frontend/src/content/lib/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import { ERRORS, errorKey } from './errors'

describe('refusal words', () => {
  it('every family has an "unknown", and the English bundle says exactly the fallbacks', () => {
    for (const [family, words] of Object.entries(ERRORS)) {
      expect(words, family).toHaveProperty('unknown')
      expect((en as Record<string, { error?: unknown }>)[family]?.error, `content.${family}.error`).toEqual(words)
    }
  })

  it('a code the family does not know reads as unknown; the server\'s words are never used', () => {
    expect(errorKey('move', 'changed_elsewhere')).toEqual(['content.move.error.changed_elsewhere', ERRORS.move.changed_elsewhere])
    expect(errorKey('move', 'something_new')).toEqual(['content.move.error.unknown', ERRORS.move.unknown])
    expect(errorKey('save', 'toString')).toEqual(['content.save.error.unknown', ERRORS.save.unknown])
  })
})
```

`frontend/src/content/lib/shortcuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shortcutFor, type KeyLike } from '../../workspace/lib/shortcuts'
import { CONTENT_KEYS } from './shortcuts'

const key = (k: string, more: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: null, ...more })
const hit = (e: KeyLike) => shortcutFor(e, { modal: false }, CONTENT_KEYS)
const card = { tagName: 'BUTTON', getAttribute: () => null, closest: (s: string) => (s === '[data-stop]' ? {} : null) }

describe('Content shortcuts', () => {
  it('N new post, T this week, W M L the views, the arrows page, / and Ctrl K find, ? help', () => {
    expect([hit(key('n')), hit(key('t')), hit(key('w')), hit(key('m')), hit(key('l'))]).toEqual(['new', 'today', 'week', 'month', 'list'])
    expect([hit(key('ArrowLeft')), hit(key('ArrowRight'))]).toEqual(['prev', 'next'])
    expect([hit(key('/')), hit(key('k', { ctrlKey: true })), hit(key('?'))]).toEqual(['find', 'find', 'help'])
  })

  it('reaches the letters by their place on a Cyrillic layout', () => {
    expect(hit(key('т', { code: 'KeyN' }))).toBe('new')
    expect(hit(key('ь', { code: 'KeyM' }))).toBe('month')
  })

  it('leaves a focused card its own arrows, and a key the card already took (Shift+arrow) alone', () => {
    expect(hit(key('ArrowLeft', { target: card as unknown as EventTarget }))).toBeNull()
    expect(hit(key('ArrowRight', { shiftKey: true, defaultPrevented: true }))).toBeNull()
  })
})
```

`frontend/src/content/i18n/contentLocales.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ERRORS } from '../lib/errors'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const

/** Keys the code builds at run time (`content.status.${s}` and the like); src/i18n/localeCompleteness.test.ts sees only literal keys. */
const FAMILIES: Record<string, readonly string[]> = {
  platform: ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'],
  status: ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived'],
  'plan.view': ['week', 'month', 'list'],
  'generate.preset': ['this_week', 'next_week', 'this_month', 'custom'],
  'generate.problem': ['missing', 'order', 'too_long', 'past'],
  'panel.ai.rewrite_type': ['shorter', 'longer', 'professional', 'friendly', 'alternative'],
  'panel.ai.brief_field': ['visual_type', 'aspect_ratio', 'style', 'description', 'scene', 'mood', 'composition', 'text_overlay', 'avoid'],
  ...Object.fromEntries(Object.entries(ERRORS).map(([family, words]) => [`${family}.error`, Object.keys(words)])),
}

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `content.${locale}.json`), 'utf8'))
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}
function flatten(o: unknown, prefix = ''): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

describe('content bundle', () => {
  for (const locale of LOCALES) {
    it(`${locale}: every key built at run time is translated`, () => {
      const json = bundle(locale)
      const missing = Object.entries(FAMILIES).flatMap(([family, keys]) =>
        keys.map(k => `${family}.${k}`).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() }))
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([])
    })

    it(`${locale}: no value is empty, and every {{name}} of the English text is kept`, () => {
      const json = bundle(locale)
      const en = bundle('en')
      expect(flatten(json).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() })).toEqual([])
      const names = (s: unknown) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
      const lost = flatten(en).filter(k => JSON.stringify(names(at(en, k))) !== JSON.stringify(names(at(json, k))))
      expect(lost, `${locale} changes the {{…}} names of: ${lost.join(', ')}`).toEqual([])
    })
  }

  it('the five bundles carry exactly the same key set', () => {
    const en = flatten(bundle('en')).sort()
    for (const locale of LOCALES) expect(flatten(bundle(locale)).sort(), `${locale} keys differ from en`).toEqual(en)
  })
})
```

`frontend/src/content/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * HexaTech Content's hard rules, enforced on the source (as Appointments' own sweep):
 *  1. Only Atelier `a-*` colour classes (and the `c-*` classes theme/content.css defines). An admin class
 *     (`bg-dark-surface`, `text-white`) paints the workspace in the full admin's palette; a portal class reads
 *     variables that exist only under [data-portal].
 *  2. Only Content's own API: every `/v1/…` path here is `/v1/admin/content/…`, which the server gates.
 *  3. Nothing from src/appointments: the two workspaces share src/workspace, never each other.
 *  4. Every rule of the stylesheet is scoped under [data-content].
 */
const DIR = path.resolve(__dirname)

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const ADMIN_CLASS = /(?:^|[\s'"`{(])(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|sm:|md:|lg:|xl:)*(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|fill|stroke)-(?:dark-[a-z0-9]+|primary-\d{2,3}|t-primary|t-secondary|t-muted|white|black|accent|error|warning|info|gray-\d{2,3}|emerald-\d{2,3})(?:\/\d+)?(?=[\s'"`)}])/
const PORTAL_CLASS = /(?:^|[\s'"`{(])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|placeholder|outline|rounded|shadow|font)-p-[a-z]/
const FOREIGN_API = /\/v1\/(?!admin\/content(?![-\w]))/
const FROM_APPOINTMENTS = /from\s+['"](?:\.\.\/)+appointments\//

describe('content workspace sweep', () => {
  const files = sourceFiles(DIR)

  it('actually scans the workspace (the folder is not empty)', () => {
    expect(files.length).toBeGreaterThan(8)
  })

  for (const file of files) {
    const rel = path.relative(DIR, file)
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const hits = (re: RegExp) => lines.map((line, i) => (re.test(line) ? `${i + 1}: ${line.trim()}` : null)).filter((x): x is string => x !== null)

    it(`${rel} uses only a-* colour classes, calls only Content's API and imports nothing from Appointments`, () => {
      expect(hits(ADMIN_CLASS), `admin colour classes in ${rel}`).toEqual([])
      expect(hits(PORTAL_CLASS), `portal classes in ${rel}`).toEqual([])
      expect(hits(FOREIGN_API), `${rel} references an API outside /v1/admin/content`).toEqual([])
      expect(hits(FROM_APPOINTMENTS), `${rel} imports from src/appointments`).toEqual([])
    })
  }

  it('sets no text smaller than 12 px', () => {
    const small = files.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
      .filter(m => Number(m[1]) < 12).map(m => `${path.relative(DIR, file)}: ${m[0]}`))
    expect(small).toEqual([])
  })

  it('lifts nothing on a bare :hover: on a touch screen the state sticks after a tap', () => {
    const bare = files.flatMap(file => fs.readFileSync(file, 'utf8').split(/[\s"'`{}]+/)
      .filter(tok => /^(?:[a-z-]+:)*hover:-?translate-[xy]/.test(tok)).map(tok => `${path.relative(DIR, file)}: ${tok}`))
    expect(bare).toEqual([])
  })

  it('every rule in the stylesheet is scoped under [data-content] (once it exists)', () => {
    const file = path.join(DIR, 'theme/content.css')
    if (!fs.existsSync(file)) return
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...css.matchAll(/(^|[{}])\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part.trim().startsWith('[data-content]'), `unscoped selector: ${part.trim()}`).toBe(true)
    }
  })
})
```

Run: `"$R2B/vt.sh" src/content`
Expected: FAIL (`Failed to resolve import "./api"`, and the same for the other modules).

- [ ] **Step 3: Write the library modules**

`frontend/src/content/lib/constants.ts`:

```ts
/** The interface name. One constant: the owner may rename the product. */
export const APP_NAME = 'HexaTech Content'

/** How often the Plan asks the server again (spec §4.2: every 60 s, and when the window regains focus). */
export const PLAN_REFRESH_MS = 60_000

/** How long the "Moved · Undo" notice stays (spec §4.2). */
export const UNDO_MS = 8_000

/** The longest range a plan read or a generation may cover, both ends counted (the server's ContentRules::MAX_RANGE_DAYS). */
export const MAX_RANGE_DAYS = 62
```

`frontend/src/content/lib/types.ts`:

```ts
import type { DateKey } from '../../workspace/lib/wallClock'

export type { DateKey } from '../../workspace/lib/wallClock'

/**
 * What the Content API sends and takes (Plan A, app/Http/Controllers/Api/V1/Admin/Content/*).
 * Dates are the venue's wall-clock days (`YYYY-MM-DD`) and times `HH:MM`; they are never converted.
 */
export type Platform = 'linkedin' | 'instagram' | 'tiktok' | 'facebook' | 'x' | 'youtube' | 'blog' | 'email'
export type PostStatus = 'idea' | 'draft' | 'needs_review' | 'needs_visual' | 'approved' | 'ready_to_publish' | 'published' | 'skipped' | 'archived'
export type Rewrite = 'shorter' | 'longer' | 'professional' | 'friendly' | 'alternative'
export type BudgetStatus = 'unlimited' | 'under' | 'warn' | 'over'

export interface BrandRef { id: number; name: string }

export interface Bootstrap {
  name: string
  organization: { id: number; name: string; industry: string }
  /** The one brand every call of this session works on. */
  brand: BrandRef | null
  /** The brands this person may use: the switcher shows when there is more than one. */
  brands: BrandRef[]
  accent: string | null
  venue: { timezone: string; timezone_named: boolean; today: DateKey }
  staff: { name: string; role: string | null; can_manage: boolean }
  profile: { id: number; setup_completed: boolean; readiness: number } | null
  ai: { status: BudgetStatus; percent: number | null }
  platforms: Platform[]
  statuses: PostStatus[]
  rewrites: Rewrite[]
}

/** A post as a card, a list row and Find draw it. `updated_at` is the version a save or a move sends back. */
export interface PostCard {
  id: number
  platform: Platform
  scheduled_date: DateKey | null
  scheduled_time: string | null
  status: PostStatus
  title: string | null
  hook: string | null
  topic: string | null
  pillar_id: number | null
  image_url: string | null
  updated_at: string
}

export interface VisualBrief {
  visual_type: string | null
  aspect_ratio: string | null
  style: string | null
  description: string | null
  scene: string | null
  mood: string | null
  composition: string | null
  text_overlay: string | null
  avoid: string | null
  image_url: string | null
  image_status: string | null
  image_error: string | null
}

export interface Quality {
  scores: Record<string, number>
  overall: number
  flags: string[]
  improvements: string[]
  verdict: string
}

/** Everything the post panel shows and edits. */
export interface PostDetail extends PostCard {
  language: string | null
  goal: string | null
  format: string | null
  main_copy: string | null
  short_copy: string | null
  cta: string | null
  hashtags: string[]
  audience_id: number | null
  campaign_id: number | null
  weekday_role: string | null
  funnel_stage: string | null
  post_type: string | null
  strategic_reason: string | null
  quality: Quality | null
  published_url: string | null
  published_at: string | null
  generated_by: string | null
  hook_alternatives: string[]
  visual_brief: VisualBrief | null
}

/** A day and platform the brand's channels expect, with no post yet. */
export interface Slot { date: DateKey; platform: Platform }
export interface PlanFigures { planned: number; ready: number; published: number; open_slots: number }
export interface PlanPayload { posts: PostCard[]; unscheduled: PostCard[]; slots: Slot[]; figures: PlanFigures }

/** The fields the panel saves; each one optional, `null` for "none". */
export interface PostFields {
  platform?: Platform
  scheduled_date?: DateKey | null
  scheduled_time?: string | null
  status?: PostStatus
  pillar_id?: number | null
  audience_id?: number | null
  language?: string | null
  topic?: string | null
  hook?: string | null
  main_copy?: string | null
  cta?: string | null
  hashtags?: string[]
}

export interface Variation { id: number; type: Rewrite; copy: string }

export interface GenerateBody {
  from: DateKey
  to: DateKey
  platforms?: Platform[]
  fill_empty_only: boolean
  instructions?: string
}

export interface GenerateResult {
  status: 'completed' | 'partial' | 'failed'
  created_count: number
  posts: PostCard[]
  skipped: { date: string; platform: string; reason: string }[]
  failed_windows: { start_date: DateKey; end_date: DateKey; reason: string }[]
}

export interface StrategySummary {
  id: number
  title: string | null
  summary: string | null
  status: 'generating' | 'active' | 'superseded' | 'archived' | 'failed'
  created_at: string | null
}
export interface PillarRef { id: number; name: string; active: boolean }
export interface StrategyDetail extends StrategySummary { pillars: PillarRef[] }

export interface ChannelRef { id: number; platform: Platform; label: string; active: boolean }
export interface AudienceRef { id: number; name: string }
/** What this plan reads of `GET brand` (the panel's audiences, Generate's channels); Plan C reads the rest. */
export interface BrandPayload { audiences: AudienceRef[]; channels: ChannelRef[] }
```

`frontend/src/content/lib/api.ts`:

```ts
import { api } from '../../lib/api'
import type {
  Bootstrap, BrandPayload, DateKey, GenerateBody, GenerateResult, PlanPayload, Platform, PostCard, PostDetail, PostFields,
  Quality, Rewrite, StrategyDetail, StrategySummary, Variation,
} from './types'

/**
 * Every call HexaTech Content makes, in one place, typed. All of them live
 * under the one prefix the server gates with the organisation's flag;
 * tokens.test.ts refuses any other API path in this folder.
 */
const BASE = '/v1/admin/content'

/**
 * The address of a call, carrying the brand the portal works on (spec §6.7).
 * The full admin's request hook (src/lib/api.ts) adds its own brand choice to
 * any address without `brand_id=`; one that names it is left alone, so even
 * "no brand yet" is written out (empty: the person's default brand).
 */
export function contentUrl(path: string, brand: number | null): string {
  return `${BASE}/${path}${path.includes('?') ? '&' : '?'}brand_id=${brand ?? ''}`
}

const offListeners = new Set<() => void>()

/**
 * Be told when a call is refused because Content was switched off, or the
 * subscription lapsed, while this window was open: the provider asks for the
 * bootstrap again, whose own refusal puts the shell's notice on screen.
 * Returns the unsubscribe.
 */
export function onWorkspaceOff(listener: () => void): () => void {
  offListeners.add(listener)
  return () => { offListeners.delete(listener) }
}

/** Every call but the bootstrap goes through here; the failure is passed on untouched. */
function watched<T>(request: Promise<{ data: T }>): Promise<T> {
  return request.then(r => r.data, (error: unknown) => {
    const code = failureOf(error).code
    if (code === 'workspace_disabled' || code === 'subscription_required') offListeners.forEach(listener => listener())
    throw error
  })
}

/** The calls for one brand (the bootstrap's brand; null before it is known). */
export function contentApi(brand: number | null) {
  const url = (path: string) => contentUrl(path, brand)
  return {
    bootstrap: (): Promise<Bootstrap> => api.get(url('bootstrap')).then(r => r.data),

    plan: (from: DateKey, to: DateKey): Promise<PlanPayload> => watched(api.get(url('plan'), { params: { from, to } })),
    find: (q: string): Promise<{ posts: PostCard[] }> => watched(api.get(url('find'), { params: { q } })),

    post: (id: number): Promise<{ post: PostDetail }> => watched(api.get(url(`posts/${id}`))),
    createPost: (body: PostFields & { platform: Platform }): Promise<{ post: PostDetail }> => watched(api.post(url('posts'), body)),
    savePost: (id: number, body: PostFields & { updated_at: string }): Promise<{ post: PostDetail }> => watched(api.put(url(`posts/${id}`), body)),
    movePost: (id: number, body: { updated_at: string; scheduled_date: DateKey | null }): Promise<{ post: PostCard }> =>
      watched(api.post(url(`posts/${id}/move`), body)),
    duplicatePost: (id: number): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/duplicate`))),
    markReady: (id: number): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/mark-ready`))),
    markPublished: (id: number, publishedUrl: string | null): Promise<{ post: PostDetail }> =>
      watched(api.post(url(`posts/${id}/mark-published`), { published_url: publishedUrl })),
    deletePost: (id: number): Promise<{ deleted: boolean }> => watched(api.delete(url(`posts/${id}`))),

    write: (id: number, instructions: string | null): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/write`), { instructions })),
    rewrite: (id: number, type: Rewrite, guidance: string | null): Promise<{ variation: Variation }> =>
      watched(api.post(url(`posts/${id}/rewrite`), { type, guidance })),
    quality: (id: number): Promise<{ quality: Quality; post: PostDetail }> => watched(api.post(url(`posts/${id}/quality`))),
    visualBrief: (id: number): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/visual-brief`))),
    image: (id: number, instructions: string | null): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/image`), { instructions })),

    fill: (date: DateKey, platform: Platform): Promise<{ post: PostDetail }> => watched(api.post(url('slots/fill'), { date, platform })),
    /** A run that wrote nothing answers 503 with the same report: a result to show, not a failure to explain. */
    generate: (body: GenerateBody): Promise<GenerateResult> => watched(api.post(url('generate'), body).catch((error: unknown) => {
      const response = (error as { response?: { status?: number; data?: { status?: string } } }).response
      if (response?.status === 503 && response.data?.status === 'failed') return { data: response.data as GenerateResult }
      throw error
    })),

    strategies: (): Promise<{ strategies: StrategySummary[] }> => watched(api.get(url('strategies'))),
    strategy: (id: number): Promise<{ strategy: StrategyDetail }> => watched(api.get(url(`strategies/${id}`))),
    brand: (): Promise<BrandPayload> => watched(api.get(url('brand'))),
  }
}

export type ContentApi = ReturnType<typeof contentApi>

export interface ApiFailure {
  status: number
  /** The refusal's snake_case code; `invalid` for a refused form; `unknown` for any other body; `network` when no answer came; '' for none. */
  code: string
  message: string
  /** A stale save's post as it is now (`changed_elsewhere`). */
  post?: PostDetail
  /** A refused form's messages by field (Laravel's `errors`). */
  fields?: Record<string, string[]>
}

/** What went wrong, from an axios error (or anything else that was thrown). Pure: no i18n, no side effects. */
export function failureOf(error: unknown): ApiFailure {
  if (!error) return { status: 0, code: '', message: '' }

  const response = (error as { response?: { status?: number; data?: unknown } }).response
  if (!response) return { status: 0, code: 'network', message: error instanceof Error ? error.message : '' }

  const data = response.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {}
  const snake = (v: unknown): v is string => typeof v === 'string' && /^[a-z_]+$/.test(v)
  // The shared brand middleware keeps its sentence in `error` and its code in `code` (brand_not_allowed).
  const fields = data.errors && typeof data.errors === 'object' ? (data.errors as Record<string, string[]>) : undefined
  const code = snake(data.code) ? data.code : snake(data.error) ? data.error : fields ? 'invalid' : 'unknown'

  return {
    status: response.status ?? 0,
    code,
    message: typeof data.message === 'string' ? data.message : '',
    ...(data.post && typeof data.post === 'object' ? { post: data.post as PostDetail } : {}),
    ...(fields ? { fields } : {}),
  }
}
```

`frontend/src/content/lib/brand.ts`:

```ts
import { failureOf } from './api'
import type { Bootstrap } from './types'

/** Where this device keeps the brand the portal works on (spec §6.7). */
export const BRAND_KEY = 'content:brand'
/** The full admin's brand switcher's own record (src/stores/brandStore.ts, persisted as `loyalty-brand`). */
const ADMIN_BRAND_KEY = 'loyalty-brand'

export type BrandStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** This window's storage, or null where there is none (a private window that refuses it, the tests). */
export function deviceStorage(): BrandStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const positiveId = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * The brand to ask the bootstrap for: the one this device used here last,
 * else the full admin's current choice ("All brands" is not one), else none —
 * the server then answers with the person's default brand.
 */
export function storedBrand(storage: BrandStorage | null): number | null {
  if (!storage) return null
  try {
    const own = positiveId(storage.getItem(BRAND_KEY))
    if (own !== null) return own
    const admin = JSON.parse(storage.getItem(ADMIN_BRAND_KEY) ?? 'null') as { state?: { currentBrandId?: unknown } } | null
    return positiveId(admin?.state?.currentBrandId)
  } catch {
    return null
  }
}

export function rememberBrand(storage: BrandStorage | null, id: number): void {
  try { storage?.setItem(BRAND_KEY, String(id)) } catch { /* the choice lasts this visit */ }
}

export function forgetBrand(storage: BrandStorage | null): void {
  try { storage?.removeItem(BRAND_KEY) } catch { /* nothing to forget */ }
}

/**
 * The bootstrap for the brand this device asks for. A brand this person may
 * no longer use (a re-assigned staff member) is forgotten and their default
 * brand asked for instead; every other refusal is the caller's to show.
 */
export async function loadBootstrap(
  asked: number | null,
  storage: BrandStorage | null,
  fetch: (brand: number | null) => Promise<Bootstrap>,
): Promise<Bootstrap> {
  try {
    return await fetch(asked)
  } catch (error) {
    if (asked === null || failureOf(error).code !== 'brand_not_allowed') throw error
    forgetBrand(storage)
    return fetch(null)
  }
}
```

`frontend/src/content/lib/links.ts`:

```ts
/** The sign-in screen, set to bring the visitor back to the Content page they asked for. */
export function loginPath(location: { pathname: string; search: string }): string {
  return `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`
}

/** Where "Full admin" goes (spec §6.9): the Marketing hub for managers (it is manager-only there), the dashboard for staff. */
export function fullAdminPath(canManage: boolean): string {
  return canManage ? '/marketing' : '/'
}
```

`frontend/src/content/lib/look.ts`:

```ts
import { loadPaint, rememberPaint, useLook as useLookWith, type LiveLook, type LookKeys, type Paint } from '../../workspace/lib/look'

/**
 * HexaTech Content's look on this device, on the shared core's engine
 * (src/workspace/lib/look.ts), under its own keys (spec §6.1): Light, Dark or
 * Auto and the side panel's size, and the accent and mark it last saw, which
 * the frame wears while the bootstrap loads.
 */
export const LOOK_KEYS: LookKeys = { look: 'content:look', paint: 'content:brand-paint' }

export const loadBrandPaint = (): Paint | null => loadPaint(LOOK_KEYS)
export const rememberBrandPaint = (paint: Paint): void => rememberPaint(LOOK_KEYS, paint)
export const useLook = (): LiveLook => useLookWith(LOOK_KEYS)
```

`frontend/src/content/lib/shortcuts.ts`:

```ts
import {
  onShortcuts as listen, type CommonShortcut, type ShortcutDocument, type ShortcutKeys, type ShortcutWindow,
} from '../../workspace/lib/shortcuts'

/**
 * HexaTech Content's shortcuts (spec §4.7) on the shared engine: N a new
 * post, T this week, W / M / L the week, month and list views, ← → the
 * previous or next week (month in the month view). Find and the list of
 * shortcuts come with the engine. A focused card keeps its own arrows
 * ([data-stop]); Shift+← → there moves the post a day.
 */
export type Shortcut = 'find' | 'help' | 'new' | 'today' | 'prev' | 'next' | 'week' | 'month' | 'list'

export const CONTENT_KEYS: ShortcutKeys<Exclude<Shortcut, CommonShortcut>> = {
  letters: { n: 'new', t: 'today', w: 'week', m: 'month', l: 'list' },
  arrows: { left: 'prev', right: 'next' },
}

export function onShortcuts(win: ShortcutWindow, doc: ShortcutDocument, run: (hit: Shortcut, e: KeyboardEvent) => void): () => void {
  return listen(win, doc, CONTENT_KEYS, run)
}
```

`frontend/src/content/lib/platforms.ts`:

```ts
import type { Platform } from './types'

/** The two letters a platform's mark shows; its colour and ink come from theme/content.css ([data-platform]). */
export const PLATFORM_SHORT: Record<Platform, string> = {
  linkedin: 'in', instagram: 'ig', tiktok: 'tt', facebook: 'fb', x: 'x', youtube: 'yt', blog: 'bl', email: 'em',
}
```

`frontend/src/content/lib/postText.ts`:

```ts
import type { PostCard, PostDetail } from './types'

/** What a card, a list row and Find call a post: its hook, else its title, else its topic; '' when it has none. */
export function cardLine(post: Pick<PostCard, 'hook' | 'title' | 'topic'>): string {
  return [post.hook, post.title, post.topic].map(v => (v ?? '').trim()).find(v => v !== '') ?? ''
}

/** The post as text to paste into a network: hook, text, call to action and hashtags, a blank line apart. */
export function copyText(post: Pick<PostDetail, 'hook' | 'main_copy' | 'cta' | 'hashtags'>): string {
  const tags = post.hashtags.map(tag => tag.trim()).filter(Boolean).map(tag => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')
  return [post.hook, post.main_copy, post.cta, tags].map(v => (v ?? '').trim()).filter(Boolean).join('\n\n')
}

/** Hashtags as typed (spaces or commas between them) → the list the server stores. */
export function parseHashtags(text: string): string[] {
  return text.split(/[\s,]+/).map(tag => tag.trim()).filter(Boolean)
}
```

`frontend/src/content/lib/errors.ts`:

```ts
/**
 * The portal's own words for each refusal (spec §8.1), by where it happened.
 * The bundles hold them under content.<family>.error.<code> (errors.test.ts
 * keeps the English bundle equal to these fallbacks). A code a family does not
 * list reads as `unknown`. The server's message is never shown.
 */
export const ERRORS = {
  move: {
    changed_elsewhere: 'Someone else changed this post. The plan now shows their version.',
    published_cannot_move: 'A published post keeps the date it went out.',
    not_found: 'This post no longer exists.',
    unknown: 'The post could not be moved. Please try again.',
  },
  fill: {
    slot_not_open: 'That slot already has a post.',
    ai_budget_used_up: "This month's AI budget is used up.",
    already_generating: 'AI is already writing for this brand. Try again in a moment.',
    ai_failed: 'The AI could not write this post. Please try again.',
    no_profile: 'This brand is not set up yet.',
    unknown: 'The slot could not be filled. Please try again.',
  },
  generate: {
    range_in_past: 'These days are already over.',
    no_channels: 'This brand has no active channel to plan for.',
    already_generating: 'AI is already writing for this brand. Try again in a moment.',
    ai_budget_used_up: "This month's AI budget is used up.",
    generation_failed: 'Generation stopped unexpectedly. Any drafts already saved remain in your plan.',
    manager_only: 'Only an owner or a manager can generate posts.',
    unknown: 'Generation failed. Please try again.',
  },
  save: {
    published_cannot_move: 'A published post keeps the date it went out.',
    invalid: 'Some fields need attention.',
    not_found: 'This post no longer exists.',
    no_profile: 'This brand is not set up yet.',
    unknown: 'The post could not be saved. Please try again.',
  },
  ai: {
    ai_budget_used_up: "This month's AI budget is used up. Writing by hand still works.",
    ai_failed: 'The AI could not finish this. Please try again.',
    not_found: 'This post no longer exists.',
    unknown: 'The AI could not finish this. Please try again.',
  },
  action: {
    invalid: 'Check the link and try again.',
    not_found: 'This post no longer exists.',
    unknown: 'That did not work. Please try again.',
  },
} as const

export type ErrorFamily = keyof typeof ERRORS

/** The key and the English fallback for a refusal: `const [key, text] = errorKey('move', code); t(key, text)`. */
export function errorKey(family: ErrorFamily, code: string): [string, string] {
  const words: Record<string, string> = ERRORS[family]
  const known = Object.prototype.hasOwnProperty.call(words, code) ? code : 'unknown'
  return [`content.${family}.error.${known}`, words[known]]
}
```

- [ ] **Step 4: Write the words**: `frontend/src/content/i18n/index.ts`:

```ts
import i18n from '../../i18n'
import en from './content.en.json'
import ru from './content.ru.json'
import de from './content.de.json'
import fr from './content.fr.json'
import es from './content.es.json'

/**
 * HexaTech Content's words, kept out of the admin's common.json so a session
 * that never opens Content never downloads them. Registered under the
 * `content` key of the `common` namespace, so call sites read
 * `t('content.plan.today')`. Registered when the chunk loads.
 */
export const CONTENT_LOCALE_FILES = { en, ru, de, fr, es } as const

let registered = false

export function registerContentLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(CONTENT_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { content: bundle }, true, true)
  }
  registered = true
}
```

`frontend/src/content/i18n/content.en.json`:

```json
{
  "nav": { "plan": "Plan" },
  "common": {
    "loading": "Loading…",
    "error": "Something went wrong. Please try again.",
    "retry": "Try again",
    "close": "Close",
    "cancel": "Cancel",
    "unscheduled": "Unscheduled",
    "today": "Today"
  },
  "shell": {
    "new_post": "New post",
    "find": "Find a post or action",
    "brand": "Brand",
    "switched_off": "HexaTech Content has been switched off for your organisation. Your posts are unchanged.",
    "subscription_required": "Your organisation's subscription is not active, so HexaTech Content cannot open. Your posts are unchanged. An administrator can restore access under Billing in the full admin.",
    "open_full_admin": "Open the full admin",
    "budget_warn": "This month's AI budget is {{percent}} % used.",
    "budget_over": "This month's AI budget is used up. AI actions are paused until next month; writing by hand still works.",
    "not_set_up_manager": "This brand is not set up yet, so the AI does not know its voice and channels.",
    "not_set_up_staff": "Your manager has not set up this brand yet."
  },
  "platform": {
    "linkedin": "LinkedIn", "instagram": "Instagram", "tiktok": "TikTok", "facebook": "Facebook",
    "x": "X", "youtube": "YouTube", "blog": "Blog", "email": "Email"
  },
  "status": {
    "idea": "Idea", "draft": "Draft", "needs_review": "Needs review", "needs_visual": "Needs visual", "approved": "Approved",
    "ready_to_publish": "Ready", "published": "Published", "skipped": "Skipped", "archived": "Archived"
  },
  "plan": {
    "today": "This week",
    "prev": "Previous",
    "next": "Next",
    "views": "View",
    "view": { "week": "Week", "month": "Month", "list": "List" },
    "filter_platforms": "Platforms",
    "filter_status": "Status",
    "all_statuses": "All statuses",
    "generate": "Generate",
    "strip": { "title": "This week", "planned": "Planned", "ready": "Ready", "published": "Published", "open": "Empty slots" },
    "slot": { "label": "Empty {{platform}} slot", "write": "Write", "fill": "Fill with AI", "filling": "Writing…" },
    "more": "+{{count}} more",
    "open_slots": "Empty slots: {{count}}",
    "empty_day": "Nothing planned",
    "list_empty": "Nothing planned this week.",
    "tray": { "title": "Unscheduled", "empty": "Drag a post here to take it off the calendar." },
    "load_failed": "The plan could not be refreshed. What you see may be out of date.",
    "moved": "Moved to {{day}}",
    "moved_tray": "Moved to Unscheduled",
    "undo": "Undo",
    "undone": "Move undone",
    "card_label": "{{platform}} post, {{status}}: {{text}}",
    "untitled": "Untitled post",
    "move_hint": "Shift and the left or right arrow moves it a day."
  },
  "move": {
    "error": {
      "changed_elsewhere": "Someone else changed this post. The plan now shows their version.",
      "published_cannot_move": "A published post keeps the date it went out.",
      "not_found": "This post no longer exists.",
      "unknown": "The post could not be moved. Please try again."
    }
  },
  "fill": {
    "error": {
      "slot_not_open": "That slot already has a post.",
      "ai_budget_used_up": "This month's AI budget is used up.",
      "already_generating": "AI is already writing for this brand. Try again in a moment.",
      "ai_failed": "The AI could not write this post. Please try again.",
      "no_profile": "This brand is not set up yet.",
      "unknown": "The slot could not be filled. Please try again."
    }
  },
  "generate": {
    "title": "Generate posts",
    "intro": "The AI writes drafts for the days your channels expect. You can change every one.",
    "range": "Days",
    "preset": { "this_week": "This week", "next_week": "Next week", "this_month": "This month", "custom": "Custom" },
    "from": "From",
    "to": "To",
    "platforms": "Channels",
    "empty_only": "Empty slots only",
    "instructions": "Instructions for the AI (optional)",
    "submit": "Generate",
    "working": "Writing your posts. This can take up to four minutes…",
    "done": "Posts written: {{count}}",
    "none": "No posts were written.",
    "unfilled": "{{from}} – {{to}} could not be written. You can try again.",
    "problem": {
      "missing": "Choose both days.",
      "order": "The last day comes before the first.",
      "too_long": "Choose at most 62 days.",
      "past": "These days are already over."
    },
    "error": {
      "range_in_past": "These days are already over.",
      "no_channels": "This brand has no active channel to plan for.",
      "already_generating": "AI is already writing for this brand. Try again in a moment.",
      "ai_budget_used_up": "This month's AI budget is used up.",
      "generation_failed": "Generation stopped unexpectedly. Any drafts already saved remain in your plan.",
      "manager_only": "Only an owner or a manager can generate posts.",
      "unknown": "Generation failed. Please try again."
    },
    "close": "Close"
  },
  "panel": {
    "title": "Post",
    "new_title": "New post",
    "discard": "Discard your unsaved changes to this post?",
    "load_failed": "This post could not be loaded.",
    "not_found": "This post no longer exists, or it belongs to another brand.",
    "back_to_plan": "Back to the plan",
    "save": "Save",
    "create": "Create post",
    "saved": "Saved",
    "conflict": "Someone else changed this post while you were editing it.",
    "conflict_reload": "Load their version",
    "field_invalid": "Check this field.",
    "fields": {
      "platform": "Platform", "date": "Date", "time": "Time", "status": "Status", "pillar": "Pillar", "audience": "Audience",
      "language": "Language", "brand_language": "The brand's language", "none": "None", "other_pillar": "Another pillar",
      "topic": "Topic", "hook": "Hook", "main_copy": "Text", "cta": "Call to action", "hashtags": "Hashtags",
      "hashtags_hint": "Separate them with spaces or commas.", "published_date": "A published post keeps the date it went out."
    },
    "ai": {
      "title": "AI",
      "guidance": "Guidance for the AI (optional)",
      "write": "Write the text",
      "rewrite": "Rewrite",
      "rewrite_kind": "Kind of rewrite",
      "rewrite_type": { "shorter": "Shorter", "longer": "Longer", "professional": "More professional", "friendly": "Friendlier", "alternative": "Another version" },
      "use": "Use this text",
      "quality": "Check quality",
      "score": "Score: {{score}} of 10",
      "improvements": "How to improve it",
      "brief": "Visual brief",
      "image": "Create image",
      "new_image": "New image",
      "download": "Download",
      "image_failed": "The image could not be created.",
      "image_alt": "Image for this post",
      "save_first": "Save your changes first.",
      "create_first": "Create the post first to use AI.",
      "working": "The AI is working…",
      "brief_field": {
        "visual_type": "Type", "aspect_ratio": "Format", "style": "Style", "description": "Description", "scene": "Scene",
        "mood": "Mood", "composition": "Composition", "text_overlay": "Text on the image", "avoid": "Avoid"
      }
    },
    "actions": {
      "title": "Actions",
      "ready": "Mark ready",
      "published": "Mark published",
      "published_url": "Link to the published post (optional)",
      "confirm_published": "Mark published",
      "invalid_url": "Enter a full link that starts with https://",
      "published_on": "Published {{when}}",
      "open_published": "Open the published post",
      "duplicate": "Duplicate",
      "copy": "Copy text",
      "copied": "Copied",
      "delete": "Delete",
      "delete_confirm": "Delete this post? This cannot be undone.",
      "delete_yes": "Delete post"
    }
  },
  "save": {
    "error": {
      "published_cannot_move": "A published post keeps the date it went out.",
      "invalid": "Some fields need attention.",
      "not_found": "This post no longer exists.",
      "no_profile": "This brand is not set up yet.",
      "unknown": "The post could not be saved. Please try again."
    }
  },
  "ai": {
    "error": {
      "ai_budget_used_up": "This month's AI budget is used up. Writing by hand still works.",
      "ai_failed": "The AI could not finish this. Please try again.",
      "not_found": "This post no longer exists.",
      "unknown": "The AI could not finish this. Please try again."
    }
  },
  "action": {
    "error": {
      "invalid": "Check the link and try again.",
      "not_found": "This post no longer exists.",
      "unknown": "That did not work. Please try again."
    }
  },
  "find": {
    "posts": "Posts", "actions": "Actions", "go_to": "Go to", "searching": "Searching posts…",
    "theme_dark": "Switch to dark", "theme_light": "Switch to light", "shortcuts": "Keyboard shortcuts",
    "collapse": "Collapse menu", "expand": "Expand menu"
  },
  "shortcuts": {
    "find": "Find", "help": "This list", "on_plan": "On the plan", "this_week": "This week",
    "pages": "Previous or next week (month in the month view)", "views": "Week, month, list",
    "move": "Move a focused post a day", "close": "Close the panel"
  }
}
```

`frontend/src/content/i18n/content.ru.json`:

```json
{
  "nav": { "plan": "План" },
  "common": {
    "loading": "Загрузка…",
    "error": "Что-то пошло не так. Попробуйте ещё раз.",
    "retry": "Повторить",
    "close": "Закрыть",
    "cancel": "Отмена",
    "unscheduled": "Без даты",
    "today": "Сегодня"
  },
  "shell": {
    "new_post": "Новый пост",
    "find": "Найти пост или действие",
    "brand": "Бренд",
    "switched_off": "HexaTech Content отключён для вашей организации. Ваши посты не изменились.",
    "subscription_required": "Подписка вашей организации неактивна, поэтому HexaTech Content не открывается. Ваши посты не изменились. Администратор может восстановить доступ в разделе «Оплата» полной панели.",
    "open_full_admin": "Открыть полную панель",
    "budget_warn": "Месячный бюджет на ИИ израсходован на {{percent}} %.",
    "budget_over": "Месячный бюджет на ИИ исчерпан. Действия ИИ приостановлены до следующего месяца; писать вручную по-прежнему можно.",
    "not_set_up_manager": "Этот бренд ещё не настроен, поэтому ИИ не знает его голос и каналы.",
    "not_set_up_staff": "Ваш менеджер ещё не настроил этот бренд."
  },
  "platform": {
    "linkedin": "LinkedIn", "instagram": "Instagram", "tiktok": "TikTok", "facebook": "Facebook",
    "x": "X", "youtube": "YouTube", "blog": "Блог", "email": "Эл. почта"
  },
  "status": {
    "idea": "Идея", "draft": "Черновик", "needs_review": "На проверке", "needs_visual": "Нужен визуал", "approved": "Одобрен",
    "ready_to_publish": "Готов", "published": "Опубликован", "skipped": "Пропущен", "archived": "В архиве"
  },
  "plan": {
    "today": "Эта неделя",
    "prev": "Назад",
    "next": "Вперёд",
    "views": "Вид",
    "view": { "week": "Неделя", "month": "Месяц", "list": "Список" },
    "filter_platforms": "Платформы",
    "filter_status": "Статус",
    "all_statuses": "Все статусы",
    "generate": "Сгенерировать",
    "strip": { "title": "Эта неделя", "planned": "Запланировано", "ready": "Готово", "published": "Опубликовано", "open": "Пустые слоты" },
    "slot": { "label": "Пустой слот {{platform}}", "write": "Написать", "fill": "Заполнить с ИИ", "filling": "Пишем…" },
    "more": "ещё {{count}}",
    "open_slots": "Пустых слотов: {{count}}",
    "empty_day": "Ничего не запланировано",
    "list_empty": "На этой неделе ничего не запланировано.",
    "tray": { "title": "Без даты", "empty": "Перетащите сюда пост, чтобы убрать его из календаря." },
    "load_failed": "Не удалось обновить план. Данные могут быть устаревшими.",
    "moved": "Перенесено на {{day}}",
    "moved_tray": "Перенесено в «Без даты»",
    "undo": "Отменить",
    "undone": "Перенос отменён",
    "card_label": "Пост {{platform}}, {{status}}: {{text}}",
    "untitled": "Пост без названия",
    "move_hint": "Shift и стрелка влево или вправо переносят его на день."
  },
  "move": {
    "error": {
      "changed_elsewhere": "Кто-то другой изменил этот пост. План показывает его версию.",
      "published_cannot_move": "Опубликованный пост сохраняет дату публикации.",
      "not_found": "Этого поста больше нет.",
      "unknown": "Не удалось перенести пост. Попробуйте ещё раз."
    }
  },
  "fill": {
    "error": {
      "slot_not_open": "В этом слоте уже есть пост.",
      "ai_budget_used_up": "Месячный бюджет на ИИ исчерпан.",
      "already_generating": "ИИ уже пишет для этого бренда. Попробуйте через минуту.",
      "ai_failed": "ИИ не смог написать этот пост. Попробуйте ещё раз.",
      "no_profile": "Этот бренд ещё не настроен.",
      "unknown": "Не удалось заполнить слот. Попробуйте ещё раз."
    }
  },
  "generate": {
    "title": "Сгенерировать посты",
    "intro": "ИИ напишет черновики на дни, которых ждут ваши каналы. Каждый можно изменить.",
    "range": "Дни",
    "preset": { "this_week": "Эта неделя", "next_week": "Следующая неделя", "this_month": "Этот месяц", "custom": "Свои даты" },
    "from": "С",
    "to": "По",
    "platforms": "Каналы",
    "empty_only": "Только пустые слоты",
    "instructions": "Указания для ИИ (необязательно)",
    "submit": "Сгенерировать",
    "working": "Пишем ваши посты. Это может занять до четырёх минут…",
    "done": "Написано постов: {{count}}",
    "none": "Ни одного поста не написано.",
    "unfilled": "{{from}} – {{to}}: не удалось написать. Можно попробовать ещё раз.",
    "problem": {
      "missing": "Выберите обе даты.",
      "order": "Последний день раньше первого.",
      "too_long": "Выберите не больше 62 дней.",
      "past": "Эти дни уже прошли."
    },
    "error": {
      "range_in_past": "Эти дни уже прошли.",
      "no_channels": "У этого бренда нет активного канала для планирования.",
      "already_generating": "ИИ уже пишет для этого бренда. Попробуйте через минуту.",
      "ai_budget_used_up": "Месячный бюджет на ИИ исчерпан.",
      "generation_failed": "Генерация неожиданно остановилась. Уже сохранённые черновики остались в плане.",
      "manager_only": "Генерировать посты может только владелец или менеджер.",
      "unknown": "Генерация не удалась. Попробуйте ещё раз."
    },
    "close": "Закрыть"
  },
  "panel": {
    "title": "Пост",
    "new_title": "Новый пост",
    "discard": "Отменить несохранённые изменения этого поста?",
    "load_failed": "Не удалось загрузить пост.",
    "not_found": "Этого поста больше нет, или он принадлежит другому бренду.",
    "back_to_plan": "Вернуться к плану",
    "save": "Сохранить",
    "create": "Создать пост",
    "saved": "Сохранено",
    "conflict": "Кто-то другой изменил этот пост, пока вы его редактировали.",
    "conflict_reload": "Загрузить их версию",
    "field_invalid": "Проверьте это поле.",
    "fields": {
      "platform": "Платформа", "date": "Дата", "time": "Время", "status": "Статус", "pillar": "Рубрика", "audience": "Аудитория",
      "language": "Язык", "brand_language": "Язык бренда", "none": "Нет", "other_pillar": "Другая рубрика",
      "topic": "Тема", "hook": "Хук", "main_copy": "Текст", "cta": "Призыв к действию", "hashtags": "Хештеги",
      "hashtags_hint": "Разделяйте пробелами или запятыми.", "published_date": "Опубликованный пост сохраняет дату публикации."
    },
    "ai": {
      "title": "ИИ",
      "guidance": "Указания для ИИ (необязательно)",
      "write": "Написать текст",
      "rewrite": "Переписать",
      "rewrite_kind": "Как переписать",
      "rewrite_type": { "shorter": "Короче", "longer": "Длиннее", "professional": "Профессиональнее", "friendly": "Дружелюбнее", "alternative": "Другой вариант" },
      "use": "Использовать этот текст",
      "quality": "Проверить качество",
      "score": "Оценка: {{score}} из 10",
      "improvements": "Как улучшить",
      "brief": "Визуальное задание",
      "image": "Создать изображение",
      "new_image": "Новое изображение",
      "download": "Скачать",
      "image_failed": "Не удалось создать изображение.",
      "image_alt": "Изображение для этого поста",
      "save_first": "Сначала сохраните изменения.",
      "create_first": "Сначала создайте пост, чтобы использовать ИИ.",
      "working": "ИИ работает…",
      "brief_field": {
        "visual_type": "Тип", "aspect_ratio": "Формат", "style": "Стиль", "description": "Описание", "scene": "Сцена",
        "mood": "Настроение", "composition": "Композиция", "text_overlay": "Текст на изображении", "avoid": "Избегать"
      }
    },
    "actions": {
      "title": "Действия",
      "ready": "Отметить готовым",
      "published": "Отметить опубликованным",
      "published_url": "Ссылка на опубликованный пост (необязательно)",
      "confirm_published": "Отметить опубликованным",
      "invalid_url": "Введите полную ссылку, начинающуюся с https://",
      "published_on": "Опубликован {{when}}",
      "open_published": "Открыть опубликованный пост",
      "duplicate": "Дублировать",
      "copy": "Копировать текст",
      "copied": "Скопировано",
      "delete": "Удалить",
      "delete_confirm": "Удалить этот пост? Это нельзя отменить.",
      "delete_yes": "Удалить пост"
    }
  },
  "save": {
    "error": {
      "published_cannot_move": "Опубликованный пост сохраняет дату публикации.",
      "invalid": "Некоторые поля требуют внимания.",
      "not_found": "Этого поста больше нет.",
      "no_profile": "Этот бренд ещё не настроен.",
      "unknown": "Не удалось сохранить пост. Попробуйте ещё раз."
    }
  },
  "ai": {
    "error": {
      "ai_budget_used_up": "Месячный бюджет на ИИ исчерпан. Писать вручную по-прежнему можно.",
      "ai_failed": "ИИ не смог закончить. Попробуйте ещё раз.",
      "not_found": "Этого поста больше нет.",
      "unknown": "ИИ не смог закончить. Попробуйте ещё раз."
    }
  },
  "action": {
    "error": {
      "invalid": "Проверьте ссылку и попробуйте ещё раз.",
      "not_found": "Этого поста больше нет.",
      "unknown": "Не получилось. Попробуйте ещё раз."
    }
  },
  "find": {
    "posts": "Посты", "actions": "Действия", "go_to": "Перейти:", "searching": "Ищем посты…",
    "theme_dark": "Тёмная тема", "theme_light": "Светлая тема", "shortcuts": "Горячие клавиши",
    "collapse": "Свернуть меню", "expand": "Развернуть меню"
  },
  "shortcuts": {
    "find": "Поиск", "help": "Этот список", "on_plan": "В плане", "this_week": "Эта неделя",
    "pages": "Предыдущая или следующая неделя (месяц в режиме месяца)", "views": "Неделя, месяц, список",
    "move": "Перенести выбранный пост на день", "close": "Закрыть панель"
  }
}
```

`frontend/src/content/i18n/content.de.json`:

```json
{
  "nav": { "plan": "Plan" },
  "common": {
    "loading": "Wird geladen…",
    "error": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    "retry": "Erneut versuchen",
    "close": "Schließen",
    "cancel": "Abbrechen",
    "unscheduled": "Ohne Datum",
    "today": "Heute"
  },
  "shell": {
    "new_post": "Neuer Beitrag",
    "find": "Beitrag oder Aktion finden",
    "brand": "Marke",
    "switched_off": "HexaTech Content wurde für Ihre Organisation ausgeschaltet. Ihre Beiträge sind unverändert.",
    "subscription_required": "Das Abonnement Ihrer Organisation ist nicht aktiv, daher kann HexaTech Content nicht geöffnet werden. Ihre Beiträge sind unverändert. Eine Administratorin oder ein Administrator kann den Zugang unter „Abrechnung“ im vollständigen Admin wiederherstellen.",
    "open_full_admin": "Vollständigen Admin öffnen",
    "budget_warn": "Das KI-Budget dieses Monats ist zu {{percent}} % verbraucht.",
    "budget_over": "Das KI-Budget dieses Monats ist aufgebraucht. KI-Aktionen pausieren bis zum nächsten Monat; von Hand schreiben geht weiterhin.",
    "not_set_up_manager": "Diese Marke ist noch nicht eingerichtet, daher kennt die KI ihre Stimme und Kanäle nicht.",
    "not_set_up_staff": "Ihre Managerin oder Ihr Manager hat diese Marke noch nicht eingerichtet."
  },
  "platform": {
    "linkedin": "LinkedIn", "instagram": "Instagram", "tiktok": "TikTok", "facebook": "Facebook",
    "x": "X", "youtube": "YouTube", "blog": "Blog", "email": "E-Mail"
  },
  "status": {
    "idea": "Idee", "draft": "Entwurf", "needs_review": "Zur Prüfung", "needs_visual": "Bild fehlt", "approved": "Freigegeben",
    "ready_to_publish": "Bereit", "published": "Veröffentlicht", "skipped": "Übersprungen", "archived": "Archiviert"
  },
  "plan": {
    "today": "Diese Woche",
    "prev": "Zurück",
    "next": "Weiter",
    "views": "Ansicht",
    "view": { "week": "Woche", "month": "Monat", "list": "Liste" },
    "filter_platforms": "Plattformen",
    "filter_status": "Status",
    "all_statuses": "Alle Status",
    "generate": "Generieren",
    "strip": { "title": "Diese Woche", "planned": "Geplant", "ready": "Bereit", "published": "Veröffentlicht", "open": "Freie Slots" },
    "slot": { "label": "Freier {{platform}}-Slot", "write": "Schreiben", "fill": "Mit KI füllen", "filling": "Wird geschrieben…" },
    "more": "+{{count}} weitere",
    "open_slots": "Freie Slots: {{count}}",
    "empty_day": "Nichts geplant",
    "list_empty": "Diese Woche ist nichts geplant.",
    "tray": { "title": "Ohne Datum", "empty": "Ziehen Sie einen Beitrag hierher, um ihn aus dem Kalender zu nehmen." },
    "load_failed": "Der Plan konnte nicht aktualisiert werden. Was Sie sehen, ist möglicherweise veraltet.",
    "moved": "Verschoben auf {{day}}",
    "moved_tray": "Nach „Ohne Datum“ verschoben",
    "undo": "Rückgängig",
    "undone": "Verschieben rückgängig gemacht",
    "card_label": "{{platform}}-Beitrag, {{status}}: {{text}}",
    "untitled": "Beitrag ohne Titel",
    "move_hint": "Umschalt und Pfeil links oder rechts verschiebt ihn um einen Tag."
  },
  "move": {
    "error": {
      "changed_elsewhere": "Jemand anderes hat diesen Beitrag geändert. Der Plan zeigt jetzt diese Version.",
      "published_cannot_move": "Ein veröffentlichter Beitrag behält sein Veröffentlichungsdatum.",
      "not_found": "Diesen Beitrag gibt es nicht mehr.",
      "unknown": "Der Beitrag konnte nicht verschoben werden. Bitte versuchen Sie es erneut."
    }
  },
  "fill": {
    "error": {
      "slot_not_open": "Dieser Slot hat bereits einen Beitrag.",
      "ai_budget_used_up": "Das KI-Budget dieses Monats ist aufgebraucht.",
      "already_generating": "Die KI schreibt bereits für diese Marke. Versuchen Sie es gleich noch einmal.",
      "ai_failed": "Die KI konnte diesen Beitrag nicht schreiben. Bitte versuchen Sie es erneut.",
      "no_profile": "Diese Marke ist noch nicht eingerichtet.",
      "unknown": "Der Slot konnte nicht gefüllt werden. Bitte versuchen Sie es erneut."
    }
  },
  "generate": {
    "title": "Beiträge generieren",
    "intro": "Die KI schreibt Entwürfe für die Tage, die Ihre Kanäle erwarten. Sie können jeden ändern.",
    "range": "Tage",
    "preset": { "this_week": "Diese Woche", "next_week": "Nächste Woche", "this_month": "Dieser Monat", "custom": "Eigene Tage" },
    "from": "Von",
    "to": "Bis",
    "platforms": "Kanäle",
    "empty_only": "Nur freie Slots",
    "instructions": "Hinweise für die KI (optional)",
    "submit": "Generieren",
    "working": "Ihre Beiträge werden geschrieben. Das kann bis zu vier Minuten dauern…",
    "done": "Geschriebene Beiträge: {{count}}",
    "none": "Es wurden keine Beiträge geschrieben.",
    "unfilled": "{{from}} – {{to}} konnte nicht geschrieben werden. Sie können es erneut versuchen.",
    "problem": {
      "missing": "Wählen Sie beide Tage.",
      "order": "Der letzte Tag liegt vor dem ersten.",
      "too_long": "Wählen Sie höchstens 62 Tage.",
      "past": "Diese Tage sind schon vorbei."
    },
    "error": {
      "range_in_past": "Diese Tage sind schon vorbei.",
      "no_channels": "Diese Marke hat keinen aktiven Kanal zum Planen.",
      "already_generating": "Die KI schreibt bereits für diese Marke. Versuchen Sie es gleich noch einmal.",
      "ai_budget_used_up": "Das KI-Budget dieses Monats ist aufgebraucht.",
      "generation_failed": "Die Generierung wurde unerwartet abgebrochen. Bereits gespeicherte Entwürfe bleiben in Ihrem Plan.",
      "manager_only": "Nur Inhaber oder Manager können Beiträge generieren.",
      "unknown": "Die Generierung ist fehlgeschlagen. Bitte versuchen Sie es erneut."
    },
    "close": "Schließen"
  },
  "panel": {
    "title": "Beitrag",
    "new_title": "Neuer Beitrag",
    "discard": "Ungespeicherte Änderungen an diesem Beitrag verwerfen?",
    "load_failed": "Dieser Beitrag konnte nicht geladen werden.",
    "not_found": "Diesen Beitrag gibt es nicht mehr, oder er gehört zu einer anderen Marke.",
    "back_to_plan": "Zurück zum Plan",
    "save": "Speichern",
    "create": "Beitrag anlegen",
    "saved": "Gespeichert",
    "conflict": "Jemand anderes hat diesen Beitrag geändert, während Sie ihn bearbeitet haben.",
    "conflict_reload": "Deren Version laden",
    "field_invalid": "Bitte prüfen Sie dieses Feld.",
    "fields": {
      "platform": "Plattform", "date": "Datum", "time": "Uhrzeit", "status": "Status", "pillar": "Säule", "audience": "Zielgruppe",
      "language": "Sprache", "brand_language": "Sprache der Marke", "none": "Keine", "other_pillar": "Eine andere Säule",
      "topic": "Thema", "hook": "Aufhänger", "main_copy": "Text", "cta": "Handlungsaufruf", "hashtags": "Hashtags",
      "hashtags_hint": "Mit Leerzeichen oder Kommas trennen.", "published_date": "Ein veröffentlichter Beitrag behält sein Veröffentlichungsdatum."
    },
    "ai": {
      "title": "KI",
      "guidance": "Hinweise für die KI (optional)",
      "write": "Text schreiben",
      "rewrite": "Umschreiben",
      "rewrite_kind": "Art der Umschreibung",
      "rewrite_type": { "shorter": "Kürzer", "longer": "Länger", "professional": "Professioneller", "friendly": "Freundlicher", "alternative": "Andere Version" },
      "use": "Diesen Text verwenden",
      "quality": "Qualität prüfen",
      "score": "Bewertung: {{score}} von 10",
      "improvements": "So wird er besser",
      "brief": "Bildbriefing",
      "image": "Bild erstellen",
      "new_image": "Neues Bild",
      "download": "Herunterladen",
      "image_failed": "Das Bild konnte nicht erstellt werden.",
      "image_alt": "Bild zu diesem Beitrag",
      "save_first": "Speichern Sie zuerst Ihre Änderungen.",
      "create_first": "Legen Sie den Beitrag zuerst an, um die KI zu nutzen.",
      "working": "Die KI arbeitet…",
      "brief_field": {
        "visual_type": "Art", "aspect_ratio": "Format", "style": "Stil", "description": "Beschreibung", "scene": "Szene",
        "mood": "Stimmung", "composition": "Bildaufbau", "text_overlay": "Text im Bild", "avoid": "Vermeiden"
      }
    },
    "actions": {
      "title": "Aktionen",
      "ready": "Als bereit markieren",
      "published": "Als veröffentlicht markieren",
      "published_url": "Link zum veröffentlichten Beitrag (optional)",
      "confirm_published": "Als veröffentlicht markieren",
      "invalid_url": "Geben Sie einen vollständigen Link ein, der mit https:// beginnt.",
      "published_on": "Veröffentlicht {{when}}",
      "open_published": "Veröffentlichten Beitrag öffnen",
      "duplicate": "Duplizieren",
      "copy": "Text kopieren",
      "copied": "Kopiert",
      "delete": "Löschen",
      "delete_confirm": "Diesen Beitrag löschen? Das lässt sich nicht rückgängig machen.",
      "delete_yes": "Beitrag löschen"
    }
  },
  "save": {
    "error": {
      "published_cannot_move": "Ein veröffentlichter Beitrag behält sein Veröffentlichungsdatum.",
      "invalid": "Einige Felder müssen geprüft werden.",
      "not_found": "Diesen Beitrag gibt es nicht mehr.",
      "no_profile": "Diese Marke ist noch nicht eingerichtet.",
      "unknown": "Der Beitrag konnte nicht gespeichert werden. Bitte versuchen Sie es erneut."
    }
  },
  "ai": {
    "error": {
      "ai_budget_used_up": "Das KI-Budget dieses Monats ist aufgebraucht. Von Hand schreiben geht weiterhin.",
      "ai_failed": "Die KI konnte das nicht abschließen. Bitte versuchen Sie es erneut.",
      "not_found": "Diesen Beitrag gibt es nicht mehr.",
      "unknown": "Die KI konnte das nicht abschließen. Bitte versuchen Sie es erneut."
    }
  },
  "action": {
    "error": {
      "invalid": "Prüfen Sie den Link und versuchen Sie es erneut.",
      "not_found": "Diesen Beitrag gibt es nicht mehr.",
      "unknown": "Das hat nicht geklappt. Bitte versuchen Sie es erneut."
    }
  },
  "find": {
    "posts": "Beiträge", "actions": "Aktionen", "go_to": "Gehe zu", "searching": "Beiträge werden gesucht…",
    "theme_dark": "Dunkel", "theme_light": "Hell", "shortcuts": "Tastenkürzel",
    "collapse": "Menü einklappen", "expand": "Menü ausklappen"
  },
  "shortcuts": {
    "find": "Suchen", "help": "Diese Liste", "on_plan": "Im Plan", "this_week": "Diese Woche",
    "pages": "Vorige oder nächste Woche (Monat in der Monatsansicht)", "views": "Woche, Monat, Liste",
    "move": "Fokussierten Beitrag um einen Tag verschieben", "close": "Panel schließen"
  }
}
```

`frontend/src/content/i18n/content.fr.json`:

```json
{
  "nav": { "plan": "Planning" },
  "common": {
    "loading": "Chargement…",
    "error": "Une erreur s'est produite. Veuillez réessayer.",
    "retry": "Réessayer",
    "close": "Fermer",
    "cancel": "Annuler",
    "unscheduled": "Sans date",
    "today": "Aujourd'hui"
  },
  "shell": {
    "new_post": "Nouvelle publication",
    "find": "Trouver une publication ou une action",
    "brand": "Marque",
    "switched_off": "HexaTech Content a été désactivé pour votre organisation. Vos publications sont inchangées.",
    "subscription_required": "L'abonnement de votre organisation n'est pas actif, HexaTech Content ne peut donc pas s'ouvrir. Vos publications sont inchangées. Un administrateur peut rétablir l'accès dans Facturation, dans l'admin complète.",
    "open_full_admin": "Ouvrir l'admin complète",
    "budget_warn": "Le budget IA du mois est utilisé à {{percent}} %.",
    "budget_over": "Le budget IA du mois est épuisé. Les actions IA sont suspendues jusqu'au mois prochain ; vous pouvez toujours écrire vous-même.",
    "not_set_up_manager": "Cette marque n'est pas encore configurée : l'IA ne connaît ni sa voix ni ses canaux.",
    "not_set_up_staff": "Votre responsable n'a pas encore configuré cette marque."
  },
  "platform": {
    "linkedin": "LinkedIn", "instagram": "Instagram", "tiktok": "TikTok", "facebook": "Facebook",
    "x": "X", "youtube": "YouTube", "blog": "Blog", "email": "E-mail"
  },
  "status": {
    "idea": "Idée", "draft": "Brouillon", "needs_review": "À relire", "needs_visual": "Visuel requis", "approved": "Approuvée",
    "ready_to_publish": "Prête", "published": "Publiée", "skipped": "Ignorée", "archived": "Archivée"
  },
  "plan": {
    "today": "Cette semaine",
    "prev": "Précédent",
    "next": "Suivant",
    "views": "Vue",
    "view": { "week": "Semaine", "month": "Mois", "list": "Liste" },
    "filter_platforms": "Plateformes",
    "filter_status": "Statut",
    "all_statuses": "Tous les statuts",
    "generate": "Générer",
    "strip": { "title": "Cette semaine", "planned": "Prévues", "ready": "Prêtes", "published": "Publiées", "open": "Créneaux libres" },
    "slot": { "label": "Créneau {{platform}} libre", "write": "Écrire", "fill": "Remplir avec l'IA", "filling": "Rédaction…" },
    "more": "+{{count}} de plus",
    "open_slots": "Créneaux libres : {{count}}",
    "empty_day": "Rien de prévu",
    "list_empty": "Rien de prévu cette semaine.",
    "tray": { "title": "Sans date", "empty": "Glissez une publication ici pour la retirer du calendrier." },
    "load_failed": "Le planning n'a pas pu être actualisé. Ce que vous voyez n'est peut-être pas à jour.",
    "moved": "Déplacée au {{day}}",
    "moved_tray": "Déplacée vers Sans date",
    "undo": "Annuler",
    "undone": "Déplacement annulé",
    "card_label": "Publication {{platform}}, {{status}} : {{text}}",
    "untitled": "Publication sans titre",
    "move_hint": "Maj et la flèche gauche ou droite la déplacent d'un jour."
  },
  "move": {
    "error": {
      "changed_elsewhere": "Quelqu'un d'autre a modifié cette publication. Le planning affiche maintenant sa version.",
      "published_cannot_move": "Une publication publiée garde sa date de parution.",
      "not_found": "Cette publication n'existe plus.",
      "unknown": "La publication n'a pas pu être déplacée. Veuillez réessayer."
    }
  },
  "fill": {
    "error": {
      "slot_not_open": "Ce créneau a déjà une publication.",
      "ai_budget_used_up": "Le budget IA du mois est épuisé.",
      "already_generating": "L'IA rédige déjà pour cette marque. Réessayez dans un instant.",
      "ai_failed": "L'IA n'a pas pu rédiger cette publication. Veuillez réessayer.",
      "no_profile": "Cette marque n'est pas encore configurée.",
      "unknown": "Le créneau n'a pas pu être rempli. Veuillez réessayer."
    }
  },
  "generate": {
    "title": "Générer des publications",
    "intro": "L'IA rédige des brouillons pour les jours attendus par vos canaux. Vous pouvez tous les modifier.",
    "range": "Jours",
    "preset": { "this_week": "Cette semaine", "next_week": "La semaine prochaine", "this_month": "Ce mois-ci", "custom": "Personnalisé" },
    "from": "Du",
    "to": "Au",
    "platforms": "Canaux",
    "empty_only": "Créneaux libres uniquement",
    "instructions": "Consignes pour l'IA (facultatif)",
    "submit": "Générer",
    "working": "Rédaction de vos publications. Cela peut prendre jusqu'à quatre minutes…",
    "done": "Publications rédigées : {{count}}",
    "none": "Aucune publication n'a été rédigée.",
    "unfilled": "{{from}} – {{to}} n'a pas pu être rédigé. Vous pouvez réessayer.",
    "problem": {
      "missing": "Choisissez les deux jours.",
      "order": "Le dernier jour précède le premier.",
      "too_long": "Choisissez 62 jours au maximum.",
      "past": "Ces jours sont déjà passés."
    },
    "error": {
      "range_in_past": "Ces jours sont déjà passés.",
      "no_channels": "Cette marque n'a aucun canal actif à planifier.",
      "already_generating": "L'IA rédige déjà pour cette marque. Réessayez dans un instant.",
      "ai_budget_used_up": "Le budget IA du mois est épuisé.",
      "generation_failed": "La génération s'est arrêtée de façon inattendue. Les brouillons déjà enregistrés restent dans votre planning.",
      "manager_only": "Seul un propriétaire ou un responsable peut générer des publications.",
      "unknown": "La génération a échoué. Veuillez réessayer."
    },
    "close": "Fermer"
  },
  "panel": {
    "title": "Publication",
    "new_title": "Nouvelle publication",
    "discard": "Abandonner les modifications non enregistrées de cette publication ?",
    "load_failed": "Cette publication n'a pas pu être chargée.",
    "not_found": "Cette publication n'existe plus, ou elle appartient à une autre marque.",
    "back_to_plan": "Retour au planning",
    "save": "Enregistrer",
    "create": "Créer la publication",
    "saved": "Enregistré",
    "conflict": "Quelqu'un d'autre a modifié cette publication pendant que vous la modifiiez.",
    "conflict_reload": "Charger sa version",
    "field_invalid": "Vérifiez ce champ.",
    "fields": {
      "platform": "Plateforme", "date": "Date", "time": "Heure", "status": "Statut", "pillar": "Pilier", "audience": "Audience",
      "language": "Langue", "brand_language": "La langue de la marque", "none": "Aucun", "other_pillar": "Un autre pilier",
      "topic": "Sujet", "hook": "Accroche", "main_copy": "Texte", "cta": "Appel à l'action", "hashtags": "Hashtags",
      "hashtags_hint": "Séparez-les par des espaces ou des virgules.", "published_date": "Une publication publiée garde sa date de parution."
    },
    "ai": {
      "title": "IA",
      "guidance": "Consignes pour l'IA (facultatif)",
      "write": "Rédiger le texte",
      "rewrite": "Réécrire",
      "rewrite_kind": "Type de réécriture",
      "rewrite_type": { "shorter": "Plus court", "longer": "Plus long", "professional": "Plus professionnel", "friendly": "Plus chaleureux", "alternative": "Autre version" },
      "use": "Utiliser ce texte",
      "quality": "Vérifier la qualité",
      "score": "Note : {{score}} sur 10",
      "improvements": "Comment l'améliorer",
      "brief": "Brief visuel",
      "image": "Créer une image",
      "new_image": "Nouvelle image",
      "download": "Télécharger",
      "image_failed": "L'image n'a pas pu être créée.",
      "image_alt": "Image de cette publication",
      "save_first": "Enregistrez d'abord vos modifications.",
      "create_first": "Créez d'abord la publication pour utiliser l'IA.",
      "working": "L'IA travaille…",
      "brief_field": {
        "visual_type": "Type", "aspect_ratio": "Format", "style": "Style", "description": "Description", "scene": "Scène",
        "mood": "Ambiance", "composition": "Composition", "text_overlay": "Texte sur l'image", "avoid": "À éviter"
      }
    },
    "actions": {
      "title": "Actions",
      "ready": "Marquer comme prête",
      "published": "Marquer comme publiée",
      "published_url": "Lien vers la publication (facultatif)",
      "confirm_published": "Marquer comme publiée",
      "invalid_url": "Saisissez un lien complet qui commence par https://",
      "published_on": "Publiée {{when}}",
      "open_published": "Ouvrir la publication",
      "duplicate": "Dupliquer",
      "copy": "Copier le texte",
      "copied": "Copié",
      "delete": "Supprimer",
      "delete_confirm": "Supprimer cette publication ? C'est définitif.",
      "delete_yes": "Supprimer la publication"
    }
  },
  "save": {
    "error": {
      "published_cannot_move": "Une publication publiée garde sa date de parution.",
      "invalid": "Certains champs sont à vérifier.",
      "not_found": "Cette publication n'existe plus.",
      "no_profile": "Cette marque n'est pas encore configurée.",
      "unknown": "La publication n'a pas pu être enregistrée. Veuillez réessayer."
    }
  },
  "ai": {
    "error": {
      "ai_budget_used_up": "Le budget IA du mois est épuisé. Vous pouvez toujours écrire vous-même.",
      "ai_failed": "L'IA n'a pas pu terminer. Veuillez réessayer.",
      "not_found": "Cette publication n'existe plus.",
      "unknown": "L'IA n'a pas pu terminer. Veuillez réessayer."
    }
  },
  "action": {
    "error": {
      "invalid": "Vérifiez le lien et réessayez.",
      "not_found": "Cette publication n'existe plus.",
      "unknown": "Cela n'a pas fonctionné. Veuillez réessayer."
    }
  },
  "find": {
    "posts": "Publications", "actions": "Actions", "go_to": "Aller à", "searching": "Recherche des publications…",
    "theme_dark": "Passer en sombre", "theme_light": "Passer en clair", "shortcuts": "Raccourcis clavier",
    "collapse": "Réduire le menu", "expand": "Déplier le menu"
  },
  "shortcuts": {
    "find": "Rechercher", "help": "Cette liste", "on_plan": "Dans le planning", "this_week": "Cette semaine",
    "pages": "Semaine précédente ou suivante (mois en vue mois)", "views": "Semaine, mois, liste",
    "move": "Déplacer d'un jour la publication sélectionnée", "close": "Fermer le panneau"
  }
}
```

`frontend/src/content/i18n/content.es.json`:

```json
{
  "nav": { "plan": "Plan" },
  "common": {
    "loading": "Cargando…",
    "error": "Algo salió mal. Inténtalo de nuevo.",
    "retry": "Reintentar",
    "close": "Cerrar",
    "cancel": "Cancelar",
    "unscheduled": "Sin fecha",
    "today": "Hoy"
  },
  "shell": {
    "new_post": "Nueva publicación",
    "find": "Buscar una publicación o acción",
    "brand": "Marca",
    "switched_off": "HexaTech Content se ha desactivado para tu organización. Tus publicaciones no han cambiado.",
    "subscription_required": "La suscripción de tu organización no está activa, así que HexaTech Content no puede abrirse. Tus publicaciones no han cambiado. Un administrador puede restablecer el acceso en Facturación, en el admin completo.",
    "open_full_admin": "Abrir el admin completo",
    "budget_warn": "Se ha usado el {{percent}} % del presupuesto de IA de este mes.",
    "budget_over": "El presupuesto de IA de este mes se ha agotado. Las acciones de IA quedan en pausa hasta el mes que viene; puedes seguir escribiendo a mano.",
    "not_set_up_manager": "Esta marca aún no está configurada, así que la IA no conoce su voz ni sus canales.",
    "not_set_up_staff": "Tu responsable aún no ha configurado esta marca."
  },
  "platform": {
    "linkedin": "LinkedIn", "instagram": "Instagram", "tiktok": "TikTok", "facebook": "Facebook",
    "x": "X", "youtube": "YouTube", "blog": "Blog", "email": "Correo"
  },
  "status": {
    "idea": "Idea", "draft": "Borrador", "needs_review": "Por revisar", "needs_visual": "Falta imagen", "approved": "Aprobada",
    "ready_to_publish": "Lista", "published": "Publicada", "skipped": "Omitida", "archived": "Archivada"
  },
  "plan": {
    "today": "Esta semana",
    "prev": "Anterior",
    "next": "Siguiente",
    "views": "Vista",
    "view": { "week": "Semana", "month": "Mes", "list": "Lista" },
    "filter_platforms": "Plataformas",
    "filter_status": "Estado",
    "all_statuses": "Todos los estados",
    "generate": "Generar",
    "strip": { "title": "Esta semana", "planned": "Planificadas", "ready": "Listas", "published": "Publicadas", "open": "Huecos libres" },
    "slot": { "label": "Hueco libre de {{platform}}", "write": "Escribir", "fill": "Rellenar con IA", "filling": "Escribiendo…" },
    "more": "+{{count}} más",
    "open_slots": "Huecos libres: {{count}}",
    "empty_day": "Nada planificado",
    "list_empty": "No hay nada planificado esta semana.",
    "tray": { "title": "Sin fecha", "empty": "Arrastra una publicación aquí para sacarla del calendario." },
    "load_failed": "No se pudo actualizar el plan. Lo que ves puede estar desactualizado.",
    "moved": "Movida al {{day}}",
    "moved_tray": "Movida a Sin fecha",
    "undo": "Deshacer",
    "undone": "Movimiento deshecho",
    "card_label": "Publicación de {{platform}}, {{status}}: {{text}}",
    "untitled": "Publicación sin título",
    "move_hint": "Mayús y la flecha izquierda o derecha la mueven un día."
  },
  "move": {
    "error": {
      "changed_elsewhere": "Otra persona ha cambiado esta publicación. El plan muestra ahora su versión.",
      "published_cannot_move": "Una publicación publicada conserva la fecha en que salió.",
      "not_found": "Esta publicación ya no existe.",
      "unknown": "No se pudo mover la publicación. Inténtalo de nuevo."
    }
  },
  "fill": {
    "error": {
      "slot_not_open": "Ese hueco ya tiene una publicación.",
      "ai_budget_used_up": "El presupuesto de IA de este mes se ha agotado.",
      "already_generating": "La IA ya está escribiendo para esta marca. Inténtalo dentro de un momento.",
      "ai_failed": "La IA no pudo escribir esta publicación. Inténtalo de nuevo.",
      "no_profile": "Esta marca aún no está configurada.",
      "unknown": "No se pudo rellenar el hueco. Inténtalo de nuevo."
    }
  },
  "generate": {
    "title": "Generar publicaciones",
    "intro": "La IA escribe borradores para los días que esperan tus canales. Puedes cambiar cada uno.",
    "range": "Días",
    "preset": { "this_week": "Esta semana", "next_week": "La semana que viene", "this_month": "Este mes", "custom": "Personalizado" },
    "from": "Desde",
    "to": "Hasta",
    "platforms": "Canales",
    "empty_only": "Solo huecos libres",
    "instructions": "Indicaciones para la IA (opcional)",
    "submit": "Generar",
    "working": "Escribiendo tus publicaciones. Puede tardar hasta cuatro minutos…",
    "done": "Publicaciones escritas: {{count}}",
    "none": "No se escribió ninguna publicación.",
    "unfilled": "{{from}} – {{to}} no se pudo escribir. Puedes volver a intentarlo.",
    "problem": {
      "missing": "Elige los dos días.",
      "order": "El último día es anterior al primero.",
      "too_long": "Elige 62 días como máximo.",
      "past": "Esos días ya han pasado."
    },
    "error": {
      "range_in_past": "Esos días ya han pasado.",
      "no_channels": "Esta marca no tiene ningún canal activo que planificar.",
      "already_generating": "La IA ya está escribiendo para esta marca. Inténtalo dentro de un momento.",
      "ai_budget_used_up": "El presupuesto de IA de este mes se ha agotado.",
      "generation_failed": "La generación se detuvo de forma inesperada. Los borradores ya guardados siguen en tu plan.",
      "manager_only": "Solo un propietario o un responsable puede generar publicaciones.",
      "unknown": "La generación falló. Inténtalo de nuevo."
    },
    "close": "Cerrar"
  },
  "panel": {
    "title": "Publicación",
    "new_title": "Nueva publicación",
    "discard": "¿Descartar los cambios sin guardar de esta publicación?",
    "load_failed": "No se pudo cargar esta publicación.",
    "not_found": "Esta publicación ya no existe o pertenece a otra marca.",
    "back_to_plan": "Volver al plan",
    "save": "Guardar",
    "create": "Crear publicación",
    "saved": "Guardado",
    "conflict": "Otra persona cambió esta publicación mientras la editabas.",
    "conflict_reload": "Cargar su versión",
    "field_invalid": "Revisa este campo.",
    "fields": {
      "platform": "Plataforma", "date": "Fecha", "time": "Hora", "status": "Estado", "pillar": "Pilar", "audience": "Audiencia",
      "language": "Idioma", "brand_language": "El idioma de la marca", "none": "Ninguno", "other_pillar": "Otro pilar",
      "topic": "Tema", "hook": "Gancho", "main_copy": "Texto", "cta": "Llamada a la acción", "hashtags": "Hashtags",
      "hashtags_hint": "Sepáralos con espacios o comas.", "published_date": "Una publicación publicada conserva la fecha en que salió."
    },
    "ai": {
      "title": "IA",
      "guidance": "Indicaciones para la IA (opcional)",
      "write": "Escribir el texto",
      "rewrite": "Reescribir",
      "rewrite_kind": "Tipo de reescritura",
      "rewrite_type": { "shorter": "Más corto", "longer": "Más largo", "professional": "Más profesional", "friendly": "Más cercano", "alternative": "Otra versión" },
      "use": "Usar este texto",
      "quality": "Revisar la calidad",
      "score": "Puntuación: {{score}} de 10",
      "improvements": "Cómo mejorarla",
      "brief": "Brief visual",
      "image": "Crear imagen",
      "new_image": "Nueva imagen",
      "download": "Descargar",
      "image_failed": "No se pudo crear la imagen.",
      "image_alt": "Imagen de esta publicación",
      "save_first": "Guarda primero tus cambios.",
      "create_first": "Crea primero la publicación para usar la IA.",
      "working": "La IA está trabajando…",
      "brief_field": {
        "visual_type": "Tipo", "aspect_ratio": "Formato", "style": "Estilo", "description": "Descripción", "scene": "Escena",
        "mood": "Ambiente", "composition": "Composición", "text_overlay": "Texto en la imagen", "avoid": "Evitar"
      }
    },
    "actions": {
      "title": "Acciones",
      "ready": "Marcar como lista",
      "published": "Marcar como publicada",
      "published_url": "Enlace a la publicación (opcional)",
      "confirm_published": "Marcar como publicada",
      "invalid_url": "Escribe un enlace completo que empiece por https://",
      "published_on": "Publicada {{when}}",
      "open_published": "Abrir la publicación",
      "duplicate": "Duplicar",
      "copy": "Copiar texto",
      "copied": "Copiado",
      "delete": "Eliminar",
      "delete_confirm": "¿Eliminar esta publicación? No se puede deshacer.",
      "delete_yes": "Eliminar publicación"
    }
  },
  "save": {
    "error": {
      "published_cannot_move": "Una publicación publicada conserva la fecha en que salió.",
      "invalid": "Hay campos que revisar.",
      "not_found": "Esta publicación ya no existe.",
      "no_profile": "Esta marca aún no está configurada.",
      "unknown": "No se pudo guardar la publicación. Inténtalo de nuevo."
    }
  },
  "ai": {
    "error": {
      "ai_budget_used_up": "El presupuesto de IA de este mes se ha agotado. Puedes seguir escribiendo a mano.",
      "ai_failed": "La IA no pudo terminar. Inténtalo de nuevo.",
      "not_found": "Esta publicación ya no existe.",
      "unknown": "La IA no pudo terminar. Inténtalo de nuevo."
    }
  },
  "action": {
    "error": {
      "invalid": "Revisa el enlace e inténtalo de nuevo.",
      "not_found": "Esta publicación ya no existe.",
      "unknown": "No funcionó. Inténtalo de nuevo."
    }
  },
  "find": {
    "posts": "Publicaciones", "actions": "Acciones", "go_to": "Ir a", "searching": "Buscando publicaciones…",
    "theme_dark": "Pasar a oscuro", "theme_light": "Pasar a claro", "shortcuts": "Atajos de teclado",
    "collapse": "Contraer menú", "expand": "Expandir menú"
  },
  "shortcuts": {
    "find": "Buscar", "help": "Esta lista", "on_plan": "En el plan", "this_week": "Esta semana",
    "pages": "Semana anterior o siguiente (mes en la vista de mes)", "views": "Semana, mes, lista",
    "move": "Mover un día la publicación seleccionada", "close": "Cerrar el panel"
  }
}
```

- [ ] **Step 5: Run**: `"$R2B/vt.sh" src/content` and `cd frontend && npx tsc -b`
Expected:
- Vitest: PASS (`api`, `brand`, `postText`, `errors`, `shortcuts`, `contentLocales` and `tokens` — the tokens sweep scans the ten library files).
- tsc: clean (`resolveJsonModule` is already on: Appointments imports its bundles the same way).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: the API layer, brand memory, shortcuts and every word in five languages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---
### Task 2: The frame — provider, panel state, shell, route, Content's colours and the mood exclusion

**Files:**
- Create:
  - `frontend/src/content/ContentProvider.tsx`, `ContentShell.tsx`, `ContentApp.tsx`
  - `frontend/src/content/panel/PanelProvider.tsx`
  - `frontend/src/content/theme/content.css`
  - `frontend/src/workspace/theme/moodExclusion.test.ts`
- Modify:
  - `frontend/src/App.tsx`, `frontend/src/index.css`
  - `frontend/src/theme/ownTokenDirs.ts` and `ownTokenDirs.test.ts`
  - `frontend/src/i18n/localeCompleteness.test.ts`, `frontend/src/workspace/theme/contrast.test.ts`
- Test: `frontend/src/content/ContentShell.test.tsx`, `frontend/src/content/theme/contentCss.test.ts`, `frontend/src/content/panel/panelProvider.test.ts`

**Interfaces:**
- Consumes: Task 1 (`contentApi`, `failureOf`, `onWorkspaceOff`, `loadBootstrap`, `storedBrand`, `rememberBrand`, `deviceStorage`, `APP_NAME`, `fullAdminPath`, `loginPath`, `useLook`, `loadBrandPaint`, `rememberBrandPaint`, `onShortcuts`, `registerContentLocales`).
- Produces:
  - `ContentContext`, `ContentContextValue` `{data, isLoading, isError, error, refetch, switchBrand}`.
  - `useContent()`, `useBoot(): Bootstrap`, `useApi(): ContentApi`, `useBrandId(): number | null`.
  - `PanelProvider({initial?, children})` and `usePanel(): PanelApi` `{target, open(id), openNew(draft), close(), replace(id), reportDirty(dirty), guard()}`.
  - `PanelTarget`, `NewDraft` `{date, platform}`, `mayDrop(dirty, ask)`.
  - `ContentShell` (prop `children`; its `overlays` start as `null`: Task 7 and Task 9 fill them).
  - `ContentApp` at `/content/*`.
  - CSS classes:
    - `.c-mark` (platform fill and ink) and `.c-edge` (platform edge), both under `[data-platform]`;
    - `.c-st-dot`, `.c-st-text`, `.c-st-tint`, under `[data-status]`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/panel/panelProvider.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mayDrop } from './PanelProvider'

describe('mayDrop', () => {
  it('lets anything go ahead without unsaved edits, and with edits only when the person says so', () => {
    const ask = vi.fn(() => false)
    expect(mayDrop(false, ask)).toBe(true)
    expect(ask).not.toHaveBeenCalled()
    expect(mayDrop(true, ask)).toBe(false)
    expect(mayDrop(true, () => true)).toBe(true)
  })
})
```

`frontend/src/content/ContentShell.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ContentContext, type ContentContextValue } from './ContentProvider'
import { ContentShell } from './ContentShell'
import { PanelProvider } from './panel/PanelProvider'
import type { Bootstrap } from './lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))
vi.mock('../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))
vi.mock('../i18n', () => ({ SUPPORTED_LANGUAGES: [{ code: 'en', label: 'English' }, { code: 'ru', label: 'Русский' }] }))
vi.mock('../lib/api', () => ({ api: {} }))

const boot: Bootstrap = {
  name: 'HexaTech Content',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' },
  brands: [{ id: 3, name: 'Lumière Salon' }],
  accent: '#7c5cff',
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Vitalij K', role: 'manager', can_manage: true },
  profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 20 },
  platforms: ['instagram', 'linkedin'],
  statuses: ['draft', 'published'],
  rewrites: ['shorter'],
}
const staff = { name: 'Sam', role: 'staff', can_manage: false }

function render(value: Partial<ContentContextValue> = {}, data: Partial<Bootstrap> = {}) {
  const full: ContentContextValue = { data: { ...boot, ...data }, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {}, ...value }
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/content']}>
      <Routes>
        <Route path="/" element={<p>full admin dashboard</p>} />
        <Route path="/content/*" element={
          <ContentContext.Provider value={full}>
            <PanelProvider><ContentShell><p>page body</p></ContentShell></PanelProvider>
          </ContentContext.Provider>
        } />
      </Routes>
    </MemoryRouter>,
  )
}
const refused = (code: string) => ({ response: { status: 403, data: { error: code } } })

describe('ContentShell', () => {
  it('is the token scope, names the product and the organisation, and draws the page', () => {
    const html = render()
    expect(html).toContain('data-workspace=""')
    expect(html).toContain('data-content=""')
    expect(html).toContain('HexaTech Content')
    expect(html).toContain('Lumière Salon')
    expect(html).toContain('page body')
    expect(html).toContain('New post')
  })

  it('offers the brand switcher only to someone with more than one brand, and keeps it out of the desktop-only block', () => {
    expect(render()).not.toContain('data-brand-switcher')
    const html = render({}, { brands: [{ id: 3, name: 'Lumière Salon' }, { id: 7, name: 'Second Studio' }] })
    const label = html.match(/<label[^>]*data-brand-switcher[^>]*>/)?.[0] ?? ''
    expect(label).not.toBe('')
    expect(label).not.toContain('hidden')
    expect(html).toContain('Second Studio')
  })

  it('warns at 80 % of the AI budget and says when it is used up', () => {
    // (Static markup writes an apostrophe as &#x27;: the expected words start after "month's".)
    expect(render({}, { ai: { status: 'warn', percent: 85 } })).toContain('AI budget is 85 % used.')
    expect(render({}, { ai: { status: 'over', percent: 100 } })).toContain('AI budget is used up.')
    expect(render()).not.toContain('AI budget')
  })

  it('says a brand is not set up yet, in the manager\'s words or the staff member\'s', () => {
    expect(render({}, { profile: null })).toContain('This brand is not set up yet')
    expect(render({}, { profile: { id: 1, setup_completed: false, readiness: 10 }, staff })).toContain('Your manager has not set up this brand yet.')
  })

  it('stops calmly when Content is switched off, and says it is loading while it loads', () => {
    const html = render({ isError: true, error: refused('workspace_disabled') })
    expect(html).toContain('switched off')
    expect(html).toContain('Open the full admin')
    expect(html).not.toContain('page body')
    expect(render({ data: undefined, isLoading: true })).toContain('role="status"')
  })

  it('opens the full admin at the Marketing hub for managers and at the dashboard for staff', () => {
    expect(render()).toContain('href="/marketing"')
    expect(render({}, { staff })).not.toContain('href="/marketing"')
  })
})
```

`frontend/src/content/theme/contentCss.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Content's own colours (spec §6.2): every platform's mark reads (white ink while white reads 3:1 on the fill,
 * else the dark ink — owner, 2026-10-09), and every post status's tone reads 4.5:1 as text over its own 12 % tint
 * and on the bare canvas and surface, in Light and in Dark.
 */
const css = readFileSync(new URL('./content.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const workspace = readFileSync(new URL('../../workspace/theme/workspace.css', import.meta.url), 'utf8')

function block(source: string, selector: string, prefix: string): Record<string, number[]> {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) return {}
  const body = source.slice(start, source.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(new RegExp(`--${prefix}([a-z0-9-]+):\\s*(\\d+) (\\d+) (\\d+);`, 'g'))) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return vars
}
const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const tint = (tone: number[], under: number[], k = 0.12) => tone.map((v, i) => v * k + under[i] * (1 - k))

const WHITE = [255, 255, 255]
const PLATFORMS = ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email']
const STATUSES = ['idea', 'draft', 'review', 'visual', 'approved', 'ready', 'published', 'skipped', 'archived']
const pf = (p: string, dark: boolean) => ({
  ...block(css, `[data-content] [data-platform="${p}"]`, 'c-'),
  ...(dark ? block(css, `[data-content][data-theme="dark"] [data-platform="${p}"]`, 'c-') : {}),
})
const THEMES = [
  { name: 'light', dark: false, own: block(css, '[data-content]', 'c-'), surfaces: block(workspace, '[data-workspace]', 'a-') },
  {
    name: 'dark', dark: true,
    own: { ...block(css, '[data-content]', 'c-'), ...block(css, '[data-content][data-theme="dark"]', 'c-') },
    surfaces: { ...block(workspace, '[data-workspace]', 'a-'), ...block(workspace, '[data-workspace][data-theme="dark"]', 'a-') },
  },
]

for (const theme of THEMES) {
  describe(`content colours — ${theme.name}`, () => {
    for (const p of PLATFORMS) {
      it(`${p}: white ink while white reads 3:1 on its fill, else the dark ink — and the ink reads`, () => {
        const v = pf(p, theme.dark)
        expect(v.pf, `--c-pf of ${p}`).toBeDefined()
        const white = ratio(WHITE, v.pf) >= 3
        expect(v['pf-ink']).toEqual(white ? WHITE : theme.own.ink)
        expect(ratio(v['pf-ink'], v.pf)).toBeGreaterThanOrEqual(white ? 3 : 4.5)
      })
    }
    for (const s of STATUSES) {
      for (const under of ['canvas', 'surface']) {
        it(`status ${s} reads 4.5:1 over its tint on ${under}, and on ${under} itself`, () => {
          const tone = theme.own[`st-${s}`]
          expect(tone, `--c-st-${s}`).toBeDefined()
          expect(ratio(tone, tint(tone, theme.surfaces[under]))).toBeGreaterThanOrEqual(4.5)
          expect(ratio(tone, theme.surfaces[under])).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  })
}

describe('content stylesheet', () => {
  it('maps every status the server sends to a tone', () => {
    for (const s of ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived']) {
      expect(css, s).toContain(`[data-content] [data-status="${s}"]`)
    }
  })
})
```

`frontend/src/workspace/theme/moodExclusion.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The full admin's Branding "mood" typography ([data-mood] on <html>) must never reach a workspace (spec §6.1):
 * each workspace marks <html data-shell="<name>"> (src/workspace/lib/shellMark.ts), and every mood rule excludes
 * every workspace's mark.
 */
const WORKSPACES = ['appointments', 'content']

describe('mood typography', () => {
  const rules = readFileSync(new URL('../../index.css', import.meta.url), 'utf8').split('\n').filter(line => line.includes('[data-mood="') && line.trim().startsWith(':root'))

  it('has its rules where this test looks (the scan is not empty)', () => {
    expect(rules.length).toBeGreaterThanOrEqual(8)
  })

  for (const name of WORKSPACES) {
    it(`stays out of the ${name} workspace`, () => {
      expect(rules.filter(rule => !rule.includes(`[data-shell="${name}"]`))).toEqual([])
    })
  }
})
```

Run: `"$R2B/vt.sh" src/content src/workspace/theme/moodExclusion.test.ts`
Expected: FAIL (`ContentProvider`, `ContentShell`, `PanelProvider` and `content.css` missing; the mood test fails for `content`).

- [ ] **Step 2: Write the provider and the panel state**

`frontend/src/content/ContentProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { contentApi, failureOf, onWorkspaceOff, type ContentApi } from './lib/api'
import { deviceStorage, loadBootstrap, rememberBrand, storedBrand } from './lib/brand'
import { APP_NAME } from './lib/constants'
import type { Bootstrap } from './lib/types'

export interface ContentContextValue {
  data: Bootstrap | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  /** Work on another brand from now on. The caller has already asked about unsaved edits. */
  switchBrand: (id: number) => void
}

// The context, its hooks and the provider stay in one small module, like Appointments' provider.
// eslint-disable-next-line react-refresh/only-export-components
export const ContentContext = createContext<ContentContextValue>({
  data: undefined, isLoading: true, isError: false, error: null, refetch: () => {}, switchBrand: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function useContent(): ContentContextValue {
  return useContext(ContentContext)
}

/** The loaded bootstrap. The shell renders a page only once it has one. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBoot(): Bootstrap {
  const { data } = useContext(ContentContext)
  if (!data) throw new Error('useBoot() was called before the Content bootstrap loaded')
  return data
}

/** The brand every call works on: the start of every query key after 'content'. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBrandId(): number | null {
  return useBoot().brand?.id ?? null
}

/** The calls, for the brand the portal works on. */
// eslint-disable-next-line react-refresh/only-export-components
export function useApi(): ContentApi {
  const brand = useBrandId()
  return useMemo(() => contentApi(brand), [brand])
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // The brand to ask for: this device's last one here, else the full admin's choice, else the person's default (spec §6.7).
  const [asked, setAsked] = useState<number | null>(() => storedBrand(deviceStorage()))
  const query = useQuery({
    queryKey: ['content', 'bootstrap', asked],
    queryFn: () => loadBootstrap(asked, deviceStorage(), brand => contentApi(brand).bootstrap()),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: (count, error) => {
      const status = failureOf(error).status
      return status !== 403 && status !== 401 && count < 2
    },
  })

  // Switched off while this window was open: ask again, so the shell says so instead of a page that stops loading.
  const { refetch } = query
  useEffect(() => onWorkspaceOff(() => { void refetch() }), [refetch])

  // The brand the server works on is the one this device asks for next time.
  const brandId = query.data?.brand?.id ?? null
  useEffect(() => { if (brandId !== null) rememberBrand(deviceStorage(), brandId) }, [brandId])

  useEffect(() => {
    const previous = document.title
    document.title = APP_NAME
    return () => { document.title = previous }
  }, [])

  const switchBrand = useCallback((id: number) => {
    rememberBrand(deviceStorage(), id)
    // Nothing of one brand may show under the next.
    queryClient.removeQueries({ predicate: q => q.queryKey[0] === 'content' && q.queryKey[1] !== 'bootstrap' })
    setAsked(id)
  }, [queryClient])

  return (
    <ContentContext.Provider value={{
      data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error,
      refetch: () => { void query.refetch() }, switchBrand,
    }}>
      {children}
    </ContentContext.Provider>
  )
}
```

`frontend/src/content/panel/PanelProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { DateKey, Platform } from '../lib/types'

/** What a new post starts from: the day and platform a slot or the New post button gave. */
export interface NewDraft { date: DateKey | null; platform: Platform | null }
/** What the post panel shows. `seq` remounts it for every opening, so no state leaks from one post to the next. */
export type PanelTarget = { kind: 'post'; id: number; seq: number } | { kind: 'new'; draft: NewDraft; seq: number }

export interface PanelApi {
  target: PanelTarget | null
  /** Open a post; false when the person chose to keep their unsaved edits. */
  open: (id: number) => boolean
  openNew: (draft: NewDraft) => boolean
  /** Close; false when the person chose to keep their unsaved edits. */
  close: () => boolean
  /** Show another post without asking: the one just created, or the copy just made. */
  replace: (id: number) => void
  /** The panel says whether it holds unsaved edits. */
  reportDirty: (dirty: boolean) => void
  /** Ask before something else that would drop unsaved edits; true to go ahead. */
  guard: () => boolean
}

/** Whether something that drops unsaved edits may go ahead: always without edits; with edits only when the person says so. */
// eslint-disable-next-line react-refresh/only-export-components
export function mayDrop(dirty: boolean, ask: () => boolean): boolean {
  return !dirty || ask()
}

const PanelContext = createContext<PanelApi | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function usePanel(): PanelApi {
  const value = useContext(PanelContext)
  if (!value) throw new Error('usePanel() was called outside PanelProvider')
  return value
}

/**
 * The post panel's state for the whole portal (spec §4.3). It stays open
 * across the pages, so moving between them never drops an edit; everything
 * that would drop one — closing it, opening another post, switching brand,
 * leaving the site — asks first.
 */
export function PanelProvider({ initial = null, children }: {
  /** What the panel shows on its first render (the tests open a post this way). */
  initial?: PanelTarget | null
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [target, setTarget] = useState<PanelTarget | null>(initial)
  const dirty = useRef(false)
  const seq = useRef(initial?.seq ?? 0)

  const guard = useCallback(() => {
    const ok = mayDrop(dirty.current, () => window.confirm(t('content.panel.discard', 'Discard your unsaved changes to this post?')))
    if (ok) dirty.current = false
    return ok
  }, [t])

  const open = useCallback((id: number) => {
    if (target?.kind === 'post' && target.id === id) return true
    if (!guard()) return false
    seq.current += 1
    setTarget({ kind: 'post', id, seq: seq.current })
    return true
  }, [target, guard])

  const openNew = useCallback((draft: NewDraft) => {
    if (!guard()) return false
    seq.current += 1
    setTarget({ kind: 'new', draft, seq: seq.current })
    return true
  }, [guard])

  const close = useCallback(() => {
    if (!guard()) return false
    setTarget(null)
    return true
  }, [guard])

  const replace = useCallback((id: number) => {
    dirty.current = false
    seq.current += 1
    setTarget({ kind: 'post', id, seq: seq.current })
  }, [])

  const reportDirty = useCallback((value: boolean) => { dirty.current = value }, [])

  // Leaving the site (a reload, a closed tab) with unsaved edits asks the browser's own question.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault() }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  const value = useMemo<PanelApi>(() => ({ target, open, openNew, close, replace, reportDirty, guard }), [target, open, openNew, close, replace, reportDirty, guard])
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}
```

- [ ] **Step 3: Write the shell and the app**

`frontend/src/content/ContentShell.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus, Search } from 'lucide-react'
import { WorkspaceShell, type WorkspaceNavItem } from '../workspace/WorkspaceShell'
import { firstLetter } from '../workspace/lib/firstLetter'
import { accentTokens } from '../workspace/theme/accent'
import { Button } from '../workspace/ui/Button'
import { Notice } from '../workspace/ui/Notice'
import { useContent } from './ContentProvider'
import { failureOf } from './lib/api'
import { APP_NAME } from './lib/constants'
import { fullAdminPath } from './lib/links'
import { loadBrandPaint, rememberBrandPaint, useLook } from './lib/look'
import { onShortcuts } from './lib/shortcuts'
import { usePanel } from './panel/PanelProvider'

/**
 * HexaTech Content on the shared frame (WorkspaceShell): its areas in the
 * side panel, the organisation's brand colour as the accent; in the top bar
 * the organisation and the brand (a switcher when the person may use more
 * than one), Find and New post; and the notices that explain why something
 * is not available. "Full admin" opens the Marketing hub for managers and
 * the dashboard for staff.
 */
export function ContentShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { data, isLoading, isError, error, refetch, switchBrand } = useContent()
  const panel = usePanel()
  const [findOpen, setFindOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const main = useRef<HTMLElement>(null)
  const findButton = useRef<HTMLButtonElement>(null)
  const arrived = useRef(false)

  // The link that led to a page is gone with the page it was on: the keyboard starts again from the page, not the top.
  useEffect(() => {
    if (!arrived.current) { arrived.current = true; return }
    if (document.activeElement === document.body) main.current?.focus()
  }, [pathname])

  // While the bootstrap loads, the frame wears the accent and mark this device last saw (lib/look.ts).
  const look = useLook()
  const [remembered] = useState(loadBrandPaint)
  const accent = accentTokens(data ? data.accent : remembered?.accent, look.resolved)
  const initial = data ? firstLetter(data.organization.name, 'H') : (remembered?.initial ?? 'H')
  const known = Boolean(data)
  const brandHex = accent.accent
  useEffect(() => { if (known) rememberBrandPaint({ accent: brandHex, initial }) }, [known, brandHex, initial])

  const refusal = isError ? failureOf(error).code : ''
  const switchedOff = refusal === 'workspace_disabled'
  const lapsed = refusal === 'subscription_required'
  const stopped = switchedOff || lapsed
  // Find, the shortcuts and the panel need the workspace: not while it loads, and not once it has stopped.
  const ready = Boolean(data) && !stopped
  if (findOpen && !ready) setFindOpen(false)
  if (helpOpen && !ready) setHelpOpen(false)
  const today = data?.venue.today ?? null
  const { openNew, close } = panel

  // Shortcuts for every page (spec §4.7): Find, the list of shortcuts, a new post. The Plan hears its own.
  useEffect(() => {
    if (!ready || today === null) return
    return onShortcuts(window, document, (hit, e) => {
      if (hit === 'find') setFindOpen(true)
      else if (hit === 'help') setHelpOpen(true)
      else if (hit === 'new') openNew({ date: today, platform: null })
      else return
      e.preventDefault()
    })
  }, [ready, today, openNew])

  // An organisation that never had Content: the route is not for them.
  if (switchedOff && !data) return <Navigate to="/" replace />

  const nav: WorkspaceNavItem[] = [
    { to: '/content', end: true, icon: CalendarDays, label: t('content.nav.plan', 'Plan') },
  ]
  const findLabel = t('content.shell.find', 'Find a post or action')
  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl'
  const canManage = Boolean(data?.staff.can_manage)
  const setUp = data?.profile?.setup_completed === true
  // Another brand drops the open post: the panel asks first (spec §6.7).
  const chooseBrand = (id: number) => { if (data && id > 0 && id !== data.brand?.id && close()) switchBrand(id) }

  return (
    <WorkspaceShell workspace="content" look={look} accent={accent} initial={initial}
      organization={data?.organization.name} product={data?.name ?? APP_NAME} person={data?.staff.name}
      nav={nav}
      fullAdmin={fullAdminPath(canManage)}
      header={<>
        <div className="min-w-0">
          <div className="hidden truncate text-sm font-semibold md:block">{data?.organization.name}</div>
          {data && data.brands.length > 1 ? (
            <label data-brand-switcher="" className="block">
              <span className="sr-only">{t('content.shell.brand', 'Brand')}</span>
              <select value={data.brand?.id ?? ''} onChange={(e) => chooseBrand(Number(e.target.value))}
                className="max-w-[12rem] truncate rounded-md border border-a-border bg-a-surface px-1.5 py-0.5 text-xs text-a-text">
                {data.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          ) : data?.brand && data.brand.name !== data.organization.name && (
            <div className="hidden truncate text-xs text-a-text-2 md:block">{data.brand.name}</div>
          )}
        </div>
        <button ref={findButton} type="button" onClick={() => { if (ready) setFindOpen(true) }} disabled={!ready} aria-label={findLabel} aria-haspopup="dialog"
          className="flex min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-a-border bg-a-surface p-2 text-left text-sm text-a-text-2 shadow-a-sm enabled:hover:border-a-text-2/40 disabled:opacity-60 sm:max-w-md sm:flex-1 sm:shrink sm:justify-start sm:px-3 lg:ml-4">
          <Search size={15} aria-hidden className="shrink-0" />
          <span className="hidden min-w-0 truncate sm:inline">{findLabel}</span>
          <kbd className="ml-auto hidden shrink-0 rounded-md border border-a-border px-1.5 font-a-mono text-xs sm:inline">{modKey} K</kbd>
        </button>
        <button type="button" onClick={() => { if (today !== null) openNew({ date: today, platform: null }) }} disabled={!ready}
          aria-label={t('content.shell.new_post', 'New post')}
          className="ml-auto inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-a-accent px-3 py-2 text-sm font-semibold text-a-accent-ink shadow-a-sm transition hover:bg-a-accent-deep disabled:opacity-60 sm:px-4 [@media(hover:hover)]:hover:-translate-y-px">
          <Plus size={16} aria-hidden /><span className="hidden sm:inline">{t('content.shell.new_post', 'New post')}</span>
        </button>
      </>}
      overlays={null}>
      {stopped && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="warning">
            {lapsed
              ? t('content.shell.subscription_required', "Your organisation's subscription is not active, so HexaTech Content cannot open. Your posts are unchanged. An administrator can restore access under Billing in the full admin.")
              : t('content.shell.switched_off', 'HexaTech Content has been switched off for your organisation. Your posts are unchanged.')}
          </Notice>
          <Link to="/" className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
            {t('content.shell.open_full_admin', 'Open the full admin')}
          </Link>
        </div>
      )}

      {!stopped && isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('content.common.loading', 'Loading…')}</p>}

      {!stopped && isError && !data && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={refetch}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}

      {!stopped && data && (
        <>
          {(data.ai.status === 'warn' || data.ai.status === 'over' || !setUp) && (
            <div className="space-y-2 px-4 pt-3 lg:px-6">
              {data.ai.status === 'warn' && (
                <Notice tone="warning">{t('content.shell.budget_warn', "This month's AI budget is {{percent}} % used.", { percent: data.ai.percent ?? 80 })}</Notice>
              )}
              {data.ai.status === 'over' && (
                <Notice tone="danger">{t('content.shell.budget_over', "This month's AI budget is used up. AI actions are paused until next month; writing by hand still works.")}</Notice>
              )}
              {!setUp && (
                <Notice tone="info">
                  {canManage
                    ? t('content.shell.not_set_up_manager', 'This brand is not set up yet, so the AI does not know its voice and channels.')
                    : t('content.shell.not_set_up_staff', 'Your manager has not set up this brand yet.')}
                </Notice>
              )}
            </div>
          )}
          <main ref={main} tabIndex={-1} className="min-h-0 flex-1">{children}</main>
        </>
      )}
    </WorkspaceShell>
  )
}
```

`frontend/src/content/ContentApp.tsx`:

```tsx
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerWorkspaceLocales } from '../workspace/i18n'
import { ContentProvider } from './ContentProvider'
import { ContentShell } from './ContentShell'
import { registerContentLocales } from './i18n'
import { loginPath } from './lib/links'
import { PanelProvider } from './panel/PanelProvider'

registerWorkspaceLocales()
registerContentLocales()

/**
 * Everything under /content/* for a signed-in staff user (spec 2026-10-14).
 * Whether the organisation may use it is the server's answer (the bootstrap
 * is behind `workspace:content`); the shell turns a refusal into a way back
 * to the full admin. Signed out, the sign-in screen brings the visitor back.
 */
export function ContentApp() {
  const { token, user } = useAuthStore()
  const location = useLocation()
  if (!token) return <Navigate to={loginPath(location)} replace />
  if (user?.user_type === 'member') return <Navigate to="/portal" replace />

  return (
    <ContentProvider>
      <PanelProvider>
        <ContentShell>
          <Routes>
            <Route index element={null} />
            <Route path="*" element={<Navigate to="/content" replace />} />
          </Routes>
        </ContentShell>
      </PanelProvider>
    </ContentProvider>
  )
}
```

- [ ] **Step 4: Content's colours**: `frontend/src/content/theme/content.css`:

```css
/*
 * HexaTech Content's own rules. The Atelier fonts, tokens and the rules every
 * workspace shares live in src/workspace/theme/workspace.css; this file adds
 * what only Content draws: each platform's colour and the ink on it, and each
 * post status's tone. Every rule is scoped under [data-content], which sits
 * beside [data-workspace] on Content's root. Values are RGB triplets, read as
 * rgb(var(--…)) like the Atelier tokens (contentCss.test.ts checks them).
 */

[data-content] {
  /* The dark ink on a platform fill white does not read on (owner, 2026-10-09: white while it reads 3:1, else ink). */
  --c-ink: 20 24 28;
  /* Post statuses: a tone for the dot, and for text over a 12 % tint of itself. */
  --c-st-idea: 88 95 107;
  --c-st-draft: 44 70 108;
  --c-st-review: 138 80 0;
  --c-st-visual: 79 58 176;
  --c-st-approved: 13 94 110;
  --c-st-ready: 18 100 58;
  --c-st-published: 47 84 61;
  --c-st-skipped: 105 95 85;
  --c-st-archived: 88 95 107;
}

[data-content][data-theme="dark"] {
  --c-st-idea: 163 173 184;
  --c-st-draft: 169 193 227;
  --c-st-review: 240 179 90;
  --c-st-visual: 179 166 255;
  --c-st-approved: 94 200 214;
  --c-st-ready: 95 211 154;
  --c-st-published: 150 210 170;
  --c-st-skipped: 190 175 160;
  --c-st-archived: 163 173 184;
}

/* Each platform's colour, and the ink its mark's letters take. */
[data-content] [data-platform="linkedin"] { --c-pf: 10 102 194; --c-pf-ink: 255 255 255; }
[data-content] [data-platform="instagram"] { --c-pf: 225 48 108; --c-pf-ink: 255 255 255; }
[data-content] [data-platform="tiktok"] { --c-pf: 0 242 234; --c-pf-ink: 20 24 28; }
[data-content] [data-platform="facebook"] { --c-pf: 24 119 242; --c-pf-ink: 255 255 255; }
[data-content] [data-platform="x"] { --c-pf: 15 20 25; --c-pf-ink: 255 255 255; }
[data-content] [data-platform="youtube"] { --c-pf: 255 0 0; --c-pf-ink: 255 255 255; }
[data-content] [data-platform="blog"] { --c-pf: 245 158 11; --c-pf-ink: 20 24 28; }
[data-content] [data-platform="email"] { --c-pf: 139 92 246; --c-pf-ink: 255 255 255; }
/* X's black would vanish on the dark canvas: a pale mark there, with the dark ink. */
[data-content][data-theme="dark"] [data-platform="x"] { --c-pf: 231 233 234; --c-pf-ink: 20 24 28; }

[data-content] .c-mark {
  background-color: rgb(var(--c-pf));
  color: rgb(var(--c-pf-ink));
}

/* A card's platform edge: a 3 px line inside its left side. */
[data-content] .c-edge {
  box-shadow: inset 3px 0 0 rgb(var(--c-pf));
}

[data-content] [data-status="idea"] { --c-st: var(--c-st-idea); }
[data-content] [data-status="draft"] { --c-st: var(--c-st-draft); }
[data-content] [data-status="needs_review"] { --c-st: var(--c-st-review); }
[data-content] [data-status="needs_visual"] { --c-st: var(--c-st-visual); }
[data-content] [data-status="approved"] { --c-st: var(--c-st-approved); }
[data-content] [data-status="ready_to_publish"] { --c-st: var(--c-st-ready); }
[data-content] [data-status="published"] { --c-st: var(--c-st-published); }
[data-content] [data-status="skipped"] { --c-st: var(--c-st-skipped); }
[data-content] [data-status="archived"] { --c-st: var(--c-st-archived); }

[data-content] .c-st-dot {
  background-color: rgb(var(--c-st));
}

[data-content] .c-st-text {
  color: rgb(var(--c-st));
}

[data-content] .c-st-tint {
  background-color: rgb(var(--c-st) / 0.12);
}
```

- [ ] **Step 5: Wire it into the app**
  - **`frontend/src/index.css`:**
    - After the line `@import './appointments/theme/appointments.css';` add `@import './content/theme/content.css';`.
    - Then, in each of the eight `:root:where(:not(...))[data-mood="…"]` rules (lines 69–126), replace `[data-shell="appointments"]))` with `[data-shell="appointments"], [data-shell="content"]))`. Use one Edit with `replace_all: true` on the exact string `[data-shell="appointments"]))`.
  - **`frontend/src/App.tsx`:**
    - After the `const AppointmentsRoutes = lazy(...)` line, add:
      ```tsx
      // HexaTech Content (spec 2026-10-14): one lazy chunk and its own shell, like Appointments.
      const ContentRoutes = lazy(() => import('./content/ContentApp').then(m => ({ default: m.ContentApp })))
      ```
    - In `AuthedFloatingAiChat`, replace the two lines
      ```tsx
        // The workspace is a focused product: the full admin's copilot stays out.
        if (pathname.startsWith('/appointments')) return null
      ```
      with
      ```tsx
        // A workspace is a focused product: the full admin's copilot stays out.
        if (/^\/(appointments|content)(\/|$)/.test(pathname)) return null
      ```
    - After the `/appointments/*` route line, add:
      ```tsx
                {/* HexaTech Content — same login, a third staff shell. */}
                <Route path="/content/*" element={<ChunkErrorBoundary><Suspense fallback={<PageLoader />}><ContentRoutes /></Suspense></ChunkErrorBoundary>} />
      ```
  - **`frontend/src/theme/ownTokenDirs.ts`:**
    - Replace `['portal', 'appointments', 'workspace']` with `['portal', 'appointments', 'workspace', 'content']`.
    - In its comment, replace "the Appointments workspace and the shared workspace core (Atelier a-*)" with "the Appointments and Content workspaces and the shared workspace core (Atelier a-*)".
  - **`frontend/src/theme/ownTokenDirs.test.ts`:**
    - Replace `it('are the member portal, Appointments and the shared workspace core', () => {` with `it('are the member portal, Appointments, the shared workspace core and Content', () => {`.
    - Replace `toEqual(['portal', 'appointments', 'workspace'])` with `toEqual(['portal', 'appointments', 'workspace', 'content'])`.
  - **`frontend/src/i18n/localeCompleteness.test.ts`:**
    - After `path.join(SRC_DIR, 'workspace'),` add `path.join(SRC_DIR, 'content'),`.
    - In `KEY_PREFIXES`, after `'workspace.'` add `, 'content.'`.
    - In `readLocale`, before `return { ...common, portal, appointments, workspace }`, add:
      ```ts
        // HexaTech Content registers its bundle under `content` the same way (src/content/i18n/index.ts).
        const contentFile = path.join(SRC_DIR, 'content/i18n', `content.${locale}.json`)
        const content = fs.existsSync(contentFile) ? JSON.parse(fs.readFileSync(contentFile, 'utf8')) : {}
      ```
      and change the return to `return { ...common, portal, appointments, workspace, content }`.
  - **`frontend/src/workspace/theme/contrast.test.ts`:**
    - Replace the `SOURCE_DIRS` line with:
      ```ts
      const SOURCE_DIRS = ['..', '../../appointments', '../../content'].map(dir => fileURLToPath(new URL(dir, import.meta.url)))
      ```
    - In its comment, replace "the shared core and every workspace built on it." with "the shared core and every workspace built on it (Appointments, Content)."

- [ ] **Step 6: Run**

```bash
"$R2B/vt.sh" src/content src/workspace src/theme/ownTokenDirs.test.ts src/i18n/localeCompleteness.test.ts src/appointments
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && npx eslint src/content src/workspace src/App.tsx
```
Expected: all PASS, tsc clean and no eslint error. Appointments is unchanged, so its suites must still pass.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src && git commit -q -F - <<'EOF'
Content portal: the frame at /content — provider, panel state, shell, colours

The bootstrap is asked for the brand this device remembers (a brand the
person may no longer use is forgotten); the shell carries the brand
switcher, Find, New post and the budget and setup notices; content.css
gives each platform its colour and ink and each status its tone; the mood
typography stays out of Content too.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The Plan's maths and remembered choices

**Files:**
- Create: `frontend/src/content/plan/planMath.ts`, `frontend/src/content/plan/prefs.ts`
- Test: `frontend/src/content/plan/planMath.test.ts`, `frontend/src/content/plan/prefs.test.ts`

**Interfaces:**
- Consumes: `wallClock` (`addDays`, `addMonths`, `formatDate`, `monthGrid`, `monthOf`, `weekOf`) and Task 1 types.
- Produces:
  - `PlanView = 'week' | 'month' | 'list'`, `PlanRange {from, to, days}`.
  - `rangeFor(view, date)`, `shiftDate(view, date, step)`, `byTime(a, b)`.
  - `DayPlan {date, posts, slots}`, `plansFor(days, posts, slots)`.
  - `PlanFilter {platforms, status}`, `NO_FILTER`, `filtered(posts, slots, filter)`, `togglePlatform(chosen, p)`.
  - `rangeLabel(view, range, date, locale)`, `inMonth(day, date)`, `presentPlatforms(order, posts, slots, chosen)`, `slotKey(slot)`.
  - `PREFS_KEY`, `PlanPrefs {view, filter}`, `DEFAULT_PREFS`, `parsePrefs(raw, platforms, statuses)`, `loadPrefs(platforms, statuses)`, `savePrefs(prefs)`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/plan/planMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PostCard, Slot } from '../lib/types'
import { byTime, filtered, inMonth, plansFor, presentPlatforms, rangeFor, rangeLabel, shiftDate, slotKey, togglePlatform } from './planMath'

const post = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: null, status: 'draft',
  title: null, hook: `Post ${id}`, topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', ...more,
})

describe('rangeFor and shiftDate', () => {
  it('a week is Monday to Sunday around the day; a month is the six Monday-first weeks that hold it', () => {
    expect(rangeFor('week', '2026-10-08')).toMatchObject({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeFor('list', '2026-10-08').days).toHaveLength(7)
    const month = rangeFor('month', '2026-10-08')
    expect(month).toMatchObject({ from: '2026-09-28', to: '2026-11-08' })
    expect(month.days).toHaveLength(42)
  })

  it('pages by a week, or by a month landing on its first day', () => {
    expect(shiftDate('week', '2026-10-08', 1)).toBe('2026-10-15')
    expect(shiftDate('list', '2026-10-08', -1)).toBe('2026-10-01')
    expect(shiftDate('month', '2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDate('month', '2026-01-15', -1)).toBe('2025-12-01')
  })
})

describe('plansFor', () => {
  it('gives each day its posts — untimed first, then by time — and its slots', () => {
    const posts = [post(1, { scheduled_time: '14:00' }), post(2), post(3, { scheduled_time: '09:30' }), post(4, { scheduled_date: '2026-10-08' })]
    const slots: Slot[] = [{ date: '2026-10-07', platform: 'linkedin' }]
    const [wed, thu] = plansFor(['2026-10-07', '2026-10-08'], posts, slots)
    expect(wed.posts.map(p => p.id)).toEqual([2, 3, 1])
    expect(wed.slots).toEqual(slots)
    expect(thu.posts.map(p => p.id)).toEqual([4])
    expect(thu.slots).toEqual([])
    expect([post(5), post(6)].sort(byTime).map(p => p.id)).toEqual([5, 6])
  })
})

describe('filters', () => {
  const posts = [post(1), post(2, { platform: 'linkedin', status: 'published' })]
  const slots: Slot[] = [{ date: '2026-10-07', platform: 'instagram' }, { date: '2026-10-07', platform: 'linkedin' }]

  it('no platform chosen means every platform; the status filters posts, never slots', () => {
    expect(filtered(posts, slots, { platforms: [], status: 'all' })).toEqual({ posts, slots })
    expect(filtered(posts, slots, { platforms: ['linkedin'], status: 'all' })).toEqual({ posts: [posts[1]], slots: [slots[1]] })
    expect(filtered(posts, slots, { platforms: [], status: 'draft' })).toEqual({ posts: [posts[0]], slots })
  })

  it('toggles a chip, and offers the chips the plan shows (or the person chose), in the brand\'s order', () => {
    expect(togglePlatform(['instagram'], 'linkedin')).toEqual(['instagram', 'linkedin'])
    expect(togglePlatform(['instagram', 'linkedin'], 'instagram')).toEqual(['linkedin'])
    expect(presentPlatforms(['linkedin', 'instagram', 'tiktok', 'x'], posts, [{ date: '2026-10-07', platform: 'tiktok' }], ['x']))
      .toEqual(['linkedin', 'instagram', 'tiktok', 'x'])
    expect(presentPlatforms(['linkedin', 'instagram'], [], [], [])).toEqual([])
  })
})

describe('labels', () => {
  it('names a week by its first and last day, and a month by its name', () => {
    expect(rangeLabel('week', rangeFor('week', '2026-10-08'), '2026-10-08', 'en-GB')).toBe('5 Oct – 11 Oct 2026')
    expect(rangeLabel('month', rangeFor('month', '2026-10-08'), '2026-10-08', 'en-GB')).toBe('October 2026')
  })

  it('tells the month grid which days belong to the month shown, and names a slot', () => {
    expect(inMonth('2026-10-31', '2026-10-08')).toBe(true)
    expect(inMonth('2026-11-01', '2026-10-08')).toBe(false)
    expect(slotKey({ date: '2026-10-07', platform: 'instagram' })).toBe('2026-10-07|instagram')
  })
})
```

`frontend/src/content/plan/prefs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, parsePrefs } from './prefs'

const PLATFORMS = ['instagram', 'linkedin']
const STATUSES = ['draft', 'published']

describe('parsePrefs', () => {
  it('reads a stored choice', () => {
    expect(parsePrefs(JSON.stringify({ view: 'month', filter: { platforms: ['linkedin'], status: 'draft' } }), PLATFORMS, STATUSES))
      .toEqual({ view: 'month', filter: { platforms: ['linkedin'], status: 'draft' } })
  })

  it('falls back one field at a time for anything unknown or broken', () => {
    expect(parsePrefs(null, PLATFORMS, STATUSES)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{not json', PLATFORMS, STATUSES)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ view: 'day', filter: { platforms: ['myspace', 'instagram', 3], status: 'gone' } }), PLATFORMS, STATUSES))
      .toEqual({ view: 'week', filter: { platforms: ['instagram'], status: 'all' } })
    expect(parsePrefs('"week"', PLATFORMS, STATUSES)).toEqual(DEFAULT_PREFS)
  })
})
```

Run: `"$R2B/vt.sh" src/content/plan`
Expected: FAIL (modules missing).

- [ ] **Step 2: Write** `frontend/src/content/plan/planMath.ts`:

```ts
import { addDays, addMonths, formatDate, monthGrid, monthOf, weekOf } from '../../workspace/lib/wallClock'
import type { DateKey, Platform, PostCard, PostStatus, Slot } from '../lib/types'

/** The Plan's views (spec §4.2): the week (default), the month, and the list, the only one below 1024 px. */
export type PlanView = 'week' | 'month' | 'list'
export interface PlanRange { from: DateKey; to: DateKey; days: DateKey[] }

/** The days a view shows around `date`: its Monday-first week (week and list), or the six weeks that hold its month. */
export function rangeFor(view: PlanView, date: DateKey): PlanRange {
  const days = view === 'month' ? monthGrid(monthOf(date)) : weekOf(date)
  return { from: days[0], to: days[days.length - 1], days }
}

/** One page back or forward: a week, or a month (landing on its first day). */
export function shiftDate(view: PlanView, date: DateKey, step: 1 | -1): DateKey {
  return view === 'month' ? `${addMonths(monthOf(date), step)}-01` : addDays(date, 7 * step)
}

/** Untimed posts first (spec §4.2), then by time, then oldest first. */
export function byTime(a: PostCard, b: PostCard): number {
  if (a.scheduled_time === null) return b.scheduled_time === null ? a.id - b.id : -1
  if (b.scheduled_time === null) return 1
  return a.scheduled_time.localeCompare(b.scheduled_time) || a.id - b.id
}

export interface DayPlan { date: DateKey; posts: PostCard[]; slots: Slot[] }

/** Each shown day with its posts, in order, and its open slots. */
export function plansFor(days: DateKey[], posts: PostCard[], slots: Slot[]): DayPlan[] {
  return days.map(date => ({
    date,
    posts: posts.filter(p => p.scheduled_date === date).sort(byTime),
    slots: slots.filter(s => s.date === date),
  }))
}

/** The platform chips and the status choice; no platform chosen means every platform. */
export interface PlanFilter { platforms: Platform[]; status: PostStatus | 'all' }
export const NO_FILTER: PlanFilter = { platforms: [], status: 'all' }

/** What the filters leave on the plan. Slots follow the platforms only: an empty slot has no status. */
export function filtered(posts: PostCard[], slots: Slot[], filter: PlanFilter): { posts: PostCard[]; slots: Slot[] } {
  const platformOk = (p: Platform) => filter.platforms.length === 0 || filter.platforms.includes(p)
  return {
    posts: posts.filter(p => platformOk(p.platform) && (filter.status === 'all' || p.status === filter.status)),
    slots: slots.filter(s => platformOk(s.platform)),
  }
}

export function togglePlatform(chosen: Platform[], platform: Platform): Platform[] {
  return chosen.includes(platform) ? chosen.filter(p => p !== platform) : [...chosen, platform]
}

/** The chips worth showing: the platforms the plan holds and those already chosen, in the brand's order. */
export function presentPlatforms(order: Platform[], posts: PostCard[], slots: Slot[], chosen: Platform[]): Platform[] {
  const seen = new Set<Platform>([...posts.map(p => p.platform), ...slots.map(s => s.platform), ...chosen])
  return order.filter(p => seen.has(p))
}

/** The toolbar's title: "5 Oct – 11 Oct 2026" for a week (or the list), "October 2026" for a month. */
export function rangeLabel(view: PlanView, range: PlanRange, date: DateKey, locale: string): string {
  if (view === 'month') return formatDate(`${monthOf(date)}-01`, locale, { month: 'long', year: 'numeric' })
  return `${formatDate(range.from, locale, { day: 'numeric', month: 'short' })} – ${formatDate(range.to, locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** Whether a day of the month grid belongs to the month shown (the days around it are dimmed). */
export const inMonth = (day: DateKey, date: DateKey): boolean => monthOf(day) === monthOf(date)

/** One slot's name, for the one being filled ("2026-10-07|instagram"). */
export const slotKey = (slot: Slot): string => `${slot.date}|${slot.platform}`
```

`frontend/src/content/plan/prefs.ts`:

```ts
import type { Platform, PostStatus } from '../lib/types'
import type { PlanFilter, PlanView } from './planMath'

/** The Plan's choices on this device: the view and the filters (spec §4.2). Kept apart from the look (lib/look.ts). */
export const PREFS_KEY = 'content:plan'

export interface PlanPrefs { view: PlanView; filter: PlanFilter }
export const DEFAULT_PREFS: PlanPrefs = { view: 'week', filter: { platforms: [], status: 'all' } }

const VIEWS: readonly PlanView[] = ['week', 'month', 'list']

/** Whatever is stored, a usable answer: anything unknown or broken falls back to the default, one field at a time. */
export function parsePrefs(raw: string | null, platforms: readonly string[], statuses: readonly string[]): PlanPrefs {
  let value: unknown = null
  try { value = raw ? JSON.parse(raw) : null } catch { value = null }
  const o = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const f = (o.filter && typeof o.filter === 'object' ? o.filter : {}) as Record<string, unknown>
  return {
    view: VIEWS.includes(o.view as PlanView) ? (o.view as PlanView) : DEFAULT_PREFS.view,
    filter: {
      platforms: Array.isArray(f.platforms) ? (f.platforms.filter(p => typeof p === 'string' && platforms.includes(p)) as Platform[]) : [],
      status: typeof f.status === 'string' && statuses.includes(f.status) ? (f.status as PostStatus) : 'all',
    },
  }
}

export function loadPrefs(platforms: readonly string[], statuses: readonly string[]): PlanPrefs {
  try {
    return parsePrefs(window.localStorage.getItem(PREFS_KEY), platforms, statuses)
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: PlanPrefs): void {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* a private window: the choice lasts this visit */ }
}
```

- [ ] **Step 3: Run**: `"$R2B/vt.sh" src/content/plan`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/plan && git commit -q -F - <<'EOF'
Content portal: the Plan's ranges, day plans, filters and remembered choices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---
### Task 4: The Plan's pieces — marks, cards, slots, the strip, the grids, the list, the tray, the toolbar

**Files:**
- Create:
  - `frontend/src/content/ui/PlatformMark.tsx`, `frontend/src/content/ui/StatusDot.tsx`
  - `frontend/src/content/plan/{PostCardView,SlotRow,WeekStrip,WeekGrid,MonthGrid,ListView,Tray,Toolbar}.tsx`
- Test: `frontend/src/content/plan/planPieces.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`PLATFORM_SHORT`, `cardLine`, types); Task 2 (`.c-mark`, `.c-edge`, `.c-st-*` classes); Task 3 (`DayPlan`, `PlanFilter`, `PlanView`, `inMonth`, `slotKey`, `togglePlatform`).
- Produces:
  - `PlatformMark({platform, size?})`, `StatusDot({status})`, `StatusPill({status})`.
  - `MOVE_HINT_ID`, `PostCardView({post, compact?, selected?, onOpen, onPointerDown?, onKeyDown?})`.
  - `SlotRow({slot, filling, aiPaused, onWrite, onFill})`, `WeekStrip({figures, pending})`.
  - `PlanHandlers {onOpen, onWrite, onFill, onCardPointerDown?, onCardKeyDown?}`.
  - `WeekGrid({plans, today, locale, selectedId, dropDate, fillingKey, aiPaused, …PlanHandlers})`.
  - `MonthGrid({plans, date, today, locale, selectedId, dropDate, onDay, onOpen, onCardPointerDown?, onCardKeyDown?})`.
  - `ListView({plans, today, locale, selectedId, fillingKey, aiPaused, onOpen, onWrite, onFill, onCardKeyDown?})`.
  - `Tray({posts, active, selectedId, onOpen, onCardPointerDown?, onCardKeyDown?})`.
  - `Toolbar({view, viewLocked, label, refreshing, canGenerate, filter, platforms, statuses, onPrev, onNext, onToday, onView, onFilter, onGenerate})`.
  - Drop targets carry `data-drop-date="YYYY-MM-DD"` (days) or `data-drop="tray"`; a card carries `data-post`, `data-movable` and `data-stop`.

- [ ] **Step 1: Write the failing test** `frontend/src/content/plan/planPieces.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { PostCard, Slot } from '../lib/types'
import { plansFor, rangeFor } from './planMath'
import { ListView } from './ListView'
import { MonthGrid } from './MonthGrid'
import { PostCardView } from './PostCardView'
import { SlotRow } from './SlotRow'
import { Toolbar } from './Toolbar'
import { Tray } from './Tray'
import { WeekGrid } from './WeekGrid'
import { WeekStrip } from './WeekStrip'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const html = (el: ReactElement) => renderToStaticMarkup(el)
const post = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: null, status: 'draft',
  title: null, hook: `Hook ${id}`, topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', ...more,
})
const noop = () => {}
const handlers = { onOpen: noop, onWrite: noop, onFill: noop }

describe('PostCardView', () => {
  it('draws the platform, the time, the hook and the status, and names the card for a screen reader', () => {
    const out = html(<PostCardView post={post(1, { scheduled_time: '09:30', image_url: '/img/1.png' })} onOpen={noop} onPointerDown={noop} />)
    expect(out).toContain('data-platform="instagram"')
    expect(out).toContain('09:30')
    expect(out).toContain('Hook 1')
    expect(out).toContain('data-status="draft"')
    expect(out).toContain('aria-label="instagram post, draft: Hook 1"')
    expect(out).toContain('src="/img/1.png"')
    expect(out).toContain('data-movable="true"')
    expect(out).toContain('aria-describedby="content-move-hint"')
  })

  it('keeps a published post where it went out, and calls a post with no words an untitled post', () => {
    const out = html(<PostCardView post={post(2, { status: 'published', hook: null })} onOpen={noop} onPointerDown={noop} />)
    expect(out).toContain('data-movable="false"')
    expect(out).not.toContain('aria-describedby')
    expect(out).toContain('Untitled post')
  })
})

describe('SlotRow', () => {
  const slot: Slot = { date: '2026-10-07', platform: 'linkedin' }
  it('offers Write and Fill with AI; while filling, or with the budget used up, Fill waits', () => {
    expect(html(<SlotRow slot={slot} filling={false} aiPaused={false} onWrite={noop} onFill={noop} />)).toContain('aria-label="Empty linkedin slot"')
    const filling = html(<SlotRow slot={slot} filling aiPaused={false} onWrite={noop} onFill={noop} />)
    expect(filling).toContain('Writing…')
    expect(filling).toMatch(/<button[^>]*disabled[^>]*>.*Writing…/)
    expect(html(<SlotRow slot={slot} filling={false} aiPaused onWrite={noop} onFill={noop} />)).toMatch(/<button[^>]*disabled[^>]*>.*Fill with AI/)
  })
})

describe('WeekStrip', () => {
  it('shows the four figures, and dashes until they are known', () => {
    const out = html(<WeekStrip figures={{ planned: 7, ready: 2, published: 3, open_slots: 4 }} pending={false} />)
    for (const label of ['Planned', 'Ready', 'Published', 'Empty slots']) expect(out).toContain(label)
    expect(out).toContain('>7<')
    expect(out).toContain('>4<')
    expect(html(<WeekStrip figures={undefined} pending />).match(/–/g)).toHaveLength(4)
  })
})

describe('WeekGrid', () => {
  it('draws seven drop days with today marked, each day\'s posts then its slots', () => {
    const plans = plansFor(rangeFor('week', '2026-10-07').days, [post(1), post(2, { scheduled_date: '2026-10-09' })], [{ date: '2026-10-08', platform: 'linkedin' }])
    const out = html(<WeekGrid plans={plans} today="2026-10-07" locale="en-GB" selectedId={2} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} />)
    expect(out.match(/data-drop-date="/g)).toHaveLength(7)
    expect(out).toMatch(/aria-current="date"[^>]*>.*>7</)
    expect(out).toContain('Hook 1')
    expect(out).toContain('aria-label="Empty linkedin slot"')
    expect(out).toContain('aria-current="true"') // the post open in the panel
    expect(out).toContain('Nothing planned')
  })
})

describe('MonthGrid', () => {
  it('shows a day\'s first three posts, how many more, and its empty slots', () => {
    const posts = [1, 2, 3, 4, 5].map(id => post(id))
    const plans = plansFor(rangeFor('month', '2026-10-07').days, posts, [{ date: '2026-10-07', platform: 'linkedin' }])
    const out = html(<MonthGrid plans={plans} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop} />)
    expect(out.match(/data-drop-date="/g)).toHaveLength(42)
    expect(out).toContain('Hook 3')
    expect(out).not.toContain('Hook 4')
    expect(out).toContain('+2 more')
    expect(out).toContain('Empty slots: 1')
  })
})

describe('ListView', () => {
  it('lists only the days that hold something, and says when nothing is planned', () => {
    const days = rangeFor('list', '2026-10-07').days
    const out = html(<ListView plans={plansFor(days, [post(1)], [])} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers} />)
    expect(out.match(/<section/g)).toHaveLength(1)
    expect(out).toContain('Today')
    expect(html(<ListView plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers} />))
      .toContain('Nothing planned this week.')
  })
})

describe('Tray', () => {
  it('is the drop target for "no day", with its count and a hint when empty', () => {
    const out = html(<Tray posts={[post(1, { scheduled_date: null })]} active={false} selectedId={null} onOpen={noop} />)
    expect(out).toContain('data-drop="tray"')
    expect(out).toContain('Unscheduled')
    expect(out).toContain('Hook 1')
    expect(html(<Tray posts={[]} active selectedId={null} onOpen={noop} />)).toContain('Drag a post here')
  })
})

describe('Toolbar', () => {
  const base = {
    view: 'week' as const, label: '5 Oct – 11 Oct 2026', refreshing: false, filter: { platforms: ['linkedin' as const], status: 'all' as const },
    platforms: ['instagram' as const, 'linkedin' as const], statuses: ['draft' as const, 'published' as const],
    onPrev: noop, onNext: noop, onToday: noop, onView: noop, onFilter: noop, onGenerate: noop,
  }

  it('names the range, offers the views and the chips, and Generate only to managers', () => {
    const out = html(<Toolbar {...base} viewLocked={false} canGenerate />)
    expect(out).toContain('5 Oct – 11 Oct 2026')
    expect(out).toMatch(/aria-pressed="true"[^>]*>Week</)
    expect(out).toMatch(/aria-pressed="true"[^>]*>.*linkedin/)
    expect(out).toContain('Generate')
    expect(out).toContain('<option value="published">published</option>')
    expect(html(<Toolbar {...base} viewLocked={false} canGenerate={false} />)).not.toContain('Generate')
  })

  it('has no view choice where the list is the only view', () => {
    expect(html(<Toolbar {...base} viewLocked canGenerate={false} />)).not.toContain('>Month<')
  })
})
```

Run: `"$R2B/vt.sh" src/content/plan/planPieces.test.tsx`
Expected: FAIL (the components do not exist).

- [ ] **Step 2: Write the marks**

`frontend/src/content/ui/PlatformMark.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { PLATFORM_SHORT } from '../lib/platforms'
import type { Platform } from '../lib/types'

/** A platform's mark: its two letters on its own colour, the ink chosen by theme/content.css; the name is read out. */
export function PlatformMark({ platform, size = 'md' }: { platform: Platform; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const name = t(`content.platform.${platform}`, platform)
  return (
    <span data-platform={platform} title={name}
      className={`c-mark inline-grid shrink-0 place-items-center rounded-md font-a-mono font-semibold uppercase leading-none ${size === 'sm' ? 'h-5 w-5 text-[12px]' : 'h-6 w-6 text-xs'}`}>
      <span aria-hidden>{PLATFORM_SHORT[platform]}</span>
      <span className="sr-only">{name}</span>
    </span>
  )
}
```

`frontend/src/content/ui/StatusDot.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { PostStatus } from '../lib/types'

/** A post status as a dot in its tone (theme/content.css, [data-status]); the card says the word to a screen reader. */
export function StatusDot({ status }: { status: PostStatus }) {
  return <span data-status={status} aria-hidden className="c-st-dot mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" />
}

/** A post status with its name, in its tone over a tint of itself. */
export function StatusPill({ status }: { status: PostStatus }) {
  const { t } = useTranslation()
  return (
    <span data-status={status} className="c-st-tint c-st-text inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium">
      <span aria-hidden className="c-st-dot h-1.5 w-1.5 rounded-full" />
      {t(`content.status.${status}`, status)}
    </span>
  )
}
```

- [ ] **Step 3: Write the card, the slot and the strip**

`frontend/src/content/plan/PostCardView.tsx`:

```tsx
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cardLine } from '../lib/postText'
import type { PostCard } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusDot } from '../ui/StatusDot'

/** The one line (drawn once by the Plan) that tells a screen reader how to move a card. */
export const MOVE_HINT_ID = 'content-move-hint'

/**
 * A post on the Plan (spec §4.2): its platform's mark and colour edge, its
 * time, its hook (or title, or topic), its status dot, and the image when it
 * has one. A press drags it to another day or the tray, Shift+← → moves it a
 * day, a click opens it. A published post stays where it went out.
 */
export function PostCardView({ post, compact = false, selected = false, onOpen, onPointerDown, onKeyDown }: {
  post: PostCard
  /** The month grid and the tray: one line, no time, no image. */
  compact?: boolean
  /** Its post is open in the panel. */
  selected?: boolean
  onOpen: (id: number) => void
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>, post: PostCard) => void
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>, post: PostCard) => void
}) {
  const { t } = useTranslation()
  const text = cardLine(post) || t('content.plan.untitled', 'Untitled post')
  const movable = post.status !== 'published'
  const label = t('content.plan.card_label', '{{platform}} post, {{status}}: {{text}}', {
    platform: t(`content.platform.${post.platform}`, post.platform),
    status: t(`content.status.${post.status}`, post.status),
    text,
  })
  return (
    <button type="button" data-post={post.id} data-platform={post.platform} data-movable={movable ? 'true' : 'false'} data-stop=""
      aria-label={label} aria-describedby={movable ? MOVE_HINT_ID : undefined} aria-current={selected ? 'true' : undefined}
      onClick={() => onOpen(post.id)}
      onPointerDown={onPointerDown && movable ? (e) => onPointerDown(e, post) : undefined}
      onKeyDown={onKeyDown ? (e) => onKeyDown(e, post) : undefined}
      className={`c-edge flex w-full min-w-0 items-start gap-2 rounded-lg border bg-a-surface text-left shadow-a-sm transition hover:border-a-text-2/40 [@media(hover:hover)]:hover:-translate-y-px ${compact ? 'px-2 py-1' : 'px-2.5 py-2'} ${selected ? 'border-a-accent-text ring-1 ring-a-accent-text' : 'border-a-border'} ${movable && onPointerDown ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <PlatformMark platform={post.platform} size="sm" />
      <span className="min-w-0 flex-1">
        {!compact && post.scheduled_time && <span className="block font-a-mono text-xs text-a-text-2">{post.scheduled_time}</span>}
        <span className={`block text-sm leading-snug text-a-text ${compact ? 'truncate' : 'line-clamp-2'}`}>{text}</span>
      </span>
      {!compact && post.image_url && <img src={post.image_url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md object-cover" />}
      <StatusDot status={post.status} />
    </button>
  )
}
```

`frontend/src/content/plan/SlotRow.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Loader2, PenLine, Sparkles } from 'lucide-react'
import type { Slot } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { slotKey } from './planMath'

/** An empty slot (spec §4.2): a day and platform the brand's channels expect, with Write and Fill with AI. */
export function SlotRow({ slot, filling, aiPaused, onWrite, onFill }: {
  slot: Slot
  filling: boolean
  /** This month's AI budget is used up: Fill waits, Write still works. */
  aiPaused: boolean
  onWrite: () => void
  onFill: () => void
}) {
  const { t } = useTranslation()
  const platform = t(`content.platform.${slot.platform}`, slot.platform)
  return (
    <div role="group" aria-label={t('content.plan.slot.label', 'Empty {{platform}} slot', { platform })} data-slot={slotKey(slot)}
      className="flex flex-wrap items-center gap-1 rounded-lg border border-dashed border-a-border bg-a-canvas/60 px-2 py-1.5">
      <PlatformMark platform={slot.platform} size="sm" />
      <button type="button" onClick={onWrite}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
        <PenLine size={12} aria-hidden />{t('content.plan.slot.write', 'Write')}
      </button>
      <button type="button" onClick={onFill} disabled={filling || aiPaused}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-text-2 hover:bg-a-surface-2 hover:text-a-text disabled:opacity-50">
        {filling ? <Loader2 size={12} aria-hidden className="animate-spin" /> : <Sparkles size={12} aria-hidden />}
        {filling ? t('content.plan.slot.filling', 'Writing…') : t('content.plan.slot.fill', 'Fill with AI')}
      </button>
    </div>
  )
}
```

`frontend/src/content/plan/WeekStrip.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { PlanFigures } from '../lib/types'

/** Each tile rises a moment after the one before it (written whole, so Tailwind sees the class). */
const DELAYS = ['', '[animation-delay:60ms]', '[animation-delay:120ms]', '[animation-delay:180ms]']

/** The This week strip (spec §4.2): planned, ready, published and empty slots for the week shown; a dash until known. */
export function WeekStrip({ figures, pending }: { figures: PlanFigures | undefined; pending: boolean }) {
  const { t } = useTranslation()
  const tiles = [
    { key: 'planned', title: t('content.plan.strip.planned', 'Planned'), value: figures?.planned },
    { key: 'ready', title: t('content.plan.strip.ready', 'Ready'), value: figures?.ready },
    { key: 'published', title: t('content.plan.strip.published', 'Published'), value: figures?.published },
    { key: 'open', title: t('content.plan.strip.open', 'Empty slots'), value: figures?.open_slots },
  ]
  return (
    <section aria-label={t('content.plan.strip.title', 'This week')} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((tile, i) => (
        <div key={tile.key} data-figure={tile.key} className={`min-w-0 rounded-xl border border-a-border bg-a-surface px-4 py-3 shadow-a-sm animate-a-rise ${DELAYS[i]}`}>
          <h2 className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{tile.title}</h2>
          <p className="font-a-display text-3xl font-light leading-tight tabular-nums text-a-text">{pending || tile.value === undefined ? '–' : tile.value}</p>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Write the views and the tray**

`frontend/src/content/plan/WeekGrid.tsx`:

```tsx
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey, PostCard, Slot } from '../lib/types'
import { slotKey, type DayPlan } from './planMath'
import { PostCardView } from './PostCardView'
import { SlotRow } from './SlotRow'

/** What the Plan's views do when a card or a slot is used. */
export interface PlanHandlers {
  onOpen: (id: number) => void
  onWrite: (slot: Slot) => void
  onFill: (slot: Slot) => void
  /** Starts a drag (the week and month views and the tray; the list has none). */
  onCardPointerDown?: (e: PointerEvent<HTMLButtonElement>, post: PostCard) => void
  /** Shift+← → moves the post a day. */
  onCardKeyDown?: (e: KeyboardEvent<HTMLButtonElement>, post: PostCard) => void
}

/** The week view (spec §4.2): seven day columns, Monday first, on the venue's clock; each day's posts, then its empty slots. */
export function WeekGrid({ plans, today, locale, selectedId, dropDate, fillingKey, aiPaused, onOpen, onWrite, onFill, onCardPointerDown, onCardKeyDown }: PlanHandlers & {
  plans: DayPlan[]
  today: DateKey
  locale: string
  selectedId: number | null
  /** The day a dragged card is over. */
  dropDate: DateKey | null
  fillingKey: string | null
  aiPaused: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-full min-w-[56rem] grid-cols-7 divide-x divide-a-border">
      {plans.map(day => (
        <section key={day.date} data-drop-date={day.date} aria-labelledby={`day-${day.date}`}
          className={`flex min-w-0 flex-col gap-2 p-2 transition-colors ${dropDate === day.date ? 'bg-a-accent/10' : ''}`}>
          <h3 id={`day-${day.date}`} aria-current={day.date === today ? 'date' : undefined} className="flex items-baseline gap-1.5 px-1 pb-1">
            <span className="font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{formatDate(day.date, locale, { weekday: 'short' })}</span>
            <span className={day.date === today
              ? 'grid h-7 min-w-7 place-items-center rounded-full bg-a-accent px-1.5 font-a-display text-base text-a-accent-ink'
              : 'font-a-display text-lg text-a-text'}>{Number(day.date.slice(8))}</span>
          </h3>
          {day.posts.map(post => (
            <PostCardView key={post.id} post={post} selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
          ))}
          {day.slots.map(slot => (
            <SlotRow key={slot.platform} slot={slot} filling={fillingKey === slotKey(slot)} aiPaused={aiPaused} onWrite={() => onWrite(slot)} onFill={() => onFill(slot)} />
          ))}
          {day.posts.length === 0 && day.slots.length === 0 && <p className="px-1 text-xs text-a-text-2">{t('content.plan.empty_day', 'Nothing planned')}</p>}
        </section>
      ))}
    </div>
  )
}
```

`frontend/src/content/plan/MonthGrid.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey } from '../lib/types'
import { inMonth, type DayPlan } from './planMath'
import { PostCardView } from './PostCardView'
import type { PlanHandlers } from './WeekGrid'

/** How many posts a day of the month shows before "+n more". */
const SHOWN = 3

/** The month view: six Monday-first weeks; each day its first posts, how many more, and its empty slots. A day's number opens its week. */
export function MonthGrid({ plans, date, today, locale, selectedId, dropDate, onDay, onOpen, onCardPointerDown, onCardKeyDown }: Pick<PlanHandlers, 'onOpen' | 'onCardPointerDown' | 'onCardKeyDown'> & {
  plans: DayPlan[]
  /** A day of the month shown. */
  date: DateKey
  today: DateKey
  locale: string
  selectedId: number | null
  dropDate: DateKey | null
  onDay: (day: DateKey) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-[48rem]">
      <div className="grid grid-cols-7 border-b border-a-border">
        {plans.slice(0, 7).map(day => (
          <div key={day.date} className="px-2 py-1.5 font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{formatDate(day.date, locale, { weekday: 'short' })}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {plans.map(day => {
          const own = inMonth(day.date, date)
          const extra = day.posts.length - SHOWN
          return (
            <div key={day.date} data-drop-date={day.date}
              className={`min-h-[7.5rem] min-w-0 border-b border-r border-a-border p-1.5 transition-colors ${dropDate === day.date ? 'bg-a-accent/10' : own ? '' : 'bg-a-surface-2/60'}`}>
              <button type="button" onClick={() => onDay(day.date)} aria-current={day.date === today ? 'date' : undefined}
                aria-label={formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                className={`mb-1 rounded-full px-1.5 text-xs font-medium ${day.date === today ? 'bg-a-accent text-a-accent-ink' : own ? 'text-a-text hover:bg-a-surface-2' : 'text-a-text-2 hover:bg-a-surface-2'}`}>
                {Number(day.date.slice(8))}
              </button>
              <div className="space-y-1">
                {day.posts.slice(0, SHOWN).map(post => (
                  <PostCardView key={post.id} post={post} compact selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
                ))}
                {extra > 0 && (
                  <button type="button" onClick={() => onDay(day.date)} className="px-1 text-xs font-medium text-a-accent-text hover:underline">
                    {t('content.plan.more', '+{{count}} more', { count: extra })}
                  </button>
                )}
                {day.slots.length > 0 && <p className="px-1 text-xs text-a-text-2">{t('content.plan.open_slots', 'Empty slots: {{count}}', { count: day.slots.length })}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

`frontend/src/content/plan/ListView.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey } from '../lib/types'
import { slotKey, type DayPlan } from './planMath'
import { PostCardView } from './PostCardView'
import { SlotRow } from './SlotRow'
import type { PlanHandlers } from './WeekGrid'

/** The list view (spec §4.2): the shown week's days that hold something, in order. Below 1024 px it is the only view. */
export function ListView({ plans, today, locale, selectedId, fillingKey, aiPaused, onOpen, onWrite, onFill, onCardKeyDown }: Omit<PlanHandlers, 'onCardPointerDown'> & {
  plans: DayPlan[]
  today: DateKey
  locale: string
  selectedId: number | null
  fillingKey: string | null
  aiPaused: boolean
}) {
  const { t } = useTranslation()
  const days = plans.filter(day => day.posts.length > 0 || day.slots.length > 0)
  if (days.length === 0) return <p className="p-6 text-sm text-a-text-2">{t('content.plan.list_empty', 'Nothing planned this week.')}</p>
  return (
    <div className="divide-y divide-a-border">
      {days.map(day => (
        <section key={day.date} data-drop-date={day.date} aria-labelledby={`list-${day.date}`} className="p-3 sm:p-4">
          <h3 id={`list-${day.date}`} aria-current={day.date === today ? 'date' : undefined} className="mb-2 font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">
            {formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            {day.date === today && <span className="ml-2 rounded-full bg-a-accent px-2 py-0.5 normal-case tracking-normal text-a-accent-ink">{t('content.common.today', 'Today')}</span>}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {day.posts.map(post => <PostCardView key={post.id} post={post} selected={selectedId === post.id} onOpen={onOpen} onKeyDown={onCardKeyDown} />)}
            {day.slots.map(slot => (
              <SlotRow key={slot.platform} slot={slot} filling={fillingKey === slotKey(slot)} aiPaused={aiPaused} onWrite={() => onWrite(slot)} onFill={() => onFill(slot)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
```

`frontend/src/content/plan/Tray.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { PostCard } from '../lib/types'
import { PostCardView } from './PostCardView'
import type { PlanHandlers } from './WeekGrid'

/** Posts without a day (spec §4.2). A card dropped here loses its date; one dragged from here to a day gets that day. */
export function Tray({ posts, active, selectedId, onOpen, onCardPointerDown, onCardKeyDown }: Pick<PlanHandlers, 'onOpen' | 'onCardPointerDown' | 'onCardKeyDown'> & {
  posts: PostCard[]
  /** A dragged card is over the tray. */
  active: boolean
  selectedId: number | null
}) {
  const { t } = useTranslation()
  return (
    <section data-drop="tray" aria-labelledby="content-tray-title"
      className={`flex min-h-[7rem] flex-col gap-2 rounded-xl border p-3 shadow-a-sm transition-colors xl:max-h-[calc(100vh-14rem)] xl:overflow-y-auto ${active ? 'border-a-accent-text bg-a-accent/10' : 'border-a-border bg-a-surface'}`}>
      <h2 id="content-tray-title" className="flex items-center justify-between font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">
        <span>{t('content.plan.tray.title', 'Unscheduled')}</span>
        <span className="tabular-nums">{posts.length}</span>
      </h2>
      {posts.length === 0 && <p className="text-xs text-a-text-2">{t('content.plan.tray.empty', 'Drag a post here to take it off the calendar.')}</p>}
      {posts.map(post => (
        <PostCardView key={post.id} post={post} compact selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
      ))}
    </section>
  )
}
```

`frontend/src/content/plan/Toolbar.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import type { Platform, PostStatus } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { togglePlatform, type PlanFilter, type PlanView } from './planMath'

const VIEWS: PlanView[] = ['week', 'month', 'list']
const ICON = 'rounded-full p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'

/** The Plan's toolbar: back and forward, this week, the range's name, the views, Generate (managers) and the filters. */
export function Toolbar({ view, viewLocked, label, refreshing, canGenerate, filter, platforms, statuses, onPrev, onNext, onToday, onView, onFilter, onGenerate }: {
  view: PlanView
  /** Below 1024 px the list is the only view. */
  viewLocked: boolean
  label: string
  refreshing: boolean
  canGenerate: boolean
  filter: PlanFilter
  /** The platform chips worth offering (planMath.presentPlatforms). */
  platforms: Platform[]
  statuses: PostStatus[]
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onView: (view: PlanView) => void
  onFilter: (filter: PlanFilter) => void
  onGenerate: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 px-4 pb-3 pt-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={onPrev} aria-label={t('content.plan.prev', 'Previous')} className={ICON}><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" onClick={onToday} className="rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-xs font-semibold text-a-text hover:bg-a-surface-2">
            {t('content.plan.today', 'This week')}
          </button>
          <button type="button" onClick={onNext} aria-label={t('content.plan.next', 'Next')} className={ICON}><ChevronRight size={16} aria-hidden /></button>
        </div>
        <h1 className="font-a-display text-2xl font-normal leading-tight text-a-text">{label}</h1>
        {refreshing && <Loader2 size={14} aria-hidden className="animate-spin text-a-text-2" />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!viewLocked && (
            <div role="group" aria-label={t('content.plan.views', 'View')} className="inline-flex rounded-full border border-a-border bg-a-surface p-0.5">
              {VIEWS.map(v => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${view === v ? 'bg-a-surface-2 text-a-text' : 'text-a-text-2 hover:text-a-text'}`}>
                  {t(`content.plan.view.${v}`, v)}
                </button>
              ))}
            </div>
          )}
          {canGenerate && <Button size="sm" onClick={onGenerate}><Sparkles size={14} aria-hidden />{t('content.plan.generate', 'Generate')}</Button>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {platforms.length > 1 && (
          <div role="group" aria-label={t('content.plan.filter_platforms', 'Platforms')} className="flex flex-wrap items-center gap-1.5">
            {platforms.map(p => {
              const on = filter.platforms.includes(p)
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => onFilter({ ...filter, platforms: togglePlatform(filter.platforms, p) })}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${on ? 'border-a-accent-text bg-a-surface-2 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                  <PlatformMark platform={p} size="sm" />{t(`content.platform.${p}`, p)}
                </button>
              )
            })}
          </div>
        )}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-a-text-2">
          <span>{t('content.plan.filter_status', 'Status')}</span>
          <select value={filter.status} onChange={(e) => onFilter({ ...filter, status: e.target.value as PlanFilter['status'] })}
            className="rounded-md border border-a-border bg-a-surface px-1.5 py-1 text-xs text-a-text">
            <option value="all">{t('content.plan.all_statuses', 'All statuses')}</option>
            {statuses.map(s => <option key={s} value={s}>{t(`content.status.${s}`, s)}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run**: `"$R2B/vt.sh" src/content` and `cd frontend && npx tsc -b && npx eslint src/content`
Expected: all PASS; tsc and eslint clean.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: the Plan's pieces — cards, slots, the strip, week, month, list, tray, toolbar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Moving and generating — the move rules, the drag layer, the dialog frame and Generate

**Files:**
- Create:
  - `frontend/src/content/plan/moveMath.ts`, `frontend/src/content/plan/useCardDrag.ts`, `frontend/src/content/plan/DragGhost.tsx`
  - `frontend/src/content/plan/generateMath.ts`, `frontend/src/content/plan/GenerateDialog.tsx`
  - `frontend/src/content/ui/Dialog.tsx`
- Test: `frontend/src/content/plan/moveMath.test.ts`, `generateMath.test.ts`, `generateDialog.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1 (`ContentApi`, `failureOf`, `errorKey`, `MAX_RANGE_DAYS`, `cardLine`, types).
  - Task 2 (`useApi`, `useBrandId`, `ContentContext`).
  - Task 4 (`PlatformMark`).
  - `wallClock`, `handBackFocus`, `Button`, `Field`, `Notice`.
- Produces:
  - Move rules:
    - `DropTarget = {kind:'day', date} | {kind:'tray'}`, `dropTargetAt(el)`, `movedDate(from, to)`, `keyMove(date, key, shift)`;
    - `DRAG_THRESHOLD_PX`, `LONG_PRESS_MS`, `TOUCH_SLOP_PX`, `DRAG_CLICK_MS`;
    - `pointerStartsDrag(moved)`, `touchStartsDrag(heldMs, moved)`, `isDragClick(endedAt, now)`;
    - `MoveResult`, `movePost(api, post, to)`, `refetchAfter(code)`.
  - Drag layer: `useCardDrag(onDrop)` → `{state: DragState | null, begin(e, post), consumeClick()}`, and `DragGhost({post, x, y})`.
  - Generating:
    - `Preset`, `PRESETS`, `presetRange(preset, today)`, `daysIn(from, to)`;
    - `RangeProblem`, `PROBLEM_TEXT`, `rangeProblem(from, to, today)`;
    - `GenerateDialog({today, onClose, onDone})`.
  - `Dialog({title, onClose, busy?, children})`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/plan/moveMath.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { PostCard } from '../lib/types'
import { dropTargetAt, isDragClick, keyMove, movePost, movedDate, pointerStartsDrag, refetchAfter, touchStartsDrag } from './moveMath'

const card: PostCard = {
  id: 9, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft',
  title: null, hook: 'Hook', topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z',
}
const el = (attrs: Record<string, Record<string, string>>) => ({
  closest: (selector: string) => {
    const hit = attrs[selector]
    return hit ? { getAttribute: (name: string) => hit[name] ?? null } : null
  },
})

describe('dropTargetAt', () => {
  it('finds the day an element is in, or the tray, or nowhere', () => {
    expect(dropTargetAt(el({ '[data-drop-date]': { 'data-drop-date': '2026-10-09' } }))).toEqual({ kind: 'day', date: '2026-10-09' })
    expect(dropTargetAt(el({ '[data-drop="tray"]': {} }))).toEqual({ kind: 'tray' })
    expect(dropTargetAt(el({}))).toBeNull()
    expect(dropTargetAt(el({ '[data-drop-date]': { 'data-drop-date': 'soon' } }))).toBeNull()
    expect(dropTargetAt(null)).toBeNull()
  })
})

describe('movedDate and keyMove', () => {
  it('a drop gives the day or "no day", and nothing when it changes nothing', () => {
    expect(movedDate('2026-10-07', { kind: 'day', date: '2026-10-09' })).toBe('2026-10-09')
    expect(movedDate('2026-10-07', { kind: 'tray' })).toBeNull()
    expect(movedDate('2026-10-07', { kind: 'day', date: '2026-10-07' })).toBeUndefined()
    expect(movedDate(null, { kind: 'tray' })).toBeUndefined()
  })

  it('Shift+← → moves a dated post a day; any other key, or a post with no day, nothing', () => {
    expect(keyMove('2026-10-07', 'ArrowLeft', true)).toBe('2026-10-06')
    expect(keyMove('2026-10-31', 'ArrowRight', true)).toBe('2026-11-01')
    expect(keyMove('2026-10-07', 'ArrowRight', false)).toBeUndefined()
    expect(keyMove('2026-10-07', 'ArrowUp', true)).toBeUndefined()
    expect(keyMove(null, 'ArrowRight', true)).toBeUndefined()
  })
})

describe('the drag\'s thresholds', () => {
  it('a mouse drags after 4 px, a finger after a still 400 ms, and the click a release fires is not an opening', () => {
    expect([pointerStartsDrag(3), pointerStartsDrag(4)]).toEqual([false, true])
    expect([touchStartsDrag(399, 0), touchStartsDrag(400, 8), touchStartsDrag(500, 9)]).toEqual([false, true, false])
    expect([isDragClick(null, 1000), isDragClick(900, 1000), isDragClick(500, 1000)]).toEqual([false, true, false])
  })
})

describe('movePost', () => {
  it('sends the version it read and the new day (null for the tray), and answers with the moved card', async () => {
    const moved = { ...card, scheduled_date: null, updated_at: '2026-10-05T06:01:00.000000Z' }
    const api = { movePost: vi.fn(() => Promise.resolve({ post: moved })) }
    await expect(movePost(api, card, null)).resolves.toEqual({ ok: true, moved })
    expect(api.movePost).toHaveBeenCalledWith(9, { updated_at: card.updated_at, scheduled_date: null })
  })

  it('turns a refusal into its code, and asks for a new read when the plan shows something no longer true', async () => {
    const api = { movePost: vi.fn(() => Promise.reject({ response: { status: 409, data: { error: 'changed_elsewhere', post: { id: 9 } } } })) }
    await expect(movePost(api, card, '2026-10-09')).resolves.toEqual({ ok: false, code: 'changed_elsewhere' })
    expect([refetchAfter('changed_elsewhere'), refetchAfter('not_found'), refetchAfter('published_cannot_move'), refetchAfter('network')])
      .toEqual([true, true, true, false])
  })
})
```

`frontend/src/content/plan/generateMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import { PROBLEM_TEXT, daysIn, presetRange, rangeProblem } from './generateMath'

describe('presetRange', () => {
  it('this week and next week run Monday to Sunday; this month runs from its first to its last day', () => {
    expect(presetRange('this_week', '2026-10-08')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(presetRange('next_week', '2026-10-08')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(presetRange('this_month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(presetRange('this_month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('rangeProblem', () => {
  it('needs both days, in order, at most 62 of them, and not all gone', () => {
    expect(daysIn('2026-10-01', '2026-12-01')).toBe(62)
    expect(rangeProblem('', '2026-10-11', '2026-10-08')).toBe('missing')
    expect(rangeProblem('2026-10-11', '2026-10-05', '2026-10-08')).toBe('order')
    expect(rangeProblem('2026-10-01', '2026-12-02', '2026-10-08')).toBe('too_long')
    expect(rangeProblem('2026-09-01', '2026-09-30', '2026-10-08')).toBe('past')
    expect(rangeProblem('2026-10-05', '2026-10-11', '2026-10-08')).toBeNull()
  })

  it('says each problem in the English bundle\'s words', () => {
    expect(en.generate.problem).toEqual(PROBLEM_TEXT)
  })
})
```

`frontend/src/content/plan/generateDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, BrandPayload } from '../lib/types'
import { GenerateDialog } from './GenerateDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const boot = {
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' }, brands: [], accent: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-08' },
  staff: { name: 'Vitalij K', role: 'manager', can_manage: true }, profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin', 'tiktok'], statuses: [], rewrites: [],
} as unknown as Bootstrap

function render() {
  const client = new QueryClient()
  const brand: BrandPayload = {
    audiences: [],
    channels: [
      { id: 1, platform: 'instagram', label: 'Instagram', active: true },
      { id: 2, platform: 'linkedin', label: 'LinkedIn', active: true },
      { id: 3, platform: 'tiktok', label: 'TikTok', active: false },
    ],
  }
  client.setQueryData(['content', 3, 'brand'], brand)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <GenerateDialog today="2026-10-08" onClose={() => {}} onDone={() => {}} />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('GenerateDialog', () => {
  it('is a modal that offers the presets (this week first), the active channels, empty slots only, and instructions', () => {
    const out = render()
    expect(out).toContain('role="dialog"')
    expect(out).toContain('aria-modal="true"')
    expect(out).toContain('Generate posts')
    expect(out).toMatch(/aria-pressed="true"[^>]*>This week</)
    for (const preset of ['Next week', 'This month', 'Custom']) expect(out).toContain(preset)
    expect(out).toContain('5 Oct – 11 Oct 2026')
    expect(out).toContain('instagram')
    expect(out).toContain('linkedin')
    expect(out).not.toContain('tiktok')
    expect(out).toMatch(/<input type="checkbox" checked=""[^>]*>[^<]*Empty slots only/)
    expect(out).toContain('Instructions for the AI (optional)')
  })
})
```

Run: `"$R2B/vt.sh" src/content/plan`
Expected: FAIL (the modules do not exist).

- [ ] **Step 2: Write the move rules and the drag layer**

`frontend/src/content/plan/moveMath.ts`:

```ts
import { addDays, isDateKey } from '../../workspace/lib/wallClock'
import { failureOf, type ContentApi } from '../lib/api'
import type { DateKey, PostCard } from '../lib/types'

/** Where a dragged card is dropped: a day, or the tray ("no day"). */
export type DropTarget = { kind: 'day'; date: DateKey } | { kind: 'tray' }

/** A mouse or pen press becomes a drag after this many pixels; a finger after being held this long and this still (as Appointments). */
export const DRAG_THRESHOLD_PX = 4
export const LONG_PRESS_MS = 400
export const TOUCH_SLOP_PX = 8
/** The click a release fires comes within this many milliseconds; a later click is a click. */
export const DRAG_CLICK_MS = 400

interface ElementLike { closest: (selector: string) => { getAttribute: (name: string) => string | null } | null }

/** Where the element under the pointer drops a card: the day it is in ([data-drop-date]), the tray ([data-drop="tray"]), or nowhere. */
export function dropTargetAt(el: ElementLike | null): DropTarget | null {
  if (!el || typeof el.closest !== 'function') return null
  const day = el.closest('[data-drop-date]')?.getAttribute('data-drop-date')
  if (day && isDateKey(day)) return { kind: 'day', date: day }
  return el.closest('[data-drop="tray"]') ? { kind: 'tray' } : null
}

/** The date a drop gives a post (null: the tray); undefined when the drop changes nothing. */
export function movedDate(from: DateKey | null, to: DropTarget): DateKey | null | undefined {
  const date = to.kind === 'day' ? to.date : null
  return date === from ? undefined : date
}

/** Shift+← → on a focused card: the day before or after; undefined for any other key, or a post with no day. */
export function keyMove(date: DateKey | null, key: string, shift: boolean): DateKey | undefined {
  if (!shift || date === null) return undefined
  if (key === 'ArrowLeft') return addDays(date, -1)
  if (key === 'ArrowRight') return addDays(date, 1)
  return undefined
}

export const pointerStartsDrag = (moved: number): boolean => moved >= DRAG_THRESHOLD_PX
export const touchStartsDrag = (heldMs: number, moved: number): boolean => heldMs >= LONG_PRESS_MS && moved <= TOUCH_SLOP_PX
export const isDragClick = (endedAt: number | null, now: number): boolean => endedAt !== null && now - endedAt < DRAG_CLICK_MS

export type MoveResult = { ok: true; moved: PostCard } | { ok: false; code: string }

/** One move (a drop, Shift+arrow, an Undo): the post as it was read, to its new day (null: the tray). Never throws. */
export async function movePost(api: Pick<ContentApi, 'movePost'>, post: PostCard, to: DateKey | null): Promise<MoveResult> {
  try {
    const { post: moved } = await api.movePost(post.id, { updated_at: post.updated_at, scheduled_date: to })
    return { ok: true, moved }
  } catch (error) {
    return { ok: false, code: failureOf(error).code }
  }
}

/** After a refused move, whether the plan must be read again: it shows something that is no longer true. */
export const refetchAfter = (code: string): boolean => code === 'changed_elsewhere' || code === 'not_found' || code === 'published_cannot_move'
```

`frontend/src/content/plan/useCardDrag.ts`:

```ts
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PostCard } from '../lib/types'
import { LONG_PRESS_MS, dropTargetAt, isDragClick, pointerStartsDrag, touchStartsDrag, TOUCH_SLOP_PX, type DropTarget } from './moveMath'

export interface DragState { post: PostCard; x: number; y: number; target: DropTarget | null }
type TouchState = 'idle' | 'pressing' | 'dragging'

/**
 * One non-passive touch listener for the page's life, not one per press:
 * Safari decides when a finger lands whether the page may stop it scrolling.
 * It stops the scroll only during a drag, and the long-press menu over a
 * pressed card (as Appointments' calendar does).
 */
function installTouchGuard(target: EventTarget, state: () => TouchState): () => void {
  const onTouchMove = (e: Event) => { if (state() === 'dragging') e.preventDefault() }
  const onContextMenu = (e: Event) => { if (state() !== 'idle') e.preventDefault() }
  target.addEventListener('touchmove', onTouchMove, { passive: false })
  target.addEventListener('contextmenu', onContextMenu)
  return () => {
    target.removeEventListener('touchmove', onTouchMove)
    target.removeEventListener('contextmenu', onContextMenu)
  }
}

/**
 * The Plan's drag layer (spec §4.2). A card follows a mouse, pen or finger
 * over the days and the tray and is dropped where it is released. A touch
 * drag starts with a still press, so a swipe still scrolls. Escape cancels
 * and is claimed, so an open panel stays open. Published posts do not move.
 * Nothing here talks to the server: `onDrop` does.
 */
export function useCardDrag(onDrop: (post: PostCard, target: DropTarget) => void) {
  const [state, setState] = useState<DragState | null>(null)
  /** When the last drag ended (performance.now()); the click the release fires is not an opening. */
  const endedAt = useRef<number | null>(null)
  const touch = useRef<TouchState>('idle')
  const drop = useRef(onDrop)
  useEffect(() => { drop.current = onDrop }, [onDrop])
  useEffect(() => installTouchGuard(window, () => touch.current), [])

  const begin = useCallback((e: ReactPointerEvent<HTMLElement>, post: PostCard) => {
    if (e.button !== 0 || post.status === 'published') return
    const isTouch = e.pointerType === 'touch'
    const pointerId = e.pointerId
    const x0 = e.clientX
    const y0 = e.clientY
    const t0 = performance.now()
    let active = false
    let x = x0
    let y = y0
    if (isTouch) touch.current = 'pressing'

    const targetNow = () => dropTargetAt(document.elementFromPoint(x, y))
    const show = () => setState({ post, x, y, target: targetNow() })

    function finish(release: boolean) {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      touch.current = 'idle'
      if (!active) return
      endedAt.current = performance.now()
      const target = release ? targetNow() : null
      setState(null)
      if (target) drop.current(post, target)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      x = ev.clientX
      y = ev.clientY
      const moved = Math.hypot(x - x0, y - y0)
      if (!active) {
        if (isTouch) {
          if (moved > TOUCH_SLOP_PX) finish(false) // a swipe: let the page scroll
          return
        }
        if (!pointerStartsDrag(moved)) return
        active = true
      }
      show()
    }
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(true) }
    const onCancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(false) }
    // Heard before the panel (capture) and claimed while dragging, so an open panel stays.
    const onKey = (ev: KeyboardEvent) => {
      if (!active || ev.key !== 'Escape') return
      ev.preventDefault()
      finish(false)
    }
    const timer = isTouch
      ? window.setTimeout(() => {
          if (touchStartsDrag(performance.now() - t0, Math.hypot(x - x0, y - y0))) {
            active = true
            touch.current = 'dragging' // from here the page must not scroll under the finger
            show()
          }
        }, LONG_PRESS_MS)
      : 0

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
  }, [])

  /** True for the click that ends a drag (it must not open the panel); false for any later click. */
  const consumeClick = useCallback(() => {
    const was = isDragClick(endedAt.current, performance.now())
    endedAt.current = null
    return was
  }, [])

  return { state, begin, consumeClick }
}
```

`frontend/src/content/plan/DragGhost.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { cardLine } from '../lib/postText'
import type { PostCard } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'

/** The card under the pointer while it is dragged. It never takes the pointer, so the day under it can be found. */
export function DragGhost({ post, x, y }: { post: PostCard; x: number; y: number }) {
  const { t } = useTranslation()
  return (
    <div aria-hidden className="pointer-events-none fixed z-50 w-52 -translate-x-1/2 -translate-y-1/2 rotate-1 opacity-90" style={{ left: x, top: y }}>
      <div data-platform={post.platform} className="c-edge flex items-center gap-2 rounded-lg border border-a-border bg-a-surface px-2.5 py-2 shadow-a-lg">
        <PlatformMark platform={post.platform} size="sm" />
        <span className="truncate text-sm text-a-text">{cardLine(post) || t('content.plan.untitled', 'Untitled post')}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the dialog frame and Generate**

`frontend/src/content/ui/Dialog.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { handBackFocus } from '../../workspace/lib/handBack'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]'

/**
 * A modal over a scrim (Generate). It takes the focus when it opens and gives
 * it back when it closes, keeps Tab inside, and closes on Escape — claimed,
 * so the post panel under it stays open. While `busy`, it does not close.
 */
export function Dialog({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  const working = useRef(busy)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => { working.current = busy }, [busy])

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const el = box.current
      if (!el) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!working.current) close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (before?.isConnected) handBackFocus(before)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-a-scrim/50 p-4 animate-a-fade">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="content-dialog-title" tabIndex={-1}
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-a-border bg-a-surface p-5 shadow-a-lg outline-none animate-a-pop">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="content-dialog-title" className="font-a-display text-xl font-normal text-a-text">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t('content.common.close', 'Close')}
            className="rounded p-1.5 text-a-text-2 hover:text-a-text disabled:opacity-50">
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

`frontend/src/content/plan/generateMath.ts`:

```ts
import { addDays, addMonths, isDateKey, monthOf, weekOf } from '../../workspace/lib/wallClock'
import { MAX_RANGE_DAYS } from '../lib/constants'
import type { DateKey } from '../lib/types'

/** Generate's ranges (spec §4.2): this week, next week, this month, or the days a manager picks (at most 62). */
export type Preset = 'this_week' | 'next_week' | 'this_month' | 'custom'
export const PRESETS: readonly Preset[] = ['this_week', 'next_week', 'this_month', 'custom']

/** The days a preset covers on the venue's clock. The server starts at the venue's today in any case. */
export function presetRange(preset: Exclude<Preset, 'custom'>, today: DateKey): { from: DateKey; to: DateKey } {
  if (preset === 'this_month') {
    const month = monthOf(today)
    return { from: `${month}-01`, to: addDays(`${addMonths(month, 1)}-01`, -1) }
  }
  const week = weekOf(preset === 'next_week' ? addDays(today, 7) : today)
  return { from: week[0], to: week[6] }
}

/** Days from `from` to `to`, both counted. */
export function daysIn(from: DateKey, to: DateKey): number {
  const ms = (d: DateKey) => { const [y, m, day] = d.split('-').map(Number); return Date.UTC(y, m - 1, day) }
  return Math.round((ms(to) - ms(from)) / 86_400_000) + 1
}

export type RangeProblem = 'missing' | 'order' | 'too_long' | 'past'

/** The English words for each problem (generateMath.test.ts keeps the bundle equal to these). */
export const PROBLEM_TEXT: Record<RangeProblem, string> = {
  missing: 'Choose both days.',
  order: 'The last day comes before the first.',
  too_long: 'Choose at most 62 days.',
  past: 'These days are already over.',
}

/** What is wrong with a range before it is sent, or null. */
export function rangeProblem(from: string, to: string, today: DateKey): RangeProblem | null {
  if (!isDateKey(from) || !isDateKey(to)) return 'missing'
  if (to < from) return 'order'
  if (daysIn(from, to) > MAX_RANGE_DAYS) return 'too_long'
  if (to < today) return 'past'
  return null
}
```

`frontend/src/content/plan/GenerateDialog.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { DateKey, GenerateResult, Platform } from '../lib/types'
import { Dialog } from '../ui/Dialog'
import { PlatformMark } from '../ui/PlatformMark'
import { PRESETS, PROBLEM_TEXT, presetRange, rangeProblem, type Preset } from './generateMath'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Generate (spec §4.2, managers): the AI writes drafts for a week, the next
 * week, the month or a range of up to 62 days, on the brand's active
 * channels, empty slots only by default. The answer says how many it wrote
 * and which days it could not; the plan is read again either way.
 */
export function GenerateDialog({ today, onClose, onDone }: { today: DateKey; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const brand = useBrandId()
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const channels = useMemo(() => [...new Set((brandInfo.data?.channels ?? []).filter(c => c.active).map(c => c.platform))], [brandInfo.data])
  const [preset, setPreset] = useState<Preset>('this_week')
  const [custom, setCustom] = useState(() => presetRange('this_week', today))
  const [off, setOff] = useState<Platform[]>([])
  const [emptyOnly, setEmptyOnly] = useState(true)
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const range = preset === 'custom' ? custom : presetRange(preset, today)
  const problem = rangeProblem(range.from, range.to, today)
  const chosen = channels.filter(p => !off.includes(p))
  const noneChosen = channels.length > 0 && chosen.length === 0
  const day = (date: DateKey, year = false) => formatDate(date, locale, year ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' })

  const submit = async () => {
    if (problem !== null || noneChosen || busy) return
    setBusy(true)
    setError(null)
    try {
      const answer = await api.generate({
        from: range.from, to: range.to, fill_empty_only: emptyOnly,
        ...(chosen.length > 0 && chosen.length < channels.length ? { platforms: chosen } : {}),
        ...(instructions.trim() !== '' ? { instructions: instructions.trim() } : {}),
      })
      setResult(answer)
      onDone()
    } catch (e) {
      const [key, text] = errorKey('generate', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const unfilled = result.failed_windows
    return (
      <Dialog title={t('content.generate.title', 'Generate posts')} onClose={onClose}>
        <div className="space-y-3">
          <Notice tone={result.created_count > 0 ? 'success' : 'warning'}>
            {result.created_count > 0
              ? t('content.generate.done', 'Posts written: {{count}}', { count: result.created_count })
              : t('content.generate.none', 'No posts were written.')}
          </Notice>
          {unfilled.map(w => (
            <p key={w.start_date} className="text-sm text-a-text-2">
              {t('content.generate.unfilled', '{{from}} – {{to}} could not be written. You can try again.', { from: day(w.start_date), to: day(w.end_date, true) })}
            </p>
          ))}
          <div className="flex justify-end"><Button onClick={onClose}>{t('content.generate.close', 'Close')}</Button></div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title={t('content.generate.title', 'Generate posts')} onClose={onClose} busy={busy}>
      <p className="mb-4 text-sm text-a-text-2">{t('content.generate.intro', 'The AI writes drafts for the days your channels expect. You can change every one.')}</p>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-xs font-medium text-a-text-2">{t('content.generate.range', 'Days')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button key={p} type="button" aria-pressed={preset === p} onClick={() => setPreset(p)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${preset === p ? 'border-a-accent-text bg-a-surface-2 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
              {t(`content.generate.preset.${p}`, p)}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label={t('content.generate.from', 'From')}>
              <input type="date" value={custom.from} onChange={(e) => setCustom(c => ({ ...c, from: e.target.value }))} className={INPUT} />
            </Field>
            <Field label={t('content.generate.to', 'To')}>
              <input type="date" value={custom.to} onChange={(e) => setCustom(c => ({ ...c, to: e.target.value }))} className={INPUT} />
            </Field>
          </div>
        ) : (
          <p className="mt-2 text-sm text-a-text">{day(range.from)} – {day(range.to, true)}</p>
        )}
        {problem !== null && <p className="mt-2 text-xs text-a-danger">{t(`content.generate.problem.${problem}`, PROBLEM_TEXT[problem])}</p>}
      </fieldset>
      {channels.length > 0 && (
        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-medium text-a-text-2">{t('content.generate.platforms', 'Channels')}</legend>
          <div className="flex flex-wrap gap-3">
            {channels.map(p => (
              <label key={p} className="inline-flex items-center gap-1.5 text-sm text-a-text">
                <input type="checkbox" checked={!off.includes(p)} onChange={() => setOff(o => (o.includes(p) ? o.filter(x => x !== p) : [...o, p]))} />
                <PlatformMark platform={p} size="sm" />{t(`content.platform.${p}`, p)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="mb-4 flex items-center gap-2 text-sm text-a-text">
        <input type="checkbox" checked={emptyOnly} onChange={(e) => setEmptyOnly(e.target.checked)} />
        {t('content.generate.empty_only', 'Empty slots only')}
      </label>
      <Field label={t('content.generate.instructions', 'Instructions for the AI (optional)')}>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} maxLength={2000} className={INPUT} />
      </Field>
      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
      {busy && <p role="status" className="mt-4 text-sm text-a-text-2">{t('content.generate.working', 'Writing your posts. This can take up to four minutes…')}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>{t('content.common.cancel', 'Cancel')}</Button>
        <Button onClick={() => { void submit() }} loading={busy} disabled={problem !== null || noneChosen}>{t('content.generate.submit', 'Generate')}</Button>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run**: `"$R2B/vt.sh" src/content` and `cd frontend && npx tsc -b && npx eslint src/content`
Expected: all PASS; tsc and eslint clean.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: moving and generating — move rules, the drag layer, the dialog, Generate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---
### Task 6: The Plan page — put together, at /content

**Files:**
- Create: `frontend/src/content/plan/PlanPage.tsx`
- Modify: `frontend/src/content/ContentApp.tsx` (the index route)
- Test: `frontend/src/content/plan/PlanPage.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1 (`errorKey`, `failureOf`, `PLAN_REFRESH_MS`, `UNDO_MS`, `onShortcuts`, types).
  - Task 2 (`useBoot`, `useApi`, `useBrandId`, `usePanel`).
  - Task 3 (`rangeFor`, `shiftDate`, `plansFor`, `filtered`, `presentPlatforms`, `rangeLabel`, `slotKey`, `loadPrefs`, `savePrefs`).
  - Task 4 (all views, `MOVE_HINT_ID`).
  - Task 5 (`movePost`, `refetchAfter`, `movedDate`, `keyMove`, `useCardDrag`, `DragGhost`, `GenerateDialog`).
- Produces: `PlanPage`, the route `/content` (index). It reads `?date=YYYY-MM-DD` once, then clears it from the address.
- Query keys:
  - plan: `['content', brandId, 'plan', from, to]`;
  - one post: `['content', brandId, 'post', id]`;
  - the strategies list: `['content', brandId, 'strategies']`;
  - one strategy: `['content', brandId, 'strategy', id]`;
  - the brand: `['content', brandId, 'brand']`;
  - Find: `['content', brandId, 'find', q]`.

- [ ] **Step 1: Write the failing test** `frontend/src/content/plan/PlanPage.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import { PanelProvider } from '../panel/PanelProvider'
import type { Bootstrap, PlanPayload } from '../lib/types'
import { PlanPage } from './PlanPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const boot: Bootstrap = {
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' }, brands: [{ id: 3, name: 'Lumière Salon' }], accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Vitalij K', role: 'manager', can_manage: true }, profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['draft', 'ready_to_publish', 'published'],
  rewrites: ['shorter'],
}
const week: PlanPayload = {
  posts: [
    { id: 1, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft', title: null, hook: 'Autumn colours', topic: null, pillar_id: null, image_url: null, updated_at: 'x' },
    { id: 2, platform: 'linkedin', scheduled_date: '2026-10-08', scheduled_time: null, status: 'published', title: 'Team news', hook: null, topic: null, pillar_id: null, image_url: null, updated_at: 'x' },
  ],
  unscheduled: [{ id: 3, platform: 'instagram', scheduled_date: null, scheduled_time: null, status: 'idea', title: null, hook: 'An idea for later', topic: null, pillar_id: null, image_url: null, updated_at: 'x' }],
  slots: [{ date: '2026-10-09', platform: 'instagram' }],
  figures: { planned: 2, ready: 0, published: 1, open_slots: 1 },
}

function page(path = '/content', data: Bootstrap = boot, seed: PlanPayload | null = week) {
  const client = new QueryClient()
  if (seed) client.setQueryData(['content', 3, 'plan', '2026-10-05', '2026-10-11'], seed)
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <ContentContext.Provider value={{ data, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PanelProvider><PlanPage /></PanelProvider>
        </ContentContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('PlanPage', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('opens on the venue\'s week even when this computer\'s clock is days out', () => {
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    expect(page()).toContain('5 Oct – 11 Oct 2026')
  })

  it('below 1024 px (and before the width is known) the Plan is the list: no view choice, no seven columns', () => {
    const html = page()
    expect(html).not.toContain('>Month<')
    expect(html).not.toContain('grid-cols-7')
    expect(html).toContain('Autumn colours')
  })

  it('shows the week\'s figures, its posts, its empty slots and the tray', () => {
    const html = page()
    expect(html).toContain('Planned')
    expect(html).toMatch(/data-figure="planned"[^>]*>.*?>2</)
    expect(html).toContain('Team news')
    expect(html).toContain('aria-label="Empty instagram slot"')
    expect(html).toContain('data-drop="tray"')
    expect(html).toContain('An idea for later')
    expect(html).toContain(`id="content-move-hint"`)
  })

  it('offers Generate to managers only', () => {
    expect(page()).toContain('Generate')
    expect(page('/content', { ...boot, staff: { name: 'Sam', role: 'staff', can_manage: false } })).not.toContain('Generate')
  })

  it('opens on the day a link names', () => {
    expect(page('/content?date=2026-10-20', boot, null)).toContain('19 Oct – 25 Oct 2026')
  })
})
```

Run: `"$R2B/vt.sh" src/content/plan/PlanPage.test.tsx`
Expected: FAIL (`./PlanPage` does not exist).

- [ ] **Step 2: Write** `frontend/src/content/plan/PlanPage.tsx`:

```tsx
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useMedia } from '../../workspace/lib/useMedia'
import { formatDate, isDateKey, venueNow } from '../../workspace/lib/wallClock'
import { Notice } from '../../workspace/ui/Notice'
import { CalendarSkeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { PLAN_REFRESH_MS, UNDO_MS } from '../lib/constants'
import { errorKey } from '../lib/errors'
import { onShortcuts } from '../lib/shortcuts'
import type { DateKey, PostCard, Slot } from '../lib/types'
import { usePanel } from '../panel/PanelProvider'
import { DragGhost } from './DragGhost'
import { GenerateDialog } from './GenerateDialog'
import { ListView } from './ListView'
import { MonthGrid } from './MonthGrid'
import { keyMove, movePost, movedDate, refetchAfter, type DropTarget } from './moveMath'
import { filtered, plansFor, presentPlatforms, rangeFor, rangeLabel, shiftDate, slotKey } from './planMath'
import { MOVE_HINT_ID } from './PostCardView'
import { loadPrefs, savePrefs, type PlanPrefs } from './prefs'
import { Toolbar } from './Toolbar'
import { Tray } from './Tray'
import { useCardDrag } from './useCardDrag'
import { WeekGrid } from './WeekGrid'
import { WeekStrip } from './WeekStrip'

/** The line under the toolbar after a move (with its Undo) or a refusal. */
interface Note { tone: 'info' | 'danger'; text: string; undo: (() => void) | null }

/**
 * The Plan, HexaTech Content's home (spec §4.2): the week (or the month, or
 * the list — the only view below 1024 px) on the venue's clock, the This
 * week strip, empty slots to write or fill, the Unscheduled tray, drag and
 * Shift+arrow moves with Undo, and Generate for managers. It is read again
 * every minute and when the window comes back.
 */
export function PlanPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const panel = usePanel()
  const queryClient = useQueryClient()
  const wide = useMedia('(min-width: 1024px)')
  const [prefs, setPrefs] = useState<PlanPrefs>(() => loadPrefs(boot.platforms, boot.statuses))
  // The day to open on is the server's: a computer whose clock or zone is off still opens on the venue's week.
  const [date, setDate] = useState<DateKey>(boot.venue.today)
  const [note, setNote] = useState<Note | null>(null)
  const [filling, setFilling] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [params, setParams] = useSearchParams()

  // A link names a day (?date=…, the post links): adopted while rendering, then cleared from the address.
  const linkDate = params.get('date')
  const [adopted, setAdopted] = useState<string | null>(null)
  if (linkDate !== adopted) {
    setAdopted(linkDate)
    if (linkDate !== null && isDateKey(linkDate)) setDate(linkDate)
  }
  useEffect(() => { if (params.has('date')) setParams({}, { replace: true }) }, [params, setParams])

  useEffect(() => { savePrefs(prefs) }, [prefs])
  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(null), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [note])

  const view = wide ? prefs.view : 'list'
  const range = rangeFor(view, date)
  const query = useQuery({
    queryKey: ['content', brand, 'plan', range.from, range.to],
    queryFn: () => api.plan(range.from, range.to),
    refetchInterval: PLAN_REFRESH_MS,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] })

  // This page's shortcuts (spec §4.7): this week, back and forward, the views. The shell hears Find, ? and N.
  useEffect(() => onShortcuts(window, document, (hit, e) => {
    if (hit === 'today') setDate(venueNow(boot.venue.timezone).date)
    else if (hit === 'prev') setDate(d => shiftDate(view, d, -1))
    else if (hit === 'next') setDate(d => shiftDate(view, d, 1))
    else if (hit === 'week' || hit === 'month' || hit === 'list') {
      if (!wide) return // the list is the only view on a narrow screen
      setPrefs(p => (p.view === hit ? p : { ...p, view: hit }))
    } else return
    e.preventDefault()
  }), [boot.venue.timezone, view, wide])

  const data = query.data
  const shown = useMemo(() => filtered(data?.posts ?? [], data?.slots ?? [], prefs.filter), [data, prefs.filter])
  const plans = plansFor(range.days, shown.posts, shown.slots)
  const chips = presentPlatforms(boot.platforms, data?.posts ?? [], data?.slots ?? [], prefs.filter.platforms)
  const selectedId = panel.target?.kind === 'post' ? panel.target.id : null
  const aiPaused = boot.ai.status === 'over'
  const today = boot.venue.today
  const dayName = (day: DateKey) => formatDate(day, locale, { weekday: 'short', day: 'numeric', month: 'short' })

  /** One move: saved at once, the plan read again, a line with Undo for 8 seconds (spec §4.2). A refusal says why. */
  const move = async (post: PostCard, to: DateKey | null, undoable: boolean, focus: boolean) => {
    const result = await movePost(api, post, to)
    if (!result.ok) {
      if (refetchAfter(result.code)) void refresh()
      const [key, text] = errorKey('move', result.code)
      setNote({ tone: 'danger', text: t(key, text), undo: null })
      return
    }
    await refresh()
    void queryClient.invalidateQueries({ queryKey: ['content', brand, 'post', post.id] })
    // A keyboard move leaves the focus on the card at its new place.
    if (focus) window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-post="${post.id}"]`)?.focus())
    setNote(undoable
      ? {
          tone: 'info',
          text: to === null ? t('content.plan.moved_tray', 'Moved to Unscheduled') : t('content.plan.moved', 'Moved to {{day}}', { day: dayName(to) }),
          undo: () => { void move(result.moved, post.scheduled_date, false, false) },
        }
      : { tone: 'info', text: t('content.plan.undone', 'Move undone'), undo: null })
  }

  const drag = useCardDrag((post: PostCard, target: DropTarget) => {
    const to = movedDate(post.scheduled_date, target)
    if (to !== undefined) void move(post, to, true, false)
  })

  const onCardKeyDown = (e: KeyboardEvent<HTMLButtonElement>, post: PostCard) => {
    const to = keyMove(post.scheduled_date, e.key, e.shiftKey)
    if (to === undefined) return
    e.preventDefault()
    if (post.status === 'published') {
      const [key, text] = errorKey('move', 'published_cannot_move')
      setNote({ tone: 'danger', text: t(key, text), undo: null })
      return
    }
    void move(post, to, true, true)
  }

  // The click a drag's release fires is not an opening.
  const openPost = (id: number) => { if (!drag.consumeClick()) panel.open(id) }
  const write = (slot: Slot) => { panel.openNew({ date: slot.date, platform: slot.platform }) }
  const fill = async (slot: Slot) => {
    setFilling(slotKey(slot))
    try {
      const { post } = await api.fill(slot.date, slot.platform)
      queryClient.setQueryData(['content', brand, 'post', post.id], post)
      await refresh()
      panel.open(post.id)
    } catch (error) {
      const [key, text] = errorKey('fill', failureOf(error).code)
      setNote({ tone: 'danger', text: t(key, text), undo: null })
    } finally {
      setFilling(null)
    }
  }

  const dropTarget = drag.state?.target ?? null
  const dropDate = dropTarget?.kind === 'day' ? dropTarget.date : null
  const handlers = { onOpen: openPost, onWrite: write, onFill: (slot: Slot) => { void fill(slot) }, onCardKeyDown }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <Toolbar view={view} viewLocked={!wide} label={rangeLabel(view, range, date, locale)} refreshing={query.isFetching && !query.isLoading}
        canGenerate={boot.staff.can_manage} filter={prefs.filter} platforms={chips} statuses={boot.statuses}
        onPrev={() => setDate(shiftDate(view, date, -1))} onNext={() => setDate(shiftDate(view, date, 1))}
        onToday={() => setDate(venueNow(boot.venue.timezone).date)}
        onView={(v) => setPrefs({ ...prefs, view: v })} onFilter={(filter) => setPrefs({ ...prefs, filter })}
        onGenerate={() => setGenerating(true)} />

      {view !== 'month' && (
        <div className="px-4 pb-3 lg:px-6"><WeekStrip figures={data?.figures} pending={!data || query.isPlaceholderData} /></div>
      )}

      {query.isError && (
        <div className="px-4 pb-3 lg:px-6"><Notice tone="danger">{t('content.plan.load_failed', 'The plan could not be refreshed. What you see may be out of date.')}</Notice></div>
      )}

      {note && (
        <div className="px-4 pb-3 lg:px-6">
          {note.tone === 'danger' ? <Notice tone="danger">{note.text}</Notice> : (
            <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-a-border bg-a-surface-2 px-3.5 py-2.5 text-sm text-a-text animate-a-fade">
              <span>{note.text}</span>
              {note.undo && (
                <button type="button" onClick={() => { const undo = note.undo; setNote(null); undo?.() }} className="font-semibold text-a-accent-text hover:underline">
                  {t('content.plan.undo', 'Undo')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 lg:px-6 xl:flex-row">
        <div className="min-h-[24rem] min-w-0 flex-1 overflow-auto rounded-xl border border-a-border bg-a-surface shadow-a-sm">
          {query.isLoading && <CalendarSkeleton />}
          {!query.isLoading && view === 'week' && (
            <WeekGrid plans={plans} today={today} locale={locale} selectedId={selectedId} dropDate={dropDate} fillingKey={filling} aiPaused={aiPaused}
              {...handlers} onCardPointerDown={drag.begin} />
          )}
          {!query.isLoading && view === 'month' && (
            <MonthGrid plans={plans} date={date} today={today} locale={locale} selectedId={selectedId} dropDate={dropDate}
              onDay={(day) => { setDate(day); setPrefs({ ...prefs, view: 'week' }) }}
              onOpen={openPost} onCardPointerDown={drag.begin} onCardKeyDown={onCardKeyDown} />
          )}
          {!query.isLoading && view === 'list' && (
            <ListView plans={plans} today={today} locale={locale} selectedId={selectedId} fillingKey={filling} aiPaused={aiPaused} {...handlers} />
          )}
        </div>
        <div className="xl:w-64 xl:shrink-0">
          <Tray posts={data?.unscheduled ?? []} active={dropTarget?.kind === 'tray'} selectedId={selectedId}
            onOpen={openPost} onCardPointerDown={wide ? drag.begin : undefined} onCardKeyDown={onCardKeyDown} />
        </div>
      </div>

      <p id={MOVE_HINT_ID} className="sr-only">{t('content.plan.move_hint', 'Shift and the left or right arrow moves it a day.')}</p>
      {drag.state && <DragGhost post={drag.state.post} x={drag.state.x} y={drag.state.y} />}
      {generating && <GenerateDialog today={today} onClose={() => setGenerating(false)} onDone={() => { void refresh() }} />}
    </div>
  )
}
```

In `frontend/src/content/ContentApp.tsx`:
- Add `import { PlanPage } from './plan/PlanPage'` to the imports.
- Replace `<Route index element={null} />` with `<Route index element={<PlanPage />} />`.

- [ ] **Step 3: Run**: `"$R2B/vt.sh" src/content` and `cd frontend && npx tsc -b && npx eslint src/content`
Expected: all PASS; tsc and eslint clean.

- [ ] **Step 4: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: the Plan at /content — views, strip, slots, tray, moves with Undo, Generate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: The post panel — fields, save, the stale-copy refusal, new posts and post links

**Files:**
- Create:
  - `frontend/src/content/lib/languages.ts`
  - `frontend/src/content/panel/panelState.ts`, `PostFormFields.tsx`, `PostPanel.tsx`, `PostLink.tsx`
- Modify: `frontend/src/content/ContentApp.tsx` (route `posts/:id`), `frontend/src/content/ContentShell.tsx` (the panel overlay)
- Test: `frontend/src/content/lib/languages.test.ts`, `frontend/src/content/panel/panelState.test.ts`, `frontend/src/content/panel/PostPanel.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1 (`parseHashtags`, `errorKey`, `failureOf`, types).
  - Task 2 (`usePanel`, `PanelTarget`, `NewDraft`, `useApi`, `useBoot`, `useBrandId`).
  - Task 4 (`PlatformMark`, `StatusPill`).
- Produces:
  - `LANGUAGES`, `languageName(code, locale)`.
  - `PostForm`, `formOf(post)`, `newForm(draft, platforms)`, `changes(base, draft): PostFields`, `isDirty(base, draft)`, `createBody(draft)`, `invalidFields(fields)`.
  - `PostFormFields({form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale})`.
  - `PostPanel` (the overlay; it renders `PanelBody` keyed by the opening).
  - `PostLink` (route `/content/posts/:id`).
  - Inside `PanelBody`, Task 8 uses `adopt(post: PostDetail)`, `editing`, `setEditing`, `dirty` and `post`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/lib/languages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LANGUAGES, languageName } from './languages'

describe('languages', () => {
  it('names a language in the reader\'s language, and falls back to the code', () => {
    expect(languageName('de', 'en')).toBe('German')
    expect(languageName('de', 'ru')).toBe('немецкий')
    expect(languageName('not a code', 'en')).toBe('not a code')
    expect(LANGUAGES).toContain('lv')
  })
})
```

`frontend/src/content/panel/panelState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PostDetail } from '../lib/types'
import { changes, createBody, formOf, invalidFields, isDirty, newForm } from './panelState'

const detail: PostDetail = {
  id: 5, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft',
  title: null, hook: 'Three colours', topic: 'Autumn', pillar_id: 2, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z',
  language: 'en', goal: null, format: null, main_copy: 'Warm tones.\nBook now.', short_copy: null, cta: null, hashtags: ['#autumn', 'hair'],
  audience_id: null, campaign_id: null, weekday_role: null, funnel_stage: null, post_type: null, strategic_reason: null,
  quality: null, published_url: null, published_at: null, generated_by: 'manual', hook_alternatives: [], visual_brief: null,
}

describe('formOf and newForm', () => {
  it('turns a post into the inputs\' text, with "" for none', () => {
    expect(formOf(detail)).toEqual({
      platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft', pillar_id: '2', audience_id: '',
      language: 'en', topic: 'Autumn', hook: 'Three colours', main_copy: 'Warm tones.\nBook now.', cta: '', hashtags: '#autumn hair',
    })
  })

  it('starts a new post on the slot\'s day and platform, or the brand\'s first platform, as a draft', () => {
    expect(newForm({ date: '2026-10-09', platform: 'linkedin' }, ['instagram', 'linkedin'])).toMatchObject({ scheduled_date: '2026-10-09', platform: 'linkedin', status: 'draft', language: '' })
    expect(newForm({ date: null, platform: null }, ['tiktok'])).toMatchObject({ scheduled_date: '', platform: 'tiktok' })
  })
})

describe('changes', () => {
  const base = formOf(detail)

  it('sends only what changed, as the server takes it', () => {
    expect(changes(base, base)).toEqual({})
    expect(changes(base, { ...base, hook: '  New hook ', pillar_id: '', scheduled_time: '' })).toEqual({ hook: 'New hook', pillar_id: null, scheduled_time: null })
    expect(changes(base, { ...base, audience_id: '4' })).toEqual({ audience_id: 4 })
  })

  it('sees no change in a reshuffled spelling of the same hashtags, in spaces around a word, or in an emptied language', () => {
    expect(changes(base, { ...base, hashtags: '#autumn,  hair' })).toEqual({})
    expect(changes(base, { ...base, topic: ' Autumn ' })).toEqual({})
    expect(changes(base, { ...base, language: '' })).toEqual({})
    expect(changes(base, { ...base, hashtags: '#autumn' })).toEqual({ hashtags: ['#autumn'] })
  })

  it('keeps the lines of the text as written', () => {
    expect(changes(base, { ...base, main_copy: 'One.\n\nTwo.' })).toEqual({ main_copy: 'One.\n\nTwo.' })
  })

  it('is dirty only when something would be sent', () => {
    expect(isDirty(base, base)).toBe(false)
    expect(isDirty(base, { ...base, cta: 'Book' })).toBe(true)
  })
})

describe('createBody and invalidFields', () => {
  it('a new post sends every field that holds something', () => {
    expect(createBody(newForm({ date: '2026-10-09', platform: 'linkedin' }, ['linkedin'])))
      .toEqual({ platform: 'linkedin', scheduled_date: '2026-10-09', status: 'draft' })
  })

  it('marks the form fields a refused save names', () => {
    expect(invalidFields({ hook: ['too long'], 'hashtags.0': ['too long'], updated_at: ['required'] })).toEqual(['hook', 'hashtags'])
    expect(invalidFields(undefined)).toEqual([])
  })
})
```

`frontend/src/content/panel/PostPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostDetail } from '../lib/types'
import { PanelProvider, type PanelTarget } from './PanelProvider'
import { PostPanel } from './PostPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const boot = {
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' }, brands: [], accent: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Sam', role: 'staff', can_manage: false }, profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['draft', 'published'],
  rewrites: ['shorter', 'longer'],
} as unknown as Bootstrap

const post: PostDetail = {
  id: 5, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft',
  title: null, hook: 'Three colours', topic: 'Autumn', pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z',
  language: 'en', goal: null, format: null, main_copy: 'Warm tones.', short_copy: null, cta: null, hashtags: [],
  audience_id: null, campaign_id: null, weekday_role: null, funnel_stage: null, post_type: null, strategic_reason: null,
  quality: null, published_url: null, published_at: null, generated_by: 'manual', hook_alternatives: [], visual_brief: null,
}

function render(target: PanelTarget, cached: PostDetail | null = post) {
  const client = new QueryClient()
  if (cached) client.setQueryData(['content', 3, 'post', cached.id], cached)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PanelProvider initial={target}><PostPanel /></PanelProvider>
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('PostPanel', () => {
  it('opens a post with its fields filled, its platform and status, and Save waiting for a change', () => {
    const html = render({ kind: 'post', id: 5, seq: 1 })
    expect(html).toContain('role="dialog"')
    expect(html).toContain('>Post<')
    expect(html).toContain('value="Three colours"')
    expect(html).toContain('Warm tones.')
    expect(html).toContain('value="2026-10-07"')
    expect(html).toContain('data-status="draft"')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save</)
  })

  it('starts a new post from a slot on its day and platform, ready to be created', () => {
    const html = render({ kind: 'new', draft: { date: '2026-10-09', platform: 'linkedin' }, seq: 1 }, null)
    expect(html).toContain('>New post<')
    expect(html).toContain('value="2026-10-09"')
    expect(html).toMatch(/<option value="linkedin" selected="">/)
    expect(html).toMatch(/<button[^>]*>Create post</)
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Create post</)
  })

  it('keeps a published post\'s day, and says why', () => {
    const html = render({ kind: 'post', id: 6, seq: 1 }, { ...post, id: 6, status: 'published' })
    expect(html).toMatch(/<input type="date"[^>]*disabled/)
    expect(html).toContain('A published post keeps the date it went out.')
  })

  it('says it is loading a post it does not have yet', () => {
    expect(render({ kind: 'post', id: 9, seq: 1 }, null)).toContain('role="status"')
  })
})
```

Run: `"$R2B/vt.sh" src/content/panel src/content/lib/languages.test.ts`
Expected: FAIL (the modules do not exist).

- [ ] **Step 2: Write the pure parts**

`frontend/src/content/lib/languages.ts`:

```ts
/** The languages the panel offers for a post; a post keeps any other one it already has. */
export const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'lv', 'lt', 'et', 'uk', 'sv', 'fi', 'da', 'nb', 'cs'] as const

/** A language's name in the reader's language ("de" reads "German" in English); the code where the browser cannot say. */
export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
```

`frontend/src/content/panel/panelState.ts`:

```ts
import { parseHashtags } from '../lib/postText'
import type { DateKey, Platform, PostDetail, PostFields, PostStatus } from '../lib/types'
import type { NewDraft } from './PanelProvider'

/** The post panel's fields as its inputs hold them: text, with '' for "none". */
export interface PostForm {
  platform: Platform
  scheduled_date: string
  scheduled_time: string
  status: PostStatus
  pillar_id: string
  audience_id: string
  language: string
  topic: string
  hook: string
  main_copy: string
  cta: string
  hashtags: string
}

const text = (value: string | null | undefined): string => value ?? ''

export function formOf(post: PostDetail): PostForm {
  return {
    platform: post.platform,
    scheduled_date: text(post.scheduled_date),
    scheduled_time: text(post.scheduled_time),
    status: post.status,
    pillar_id: post.pillar_id === null ? '' : String(post.pillar_id),
    audience_id: post.audience_id === null ? '' : String(post.audience_id),
    language: text(post.language),
    topic: text(post.topic),
    hook: text(post.hook),
    main_copy: text(post.main_copy),
    cta: text(post.cta),
    hashtags: post.hashtags.join(' '),
  }
}

/** A new post: the slot's day and platform (or the brand's first platform), as a draft in the brand's language. */
export function newForm(draft: NewDraft, platforms: readonly Platform[]): PostForm {
  return {
    platform: draft.platform ?? platforms[0] ?? 'instagram',
    scheduled_date: draft.date ?? '',
    scheduled_time: '',
    status: 'draft',
    pillar_id: '',
    audience_id: '',
    language: '',
    topic: '',
    hook: '',
    main_copy: '',
    cta: '',
    hashtags: '',
  }
}

/** Each field as the server takes it: '' is "none" (null); words are trimmed; the text keeps its lines. */
function valuesOf(form: PostForm) {
  const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())
  const id = (value: string): number | null => (value === '' ? null : Number(value))
  return {
    platform: form.platform,
    scheduled_date: orNull(form.scheduled_date) as DateKey | null,
    scheduled_time: orNull(form.scheduled_time),
    status: form.status,
    pillar_id: id(form.pillar_id),
    audience_id: id(form.audience_id),
    language: orNull(form.language),
    topic: orNull(form.topic),
    hook: orNull(form.hook),
    main_copy: form.main_copy.trim() === '' ? null : form.main_copy,
    cta: orNull(form.cta),
    hashtags: parseHashtags(form.hashtags),
  }
}
type Values = ReturnType<typeof valuesOf>

/** What changed since the post was loaded, as the server takes it. An emptied language is left out: a post keeps one. */
export function changes(base: PostForm, draft: PostForm): PostFields {
  const before = valuesOf(base)
  const after = valuesOf(draft)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(after) as (keyof Values)[]) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
    if (key === 'language' && after.language === null) continue
    out[key] = after[key]
  }
  return out as PostFields
}

export const isDirty = (base: PostForm, draft: PostForm): boolean => Object.keys(changes(base, draft)).length > 0

/** A new post as the server takes it: every field that holds something (the server sets the language from the brand). */
export function createBody(draft: PostForm): PostFields & { platform: Platform } {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(valuesOf(draft))) {
    if (value === null || (Array.isArray(value) && value.length === 0)) continue
    out[key] = value
  }
  return out as PostFields & { platform: Platform }
}

const FIELDS: readonly (keyof PostForm)[] = ['platform', 'scheduled_date', 'scheduled_time', 'status', 'pillar_id', 'audience_id', 'language', 'topic', 'hook', 'main_copy', 'cta', 'hashtags']

/** The form fields a refused save names (Laravel's `errors`; `hashtags.0` is the hashtags field). */
export function invalidFields(fields: Record<string, string[]> | undefined): (keyof PostForm)[] {
  const named = new Set(Object.keys(fields ?? {}).map(name => name.split('.')[0]))
  return FIELDS.filter(key => named.has(key))
}
```

- [ ] **Step 3: Write the fields and the panel**

`frontend/src/content/panel/PostFormFields.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, languageName } from '../lib/languages'
import type { AudienceRef, PillarRef, Platform, PostStatus } from '../lib/types'
import type { PostForm } from './panelState'

const BOX = 'w-full rounded-lg border bg-a-surface px-3 py-2 text-sm text-a-text disabled:bg-a-surface-2 disabled:text-a-text-2'

/** A labelled field; a field a refused save named says so under it. */
function FieldBox({ label, hint, invalid, children }: { label: string; hint?: string; invalid: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
      {children}
      {invalid
        ? <span className="mt-1 block text-xs text-a-danger">{t('content.panel.field_invalid', 'Check this field.')}</span>
        : hint ? <span className="mt-1 block text-xs text-a-text-2">{hint}</span> : null}
    </label>
  )
}

/**
 * The post's fields (spec §4.3): platform, day and time, status, pillar,
 * audience, language, topic, hook, text, call to action and hashtags. A
 * published post keeps its day: the day is the record of when it went out.
 */
export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale }: {
  form: PostForm
  onChange: (form: PostForm) => void
  platforms: Platform[]
  statuses: PostStatus[]
  pillars: PillarRef[]
  audiences: AudienceRef[]
  published: boolean
  invalid: (keyof PostForm)[]
  locale: string
}) {
  const { t } = useTranslation()
  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => onChange({ ...form, [key]: value })
  const box = (key: keyof PostForm) => `${BOX} ${invalid.includes(key) ? 'border-a-danger' : 'border-a-border'}`
  const bad = (key: keyof PostForm) => invalid.includes(key) || undefined
  const languages: string[] = [...LANGUAGES]
  if (form.language !== '' && !languages.includes(form.language)) languages.push(form.language)
  const pillarKnown = form.pillar_id === '' || pillars.some(p => String(p.id) === form.pillar_id)
  const audienceKnown = form.audience_id === '' || audiences.some(a => String(a.id) === form.audience_id)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FieldBox label={t('content.panel.fields.platform', 'Platform')} invalid={invalid.includes('platform')}>
          <select value={form.platform} onChange={(e) => set('platform', e.target.value as Platform)} aria-invalid={bad('platform')} className={box('platform')}>
            {platforms.map(p => <option key={p} value={p}>{t(`content.platform.${p}`, p)}</option>)}
          </select>
        </FieldBox>
        <FieldBox label={t('content.panel.fields.status', 'Status')} invalid={invalid.includes('status')}>
          <select value={form.status} onChange={(e) => set('status', e.target.value as PostStatus)} aria-invalid={bad('status')} className={box('status')}>
            {statuses.map(s => <option key={s} value={s}>{t(`content.status.${s}`, s)}</option>)}
          </select>
        </FieldBox>
        <FieldBox label={t('content.panel.fields.date', 'Date')} invalid={invalid.includes('scheduled_date')}
          hint={published ? t('content.panel.fields.published_date', 'A published post keeps the date it went out.') : undefined}>
          <input type="date" value={form.scheduled_date} disabled={published} onChange={(e) => set('scheduled_date', e.target.value)}
            aria-invalid={bad('scheduled_date')} className={box('scheduled_date')} />
        </FieldBox>
        <FieldBox label={t('content.panel.fields.time', 'Time')} invalid={invalid.includes('scheduled_time')}>
          <input type="time" value={form.scheduled_time} onChange={(e) => set('scheduled_time', e.target.value)} aria-invalid={bad('scheduled_time')} className={box('scheduled_time')} />
        </FieldBox>
        <FieldBox label={t('content.panel.fields.pillar', 'Pillar')} invalid={invalid.includes('pillar_id')}>
          <select value={form.pillar_id} onChange={(e) => set('pillar_id', e.target.value)} aria-invalid={bad('pillar_id')} className={box('pillar_id')}>
            <option value="">{t('content.panel.fields.none', 'None')}</option>
            {pillars.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            {!pillarKnown && <option value={form.pillar_id}>{t('content.panel.fields.other_pillar', 'Another pillar')}</option>}
          </select>
        </FieldBox>
        <FieldBox label={t('content.panel.fields.audience', 'Audience')} invalid={invalid.includes('audience_id')}>
          <select value={form.audience_id} onChange={(e) => set('audience_id', e.target.value)} aria-invalid={bad('audience_id')} className={box('audience_id')}>
            <option value="">{t('content.panel.fields.none', 'None')}</option>
            {audiences.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
            {!audienceKnown && <option value={form.audience_id}>{form.audience_id}</option>}
          </select>
        </FieldBox>
      </div>
      <FieldBox label={t('content.panel.fields.language', 'Language')} invalid={invalid.includes('language')}>
        <select value={form.language} onChange={(e) => set('language', e.target.value)} aria-invalid={bad('language')} className={box('language')}>
          <option value="">{t('content.panel.fields.brand_language', "The brand's language")}</option>
          {languages.map(code => <option key={code} value={code}>{languageName(code, locale)}</option>)}
        </select>
      </FieldBox>
      <FieldBox label={t('content.panel.fields.topic', 'Topic')} invalid={invalid.includes('topic')}>
        <input value={form.topic} maxLength={255} onChange={(e) => set('topic', e.target.value)} aria-invalid={bad('topic')} className={box('topic')} />
      </FieldBox>
      <FieldBox label={t('content.panel.fields.hook', 'Hook')} invalid={invalid.includes('hook')}>
        <textarea value={form.hook} rows={2} maxLength={500} onChange={(e) => set('hook', e.target.value)} aria-invalid={bad('hook')} className={box('hook')} />
      </FieldBox>
      <FieldBox label={t('content.panel.fields.main_copy', 'Text')} invalid={invalid.includes('main_copy')}>
        <textarea value={form.main_copy} rows={8} maxLength={20000} onChange={(e) => set('main_copy', e.target.value)} aria-invalid={bad('main_copy')} className={box('main_copy')} />
      </FieldBox>
      <FieldBox label={t('content.panel.fields.cta', 'Call to action')} invalid={invalid.includes('cta')}>
        <input value={form.cta} maxLength={255} onChange={(e) => set('cta', e.target.value)} aria-invalid={bad('cta')} className={box('cta')} />
      </FieldBox>
      <FieldBox label={t('content.panel.fields.hashtags', 'Hashtags')} invalid={invalid.includes('hashtags')}
        hint={t('content.panel.fields.hashtags_hint', 'Separate them with spaces or commas.')}>
        <input value={form.hashtags} onChange={(e) => set('hashtags', e.target.value)} aria-invalid={bad('hashtags')} className={box('hashtags')} />
      </FieldBox>
    </div>
  )
}
```

`frontend/src/content/panel/PostPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { handBackFocus } from '../../workspace/lib/handBack'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { PostDetail } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusPill } from '../ui/StatusDot'
import { usePanel, type PanelTarget } from './PanelProvider'
import { PostFormFields } from './PostFormFields'
import { changes, createBody, formOf, invalidFields, isDirty, newForm, type PostForm } from './panelState'

/** The form as loaded (`base`), as edited (`draft`), and the post it belongs to (null until a new post is created). */
interface Editing { base: PostForm; draft: PostForm; post: PostDetail | null }

/** The post panel (spec §4.3): over the right edge of every page, one post at a time (PanelProvider). */
export function PostPanel() {
  const { target } = usePanel()
  if (!target) return null
  return <PanelBody key={target.seq} target={target} />
}

function PanelBody({ target }: { target: PanelTarget }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const panel = usePanel()
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const heading = useRef<HTMLHeadingElement>(null)
  const panelNow = useRef(panel)
  useEffect(() => { panelNow.current = panel }, [panel])
  const id = target.kind === 'post' ? target.id : null

  // The heading takes the focus; an Escape no drag or dialog claimed closes (asking first about edits); the focus goes back.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    heading.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) panelNow.current.close() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      handBackFocus(opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-content] main'))
    }
  }, [])

  const detail = useQuery({ queryKey: ['content', brand, 'post', id], queryFn: () => api.post(id as number).then(r => r.post), enabled: id !== null })
  const strategies = useQuery({ queryKey: ['content', brand, 'strategies'], queryFn: api.strategies, staleTime: 300_000 })
  const activeId = strategies.data?.strategies.find(s => s.status === 'active')?.id ?? null
  const strategy = useQuery({
    queryKey: ['content', brand, 'strategy', activeId], queryFn: () => api.strategy(activeId as number), enabled: activeId !== null, staleTime: 300_000,
  })
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })

  const [editing, setEditing] = useState<Editing | null>(() => {
    if (target.kind !== 'new') return null
    const form = newForm(target.draft, boot.platforms)
    return { base: form, draft: form, post: null }
  })
  // The post as the server has it, adopted while rendering: when it first arrives, and again when it changes
  // there (a move on the Plan, another device) while nothing is edited here.
  const loaded = detail.data
  if (loaded && (editing === null
    || (editing.post !== null && editing.post.id === loaded.id && editing.post.updated_at !== loaded.updated_at && !isDirty(editing.base, editing.draft)))) {
    setEditing({ base: formOf(loaded), draft: formOf(loaded), post: loaded })
  }

  const dirty = editing !== null && isDirty(editing.base, editing.draft)
  useEffect(() => { panelNow.current.reportDirty(dirty) }, [dirty])

  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [invalid, setInvalid] = useState<(keyof PostForm)[]>([])
  const [conflict, setConflict] = useState<PostDetail | null>(null)

  /** A post the server answered with: the panel, its cached copy and the plan all show it from now on. */
  const adopt = (fresh: PostDetail) => {
    queryClient.setQueryData(['content', brand, 'post', fresh.id], fresh)
    setEditing({ base: formOf(fresh), draft: formOf(fresh), post: fresh })
    void queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] })
  }

  const save = async () => {
    if (!editing || saving) return
    setSaving(true)
    setNote(null)
    setInvalid([])
    try {
      if (editing.post === null) {
        const { post: created } = await api.createPost(createBody(editing.draft))
        queryClient.setQueryData(['content', brand, 'post', created.id], created)
        void queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] })
        panel.replace(created.id)
        return
      }
      const { post: saved } = await api.savePost(editing.post.id, { ...changes(editing.base, editing.draft), updated_at: editing.post.updated_at })
      adopt(saved)
      setNote({ tone: 'success', text: t('content.panel.saved', 'Saved') })
    } catch (error) {
      const failure = failureOf(error)
      // Saved from a copy someone else changed since (spec §7, F3): offer their version, never overwrite it silently.
      if (failure.code === 'changed_elsewhere' && failure.post) {
        setConflict(failure.post)
      } else {
        setInvalid(invalidFields(failure.fields))
        const [key, text] = errorKey('save', failure.code)
        setNote({ tone: 'danger', text: t(key, text) })
      }
    } finally {
      setSaving(false)
    }
  }

  const post = editing?.post ?? null
  const pillars = strategy.data?.strategy.pillars ?? []
  const audiences = brandInfo.data?.audiences ?? []

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="content-panel-title" data-panel=""
      className="fixed bottom-0 right-0 top-14 z-30 flex w-full flex-col border-l border-a-border bg-a-surface shadow-a-lg animate-a-slide-in sm:w-[480px]">
      <div className="flex items-center justify-between gap-3 border-b border-a-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {editing && <PlatformMark platform={editing.draft.platform} />}
          <h2 id="content-panel-title" ref={heading} tabIndex={-1} className="truncate font-a-display text-xl font-normal text-a-text outline-none">
            {post ? t('content.panel.title', 'Post') : t('content.panel.new_title', 'New post')}
          </h2>
          {post && <StatusPill status={post.status} />}
        </div>
        <button type="button" onClick={() => { panel.close() }} aria-label={t('content.common.close', 'Close')} className="rounded p-1.5 text-a-text-2 hover:text-a-text">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {id !== null && !editing && detail.isError && <Notice tone="danger">{t('content.panel.load_failed', 'This post could not be loaded.')}</Notice>}
        {id !== null && !editing && !detail.isError && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
        {conflict && (
          <div className="space-y-2">
            <Notice tone="warning">{t('content.panel.conflict', 'Someone else changed this post while you were editing it.')}</Notice>
            <Button variant="secondary" size="sm" onClick={() => { adopt(conflict); setConflict(null) }}>{t('content.panel.conflict_reload', 'Load their version')}</Button>
          </div>
        )}
        {editing && (
          <PostFormFields form={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} platforms={boot.platforms} statuses={boot.statuses}
            pillars={pillars} audiences={audiences} published={post?.status === 'published'} invalid={invalid} locale={locale} />
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-3 border-t border-a-border px-4 py-3">
          <Button onClick={() => { void save() }} loading={saving} disabled={post !== null && !dirty}>
            {post ? t('content.panel.save', 'Save') : t('content.panel.create', 'Create post')}
          </Button>
          {note && <span role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</span>}
        </div>
      )}
    </aside>
  )
}
```

`frontend/src/content/panel/PostLink.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { usePanel } from './PanelProvider'

/**
 * /content/posts/:id — a post's own link (spec §4.3): its week on the Plan
 * with its panel open (a post with no day opens on this week, its card in
 * the tray). A post of another brand, or one that is gone, says so.
 */
export function PostLink() {
  const { t } = useTranslation()
  const { id } = useParams()
  const postId = Number(id)
  const valid = Number.isInteger(postId) && postId > 0
  const api = useApi()
  const brand = useBrandId()
  const boot = useBoot()
  const panel = usePanel()
  const navigate = useNavigate()
  const done = useRef(false)
  const query = useQuery({
    queryKey: ['content', brand, 'post', valid ? postId : null],
    queryFn: () => api.post(postId).then(r => r.post),
    enabled: valid,
    retry: false,
  })
  const post = query.data
  const { open } = panel

  useEffect(() => {
    if (!post || done.current) return
    done.current = true
    open(post.id)
    navigate(`/content?date=${post.scheduled_date ?? boot.venue.today}`, { replace: true })
  }, [post, open, navigate, boot.venue.today])

  if (!valid || query.isError) {
    return (
      <div className="max-w-xl space-y-3 p-6">
        <Notice tone="danger">{t('content.panel.not_found', 'This post no longer exists, or it belongs to another brand.')}</Notice>
        <Link to="/content" className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
          {t('content.panel.back_to_plan', 'Back to the plan')}
        </Link>
      </div>
    )
  }
  return <p className="p-6 text-sm text-a-text-2" role="status">{t('content.common.loading', 'Loading…')}</p>
}
```

- [ ] **Step 4: Wire the panel in**
  - **`frontend/src/content/ContentApp.tsx`:** add `import { PostLink } from './panel/PostLink'`, and after the index route add `<Route path="posts/:id" element={<PostLink />} />`.
  - **`frontend/src/content/ContentShell.tsx`:**
    - Add `import { PostPanel } from './panel/PostPanel'` to the imports.
    - Replace `overlays={null}>` with `overlays={ready ? <PostPanel /> : null}>`.

- [ ] **Step 5: Run**: `"$R2B/vt.sh" src/content` and `cd frontend && npx tsc -b && npx eslint src/content`
Expected: all PASS; tsc and eslint clean.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: the post panel — fields, save with the stale check, new posts, post links

A save sends only what changed, with the version it read; a save from a copy
someone else changed offers their version instead of overwriting it. The
panel stays open across pages and asks before anything drops an edit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---
### Task 8: AI on a post, and its actions

**Files:**
- Create: `frontend/src/content/panel/AiTools.tsx`, `frontend/src/content/panel/PostActions.tsx`
- Modify: `frontend/src/content/panel/PostPanel.tsx` (draws them under the fields)
- Test: `frontend/src/content/panel/aiTools.test.tsx`, `frontend/src/content/panel/postActions.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1 (`copyText`, `errorKey`, `failureOf`, types).
  - Task 2 (`useApi`, `useBoot`).
  - Task 7 (inside `PanelBody`: `post`, `dirty`, `adopt`, `setEditing`, `panel`, `queryClient`, `brand`).
  - `formatInstant` from `wallClock`.
- Produces:
  - `AiTools({post, dirty, onPost, onUseCopy})`.
  - `PostActions({post, dirty, onPost, onDuplicated, onDeleted})`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/panel/aiTools.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostDetail } from '../lib/types'
import { AiTools } from './AiTools'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const boot = {
  brand: { id: 3, name: 'Lumière Salon' }, ai: { status: 'under', percent: 10 }, rewrites: ['shorter', 'longer', 'professional', 'friendly', 'alternative'],
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
} as unknown as Bootstrap
const post = {
  id: 5, platform: 'instagram', status: 'draft', hook: 'Three colours', main_copy: 'Warm tones.', cta: null, hashtags: [],
  quality: null, visual_brief: null, published_url: null, published_at: null,
} as unknown as PostDetail

function render(p: PostDetail, dirty = false, data: Bootstrap = boot) {
  return renderToStaticMarkup(
    <ContentContext.Provider value={{ data, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <AiTools post={p} dirty={dirty} onPost={() => {}} onUseCopy={() => {}} />
    </ContentContext.Provider>,
  )
}
const disabled = (html: string, label: string) => new RegExp(`<button[^>]*disabled[^>]*>(?:<[^>]+>)*[^<]*${label}`).test(html)

describe('AiTools', () => {
  it('offers the text, the five rewrites, the quality score, the visual brief and the image', () => {
    const html = render(post)
    for (const label of ['Write the text', 'Rewrite', 'Check quality', 'Visual brief', 'Create image']) expect(html).toContain(label)
    for (const kind of ['Shorter', 'Longer', 'More professional', 'Friendlier', 'Another version']) expect(html).toContain(kind)
    expect(disabled(html, 'Write the text')).toBe(false)
  })

  it('while the post has unsaved edits, the tools that would overwrite them wait and say why; a rewrite still works', () => {
    const html = render(post, true)
    expect(html).toContain('Save your changes first.')
    for (const label of ['Write the text', 'Check quality', 'Visual brief', 'Create image']) expect(disabled(html, label), label).toBe(true)
    expect(disabled(html, 'Rewrite')).toBe(false)
  })

  it('shows the quality score, its verdict and how to improve', () => {
    const html = render({ ...post, quality: { scores: {}, overall: 7.46, flags: [], improvements: ['Shorten the hook'], verdict: 'Good, a little long.' } })
    expect(html).toContain('Score: 7.5 of 10')
    expect(html).toContain('Good, a little long.')
    expect(html).toContain('Shorten the hook')
  })

  it('shows the visual brief and the image, with a download and a new image', () => {
    const brief = { visual_type: 'Photo', aspect_ratio: '4:5', style: null, description: 'A warm still life', scene: null, mood: 'Calm', composition: null, text_overlay: null, avoid: null, image_url: '/storage/a.png', image_status: 'ready', image_error: null }
    const html = render({ ...post, visual_brief: brief })
    expect(html).toContain('A warm still life')
    expect(html).toContain('Calm')
    expect(html).toContain('src="/storage/a.png"')
    expect(html).toMatch(/<a href="\/storage\/a.png" download="">/)
    expect(html).toContain('New image')
    expect(render({ ...post, visual_brief: { ...brief, image_status: 'failed', image_url: null } })).toContain('The image could not be created.')
  })

  it('with the month\'s budget used up, says so and waits', () => {
    const html = render(post, false, { ...boot, ai: { status: 'over', percent: 100 } } as Bootstrap)
    expect(html).toContain('AI budget is used up.') // static markup writes the apostrophe of "month's" as &#x27;
    for (const label of ['Write the text', 'Rewrite', 'Check quality']) expect(disabled(html, label), label).toBe(true)
  })
})
```

`frontend/src/content/panel/postActions.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostDetail } from '../lib/types'
import { PostActions } from './PostActions'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const boot = { brand: { id: 3, name: 'Lumière Salon' }, venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' } } as unknown as Bootstrap
const post = { id: 5, status: 'draft', hook: 'Three colours', main_copy: 'Warm tones.', cta: null, hashtags: [], published_url: null, published_at: null } as unknown as PostDetail

function render(p: PostDetail, dirty = false) {
  return renderToStaticMarkup(
    <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <PostActions post={p} dirty={dirty} onPost={() => {}} onDuplicated={() => {}} onDeleted={() => {}} />
    </ContentContext.Provider>,
  )
}

describe('PostActions', () => {
  it('offers Mark ready, Mark published, Duplicate, Copy text and Delete — all waiting while there are unsaved edits', () => {
    const html = render(post)
    for (const label of ['Mark ready', 'Mark published', 'Duplicate', 'Copy text', 'Delete']) expect(html).toContain(label)
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>(?:<[^>]+>)*Duplicate/)
    expect(render(post, true)).toMatch(/<button[^>]*disabled[^>]*>(?:<[^>]+>)*Duplicate/)
    expect(render(post, true)).toContain('Save your changes first.')
  })

  it('a ready post is not marked ready again; a published post says when, links to itself and is not marked published again', () => {
    expect(render({ ...post, status: 'ready_to_publish' })).not.toContain('Mark ready')
    const html = render({ ...post, status: 'published', published_at: '2026-10-07T08:30:00.000000Z', published_url: 'https://instagram.com/p/abc' })
    expect(html).toContain('Published 7 Oct')
    expect(html).toContain('href="https://instagram.com/p/abc"')
    expect(html).not.toContain('Mark published')
  })
})
```

Run: `"$R2B/vt.sh" src/content/panel`
Expected: FAIL (`AiTools`, `PostActions` do not exist).

- [ ] **Step 2: Write** `frontend/src/content/panel/AiTools.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, ImagePlus, Images, PenLine, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { PostDetail, Rewrite, Variation, VisualBrief } from '../lib/types'

type AiAction = 'write' | 'rewrite' | 'quality' | 'brief' | 'image'
const BRIEF_FIELDS: readonly (keyof VisualBrief)[] = ['visual_type', 'aspect_ratio', 'style', 'description', 'scene', 'mood', 'composition', 'text_overlay', 'avoid']
const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * AI on this post (spec §4.3), for every staff member: write the text, the
 * five rewrites with an optional guidance line, the quality score, the
 * visual brief and the image. The tools that write into the post wait while
 * it has unsaved edits (they would overwrite them); a rewrite only offers
 * text to use, so it does not. With the month's budget used up, all wait.
 */
export function AiTools({ post, dirty, onPost, onUseCopy }: {
  post: PostDetail
  dirty: boolean
  /** The post the server answered with (write, quality, brief, image change it). */
  onPost: (post: PostDetail) => void
  /** Put a rewrite into the text field, as an unsaved edit. */
  onUseCopy: (copy: string) => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const [busy, setBusy] = useState<AiAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guidance, setGuidance] = useState('')
  const [kind, setKind] = useState<Rewrite>(boot.rewrites[0] ?? 'shorter')
  const [variation, setVariation] = useState<Variation | null>(null)
  const paused = boot.ai.status === 'over'
  const note = guidance.trim() === '' ? null : guidance.trim()
  const writes = dirty || paused || busy !== null

  const run = async (action: AiAction, call: () => Promise<{ post?: PostDetail; variation?: Variation }>) => {
    setBusy(action)
    setError(null)
    try {
      const answer = await call()
      if (answer.variation) setVariation(answer.variation)
      if (answer.post) onPost(answer.post)
    } catch (e) {
      const [key, text] = errorKey('ai', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(null)
    }
  }

  const quality = post.quality
  const brief = post.visual_brief
  const image = brief?.image_status === 'ready' ? brief.image_url : null

  return (
    <section aria-labelledby="content-ai-title" className="space-y-3 rounded-xl border border-a-border bg-a-canvas/50 p-3">
      <h3 id="content-ai-title" className="flex items-center gap-2 font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">
        <Sparkles size={14} aria-hidden />{t('content.panel.ai.title', 'AI')}
      </h3>
      {paused && <Notice tone="warning">{t('content.ai.error.ai_budget_used_up', "This month's AI budget is used up. Writing by hand still works.")}</Notice>}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.ai.guidance', 'Guidance for the AI (optional)')}</span>
        <input value={guidance} onChange={(e) => setGuidance(e.target.value)} maxLength={1000} className={INPUT} />
      </label>
      {dirty && !paused && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={writes} loading={busy === 'write'} onClick={() => { void run('write', () => api.write(post.id, note)) }}>
          <PenLine size={14} aria-hidden />{t('content.panel.ai.write', 'Write the text')}
        </Button>
        <Button size="sm" variant="secondary" disabled={writes} loading={busy === 'quality'} onClick={() => { void run('quality', () => api.quality(post.id)) }}>
          <Wand2 size={14} aria-hidden />{t('content.panel.ai.quality', 'Check quality')}
        </Button>
        <Button size="sm" variant="secondary" disabled={writes} loading={busy === 'brief'} onClick={() => { void run('brief', () => api.visualBrief(post.id)) }}>
          <Images size={14} aria-hidden />{t('content.panel.ai.brief', 'Visual brief')}
        </Button>
        <Button size="sm" variant="secondary" disabled={writes} loading={busy === 'image'} onClick={() => { void run('image', () => api.image(post.id, note)) }}>
          <ImagePlus size={14} aria-hidden />{image ? t('content.panel.ai.new_image', 'New image') : t('content.panel.ai.image', 'Create image')}
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.ai.rewrite_kind', 'Kind of rewrite')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Rewrite)} className={INPUT}>
            {boot.rewrites.map(r => <option key={r} value={r}>{t(`content.panel.ai.rewrite_type.${r}`, r)}</option>)}
          </select>
        </label>
        <Button size="sm" variant="secondary" disabled={paused || busy !== null} loading={busy === 'rewrite'}
          onClick={() => { void run('rewrite', () => api.rewrite(post.id, kind, note)) }}>
          {t('content.panel.ai.rewrite', 'Rewrite')}
        </Button>
      </div>
      {busy !== null && <p role="status" className="text-xs text-a-text-2">{t('content.panel.ai.working', 'The AI is working…')}</p>}
      {error && <Notice tone="danger">{error}</Notice>}
      {variation && (
        <div className="space-y-2 rounded-lg border border-a-border bg-a-surface p-3">
          <p className="whitespace-pre-wrap text-sm text-a-text">{variation.copy}</p>
          <Button size="sm" variant="ghost" onClick={() => { onUseCopy(variation.copy); setVariation(null) }}>{t('content.panel.ai.use', 'Use this text')}</Button>
        </div>
      )}
      {quality && (
        <div data-quality="" className="space-y-1.5 rounded-lg border border-a-border bg-a-surface p-3">
          {typeof quality.overall === 'number' && (
            <p className="text-sm font-semibold text-a-text">{t('content.panel.ai.score', 'Score: {{score}} of 10', { score: Math.round(quality.overall * 10) / 10 })}</p>
          )}
          {quality.verdict && <p className="text-sm text-a-text-2">{quality.verdict}</p>}
          {(quality.improvements ?? []).length > 0 && (
            <>
              <p className="pt-1 text-xs font-medium text-a-text-2">{t('content.panel.ai.improvements', 'How to improve it')}</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-a-text">
                {quality.improvements.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
      {brief && (
        <div data-brief="" className="space-y-2 rounded-lg border border-a-border bg-a-surface p-3">
          <p className="text-xs font-medium text-a-text-2">{t('content.panel.ai.brief', 'Visual brief')}</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
            {BRIEF_FIELDS.filter(field => brief[field]).map(field => (
              <div key={field} className="contents">
                <dt className="text-a-text-2">{t(`content.panel.ai.brief_field.${field}`, field)}</dt>
                <dd className="text-a-text">{brief[field]}</dd>
              </div>
            ))}
          </dl>
          {image && (
            <div className="space-y-2">
              <img src={image} alt={t('content.panel.ai.image_alt', 'Image for this post')} className="w-full rounded-lg border border-a-border" />
              <a href={image} download className="inline-flex items-center gap-1.5 text-sm font-semibold text-a-accent-text hover:underline">
                <Download size={14} aria-hidden />{t('content.panel.ai.download', 'Download')}
              </a>
            </div>
          )}
          {brief.image_status === 'failed' && <p className="text-sm text-a-danger">{t('content.panel.ai.image_failed', 'The image could not be created.')}</p>}
        </div>
      )}
    </section>
  )
}
```

`frontend/src/content/panel/PostActions.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Copy, CopyPlus, ExternalLink, Send, Trash2 } from 'lucide-react'
import { formatInstant } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { copyText } from '../lib/postText'
import type { PostDetail } from '../lib/types'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
const LINK = /^https?:\/\/\S+$/i

/**
 * What can be done with a saved post (spec §4.3): mark it ready, mark it
 * published (with its link), duplicate it, copy its text, delete it (after a
 * confirm). They wait while the post has unsaved edits.
 */
export function PostActions({ post, dirty, onPost, onDuplicated, onDeleted }: {
  post: PostDetail
  dirty: boolean
  onPost: (post: PostDetail) => void
  onDuplicated: (copy: PostDetail) => void
  onDeleted: (id: number) => void
}) {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [url, setUrl] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const waits = dirty || busy !== null
  const urlOk = url.trim() === '' || LINK.test(url.trim())

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const act = async (name: string, call: () => Promise<void>) => {
    setBusy(name)
    setError(null)
    try {
      await call()
    } catch (e) {
      const [key, text] = errorKey('action', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="content-actions-title" className="space-y-3">
      <h3 id="content-actions-title" className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{t('content.panel.actions.title', 'Actions')}</h3>
      {post.status === 'published' && post.published_at && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-a-text">
          {t('content.panel.actions.published_on', 'Published {{when}}', { when: formatInstant(post.published_at, i18n.language || 'en', boot.venue.timezone) })}
          {post.published_url && (
            <a href={post.published_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-a-accent-text hover:underline">
              <ExternalLink size={14} aria-hidden />{t('content.panel.actions.open_published', 'Open the published post')}
            </a>
          )}
        </p>
      )}
      {dirty && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      <div className="flex flex-wrap gap-2">
        {post.status !== 'ready_to_publish' && post.status !== 'published' && (
          <Button size="sm" variant="secondary" disabled={waits} loading={busy === 'ready'}
            onClick={() => { void act('ready', async () => { onPost((await api.markReady(post.id)).post) }) }}>
            <CheckCircle2 size={14} aria-hidden />{t('content.panel.actions.ready', 'Mark ready')}
          </Button>
        )}
        {post.status !== 'published' && (
          <Button size="sm" variant="secondary" disabled={waits} aria-expanded={publishing} onClick={() => setPublishing(p => !p)}>
            <Send size={14} aria-hidden />{t('content.panel.actions.published', 'Mark published')}
          </Button>
        )}
        <Button size="sm" variant="secondary" disabled={waits} loading={busy === 'duplicate'}
          onClick={() => { void act('duplicate', async () => { onDuplicated((await api.duplicatePost(post.id)).post) }) }}>
          <CopyPlus size={14} aria-hidden />{t('content.panel.actions.duplicate', 'Duplicate')}
        </Button>
        <Button size="sm" variant="secondary" disabled={waits}
          onClick={() => { void act('copy', async () => { await navigator.clipboard.writeText(copyText(post)); setCopied(true) }) }}>
          <Copy size={14} aria-hidden />{copied ? t('content.panel.actions.copied', 'Copied') : t('content.panel.actions.copy', 'Copy text')}
        </Button>
        <Button size="sm" variant="ghost" disabled={waits} onClick={() => setConfirmDelete(true)}>
          <Trash2 size={14} aria-hidden />{t('content.panel.actions.delete', 'Delete')}
        </Button>
      </div>
      {publishing && post.status !== 'published' && (
        <div className="space-y-2 rounded-lg border border-a-border bg-a-surface-2 p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.actions.published_url', 'Link to the published post (optional)')}</span>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={255} aria-invalid={!urlOk || undefined} className={INPUT} />
          </label>
          {!urlOk && <p className="text-xs text-a-danger">{t('content.panel.actions.invalid_url', 'Enter a full link that starts with https://')}</p>}
          <Button size="sm" disabled={!urlOk || waits} loading={busy === 'published'}
            onClick={() => { void act('published', async () => { onPost((await api.markPublished(post.id, url.trim() === '' ? null : url.trim())).post); setPublishing(false) }) }}>
            {t('content.panel.actions.confirm_published', 'Mark published')}
          </Button>
        </div>
      )}
      {confirmDelete && (
        <div role="alert" className="space-y-2 rounded-lg border border-a-danger/30 bg-a-danger/10 p-3">
          <p className="text-sm text-a-text">{t('content.panel.actions.delete_confirm', 'Delete this post? This cannot be undone.')}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={busy === 'delete'}
              onClick={() => { void act('delete', async () => { await api.deletePost(post.id); onDeleted(post.id) }) }}>
              {t('content.panel.actions.delete_yes', 'Delete post')}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy === 'delete'} onClick={() => setConfirmDelete(false)}>{t('content.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
```

- [ ] **Step 3: Draw them in the panel.** In `frontend/src/content/panel/PostPanel.tsx`:
  - Add `import { AiTools } from './AiTools'` and `import { PostActions } from './PostActions'` to the imports.
  - Replace

    ```tsx
            {editing && (
              <PostFormFields form={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} platforms={boot.platforms} statuses={boot.statuses}
                pillars={pillars} audiences={audiences} published={post?.status === 'published'} invalid={invalid} locale={locale} />
            )}
          </div>
    ```
    with

    ```tsx
            {editing && (
              <PostFormFields form={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} platforms={boot.platforms} statuses={boot.statuses}
                pillars={pillars} audiences={audiences} published={post?.status === 'published'} invalid={invalid} locale={locale} />
            )}
            {editing && !post && <p className="text-xs text-a-text-2">{t('content.panel.ai.create_first', 'Create the post first to use AI.')}</p>}
            {post && (
              <>
                <AiTools post={post} dirty={dirty} onPost={adopt}
                  onUseCopy={(copy) => setEditing(e => (e ? { ...e, draft: { ...e.draft, main_copy: copy } } : e))} />
                <PostActions post={post} dirty={dirty} onPost={adopt}
                  onDuplicated={(copy) => {
                    queryClient.setQueryData(['content', brand, 'post', copy.id], copy)
                    void queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] })
                    panel.replace(copy.id)
                  }}
                  onDeleted={(deleted) => {
                    queryClient.removeQueries({ queryKey: ['content', brand, 'post', deleted] })
                    void queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] })
                    panel.close()
                  }} />
              </>
            )}
          </div>
    ```
  - In `frontend/src/content/panel/PostPanel.test.tsx`, add this test inside the `describe`:

    ```tsx
      it('offers AI and the actions on a saved post, and asks a new post to be created first', () => {
        const saved = render({ kind: 'post', id: 5, seq: 1 })
        expect(saved).toContain('Write the text')
        expect(saved).toContain('Mark ready')
        expect(render({ kind: 'new', draft: { date: '2026-10-09', platform: 'linkedin' }, seq: 1 }, null)).toContain('Create the post first to use AI.')
      })
    ```

- [ ] **Step 4: Run**: `"$R2B/vt.sh" src/content` and `cd frontend && npx tsc -b && npx eslint src/content`
Expected: all PASS; tsc and eslint clean.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: AI on a post and its actions — write, rewrites, quality, brief, image; ready, published, duplicate, copy, delete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Find and the list of shortcuts

**Files:**
- Create: `frontend/src/content/find/findItems.ts`, `frontend/src/content/find/ContentFind.tsx`, `frontend/src/content/ui/ContentShortcuts.tsx`
- Modify: `frontend/src/content/ContentShell.tsx` (Find's actions, what a choice does, the overlays)
- Test: `frontend/src/content/find/findItems.test.ts`, `frontend/src/content/ui/contentShortcuts.test.tsx`

**Interfaces:**
- Consumes:
  - `FindFrame`, `FindGroup`, `fold`, `FindItem`, `FindTarget`, `ShortcutsSheet`, `WorkspaceNavItem`.
  - Task 1 (`cardLine`, types); Task 2 (`useApi`, `useBrandId`, `usePanel`).
- Produces:
  - `findActions({nav, dark, wide, slim, words})`, `findGroups({query, actions, posts, labels})`.
  - `postOf(target)`, `settledPosts(typed, asked, found)`, `iconOf(item)`.
  - `ContentFind({open, onClose, onRun, actions, fallbackFocus?})`.
  - `ContentShortcuts({open, onClose, modKey, fallbackFocus?})`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/find/findItems.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CalendarDays, FileText } from 'lucide-react'
import type { PostCard } from '../lib/types'
import { findActions, findGroups, iconOf, postOf, settledPosts } from './findItems'

const words = { newPost: 'New post', goTo: 'Go to', toDark: 'Switch to dark', toLight: 'Switch to light', collapse: 'Collapse menu', expand: 'Expand menu', shortcuts: 'Keyboard shortcuts' }
const nav = [{ to: '/content', label: 'Plan' }]
const post = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: null, status: 'draft',
  title: null, hook: `Hook ${id}`, topic: null, pillar_id: null, image_url: null, updated_at: 'x', ...more,
})
const labels = { actions: 'Actions', posts: 'Posts', untitled: 'Untitled post', unscheduled: 'Unscheduled', platform: (p: string) => p, day: (d: string) => `day ${d}` }

describe('findActions', () => {
  it('a new post, the pages, the other theme, the side panel only where there is one, and the shortcuts', () => {
    const light = findActions({ nav, dark: false, wide: true, slim: false, words })
    expect(light.map(a => a.label)).toEqual(['New post', 'Go to Plan', 'Switch to dark', 'Collapse menu', 'Keyboard shortcuts'])
    expect(light[1].go).toEqual({ to: '/content' })
    const phone = findActions({ nav, dark: true, wide: false, slim: true, words })
    expect(phone.map(a => a.label)).toEqual(['New post', 'Go to Plan', 'Switch to light', 'Keyboard shortcuts'])
  })
})

describe('findGroups', () => {
  const actions = findActions({ nav, dark: false, wide: true, slim: false, words })

  it('shows every action for an empty box, and only the matching ones (accents folded) as you type', () => {
    expect(findGroups({ query: '', actions, posts: [], labels })).toEqual([{ title: 'Actions', items: actions }])
    expect(findGroups({ query: 'PLAN', actions, posts: [], labels })[0].items.map(i => i.label)).toEqual(['Go to Plan'])
    const accented = [{ id: 'x', kind: 'page', label: 'Écrire', go: { to: '/x' } }]
    expect(findGroups({ query: 'ecr', actions: accented, posts: [], labels })[0].items).toHaveLength(1)
  })

  it('lists the posts the server found, with their platform and day (or Unscheduled)', () => {
    const groups = findGroups({ query: 'hook', actions, posts: [post(1), post(2, { scheduled_date: null, hook: null })], labels })
    const posts = groups.find(g => g.title === 'Posts')!.items
    expect(posts.map(p => [p.label, p.sub])).toEqual([['Hook 1', 'instagram · day 2026-10-07'], ['Untitled post', 'instagram · Unscheduled']])
    expect(postOf(posts[0].go)).toBe(1)
  })
})

describe('the rest', () => {
  it('opens a post only for a post choice; shows only the answer to the words in the box; draws each kind\'s icon', () => {
    expect(postOf({ run: 'post:12' })).toBe(12)
    expect(postOf({ run: 'theme' })).toBeNull()
    expect(postOf({ to: '/content' })).toBeNull()
    expect(settledPosts('aut', 'aut', [post(1)])).toHaveLength(1)
    expect(settledPosts('autu', 'aut', [post(1)])).toEqual([])
    expect(settledPosts('a', 'a', [post(1)])).toEqual([])
    expect(iconOf({ id: 'p', kind: 'post', label: '', go: { run: 'post:1' } })).toBe(FileText)
    expect(iconOf({ id: 'g', kind: 'page', label: '', go: { to: '/content' } })).toBe(CalendarDays)
  })
})
```

`frontend/src/content/ui/contentShortcuts.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentShortcuts } from './ContentShortcuts'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key, i18n: { language: 'en' } }),
}))

describe('ContentShortcuts', () => {
  it('lists the keys for every page, then the Plan\'s own', () => {
    const html = renderToStaticMarkup(<ContentShortcuts open onClose={() => {}} modKey="Ctrl" />)
    for (const words of ['Find', 'Ctrl K', 'New post', 'This list', 'On the plan', 'This week', 'Week, month, list', 'Shift ←', 'Close the panel']) {
      expect(html).toContain(words)
    }
    expect(renderToStaticMarkup(<ContentShortcuts open={false} onClose={() => {}} modKey="Ctrl" />)).toBe('')
  })
})
```

Run: `"$R2B/vt.sh" src/content/find src/content/ui`
Expected: FAIL (modules missing).

- [ ] **Step 2: Write** `frontend/src/content/find/findItems.ts`:

```ts
import type { LucideIcon } from 'lucide-react'
import { CalendarDays, FileText, Keyboard, Moon, PanelLeft, Plus, Sun } from 'lucide-react'
import type { FindGroup } from '../../workspace/find/FindFrame'
import { fold, type FindItem, type FindTarget } from '../../workspace/find/findCore'
import type { WorkspaceNavItem } from '../../workspace/WorkspaceShell'
import { cardLine } from '../lib/postText'
import type { DateKey, Platform, PostCard } from '../lib/types'

export interface ActionWords { newPost: string; goTo: string; toDark: string; toLight: string; collapse: string; expand: string; shortcuts: string }

/** Find's actions (spec §4.7): a new post, the pages, the other theme, the side panel (from 1024 px), the list of shortcuts. */
export function findActions(p: { nav: Pick<WorkspaceNavItem, 'to' | 'label'>[]; dark: boolean; wide: boolean; slim: boolean; words: ActionWords }): FindItem[] {
  return [
    { id: 'new', kind: 'new', label: p.words.newPost, go: { run: 'new' } },
    ...p.nav.map(n => ({ id: `page:${n.to}`, kind: 'page', label: `${p.words.goTo} ${n.label}`, go: { to: n.to } })),
    { id: 'theme', kind: p.dark ? 'light' : 'dark', label: p.dark ? p.words.toLight : p.words.toDark, go: { run: 'theme' } },
    ...(p.wide ? [{ id: 'rail', kind: 'rail', label: p.slim ? p.words.expand : p.words.collapse, go: { run: 'rail' } }] : []),
    { id: 'shortcuts', kind: 'shortcuts', label: p.words.shortcuts, go: { run: 'shortcuts' } },
  ]
}

export interface FindLabels {
  actions: string
  posts: string
  untitled: string
  unscheduled: string
  platform: (platform: Platform) => string
  day: (date: DateKey) => string
}

/** Find's groups: the actions whose words match (all of them for an empty box), then the posts the server found. */
export function findGroups({ query, actions, posts, labels }: { query: string; actions: FindItem[]; posts: PostCard[]; labels: FindLabels }): FindGroup<FindItem>[] {
  const q = fold(query.trim())
  const matching = q === '' ? actions : actions.filter(a => fold(a.label).includes(q))
  const groups: FindGroup<FindItem>[] = []
  if (matching.length > 0) groups.push({ title: labels.actions, items: matching })
  if (posts.length > 0) {
    groups.push({
      title: labels.posts,
      items: posts.map(post => ({
        id: `post:${post.id}`,
        kind: 'post',
        label: cardLine(post) || labels.untitled,
        sub: `${labels.platform(post.platform)} · ${post.scheduled_date ? labels.day(post.scheduled_date) : labels.unscheduled}`,
        go: { run: `post:${post.id}` },
      })),
    })
  }
  return groups
}

/** The post a Find choice opens, or null for any other choice. */
export function postOf(target: FindTarget): number | null {
  if (!('run' in target)) return null
  const match = /^post:(\d+)$/.exec(target.run)
  return match ? Number(match[1]) : null
}

/** Only the answer to the words now in the box: an earlier search's posts would sit under words they do not match. */
export function settledPosts(typed: string, asked: string, found: PostCard[] | undefined): PostCard[] {
  return typed.length >= 2 && typed === asked ? (found ?? []) : []
}

export function iconOf(item: FindItem): LucideIcon {
  switch (item.kind) {
    case 'page': return CalendarDays
    case 'new': return Plus
    case 'dark': return Moon
    case 'light': return Sun
    case 'rail': return PanelLeft
    case 'shortcuts': return Keyboard
    default: return FileText
  }
}
```

`frontend/src/content/find/ContentFind.tsx`:

```tsx
import { useEffect, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FindFrame } from '../../workspace/find/FindFrame'
import type { FindItem, FindTarget } from '../../workspace/find/findCore'
import { formatDate } from '../../workspace/lib/wallClock'
import { useApi, useBrandId } from '../ContentProvider'
import { findGroups, iconOf, settledPosts } from './findItems'

/**
 * Content's Find (spec §4.7) on the shared frame: the brand's posts by title,
 * topic, hook or text (up to 8, searched on the server from two letters),
 * and the actions. Nothing is drawn, and nothing fetched, while it is closed.
 */
export function ContentFind({ open, onClose, onRun, actions, fallbackFocus }: {
  open: boolean
  onClose: () => void
  onRun: (target: FindTarget) => void
  actions: FindItem[]
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  if (!open) return null
  return <FindPanel onClose={onClose} onRun={onRun} actions={actions} fallbackFocus={fallbackFocus} />
}

function FindPanel({ onClose, onRun, actions, fallbackFocus }: { onClose: () => void; onRun: (target: FindTarget) => void; actions: FindItem[]; fallbackFocus?: RefObject<HTMLElement | null>[] }) {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')

  // The server is asked once typing pauses; the state is set from the timer's callback.
  useEffect(() => {
    const timer = window.setTimeout(() => setAsked(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const typed = query.trim()
  const search = useQuery({
    queryKey: ['content', brand, 'find', asked],
    queryFn: () => api.find(asked).then(r => r.posts),
    enabled: asked.length >= 2,
    staleTime: 30_000,
    retry: false,
  })
  const posts = settledPosts(typed, asked, search.data)
  const waiting = typed.length >= 2 && (asked !== typed || search.isFetching)
  const groups = findGroups({
    query, actions, posts,
    labels: {
      actions: t('content.find.actions', 'Actions'),
      posts: t('content.find.posts', 'Posts'),
      untitled: t('content.plan.untitled', 'Untitled post'),
      unscheduled: t('content.common.unscheduled', 'Unscheduled'),
      platform: p => t(`content.platform.${p}`, p),
      day: d => formatDate(d, i18n.language || 'en', { weekday: 'short', day: 'numeric', month: 'short' }),
    },
  })

  return (
    <FindFrame prompt={t('content.shell.find', 'Find a post or action')} query={query} onQuery={setQuery}
      groups={groups} iconOf={iconOf}
      onPick={(item) => { onRun(item.go); onClose() }}
      onShortcuts={() => { onRun({ run: 'shortcuts' }); onClose() }}
      onClose={onClose}
      waiting={waiting ? t('content.find.searching', 'Searching posts…') : null}
      fallbackFocus={fallbackFocus} />
  )
}
```

`frontend/src/content/ui/ContentShortcuts.tsx`:

```tsx
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutsSheet } from '../../workspace/ui/ShortcutsSheet'

/**
 * The list of shortcuts behind "?" (spec §4.7): the keys for every page
 * first, then the Plan's own under "On the plan" — the sheet opens anywhere,
 * but the week, view and card keys work only there.
 */
export function ContentShortcuts({ open, onClose, modKey, fallbackFocus }: {
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
        { name: t('content.shortcuts.find', 'Find'), keys: [[`${modKey} K`], ['/']] },
        { name: t('content.shell.new_post', 'New post'), keys: [['N']] },
        { name: t('content.shortcuts.help', 'This list'), keys: [['?']] },
      ] },
      { title: t('content.shortcuts.on_plan', 'On the plan'), rows: [
        { name: t('content.shortcuts.this_week', 'This week'), keys: [['T']] },
        { name: t('content.shortcuts.pages', 'Previous or next week (month in the month view)'), keys: [['←', '→']] },
        { name: t('content.shortcuts.views', 'Week, month, list'), keys: [['W', 'M', 'L']] },
        { name: t('content.shortcuts.move', 'Move a focused post a day'), keys: [['Shift ←', 'Shift →']] },
        { name: t('content.shortcuts.close', 'Close the panel'), keys: [['Esc']] },
      ] },
    ]} />
  )
}
```

- [ ] **Step 3: Wire Find and the sheet into the shell.** In `frontend/src/content/ContentShell.tsx`:
  - **Imports:**
    - Replace `import { Link, Navigate, useLocation } from 'react-router-dom'` with `import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'`.
    - Add these imports:
      ```tsx
      import type { FindTarget } from '../workspace/find/findCore'
      import { useMedia } from '../workspace/lib/useMedia'
      import { ContentFind } from './find/ContentFind'
      import { findActions, postOf } from './find/findItems'
      import { ContentShortcuts } from './ui/ContentShortcuts'
      ```
  - **Hooks:** directly after `const panel = usePanel()`, add:
    ```tsx
      const navigate = useNavigate()
      // The side panel, and with it "collapse the menu", exists from 1024 px (lg).
      const wide = useMedia('(min-width: 1024px)')
    ```
  - **Find's list and what a choice does:** directly after the `chooseBrand` line, add:
    ```tsx
      // Find: what it offers (the pages this person sees above), and what each choice does.
      const slim = look.rail === 'slim'
      const findList = findActions({
        nav, dark: look.resolved === 'dark', wide, slim,
        words: {
          newPost: t('content.shell.new_post', 'New post'),
          goTo: t('content.find.go_to', 'Go to'),
          toDark: t('content.find.theme_dark', 'Switch to dark'),
          toLight: t('content.find.theme_light', 'Switch to light'),
          collapse: t('content.find.collapse', 'Collapse menu'),
          expand: t('content.find.expand', 'Expand menu'),
          shortcuts: t('content.find.shortcuts', 'Keyboard shortcuts'),
        },
      })
      const runFind = (target: FindTarget) => {
        const post = postOf(target)
        if (post !== null) openPost(post)
        else if ('to' in target) navigate(target.to)
        else if (target.run === 'new' && today !== null) openNew({ date: today, platform: null })
        else if (target.run === 'theme') look.setTheme(look.resolved === 'dark' ? 'light' : 'dark')
        else if (target.run === 'rail') look.setRail(slim ? 'full' : 'slim')
        else if (target.run === 'shortcuts') setHelpOpen(true)
      }
    ```
  - **Opening a post:** replace `const { openNew, close } = panel` with `const { openNew, close, open: openPost } = panel`.
  - **Overlays:** replace `overlays={ready ? <PostPanel /> : null}>` with:
    ```tsx
          overlays={ready ? <>
            <PostPanel />
            <ContentFind open={findOpen} onClose={() => setFindOpen(false)} onRun={runFind} actions={findList} fallbackFocus={[findButton, main]} />
            <ContentShortcuts open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} fallbackFocus={[findButton, main]} />
          </> : null}>
    ```

- [ ] **Step 4: Run**

```bash
"$R2B/vt.sh" src/content src/workspace src/i18n/localeCompleteness.test.ts
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && npx eslint src/content src/workspace src/App.tsx
```
Expected: all PASS; tsc and eslint clean.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: Find (posts and actions) and the list of shortcuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Whole runs, the build check, the portal in a real browser, and the runbook

**Files:**
- Modify: `docs/content-workspace.md` (the portal's half)
- Temporary, undone in this task:
  - local servers on :8012 and :5173;
  - a labelled demo set for local org 16 (`$R2B/seed.php`, removed by `$R2B/unseed.php`);
  - sign-in tokens named `content-r2b-shots`;
  - `$R2B/build/`.

- [ ] **Step 1: Every frontend suite, the types, the lint**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
npx tsc -b && echo "tsc clean"
"$R2B/vt.sh" > "$R2B/final-vitest.txt"; grep -E "Tests |FAIL " "$R2B/final-vitest.txt"
npx eslint . > "$R2B/final-eslint.txt" 2>&1; tail -3 "$R2B/final-eslint.txt"
```
Expected:
- `tsc clean`.
- Vitest: exactly the 3 baseline `plannerMeta` failures, and more passing tests than `$R2B/baseline-vitest.txt` shows.
- ESLint: `1 problem (1 error…)`, the same `tailwindTokens.test.ts` line as the baseline.

Any other failure is ours: investigate it (systematic-debugging) and fix it in the file of the task that introduced it.

Then the server, which this plan does not change, by directory:

```bash
cd /c/wamp64/www/Hexa-Tech-content
for p in tests/Feature/Content/ tests/Unit/Content/ tests/Feature/AdminAccess/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests:"; done
```
Expected: `Tests: 69 passed`, `3 passed` and `51 passed`.

- [ ] **Step 2: The build check**: the portal is its own chunk and the admin's index carries none of it (spec §9).

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
npx vite build --outDir "$R2B/build" --emptyOutDir > "$R2B/build-log.txt" 2>&1; tail -3 "$R2B/build-log.txt"
ls "$R2B/build/assets" | grep -E '^(ContentApp|AppointmentsApp)-.*\.js$'
grep -l 'Fill with AI' "$R2B/build/assets/"*.js | xargs -n1 basename
grep -l 'data-content' "$R2B/build/assets/"index-*.js || echo "index carries no data-content"
grep -c 'data-content' "$R2B/build/assets/"index-*.css
rm -rf "$R2B/build"
```
Expected:
- The build succeeds.
- Both `ContentApp-*.js` and `AppointmentsApp-*.js` exist.
- `Fill with AI` appears only in `ContentApp-*.js`.
- `index carries no data-content` is printed.
- The CSS count is above zero (content.css is global but scoped, like appointments.css).

This build is a check only: `frontend/dist` and `public/spa` are not touched.

- [ ] **Step 3: Seed a labelled demo set for org 16, and start the servers**

Write `$R2B/seed.php` with the Write tool:

```php
<?php
// Plan 2B browser check: a small, labelled set of Content data for local org 16 (Lumière Salon).
// unseed.php removes exactly this set. Nothing here touches another organisation.
use Illuminate\Support\Facades\DB;

$org = 16;
$brand = DB::table('brands')->where('organization_id', $org)->where('is_default', true)->whereNull('deleted_at')->value('id');
if (!$brand) { echo "NO_BRAND\n"; return; }
if (DB::table('content_planner_profiles')->where('brand_id', $brand)->exists()) { echo "PROFILE_EXISTS\n"; return; }

$now = now();
$profile = DB::table('content_planner_profiles')->insertGetId([
    'organization_id' => $org, 'brand_id' => $brand, 'name' => 'Browser check (content r2b)', 'default_language' => 'en',
    'setup_completed_at' => $now, 'created_at' => $now, 'updated_at' => $now,
]);
$days = fn (array $on) => json_encode(array_merge(array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], false), array_fill_keys($on, true)));
foreach ([['instagram', 'Instagram', ['mon', 'wed', 'fri']], ['linkedin', 'LinkedIn', ['tue', 'thu']], ['facebook', 'Facebook', ['sat']]] as [$platform, $label, $on]) {
    DB::table('content_planner_channels')->insert([
        'organization_id' => $org, 'brand_id' => $brand, 'planner_profile_id' => $profile, 'platform' => $platform, 'label' => $label,
        'active' => true, 'frequency' => $days($on), 'created_at' => $now, 'updated_at' => $now,
    ]);
}

$monday = Carbon\CarbonImmutable::now(App\Services\Appointments\VenueClock::zone($org))->startOfWeek();
$posts = [
    [0, 'instagram', '09:00', 'published', 'Three colours for October', 'Autumn colours'],
    [1, 'linkedin', null, 'ready_to_publish', 'What a calm studio does for your week', 'Studio life'],
    [2, 'instagram', '12:30', 'draft', 'Before and after: copper balayage', 'Transformations'],
    [3, 'linkedin', '10:00', 'needs_review', 'Meet the team: Elena, our colour lead', 'Team'],
    [5, 'facebook', '11:00', 'approved', 'Saturday open studio', 'Events'],
    [7, 'instagram', '09:00', 'draft', 'Winter care starts now', 'Care tips'],
    [8, 'linkedin', '10:00', 'draft', 'Why we use organic colour', 'Values'],
    [null, 'instagram', null, 'idea', 'Five minutes to healthier hair', 'Care tips'],
    [null, 'facebook', null, 'idea', 'Gift cards for the holidays', 'Offers'],
];
foreach ($posts as [$offset, $platform, $time, $status, $hook, $topic]) {
    DB::table('content_planner_posts')->insert([
        'organization_id' => $org, 'brand_id' => $brand, 'planner_profile_id' => $profile, 'platform' => $platform,
        'scheduled_date' => $offset === null ? null : $monday->addDays($offset)->toDateString(), 'scheduled_time' => $time,
        'status' => $status, 'hook' => $hook, 'topic' => $topic, 'language' => 'en', 'generated_by' => 'manual',
        'main_copy' => "Autumn is the season of warm tones.\n\nBook your colour consultation this week.", 'hashtags' => json_encode(['#autumn', '#hair']),
        'published_at' => $status === 'published' ? $now : null,
        'created_at' => $now, 'updated_at' => $now,
    ]);
}
echo "PROFILE {$profile}\n";
```

Write `$R2B/unseed.php` with the Write tool:

```php
<?php
// Removes exactly what seed.php made (found by its label), and every row the browser check's AI calls added to it.
use Illuminate\Support\Facades\DB;

$profile = DB::table('content_planner_profiles')->where('organization_id', 16)->where('name', 'Browser check (content r2b)')->value('id');
if (!$profile) { echo "NOTHING\n"; return; }
$posts = DB::table('content_planner_posts')->where('planner_profile_id', $profile)->pluck('id');
DB::table('content_planner_visual_briefs')->whereIn('post_id', $posts)->delete();
DB::table('content_planner_post_variations')->whereIn('post_id', $posts)->delete();
DB::table('content_planner_posts')->where('planner_profile_id', $profile)->delete();
foreach (['content_planner_ai_generations', 'content_planner_channels', 'content_planner_brand_voices', 'content_planner_audiences', 'content_planner_pillars', 'content_planner_strategies'] as $table) {
    DB::table($table)->where('planner_profile_id', $profile)->delete();
}
DB::table('content_planner_profiles')->where('id', $profile)->delete();
echo "REMOVED {$profile}\n";
```

```bash
cd /c/wamp64/www/Hexa-Tech-content
netstat -ano | grep -E ':(8012|5173) .*LISTENING' ; echo "ports above must be empty"
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R2B/seed.php" | tail -1
```
- Expected: `PROFILE <id>`.
- `PROFILE_EXISTS` means an earlier run was not undone: run `unseed.php` first, then seed again.
- `NO_BRAND` means org 16 has no default brand locally: stop and report it.

Start the API and Vite, each in the background (Bash `run_in_background`):

```bash
cd /c/wamp64/www/Hexa-Tech-content && CORS_ALLOWED_ORIGINS=http://localhost:5173 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --port=8012 --no-reload
```
```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

- [ ] **Step 4: Capture the screens**

The tools from release 1 already hold `playwright-core`; copy them:

```bash
cp -r /c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/archive/2026-10-14-content-workspace-r1/work/tools "$R2B/tools"
test -e "$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe" && echo "chromium present"
grep -c "^ANTHROPIC_API_KEY=..*" /c/wamp64/www/Hexa-Tech-content/.env
```
The last line prints only a count (1 means a local AI key exists), never the key.

Write `$R2B/tools/shots.mjs` with the Write tool:

```js
// Real-browser screens of HexaTech Content on local org 16 (Plan 2B, Task 10). The API runs on :8012 and Vite on :5173.
//   node shots.mjs          the screens, no AI call
//   AI=1 node shots.mjs     also one real Fill with AI and one real week from Generate (spec §9; needs a local AI key)
// Sign-in tokens are minted through tinker into memory, never printed, and deleted when the run ends.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(HERE, '../shots')
const APP = 'http://localhost:5173'
const API = 'http://127.0.0.1:8012/api'
const PHP = 'C:/wamp64/bin/php/php8.4.20/php.exe'
const BACKEND = 'C:/wamp64/www/Hexa-Tech-content'
const MANAGER = 'appointments-tester@example.test'
const TOKEN_NAME = 'content-r2b-shots'
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')

const tinker = code => execFileSync(PHP, ['artisan', 'tinker', `--execute=${code}`], { cwd: BACKEND, encoding: 'utf8' })
const staffEmail = () => tinker("echo DB::table('users')->join('staff','staff.user_id','=','users.id')->where('staff.organization_id',16)->where('staff.role','staff')->where('staff.is_active',true)->value('users.email');").trim().split('\n').pop()
function mint(email) {
  const out = tinker(`echo App\\Models\\User::where('email', '${email}')->firstOrFail()->createToken('${TOKEN_NAME}')->plainTextToken;`)
  const token = out.match(/\d+\|[A-Za-z0-9]{20,}/)?.[0]
  if (!token) throw new Error(`no token minted for ${email}`)
  return token
}
const dropTokens = () => tinker(`Laravel\\Sanctum\\PersonalAccessToken::where('name', '${TOKEN_NAME}')->delete();`)

async function session(browser, token, { theme = 'light', lang = 'en', width = 1440, height = 900 } = {}) {
  const me = await (await fetch(`${API}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()
  if (!me?.id) throw new Error('auth/me did not answer with a user')
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', locale: lang === 'ru' ? 'ru-RU' : 'en-GB',
  })
  await context.addInitScript(([t, user, look, language]) => {
    localStorage.setItem('auth_token', t)
    localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token: t, user, staff: user.staff ?? null }, version: 1 }))
    localStorage.setItem('content:look', look)
    localStorage.setItem('admin_lang', language)
  }, [token, me, JSON.stringify({ theme, rail: 'full' }), lang])
  return { context, page: await context.newPage() }
}

async function open(page, url) {
  await page.goto(`${APP}${url}`, { timeout: 90_000 })
  await page.waitForSelector('[data-content] main', { timeout: 90_000 })
  await page.waitForSelector('[data-figure="planned"], [data-drop-date]', { timeout: 90_000 })
  await page.waitForLoadState('networkidle')
}

const taken = []
async function shot(page, name) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
  taken.push(name)
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--font-render-hinting=none'] })
  const manager = mint(MANAGER)
  const staffMail = staffEmail()
  const staff = staffMail && staffMail.includes('@') ? mint(staffMail) : null
  try {
    {
      const { context, page } = await session(browser, manager)
      await open(page, '/content')
      await shot(page, 'plan-week-light')
      await page.locator('[data-post]').first().click()
      await page.waitForSelector('[data-panel] input')
      await shot(page, 'panel-light')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Generate', exact: true }).click()
      await page.waitForSelector('[aria-modal="true"]')
      await shot(page, 'generate-light')
      await page.keyboard.press('Escape')
      await page.keyboard.press('m')
      await page.waitForTimeout(1000)
      await shot(page, 'plan-month-light')
      await page.keyboard.press('w')
      await page.keyboard.press('Control+k')
      await page.keyboard.type('autumn')
      await page.waitForTimeout(1500)
      await shot(page, 'find-light')
      await page.keyboard.press('Escape')
      if (process.env.AI === '1') {
        const fill = page.getByRole('button', { name: 'Fill with AI' }).first()
        if (await fill.count()) {
          await fill.click()
          await page.waitForSelector('[data-panel] input', { timeout: 300_000 })
          await shot(page, 'ai-fill-light')
          await page.keyboard.press('Escape')
        }
        await page.getByRole('button', { name: 'Generate', exact: true }).click()
        await page.waitForSelector('[aria-modal="true"]')
        await page.getByRole('button', { name: 'Next week' }).click()
        await page.locator('[aria-modal="true"]').getByRole('button', { name: 'Generate', exact: true }).click()
        await page.waitForSelector('text=/Posts written|No posts were written/', { timeout: 300_000 })
        await shot(page, 'ai-generate-light')
      }
      await context.close()
    }
    {
      const { context, page } = await session(browser, manager, { theme: 'dark' })
      await open(page, '/content')
      await shot(page, 'plan-week-dark')
      await page.locator('[data-post]').first().click()
      await page.waitForSelector('[data-panel] input')
      await shot(page, 'panel-dark')
      await context.close()
    }
    {
      const { context, page } = await session(browser, manager, { lang: 'ru' })
      await open(page, '/content')
      await shot(page, 'plan-week-ru')
      await page.keyboard.press('Shift+Slash')
      await page.waitForTimeout(800)
      await shot(page, 'shortcuts-ru')
      await context.close()
    }
    {
      const { context, page } = await session(browser, manager, { width: 390, height: 844 })
      await open(page, '/content')
      await shot(page, 'phone-list-light')
      await context.close()
    }
    if (staff) {
      const { context, page } = await session(browser, staff)
      await open(page, '/content')
      await shot(page, 'staff-week-light')
      await context.close()
    }
  } finally {
    await browser.close()
    dropTokens()
  }
  console.log(`${taken.length} screens: ${taken.join(', ')}${staff ? '' : ' (no active staff-role user in org 16: staff screen skipped)'}`)
}

main().catch(e => { console.error(e); process.exitCode = 1 })
```

```bash
cd "$R2B/tools" && node shots.mjs | tail -2
```
- Expected: `10 screens: …` (9 without a staff user, and then the line says so).
- When `.env` has an AI key, also run `AI=1 node shots.mjs | tail -2` once. Expected: 12 screens, including `ai-fill-light` and `ai-generate-light`.
- That run writes real AI drafts into the demo set (unseed removes them). It spends a few cents on the owner's local key, which spec §9 asks for.
- Without a key, write "AI calls not made: no local key" in `$R2B/eyes.md`.

- [ ] **Step 5: Look with your eyes**

Open every screen in `$R2B/shots/` with the Read tool and write one line per screen in `$R2B/eyes.md`, saying what is on it. Each must be the real, loaded screen it is named for:
- `plan-week-*`: seven days, cards with platform marks and dots, the four figures, at least one empty slot, the tray with two ideas.
- `panel-*`: filled fields, AI tools, actions.
- `generate-light`: presets, channels, empty slots only.
- `plan-month-light`: the month grid.
- `find-light`: posts found for "autumn".
- `shortcuts-ru`: Russian words.
- `phone-list-light`: the list, no seven columns, the brand line and New post icon in the header.
- `staff-week-light`: no Generate.

A screen that shows a sign-in page, an error or an empty plan proves nothing. Find the cause (the data, the script or the code), fix it, and capture again. If the cause is in the code, fix it in the file of the task that introduced it, with a test where one can catch it.

- [ ] **Step 6: Undo everything temporary**

```bash
# servers: TaskStop the API and the Vite task, then check
netstat -ano | grep -E ':(8012|5173) .*LISTENING' ; echo "must be empty"
cd /c/wamp64/www/Hexa-Tech-content
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R2B/unseed.php" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo Laravel\Sanctum\PersonalAccessToken::where('name','content-r2b-shots')->count();" | tail -1
git status --short | grep -v '^??' ; echo "tracked files above must be only this plan's"
```
- Expected: no port listening, `REMOVED <id>`, `0`, and no stray tracked change.
- If a Vite `node.exe` keeps 5173 after TaskStop:
  1. Check its command line names `Hexa-Tech-content` (PowerShell `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select CommandLine`).
  2. Then run `taskkill //PID <pid> //F`.

- [ ] **Step 7: The runbook's portal half.** In `docs/content-workspace.md`:
  - Replace the sentence "This page covers the server; the portal's half is added with release 2's Plan B." with "This page covers the server and the portal; the full admin's way in and the retirements are added with release 2's Plan D."
  - Then add this section before "## What this release does not do":

```markdown
## The portal (`/content`, `frontend/src/content/`)

- **Where it lives.** A lazily loaded app on the shared workspace core (`src/workspace/`), beside Appointments: own chunk, own shell, no full-admin copilot.
- **Look.** Kept on the device under `content:look` and `content:brand-paint`.
- **Brand.** Every call names its brand in the address (`?brand_id=`), so the full admin's request hook leaves it alone. The device remembers the brand under `content:brand`; on a first visit it takes the full admin's choice, else the person's default. A remembered brand the person may no longer use (the server's `code: brand_not_allowed`) is forgotten, and the default is asked for instead. Switching brand clears every Content query and asks first about unsaved edits.
- **Plan.**
  - Week, month or list. Below 1024 px only the list.
  - Read every 60 s and on focus.
  - The This week strip comes from the server's figures for the shown range.
  - Empty slots offer Write (a new post for that day and platform) and Fill with AI (one post, through the server's one-day generation).
  - The Unscheduled tray. A card is moved by drag (mouse and pen after 4 px; a finger after a still 400 ms) or by Shift+← / → on a focused card. A move saves at once with the version it read, and an Undo shows for 8 s. A refused move says why and reads the plan again.
  - Published posts do not move.
  - Generate is for managers only. It covers ≤ 62 days, and days already gone are never written (the server's `range_in_past`).
- **Post panel.**
  - App-level: it stays open across pages.
  - A save sends only what changed, with the `updated_at` it read. A save from a stale copy offers "Load their version".
  - Closing it, opening another post, switching brand or leaving the site with unsaved edits asks first.
  - AI tools that write into the post wait while it has unsaved edits; a rewrite only offers text to use.
  - Post links: `/content/posts/<id>` opens the post's week with the panel.
- **Find** (Ctrl/⌘ K or "/") searches the brand's posts on the server from two letters (up to 8), plus the actions.
- **Shortcuts:**
  - N new post, T this week, ← → back and forward, W M L views, ? the list.
  - The Cyrillic layouts reach the same keys by their places.
- **Words.**
  - Five languages in `src/content/i18n/content.{en,ru,de,fr,es}.json`, under `content.*`. `contentLocales.test.ts` keeps the key sets equal and the `{{names}}` intact.
  - Every refusal is shown in the portal's own words (`lib/errors.ts`).
- **Colours.** `theme/content.css`, under `[data-content]`. Each platform's fill takes white ink while white reads 3:1 on it, else dark ink. Each status's tone reads 4.5:1 over its own tint (`contentCss.test.ts`).
```

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -F - <<'EOF'
Document HexaTech Content's portal: brand, Plan, panel, Find, shortcuts, words, colours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline cc21007f1..HEAD | cat
```
