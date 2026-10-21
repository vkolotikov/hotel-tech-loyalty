# Content Release 7a — the new look (frame, Plan, post panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HexaTech Content look and lay out like the owner's mockup — navy frame with card side buttons and bottom
menus, a brand breadcrumb, page headers with New post, the Plan's numbers line, chips and grouped control, the new month
cards, and the post panel as a right-hand column with tabs, the large hook, a text toolbar and a Save draft footer.

**Architecture:** Content keeps the shared `WorkspaceShell`; the shell gains opt-in options (`variant`, `footer`,
`phoneMenu`, `crumbs`) that only Content passes, and Content sets its own palette under `[data-content]`, so Appointments
renders exactly as today (proved by the 46-screen pixel comparison). The Plan and the panel are restyled and re-arranged
in place; their behaviour (moves, drag and drop, Undo, Generate, fills, approvals, AI tools, versions, repeat, the
unsaved-changes guard) is untouched. One additive server field (`logo_url` in the bootstrap's brands).

**Tech Stack:** React 19, TypeScript, Tailwind (Atelier tokens), TanStack Query v5, react-i18next (five bundles), vitest in
node with `renderToStaticMarkup`; Laravel 13 / PHP 8.4 for the one bootstrap field.

**Spec:** `docs/superpowers/specs/2026-10-21-content-release-7-design.md` (approved 2026-10-21: "please proceed with
development"). Release 7b (the writing view, spec §8) gets its own plan after 7a ships.

**Execution:** native (the owner's standing choice; the owner asked to proceed without a plan-review stop). Workspace
`.superpowers/sdd/2026-10-21-content-release-7a/`, tools copied from the 6-fixes archive (php.sh, vt.sh, words.mjs,
reword.mjs, tools/ pixels.mjs, pass/lh/token-server, pass-seed/unseed). Component steps give the structure, the
attributes and the classes that matter, and every test in full; the executor writes the JSX to them (author-executed
plan: ruling recorded in the ledger).

## Global Constraints

- PHP `/c/wamp64/bin/php/php8.4.20/php.exe`; never a bare `artisan test` — by path; read the `Tests:` line.
- Frontend `cd frontend && npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing); lint baseline 1 (App.tsx).
- A `.tsx` file exports only components (react-refresh lint): helpers live in `*Math.ts` files.
- Words: every new key in all five bundles through `words.mjs` (adds only) or `reword.mjs` (changes); English fallbacks in code
  equal the en bundle; counts only after a colon or in brackets (no plural forms).
- Appointments renders unchanged: `WorkspaceShell` with none of the new options gives today's markup; pixel comparison 46/0.
- Tokens: every text pair ≥ 4.5:1, lines and marks ≥ 3:1, in both themes (contrast tests pin them).
- Dark palette (spec §3.1): side 28 35 44 · side-2 35 44 58 · canvas 32 40 54 · surface 36 44 58 · surface-2 41 48 63 ·
  border 51 62 78 · text 232 238 244 · text-2 150 165 185 · side-text 232 238 244 · side-text-2 150 165 185 ·
  card-text-2 170 184 202 · ai 109 93 214 with white ink.
- Light palette: canvas 244 246 249 · surface 255 255 255 · surface-2 238 242 247 · border 221 227 234 · text 27 36 48 ·
  text-2 84 98 114; the side panel stays navy (side 28 35 44, side-2 35 44 58, side texts as Dark).
- Card fill: accent mixed 18 % into surface-2 (Dark), 10 % into surface (Light), lowered in 2-point steps while `--a-text`
  or the card's secondary text would read under 4.5:1.
- Breakpoints: side panel from 1024 px (lg, as today); the panel docks from 1280 px (xl); slides over at 640–1279; full screen under 640.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A brand with a very long name and no logo, at 1024–1279 px: the breadcrumb truncates the name and never pushes Find or
   the bell off the bar; the chip shows up to two initials. (Test in Task 6.)
2. A pale brand colour (#f5c518 gold): the current side button, the open post's card and New post use the dark ink; card
   text stays ≥ 4.5:1 because the card mix is lowered. (Tests in Tasks 1 and 3.)
3. The panel docked at exactly 1280 px in Week view: the page reserves the panel's width and the calendar scrolls inside its
   box, never the page sideways. (Test in Task 10.)
4. The brand switched while a post is open: the panel asks first (today's guard) and the column closes with it, the page
   getting its width back. (Test in Task 10.)
5. Keyboard only: menus open with Enter/Space, move with the arrows, close with Esc returning the focus to their button;
   Esc inside an open menu in the panel closes the menu, not the panel. (Tests in Tasks 4, 10 and 11.)

---

### Task 1: Content's palette and the accent on navy

**Files:**
- Modify: `frontend/src/content/theme/content.css` (palette blocks, `--c-card-text-2`, `--c-ai`, `--c-ai-ink`)
- Modify: `frontend/src/workspace/theme/accent.ts` (`CONTENT_SURFACES`, optional `surfaces` argument, `cardFill`, `accentStyle` card)
- Modify: `frontend/src/content/ContentShell.tsx` (pass Content's surfaces; `--c-card` in the style)
- Test: `frontend/src/content/theme/contentContrast.test.ts` (new), `frontend/src/workspace/theme/accent.test.ts`

**Interfaces:**
- Produces: `CONTENT_SURFACES: Record<ThemeName, { canvas: string; surface: string; surface2: string; side: string }>`;
  `accentTokens(brand, theme, surfaces?: typeof SURFACES['light'])` (unchanged result without `surfaces`);
  `cardFill(accent: string, theme: ThemeName): string` (hex); `accentStyle(t, card?: string)` adds `--c-card` when given.
  CSS tokens `--c-card` (inline), `--c-card-text-2`, `--c-ai`, `--c-ai-ink` under `[data-content]`.

- [ ] **Step 1: Failing tests** — `contentContrast.test.ts` reads `content.css` blocks `[data-content]` and
  `[data-content][data-theme="dark"]` (same `block()` reader as `workspace/theme/contrast.test.ts`, matching `--a-` and `--c-`):

```ts
const PAIRS: [string, string][] = [['a-text','a-canvas'],['a-text','a-surface'],['a-text','a-surface-2'],['a-text-2','a-canvas'],
  ['a-text-2','a-surface'],['a-text-2','a-surface-2'],['a-side-text','a-side'],['a-side-text','a-side-2'],['a-side-text-2','a-side'],['a-side-text-2','a-side-2']]
for (const theme of ['light', 'dark'] as const) {
  it(`reads every Content text pair at 4.5:1 or better (${theme})`, () => {
    const t = tokens(theme)
    for (const [fg, bg] of PAIRS) expect(ratio(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  })
  it(`keeps the mockup's navy and the side panel navy in both themes (${theme})`, () => {
    expect(tokens(theme)['a-side']).toEqual([28, 35, 44])
    if (theme === 'dark') expect(tokens('dark')['a-surface-2']).toEqual([41, 48, 63])
  })
  it(`reads card text on the card fill for the fallback, a dark and a pale brand (${theme})`, () => {
    for (const brand of ['#3b82f6', '#1e3a8a', '#f5c518', '#ffffff', '#000000']) {
      const card = cardFill(accentTokens(brand, theme, CONTENT_SURFACES[theme]).accent, theme)
      expect(ratio(tokens(theme)['a-text'], rgbOf(card))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(tokens(theme)[theme === 'dark' ? 'c-card-text-2' : 'a-text-2'], rgbOf(card))).toBeGreaterThanOrEqual(4.5)
    }
  })
}
it('gives Generate and AI actions a violet with white ink at 4.5:1 or better', () => {
  expect(ratio(tokens('dark')['c-ai-ink'], tokens('dark')['c-ai'])).toBeGreaterThanOrEqual(4.5)
})
it('makes the fallback blue card about the mockup\'s #2c3f60 in Dark', () => {
  expect(cardFill('#3b82f6', 'dark')).toBe('#2c3f60')
})
```

  `accent.test.ts` adds: `accentTokens('#3b82f6','dark')` deep-equals today's (snapshot of the current object written in the
  test); with `CONTENT_SURFACES.dark` the `text` still reads ≥ 4.6:1 on `#202836`, `#242c3a`, `#29303f`; `accentStyle(t, '#2c3f60')['--c-card']` is `'44 63 96'`.
- [ ] **Step 2:** `vt.sh src/content/theme src/workspace/theme` — Expected: FAIL (no blocks / no `cardFill`).
- [ ] **Step 3: Implement**
  - `content.css`: in `[data-content]` the light set (spec values) plus `--c-card-text-2: 84 98 114; --c-ai: 109 93 214; --c-ai-ink: 255 255 255;`
    and the navy side tokens; in `[data-content][data-theme="dark"]` the dark set plus `--c-card-text-2: 170 184 202`.
    The existing status tones stay; if the status contrast test (`contentCss.test.ts`) fails on the navy surface-2, lighten the
    failing dark tone toward white in 5 % steps until it holds and record the new value in the ledger.
  - `accent.ts`:

```ts
export const CONTENT_SURFACES: Record<ThemeName, { canvas: string; surface: string; surface2: string; side: string }> = {
  light: { canvas: '#f4f6f9', surface: '#ffffff', surface2: '#eef2f7', side: '#1c232c' },
  dark: { canvas: '#202836', surface: '#242c3a', surface2: '#29303f', side: '#1c232c' },
}
const CARD_TEXT: Record<ThemeName, { text: string; text2: string }> = {
  light: { text: '#1b2430', text2: '#546272' }, dark: { text: '#e8eef4', text2: '#aab8ca' },
}
/** A post card's fill (spec §3.1): the accent mixed into the card's ground, less while its text would read under 4.5:1. */
export function cardFill(accent: string, theme: ThemeName): string {
  const ground = theme === 'dark' ? CONTENT_SURFACES.dark.surface2 : CONTENT_SURFACES.light.surface
  for (let pct = theme === 'dark' ? 18 : 10; pct >= 0; pct -= 2) {
    const card = mix(ground, normalise(accent), pct / 100)
    if (contrast(CARD_TEXT[theme].text, card) >= 4.5 && contrast(CARD_TEXT[theme].text2, card) >= 4.5) return card
  }
  return ground
}
```

    and `accentTokens(brand, theme, surfaces = SURFACES[theme])` using `surfaces` in place of `SURFACES[theme]`;
    `accentStyle(t, card?)` spreads `card ? { '--c-card': triplet(card) } : {}`.
  - `ContentShell.tsx`: `accentTokens(…, look.resolved, CONTENT_SURFACES[look.resolved])` and pass
    `card={cardFill(accent.accent, look.resolved)}` to `WorkspaceShell` (new optional prop `card?: string` forwarded to
    `accentStyle`; Appointments passes none).
- [ ] **Step 4:** the same run — Expected: PASS; then `vt.sh src/workspace src/appointments` — PASS (Appointments unchanged).
- [ ] **Step 5: Commit** "Content: the mockup's navy palette, the accent and post cards worked out on it".

### Task 2: The brand's logo in the bootstrap

**Files:** Modify `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php` (lines 41–42),
`frontend/src/content/lib/types.ts` (`BrandRef`); Test `tests/Feature/Content/BootstrapTest.php`.

**Interfaces:** Produces `BrandRef { id: number; name: string; logo_url: string | null }`.

- [ ] **Step 1: Failing test** — in `BootstrapTest.php` set the default brand's `logo_url` to `https://cdn.example/logo.png`
  and expect `brands` `[['id' => …, 'name' => …, 'logo_url' => 'https://cdn.example/logo.png']]` and `brand.logo_url` the
  same; a brand without one gives `null`. Update the three existing `assertJsonPath('brands', …)` lines to carry
  `'logo_url' => null`.
- [ ] **Step 2:** `php.sh tests/Feature/Content/BootstrapTest.php` — Expected: FAIL.
- [ ] **Step 3:** both maps add `'logo_url' => $b->logo_url ?: null` (and `$brand->logo_url` for `brand`); `BrandRef` gains
  `logo_url: string | null`; fix the test fixtures `brandTesting.ts`/`bootFor` brands with `logo_url: null`.
- [ ] **Step 4:** the PHP file + `npx tsc -b` + `vt.sh src/content` — PASS. **Step 5: Commit** "Content bootstrap: each brand's logo".

### Task 3: The shared frame's opt-in options (cards, footer, phone menu, crumbs)

**Files:** Modify `frontend/src/workspace/WorkspaceShell.tsx`; Create `frontend/src/workspace/ui/LanguageSelect.tsx`
(the `language()` helper moved out, same markup); Test `frontend/src/workspace/WorkspaceShell.test.tsx`.

**Interfaces:** Produces `WorkspaceShell` props `variant?: 'cards'`, `footer?: ReactNode` (replaces the side panel's
`mt-auto` block), `phoneMenu?: ReactNode` (replaces the phone menu's contents), `crumbs?: ReactNode` (drawn at the top
bar's start, before `header`), `card?: string` (Task 1), `railLabel?: string` (the "WORKSPACE" label). `LanguageSelect({ className })`.

- [ ] **Step 1: Failing tests** (WorkspaceShell.test.tsx, its existing `render()` helper):

```tsx
it('draws today\'s frame when no option is given (Appointments)', () => {
  const html = render()
  expect(html).not.toContain('data-rail-variant="cards"')
  expect(html).toContain('w-64')               // today's rail width
  expect(html).toContain('Collapse menu')     // today's bottom block
})
it('draws the side buttons as cards with the label above them when asked', () => {
  const html = render({ variant: 'cards', railLabel: 'Workspace' })
  expect(html).toContain('data-rail-variant="cards"')
  expect(html).toContain('w-60')
  expect(html).toMatch(/<p[^>]*>Workspace<\/p>/)
  expect(html).toMatch(/aria-current="page"[^>]*class="[^"]*bg-a-accent[^"]*text-a-accent-ink/)
})
it('puts a workspace\'s own footer, phone menu and breadcrumb in place of today\'s', () => {
  const html = render({ footer: <div data-own-footer="" />, phoneMenu: <div data-own-phone="" />, crumbs: <nav data-crumbs="" /> })
  expect(html).toContain('data-own-footer=""')
  expect(html).toContain('data-own-phone=""')
  expect(html.indexOf('data-crumbs=""')).toBeLessThan(html.indexOf('data-header-own'))
  expect(html).not.toContain('Collapse menu')
})
```

  (`render(extra)` spreads `extra` into the props; its existing header gets `data-header-own=""`.)
- [ ] **Step 2:** `vt.sh src/workspace/WorkspaceShell.test.tsx` — FAIL.
- [ ] **Step 3: Implement** — `variant === 'cards'`: `data-rail-variant="cards"` on the aside, `w-60` (slim stays 76 px),
  the label `<p className="px-2 font-a-mono text-[11px] uppercase tracking-[0.14em] text-a-side-text-2">{railLabel}</p>`
  above the nav when not slim, each NavLink `min-h-11 rounded-[10px] border` with idle `border-a-side-2 bg-a-side-2 text-a-side-text-2
  hover:text-a-side-text` and current `border-transparent bg-gradient-to-br from-a-accent to-a-accent-deep text-a-accent-ink`
  (no rail dot in this variant). `footer ?? <today's block>`; `phoneMenu ?? <today's phone menu contents>`; `crumbs`
  before `header`. Move `language()` into `LanguageSelect` with identical markup and use it in both places.
- [ ] **Step 4:** `vt.sh src/workspace src/appointments` — PASS. **Step 5: Commit** "Workspace frame: opt-in card buttons, footer, phone menu and breadcrumb".

### Task 4: Content's side panel foot — Settings, Help & resources, the person

**Files:** Create `frontend/src/content/shell/SideMenu.tsx` (a menu button that opens a list upward), 
`frontend/src/content/shell/FrameFooter.tsx` (the three rows and the phone menu's three groups),
`frontend/src/content/shell/shellMath.ts` (`roleLabelKey`, `menuKey`); Modify `ContentShell.tsx`;
Test `frontend/src/content/shell/frameFooter.test.tsx` (new), `frontend/src/content/shell/shellMath.test.ts` (new).

**Interfaces:**
- Consumes: `WorkspaceShell` `footer`, `phoneMenu`, `variant`, `railLabel` (Task 3); `ThemeSwitch`; `LanguageSelect`; `leave`; `logoutAndRedirect`.
- Produces: `FrameFooter({ look, fullAdmin, person, role, slim, onLeave, onShortcuts, onFind })`,
  `PhoneMenu(same props)`, `SideMenu({ label, icon, items: ReactNode, side: 'up' | 'down', slim })`;
  `roleLabelKey(role: string | null): [key: string, english: string]` (owner→Owner, manager→Manager, else Staff);
  `menuKey(key: string, index: number, count: number): number | null` (ArrowDown/ArrowUp wrap, Home 0, End count-1).

- [ ] **Step 1: Failing tests**

```ts
// shellMath.test.ts
expect(roleLabelKey('owner')).toEqual(['content.shell.role.owner', 'Owner'])
expect(roleLabelKey('manager')).toEqual(['content.shell.role.manager', 'Manager'])
expect(roleLabelKey(null)).toEqual(['content.shell.role.staff', 'Staff'])
expect(menuKey('ArrowDown', 2, 3)).toBe(0); expect(menuKey('ArrowUp', 0, 3)).toBe(2)
expect(menuKey('Home', 2, 3)).toBe(0); expect(menuKey('End', 0, 3)).toBe(2); expect(menuKey('a', 0, 3)).toBeNull()
```

```tsx
// frameFooter.test.tsx (MemoryRouter, mocked t as in the other content tests)
it('offers Settings, Help & resources and the person with their role', () => {
  const html = renderFooter({ person: 'Ada', role: 'manager' })
  expect(html).toMatch(/aria-haspopup="menu"[^>]*>[\s\S]*?Settings/)
  expect(html).toContain('Help &amp; resources')
  expect(html).toContain('Ada'); expect(html).toContain('Manager')
})
it('draws an open Settings menu with the theme switch, the language and Full admin only where there is one', () => {
  expect(renderOpenSettings({ fullAdmin: '/marketing' })).toContain('Full admin')
  expect(renderOpenSettings({ fullAdmin: null })).not.toContain('Full admin')
  expect(renderOpenSettings({ fullAdmin: null })).toContain('Language')
})
it('draws the person menu with Collapse menu and Sign out, and Expand menu while slim', () => {
  expect(renderOpenPerson({ slim: false })).toMatch(/Collapse menu[\s\S]*Sign out/)
  expect(renderOpenPerson({ slim: true })).toContain('Expand menu')
})
it('puts the same three groups in the phone menu', () => {
  const html = renderPhoneMenu()
  for (const w of ['Light', 'Language', 'Keyboard shortcuts', 'Sign out']) expect(html).toContain(w)
})
```

  (`renderOpen…` render the open list components `SettingsList`, `PersonList` exported from FrameFooter.tsx — components,
  so a static render can draw them.)
- [ ] **Step 2:** `vt.sh src/content/shell` — FAIL.
- [ ] **Step 3: Implement** — `SideMenu`: a `<button aria-haspopup="menu" aria-expanded>` row (icon + label, `sr-only` label
  while slim, `data-tip` while slim) and, while open, a `role="menu"` list positioned `bottom-full mb-2` (up) with
  `role="menuitem"` children; Enter/Space/ArrowUp open it focusing the first item; `menuKey` moves; Esc and outside
  pointerdown close it and return focus to the button; Tab closes it. Settings list: `ThemeSwitch tone="surface"`,
  `LanguageSelect`, Full admin `Link` through `leave(onLeave, …)`. Help list: "Keyboard shortcuts" (calls
  `onShortcuts`), "Find" (calls `onFind`). Person row: avatar letter, name, `t(...roleLabelKey(role))`, ⌃⌄ icon; list:
  Collapse/Expand menu (`look.setRail`), Sign out (`leave(onLeave, () => logoutAndRedirect('/login'))`). ContentShell passes
  `variant="cards"`, `railLabel={t('content.shell.workspace', 'Workspace')}`, `footer={<FrameFooter …/>}`,
  `phoneMenu={<PhoneMenu …/>}`. Words (t4-words.json): `shell.workspace` "Workspace", `shell.settings` "Settings",
  `shell.help` "Help & resources", `shell.shortcuts` "Keyboard shortcuts", `shell.find_short` "Find", `shell.role.owner`
  "Owner", `shell.role.manager` "Manager", `shell.role.staff` "Staff", `shell.person_menu` "Your account".
- [ ] **Step 4:** `vt.sh src/content src/workspace` — PASS. **Step 5: Commit** "Content frame: Settings, Help & resources and the person at the side panel's foot".

### Task 5: The page header with New post on every Content page

**Files:** Modify `frontend/src/content/ui/PageHeader.tsx`; Create `frontend/src/content/ui/NewPostButton.tsx`;
Modify `ideas/IdeasPage.tsx`, `posts/PostsPage.tsx`, `promote/PromotePage.tsx`, `strategy/StrategyPage.tsx`,
`brand/BrandPage.tsx` (each passes its line); Test `frontend/src/content/ui/pageHeader.test.tsx` (new).

**Interfaces:** Produces `PageHeader({ title, line?, below?, newPost?: boolean, children? })` — `title` in
`font-a-display text-[40px] leading-none`, `line` beside it (from `sm`) in `text-sm text-a-text-2`, `below` under the line
(the Plan's numbers line, Task 7), actions on the right with `NewPostButton` first-from-right when `newPost`.
`NewPostButton()` — accent pill with Plus, opens `panel.openNew({ date: boot.venue.today, platform: null })`.

- [ ] **Step 1: Failing tests**

```tsx
it('draws the title in the display face with its line and New post on the right', () => {
  const html = render(<PageHeader title="Ideas" line="What you could post next." newPost />)
  expect(html).toMatch(/<h1[^>]*font-a-display[^>]*>Ideas<\/h1>/)
  expect(html).toContain('What you could post next.')
  expect(html).toMatch(/<button[^>]*>[\s\S]*New post<\/span><\/button>/)
})
it('leaves New post out where the page has its own actions', () => {
  expect(render(<PageHeader title="Brand" />)).not.toContain('New post')
})
```

- [ ] **Step 2:** `vt.sh src/content/ui/pageHeader.test.tsx` — FAIL.
- [ ] **Step 3: Implement** and wire the pages: Ideas, Posts get `newPost`; Promote, Strategy, Brand keep their actions;
  each page's `line` is its existing intro key where it has one (no new words); Ideas and Posts without an intro get none.
- [ ] **Step 4:** `vt.sh src/content` — PASS (update page tests only where the header markup moved). **Step 5: Commit**.

### Task 6: The top bar's breadcrumb and brand menu; New post leaves the top bar

**Files:** Create `frontend/src/content/shell/BrandCrumb.tsx`; Modify `shellMath.ts` (`initialsOf`, `pageKeyOf`),
`ContentShell.tsx` (crumbs, header keeps Find + bell; the phone row's select replaced by the crumb's menu);
Test `shell/brandCrumb.test.tsx` (new), `shell/shellMath.test.ts`, `ContentShell.test.tsx`.

**Interfaces:** Produces `initialsOf(name: string): string` (first letters of the first two words, upper case, else
first two letters; '?' for empty); `pageKeyOf(pathname: string): 'plan' | 'ideas' | 'posts' | 'promote' | 'strategy' | 'brand' | 'write'`;
`BrandCrumb({ brand: BrandRef | null, brands: BrandRef[], page: string, onChoose: (id: number) => void })`.

- [ ] **Step 1: Failing tests**

```ts
expect(initialsOf('FDS Cards')).toBe('FC'); expect(initialsOf('Lumière')).toBe('LU'); expect(initialsOf('  ')).toBe('?')
expect(pageKeyOf('/content')).toBe('plan'); expect(pageKeyOf('/content/promote')).toBe('promote')
expect(pageKeyOf('/content/write/12')).toBe('write')
```

```tsx
it('shows the brand\'s logo, its name with a menu when there are several brands, and the page', () => {
  const html = render(<BrandCrumb brand={{ id: 1, name: 'FDS Cards', logo_url: 'https://cdn.example/l.png' }} brands={[b1, b2]} page="Plan" onChoose={() => {}} />)
  expect(html).toMatch(/<img[^>]*src="https:\/\/cdn.example\/l.png"[^>]*alt=""/)
  expect(html).toMatch(/aria-haspopup="menu"[^>]*>[\s\S]*FDS Cards/)
  expect(html).toMatch(/aria-current="page"[^>]*>Plan</)
})
it('draws initials without a logo and no menu for one brand, and truncates a long name (Review Focus 1)', () => {
  const html = render(<BrandCrumb brand={{ id: 1, name: 'A very long brand name that goes on', logo_url: null }} brands={[b1]} page="Plan" onChoose={() => {}} />)
  expect(html).toContain('>AV<'); expect(html).not.toContain('aria-haspopup')
  expect(html).toMatch(/class="[^"]*min-w-0[^"]*truncate/)
})
```

  `ContentShell.test.tsx`: the top bar no longer holds "New post"; it holds Find and the bell; `data-brand-switcher` gone.
- [ ] **Step 2:** FAIL. **Step 3: Implement** — `<nav aria-label="Breadcrumb">`: chip `h-7 w-7 rounded-lg` (img
  `object-cover` or initials on `bg-a-accent text-a-accent-ink`), the name (`min-w-0 truncate font-semibold`) inside a
  `SideMenu`-style down menu when `brands.length > 1` (items: each brand, the current one `aria-current`), `/` in
  `text-a-text-2`, the page `<span aria-current="page">`. Page words reuse `content.nav.*` (Write: new key
  `content.shell.page_write` "Write", added now for 7b's breadcrumb). Remove the top bar's New post button and the phone
  row's select (the crumb is visible on phones); keep the phone Find row.
- [ ] **Step 4:** `vt.sh src/content` — PASS. **Step 5: Commit**.

### Task 7: The Plan's header and calendar bar

**Files:** Modify `plan/PlanPage.tsx` (PageHeader with the numbers line; WeekStrip retired), `plan/Toolbar.tsx`
(rewritten as the calendar bar); Create `plan/NumbersLine.tsx`; Modify `plan/planMath.ts` (`numbersOf`); Delete
`plan/WeekStrip.tsx`; Test `plan/planPieces.test.tsx`, `plan/planMath.test.ts`, `plan/PlanPage.test.tsx`.

**Interfaces:** Produces `numbersOf(figures: PlanFigures | undefined): PlanFigures | null`; `NumbersLine({ figures, pending })`
("Planned: 12 · Ready: 3 · Published: 5 · Empty slots: 2", a dash per number while pending); `Toolbar` props unchanged
plus nothing removed (the filter row moves to Task 8's `FilterRow`, so `Toolbar` drops `filter`, `platforms`, `statuses`,
`onFilter`, `keyDates`, `onKeyDates` — the Plan passes them to `FilterRow`).

- [ ] **Step 1: Failing tests**

```tsx
it('says the period\'s numbers in one line under the title', () => {
  const html = render(<NumbersLine figures={{ planned: 12, ready: 3, published: 5, open_slots: 2 }} pending={false} />)
  expect(html).toContain('Planned: 12 · Ready: 3 · Published: 5 · Empty slots: 2')
  expect(render(<NumbersLine figures={undefined} pending />)).toContain('Planned: – · Ready: – · Published: – · Empty slots: –')
})
it('draws the calendar bar: the period in the display face, back, Today, forward, then Generate and the views grouped', () => {
  const html = render(<Toolbar {...bar} view="month" />)
  expect(html).toMatch(/<h2[^>]*font-a-display[^>]*>October 2026<\/h2>/)
  expect(html).toContain('>Today<')
  expect(html).toMatch(/data-views=""[\s\S]*Generate[\s\S]*Month[\s\S]*Week[\s\S]*List/)
  expect(html).toMatch(/role="radiogroup"/)
  expect(html).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>Month</)
})
```

  PlanPage.test: the page header says "Plan" and "A clear view of what comes next."; no `data-figure` tiles.
- [ ] **Step 2:** FAIL. **Step 3: Implement** — Plan renders `<PageHeader title="Plan" line={…plan.line} below={<NumbersLine …/>} newPost />`;
  the bar: ‹ (Previous) · Today (`content.common.today`) · › · `<h2>` period · refreshing spinner; right: one group
  `data-views` `inline-flex rounded-xl border border-a-border bg-a-surface p-1`: Generate (`bg-[rgb(var(--c-ai))]
  text-[rgb(var(--c-ai-ink))]`, Sparkles, managers only, waits while AI is paused) then a `role="radiogroup"` of
  Month/Week/List `role="radio"` (arrow keys move and choose; chosen `bg-a-accent text-a-accent-ink`). Below 1024 px the
  views stay hidden (List only) as today. GoalsLine/GeneratingLine stay under the bar for every view. Words (t7):
  `plan.line` "A clear view of what comes next.", `plan.numbers` "Planned: {{planned}} · Ready: {{ready}} · Published:
  {{published}} · Empty slots: {{open}}".
- [ ] **Step 4:** `vt.sh src/content/plan src/content/i18n` — PASS. **Step 5: Commit**.

### Task 8: The filter row — channel chips, Status, Unscheduled, Key dates

**Files:** Create `plan/FilterRow.tsx`, `plan/UnscheduledChip.tsx` (the chip, a drop target, and its list); Modify
`plan/PlanPage.tsx` (FilterRow; the tray column removed), `plan/Tray.tsx` (becomes the list body `TrayList` used inside
the chip's popover); Test `plan/planPieces.test.tsx`, `plan/PlanPage.test.tsx`.

**Interfaces:** Produces `FilterRow({ platforms, filter, statuses, onFilter, keyDates, onKeyDates, unscheduled: ReactNode })`;
`UnscheduledChip({ posts, total, active, selectedId, onOpen, onCardPointerDown, onCardKeyDown })` with
`data-drop="tray"` on the chip (dropping a card on it unschedules it, `moveMath.dropTargetAt` unchanged).

- [ ] **Step 1: Failing tests**

```tsx
it('draws a chip per channel with its mark and a tick while shown', () => {
  const html = render(<FilterRow {...row} platforms={['linkedin', 'instagram']} filter={{ platforms: ['linkedin'], status: 'all' }} />)
  expect(html).toMatch(/aria-pressed="true"[^>]*>[\s\S]*?linkedin[\s\S]*?data-tick=""/)
  expect(html).toMatch(/aria-pressed="false"[^>]*>[\s\S]*?instagram(?![\s\S]*?data-tick=""[\s\S]*?<\/button>)/)
})
it('offers Status as a chip naming the choice, and Key dates as a switch', () => {
  const html = render(<FilterRow {...row} filter={{ platforms: [], status: 'draft' }} keyDates />)
  expect(html).toMatch(/aria-haspopup="menu"[^>]*>[\s\S]*Status: Draft/)
  expect(html).toMatch(/role="switch"[^>]*aria-checked="true"[\s\S]*Key dates/)
})
it('shows Unscheduled with its count as a drop target that opens the list', () => {
  const html = render(<UnscheduledChip {...tray} posts={[card(1), card(2)]} total={2} />)
  expect(html).toMatch(/data-drop="tray"[^>]*aria-expanded="false"[^>]*>[\s\S]*Unscheduled \(2\)/)
})
```

  PlanPage.test: no `aria-labelledby="content-tray-title"` column beside the grid.
- [ ] **Step 2:** FAIL. **Step 3: Implement** — chips `rounded-lg border border-a-border bg-a-surface px-2.5 py-1.5 text-xs`;
  a shown channel carries `<Check data-tick="" size={12}/>`; Status uses the down menu (items "All statuses" + statuses);
  the chip says `Status` or `Status: {{name}}`. Unscheduled chip: `aria-expanded`, opens a panel under it (`absolute z-30
  mt-2 w-80 max-h-[60vh] overflow-y-auto`) holding `TrayList` (today's tray contents, "Showing n of m", "See all", empty
  text); stays open while a drag is on (Esc/outside close); highlights while a card is over it (`active`). Key dates:
  `role="switch"` button with a track. Words (t8): `plan.status_chip` "Status: {{name}}", `plan.unscheduled_chip`
  "Unscheduled ({{count}})".
- [ ] **Step 4:** `vt.sh src/content/plan` — PASS. **Step 5: Commit**.

### Task 9: The month grid, the cards, week and list, and the legend

**Files:** Modify `plan/MonthGrid.tsx`, `plan/PostCardView.tsx`, `plan/WeekGrid.tsx`, `plan/ListView.tsx`,
`plan/KeyDateChips.tsx`, `theme/content.css` (`.c-card`, the open card's accent fill); Create `plan/PlanLegend.tsx`;
Modify `plan/planMath.ts` (`monthDayLabel`); Test `plan/planPieces.test.tsx`, `plan/keyDates.test.tsx`, `plan/planMath.test.ts`.

**Interfaces:** Produces `monthDayLabel(day: DateKey, shown: DateKey, locale: string): { number: string; month: string | null }`
(the month short name only for days outside the shown month); `PlanLegend({ open: boolean })`; `PostCardView` prop
`size: 'month' | 'week' | 'list' | 'tray'` replacing `compact` (tray = today's compact one-line card).

- [ ] **Step 1: Failing tests**

```ts
expect(monthDayLabel('2026-09-28', '2026-10-15', 'en-GB')).toEqual({ number: '28', month: 'Sep' })
expect(monthDayLabel('2026-10-03', '2026-10-15', 'en-GB')).toEqual({ number: '3', month: null })
```

```tsx
it('draws a month card with its mark, time, status word and up to four lines of its hook', () => {
  const html = render(<PostCardView post={card({ scheduled_time: '09:00', status: 'draft', hook: 'You do not need a finished design' })} size="month" onOpen={() => {}} />)
  expect(html).toMatch(/class="[^"]*c-card[^"]*"/)
  expect(html).toContain('09:00'); expect(html).toMatch(/>Draft<\/span>/)
  expect(html).toMatch(/line-clamp-4[^>]*>You do not need a finished design/)
})
it('fills the open post\'s card with the accent', () => {
  expect(render(<PostCardView post={card()} size="month" selected onOpen={() => {}} />)).toMatch(/aria-current="true"[^>]*class="[^"]*bg-gradient-to-br from-a-accent/)
})
it('dims days of another month with their month, marks today and shows "+" on a day', () => {
  const html = render(<MonthGrid {...month} />)
  expect(html).toMatch(/text-a-text-2[^>]*>28<[\s\S]*?Sep/)
  expect(html).toMatch(/aria-current="date"[\s\S]*?rounded-full bg-a-accent[\s\S]*?Today/)
})
it('says Draft and Key date under the grid, and how to open a post while none is open', () => {
  expect(render(<PlanLegend open={false} />)).toMatch(/Draft[\s\S]*Key date[\s\S]*Select a post to review its details/)
  expect(render(<PlanLegend open />)).not.toContain('Select a post')
})
```

  keyDates.test: the chip carries `data-keydate` and the AI violet tint class `c-keydate`.
- [ ] **Step 2:** FAIL. **Step 3: Implement** — month: head row `bg-a-surface font-a-mono text-[11px] uppercase tracking-[0.12em]`,
  cells `min-h-[6.5rem] bg-a-surface-2 border-a-border`, weekend numbers `text-a-text-2`, other-month numbers dimmed with
  the month beside them; today: number in `h-6 min-w-6 rounded-full bg-a-accent text-a-accent-ink` and `content.common.today`
  beside it in `text-xs text-a-accent-text`; the add "+" `opacity-0 group-hover:opacity-100 focus-visible:opacity-100`.
  Cards (`.c-card` = `background-color: rgb(var(--c-card)); color: rgb(var(--a-text))` in content.css): month/week
  `flex-col gap-1 rounded-[10px] px-2.5 py-2`, the top row mark + time (`text-[rgb(var(--c-card-text-2))]`) + status word at
  the right, then `line-clamp-4` (week `line-clamp-6`), flags in the foot, image as today in week/list; selected: `bg-gradient-to-br
  from-a-accent to-a-accent-deep text-a-accent-ink` (its secondary text `text-a-accent-ink/80`) and the day cell
  `ring-1 ring-inset ring-a-accent-text`. Key date chip `.c-keydate` (`--c-ai` text on a 14 % tint of it) at the bottom of
  the day in month view. `PlanLegend` under the calendar box. Words (t9): `plan.legend_draft` "Draft", `plan.legend_keydate`
  "Key date", `plan.select_post` "Select a post to review its details".
- [ ] **Step 4:** `vt.sh src/content/plan` — PASS. **Step 5: Commit**.

### Task 10: The panel's placement, header and ⋯ menu

**Files:** Modify `panel/PostPanel.tsx` (placement, header), `panel/PostActions.tsx` (split), `ContentShell.tsx`
(the page reserves the panel's width at xl); Create `panel/PanelMore.tsx` (the ⋯ menu), `panel/ProgressActions.tsx`
(Mark ready, Mark published with its step, Published on), `panel/panelMath.ts` (`panelMode`, `dayLine`);
Test `panel/PostPanel.test.tsx`, `panel/postActions.test.tsx`, `panel/panelMath.test.ts` (new), `ContentShell.test.tsx`.

**Interfaces:** Produces `panelMode(width: number): 'docked' | 'over' | 'full'` (≥1280 docked, ≥640 over, else full);
`dayLine(date: DateKey | null, locale: string): string | null` ("Friday, 23 October 2026"; null without a date);
`PanelMore({ post, dirty, onDuplicated, onDeleted, pillarName })`; `ProgressActions({ post, dirty, onPost })`.

- [ ] **Step 1: Failing tests**

```ts
expect(panelMode(1280)).toBe('docked'); expect(panelMode(1279)).toBe('over'); expect(panelMode(639)).toBe('full')
expect(dayLine('2026-10-23', 'en-GB')).toBe('Friday, 23 October 2026'); expect(dayLine(null, 'en-GB')).toBeNull()
```

```tsx
it('is a labelled region beside the page when docked, and a dialog over it otherwise', () => {
  expect(renderPanel({ mode: 'docked' })).toMatch(/<aside[^>]*role="complementary"[^>]*aria-labelledby="content-panel-title"/)
  expect(renderPanel({ mode: 'over' })).toMatch(/<aside[^>]*role="dialog"/)
  expect(renderPanel({ mode: 'docked' })).toMatch(/xl:w-\[400px\]/)
})
it('heads the panel with Post details, the post\'s day, ⋯ and Close', () => {
  const html = renderPanel({ post: detail({ scheduled_date: '2026-10-23' }) })
  expect(html).toContain('Post details'); expect(html).toContain('Friday, 23 October 2026')
  expect(html).toMatch(/aria-label="More actions"[^>]*aria-haspopup="menu"/)
})
it('says "No day yet" without a day, and "New post" before it is created', () => { /* two renders */ })
it('keeps Duplicate, Copy text, Copy link, Save as template and Delete in the ⋯ menu, progress beside the status', () => {
  const more = render(<MoreList {...moreProps} />)
  for (const w of ['Duplicate', 'Copy text', 'Copy link for the team', 'Save as template', 'Delete']) expect(more).toContain(w)
  const progress = render(<ProgressActions post={detail({ status: 'draft' })} dirty={false} onPost={() => {}} />)
  expect(progress).toContain('Mark ready'); expect(progress).not.toContain('Duplicate')
})
```

  ContentShell.test (Review Focus 3, 4): with a post open the page wrapper carries `xl:pr-[400px]`; closed, not;
  the wrapper keeps `min-w-0` so the calendar box scrolls inside.
- [ ] **Step 2:** FAIL. **Step 3: Implement** — `useMedia('(min-width: 1280px)')`/`(min-width: 640px)` give the mode; the
  aside: docked `role="complementary"` no shadow `border-l`, over/full today's dialog (`aria-modal="false"` as today);
  classes `fixed bottom-0 right-0 top-14 z-30 w-full sm:w-[400px]` (+ `xl:shadow-none`). The page wrapper in ContentShell
  (`<main>`) gets `xl:pr-[400px]` while `panel.target !== null`. Header: `Post details` (`content.panel.details`), the day
  line or "No day yet" (`content.panel.no_day`), `PanelMore` (⋯, down menu, its confirm and template dialog as today), ✕.
  Esc inside an open ⋯ menu closes the menu only (the menu handler `preventDefault`s; the panel's Esc listener already
  skips prevented events — Review Focus 5). Words (t10): `panel.details` "Post details", `panel.no_day` "No day yet",
  `panel.more` "More actions".
- [ ] **Step 4:** `vt.sh src/content` — PASS. **Step 5: Commit**.

### Task 11: The panel's tabs, the Content tab and the footer

**Files:** Modify `panel/PostPanel.tsx` (tabs, footer), `panel/PostFormFields.tsx` (re-ordered into the Content tab with the
large hook, the CTA's destination link and three folding sections); Create `panel/PanelTabs.tsx`,
`panel/FoldSection.tsx`; Modify `panel/panelMath.ts` (`tabAfter`, `saveLabelKey`, `foldKey`), `panel/panelState.ts`
(remembered tab and folds per device, try/catch storage); Test `panel/PostPanel.test.tsx`, `panel/postFormFields.test.tsx`,
`panel/panelMath.test.ts`.

**Interfaces:** Produces `PanelTab = 'content' | 'ai' | 'activity'`; `tabAfter(tab, key): PanelTab | null`;
`saveLabelKey(created: boolean, status: PostStatus): [key, english]` (new → Create post; draft → Save draft; else Save);
`FoldSection({ id, title, children })` (a `<button aria-expanded aria-controls>` header remembering its state under
`content:fold:<id>`); `loadPanelTab()/savePanelTab(tab)`.

- [ ] **Step 1: Failing tests**

```ts
expect(saveLabelKey(false, 'draft')).toEqual(['content.panel.create', 'Create post'])
expect(saveLabelKey(true, 'draft')).toEqual(['content.panel.save_draft', 'Save draft'])
expect(saveLabelKey(true, 'approved')).toEqual(['content.panel.save', 'Save'])
expect(tabAfter('content', 'ArrowRight')).toBe('ai'); expect(tabAfter('activity', 'ArrowRight')).toBe('content')
```

```tsx
it('shows Content, AI tools and Activity as tabs, with the number of comments on Activity', () => {
  const html = renderPanel({ post: detail({ comments_count: 3 }) })
  expect(html).toMatch(/role="tablist"[\s\S]*role="tab"[^>]*aria-selected="true"[^>]*>Content<[\s\S]*AI tools[\s\S]*Activity \(3\)/)
})
it('says to create the post first on AI tools and Activity before it exists', () => {
  expect(renderPanel({ newPost: true, tab: 'ai' })).toContain('Create the post first to use this.')
})
it('draws the hook as the large serif line under POST HOOK', () => {
  const html = renderFields()
  expect(html).toMatch(/POST HOOK[\s\S]*<textarea[^>]*placeholder="Write the first line people see"[^>]*class="[^"]*font-a-display/)
})
it('orders the fields as the mockup: date and time, status and who posts it, then text, call to action and the folds', () => {
  const html = renderFields()
  const at = (w: string) => html.indexOf(w)
  expect(at('Date')).toBeLessThan(at('Status')); expect(at('Status')).toBeLessThan(at('Who posts it'))
  expect(at('Post text')).toBeLessThan(at('Call to action'))
  expect(at('Call to action')).toBeLessThan(at('Targeting &amp; language'))
  expect(html).toMatch(/aria-expanded="false"[^>]*>[\s\S]*Link &amp; hashtags/)
  expect(html).toContain('Versions &amp; repeat')
})
it('offers "Add destination URL" under the call to action until there is a link', () => {
  expect(renderFields({ link: '' })).toContain('Add destination URL')
  expect(renderFields({ link: 'https://x.example' })).not.toContain('Add destination URL')
})
it('says Save draft for a draft in the footer', () => { expect(renderPanel({ post: detail({ status: 'draft' }) })).toMatch(/>Save draft</) })
```

- [ ] **Step 2:** FAIL. **Step 3: Implement** — tabs (`role="tablist"`, roving tabindex, `tabAfter`), the open tab remembered;
  Content tab order per spec §7.4 (platform line + status chip; ReviewBar/PromotesLine; POST HOOK serif textarea that grows;
  Date · Time with suggested times; Status · Who posts it; `ProgressActions`; Post text (toolbar slot for Task 12); Call to
  action + "Add destination URL" (reveals the Link field in place) or the `ShortLink` line; folds: Targeting & language
  (platform, pillar, audience, language, topic + Template), Link & hashtags (link when not shown above, ShortLink figures,
  hashtags + Insert, too-many-tags notice, blanks line), Versions & repeat (`VersionsSection`, `RepeatSection`)). AI tools
  tab: `AiTools`. Activity tab: `Timeline`. Footer: `saveLabelKey` button and the save note. Words (t11):
  `panel.tab_content` "Content", `panel.tab_ai` "AI tools", `panel.tab_activity` "Activity", `panel.tab_activity_count`
  "Activity ({{count}})", `panel.create_first` "Create the post first to use this.", `panel.hook_label` "Post hook",
  `panel.hook_placeholder` "Write the first line people see", `panel.post_text` "Post text", `panel.add_link` "Add
  destination URL", `panel.fold_targeting` "Targeting & language", `panel.fold_links` "Link & hashtags",
  `panel.fold_versions` "Versions & repeat", `panel.save_draft` "Save draft". (Check `comments_count` exists on
  `PostDetail`; if not, count the timeline's comment items — ledger the ruling.)
- [ ] **Step 4:** `vt.sh src/content` — PASS (existing panel tests updated where the order moved, never loosened).
  **Step 5: Commit**.

### Task 12: The text toolbar — emoji, link, snippet, hashtag group

**Files:** Create `panel/TextToolbar.tsx`, `panel/EmojiPicker.tsx`, `panel/emojiData.ts` (a curated list: about 160 common
emoji in 8 groups, each with English keywords), `panel/toolbarMath.ts` (`searchEmoji`, `pushRecent`, `linkToInsert`);
Modify `panel/PostFormFields.tsx` (toolbar above Post text; snippet/hashtag menus move into it);
Test `panel/toolbarMath.test.ts` (new), `panel/textToolbar.test.tsx` (new).

**Interfaces:** Produces `searchEmoji(query: string, data: EmojiItem[]): EmojiItem[]` (case-insensitive keyword prefix match,
empty query → all); `pushRecent(recent: string[], emoji: string, max = 16): string[]` (front, unique);
`linkToInsert(shortUrl: string | null, typed: string): string | null` (the short link, else a typed `https?://` address,
else null); `TextToolbar({ onInsert: (text: string) => void, shortUrl, snippets, groups, onHashtags })`.

- [ ] **Step 1: Failing tests**

```ts
expect(searchEmoji('hea', data).map(e => e.char)).toContain('❤️')
expect(searchEmoji('', data)).toHaveLength(data.length)
expect(pushRecent(['😀', '🎉'], '🎉')).toEqual(['🎉', '😀'])
expect(pushRecent(Array.from({ length: 16 }, (_, i) => String(i)), 'x')).toHaveLength(16)
expect(linkToInsert('https://sites.hexa-tech.uk/go/abc', '')).toBe('https://sites.hexa-tech.uk/go/abc')
expect(linkToInsert(null, 'https://lumiere.example')).toBe('https://lumiere.example')
expect(linkToInsert(null, 'lumiere')).toBeNull()
```

```tsx
it('names each tool for a screen reader', () => {
  const html = render(<TextToolbar {...tools} />)
  for (const w of ['Emoji', 'Insert link', 'Insert snippet', 'Insert hashtag group']) expect(html).toContain(`aria-label="${w}"`)
})
it('draws the emoji picker with its search box and groups', () => {
  const html = render(<EmojiPicker recent={['🎉']} onPick={() => {}} />)
  expect(html).toMatch(/<input[^>]*type="search"[^>]*aria-label="Search emoji"/)
  expect(html).toContain('Recent'); expect(html).toContain('🎉')
})
```

- [ ] **Step 2:** FAIL. **Step 3: Implement** — buttons `rounded p-1.5 text-a-text-2 hover:text-a-text`; Emoji opens the
  picker (search box, Recent row from `content:emoji-recent` storage, groups as a grid of buttons `aria-label` = the
  emoji's first keyword); a pick inserts at the cursor through the existing `insertInto`; Link inserts `linkToInsert(...)`
  or opens a small address box when it returns null and nothing is typed; Snippet and Hashtag group are today's
  `InsertMenu`s. Words (t12): `panel.tool_emoji` "Emoji", `panel.tool_link` "Insert link", `panel.tool_snippet` "Insert
  snippet" (exists as `insert_snippet` — reuse), `panel.tool_hashtags` "Insert hashtag group", `panel.emoji_search`
  "Search emoji", `panel.emoji_recent` "Recent", group names (`panel.emoji_group.smileys` "Smileys", `people` "People",
  `hearts` "Hearts", `nature` "Nature", `food` "Food", `activity` "Activities", `objects` "Objects", `symbols` "Symbols"),
  `panel.link_address` "Web address". Ruling: emoji search matches English keywords in every language (a curated list
  has no names in five languages) — ledger it.
- [ ] **Step 4:** `vt.sh src/content` — PASS. **Step 5: Commit**.

### Task 13: Docs, final review, release checks, deploy

- [ ] `docs/content-workspace.md`: a Release 7a section (the frame options, the palette and card fill, the breadcrumb, the
  page header, the Plan's numbers line/chips/grouped control/month cards/legend, the panel's placement, tabs, folds and
  toolbar, `logo_url`).
- [ ] Final whole-branch review: `review-package` on `c78e58757..HEAD` excluding the 6-fixes commits already reviewed
  (range from `51d71e8c3`), a fresh reviewer on the most capable model with this plan's Review Focus; Critical/Important
  fixed test first; minors ledgered or fixed when cheap (owner wants parts finished).
- [ ] Release checks: every PHP folder (`php-paths.txt`) on the artifact; `tsc -b`; the whole vitest run; lint; build
  check; the Appointments pixel comparison (base = prod main tree, new = branch; 46 screens, 0 differ); Lighthouse
  accessibility on Plan (month and week), the panel (docked) and Brand: 100 or the shared Find item only; one browser pass
  on a temporary brand in org 16 (pass-seed with posts on several days, a key date, an unscheduled post): month/week/list,
  the chips (toggle a channel, Status, open Unscheduled and drag a post onto a day), the brand menu, Settings/Help/person
  menus by keyboard, the panel docked at 1440 and sliding at 1024 (tabs, hook edit and save, ⋯ Duplicate, folds, emoji
  insert, link insert), phones at 390, Russian, Light and Dark; console errors 0; 4xx 0; eyes: the Plan at 1440 Dark
  beside the owner's frame, Light, phone.
- [ ] Deploy by the source-patch recipe (change list since c78e58757; guard: `app/Http/Controllers/Api/V1/Admin/Content/`,
  `tests/`, `frontend/src/content/`, `frontend/src/workspace/`, `docs/` only; no migration); verify by content (the new
  index; the live ContentApp chunk has "A clear view of what comes next." and "Post details"; `GET bootstrap` 401 as
  before); memory; report with the rulings and the 7b plan as next.
