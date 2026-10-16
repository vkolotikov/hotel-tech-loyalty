# HexaTech Content — Release 3, Plan B: the Portal for the Fast Wins, the Release Checks and the Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the portal half of release 3 on Plan A's server — click-to-add on the Plan, best-time hints and a channel's usual time, hashtag groups and snippets, posting goals and streaks, repeat posts — then prove the whole release and ship it in one deploy after the owner's "yes, deploy".

**Architecture:**
- **Behaviour in pure helpers, pinned by node tests** (the test environment has no DOM and cannot click): `plan/addMath.ts`, `plan/goalsMath.ts`, `panel/repeatMath.ts`, `panel/snippetInsert.ts`, `brand/snippetActions.ts`. Components render them and are checked with `renderToStaticMarkup`.
- **One new cache read on the Plan** (the brand, `['content', brand, 'brand']`, the one the panel and Generate already read) for channels and usual times, and one more (`['content', brand, 'goals']`). The post panel polls its post only while the AI rewords a series.
- **Words** in all five bundles through `$R3B/words.mjs`; two new refusal families (`repeat`, `snippet`) kept equal to the English bundle by `errors.test.ts`.
- Then the release checks (every suite, the build, Appointments pixel for pixel with exactly the three intended phone-menu differences, Lighthouse, a browser pass that writes for real) and the deploy by the source-patch recipe.

**Tech Stack:** React 19, TypeScript 5.9, Vite 5, React Router 7, TanStack Query 5, react-i18next 17, Tailwind 3.4 (Atelier `a-*`), vitest 2 (node environment, `renderToStaticMarkup`); Laravel 13 on PHP 8.4.20 for the suites; Playwright (`playwright-core`) and the chrome-devtools MCP for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-15-content-release-3-design.md` (approved 2026-10-15), §4–§10. Earlier spec, still binding: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`.

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `63a3b2711` (Plan A built, reviewed, fixed). Production is release 2: prod main `a9483b428` = the source of feature tip `47dab9930` + a build. Plan A's ledger and tools: `.superpowers/sdd/archive/2026-10-15-content-release-3a/`. Code facts for this plan: `.superpowers/sdd/r3b-facts.md` (sections 1–20; quoted where a task needs them).

## Global Constraints

- **Branch:** never push the feature branch; never commit its built `frontend/dist`, `public/spa` or `resources/spa-shell`. Only Task 12 pushes, and only after the owner's explicit "yes, deploy" in this conversation.
- **Ledger and tools:** `.superpowers/sdd/2026-10-15-content-release-3b/`, called `$R3B` below. Task 1, Step 1 sets it up from Plan A's archive: `vt.sh` (vitest on paths), `php.sh` (PHP paths, exit code honest), `words.mjs` (locale keys inserted without reformatting a bundle), `append-tests.mjs`.
- **Frontend commands** (Git Bash): types `cd frontend && npx tsc -b`; tests `$R3B/vt.sh <paths…>`; scoped lint `cd frontend && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts`.
- **Baselines:** the full vitest run has exactly 3 failures (`src/lib/plannerMeta.test.ts`); the scoped lint has exactly 17 errors (`src/App.tsx` 1, `src/components/Layout.tsx` 15, `src/pages/hubs/MarketingHub.tsx` 1). Anything else is ours.
- **Tests cannot click** (`vitest.config.ts`: node environment, no jsdom, no Testing Library). Every click rule lives in a pure helper with its own test; components are rendered with `renderToStaticMarkup` and checked by their markup. `useMedia` is false in tests, so the Plan renders its list view; render `WeekGrid` and `MonthGrid` directly to test them.
- **Types:** new fields on types that literal test fixtures build (`PostDetail`, `BrandPayload`) are optional (`series_id?`, `series?`, `snippets?`), so the fixtures still compile.
- **Words:** every new literal `content.*` key in all five bundles (`frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`, read as `content.<key>`; `localeCompleteness.test.ts` and `contentLocales.test.ts` check it), inserted with `node $R3B/words.mjs <file>.json` (it creates missing parents, keeps the formatting, parses every bundle and checks every key before writing). Never a heredoc for a bundle.
- **Refusals:** a new family in `lib/errors.ts` (`ERRORS`) must deep-equal `en.<family>.error` (`errors.test.ts`); the portal's own sentence for every refusal; the server's message is never shown.
- **Portal rules (`content/tokens.test.ts`):** nothing imported from `src/appointments`; no bare `hover:-translate-*`; no text under 12 px; stylesheet rules scoped under `[data-content]`; only `a-*` colour classes. "Show on hover, always on touch" is written with arbitrary variants: `[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 focus-visible:opacity-100`.
- **React lint:** no synchronous `setState` inside an effect; no `ref.current` read during render; no component defined inside another.
- **Appointments does not change in this plan:** the release checks expect exactly the three phone-menu screens Plan A changed (`phone-menu-light`, `phone-menu-dark`, `phone-menu-ru`) to differ, and nothing else.
- **PHP:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by folder, in the foreground (`$R3B/php.sh <paths…>`); never a bare `php artisan test`.
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace — write any code holding backslashes with the Write or Edit tool (or a script written by the Write tool), never a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A drag that ends over a day's empty space** (a card dragged from its day and released below the day's last item): the click the release fires reaches the day column, not the card — it must not open a new post.
   - Pinned by Task 3: the day handler goes through `drag.consumeClick()` (the same guard as opening a card), and `clickAdds` ignores clicks inside cards and slots.
2. **Days already gone on the venue's clock:** a past day has no "+" and ignores clicks, judged on `boot.venue.today` (the server's day), never this computer's date.
   - Pinned by Tasks 2–4 (`canAdd`, and render tests with no "+" on a past day in the week, month and list views).
3. **Hashtags inserted next to ones already typed:** "#Autumn" and "autumn" are one tag (ignoring case and the leading #); the Instagram warning counts the tags after the insert, not before.
   - Pinned by Task 7 (`insertHashtags`, `tooManyTags`).
4. **Repeat limits at their exact edges:** an end date exactly 12 months after the post's day is allowed, one day more is not; 26 copies are allowed, 27 are not; 12 AI copies are allowed, 13 are not; a monthly repeat from the 31st lands on each month's last day — the portal must agree with the server, so a request it sends is never refused by a limit it did not say.
   - Pinned by Task 9 (`repeatDates`, `repeatProblem`, mirroring `ContentRepeat::dates` and `RepeatController`).
5. **A brand save emptying the snippets:** `useBrand().adopt()` kept five keys, so after any Brand change (a channel, the voice) the Insert menus in the panel would find no snippets until a reload.
   - Pinned by Task 1 (`brandCache` keeps `snippets`).

---

## File map

- **Task 1 (data layer):** `frontend/src/content/lib/{types.ts,api.ts,errors.ts}`, `frontend/src/content/brand/useBrand.ts`; tests `lib/api.test.ts`, `lib/errors.test.ts`, new `brand/useBrand.test.ts`; words (`repeat.error.*`, `snippet.error.*`).
- **Task 2 (click-to-add model, a new post's time):** new `frontend/src/content/plan/addMath.ts` (+ `addMath.test.ts`), `panel/PanelProvider.tsx` (`NewDraft.time`), `panel/panelState.ts` (`newForm`), `panel/PostPanel.tsx` (first-channel adoption takes its usual time), `plan/PlanPage.tsx` (brand read, Write presets the time); tests `panel/panelState.test.ts`, `panel/PostPanel.test.tsx`.
- **Task 3 (week view):** new `plan/AddButton.tsx`, `plan/WeekGrid.tsx`, `plan/PlanPage.tsx`; tests `plan/planPieces.test.tsx`; words (`plan.add_on`).
- **Task 4 (month and list views):** `plan/MonthGrid.tsx`, `plan/ListView.tsx`, `plan/PlanPage.tsx`; tests `plan/planPieces.test.tsx`, `plan/PlanPage.test.tsx`.
- **Task 5 (best-time hints):** `plan/SlotRow.tsx`, `plan/WeekGrid.tsx`, `plan/ListView.tsx`, `plan/PlanPage.tsx`, `panel/PostFormFields.tsx`, `panel/PostPanel.tsx`, `brand/listActions.ts`, `brand/sections/Channels.tsx`; tests `planPieces.test.tsx`, `PostPanel.test.tsx`, `brand/listActions.test.ts`, `brand/brandLists.test.tsx`; words.
- **Task 6 (snippets on the Brand page):** new `brand/snippetActions.ts` (+ test), new `brand/sections/Snippets.tsx`, `brand/BrandPage.tsx`; tests new `brand/snippets.test.tsx`; words.
- **Task 7 (snippets in the panel):** new `panel/snippetInsert.ts` (+ test), new `panel/InsertMenu.tsx`, `panel/PostFormFields.tsx`, `panel/PostPanel.tsx`; tests `PostPanel.test.tsx`; words.
- **Task 8 (goals and streak):** new `plan/goalsMath.ts` (+ test), new `plan/GoalsLine.tsx`, `plan/PlanPage.tsx`, `lib/planCache.ts`; tests `planPieces.test.tsx`, `lib/planCache.test.ts`; words.
- **Task 9 (repeat posts):** new `panel/repeatMath.ts` (+ test), new `panel/RepeatSection.tsx`, `panel/PostPanel.tsx`; tests new `panel/repeatSection.test.tsx`, `PostPanel.test.tsx`; words.
- **Task 10 (runbook):** `docs/content-workspace.md`.
- **Task 11 (release checks):** `$R3B` only (scripts, captures, reports); fixes found go in test-first.
- **Task 12 (deploy):** a deploy worktree from `origin/main`; pushes only after "yes, deploy".

---

### Task 1: The data layer — types, calls, refusal words, a brand cache that keeps the snippets

**Files:**
- Modify: `frontend/src/content/lib/types.ts`, `frontend/src/content/lib/api.ts`, `frontend/src/content/lib/errors.ts`, `frontend/src/content/brand/useBrand.ts`
- Test: `frontend/src/content/lib/api.test.ts`, `frontend/src/content/lib/errors.test.ts`, create `frontend/src/content/brand/useBrand.test.ts`

**Interfaces:**
- Produces (types): `SnippetKind = 'hashtags' | 'text'`; `Snippet { id; kind; name; body }`; `SnippetSuggestion { name; body }`; `GoalPlatform { platform; target; published; planned }`; `Streak { weeks; current_met; at_risk; short_by }`; `Goals { week: {from, to} | null; platforms; streak }`; `RepeatEvery = 'week' | '2weeks' | 'month'`; `Series { id; every; until: DateKey | null; more; removable; rewriting }`; `PostDetail.series_id?: number | null`, `PostDetail.series?: Series | null`; `BrandPayload.snippets?: Snippet[]`.
- Produces (calls on `ContentApi`): `goals(): Promise<Goals>`; `repeatPost(id, { every, until, ai_rewrite }): Promise<{ post: PostDetail; copies: PostCard[] }>`; `stopRepeat(id): Promise<{ removed: number; post: PostDetail | null }>`; `createSnippet({ kind, name, body }): Promise<BrandPayload & { snippet: Snippet }>`; `updateSnippet(id, { name?, body? }): Promise<BrandPayload & { snippet: Snippet }>`; `deleteSnippet(id): Promise<BrandPayload>`; `suggestSnippets(): Promise<{ suggestions: SnippetSuggestion[] }>`.
- Produces: error families `repeat` and `snippet` (`errorKey('repeat', code)`, `errorKey('snippet', code)`); `brandCache(payload: BrandPayload): BrandPayload` in `brand/useBrand.ts`.

- [ ] **Step 1: Set up the ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R3B=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-15-content-release-3b.md)
A=.superpowers/sdd/archive/2026-10-15-content-release-3a
cp "$A/vt.sh" "$A/php.sh" "$A/words.mjs" "$A/append-tests.mjs" "$R3B/" && chmod +x "$R3B/vt.sh" "$R3B/php.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-15-content-release-3b.md" > "$R3B/progress.md"
echo "$R3B"; ls "$R3B"
```

Expected: `$R3B` ends in `.superpowers/sdd/2026-10-15-content-release-3b`; the four tools and `progress.md` are listed.

- [ ] **Step 2: Write the failing tests**

`frontend/src/content/lib/api.test.ts`, inside `describe('contentApi')`, after the test `sends every call under the prefix, with its brand, and the plan range as parameters` (it ends at its `})`):

```ts
  it('reaches goals, repeat posts and the brand\'s hashtag groups and snippets under the prefix', async () => {
    calls.fail = null
    const api = contentApi(5)
    await api.goals()
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/goals?brand_id=5' })
    await api.repeatPost(9, { every: 'week', until: '2026-10-28', ai_rewrite: true })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/repeat?brand_id=5', body: { every: 'week', until: '2026-10-28', ai_rewrite: true } })
    await api.stopRepeat(9)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/posts/9/repeat?brand_id=5' })
    await api.createSnippet({ kind: 'hashtags', name: 'Autumn', body: '#autumn' })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/snippets?brand_id=5', body: { kind: 'hashtags', name: 'Autumn', body: '#autumn' } })
    await api.updateSnippet(4, { body: '#fall' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/snippets/4?brand_id=5', body: { body: '#fall' } })
    await api.deleteSnippet(4)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/brand/snippets/4?brand_id=5' })
    await api.suggestSnippets()
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/snippets/suggest?brand_id=5' })
  })
```

`frontend/src/content/lib/errors.test.ts` (import `errorKey` from `./errors` if the file does not yet), at the end:

```ts
describe('release 3 refusals', () => {
  it('words a repeat and a snippet refusal in the portal\'s own sentence', () => {
    expect(errorKey('repeat', 'already_repeating')).toEqual(['content.repeat.error.already_repeating', 'This post already repeats.'])
    expect(errorKey('repeat', 'too_many_copies')[0]).toBe('content.repeat.error.too_many_copies')
    expect(errorKey('snippet', 'too_many_snippets')).toEqual(['content.snippet.error.too_many_snippets', 'A brand keeps at most 50 of each. Remove one first.'])
    expect(errorKey('snippet', 'whatever')[0]).toBe('content.snippet.error.unknown')
  })
})
```

Create `frontend/src/content/brand/useBrand.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { BrandPayload } from '../lib/types'
import { brandCache } from './useBrand'

// Plan 3B Review Focus 5: adopt() kept five keys, so any brand save dropped the hashtag groups and snippets from the cache.
describe('brandCache', () => {
  it('keeps the brand\'s snippets with the rest of the answer, and an empty list when an answer has none', () => {
    const snippets = [{ id: 1, kind: 'hashtags' as const, name: 'Autumn', body: '#autumn' }]
    const answer = { profile: null, audiences: [], channels: [], voice: null, readiness: null, snippets, channel: { id: 9 } } as unknown as BrandPayload
    expect(brandCache(answer)).toEqual({ profile: null, audiences: [], channels: [], voice: null, readiness: null, snippets })
    expect(brandCache({ profile: null, audiences: [], channels: [], voice: null, readiness: null }).snippets).toEqual([])
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `$R3B/vt.sh src/content/lib/api.test.ts src/content/lib/errors.test.ts src/content/brand/useBrand.test.ts`
Expected: FAIL — `api.goals is not a function`; `errorKey('repeat', …)` answers the `unknown` of a family that does not exist (a TypeError on `ERRORS.repeat`); `brandCache` is not exported.

- [ ] **Step 4: The types**

`frontend/src/content/lib/types.ts`:
1. `PostDetail` gains, after `visual_brief: VisualBrief | null`:

```ts
  /** The repeat series it belongs to (the original's id), and how that series runs (spec 2026-10-15 §8). */
  series_id?: number | null
  series?: Series | null
```

2. `BrandPayload` gains, after `readiness: Readiness | null`:

```ts
  /** The brand's hashtag groups and text snippets (spec 2026-10-15 §6); every brand answer carries them. */
  snippets?: Snippet[]
```

3. At the end of the file:

```ts
/** A saved hashtag group or text snippet of the brand (spec 2026-10-15 §6). */
export type SnippetKind = 'hashtags' | 'text'
export interface Snippet { id: number; kind: SnippetKind; name: string; body: string }
/** A hashtag group the AI proposes: nothing is saved until a manager adds it. */
export interface SnippetSuggestion { name: string; body: string }

/** Posting goals for the venue's current week, per platform, and the streak (spec 2026-10-15 §7). */
export interface GoalPlatform { platform: Platform; target: number; published: number; planned: number }
export interface Streak { weeks: number; current_met: boolean; at_risk: boolean; short_by: number }
export interface Goals { week: { from: DateKey; to: DateKey } | null; platforms: GoalPlatform[]; streak: Streak }

/** How often a repeated post comes back (spec 2026-10-15 §8). */
export type RepeatEvery = 'week' | '2weeks' | 'month'
/** A post's series as the server reads it: `more` copies still ahead after this post, `removable` what Stop removes. */
export interface Series { id: number; every: RepeatEvery; until: DateKey | null; more: number; removable: number; rewriting: boolean }
```

- [ ] **Step 5: The calls**

`frontend/src/content/lib/api.ts`: the type import (lines 2–6) gains `Goals, RepeatEvery, Snippet, SnippetKind, SnippetSuggestion` in alphabetical place; in `contentApi`, after `brand: (): Promise<BrandPayload> => watched(api.get(url('brand'))),`:

```ts
      goals: (): Promise<Goals> => watched(api.get(url('goals'))),
      repeatPost: (id: number, body: { every: RepeatEvery; until: DateKey; ai_rewrite: boolean }): Promise<{ post: PostDetail; copies: PostCard[] }> =>
        watched(api.post(url(`posts/${id}/repeat`), body)),
      /** Stops a series: its unpublished copies from today on go; `post` is null when the post asked about was one of them. */
      stopRepeat: (id: number): Promise<{ removed: number; post: PostDetail | null }> => watched(api.delete(url(`posts/${id}/repeat`))),
```

and after `refreshKnowledge: …,`:

```ts
      createSnippet: (fields: { kind: SnippetKind; name: string; body: string }): Promise<BrandPayload & { snippet: Snippet }> =>
        watched(api.post(url('brand/snippets'), fields)),
      updateSnippet: (id: number, fields: { name?: string; body?: string }): Promise<BrandPayload & { snippet: Snippet }> =>
        watched(api.put(url(`brand/snippets/${id}`), fields)),
      deleteSnippet: (id: number): Promise<BrandPayload> => watched(api.delete(url(`brand/snippets/${id}`))),
      /** One AI call: hashtag groups from the brand's pillars, audiences and industry; nothing is saved. */
      suggestSnippets: (): Promise<{ suggestions: SnippetSuggestion[] }> => watched(api.post(url('brand/snippets/suggest'))),
```

- [ ] **Step 6: The refusal words**

`frontend/src/content/lib/errors.ts`, inside `ERRORS` after the `brand` family:

```ts
  repeat: {
    already_repeating: 'This post already repeats.',
    no_day: 'Give the post a day first: a post repeats from its day.',
    no_dates: 'There is no day to repeat on before that date.',
    too_many_copies: 'A post repeats at most 26 times. Choose an earlier end date.',
    until_too_far: 'A post repeats for at most 12 months after its day.',
    too_many_ai: 'The AI rewrites at most 12 copies. Choose an earlier end date, or repeat the copies as they are.',
    ai_budget_used_up: "This month's AI budget is used up. The copies can still repeat without rewording.",
    not_found: 'This post no longer exists.',
    invalid: 'Check the repeat: how often, and until when.',
    unknown: 'The post could not be repeated. Please try again.',
  },
  snippet: {
    manager_only: 'Only an owner or a manager can change hashtags and snippets.',
    too_many_snippets: 'A brand keeps at most 50 of each. Remove one first.',
    invalid: 'Give it a name and some text.',
    not_found: 'This item no longer exists. The page now shows the brand as it is.',
    no_profile: 'This brand is not set up yet.',
    ai_budget_used_up: "This month's AI budget is used up.",
    ai_failed: 'The AI could not suggest hashtags. Please try again.',
    unknown: 'The change could not be saved. Please try again.',
  },
```

Write `$R3B/t1-words.json` with the Write tool (the English is exactly the `ERRORS` text above):

```json
{
  "repeat.error.already_repeating": { "en": "This post already repeats.", "ru": "Этот пост уже повторяется.", "de": "Dieser Beitrag wiederholt sich bereits.", "fr": "Cette publication se répète déjà.", "es": "Esta publicación ya se repite." },
  "repeat.error.no_day": { "en": "Give the post a day first: a post repeats from its day.", "ru": "Сначала задайте посту дату: пост повторяется от своего дня.", "de": "Geben Sie dem Beitrag zuerst einen Tag: Ein Beitrag wiederholt sich ab seinem Tag.", "fr": "Donnez d’abord un jour à la publication : elle se répète à partir de ce jour.", "es": "Primero asigna un día a la publicación: se repite a partir de ese día." },
  "repeat.error.no_dates": { "en": "There is no day to repeat on before that date.", "ru": "До этой даты нет ни одного дня для повтора.", "de": "Vor diesem Datum gibt es keinen Tag für eine Wiederholung.", "fr": "Il n’y a aucun jour de répétition avant cette date.", "es": "No hay ningún día para repetir antes de esa fecha." },
  "repeat.error.too_many_copies": { "en": "A post repeats at most 26 times. Choose an earlier end date.", "ru": "Пост повторяется не больше 26 раз. Выберите более раннюю дату окончания.", "de": "Ein Beitrag wiederholt sich höchstens 26-mal. Wählen Sie ein früheres Enddatum.", "fr": "Une publication se répète au plus 26 fois. Choisissez une date de fin plus proche.", "es": "Una publicación se repite como máximo 26 veces. Elige una fecha de fin anterior." },
  "repeat.error.until_too_far": { "en": "A post repeats for at most 12 months after its day.", "ru": "Пост повторяется не дольше 12 месяцев после своего дня.", "de": "Ein Beitrag wiederholt sich höchstens 12 Monate nach seinem Tag.", "fr": "Une publication se répète au plus 12 mois après son jour.", "es": "Una publicación se repite como máximo 12 meses después de su día." },
  "repeat.error.too_many_ai": { "en": "The AI rewrites at most 12 copies. Choose an earlier end date, or repeat the copies as they are.", "ru": "ИИ переписывает не больше 12 копий. Выберите более раннюю дату окончания или повторите копии без изменений.", "de": "Die KI schreibt höchstens 12 Kopien neu. Wählen Sie ein früheres Enddatum oder wiederholen Sie die Kopien unverändert.", "fr": "L’IA réécrit au plus 12 copies. Choisissez une date de fin plus proche, ou répétez les copies telles quelles.", "es": "La IA reescribe como máximo 12 copias. Elige una fecha de fin anterior o repite las copias tal cual." },
  "repeat.error.ai_budget_used_up": { "en": "This month's AI budget is used up. The copies can still repeat without rewording.", "ru": "Месячный бюджет на ИИ исчерпан. Копии можно повторить без переписывания.", "de": "Das KI-Budget dieses Monats ist aufgebraucht. Die Kopien können sich trotzdem unverändert wiederholen.", "fr": "Le budget IA du mois est épuisé. Les copies peuvent quand même se répéter sans reformulation.", "es": "El presupuesto de IA de este mes se ha agotado. Las copias pueden repetirse igualmente sin reescribirse." },
  "repeat.error.not_found": { "en": "This post no longer exists.", "ru": "Этого поста больше нет.", "de": "Diesen Beitrag gibt es nicht mehr.", "fr": "Cette publication n'existe plus.", "es": "Esta publicación ya no existe." },
  "repeat.error.invalid": { "en": "Check the repeat: how often, and until when.", "ru": "Проверьте повтор: как часто и до какой даты.", "de": "Prüfen Sie die Wiederholung: wie oft und bis wann.", "fr": "Vérifiez la répétition : à quelle fréquence et jusqu’à quand.", "es": "Revisa la repetición: con qué frecuencia y hasta cuándo." },
  "repeat.error.unknown": { "en": "The post could not be repeated. Please try again.", "ru": "Не удалось повторить пост. Попробуйте ещё раз.", "de": "Der Beitrag konnte nicht wiederholt werden. Bitte versuchen Sie es erneut.", "fr": "La publication n’a pas pu être répétée. Veuillez réessayer.", "es": "No se pudo repetir la publicación. Inténtalo de nuevo." },
  "snippet.error.manager_only": { "en": "Only an owner or a manager can change hashtags and snippets.", "ru": "Менять хештеги и заготовки может только владелец или менеджер.", "de": "Nur Inhaber oder Manager können Hashtags und Textbausteine ändern.", "fr": "Seul un propriétaire ou un responsable peut modifier les hashtags et les extraits.", "es": "Solo un propietario o un responsable puede cambiar los hashtags y los fragmentos." },
  "snippet.error.too_many_snippets": { "en": "A brand keeps at most 50 of each. Remove one first.", "ru": "У бренда может быть не больше 50 каждого вида. Сначала удалите один.", "de": "Eine Marke hat höchstens 50 von jeder Art. Entfernen Sie zuerst einen.", "fr": "Une marque en garde au plus 50 de chaque. Supprimez-en un d’abord.", "es": "Una marca guarda como máximo 50 de cada tipo. Quita uno primero." },
  "snippet.error.invalid": { "en": "Give it a name and some text.", "ru": "Укажите название и текст.", "de": "Geben Sie einen Namen und einen Text ein.", "fr": "Donnez-lui un nom et un texte.", "es": "Ponle un nombre y un texto." },
  "snippet.error.not_found": { "en": "This item no longer exists. The page now shows the brand as it is.", "ru": "Этого элемента больше нет. Страница показывает бренд как есть.", "de": "Diesen Eintrag gibt es nicht mehr. Die Seite zeigt die Marke, wie sie jetzt ist.", "fr": "Cet élément n’existe plus. La page montre la marque telle qu’elle est.", "es": "Este elemento ya no existe. La página muestra la marca tal como está." },
  "snippet.error.no_profile": { "en": "This brand is not set up yet.", "ru": "Бренд ещё не настроен.", "de": "Diese Marke ist noch nicht eingerichtet.", "fr": "Cette marque n’est pas encore configurée.", "es": "Esta marca aún no está configurada." },
  "snippet.error.ai_budget_used_up": { "en": "This month's AI budget is used up.", "ru": "Месячный бюджет на ИИ исчерпан.", "de": "Das KI-Budget dieses Monats ist aufgebraucht.", "fr": "Le budget IA du mois est épuisé.", "es": "El presupuesto de IA de este mes se ha agotado." },
  "snippet.error.ai_failed": { "en": "The AI could not suggest hashtags. Please try again.", "ru": "ИИ не смог предложить хештеги. Попробуйте ещё раз.", "de": "Die KI konnte keine Hashtags vorschlagen. Bitte versuchen Sie es erneut.", "fr": "L’IA n’a pas pu proposer de hashtags. Veuillez réessayer.", "es": "La IA no pudo sugerir hashtags. Inténtalo de nuevo." },
  "snippet.error.unknown": { "en": "The change could not be saved. Please try again.", "ru": "Не удалось сохранить изменение. Попробуйте ещё раз.", "de": "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "fr": "La modification n’a pas pu être enregistrée. Veuillez réessayer.", "es": "No se pudo guardar el cambio. Inténtalo de nuevo." }
}
```

Run: `cd /c/wamp64/www/Hexa-Tech-content && node "$R3B/words.mjs" "$R3B/t1-words.json"` → `words: 18 keys in 5 bundles`.

- [ ] **Step 7: A brand cache that keeps the snippets**

`frontend/src/content/brand/useBrand.ts`, above `export function useBrand()`:

```ts
/** What the brand cache keeps of an answer: the whole brand (some answers carry one item more), its snippets included. */
export function brandCache(payload: BrandPayload): BrandPayload {
  const { profile, audiences, channels, voice, readiness, snippets } = payload
  return { profile, audiences, channels, voice, readiness, snippets: snippets ?? [] }
}
```

and `adopt` becomes:

```ts
  const adopt = useCallback((payload: BrandPayload) => {
    queryClient.setQueryData<BrandPayload>(['content', brandId, 'brand'], brandCache(payload))
    void queryClient.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
  }, [queryClient, brandId])
```

- [ ] **Step 8: Run the tests, the types and the lint**

Run: `$R3B/vt.sh src/content` → all pass (`errors.test.ts` and `contentLocales.test.ts` hold the new families); `cd frontend && npx tsc -b` → clean; the scoped lint → the 17 baseline errors only.

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: types and calls for goals, repeat posts and snippets; their refusals in five languages; the brand cache keeps snippets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Click-to-add's model — what a new post from a day starts with; a new post can carry a time

**Files:**
- Create: `frontend/src/content/plan/addMath.ts`, `frontend/src/content/plan/addMath.test.ts`
- Modify: `frontend/src/content/panel/PanelProvider.tsx` (`NewDraft`), `frontend/src/content/panel/panelState.ts` (`newForm`), `frontend/src/content/panel/PostPanel.tsx`, `frontend/src/content/plan/PlanPage.tsx`
- Test: `frontend/src/content/panel/panelState.test.ts`, `frontend/src/content/panel/PostPanel.test.tsx`

**Interfaces:**
- Consumes: `suggestedTimes(platform, industry)`, `usualTime(channel, industry)` (`lib/bestTimes.ts`, Plan A); `Channel.post_time`.
- Produces: `canAdd(day: DateKey, today: DateKey): boolean`; `clickAdds(target: { closest?: (s: string) => unknown } | null): boolean`; `usualTimes(channels: readonly Channel[], industry: string | null | undefined): Partial<Record<Platform, string>>`; `newPostDraft(day, slots, channels, industry): NewDraft`; `NewDraft.time?: string | null`; on PlanPage: `channels: Channel[]` and `times` (usual time per platform) from the brand read.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/plan/addMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Channel } from '../lib/types'
import { canAdd, clickAdds, newPostDraft, usualTimes } from './addMath'

const channel = (id: number, platform: Channel['platform'], more: Partial<Channel> = {}): Channel => ({
  id, platform, label: platform, url: null, goal: null, role: null, cta_style: null, visual_style: null, link_policy: null, tone_override: null,
  default_language: null, emoji_policy: null, hashtag_policy: null, posts_per_week: 3, preferred_formats: null, frequency: null, audience_id: null,
  active: true, post_time: null, ...more,
})
/** An element whose `closest` finds the selectors listed (as the browser's would for what is around the click). */
const at = (...around: string[]) => ({ closest: (selector: string) => (selector.split(', ').some(s => around.includes(s)) ? {} : null) })

describe('canAdd', () => {
  // Review Focus 2: judged on the venue's today (the server's), never this computer's date.
  it('takes a new post from the venue\'s today on, never on a day already gone', () => {
    expect(canAdd('2026-10-07', '2026-10-07')).toBe(true)
    expect(canAdd('2026-10-08', '2026-10-07')).toBe(true)
    expect(canAdd('2026-10-06', '2026-10-07')).toBe(false)
  })
})

describe('clickAdds', () => {
  it('counts a click on a day\'s empty space, not on a card, a slot or a control', () => {
    expect(clickAdds(at())).toBe(true)
    expect(clickAdds(at('[data-post]'))).toBe(false)
    expect(clickAdds(at('[data-slot]'))).toBe(false)
    expect(clickAdds(at('button'))).toBe(false)
    expect(clickAdds(null)).toBe(false)
  })
})

describe('newPostDraft', () => {
  const channels = [channel(1, 'linkedin', { active: false }), channel(2, 'instagram', { post_time: '08:30' }), channel(3, 'facebook')]

  it('starts on the day\'s first open slot, at its channel\'s usual time', () => {
    expect(newPostDraft('2026-10-09', [{ date: '2026-10-08', platform: 'instagram' }, { date: '2026-10-09', platform: 'facebook' }], channels, 'beauty'))
      .toEqual({ date: '2026-10-09', platform: 'facebook', time: '10:00' })
  })

  it('else on the brand\'s first active channel, else on no platform (the panel then takes the first one)', () => {
    expect(newPostDraft('2026-10-09', [], channels, 'beauty')).toEqual({ date: '2026-10-09', platform: 'instagram', time: '08:30' })
    expect(newPostDraft('2026-10-09', [], [], 'beauty')).toEqual({ date: '2026-10-09', platform: null, time: null })
  })
})

describe('usualTimes', () => {
  it('gives each platform its first active channel\'s usual time', () => {
    expect(usualTimes([channel(1, 'instagram', { active: false, post_time: '07:00' }), channel(2, 'instagram'), channel(3, 'instagram', { post_time: '21:00' })], 'fitness'))
      .toEqual({ instagram: '06:30' })
  })
})
```

`frontend/src/content/panel/panelState.test.ts` (import `newForm` from `./panelState` if the file does not yet), at the end:

```ts
describe('a new post\'s time', () => {
  it('starts at the time its day or slot gave, else with none', () => {
    expect(newForm({ date: '2026-10-09', platform: 'instagram', time: '08:30' }, ['instagram']).scheduled_time).toBe('08:30')
    expect(newForm({ date: '2026-10-09', platform: 'instagram' }, ['instagram']).scheduled_time).toBe('')
  })
})
```

`frontend/src/content/panel/PostPanel.test.tsx`, after the test `starts a post from the New post button on the brand's own channel` (it ends at its `})`):

```tsx
  // Spec 2026-10-15 §4–§5: a post started from a day or a slot comes with that channel's usual time.
  it('starts a post from a day or a slot at the time it was given', () => {
    expect(render({ kind: 'new', draft: { date: '2026-10-09', platform: 'instagram', time: '08:30' }, seq: 1 }, null)).toMatch(/<input type="time" value="08:30"/)
  })

  it('starts a post from the New post button on the brand\'s first channel at that channel\'s usual time', () => {
    const brand = { audiences: [], channels: [{ id: 1, platform: 'linkedin', label: 'LinkedIn', active: true, post_time: null }] }
    expect(render({ kind: 'new', draft: { date: '2026-10-09', platform: null }, seq: 1 }, null, brand)).toMatch(/<input type="time" value="08:00"/)
  })
```

(The fixture's organisation is `beauty`: LinkedIn has no override there, so its first suggested time, 08:00.)

- [ ] **Step 2: Run them to see them fail**

Run: `$R3B/vt.sh src/content/plan/addMath.test.ts src/content/panel/panelState.test.ts src/content/panel/PostPanel.test.tsx`
Expected: FAIL — `addMath` does not exist; `newForm` ignores the time; the panel's time inputs are empty.

- [ ] **Step 3: The model**

Create `frontend/src/content/plan/addMath.ts`:

```ts
import { suggestedTimes, usualTime } from '../lib/bestTimes'
import type { Channel, DateKey, Platform, Slot } from '../lib/types'
import type { NewDraft } from '../panel/PanelProvider'

/** A day takes a new post from the venue's today on (spec 2026-10-15 §4): past days have no "+" and ignore clicks. */
export const canAdd = (day: DateKey, today: DateKey): boolean => day >= today

/** What a click inside a day hit: its empty space counts; a card, a slot, a link or a control does its own thing. */
export function clickAdds(target: { closest?: (selector: string) => unknown } | null): boolean {
  if (!target || typeof target.closest !== 'function') return false
  return !target.closest('button, a, input, select, textarea, label, summary, [data-post], [data-slot]')
}

/** Each platform's usual posting time (spec 2026-10-15 §5): its first active channel's own, else the first suggested time. */
export function usualTimes(channels: readonly Channel[], industry: string | null | undefined): Partial<Record<Platform, string>> {
  const out: Partial<Record<Platform, string>> = {}
  for (const channel of channels) {
    if (!channel.active || out[channel.platform] !== undefined) continue
    const time = usualTime(channel, industry)
    if (time) out[channel.platform] = time
  }
  return out
}

/**
 * A new post from a day (spec 2026-10-15 §4): the platform of the day's first open slot, else the brand's first active
 * channel, else none (the panel then takes the first platform); the time is that platform's usual time.
 */
export function newPostDraft(day: DateKey, slots: readonly Slot[], channels: readonly Channel[], industry: string | null | undefined): NewDraft {
  const platform = slots.find(s => s.date === day)?.platform ?? channels.find(c => c.active)?.platform ?? null
  const time = platform ? usualTimes(channels, industry)[platform] ?? suggestedTimes(platform, industry)[0] ?? null : null
  return { date: day, platform, time }
}
```

`frontend/src/content/panel/PanelProvider.tsx` line 7–8:

```tsx
/** What a new post starts from: the day, platform and time a day's "+", a slot or the New post button gave. */
export interface NewDraft { date: DateKey | null; platform: Platform | null; time?: string | null }
```

`frontend/src/content/panel/panelState.ts`, in `newForm`: `scheduled_time: draft.time ?? '',` (and the doc comment's first line: `A new post: the day, platform and time it was started with, or else the brand's own first`).

- [ ] **Step 4: The panel takes the first channel's usual time; the Plan reads the brand**

`frontend/src/content/panel/PostPanel.tsx` (add `import { usualTimes } from '../plan/addMath'`):
1. Line 61 becomes two lines:

```tsx
  const activeChannels = useMemo(() => (brandInfo.data?.channels ?? []).filter(c => c.active), [brandInfo.data])
  const channels = useMemo(() => activeChannels.map(c => c.platform), [activeChannels])
```

2. The first-channel adoption (lines 89–94) becomes:

```tsx
  // a new post with no slot behind it starts on the brand's own first channel, at that channel's usual time, once the
  // brand's channels are known (a time it was given, or one already typed, stays).
  const first = channels[0]
  if (next && next.post === null && target.kind === 'new' && target.draft.platform === null && first
    && next.base.platform !== first && next.draft.platform === next.base.platform) {
    const usual = target.draft.time ? null : usualTimes(activeChannels, boot.organization.industry)[first] ?? null
    const time = usual ?? next.base.scheduled_time
    const untouched = next.draft.scheduled_time === next.base.scheduled_time
    next = {
      ...next,
      base: { ...next.base, platform: first, scheduled_time: time },
      draft: { ...next.draft, platform: first, scheduled_time: untouched ? time : next.draft.scheduled_time },
    }
  }
```

`frontend/src/content/plan/PlanPage.tsx` (add `import { usualTimes } from './addMath'`): after `const refresh = () => refreshLists(queryClient, brand)` (line 91):

```tsx
  // The brand's channels (the same read as the panel's): what a new post from a day starts on, and each platform's usual time.
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const channels = useMemo(() => brandInfo.data?.channels ?? [], [brandInfo.data])
  const industry = boot.organization.industry
  const times = useMemo(() => usualTimes(channels, industry), [channels, industry])
```

and `write` (line 181) presets the time:

```tsx
  const write = (slot: Slot) => { panel.openNew({ date: slot.date, platform: slot.platform, time: times[slot.platform] ?? null }) }
```

(Fill needs nothing: the server gives a filled post its channel's usual time, Plan A Task 10.)

- [ ] **Step 5: Run the tests, the types and the lint**

Run: `$R3B/vt.sh src/content` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: a new post can carry a time — Write and the New post button start at the channel's usual time

What a new post from a day starts with (the day's first open slot, else
the brand's first active channel; that channel's usual time), and which
clicks inside a day count, as pure helpers for click-to-add.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Click-to-add in the week view — empty space, and a "+" at each day's foot

**Files:**
- Create: `frontend/src/content/plan/AddButton.tsx`
- Modify: `frontend/src/content/plan/WeekGrid.tsx`, `frontend/src/content/plan/PlanPage.tsx`
- Test: `frontend/src/content/plan/planPieces.test.tsx`
- Words: `content.plan.add_on`

**Interfaces:**
- Consumes: `canAdd`, `clickAdds`, `newPostDraft` (Task 2); PlanPage's `channels`, `industry` (Task 2); `drag.consumeClick()` (`useCardDrag`).
- Produces: `AddButton({ day, locale, onAdd, className? })` (a real button, `data-add="<day>"`, named "New post on {{day}}"); `WeekGrid`'s optional `onAdd?: (day: DateKey) => void`; PlanPage's `addOn(day: DateKey): void`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/plan/planPieces.test.tsx`, at the end:

```tsx
describe('click-to-add in the week', () => {
  // Spec 2026-10-15 §4 and Review Focus 2: a "+" at the foot of each day from the venue's today on, named by its day.
  it('puts a "+" named by its day at the foot of today and the days ahead, none on days already gone', () => {
    const days = rangeFor('week', '2026-10-07').days
    const out = html(<WeekGrid plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} onAdd={noop} />)
    expect(out).toContain('data-add="2026-10-07"')
    expect(out).toContain('data-add="2026-10-11"')
    expect(out).not.toContain('data-add="2026-10-06"')
    expect(out).toContain('aria-label="New post on Wednesday 7 October"')
  })

  it('shows the "+" on hover and focus where the device hovers, and always where it cannot', () => {
    const days = rangeFor('week', '2026-10-07').days
    const out = html(<WeekGrid plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} onAdd={noop} />)
    const button = out.match(/<button[^>]*data-add="2026-10-07"[^>]*>/)?.[0] ?? ''
    expect(button).toContain('[@media(hover:hover)]:opacity-0')
    expect(button).toContain('[@media(hover:hover)]:group-hover:opacity-100')
    expect(button).toContain('focus-visible:opacity-100')
    expect(out).toMatch(/<section[^>]*class="group /)
  })

  it('takes no clicks where the Plan gives no onAdd', () => {
    const days = rangeFor('week', '2026-10-07').days
    expect(html(<WeekGrid plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} />)).not.toContain('data-add=')
  })

  // Review Focus 1: the click a drag's release fires over a day's empty space reaches the day, not the card. The tests
  // cannot drag, so the guard is read from the source: a new post from a day goes through the drag's consumeClick first.
  it('lets no drag release open a new post: the same guard as opening a card', () => {
    const source = fs.readFileSync(new URL('./PlanPage.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/const addOn = \(day: DateKey\) => \{\s*if \(drag\.consumeClick\(\) \|\| !canAdd\(day, today\)\) return/)
  })
})
```

(Add `import fs from 'node:fs'` at the top of `planPieces.test.tsx`.)

- [ ] **Step 2: Run them to see them fail**

Run: `$R3B/vt.sh src/content/plan/planPieces.test.tsx`
Expected: FAIL — no `data-add` buttons; the day sections carry no `group` class; PlanPage has no `addOn`.

- [ ] **Step 3: The "+"**

Create `frontend/src/content/plan/AddButton.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey } from '../lib/types'

/**
 * The "+" that opens a new post on a day (spec 2026-10-15 §4): shown on hover and keyboard focus where the device
 * hovers, always where it cannot (a phone, a tablet). A real button, named by its day. Release 4 turns it into a menu.
 */
export function AddButton({ day, locale, onAdd, className = '' }: { day: DateKey; locale: string; onAdd: (day: DateKey) => void; className?: string }) {
  const { t } = useTranslation()
  const name = t('content.plan.add_on', 'New post on {{day}}', { day: formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long' }) })
  return (
    <button type="button" data-add={day} aria-label={name} title={name} onClick={() => onAdd(day)}
      className={`inline-flex items-center justify-center rounded-md border border-dashed border-a-border px-2 py-1 text-a-text-2 transition-opacity hover:border-a-accent-text hover:text-a-accent-text focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 ${className}`}>
      <Plus size={14} aria-hidden />
    </button>
  )
}
```

- [ ] **Step 4: The week view and the Plan**

`frontend/src/content/plan/WeekGrid.tsx` (add `import { AddButton } from './AddButton'` and `import { canAdd, clickAdds } from './addMath'`):
1. The props gain, after `aiPaused: boolean`:

```tsx
  /** Opens a new post on a day (spec 2026-10-15 §4): its empty space and its "+", from today on. Absent, days take no clicks. */
  onAdd?: (day: DateKey) => void
```

(and `onAdd` joins the destructured props).
2. The `plans.map(day => (…))` body becomes:

```tsx
        {plans.map(day => {
          const adds = onAdd !== undefined && canAdd(day.date, today)
          return (
            <section key={day.date} data-drop-date={day.date} aria-labelledby={`day-${day.date}`}
              onClick={adds ? (e) => { if (clickAdds(e.target as Element)) onAdd(day.date) } : undefined}
              className={`group flex min-w-0 flex-col gap-2 p-2 transition-colors ${dropDate === day.date ? 'bg-a-accent/10' : ''}`}>
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
              {adds && <AddButton day={day.date} locale={locale} onAdd={onAdd} className="mt-auto self-start" />}
            </section>
          )
        })}
```

`frontend/src/content/plan/PlanPage.tsx` (add `canAdd, newPostDraft` to the `./addMath` import):
1. After `fill` (line 198):

```tsx
  // A day's empty space or its "+" (spec 2026-10-15 §4). The click a drag's release fires over a day's empty space is
  // not one (Review Focus 1): the same guard as opening a card.
  const addOn = (day: DateKey) => {
    if (drag.consumeClick() || !canAdd(day, today)) return
    panel.openNew(newPostDraft(day, data?.slots ?? [], channels, industry))
  }
```

(`data?.slots` is the plan's own list, before the platform filter: a new post starts on the day's first open slot whatever the chips show.)
2. The `WeekGrid` element gains `onAdd={addOn}`.

- [ ] **Step 5: The words**

Write `$R3B/t3-words.json`:

```json
{
  "plan.add_on": { "en": "New post on {{day}}", "ru": "Новый пост на {{day}}", "de": "Neuer Beitrag am {{day}}", "fr": "Nouvelle publication le {{day}}", "es": "Nueva publicación el {{day}}" }
}
```

Run: `node "$R3B/words.mjs" "$R3B/t3-words.json"` → `words: 1 keys in 5 bundles`.

- [ ] **Step 6: Run the tests, the types and the lint**

Run: `$R3B/vt.sh src/content` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content Plan: click a day's empty space, or its "+", to start a post there

The "+" sits at each day's foot from the venue's today on, shown on hover
and focus where the device hovers and always where it cannot; past days
take no clicks; a drag that ends over empty space opens nothing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Click-to-add in the month and list views

**Files:**
- Modify: `frontend/src/content/plan/MonthGrid.tsx`, `frontend/src/content/plan/ListView.tsx`, `frontend/src/content/plan/PlanPage.tsx`
- Test: `frontend/src/content/plan/planPieces.test.tsx`, `frontend/src/content/plan/PlanPage.test.tsx`

**Interfaces:**
- Consumes: `AddButton` (Task 3); `canAdd`, `clickAdds` (Task 2); PlanPage's `addOn` (Task 3).
- Produces: `MonthGrid` and `ListView` optional `onAdd?: (day: DateKey) => void`. The list view with `onAdd` also lists today and the days ahead when they are empty (each with its "+"); without `onAdd` it lists only days that hold something, as before.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/plan/planPieces.test.tsx`, at the end:

```tsx
describe('click-to-add in the month and the list', () => {
  it('puts a "+" in the corner of a month day from today on; the date number still opens the week', () => {
    const days = rangeFor('month', '2026-10-07').days
    const out = html(<MonthGrid plans={plansFor(days, [], [])} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop} onAdd={noop} />)
    expect(out).toContain('data-add="2026-10-07"')
    expect(out).not.toContain('data-add="2026-10-06"')
    expect(out).toMatch(/<button[^>]*data-add="2026-10-07"[^>]*class="[^"]*absolute right-1 top-1/)
    expect(out).toContain('aria-label="Wednesday 7 October"')
  })

  it('lists today and the days ahead with a "+" even when empty, and leaves out empty days already gone', () => {
    const days = rangeFor('list', '2026-10-07').days
    const out = html(<ListView plans={plansFor(days, [post(1, { scheduled_date: '2026-10-05' })], [])} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers} onAdd={noop} />)
    expect(out.match(/<section/g)).toHaveLength(6) // Monday (its post), then Wednesday to Sunday
    expect(out).not.toContain('list-2026-10-06')
    expect(out).toContain('data-add="2026-10-07"')
    expect(out).not.toContain('data-add="2026-10-05"')
    expect(out).toContain('Nothing planned')
  })
})
```

`frontend/src/content/plan/PlanPage.test.tsx` (the Plan renders its list view in tests), at the end of its describe block:

```tsx
  // Spec 2026-10-15 §4: the list (the phone's view) offers a new post on the days ahead.
  it('offers a new post on a day ahead', () => {
    expect(page()).toMatch(/data-add="\d{4}-\d{2}-\d{2}"/)
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R3B/vt.sh src/content/plan/planPieces.test.tsx src/content/plan/PlanPage.test.tsx`
Expected: FAIL — no `data-add` in the month or the list; the list leaves out empty days.

- [ ] **Step 3: The month view**

`frontend/src/content/plan/MonthGrid.tsx` (add `import { AddButton } from './AddButton'` and `import { canAdd, clickAdds } from './addMath'`):
1. The props gain `onAdd?: (day: DateKey) => void` (doc: `/** Opens a new post on a day (spec 2026-10-15 §4): its empty space and its corner "+", from today on. */`), destructured.
2. In the cell, before `return (`: `const adds = onAdd !== undefined && canAdd(day.date, today)`; the cell's `<div key={day.date} data-drop-date={day.date} …>` gains `onClick={adds ? (e) => { if (clickAdds(e.target as Element)) onAdd(day.date) } : undefined}` and its class starts with `group relative ` (before `min-h-[7.5rem]`).
3. Right after the date-number `</button>` (line 41):

```tsx
                {adds && <AddButton day={day.date} locale={locale} onAdd={onAdd} className="absolute right-1 top-1" />}
```

- [ ] **Step 4: The list view**

`frontend/src/content/plan/ListView.tsx` (add `import { AddButton } from './AddButton'` and `import { canAdd } from './addMath'`):
1. The props gain `onAdd?: (day: DateKey) => void` (doc: `/** Opens a new post on a day (spec 2026-10-15 §4): a "+" at the end of each day's header, from today on. */`), destructured.
2. The day filter (line 19) becomes:

```tsx
  // The days that hold something, and — where a new post can be started — today and the days ahead even when empty.
  const days = plans.filter(day => day.posts.length > 0 || day.slots.length > 0 || (onAdd !== undefined && canAdd(day.date, today)))
```

3. The `<section …>` gains `group ` at the start of its class; its `<h3 …>…</h3>` is wrapped with the "+" after it:

```tsx
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id={`list-${day.date}`} aria-current={day.date === today ? 'date' : undefined} className="font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">
                {formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                {day.date === today && <span className="ml-2 rounded-full bg-a-accent px-2 py-0.5 normal-case tracking-normal text-a-accent-ink">{t('content.common.today', 'Today')}</span>}
              </h3>
              {onAdd && canAdd(day.date, today) && <AddButton day={day.date} locale={locale} onAdd={onAdd} />}
            </div>
```

(the `mb-2` moves from the `<h3>` to the wrapper).
4. Inside the cards grid, after the slots: `{day.posts.length === 0 && day.slots.length === 0 && <p className="text-xs text-a-text-2">{t('content.plan.empty_day', 'Nothing planned')}</p>}`.

- [ ] **Step 5: The Plan passes it on**

`frontend/src/content/plan/PlanPage.tsx`: the `MonthGrid` element gains `onAdd={addOn}`; the `ListView` element gains `onAdd={addOn}`.

- [ ] **Step 6: Run the tests, the types and the lint**

Run: `$R3B/vt.sh src/content` → all pass (the existing list test, without `onAdd`, still lists only days that hold something); `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content Plan: click-to-add in the month (empty space, a corner "+") and the list (a "+" on each day's header)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Best-time hints — the slot's line, the panel's time chips, a channel's usual time on the Brand page

**Files:**
- Modify: `frontend/src/content/plan/SlotRow.tsx`, `frontend/src/content/plan/WeekGrid.tsx`, `frontend/src/content/plan/ListView.tsx`, `frontend/src/content/plan/PlanPage.tsx`, `frontend/src/content/panel/PostFormFields.tsx`, `frontend/src/content/panel/PostPanel.tsx`, `frontend/src/content/brand/listActions.ts`, `frontend/src/content/brand/sections/Channels.tsx`
- Test: `frontend/src/content/plan/planPieces.test.tsx`, `frontend/src/content/panel/PostPanel.test.tsx`, `frontend/src/content/brand/listActions.test.ts`, `frontend/src/content/brand/brandLists.test.tsx`
- Words: `content.plan.slot.best`, `content.panel.fields.time_suggested`, `content.brand.channels.{post_time,post_time_suggested,post_time_hint,usual_at}`

**Interfaces:**
- Consumes: `suggestedTimes`, `usualTime` (`lib/bestTimes.ts`); PlanPage's `times: Partial<Record<Platform, string>>` (Task 2).
- Produces: `SlotRow`'s optional `time?: string | null`; `WeekGrid`'s and `ListView`'s optional `times?: Partial<Record<Platform, string>>`; `PostFormFields`' new prop `industry: string | null`; `ChannelForm.post_time: string`, `channelFields` sends `post_time` (`null` when empty).

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/plan/planPieces.test.tsx`, at the end:

```tsx
describe('best-time hints', () => {
  // Spec 2026-10-15 §5: an empty slot reads "Best around {{time}}".
  it('says when an empty slot is best posted, and nothing without a time', () => {
    expect(html(<SlotRow slot={{ date: '2026-10-07', platform: 'instagram' }} time="08:30" filling={false} aiPaused={false} onWrite={noop} onFill={noop} />)).toContain('Best around 08:30')
    expect(html(<SlotRow slot={{ date: '2026-10-07', platform: 'instagram' }} filling={false} aiPaused={false} onWrite={noop} onFill={noop} />)).not.toContain('Best around')
  })

  it('gives each slot of the week and of the list its platform\'s usual time', () => {
    const days = rangeFor('week', '2026-10-07').days
    const plans = plansFor(days, [], [{ date: '2026-10-08', platform: 'instagram' }])
    expect(html(<WeekGrid plans={plans} times={{ instagram: '19:00' }} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers} />)).toContain('Best around 19:00')
    expect(html(<ListView plans={plans} times={{ instagram: '19:00' }} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers} />)).toContain('Best around 19:00')
  })
})
```

`frontend/src/content/panel/PostPanel.test.tsx`, at the end of its describe block:

```tsx
  // Spec 2026-10-15 §5: the time field offers the platform's suggested times as one-click chips.
  it('offers the platform\'s suggested times beside the time, the chosen one pressed', () => {
    const out = render({ kind: 'post', id: 5, seq: 1 }, { ...post, scheduled_time: '19:00' })
    expect(out).toContain('aria-label="Suggested times"')
    expect(out).toMatch(/<button[^>]*aria-pressed="false"[^>]*>11:00<\/button>/)
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*>19:00<\/button>/)
  })
```

(The fixture's post is on Instagram in a `beauty` organisation: Instagram has no beauty override, so 11:00 and 19:00.)

`frontend/src/content/brand/listActions.test.ts`, at the end:

```ts
describe('a channel\'s usual time', () => {
  it('keeps it in the form, sends it, and sends an emptied one as none', () => {
    const c = { id: 7, platform: 'instagram', label: 'Insta', active: true, frequency: null, post_time: '08:30' } as unknown as Channel
    expect(channelForm(c, 'instagram').post_time).toBe('08:30')
    expect(channelFields(channelForm(c, 'instagram')).post_time).toBe('08:30')
    expect(channelFields({ ...channelForm(c, 'instagram'), post_time: '' }).post_time).toBeNull()
    expect(channelForm(null, 'instagram').post_time).toBe('')
  })
})
```

`frontend/src/content/brand/brandLists.test.tsx` (import `ChannelsSection` from `./sections/Channels` and `brandWith`, `renderBrand` from `./brandTesting` if the file does not yet), at the end:

```tsx
describe('a channel\'s usual time on the Brand page', () => {
  // Spec 2026-10-15 §5: the channel editor shows the usual time with the suggested times as chips.
  it('shows it in the list and asks for it in the editor with the suggested times', () => {
    const channel = { id: 1, platform: 'instagram', label: 'Instagram', active: true, post_time: '08:30', frequency: { mon: true }, posts_per_week: 3 }
    const brand = brandWith({ channels: [channel as unknown as ReturnType<typeof brandWith>['channels'][number]] })
    expect(renderBrand(brand, true, <ChannelsSection brand={brand} canEdit />)).toContain('usually at 08:30')
    const open = renderBrand(brand, true, <ChannelsSection brand={brand} canEdit startOpen onSaved={() => {}} />)
    expect(open).toContain('Usual posting time')
    expect(open).toContain('aria-label="Suggested times"')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R3B/vt.sh src/content/plan/planPieces.test.tsx src/content/panel/PostPanel.test.tsx src/content/brand/listActions.test.ts src/content/brand/brandLists.test.tsx`
Expected: FAIL — no "Best around", no time chips, no `post_time` in the channel form, no usual time on the Brand page.

- [ ] **Step 3: The Plan's slots**

`frontend/src/content/plan/SlotRow.tsx`: the props gain `/** The platform's usual time (spec 2026-10-15 §5): the slot says when it is best posted. */ time?: string | null`, destructured; after `<PlatformMark platform={slot.platform} size="sm" />`:

```tsx
      {time && <span className="text-xs text-a-text-2">{t('content.plan.slot.best', 'Best around {{time}}', { time })}</span>}
```

`frontend/src/content/plan/WeekGrid.tsx` and `frontend/src/content/plan/ListView.tsx`: each gains the prop `/** Each platform's usual time, for its slots' "Best around". */ times?: Partial<Record<Platform, string>>` (import `Platform` from `../lib/types`), destructured, and each `<SlotRow …>` gains `time={times?.[slot.platform] ?? null}`.

`frontend/src/content/plan/PlanPage.tsx`: the `WeekGrid` and `ListView` elements gain `times={times}`.

- [ ] **Step 4: The panel's time chips**

`frontend/src/content/panel/PostFormFields.tsx` (add `import { suggestedTimes } from '../lib/bestTimes'`):
1. The props gain `/** The organisation's industry: the time field's suggested times follow it (spec 2026-10-15 §5). */ industry: string | null`, destructured.
2. The time `FieldBox` (lines 66–68) becomes (the chips sit outside the label, so the label still names only the input):

```tsx
        <div className="min-w-0">
          <FieldBox label={t('content.panel.fields.time', 'Time')} invalid={invalid.includes('scheduled_time')}>
            <input type="time" value={form.scheduled_time} onChange={(e) => set('scheduled_time', e.target.value)} aria-invalid={bad('scheduled_time')} className={box('scheduled_time')} />
          </FieldBox>
          {suggested.length > 0 && (
            <div role="group" aria-label={t('content.panel.fields.time_suggested', 'Suggested times')} className="mt-1.5 flex flex-wrap gap-1">
              {suggested.map(time => (
                <button key={time} type="button" aria-pressed={form.scheduled_time === time} onClick={() => set('scheduled_time', time)}
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${form.scheduled_time === time ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>{time}</button>
              ))}
            </div>
          )}
        </div>
```

with `const suggested = suggestedTimes(form.platform, industry)` beside the other constants at the top of the component.

`frontend/src/content/panel/PostPanel.tsx`: the `PostFormFields` element gains `industry={boot.organization.industry}`.

- [ ] **Step 5: A channel's usual time on the Brand page**

`frontend/src/content/brand/listActions.ts`:
1. `ChannelForm` gains `post_time: string` (at the end of its second line).
2. `channelForm` gains `post_time: asText(c?.post_time),` (after `default_language: …`).
3. `channelFields` gains `post_time: orNull(f.post_time),` (after `default_language: …`).

`frontend/src/content/brand/sections/Channels.tsx` (add `import { suggestedTimes, usualTime } from '../../lib/bestTimes'`):
1. In `ChannelEditor`, after the "Posts per week" `<label>…</label>` (lines 78–81):

```tsx
          <div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-a-text-2">{w('post_time', 'Usual posting time')}</span>
              <input type="time" value={form.post_time} onChange={(e) => set({ post_time: e.target.value })} className={`${INPUT} border-a-border`} />
            </label>
            <div role="group" aria-label={w('post_time_suggested', 'Suggested times')} className="mt-1.5 flex flex-wrap gap-1">
              {suggestedTimes(form.platform, boot.organization.industry).map(time => (
                <button key={time} type="button" aria-pressed={form.post_time === time} onClick={() => set({ post_time: form.post_time === time ? '' : time })}
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${form.post_time === time ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>{time}</button>
              ))}
            </div>
            <span className="mt-1 block text-xs text-a-text-2">
              {t('content.brand.channels.post_time_hint', 'Left empty, posts start at {{time}}.', { time: suggestedTimes(form.platform, boot.organization.industry)[0] ?? '' })}
            </span>
          </div>
```

2. In `ChannelsSection` (add `const boot = useBoot()` at its top if it is not there yet), the list row's second line (lines 179–182) gains, after the posts-a-week part:

```tsx
                        {usualTime(channel, boot.organization.industry) ? ` · ${t('content.brand.channels.usual_at', 'usually at {{time}}', { time: usualTime(channel, boot.organization.industry) })}` : ''}
```

- [ ] **Step 6: The words**

Write `$R3B/t5-words.json`:

```json
{
  "plan.slot.best": { "en": "Best around {{time}}", "ru": "Лучше около {{time}}", "de": "Am besten gegen {{time}}", "fr": "Idéal vers {{time}}", "es": "Mejor hacia las {{time}}" },
  "panel.fields.time_suggested": { "en": "Suggested times", "ru": "Рекомендуемое время", "de": "Vorgeschlagene Zeiten", "fr": "Heures suggérées", "es": "Horas sugeridas" },
  "brand.channels.post_time": { "en": "Usual posting time", "ru": "Обычное время публикации", "de": "Übliche Postingzeit", "fr": "Heure de publication habituelle", "es": "Hora habitual de publicación" },
  "brand.channels.post_time_suggested": { "en": "Suggested times", "ru": "Рекомендуемое время", "de": "Vorgeschlagene Zeiten", "fr": "Heures suggérées", "es": "Horas sugeridas" },
  "brand.channels.post_time_hint": { "en": "Left empty, posts start at {{time}}.", "ru": "Если не указано, посты начинаются в {{time}}.", "de": "Leer gelassen, beginnen Beiträge um {{time}}.", "fr": "Laissée vide, les publications commencent à {{time}}.", "es": "Si se deja vacía, las publicaciones empiezan a las {{time}}." },
  "brand.channels.usual_at": { "en": "usually at {{time}}", "ru": "обычно в {{time}}", "de": "meist um {{time}}", "fr": "généralement à {{time}}", "es": "normalmente a las {{time}}" }
}
```

Run: `node "$R3B/words.mjs" "$R3B/t5-words.json"` → `words: 6 keys in 5 bundles`.

- [ ] **Step 7: Run the tests, the types and the lint**

Run: `$R3B/vt.sh src/content` → all pass (the existing channel round-trip tests hold: an untouched form still sends nothing); `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: best-time hints — slots say when they are best posted, the panel offers suggested times, channels keep a usual time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Hashtags and snippets — the Brand page section

**Files:**
- Create: `frontend/src/content/brand/snippetActions.ts`, `frontend/src/content/brand/snippetActions.test.ts`, `frontend/src/content/brand/sections/Snippets.tsx`, `frontend/src/content/brand/snippets.test.tsx`
- Modify: `frontend/src/content/brand/BrandPage.tsx`
- Words: `content.brand.snippets.*`

**Interfaces:**
- Consumes: `createSnippet`, `updateSnippet`, `deleteSnippet`, `suggestSnippets` (Task 1); `errorKey('snippet', …)` (Task 1); `useBrand().adopt` keeping snippets (Task 1).
- Produces: `MAX_SNIPPETS = 50`; `snippetsOf(brand: BrandPayload | null, kind: SnippetKind): Snippet[]`; `SnippetForm { name; body }`; `snippetForm(s: Snippet | null): SnippetForm`; `snippetProblem(f: SnippetForm): 'invalid' | null`; `saveSnippet({ api, adopt }, snippet: Snippet | null, kind, form): Promise<void>`; `removeSnippet({ api, adopt }, id): Promise<void>`; `SnippetsSection({ brand, canEdit })`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/brand/snippetActions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { BrandPayload, Snippet } from '../lib/types'
import { removeSnippet, saveSnippet, snippetProblem, snippetsOf } from './snippetActions'

const brand = { snippets: [{ id: 1, kind: 'hashtags', name: 'A', body: '#a' }, { id: 2, kind: 'text', name: 'B', body: 'b' }] } as unknown as BrandPayload
const answer = { profile: null } as unknown as BrandPayload

describe('snippetActions', () => {
  it('lists one kind, and stops a save with no name or no text', () => {
    expect(snippetsOf(brand, 'text').map(s => s.id)).toEqual([2])
    expect(snippetsOf(null, 'hashtags')).toEqual([])
    expect(snippetProblem({ name: ' ', body: '#a' })).toBe('invalid')
    expect(snippetProblem({ name: 'A', body: '' })).toBe('invalid')
    expect(snippetProblem({ name: 'A', body: '#a' })).toBeNull()
  })

  it('creates with its kind, edits with only what changed, sends nothing for no change, removes by id', async () => {
    const api = { createSnippet: vi.fn(async () => answer), updateSnippet: vi.fn(async () => answer), deleteSnippet: vi.fn(async () => answer) }
    const adopt = vi.fn()
    await saveSnippet({ api, adopt }, null, 'hashtags', { name: ' Autumn ', body: '#autumn ' })
    expect(api.createSnippet).toHaveBeenCalledWith({ kind: 'hashtags', name: 'Autumn', body: '#autumn' })
    const existing: Snippet = { id: 4, kind: 'text', name: 'Sign-off', body: 'Bye' }
    await saveSnippet({ api, adopt }, existing, 'text', { name: 'Sign-off', body: 'See you!' })
    expect(api.updateSnippet).toHaveBeenCalledWith(4, { body: 'See you!' })
    await saveSnippet({ api, adopt }, existing, 'text', { name: 'Sign-off', body: 'Bye' })
    expect(api.updateSnippet).toHaveBeenCalledTimes(1)
    await removeSnippet({ api, adopt }, 4)
    expect(api.deleteSnippet).toHaveBeenCalledWith(4)
    expect(adopt).toHaveBeenCalledTimes(3)
  })
})
```

Create `frontend/src/content/brand/snippets.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'

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

import type { Snippet } from '../lib/types'
import { brandWith, renderBrand } from './brandTesting'
import { SnippetsSection } from './sections/Snippets'

const snippets: Snippet[] = [
  { id: 1, kind: 'hashtags', name: 'Autumn colour', body: '#autumnhair #copperhair' },
  { id: 2, kind: 'text', name: 'Sign-off', body: 'See you at the studio!' },
]
const addButton = (html: string, words: string) => html.match(new RegExp(`<button(?:(?!</button>).)*${words}</button>`))?.[0] ?? ''

// Spec 2026-10-15 §6: everyone reads the hashtag groups and snippets; managers add, edit, remove and ask the AI.
describe('SnippetsSection', () => {
  it('shows everyone the hashtag groups and snippets; only managers get the buttons', () => {
    const brand = brandWith({ snippets })
    const staff = renderBrand(brand, false, <SnippetsSection brand={brand} canEdit={false} />)
    expect(staff).toContain('Hashtags and snippets')
    expect(staff).toContain('#autumnhair #copperhair')
    expect(staff).toContain('See you at the studio!')
    expect(staff).not.toContain('Add a hashtag group')
    expect(staff).not.toContain('Suggest hashtag groups with AI')
    const manager = renderBrand(brand, true, <SnippetsSection brand={brand} canEdit />)
    expect(manager).toContain('Add a hashtag group')
    expect(manager).toContain('Add a snippet')
    expect(manager).toContain('Suggest hashtag groups with AI')
  })

  it('says when there are none yet, and stops adding at fifty of a kind', () => {
    const empty = brandWith({ snippets: [] })
    expect(renderBrand(empty, true, <SnippetsSection brand={empty} canEdit />)).toContain('No hashtag groups yet.')
    const full = brandWith({ snippets: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, kind: 'hashtags' as const, name: `G${i}`, body: '#a' })) })
    const out = renderBrand(full, true, <SnippetsSection brand={full} canEdit />)
    expect(addButton(out, 'Add a hashtag group')).toContain('disabled=""')
    expect(addButton(out, 'Add a snippet')).not.toContain('disabled=""')
    expect(out).toContain('A brand keeps at most 50 of each. Remove one first.')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R3B/vt.sh src/content/brand/snippetActions.test.ts src/content/brand/snippets.test.tsx`
Expected: FAIL — `snippetActions` and `sections/Snippets` do not exist.

- [ ] **Step 3: The actions**

Create `frontend/src/content/brand/snippetActions.ts`:

```ts
import type { ContentApi } from '../lib/api'
import type { BrandPayload, Snippet, SnippetKind } from '../lib/types'

/** A brand keeps at most this many of each kind (the server's ContentPlannerSnippet::MAX_PER_KIND). */
export const MAX_SNIPPETS = 50

/** A brand's hashtag groups or its text snippets, in the server's order. */
export const snippetsOf = (brand: BrandPayload | null, kind: SnippetKind): Snippet[] => (brand?.snippets ?? []).filter(s => s.kind === kind)

/** One hashtag group or snippet as typed. */
export interface SnippetForm { name: string; body: string }
export const snippetForm = (s: Snippet | null): SnippetForm => ({ name: s?.name ?? '', body: s?.body ?? '' })

/** What stops a save before the server sees it (it would refuse it too): no name, or no text. */
export const snippetProblem = (f: SnippetForm): 'invalid' | null => (f.name.trim() === '' || f.body.trim() === '' ? 'invalid' : null)

type Adopt = (payload: BrandPayload) => void

/** A new hashtag group or snippet, or an edit with only what changed (nothing sent for no change); the brand's answer is adopted. */
export async function saveSnippet(
  { api, adopt }: { api: Pick<ContentApi, 'createSnippet' | 'updateSnippet'>; adopt: Adopt },
  snippet: Snippet | null, kind: SnippetKind, form: SnippetForm,
): Promise<void> {
  const name = form.name.trim()
  const body = form.body.trim()
  if (snippet === null) {
    adopt(await api.createSnippet({ kind, name, body }))
    return
  }
  const fields: { name?: string; body?: string } = {}
  if (name !== snippet.name) fields.name = name
  if (body !== snippet.body) fields.body = body
  if (Object.keys(fields).length === 0) return
  adopt(await api.updateSnippet(snippet.id, fields))
}

export async function removeSnippet({ api, adopt }: { api: Pick<ContentApi, 'deleteSnippet'>; adopt: Adopt }, id: number): Promise<void> {
  adopt(await api.deleteSnippet(id))
}
```

- [ ] **Step 4: The section**

Create `frontend/src/content/brand/sections/Snippets.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Sparkles } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BrandPayload, Snippet, SnippetKind, SnippetSuggestion } from '../../lib/types'
import { TextField } from '../inputs'
import { MAX_SNIPPETS, removeSnippet, saveSnippet, snippetForm, snippetProblem, snippetsOf, type SnippetForm } from '../snippetActions'
import { useBrand } from '../useBrand'

/** One hashtag group or snippet being written: a name and its text; Save checks both before sending. */
function SnippetEditor({ kind, snippet, onDone }: { kind: SnippetKind; snippet: Snippet | null; onDone: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const { adopt } = useBrand()
  const [form, setForm] = useState<SnippetForm>(() => snippetForm(snippet))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.snippets.${key}`, english)

  const save = async () => {
    const problem = snippetProblem(form)
    if (problem) {
      const [key, text] = errorKey('snippet', problem)
      setError(t(key, text))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveSnippet({ api, adopt }, snippet, kind, form)
      onDone()
    } catch (e) {
      const [key, text] = errorKey('snippet', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-a-border p-3">
      <TextField label={w('name', 'Name')} value={form.name} maxLength={60} required onChange={(name) => setForm({ ...form, name })} />
      <TextField label={kind === 'hashtags' ? w('tags', 'Hashtags') : w('text', 'Text')} value={form.body} maxLength={2000} rows={kind === 'hashtags' ? 2 : 3}
        hint={kind === 'hashtags' ? w('tags_hint', 'Separate them with spaces.') : undefined} onChange={(body) => setForm({ ...form, body })} />
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { void save() }} loading={busy}>{t('content.brand.save', 'Save')}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onDone}>{t('content.common.cancel', 'Cancel')}</Button>
      </div>
    </div>
  )
}

/** The AI's hashtag groups for this brand (one call, nothing saved): each added on its own with Add. */
function Suggestions({ full }: { full: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const { adopt } = useBrand()
  const [items, setItems] = useState<SnippetSuggestion[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paused = boot.ai.status === 'over'
  const w = (key: string, english: string) => t(`content.brand.snippets.${key}`, english)
  const fail = (e: unknown) => {
    const [key, text] = errorKey('snippet', failureOf(e).code)
    setError(t(key, text))
  }

  const ask = async () => {
    setBusy('ask')
    setError(null)
    try {
      setItems((await api.suggestSnippets()).suggestions)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }
  const add = async (item: SnippetSuggestion) => {
    setBusy(item.name)
    setError(null)
    try {
      await saveSnippet({ api, adopt }, null, 'hashtags', item)
      setItems(list => (list ?? []).filter(s => s !== item))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-a-border p-3">
      <Button size="sm" variant="secondary" loading={busy === 'ask'} disabled={paused || busy !== null} onClick={() => { void ask() }}>
        <Sparkles size={14} aria-hidden />{w('suggest', 'Suggest hashtag groups with AI')}
      </Button>
      {paused && <p className="text-xs text-a-text-2">{t('content.snippet.error.ai_budget_used_up', "This month's AI budget is used up.")}</p>}
      {items !== null && items.length === 0 && <p className="text-sm text-a-text-2">{w('no_suggestions', 'No more suggestions. Ask again for new ones.')}</p>}
      {items?.map(item => (
        <div key={item.name} className="flex flex-wrap items-start gap-3 rounded-lg bg-a-surface-2 p-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-a-text">{item.name}</p>
            <p className="break-words text-xs text-a-text-2">{item.body}</p>
          </div>
          <Button size="sm" variant="secondary" loading={busy === item.name} disabled={full || (busy !== null && busy !== item.name)} onClick={() => { void add(item) }}>
            {w('add_suggestion', 'Add')}
          </Button>
        </div>
      ))}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}

/** One kind's list: its rows, and for managers Add, Edit, Remove (asking first), and — for hashtag groups — the AI's suggestions. */
function SnippetList({ kind, brand, canEdit }: { kind: SnippetKind; brand: BrandPayload; canEdit: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const { adopt } = useBrand()
  const [open, setOpen] = useState<number | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const list = snippetsOf(brand, kind)
  const full = list.length >= MAX_SNIPPETS
  const w = (key: string, english: string) => t(`content.brand.snippets.${key}`, english)

  const remove = async (snippet: Snippet) => {
    if (!window.confirm(t('content.brand.snippets.remove_confirm', 'Remove “{{name}}”?', { name: snippet.name }))) return
    setError(null)
    try {
      await removeSnippet({ api, adopt }, snippet.id)
    } catch (e) {
      const [key, text] = errorKey('snippet', failureOf(e).code)
      setError(t(key, text))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{kind === 'hashtags' ? w('groups', 'Hashtag groups') : w('texts', 'Snippets')}</h3>
        {canEdit && open !== 'new' && (
          <Button size="sm" variant="secondary" disabled={full} onClick={() => setOpen('new')}>
            <Plus size={14} aria-hidden />{kind === 'hashtags' ? w('add_group', 'Add a hashtag group') : w('add_text', 'Add a snippet')}
          </Button>
        )}
      </div>
      {canEdit && full && <p className="text-xs text-a-text-2">{t('content.snippet.error.too_many_snippets', 'A brand keeps at most 50 of each. Remove one first.')}</p>}
      {open === 'new' && <SnippetEditor kind={kind} snippet={null} onDone={() => setOpen(null)} />}
      {list.length === 0 && open !== 'new' && <p className="text-sm text-a-text-2">{kind === 'hashtags' ? w('none_groups', 'No hashtag groups yet.') : w('none_texts', 'No snippets yet.')}</p>}
      <ul className="space-y-2">
        {list.map(snippet => (
          <li key={snippet.id}>
            {open === snippet.id
              ? <SnippetEditor kind={kind} snippet={snippet} onDone={() => setOpen(null)} />
              : (
                <div className="flex flex-wrap items-start gap-3 rounded-lg border border-a-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-a-text">{snippet.name}</p>
                    <p className="whitespace-pre-line break-words text-xs text-a-text-2">{snippet.body}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setOpen(snippet.id)}>{t('content.brand.edit', 'Edit')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { void remove(snippet) }}>{w('remove', 'Remove')}</Button>
                    </div>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
      {kind === 'hashtags' && canEdit && <Suggestions full={full} />}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}

/**
 * Hashtags and snippets (spec 2026-10-15 §6): hashtag groups and lines used often — a call to action, a sign-off, an
 * address — that the post panel puts in with one click. Everyone reads them; managers keep them.
 */
export function SnippetsSection({ brand, canEdit }: { brand: BrandPayload; canEdit: boolean }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="content-snippets" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="space-y-0.5">
        <h2 id="content-snippets" className="font-a-display text-lg font-normal text-a-text">{t('content.brand.snippets.title', 'Hashtags and snippets')}</h2>
        <p className="text-sm text-a-text-2">{t('content.brand.snippets.intro', 'Hashtag groups and lines you use often — a call to action, a sign-off, an address. The post panel puts them in with one click.')}</p>
      </div>
      <SnippetList kind="hashtags" brand={brand} canEdit={canEdit} />
      <SnippetList kind="text" brand={brand} canEdit={canEdit} />
    </section>
  )
}
```

`frontend/src/content/brand/BrandPage.tsx`: import `SnippetsSection` from `./sections/Snippets`; after `<ChannelsSection brand={brand} canEdit={canEdit} />` add `<SnippetsSection brand={brand} canEdit={canEdit} />`.

- [ ] **Step 5: The words**

Write `$R3B/t6-words.json`:

```json
{
  "brand.snippets.title": { "en": "Hashtags and snippets", "ru": "Хештеги и заготовки", "de": "Hashtags und Textbausteine", "fr": "Hashtags et extraits", "es": "Hashtags y fragmentos" },
  "brand.snippets.intro": { "en": "Hashtag groups and lines you use often — a call to action, a sign-off, an address. The post panel puts them in with one click.", "ru": "Группы хештегов и фразы, которые вы часто используете: призыв к действию, подпись, адрес. Панель поста вставляет их одним нажатием.", "de": "Hashtag-Gruppen und Zeilen, die Sie oft verwenden – ein Aufruf zum Handeln, ein Gruß, eine Adresse. Das Beitragsfenster fügt sie mit einem Klick ein.", "fr": "Des groupes de hashtags et des phrases que vous utilisez souvent — un appel à l’action, une formule de fin, une adresse. Le panneau de publication les insère en un clic.", "es": "Grupos de hashtags y frases que usas a menudo: una llamada a la acción, una despedida, una dirección. El panel de la publicación los inserta con un clic." },
  "brand.snippets.groups": { "en": "Hashtag groups", "ru": "Группы хештегов", "de": "Hashtag-Gruppen", "fr": "Groupes de hashtags", "es": "Grupos de hashtags" },
  "brand.snippets.texts": { "en": "Snippets", "ru": "Заготовки", "de": "Textbausteine", "fr": "Extraits", "es": "Fragmentos" },
  "brand.snippets.add_group": { "en": "Add a hashtag group", "ru": "Добавить группу хештегов", "de": "Hashtag-Gruppe hinzufügen", "fr": "Ajouter un groupe de hashtags", "es": "Añadir un grupo de hashtags" },
  "brand.snippets.add_text": { "en": "Add a snippet", "ru": "Добавить заготовку", "de": "Textbaustein hinzufügen", "fr": "Ajouter un extrait", "es": "Añadir un fragmento" },
  "brand.snippets.name": { "en": "Name", "ru": "Название", "de": "Name", "fr": "Nom", "es": "Nombre" },
  "brand.snippets.tags": { "en": "Hashtags", "ru": "Хештеги", "de": "Hashtags", "fr": "Hashtags", "es": "Hashtags" },
  "brand.snippets.tags_hint": { "en": "Separate them with spaces.", "ru": "Разделяйте их пробелами.", "de": "Trennen Sie sie mit Leerzeichen.", "fr": "Séparez-les par des espaces.", "es": "Sepáralos con espacios." },
  "brand.snippets.text": { "en": "Text", "ru": "Текст", "de": "Text", "fr": "Texte", "es": "Texto" },
  "brand.snippets.remove": { "en": "Remove", "ru": "Удалить", "de": "Entfernen", "fr": "Supprimer", "es": "Quitar" },
  "brand.snippets.remove_confirm": { "en": "Remove “{{name}}”?", "ru": "Удалить «{{name}}»?", "de": "„{{name}}“ entfernen?", "fr": "Supprimer « {{name}} » ?", "es": "¿Quitar «{{name}}»?" },
  "brand.snippets.none_groups": { "en": "No hashtag groups yet.", "ru": "Групп хештегов пока нет.", "de": "Noch keine Hashtag-Gruppen.", "fr": "Aucun groupe de hashtags pour l’instant.", "es": "Todavía no hay grupos de hashtags." },
  "brand.snippets.none_texts": { "en": "No snippets yet.", "ru": "Заготовок пока нет.", "de": "Noch keine Textbausteine.", "fr": "Aucun extrait pour l’instant.", "es": "Todavía no hay fragmentos." },
  "brand.snippets.suggest": { "en": "Suggest hashtag groups with AI", "ru": "Предложить группы хештегов с ИИ", "de": "Hashtag-Gruppen mit KI vorschlagen", "fr": "Suggérer des groupes de hashtags avec l’IA", "es": "Sugerir grupos de hashtags con IA" },
  "brand.snippets.no_suggestions": { "en": "No more suggestions. Ask again for new ones.", "ru": "Больше предложений нет. Спросите ещё раз, чтобы получить новые.", "de": "Keine weiteren Vorschläge. Fragen Sie erneut nach neuen.", "fr": "Plus de suggestions. Redemandez-en pour en avoir de nouvelles.", "es": "No hay más sugerencias. Vuelve a pedir para recibir otras nuevas." },
  "brand.snippets.add_suggestion": { "en": "Add", "ru": "Добавить", "de": "Hinzufügen", "fr": "Ajouter", "es": "Añadir" }
}
```

Run: `node "$R3B/words.mjs" "$R3B/t6-words.json"` → `words: 17 keys in 5 bundles`.

- [ ] **Step 6: Run the tests, the types and the lint**

Run: `$R3B/vt.sh src/content` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content Brand: Hashtags and snippets — hashtag groups and text snippets, kept by managers, with AI-suggested groups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Hashtags and snippets in the post panel — Insert, at the cursor, with Instagram's 30-tag warning

**Files:**
- Create: `frontend/src/content/panel/snippetInsert.ts`, `frontend/src/content/panel/snippetInsert.test.ts`, `frontend/src/content/panel/InsertMenu.tsx`
- Modify: `frontend/src/content/panel/PostFormFields.tsx`, `frontend/src/content/panel/PostPanel.tsx`
- Test: `frontend/src/content/panel/PostPanel.test.tsx`
- Words: `content.panel.insert`, `content.panel.insert_snippet`, `content.panel.too_many_tags`

**Interfaces:**
- Consumes: `parseHashtags(text)` (`lib/postText.ts`); `BrandPayload.snippets` (Task 1); `PostFormFields`' `industry` prop (Task 5).
- Produces: `TAG_LIMITS: Partial<Record<Platform, number>>` (`{ instagram: 30 }`); `insertHashtags(current: string, group: string): { value: string; added: number }`; `tooManyTags(platform: Platform, value: string): { count: number; limit: number } | null`; `insertAt(value: string, text: string, cursor: { start: number; end: number } | null, multiline: boolean): { value: string; caret: number }`; `InsertMenu({ label, items, onPick })`; `PostFormFields`' new prop `snippets: Snippet[]`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/panel/snippetInsert.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { insertAt, insertHashtags, tooManyTags } from './snippetInsert'

describe('insertHashtags', () => {
  // Review Focus 3: "#Autumn" and "autumn" are one tag; the group's new ones go at the end.
  it('adds a group\'s tags after the ones typed, skipping any already there whatever its case or #', () => {
    expect(insertHashtags('#Autumn, hair', '#autumn #copper #HAIR')).toEqual({ value: '#Autumn hair #copper', added: 1 })
    expect(insertHashtags('', '#a #b')).toEqual({ value: '#a #b', added: 2 })
    expect(insertHashtags('#a', '#a')).toEqual({ value: '#a', added: 0 })
  })
})

describe('tooManyTags', () => {
  it('warns past Instagram\'s 30, counting what the field holds after the insert, and says nothing for other platforms', () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `#t${i}`).join(' ')
    expect(tooManyTags('instagram', thirty)).toBeNull()
    expect(tooManyTags('instagram', insertHashtags(thirty, '#one-more').value)).toEqual({ count: 31, limit: 30 })
    expect(tooManyTags('linkedin', `${thirty} #more`)).toBeNull()
  })
})

describe('insertAt', () => {
  it('puts a snippet at the cursor, over a selection', () => {
    expect(insertAt('Hello world', 'big ', { start: 6, end: 6 }, true)).toEqual({ value: 'Hello big world', caret: 10 })
    expect(insertAt('Hello world', 'there', { start: 6, end: 11 }, false)).toEqual({ value: 'Hello there', caret: 11 })
  })

  it('without a cursor, at the end: on a line of its own in a text, after a space in a line', () => {
    expect(insertAt('Warm tones.', 'See you!', null, true)).toEqual({ value: 'Warm tones.\nSee you!', caret: 20 })
    expect(insertAt('Book now', 'today', null, false)).toEqual({ value: 'Book now today', caret: 14 })
    expect(insertAt('', 'See you!', null, true)).toEqual({ value: 'See you!', caret: 8 })
  })
})
```

`frontend/src/content/panel/PostPanel.test.tsx`, at the end of its describe block:

```tsx
  // Spec 2026-10-15 §6: the brand's hashtag groups and snippets one click away beside their fields.
  it('offers the brand\'s hashtag groups beside Hashtags, and its snippets beside Text and Call to action', () => {
    const brand = { audiences: [], channels: [], snippets: [{ id: 1, kind: 'hashtags', name: 'Autumn', body: '#autumn' }, { id: 2, kind: 'text', name: 'Sign-off', body: 'See you!' }] }
    const out = render({ kind: 'post', id: 5, seq: 1 }, post, brand)
    expect(out).toContain('Insert</button>')
    expect(out.match(/Insert snippet<\/button>/g)).toHaveLength(2)
  })

  it('warns when an Instagram post holds more than 30 hashtags', () => {
    const many = { ...post, hashtags: Array.from({ length: 31 }, (_, i) => `#tag${i}`) }
    expect(render({ kind: 'post', id: 5, seq: 1 }, many)).toContain('instagram takes at most 30 hashtags; this post has 31.')
  })
```

(The test's `t` returns a platform's slug for its name, so "instagram".)

- [ ] **Step 2: Run them to see them fail**

Run: `$R3B/vt.sh src/content/panel/snippetInsert.test.ts src/content/panel/PostPanel.test.tsx`
Expected: FAIL — `snippetInsert` does not exist; no Insert buttons; no warning.

- [ ] **Step 3: The pure insert**

Create `frontend/src/content/panel/snippetInsert.ts`:

```ts
import { parseHashtags } from '../lib/postText'
import type { Platform } from '../lib/types'

/** The most hashtags a platform takes (spec 2026-10-15 §6): Instagram 30; the others are not warned about. */
export const TAG_LIMITS: Partial<Record<Platform, number>> = { instagram: 30 }

const bare = (tag: string) => tag.replace(/^#+/, '').toLowerCase()

/** A hashtag group added to the tags already typed: its new ones at the end; one already there (ignoring case and #) skipped. */
export function insertHashtags(current: string, group: string): { value: string; added: number } {
  const tags = parseHashtags(current)
  const seen = new Set(tags.map(bare))
  let added = 0
  for (const tag of parseHashtags(group)) {
    const key = bare(tag)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    added++
  }
  return { value: tags.join(' '), added }
}

/** Past the platform's limit: how many tags the field holds now, and the limit (Review Focus 3: counted after an insert). */
export function tooManyTags(platform: Platform, value: string): { count: number; limit: number } | null {
  const limit = TAG_LIMITS[platform]
  const count = parseHashtags(value).length
  return limit !== undefined && count > limit ? { count, limit } : null
}

/**
 * A snippet put where the cursor is (over any selection), or — when the field has no cursor — at the end: on a line of
 * its own in a text, after a space in a one-line field. `caret` is where the cursor goes after it.
 */
export function insertAt(value: string, text: string, cursor: { start: number; end: number } | null, multiline: boolean): { value: string; caret: number } {
  if (cursor === null) {
    const sep = value === '' ? '' : multiline ? (value.endsWith('\n') ? '' : '\n') : value.endsWith(' ') ? '' : ' '
    const next = value + sep + text
    return { value: next, caret: next.length }
  }
  const start = Math.max(0, Math.min(cursor.start, value.length))
  const end = Math.max(start, Math.min(cursor.end, value.length))
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length }
}
```

- [ ] **Step 4: The menu**

Create `frontend/src/content/panel/InsertMenu.tsx`:

```tsx
import { useState, type KeyboardEvent } from 'react'
import { ListPlus } from 'lucide-react'
import type { Snippet } from '../lib/types'

/**
 * "Insert" beside a field (spec 2026-10-15 §6): opens the brand's hashtag groups or snippets; picking one hands it over
 * and closes. Real buttons; a mouse press does not take the focus, so the field keeps its cursor; Escape closes the
 * list (claimed, so the panel stays open). Nothing shows when the brand has none of that kind.
 */
export function InsertMenu({ label, items, onPick }: { label: string; items: Snippet[]; onPick: (item: Snippet) => void }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) return
    e.preventDefault()
    setOpen(false)
  }
  return (
    <div className="relative" onKeyDown={onKeyDown}>
      <button type="button" aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
        <ListPlus size={12} aria-hidden />{label}
      </button>
      {open && (
        <ul className="absolute right-0 z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-a-border bg-a-surface p-1 shadow-a-lg">
          {items.map(item => (
            <li key={item.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(item); setOpen(false) }}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-a-surface-2">
                <span className="block truncate text-sm font-medium text-a-text">{item.name}</span>
                <span className="block truncate text-xs text-a-text-2">{item.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: The fields**

`frontend/src/content/panel/PostFormFields.tsx` (its first line becomes `import { useRef, type ReactNode } from 'react'`; add `import { Notice } from '../../workspace/ui/Notice'`, `import type { Snippet } from '../lib/types'` into the types import, `import { InsertMenu } from './InsertMenu'`, `import { insertAt, insertHashtags, tooManyTags } from './snippetInsert'`):
1. The props gain `/** The brand's hashtag groups and snippets (spec 2026-10-15 §6). */ snippets: Snippet[]`, destructured.
2. At the top of the component, after `const suggested = …`:

```tsx
  const groups = snippets.filter(s => s.kind === 'hashtags')
  const texts = snippets.filter(s => s.kind === 'text')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const ctaRef = useRef<HTMLInputElement>(null)
  // Whether the person has put the cursor in the field: a snippet goes there, else at the end (read in the handler only).
  const placed = useRef({ main_copy: false, cta: false })
  const insertInto = (key: 'main_copy' | 'cta', el: HTMLTextAreaElement | HTMLInputElement | null, text: string) => {
    const cursor = el && placed.current[key] && el.selectionStart !== null && el.selectionEnd !== null ? { start: el.selectionStart, end: el.selectionEnd } : null
    const next = insertAt(form[key], text, cursor, key === 'main_copy')
    const max = key === 'main_copy' ? 20000 : 255
    set(key, next.value.slice(0, max))
    if (el) window.requestAnimationFrame(() => { el.focus(); el.setSelectionRange(Math.min(next.caret, max), Math.min(next.caret, max)) })
  }
  const tooMany = tooManyTags(form.platform, form.hashtags)
```

3. The Text, Call to action and Hashtags fields (lines 96–105) become:

```tsx
      <div className="relative">
        <FieldBox label={t('content.panel.fields.main_copy', 'Text')} invalid={invalid.includes('main_copy')}>
          <textarea ref={textRef} value={form.main_copy} rows={8} maxLength={20000} onFocus={() => { placed.current.main_copy = true }}
            onChange={(e) => set('main_copy', e.target.value)} aria-invalid={bad('main_copy')} className={box('main_copy')} />
        </FieldBox>
        <div className="absolute right-0 top-0">
          <InsertMenu label={t('content.panel.insert_snippet', 'Insert snippet')} items={texts} onPick={(s) => insertInto('main_copy', textRef.current, s.body)} />
        </div>
      </div>
      <div className="relative">
        <FieldBox label={t('content.panel.fields.cta', 'Call to action')} invalid={invalid.includes('cta')}>
          <input ref={ctaRef} value={form.cta} maxLength={255} onFocus={() => { placed.current.cta = true }}
            onChange={(e) => set('cta', e.target.value)} aria-invalid={bad('cta')} className={box('cta')} />
        </FieldBox>
        <div className="absolute right-0 top-0">
          <InsertMenu label={t('content.panel.insert_snippet', 'Insert snippet')} items={texts} onPick={(s) => insertInto('cta', ctaRef.current, s.body)} />
        </div>
      </div>
      <div className="relative">
        <FieldBox label={t('content.panel.fields.hashtags', 'Hashtags')} invalid={invalid.includes('hashtags')}
          hint={t('content.panel.fields.hashtags_hint', 'Separate them with spaces or commas.')}>
          <input value={form.hashtags} onChange={(e) => set('hashtags', e.target.value)} aria-invalid={bad('hashtags')} className={box('hashtags')} />
        </FieldBox>
        <div className="absolute right-0 top-0">
          <InsertMenu label={t('content.panel.insert', 'Insert')} items={groups} onPick={(s) => set('hashtags', insertHashtags(form.hashtags, s.body).value)} />
        </div>
      </div>
      {tooMany && (
        <Notice tone="warning">
          {t('content.panel.too_many_tags', '{{platform}} takes at most {{limit}} hashtags; this post has {{count}}.', { platform: t(`content.platform.${form.platform}`, form.platform), limit: tooMany.limit, count: tooMany.count })}
        </Notice>
      )}
```

(The Insert buttons sit outside the labels, after their fields in the tab order, over the label's line.)

`frontend/src/content/panel/PostPanel.tsx`: the `PostFormFields` element gains `snippets={brandInfo.data?.snippets ?? []}`.

- [ ] **Step 6: The words**

Write `$R3B/t7-words.json`:

```json
{
  "panel.insert": { "en": "Insert", "ru": "Вставить", "de": "Einfügen", "fr": "Insérer", "es": "Insertar" },
  "panel.insert_snippet": { "en": "Insert snippet", "ru": "Вставить заготовку", "de": "Textbaustein einfügen", "fr": "Insérer un extrait", "es": "Insertar fragmento" },
  "panel.too_many_tags": { "en": "{{platform}} takes at most {{limit}} hashtags; this post has {{count}}.", "ru": "{{platform}} принимает не больше {{limit}} хештегов; в этом посте их {{count}}.", "de": "{{platform}} erlaubt höchstens {{limit}} Hashtags; dieser Beitrag hat {{count}}.", "fr": "{{platform}} accepte au plus {{limit}} hashtags ; cette publication en a {{count}}.", "es": "{{platform}} admite como máximo {{limit}} hashtags; esta publicación tiene {{count}}." }
}
```

Run: `node "$R3B/words.mjs" "$R3B/t7-words.json"` → `words: 3 keys in 5 bundles`.

- [ ] **Step 7: Run the tests, the types and the lint**

Run: `$R3B/vt.sh src/content` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only (the refs are read only in handlers).

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content panel: Insert the brand's hashtag groups and snippets — at the cursor, no double tags, Instagram's 30-tag warning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Posting goals and the streak on the Plan

**Files:**
- Create: `frontend/src/content/plan/goalsMath.ts`, `frontend/src/content/plan/goalsMath.test.ts`, `frontend/src/content/plan/GoalsLine.tsx`
- Modify: `frontend/src/content/plan/PlanPage.tsx`, `frontend/src/content/lib/planCache.ts`
- Test: `frontend/src/content/plan/planPieces.test.tsx`, `frontend/src/content/lib/planCache.test.ts`
- Words: `content.plan.goals.*`

**Interfaces:**
- Consumes: `api.goals()`, `Goals` (Task 1).
- Produces: `showGoals(goals: Goals | undefined, range: { from: DateKey; to: DateKey }, today: DateKey): goals is Goals`; `goalMet(g: GoalPlatform): boolean`; `GoalsLine({ goals })`; `refreshLists` also invalidates `['content', brand, 'goals']`.

The spec's tooltip ("only posts marked published count") is a visible line under the pills: a hover tooltip never reaches a phone, and the words are the same.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/plan/goalsMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Goals } from '../lib/types'
import { goalMet, showGoals } from './goalsMath'

const goals: Goals = {
  week: { from: '2026-10-05', to: '2026-10-11' },
  platforms: [{ platform: 'instagram', target: 3, published: 2, planned: 1 }],
  streak: { weeks: 4, current_met: false, at_risk: false, short_by: 1 },
}

describe('showGoals', () => {
  it('shows this week\'s goals on the week that holds the venue\'s today, once a target exists', () => {
    expect(showGoals(goals, { from: '2026-10-05', to: '2026-10-11' }, '2026-10-07')).toBe(true)
    expect(showGoals(goals, { from: '2026-10-12', to: '2026-10-18' }, '2026-10-07')).toBe(false)
    expect(showGoals({ ...goals, platforms: [] }, { from: '2026-10-05', to: '2026-10-11' }, '2026-10-07')).toBe(false)
    expect(showGoals(undefined, { from: '2026-10-05', to: '2026-10-11' }, '2026-10-07')).toBe(false)
  })
})

describe('goalMet', () => {
  it('is met once the posts marked published reach the target', () => {
    expect(goalMet({ platform: 'instagram', target: 3, published: 3, planned: 0 })).toBe(true)
    expect(goalMet({ platform: 'instagram', target: 3, published: 2, planned: 5 })).toBe(false)
  })
})
```

`frontend/src/content/plan/planPieces.test.tsx` (import `GoalsLine` from `./GoalsLine`), at the end:

```tsx
describe('GoalsLine', () => {
  // Spec 2026-10-15 §7: per platform "2 of 3 published · 1 planned", a met goal said in words, the streak and its nudge.
  it('says each platform\'s progress, a met goal in words, and the streak', () => {
    const out = html(<GoalsLine goals={{
      week: { from: '2026-10-05', to: '2026-10-11' },
      platforms: [{ platform: 'instagram', target: 3, published: 2, planned: 1 }, { platform: 'linkedin', target: 1, published: 1, planned: 0 }],
      streak: { weeks: 4, current_met: false, at_risk: false, short_by: 1 },
    }} />)
    expect(out).toContain('instagram: 2 of 3 published · 1 planned')
    expect(out).toMatch(/data-goal="linkedin" data-met="true"[\s\S]*?met</)
    expect(out).toContain('4-week streak')
    expect(out).toContain('Only posts marked published count.')
    expect(out).not.toContain('by Sunday')
  })

  it('from Friday, says how many more posts keep a running streak', () => {
    const out = html(<GoalsLine goals={{
      week: { from: '2026-10-05', to: '2026-10-11' },
      platforms: [{ platform: 'instagram', target: 3, published: 1, planned: 0 }],
      streak: { weeks: 4, current_met: false, at_risk: true, short_by: 2 },
    }} />)
    expect(out).toContain('2 more posts by Sunday keep your 4-week streak')
  })
})
```

`frontend/src/content/lib/planCache.test.ts` (import `QueryClient` from `@tanstack/react-query` and `refreshLists` from `./planCache` if not imported), at the end:

```ts
describe('refreshLists and the goals', () => {
  it('reads the week\'s goals again with the plan after a post changes', async () => {
    const client = new QueryClient()
    client.setQueryData(['content', 3, 'goals'], { week: null, platforms: [], streak: { weeks: 0, current_met: false, at_risk: false, short_by: 0 } })
    await refreshLists(client, 3)
    expect(client.getQueryState(['content', 3, 'goals'])?.isInvalidated).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R3B/vt.sh src/content/plan/goalsMath.test.ts src/content/plan/planPieces.test.tsx src/content/lib/planCache.test.ts`
Expected: FAIL — `goalsMath` and `GoalsLine` do not exist; `refreshLists` leaves the goals as they were.

- [ ] **Step 3: The helpers and the line**

Create `frontend/src/content/plan/goalsMath.ts`:

```ts
import type { DateKey, GoalPlatform, Goals } from '../lib/types'

/** The goals are always the venue's current week's: the line shows on the week that holds today, once a target exists. */
export const showGoals = (goals: Goals | undefined, range: { from: DateKey; to: DateKey }, today: DateKey): goals is Goals =>
  goals !== undefined && goals.platforms.length > 0 && today >= range.from && today <= range.to

/** A goal is met once the posts marked published reach the target. */
export const goalMet = (g: GoalPlatform): boolean => g.published >= g.target
```

Create `frontend/src/content/plan/GoalsLine.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Flame } from 'lucide-react'
import type { Goals } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { goalMet } from './goalsMath'

/**
 * This week's posting goals (spec 2026-10-15 §7), under the This week strip: per platform "2 of 3 published · 1
 * planned"; a met goal says so in words, not colour alone; the streak, and from Friday how many more posts keep it.
 * Only posts marked published count, and the line says so.
 */
export function GoalsLine({ goals }: { goals: Goals }) {
  const { t } = useTranslation()
  const { streak } = goals
  return (
    <section aria-label={t('content.plan.goals.title', 'Posting goals')} className="flex flex-wrap items-center gap-2 text-sm">
      {goals.platforms.map(g => {
        const met = goalMet(g)
        const platform = t(`content.platform.${g.platform}`, g.platform)
        return (
          <span key={g.platform} data-goal={g.platform} data-met={met ? 'true' : 'false'}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-a-text ${met ? 'border-a-accent-text bg-a-accent/10' : 'border-a-border'}`}>
            <PlatformMark platform={g.platform} size="sm" />
            <span>{t('content.plan.goals.line', '{{platform}}: {{published}} of {{target}} published · {{planned}} planned', { platform, published: g.published, target: g.target, planned: g.planned })}</span>
            {met && <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-a-accent-text"><CheckCircle2 size={12} aria-hidden />{t('content.plan.goals.met', 'met')}</span>}
          </span>
        )
      })}
      {streak.weeks > 0 && (
        <span data-streak="" className="inline-flex items-center gap-1 rounded-full bg-a-surface-2 px-2.5 py-1 font-medium text-a-text">
          <Flame size={14} aria-hidden />{t('content.plan.goals.streak', '{{count}}-week streak', { count: streak.weeks })}
        </span>
      )}
      {streak.at_risk && (
        <span role="status" className="font-medium text-a-text">{t('content.plan.goals.at_risk', '{{count}} more posts by Sunday keep your {{weeks}}-week streak', { count: streak.short_by, weeks: streak.weeks })}</span>
      )}
      <span className="w-full text-xs text-a-text-2">{t('content.plan.goals.hint', 'Only posts marked published count.')}</span>
    </section>
  )
}
```

- [ ] **Step 4: The Plan and the cache**

`frontend/src/content/plan/PlanPage.tsx` (import `GoalsLine` from `./GoalsLine` and `showGoals` from `./goalsMath`):
1. After the brand read (Task 2):

```tsx
  // This week's posting goals and the streak (spec 2026-10-15 §7), read with the plan.
  const goals = useQuery({ queryKey: ['content', brand, 'goals'], queryFn: api.goals, refetchInterval: PLAN_REFRESH_MS, refetchOnWindowFocus: true })
```

2. The strip (lines 213–215) becomes:

```tsx
      {view !== 'month' && (
        <div className="space-y-3 px-4 pb-3 lg:px-6">
          <WeekStrip figures={data?.figures} pending={!data || query.isPlaceholderData} />
          {showGoals(goals.data, range, today) && <GoalsLine goals={goals.data} />}
        </div>
      )}
```

`frontend/src/content/lib/planCache.ts`, `refreshLists` gains a third read, and its doc comment says so:

```ts
/** After a post changes, the Plan's, the Posts page's and the goals' reads of the brand are read again (an open page at once, the others when shown). */
export function refreshLists(queryClient: QueryClient, brand: number | null): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] }),
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'posts'] }),
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'goals'] }),
  ])
}
```

- [ ] **Step 5: The words**

Write `$R3B/t8-words.json`:

```json
{
  "plan.goals.title": { "en": "Posting goals", "ru": "Цели публикаций", "de": "Posting-Ziele", "fr": "Objectifs de publication", "es": "Objetivos de publicación" },
  "plan.goals.line": { "en": "{{platform}}: {{published}} of {{target}} published · {{planned}} planned", "ru": "{{platform}}: опубликовано {{published}} из {{target}} · запланировано {{planned}}", "de": "{{platform}}: {{published}} von {{target}} veröffentlicht · {{planned}} geplant", "fr": "{{platform}} : {{published}} sur {{target}} publiées · {{planned}} prévues", "es": "{{platform}}: {{published}} de {{target}} publicadas · {{planned}} planificadas" },
  "plan.goals.met": { "en": "met", "ru": "выполнено", "de": "erreicht", "fr": "atteint", "es": "cumplido" },
  "plan.goals.streak": { "en": "{{count}}-week streak", "ru": "Серия: {{count}} нед.", "de": "{{count}} Wochen in Folge", "fr": "Série de {{count}} semaines", "es": "Racha de {{count}} semanas" },
  "plan.goals.at_risk": { "en": "{{count}} more posts by Sunday keep your {{weeks}}-week streak", "ru": "Ещё {{count}} поста до воскресенья сохранят вашу серию в {{weeks}} нед.", "de": "Noch {{count}} Beiträge bis Sonntag halten Ihre Serie von {{weeks}} Wochen", "fr": "Encore {{count}} publications d’ici dimanche pour garder votre série de {{weeks}} semaines", "es": "{{count}} publicaciones más antes del domingo mantienen tu racha de {{weeks}} semanas" },
  "plan.goals.hint": { "en": "Only posts marked published count.", "ru": "Учитываются только посты, отмеченные как опубликованные.", "de": "Es zählen nur Beiträge, die als veröffentlicht markiert sind.", "fr": "Seules les publications marquées comme publiées comptent.", "es": "Solo cuentan las publicaciones marcadas como publicadas." }
}
```

Run: `node "$R3B/words.mjs" "$R3B/t8-words.json"` → `words: 6 keys in 5 bundles`.

- [ ] **Step 6: Run the tests, the types and the lint**

Run: `$R3B/vt.sh src/content` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content Plan: this week's posting goals per platform and the streak, with Friday's nudge, under the This week strip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Repeat posts in the panel — the control, the series line, Stop repeating, the AI's rewording

**Files:**
- Create: `frontend/src/content/panel/repeatMath.ts`, `frontend/src/content/panel/repeatMath.test.ts`, `frontend/src/content/panel/RepeatSection.tsx`, `frontend/src/content/panel/repeatSection.test.tsx`
- Modify: `frontend/src/content/panel/PostPanel.tsx`
- Test: `frontend/src/content/panel/PostPanel.test.tsx`
- Words: `content.panel.repeat.*`

**Interfaces:**
- Consumes: `api.repeatPost`, `api.stopRepeat`, `Series`, `RepeatEvery`, `errorKey('repeat', …)` (Task 1); `addDays`, `formatDate` (`workspace/lib/wallClock`).
- Produces: `MAX_COPIES = 26`, `MAX_MONTHS = 12`, `MAX_AI_COPIES = 12`; `addMonthsKept(day: DateKey, n: number): DateKey`; `repeatDates(from, every, until, today): DateKey[]`; `RepeatProblem = 'no_day' | 'until_too_far' | 'no_dates' | 'too_many_copies' | 'too_many_ai'`; `repeatProblem({ from, every, until, aiRewrite, today }): RepeatProblem | null`; `pollsWhileRewording(post: PostDetail | undefined): boolean`; `RepeatSection({ post, series, dirty, onPost, onGone })`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/panel/repeatMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PostDetail } from '../lib/types'
import { addMonthsKept, pollsWhileRewording, repeatDates, repeatProblem } from './repeatMath'

// The server's ContentRepeat::dates and RepeatController::store, mirrored (Review Focus 4). Today is Monday 5 October 2026.
const today = '2026-10-05'

describe('repeatDates', () => {
  it('keeps the weekday every week or two, includes the last day, and leaves out days already gone', () => {
    expect(repeatDates('2026-10-07', 'week', '2026-10-28', today)).toEqual(['2026-10-14', '2026-10-21', '2026-10-28'])
    expect(repeatDates('2026-10-07', '2weeks', '2026-11-10', today)).toEqual(['2026-10-21', '2026-11-04'])
    expect(repeatDates('2026-09-23', 'week', '2026-10-07', today)).toEqual(['2026-10-07'])
  })

  it('keeps the day of the month, or takes the month\'s last day when it is shorter', () => {
    expect(repeatDates('2028-01-31', 'month', '2028-04-30', '2028-01-01')).toEqual(['2028-02-29', '2028-03-31', '2028-04-30'])
    expect(addMonthsKept('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsKept('2026-12-15', 1)).toBe('2027-01-15')
  })
})

describe('repeatProblem', () => {
  const ask = (from: string | null, every: 'week' | '2weeks' | 'month', until: string, aiRewrite = false) => repeatProblem({ from, every, until, aiRewrite, today })

  it('allows an end exactly 12 months after the post\'s day, not one day more', () => {
    expect(ask('2026-10-08', 'month', '2027-10-08')).toBeNull()
    expect(ask('2026-10-08', 'month', '2027-10-09')).toBe('until_too_far')
  })

  it('allows 26 copies and 12 AI copies, not 27 or 13', () => {
    expect(ask('2026-10-08', 'week', '2027-04-08')).toBeNull()
    expect(ask('2026-10-08', 'week', '2027-04-15')).toBe('too_many_copies')
    expect(ask('2026-10-08', 'week', '2026-12-31', true)).toBeNull()
    expect(ask('2026-10-08', 'week', '2027-01-07', true)).toBe('too_many_ai')
  })

  it('needs a day, and a day to repeat on before the end', () => {
    expect(ask(null, 'week', '2026-10-28')).toBe('no_day')
    expect(ask('2026-10-08', 'week', '2026-10-10')).toBe('no_dates')
  })
})

describe('pollsWhileRewording', () => {
  it('reads the post again only while the AI rewords its series', () => {
    const series = { id: 5, every: 'week' as const, until: '2026-10-28', more: 3, removable: 3, rewriting: true }
    expect(pollsWhileRewording({ series } as unknown as PostDetail)).toBe(true)
    expect(pollsWhileRewording({ series: { ...series, rewriting: false } } as unknown as PostDetail)).toBe(false)
    expect(pollsWhileRewording(undefined)).toBe(false)
  })
})
```

Create `frontend/src/content/panel/repeatSection.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

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

import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostDetail, Series } from '../lib/types'
import { RepeatSection } from './RepeatSection'

const boot = { brand: { id: 3, name: 'Lumière Salon' }, venue: { today: '2026-10-07' }, ai: { status: 'under', percent: 10 } } as unknown as Bootstrap
const post = { id: 5, platform: 'instagram', scheduled_date: '2026-10-07', status: 'draft', series_id: null, series: null } as unknown as PostDetail
const draw = (p: PostDetail, series: Series | null = null, ai = 'under') => renderToStaticMarkup(
  <ContentContext.Provider value={{ data: { ...boot, ai: { status: ai, percent: 10 } } as Bootstrap, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
    <RepeatSection post={p} series={series} dirty={false} onPost={() => {}} onGone={() => {}} />
  </ContentContext.Provider>,
)

// Spec 2026-10-15 §8.
describe('RepeatSection', () => {
  it('offers every week, two weeks or month until a date four weeks on, says how many copies, and the AI rewrite', () => {
    const out = draw(post)
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Every week<\/button>/)
    expect(out).toContain('Every 2 weeks')
    expect(out).toContain('Every month')
    expect(out).toContain('value="2026-11-04"')
    expect(out).toContain('4 copies')
    expect(out).toContain('Let the AI rewrite each copy')
  })

  it('asks a post without a day for one first, and keeps the AI rewrite off while the budget is used up', () => {
    expect(draw({ ...post, scheduled_date: null })).toContain('Give the post a day to repeat it.')
    expect(draw(post, null, 'over')).toMatch(/<input type="checkbox"[^>]*disabled=""/)
  })

  it('says how a series runs, while the AI rewords it, and offers Stop repeating', () => {
    const series: Series = { id: 5, every: 'week', until: '2026-10-28', more: 3, removable: 3, rewriting: true }
    const out = draw({ ...post, series_id: 5, series }, series)
    expect(out).toContain('Repeats every week until 28 October 2026 · 3 more')
    expect(out).toContain('The AI is rewording the copies…')
    expect(out).toContain('Stop repeating')
  })
})
```

`frontend/src/content/panel/PostPanel.test.tsx`, at the end of its describe block:

```tsx
  // Spec 2026-10-15 §8: a saved post with a day can repeat; a post in a series says how it runs.
  it('offers Repeat on a saved post, and the series line on a post in a series', () => {
    expect(render({ kind: 'post', id: 5, seq: 1 })).toContain('Let the AI rewrite each copy')
    const series = { id: 5, every: 'month' as const, until: '2027-01-07', more: 2, removable: 2, rewriting: false }
    expect(render({ kind: 'post', id: 5, seq: 1 }, { ...post, series_id: 5, series })).toContain('Repeats every month until January 7, 2027 · 2 more')
  })
```

(`PostPanel.test.tsx`'s mock answers `i18n.language` `'en'`, so `formatDate` writes the American "January 7, 2027"; `repeatSection.test.tsx` uses `'en-GB'`, "28 October 2026".)

- [ ] **Step 2: Run them to see them fail**

Run: `$R3B/vt.sh src/content/panel/repeatMath.test.ts src/content/panel/repeatSection.test.tsx src/content/panel/PostPanel.test.tsx`
Expected: FAIL — `repeatMath` and `RepeatSection` do not exist; the panel has no Repeat.

- [ ] **Step 3: The pure rules**

Create `frontend/src/content/panel/repeatMath.ts`:

```ts
import { addDays } from '../../workspace/lib/wallClock'
import type { DateKey, PostDetail, RepeatEvery } from '../lib/types'

/** The server's limits (ContentRepeat): copies, months after the post's day, copies the AI rewrites. */
export const MAX_COPIES = 26
export const MAX_MONTHS = 12
export const MAX_AI_COPIES = 12

const pad = (n: number) => String(n).padStart(2, '0')
/** Days in a month (`month` 1–12). */
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** A day `n` months on, kept in its month: the 31st becomes a shorter month's last day (Carbon's addMonthsNoOverflow). */
export function addMonthsKept(day: DateKey, n: number): DateKey {
  const [y, m, d] = day.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${pad(month)}-${pad(Math.min(d, daysIn(year, month)))}`
}

/** The copies' days after `from`, up to `until` included, from `today` on: the server's ContentRepeat::dates. */
export function repeatDates(from: DateKey, every: RepeatEvery, until: DateKey, today: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let k = 1; k <= 400; k++) {
    const day = every === 'month' ? addMonthsKept(from, k) : addDays(from, (every === '2weeks' ? 14 : 7) * k)
    if (day > until) break
    if (day >= today) out.push(day)
  }
  return out
}

export type RepeatProblem = 'no_day' | 'until_too_far' | 'no_dates' | 'too_many_copies' | 'too_many_ai'

/** What stops a repeat before it is sent, in the server's order (RepeatController::store), so the portal names the limit. */
export function repeatProblem({ from, every, until, aiRewrite, today }: {
  from: DateKey | null; every: RepeatEvery; until: DateKey; aiRewrite: boolean; today: DateKey
}): RepeatProblem | null {
  if (from === null) return 'no_day'
  if (until > addMonthsKept(from, MAX_MONTHS)) return 'until_too_far'
  const count = repeatDates(from, every, until, today).length
  if (count === 0) return 'no_dates'
  if (count > MAX_COPIES) return 'too_many_copies'
  if (aiRewrite && count > MAX_AI_COPIES) return 'too_many_ai'
  return null
}

/** The panel reads its post again every few seconds only while the AI rewords the post's series (spec §8). */
export const pollsWhileRewording = (post: PostDetail | undefined): boolean => post?.series?.rewriting === true
```

- [ ] **Step 4: The section**

Create `frontend/src/content/panel/RepeatSection.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Repeat } from 'lucide-react'
import { addDays, formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { PostDetail, RepeatEvery, Series } from '../lib/types'
import { repeatDates, repeatProblem } from './repeatMath'

const EVERY: [RepeatEvery, string, string][] = [['week', 'every_week', 'Every week'], ['2weeks', 'every_2weeks', 'Every 2 weeks'], ['month', 'every_month', 'Every month']]
const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`

/**
 * Repeat (spec 2026-10-15 §8): a saved post with a day comes back every week, two weeks or month until a date, its
 * copies reworded by the AI if asked; the limits are checked here first, so a refusal names the limit. A post in a
 * series says how it runs and while the AI rewords it; Stop repeating removes the unpublished copies from today on,
 * asking with their number (the server's `removable`).
 */
export function RepeatSection({ post, series, dirty, onPost, onGone }: {
  post: PostDetail
  /** The series as last read (the panel reads it again while the AI rewords); null when the post does not repeat. */
  series: Series | null
  dirty: boolean
  /** The post as the server answered (repeated, or out of its series). */
  onPost: (post: PostDetail) => void
  /** Stop repeating removed this very post (a copy dated today or later). */
  onGone: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const today = boot.venue.today
  const from = post.scheduled_date
  const [every, setEvery] = useState<RepeatEvery>('week')
  const [until, setUntil] = useState(() => addDays(from !== null && from > today ? from : today, 28))
  const [ai, setAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const paused = boot.ai.status === 'over'
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.panel.repeat.${key}`, english, vars)
  const say = (code: string) => {
    const [key, text] = errorKey('repeat', code)
    setError(t(key, text))
  }
  const run = async (call: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await call()
    } catch (e) {
      say(failureOf(e).code)
    } finally {
      setBusy(false)
    }
  }
  const title = (
    <h3 id="content-repeat-title" className="flex items-center gap-2 font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">
      <Repeat size={14} aria-hidden />{w('title', 'Repeat')}
    </h3>
  )

  if (series) {
    const date = series.until ? formatDate(series.until, locale, { day: 'numeric', month: 'long', year: 'numeric' }) : ''
    const how = series.every === 'month'
      ? w('line_month', 'Repeats every month until {{date}}', { date })
      : series.every === '2weeks' ? w('line_2weeks', 'Repeats every 2 weeks until {{date}}', { date }) : w('line_week', 'Repeats every week until {{date}}', { date })
    return (
      <section aria-labelledby="content-repeat-title" className="space-y-2">
        {title}
        <p className="text-sm text-a-text">{how} · {w('more', '{{count}} more', { count: series.more })}</p>
        {series.rewriting && <p role="status" className="text-xs text-a-text-2">{w('rewording', 'The AI is rewording the copies…')}</p>}
        {!asking && <Button size="sm" variant="secondary" disabled={busy || dirty} onClick={() => setAsking(true)}>{w('stop', 'Stop repeating')}</Button>}
        {asking && (
          <div role="alert" className="space-y-2 rounded-lg border border-a-danger/30 bg-a-danger/10 p-3">
            <p className="text-sm text-a-text">{w('stop_confirm', 'Stop repeating? {{count}} copies from today on will be removed; published posts and the original stay.', { count: series.removable })}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" loading={busy}
                onClick={() => { void run(async () => { const { post: kept } = await api.stopRepeat(post.id); setAsking(false); if (kept) onPost(kept); else onGone() }) }}>
                {w('stop_yes', 'Stop repeating')}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setAsking(false)}>{t('content.common.cancel', 'Cancel')}</Button>
            </div>
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </section>
    )
  }

  if (from === null) {
    return (
      <section aria-labelledby="content-repeat-title" className="space-y-2">
        {title}
        <p className="text-xs text-a-text-2">{w('needs_day', 'Give the post a day to repeat it.')}</p>
      </section>
    )
  }

  const problem = repeatProblem({ from, every, until, aiRewrite: ai, today })
  const count = repeatDates(from, every, until, today).length
  const [problemKey, problemText] = problem ? errorKey('repeat', problem) : (['', ''] as [string, string])
  const submit = () => {
    if (problem) {
      say(problem)
      return
    }
    void run(async () => { onPost((await api.repeatPost(post.id, { every, until, ai_rewrite: ai })).post) })
  }

  return (
    <section aria-labelledby="content-repeat-title" className="space-y-3">
      {title}
      <div role="group" aria-label={w('every', 'How often')} className="flex flex-wrap gap-1.5">
        {EVERY.map(([value, key, english]) => (
          <button key={value} type="button" aria-pressed={every === value} onClick={() => setEvery(value)} className={chip(every === value)}>{w(key, english)}</button>
        ))}
      </div>
      <label className="block max-w-xs">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{w('until', 'Until')}</span>
        <input type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)}
          className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" />
      </label>
      <label className="flex items-center gap-2 text-sm text-a-text">
        <input type="checkbox" checked={ai} disabled={paused} onChange={(e) => setAi(e.target.checked)} />
        {w('ai', 'Let the AI rewrite each copy')}
      </label>
      {paused && <p className="text-xs text-a-text-2">{t('content.repeat.error.ai_budget_used_up', "This month's AI budget is used up. The copies can still repeat without rewording.")}</p>}
      <p aria-live="polite" className="text-xs text-a-text-2">{problem ? t(problemKey, problemText) : w('copies', '{{count}} copies', { count })}</p>
      {dirty && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      <Button size="sm" variant="secondary" loading={busy} disabled={dirty || problem !== null} onClick={submit}>
        <Repeat size={14} aria-hidden />{w('submit', 'Repeat')}
      </Button>
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
```

- [ ] **Step 5: The panel — the section, and reading the post again while the AI rewords**

`frontend/src/content/panel/PostPanel.tsx` (import `RepeatSection` from `./RepeatSection` and `pollsWhileRewording` from `./repeatMath`):
1. The detail query (line 54) gains the poll:

```tsx
  const detail = useQuery({
    queryKey: ['content', brand, 'post', id], queryFn: () => api.post(id as number).then(r => r.post), enabled: id !== null,
    // While the AI rewords this post's series it is read again every 5 s (spec 2026-10-15 §8); otherwise the panel does not poll.
    refetchInterval: (query) => (pollsWhileRewording(query.state.data) ? 5_000 : false),
  })
```

2. After `const dirty = …` and its effect (lines 97–98):

```tsx
  // While the AI rewords, every read of the post reads the Plan again too; once it is done, once more (its copies changed).
  const rewording = pollsWhileRewording(detail.data)
  const wasRewording = useRef(rewording)
  const readAt = detail.dataUpdatedAt
  useEffect(() => {
    if (rewording || wasRewording.current) void refreshLists(queryClient, brand)
    wasRewording.current = rewording
  }, [readAt, rewording, queryClient, brand])
```

3. Inside the `{post && (<>…</>)}` fragment, between `<AiTools …/>` and `<PostActions …/>`:

```tsx
              {/* The series as last read: its rewording ends without the post itself changing, so the panel's copy would keep "rewording". */}
              <RepeatSection post={post} dirty={dirty} onPost={adopt}
                series={(detail.data && detail.data.id === post.id ? detail.data.series : post.series) ?? null}
                onGone={() => {
                  queryClient.removeQueries({ queryKey: ['content', brand, 'post', post.id] })
                  void refreshLists(queryClient, brand)
                  panel.close()
                }} />
```

- [ ] **Step 6: The words**

Write `$R3B/t9-words.json`:

```json
{
  "panel.repeat.title": { "en": "Repeat", "ru": "Повтор", "de": "Wiederholen", "fr": "Répéter", "es": "Repetir" },
  "panel.repeat.every": { "en": "How often", "ru": "Как часто", "de": "Wie oft", "fr": "Fréquence", "es": "Con qué frecuencia" },
  "panel.repeat.every_week": { "en": "Every week", "ru": "Каждую неделю", "de": "Jede Woche", "fr": "Chaque semaine", "es": "Cada semana" },
  "panel.repeat.every_2weeks": { "en": "Every 2 weeks", "ru": "Раз в 2 недели", "de": "Alle 2 Wochen", "fr": "Toutes les 2 semaines", "es": "Cada 2 semanas" },
  "panel.repeat.every_month": { "en": "Every month", "ru": "Каждый месяц", "de": "Jeden Monat", "fr": "Chaque mois", "es": "Cada mes" },
  "panel.repeat.until": { "en": "Until", "ru": "До", "de": "Bis", "fr": "Jusqu’au", "es": "Hasta" },
  "panel.repeat.ai": { "en": "Let the AI rewrite each copy", "ru": "Пусть ИИ перепишет каждую копию", "de": "Die KI jede Kopie neu schreiben lassen", "fr": "Laisser l’IA réécrire chaque copie", "es": "Dejar que la IA reescriba cada copia" },
  "panel.repeat.copies": { "en": "{{count}} copies", "ru": "Копий: {{count}}", "de": "{{count}} Kopien", "fr": "{{count}} copies", "es": "{{count}} copias" },
  "panel.repeat.submit": { "en": "Repeat", "ru": "Повторить", "de": "Wiederholen", "fr": "Répéter", "es": "Repetir" },
  "panel.repeat.needs_day": { "en": "Give the post a day to repeat it.", "ru": "Задайте посту дату, чтобы повторить его.", "de": "Geben Sie dem Beitrag einen Tag, um ihn zu wiederholen.", "fr": "Donnez un jour à la publication pour la répéter.", "es": "Asigna un día a la publicación para repetirla." },
  "panel.repeat.line_week": { "en": "Repeats every week until {{date}}", "ru": "Повторяется каждую неделю до {{date}}", "de": "Wiederholt sich jede Woche bis {{date}}", "fr": "Se répète chaque semaine jusqu’au {{date}}", "es": "Se repite cada semana hasta el {{date}}" },
  "panel.repeat.line_2weeks": { "en": "Repeats every 2 weeks until {{date}}", "ru": "Повторяется раз в 2 недели до {{date}}", "de": "Wiederholt sich alle 2 Wochen bis {{date}}", "fr": "Se répète toutes les 2 semaines jusqu’au {{date}}", "es": "Se repite cada 2 semanas hasta el {{date}}" },
  "panel.repeat.line_month": { "en": "Repeats every month until {{date}}", "ru": "Повторяется каждый месяц до {{date}}", "de": "Wiederholt sich jeden Monat bis {{date}}", "fr": "Se répète chaque mois jusqu’au {{date}}", "es": "Se repite cada mes hasta el {{date}}" },
  "panel.repeat.more": { "en": "{{count}} more", "ru": "ещё {{count}}", "de": "noch {{count}}", "fr": "encore {{count}}", "es": "{{count}} más" },
  "panel.repeat.rewording": { "en": "The AI is rewording the copies…", "ru": "ИИ переписывает копии…", "de": "Die KI schreibt die Kopien um…", "fr": "L’IA reformule les copies…", "es": "La IA está reescribiendo las copias…" },
  "panel.repeat.stop": { "en": "Stop repeating", "ru": "Остановить повтор", "de": "Wiederholung beenden", "fr": "Arrêter la répétition", "es": "Dejar de repetir" },
  "panel.repeat.stop_confirm": { "en": "Stop repeating? {{count}} copies from today on will be removed; published posts and the original stay.", "ru": "Остановить повтор? Копии с сегодняшнего дня будут удалены ({{count}}); опубликованные посты и оригинал останутся.", "de": "Wiederholung beenden? {{count}} Kopien ab heute werden entfernt; veröffentlichte Beiträge und das Original bleiben.", "fr": "Arrêter la répétition ? {{count}} copies à partir d’aujourd’hui seront supprimées ; les publications publiées et l’original restent.", "es": "¿Dejar de repetir? Se quitarán {{count}} copias desde hoy; las publicaciones publicadas y el original se quedan." },
  "panel.repeat.stop_yes": { "en": "Stop repeating", "ru": "Остановить повтор", "de": "Wiederholung beenden", "fr": "Arrêter la répétition", "es": "Dejar de repetir" }
}
```

Run: `node "$R3B/words.mjs" "$R3B/t9-words.json"` → `words: 18 keys in 5 bundles`.

- [ ] **Step 7: Run the tests, the types and the lint**

Run: `$R3B/vt.sh src/content` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only (the effect sets no state; `wasRewording` is read only inside the effect).

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content panel: repeat a post every week, two weeks or month — limits checked first, the series line, Stop repeating

While the AI rewords a series the panel reads its post again every 5 s
and the Plan with it; Stop repeating asks with the number of copies it
removes; a refusal names the limit in the portal's words.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: The runbook — release 3's portal

**Files:**
- Modify: `docs/content-workspace.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Add the portal's release-3 rules**

In `docs/content-workspace.md`, under "## The portal (`/content`, `frontend/src/content/`)", add at the end of that section's list:

```markdown
- **Click-to-add** (release 3): a day's empty space, or its "+" (week: at the day's foot; month: the corner; list: the
  day's header), opens a new post on that day from the venue's today on; past days take no clicks. The post starts on
  the day's first open slot, else the brand's first active channel, at that channel's usual time; nothing is saved
  before Save; the click a drag's release fires opens nothing (`plan/addMath.ts`).
- **Best times**: a slot reads "Best around {{time}}", the panel's time field offers the platform's suggested times, a
  channel keeps a usual time (Brand → Channels); one table for server and portal (`lib/bestTimes.json`).
- **Hashtags and snippets**: Brand → Hashtags and snippets (managers keep them, everyone reads them; AI suggestions
  save nothing until Add); in the panel, Insert beside Hashtags (no double tags, ignoring case and #) and Insert snippet
  beside Text and Call to action (at the cursor, else at the end); Instagram is warned about past 30 tags.
- **Goals**: under the This week strip on the current week: per platform "published of target · planned", a met goal
  in words, the streak, and from Friday the nudge. Read with the plan and after every post change.
- **Repeat**: in the panel of a saved post with a day; the limits (26 copies, 12 months, 12 AI copies) are checked
  before sending (`panel/repeatMath.ts` mirrors `ContentRepeat`); the panel reads its post every 5 s while the AI
  rewords the series, and the Plan with it.
```

and under "## Deploying" (after the queue check Plan A added), add:

```markdown
- Verify release 3 by content on the live site: the `ContentApp` chunk carries "Best around", "Hashtags and snippets"
  and "Repeats every week until"; `/api/v1/admin/content/goals` answers 401 when signed out (404 before release 3).
- After the deploy (owner): on a real brand, give a channel a usual time, add one hashtag group, start a post with a
  day's "+", repeat one post weekly for a month and stop it; check the goals line on the Plan.
```

- [ ] **Step 2: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs && git commit -q -F - <<'EOF'
Runbook: release 3's portal — click-to-add, best times, hashtags and snippets, goals, repeat; how to verify it live

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: The release checks

The spec's checks (§10) on the finished branch, before the final whole-branch review (whose fix pass, if it changes the portal, runs Steps 1–3 and the touched pass checks again) and before anything is deployed. This task writes only to `$R3B` (git-ignored), to the local database (a temporary brand, removed at the end) and, for each defect a check finds, to the branch: every such fix goes in test-first (a test that fails, then passes) with a ledger line `Task 11: fixed <what> — <test> RED→GREEN`, and its own commit.

**Files:**
- Create (all under `$R3B`): `pass-seed.php`, `pass-unseed.php`, `tools/` (a copy of release 2's tools) with a new `tools/pass.mjs` and `tools/token-server.mjs`, `final-vitest.txt`, `final-php.txt`, `build.txt`, `lighthouse.md`, `eyes.md`, `keys-base.txt`, `keys-new.txt`
- Temporary: a base worktree `C:\wamp64\www\Hexa-Tech-content-base` (origin/main), local servers on :8012 (API), :5173 (Vite), :8099 (Lighthouse sign-in); all undone in Step 10.

**Interfaces:**
- Consumes: everything Plans A and B built; Plan A's three phone-menu changes in Appointments.
- Produces: the evidence Task 12's question to the owner quotes (suite lines, build lines, `46 screens, 3 differ` with their names, Lighthouse scores, the pass's PASS lines).

- [ ] **Step 1: The frontend suites**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R3B/final-vitest.txt" 2>&1; tail -6 "$R3B/final-vitest.txt"; grep -E '^ FAIL ' "$R3B/final-vitest.txt" | sed 's/ >.*//' | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; `Tests  3 failed | … passed`, the only `FAIL` file `src/lib/plannerMeta.test.ts`; the lint ends `✖ 17 problems (17 errors, 0 warnings)`. Ledger: `Task 11: note: vitest <n> passed, 3 baseline failures; tsc clean; lint baseline`.

- [ ] **Step 2: Every PHP suite, by folder**

```bash
cd /c/wamp64/www/Hexa-Tech-content && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R3B/php-paths.txt"; wc -l < "$R3B/php-paths.txt"; rm -f "$R3B/final-php.txt"
"$R3B/php.sh" $(sed -n 1,10p "$R3B/php-paths.txt") | tee -a "$R3B/final-php.txt"      # then 11,20p, 21,30p … to the end, one call each
grep -v "exit 0" "$R3B/final-php.txt"; echo "(nothing above: every path green)"
```

Expected: one line per path (about 72), each `Tests: … passed` and `exit 0`; `tests/Feature/Content/`, `tests/Unit/Content/`, `tests/Feature/ContentCalendar/`, `tests/Feature/AdminAccess/` and `tests/Feature/Appointments/` among them. A failing path: if its test or the code it covers is in this release's change list (`git diff --name-only 47dab9930 HEAD`), it is ours — fix it test-first, commit, run the path again. If neither is, run it once more alone (this suite has crashes that pass on a second run); if it still fails, ledger `Task 11: note: pre-existing failure <path> <test> — not in the change list` (it goes to the owner and does not block).

- [ ] **Step 3: The build check**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx vite build --outDir "$R3B/build" --emptyOutDir > "$R3B/build.txt" 2>&1; echo "build exit $?"
cd "$R3B/build/assets" && ls ContentApp-*.js AppointmentsApp-*.js
for w in 'Best around' 'Hashtags and snippets' 'Repeats every week until' 'New post on'; do printf '%s: ' "$w"; grep -l "$w" *.js | tr '\n' ' '; echo; done
grep -l "data-content\|data-appointments" index-*.js; echo "(no index file listed above)"
cd /c/wamp64/www/Hexa-Tech-content && git checkout -- frontend/dist/stats.html && rm -rf "$R3B/build" && git status --short
```

Expected: `build exit 0`; one `ContentApp-*.js` and one `AppointmentsApp-*.js`; each phrase found only in `ContentApp-*.js`; nothing listed for the index; `git status --short` prints nothing (the visualizer rewrites `frontend/dist/stats.html` whatever the `outDir`; it is restored).

- [ ] **Step 4: Appointments, pixel for pixel, against what is live — exactly three intended differences**

The base is what production runs now (`origin/main`). Release 3 adds no dependency, so the base borrows the branch's `node_modules` through a junction.

```bash
cd /c/wamp64/www/Hexa-Tech-content && git fetch -q origin && git log -1 --format='%h %s' origin/main
git diff --quiet origin/main HEAD -- frontend/package.json frontend/package-lock.json && echo SAME-DEPS
git worktree add --detach ../Hexa-Tech-content-base origin/main
mkdir -p "$R3B/tools" && cp -r .superpowers/sdd/archive/2026-10-15-content-workspace-r2d-release/tools/. "$R3B/tools/"
netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'; echo "ports above must be empty"
```

Expected: origin/main is `a9483b428` (or a later commit the ledger names); `SAME-DEPS`. On `ENOSPC`, stop and report it. Then in PowerShell:

```powershell
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

In `$R3B/tools/pixels.mjs` (Edit tool): replace the whole `assertTree` function with

```js
/** Which tree served the page: only the branch has content/lib/bestTimes.ts (release 3); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/content/lib/bestTimes.ts')
    return r.ok && (r.headers.get('content-type') ?? '').includes('javascript')
  })
  const wanted = which === 'new'
  if (branch !== wanted) throw new Error(`capture ${which}: the page was served by the ${branch ? 'branch' : 'base'} tree`)
}
```

and change `const TOKEN_NAME = 'content-r2d-pixels'` to `const TOKEN_NAME = 'content-r3b-pixels'`.

Start the API (background), the branch's — Appointments' endpoints are the same in both trees:

```bash
cd /c/wamp64/www/Hexa-Tech-content && CORS_ALLOWED_ORIGINS=http://localhost:5173 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --port=8012 --no-reload
```

Start the BASE tree's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content-base/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

Capture the base, a control run on the same server, and the keyboard checks:

```bash
cd "$R3B/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture base && node pixels.mjs capture control && node pixels.mjs compare base control | tail -1
node pixels.mjs keys | tee "$R3B/keys-base.txt" | tail -3
```

Expected: `46 screens, 0 differ` (the method is deterministic) and every keys line `PASS`. If `capture` stops with "no appointment with a client on 2026-09-30", pick a day that has one, use it for every run, and ledger it.

Stop the base Vite (TaskStop); `netstat -ano | grep ':5173 .*LISTENING'` must print nothing (a leftover node PID: check its command line names `Hexa-Tech-content-base`, then `taskkill //PID <pid> //F`). Start the BRANCH's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

```bash
cd "$R3B/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture new; node pixels.mjs compare base new | grep -E '^(DIFF|SIZE|MISSING)|screens'
node pixels.mjs keys | tee "$R3B/keys-new.txt" | tail -3; diff "$R3B/keys-base.txt" "$R3B/keys-new.txt" && echo KEYS-SAME
```

Expected: `46 screens, 3 differ`, and the three are exactly `phone-menu-dark.png`, `phone-menu-light.png` and `phone-menu-ru.png` (spec §3.1: the phone menu now fits what it holds); `KEYS-SAME`. Open the three diff PNGs in `$R3B/shots/diff-base-new/` and both captures of each with the Read tool: the menu is a few pixels wider in English, and in Russian the theme switch no longer runs past the screen. Any other differing screen is a defect of this release: find the change (`git diff 47dab9930 HEAD -- frontend/src/workspace frontend/src/appointments`), fix it test-first where a test can hold it, capture `new` again, and repeat until only the three differ. Keep the branch's Vite and the API running for Steps 5–6.

- [ ] **Step 5: The browser pass that writes for real**

It runs on local org 16, on a temporary brand that is already set up, as the manager `appointments-tester@example.test`. Write the two PHP files with the Write tool.

`$R3B/pass-seed.php`:

```php
<?php
// Plan 3B browser pass: a set-up brand on local org 16 with two channels (Instagram every day, three a week, usual time
// 08:30; LinkedIn on Tuesday and Thursday, one a week), one Instagram post marked published today and one Instagram
// draft tomorrow. pass-unseed.php removes the brand and everything under it.
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$org = 16;
$name = 'Release check 3: hashtags, repeats and goals';
if (DB::table('brands')->where('organization_id', $org)->where('name', $name)->exists()) { echo "EXISTS\n"; return; }
$now = now();
$today = Carbon\CarbonImmutable::now(App\Services\Appointments\VenueClock::zone($org));
$brand = DB::table('brands')->insertGetId([
    'organization_id' => $org, 'name' => $name, 'slug' => 'release-check-r3b', 'widget_token' => Str::random(32),
    'is_default' => false, 'sort_order' => 99, 'created_at' => $now, 'updated_at' => $now,
]);
// The planner models take the tenant from the container, as a request would.
app()->instance('current_organization_id', $org);
app()->instance('current_brand_id', $brand);
$profile = App\Models\ContentPlannerProfile::create(['name' => $name, 'brand_id' => $brand, 'default_language' => 'en', 'setup_completed_at' => $now]);
$days = fn (array $on) => array_merge(array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], false), array_fill_keys($on, true));
App\Models\ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'label' => 'Release check Instagram', 'active' => true, 'frequency' => $days(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), 'posts_per_week' => 3, 'post_time' => '08:30']);
App\Models\ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'linkedin', 'label' => 'Release check LinkedIn', 'active' => true, 'frequency' => $days(['tue', 'thu']), 'posts_per_week' => 1]);
$post = fn (array $more) => App\Models\ContentPlannerPost::create($more + [
    'planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'topic' => 'Checks', 'language' => 'en',
    'generated_by' => 'manual', 'main_copy' => 'Seeded for Plan 3B.', 'hashtags' => [],
]);
$post(['status' => 'published', 'published_at' => $now, 'scheduled_date' => $today->toDateString(), 'scheduled_time' => '08:30', 'hook' => 'Release check published']);
$post(['status' => 'draft', 'scheduled_date' => $today->addDay()->toDateString(), 'hook' => 'Release check draft']);
echo "BRAND {$brand} PROFILE {$profile->id} TODAY {$today->toDateString()}\n";
```

`$R3B/pass-unseed.php`:

```php
<?php
// Removes the release-check brand that pass-seed.php made, and every Content row under it (profile, channels, snippets,
// posts and their copies, and what an AI call added).
use Illuminate\Support\Facades\DB;

$brand = DB::table('brands')->where('organization_id', 16)->where('name', 'Release check 3: hashtags, repeats and goals')->value('id');
if (!$brand) { echo "NOTHING\n"; return; }
$profiles = DB::table('content_planner_profiles')->where('brand_id', $brand)->pluck('id');
$posts = DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->pluck('id');
DB::table('content_planner_visual_briefs')->whereIn('post_id', $posts)->delete();
DB::table('content_planner_post_variations')->whereIn('post_id', $posts)->delete();
DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->delete();
foreach (['content_planner_ai_generations', 'content_planner_channels', 'content_planner_snippets', 'content_planner_brand_voices', 'content_planner_audiences', 'content_planner_pillars', 'content_planner_strategies'] as $table) {
    DB::table($table)->whereIn('planner_profile_id', $profiles)->delete();
}
DB::table('content_planner_profiles')->whereIn('id', $profiles)->delete();
DB::table('brands')->where('id', $brand)->delete();
echo "REMOVED brand {$brand}, profiles {$profiles->count()}, posts {$posts->count()}\n";
```

Write `$R3B/tools/pass.mjs` with the Write tool (it replaces release 2's):

```js
// Plan 3B release check (Task 11): one browser pass that writes for real on local org 16, on a temporary brand made by
// pass-seed.php (removed by pass-unseed.php). API on :8012, Vite on :5173 (the feature tree).
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
const TOKEN_NAME = 'content-r3b-pass'
const BRAND_NAME = 'Release check 3: hashtags, repeats and goals'
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')

const tinker = code => execFileSync(PHP, ['artisan', 'tinker', `--execute=${code}`], { cwd: BACKEND, encoding: 'utf8' })
const artisan = (...args) => execFileSync(PHP, ['artisan', ...args], { cwd: BACKEND, encoding: 'utf8' })
const lastLine = out => out.trim().split('\n').pop().trim()
const brandId = () => Number(lastLine(tinker(`echo DB::table('brands')->where('organization_id',16)->where('name','${BRAND_NAME}')->whereNull('deleted_at')->value('id');`)))
function mint(email) {
  const token = tinker(`echo App\\Models\\User::where('email', '${email}')->firstOrFail()->createToken('${TOKEN_NAME}')->plainTextToken;`).match(/\d+\|[A-Za-z0-9]{20,}/)?.[0]
  if (!token) throw new Error(`no token minted for ${email}`)
  return token
}
const dropTokens = () => tinker(`Laravel\\Sanctum\\PersonalAccessToken::where('name', '${TOKEN_NAME}')->delete();`)
const api = (token, url) => fetch(`${API}/v1/admin/content/${url}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }).then(r => r.json())
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

const results = []
const consoleErrors = []
function record(name, ok, note = '') { results.push([name, !!ok, note]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`) }
/** Polls until `check` holds (this local server answers in 1–2 s, after its CORS preflight). */
async function until(check, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await check().catch(() => false)) return true; await new Promise(r => setTimeout(r, 250)) }
  return false
}

async function session(browser, token, { brand = null, theme = 'light', lang = 'en', width = 1440, height = 900, mobile = false } = {}) {
  const me = await (await fetch(`${API}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()
  if (!me?.id) throw new Error('auth/me did not answer with a user')
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', locale: lang === 'ru' ? 'ru-RU' : 'en-GB', hasTouch: mobile, isMobile: mobile })
  await context.addInitScript(([t, user, look, language, b]) => {
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
const ready = page => page.getByRole('button', { name: 'New post' }).first().waitFor({ timeout: 30_000 })
const panel = page => page.locator('[data-panel]')
const section = (page, name) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })
const opacity = locator => locator.evaluate(el => getComputedStyle(el).opacity)

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const brand = brandId()
  if (!brand) throw new Error('no release-check brand: run pass-seed.php first')
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--font-render-hinting=none'] })
  const manager = mint(MANAGER)
  try {
    const today = (await api(manager, `bootstrap?brand_id=${brand}`)).venue.today
    const ahead = addDays(today, 2) // Instagram's slot is open there (every day; the seeded draft is tomorrow)

    // Click-to-add and best times on a desktop week.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${ahead}`)
      await ready(page)
      const plus = page.locator(`[data-add="${ahead}"]`)
      record('A1 a day ahead has its "+", a day gone has none', (await plus.count()) === 1 && (await page.locator(`[data-add="${addDays(today, -1)}"]`).count()) === 0)
      record('A2 the "+" waits for hover where the device hovers', (await opacity(plus)) === '0')
      await page.locator(`[data-drop-date="${ahead}"]`).hover()
      record('A3 hovering the day shows its "+"', await until(async () => (await opacity(plus)) === '1'))
      await shot(page, 'plan-week-hover')
      await plus.click()
      const field = selector => panel(page).locator(selector).first()
      record('A4 the "+" opens a new post on its day, on Instagram at its usual 08:30', await until(async () =>
        (await field('input[type="date"]').inputValue()) === ahead && (await field('input[type="time"]').inputValue()) === '08:30' && (await field('select').inputValue()) === 'instagram'))
      record('T1 the time field offers the suggested times', (await panel(page).getByRole('group', { name: 'Suggested times' }).count()) === 1)
      await shot(page, 'panel-new-post')
      await panel(page).getByRole('button', { name: 'Close' }).click()
      await until(async () => (await panel(page).count()) === 0)
      const box = await page.locator(`[data-drop-date="${ahead}"]`).boundingBox()
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8)
      record('A5 a click on a day\'s empty space opens a new post there', await until(async () => (await field('input[type="date"]').inputValue()) === ahead))
      await panel(page).getByRole('button', { name: 'Close' }).click()
      record('T2 an empty slot says when it is best posted', await until(() => page.getByText('Best around 08:30').first().isVisible()))
      await page.goto(`${APP}/content?date=${today}`)
      await ready(page)
      record('G1 the goals line counts the post marked published', await until(() => page.getByText(/Instagram: 1 of 3 published/).first().isVisible()))
      await shot(page, 'plan-goals')
      await context.close()
    }
    // A touch screen: the "+" shows without hover.
    {
      const phone = await session(browser, manager, { brand, width: 390, height: 844, mobile: true })
      await phone.page.goto(`${APP}/content?date=${ahead}`)
      await ready(phone.page)
      record('A6 on a touch screen the "+" shows without hover', await until(async () => (await opacity(phone.page.locator(`[data-add="${ahead}"]`))) === '1'))
      await shot(phone.page, 'plan-phone')
      await phone.context.close()
    }
    // Brand: a hashtag group, a channel's usual time.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content/brand`)
      const snippets = section(page, 'Hashtags and snippets')
      await snippets.waitFor({ timeout: 30_000 })
      await snippets.getByRole('button', { name: 'Add a hashtag group' }).click()
      await snippets.getByLabel('Name', { exact: true }).fill('Release check tags')
      await snippets.getByLabel(/^Hashtags/).fill('#releasecheck #autumn')
      await snippets.getByRole('button', { name: 'Save', exact: true }).click()
      record('S1 a manager adds a hashtag group', await until(async () => (await api(manager, `brand?brand_id=${brand}`)).snippets?.some(s => s.name === 'Release check tags')))
      await shot(page, 'brand-snippets')
      await page.locator('li').filter({ hasText: 'Release check LinkedIn' }).getByRole('button', { name: 'Edit' }).click()
      await page.getByRole('group', { name: 'Suggested times' }).getByRole('button', { name: '12:00' }).click()
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      record('B1 a channel keeps the usual time chosen from the suggested times', await until(async () => (await api(manager, `brand?brand_id=${brand}`)).channels?.find(c => c.platform === 'linkedin')?.post_time === '12:00'))
      await context.close()
    }
    // The panel: Insert, then a weekly repeat for three weeks, then Stop repeating.
    {
      const { context, page } = await session(browser, manager, { brand })
      const draft = ((await api(manager, `posts?brand_id=${brand}&q=${encodeURIComponent('Release check draft')}`)).data ?? [])[0]
      await page.goto(`${APP}/content?date=${draft.scheduled_date}`)
      await ready(page)
      await page.locator(`button[data-post="${draft.id}"]`).click()
      const insert = panel(page).getByRole('button', { name: 'Insert', exact: true })
      for (let i = 0; i < 2; i++) {
        await insert.click()
        await panel(page).getByRole('button', { name: /Release check tags/ }).click()
      }
      const tags = await panel(page).getByLabel(/^Hashtags/).inputValue()
      record('S2 Insert adds the group\'s tags once, however often it is picked', (tags.match(/#releasecheck/g) ?? []).length === 1, tags)
      await panel(page).getByRole('button', { name: 'Save', exact: true }).click()
      await until(async () => ((await api(manager, `posts/${draft.id}?brand_id=${brand}`)).post?.hashtags ?? []).includes('#releasecheck'))
      await panel(page).getByRole('button', { name: 'Every week' }).click()
      await panel(page).getByLabel('Until').fill(addDays(draft.scheduled_date, 21))
      record('R0 the panel says how many copies before sending', await until(() => panel(page).getByText('3 copies').isVisible()))
      await panel(page).getByRole('button', { name: 'Repeat', exact: true }).click()
      const count = async () => ((await api(manager, `posts?brand_id=${brand}&q=${encodeURIComponent('Release check draft')}`)).data ?? []).length
      record('R1 a weekly repeat makes three copies', await until(async () => (await count()) === 4))
      record('R2 the panel says how the series runs', await until(() => panel(page).getByText(/Repeats every week until/).isVisible()))
      await shot(page, 'panel-series')
      await panel(page).getByRole('button', { name: 'Stop repeating' }).click()
      record('R3 Stop repeating asks with the number of copies it removes', await until(() => panel(page).getByText(/Stop repeating\? 3 copies/).isVisible()))
      await panel(page).getByRole('alert').getByRole('button', { name: 'Stop repeating' }).click()
      record('R4 Stop repeating removes the copies and keeps the post', await until(async () => (await count()) === 1))
      await context.close()
    }
    // Russian on a phone: the new Brand section fits.
    {
      const phone = await session(browser, manager, { brand, lang: 'ru', width: 390, height: 844, mobile: true })
      await phone.page.goto(`${APP}/content/brand`)
      const title = phone.page.getByText('Хештеги и заготовки').first()
      await title.waitFor({ timeout: 30_000 })
      await title.scrollIntoViewIfNeeded()
      record('S3 Hashtags and snippets fits a phone in Russian, nothing off the screen', await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      await shot(phone.page, 'brand-snippets-ru-phone')
      await phone.context.close()
    }
    // Switched off: the calm notice on a first visit (Content is switched back on whatever happens).
    {
      artisan('workspace:content', '16', '--off')
      try {
        const { context, page } = await session(browser, manager, { brand })
        await page.goto(`${APP}/content`)
        record('X1 a switched-off organisation sees the calm notice on its first visit', await until(() => page.getByText('HexaTech Content has been switched off for your organisation.').isVisible()))
        await shot(page, 'switched-off')
        await context.close()
      } finally {
        artisan('workspace:content', '16', '--on')
      }
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

Run it (the branch's Vite and the API still run from Step 4):

```bash
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R3B/pass-seed.php" | tail -1
cd "$R3B/tools" && node pass.mjs | tee "$R3B/pass.txt" | tail -25
```

Expected: the jobs count noted (ledger it); `BRAND <id> PROFILE <id> TODAY <date>`; every line `PASS`, `console errors: 0`, `19 checks, 0 failed`. A FAIL: read the line and the screenshot; a defect of the portal is fixed test-first (a component or helper test that fails, then passes), committed, and the pass run again (run `pass-unseed.php` and `pass-seed.php` first, so it starts from the same brand). A defect of the script (a selector that the page does not have) is fixed in the script and ledgered `Task 11: Ruling: pass script <what> — <why the page is right>`.

- [ ] **Step 6: Lighthouse accessibility on the Plan, the panel and Brand**

Write `$R3B/tools/token-server.mjs` with the Write tool (it replaces release 2's):

```js
// Hands one sign-in to the Lighthouse browser (the chrome-devtools MCP) without the token passing through the conversation.
//   node token-server.mjs        mint a manager token in memory; serve {token, brand} at http://127.0.0.1:8099/session to http://localhost:5173 only
//   node token-server.mjs drop   delete the tokens it minted
import { execFileSync } from 'node:child_process'
import http from 'node:http'

const PHP = 'C:/wamp64/bin/php/php8.4.20/php.exe'
const BACKEND = 'C:/wamp64/www/Hexa-Tech-content'
const NAME = 'content-r3b-lighthouse'
const BRAND_NAME = 'Release check 3: hashtags, repeats and goals'
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

The release-check brand from Step 5 is still there (with its hashtag group). Start `node "$R3B/tools/token-server.mjs"` in the background (it prints only `serving on 127.0.0.1:8099`). Load the chrome-devtools tools with ToolSearch (`select:` the `new_page`, `navigate_page`, `evaluate_script`, `take_snapshot`, `click`, `wait_for` and `lighthouse_audit` tools of `mcp__plugin_chrome-devtools-mcp_chrome-devtools`), then:

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
3. `take_snapshot`, `click` the first post card (a `button` carrying the post's spoken name), and audit again in the tool's snapshot mode (the page as it is, panel open, Repeat and the time chips in it). If the tool offers no snapshot mode, ledger `Task 11: note: Lighthouse has no snapshot mode here — the panel is covered by its component tests and the Plan audit` and go on.
4. `navigate_page` to `http://localhost:5173/content/brand`, `wait_for` `Hashtags and snippets`, audit.

Then stop the token server (TaskStop) and run `node "$R3B/tools/token-server.mjs" drop` → `dropped`.

Write `$R3B/lighthouse.md`: per page the accessibility score and every failing audit with its elements. Expected: no failing audit the portal can fix. Each one it can is a defect: fix it test-first (a component test that renders the element and checks the missing name, role or contrast token), commit, and audit that page again. One the portal cannot fix (a browser extension, the dev server's overlay) gets `Task 11: Ruling: <audit> — <why it is not the portal's> — <cost if wrong>`. No conformance is claimed.

- [ ] **Step 7: Eyes**

Open every screenshot in `$R3B/shots/pass/` with the Read tool and write one line each in `$R3B/eyes.md`:
- `plan-week-hover.png`: the hovered day's "+" at its foot, the other days' hidden; the slots read "Best around 08:30".
- `panel-new-post.png`: the new post on the day ahead, Instagram, 08:30, the suggested-time chips under the time with 08:30's look not pressed unless it is one of them.
- `plan-goals.png`: the goals line under the This week strip — "Instagram: 1 of 3 published · …", LinkedIn's, the hint line.
- `plan-phone.png`: the list on a phone, each day's "+" visible at its header's end, nothing off the screen.
- `brand-snippets.png`: Hashtags and snippets after Brand's Channels, the new group listed with its tags, Suggest with AI under it.
- `panel-series.png`: "Repeats every week until …· 3 more" and Stop repeating.
- `brand-snippets-ru-phone.png`: the section in Russian on a phone, its buttons wrapping, nothing cut mid-word or off the screen.
- `switched-off.png`: the calm notice and "Open the full admin", no dashboard behind it.

Anything that looks wrong to a person is a defect: fix it (test-first where a test can hold it), take the screenshot again, and say so in `eyes.md`.

- [ ] **Step 8: The suites again if anything was fixed**

If Steps 2–7 committed any fix, run Step 1 again and the PHP paths those fixes touch (`"$R3B/php.sh" <paths>`). Expected: as in Steps 1–2.

- [ ] **Step 9: Ledger**

Append to `$R3B/progress.md`: `Task 11: note: vitest …; PHP <n> paths green (<pre-existing failures, if any>); build check clean; Appointments 46 screens, 3 differ (phone-menu-dark/light/ru, intended), keys same; Lighthouse <Plan / panel / Brand>; pass 19 checks 0 failed; eyes ok`.

- [ ] **Step 10: Clean up**

```bash
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R3B/pass-unseed.php" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo Laravel\Sanctum\PersonalAccessToken::where('name', 'like', 'content-r3b-%')->count();" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan workspace:content 16 --status | tail -2
```

Expected: `REMOVED brand <id>, profiles 1, posts 2`; tokens `0`; jobs as noted before the pass; org 16's Content `on`. Stop the API and the Vite tasks (TaskStop); `netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'` must print nothing (a leftover node PID: check its command line, then `taskkill //PID <pid> //F`). Remove the base worktree — junction first, in PowerShell:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove ../Hexa-Tech-content-base && git worktree list | grep -c content-base; test -d frontend/node_modules/react && echo MODULES-KEPT; git status --short
```

Expected: `0`; `MODULES-KEPT`; `git status --short` prints nothing.

- [ ] **Step 11: Record the task**

```bash
bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/executing-plans/scripts/task-done docs/superpowers/plans/2026-10-15-content-release-3b.md 11 <BASE> -- "$R3B/vt.sh" src/content src/workspace src/appointments
```

---

### Task 12: The deploy (source-patch recipe), after the owner's "yes, deploy"

Run this task after the final whole-branch review and its fix pass (executing-plans' Final Review), so the feature tip it ships is final.

Merging to `main` is a production deploy: Laravel Cloud runs `migrate --force` (release 3 brings three additive migrations) and rebuilds the SPA. This task prepares the artifact in its own worktree, proves it, then **stops and asks the owner**. Nothing is pushed without the owner's explicit "yes, deploy" in this conversation; release 2's yes does not carry over.

**Files:**
- Temporary: worktree `C:\wamp64\www\Hexa-Tech-deploy-content-r3` on branch `deploy/content-r3` (from `origin/main`), with a copied `vendor`, the local `.env` and a `frontend/node_modules` junction; removed in Step 9 (the branch is kept).
- Ledger: `$R3B/deploy-list.txt`, `$R3B/deploy-php.txt`, `$R3B/deploy-vitest.txt`, `$R3B/deploy-build.txt`, `$R3B/postdeploy.txt`.

**Interfaces:**
- Consumes: the feature tip after the review and Task 11 (`TIP`), the last deployed feature tip `47dab9930`, prod main `a9483b428`, `$R3B/php.sh`.

- [ ] **Step 1: Fix the inputs**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git status --short && git fetch -q origin
TIP=$(git rev-parse HEAD); echo "TIP $TIP"; git log -1 --format='%h %s' origin/main
git diff --stat 47dab9930 origin/main -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: a clean status; origin/main `a9483b428`; the last line prints nothing (production's source is exactly the last deployed feature tip). If origin/main moved on, the line lists what changed there: Step 3's third guard proves none of it touches this release's files; ledger the new origin/main.

Ledger: `Task 12: note: TIP <sha>; origin/main <sha>`.

- [ ] **Step 2: The deploy worktree**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree add ../Hexa-Tech-deploy-content-r3 -B deploy/content-r3 origin/main
cp .env ../Hexa-Tech-deploy-content-r3/.env
```

In PowerShell (robocopy, never a junction for `vendor`: PHPUnit would test the other tree; robocopy's exit codes 0–7 mean success):

```powershell
robocopy C:\wamp64\www\Hexa-Tech-content\vendor C:\wamp64\www\Hexa-Tech-deploy-content-r3\vendor /E /NFL /NDL /NJH /NJS /NP; if ($LASTEXITCODE -lt 8) { 'VENDOR-OK' }
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-deploy-content-r3\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

Expected: `VENDOR-OK`; the junction made. On `ENOSPC` (or robocopy's "not enough space"), stop and report it; delete nothing to make room.

- [ ] **Step 3: The change list and its guards**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git diff --no-renames --name-status 47dab9930 "$TIP" > "$R3B/deploy-list.txt"; wc -l < "$R3B/deploy-list.txt"
cut -f2 "$R3B/deploy-list.txt" | grep -vE '^(app/|routes/api\.php$|tests/|frontend/src/|docs/|database/migrations/2026_10_15_1000(00|100|200)_)'; echo "(nothing above: every path is in the allowlist)"
cut -f2 "$R3B/deploy-list.txt" | grep -E '^(frontend/dist/|public/spa/|resources/spa-shell/|config/|composer\.|frontend/package)'; echo "(nothing above: no built file, no config, no dependency)"
cut -f2 "$R3B/deploy-list.txt" | grep '^database/'; echo "(above: exactly the three release-3 migrations)"
git diff --name-only a9483b428 origin/main -- $(cut -f2 "$R3B/deploy-list.txt"); echo "(nothing above: production has not changed any file of this release since a9483b428)"
cut -f1 "$R3B/deploy-list.txt" | sort | uniq -c
```

Expected: about 130 lines; the first two guards print nothing but their notes; the third lists exactly `database/migrations/2026_10_15_100000_add_post_time_to_content_planner_channels.php`, `…100100_create_content_planner_snippets_table.php` and `…100200_add_series_id_to_content_planner_posts.php`; the fourth prints nothing; the status count shows `A` and `M` (and any `D` the ledger can explain). A path outside the allowlist: stop and find out why before going on (another feature's commit must not ride the deploy); ledger the answer.

- [ ] **Step 4: Apply, check parity, commit**

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r3
awk -F'\t' '$1 != "D" {print $2}' "$R3B/deploy-list.txt" > "$R3B/deploy-am.txt"
awk -F'\t' '$1 == "D" {print $2}' "$R3B/deploy-list.txt" > "$R3B/deploy-d.txt"
xargs -a "$R3B/deploy-am.txt" git checkout "$TIP" --
[ -s "$R3B/deploy-d.txt" ] && xargs -a "$R3B/deploy-d.txt" git rm -q --
git diff --cached --stat | tail -1
git diff --cached "$TIP" -- $(cut -f2 "$R3B/deploy-list.txt") | head -5; echo "(nothing above: parity with the feature tip, deletions included)"
git diff "$TIP" --stat -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: the cached stat counts every line of the list; the parity diff prints nothing; when origin/main was still `a9483b428`, the last line prints nothing too (whole-tree parity with the feature tip outside the built files).

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r3 && git commit -q -F - <<'EOF'
HexaTech Content, release 3: click-to-add, best times, hashtags and snippets, goals and streaks, repeat posts

Click a day (or its "+") to start a post; best-time hints and a channel's
usual time; a brand's hashtag groups and snippets with AI suggestions and
Insert in the panel; this week's posting goals and the streak; repeat
posts with optional AI rewording; and every release-2 leftover. Three
additive migrations (channels.post_time, content_planner_snippets,
posts.series_id). Source of feature/content-workspace at TIP_SHA (since 47dab9930).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='%h %s'
```

(Before committing, replace `TIP_SHA` in the message with the short sha of `$TIP`, by editing the command.)

- [ ] **Step 5: Every suite on the artifact**

The PHP suites, by folder, on the deploy worktree, in batches of about ten per call (`php.sh` runs in the feature worktree, so for the artifact use a copy that runs in the deploy tree):

```bash
sed 's#cd /c/wamp64/www/Hexa-Tech-content #cd /c/wamp64/www/Hexa-Tech-deploy-content-r3 #' "$R3B/php.sh" > "$R3B/php-deploy.sh" && chmod +x "$R3B/php-deploy.sh" && grep -n "^cd " "$R3B/php-deploy.sh"
cd /c/wamp64/www/Hexa-Tech-deploy-content-r3 && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R3B/deploy-paths.txt"; wc -l < "$R3B/deploy-paths.txt"; rm -f "$R3B/deploy-php.txt"
"$R3B/php-deploy.sh" $(sed -n 1,10p "$R3B/deploy-paths.txt") | tee -a "$R3B/deploy-php.txt"     # then 11,20p … to the end
grep -v "exit 0" "$R3B/deploy-php.txt"; echo "(nothing above: every path green)"
```

Expected: the `grep -n` line shows `cd /c/wamp64/www/Hexa-Tech-deploy-content-r3 || exit 1`; every PHP path `exit 0` (the same paths and results as Task 11; a pre-existing failure Task 11 recorded may repeat, nothing new).

The frontend, and the build:

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r3/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R3B/deploy-vitest.txt" 2>&1; tail -5 "$R3B/deploy-vitest.txt"; grep -E '^ FAIL ' "$R3B/deploy-vitest.txt" | sed 's/ >.*//' | sort -u
npm run build > "$R3B/deploy-build.txt" 2>&1; echo "build exit $?"; tail -5 "$R3B/deploy-build.txt"
cd .. && git status --short | cut -c4- | cut -d/ -f1-2 | sort | uniq -c
```

Expected: `TSC-CLEAN`; vitest `3 failed` only in `src/lib/plannerMeta.test.ts`; `build exit 0`; the status shows changes only under `frontend/dist`, `public/spa` and `resources/spa-shell`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r3 && git add frontend/dist public/spa resources/spa-shell && git commit -q -m "Build the SPA for HexaTech Content release 3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git status --short && git log -3 --format='%h %s'
```

Expected: a clean status; the build commit on top of the source commit, on top of origin/main.

- [ ] **Step 6: STOP — ask the owner**

Ledger `Task 12: note: artifact ready — deploy/content-r3 <sha> (source <sha> + build <sha>), <n> files (A <a>, M <m>, D <d>), PHP <n> paths green, vitest <n> passed + 3 baseline, build ok`, then ask the owner, with the facts in plain words:

- what ships: click-to-add, best-time hints and a channel's usual time, hashtag groups and snippets (with AI suggestions), posting goals and streaks, repeat posts (with optional AI rewording), and every release-2 leftover (the phone menu that fits in both workspaces, the darker platform marks, Find that waits, the server fixes);
- the three additive migrations (`content_planner_channels.post_time`, `content_planner_snippets`, `content_planner_posts.series_id`): nothing existing changes;
- what changes for people: Appointments' phone menu is a little wider (and no longer cut in Russian); admin tabs left open across the deploy must be reloaded;
- the queue check from the runbook: `retry_after` is 90 s while the strategy job may run 600 s — with more than one queue worker, the owner should raise `retry_after` (the rewording job itself is safe: one copy per run);
- the checks: Task 11's results (suites, `46 screens, 3 differ` — the three phone-menu screens —, Lighthouse, the browser pass) and Step 5's;
- the question: **"Shall I deploy? Reply 'yes, deploy' to push it to production."**

Wait for the answer. Anything other than a clear yes: do not push; keep the deploy worktree, and do what the owner asks.

- [ ] **Step 7: Push (only after "yes, deploy")**

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r3 && git fetch -q origin && git log -1 --format='%h' origin/main
OLD=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "OLD $OLD" | tee "$R3B/postdeploy.txt"
for u in /api/v1/admin/content/goals /api/v1/admin/content/bootstrap; do printf 'before %s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/json' "https://app.hexa-tech.uk$u")"; done | tee -a "$R3B/postdeploy.txt"
```

Expected: origin/main is still the commit the deploy branch was cut from (if it moved, stop: rebase nothing, tell the owner and start again from Step 1); `OLD /spa/assets/index-….js`; `before /api/v1/admin/content/goals 404` and `before /api/v1/admin/content/bootstrap 401`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r3 && git push origin deploy/content-r3:main 2>&1 | tail -2; date -u +%FT%TZ
```

Then wait for Laravel Cloud's new bundle (Bash, `run_in_background`; it re-invokes when it exits; about 2–3 minutes in earlier releases):

```bash
OLD='<the OLD path from above>'; for i in $(seq 1 60); do NEW=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); [ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && { echo "NEW $NEW at $(date -u +%T)"; exit 0; }; sleep 15; done; echo "STILL OLD after 15 minutes"; exit 1
```

Expected: `NEW /spa/assets/index-….js`. "STILL OLD": look at the Laravel Cloud deploy log with the owner (a failed migration stops the deploy); do not push again.

- [ ] **Step 8: Verify by content**

```bash
B=https://app.hexa-tech.uk; NEW=$(curl -s $B/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "NEW $NEW" | tee -a "$R3B/postdeploy.txt"
curl -s "$B$NEW" -o "$R3B/live-index.js"; printf 'index data-content/data-appointments: %s\n' "$(grep -c 'data-content\|data-appointments' "$R3B/live-index.js")" | tee -a "$R3B/postdeploy.txt"
CA=$(grep -o 'ContentApp-[A-Za-z0-9_-]*\.js' "$R3B/live-index.js" | head -1); AA=$(grep -o 'AppointmentsApp-[A-Za-z0-9_-]*\.js' "$R3B/live-index.js" | head -1); echo "chunks $CA $AA" | tee -a "$R3B/postdeploy.txt"
curl -s "$B/spa/assets/$CA" -o "$R3B/live-content.js"; for w in 'Best around' 'Hashtags and snippets' 'Repeats every week until' 'New post on'; do printf 'ContentApp has "%s": %s\n' "$w" "$(grep -c "$w" "$R3B/live-content.js")"; done | tee -a "$R3B/postdeploy.txt"
curl -s "$B/spa/assets/$AA" | grep -c 'data-appointments' | sed 's/^/AppointmentsApp has data-appointments: /' | tee -a "$R3B/postdeploy.txt"
for u in /api/v1/admin/content/goals /api/v1/admin/content/bootstrap; do printf 'after %s %s %s\n' "$u" "$(curl -s -o "$R3B/body.json" -w '%{http_code}' -H 'Accept: application/json' "$B$u")" "$(head -c 80 "$R3B/body.json")"; done | tee -a "$R3B/postdeploy.txt"
for p in / /content /appointments; do printf 'page %s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done | tee -a "$R3B/postdeploy.txt"
rm -f "$R3B/live-index.js" "$R3B/live-content.js" "$R3B/body.json"
```

Expected: `index data-content/data-appointments: 0`; both chunk names found; the ContentApp chunk has each of the four phrases (counts ≥ 1); `AppointmentsApp has data-appointments:` ≥ 1; `after /api/v1/admin/content/goals 401 {"message":"Unauthenticated."…` (it answered 404 before) and `after /api/v1/admin/content/bootstrap 401`; the three pages `200`. Any other answer: tell the owner at once, with the line.

- [ ] **Step 9: Clean up and record**

In PowerShell, the junction first, then the worktree:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-deploy-content-r3\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove --force ../Hexa-Tech-deploy-content-r3 && git worktree list | grep -c deploy-content-r3; test -d frontend/node_modules/react && echo MODULES-KEPT
```

Expected: `0`; `MODULES-KEPT`. (`--force` because the copied `vendor` and `.env` are untracked files in it; the branch `deploy/content-r3` stays.)

Ledger: `Task 12: complete — LIVE as prod main <sha> (source <sha> + build <sha>; <n> files) pushed <time>Z, new index live <time>Z (<index>, <ContentApp chunk>); verified by content (postdeploy.txt): …`.

Update the memory file `content-workspace.md` and its line in `MEMORY.md`: release 3 LIVE as prod main `<sha>` (date), verified by content; the owner's checks still open (the runbook's "After the deploy" lines for releases 2 and 3, the queue `retry_after` check); release 4 next (key dates and the "+" menu, ideas board, templates, approvals and comments — its own spec).

Tell the owner it is live, with the verification lines and the runbook's "After the deploy" checks.
