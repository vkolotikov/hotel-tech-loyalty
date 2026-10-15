# HexaTech Content — Release 2, Plan D: the Way In, the Retirements, the Checks and the Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish release 2 of HexaTech Content and ship it:
- the way in from the full admin: the menu item, the Marketing hub tile, the old address redirected, a sign-in that ran out bringing people back to `/content`, and the workspace landing after sign-in;
- the retirements: the old Content Planner's six controllers, its 35 routes and access key, its screens (about 5,300 lines), and its help pages rewritten for HexaTech Content;
- the deferred items of release 1 and Plans A–C that a person would meet, fixed with tests;
- the release checks the spec asks for (§9): every suite, the build, the Appointments pixel comparison, Lighthouse accessibility, and one browser pass that writes for real;
- the deploy, by the source-patch recipe, after the owner's "yes, deploy".

**Architecture:**
- **Way in.** The generic half of the landing helpers moves to `frontend/src/workspace/lib/landing.ts` (spec §6.1's last row): `showsWorkspaceLink(user, name)`, `loginPathAfterExpiry` for both workspaces, `landingPath` knowing both, `safeRedirect`, `loginPath`. `appointments/lib/landing.ts` keeps its Appointments-only rules and re-exports the rest, so no Appointments import changes.
- **Retirements.** Controllers, routes, the access key and screens go; every service, job and model stays (the new Content code uses them all). The one test that called an old controller (`CalendarGenerationTest`) is re-pointed at the generation service it was testing.
- **Fixes.** Server hardening (generic AI-failure words, two locks, PostgreSQL ordering, a cleared date clears the time, isolation tests) and three portal batches (Plan, panel and dialog; error boundary, Strategy and Posts; Brand and setup), each fix with a test that fails first. Then the release-1 leftovers and the runbook.
- **Checks.** Every suite by folder, the build, Appointments pixel for pixel against what is live, Lighthouse, and one browser pass that writes for real on a temporary brand.
- **Ship.** A deploy worktree from `origin/main`, the change list since the last deployed feature tip (`ec0eaf085`), parity, every suite on the artifact, a fresh build, then **stop for the owner's "yes, deploy"**, push, and verify by content.

**Tech Stack:** as Plans A–C: Laravel 13 on PHP 8.4.20; React 19, TypeScript 5.9, Vite 5, React Router 7, TanStack Query 5, react-i18next 17, Tailwind 3 (Atelier `a-*`), vitest 2; playwright-core for the browser passes; the chrome-devtools MCP `lighthouse_audit` tool.

**Spec:** `docs/superpowers/specs/2026-10-14-content-workspace-design.md`. This plan covers §6.1's way-in row, §6.9 (way in, way back, retirements, help, runbook), §8.2 (session expiry back to the page), §8.3 (Lighthouse), §9 (the Appointments comparison, the build check, the real-browser pass), §10 (release 2's deploy and verification), and the deferred items listed under "Deferred items in scope".

**Where things stand (branch `feature/content-workspace`, tip `9e7221945`):**
- Release 1 is live (prod main `b93b9db36` = `de20fc3a0` + the source of feature tip `ec0eaf085` + a build).
- Release 2 Plans A (server), B (daily flow) and C (Posts, Strategy, Brand) are built, reviewed and fixed on this branch; nothing of release 2 is deployed.
- `AccessMap::PRODUCTS` already has `content` and `MAP['admin/content']` exists (Plan A). `MAP['admin/content-planner']` is still there.
- Facts for this plan: `.superpowers/sdd/r2d-facts.md`.

## Deferred items in scope

From the archived ledgers (release 1, Plans A, B, C), the ones a person would meet, or that matter before a deploy:

| Where | Item | Task |
|---|---|---|
| R1 | `workspace/tokens.test.ts` (and its Appointments copy) scope regex skips the first rule inside `@media`/`@container` | 7 |
| R1 | stale paths in comments and docs (`TodayStrip.tsx:93`, `fitFigure.ts:4`, `lib/venueTime.ts:11`, `docs/appointments-workspace.md:141,503`) | 7 |
| A | `ai_failed` answers carry raw exception text | 3 |
| A, C | two strategy generations (double click) and two quick setups can start together | 3 |
| A | PostgreSQL puts posts with no day first in Find, and untimed posts first within a day in Posts | 3 |
| A | saving a post with its day cleared keeps its time | 3 |
| A | isolation tests missing: audience and campaign ids of another brand on a post; another organisation's post on move, duplicate, delete, AI | 3 |
| A | runbook notes: the lock needs a shared cache store; an overridden AI model must be priced | 7 |
| A | Cyrillic Find on PostgreSQL | 8 (browser pass) |
| B | "This week" and T use this computer's clock | 4 |
| B | session expiry on `/content` goes to a bare sign-in | 1 |
| B | a refused Fill, a failed Generate and a network-failed move do not read the plan again | 4 |
| B | the selected card's ring never shows | 4 |
| B | Dialog focus escapes after Generate finishes | 4 |
| B | tray cards carry the move hint; the 8 s Undo does not pause; Undo sits under the open panel | 4 |
| B | a card's spoken name leaves out its time | 4 |
| B | an unknown audience shows its raw id; inactive pillars are offered | 4 |
| B | Generate stays enabled with the AI budget used up | 4 |
| B | a long brand name in the phone header | 8 (browser pass) |
| C | emptying the brand name or the language is silently ignored; a stored trend cannot be cleared but looks clearable | 6 |
| C | the Strategy page has no error state; managers see New strategy on a brand with no profile | 5 |
| C | a Quick setup that fails at the gateway leaves the page stale; the portal has no words for Quick setup's new `already_generating` | 6 |
| C | huge numbers in a Posts link make a 422 shown as the dates message; an unknown pillar filter shows "All pillars" | 5 |
| C | content-mix categories outside the list count toward the total; a mix stored as strings reads as "the AI decides" | 6 |
| C | staff see "not set up" twice on Brand; a new channel is named after the platform's slug; "Used by 1 posts"; duplicate stored tags share a key; Edit, Save and Cancel drop the keyboard focus | 6 |
| C | an error boundary inside the portal | 5 |
| C | one browser pass that writes for real | 8 |

Left deferred (said in the final report): Plan A's tray cap at 100, LIKE wildcards, ledger brand ids, `MANAGER_ROLES` in three places; Plan B's Fill after a brand switch, mid-session brand fallback, post links copy and brand; Plan C's stale past-strategy detail, the device clock in "stuck", the double question on an in-use audience, a failed `default_tone` sync.

## Global Constraints

- **Branch:** worktree `C:\wamp64\www\Hexa-Tech-content`, branch `feature/content-workspace` (tip `9e7221945`). Never push the feature branch; never commit its built `frontend/dist`, `public/spa` or `resources/spa-shell`. Only Task 9 pushes, and only from its deploy worktree, and only after the owner's "yes, deploy".
- **Ledger and tools:** `.superpowers/sdd/2026-10-15-content-workspace-r2d-release/`, called `$R2D` below.
- **Frontend commands** (Git Bash): types `cd frontend && npx tsc -b`; tests `$R2D/vt.sh <paths…>`; lint `cd frontend && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts`.
- **PHP commands:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by folder, in the foreground: `XDEBUG_MODE=off $PHP artisan test tests/Feature/Content/ --no-ansi`. Never a bare `php artisan test`. The PHP test database is SQLite in memory (`phpunit.xml`); PostgreSQL behaviour is checked in the browser pass on the local database.
- **Baseline:** the full vitest run has exactly 3 failures (`src/lib/plannerMeta.test.ts`, the staff Planner, not this work); the scoped lint has exactly 1 error (`src/App.tsx` `react-hooks/set-state-in-effect`). Anything else is ours.
- **Portal rules** (`src/content/tokens.test.ts`) and **words** (five bundles, same keys, portal words for every refusal) as in Plans B and C. The full admin's own words live in `frontend/src/i18n/locales/{en,ru,de,fr,es}/common.json`.
- **Appointments must not change:** no pixel of it may differ (Task 8's comparison), and its suites stay green.
- **React lint:** no synchronous `setState` inside an effect; no reading `ref.current` while rendering; no component defined inside another.
- **Escapes:** no `\u` sequences through the Write/Edit tools; PHP namespace lines with the Edit tool; long markdown with the Write tool.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Somebody whose organisation does not have Content** (the Appointments plan) or a member account: the menu item, the hub tile and the landing must not show or send them to `/content`.
   - Pinned by Task 1's `showsWorkspaceLink` tests (no `workspaces.content`, member) and `landingPath` tests; the hub tile is shown only on `/marketing`, itself manager-only.
2. **An old bookmark or an open tab across the deploy:** `/marketing?tab=content-planner`, or an old tab calling `/v1/admin/content-planner/*`.
   - Expected: the bookmark lands on `/content`; the old API answers 404 (the old tab is told to reload by the runbook).
   - Pinned by Task 1's hub redirect test and Task 2's 404 test.
3. **A sign-in that runs out on a Content page with unsaved edits.**
   - Expected: after signing in again the person is back on the same Content page (the edits themselves are not kept — the session that held them is gone; the panel's leave guard already asked if they left on purpose).
   - Pinned by Task 1's `loginPathAfterExpiry` tests.
4. **The deploy carries exactly the release:** nothing of another feature (the voice assistant, the landing branch), every deletion, no built files from the feature branch, no migration.
   - Pinned by Task 9's guards (path allowlist, nothing of the release changed on `origin/main` since the base, parity including deletions, `database/migrations` absent).
5. **A refusal the portal had no words for after the server changes** (the new `already_generating` for Quick setup).
   - Expected: the portal's own sentence.
   - Pinned by Task 3's server tests and Task 6's `errors` words (the bundle test keeps `brand.error.already_generating` in all five).

---

## File map

- **Task 1 (way in):** create `frontend/src/workspace/lib/landing.ts` (+ test); modify `frontend/src/appointments/lib/landing.ts` (re-exports), `frontend/src/content/lib/links.ts` (re-export `loginPath`), `frontend/src/lib/api.ts` (import), `frontend/src/components/Layout.tsx` (menu item, filter), `frontend/src/pages/hubs/MarketingHub.tsx` (tile link, redirect; + `marketingHub.test.tsx`), `frontend/src/i18n/locales/*/common.json` (`nav.items.content_workspace`).
- **Task 2 (retirements):** delete the six `app/Http/Controllers/Api/V1/Admin/ContentPlanner*Controller.php`, `frontend/src/pages/ContentPlanner.tsx`, `frontend/src/components/ContentPlanner/`; modify `routes/api.php`, `app/Support/AdminAccess/AccessMap.php`, `tests/Feature/ContentCalendar/CalendarGenerationTest.php`, `tests/Feature/Content/GenerateTest.php`, `tests/Feature/Content/ContentGateTest.php`, `app/Http/Controllers/Api/V1/Admin/DocumentationController.php`, `tests/Feature/Documentation/DocumentationControllerTest.php`, `frontend/src/components/DocumentationCenter.tsx`, `frontend/src/theme/lightSweep.test.ts`, `frontend/src/theme/onFill.test.ts`.
- **Task 3 (server hardening):** `app/Http/Controllers/Api/V1/Admin/Content/{PostAiController,BrandController,StrategyController,PostController}.php`; tests in `tests/Feature/Content/{PostAiTest,BrandTest,StrategyTest,PostsTest,PostRulesTest}.php`.
- **Task 4 (portal: Plan, panel, dialog):** `frontend/src/content/plan/{PlanPage,Toolbar,PostCardView,moveMath}.tsx|ts`, `plan/GenerateDialog.tsx`, `ui/Dialog.tsx` (+ `ui/dialogFocus.ts`), `theme/content.css`, `panel/{PostFormFields,PostPanel}.tsx`; tests beside them; words.
- **Task 5 (portal: error boundary, Strategy, Posts):** create `frontend/src/content/ui/ContentErrorBoundary.tsx` (+ test); modify `frontend/src/content/ContentShell.tsx`, `strategy/{StrategyPage,StrategyActions}.tsx`, `posts/{postsFilters,PostsPage}.ts|tsx`; tests beside them; words.
- **Task 6 (portal: Brand and setup):** `frontend/src/content/brand/{BrandPage,inputs,SectionCard,brandForms,listActions}.tsx|ts`, `brand/sections/{BrandDna,Rhythm,Audiences,Channels}.tsx`, `brand/setup/QuickSetup.tsx`, `lib/errors.ts`; tests beside them; words.
- **Task 7 (leftovers and runbook):** `frontend/src/workspace/tokens.test.ts`, `frontend/src/appointments/tokens.test.ts`, the stale comments (`TodayStrip.tsx`, `fitFigure.ts`, `lib/venueTime.ts`), `docs/appointments-workspace.md`, `docs/content-workspace.md`.
- **Task 8 (release checks):** ledger and tools only (`$R2D`: PHP runner, browser pass, seed scripts, pixel tools, Lighthouse sign-in), a temporary base worktree, plus fixes the checks find.
- **Task 9 (deploy):** a deploy worktree and branch `deploy/content-r2`; nothing on the feature branch.

---

### Task 1: The way in — menu, hub, landing, a sign-in that ran out

**Files:**
- Create: `frontend/src/workspace/lib/landing.ts`, `frontend/src/workspace/lib/landing.test.ts`, `frontend/src/pages/hubs/marketingHub.test.tsx`
- Modify: `frontend/src/appointments/lib/landing.ts`, `frontend/src/content/lib/links.ts`, `frontend/src/lib/api.ts`, `frontend/src/components/Layout.tsx`, `frontend/src/pages/hubs/MarketingHub.tsx`, `frontend/src/i18n/locales/{en,ru,de,fr,es}/common.json`

**Interfaces:**
- Produces: `WorkspaceName = 'appointments' | 'content'`; `LandingUser`; `showsWorkspaceLink(user, name)`; `safeRedirect(raw)`; `loginPath(location)`; `loginPathAfterExpiry(pathname, search)`; `landingPath(user, fallback)`. `appointments/lib/landing.ts` keeps `showsAppointmentsLink`, `isAppointmentsOnly`, `fullAdminRedirect`, `withAppointmentsOnly`, `fullAdminPathFor` and re-exports the moved four.
- Consumes: the server's `workspaces.content: { landing }` on sign-in and `/auth/me` (already sent).

- [ ] **Step 1: Set up the ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R2D=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-15-content-workspace-r2d-release.md)
cp .superpowers/sdd/archive/2026-10-15-content-workspace-r2c-pages/vt.sh "$R2D/vt.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-15-content-workspace-r2d-release.md" > "$R2D/progress.md"
```
Expected: `$R2D` ends in `.superpowers/sdd/2026-10-15-content-workspace-r2d-release`.

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/workspace/lib/landing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { landingPath, loginPathAfterExpiry, showsWorkspaceLink } from './landing'

const staff = (workspaces: Record<string, unknown> = {}) => ({ user_type: 'staff', workspaces })

describe('showsWorkspaceLink', () => {
  it('shows the way into a workspace to staff of an organisation that has it', () => {
    expect(showsWorkspaceLink(staff({ content: { landing: false } }), 'content')).toBe(true)
    expect(showsWorkspaceLink(staff({ appointments: { landing: false } }), 'appointments')).toBe(true)
  })

  it('shows nothing to an organisation without it (the Appointments plan has no Content), to a member, or before sign-in', () => {
    expect(showsWorkspaceLink(staff({ appointments: { only: true } }), 'content')).toBe(false)
    expect(showsWorkspaceLink({ user_type: 'member', workspaces: { content: {} } }, 'content')).toBe(false)
    expect(showsWorkspaceLink(null, 'content')).toBe(false)
  })
})

describe('loginPathAfterExpiry', () => {
  it('brings a sign-in that ran out back to the same workspace page, Content as Appointments', () => {
    expect(loginPathAfterExpiry('/content/posts', '?status=draft')).toBe('/login?redirect=%2Fcontent%2Fposts%3Fstatus%3Ddraft')
    expect(loginPathAfterExpiry('/content', '')).toBe('/login?redirect=%2Fcontent')
    expect(loginPathAfterExpiry('/appointments/clients', '')).toBe('/login?redirect=%2Fappointments%2Fclients')
  })

  it('keeps the plain sign-in everywhere else, including addresses that only start alike', () => {
    expect(loginPathAfterExpiry('/leads', '?tab=customers')).toBe('/login')
    expect(loginPathAfterExpiry('/contentious', '')).toBe('/login')
  })
})

describe('landingPath', () => {
  it('lands on Content after sign-in when the organisation chose it and nothing else was asked for', () => {
    expect(landingPath(staff({ content: { landing: true } }), '/')).toBe('/content')
    expect(landingPath(staff({ content: { landing: true } }), '/leads')).toBe('/leads')
    expect(landingPath(staff({ content: { landing: false } }), '/')).toBe('/')
  })

  it('keeps the Appointments rules: its landing, its plan, and members to their portal', () => {
    expect(landingPath(staff({ appointments: { landing: true } }), '/')).toBe('/appointments')
    expect(landingPath(staff({ appointments: { only: true } }), '/content')).toBe('/appointments')
    expect(landingPath({ user_type: 'member' }, '/content')).toBe('/portal')
  })
})
```

Create `frontend/src/pages/hubs/marketingHub.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { MarketingHub } from './MarketingHub'

const render = (url: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><MarketingHub /></MemoryRouter>)

describe('MarketingHub', () => {
  it('offers HexaTech Content as a way into its workspace, not the old planner tab', () => {
    const html = render('/marketing')
    expect(html).toContain('HexaTech Content')
    expect(html).not.toContain('AI Content Planner')
  })

  // An old bookmark of the planner tab lands in the workspace.
  it('sends the old planner tab to /content', () => {
    expect(render('/marketing?tab=content-planner')).not.toContain('Marketing')
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `$R2D/vt.sh src/workspace/lib/landing.test.ts src/pages/hubs/marketingHub.test.tsx`
Expected: FAIL — `./landing` does not exist; the hub shows "AI Content Planner".

- [ ] **Step 4: The generic landing helpers**

Create `frontend/src/workspace/lib/landing.ts`:

```ts
/**
 * Where people go between the full admin and its workspaces — HexaTech
 * Appointments (/appointments) and HexaTech Content (/content): the generic
 * half of the way in (spec 2026-10-14 §6.1). The Appointments-only rules
 * (its plan, its pages in the full admin) stay in appointments/lib/landing.ts,
 * which re-exports these.
 */
export type WorkspaceName = 'appointments' | 'content'

export interface LandingUser {
  user_type?: string
  workspaces?: {
    appointments?: { landing?: boolean; has_services?: boolean; only?: boolean }
    content?: { landing?: boolean }
  }
}

/** A workspace page: /appointments… or /content… (not /contentious). */
const WORKSPACE_PAGE = /^\/(appointments|content)(\/|$)/
const APPOINTMENTS_PATH = /^\/appointments(\/|\?|$)/

/**
 * Whether the full admin shows its way into a workspace (the menu item, the
 * hub tile, the buttons on its pages): staff of an organisation that has
 * the workspace. The menu's own rules still apply on top.
 */
export function showsWorkspaceLink(user: LandingUser | null | undefined, name: WorkspaceName): boolean {
  return user?.user_type !== 'member' && user?.workspaces?.[name] != null
}

/**
 * A `?redirect=` the sign-in screen may follow: a path on this site, or the
 * dashboard. `//host` and `/\host` are other sites to a browser.
 */
export function safeRedirect(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/'
}

/** The sign-in screen, set to bring the visitor back to where they were (see safeRedirect). */
export function loginPath(location: { pathname: string; search: string }): string {
  return `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`
}

/**
 * Where a sign-in that ran out sends the user: back to the same workspace
 * page after signing in again (spec §8.2); every other page keeps the plain
 * sign-in it always had.
 */
export function loginPathAfterExpiry(pathname: string, search: string): string {
  return WORKSPACE_PAGE.test(pathname) ? loginPath({ pathname, search }) : '/login'
}

/**
 * Where a user goes right after signing in. `fallback` is what the sign-in
 * screen would have used anyway ('/' or an explicit ?redirect=): a workspace
 * is chosen only when nothing else was asked for and the organisation chose
 * it (`--landing`; one per organisation); everyone else lands where they
 * always did. On the Appointments plan that workspace is all there is,
 * whatever the link asked for.
 */
export function landingPath(user: LandingUser | null | undefined, fallback: string): string {
  if (user?.user_type === 'member') return '/portal'
  if (user?.workspaces?.appointments?.only === true) return APPOINTMENTS_PATH.test(fallback) ? fallback : '/appointments'
  if (fallback === '/' && user?.workspaces?.appointments?.landing === true) return '/appointments'
  if (fallback === '/' && user?.workspaces?.content?.landing === true) return '/content'
  return fallback
}
```

In `frontend/src/appointments/lib/landing.ts`:
1. Replace the `LandingUser` interface and the `WORKSPACE_PATH` constant with:

```ts
import { showsWorkspaceLink, type LandingUser } from '../../workspace/lib/landing'

// The generic half lives in the shared core; its old importers keep importing it from here.
export { landingPath, loginPath, loginPathAfterExpiry, safeRedirect } from '../../workspace/lib/landing'
```

2. Make `showsAppointmentsLink` return `showsWorkspaceLink(user, 'appointments')` (its doc comment stays).
3. Delete the four moved functions (`loginPathAfterExpiry`, `safeRedirect`, `loginPath`, `landingPath`) from this file.

In `frontend/src/content/lib/links.ts`, replace the `loginPath` function with:

```ts
/** The sign-in screen, set to bring the visitor back to the Content page they asked for. */
export { loginPath } from '../../workspace/lib/landing'
```

In `frontend/src/lib/api.ts`, change the import to

```ts
import { withAppointmentsOnly } from '../appointments/lib/landing'
import { loginPathAfterExpiry } from '../workspace/lib/landing'
```

and the comment above the 401 handler's `import('./logout')` to `// From a workspace page, signing in again returns to the same page.`

- [ ] **Step 5: The menu item**

In `frontend/src/components/Layout.tsx`:
1. Add `PenLine` to the `lucide-react` import, and import `showsWorkspaceLink, type WorkspaceName` from `'../workspace/lib/landing'` in place of the `showsAppointmentsLink` import.
2. `NavItem.workspace` becomes:

```ts
  /** The way into a workspace beside the full admin: shown only where `showsWorkspaceLink()` says so. */
  workspace?: WorkspaceName
```

3. First in the "CRM & Marketing" group's `items` (before `/leads`):

```ts
      // The way into HexaTech Content (spec 2026-10-14 §6.9): everyone who may open it.
      { path: '/content',   labelKey: 'nav.items.content_workspace', defaultLabel: 'HexaTech Content', icon: PenLine, gate: 'all', workspace: 'content' },
```

4. The filter line becomes:

```ts
          // The way into a workspace: wherever the organisation has it (Appointments with services or not, owner 2026-10-06).
          if (item.workspace && !showsWorkspaceLink(liveUser, item.workspace)) return false
```

In each `frontend/src/i18n/locales/{en,ru,de,fr,es}/common.json`, after the `"appointments_workspace_open"` line add `"content_workspace": "HexaTech Content",` (the product's name, the same in every language).

- [ ] **Step 6: The hub tile and the old address**

In `frontend/src/pages/hubs/MarketingHub.tsx`:
1. Import `Navigate, useNavigate` from `react-router-dom` beside `useSearchParams`, and `PenLine` from `lucide-react` (drop `Sparkles` if nothing else uses it).
2. Delete the `ContentPlanner` lazy import, `'content-planner'` from `TabKey`, its `TAB_IMPORT` entry, and the `{active === 'content-planner' && <ContentPlanner />}` line.
3. `TileDef` gains `to?: string` (`/** A tile that opens another place (a workspace) rather than a tab here. */`) and its `key` becomes `TabKey | 'content'`; the tile becomes:

```ts
  { key: 'content', label: 'HexaTech Content', desc: 'Plan and write your social posts with AI, in their own workspace', icon: PenLine, accent: '#8b5cf6', to: '/content' }, // purple
```

4. `preloadTab` takes `k: string` and reads `TAB_IMPORT[k as TabKey]?.()`.
5. At the top of `MarketingHub()` (after `useSearchParams`), add:

```tsx
  const navigate = useNavigate()
  // The old planner tab now lives in its own workspace (spec §6.9): old bookmarks land there.
  if (searchParams.get('tab') === 'content-planner') return <Navigate to="/content" replace />
```

6. The tile's click becomes `onClick={() => (t.to ? navigate(t.to) : setActive(t.key as TabKey))}`, and the `tile` lookup for the breadcrumb ignores link tiles: `const tile = TILES.find(td => td.key === active && !td.to)`.

- [ ] **Step 7: Run the tests, the types and the lint**

Run: `$R2D/vt.sh src/workspace src/appointments src/content src/pages/hubs src/components` → all pass (the Appointments landing tests unchanged, through the re-exports).
Run: `cd frontend && npx tsc -b` → clean; the scoped lint → only the baseline error.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src && git commit -q -F - <<'EOF'
HexaTech Content: the way in — menu item, Marketing hub tile, landing, a sign-in that ran out

The generic landing helpers move to the shared core and know both
workspaces: the menu shows HexaTech Content first in CRM & Marketing to
everyone whose organisation has it, the hub's planner tab becomes a link
and its old address lands on /content, an organisation that chose Content
lands there after sign-in, and a sign-in that runs out on a Content page
comes back to it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The retirements — old controllers, routes, access key, screens, help

**Files:**
- Delete: `app/Http/Controllers/Api/V1/Admin/ContentPlanner{Audience,Calendar,Channel,Post,Profile,Strategy}Controller.php`, `frontend/src/pages/ContentPlanner.tsx`, `frontend/src/components/ContentPlanner/` (all eight files)
- Modify: `routes/api.php` (the "AI Content Planner" block, about lines 590–646), `app/Support/AdminAccess/AccessMap.php` (`admin/content-planner`), `tests/Feature/ContentCalendar/CalendarGenerationTest.php`, `tests/Feature/Content/GenerateTest.php`, `tests/Feature/Content/ContentGateTest.php`, `app/Http/Controllers/Api/V1/Admin/DocumentationController.php`, `tests/Feature/Documentation/DocumentationControllerTest.php`, `frontend/src/components/DocumentationCenter.tsx`, `frontend/src/theme/lightSweep.test.ts`, `frontend/src/theme/onFill.test.ts`

**Interfaces:**
- Consumes: `ContentCalendarGenerationService::generate($profile, $from, $to, $options, $budget = null)` (unchanged; the new `GenerationController` calls it).
- Produces: no `/v1/admin/content-planner/*` route; the help section `content` ("HexaTech Content").

Nothing else calls the old routes (spec §6.9, checked again 2026-10-15: only `routes/api.php` and `CalendarGenerationTest` name the old controllers). Every service, job and model stays.

- [ ] **Step 1: The calendar test calls the service it tests, and the new route's range check is pinned**

`CalendarGenerationTest` posted to a private route bound to the old `ContentPlannerCalendarController`, which wrapped `ContentCalendarGenerationService`. The new route has its own tests (`tests/Feature/Content/GenerateTest.php`); this test keeps testing the service (spec §9), so it calls it directly and asserts on what it answers.

In `tests/Feature/ContentCalendar/CalendarGenerationTest.php`:
1. Remove the imports of `ContentPlannerCalendarController` and `Illuminate\Support\Facades\Route` (Edit tool), and the `Route::post('/api/_calendar-regression', …)` line in `setUp`.
2. Replace the private `generate()` helper with:

```php
    /** One generation, as the new calendar route runs it (Content\GenerationController): the service's own answer. */
    private function generate(string $start, string $end): array
    {
        return app(ContentCalendarGenerationService::class)->generate($this->profile, $start, $end, ['fill_empty_only' => true]);
    }

    /** A generation that must stop with an exception (the route answers 500 generation_failed for it). */
    private function generationStops(string $start, string $end): void
    {
        $stopped = false;
        try {
            $this->generate($start, $end);
        } catch (\Throwable $e) {
            $stopped = !$e instanceof \PHPUnit\Framework\AssertionFailedError;
        }
        $this->assertTrue($stopped, 'the generation should have stopped with an exception');
    }
```

3. Rewrite each test's call and assertions as follows (the HTTP status and `status` field were the old controller's mapping of these same results; the new controller's mapping is pinned by `GenerateTest`):

| Test | Becomes |
|---|---|
| `test_normal_generation_saves_drafts_and_visuals_…` | `$result = $this->generate('2026-09-07', '2026-09-13');` `$this->assertCount(1, $result['created']);` `$this->assertSame([], $result['failed_windows']);` (the post and brief counts and `assertSentCount(1)` stay) |
| `test_provider_failure_stops_later_weeks_…` | `$result = $this->generate('2026-09-07', '2026-09-27');` `$this->assertSame([], $result['created']);` `$this->assertSame('2026-09-07', $result['failed_windows'][0]['start_date']);` `$this->assertSame('provider_unavailable', $result['failed_windows'][0]['reason']);` `$this->assertSame('not_attempted', $result['failed_windows'][1]['reason']);` `$this->assertStringNotContainsString('Private provider detail', json_encode($result));` (attempts and post count stay) |
| `test_partial_generation_reports_remaining_windows_…` | `$result = $this->generate('2026-09-07', '2026-09-27');` `$this->assertCount(1, $result['created']);` `$this->assertSame('2026-09-14', $result['failed_windows'][0]['start_date']);` `$this->assertSame('2026-09-21', $result['failed_windows'][1]['start_date']);` |
| `test_invalid_ranges_return_422_without_ai_calls` and its `invalidRanges` provider | deleted: the range is the route's to check, now pinned in `GenerateTest` (Step 1's last item) |
| `test_local_database_failure_is_not_a_provider_503` | `$this->generationStops('2026-09-07', '2026-09-13');` (post count and `assertSentCount(1)` stay) |
| `test_invalid_json_after_one_repair_stops_…` | `$result = $this->generate('2026-09-07', '2026-09-27');` `$this->assertSame([], $result['created']);` `$this->assertSame('invalid_ai_response', $result['failed_windows'][0]['reason']);` `$this->assertSame('2026-09-27', $result['failed_windows'][2]['end_date']);` |
| `test_json_repair_can_succeed_…` | `$result = $this->generate('2026-09-07', '2026-09-13');` `$this->assertCount(1, $result['created']);` `$this->assertSame([], $result['failed_windows']);` |
| `test_malformed_items_are_not_reported_as_a_completed_empty_calendar` | `$result = $this->generate('2026-09-07', '2026-09-27');` `$this->assertSame([], $result['created']);` `$this->assertSame('invalid_ai_response', $result['failed_windows'][0]['reason']);` |
| `test_retrying_empty_slots_keeps_previously_saved_posts` | `$this->assertCount(1, $this->generate('2026-09-07', '2026-09-13')['created']);` then `$second = $this->generate('2026-09-07', '2026-09-13');` `$this->assertCount(1, $second['created']);` `$this->assertSame('slot_already_filled', $second['skipped_dates'][0]['reason']);` |
| `test_failed_visual_insert_does_not_leave_an_unreported_post` | `$this->generationStops('2026-09-07', '2026-09-13');` then the post count assertion |

`test_shared_budget_caps_…` and `test_json_repair_uses_the_same_budget` already call the service; they stay.

In `tests/Feature/Content/GenerateTest.php`, inside `test_the_range_the_budget_and_the_channels_are_checked`, after the line with `'2026-12-31'`, add:

```php
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-11', 'to' => '2026-10-05'])->assertStatus(422)->assertJsonValidationErrors('to');
```

Run: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/ContentCalendar/ tests/Feature/Content/GenerateTest.php --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"`
Expected: all pass (11 calendar tests: 13 minus the two range cases; GenerateTest as before). Commit this step on its own:

```bash
git add tests/Feature/ContentCalendar/CalendarGenerationTest.php tests/Feature/Content/GenerateTest.php && git commit -q -F - <<'EOF'
Content tests: the calendar test calls the generation service it tests, not the old controller

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 2: Write the failing tests for the retirement**

In `tests/Feature/Content/ContentGateTest.php`, add:

```php
    public function test_the_old_content_planner_api_is_gone(): void
    {
        $this->asManager()->getJson('/api/v1/admin/content-planner/profile')->assertNotFound();
        $this->asManager()->postJson('/api/v1/admin/content-planner/calendar/generate', [])->assertNotFound();
        $this->assertArrayNotHasKey('admin/content-planner', \App\Support\AdminAccess\AccessMap::MAP);
    }
```

(If `ContentGateTest` does not use `SetsUpContentSchema`/`asManager`, put the test in `tests/Feature/Content/BootstrapTest.php`, which does.)

In `tests/Feature/Documentation/DocumentationControllerTest.php`, add:

```php
    public function test_the_help_describes_hexatech_content_and_not_the_old_planner(): void
    {
        $sections = collect(DocumentationController::getAllSections())->keyBy('slug');
        $this->assertTrue($sections->has('content'));
        $this->assertFalse($sections->has('content-planner'));
        $this->assertSame('HexaTech Content', $sections['content']['title']);
        $text = json_encode(DocumentationController::getAllSections()) . json_encode(DocumentationController::getFaqs());
        $this->assertStringNotContainsString('AI Content Planner', $text);
        $this->assertStringContainsString('/content', $text);
    }
```

(Use the FAQ accessor the controller has — check its name with `grep -n "public static function" app/Http/Controllers/Api/V1/Admin/DocumentationController.php`; if the FAQ list has no static accessor, assert on `getAllSections()` only and check the FAQ through the endpoint the existing test uses.)

Run them: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/ContentGateTest.php tests/Feature/Documentation/ --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"` → 2 failed.

- [ ] **Step 3: Remove the server side**

1. `git rm` the six controllers:

```bash
git rm -q app/Http/Controllers/Api/V1/Admin/ContentPlanner{Audience,Calendar,Channel,Post,Profile,Strategy}Controller.php
```

2. In `routes/api.php`, delete the block from the `// AI Content Planner` comment through the closing `});` of `Route::prefix('content-planner')->group(...)` (about lines 590–646; the next block is "Member segments"). Check: `grep -n "content-planner\|ContentPlanner" routes/api.php` → nothing.
3. In `app/Support/AdminAccess/AccessMap.php`, delete the `'admin/content-planner' => …` line and its comment.

- [ ] **Step 4: The help pages describe HexaTech Content**

In `DocumentationController.php`, replace the section whose `'slug' => 'content-planner'` (the whole array, about lines 538–575) with:

```php
            [
                'slug' => 'content',
                'title' => 'HexaTech Content',
                'icon' => 'Sparkles',
                'description' => "Plan and write your brand's social posts with AI in its own workspace at /content: a week plan with empty slots to fill, a post panel with AI writing, a strategy, and the brand the AI writes from. Open it from the menu (CRM & Marketing > HexaTech Content).",
                'articles' => [
                    [
                        'title' => "What it is & how to open it",
                        'content' => "HexaTech Content is the AI content planner as its own workspace, beside the full admin. Open it from the menu (**CRM & Marketing > HexaTech Content**) or at **/content**. It has four pages:\n\n- **Plan** — your week (or month, or a list) with the posts on their days, the empty slots your channels expect, and the Unscheduled tray.\n- **Posts** — every post of the brand, searched and filtered.\n- **Strategy** — the active content strategy and this month's pillar balance.\n- **Brand** — what the AI knows about your brand, section by section.\n\n**Full admin** in the side panel takes you back. Everything works in English, Russian, German, French and Spanish, in light and dark.",
                    ],
                    [
                        'title' => "Setting up a brand",
                        'content' => "The AI writes from your brand. A brand that is not set up yet offers managers two ways in on the **Brand** page:\n\n**Quick setup** — the brand's name, the language of its posts, a main goal, where it posts and how often. One AI call fills in a first version from what HexaTech already knows (your FAQ, services and chatbot), and shows what it assumed so you can check.\n\n**Guided setup** — the Brand sections one after another (Brand DNA, Audiences, Voice, Positioning, Channels, Rhythm and goals), at your own pace. Each step saves as you go; your place is kept on this device. **Finish** marks the brand set up.\n\nAfterwards every section can be edited on its own. **Knowledge and readiness** says what the AI is still missing.",
                    ],
                    [
                        'title' => "The Plan — your week",
                        'content' => "The **Plan** shows the posts on their days, Monday first, on your venue's clock. An **empty slot** is a day one of your channels expects a post: **Write** starts one, **Fill with AI** writes one for you.\n\nDrag a card to another day, or onto the **Unscheduled** tray to clear its day (Shift + arrow keys move a focused card a day). Every move saves at once and can be undone for a few seconds. Published posts keep their day.\n\nManagers can **Generate** a week, a month or a range: the AI writes drafts for the empty slots. The **This week** strip counts what is planned, ready, published and still empty.",
                    ],
                    [
                        'title' => "The post panel — writing with AI",
                        'content' => "Clicking a post opens its panel on the right. Edit its platform, day and time, status, pillar, audience, language, topic, hook, text, call to action and hashtags, then **Save**.\n\nThe AI helps on every post: **Write the text**, five **rewrites** (shorter, longer, more professional, friendlier, another version), **Check quality**, a **Visual brief** and an **image** you can download. Actions: **Mark ready**, **Mark published** (with the link), **Duplicate**, **Copy text**, **Delete**.\n\nIf someone else changed the post while you were editing, Save offers their version instead of overwriting it.",
                    ],
                    [
                        'title' => "Strategy and Brand",
                        'content' => "**Strategy** shows the active strategy as a document — positioning, audiences, pillars, content mix, weekly rhythm, platform playbooks, risks and next actions — and how this month's posts spread over the pillars against their targets. Managers make a new strategy (it takes a minute or three; the page says when it is ready), read past ones, make one active or archive one.\n\n**Brand** holds what the AI writes from: Brand DNA, Audiences, Voice, Positioning, Channels (which days and how often — the Plan's empty slots come from here), and Rhythm and goals.",
                    ],
                    [
                        'title' => "Who can do what, publishing & cost",
                        'content' => "Everyone on the team can write, move and publish posts and use the AI on a post. **Managers** (owners and managers) also generate whole weeks, make strategies and edit the brand.\n\n**Publishing is manual** — HexaTech Content does not post to social networks. Post from your own accounts, then **Mark published**.\n\nEvery AI action counts toward your organisation's monthly AI budget (Settings > AI Usage). At 80 % a notice warns; at 100 % AI actions pause until next month, and writing by hand still works.",
                    ],
                ],
            ],
```

Replace the four FAQ entries whose `'category' => 'Content Planner'` (about lines 945–962) with:

```php
            [
                'category' => 'HexaTech Content',
                'question' => 'Where did the AI Content Planner go?',
                'answer' => 'It became HexaTech Content, its own workspace at /content (menu: CRM & Marketing > HexaTech Content). Your profiles, strategies, posts and images carried over unchanged.',
            ],
            [
                'category' => 'HexaTech Content',
                'question' => 'Does HexaTech Content post to my social media automatically?',
                'answer' => 'No. It plans, writes and illustrates; you post from your own accounts or scheduler, then click Mark published on the post (optionally with the live link) to record it.',
            ],
            [
                'category' => 'HexaTech Content',
                'question' => 'How does it know about my business?',
                'answer' => 'From what you already have in HexaTech — your FAQ and knowledge base, your AI chat settings, your services and your organisation details — plus the Brand page, where a manager describes the brand section by section. Refresh knowledge reads the first group again.',
            ],
            [
                'category' => 'HexaTech Content',
                'question' => 'Who can use it?',
                'answer' => 'Everyone on the team, in every organisation that has it. Managers also generate whole weeks, make strategies and edit the brand. AI use counts toward the monthly AI budget.',
            ],
```

In `frontend/src/components/DocumentationCenter.tsx`, the colour key `'content-planner'` becomes `'content'` (same colour, comment `// purple — HexaTech Content`).

- [ ] **Step 5: Remove the old screens**

```bash
git rm -q frontend/src/pages/ContentPlanner.tsx
git rm -q -r frontend/src/components/ContentPlanner
grep -rn "ContentPlanner\|content-planner" frontend/src --include=*.ts --include=*.tsx | grep -v "^frontend/src/i18n\|planFeatures\|content_planner"
```
Expected: only `frontend/src/theme/lightSweep.test.ts` and `frontend/src/theme/onFill.test.ts`. In both, delete every allowlist entry naming `components/ContentPlanner/` (they pin files that no longer exist). `planFeatures.ts` and the `content_planner` i18n labels stay (spec §6.9).

- [ ] **Step 6: Run everything this touches**

```bash
for p in tests/Feature/Content/ tests/Feature/ContentCalendar/ tests/Feature/AdminAccess/ tests/Feature/Documentation/ tests/Unit/Content/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
cd frontend && npx tsc -b && echo TSC-CLEAN && "$R2D/vt.sh" src/theme src/content src/components src/pages 2>&1 | tail -2
```
Expected: every PHP folder green (AdminAccess proves every key still has a route and every route a key); TSC-CLEAN; the frontend folders green.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add -A app routes tests frontend/src && git status --short | grep -v "^[ADM]  " ; git commit -q -F - <<'EOF'
Retire the old AI Content Planner: its controllers, routes, access key, screens and help

HexaTech Content replaces it (spec §6.9). The six ContentPlanner*
controllers, the 35 /v1/admin/content-planner routes, the
admin/content-planner access key, pages/ContentPlanner.tsx and
components/ContentPlanner (about 5,300 lines) go; every service, job and
model stays (the new Content code uses them). The help section and its
FAQ describe HexaTech Content at /content.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Server hardening — AI-failure words, two locks, ordering, a cleared date, isolation tests

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/PostAiController.php` (`run`), `BrandController.php` (`quickSetup`), `StrategyController.php` (`store`), `PostController.php` (`update`, `index`, `search`)
- Test: `tests/Feature/Content/PostAiTest.php`, `BrandTest.php`, `StrategyTest.php`, `PostsTest.php`, `PostRulesTest.php`

**Interfaces:**
- Produces: `ai_failed` refusals with a fixed sentence (never the provider's text); `POST strategies` and `POST brand/quick-setup` refuse a second concurrent request with 409 `already_generating`; cache keys `content:strategy:{org}:{brand}` (10 s, around the check and the placeholder) and `content:quick-setup:{org}:{brand}` (600 s, around the AI call); a post saved with `scheduled_date: null` has no time; Find and Posts order posts with no day (and untimed posts within a day) last on every database.
- Consumes: the `Cache` lock store (the runbook notes that it must be shared across servers — Task 7).

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Content/PostAiTest.php`, after `test_a_provider_failure_answers_ai_failed_and_leaves_the_post_as_it_was`:

```php
    public function test_a_provider_failure_never_shows_the_providers_own_words(): void
    {
        $post = $this->makePost();
        $this->mockPosts()->shouldReceive('generate')->once()->andThrow(new \RuntimeException('Private provider detail: key sk-test'));

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"))
            ->assertStatus(502)->assertJsonPath('error', 'ai_failed')
            ->assertDontSee('Private provider detail');
    }
```

`tests/Feature/Content/BrandTest.php` (it already imports `Mockery` and `ProfileBootstrapService`; add `use Illuminate\Support\Facades\Cache;`):

```php
    public function test_a_quick_setup_failure_never_shows_the_providers_words_and_two_cannot_run_at_once(): void
    {
        $this->profile->forceFill(['setup_completed_at' => null])->save();
        $bootstrap = Mockery::mock(ProfileBootstrapService::class);
        $bootstrap->shouldReceive('bootstrap')->once()->andThrow(new \RuntimeException('Private provider detail'));
        $this->app->instance(ProfileBootstrapService::class, $bootstrap);

        $this->asManager()->postJson($this->api('brand/quick-setup'), ['platforms' => ['instagram']])
            ->assertStatus(502)->assertJsonPath('error', 'ai_failed')->assertDontSee('Private provider detail');

        $held = Cache::lock("content:quick-setup:{$this->org->id}:{$this->brandId}", 600);
        $this->assertTrue($held->get());
        $this->asManager()->postJson($this->api('brand/quick-setup'), ['platforms' => ['instagram']])
            ->assertStatus(409)->assertJsonPath('error', 'already_generating');
        $held->release();
    }
```

`tests/Feature/Content/StrategyTest.php` (add `use Illuminate\Support\Facades\Cache;`):

```php
    public function test_two_requests_at_once_cannot_both_start_a_strategy(): void
    {
        $held = Cache::lock("content:strategy:{$this->org->id}:{$this->brandId}", 10);
        $this->assertTrue($held->get());

        $this->asManager()->postJson($this->api('strategies'), [])->assertStatus(409)->assertJsonPath('error', 'already_generating');
        $this->assertSame(0, \App\Models\ContentPlannerStrategy::where('status', 'generating')->count());
        $held->release();
    }
```

`tests/Feature/Content/PostsTest.php`:

```php
    public function test_a_post_saved_with_no_day_has_no_time_either(): void
    {
        $post = $this->makePost(['scheduled_time' => '09:00']);

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'scheduled_date' => null])
            ->assertOk()->assertJsonPath('post.scheduled_date', null)->assertJsonPath('post.scheduled_time', null);
    }

    public function test_find_and_posts_put_posts_with_no_day_last(): void
    {
        $this->makePost(['topic' => 'Autumn idea', 'scheduled_date' => null]);
        $this->makePost(['topic' => 'Autumn dated', 'scheduled_date' => '2026-10-07', 'scheduled_time' => null]);
        $this->makePost(['topic' => 'Autumn timed', 'scheduled_date' => '2026-10-07', 'scheduled_time' => '09:00']);

        $this->asStaffMember()->getJson($this->api('find?q=autumn'))->assertOk()->assertJsonPath('posts.2.topic', 'Autumn idea');
        $this->asStaffMember()->getJson($this->api('posts'))->assertOk()
            ->assertJsonPath('data.0.topic', 'Autumn timed')->assertJsonPath('data.1.topic', 'Autumn dated')->assertJsonPath('data.2.topic', 'Autumn idea');
    }
```

`tests/Feature/Content/PostRulesTest.php` (add `use App\Models\ContentPlannerAudience;` and `use App\Models\ContentPlannerCampaign;` with the Edit tool):

```php
    public function test_audience_and_campaign_ids_of_another_brand_are_refused_on_a_post(): void
    {
        $post = $this->makePost();
        $seen = $post->fresh()->updated_at->toISOString();
        [$second, $secondProfile] = $this->secondBrand();
        $theirAudience = ContentPlannerAudience::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'name' => 'Their audience', 'active' => true]);
        $theirCampaign = ContentPlannerCampaign::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'name' => 'Their campaign', 'status' => 'draft']);

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'audience_id' => $theirAudience->id])
            ->assertStatus(422)->assertJsonValidationErrors('audience_id');
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'campaign_id' => $theirCampaign->id])
            ->assertStatus(422)->assertJsonValidationErrors('campaign_id');
    }

    public function test_another_organisations_post_cannot_be_moved_copied_deleted_or_written(): void
    {
        $other = $this->otherOrganization();
        $id = $other['post']->id;
        $seen = $other['post']->updated_at->toISOString();

        $this->asStaffMember()->postJson($this->api("posts/{$id}/move"), ['updated_at' => $seen, 'scheduled_date' => null])->assertNotFound();
        $this->asStaffMember()->postJson($this->api("posts/{$id}/duplicate"))->assertNotFound();
        $this->asStaffMember()->deleteJson($this->api("posts/{$id}"))->assertNotFound();
        $this->asStaffMember()->postJson($this->api("posts/{$id}/write"))->assertNotFound();
        $this->assertDatabaseHas('content_planner_posts', ['id' => $id, 'scheduled_date' => '2026-10-07']);
    }
```

- [ ] **Step 2: Run them**

Run: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/ --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"`
Expected: the AI-words, quick-setup, strategy-lock and cleared-date tests fail. Two may pass at once, and the ledger says why:
- `test_find_and_posts_put_posts_with_no_day_last`: SQLite already puts NULL last in a descending order; PostgreSQL puts it first (production, and the local browser pass in Plan B showed an unscheduled post first in Find). Write `Task 3: note: the ordering test passes on SQLite before the fix; the PostgreSQL behaviour is checked in Task 8's browser pass`.
- The isolation tests pin behaviour Plan A built; if one fails, that is a real hole: fix it in this task (an `owned` rule for `campaign_id` in `ContentRules::postFields`, or `self::find` in the action) and write a `Ruling:` line.

- [ ] **Step 3: The fixes**

`PostAiController::run` — the catch-all becomes:

```php
        } catch (\Throwable $e) {
            report($e);
            // The provider's own words (keys, quotas, internals) stay in the log.
            throw new ContentRefused('ai_failed', 'The AI could not finish this. Please try again.', 502);
        }
```

`BrandController::quickSetup` — add `use Illuminate\Support\Facades\Cache;` (Edit tool) and replace from `// The AI log needs a profile row` to the `return` with:

```php
        // The AI log needs a profile row, so the shell comes first.
        $profile = $this->editor->profileFor($request->attributes->get('workspace_org'), $request->user());
        // One quick setup at a time per brand: a second click while the AI writes would pay twice.
        $lock = Cache::lock("content:quick-setup:{$request->attributes->get('workspace_org')->id}:{$profile->brand_id}", 600);
        if (!$lock->get()) {
            throw new ContentRefused('already_generating', 'This brand is already being set up.', 409);
        }

        set_time_limit(600);
        try {
            try {
                $result = $bootstrap->bootstrap($profile, $input);
            } catch (\Throwable $e) {
                report($e);
                throw new ContentRefused('ai_failed', 'Quick setup could not finish. Please try again.', 502);
            }
            $this->editor->applyPayload($profile, (array) ($result['payload'] ?? []), $input);
        } finally {
            $lock->release();
        }

        return response()->json(['assumptions' => array_values((array) ($result['assumptions'] ?? []))] + $this->payload($profile->fresh()), 201);
```

`StrategyController::store` — add `use Illuminate\Support\Facades\Cache;` and replace from `$busy = …` to the `ContentPlannerStrategy::create([...]);` statement with:

```php
        // Two clicks at once must not both pass the check: the check and the placeholder are one step.
        $lock = Cache::lock("content:strategy:{$org->id}:{$profile->brand_id}", 10);
        if (!$lock->get()) {
            throw new ContentRefused('already_generating', 'A strategy is already being written for this brand.', 409);
        }
        try {
            $busy = ContentPlannerStrategy::where('planner_profile_id', $profile->id)
                ->where('status', 'generating')
                ->where('created_at', '>=', now()->subMinutes(self::GENERATING_MINUTES))
                ->exists();
            if ($busy) {
                throw new ContentRefused('already_generating', 'A strategy is already being written for this brand.', 409);
            }

            $placeholder = ContentPlannerStrategy::create([
                'brand_id'           => $profile->brand_id,
                'planner_profile_id' => $profile->id,
                'title'              => 'Generating strategy…',
                'status'             => 'generating',
                'created_by'         => $request->user()->id,
            ]);
        } finally {
            $lock->release();
        }
```

`PostController::update` — after the published-date check, before `$post->fill($fields)->save();`:

```php
        // A post put back to "no day" has no time either (as a move to the tray does).
        if (array_key_exists('scheduled_date', $fields) && $fields['scheduled_date'] === null) {
            $fields['scheduled_time'] = null;
        }
```

`PostController::index` — the order becomes (posts with no day last, then untimed last within a day, on every database):

```php
            // Newest scheduled first; untimed after timed within a day; posts without a date last (PostgreSQL sorts NULL first).
            ->orderByRaw('CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('scheduled_date')
            ->orderByRaw('CASE WHEN scheduled_time IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('scheduled_time')->orderByDesc('id');
```

`PostController::search` — replace `->orderByDesc('scheduled_date')->orderByDesc('id')` with:

```php
            ->orderByRaw('CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('scheduled_date')->orderByDesc('id')
```

- [ ] **Step 4: Run the Content folder and its neighbours**

```bash
for p in tests/Feature/Content/ tests/Unit/Content/ tests/Feature/ContentCalendar/ tests/Feature/AdminAccess/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app tests && git commit -q -F - <<'EOF'
Content server: AI failures in our words, one strategy and one quick setup at a time, a cleared day clears the time

An ai_failed answer no longer carries the provider's own text (it stays in
the log). Starting a strategy and running a quick setup each hold a lock,
so a double click cannot start two (or pay twice). A post saved with no
day loses its time, as a move to the tray does. Find and Posts put posts
with no day (and untimed posts within a day) last on PostgreSQL too. New
isolation tests: another brand's audience and campaign on a post; another
organisation's post on move, duplicate, delete and AI.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The portal — Plan, panel and dialog fixes

**Files:**
- Create: `frontend/src/content/ui/dialogFocus.ts` (+ `dialogFocus.test.ts`), `frontend/src/content/plan/todaySource.test.ts`
- Modify: `frontend/src/content/plan/PlanPage.tsx`, `plan/Toolbar.tsx`, `plan/PostCardView.tsx`, `plan/moveMath.ts`, `plan/GenerateDialog.tsx`, `ui/Dialog.tsx`, `theme/content.css`, `panel/PostFormFields.tsx`, `panel/PostPanel.tsx`; tests `plan/planPieces.test.tsx`, `plan/moveMath.test.ts`, `theme/contentCss.test.ts`, `panel/PostPanel.test.tsx`
- Words: `content.plan.card_label_time`, `content.panel.fields.other_audience` in all five bundles

**Interfaces:**
- Produces: `trapTarget(items, active, shift, inside)`; `Toolbar` prop `aiPaused`; `refetchAfter('network') === true`.
- Consumes: nothing new.

Items (from Plan B's deferred list): "This week" and T from the venue's clock; a refused Fill, a failed Generate and a network-failed move read the plan again; the selected card's ring; Generate waits while the AI budget is used up; tray cards carry no move hint; a card's spoken name includes its time; Undo beside its line and paused while the pointer or focus is on it; the dialog keeps Tab inside after its content changes; inactive pillars are not offered and an unknown audience reads "Another audience"; the panel's comment about refreshes.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/ui/dialogFocus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { trapTarget } from './dialogFocus'

const items = ['first', 'middle', 'last']

describe('trapTarget', () => {
  it('wraps Tab from the last item to the first, and Shift+Tab from the first (or the dialog itself) to the last', () => {
    expect(trapTarget(items, 'last', false, true)).toBe('first')
    expect(trapTarget(items, 'first', true, true)).toBe('last')
    expect(trapTarget(items, null, true, true)).toBe('last')
    expect(trapTarget(items, 'middle', false, true)).toBeNull()
  })

  // Generate's result replaces the focused button: the focus fell out of the dialog, and Tab must bring it back.
  it('brings the focus back in when it has left the dialog', () => {
    expect(trapTarget(items, 'body', false, false)).toBe('first')
    expect(trapTarget(items, 'body', true, false)).toBe('last')
    expect(trapTarget([], 'body', false, false)).toBeNull()
  })
})
```

Create `frontend/src/content/plan/todaySource.test.ts`:

```ts
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// "Today" on the Plan is the venue's day as the server says it (boot.venue.today): a computer whose
// clock is off must still land "This week" on the week that holds the highlighted today (Plan B deferred minor).
describe('the Plan\'s today', () => {
  it('comes from the server, never from this computer\'s clock', () => {
    const source = fs.readFileSync(new URL('./PlanPage.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('venueNow(')
    expect(source).toContain('setDate(boot.venue.today)')
  })
})
```

In `frontend/src/content/plan/moveMath.test.ts`, the `refetchAfter` expectation becomes `.toEqual([true, true, true, true])` (a move whose answer was lost may have happened: read the plan again), with the test name ending `…, or the answer was lost`.

In `frontend/src/content/plan/planPieces.test.tsx`, add to `describe('PostCardView')`:

```tsx
  it('tells a screen reader the time, and gives a card in the tray (no day to move from) no move hint', () => {
    const timed = html(<PostCardView post={post(4, { scheduled_time: '09:30' })} onOpen={noop} onPointerDown={noop} />)
    expect(timed).toContain('aria-label="instagram post at 09:30, draft: Hook 4"')
    const tray = html(<PostCardView post={post(5, { scheduled_date: null })} compact onOpen={noop} onPointerDown={noop} />)
    expect(tray).not.toContain('aria-describedby')
  })
```

and to `describe('Toolbar')` (use the props the existing Toolbar tests pass, plus `aiPaused`):

```tsx
  it('keeps Generate waiting while this month\'s AI budget is used up', () => {
    const out = html(<Toolbar {...toolbarProps} canGenerate aiPaused />)
    expect(out).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:(?!<\/button>).)*Generate/s)
  })
```

(If the Toolbar tests build their props inline, extract them into a `toolbarProps` constant in the test file first.)

In `frontend/src/content/theme/contentCss.test.ts`, add to `describe('content stylesheet')`:

```ts
  it('marks the open post\'s card with a ring beside its platform edge (one box-shadow carries both)', () => {
    expect(css).toMatch(/\[data-content\] \.c-edge\[aria-current="true"\]\s*\{[^}]*inset 3px 0 0 rgb\(var\(--c-pf\)\),\s*0 0 0 2px rgb\(var\(--a-accent-text\)\)/)
  })
```

In `frontend/src/content/panel/PostPanel.test.tsx`, add (it renders `PostFormFields` through the panel; the strategy and brand queries are read from the cache):

```tsx
  it('offers only the active pillars (and the post\'s own), and names an audience it does not know', () => {
    const client = new QueryClient()
    client.setQueryData(['content', 3, 'post', 5], { ...post, pillar_id: null, audience_id: 42 })
    client.setQueryData(['content', 3, 'strategies'], { strategies: [{ id: 2, title: null, summary: null, status: 'active', created_at: null }] })
    client.setQueryData(['content', 3, 'strategy', 2], { strategy: { id: 2, title: null, summary: null, status: 'active', created_at: null, ai_output: null, balance: null,
      pillars: [{ id: 7, name: 'Hair care', active: true, description: null, purpose: null, frequency_weight: 50 }, { id: 8, name: 'Old pillar', active: false, description: null, purpose: null, frequency_weight: 0 }] } })
    const out = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PanelProvider initial={{ kind: 'post', id: 5, seq: 1 }}><PostPanel /></PanelProvider>
        </ContentContext.Provider>
      </QueryClientProvider>,
    )
    expect(out).toContain('>Hair care</option>')
    expect(out).not.toContain('>Old pillar</option>')
    expect(out).toMatch(/<option value="42" selected="">Another audience<\/option>/)
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R2D/vt.sh src/content` → the new tests fail (module missing, `venueNow(` present, `refetchAfter('network')` false, label without time, hint on the tray card, Generate enabled, no ring rule, raw audience id and the inactive pillar).

- [ ] **Step 3: The fixes**

Create `frontend/src/content/ui/dialogFocus.ts`:

```ts
/**
 * Where Tab sends the focus in a modal: the first item after the last, the
 * last before the first (or before the dialog box itself, `active` null),
 * and back inside when the focus has left the dialog (its focused button
 * was replaced, as Generate's result replaces its form). null: let the
 * browser move it.
 */
export function trapTarget<T>(items: readonly T[], active: T | null, shift: boolean, inside: boolean): T | null {
  if (items.length === 0) return null
  const first = items[0]
  const last = items[items.length - 1]
  if (!inside) return shift ? last : first
  if (shift && (active === null || active === first)) return last
  if (!shift && active === last) return first
  return null
}
```

In `frontend/src/content/ui/Dialog.tsx`, import `trapTarget` and replace the Tab handling (from `const items = …` to the `else if` line) with:

```ts
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const active = document.activeElement
      const target = trapTarget(items, active === el ? null : (active as HTMLElement | null), e.shiftKey, el.contains(active))
      if (target) {
        e.preventDefault()
        target.focus()
      }
```

and add to its doc comment: `Tab stays inside even after the dialog's content is replaced (dialogFocus.ts).`

`frontend/src/content/plan/PlanPage.tsx`:
1. The shortcut's `setDate(venueNow(boot.venue.timezone).date)` and the Toolbar's `onToday` become `setDate(boot.venue.today)` (the effect's dependency list gains `boot.venue.today` and loses `boot.venue.timezone` if unused); drop `venueNow` from the import.
2. In `fill`'s `catch`, after `setNote(...)`, add `void refresh() // the slot may be taken, or the post written after all`.
3. The `GenerateDialog`'s `onDone` stays as it is; in `frontend/src/content/plan/GenerateDialog.tsx`'s `catch`, after `setError(...)`, add `onDone() // any drafts saved before the failure are in the plan: read it again`.
4. The note: `const [held, setHeld] = useState(false)`; the timer effect becomes

```ts
  // The Undo line stays while the pointer or the keyboard focus is on it (8 s are short for a keyboard).
  useEffect(() => {
    if (!note || held) return
    const timer = window.setTimeout(() => setNote(null), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [note, held])
```

and the info note's `div` becomes

```tsx
            <div role="status" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-a-border bg-a-surface-2 px-3.5 py-2.5 text-sm text-a-text animate-a-fade">
```

(Undo now sits right after the line, so an open panel over the right edge never covers it.)
5. Pass `aiPaused={aiPaused}` to `Toolbar`.

`frontend/src/content/plan/Toolbar.tsx`: add `aiPaused?: boolean` to the props (`/** This month's AI budget is used up: Generate waits. */`), and the Generate button becomes

```tsx
          {canGenerate && (
            <Button size="sm" onClick={onGenerate} disabled={aiPaused}
              title={aiPaused ? t('content.generate.error.ai_budget_used_up', "This month's AI budget is used up.") : undefined}>
              <Sparkles size={14} aria-hidden />{t('content.plan.generate', 'Generate')}
            </Button>
          )}
```

`frontend/src/content/plan/moveMath.ts`: `refetchAfter` returns true for `'network'` too, and its comment says `… or the answer was lost (the move may have happened)`.

`frontend/src/content/plan/PostCardView.tsx`:
1. The label:

```ts
  const words = { platform: t(`content.platform.${post.platform}`, post.platform), status: t(`content.status.${post.status}`, post.status), text, time: post.scheduled_time ?? '' }
  const label = post.scheduled_time
    ? t('content.plan.card_label_time', '{{platform}} post at {{time}}, {{status}}: {{text}}', words)
    : t('content.plan.card_label', '{{platform}} post, {{status}}: {{text}}', words)
```

2. `aria-describedby={movable && post.scheduled_date !== null ? MOVE_HINT_ID : undefined}` (Shift+arrows move a card a day; a card in the tray has no day to move from — it is dragged).

`frontend/src/content/theme/content.css`, after the `.c-edge` rule:

```css
/* The open post's card: a ring around it, beside its platform edge (Tailwind's ring would be overridden by the edge). */
[data-content] .c-edge[aria-current="true"] {
  box-shadow: inset 3px 0 0 rgb(var(--c-pf)), 0 0 0 2px rgb(var(--a-accent-text));
}
```

`frontend/src/content/panel/PostFormFields.tsx`:
1. The pillar options: `{pillars.filter(p => p.active || String(p.id) === form.pillar_id).map(p => …)}` (`pillarKnown` stays as it is).
2. The unknown audience option reads `{t('content.panel.fields.other_audience', 'Another audience')}` instead of the raw id.

`frontend/src/content/panel/PostPanel.tsx`: the comment above the render-time adoption (`// The post as the server has it, adopted while rendering: …`) says what it does now: `// The post as the server has it, adopted while rendering: when it first arrives, and when a newer copy reaches the cache (a save, a move, an AI answer here) while nothing is edited — the panel does not poll; another device's change meets the stale-save check.`

- [ ] **Step 4: The words**

Add with the scratchpad tool `table-words.mjs` (or by hand), keys relative to their groups:

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `plan.card_label_time` | {{platform}} post at {{time}}, {{status}}: {{text}} | Пост {{platform}} в {{time}}, {{status}}: {{text}} | {{platform}}-Beitrag um {{time}}, {{status}}: {{text}} | Publication {{platform}} à {{time}}, {{status}} : {{text}} | Publicación de {{platform}} a las {{time}}, {{status}}: {{text}} |
| `panel.fields.other_audience` | Another audience | Другая аудитория | Eine andere Zielgruppe | Une autre audience | Otra audiencia |

(`plan.card_label_time` goes into the `plan` group; `panel.fields.other_audience` into the `fields` object inside `panel` — insert it by hand beside `other_pillar`.)

- [ ] **Step 5: Run the tests, the types and the lint**

Run: `$R2D/vt.sh src/content` → all pass. `cd frontend && npx tsc -b` → clean. The scoped lint → only the baseline error.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: the Plan's today from the server, refusals re-read the plan, the open card's ring, Undo that waits

This week and T use the venue's day; a refused Fill, a failed Generate and
a move whose answer was lost read the plan again; the open post's card
shows its ring; Generate waits while the AI budget is used up; a card's
spoken name includes its time and a tray card carries no move hint; Undo
sits beside its line and stays while pointed at or focused; the dialog
keeps Tab inside after its content changes; the panel offers only active
pillars and names an unknown audience.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: The portal — a page that breaks, Strategy's error state, Posts links

**Files:**
- Create: `frontend/src/content/ui/ContentErrorBoundary.tsx` (+ `contentErrorBoundary.test.tsx`)
- Modify: `frontend/src/content/ContentShell.tsx`, `strategy/StrategyPage.tsx`, `strategy/StrategyActions.tsx`, `posts/postsFilters.ts`, `posts/PostsPage.tsx`; tests `strategy/strategyPage.test.tsx`, `posts/postsFilters.test.ts`, `posts/postsPage.test.tsx`
- Words: `content.common.page_failed`, `content.common.reload`, `content.strategy.load_failed` in all five bundles

**Interfaces:**
- Produces: `ContentErrorBoundary({ message, reload, children })` (a class component with `getDerivedStateFromError`); the shell wraps every page in it, keyed by the address.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/ui/contentErrorBoundary.test.tsx`:

```tsx
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
```

In `frontend/src/content/strategy/strategyPage.test.tsx`: give `bootFor` a third parameter `withProfile = true` (`profile: withProfile ? { id: 1, setup_completed: true, readiness: 80 } : null`), let `render` take it as a sixth parameter and pass it on, and add:

```tsx
describe('when the strategy cannot be read', () => {
  it('says so, with a way to try again', async () => {
    const client = new QueryClient()
    await client.prefetchQuery({ queryKey: ['content', 3, 'strategies'], queryFn: () => Promise.reject(new Error('down')), retry: false })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/content/strategy']}>
          <ContentContext.Provider value={{ data: bootFor(false), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
            <StrategyScreen />
          </ContentContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(html).toContain('The strategy could not be loaded.')
    expect(html).toContain('>Try again<')
  })

  it('keeps New strategy closed on a brand with no profile, and says why', () => {
    const html = render('/content/strategy', [], [], true, 'under', false)
    expect(buttonTag(html, 'New strategy')).toMatch(/\bdisabled=""/)
    expect(html).toContain('Set up the brand first: the strategy is made from it.')
  })
})
```

In `frontend/src/content/posts/postsFilters.test.ts`, add to `describe('readFilters')`:

```ts
  it('drops numbers too big to be a page or a pillar (the server would refuse them)', () => {
    expect(read('page=99999999999999999999&pillar=1e20')).toMatchObject({ page: 1, pillar_id: null })
    expect(read('pillar=2147483647').pillar_id).toBe(2147483647)
  })
```

In `frontend/src/content/posts/postsPage.test.tsx`, add:

```tsx
  it('shows a pillar filter the active strategy does not know as "Another pillar", chosen', () => {
    const html = render('/content/posts?pillar=99', { ...NO_FILTERS, pillar_id: 99 }, { data: [], meta: { page: 1, pages: 0, total: 0 } })
    expect(html).toMatch(/<option value="99" selected="">Another pillar<\/option>/)
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R2D/vt.sh src/content/ui src/content/strategy src/content/posts` → the new tests fail.

- [ ] **Step 3: The fixes**

Create `frontend/src/content/ui/ContentErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Notice } from '../../workspace/ui/Notice'

interface Props { message: string; reload: string; children: ReactNode }

/**
 * Catches a page that breaks while it renders, so the person sees the
 * portal's own notice and a way to reload — not the app-wide fallback in
 * English with the raw error. The shell keys it by the address, so another
 * page starts fresh.
 */
export class ContentErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('A Content page could not be shown', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="max-w-xl space-y-3 p-6">
        <Notice tone="danger">{this.props.message}</Notice>
        <button type="button" onClick={() => window.location.reload()}
          className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
          {this.props.reload}
        </button>
      </div>
    )
  }
}
```

In `frontend/src/content/ContentShell.tsx`, import it and wrap the page in `main`:

```tsx
          <main ref={main} tabIndex={-1} className="min-h-0 flex-1">
            <ContentErrorBoundary key={pathname}
              message={t('content.common.page_failed', 'This page could not be shown. What you saved is safe.')}
              reload={t('content.common.reload', 'Reload the page')}>
              {children}
            </ContentErrorBoundary>
          </main>
```

In `frontend/src/content/strategy/StrategyPage.tsx`, import `Button` and, after the loading skeleton, add:

```tsx
      {list.isError && !list.data && (
        <div className="space-y-3">
          <Notice tone="danger">{t('content.strategy.load_failed', 'The strategy could not be loaded.')}</Notice>
          <Button variant="secondary" onClick={() => { void list.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
```

and after `{finished && detail.isLoading && <Skeleton className="h-64" />}`:

```tsx
      {finished && detail.isError && !detail.data && (
        <div className="space-y-3">
          <Notice tone="danger">{t('content.strategy.load_failed', 'The strategy could not be loaded.')}</Notice>
          <Button variant="secondary" onClick={() => { void detail.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
```

In `frontend/src/content/strategy/StrategyActions.tsx`: `const noProfile = boot.profile === null` (a strategy is made from the brand); the New strategy button's `disabled` becomes `paused || noProfile || generation.state === 'running'`; and beside the paused hint add

```tsx
      {noProfile && <p className="basis-full text-right text-xs text-a-text-2">{t('content.strategy.error.no_profile', 'Set up the brand first: the strategy is made from it.')}</p>}
```

In `frontend/src/content/posts/postsFilters.ts`, `whole` becomes:

```ts
/** A whole number the server takes as an id or a page (PostgreSQL integer); anything else is "not given". */
const whole = (value: string | null): number | null => {
  const n = Number(value)
  return value !== null && Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null
}
```

In `frontend/src/content/posts/PostsPage.tsx`:
1. The pillar select shows when `pillars.length > 0 || filters.pillar_id !== null`, and after the pillars' options:

```tsx
            {filters.pillar_id !== null && !pillars.some(p => p.id === filters.pillar_id) && (
              <option value={filters.pillar_id}>{t('content.posts.other_pillar', 'Another pillar')}</option>
            )}
```

2. The doc comment's "so a filtered list can be shared and Back undoes a filter" becomes "so a filtered list can be shared and survives a reload".

- [ ] **Step 4: The words**

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `common.page_failed` | This page could not be shown. What you saved is safe. | Эту страницу не удалось показать. Всё сохранённое на месте. | Diese Seite konnte nicht angezeigt werden. Was Sie gespeichert haben, ist sicher. | Cette page n’a pas pu s’afficher. Ce que vous avez enregistré est en sécurité. | No se pudo mostrar esta página. Lo que guardaste está a salvo. |
| `common.reload` | Reload the page | Обновить страницу | Seite neu laden | Recharger la page | Recargar la página |
| `strategy.load_failed` | The strategy could not be loaded. | Не удалось загрузить стратегию. | Die Strategie konnte nicht geladen werden. | La stratégie n’a pas pu être chargée. | No se pudo cargar la estrategia. |

(`common.*` into the `common` group, `strategy.load_failed` into the `strategy` group; with the table tool, run once per group with `--group common` and `--group strategy`, or insert by hand.)

- [ ] **Step 5: Run the tests, the types and the lint**

Run: `$R2D/vt.sh src/content` → all pass. `cd frontend && npx tsc -b` → clean. The scoped lint → only the baseline error.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: a page that breaks says so in our words; Strategy's error state; Posts links that cannot break the list

Every page sits in an error boundary keyed by the address (the portal's
notice and a reload, not the app-wide English fallback). Strategy says
when it cannot be read, with Try again, and keeps New strategy closed on a
brand with no profile. A Posts link with a number too big for an id or a
page falls back to none, and a pillar filter the strategy does not know
shows as "Another pillar".

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: The portal — Brand and setup fixes

**Files:**
- Modify: `frontend/src/content/brand/SectionCard.tsx`, `brand/inputs.tsx`, `brand/brandForms.ts`, `brand/listActions.ts`, `brand/BrandPage.tsx`, `brand/sections/{BrandDna,Rhythm,Audiences,Channels}.tsx`, `brand/setup/QuickSetup.tsx`, `lib/errors.ts`; tests `brand/brandForms.test.ts`, `brand/brandSections.test.tsx`, `brand/brandLists.test.tsx`, `brand/listActions.test.ts`, `brand/brandPage.test.tsx`, `brand/setup.test.tsx`
- Words: `content.brand.error.already_generating`; `content.brand.audiences.used` reworded, in all five bundles

**Interfaces:**
- Produces: `SectionCard` prop `check?: (draft) => string[]` (fields that block saving, shown marked with the portal's "Some fields need attention."); `SelectField` and `Segmented` prop `required` (a chosen value cannot be emptied — the server refuses null there); `channelForm(channel, platform, label?)`; `dnaProblems(form)`.

Items (from Plan C's deferred list): emptying the brand name or the language is silently ignored; a stored trend looks clearable; a Quick setup that fails at the gateway leaves the page stale; mix categories outside the list count toward a total nobody can change, and a mix stored as strings reads as "the AI decides"; staff see "not set up" twice; a new channel is named after the platform's slug; "Used by 1 posts"; duplicate stored tags share a React key; Edit, Save and Cancel drop the keyboard focus; and the portal's words for Quick setup's new `already_generating` (Task 3).

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/brand/brandForms.test.ts`, in `describe('reading what the old wizard and the AI wrote')`:

```ts
  it('reads a content mix stored as numbers in text', () => {
    expect(asMix({ education: '40', myths: ' 25 ', proof: 'lots' })).toEqual({ education: 40, myths: 25 })
  })
```

`frontend/src/content/brand/brandSections.test.tsx` (import `dnaForm`, `dnaProblems` from `./sections/BrandDna`, `SelectField`, `TagInput` from `./inputs`, and `renderToStaticMarkup`):

```tsx
describe('fields the server cannot empty', () => {
  it('stops a Brand DNA save with no name, and marks the field', () => {
    expect(dnaProblems({ ...dnaForm(brandWith()), name: '  ' })).toEqual(['name'])
    expect(dnaProblems(dnaForm(brandWith()))).toEqual([])
  })

  it('offers no empty choice once a language is chosen', () => {
    const chosen = renderToStaticMarkup(<SelectField label="Language" value="en" options={[['en', 'English']]} empty="Choose a language" required onChange={() => {}} />)
    expect(chosen).not.toContain('Choose a language')
    const none = renderToStaticMarkup(<SelectField label="Language" value="" options={[['en', 'English']]} empty="Choose a language" required onChange={() => {}} />)
    expect(none).toContain('Choose a language')
  })
})

describe('lists with doubles', () => {
  it('shows a tag stored twice twice, each removable on its own', () => {
    const html = renderToStaticMarkup(<TagInput label="Values" values={['Care', 'Care']} onChange={() => {}} />)
    expect(html.match(/aria-label="Remove Care"/g)).toHaveLength(2)
  })
})
```

and in `describe('RhythmSection')`:

```tsx
  it('lists a mix category the list does not know, so the total can be brought to 100 %', () => {
    const odd = brandWith({ profile: { ...profile, content_mix: { education: 50, seasonal_offers: 60 } } })
    const html = renderBrand(odd, true, <RhythmSection brand={odd} canEdit startOpen />)
    expect(html).toContain('Total 110 %')
    expect(html).toContain('seasonal_offers')
  })
```

`frontend/src/content/brand/listActions.test.ts`:

```ts
  it('names a new channel after its platform in the reader\'s words', () => {
    expect(channelForm(null, 'linkedin', 'LinkedIn').label).toBe('LinkedIn')
    expect(channelForm(null, 'linkedin').label).toBe('linkedin')
  })
```

`frontend/src/content/brand/brandLists.test.tsx`: the expectation `'Used by 4 posts'` becomes `'Posts using it: 4'`.

`frontend/src/content/brand/brandPage.test.tsx`: the test "tells staff when the brand is not set up yet" becomes

```tsx
  it('leaves telling staff the brand is not set up to the shell (no second notice), and shows no sections', () => {
    const html = renderBrand({ profile: null, audiences: [], channels: [], voice: null, readiness: null }, false)
    expect(html).not.toContain('Your manager has not set up this brand yet.')
    expect(html).not.toContain('Brand DNA')
  })
```

and in `frontend/src/content/brand/setup.test.tsx` the staff test's `toContain('Your manager has not set up this brand yet.')` becomes `not.toContain(...)` (the shell says it once).

- [ ] **Step 2: Run them to see them fail**

Run: `$R2D/vt.sh src/content/brand` → the new and changed tests fail.

- [ ] **Step 3: The fixes**

`frontend/src/content/brand/brandForms.ts`, `asMix`: a value is taken when it is a finite number, or a text holding one:

```ts
export function asMix(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(record(value))) {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    if (Number.isFinite(n)) out[key] = Math.round(n)
  }
  return out
}
```

`frontend/src/content/brand/inputs.tsx`:
1. `SelectField` gains `required = false` (`/** A chosen value cannot be emptied (the server refuses null there): no empty choice once one is chosen. */`); the empty option renders only when `!required || value === ''`.
2. `ChoiceChips` gains `required = false`; in `toggle`, `if (on && required && !multiple) return` before the change. `Segmented` takes `required` and passes it on.
3. `TagInput` keys and removes by position: `values.map((value, i) => <span key={`${i}:${value}`} …>` and the × calls `onChange(values.filter((_, j) => j !== i))`. `ReadTags` keys by `${i}:${v}`.

`frontend/src/content/brand/SectionCard.tsx`:
1. A `check?: (draft: F) => string[]` prop (`/** Fields that stop a save (the server would refuse or ignore them): marked, with "Some fields need attention." */`); at the start of `submit`, after `if (draft === null || busy) return`:

```ts
    const problems = check?.(draft) ?? []
    if (problems.length > 0) {
      setInvalid(problems)
      setError(t('content.brand.error.invalid', 'Some fields need attention.'))
      return
    }
```

2. The keyboard focus follows the form: a `box` ref on the `section`, `data-section-edit=""` on the Edit button, and a `focusAfter` ref (`'form' | 'edit' | null`) set to `'form'` in the Edit click and to `'edit'` after a save (when `onSaved` is not given) and on Cancel; then

```ts
  // Edit puts the keyboard in the form; Save and Cancel bring it back to Edit (the buttons that had it are gone).
  useEffect(() => {
    const want = focusAfter.current
    if (!want) return
    focusAfter.current = null
    const into = want === 'form' ? 'input, textarea, select, button[aria-pressed]' : '[data-section-edit]'
    box.current?.querySelector<HTMLElement>(into)?.focus()
  })
```

`frontend/src/content/brand/sections/BrandDna.tsx`: add

```ts
/** What stops a Brand DNA save: a brand needs a name (the server keeps the old one rather than none). */
// eslint-disable-next-line react-refresh/only-export-components
export const dnaProblems = (form: DnaForm): string[] => (form.name.trim() === '' ? ['name'] : [])
```

pass `check={dnaProblems}` to its `SectionCard`, and `required` to the language `SelectField`.

`frontend/src/content/brand/sections/Rhythm.tsx`:
1. The trend `Segmented` gets `required` (a stored trend cannot be emptied; the server refuses null).
2. The mix editor's rows are the known categories plus any the stored mix holds that the list does not know:

```tsx
                  {[...Object.keys(MIX_CATEGORIES), ...Object.keys(draft.mix).filter(key => !(key in MIX_CATEGORIES))].map(key => (
```

(`optionText` shows an unknown key as itself.)

`frontend/src/content/brand/sections/Audiences.tsx`: the posts count reads `t('content.brand.audiences.used', 'Posts using it: {{count}}', { count: audience.posts_count })`.

`frontend/src/content/brand/listActions.ts`: `channelForm(c, platform, label?)` — a new channel's label is `label ?? platform`.

`frontend/src/content/brand/sections/Channels.tsx`, in `ChannelEditor`: the form starts from `channelForm(channel, first, t(`content.platform.${first}`, first))` (with `const first = boot.platforms[0] ?? 'instagram'`), and choosing another platform renames a label still equal to the old platform's name:

```tsx
              onChange={(platform) => {
                if (platform === '') return
                const oldName = t(`content.platform.${form.platform}`, form.platform)
                set({ platform: platform as Platform, label: form.label === oldName ? t(`content.platform.${platform}`, platform) : form.label })
              }}
```

`frontend/src/content/brand/BrandPage.tsx`: delete the page's own `not_set_up_staff` notice (the shell already shows it on every page).

`frontend/src/content/brand/setup/QuickSetup.tsx`: in `start`'s `catch`, after `setError(...)`, read the brand and the bootstrap again (a setup that timed out at the gateway may have finished on the server):

```ts
      void queryClient.invalidateQueries({ queryKey: ['content', brandId, 'brand'] })
      void queryClient.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
```

(with `const queryClient = useQueryClient()` and `const brandId = useBrandId()`).

`frontend/src/content/lib/errors.ts`, the `brand` family gains `already_generating: 'The brand is already being set up. Please wait a moment.'`.

- [ ] **Step 4: The words**

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `brand.error.already_generating` | The brand is already being set up. Please wait a moment. | Бренд уже настраивается. Подождите немного. | Die Marke wird bereits eingerichtet. Bitte warten Sie einen Moment. | La marque est déjà en cours de configuration. Patientez un instant. | La marca ya se está configurando. Espera un momento. |
| `brand.audiences.used` (new wording) | Posts using it: {{count}} | Постов с ней: {{count}} | Beiträge damit: {{count}} | Publications qui l’utilisent : {{count}} | Publicaciones que la usan: {{count}} |

(Insert `already_generating` into `brand.error` and replace the value of `brand.audiences.used` by hand; the bundle tests check both.)

- [ ] **Step 5: Run the tests, the types and the lint**

Run: `$R2D/vt.sh src/content` → all pass (including `errors.test.ts`, which keeps the English bundle equal to `ERRORS`). `cd frontend && npx tsc -b` → clean. The scoped lint → only the baseline error.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: Brand fields the server cannot empty say so, the focus follows the forms, small Brand fixes

A brand needs a name (marked, not silently kept); a chosen language and a
chosen trend cannot be emptied; a Quick setup that failed at the gateway
reads the brand again; unknown mix categories can be changed and a mix
stored as text reads; staff see "not set up" once; a new channel is named
in the reader's words; "Posts using it"; doubled tags each removable;
Edit, Save and Cancel keep the keyboard in place; and the portal's words
for a quick setup already running.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Release-1 leftovers and the runbook

**Files:**
- Modify: `frontend/src/workspace/tokens.test.ts`, `frontend/src/appointments/tokens.test.ts`, `frontend/src/appointments/calendar/TodayStrip.tsx` (comment), `frontend/src/workspace/ui/fitFigure.ts` (comment), `frontend/src/lib/venueTime.ts` (comment), `docs/appointments-workspace.md`, `docs/content-workspace.md`

**Interfaces:** none (tests, comments, docs).

- [ ] **Step 1: The scope check finds the first rule inside an `@media` block (failing test first)**

In `frontend/src/workspace/tokens.test.ts`, lift the selector pattern into a constant and test it (the same change in `frontend/src/appointments/tokens.test.ts`, which carries a copy):

```ts
/** Every rule's selector list: after the start, a `}` — or a `{` (the first rule inside @media/@container). */
const SELECTORS = /(^|\})\s*([^{}@]+)\{/g

it('finds the first rule inside an @media or @container block too', () => {
  const css = '@media (max-width: 600px) { .first { color: red } .second { color: blue } }'
  expect([...css.matchAll(SELECTORS)].map(m => m[2].trim())).toEqual(['.first', '.second'])
})
```

and make the existing scope test use `SELECTORS` (`css.matchAll(SELECTORS)`). Run `$R2D/vt.sh src/workspace/tokens.test.ts src/appointments/tokens.test.ts` → the new test fails (`.first` missing). Then change the pattern to `/(^|[{}])\s*([^{}@]+)\{/g` in both files and run again → pass (Release 1 found every such rule already scoped; if the stricter check finds one unscoped, scope it and write a `Ruling:` line).

- [ ] **Step 2: Stale paths**

- `frontend/src/appointments/calendar/TodayStrip.tsx:93`: `(appointments.css, [data-glance])` → `(workspace.css, [data-glance])`.
- `frontend/src/workspace/ui/fitFigure.ts:4`: `(appointments.css, [data-fit])` → `(workspace.css, [data-fit])`.
- `frontend/src/lib/venueTime.ts:11`: `(appointments/lib/wallClock.ts)` → `(workspace/lib/wallClock.ts)`.
- `docs/appointments-workspace.md:141`: `frontend/src/appointments/lib/wallClock.ts` → `frontend/src/workspace/lib/wallClock.ts`; `:503`: the tokens are `--a-*` in `frontend/src/workspace/theme/workspace.css` (Appointments' own rules stay in `appointments.css`).

(Check each with `grep -n` before editing: the line numbers are Release 1's and may have moved by a line.)

- [ ] **Step 3: The runbook**

In `docs/content-workspace.md`:
1. The intro's last sentence (it wraps over lines 4–5: "This page covers the server and the portal; the full admin's way in and the retirements are added with release 2's Plan D.") becomes "This page covers the server, the portal, the way in from the full admin and what release 2 retired." Keep the paragraph wrapped at about 115 characters, as the page is.
2. In "## Who has it, and switching it", add:

```markdown
- **The way in:** the full admin's menu shows **HexaTech Content** first in "CRM & Marketing" to staff of every organisation that has it (`showsWorkspaceLink(user, 'content')`, from the `/v1/auth/me` refresh), and the Marketing hub's tile opens `/content`. An old `/marketing?tab=content-planner` link lands on `/content`. An organisation that chose Content (`workspace:content <org> --on --landing`) lands there after sign-in when no other page was asked for. A sign-in that runs out on a Content page comes back to it.
- **The way back:** "Full admin" in the portal opens `/marketing` for managers and `/` for staff (the Marketing hub is manager-only).
```

3. In "## Rules the code keeps", add:

```markdown
- **One strategy and one quick setup at a time per brand.** Starting a strategy holds the cache lock `content:strategy:{org}:{brand}` for its check and placeholder (10 s); a quick setup holds `content:quick-setup:{org}:{brand}` for its AI call (600 s). Like the calendar's lock, these need a cache store every server shares (database or redis — not `file` on several servers).
- **AI failures are said in our words.** An `ai_failed` answer never carries the provider's text; it is in the log (`report()`).
- **Spend needs a price.** An overridden `CONTENT_PLANNER_AI_MODEL` must be in `AiUsageService::MODEL_PRICING`, or its spend is logged at 0.
```

4. "## What this release does not do": replace the last sentence (lines 101–102: "The old `/v1/admin/content-planner/*` routes keep working until the portal replaces the old screens (release 2, Plan D).") with "The old AI Content Planner is gone: its `/v1/admin/content-planner/*` routes answer 404 and its screens are removed; a browser tab left open across the deploy must be reloaded."
5. Add at the end:

```markdown
## Deploying

- No migration: every profile, strategy, post and image carries over as it is.
- Ship by the source-patch recipe (`docs/landing-page-builder.md` §6): a worktree from `origin/main`, the change list since the last deployed feature tip with every deletion, the suites on the artifact, a fresh build, then push. Never push the feature branch.
- Verify by content on the live site: the `ContentApp` chunk carries the portal's words and the index bundle does not; `/api/v1/admin/content/bootstrap` answers 401 when signed out (404 before release 2); `/api/v1/admin/content-planner/profile` answers 404; the Appointments chunk is as before.
- After the deploy (owner): open `/content` as a manager and as a staff member; generate one week on a real brand; check Settings → AI Usage for the `content` line; reload admin tabs left open across the deploy.
```

- [ ] **Step 4: Run and commit**

Run: `$R2D/vt.sh src/workspace src/appointments src/lib` → all pass; `cd frontend && npx tsc -b` → clean.

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src docs && git commit -q -F - <<'EOF'
Release-1 leftovers and the runbook: the scope check sees rules inside @media, stale paths, way in, locks, deploying

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: The release checks

The spec's quality bar (§8.3, §9) on the finished branch, before anything is deployed. This task writes only to `$R2D` (git-ignored), to the local database (a temporary brand, removed at the end) and, for each defect a check finds, to the branch: every such fix goes in test-first (a test that fails, then passes) with a ledger line `Task 8: fixed <what> — <test> RED→GREEN`, and its own commit.

**Files:**
- Create (all under `$R2D`): `php-all.sh`, `pass-seed.php`, `pass-posts.php`, `pass-unseed.php`, `tools/` (a copy of release 1's pixel tools) with `tools/pass.mjs` and `tools/token-server.mjs`, `final-vitest.txt`, `final-php.txt`, `build.txt`, `lighthouse.md`, `eyes.md`, `keys-base.txt`, `keys-new.txt`
- Temporary: a base worktree `C:\wamp64\www\Hexa-Tech-content-base` (origin/main), local servers on :8012 (API), :5173 (Vite), :8099 (Lighthouse sign-in); all undone in Step 10.

**Interfaces:**
- Consumes: everything Tasks 1–7 built; Task 3's ordering (Find and Posts put posts with no day, and untimed posts within a day, last); Task 6's `data-section-edit`; Task 4's `.c-edge[aria-current="true"]` ring; Task 1's `loginPathAfterExpiry` (`/login?redirect=%2Fcontent%2Fposts`).
- Produces: the evidence Task 9's report quotes (suite lines, build lines, `46 screens, 0 differ`, Lighthouse scores, the pass's PASS lines).

- [ ] **Step 1: The frontend suites**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R2D/final-vitest.txt" 2>&1; tail -6 "$R2D/final-vitest.txt"; grep -E '^ FAIL ' "$R2D/final-vitest.txt" | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -4
```

Expected: `TSC-CLEAN`; `Tests  3 failed | … passed`, the only `FAIL` lines in `src/lib/plannerMeta.test.ts`; the lint shows only the baseline error in `src/App.tsx`. Write the counts to the ledger as `Task 8: note: vitest <n> passed, 3 baseline failures; tsc clean; lint baseline`.

- [ ] **Step 2: Every PHP suite, by folder**

Write `$R2D/php-all.sh` with the Write tool:

```bash
#!/usr/bin/env bash
# php-all.sh PATH... — each PHP test path alone, in the foreground. Appends "<path> | <Tests: line> | exit <code>"
# to $OUT (default final-php.txt beside this script) and keeps a failing path's output in fail-<path>.txt.
# ROOT is the tree to test (default the feature worktree; Task 9 points it at the deploy worktree).
W=$(cd "$(dirname "$0")" && pwd)
OUT="$W/${OUT:-final-php.txt}"
cd "${ROOT:-/c/wamp64/www/Hexa-Tech-content}" || exit 1
for p in "$@"; do
  out=$(XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test "$p" --no-ansi 2>&1); code=$?
  line=$(printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests:|No tests" | tail -1)
  printf '%s | %s | exit %s\n' "$p" "${line:-NO SUMMARY}" "$code" | tee -a "$OUT"
  [ $code -ne 0 ] && printf '%s\n' "$out" > "$W/fail-$(printf '%s' "$p" | tr '/' '_').txt"
done
```

Then list the paths and run them in batches of about ten per call (each call stays under the 10-minute limit; never one bare `artisan test`):

```bash
chmod +x "$R2D/php-all.sh"; rm -f "$R2D/final-php.txt"
cd /c/wamp64/www/Hexa-Tech-content && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R2D/php-paths.txt"; wc -l < "$R2D/php-paths.txt"
"$R2D/php-all.sh" $(sed -n 1,10p "$R2D/php-paths.txt")      # then 11,20p, 21,30p … to the end
```

Expected: one line per path (72 at the time of writing: 65 folders and 7 loose files), each `Tests: … passed` and `exit 0`; `tests/Feature/Content/`, `tests/Unit/Content/`, `tests/Feature/ContentCalendar/`, `tests/Feature/AdminAccess/` and `tests/Feature/Documentation/` among them.

A failing path: read `$R2D/fail-*.txt`. If the test or the code it covers is in this branch's change list (`git diff --name-only ec0eaf085 HEAD`), it is ours: fix it test-first, commit, and run the path again. If neither is, run it once more alone (this suite has a history of crashes that pass on a second run); if it still fails, write `Task 8: note: pre-existing failure <path> <test> — not in the change list`; it goes to the owner in the final report and does not block.

- [ ] **Step 3: The build check (spec §9)**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx vite build --outDir "$R2D/build" --emptyOutDir > "$R2D/build.txt" 2>&1; echo "build exit $?"
cd "$R2D/build/assets" && ls ContentApp-*.js AppointmentsApp-*.js
grep -l "Fill with AI" *.js; grep -l "What you saved is safe" *.js
grep -l "data-content\|data-appointments" index-*.js; echo "(no index file listed above)"
ls | grep -i "ContentPlanner"; echo "(no ContentPlanner chunk listed above)"
grep -l "admin/content-planner" *.js; echo "(no file with the old API path listed above)"
cd /c/wamp64/www/Hexa-Tech-content && git checkout -- frontend/dist/stats.html && rm -rf "$R2D/build" && git status --short
```

Expected: `build exit 0`; one `ContentApp-*.js` and one `AppointmentsApp-*.js`; both phrases found only in `ContentApp-*.js`; nothing listed for the index, the old chunk or the old path; `git status --short` prints nothing (the visualizer rewrites `frontend/dist/stats.html` whatever the `outDir`; it is restored).

- [ ] **Step 4: Appointments, pixel for pixel, against what is live**

The base is what production runs now (`origin/main`). Its tree and the branch share `frontend/package.json` and the lock file (release 2 adds no dependency), so the base borrows the branch's `node_modules` through a junction.

```bash
cd /c/wamp64/www/Hexa-Tech-content && git fetch -q origin && git log -1 --format='%h %s' origin/main
git diff --quiet origin/main HEAD -- frontend/package.json frontend/package-lock.json && echo SAME-DEPS
git worktree add --detach ../Hexa-Tech-content-base origin/main
mkdir -p "$R2D/tools" && cp -r .superpowers/sdd/archive/2026-10-14-content-workspace-r1/work/tools/. "$R2D/tools/"
netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'; echo "ports above must be empty"
```

Expected: origin/main's tip is `b93b9db36` or a later commit the ledger names; `SAME-DEPS`. Then in PowerShell:

```powershell
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

In `$R2D/tools/pixels.mjs` (Edit tool), release 1's tree check no longer tells the trees apart (both now draw `[data-workspace]`). Replace the whole `assertTree` function with:

```js
/** Which tree served the page: only the branch has workspace/lib/landing.ts (release 2's way in); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/workspace/lib/landing.ts')
    return r.ok && (r.headers.get('content-type') ?? '').includes('javascript')
  })
  const wanted = which === 'new'
  if (branch !== wanted) throw new Error(`capture ${which}: the page was served by the ${branch ? 'branch' : 'base'} tree`)
}
```

and change `const TOKEN_NAME = 'content-r1-pixels'` to `const TOKEN_NAME = 'content-r2d-pixels'`.

Start the API (background) — one API for every capture, the branch's (Appointments' endpoints are the same in both trees):

```bash
cd /c/wamp64/www/Hexa-Tech-content && CORS_ALLOWED_ORIGINS=http://localhost:5173 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --port=8012 --no-reload
```

Start the BASE tree's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content-base/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

Capture the base and a control run on the same server, and the keyboard checks:

```bash
cd "$R2D/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture base && node pixels.mjs capture control && node pixels.mjs compare base control | tail -1
node pixels.mjs keys | tee "$R2D/keys-base.txt" | tail -3
```

Expected: `46 screens, 0 differ` (the method is deterministic) and every keys line `PASS`. If `capture` stops with "no appointment with a client on 2026-09-30", pick a day that has one (the error says how many calendar answers it saw), use it for every run, and ledger it.

Stop the base Vite (TaskStop). `netstat -ano | grep ':5173 .*LISTENING'` must print nothing; if a node PID remains, check its command line names `Hexa-Tech-content-base` (PowerShell `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select CommandLine`), then `taskkill //PID <pid> //F`. Start the BRANCH's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

```bash
cd "$R2D/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture new && node pixels.mjs compare base new | tail -3
node pixels.mjs keys | tee "$R2D/keys-new.txt" | tail -3; diff "$R2D/keys-base.txt" "$R2D/keys-new.txt" && echo KEYS-SAME
```

Expected: `46 screens, 0 differ`; `KEYS-SAME`. A `DIFF` line: open the PNG in `$R2D/shots/diff-base-new/` and both captures with the Read tool. Any differing pixel in Appointments is a defect of this branch (the spec: no change anyone can see): find the change that caused it (`git diff ec0eaf085 HEAD -- frontend/src/workspace frontend/src/appointments`), fix it test-first where a test can hold it, capture `new` again, and repeat until `0 differ`. Keep the branch's Vite and the API running for Steps 5–7.

- [ ] **Step 5: The browser pass that writes for real (spec §9, the deferred browser items)**

It runs on local org 16 on a temporary brand with a long name and no Content profile (the pass sets it up through Guided setup), as the manager `appointments-tester@example.test` and as one of the organisation's staff. Write the three PHP files with the Write tool (keep the Cyrillic as it is: the Write tool saves UTF-8).

`$R2D/pass-seed.php`:

```php
<?php
// Plan 2D browser pass: a temporary brand for local org 16, with a name too long for a phone header and no Content
// profile (the pass sets it up through Guided setup). pass-unseed.php removes it and everything under it.
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$org = 16;
$name = 'Release check: a brand whose name is far too long for a phone header';
if (DB::table('brands')->where('organization_id', $org)->where('name', $name)->exists()) { echo "EXISTS\n"; return; }
$now = now();
$id = DB::table('brands')->insertGetId([
    'organization_id' => $org, 'name' => $name, 'slug' => 'release-check-r2d', 'widget_token' => Str::random(32),
    'is_default' => false, 'sort_order' => 99, 'created_at' => $now, 'updated_at' => $now,
]);
echo "BRAND {$id}\n";
```

`$R2D/pass-posts.php` (run by the pass after Guided setup made the profile and the pass added its audience):

```php
<?php
// Plan 2D browser pass: an always-on Instagram channel, four posts (two on today, one with no day, one in Cyrillic)
// and the pass's audience on one of them, on the release-check brand. pass-unseed.php removes them with the brand.
use Illuminate\Support\Facades\DB;

$org = 16;
$brand = DB::table('brands')->where('organization_id', $org)->where('name', 'Release check: a brand whose name is far too long for a phone header')->whereNull('deleted_at')->value('id');
$profile = $brand ? DB::table('content_planner_profiles')->where('brand_id', $brand)->value('id') : null;
if (!$profile) { echo "NO_PROFILE\n"; return; }

$now = now();
$today = Carbon\CarbonImmutable::now(App\Services\Appointments\VenueClock::zone($org));
DB::table('content_planner_channels')->insert([
    'organization_id' => $org, 'brand_id' => $brand, 'planner_profile_id' => $profile, 'platform' => 'instagram',
    'label' => 'Release check Instagram', 'active' => true,
    'frequency' => json_encode(array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], true)),
    'created_at' => $now, 'updated_at' => $now,
]);
$audience = DB::table('content_planner_audiences')->where('planner_profile_id', $profile)->where('name', 'Release check audience')->value('id');
$posts = [
    ['Release check timed', $today->toDateString(), '09:00', 'linkedin', 'draft', $audience],
    ['Release check untimed', $today->toDateString(), null, 'facebook', 'draft', null],
    ['Release check no day', null, null, 'linkedin', 'idea', null],
    ['Осенняя распродажа красок', $today->addDay()->toDateString(), '11:00', 'facebook', 'draft', null],
];
foreach ($posts as [$hook, $date, $time, $platform, $status, $aud]) {
    DB::table('content_planner_posts')->insert([
        'organization_id' => $org, 'brand_id' => $brand, 'planner_profile_id' => $profile, 'platform' => $platform,
        'scheduled_date' => $date, 'scheduled_time' => $time, 'status' => $status, 'hook' => $hook, 'topic' => 'Checks',
        'language' => 'en', 'generated_by' => 'manual', 'main_copy' => 'Seeded for Plan 2D.', 'hashtags' => json_encode([]),
        'audience_id' => $aud, 'created_at' => $now, 'updated_at' => $now,
    ]);
}
echo 'POSTS 4 AUDIENCE ' . ($audience ?? 'none') . "\n";
```

`$R2D/pass-unseed.php`:

```php
<?php
// Removes the release-check brand that pass-seed.php made, and every Content row under it
// (profile, channels, audiences, voice, pillars, strategies, posts, and what an AI call added).
use Illuminate\Support\Facades\DB;

$brand = DB::table('brands')->where('organization_id', 16)->where('name', 'Release check: a brand whose name is far too long for a phone header')->value('id');
if (!$brand) { echo "NOTHING\n"; return; }
$profiles = DB::table('content_planner_profiles')->where('brand_id', $brand)->pluck('id');
$posts = DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->pluck('id');
DB::table('content_planner_visual_briefs')->whereIn('post_id', $posts)->delete();
DB::table('content_planner_post_variations')->whereIn('post_id', $posts)->delete();
DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->delete();
foreach (['content_planner_ai_generations', 'content_planner_channels', 'content_planner_brand_voices', 'content_planner_audiences', 'content_planner_pillars', 'content_planner_strategies'] as $table) {
    DB::table($table)->whereIn('planner_profile_id', $profiles)->delete();
}
DB::table('content_planner_profiles')->whereIn('id', $profiles)->delete();
DB::table('brands')->where('id', $brand)->delete();
echo "REMOVED brand {$brand}, profiles {$profiles->count()}, posts {$posts->count()}\n";
```

Write `$R2D/tools/pass.mjs` with the Write tool:

```js
// Plan 2D release check (Task 8): one browser pass that writes for real on local org 16, on a temporary brand made by
// pass-seed.php (removed by pass-unseed.php). API on :8012, Vite on :5173 (the feature tree).
//   node pass.mjs          the pass, no AI call
//   AI=1 node pass.mjs     also one real AI post (needs a local AI key)
// Sign-in tokens are minted through tinker into memory, never printed, and deleted when the run ends.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(HERE, '../shots/pass')
const APP = 'http://localhost:5173'
const API = 'http://127.0.0.1:8012/api'
const PHP = 'C:/wamp64/bin/php/php8.4.20/php.exe'
const BACKEND = 'C:/wamp64/www/Hexa-Tech-content'
const MANAGER = 'appointments-tester@example.test'
const TOKEN_NAME = 'content-r2d-pass'
const BRAND_NAME = 'Release check: a brand whose name is far too long for a phone header'
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')

const tinker = code => execFileSync(PHP, ['artisan', 'tinker', `--execute=${code}`], { cwd: BACKEND, encoding: 'utf8' })
const lastLine = out => out.trim().split('\n').pop().trim()
const staffEmail = () => lastLine(tinker("echo DB::table('users')->join('staff','staff.user_id','=','users.id')->where('staff.organization_id',16)->where('staff.role','staff')->where('staff.is_active',true)->value('users.email');"))
const brandId = () => Number(lastLine(tinker(`echo DB::table('brands')->where('organization_id',16)->where('name','${BRAND_NAME}')->whereNull('deleted_at')->value('id');`)))
const seedPosts = () => lastLine(execFileSync(PHP, ['artisan', 'tinker', path.resolve(HERE, '../pass-posts.php')], { cwd: BACKEND, encoding: 'utf8' }))
function mint(email, name = TOKEN_NAME) {
  const token = tinker(`echo App\\Models\\User::where('email', '${email}')->firstOrFail()->createToken('${name}')->plainTextToken;`).match(/\d+\|[A-Za-z0-9]{20,}/)?.[0]
  if (!token) throw new Error(`no token minted for ${email}`)
  return token
}
const dropTokens = () => tinker(`Laravel\\Sanctum\\PersonalAccessToken::whereIn('name', ['${TOKEN_NAME}', '${TOKEN_NAME}-expiry'])->delete();`)
const api = (token, url) => fetch(`${API}/v1/admin/content/${url}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }).then(r => r.json())

const results = []
const consoleErrors = []
function record(name, ok, note = '') { results.push([name, !!ok, note]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`) }
/** Polls until `check` holds (this local server answers in 1–2 s, after its CORS preflight). */
async function until(check, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await check().catch(() => false)) return true; await new Promise(r => setTimeout(r, 250)) }
  return false
}

async function session(browser, token, { brand = null, theme = 'light', lang = 'en', width = 1440, height = 900 } = {}) {
  const me = await (await fetch(`${API}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()
  if (!me?.id) throw new Error('auth/me did not answer with a user')
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', locale: lang === 'ru' ? 'ru-RU' : 'en-GB' })
  // Once per tab: a sign-in that runs out must not be signed back in by the next page load.
  await context.addInitScript(([t, user, look, language, b]) => {
    if (sessionStorage.getItem('r2d-signed-in')) return
    sessionStorage.setItem('r2d-signed-in', '1')
    localStorage.setItem('auth_token', t)
    localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token: t, user, staff: user.staff ?? null }, version: 1 }))
    localStorage.setItem('content:look', look)
    localStorage.setItem('admin_lang', language)
    if (b) localStorage.setItem('content:brand', String(b))
  }, [token, me, JSON.stringify({ theme, rail: 'full' }), lang, brand])
  const page = await context.newPage()
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`${page.url()}: ${m.text()}`) })
  page.on('dialog', d => { void d.accept() })
  return { context, page }
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const at = (page, pathname) => until(async () => new URL(page.url()).pathname === pathname && (await page.locator('[data-content]').count()) > 0)
const section = (page, name) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })
/** Where an editor opened: the dialog when one is open, else the section itself. */
const editor = async (page, name) => ((await page.getByRole('dialog').count()) > 0 ? page.getByRole('dialog') : section(page, name))

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const brand = brandId()
  if (!brand) throw new Error('no release-check brand: run pass-seed.php first')
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--font-render-hinting=none'] })
  const manager = mint(MANAGER)
  const staff = mint(staffEmail())
  try {
    // The way in and the way back, as a manager.
    {
      const { context, page } = await session(browser, manager)
      await page.goto(`${APP}/`)
      const item = page.getByRole('link', { name: 'HexaTech Content' }).first()
      if (!(await until(() => item.isVisible(), 8_000))) await page.getByRole('button', { name: /CRM & Marketing/ }).first().click().catch(() => {})
      await shot(page, 'menu-manager')
      await item.click()
      record('W1 the menu item opens /content', await at(page, '/content'))
      record('W2 a manager\'s Full admin opens the Marketing hub', (await page.getByRole('link', { name: 'Full admin' }).first().getAttribute('href')) === '/marketing')
      await page.goto(`${APP}/marketing?tab=content-planner`)
      record('W3 an old content-planner link lands on /content', await at(page, '/content'), page.url())
      await page.goto(`${APP}/marketing`)
      await page.getByText('Plan and write your social posts with AI, in their own workspace').click()
      record('W4 the Marketing hub tile opens /content', await at(page, '/content'))
      await context.close()
    }
    // The way in and the way back, as staff.
    {
      const { context, page } = await session(browser, staff)
      await page.goto(`${APP}/`)
      record('W5 staff see the menu item', await until(() => page.getByRole('link', { name: 'HexaTech Content' }).first().isVisible()))
      await page.goto(`${APP}/content`)
      record('W6 staff open /content', await at(page, '/content'))
      record('W7 staff\'s Full admin opens the dashboard', (await page.getByRole('link', { name: 'Full admin' }).first().getAttribute('href')) === '/')
      await context.close()
    }
    // Guided setup and Brand writes on the release-check brand, as the manager.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content/brand`)
      await page.getByRole('button', { name: 'Guided setup' }).click()
      await page.getByText('Step 1 of 7').waitFor()
      await shot(page, 'setup-step-1')
      // Brand DNA opens ready to edit (startOpen) with the brand's name; its Save creates the profile and moves on.
      await section(page, 'Brand DNA').getByRole('button', { name: 'Save', exact: true }).click()
      record('B1 Guided setup saves Brand DNA and moves on', await until(() => page.getByText('Step 2 of 7').isVisible()))
      for (let step = 2; step <= 6; step++) {
        await page.getByRole('button', { name: 'Skip this step' }).click()
        await page.getByText(`Step ${step + 1} of 7`).waitFor()
      }
      await page.getByRole('button', { name: 'Finish setup' }).click()
      record('B2 Guided setup finishes on the Brand page', await until(() => section(page, 'Brand DNA').isVisible()))

      await section(page, 'Voice').getByRole('button', { name: 'Edit' }).click()
      await (await editor(page, 'Voice')).getByLabel('Style in a few words').fill('Calm and precise (release check)')
      await (await editor(page, 'Voice')).getByRole('button', { name: 'Save' }).click()
      await until(() => section(page, 'Voice').getByRole('button', { name: 'Edit' }).isVisible())
      record('B3 after Save the keyboard is back on Edit', await page.evaluate(() => document.activeElement?.hasAttribute('data-section-edit') ?? false))
      await page.reload()
      record('B4 a Voice save is still there after a reload', await until(() => page.getByText('Calm and precise (release check)').first().isVisible()))

      await section(page, 'Brand DNA').getByRole('button', { name: 'Edit' }).click()
      await (await editor(page, 'Brand DNA')).getByLabel('Brand name').fill('')
      await (await editor(page, 'Brand DNA')).getByRole('button', { name: 'Save' }).click()
      record('B5 an empty brand name is stopped and said', await until(() => page.getByText('Some fields need attention.').first().isVisible()))
      await shot(page, 'brand-dna-blocked')
      const kept = await api(manager, `brand?brand_id=${brand}`)
      record('B6 the stored brand name is unchanged', kept.profile?.name === BRAND_NAME, kept.profile?.name)
      await (await editor(page, 'Brand DNA')).getByRole('button', { name: 'Cancel' }).click()

      await section(page, 'Audiences').getByRole('button', { name: 'Add audience' }).click()
      await (await editor(page, 'Audiences')).getByLabel('Name', { exact: true }).fill('Release check audience')
      await (await editor(page, 'Audiences')).getByRole('button', { name: 'Save' }).click()
      record('B7 a new audience is saved', await until(async () => (await api(manager, `brand?brand_id=${brand}`)).audiences?.some(a => a.name === 'Release check audience')))

      console.log(seedPosts())
      await page.reload()
      record('B8 the audience says how many posts use it', await until(() => section(page, 'Audiences').getByText('Posts using it: 1').isVisible()))
      await section(page, 'Audiences').getByRole('button', { name: 'Remove' }).click()
      for (let i = 0; i < 2; i++) {
        const ask = page.getByRole('alertdialog').or(page.getByRole('dialog'))
        if (!(await until(() => ask.first().isVisible(), 3_000))) break
        await ask.first().getByRole('button', { name: /Remove/ }).last().click()
      }
      const gone = await until(async () => !(await api(manager, `brand?brand_id=${brand}`)).audiences?.some(a => a.name === 'Release check audience'))
      const stays = (await api(manager, `posts?brand_id=${brand}&q=${encodeURIComponent('Release check timed')}`)).data ?? []
      record('B9 an audience posts use is removed after asking, and its post stays', gone && stays.length === 1 && stays[0].audience_id === null, `${stays.length} post(s)`)

      // The selected card's ring, light (dark below), and the Plan's slots from the channel.
      await page.goto(`${APP}/content`)
      record('P1 the Instagram channel offers slots on the Plan', await until(async () => (await page.locator('[data-slot$="|instagram"]').count()) > 0))
      await page.locator('button[data-post]').first().click()
      const ring = await until(async () => (await page.locator('.c-edge[aria-current="true"]').first().evaluate(el => getComputedStyle(el).boxShadow)).includes('0px 0px 0px 2px'))
      record('P2 the selected card shows its ring', ring)
      await shot(page, 'plan-selected-light')
      await page.keyboard.press('Escape')

      await page.keyboard.press('Control+k')
      await page.keyboard.type('осен')
      record('F1 Find finds a Cyrillic post typed in lower case', await until(() => page.getByText('Осенняя распродажа красок').first().isVisible()))
      await shot(page, 'find-cyrillic')
      await page.keyboard.press('Escape')

      if (process.env.AI === '1') {
        await page.locator('button[data-post]').first().click()
        await page.getByRole('button', { name: 'Write the text' }).click()
        const written = await until(async () => {
          const posts = (await api(manager, `posts?brand_id=${brand}&q=${encodeURIComponent('Release check timed')}`)).data ?? []
          return posts[0] && posts[0].main_copy !== 'Seeded for Plan 2D.'
        }, 180_000)
        record('AI1 one real AI post is written', written)
        await shot(page, 'ai-post')
        await page.keyboard.press('Escape')
      }

      await page.goto(`${APP}/content/brand`)
      const toggle = page.getByRole('switch', { name: 'Posting on Release check Instagram' })
      await toggle.click()
      await until(async () => (await toggle.getAttribute('aria-checked')) === 'false')
      await page.goto(`${APP}/content`)
      await page.locator('[data-content]').waitFor()
      record('P3 a channel switched off takes its slots off the Plan', await until(async () => (await page.locator('[data-slot$="|instagram"]').count()) === 0))
      await context.close()
    }
    // PostgreSQL: Cyrillic in any case, and the order of posts with no day or no time (Task 3).
    {
      const upper = (await api(manager, `find?brand_id=${brand}&q=${encodeURIComponent('ОСЕН')}`)).posts ?? []
      record('F2 Find matches Cyrillic in upper case on PostgreSQL', upper.some(p => p.hook === 'Осенняя распродажа красок'))
      const listed = ((await api(manager, `posts?brand_id=${brand}&q=${encodeURIComponent('Release check')}`)).data ?? []).map(p => p.hook)
      record('O1 Posts: timed before untimed on a day, the post with no day last', JSON.stringify(listed) === JSON.stringify(['Release check timed', 'Release check untimed', 'Release check no day']), listed.join(' / '))
      const found = ((await api(manager, `find?brand_id=${brand}&q=${encodeURIComponent('Release check')}`)).posts ?? []).map(p => p.hook)
      record('O2 Find: the post with no day last', found.at(-1) === 'Release check no day', found.join(' / '))
    }
    // Dark, and a phone with the long brand name.
    {
      const { context, page } = await session(browser, manager, { brand, theme: 'dark' })
      await page.goto(`${APP}/content`)
      await page.locator('button[data-post]').first().click()
      await page.locator('.c-edge[aria-current="true"]').first().waitFor()
      await shot(page, 'plan-selected-dark')
      await context.close()
      for (const [theme, lang, where] of [['light', 'en', '/content'], ['dark', 'en', '/content'], ['light', 'ru', '/content/brand']]) {
        const phone = await session(browser, manager, { brand, theme, lang, width: 390, height: 844 })
        await phone.page.goto(`${APP}${where}`)
        await phone.page.locator('[data-content]').waitFor()
        await phone.page.waitForTimeout(500)
        record(`S1 a phone holds the long brand name, nothing off the screen (${theme}, ${lang}, ${where})`, await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        await shot(phone.page, `phone-long-brand-${theme}-${lang}`)
        await phone.context.close()
      }
    }
    // A sign-in that runs out on a Content page (last: it deletes its own token).
    {
      const expiring = mint(MANAGER, `${TOKEN_NAME}-expiry`)
      const { context, page } = await session(browser, expiring, { brand })
      await page.goto(`${APP}/content/brand`)
      await page.locator('[data-content]').waitFor()
      tinker(`Laravel\\Sanctum\\PersonalAccessToken::where('name', '${TOKEN_NAME}-expiry')->delete();`)
      await page.getByRole('link', { name: 'Posts', exact: true }).first().click()
      record('S2 a sign-in that runs out sends to sign-in with the page to come back to', await until(() => page.url() === `${APP}/login?redirect=%2Fcontent%2Fposts`), page.url())
      await context.close()
    }
  } finally {
    await browser.close()
    dropTokens()
  }
  console.log(`console errors: ${consoleErrors.length}`)
  for (const line of consoleErrors.slice(0, 20)) console.log(`  ${line}`)
  const failed = results.filter(r => !r[1])
  console.log(`${results.length} checks, ${failed.length} failed`)
  process.exitCode = failed.length ? 1 : 0
}

await main()
```

Run it (the API and the branch's Vite from Step 4 are still running):

```bash
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R2D/pass-seed.php" | tail -1
cd "$R2D/tools" && node pass.mjs 2>&1 | tee "$R2D/pass.txt" | tail -30
```

Expected: the jobs count noted (3 at the time of writing: unrelated mails — never run `queue:work` locally); `BRAND <id>`; `POSTS 4 AUDIENCE <id>`; every check `PASS` (W1–W7, B1–B9, P1–P3, F1–F2, O1–O2, S1 three times, S2), `console errors: 0`, `… checks, 0 failed`. With a local AI key, run `AI=1 node pass.mjs` instead after `pass-unseed.php` and `pass-seed.php` again (the pass needs a brand with no profile), and expect `AI1` to pass too; without one, write `Task 8: note: no local AI key — no real AI call in this pass (Plan B made one real AI post and one real AI week)`.

A `FAIL`: look at the screenshot and the page before deciding. A selector that does not match a real page (a button named differently, an editor that opens elsewhere) is the script's fault: correct the script and write `Task 8: Ruling: <check> selector <old> → <new> — <what the page has>`. A page that does the wrong thing is a defect: fix it test-first in the branch, commit, run `pass-unseed.php`, `pass-seed.php` and the pass again. A console error is a defect unless it is the browser's own message for a refused request the check provoked (the 401 in S2); ledger which.

- [ ] **Step 6: Lighthouse accessibility on the Plan, the panel and Brand (spec §8.3)**

The audit runs in the chrome-devtools MCP's browser. The sign-in reaches it through a local server, so the token never passes through the conversation. Write `$R2D/tools/token-server.mjs` with the Write tool:

```js
// Hands one sign-in to the Lighthouse browser (the chrome-devtools MCP) without the token passing through the conversation.
//   node token-server.mjs        mint a manager token in memory; serve {token, brand} at http://127.0.0.1:8099/session to http://localhost:5173 only
//   node token-server.mjs drop   delete the tokens it minted
import { execFileSync } from 'node:child_process'
import http from 'node:http'

const PHP = 'C:/wamp64/bin/php/php8.4.20/php.exe'
const BACKEND = 'C:/wamp64/www/Hexa-Tech-content'
const NAME = 'content-r2d-lighthouse'
const BRAND_NAME = 'Release check: a brand whose name is far too long for a phone header'
const tinker = code => execFileSync(PHP, ['artisan', 'tinker', `--execute=${code}`], { cwd: BACKEND, encoding: 'utf8' })

if (process.argv[2] === 'drop') {
  tinker(`Laravel\\Sanctum\\PersonalAccessToken::where('name', '${NAME}')->delete();`)
  console.log('dropped')
} else {
  const token = tinker(`echo App\\Models\\User::where('email', 'appointments-tester@example.test')->firstOrFail()->createToken('${NAME}')->plainTextToken;`).match(/\d+\|[A-Za-z0-9]{20,}/)?.[0]
  const brand = Number(tinker(`echo DB::table('brands')->where('organization_id', 16)->where('name', '${BRAND_NAME}')->value('id');`).trim().split('\n').pop())
  if (!token || !brand) throw new Error('no token, or no release-check brand')
  http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
    if (req.url !== '/session') { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ token, brand }))
  }).listen(8099, '127.0.0.1', () => console.log('serving on 127.0.0.1:8099'))
}
```

The release-check brand from Step 5 is still there (set up, with posts). Start `node "$R2D/tools/token-server.mjs"` in the background (it prints only `serving on 127.0.0.1:8099`). Load the chrome-devtools tools with ToolSearch (`select:` the `new_page`, `navigate_page`, `evaluate_script`, `take_snapshot`, `click`, `wait_for` and `lighthouse_audit` tools of `mcp__plugin_chrome-devtools-mcp_chrome-devtools`), then:

1. `new_page` at `http://localhost:5173/login`; `evaluate_script` with this function (it answers only "signed in"):

```js
async () => {
  const { token, brand } = await (await fetch('http://127.0.0.1:8099/session')).json()
  const me = await (await fetch('http://127.0.0.1:8012/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()
  localStorage.setItem('auth_token', token)
  localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token, user: me, staff: me.staff ?? null }, version: 1 }))
  localStorage.setItem('content:brand', String(brand))
  return me.id ? 'signed in' : 'not signed in'
}
```

2. `navigate_page` to `http://localhost:5173/content`, `wait_for` the text `New post`, then `lighthouse_audit` (desktop; accessibility is the category that counts).
3. `take_snapshot`, `click` the first post card (a `button` carrying the post's spoken name), and audit again in the tool's snapshot mode (the page as it is, panel open). If the tool offers no snapshot mode, write `Task 8: note: Lighthouse has no snapshot mode here — the panel is covered by its component tests and the Plan audit` and go on.
4. `navigate_page` to `http://localhost:5173/content/brand`, `wait_for` `Brand DNA`, audit.

Then stop the token server (TaskStop) and run `node "$R2D/tools/token-server.mjs" drop` → `dropped`.

Write `$R2D/lighthouse.md`: per page the accessibility score and every failing audit with its elements. Expected: no failing audit the portal can fix. Each one that it can is a defect: fix it test-first (a component test that renders the element and checks the missing name, role or contrast token), commit, and audit that page again. One the portal cannot fix (a browser extension, the dev server's own overlay) gets `Task 8: Ruling: <audit> — <why it is not the portal's> — <cost if wrong>`. No conformance is claimed (spec §8.3).

- [ ] **Step 7: Eyes**

Open every screenshot in `$R2D/shots/pass/` with the Read tool and write one line each in `$R2D/eyes.md`:
- `menu-manager.png`: "HexaTech Content" first in CRM & Marketing, with its pen icon, nothing else in the menu moved.
- `setup-step-1.png`: Guided setup's first step, the long name in the Brand name field.
- `brand-dna-blocked.png`: the name field marked and "Some fields need attention." beside Save.
- `plan-selected-light.png`, `plan-selected-dark.png`: the selected card's accent ring visible in both themes; the panel open beside it.
- `find-cyrillic.png`: the Cyrillic post in Find's results.
- `phone-long-brand-light-en.png`, `phone-long-brand-dark-en.png`: the long name cut with an ellipsis inside the header, nothing pushed off the screen.
- `phone-long-brand-light-ru.png`: Brand in Russian on a phone — the longer Russian words (section titles, field names, buttons) wrap or fit, nothing cut mid-word or pushed off.
- `ai-post.png` (with `AI=1` only): the written text in the panel.

Anything that looks wrong to a person is a defect: fix it (test-first where a test can hold it), take the screenshot again, and say so in `eyes.md`.

- [ ] **Step 8: The suites again if anything was fixed**

If Steps 2–7 committed any fix, run Step 1 again and the PHP paths those fixes touch (`"$R2D/php-all.sh" <paths>` with `OUT=final-php-fixes.txt`). Expected: as in Steps 1–2.

- [ ] **Step 9: Ledger**

Append to `$R2D/progress.md`: `Task 8: note: vitest …; PHP <n> paths green (<pre-existing failures, if any>); build check clean; Appointments 46 screens 0 differ, keys same; Lighthouse <scores Plan / panel / Brand>; pass <n> checks 0 failed (AI: yes|no); eyes ok`.

- [ ] **Step 10: Clean up**

```bash
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R2D/pass-unseed.php" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo Laravel\Sanctum\PersonalAccessToken::where('name', 'like', 'content-r2d-%')->count();" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" | tail -1
```

Expected: `REMOVED brand <id>, profiles 1, posts 4` (more posts if `AI=1` wrote variations: they are removed too); tokens `0`; jobs as noted before the pass. A job the pass added (Guided setup's finish may queue one): read its `payload` display name; if it belongs to the release-check brand, delete that row by id (local database, made by this pass) and ledger it.

Stop the API and the Vite tasks (TaskStop); `netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'` must print nothing (a leftover node PID: check its command line, then `taskkill //PID <pid> //F`). Remove the base worktree — junction first, in PowerShell:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove ../Hexa-Tech-content-base && git worktree list | grep -c content-base; test -d frontend/node_modules/react && echo MODULES-KEPT; git status --short
```

Expected: `0`; `MODULES-KEPT` (the branch's own `node_modules` untouched by the junction's removal); `git status --short` prints nothing.

- [ ] **Step 11: Record the task**

```bash
bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/executing-plans/scripts/task-done docs/superpowers/plans/2026-10-15-content-workspace-r2d-release.md 8 <BASE> -- bash -c 'cd frontend && npx tsc -b && npx vitest run src/content src/workspace src/appointments src/pages/hubs src/components'
```

---

### Task 9: The deploy (source-patch recipe), after the owner's "yes, deploy"

Merging to `main` is a production deploy: Laravel Cloud runs `migrate --force` and rebuilds the SPA. This task prepares the artifact in its own worktree, proves it, then **stops and asks the owner**. Nothing is pushed without the owner's explicit "yes, deploy" in this conversation; an earlier yes (release 1's) does not carry over.

Run this task after the final whole-branch review and its fix pass, so the feature tip it ships is final.

**Files:**
- Temporary: worktree `C:\wamp64\www\Hexa-Tech-deploy-content-r2` on branch `deploy/content-r2` (from `origin/main`), with a copied `vendor`, the local `.env` and a `frontend/node_modules` junction; removed in Step 9 (the branch is kept).
- Ledger: `$R2D/deploy-list.txt`, `$R2D/deploy-php.txt`, `$R2D/deploy-vitest.txt`, `$R2D/deploy-build.txt`, `$R2D/postdeploy.txt`.

**Interfaces:**
- Consumes: the feature tip after the review (`TIP`), the last deployed feature tip `ec0eaf085`, prod main `b93b9db36`, `$R2D/php-all.sh` (Task 8).

- [ ] **Step 1: Fix the inputs**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git status --short && git fetch -q origin
TIP=$(git rev-parse HEAD); echo "TIP $TIP"; git log -1 --format='%h %s' origin/main
git diff --stat ec0eaf085 origin/main -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: a clean status; origin/main is `b93b9db36`. The last line prints nothing when production's source is exactly the last deployed feature tip. If origin/main has moved on (another deploy since), the line lists what changed there: Step 3's guard then proves none of it touches this release's files; ledger the new origin/main.

Write `Task 9: note: TIP <sha>; origin/main <sha>` to the ledger.

- [ ] **Step 2: The deploy worktree**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree add ../Hexa-Tech-deploy-content-r2 -B deploy/content-r2 origin/main
cp .env ../Hexa-Tech-deploy-content-r2/.env
```

In PowerShell (robocopy, never a junction for `vendor`: PHPUnit would test the other tree; robocopy's exit codes 0–7 mean success):

```powershell
robocopy C:\wamp64\www\Hexa-Tech-content\vendor C:\wamp64\www\Hexa-Tech-deploy-content-r2\vendor /E /NFL /NDL /NJH /NJS /NP; if ($LASTEXITCODE -lt 8) { 'VENDOR-OK' }
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-deploy-content-r2\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

Expected: `VENDOR-OK`; the junction made. On `ENOSPC` (or robocopy's "not enough space"), stop and report it; delete nothing to make room.

- [ ] **Step 3: The change list and its guards**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git diff --no-renames --name-status ec0eaf085 "$TIP" > "$R2D/deploy-list.txt"; wc -l < "$R2D/deploy-list.txt"
cut -f2 "$R2D/deploy-list.txt" | grep -vE '^(app/|bootstrap/app\.php$|routes/api\.php$|tests/|frontend/src/|docs/)'; echo "(nothing above: every path is in the allowlist)"
cut -f2 "$R2D/deploy-list.txt" | grep -E '^(database/|frontend/dist/|public/spa/|resources/spa-shell/|config/|composer\.|frontend/package)'; echo "(nothing above: no migration, no built file, no dependency)"
git diff --name-only b93b9db36 origin/main -- $(cut -f2 "$R2D/deploy-list.txt") ; echo "(nothing above: production has not changed any file of this release since b93b9db36)"
cut -f1 "$R2D/deploy-list.txt" | sort | uniq -c
```

Expected: about 240 lines (188 after Plan C, plus Plan D's new, changed and deleted paths); the three guards print nothing but their notes; the status count shows `A`, `M` and `D` (Task 2's deletions: the six controllers, `pages/ContentPlanner.tsx` and `components/ContentPlanner/*`). Any path outside the allowlist: stop and find out why before going on (another feature's commit on this branch must not ride the deploy); ledger the answer.

- [ ] **Step 4: Apply, check parity, commit**

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r2
awk -F'\t' '$1 != "D" {print $2}' "$R2D/deploy-list.txt" > "$R2D/deploy-am.txt"
awk -F'\t' '$1 == "D" {print $2}' "$R2D/deploy-list.txt" > "$R2D/deploy-d.txt"
xargs -a "$R2D/deploy-am.txt" git checkout "$TIP" --
[ -s "$R2D/deploy-d.txt" ] && xargs -a "$R2D/deploy-d.txt" git rm -q --
git diff --cached --stat | tail -1
git diff --cached "$TIP" -- $(cut -f2 "$R2D/deploy-list.txt") | head -5; echo "(nothing above: parity with the feature tip, deletions included)"
git diff "$TIP" --stat -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: the cached stat counts every line of the list (`git checkout <tip> -- <file>` stages what it writes, and `git rm` stages the deletion); the parity diff prints nothing; when origin/main was still `b93b9db36`, the last line prints nothing too (whole-tree parity with the feature tip outside the built files, as in release 1). `git checkout <tip> -- <file>` never deletes (overlay mode): that is why the deletions go through `git rm`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r2 && git commit -q -F - <<'EOF'
HexaTech Content, release 2: the portal, its server, the way in from the full admin, the old planner retired

The Content portal at /content (Plan, Posts, Strategy, Brand, guided and
quick setup), its server group under /v1/admin/content, the menu item and
the Marketing hub tile, the old address redirected, a sign-in that runs out
coming back to the page; the old AI Content Planner's controllers, routes,
access key and screens removed and its help rewritten. No migration.
Source of feature/content-workspace at TIP_SHA (since ec0eaf085).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='%h %s'
```

(Before committing, replace `TIP_SHA` in the message with the short sha of `$TIP`, by editing the command.)

- [ ] **Step 5: Every suite on the artifact**

The PHP suites, by folder, on the deploy worktree (`ROOT`), in batches of about ten per call:

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r2 && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R2D/deploy-paths.txt"; wc -l < "$R2D/deploy-paths.txt"
rm -f "$R2D/deploy-php.txt"
ROOT=/c/wamp64/www/Hexa-Tech-deploy-content-r2 OUT=deploy-php.txt "$R2D/php-all.sh" $(sed -n 1,10p "$R2D/deploy-paths.txt")     # then 11,20p … to the end
grep -v "exit 0" "$R2D/deploy-php.txt"; echo "(nothing above: every path green)"
```

The frontend, and the build:

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r2/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R2D/deploy-vitest.txt" 2>&1; tail -5 "$R2D/deploy-vitest.txt"; grep -E '^ FAIL ' "$R2D/deploy-vitest.txt" | sort -u
npm run build > "$R2D/deploy-build.txt" 2>&1; echo "build exit $?"; tail -5 "$R2D/deploy-build.txt"
cd .. && git status --short | cut -c4- | cut -d/ -f1-2 | sort | uniq -c
```

Expected: every PHP path `exit 0` (the same paths as Task 8's run, the same results; a pre-existing failure Task 8 recorded may repeat, nothing new); `TSC-CLEAN`; vitest `3 failed` only in `src/lib/plannerMeta.test.ts`; `build exit 0`; the status shows changes only under `frontend/dist`, `public/spa` and `resources/spa-shell`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r2 && git add frontend/dist public/spa resources/spa-shell && git commit -q -m "Build the SPA for HexaTech Content release 2" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git status --short && git log -3 --format='%h %s'
```

Expected: a clean status; the build commit on top of the source commit, on top of origin/main.

- [ ] **Step 6: STOP — ask the owner**

Write `Task 9: note: artifact ready — deploy/content-r2 <sha> (source <sha> + build <sha>), <n> files (A <a>, M <m>, D <d>), PHP <n> paths green, vitest <n> passed + 3 baseline, build ok` to the ledger, then ask the owner, with the facts in plain words:

- what ships: the HexaTech Content portal, the way in, the old Content Planner removed, the fixes; no migration; profiles, strategies, posts and images carry over;
- what changes for people: the Marketing hub's "AI Content Planner" tab becomes the "HexaTech Content" tile; admin tabs left open across the deploy must be reloaded;
- the checks: Task 8's results (suites, `46 screens, 0 differ`, Lighthouse, the browser pass) and Step 5's;
- the question: **"Shall I deploy? Reply 'yes, deploy' to push it to production."**

Wait for the answer. Anything other than a clear yes: do not push; keep the deploy worktree, and do what the owner asks.

- [ ] **Step 7: Push (only after "yes, deploy")**

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r2 && git fetch -q origin && git log -1 --format='%h' origin/main
OLD=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "OLD $OLD" | tee "$R2D/postdeploy.txt"
for u in /api/v1/admin/content/bootstrap /api/v1/admin/content-planner/profile; do printf 'before %s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/json' "https://app.hexa-tech.uk$u")"; done | tee -a "$R2D/postdeploy.txt"
```

Expected: origin/main is still the commit the deploy branch was cut from (if it moved, stop: rebase nothing, tell the owner and start again from Step 1); `OLD /spa/assets/index-….js`; `before /api/v1/admin/content/bootstrap 404` and `before /api/v1/admin/content-planner/profile 401`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r2 && git push origin deploy/content-r2:main 2>&1 | tail -2; date -u +%FT%TZ
```

Then wait for Laravel Cloud's new bundle (Bash, `run_in_background`, it re-invokes when it exits; about 2–3 minutes in release 1):

```bash
OLD='<the OLD path from above>'; for i in $(seq 1 60); do NEW=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); [ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && { echo "NEW $NEW at $(date -u +%T)"; exit 0; }; sleep 15; done; echo "STILL OLD after 15 minutes"; exit 1
```

Expected: `NEW /spa/assets/index-….js`. "STILL OLD": look at the Laravel Cloud deploy log with the owner; do not push again.

- [ ] **Step 8: Verify by content (spec §10)**

```bash
B=https://app.hexa-tech.uk; NEW=$(curl -s $B/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "NEW $NEW" | tee -a "$R2D/postdeploy.txt"
curl -s "$B$NEW" -o "$R2D/live-index.js"; printf 'index data-content/data-appointments: %s\n' "$(grep -c 'data-content\|data-appointments' "$R2D/live-index.js")" | tee -a "$R2D/postdeploy.txt"
CA=$(grep -o 'ContentApp-[A-Za-z0-9_-]*\.js' "$R2D/live-index.js" | head -1); AA=$(grep -o 'AppointmentsApp-[A-Za-z0-9_-]*\.js' "$R2D/live-index.js" | head -1); echo "chunks $CA $AA" | tee -a "$R2D/postdeploy.txt"
curl -s "$B/spa/assets/$CA" -o "$R2D/live-content.js"; for w in 'Fill with AI' 'What you saved is safe' 'data-content'; do printf 'ContentApp has "%s": %s\n' "$w" "$(grep -c "$w" "$R2D/live-content.js")"; done | tee -a "$R2D/postdeploy.txt"
curl -s "$B/spa/assets/$AA" | grep -c 'data-appointments' | sed 's/^/AppointmentsApp has data-appointments: /' | tee -a "$R2D/postdeploy.txt"
grep -c 'HexaTech Content' "$R2D/live-index.js" | sed 's/^/index has the menu label: /' | tee -a "$R2D/postdeploy.txt"
for u in /api/v1/admin/content/bootstrap /api/v1/admin/content-planner/profile; do printf 'after %s %s %s\n' "$u" "$(curl -s -o "$R2D/body.json" -w '%{http_code}' -H 'Accept: application/json' "$B$u")" "$(head -c 80 "$R2D/body.json")"; done | tee -a "$R2D/postdeploy.txt"
for p in / /content /appointments; do printf 'page %s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done | tee -a "$R2D/postdeploy.txt"
rm -f "$R2D/live-index.js" "$R2D/live-content.js" "$R2D/body.json"
```

Expected: `index data-content/data-appointments: 0`; both chunk names found; the ContentApp chunk has each of the three (counts ≥ 1); `AppointmentsApp has data-appointments:` ≥ 1; the index has the menu label (≥ 1); `after /api/v1/admin/content/bootstrap 401 {"message":"Unauthenticated."…` (it answered 404 before) and `after /api/v1/admin/content-planner/profile 404` (it answered 401 before); the three pages `200`. Any other answer: tell the owner at once, with the line.

- [ ] **Step 9: Clean up and record**

In PowerShell, the junction first, then the worktree:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-deploy-content-r2\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove --force ../Hexa-Tech-deploy-content-r2 && git worktree list | grep -c deploy-content-r2; test -d frontend/node_modules/react && echo MODULES-KEPT
```

Expected: `0`; `MODULES-KEPT`. (`--force` because the copied `vendor` and `.env` are untracked files in it; the branch `deploy/content-r2` stays.)

Ledger: `Task 9: complete — LIVE as prod main <sha> (source <sha> + build <sha>; <n> files incl. <d> deletions) pushed <time>Z, new index live <time>Z (<index>, <ContentApp chunk>); verified by content (postdeploy.txt): …`.

Update the memory file `content-workspace.md` and its line in `MEMORY.md`: release 2 LIVE as prod main `<sha>` (date), verified by content; the owner's checks still open (open `/content` as a manager and as staff, generate one week on a real brand, Settings → AI Usage `content` line, reload old tabs); the deferred items left for later (the list under "Deferred items in scope", plus the review's deferred minors).

Tell the owner it is live, with the verification lines and their four checks from the runbook's "After the deploy".
