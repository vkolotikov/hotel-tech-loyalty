# HexaTech Content — Release 4a, Plan 2: the Portal for Key Dates, Ideas and Templates, the Release Checks and the Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the portal half of release 4a "plan and create" on Plan 4A-1's server — key dates on the Plan with the day's "+" as a menu, the Brand page's Key dates and Templates sections, the Ideas board with quick capture, templates in the post panel and from the "+" — then prove the release and ship it in one deploy after the owner's "yes, deploy".

**Architecture:**
- **Behaviour in pure helpers, pinned by node tests** (the test environment has no DOM and cannot click): `plan/keyDateMath.ts`, `ideas/ideasMath.ts`, `panel/templateApply.ts`, `brand/templateActions.ts`, `lib/dayNames.ts`. Components render them and are checked with `renderToStaticMarkup`.
- **One shared menu** `content/ui/PopMenu.tsx` (Insert's behaviour from release 3's review: closes on a press or focus outside, Escape claimed, focus handed back) carries the "+" menu, Insert, the Template menu and the Ideas card's "Move to…". Dialogs use the existing modal `content/ui/Dialog.tsx`.
- **Reads:** the Plan's existing read carries `key_dates`; the brand read carries templates and the guessed country; one new read `['content', brand, 'ideas', …]`, refreshed with the Plan's lists.
- **Two owner rulings on the server first** (recommended, then "yes please proceed"): the country guess takes the time zone's own country (limited to the nine), and template hashtags are a `json` column.
- Then the release checks (every suite, the build, Appointments pixel for pixel with **no** difference, Lighthouse, a browser pass that writes for real) and the deploy by the source-patch recipe.

**Tech Stack:** React 19, TypeScript 5.9, Vite 5, React Router 7, TanStack Query 5, react-i18next 17, Tailwind 3.4 (Atelier `a-*`), lucide-react, vitest 2 (node, `renderToStaticMarkup`); Laravel 13 on PHP 8.4.20; Playwright (`playwright-core`) and the chrome-devtools MCP for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-16-content-release-4-design.md` (approved 2026-10-16), §3–§5, §9.3, §10, §11 (4a). Earlier specs, still binding: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`, `docs/superpowers/specs/2026-10-15-content-release-3-design.md`.

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `369f87848` (Plan 4A-1 built, reviewed, fixed). Production is release 3: prod main `7b4b96191` = the source of feature tip `d11056743` + a build. Plan 4A-1's ledger and tools: `.superpowers/sdd/archive/2026-10-16-content-release-4a-1/` (its deferred minors for this plan: key built-in chips by kind + id + date + substitute; match pillars by name on Use; say "observed" for US substitute days).

## Global Constraints

- **Branch:** never push the feature branch; never commit its built `frontend/dist`, `public/spa` or `resources/spa-shell`. Only Task 13 pushes, and only after the owner's explicit "yes, deploy" in this conversation.
- **Ledger and tools:** `.superpowers/sdd/2026-10-16-content-release-4a-2/`, called `$R4B` below. Task 1, Step 1 sets it up: `vt.sh` (vitest on paths) and `words.mjs` (locale keys inserted without reformatting a bundle) from release 3B's archive; `php.sh` (PHP paths, honest exit code) and `extract.mjs` (copies a plan code block into a file: `node $R4B/extract.mjs $R4B/task-N-brief.md "<line naming the file>" <path>`) from 4A-1's archive.
- **Frontend commands** (Git Bash): types `cd frontend && npx tsc -b`; tests `$R4B/vt.sh <paths…>`; scoped lint `cd frontend && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts`.
- **Baselines:** the full vitest run has exactly 3 failures (`src/lib/plannerMeta.test.ts`); the scoped lint has exactly 17 errors (`src/App.tsx` 1, `src/components/Layout.tsx` 15, `src/pages/hubs/MarketingHub.tsx` 1). Anything else is ours.
- **Tests cannot click** (`vitest.config.ts`: node environment, no jsdom). Every click rule lives in a pure helper with its own test; components are rendered with `renderToStaticMarkup` and checked by their markup. `useMedia` is false in tests (the Plan renders its list view; the Ideas page its one-stage phone view); render `WeekGrid`, `MonthGrid` and `IdeaColumn` directly to test them. Static markup escapes `'` as `&#x27;` — English words the tests look for use the typographic `’`.
- **Types:** new fields on types literal test fixtures build (`PlanPayload`, `BrandPayload`, `BrandProfile`, `NewDraft`) are optional, so the fixtures still compile.
- **Words:** every new literal `content.*` key in all five bundles (`frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`), inserted with `node $R4B/words.mjs <file>.json` (creates missing parents, keeps the formatting, checks every key before writing). Never a heredoc for a bundle. Keys built at run time go into `FAMILIES` in `content/i18n/contentLocales.test.ts`. A word holding a count puts the number where no noun follows it (release 3's rule, `COUNTED` in the same test).
- **Refusals:** a new family in `lib/errors.ts` (`ERRORS`) must deep-equal `en.<family>.error` (`errors.test.ts`); the portal's own sentence for every refusal; the server's message is never shown.
- **Portal rules (`content/tokens.test.ts`):** nothing imported from `src/appointments`; no bare `hover:-translate-*`; no text under 12 px; stylesheet rules scoped under `[data-content]`; only `a-*` / `c-*` colour classes. "Show on hover, always on touch" uses `[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 focus-visible:opacity-100`.
- **React lint:** no synchronous `setState` inside an effect; no `ref.current` read during render; no component defined inside another; a component file exports components only (helpers live in `*.ts` files — fast refresh).
- **Appointments and the shared workspace core do not change in this plan:** the release checks expect `46 screens, 0 differ`.
- **PHP:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by folder, in the foreground (`$R4B/php.sh <paths…>`); never a bare `php artisan test`.
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace — write code holding backslashes with the Write or Edit tool (or `extract.mjs`), never a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The same built-in day twice in one view:** Boxing Day (26 December) and its substitute (28 December) share the id `gb.boxing_day`; a month view may also hold two weeks' worth of events. Every chip needs its own key, or React drops or merges chips.
   - Pinned by Task 4's `keyOf` test (kind + id + date + substitute; own dates by their id).
2. **An event that began before the shown range:** an event from 28 September to 8 October shows on every shown day it covers (5–8 October in that week), and a note on a past day still shows — only the "+" stops at today.
   - Pinned by Task 4's `keyDatesByDay` test and its past-day render test.
3. **A click on a chip or a menu item inside a day's empty space:** it must not also start a new post (the day's click handler skips buttons).
   - Pinned by Task 4's render test (chips are `<button>`s) and Task 5's `clickAdds` test (a click anywhere in a menu, `[data-menu]`, its padding included, starts nothing).
4. **A template over words already written:** applying it asks first; applying it to an empty post does not ask; the blanks line counts what is left after the apply.
   - Pinned by Task 10's `replacesText` and `blanksIn` tests.
5. **A card moved to the stage it is already in, and an idea of only spaces:** nothing is sent.
   - Pinned by Task 7's `moveStatus` test and Task 8's `ideaBody` test.

---

## File map

- **Task 1 (owner rulings, server):** `app/Services/Content/Days/HolidayCountry.php`, `database/migrations/2026_10_16_100200_create_content_planner_templates_table.php`; tests `tests/Feature/Content/HolidayCountryTest.php`, new `tests/Unit/Content/TemplatesMigrationTest.php`.
- **Task 2 (data layer):** `frontend/src/content/lib/{types.ts,api.ts,errors.ts}`, `frontend/src/content/brand/useBrand.ts`, `frontend/src/content/lib/planCache.ts`; tests `lib/api.test.ts`, `brand/useBrand.test.ts`, `lib/planCache.test.ts`; words (`keydate.error.*`, `idea.error.*`, `template.error.*`).
- **Task 3 (day names):** new `frontend/src/content/lib/dayNames.ts` (+ `dayNames.test.ts`), `content/i18n/contentLocales.test.ts` (`FAMILIES`); new `tests/Unit/Content/DayWordsTest.php`; words (`keydates.day.*`, `keydates.kind.*`, `keydates.substitute`, `keydates.observed`).
- **Task 4 (key dates on the Plan):** new `plan/keyDateMath.ts` (+ test), new `plan/KeyDateChips.tsx`, new `plan/KeyDayCard.tsx`, new `plan/KeyDateEditor.tsx`, `plan/{WeekGrid,MonthGrid,ListView,Toolbar,prefs,PlanPage}.tsx`, `panel/{PanelProvider.tsx,panelState.ts}`; tests `plan/planPieces.test.tsx`, `plan/prefs.test.ts`, new `plan/keyDates.test.tsx`; words.
- **Task 5 (the "+" menu):** new `ui/PopMenu.tsx`, `ui/menuFocus.ts` (moved from `panel/`), `panel/InsertMenu.tsx`, `plan/{AddButton.tsx,addMath.ts,WeekGrid.tsx,MonthGrid.tsx,ListView.tsx,PlanPage.tsx}`; tests `panel/insertMenu.test.tsx`, `plan/addMath.test.ts`, `plan/planPieces.test.tsx`; words.
- **Task 6 (Brand: Key dates):** new `brand/sections/KeyDates.tsx`, `brand/BrandPage.tsx`; tests new `brand/keyDatesSection.test.tsx`; words.
- **Task 7 (Ideas page):** new `ideas/{ideasMath.ts,IdeasPage.tsx,IdeaColumn.tsx,IdeaCard.tsx,ScheduleDialog.tsx}`, `ContentApp.tsx`, `ContentShell.tsx` (nav); tests new `ideas/ideasMath.test.ts`, new `ideas/ideas.test.tsx`; words.
- **Task 8 (quick capture):** `ideas/ideasMath.ts` (`ideaBody`), new `ideas/QuickCapture.tsx`, new `ideas/CaptureDialog.tsx`, `ideas/IdeasPage.tsx`, `lib/shortcuts.ts`, `find/findItems.ts`, `ContentShell.tsx`, `ui/ContentShortcuts.tsx`; tests `ideas/ideasMath.test.ts`, `ideas/ideas.test.tsx`, `lib/shortcuts.test.ts`, `find/findItems.test.ts`, `ui/contentShortcuts.test.tsx`; words.
- **Task 9 (Brand: Templates):** new `brand/templateActions.ts` (+ test), new `brand/sections/Templates.tsx`, `brand/useBrand.ts` (`setTemplates`), `brand/BrandPage.tsx`; tests new `brand/templates.test.tsx`; words.
- **Task 10 (templates in the panel and from the "+"):** new `panel/templateApply.ts` (+ test), new `plan/templateFlow.ts` (+ test), new `plan/TemplatePicker.tsx`, `panel/{PostFormFields,PostPanel,PostActions,AiTools,PanelProvider}.tsx`, `plan/PlanPage.tsx`; tests new `panel/templatePanel.test.tsx`, `panel/aiTools.test.tsx`; words.
- **Task 11 (runbook):** `docs/content-workspace.md`.
- **Task 12 (release checks):** `$R4B` only (scripts, captures, reports); fixes found go in test-first.
- **Task 13 (deploy):** a deploy worktree from `origin/main`; pushes only after "yes, deploy".

---

### Task 1: The owner's two rulings on the server

The owner was given two recommendations after 4A-1's review and answered "yes please proceed": the country guess takes the venue time zone's own country (limited to the nine), and template hashtags are a `json` column as spec §9.1 says. Both change files that are not deployed yet.

**Files:**
- Modify: `app/Services/Content/Days/HolidayCountry.php`, `database/migrations/2026_10_16_100200_create_content_planner_templates_table.php`
- Test: `tests/Feature/Content/HolidayCountryTest.php`, create `tests/Unit/Content/TemplatesMigrationTest.php`

**Interfaces:**
- Produces: `HolidayCountry::guess(Organization $org): ?string` — the organisation's country (one of the nine, `UK` read as `GB`), else the venue zone's own ISO country (`DateTimeZone::getLocation()['country_code']`) when it is one of the nine, else a legacy zone name's country (`US/*` → US, `GB`, `GB-Eire`, `Europe/Belfast` → GB, `Eire` → IE), else null. `content_planner_templates.hashtags` is `json`.

- [ ] **Step 1: Set up the ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R4B=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-16-content-release-4a-2.md)
cp .superpowers/sdd/archive/2026-10-15-content-release-3b/vt.sh .superpowers/sdd/archive/2026-10-15-content-release-3b/words.mjs "$R4B/"
cp .superpowers/sdd/archive/2026-10-16-content-release-4a-1/php.sh .superpowers/sdd/archive/2026-10-16-content-release-4a-1/extract.mjs "$R4B/"
chmod +x "$R4B/vt.sh" "$R4B/php.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-16-content-release-4a-2.md" > "$R4B/progress.md"
echo "$R4B"; ls "$R4B"
```

Expected: `$R4B` ends in `.superpowers/sdd/2026-10-16-content-release-4a-2`; the listing shows `extract.mjs php.sh plan-path progress.md vt.sh words.mjs`.

- [ ] **Step 2: Write the failing tests**

In `tests/Feature/Content/HolidayCountryTest.php`, before the class's last closing brace, add:

```php

    // Owner ruling (Plan 4A-2): the zone's own country among the nine; a legacy zone name stands for its country.
    public function test_any_zone_of_the_nine_countries_and_its_legacy_names_guess_their_country(): void
    {
        $zones = [
            'America/Boise' => 'US', 'America/Juneau' => 'US', 'America/North_Dakota/Center' => 'US', 'US/Eastern' => 'US',
            'Atlantic/Canary' => 'ES', 'Europe/Busingen' => 'DE', 'Eire' => 'IE', 'GB' => 'GB', 'America/Toronto' => null,
        ];
        foreach ($zones as $zone => $country) {
            $this->venue(null, $zone);
            $this->assertSame($country, HolidayCountry::guess($this->org->fresh()), $zone);
        }
    }
```

Write `tests/Unit/Content/TemplatesMigrationTest.php` with the Write tool:

```php
<?php

namespace Tests\Unit\Content;

use PHPUnit\Framework\TestCase;

/** Owner ruling (Plan 4A-2): template hashtags are a json column, as spec §9.1 and the posts' hashtags. */
class TemplatesMigrationTest extends TestCase
{
    public function test_template_hashtags_are_a_json_column(): void
    {
        $migration = (string) file_get_contents(dirname(__DIR__, 3) . '/database/migrations/2026_10_16_100200_create_content_planner_templates_table.php');

        $this->assertStringContainsString("\$table->json('hashtags')->nullable();", $migration);
        $this->assertStringNotContainsString("\$table->text('hashtags')", $migration);
    }
}
```

- [ ] **Step 3: Run them to see them fail**

```bash
"$R4B/php.sh" tests/Feature/Content/HolidayCountryTest.php tests/Unit/Content/TemplatesMigrationTest.php
```

Expected: both `exit 1` — `America/Boise` guesses nothing today (it is not in the old list); the migration still says `text`.

- [ ] **Step 4: The guess and the column**

In `app/Services/Content/Days/HolidayCountry.php`, replace the three zone constants:

```php
    private const ZONES = [
        'Europe/London' => 'GB', 'Europe/Dublin' => 'IE', 'Europe/Berlin' => 'DE', 'Europe/Paris' => 'FR',
        'Europe/Madrid' => 'ES', 'Europe/Riga' => 'LV', 'Europe/Vilnius' => 'LT', 'Europe/Tallinn' => 'EE',
    ];

    private const US_ZONES = [
        'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
        'America/Anchorage', 'America/Detroit', 'Pacific/Honolulu',
    ];

    private const US_ZONE_PREFIXES = ['America/Indiana/', 'America/Kentucky/'];
```

with:

```php
    /** Legacy zone names that carry no country of their own (PHP answers "??"): the country each stands for. */
    private const LEGACY = ['GB' => 'GB', 'GB-Eire' => 'GB', 'Europe/Belfast' => 'GB', 'Eire' => 'IE'];
```

and replace the zone part of `guess`:

```php
        $zone = VenueClock::zone((int) $org->id);
        if (isset(self::ZONES[$zone])) {
            return self::ZONES[$zone];
        }
        if (in_array($zone, self::US_ZONES, true)) {
            return 'US';
        }
        foreach (self::US_ZONE_PREFIXES as $prefix) {
            if (str_starts_with($zone, $prefix)) {
                return 'US';
            }
        }

        return null;
```

with:

```php
        // Owner ruling (Plan 4A-2): the zone's own country, so every zone of the nine countries counts (America/Boise,
        // Atlantic/Canary, Europe/Busingen …), and a legacy name stands for its country.
        $zone = VenueClock::zone((int) $org->id);
        try {
            $location = (new \DateTimeZone($zone))->getLocation();
        } catch (\Exception) {
            $location = false;
        }
        $code = is_array($location) ? (string) ($location['country_code'] ?? '') : '';
        if ($code === '' || $code === '??') {
            $code = str_starts_with($zone, 'US/') ? 'US' : (self::LEGACY[$zone] ?? '');
        }

        return in_array($code, PublicHolidays::COUNTRIES, true) ? $code : null;
```

and replace the class docblock's last two lines:

```php
 * guess — the organisation's country when it is one of the nine, else the venue's time zone; anything else, UTC
 * included, guesses nothing.
```

with:

```php
 * guess — the organisation's country when it is one of the nine, else the venue time zone's own country (or a legacy
 * zone name's) when it is one of the nine; UTC and every other zone guess nothing.
```

In `database/migrations/2026_10_16_100200_create_content_planner_templates_table.php`, replace:

```php
            $table->text('hashtags')->nullable();
```

with:

```php
            $table->json('hashtags')->nullable();
```

- [ ] **Step 5: Run the tests, then the Content folders**

```bash
"$R4B/php.sh" tests/Feature/Content/HolidayCountryTest.php tests/Unit/Content/TemplatesMigrationTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `HolidayCountryTest | Tests:    5 passed`, `TemplatesMigrationTest | Tests:    1 passed`, both folders `exit 0` (Feature Content 161, Unit Content 69).

- [ ] **Step 6: Commit and ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/Days/HolidayCountry.php database/migrations/2026_10_16_100200_create_content_planner_templates_table.php tests/Feature/Content/HolidayCountryTest.php tests/Unit/Content/TemplatesMigrationTest.php && git commit -q -m "Content: guess the holiday country from the zone's own country; template hashtags are json" -m "Owner rulings after 4A-1's review: every zone of the nine countries guesses
its country (and legacy names theirs); the templates' hashtags column is
json, as the spec and the posts' column." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && echo "Task 1: note: owner rulings adopted (recommended after 4A-1's review; owner answered \"yes please proceed\"): zone guess by DateTimeZone country_code limited to the nine + legacy names; templates.hashtags json" >> "$R4B/progress.md"
```

---

### Task 2: The data layer — types, calls, refusal words, a brand cache that keeps the templates

**Files:**
- Modify: `frontend/src/content/lib/types.ts`, `frontend/src/content/lib/api.ts`, `frontend/src/content/lib/errors.ts`, `frontend/src/content/brand/useBrand.ts`, `frontend/src/content/lib/planCache.ts`
- Test: `frontend/src/content/lib/api.test.ts`, `frontend/src/content/brand/useBrand.test.ts`, `frontend/src/content/lib/planCache.test.ts`
- Words: `$R4B/t2-words.json`

**Interfaces:**
- Produces (types): `BuiltInKind = 'holiday' | 'marketing' | 'industry'`; `BuiltInDay { id: string; kind: BuiltInKind; date: DateKey; substitute: boolean; name_en: string }`; `OwnKind = 'event' | 'note'`; `OwnKeyDate { id: number; kind: OwnKind; title: string; details: string | null; start: DateKey; end: DateKey | null }`; `KeyDate = BuiltInDay | OwnKeyDate`; `KeyDateFields { kind?; title?; details?: string | null; start_date?; end_date?: DateKey | null }`; `Template { id; name; platform: Platform | null; pillar_name: string | null; topic: string | null; hook: string | null; main_copy: string | null; cta: string | null; hashtags: string[] }`; `TemplateFields = Partial<Omit<Template, 'id'>>`; `TemplateSuggestion = Omit<Template, 'id'>`; `IdeasColumn = 'idea' | 'draft' | 'review' | 'ready'`; `IdeasPayload { columns: Record<IdeasColumn, { posts: PostCard[]; total: number }> }`; `PlanPayload.key_dates?: KeyDate[]`; `BrandProfile.holiday_country?: string | null`, `BrandProfile.marketing_days?: boolean`; `BrandPayload.templates?: Template[]`, `BrandPayload.holiday_country_guess?: string | null`.
- Produces (calls): `api.ideas(filters?: { platform?: Platform | null; pillar_id?: number | null })`, `api.createKeyDate(fields)`, `api.updateKeyDate(id, fields)`, `api.deleteKeyDate(id)`, `api.createTemplate(fields)` / `api.updateTemplate(id, fields)` → `{ template, templates }`, `api.deleteTemplate(id)` → `{ templates }`, `api.suggestTemplates()` → `{ suggestions }`, `api.write(id, instructions, templateId = null)` (sends `template_id` only when given).
- Produces: `ERRORS.keydate`, `ERRORS.idea`, `ERRORS.template`; `brandCache` keeps `templates` (default `[]`) and `holiday_country_guess` (default null); `refreshLists` also marks `['content', brand, 'ideas']`.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/content/lib/api.test.ts`, inside `describe('contentApi', () => {`, after its last `it(...)` block add:

```ts

  it('reaches the ideas, key dates, templates and a write from a template under the prefix (spec 2026-10-16 §9.2)', async () => {
    calls.fail = null
    const api = contentApi(5)
    await api.ideas({ platform: 'instagram', pillar_id: 4 })
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/ideas?brand_id=5', config: { params: { platform: 'instagram', pillar_id: 4 } } })
    await api.createKeyDate({ kind: 'event', title: 'Spring sale', start_date: '2026-03-01', end_date: '2026-03-14' })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/key-dates?brand_id=5', body: { kind: 'event', title: 'Spring sale' } })
    await api.updateKeyDate(7, { title: 'Big sale' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/key-dates/7?brand_id=5', body: { title: 'Big sale' } })
    await api.deleteKeyDate(7)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/key-dates/7?brand_id=5' })
    await api.createTemplate({ name: 'Offer', hook: 'Book your [treatment]' })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/templates?brand_id=5', body: { name: 'Offer' } })
    await api.updateTemplate(3, { cta: 'Book now' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/templates/3?brand_id=5', body: { cta: 'Book now' } })
    await api.deleteTemplate(3)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/brand/templates/3?brand_id=5' })
    await api.suggestTemplates()
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/templates/suggest?brand_id=5' })
    await api.write(9, null, 3)
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/write?brand_id=5', body: { instructions: null, template_id: 3 } })
    await api.write(9, 'Shorter')
    expect(last()?.body).toEqual({ instructions: 'Shorter' })
  })
```

In `frontend/src/content/brand/useBrand.test.ts`, replace:

```ts
    expect(brandCache(answer)).toEqual({ profile: null, audiences: [], channels: [], voice: null, readiness: null, snippets })
```

with:

```ts
    expect(brandCache(answer)).toEqual({ profile: null, audiences: [], channels: [], voice: null, readiness: null, snippets, templates: [], holiday_country_guess: null })
```

and before the file's last `})` add:

```ts

  // Spec 2026-10-16 §3.3, §5: the templates and the guessed holiday country ride with every brand answer.
  it('keeps the templates and the guessed holiday country too', () => {
    const templates = [{ id: 1, name: 'Offer', platform: null, pillar_name: null, topic: null, hook: 'Book', main_copy: null, cta: null, hashtags: [] }]
    const answer = { profile: null, audiences: [], channels: [], voice: null, readiness: null, templates, holiday_country_guess: 'GB' } as unknown as BrandPayload
    expect(brandCache(answer)).toMatchObject({ templates, holiday_country_guess: 'GB', snippets: [] })
  })
```

In `frontend/src/content/lib/planCache.test.ts`, replace:

```ts
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['content', 3, 'plan'], ['content', 3, 'posts'], ['content', 3, 'goals']])
```

with:

```ts
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['content', 3, 'plan'], ['content', 3, 'posts'], ['content', 3, 'goals'], ['content', 3, 'ideas']])
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4B/vt.sh" src/content/lib/api.test.ts src/content/brand/useBrand.test.ts src/content/lib/planCache.test.ts
```

Expected: failures — `api.ideas is not a function`, the brand cache lacks `templates`, `refreshLists` marks three reads not four.

- [ ] **Step 3: The types**

In `frontend/src/content/lib/types.ts`:

1. Replace:

```ts
export interface PlanPayload { posts: PostCard[]; unscheduled: PostCard[]; unscheduled_total?: number; slots: Slot[]; figures: PlanFigures }
```

with:

```ts
export interface PlanPayload {
  posts: PostCard[]
  unscheduled: PostCard[]
  unscheduled_total?: number
  slots: Slot[]
  figures: PlanFigures
  /** The range's holidays, special days, events and notes (spec 2026-10-16 §3.4). */
  key_dates?: KeyDate[]
}
```

2. Replace `export interface BrandProfile {` with:

```ts
export interface BrandProfile {
  /** Spec 2026-10-16 §3.3: null = never chosen (guessed), one of the nine countries, or "none". */
  holiday_country?: string | null
  /** Marketing and industry days on the Plan (default on). */
  marketing_days?: boolean
```

3. Replace:

```ts
  /** The brand's hashtag groups and text snippets (spec 2026-10-15 §6); every brand answer carries them. */
  snippets?: Snippet[]
}
```

with:

```ts
  /** The brand's hashtag groups and text snippets (spec 2026-10-15 §6); every brand answer carries them. */
  snippets?: Snippet[]
  /** The brand's post templates (spec 2026-10-16 §5); every brand answer carries them. */
  templates?: Template[]
  /** The holiday country the venue suggests (its organisation's country or time zone), for "guessed". */
  holiday_country_guess?: string | null
}
```

4. After `export interface SnippetSuggestion { name: string; body: string }` add:

```ts

/** A built-in day on the Plan (spec 2026-10-16 §3.2); `substitute` is the day off in lieu (observed, in the US). */
export type BuiltInKind = 'holiday' | 'marketing' | 'industry'
export interface BuiltInDay { id: string; kind: BuiltInKind; date: DateKey; substitute: boolean; name_en: string }
/** The brand's own key date (spec §3.1): an event of up to 31 days, or a note; `end` is null for one day. */
export type OwnKind = 'event' | 'note'
export interface OwnKeyDate { id: number; kind: OwnKind; title: string; details: string | null; start: DateKey; end: DateKey | null }
export type KeyDate = BuiltInDay | OwnKeyDate
export interface KeyDateFields { kind?: OwnKind; title?: string; details?: string | null; start_date?: DateKey; end_date?: DateKey | null }

/** A post template (spec 2026-10-16 §5.1): words with [blanks]; the pillar kept by name. */
export interface Template {
  id: number
  name: string
  platform: Platform | null
  pillar_name: string | null
  topic: string | null
  hook: string | null
  main_copy: string | null
  cta: string | null
  hashtags: string[]
}
export type TemplateFields = Partial<Omit<Template, 'id'>>
/** A template the AI proposes: nothing is saved until a manager adds it. */
export type TemplateSuggestion = Omit<Template, 'id'>

/** The Ideas board (spec 2026-10-16 §4.1): the posts without a day, by stage. */
export type IdeasColumn = 'idea' | 'draft' | 'review' | 'ready'
export interface IdeasPayload { columns: Record<IdeasColumn, { posts: PostCard[]; total: number }> }
```

- [ ] **Step 4: The calls**

In `frontend/src/content/lib/api.ts`, add `IdeasPayload, KeyDateFields, OwnKeyDate, OwnKind, Template, TemplateFields, TemplateSuggestion` to the existing `import type { … } from './types'` list (Edit tool), then replace:

```ts
    write: (id: number, instructions: string | null): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/write`), { instructions })),
```

with:

```ts
    /** "Write with AI" from a template sends its id (spec 2026-10-16 §5.3); any other write sends only the guidance. */
    write: (id: number, instructions: string | null, templateId: number | null = null): Promise<{ post: PostDetail }> =>
      watched(api.post(url(`posts/${id}/write`), templateId === null ? { instructions } : { instructions, template_id: templateId })),
```

and replace:

```ts
    goals: (): Promise<Goals> => watched(api.get(url('goals'))),
```

with:

```ts
    goals: (): Promise<Goals> => watched(api.get(url('goals'))),
    /** The Ideas board (spec 2026-10-16 §4): the posts without a day by stage; a filter left out is not sent. */
    ideas: (filters: { platform?: Platform | null; pillar_id?: number | null } = {}): Promise<IdeasPayload> =>
      watched(api.get(url('ideas'), { params: { platform: filters.platform ?? undefined, pillar_id: filters.pillar_id ?? undefined } })),
    createKeyDate: (fields: KeyDateFields & { kind: OwnKind; title: string; start_date: DateKey }): Promise<{ key_date: OwnKeyDate }> =>
      watched(api.post(url('key-dates'), fields)),
    updateKeyDate: (id: number, fields: KeyDateFields): Promise<{ key_date: OwnKeyDate }> => watched(api.put(url(`key-dates/${id}`), fields)),
    deleteKeyDate: (id: number): Promise<{ deleted: boolean }> => watched(api.delete(url(`key-dates/${id}`))),
```

and replace:

```ts
    suggestSnippets: (): Promise<{ suggestions: SnippetSuggestion[] }> => watched(api.post(url('brand/snippets/suggest'))),
  }
}
```

with:

```ts
    suggestSnippets: (): Promise<{ suggestions: SnippetSuggestion[] }> => watched(api.post(url('brand/snippets/suggest'))),
    /** A brand's templates (spec 2026-10-16 §5.2): each change answers the changed template and the whole list. */
    createTemplate: (fields: TemplateFields & { name: string }): Promise<{ template: Template; templates: Template[] }> =>
      watched(api.post(url('brand/templates'), fields)),
    updateTemplate: (id: number, fields: TemplateFields): Promise<{ template: Template; templates: Template[] }> =>
      watched(api.put(url(`brand/templates/${id}`), fields)),
    deleteTemplate: (id: number): Promise<{ templates: Template[] }> => watched(api.delete(url(`brand/templates/${id}`))),
    /** One AI call: templates for the brand's industry and pillars, with [blanks]; nothing is saved. */
    suggestTemplates: (): Promise<{ suggestions: TemplateSuggestion[] }> => watched(api.post(url('brand/templates/suggest'))),
  }
}
```

- [ ] **Step 5: The refusal families, the brand cache, the lists**

In `frontend/src/content/lib/errors.ts`, replace the end of `ERRORS`:

```ts
    unknown: 'The change could not be saved. Please try again.',
  },
} as const
```

(the `snippet` family's end; `ERRORS` sits at the top of the file) with:

```ts
    unknown: 'The change could not be saved. Please try again.',
  },
  // Spec 2026-10-16 §9.3: the portal checks the limits first, so a refusal names the limit
  // (end_before_start, too_long and too_many_tags are the portal's own checks; the server answers `invalid`).
  keydate: {
    invalid: 'Give it a title and a first day.',
    end_before_start: 'The last day cannot be before the first.',
    too_long: 'An event lasts at most 31 days.',
    too_many_key_dates: 'A brand keeps at most 1,000 events and notes. Remove one first.',
    not_found: 'This key date no longer exists.',
    no_profile: 'This brand is not set up yet.',
    unknown: 'The key date could not be saved. Please try again.',
  },
  idea: {
    invalid: 'Write the idea first.',
    changed_elsewhere: 'Someone else changed this post. The board now shows their version.',
    not_found: 'This post no longer exists.',
    no_profile: 'This brand is not set up yet.',
    unknown: 'The idea could not be saved. Please try again.',
  },
  template: {
    manager_only: 'Only an owner or a manager can change templates.',
    invalid: 'Give the template a name.',
    too_many_tags: 'A template keeps at most 30 hashtags.',
    too_many_templates: 'A brand keeps at most 100 templates. Remove one first.',
    not_found: 'This template no longer exists.',
    no_profile: 'This brand is not set up yet.',
    ai_budget_used_up: "This month's AI budget is used up.",
    ai_failed: 'The AI could not suggest templates. Please try again.',
    unknown: 'The template could not be saved. Please try again.',
  },
} as const
```

In `frontend/src/content/brand/useBrand.ts`, replace:

```ts
export function brandCache(payload: BrandPayload): BrandPayload {
  const { profile, audiences, channels, voice, readiness, snippets } = payload
  return { profile, audiences, channels, voice, readiness, snippets: snippets ?? [] }
}
```

with:

```ts
export function brandCache(payload: BrandPayload): BrandPayload {
  const { profile, audiences, channels, voice, readiness, snippets, templates, holiday_country_guess } = payload
  return { profile, audiences, channels, voice, readiness, snippets: snippets ?? [], templates: templates ?? [], holiday_country_guess: holiday_country_guess ?? null }
}
```

In `frontend/src/content/lib/planCache.ts`, replace:

```ts
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'goals'] }),
  ])
```

with:

```ts
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'goals'] }),
    // The Ideas board (spec 2026-10-16 §4) holds the posts without a day: a change can move a card.
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'ideas'] }),
  ])
```

and change its docblock to `/** After a post changes, the Plan's, the Posts page's, the goals' and the Ideas board's reads of the brand are read again (an open page at once, the others when shown). */`.

- [ ] **Step 6: The refusal words in five bundles**

Write `$R4B/t2-words.json` with the Write tool:

```json
{
  "keydate.error.invalid": { "en": "Give it a title and a first day.", "ru": "Укажите название и первый день.", "de": "Geben Sie einen Titel und einen ersten Tag an.", "fr": "Indiquez un titre et un premier jour.", "es": "Indica un título y un primer día." },
  "keydate.error.end_before_start": { "en": "The last day cannot be before the first.", "ru": "Последний день не может быть раньше первого.", "de": "Der letzte Tag kann nicht vor dem ersten liegen.", "fr": "Le dernier jour ne peut pas précéder le premier.", "es": "El último día no puede ser anterior al primero." },
  "keydate.error.too_long": { "en": "An event lasts at most 31 days.", "ru": "Событие длится не больше 31 дня.", "de": "Ein Ereignis dauert höchstens 31 Tage.", "fr": "Un événement dure au plus 31 jours.", "es": "Un evento dura como máximo 31 días." },
  "keydate.error.too_many_key_dates": { "en": "A brand keeps at most 1,000 events and notes. Remove one first.", "ru": "У бренда может быть не больше 1000 событий и заметок. Сначала удалите одно.", "de": "Eine Marke hat höchstens 1.000 Ereignisse und Notizen. Entfernen Sie zuerst eines.", "fr": "Une marque garde au plus 1 000 événements et notes. Supprimez-en un d’abord.", "es": "Una marca guarda como máximo 1.000 eventos y notas. Elimina uno primero." },
  "keydate.error.not_found": { "en": "This key date no longer exists.", "ru": "Этой даты больше нет.", "de": "Dieser Termin existiert nicht mehr.", "fr": "Cette date n’existe plus.", "es": "Esta fecha ya no existe." },
  "keydate.error.no_profile": { "en": "This brand is not set up yet.", "ru": "Этот бренд ещё не настроен.", "de": "Diese Marke ist noch nicht eingerichtet.", "fr": "Cette marque n’est pas encore configurée.", "es": "Esta marca aún no está configurada." },
  "keydate.error.unknown": { "en": "The key date could not be saved. Please try again.", "ru": "Не удалось сохранить дату. Попробуйте ещё раз.", "de": "Der Termin konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "fr": "La date n’a pas pu être enregistrée. Veuillez réessayer.", "es": "No se pudo guardar la fecha. Inténtalo de nuevo." },
  "idea.error.invalid": { "en": "Write the idea first.", "ru": "Сначала напишите идею.", "de": "Schreiben Sie zuerst die Idee.", "fr": "Écrivez d’abord l’idée.", "es": "Escribe primero la idea." },
  "idea.error.changed_elsewhere": { "en": "Someone else changed this post. The board now shows their version.", "ru": "Этот пост изменил кто-то другой. Теперь на доске его версия.", "de": "Jemand anderes hat diesen Beitrag geändert. Die Tafel zeigt jetzt diese Fassung.", "fr": "Quelqu’un d’autre a modifié cette publication. Le tableau affiche maintenant sa version.", "es": "Otra persona cambió esta publicación. El tablero muestra ahora su versión." },
  "idea.error.not_found": { "en": "This post no longer exists.", "ru": "Этого поста больше нет.", "de": "Dieser Beitrag existiert nicht mehr.", "fr": "Cette publication n’existe plus.", "es": "Esta publicación ya no existe." },
  "idea.error.no_profile": { "en": "This brand is not set up yet.", "ru": "Этот бренд ещё не настроен.", "de": "Diese Marke ist noch nicht eingerichtet.", "fr": "Cette marque n’est pas encore configurée.", "es": "Esta marca aún no está configurada." },
  "idea.error.unknown": { "en": "The idea could not be saved. Please try again.", "ru": "Не удалось сохранить идею. Попробуйте ещё раз.", "de": "Die Idee konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "fr": "L’idée n’a pas pu être enregistrée. Veuillez réessayer.", "es": "No se pudo guardar la idea. Inténtalo de nuevo." },
  "template.error.manager_only": { "en": "Only an owner or a manager can change templates.", "ru": "Менять шаблоны может только владелец или менеджер.", "de": "Nur Inhaber oder Manager können Vorlagen ändern.", "fr": "Seul un propriétaire ou un responsable peut modifier les modèles.", "es": "Solo un propietario o un gerente puede cambiar las plantillas." },
  "template.error.invalid": { "en": "Give the template a name.", "ru": "Дайте шаблону название.", "de": "Geben Sie der Vorlage einen Namen.", "fr": "Donnez un nom au modèle.", "es": "Ponle un nombre a la plantilla." },
  "template.error.too_many_tags": { "en": "A template keeps at most 30 hashtags.", "ru": "В шаблоне может быть не больше 30 хештегов.", "de": "Eine Vorlage hat höchstens 30 Hashtags.", "fr": "Un modèle garde au plus 30 hashtags.", "es": "Una plantilla guarda como máximo 30 hashtags." },
  "template.error.too_many_templates": { "en": "A brand keeps at most 100 templates. Remove one first.", "ru": "У бренда может быть не больше 100 шаблонов. Сначала удалите один.", "de": "Eine Marke hat höchstens 100 Vorlagen. Entfernen Sie zuerst eine.", "fr": "Une marque garde au plus 100 modèles. Supprimez-en un d’abord.", "es": "Una marca guarda como máximo 100 plantillas. Elimina una primero." },
  "template.error.not_found": { "en": "This template no longer exists.", "ru": "Этого шаблона больше нет.", "de": "Diese Vorlage existiert nicht mehr.", "fr": "Ce modèle n’existe plus.", "es": "Esta plantilla ya no existe." },
  "template.error.no_profile": { "en": "This brand is not set up yet.", "ru": "Этот бренд ещё не настроен.", "de": "Diese Marke ist noch nicht eingerichtet.", "fr": "Cette marque n’est pas encore configurée.", "es": "Esta marca aún no está configurada." },
  "template.error.ai_budget_used_up": { "en": "This month's AI budget is used up.", "ru": "Бюджет ИИ на этот месяц исчерпан.", "de": "Das KI-Budget dieses Monats ist aufgebraucht.", "fr": "Le budget IA de ce mois est épuisé.", "es": "El presupuesto de IA de este mes se ha agotado." },
  "template.error.ai_failed": { "en": "The AI could not suggest templates. Please try again.", "ru": "ИИ не смог предложить шаблоны. Попробуйте ещё раз.", "de": "Die KI konnte keine Vorlagen vorschlagen. Bitte versuchen Sie es erneut.", "fr": "L’IA n’a pas pu proposer de modèles. Veuillez réessayer.", "es": "La IA no pudo sugerir plantillas. Inténtalo de nuevo." },
  "template.error.unknown": { "en": "The template could not be saved. Please try again.", "ru": "Не удалось сохранить шаблон. Попробуйте ещё раз.", "de": "Die Vorlage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "fr": "Le modèle n’a pas pu être enregistré. Veuillez réessayer.", "es": "No se pudo guardar la plantilla. Inténtalo de nuevo." }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node "$R4B/words.mjs" "$R4B/t2-words.json"
```

Expected: the tool reports 21 keys written to each of the five bundles.

- [ ] **Step 7: Run the tests, the errors and bundle tests, and the types**

```bash
"$R4B/vt.sh" src/content/lib/ src/content/brand/useBrand.test.ts src/content/i18n/ && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
```

Expected: every file passes (`errors.test.ts` finds each new family equal to the English bundle; `contentLocales.test.ts` the same key set in five bundles); `TSC-CLEAN`.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib/types.ts frontend/src/content/lib/api.ts frontend/src/content/lib/errors.ts frontend/src/content/brand/useBrand.ts frontend/src/content/lib/planCache.ts frontend/src/content/lib/api.test.ts frontend/src/content/brand/useBrand.test.ts frontend/src/content/lib/planCache.test.ts frontend/src/content/i18n/ && git commit -q -m "Content portal: types, calls and refusal words for key dates, ideas and templates" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: The built-in days' names in five languages, tied to the server's list

**Files:**
- Create: `frontend/src/content/lib/dayNames.ts`, `frontend/src/content/lib/dayNames.test.ts`, `tests/Unit/Content/DayWordsTest.php`
- Modify: `frontend/src/content/i18n/contentLocales.test.ts` (`FAMILIES`)
- Words: `$R4B/t3-words.json`

**Interfaces:**
- Consumes: `BuiltInDay` (Task 2); `DayNames::EN` (4A-1).
- Produces: `type Words = (key: string, english: string, vars?: Record<string, unknown>) => string`; `dayName(t: Words, day: Pick<BuiltInDay, 'id' | 'name_en'>): string` (the bundle's words for `content.keydates.day.<id>`, the server's English under them); `dayLabel(t: Words, day: BuiltInDay, observed: boolean): string` (a substitute day: "{{name}} (observed)" when `observed`, else "{{name}} (day off in lieu)"); bundle keys `keydates.day.<id>` for all 76 ids, `keydates.kind.{holiday,marketing,industry,event,note}`, `keydates.substitute`, `keydates.observed`.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/lib/dayNames.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import { dayLabel, dayName, type Words } from './dayNames'

// A stand-in for i18next: the bundle's words where it has them, the English otherwise, {{names}} filled.
const bundle: Record<string, string> = { 'content.keydates.day.christmas': 'Рождество' }
const t: Words = (key, english, vars) => (bundle[key] ?? english).replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? ''))

// Spec 2026-10-16 §9.3: a built-in day's name comes from the bundles under its id; the server's English is the fallback.
describe('dayName and dayLabel', () => {
  it('names a day from the bundle, else in the server’s English', () => {
    expect(dayName(t, { id: 'christmas', name_en: 'Christmas Day' })).toBe('Рождество')
    expect(dayName(t, { id: 'gb.early_may', name_en: 'Early May bank holiday' })).toBe('Early May bank holiday')
  })

  it('says a substitute day is the day off in lieu, or observed in the United States', () => {
    const boxing = { id: 'gb.boxing_day', kind: 'holiday' as const, date: '2026-12-28', substitute: true, name_en: 'Boxing Day' }
    expect(dayLabel(t, boxing, false)).toBe('Boxing Day (day off in lieu)')
    expect(dayLabel(t, { ...boxing, id: 'us.independence', name_en: 'Independence Day' }, true)).toBe('Independence Day (observed)')
    expect(dayLabel(t, { ...boxing, substitute: false }, false)).toBe('Boxing Day')
  })
})
```

Write `tests/Unit/Content/DayWordsTest.php` with the Write tool:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\Days\DayNames;
use PHPUnit\Framework\TestCase;

/** The portal's day names (spec 2026-10-16 §9.3): one key per server id in every bundle, the English the AI reads. */
class DayWordsTest extends TestCase
{
    /** @return array<string, string> the bundle's keydates.day words, flattened to their ids ("gb.early_may") */
    private static function days(string $locale): array
    {
        $path = dirname(__DIR__, 3) . "/frontend/src/content/i18n/content.{$locale}.json";
        $bundle = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $flat = [];
        $walk = function (array $node, string $prefix) use (&$walk, &$flat): void {
            foreach ($node as $key => $value) {
                if (is_array($value)) {
                    $walk($value, "{$prefix}{$key}.");
                } else {
                    $flat["{$prefix}{$key}"] = (string) $value;
                }
            }
        };
        $walk($bundle['keydates']['day'] ?? [], '');
        ksort($flat);

        return $flat;
    }

    public function test_every_built_in_day_has_words_in_every_bundle_and_none_is_spare(): void
    {
        $ids = array_keys(DayNames::EN);
        sort($ids);
        foreach (['en', 'ru', 'de', 'fr', 'es'] as $locale) {
            $this->assertSame($ids, array_keys(self::days($locale)), "{$locale}: keydates.day differs from DayNames::EN");
        }
    }

    public function test_the_english_bundle_says_what_the_server_tells_the_ai(): void
    {
        $en = self::days('en');
        foreach (DayNames::EN as $id => $name) {
            $this->assertSame($name, $en[$id] ?? null, $id);
        }
    }
}
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
  'panel.ai.brief_field': ['visual_type', 'aspect_ratio', 'style', 'description', 'scene', 'mood', 'composition', 'text_overlay', 'avoid'],
```

with:

```ts
  'panel.ai.brief_field': ['visual_type', 'aspect_ratio', 'style', 'description', 'scene', 'mood', 'composition', 'text_overlay', 'avoid'],
  // Spec 2026-10-16 §3.1: a key date's kind (the day names themselves are tied to the server by DayWordsTest.php).
  'keydates.kind': ['holiday', 'marketing', 'industry', 'event', 'note'],
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4B/vt.sh" src/content/lib/dayNames.test.ts src/content/i18n/contentLocales.test.ts; "$R4B/php.sh" tests/Unit/Content/DayWordsTest.php
```

Expected: `dayNames.test.ts` fails (`Failed to resolve import "./dayNames"`); `contentLocales.test.ts` fails five times (`keydates.kind.*` missing); `DayWordsTest` `exit 1` (no `keydates` in the bundles).

- [ ] **Step 3: Write `dayNames.ts`**

Write `frontend/src/content/lib/dayNames.ts` with the Write tool:

```ts
import type { BuiltInDay } from './types'

/** i18next's `t` as these helpers use it: a key, the English under it, the {{names}} to fill. */
export type Words = (key: string, english: string, vars?: Record<string, unknown>) => string

/** A built-in day's name in the interface's language (spec 2026-10-16 §9.3): the bundles' words under its id, else the server's English. */
export function dayName(t: Words, day: Pick<BuiltInDay, 'id' | 'name_en'>): string {
  return t(`content.keydates.day.${day.id}`, day.name_en)
}

/** A chip's words: a substitute day says so — "observed" in the United States, "day off in lieu" elsewhere. */
export function dayLabel(t: Words, day: BuiltInDay, observed: boolean): string {
  const name = dayName(t, day)
  if (!day.substitute) return name
  return observed
    ? t('content.keydates.observed', '{{name}} (observed)', { name })
    : t('content.keydates.substitute', '{{name}} (day off in lieu)', { name })
}
```

- [ ] **Step 4: The words in five bundles**

Write `$R4B/t3-words.json` with the Write tool (the English is `DayNames::EN`, word for word):

```json
{
  "keydates.kind.holiday": { "en": "Public holiday", "ru": "Государственный праздник", "de": "Feiertag", "fr": "Jour férié", "es": "Festivo" },
  "keydates.kind.marketing": { "en": "Marketing day", "ru": "Маркетинговый повод", "de": "Aktionstag", "fr": "Journée marketing", "es": "Día comercial" },
  "keydates.kind.industry": { "en": "International day", "ru": "Международный день", "de": "Internationaler Tag", "fr": "Journée internationale", "es": "Día internacional" },
  "keydates.kind.event": { "en": "Event", "ru": "Событие", "de": "Ereignis", "fr": "Événement", "es": "Evento" },
  "keydates.kind.note": { "en": "Note", "ru": "Заметка", "de": "Notiz", "fr": "Note", "es": "Nota" },
  "keydates.substitute": { "en": "{{name}} (day off in lieu)", "ru": "{{name}} (перенесённый выходной)", "de": "{{name}} (Ersatzfeiertag)", "fr": "{{name}} (jour férié reporté)", "es": "{{name}} (festivo trasladado)" },
  "keydates.observed": { "en": "{{name}} (observed)", "ru": "{{name}} (выходной в другой день)", "de": "{{name}} (verlegter Feiertag)", "fr": "{{name}} (jour férié observé)", "es": "{{name}} (festivo observado)" },
  "keydates.day.new_year": { "en": "New Year's Day", "ru": "Новый год", "de": "Neujahr", "fr": "Jour de l’an", "es": "Año Nuevo" },
  "keydates.day.good_friday": { "en": "Good Friday", "ru": "Страстная пятница", "de": "Karfreitag", "fr": "Vendredi saint", "es": "Viernes Santo" },
  "keydates.day.easter_sunday": { "en": "Easter Sunday", "ru": "Пасха", "de": "Ostersonntag", "fr": "Dimanche de Pâques", "es": "Domingo de Pascua" },
  "keydates.day.easter_monday": { "en": "Easter Monday", "ru": "Пасхальный понедельник", "de": "Ostermontag", "fr": "Lundi de Pâques", "es": "Lunes de Pascua" },
  "keydates.day.labour_day": { "en": "Labour Day", "ru": "День труда", "de": "Tag der Arbeit", "fr": "Fête du Travail", "es": "Día del Trabajo" },
  "keydates.day.ascension": { "en": "Ascension Day", "ru": "Вознесение", "de": "Christi Himmelfahrt", "fr": "Ascension", "es": "Ascensión" },
  "keydates.day.whit_monday": { "en": "Whit Monday", "ru": "Духов день", "de": "Pfingstmontag", "fr": "Lundi de Pentecôte", "es": "Lunes de Pentecostés" },
  "keydates.day.pentecost": { "en": "Whitsunday (Pentecost)", "ru": "Троица", "de": "Pfingstsonntag", "fr": "Dimanche de Pentecôte", "es": "Domingo de Pentecostés" },
  "keydates.day.assumption": { "en": "Assumption Day", "ru": "Успение Богородицы", "de": "Mariä Himmelfahrt", "fr": "Assomption", "es": "Asunción" },
  "keydates.day.all_saints": { "en": "All Saints' Day", "ru": "День всех святых", "de": "Allerheiligen", "fr": "Toussaint", "es": "Todos los Santos" },
  "keydates.day.all_souls": { "en": "All Souls' Day", "ru": "День поминовения усопших", "de": "Allerseelen", "fr": "Jour des défunts", "es": "Día de los Difuntos" },
  "keydates.day.midsummer": { "en": "Midsummer Day", "ru": "Иванов день", "de": "Mittsommertag", "fr": "Jour de la Saint-Jean", "es": "Día de San Juan" },
  "keydates.day.christmas_eve": { "en": "Christmas Eve", "ru": "Сочельник", "de": "Heiligabend", "fr": "Réveillon de Noël", "es": "Nochebuena" },
  "keydates.day.christmas": { "en": "Christmas Day", "ru": "Рождество", "de": "1. Weihnachtstag", "fr": "Noël", "es": "Navidad" },
  "keydates.day.christmas_second": { "en": "Second Day of Christmas", "ru": "Второй день Рождества", "de": "2. Weihnachtstag", "fr": "Lendemain de Noël", "es": "Segundo día de Navidad" },
  "keydates.day.new_years_eve": { "en": "New Year's Eve", "ru": "Канун Нового года", "de": "Silvester", "fr": "Saint-Sylvestre", "es": "Nochevieja" },
  "keydates.day.mothers_day": { "en": "Mother's Day", "ru": "День матери", "de": "Muttertag", "fr": "Fête des mères", "es": "Día de la Madre" },
  "keydates.day.fathers_day": { "en": "Father's Day", "ru": "День отца", "de": "Vatertag", "fr": "Fête des pères", "es": "Día del Padre" },
  "keydates.day.gb.early_may": { "en": "Early May bank holiday", "ru": "Ранний майский банковский выходной", "de": "Feiertag Anfang Mai", "fr": "Jour férié de début mai", "es": "Festivo de principios de mayo" },
  "keydates.day.gb.spring": { "en": "Spring bank holiday", "ru": "Весенний банковский выходной", "de": "Frühlingsfeiertag", "fr": "Jour férié de printemps", "es": "Festivo de primavera" },
  "keydates.day.gb.summer": { "en": "Summer bank holiday", "ru": "Летний банковский выходной", "de": "Sommerfeiertag", "fr": "Jour férié d’été", "es": "Festivo de verano" },
  "keydates.day.gb.boxing_day": { "en": "Boxing Day", "ru": "День подарков", "de": "Boxing Day", "fr": "Boxing Day", "es": "Boxing Day" },
  "keydates.day.ie.st_brigid": { "en": "St Brigid's Day", "ru": "День святой Бригитты", "de": "St.-Brigid’s-Tag", "fr": "Fête de sainte Brigitte", "es": "Día de Santa Brígida" },
  "keydates.day.ie.st_patrick": { "en": "St Patrick's Day", "ru": "День святого Патрика", "de": "St. Patrick’s Day", "fr": "Saint-Patrick", "es": "Día de San Patricio" },
  "keydates.day.ie.may": { "en": "May bank holiday", "ru": "Майский банковский выходной", "de": "Feiertag im Mai", "fr": "Jour férié de mai", "es": "Festivo de mayo" },
  "keydates.day.ie.june": { "en": "June bank holiday", "ru": "Июньский банковский выходной", "de": "Feiertag im Juni", "fr": "Jour férié de juin", "es": "Festivo de junio" },
  "keydates.day.ie.august": { "en": "August bank holiday", "ru": "Августовский банковский выходной", "de": "Feiertag im August", "fr": "Jour férié d’août", "es": "Festivo de agosto" },
  "keydates.day.ie.october": { "en": "October bank holiday", "ru": "Октябрьский банковский выходной", "de": "Feiertag im Oktober", "fr": "Jour férié d’octobre", "es": "Festivo de octubre" },
  "keydates.day.ie.st_stephen": { "en": "St Stephen's Day", "ru": "День святого Стефана", "de": "Stephanstag", "fr": "Saint-Étienne", "es": "Día de San Esteban" },
  "keydates.day.de.unity": { "en": "Day of German Unity", "ru": "День германского единства", "de": "Tag der Deutschen Einheit", "fr": "Jour de l’Unité allemande", "es": "Día de la Unidad Alemana" },
  "keydates.day.fr.victory": { "en": "Victory in Europe Day", "ru": "День Победы в Европе", "de": "Tag des Sieges", "fr": "Victoire 1945", "es": "Día de la Victoria" },
  "keydates.day.fr.bastille": { "en": "Bastille Day", "ru": "День взятия Бастилии", "de": "Französischer Nationalfeiertag", "fr": "Fête nationale", "es": "Fiesta Nacional de Francia" },
  "keydates.day.fr.armistice": { "en": "Armistice Day", "ru": "День перемирия", "de": "Waffenstillstandstag", "fr": "Armistice 1918", "es": "Día del Armisticio" },
  "keydates.day.es.epiphany": { "en": "Epiphany", "ru": "Богоявление", "de": "Heilige Drei Könige", "fr": "Épiphanie", "es": "Epifanía del Señor" },
  "keydates.day.es.national": { "en": "National Day of Spain", "ru": "Национальный праздник Испании", "de": "Spanischer Nationalfeiertag", "fr": "Fête nationale espagnole", "es": "Fiesta Nacional de España" },
  "keydates.day.es.constitution": { "en": "Constitution Day", "ru": "День Конституции", "de": "Tag der Verfassung", "fr": "Jour de la Constitution", "es": "Día de la Constitución" },
  "keydates.day.es.immaculate": { "en": "Immaculate Conception", "ru": "Непорочное зачатие", "de": "Mariä Empfängnis", "fr": "Immaculée Conception", "es": "Inmaculada Concepción" },
  "keydates.day.lv.independence": { "en": "Restoration of Independence Day", "ru": "День восстановления независимости", "de": "Tag der Wiederherstellung der Unabhängigkeit", "fr": "Jour de la restauration de l’indépendance", "es": "Día de la Restauración de la Independencia" },
  "keydates.day.lv.ligo": { "en": "Midsummer Eve (Līgo Day)", "ru": "Лиго (канун Янова дня)", "de": "Mittsommerabend (Līgo)", "fr": "Veille de la Saint-Jean (Līgo)", "es": "Víspera de San Juan (Līgo)" },
  "keydates.day.lv.proclamation": { "en": "Proclamation Day of the Republic of Latvia", "ru": "День провозглашения Латвийской Республики", "de": "Tag der Ausrufung der Republik Lettland", "fr": "Proclamation de la République de Lettonie", "es": "Día de la Proclamación de la República de Letonia" },
  "keydates.day.lt.state": { "en": "Day of Restoration of the State", "ru": "День восстановления государства", "de": "Tag der Wiederherstellung des Staates", "fr": "Jour de la restauration de l’État", "es": "Día de la Restauración del Estado" },
  "keydates.day.lt.independence": { "en": "Day of Restoration of Independence", "ru": "День восстановления независимости", "de": "Tag der Wiederherstellung der Unabhängigkeit", "fr": "Jour de la restauration de l’indépendance", "es": "Día de la Restauración de la Independencia" },
  "keydates.day.lt.st_johns": { "en": "St John's Day", "ru": "Иванов день (Расос)", "de": "Johannistag", "fr": "Saint-Jean", "es": "Día de San Juan" },
  "keydates.day.lt.statehood": { "en": "Statehood Day", "ru": "День государственности", "de": "Tag der Staatlichkeit", "fr": "Jour de l’État", "es": "Día del Estado" },
  "keydates.day.ee.independence": { "en": "Independence Day", "ru": "День независимости", "de": "Unabhängigkeitstag", "fr": "Jour de l’indépendance", "es": "Día de la Independencia" },
  "keydates.day.ee.spring_day": { "en": "Spring Day", "ru": "Праздник весны", "de": "Frühlingstag", "fr": "Fête du printemps", "es": "Día de la Primavera" },
  "keydates.day.ee.victory": { "en": "Victory Day", "ru": "День победы", "de": "Siegestag", "fr": "Jour de la Victoire", "es": "Día de la Victoria" },
  "keydates.day.ee.restoration": { "en": "Day of Restoration of Independence", "ru": "День восстановления независимости", "de": "Tag der Wiederherstellung der Unabhängigkeit", "fr": "Jour de la restauration de l’indépendance", "es": "Día de la Restauración de la Independencia" },
  "keydates.day.us.mlk": { "en": "Martin Luther King Jr. Day", "ru": "День Мартина Лютера Кинга", "de": "Martin Luther King Day", "fr": "Journée de Martin Luther King", "es": "Día de Martin Luther King" },
  "keydates.day.us.washington": { "en": "Washington's Birthday", "ru": "День рождения Вашингтона", "de": "Washingtons Geburtstag", "fr": "Anniversaire de Washington", "es": "Natalicio de Washington" },
  "keydates.day.us.memorial": { "en": "Memorial Day", "ru": "День памяти", "de": "Memorial Day", "fr": "Memorial Day", "es": "Día de los Caídos" },
  "keydates.day.us.juneteenth": { "en": "Juneteenth", "ru": "Джунтинс", "de": "Juneteenth", "fr": "Juneteenth", "es": "Juneteenth" },
  "keydates.day.us.independence": { "en": "Independence Day", "ru": "День независимости", "de": "Unabhängigkeitstag", "fr": "Jour de l’Indépendance", "es": "Día de la Independencia" },
  "keydates.day.us.labor": { "en": "Labor Day", "ru": "День труда", "de": "Tag der Arbeit (USA)", "fr": "Fête du Travail (États-Unis)", "es": "Día del Trabajo (EE. UU.)" },
  "keydates.day.us.columbus": { "en": "Columbus Day", "ru": "День Колумба", "de": "Columbus Day", "fr": "Jour de Christophe Colomb", "es": "Día de Colón" },
  "keydates.day.us.veterans": { "en": "Veterans Day", "ru": "День ветеранов", "de": "Veterans Day", "fr": "Journée des anciens combattants", "es": "Día de los Veteranos" },
  "keydates.day.us.thanksgiving": { "en": "Thanksgiving Day", "ru": "День благодарения", "de": "Thanksgiving", "fr": "Thanksgiving", "es": "Día de Acción de Gracias" },
  "keydates.day.valentines": { "en": "Valentine's Day", "ru": "День святого Валентина", "de": "Valentinstag", "fr": "Saint-Valentin", "es": "San Valentín" },
  "keydates.day.womens_day": { "en": "International Women's Day", "ru": "Международный женский день", "de": "Internationaler Frauentag", "fr": "Journée internationale des femmes", "es": "Día Internacional de la Mujer" },
  "keydates.day.halloween": { "en": "Halloween", "ru": "Хэллоуин", "de": "Halloween", "fr": "Halloween", "es": "Halloween" },
  "keydates.day.black_friday": { "en": "Black Friday", "ru": "Чёрная пятница", "de": "Black Friday", "fr": "Black Friday", "es": "Black Friday" },
  "keydates.day.world_health": { "en": "World Health Day", "ru": "Всемирный день здоровья", "de": "Weltgesundheitstag", "fr": "Journée mondiale de la santé", "es": "Día Mundial de la Salud" },
  "keydates.day.world_heart": { "en": "World Heart Day", "ru": "Всемирный день сердца", "de": "Weltherztag", "fr": "Journée mondiale du cœur", "es": "Día Mundial del Corazón" },
  "keydates.day.world_mental_health": { "en": "World Mental Health Day", "ru": "Всемирный день психического здоровья", "de": "Welttag der psychischen Gesundheit", "fr": "Journée mondiale de la santé mentale", "es": "Día Mundial de la Salud Mental" },
  "keydates.day.yoga": { "en": "International Day of Yoga", "ru": "Международный день йоги", "de": "Internationaler Yogatag", "fr": "Journée internationale du yoga", "es": "Día Internacional del Yoga" },
  "keydates.day.global_wellness": { "en": "Global Wellness Day", "ru": "Всемирный день велнеса", "de": "Global Wellness Day", "fr": "Journée mondiale du bien-être", "es": "Día Mundial del Bienestar" },
  "keydates.day.global_running": { "en": "Global Running Day", "ru": "Всемирный день бега", "de": "Global Running Day", "fr": "Journée mondiale de la course à pied", "es": "Día Mundial del Running" },
  "keydates.day.world_tourism": { "en": "World Tourism Day", "ru": "Всемирный день туризма", "de": "Welttourismustag", "fr": "Journée mondiale du tourisme", "es": "Día Mundial del Turismo" },
  "keydates.day.world_food": { "en": "World Food Day", "ru": "Всемирный день продовольствия", "de": "Welternährungstag", "fr": "Journée mondiale de l’alimentation", "es": "Día Mundial de la Alimentación" },
  "keydates.day.world_book": { "en": "World Book and Copyright Day", "ru": "Всемирный день книги и авторского права", "de": "Welttag des Buches", "fr": "Journée mondiale du livre et du droit d’auteur", "es": "Día Internacional del Libro" },
  "keydates.day.literacy": { "en": "International Literacy Day", "ru": "Международный день грамотности", "de": "Weltalphabetisierungstag", "fr": "Journée internationale de l’alphabétisation", "es": "Día Internacional de la Alfabetización" },
  "keydates.day.teachers": { "en": "World Teachers' Day", "ru": "Всемирный день учителя", "de": "Weltlehrertag", "fr": "Journée mondiale des enseignants", "es": "Día Mundial de los Docentes" },
  "keydates.day.world_ip": { "en": "World Intellectual Property Day", "ru": "Всемирный день интеллектуальной собственности", "de": "Welttag des geistigen Eigentums", "fr": "Journée mondiale de la propriété intellectuelle", "es": "Día Mundial de la Propiedad Intelectual" },
  "keydates.day.human_rights": { "en": "Human Rights Day", "ru": "День прав человека", "de": "Tag der Menschenrechte", "fr": "Journée des droits de l’homme", "es": "Día de los Derechos Humanos" },
  "keydates.day.world_habitat": { "en": "World Habitat Day", "ru": "Всемирный день жилища", "de": "Welt-Habitat-Tag", "fr": "Journée mondiale de l’habitat", "es": "Día Mundial del Hábitat" },
  "keydates.day.msme": { "en": "Micro, Small and Medium-sized Enterprises Day", "ru": "День микро-, малых и средних предприятий", "de": "Tag der Kleinst-, Klein- und Mittelunternehmen", "fr": "Journée des micro, petites et moyennes entreprises", "es": "Día de las Microempresas y las Pymes" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node "$R4B/words.mjs" "$R4B/t3-words.json"
```

Expected: 83 keys written to each of the five bundles.

- [ ] **Step 5: Run the tests to see them pass**

```bash
"$R4B/vt.sh" src/content/lib/dayNames.test.ts src/content/i18n/; "$R4B/php.sh" tests/Unit/Content/DayWordsTest.php
```

Expected: both vitest files pass (`contentLocales.test.ts`: the five kinds in every bundle, `{{name}}` kept); `DayWordsTest | Tests:    2 passed`. If `DayWordsTest` names a missing or different id, the words file differs from `app/Services/Content/Days/DayNames.php` — copy the English from there.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib/dayNames.ts frontend/src/content/lib/dayNames.test.ts frontend/src/content/i18n/ tests/Unit/Content/DayWordsTest.php && git commit -q -m "Content portal: the built-in days' names in five languages, tied to the server's list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: Key dates on the Plan — chips, the day's card, the editor, the toggle

**Files:**
- Create: `frontend/src/content/plan/keyDateMath.ts`, `frontend/src/content/plan/keyDateMath.test.ts`, `frontend/src/content/plan/KeyDateChips.tsx`, `frontend/src/content/plan/KeyDayCard.tsx`, `frontend/src/content/plan/KeyDateEditor.tsx`, `frontend/src/content/plan/keyDates.test.tsx`
- Modify: `frontend/src/content/plan/{WeekGrid,MonthGrid,ListView,Toolbar,PlanPage}.tsx`, `frontend/src/content/plan/prefs.ts`, `frontend/src/content/panel/PanelProvider.tsx` (`NewDraft.fields`), `frontend/src/content/panel/panelState.ts` (`newForm`)
- Test: `frontend/src/content/plan/planPieces.test.tsx`, `frontend/src/content/plan/prefs.test.ts`
- Words: `$R4B/t4-words.json`

**Interfaces:**
- Consumes: `KeyDate`, `BuiltInDay`, `OwnKeyDate`, `OwnKind`, `KeyDateFields`, `api.createKeyDate/updateKeyDate/deleteKeyDate`, `ERRORS.keydate` (Task 2); `dayLabel`, `dayName`, `Words` (Task 3); `TextField`, `INPUT` (`brand/inputs.tsx`); `Dialog` (`ui/Dialog.tsx`); `newPostDraft`, `canAdd` (`plan/addMath.ts`).
- Produces:
  - `keyDateMath.ts`: `HOLIDAY_COUNTRIES`, `MAX_EVENT_DAYS = 31`, `KIND_TEXT: Record<KeyDate['kind'], string>`, `isBuiltIn(k): k is BuiltInDay`, `keyOf(k): string`, `onDay(k, day): boolean`, `keyDatesByDay(keyDates, days): Record<DateKey, KeyDate[]>`, `daysCovered(start, end): number`, `holidayCountryOf(brand): string | null`, `KeyDateForm`, `keyDateForm(keyDate, day)`, `KeyDateProblem`, `keyDateProblem(kind, form)`, `keyDateBody(kind, form, original)`.
  - `<KeyDateChips items observed compact? onPick />`, `<KeyDayCard day keyDate observed canWrite onWrite onClose />`, `<KeyDateEditor kind keyDate day onClose />`.
  - Grids take `keyDates?: Record<DateKey, KeyDate[]>`, `observed?: boolean`, `onKeyDate?: (keyDate: KeyDate, day: DateKey) => void`; `Toolbar` takes `keyDates?: boolean`, `onKeyDates?: (on: boolean) => void`; `PlanPrefs.keyDates: boolean` (default true).
  - `NewDraft.fields?: Partial<Pick<PostForm, 'topic' | 'hook' | 'main_copy' | 'cta' | 'hashtags' | 'pillar_id'>>`, laid over the new form by `newForm`.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/plan/keyDateMath.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import type { BrandPayload, KeyDate, OwnKeyDate } from '../lib/types'
import { daysCovered, holidayCountryOf, keyDateBody, keyDateForm, keyDateProblem, keyDatesByDay, keyOf, onDay } from './keyDateMath'
import { parsePrefs } from './prefs'

const boxing: KeyDate = { id: 'gb.boxing_day', kind: 'holiday', date: '2026-12-26', substitute: false, name_en: 'Boxing Day' }
const boxingInLieu: KeyDate = { ...boxing, date: '2026-12-28', substitute: true }
const offer: OwnKeyDate = { id: 4, kind: 'event', title: 'Autumn offer', details: null, start: '2026-09-28', end: '2026-10-08' }
const photographer: OwnKeyDate = { id: 5, kind: 'note', title: 'Photographer', details: 'At ten', start: '2026-10-01', end: null }
const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']

describe('keyOf', () => {
  // Review Focus 1: a substitute day shares its holiday's id; a list keyed by id alone drops or merges chips.
  it('gives every chip its own key: built-in days by kind, id, day and substitute; own ones by their id', () => {
    const keys = [boxing, boxingInLieu, { ...boxing, kind: 'marketing' as const }, offer, photographer].map(keyOf)
    expect(new Set(keys).size).toBe(5)
  })
})

describe('onDay and keyDatesByDay', () => {
  // Review Focus 2: an event that began before the shown week shows on each shown day it covers; a past note on its day.
  it('places an event on every day it covers, a note and a built-in day on theirs, and leaves out days without any', () => {
    const byDay = keyDatesByDay([offer, photographer, boxing], week)
    expect(Object.keys(byDay)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])
    expect(byDay['2026-10-08']).toEqual([offer])
    expect(keyDatesByDay([photographer], ['2026-10-01'])['2026-10-01']).toEqual([photographer])
    expect(onDay(boxing, '2026-12-26')).toBe(true)
    expect(onDay(boxing, '2026-12-27')).toBe(false)
  })
})

describe('holidayCountryOf', () => {
  const brand = (holiday_country: string | null, guess: string | null) => ({ profile: { holiday_country }, holiday_country_guess: guess }) as unknown as BrandPayload
  it('takes the brand’s choice, none, else the venue’s guess', () => {
    expect(holidayCountryOf(brand('US', 'GB'))).toBe('US')
    expect(holidayCountryOf(brand('none', 'GB'))).toBeNull()
    expect(holidayCountryOf(brand(null, 'GB'))).toBe('GB')
    expect(holidayCountryOf(brand(null, null))).toBeNull()
    expect(holidayCountryOf(undefined)).toBeNull()
  })
})

describe('the key date editor’s rules (spec 2026-10-16 §3.1)', () => {
  it('needs a title and a first day; an event lasts at most 31 days and never ends before it starts', () => {
    const form = { title: 'Spring sale', details: '', start: '2026-03-01', end: '2026-03-31' }
    expect(daysCovered('2026-03-01', '2026-03-31')).toBe(31)
    expect(keyDateProblem('event', form)).toBeNull()
    expect(keyDateProblem('event', { ...form, end: '2026-04-01' })).toBe('too_long')
    expect(keyDateProblem('event', { ...form, end: '2026-02-28' })).toBe('end_before_start')
    expect(keyDateProblem('event', { ...form, title: '   ' })).toBe('invalid')
    expect(keyDateProblem('note', { ...form, end: '2026-04-30' })).toBeNull() // a note's last day is never sent
  })

  it('sends everything for a new one, only the changes for one being edited, and no last day for a note', () => {
    expect(keyDateBody('note', { title: ' Photographer ', details: '', start: '2026-10-07', end: '2026-10-09' }, null))
      .toEqual({ kind: 'note', title: 'Photographer', details: null, start_date: '2026-10-07', end_date: null })
    expect(keyDateBody('event', { ...keyDateForm(offer, '2026-10-05'), title: 'Big offer' }, offer)).toEqual({ title: 'Big offer' })
    expect(keyDateForm(null, '2026-10-07')).toEqual({ title: '', details: '', start: '2026-10-07', end: '' })
  })
})

describe('the Key dates toggle on this device', () => {
  it('is on unless it was switched off', () => {
    expect(parsePrefs(null, [], []).keyDates).toBe(true)
    expect(parsePrefs(JSON.stringify({ keyDates: false }), [], []).keyDates).toBe(false)
    expect(parsePrefs(JSON.stringify({ keyDates: 'no' }), [], []).keyDates).toBe(true)
  })
})
```

Write `frontend/src/content/plan/keyDates.test.tsx` with the Write tool:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
import { bootFor } from '../brand/brandTesting'
import type { BuiltInDay, OwnKeyDate } from '../lib/types'
import { newForm } from '../panel/panelState'
import { KeyDateChips } from './KeyDateChips'
import { KeyDateEditor } from './KeyDateEditor'
import { KeyDayCard } from './KeyDayCard'
import { Toolbar } from './Toolbar'

const wrap = (el: ReactElement) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <ContentContext.Provider value={{ data: bootFor(true), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>{el}</ContentContext.Provider>
  </QueryClientProvider>,
)
const christmas: BuiltInDay = { id: 'christmas', kind: 'holiday', date: '2026-12-25', substitute: false, name_en: 'Christmas Day' }
const boxingInLieu: BuiltInDay = { id: 'gb.boxing_day', kind: 'holiday', date: '2026-12-28', substitute: true, name_en: 'Boxing Day' }
const note: OwnKeyDate = { id: 5, kind: 'note', title: 'Photographer', details: null, start: '2026-12-23', end: null }

describe('KeyDateChips (spec 2026-10-16 §3.4)', () => {
  // Review Focus 3: every chip is a button, so the day's click handler (clickAdds) never starts a post from it.
  it('draws each key date as a button named by its kind; a substitute says so; own ones show their title', () => {
    const out = wrap(<KeyDateChips items={[christmas, boxingInLieu, note]} observed={false} onPick={() => {}} />)
    expect(out).toContain('aria-label="Public holiday: Christmas Day"')
    expect(out).toContain('Boxing Day (day off in lieu)')
    expect(out).toContain('aria-label="Note: Photographer"')
    expect(out.match(/<button/g)).toHaveLength(3)
  })

  it('says "observed" for a United States substitute, and in the month view shows the first and how many more', () => {
    expect(wrap(<KeyDateChips items={[boxingInLieu]} observed onPick={() => {}} />)).toContain('Boxing Day (observed)')
    const month = wrap(<KeyDateChips items={[christmas, boxingInLieu, note]} observed={false} compact onPick={() => {}} />)
    expect(month.match(/<button/g)).toHaveLength(1)
    expect(month).toContain('+2 more')
  })
})

describe('KeyDayCard', () => {
  it('offers to write a post for the day, and says when the day has gone', () => {
    expect(wrap(<KeyDayCard day="2026-12-25" keyDate={christmas} observed={false} canWrite onWrite={() => {}} onClose={() => {}} />)).toContain('Write a post for it')
    const gone = wrap(<KeyDayCard day="2026-12-25" keyDate={christmas} observed={false} canWrite={false} onWrite={() => {}} onClose={() => {}} />)
    expect(gone).not.toContain('Write a post for it')
    expect(gone).toContain('This day has gone; new posts start from today.')
  })
})

describe('KeyDateEditor', () => {
  it('asks a new event for its first and last day, with no Delete', () => {
    const out = wrap(<KeyDateEditor kind="event" keyDate={null} day="2026-10-09" onClose={() => {}} />)
    expect(out).toContain('New event')
    expect(out).toContain('First day')
    expect(out).toContain('Last day (optional)')
    expect(out).toContain('value="2026-10-09"')
    expect(out).not.toContain('>Delete<')
  })

  it('edits a note on one day, says the AI never sees it, and can delete it', () => {
    const out = wrap(<KeyDateEditor kind="note" keyDate={note} day="2026-12-23" onClose={() => {}} />)
    expect(out).toContain('value="Photographer"')
    expect(out).not.toContain('Last day')
    expect(out).toContain('Notes are for the team: the AI never sees them.')
    expect(out).toContain('>Delete<')
  })
})

describe('the Key dates toggle and a new post from a key date', () => {
  it('shows a pressed Key dates switch in the toolbar', () => {
    const out = wrap(<Toolbar view="week" viewLocked={false} label="Oct 5 – 11" refreshing={false} canGenerate={false} filter={{ platforms: [], status: 'all' }}
      platforms={[]} statuses={[]} onPrev={() => {}} onNext={() => {}} onToday={() => {}} onView={() => {}} onFilter={() => {}} onGenerate={() => {}}
      keyDates onKeyDates={() => {}} />)
    // Within one button: the Week view's pressed button must not count.
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Key dates<\/button>/)
  })

  it('starts a new post with the day’s name as its topic (Write a post for it)', () => {
    expect(newForm({ date: '2026-12-25', platform: null, fields: { topic: 'Christmas Day' } }, ['instagram']).topic).toBe('Christmas Day')
  })
})
```

In `frontend/src/content/plan/planPieces.test.tsx`, before its last `describe(` block (or at the end of the file), add:

```tsx

describe('key dates in the three views (spec 2026-10-16 §3.4)', () => {
  const holiday = { id: 'christmas', kind: 'holiday' as const, date: '2026-10-08', substitute: false, name_en: 'Christmas Day' }
  const pastNote = { id: 5, kind: 'note' as const, title: 'Photographer', details: null, start: '2026-10-05', end: null }

  it('puts a day’s chips under its name in the week and in the list — a past day too', () => {
    const days = rangeFor('week', '2026-10-07').days
    const keyDates = { '2026-10-08': [holiday], '2026-10-05': [pastNote] }
    const week = html(<WeekGrid plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} fillingKey={null} aiPaused={false} {...handlers}
      keyDates={keyDates} observed={false} onKeyDate={noop} />)
    expect(week).toContain('aria-label="Public holiday: Christmas Day"')
    expect(week).toContain('aria-label="Note: Photographer"')
    // The list shows a past day that holds only a chip.
    const list = html(<ListView plans={plansFor(days, [], [])} today="2026-10-07" locale="en-GB" selectedId={null} fillingKey={null} aiPaused={false} {...handlers}
      keyDates={keyDates} observed={false} onKeyDate={noop} />)
    expect(list).toContain('list-2026-10-05')
    expect(list).toContain('Photographer')
  })

  it('shows the first chip and how many more in a month day', () => {
    const days = rangeFor('month', '2026-10-07').days
    const out = html(<MonthGrid plans={plansFor(days, [], [])} date="2026-10-07" today="2026-10-07" locale="en-GB" selectedId={null} dropDate={null} onDay={noop} onOpen={noop}
      keyDates={{ '2026-10-08': [holiday, { ...pastNote, start: '2026-10-08' }] }} observed={false} onKeyDate={noop} />)
    expect(out).toContain('Christmas Day')
    expect(out).toContain('+1 more')
  })
})
```

In `frontend/src/content/plan/prefs.test.ts`, replace:

```ts
      .toEqual({ view: 'month', filter: { platforms: ['linkedin'], status: 'draft' } })
```

with:

```ts
      .toEqual({ view: 'month', filter: { platforms: ['linkedin'], status: 'draft' }, keyDates: true })
```

and replace:

```ts
      .toEqual({ view: 'week', filter: { platforms: ['instagram'], status: 'all' } })
```

with:

```ts
      .toEqual({ view: 'week', filter: { platforms: ['instagram'], status: 'all' }, keyDates: true })
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4B/vt.sh" src/content/plan/keyDateMath.test.ts src/content/plan/keyDates.test.tsx src/content/plan/planPieces.test.tsx src/content/plan/prefs.test.ts
```

Expected: failures — `Failed to resolve import "./keyDateMath"` (and `./KeyDateChips`); the views take no `keyDates`; `parsePrefs` has no `keyDates`.

- [ ] **Step 3: `keyDateMath.ts`**

Write `frontend/src/content/plan/keyDateMath.ts` with the Write tool:

```ts
import { isDateKey } from '../../workspace/lib/wallClock'
import type { BrandPayload, BuiltInDay, DateKey, KeyDate, KeyDateFields, OwnKeyDate, OwnKind } from '../lib/types'

/** The nine countries the built-in holidays cover (spec 2026-10-16 D3; the server's PublicHolidays::COUNTRIES). */
export const HOLIDAY_COUNTRIES = ['GB', 'IE', 'DE', 'FR', 'ES', 'LV', 'LT', 'EE', 'US'] as const
export const MAX_EVENT_DAYS = 31

/** Each kind's English name, the fallback under the bundles' `content.keydates.kind.*`. */
export const KIND_TEXT: Record<KeyDate['kind'], string> = {
  holiday: 'Public holiday', marketing: 'Marketing day', industry: 'International day', event: 'Event', note: 'Note',
}

export const isBuiltIn = (k: KeyDate): k is BuiltInDay => k.kind === 'holiday' || k.kind === 'marketing' || k.kind === 'industry'

/** A key date's key in a list: built-in ids repeat (a substitute shares its holiday's id), so kind and day go in. */
export const keyOf = (k: KeyDate): string => (isBuiltIn(k) ? `${k.kind}:${k.id}:${k.date}:${k.substitute ? 's' : 'd'}` : `own:${k.id}`)

/** A built-in day on its date; an event on every day it covers; a note on its day. */
export const onDay = (k: KeyDate, day: DateKey): boolean => (isBuiltIn(k) ? k.date === day : k.start <= day && day <= (k.end ?? k.start))

/** Each shown day's key dates, in the server's order (built-in days, then the brand's own); days without any are left out. */
export function keyDatesByDay(keyDates: readonly KeyDate[], days: readonly DateKey[]): Record<DateKey, KeyDate[]> {
  const out: Record<DateKey, KeyDate[]> = {}
  for (const day of days) {
    const here = keyDates.filter(k => onDay(k, day))
    if (here.length > 0) out[day] = here
  }
  return out
}

/** Days from the first to the last, both counted (the server's ContentRules::days). */
export const daysCovered = (start: DateKey, end: DateKey): number =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1

/** The country whose holidays the brand sees (spec §3.3): its choice ("none" = none), else the venue's guess. */
export function holidayCountryOf(brand: BrandPayload | null | undefined): string | null {
  const chosen = brand?.profile?.holiday_country ?? null
  if (chosen === 'none') return null
  if (chosen !== null && (HOLIDAY_COUNTRIES as readonly string[]).includes(chosen)) return chosen
  return brand?.holiday_country_guess ?? null
}

/** An event or note as its editor holds it: text, '' for "none". */
export interface KeyDateForm { title: string; details: string; start: string; end: string }

export function keyDateForm(keyDate: OwnKeyDate | null, day: DateKey): KeyDateForm {
  return keyDate
    ? { title: keyDate.title, details: keyDate.details ?? '', start: keyDate.start, end: keyDate.end ?? '' }
    : { title: '', details: '', start: day, end: '' }
}

export type KeyDateProblem = 'invalid' | 'end_before_start' | 'too_long'

/** What the server would refuse, said first: a title and a first day; an event's last day not before it, 31 days at most. */
export function keyDateProblem(kind: OwnKind, form: KeyDateForm): KeyDateProblem | null {
  if (form.title.trim() === '' || !isDateKey(form.start)) return 'invalid'
  if (kind === 'note' || form.end === '' || form.end === form.start) return null
  if (!isDateKey(form.end)) return 'invalid'
  if (form.end < form.start) return 'end_before_start'
  return daysCovered(form.start, form.end) > MAX_EVENT_DAYS ? 'too_long' : null
}

/** What to send: everything for a new one, only what changed for one being edited; a note never has a last day. */
export function keyDateBody(kind: OwnKind, form: KeyDateForm, original: OwnKeyDate | null): KeyDateFields {
  const fields: KeyDateFields = {
    title: form.title.trim(),
    details: form.details.trim() === '' ? null : form.details.trim(),
    start_date: form.start,
    end_date: kind === 'note' || form.end === '' || form.end === form.start ? null : form.end,
  }
  if (!original) return { kind, ...fields }
  const before: KeyDateFields = { title: original.title, details: original.details, start_date: original.start, end_date: original.end }
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => before[key as keyof KeyDateFields] !== value)) as KeyDateFields
}
```

- [ ] **Step 4: The chips, the day's card and the editor**

Write `frontend/src/content/plan/KeyDateChips.tsx` with the Write tool:

```tsx
import { useTranslation } from 'react-i18next'
import { CalendarRange, Globe, Landmark, StickyNote, Tag, type LucideIcon } from 'lucide-react'
import { dayLabel, type Words } from '../lib/dayNames'
import type { KeyDate } from '../lib/types'
import { isBuiltIn, keyOf, KIND_TEXT } from './keyDateMath'

const ICONS: Record<KeyDate['kind'], LucideIcon> = { holiday: Landmark, marketing: Tag, industry: Globe, event: CalendarRange, note: StickyNote }

/**
 * A day's key dates as chips above its posts (spec 2026-10-16 §3.4): each kind its own icon; a click opens the day's
 * card (a built-in day) or its editor (an event or a note). Compact (the month view): the first chip and how many more.
 */
export function KeyDateChips({ items, observed, compact = false, onPick }: { items: KeyDate[]; observed: boolean; compact?: boolean; onPick: (keyDate: KeyDate) => void }) {
  const { t } = useTranslation()
  const words: Words = (key, english, vars) => t(key, english, vars)
  const shown = compact ? items.slice(0, 1) : items
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {shown.map(k => {
        const Icon = ICONS[k.kind]
        const name = isBuiltIn(k) ? dayLabel(words, k, observed) : k.title
        const kind = t(`content.keydates.kind.${k.kind}`, KIND_TEXT[k.kind])
        return (
          <button key={keyOf(k)} type="button" data-keydate={k.kind} onClick={() => onPick(k)} aria-label={`${kind}: ${name}`} title={name}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-a-border bg-a-surface-2 px-2 py-0.5 text-xs text-a-text hover:border-a-accent-text">
            <Icon size={12} aria-hidden className="shrink-0 text-a-text-2" />
            <span className="truncate">{name}</span>
          </button>
        )
      })}
      {compact && items.length > 1 && <span className="px-1 text-xs text-a-text-2">{t('content.plan.more', '+{{count}} more', { count: items.length - 1 })}</span>}
    </div>
  )
}
```

Write `frontend/src/content/plan/KeyDayCard.tsx` with the Write tool:

```tsx
import { useTranslation } from 'react-i18next'
import { PenLine } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { dayLabel, dayName, type Words } from '../lib/dayNames'
import type { BuiltInDay, DateKey } from '../lib/types'
import { Dialog } from '../ui/Dialog'
import { KIND_TEXT } from './keyDateMath'

/** A holiday or special day's card (spec 2026-10-16 §3.4): its name and kind, and "Write a post for it" from today on. */
export function KeyDayCard({ day, keyDate, observed, canWrite, onWrite, onClose }: {
  day: DateKey
  keyDate: BuiltInDay
  observed: boolean
  canWrite: boolean
  /** Opens a new post on the day with this topic (the day's name in the interface's language). */
  onWrite: (topic: string) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const words: Words = (key, english, vars) => t(key, english, vars)
  return (
    <Dialog title={dayLabel(words, keyDate, observed)} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-a-text-2">
          {t(`content.keydates.kind.${keyDate.kind}`, KIND_TEXT[keyDate.kind])} · {formatDate(day, i18n.language || 'en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {canWrite
          ? <Button onClick={() => onWrite(dayName(words, keyDate))}><PenLine size={14} aria-hidden />{t('content.keydates.write_for', 'Write a post for it')}</Button>
          : <p className="text-xs text-a-text-2">{t('content.keydates.gone', 'This day has gone; new posts start from today.')}</p>}
      </div>
    </Dialog>
  )
}
```

Write `frontend/src/content/plan/KeyDateEditor.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { INPUT, TextField } from '../brand/inputs'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { DateKey, OwnKeyDate, OwnKind } from '../lib/types'
import { Dialog } from '../ui/Dialog'
import { keyDateBody, keyDateForm, keyDateProblem, type KeyDateForm } from './keyDateMath'

/**
 * A new or existing event or note (spec 2026-10-16 §3.1): a title, details, a first day and — for an event — a last day
 * (31 days at most). Anyone on the team saves or deletes it; the Plan is read again after.
 */
export function KeyDateEditor({ kind, keyDate, day, onClose }: { kind: OwnKind; keyDate: OwnKeyDate | null; day: DateKey; onClose: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<KeyDateForm>(() => keyDateForm(keyDate, day))
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.keydates.${key}`, english)
  const fail = (code: string) => {
    const [key, text] = errorKey('keydate', code)
    setError(t(key, text))
  }
  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] })
    onClose()
  }

  const save = async () => {
    const problem = keyDateProblem(kind, form)
    if (problem) {
      fail(problem)
      return
    }
    const body = keyDateBody(kind, form, keyDate)
    setBusy('save')
    setError(null)
    try {
      if (keyDate === null) await api.createKeyDate({ ...body, kind, title: form.title.trim(), start_date: form.start })
      else if (Object.keys(body).length > 0) await api.updateKeyDate(keyDate.id, body)
      await finish()
    } catch (e) {
      fail(failureOf(e).code)
      setBusy(null)
    }
  }
  const remove = async () => {
    if (keyDate === null) return
    setBusy('delete')
    setError(null)
    try {
      await api.deleteKeyDate(keyDate.id)
      await finish()
    } catch (e) {
      fail(failureOf(e).code)
      setBusy(null)
    }
  }

  const title = keyDate
    ? (kind === 'event' ? w('edit_event', 'Event') : w('edit_note', 'Note'))
    : (kind === 'event' ? w('new_event', 'New event') : w('new_note', 'New note'))
  return (
    <Dialog title={title} onClose={onClose} busy={busy !== null}>
      <div className="space-y-3">
        <TextField label={w('title_field', 'Title')} value={form.title} maxLength={120} required onChange={(value) => setForm({ ...form, title: value })} />
        <TextField label={w('details', 'Details (optional)')} value={form.details} maxLength={1000} rows={3} onChange={(value) => setForm({ ...form, details: value })} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{kind === 'event' ? w('first_day', 'First day') : w('on_day', 'Day')}</span>
            <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={`${INPUT} border-a-border`} />
          </label>
          {kind === 'event' && (
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-a-text-2">{w('last_day', 'Last day (optional)')}</span>
              <input type="date" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} className={`${INPUT} border-a-border`} />
            </label>
          )}
        </div>
        {kind === 'note' && <p className="text-xs text-a-text-2">{w('note_hint', 'Notes are for the team: the AI never sees them.')}</p>}
        {error && <Notice tone="danger">{error}</Notice>}
        {asking ? (
          <div role="alert" className="space-y-2 rounded-lg border border-a-danger/30 bg-a-danger/10 p-3">
            <p className="text-sm text-a-text">{w('delete_confirm', 'Delete this for everyone on the team?')}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" loading={busy === 'delete'} onClick={() => { void remove() }}>{w('delete_yes', 'Delete')}</Button>
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setAsking(false)}>{t('content.common.cancel', 'Cancel')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { void save() }} loading={busy === 'save'}>{t('content.brand.save', 'Save')}</Button>
            <Button variant="secondary" disabled={busy !== null} onClick={onClose}>{t('content.common.cancel', 'Cancel')}</Button>
            {keyDate && <Button variant="ghost" disabled={busy !== null} onClick={() => setAsking(true)}>{w('delete', 'Delete')}</Button>}
          </div>
        )}
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 5: The prefs, the new post's fields, the views and the toolbar**

In `frontend/src/content/plan/prefs.ts`, replace:

```ts
export interface PlanPrefs { view: PlanView; filter: PlanFilter }
export const DEFAULT_PREFS: PlanPrefs = { view: 'week', filter: { platforms: [], status: 'all' } }
```

with:

```ts
/** `keyDates`: the Key dates layer shows (spec 2026-10-16 §3.4; on until switched off on this device). */
export interface PlanPrefs { view: PlanView; filter: PlanFilter; keyDates: boolean }
export const DEFAULT_PREFS: PlanPrefs = { view: 'week', filter: { platforms: [], status: 'all' }, keyDates: true }
```

and replace:

```ts
      status: typeof f.status === 'string' && statuses.includes(f.status) ? (f.status as PostStatus) : 'all',
    },
  }
```

with:

```ts
      status: typeof f.status === 'string' && statuses.includes(f.status) ? (f.status as PostStatus) : 'all',
    },
    keyDates: typeof o.keyDates === 'boolean' ? o.keyDates : true,
  }
```

In `frontend/src/content/panel/PanelProvider.tsx`, replace:

```ts
/** What a new post starts from: the day, platform and time a day's "+", a slot or the New post button gave. */
export interface NewDraft { date: DateKey | null; platform: Platform | null; time?: string | null }
```

with:

```ts
/**
 * What a new post starts from: the day, platform and time a day's "+", a slot or the New post button gave; `fields` are
 * words it starts with (a key date's name as its topic, a template's words: spec 2026-10-16 §3.4, §5.3).
 */
export interface NewDraft {
  date: DateKey | null
  platform: Platform | null
  time?: string | null
  fields?: Partial<Pick<PostForm, 'topic' | 'hook' | 'main_copy' | 'cta' | 'hashtags' | 'pillar_id'>>
}
```

and add `import type { PostForm } from './panelState'` to its imports (Edit tool).

In `frontend/src/content/panel/panelState.ts`, replace (the end of `newForm`; `hashtags: ''` occurs once in the file):

```ts
    cta: '',
    hashtags: '',
  }
}
```

with:

```ts
    cta: '',
    hashtags: '',
    // The words it starts with (a key date's name, a template's fields) over the empty ones.
    ...draft.fields,
  }
}
```

In `frontend/src/content/plan/WeekGrid.tsx`:

1. Replace `import type { DateKey, Platform, PostCard, Slot } from '../lib/types'` with `import type { DateKey, KeyDate, Platform, PostCard, Slot } from '../lib/types'` and add `import { KeyDateChips } from './KeyDateChips'`.
2. Replace the props line `export function WeekGrid({ plans, today, locale, selectedId, dropDate, fillingKey, aiPaused, times, onAdd, onOpen, onWrite, onFill, onCardPointerDown, onCardKeyDown }: PlanHandlers & {` with `export function WeekGrid({ plans, today, locale, selectedId, dropDate, fillingKey, aiPaused, times, onAdd, keyDates, observed = false, onKeyDate, onOpen, onWrite, onFill, onCardPointerDown, onCardKeyDown }: PlanHandlers & {`.
3. Replace:

```tsx
  onAdd?: (day: DateKey) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-full min-w-[42rem] grid-cols-7 divide-x divide-a-border">
```

with:

```tsx
  onAdd?: (day: DateKey) => void
  /** Each day's key dates (spec 2026-10-16 §3.4); absent while the layer is hidden. */
  keyDates?: Record<DateKey, KeyDate[]>
  /** A substitute day says "observed" (the brand's holidays are the United States'). */
  observed?: boolean
  onKeyDate?: (keyDate: KeyDate, day: DateKey) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-full min-w-[42rem] grid-cols-7 divide-x divide-a-border">
```

4. Replace:

```tsx
            </h3>
            {day.posts.map(post => (
              <PostCardView key={post.id} post={post} selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
```

with:

```tsx
            </h3>
            {keyDates?.[day.date] && onKeyDate && <KeyDateChips items={keyDates[day.date]} observed={observed} onPick={(k) => onKeyDate(k, day.date)} />}
            {day.posts.map(post => (
              <PostCardView key={post.id} post={post} selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
```

In `frontend/src/content/plan/MonthGrid.tsx`:

1. Replace `import type { DateKey } from '../lib/types'` with `import type { DateKey, KeyDate } from '../lib/types'` and add `import { KeyDateChips } from './KeyDateChips'`.
2. Replace `export function MonthGrid({ plans, date, today, locale, selectedId, dropDate, onDay, onAdd, onOpen, onCardPointerDown, onCardKeyDown }: Pick<PlanHandlers, 'onOpen' | 'onCardPointerDown' | 'onCardKeyDown'> & {` with `export function MonthGrid({ plans, date, today, locale, selectedId, dropDate, onDay, onAdd, keyDates, observed = false, onKeyDate, onOpen, onCardPointerDown, onCardKeyDown }: Pick<PlanHandlers, 'onOpen' | 'onCardPointerDown' | 'onCardKeyDown'> & {`.
3. Replace:

```tsx
  onAdd?: (day: DateKey) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-[42rem]">
```

with:

```tsx
  onAdd?: (day: DateKey) => void
  /** Each day's key dates (spec 2026-10-16 §3.4): the month shows the first and how many more. */
  keyDates?: Record<DateKey, KeyDate[]>
  observed?: boolean
  onKeyDate?: (keyDate: KeyDate, day: DateKey) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-[42rem]">
```

4. Replace:

```tsx
              <div className="space-y-1">
                {day.posts.slice(0, SHOWN).map(post => (
```

with:

```tsx
              <div className="space-y-1">
                {keyDates?.[day.date] && onKeyDate && <KeyDateChips items={keyDates[day.date]} observed={observed} compact onPick={(k) => onKeyDate(k, day.date)} />}
                {day.posts.slice(0, SHOWN).map(post => (
```

In `frontend/src/content/plan/ListView.tsx`:

1. Replace `import type { DateKey, Platform } from '../lib/types'` with `import type { DateKey, KeyDate, Platform } from '../lib/types'` and add `import { KeyDateChips } from './KeyDateChips'`.
2. Replace `export function ListView({ plans, today, locale, selectedId, fillingKey, aiPaused, times, onAdd, onOpen, onWrite, onFill, onCardKeyDown }: Omit<PlanHandlers, 'onCardPointerDown'> & {` with `export function ListView({ plans, today, locale, selectedId, fillingKey, aiPaused, times, onAdd, keyDates, observed = false, onKeyDate, onOpen, onWrite, onFill, onCardKeyDown }: Omit<PlanHandlers, 'onCardPointerDown'> & {`.
3. Replace:

```tsx
  onAdd?: (day: DateKey) => void
}) {
  const { t } = useTranslation()
  // The days that hold something, and — where a new post can be started — today and the days ahead even when empty.
  const days = plans.filter(day => day.posts.length > 0 || day.slots.length > 0 || (onAdd !== undefined && canAdd(day.date, today)))
```

with:

```tsx
  onAdd?: (day: DateKey) => void
  /** Each day's key dates (spec 2026-10-16 §3.4): a day holding only key dates shows too, a past one included. */
  keyDates?: Record<DateKey, KeyDate[]>
  observed?: boolean
  onKeyDate?: (keyDate: KeyDate, day: DateKey) => void
}) {
  const { t } = useTranslation()
  // The days that hold something (key dates too), and — where a new post can be started — today and the days ahead even when empty.
  const days = plans.filter(day => day.posts.length > 0 || day.slots.length > 0 || (keyDates?.[day.date]?.length ?? 0) > 0
    || (onAdd !== undefined && canAdd(day.date, today)))
```

4. Put the chips in the day's header block, on the line right under its name and "+" (spec §3.4 says "the day's header row"; on a 390 px phone that row already holds the day's name and its "+", so the chips take the line below it, still above the posts). Replace:

```tsx
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
```

with:

```tsx
          </div>
          {keyDates?.[day.date] && onKeyDate && <div className="mb-2"><KeyDateChips items={keyDates[day.date]} observed={observed} onPick={(k) => onKeyDate(k, day.date)} /></div>}
          <div className="grid gap-2 sm:grid-cols-2">
```

In `frontend/src/content/plan/Toolbar.tsx`:

1. Replace `import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'` with `import { CalendarHeart, ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'`.
2. Replace `export function Toolbar({ view, viewLocked, label, refreshing, canGenerate, filter, platforms, statuses, onPrev, onNext, onToday, onView, onFilter, onGenerate, aiPaused = false }: {` with `export function Toolbar({ view, viewLocked, label, refreshing, canGenerate, filter, platforms, statuses, onPrev, onNext, onToday, onView, onFilter, onGenerate, aiPaused = false, keyDates = true, onKeyDates }: {`.
3. Replace:

```tsx
  /** This month's AI budget is used up: Generate waits. */
  aiPaused?: boolean
}) {
```

with:

```tsx
  /** This month's AI budget is used up: Generate waits. */
  aiPaused?: boolean
  /** The Key dates layer shows (spec 2026-10-16 §3.4); the switch is offered only with `onKeyDates`. */
  keyDates?: boolean
  onKeyDates?: (on: boolean) => void
}) {
```

4. Replace:

```tsx
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-a-text-2">
          <span>{t('content.plan.filter_status', 'Status')}</span>
```

with:

```tsx
        {onKeyDates && (
          <button type="button" aria-pressed={keyDates} onClick={() => onKeyDates(!keyDates)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${keyDates ? 'border-a-accent-text bg-a-surface-2 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
            <CalendarHeart size={12} aria-hidden />{t('content.plan.key_dates', 'Key dates')}
          </button>
        )}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-a-text-2">
          <span>{t('content.plan.filter_status', 'Status')}</span>
```

- [ ] **Step 6: The Plan page**

In `frontend/src/content/plan/PlanPage.tsx`:

1. Replace `import type { DateKey, PostCard, PostDetail, Slot } from '../lib/types'` with `import type { BuiltInDay, DateKey, KeyDate, OwnKeyDate, OwnKind, PostCard, PostDetail, Slot } from '../lib/types'`, and after `import { GoalsLine } from './GoalsLine'` add:

```tsx
import { KeyDateEditor } from './KeyDateEditor'
import { KeyDayCard } from './KeyDayCard'
import { holidayCountryOf, isBuiltIn, keyDatesByDay } from './keyDateMath'
```

2. Replace:

```tsx
  const [generating, setGenerating] = useState(false)
  const [params, setParams] = useSearchParams()
```

with:

```tsx
  const [generating, setGenerating] = useState(false)
  // A holiday or special day's card, and an event or note being written (spec 2026-10-16 §3.4).
  const [dayCard, setDayCard] = useState<{ day: DateKey; keyDate: BuiltInDay } | null>(null)
  const [keyDateEdit, setKeyDateEdit] = useState<{ kind: OwnKind; keyDate: OwnKeyDate | null; day: DateKey } | null>(null)
  const [params, setParams] = useSearchParams()
```

3. Replace:

```tsx
  const dayName = (day: DateKey) => formatDate(day, locale, { weekday: 'short', day: 'numeric', month: 'short' })
```

with:

```tsx
  const dayName = (day: DateKey) => formatDate(day, locale, { weekday: 'short', day: 'numeric', month: 'short' })
  // The range's key dates by day, while the layer shows; a substitute day says "observed" for the United States.
  const keyDates = prefs.keyDates ? keyDatesByDay(data?.key_dates ?? [], range.days) : undefined
  const observed = holidayCountryOf(brandInfo.data) === 'US'
```

4. After the line `  const dropTarget = drag.state?.target ?? null` (just below `addOn`; it occurs once), add:

```tsx

  // A chip: a built-in day opens its card; an event or note its editor.
  const onKeyDate = (keyDate: KeyDate, day: DateKey) => {
    if (isBuiltIn(keyDate)) setDayCard({ day, keyDate })
    else setKeyDateEdit({ kind: keyDate.kind, keyDate, day })
  }
  // "Write a post for it": a new post on the day, the day's name as its topic.
  const writeFor = (day: DateKey, topic: string) => {
    setDayCard(null)
    const draft = newPostDraft(day, data?.slots ?? [], channels, industry)
    panel.openNew({ ...(brandInfo.data ? draft : { ...draft, time: undefined }), fields: { topic } })
  }
```

5. Replace:

```tsx
        onGenerate={() => setGenerating(true)} aiPaused={aiPaused} />
```

with:

```tsx
        onGenerate={() => setGenerating(true)} aiPaused={aiPaused}
        keyDates={prefs.keyDates} onKeyDates={(on) => setPrefs({ ...prefs, keyDates: on })} />
```

6. In the three views, add `keyDates={keyDates} observed={observed} onKeyDate={onKeyDate}`: replace

```tsx
            <WeekGrid plans={plans} today={today} locale={locale} selectedId={selectedId} dropDate={dropDate} fillingKey={filling} aiPaused={aiPaused} times={times} onAdd={addOn}
```

with

```tsx
            <WeekGrid plans={plans} today={today} locale={locale} selectedId={selectedId} dropDate={dropDate} fillingKey={filling} aiPaused={aiPaused} times={times} onAdd={addOn}
              keyDates={keyDates} observed={observed} onKeyDate={onKeyDate}
```

replace

```tsx
            <MonthGrid plans={plans} date={date} today={today} locale={locale} selectedId={selectedId} dropDate={dropDate} onAdd={addOn}
```

with

```tsx
            <MonthGrid plans={plans} date={date} today={today} locale={locale} selectedId={selectedId} dropDate={dropDate} onAdd={addOn}
              keyDates={keyDates} observed={observed} onKeyDate={onKeyDate}
```

and replace

```tsx
            <ListView plans={plans} today={today} locale={locale} selectedId={selectedId} fillingKey={filling} aiPaused={aiPaused} {...handlers} times={times} onAdd={addOn} />
```

with

```tsx
            <ListView plans={plans} today={today} locale={locale} selectedId={selectedId} fillingKey={filling} aiPaused={aiPaused} {...handlers} times={times} onAdd={addOn}
              keyDates={keyDates} observed={observed} onKeyDate={onKeyDate} />
```

7. Replace:

```tsx
      {generating && <GenerateDialog today={today} onClose={() => setGenerating(false)} onDone={() => { void refresh() }} />}
```

with:

```tsx
      {generating && <GenerateDialog today={today} onClose={() => setGenerating(false)} onDone={() => { void refresh() }} />}
      {dayCard && (
        <KeyDayCard day={dayCard.day} keyDate={dayCard.keyDate} observed={observed} canWrite={canAdd(dayCard.day, today)}
          onWrite={(topic) => writeFor(dayCard.day, topic)} onClose={() => setDayCard(null)} />
      )}
      {keyDateEdit && <KeyDateEditor kind={keyDateEdit.kind} keyDate={keyDateEdit.keyDate} day={keyDateEdit.day} onClose={() => setKeyDateEdit(null)} />}
```

- [ ] **Step 7: The words**

Write `$R4B/t4-words.json` with the Write tool:

```json
{
  "plan.key_dates": { "en": "Key dates", "ru": "Ключевые даты", "de": "Wichtige Termine", "fr": "Dates clés", "es": "Fechas clave" },
  "keydates.write_for": { "en": "Write a post for it", "ru": "Написать пост к этой дате", "de": "Einen Beitrag dazu schreiben", "fr": "Écrire une publication pour ce jour", "es": "Escribir una publicación para este día" },
  "keydates.gone": { "en": "This day has gone; new posts start from today.", "ru": "Этот день уже прошёл; новые посты — начиная с сегодняшнего.", "de": "Dieser Tag ist vorbei; neue Beiträge beginnen ab heute.", "fr": "Ce jour est passé ; les nouvelles publications commencent aujourd’hui.", "es": "Este día ya pasó; las nuevas publicaciones empiezan hoy." },
  "keydates.new_event": { "en": "New event", "ru": "Новое событие", "de": "Neues Ereignis", "fr": "Nouvel événement", "es": "Nuevo evento" },
  "keydates.new_note": { "en": "New note", "ru": "Новая заметка", "de": "Neue Notiz", "fr": "Nouvelle note", "es": "Nueva nota" },
  "keydates.edit_event": { "en": "Event", "ru": "Событие", "de": "Ereignis", "fr": "Événement", "es": "Evento" },
  "keydates.edit_note": { "en": "Note", "ru": "Заметка", "de": "Notiz", "fr": "Note", "es": "Nota" },
  "keydates.title_field": { "en": "Title", "ru": "Название", "de": "Titel", "fr": "Titre", "es": "Título" },
  "keydates.details": { "en": "Details (optional)", "ru": "Подробности (необязательно)", "de": "Details (optional)", "fr": "Détails (facultatif)", "es": "Detalles (opcional)" },
  "keydates.first_day": { "en": "First day", "ru": "Первый день", "de": "Erster Tag", "fr": "Premier jour", "es": "Primer día" },
  "keydates.on_day": { "en": "Day", "ru": "День", "de": "Tag", "fr": "Jour", "es": "Día" },
  "keydates.last_day": { "en": "Last day (optional)", "ru": "Последний день (необязательно)", "de": "Letzter Tag (optional)", "fr": "Dernier jour (facultatif)", "es": "Último día (opcional)" },
  "keydates.note_hint": { "en": "Notes are for the team: the AI never sees them.", "ru": "Заметки — для команды: ИИ их не видит.", "de": "Notizen sind für das Team: Die KI sieht sie nie.", "fr": "Les notes sont pour l’équipe : l’IA ne les voit jamais.", "es": "Las notas son para el equipo: la IA nunca las ve." },
  "keydates.delete": { "en": "Delete", "ru": "Удалить", "de": "Löschen", "fr": "Supprimer", "es": "Eliminar" },
  "keydates.delete_confirm": { "en": "Delete this for everyone on the team?", "ru": "Удалить это для всей команды?", "de": "Für das ganze Team löschen?", "fr": "Supprimer pour toute l’équipe ?", "es": "¿Eliminar para todo el equipo?" },
  "keydates.delete_yes": { "en": "Delete", "ru": "Удалить", "de": "Löschen", "fr": "Supprimer", "es": "Eliminar" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node "$R4B/words.mjs" "$R4B/t4-words.json"
```

- [ ] **Step 8: Run the tests, the Plan folder and the types**

```bash
"$R4B/vt.sh" src/content/plan/ src/content/panel/ src/content/i18n/ && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
```

Expected: every file passes; `TSC-CLEAN`.

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/plan frontend/src/content/panel/PanelProvider.tsx frontend/src/content/panel/panelState.ts frontend/src/content/i18n/ && git commit -q -m "Content portal: key dates on the Plan — chips, the day's card, events and notes, the toggle" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: One shared menu, and the day's "+" as a menu (spec §3.5)

**Files:**
- Create: `frontend/src/content/ui/PopMenu.tsx`
- Move: `frontend/src/content/panel/menuFocus.ts` → `frontend/src/content/ui/menuFocus.ts`
- Modify: `frontend/src/content/panel/InsertMenu.tsx`, `frontend/src/content/plan/{AddButton.tsx,addMath.ts,WeekGrid.tsx,MonthGrid.tsx,ListView.tsx,PlanPage.tsx}`
- Test: `frontend/src/content/panel/insertMenu.test.tsx`, `frontend/src/content/plan/addMath.test.ts`, `frontend/src/content/plan/planPieces.test.tsx`
- Words: `$R4B/t5-words.json`

**Interfaces:**
- Consumes: `KeyDateEditor` and the Plan's `keyDateEdit` state (Task 4).
- Produces: `PopItem { id: string; label: string; sub?: string }`; `<PopMenu label items onPick className children wrapClassName? data? align? listClassName? title? />` — `label` is the button's accessible name, `children` what it shows, `data` extra `data-*` attributes on the button, `align` the list's side; `AddChoice = 'post' | 'template' | 'note' | 'event'`; `addChoices(templates: boolean): AddChoice[]`; `AddButton` props `{ day; locale; onAdd: (day, choice: AddChoice) => void; templates?: boolean; align?: 'left' | 'right'; className? }`; the views' `onAdd: (day: DateKey, choice: AddChoice) => void` and `templates?: boolean`; the Plan's `addOn(day, choice = 'post')` (a day's empty space adds a post at once, D9).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/content/plan/addMath.test.ts`, replace `import { canAdd, clickAdds, newPostDraft, usualTimes } from './addMath'` with `import { addChoices, canAdd, clickAdds, newPostDraft, usualTimes } from './addMath'`, replace:

```ts
    expect(clickAdds(at('button'))).toBe(false)
```

with:

```ts
    expect(clickAdds(at('button'))).toBe(false)
    // Review Focus 3: a click on an open menu's own padding (between its items) starts nothing.
    expect(clickAdds(at('[data-menu]'))).toBe(false)
```

and at the end of the file add:

```ts

describe('addChoices (spec 2026-10-16 §3.5)', () => {
  it('offers a new post, a template where the brand has one, a note and an event', () => {
    expect(addChoices(false)).toEqual(['post', 'note', 'event'])
    expect(addChoices(true)).toEqual(['post', 'template', 'note', 'event'])
  })
})
```

In `frontend/src/content/panel/insertMenu.test.tsx`, replace `import { focusWasInside, outside } from './menuFocus'` with `import { focusWasInside, outside } from '../ui/menuFocus'`, and replace:

```ts
    const source = fs.readFileSync(new URL('./InsertMenu.tsx', import.meta.url), 'utf8')
```

with:

```ts
    // The behaviour lives in the shared menu (spec 2026-10-16 §3.5) that Insert, the "+" and the Template menu use.
    const source = fs.readFileSync(new URL('../ui/PopMenu.tsx', import.meta.url), 'utf8')
```

In `frontend/src/content/plan/planPieces.test.tsx`:

1. Replace `    expect(out).toContain('aria-label="New post on Wednesday 7 October"')` with:

```tsx
    expect(out).toContain('aria-label="Add to Wednesday 7 October"')
    expect(out).toMatch(/<button[^>]*aria-haspopup="true"[^>]*data-add="2026-10-07"/)
```

2. Replace:

```tsx
    expect(source).toMatch(/const addOn = \(day: DateKey\) => \{\s*if \(drag\.consumeClick\(\) \|\| !canAdd\(day, today\)\) return/)
```

with:

```tsx
    expect(source).toMatch(/const addOn = \(day: DateKey, choice: AddChoice = 'post'\) => \{\s*if \(drag\.consumeClick\(\) \|\| !canAdd\(day, today\)\) return/)
```

3. Replace:

```tsx
    expect(out).toMatch(/<button[^>]*data-add="2026-10-07"[^>]*class="[^"]*absolute right-1 top-1/)
```

with:

```tsx
    expect(out).toMatch(/<div class="absolute right-1 top-1"><div data-menu="" class="relative[^"]*"><button[^>]*data-add="2026-10-07"/)
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4B/vt.sh" src/content/plan/addMath.test.ts src/content/panel/insertMenu.test.tsx src/content/plan/planPieces.test.tsx
```

Expected: `addChoices` is not exported; `clickAdds` takes a click inside `[data-menu]`; `../ui/menuFocus` and `../ui/PopMenu.tsx` do not exist; the "+" is still named "New post on …".

- [ ] **Step 3: The shared menu, Insert on it**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git mv frontend/src/content/panel/menuFocus.ts frontend/src/content/ui/menuFocus.ts
```

Write `frontend/src/content/ui/PopMenu.tsx` with the Write tool:

```tsx
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { focusWasInside, outside } from './menuFocus'

export interface PopItem { id: string; label: string; sub?: string }

/**
 * A small menu behind a button (spec 2026-10-16 §3.5): the day's "+", Insert, the Template menu, an idea's "Move to…".
 * Real buttons; a mouse press does not take the focus, so a field keeps its cursor. While open, an Escape anywhere
 * closes the list (claimed, so an open panel stays open), as does a press or the focus outside it; after a choice or an
 * Escape in the list the focus goes back to the button. Nothing shows without items.
 */
export function PopMenu({ label, items, onPick, className, children, wrapClassName = '', data, align = 'right', listClassName = 'w-64', title }: {
  /** The button's accessible name. */
  label: string
  items: PopItem[]
  onPick: (id: string) => void
  /** The button's classes. */
  className: string
  /** What the button shows. */
  children: ReactNode
  /** Classes for the wrapper (margins, self-alignment; never a position: it is the list's anchor). */
  wrapClassName?: string
  /** Extra data-* attributes on the button. */
  data?: Record<string, string>
  align?: 'left' | 'right'
  listClassName?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const listId = useId()

  const close = () => {
    if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
      setOpen(false)
    }
    const onPress = (e: PointerEvent) => { if (outside(box.current, e.target)) setOpen(false) }
    // Capture: the list closes before the panel's own Escape (which skips a claimed one) or a press reaches anything else.
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
    }
  }, [open])

  if (items.length === 0) return null
  // data-menu: a click anywhere in the menu (its padding included) is the menu's, never a day's (plan/addMath clickAdds).
  return (
    <div ref={box} data-menu="" className={`relative ${wrapClassName}`} onBlur={(e) => { if (open && outside(box.current, e.relatedTarget)) setOpen(false) }}>
      <button ref={toggle} type="button" aria-haspopup="true" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={label} title={title}
        {...data} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(o => !o)} className={className}>
        {children}
      </button>
      {open && (
        <ul id={listId} className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-a-border bg-a-surface p-1 shadow-a-lg ${listClassName}`}>
          {items.map(item => (
            <li key={item.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(item.id); close() }}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-a-surface-2">
                <span className="block truncate text-sm font-medium text-a-text">{item.label}</span>
                {item.sub && <span className="block truncate text-xs text-a-text-2">{item.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Write `frontend/src/content/panel/InsertMenu.tsx` with the Write tool (it replaces the file):

```tsx
import { ListPlus } from 'lucide-react'
import type { Snippet } from '../lib/types'
import { PopMenu } from '../ui/PopMenu'

/**
 * "Insert" beside a field (spec 2026-10-15 §6): the brand's hashtag groups or snippets in the shared menu; picking one
 * hands it over. Nothing shows when the brand has none of that kind.
 */
export function InsertMenu({ label, items, onPick }: { label: string; items: Snippet[]; onPick: (item: Snippet) => void }) {
  return (
    <PopMenu label={label} items={items.map(item => ({ id: String(item.id), label: item.name, sub: item.body }))}
      onPick={(id) => { const item = items.find(s => String(s.id) === id); if (item) onPick(item) }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
      <ListPlus size={12} aria-hidden />{label}
    </PopMenu>
  )
}
```

- [ ] **Step 4: The "+" menu and the views**

In `frontend/src/content/plan/addMath.ts`, replace:

```ts
  return !target.closest('button, a, input, select, textarea, label, summary, [data-post], [data-slot]')
```

with:

```ts
  return !target.closest('button, a, input, select, textarea, label, summary, [data-post], [data-slot], [data-menu]')
```

and add at the end:

```ts

/** What a day's "+" offers (spec 2026-10-16 §3.5); a day's empty space always starts a post. */
export type AddChoice = 'post' | 'template' | 'note' | 'event'

/** The "+" menu's choices: a new post, a template where the brand has one, a note and an event. */
export function addChoices(templates: boolean): AddChoice[] {
  return templates ? ['post', 'template', 'note', 'event'] : ['post', 'note', 'event']
}
```

Write `frontend/src/content/plan/AddButton.tsx` with the Write tool (it replaces the file):

```tsx
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey } from '../lib/types'
import { PopMenu } from '../ui/PopMenu'
import { addChoices, type AddChoice } from './addMath'

/** Each choice's English name, the fallback under the bundles' words. */
const CHOICE_TEXT: Record<AddChoice, string> = { post: 'New post', template: 'From a template…', note: 'Note', event: 'Event' }

/**
 * A day's "+" (spec 2026-10-16 §3.5): a small menu — New post · From a template… (when the brand has templates) · Note ·
 * Event — named by its day. Shown on hover where the device hovers, always on touch, and while its menu is open.
 */
export function AddButton({ day, locale, onAdd, templates = false, align = 'left', className = '' }: {
  day: DateKey
  locale: string
  onAdd: (day: DateKey, choice: AddChoice) => void
  templates?: boolean
  align?: 'left' | 'right'
  className?: string
}) {
  const { t } = useTranslation()
  const name = t('content.plan.add_menu', 'Add to {{day}}', { day: formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long' }) })
  return (
    <PopMenu label={name} title={name} data={{ 'data-add': day }} align={align} wrapClassName={className} listClassName="w-48"
      items={addChoices(templates).map(choice => ({ id: choice, label: t(`content.plan.add.${choice}`, CHOICE_TEXT[choice]) }))}
      onPick={(id) => onAdd(day, id as AddChoice)}
      className="inline-flex items-center justify-center rounded-md border border-dashed border-a-border px-2 py-1 text-a-text-2 transition-opacity hover:border-a-accent-text hover:text-a-accent-text focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
      <Plus size={14} aria-hidden />
    </PopMenu>
  )
}
```

In `frontend/src/content/plan/WeekGrid.tsx`: replace `import { canAdd, clickAdds } from './addMath'` with `import { canAdd, clickAdds, type AddChoice } from './addMath'`; add `templates,` after `onAdd,` in the props destructuring; replace

```tsx
  onAdd?: (day: DateKey) => void
  /** Each day's key dates (spec 2026-10-16 §3.4); absent while the layer is hidden. */
```

with

```tsx
  onAdd?: (day: DateKey, choice: AddChoice) => void
  /** The brand has templates: the "+" offers "From a template…". */
  templates?: boolean
  /** Each day's key dates (spec 2026-10-16 §3.4); absent while the layer is hidden. */
```

replace `            onClick={adds ? (e) => { if (clickAdds(e.target as Element)) onAdd(day.date) } : undefined}` with `            onClick={adds ? (e) => { if (clickAdds(e.target as Element)) onAdd(day.date, 'post') } : undefined}`, and replace `            {adds && <AddButton day={day.date} locale={locale} onAdd={onAdd} className="mt-auto self-start" />}` with `            {adds && <AddButton day={day.date} locale={locale} onAdd={onAdd} templates={templates} className="mt-auto self-start" />}`.

In `frontend/src/content/plan/MonthGrid.tsx`: replace `import { canAdd, clickAdds } from './addMath'` with `import { canAdd, clickAdds, type AddChoice } from './addMath'`; add `templates,` after `onAdd,` in the props destructuring; replace

```tsx
  onAdd?: (day: DateKey) => void
  /** Each day's key dates (spec 2026-10-16 §3.4): the month shows the first and how many more. */
```

with

```tsx
  onAdd?: (day: DateKey, choice: AddChoice) => void
  templates?: boolean
  /** Each day's key dates (spec 2026-10-16 §3.4): the month shows the first and how many more. */
```

replace `              onClick={adds ? (e) => { if (clickAdds(e.target as Element)) onAdd(day.date) } : undefined}` with `              onClick={adds ? (e) => { if (clickAdds(e.target as Element)) onAdd(day.date, 'post') } : undefined}`, and replace `              {adds && <AddButton day={day.date} locale={locale} onAdd={onAdd} className="absolute right-1 top-1" />}` with `              {adds && <div className="absolute right-1 top-1"><AddButton day={day.date} locale={locale} onAdd={onAdd} templates={templates} align="right" /></div>}`.

In `frontend/src/content/plan/ListView.tsx`: replace `import { canAdd } from './addMath'` with `import { canAdd, type AddChoice } from './addMath'`; add `templates,` after `onAdd,` in the props destructuring; replace

```tsx
  onAdd?: (day: DateKey) => void
  /** Each day's key dates (spec 2026-10-16 §3.4): a day holding only key dates shows too, a past one included. */
```

with

```tsx
  onAdd?: (day: DateKey, choice: AddChoice) => void
  templates?: boolean
  /** Each day's key dates (spec 2026-10-16 §3.4): a day holding only key dates shows too, a past one included. */
```

and replace `            {onAdd && canAdd(day.date, today) && <AddButton day={day.date} locale={locale} onAdd={onAdd} />}` with `            {onAdd && canAdd(day.date, today) && <AddButton day={day.date} locale={locale} onAdd={onAdd} templates={templates} align="right" />}`.

In `frontend/src/content/plan/PlanPage.tsx`: replace `import { canAdd, newPostDraft, usualTimes } from './addMath'` with `import { canAdd, newPostDraft, usualTimes, type AddChoice } from './addMath'`, and replace:

```tsx
  const addOn = (day: DateKey) => {
    if (drag.consumeClick() || !canAdd(day, today)) return
    const draft = newPostDraft(day, data?.slots ?? [], channels, industry)
```

with:

```tsx
  const addOn = (day: DateKey, choice: AddChoice = 'post') => {
    if (drag.consumeClick() || !canAdd(day, today)) return
    if (choice === 'note' || choice === 'event') {
      setKeyDateEdit({ kind: choice, keyDate: null, day })
      return
    }
    // "From a template…" (offered only when the brand has templates) opens the template picker (spec 2026-10-16 §5.3).
    if (choice === 'template') return
    const draft = newPostDraft(day, data?.slots ?? [], channels, industry)
```

- [ ] **Step 5: The words**

Write `$R4B/t5-words.json` with the Write tool:

```json
{
  "plan.add_menu": { "en": "Add to {{day}}", "ru": "Добавить на {{day}}", "de": "Hinzufügen am {{day}}", "fr": "Ajouter le {{day}}", "es": "Añadir el {{day}}" },
  "plan.add.post": { "en": "New post", "ru": "Новый пост", "de": "Neuer Beitrag", "fr": "Nouvelle publication", "es": "Nueva publicación" },
  "plan.add.template": { "en": "From a template…", "ru": "Из шаблона…", "de": "Aus einer Vorlage…", "fr": "À partir d’un modèle…", "es": "Desde una plantilla…" },
  "plan.add.note": { "en": "Note", "ru": "Заметка", "de": "Notiz", "fr": "Note", "es": "Nota" },
  "plan.add.event": { "en": "Event", "ru": "Событие", "de": "Ereignis", "fr": "Événement", "es": "Evento" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node "$R4B/words.mjs" "$R4B/t5-words.json"
```

In `frontend/src/content/i18n/contentLocales.test.ts`, after the `'keydates.kind'` line Task 3 added, add `  'plan.add': ['post', 'template', 'note', 'event'],`.

- [ ] **Step 6: Run the tests, the content suite and the types**

```bash
"$R4B/vt.sh" src/content && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
```

Expected: every content test passes (Insert's tests on the shared menu included); `TSC-CLEAN`.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/ui frontend/src/content/panel frontend/src/content/plan frontend/src/content/i18n && git commit -q -m "Content portal: one shared menu; a day's + offers a post, a note or an event" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: The Brand page's Key dates section (spec §3.3)

**Files:**
- Create: `frontend/src/content/brand/sections/KeyDates.tsx`, `frontend/src/content/brand/keyDatesSection.test.tsx`
- Modify: `frontend/src/content/brand/BrandPage.tsx`
- Words: `$R4B/t6-words.json`

**Interfaces:**
- Consumes: `HOLIDAY_COUNTRIES`, `holidayCountryOf` (Task 4); `useBrand().saveProfile` (existing; `ProfileFields` carries `holiday_country` / `marketing_days` through `BrandProfile`, Task 2); `INPUT` (`brand/inputs.tsx`).
- Produces: `<KeyDatesSection brand canEdit />`, after Channels on the Brand page. Country names come from `Intl.DisplayNames` in the interface's language (no word list of ours).

- [ ] **Step 1: Write the failing test**

Write `frontend/src/content/brand/keyDatesSection.test.tsx` with the Write tool:

```tsx
import { describe, expect, it, vi } from 'vitest'

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

import { brandWith, profile, renderBrand } from './brandTesting'
import { KeyDatesSection } from './sections/KeyDates'

const withCountry = (holiday_country: string | null, guess: string | null, marketing_days = true) =>
  brandWith({ profile: { ...profile, holiday_country, marketing_days }, holiday_country_guess: guess })

// Spec 2026-10-16 §3.3: managers choose the country (or none) and the marketing switch; staff read them.
describe('KeyDatesSection', () => {
  it('lets a manager choose the country, the automatic guess first, and switch marketing and international days', () => {
    const brand = withCountry(null, 'GB')
    const out = renderBrand(brand, true, <KeyDatesSection brand={brand} canEdit />)
    expect(out).toContain('Key dates')
    expect(out).toContain('Automatic: United Kingdom')
    expect(out).toContain('>United States</option>')
    expect(out).toContain('>No public holidays</option>')
    expect(out).toContain('United Kingdom (guessed from the venue’s time zone)')
    expect(out).toMatch(/<button[^>]*role="switch"[^>]*aria-checked="true"/)
  })

  it('shows staff the country and the switch in words, with nothing to change', () => {
    const brand = withCountry('IE', 'GB', false)
    const out = renderBrand(brand, false, <KeyDatesSection brand={brand} canEdit={false} />)
    expect(out).toContain('Ireland')
    expect(out).toContain('Off')
    expect(out).not.toContain('<select')
    expect(out).not.toContain('role="switch"')
  })

  it('says when there are no public holidays: chosen none, or nothing to guess from', () => {
    expect(renderBrand(withCountry('none', 'GB'), false, <KeyDatesSection brand={withCountry('none', 'GB')} canEdit={false} />)).toContain('No public holidays are shown.')
    expect(renderBrand(withCountry(null, null), false, <KeyDatesSection brand={withCountry(null, null)} canEdit={false} />)).toContain('No public holidays until a country is chosen.')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R4B/vt.sh" src/content/brand/keyDatesSection.test.tsx
```

Expected: FAIL — `Failed to resolve import "./sections/KeyDates"`.

- [ ] **Step 3: The section**

Write `frontend/src/content/brand/sections/KeyDates.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../../workspace/ui/Notice'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BrandPayload, ProfileFields } from '../../lib/types'
import { HOLIDAY_COUNTRIES, holidayCountryOf } from '../../plan/keyDateMath'
import { INPUT } from '../inputs'
import { useBrand } from '../useBrand'

/** A country's name in the interface's language, from the browser (Intl), never a word list of ours. */
function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Key dates (spec 2026-10-16 §3.3): whose public holidays the Plan shows — chosen, "none", or guessed from the venue —
 * and whether marketing and international days show. Managers change them; everyone reads them.
 */
export function KeyDatesSection({ brand, canEdit }: { brand: BrandPayload; canEdit: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const { saveProfile } = useBrand()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.brand.keydates.${key}`, english, vars)
  const chosen = brand.profile?.holiday_country ?? null
  const guess = brand.holiday_country_guess ?? null
  const marketing = brand.profile?.marketing_days ?? true
  const country = holidayCountryOf(brand)
  const line = chosen === 'none' ? w('none_line', 'No public holidays are shown.')
    : country === null ? w('no_guess', 'No public holidays until a country is chosen.')
    : chosen === null ? w('guessed', '{{country}} (guessed from the venue’s time zone)', { country: countryName(country, locale) })
    : countryName(country, locale)

  const save = async (fields: ProfileFields) => {
    setBusy(true)
    setError(null)
    try {
      await saveProfile(fields)
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="content-keydates" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="space-y-0.5">
        <h2 id="content-keydates" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Key dates')}</h2>
        <p className="text-sm text-a-text-2">{w('intro', 'The holidays and special days the Plan shows. The team adds its own events and notes on the Plan itself.')}</p>
      </div>
      {canEdit ? (
        <div className="space-y-3">
          <label className="block max-w-sm">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{w('country', 'Public holidays of')}</span>
            <select value={chosen ?? ''} disabled={busy} onChange={(e) => { void save({ holiday_country: e.target.value === '' ? null : e.target.value }) }} className={`${INPUT} border-a-border`}>
              <option value="">{guess ? w('auto', 'Automatic: {{country}}', { country: countryName(guess, locale) }) : w('auto_none', 'Automatic: none found')}</option>
              {HOLIDAY_COUNTRIES.map(code => <option key={code} value={code}>{countryName(code, locale)}</option>)}
              <option value="none">{w('none', 'No public holidays')}</option>
            </select>
          </label>
          <p className="text-xs text-a-text-2">{line}</p>
          <div className="flex items-center gap-3">
            <button type="button" role="switch" aria-checked={marketing} disabled={busy} aria-labelledby="content-keydates-marketing"
              onClick={() => { void save({ marketing_days: !marketing }) }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${marketing ? 'bg-a-accent' : 'bg-a-surface-2'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${marketing ? 'left-[1.375rem]' : 'left-0.5'}`} />
            </button>
            <span id="content-keydates-marketing" className="text-sm text-a-text">{w('marketing', 'Marketing and international days')}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 text-sm">
          <p><span className="text-a-text-2">{w('country', 'Public holidays of')}: </span><span className="text-a-text">{line}</span></p>
          <p>
            <span className="text-a-text-2">{w('marketing', 'Marketing and international days')}: </span>
            <span className="text-a-text">{marketing ? t('content.brand.channels.on', 'On') : t('content.brand.channels.off', 'Off')}</span>
          </p>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
```

In `frontend/src/content/brand/BrandPage.tsx`, add `import { KeyDatesSection } from './sections/KeyDates'` beside the other section imports, and replace:

```tsx
              <ChannelsSection brand={brand} canEdit={canEdit} />
              <SnippetsSection brand={brand} canEdit={canEdit} />
```

with:

```tsx
              <ChannelsSection brand={brand} canEdit={canEdit} />
              <KeyDatesSection brand={brand} canEdit={canEdit} />
              <SnippetsSection brand={brand} canEdit={canEdit} />
```

- [ ] **Step 4: The words**

Write `$R4B/t6-words.json` with the Write tool:

```json
{
  "brand.keydates.title": { "en": "Key dates", "ru": "Ключевые даты", "de": "Wichtige Termine", "fr": "Dates clés", "es": "Fechas clave" },
  "brand.keydates.intro": { "en": "The holidays and special days the Plan shows. The team adds its own events and notes on the Plan itself.", "ru": "Праздники и особые дни, которые показывает план. Свои события и заметки команда добавляет прямо в плане.", "de": "Die Feiertage und besonderen Tage, die der Plan zeigt. Eigene Ereignisse und Notizen fügt das Team direkt im Plan hinzu.", "fr": "Les jours fériés et les journées particulières que le plan affiche. L’équipe ajoute ses propres événements et notes directement dans le plan.", "es": "Los festivos y los días especiales que muestra el plan. El equipo añade sus propios eventos y notas directamente en el plan." },
  "brand.keydates.country": { "en": "Public holidays of", "ru": "Государственные праздники страны", "de": "Feiertage von", "fr": "Jours fériés de", "es": "Festivos de" },
  "brand.keydates.auto": { "en": "Automatic: {{country}}", "ru": "Автоматически: {{country}}", "de": "Automatisch: {{country}}", "fr": "Automatique : {{country}}", "es": "Automático: {{country}}" },
  "brand.keydates.auto_none": { "en": "Automatic: none found", "ru": "Автоматически: не определено", "de": "Automatisch: nicht gefunden", "fr": "Automatique : aucun trouvé", "es": "Automático: no encontrado" },
  "brand.keydates.none": { "en": "No public holidays", "ru": "Без государственных праздников", "de": "Keine Feiertage", "fr": "Pas de jours fériés", "es": "Sin festivos" },
  "brand.keydates.none_line": { "en": "No public holidays are shown.", "ru": "Государственные праздники не показываются.", "de": "Es werden keine Feiertage gezeigt.", "fr": "Aucun jour férié n’est affiché.", "es": "No se muestran festivos." },
  "brand.keydates.no_guess": { "en": "No public holidays until a country is chosen.", "ru": "Праздников не будет, пока не выбрана страна.", "de": "Keine Feiertage, bis ein Land gewählt ist.", "fr": "Pas de jours fériés tant qu’aucun pays n’est choisi.", "es": "Sin festivos hasta que se elija un país." },
  "brand.keydates.guessed": { "en": "{{country}} (guessed from the venue’s time zone)", "ru": "{{country}} (определено по часовому поясу заведения)", "de": "{{country}} (aus der Zeitzone des Standorts abgeleitet)", "fr": "{{country}} (déduit du fuseau horaire de l’établissement)", "es": "{{country}} (deducido de la zona horaria del local)" },
  "brand.keydates.marketing": { "en": "Marketing and international days", "ru": "Маркетинговые и международные дни", "de": "Aktions- und internationale Tage", "fr": "Journées marketing et internationales", "es": "Días comerciales e internacionales" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node "$R4B/words.mjs" "$R4B/t6-words.json"
```

- [ ] **Step 5: Run the test, the Brand folder and the types**

```bash
"$R4B/vt.sh" src/content/brand/ src/content/i18n/ && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
```

Expected: every file passes (`keyDatesSection.test.tsx` 3 tests); `TSC-CLEAN`. If `Intl.DisplayNames` names the United Kingdom differently in this Node (for example "UK"), ledger a ruling and assert the name the runtime gives.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/brand frontend/src/content/i18n && git commit -q -m "Content portal: the Brand page's Key dates section (country, guess, marketing switch)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 7: The Ideas page (spec §4.1, §4.2)

**Files:**
- Create: `frontend/src/content/ideas/ideasMath.ts`, `frontend/src/content/ideas/ideasMath.test.ts`, `frontend/src/content/ideas/IdeaCard.tsx`, `frontend/src/content/ideas/IdeaColumn.tsx`, `frontend/src/content/ideas/ScheduleDialog.tsx`, `frontend/src/content/ideas/IdeasPage.tsx`, `frontend/src/content/ideas/ideas.test.tsx`
- Modify: `frontend/src/content/ContentApp.tsx`, `frontend/src/content/ContentShell.tsx`, `frontend/src/content/i18n/contentLocales.test.ts` (`FAMILIES`, `COUNTED`)
- Words: `$R4B/t7-words.json`

**Interfaces:**
- Consumes: `IdeasColumn`, `IdeasPayload`, `api.ideas` (Task 2); `ERRORS.idea` with `changed_elsewhere` and `not_found` (Task 2); `PopMenu` (Task 5); `refreshLists` (marks the ideas read, Task 2); `canAdd`, `usualTimes` (`plan/addMath.ts`); `suggestedTimes` (`lib/bestTimes.ts`); `NO_FILTERS`, `writeFilters` (`posts/postsFilters.ts`); `useActiveStrategy`; `Dialog`; `PlatformMark`, `StatusPill`, `PageHeader`.
- Produces:
  - `ideasMath.ts`: `COLUMNS`, `COLUMN_TEXT`, `COLUMN_STATUSES`, `DROP_STATUS`, `IDEAS_HINT_ID`, `EMPTY_IDEAS`, `columnOf(status)`, `moveStatus(post, to): PostStatus | null`, `stepColumn(from, step): IdeasColumn | null`, `seeAllLink(column, { platform, pillarId }): string`, `ideaLine(post)`, `ageOf(updatedAt, now)`, `ageText(updatedAt, now, locale): string`, `scheduleDefaults(platform, channels, industry, today): { date; time }`.
  - `<IdeaCard post column locale now pillar draggable onOpen onMove onSchedule onDragStart onDragEnd />`, `<IdeaColumn column posts total seeAll locale now pillarName draggable dropping onOpen onMove onSchedule onDragStart onDragEnd onDrop>{children}</IdeaColumn>` (children go above the cards: Task 8 puts the capture line there), `<ScheduleDialog post today channels industry onClose onScheduled />`, `<IdeasPage />` at `/content/ideas`, in the menu between Plan and Posts.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/ideas/ideasMath.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import type { Channel, PostStatus } from '../lib/types'
import { ageOf, ageText, columnOf, ideaLine, moveStatus, scheduleDefaults, seeAllLink, stepColumn } from './ideasMath'

describe('the board’s stages (spec 2026-10-16 §4.1)', () => {
  it('puts each status in its stage, and published, skipped or archived posts in none', () => {
    const statuses: PostStatus[] = ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish']
    expect(statuses.map(columnOf)).toEqual(['idea', 'draft', 'review', 'review', 'ready', 'ready'])
    expect([columnOf('published'), columnOf('skipped'), columnOf('archived')]).toEqual([null, null, null])
  })

  // Review Focus 5: a card dropped where it already is sends nothing.
  it('sends the stage’s status on a move, and nothing for a move to the stage the card is in', () => {
    expect(moveStatus({ status: 'idea' }, 'review')).toBe('needs_review')
    expect(moveStatus({ status: 'draft' }, 'ready')).toBe('ready_to_publish')
    expect(moveStatus({ status: 'needs_visual' }, 'review')).toBeNull()
    expect(moveStatus({ status: 'approved' }, 'ready')).toBeNull()
  })

  it('steps one stage left or right (Shift + ← / →), and no further than either end', () => {
    expect([stepColumn('idea', 1), stepColumn('ready', -1)]).toEqual(['draft', 'review'])
    expect([stepColumn('idea', -1), stepColumn('ready', 1)]).toEqual([null, null])
  })

  it('sees all of a stage on the Posts page: no day, its status where it has one, and the board’s filters', () => {
    expect(seeAllLink('idea', { platform: 'instagram', pillarId: 4 })).toBe('/content/posts?status=idea&platform=instagram&pillar=4&unscheduled=1')
    expect(seeAllLink('review', { platform: null, pillarId: null })).toBe('/content/posts?unscheduled=1')
  })
})

describe('a card (spec §4.2)', () => {
  it('shows the topic, else the hook, else the title', () => {
    expect(ideaLine({ topic: ' Autumn ', hook: 'Hook', title: null })).toBe('Autumn')
    expect(ideaLine({ topic: '', hook: 'Hook', title: 'Title' })).toBe('Hook')
    expect(ideaLine({ topic: null, hook: null, title: null })).toBe('')
  })

  it('says how long ago it changed, in the largest whole unit and in the interface’s language', () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    expect(ageOf('2026-10-16T11:58:30Z', now)).toEqual({ value: 1, unit: 'minute' })
    expect(ageOf('2026-10-16T09:00:00.000000Z', now)).toEqual({ value: 3, unit: 'hour' })
    expect(ageOf('2026-10-13T12:00:00Z', now)).toEqual({ value: 3, unit: 'day' })
    expect(ageOf('2026-09-16T12:00:00Z', now)).toEqual({ value: 4, unit: 'week' })
    expect(ageOf('not a date', now)).toBeNull()
    expect(ageOf('2026-10-16T09:00:00Z', 0)).toBeNull()
    expect(ageText('2026-10-16T09:00:00.000000Z', now, 'en-GB')).toBe('3 hours ago')
    expect(ageText('2026-10-16T09:00:00Z', 0, 'en-GB')).toBe('')
  })

  it('schedules from today at the channel’s usual time, else the first suggested time', () => {
    const channel = { platform: 'linkedin', active: true, post_time: '08:15' } as unknown as Channel
    expect(scheduleDefaults('linkedin', [channel], 'beauty', '2026-10-16')).toEqual({ date: '2026-10-16', time: '08:15' })
    expect(scheduleDefaults('instagram', [channel], 'beauty', '2026-10-16').time).toMatch(/^\d{2}:\d{2}$/)
  })
})
```

Write `frontend/src/content/ideas/ideas.test.tsx` with the Write tool:

```tsx
import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
import { bootFor } from '../brand/brandTesting'
import type { IdeasPayload, PostCard } from '../lib/types'
import { PanelProvider } from '../panel/PanelProvider'
import { IdeaColumn } from './IdeaColumn'
import { IdeasPage } from './IdeasPage'

const noop = () => {}
const card = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: null, scheduled_time: null, status: 'idea', title: null, hook: null,
  topic: `Idea ${id}`, pillar_id: null, image_url: null, updated_at: '2026-10-16T09:00:00.000000Z', ...more,
})
const handlers = { onOpen: noop, onMove: noop, onSchedule: noop, onDragStart: noop, onDragEnd: noop, onDrop: noop }
const now = Date.parse('2026-10-16T12:00:00Z')

describe('IdeaColumn (spec 2026-10-16 §4.1, §4.2)', () => {
  it('draws a stage with its total, each card with its words, pillar, age, status, Schedule and Move to…, and See all past 50', () => {
    const out = renderToStaticMarkup(
      <MemoryRouter>
        <IdeaColumn column="review" posts={[card(1, { status: 'needs_visual', pillar_id: 4 })]} total={63} seeAll="/content/posts?unscheduled=1"
          locale="en-GB" now={now} pillarName={(id) => (id === 4 ? 'Education' : null)} draggable dropping={false} {...handlers} />
      </MemoryRouter>,
    )
    expect(out).toContain('aria-label="In review"')
    expect(out).toContain('>63<')
    expect(out).toContain('data-post="1"')
    expect(out).toContain('Idea 1')
    expect(out).toContain('Education · 3 hours ago')
    expect(out).toContain('data-status="needs_visual"')
    expect(out).toContain('Schedule')
    expect(out).toMatch(/<button[^>]*aria-haspopup="true"[^>]*>Move to…<\/button>/)
    expect(out).toContain('draggable="true"')
    expect(out).toContain('href="/content/posts?unscheduled=1"')
    expect(out).toContain('See all: 63')
  })

  it('says when a stage is empty, and drags nothing where dragging is off (a phone)', () => {
    const out = renderToStaticMarkup(
      <MemoryRouter>
        <IdeaColumn column="idea" posts={[]} total={0} seeAll="/x" locale="en-GB" now={now} pillarName={() => null} draggable={false} dropping={false} {...handlers} />
      </MemoryRouter>,
    )
    expect(out).toContain('Nothing here yet.')
    expect(out).not.toContain('See all')
    const phone = renderToStaticMarkup(
      <MemoryRouter>
        <IdeaColumn column="idea" posts={[card(2)]} total={1} seeAll="/x" locale="en-GB" now={now} pillarName={() => null} draggable={false} dropping={false} {...handlers} />
      </MemoryRouter>,
    )
    expect(phone).not.toContain('draggable="true"')
  })
})

const board: IdeasPayload = {
  columns: {
    idea: { posts: [card(1), card(2)], total: 2 },
    draft: { posts: [card(3, { status: 'draft', topic: 'A draft' })], total: 1 },
    review: { posts: [], total: 0 },
    ready: { posts: [], total: 0 },
  },
}

function page() {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'ideas', null, null], board)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/content/ideas']}>
        <ContentContext.Provider value={{ data: bootFor(false), isLoading: false, isError: false, error: null, refetch: noop, switchBrand: noop }}>
          <PanelProvider><IdeasPage /></PanelProvider>
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('IdeasPage', () => {
  // The test has no screen width: the page draws its phone view, one stage at a time.
  it('shows one stage at a time on a phone, with a switch that names each stage and its total', () => {
    const out = page()
    expect(out).toContain('>Ideas<')
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Idea <span[^>]*>2<\/span><\/button>/)
    expect(out).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Draft <span[^>]*>1<\/span><\/button>/)
    expect(out).toContain('Idea 1')
    expect(out).not.toContain('A draft')
    expect(out).toContain('id="content-ideas-hint"')
    expect(out).toContain('All platforms')
  })

  it('is a page of its own between Plan and Posts', () => {
    const app = fs.readFileSync(new URL('../ContentApp.tsx', import.meta.url), 'utf8')
    expect(app).toContain('<Route path="ideas" element={<IdeasPage />} />')
    const shell = fs.readFileSync(new URL('../ContentShell.tsx', import.meta.url), 'utf8')
    expect(shell).toMatch(/to: '\/content', end: true[^\n]*\n\s*\{ to: '\/content\/ideas', end: false, icon: Lightbulb, label: t\('content\.nav\.ideas', 'Ideas'\) \},\n\s*\{ to: '\/content\/posts'/)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4B/vt.sh" src/content/ideas/
```

Expected: both files fail — `Failed to resolve import "./ideasMath"` and `"./IdeaColumn"`.

- [ ] **Step 3: `ideasMath.ts`**

Write `frontend/src/content/ideas/ideasMath.ts` with the Write tool:

```ts
import { suggestedTimes } from '../lib/bestTimes'
import type { Channel, DateKey, IdeasColumn, IdeasPayload, Platform, PostCard, PostStatus } from '../lib/types'
import { usualTimes } from '../plan/addMath'
import { NO_FILTERS, writeFilters } from '../posts/postsFilters'

/** The board's four stages (spec 2026-10-16 §4.1), left to right. */
export const COLUMNS: readonly IdeasColumn[] = ['idea', 'draft', 'review', 'ready']

/** Each stage's English name, the fallback under the bundles' `content.ideas.column.*`. */
export const COLUMN_TEXT: Record<IdeasColumn, string> = { idea: 'Idea', draft: 'Draft', review: 'In review', ready: 'Ready' }

/** The statuses each stage holds (the server's ContentIdeas::COLUMNS). */
export const COLUMN_STATUSES: Record<IdeasColumn, readonly PostStatus[]> = {
  idea: ['idea'], draft: ['draft'], review: ['needs_review', 'needs_visual'], ready: ['approved', 'ready_to_publish'],
}

/** What a card dropped on a stage becomes. */
export const DROP_STATUS: Record<IdeasColumn, PostStatus> = { idea: 'idea', draft: 'draft', review: 'needs_review', ready: 'ready_to_publish' }

/** The sentence that tells a screen reader how a focused card moves (each card points at it). */
export const IDEAS_HINT_ID = 'content-ideas-hint'

/** The board before its first read. */
export const EMPTY_IDEAS: IdeasPayload = {
  columns: { idea: { posts: [], total: 0 }, draft: { posts: [], total: 0 }, review: { posts: [], total: 0 }, ready: { posts: [], total: 0 } },
}

export const columnOf = (status: PostStatus): IdeasColumn | null => COLUMNS.find(c => COLUMN_STATUSES[c].includes(status)) ?? null

/** The status a move sends, or null when the card is already in that stage (then nothing is sent). */
export function moveStatus(post: Pick<PostCard, 'status'>, to: IdeasColumn): PostStatus | null {
  return columnOf(post.status) === to ? null : DROP_STATUS[to]
}

/** The stage beside this one (Shift + ← / →), or null past either end. */
export function stepColumn(from: IdeasColumn, step: -1 | 1): IdeasColumn | null {
  return COLUMNS[COLUMNS.indexOf(from) + step] ?? null
}

/** "See all": the Posts page with no day, the stage's status where it holds only one, and the board's filters. */
export function seeAllLink(column: IdeasColumn, filters: { platform: Platform | null; pillarId: number | null }): string {
  const statuses = COLUMN_STATUSES[column]
  const params = writeFilters({
    ...NO_FILTERS, unscheduled: true, status: statuses.length === 1 ? statuses[0] : '', platform: filters.platform ?? '', pillar_id: filters.pillarId,
  })
  return `/content/posts?${params.toString()}`
}

/** A card's words (spec §4.2): the topic, else the hook, else the title. */
export const ideaLine = (post: Pick<PostCard, 'topic' | 'hook' | 'title'>): string =>
  [post.topic, post.hook, post.title].map(v => (v ?? '').trim()).find(v => v !== '') ?? ''

type AgeUnit = 'minute' | 'hour' | 'day' | 'week'

/** How long ago a card changed, in the largest whole unit; null when unknown (no read yet, or no date). */
export function ageOf(updatedAt: string, now: number): { value: number; unit: AgeUnit } | null {
  const then = Date.parse(updatedAt)
  if (Number.isNaN(then) || now <= 0) return null
  const minutes = Math.max(0, Math.floor((now - then) / 60_000))
  if (minutes < 60) return { value: minutes, unit: 'minute' }
  if (minutes < 1_440) return { value: Math.floor(minutes / 60), unit: 'hour' }
  if (minutes < 10_080) return { value: Math.floor(minutes / 1_440), unit: 'day' }
  return { value: Math.floor(minutes / 10_080), unit: 'week' }
}

/** The age in the interface's language ("3 hours ago"): the browser's Intl says it, plural forms included. */
export function ageText(updatedAt: string, now: number, locale: string): string {
  const age = ageOf(updatedAt, now)
  return age ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-age.value, age.unit) : ''
}

/** Schedule's first answer (spec §4.2): today, at the channel's usual time (release 3), else the first suggested time. */
export function scheduleDefaults(platform: Platform, channels: readonly Channel[], industry: string | null | undefined, today: DateKey): { date: DateKey; time: string } {
  return { date: today, time: usualTimes(channels, industry)[platform] ?? suggestedTimes(platform, industry)[0] ?? '' }
}
```

- [ ] **Step 4: The card, the stage and the Schedule dialog**

Write `frontend/src/content/ideas/IdeaCard.tsx` with the Write tool:

```tsx
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus } from 'lucide-react'
import type { IdeasColumn, PostCard } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { PopMenu } from '../ui/PopMenu'
import { StatusPill } from '../ui/StatusDot'
import { ageText, COLUMN_TEXT, COLUMNS, IDEAS_HINT_ID, ideaLine, stepColumn } from './ideasMath'

/**
 * One post without a day (spec 2026-10-16 §4.2): its platform, words, pillar and age; a click opens it in the panel.
 * It moves by drag (where the board drags), by Shift + ← / → when focused, or by "Move to…"; Schedule gives it a day.
 */
export function IdeaCard({ post, column, locale, now, pillar, draggable, onOpen, onMove, onSchedule, onDragStart, onDragEnd }: {
  post: PostCard
  column: IdeasColumn
  locale: string
  /** When the board was read: the card's age counts from it. */
  now: number
  pillar: string | null
  draggable: boolean
  onOpen: (id: number) => void
  onMove: (post: PostCard, to: IdeasColumn) => void
  onSchedule: (post: PostCard) => void
  onDragStart: (post: PostCard) => void
  onDragEnd: () => void
}) {
  const { t } = useTranslation()
  const line = ideaLine(post) || t('content.plan.untitled', 'Untitled post')
  const sub = [pillar, ageText(post.updated_at, now, locale)].filter(Boolean).join(' · ')
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const to = stepColumn(column, e.key === 'ArrowLeft' ? -1 : 1)
    if (to) onMove(post, to)
  }
  const moveLabel = t('content.ideas.move_to', 'Move to…')
  return (
    <li draggable={draggable || undefined}
      onDragStart={draggable ? (e) => { e.dataTransfer.setData('text/plain', String(post.id)); e.dataTransfer.effectAllowed = 'move'; onDragStart(post) } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className="rounded-lg border border-a-border bg-a-surface p-2.5 shadow-a-sm">
      <button type="button" data-post={post.id} data-stop="" aria-describedby={IDEAS_HINT_ID} onClick={() => onOpen(post.id)} onKeyDown={onKeyDown}
        className="flex w-full items-start gap-2 rounded-md text-left">
        <PlatformMark platform={post.platform} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-3 block break-words text-sm font-medium text-a-text">{line}</span>
          {sub && <span className="block truncate text-xs text-a-text-2">{sub}</span>}
        </span>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(column === 'review' || column === 'ready') && <StatusPill status={post.status} />}
        <button type="button" onClick={() => onSchedule(post)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
          <CalendarPlus size={12} aria-hidden />{t('content.ideas.schedule', 'Schedule')}
        </button>
        <PopMenu label={moveLabel} align="right" listClassName="w-40"
          items={COLUMNS.filter(c => c !== column).map(c => ({ id: c, label: t(`content.ideas.column.${c}`, COLUMN_TEXT[c]) }))}
          onPick={(id) => onMove(post, id as IdeasColumn)}
          className="rounded-md px-1.5 py-0.5 text-xs font-medium text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
          {moveLabel}
        </PopMenu>
      </div>
    </li>
  )
}
```

Write `frontend/src/content/ideas/IdeaColumn.tsx` with the Write tool:

```tsx
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { IdeasColumn, PostCard } from '../lib/types'
import { IdeaCard } from './IdeaCard'
import { COLUMN_TEXT } from './ideasMath'

/**
 * One stage of the board (spec 2026-10-16 §4.1): its name and total, its 50 most recently changed cards, and "See all"
 * past them. While a card from another stage is dragged, it takes the drop.
 */
export function IdeaColumn({ column, posts, total, seeAll, locale, now, pillarName, draggable, dropping, onOpen, onMove, onSchedule, onDragStart, onDragEnd, onDrop, children }: {
  column: IdeasColumn
  posts: PostCard[]
  total: number
  seeAll: string
  locale: string
  now: number
  pillarName: (id: number | null) => string | null
  draggable: boolean
  /** A card from another stage is being dragged: this stage takes the drop. */
  dropping: boolean
  onOpen: (id: number) => void
  onMove: (post: PostCard, to: IdeasColumn) => void
  onSchedule: (post: PostCard) => void
  onDragStart: (post: PostCard) => void
  onDragEnd: () => void
  onDrop: () => void
  /** Above the cards (the Idea stage's capture line). */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const name = t(`content.ideas.column.${column}`, COLUMN_TEXT[column])
  return (
    <section aria-label={name} data-column={column}
      onDragOver={dropping ? (e) => e.preventDefault() : undefined}
      onDrop={dropping ? (e) => { e.preventDefault(); onDrop() } : undefined}
      className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-a-surface-2 p-3 ${dropping ? 'border-dashed border-a-accent-text' : 'border-a-border'}`}>
      <h2 className="flex items-center justify-between gap-2 text-sm font-semibold text-a-text">
        <span className="truncate">{name}</span>
        <span className="text-xs font-medium tabular-nums text-a-text-2">{total}</span>
      </h2>
      {children}
      {posts.length === 0
        ? <p className="text-xs text-a-text-2">{t('content.ideas.empty', 'Nothing here yet.')}</p>
        : (
          <ul className="space-y-2">
            {posts.map(post => (
              <IdeaCard key={post.id} post={post} column={column} locale={locale} now={now} pillar={pillarName(post.pillar_id)} draggable={draggable}
                onOpen={onOpen} onMove={onMove} onSchedule={onSchedule} onDragStart={onDragStart} onDragEnd={onDragEnd} />
            ))}
          </ul>
        )}
      {total > posts.length && (
        <Link to={seeAll} className="text-xs font-medium text-a-accent-text hover:underline">{t('content.ideas.see_all', 'See all: {{count}}', { count: total })}</Link>
      )}
    </section>
  )
}
```

Write `frontend/src/content/ideas/ScheduleDialog.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isDateKey } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { INPUT } from '../brand/inputs'
import { useApi } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { Channel, DateKey, PostCard } from '../lib/types'
import { canAdd } from '../plan/addMath'
import { Dialog } from '../ui/Dialog'
import { scheduleDefaults } from './ideasMath'

/** Schedule (spec 2026-10-16 §4.2): a day from today on and the channel's usual time; the post goes to the Plan. */
export function ScheduleDialog({ post, today, channels, industry, onClose, onScheduled }: {
  post: PostCard
  today: DateKey
  channels: Channel[]
  industry: string | null
  onClose: () => void
  /** The post as the server moved it. */
  onScheduled: (post: PostCard) => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const [form, setForm] = useState(() => scheduleDefaults(post.platform, channels, industry, today))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = isDateKey(form.date) && canAdd(form.date, today)

  const save = async () => {
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const { post: moved } = await api.movePost(post.id, { updated_at: post.updated_at, scheduled_date: form.date, scheduled_time: form.time === '' ? null : form.time })
      onScheduled(moved)
    } catch (e) {
      const [key, text] = errorKey('move', failureOf(e).code)
      setError(t(key, text))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('content.ideas.schedule_title', 'Schedule this post')} onClose={onClose} busy={busy}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.ideas.day', 'Day')}</span>
            <input type="date" value={form.date} min={today} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${INPUT} border-a-border`} />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.ideas.time', 'Time')}</span>
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`${INPUT} border-a-border`} />
          </label>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex gap-2">
          <Button onClick={() => { void save() }} loading={busy} disabled={!ok}>{t('content.ideas.schedule_yes', 'Schedule')}</Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>{t('content.common.cancel', 'Cancel')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 5: The page, its route and its place in the menu**

Write `frontend/src/content/ideas/IdeasPage.tsx` with the Write tool:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useMedia } from '../../workspace/lib/useMedia'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { IdeasColumn, Platform, PostCard } from '../lib/types'
import { useActiveStrategy } from '../lib/useActiveStrategy'
import { usePanel } from '../panel/PanelProvider'
import { PageHeader } from '../ui/PageHeader'
import { IdeaColumn } from './IdeaColumn'
import { COLUMN_TEXT, COLUMNS, columnOf, EMPTY_IDEAS, IDEAS_HINT_ID, moveStatus, seeAllLink } from './ideasMath'
import { ScheduleDialog } from './ScheduleDialog'

const INPUT = 'rounded-lg border border-a-border bg-a-surface px-2.5 py-1.5 text-sm text-a-text'

/**
 * Ideas (spec 2026-10-16 §4): every post without a day, by stage — four columns from 1024 px, one stage at a time with
 * a switch below. A card opens in the panel; it moves by drag, Shift + ← / → or "Move to…"; Schedule puts it on the
 * Plan with an Undo line. Filters: platform and pillar.
 */
export function IdeasPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const panel = usePanel()
  const wide = useMedia('(min-width: 1024px)')
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [pillarId, setPillarId] = useState<number | null>(null)
  const [stage, setStage] = useState<IdeasColumn>('idea')
  const [dragging, setDragging] = useState<PostCard | null>(null)
  const [scheduling, setScheduling] = useState<PostCard | null>(null)
  const [undo, setUndo] = useState<PostCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A moved card is focused again in its new stage once the board is read again (its old place is gone).
  const refocus = useRef<number | null>(null)

  const query = useQuery({ queryKey: ['content', brand, 'ideas', platform, pillarId], queryFn: () => api.ideas({ platform, pillar_id: pillarId }) })
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const board = query.data ?? EMPTY_IDEAS
  const { strategy, known } = useActiveStrategy()
  const pillars = strategy?.pillars ?? []
  const pillarName = (id: number | null): string | null =>
    id === null || !known ? null : (pillars.find(p => p.id === id)?.name ?? t('content.posts.other_pillar', 'Another pillar'))

  useEffect(() => {
    const id = refocus.current
    if (id === null) return
    refocus.current = null
    document.querySelector<HTMLElement>(`[data-ideas] [data-post="${id}"]`)?.focus()
  }, [query.data])

  const fail = (family: 'idea' | 'move', e: unknown) => {
    const [key, text] = errorKey(family, failureOf(e).code)
    setError(t(key, text))
  }

  const move = async (post: PostCard, to: IdeasColumn) => {
    const status = moveStatus(post, to)
    if (status === null) return
    setError(null)
    try {
      const { post: saved } = await api.savePost(post.id, { status, updated_at: post.updated_at })
      queryClient.setQueryData(['content', brand, 'post', saved.id], saved)
      refocus.current = saved.id
    } catch (e) {
      fail('idea', e)
    }
    await refreshLists(queryClient, brand)
  }
  const drop = (to: IdeasColumn) => {
    const post = dragging
    setDragging(null)
    if (post) void move(post, to)
  }
  const scheduled = (post: PostCard) => {
    setScheduling(null)
    setUndo(post)
    void refreshLists(queryClient, brand)
  }
  const unschedule = async () => {
    const post = undo
    if (!post) return
    setUndo(null)
    try {
      await api.movePost(post.id, { updated_at: post.updated_at, scheduled_date: null })
    } catch (e) {
      fail('move', e)
    }
    await refreshLists(queryClient, brand)
  }

  const shown = wide ? COLUMNS : [stage]
  return (
    <div className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.ideas.title', 'Ideas')} />
      <p className="text-sm text-a-text-2">{t('content.ideas.intro', 'Posts without a day, by stage. Move a card to another stage, or schedule it onto the Plan.')}</p>
      <p id={IDEAS_HINT_ID} className="sr-only">{t('content.ideas.move_hint', 'Shift + ← or → moves the card to the stage beside it.')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('content.posts.platform', 'Platform')} value={platform ?? ''} className={INPUT}
          onChange={(e) => setPlatform(e.target.value === '' ? null : (e.target.value as Platform))}>
          <option value="">{t('content.posts.all_platforms', 'All platforms')}</option>
          {boot.platforms.map(p => <option key={p} value={p}>{t(`content.platform.${p}`, p)}</option>)}
        </select>
        {pillars.length > 0 && (
          <select aria-label={t('content.posts.pillar', 'Pillar')} value={pillarId ?? ''} className={INPUT}
            onChange={(e) => setPillarId(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">{t('content.posts.all_pillars', 'All pillars')}</option>
            {pillars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {!wide && (
        <div role="group" aria-label={t('content.ideas.stage', 'Stage')} className="grid grid-cols-2 gap-1 rounded-lg border border-a-border p-0.5 sm:grid-cols-4">
          {COLUMNS.map(c => (
            <button key={c} type="button" aria-pressed={stage === c} onClick={() => setStage(c)}
              className={`rounded-md px-2 py-1 text-xs font-medium ${stage === c ? 'bg-a-surface-2 text-a-text' : 'text-a-text-2 hover:text-a-text'}`}>
              {t(`content.ideas.column.${c}`, COLUMN_TEXT[c])} <span className="tabular-nums">{board.columns[c].total}</span>
            </button>
          ))}
        </div>
      )}

      {undo && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-a-border bg-a-surface-2 px-3 py-2 text-sm text-a-text">
          <span>{t('content.ideas.scheduled', 'Scheduled for {{day}}.', { day: undo.scheduled_date ? formatDate(undo.scheduled_date, locale, { weekday: 'long', day: 'numeric', month: 'long' }) : '' })}</span>
          <Button size="sm" variant="secondary" onClick={() => { void unschedule() }}>{t('content.ideas.undo', 'Undo')}</Button>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {query.isError && (
        <div className="space-y-2">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {query.isLoading && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}

      <div data-ideas="" className={wide ? 'grid grid-cols-4 items-start gap-4' : ''}>
        {shown.map(column => (
          <IdeaColumn key={column} column={column} posts={board.columns[column].posts} total={board.columns[column].total}
            seeAll={seeAllLink(column, { platform, pillarId })} locale={locale} now={query.dataUpdatedAt} pillarName={pillarName}
            draggable={wide} dropping={dragging !== null && columnOf(dragging.status) !== column}
            onOpen={(id) => { panel.open(id) }} onMove={(post, to) => { void move(post, to) }} onSchedule={setScheduling}
            onDragStart={setDragging} onDragEnd={() => setDragging(null)} onDrop={() => drop(column)} />
        ))}
      </div>

      {scheduling && (
        <ScheduleDialog post={scheduling} today={boot.venue.today} channels={brandInfo.data?.channels ?? []} industry={boot.organization.industry}
          onClose={() => setScheduling(null)} onScheduled={scheduled} />
      )}
    </div>
  )
}
```

In `frontend/src/content/ContentApp.tsx`, add `import { IdeasPage } from './ideas/IdeasPage'` after `import { registerContentLocales } from './i18n'`, and replace:

```tsx
            <Route index element={<PlanPage />} />
            <Route path="posts" element={<PostsPage />} />
```

with:

```tsx
            <Route index element={<PlanPage />} />
            <Route path="ideas" element={<IdeasPage />} />
            <Route path="posts" element={<PostsPage />} />
```

In `frontend/src/content/ContentShell.tsx`, replace `import { CalendarDays, Compass, FileText, Fingerprint, Plus, Search } from 'lucide-react'` with `import { CalendarDays, Compass, FileText, Fingerprint, Lightbulb, Plus, Search } from 'lucide-react'`, and replace:

```tsx
    { to: '/content', end: true, icon: CalendarDays, label: t('content.nav.plan', 'Plan') },
```

with:

```tsx
    { to: '/content', end: true, icon: CalendarDays, label: t('content.nav.plan', 'Plan') },
    { to: '/content/ideas', end: false, icon: Lightbulb, label: t('content.nav.ideas', 'Ideas') },
```

- [ ] **Step 6: The words**

Write `$R4B/t7-words.json` with the Write tool:

```json
{
  "nav.ideas": { "en": "Ideas", "ru": "Идеи", "de": "Ideen", "fr": "Idées", "es": "Ideas" },
  "ideas.title": { "en": "Ideas", "ru": "Идеи", "de": "Ideen", "fr": "Idées", "es": "Ideas" },
  "ideas.intro": { "en": "Posts without a day, by stage. Move a card to another stage, or schedule it onto the Plan.", "ru": "Посты без даты по этапам. Перенесите карточку на другой этап или поставьте её в план.", "de": "Beiträge ohne Tag, nach Phase. Verschieben Sie eine Karte in eine andere Phase oder planen Sie sie ein.", "fr": "Les publications sans jour, par étape. Déplacez une carte vers une autre étape ou programmez-la dans le plan.", "es": "Publicaciones sin día, por etapa. Mueve una tarjeta a otra etapa o prográmala en el plan." },
  "ideas.column.idea": { "en": "Idea", "ru": "Идея", "de": "Idee", "fr": "Idée", "es": "Idea" },
  "ideas.column.draft": { "en": "Draft", "ru": "Черновик", "de": "Entwurf", "fr": "Brouillon", "es": "Borrador" },
  "ideas.column.review": { "en": "In review", "ru": "На проверке", "de": "In Prüfung", "fr": "En relecture", "es": "En revisión" },
  "ideas.column.ready": { "en": "Ready", "ru": "Готово", "de": "Bereit", "fr": "Prêt", "es": "Listo" },
  "ideas.empty": { "en": "Nothing here yet.", "ru": "Здесь пока пусто.", "de": "Hier ist noch nichts.", "fr": "Rien ici pour l’instant.", "es": "Aquí no hay nada todavía." },
  "ideas.see_all": { "en": "See all: {{count}}", "ru": "Показать все: {{count}}", "de": "Alle anzeigen: {{count}}", "fr": "Tout voir : {{count}}", "es": "Ver todo: {{count}}" },
  "ideas.schedule": { "en": "Schedule", "ru": "Запланировать", "de": "Einplanen", "fr": "Programmer", "es": "Programar" },
  "ideas.move_to": { "en": "Move to…", "ru": "Перенести в…", "de": "Verschieben nach…", "fr": "Déplacer vers…", "es": "Mover a…" },
  "ideas.move_hint": { "en": "Shift + ← or → moves the card to the stage beside it.", "ru": "Shift + ← или → переносит карточку на соседний этап.", "de": "Umschalt + ← oder → verschiebt die Karte in die Nachbarphase.", "fr": "Maj + ← ou → déplace la carte vers l’étape voisine.", "es": "Mayús + ← o → mueve la tarjeta a la etapa de al lado." },
  "ideas.stage": { "en": "Stage", "ru": "Этап", "de": "Phase", "fr": "Étape", "es": "Etapa" },
  "ideas.scheduled": { "en": "Scheduled for {{day}}.", "ru": "Запланировано на {{day}}.", "de": "Eingeplant für {{day}}.", "fr": "Programmé pour le {{day}}.", "es": "Programado para el {{day}}." },
  "ideas.undo": { "en": "Undo", "ru": "Отменить", "de": "Rückgängig", "fr": "Annuler", "es": "Deshacer" },
  "ideas.schedule_title": { "en": "Schedule this post", "ru": "Запланировать пост", "de": "Beitrag einplanen", "fr": "Programmer cette publication", "es": "Programar esta publicación" },
  "ideas.day": { "en": "Day", "ru": "День", "de": "Tag", "fr": "Jour", "es": "Día" },
  "ideas.time": { "en": "Time", "ru": "Время", "de": "Uhrzeit", "fr": "Heure", "es": "Hora" },
  "ideas.schedule_yes": { "en": "Schedule", "ru": "Запланировать", "de": "Einplanen", "fr": "Programmer", "es": "Programar" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node "$R4B/words.mjs" "$R4B/t7-words.json"
```

In `frontend/src/content/i18n/contentLocales.test.ts`, after the `'plan.add'` line Task 5 added, add `  'ideas.column': ['idea', 'draft', 'review', 'ready'],`, and put "See all" under the count rule — replace:

```ts
    const COUNTED = ['plan.goals.at_risk', 'plan.goals.streak', 'panel.repeat.copies', 'panel.repeat.stop_confirm', 'brand.channels.per_week']
```

with:

```ts
    const COUNTED = ['plan.goals.at_risk', 'plan.goals.streak', 'panel.repeat.copies', 'panel.repeat.stop_confirm', 'brand.channels.per_week', 'ideas.see_all']
```

- [ ] **Step 7: Run the tests, the content suite and the types**

```bash
"$R4B/vt.sh" src/content && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
```

Expected: every content test passes (`ideasMath.test.ts` 7, `ideas.test.tsx` 4); `TSC-CLEAN`. If the Node in use names "3 hours ago" differently for `en-GB`, ledger a ruling and assert what `Intl.RelativeTimeFormat` gives.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/ideas frontend/src/content/ContentApp.tsx frontend/src/content/ContentShell.tsx frontend/src/content/i18n && git commit -q -m "Content portal: the Ideas page — posts without a day by stage, moves, Schedule with Undo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 8: Quick capture — the Idea stage's line, Find's "Add an idea" and the I key (spec §4.3)

**Files:**
- Create: `frontend/src/content/ideas/QuickCapture.tsx`, `frontend/src/content/ideas/CaptureDialog.tsx`
- Modify: `frontend/src/content/ideas/ideasMath.ts` (`ideaBody`), `frontend/src/content/ideas/IdeasPage.tsx`, `frontend/src/content/lib/shortcuts.ts`, `frontend/src/content/find/findItems.ts`, `frontend/src/content/ui/ContentShortcuts.tsx`, `frontend/src/content/ContentShell.tsx`
- Test: `frontend/src/content/ideas/ideasMath.test.ts`, `frontend/src/content/ideas/ideas.test.tsx`, `frontend/src/content/lib/shortcuts.test.ts`, `frontend/src/content/find/findItems.test.ts`, `frontend/src/content/ui/contentShortcuts.test.tsx`
- Words: `$R4B/t8-words.json`

**Interfaces:**
- Consumes: `api.createPost` (the server takes `status: 'idea'` with no day, 4A-1); `ERRORS.idea` (Task 2); `refreshLists`; `Dialog`.
- Produces: `ideaBody(text, channels, platforms): (PostFields & { platform: Platform }) | null`; `<QuickCapture autoFocus? />`; `<CaptureDialog onClose />`; `Shortcut` gains `'idea'` on the letter I; `ActionWords.newIdea`; Find's action `{ id: 'idea', kind: 'idea', go: { run: 'idea' } }` second in the list.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/content/ideas/ideasMath.test.ts`, add `ideaBody` to the import from `./ideasMath`, and at the end of the file add:

```ts

describe('quick capture (spec 2026-10-16 §4.3)', () => {
  const channels = [{ platform: 'facebook', active: false }, { platform: 'linkedin', active: true }] as unknown as Channel[]

  // Review Focus 5: an idea of only spaces sends nothing.
  it('makes an idea post with the words as its topic on the brand’s first active channel, and nothing from spaces', () => {
    expect(ideaBody('  Autumn colour trends  ', channels, ['instagram'])).toEqual({ platform: 'linkedin', status: 'idea', topic: 'Autumn colour trends' })
    expect(ideaBody('x', [], ['instagram', 'linkedin'])?.platform).toBe('instagram')
    expect(ideaBody('y'.repeat(300), channels, [])?.topic).toHaveLength(255)
    expect(ideaBody('   ', channels, ['instagram'])).toBeNull()
  })
})
```

In `frontend/src/content/ideas/ideas.test.tsx`, inside `describe('IdeasPage', () => {`, after the first `it(...)` add:

```tsx

  it('starts the Idea stage with the capture line (spec §4.3)', () => {
    expect(page()).toMatch(/<form[^>]*>.*<input[^>]*aria-label="Add an idea…"[^>]*placeholder="Add an idea…"/)
  })
```

In `frontend/src/content/lib/shortcuts.test.ts`, replace:

```ts
    expect([hit(key('n')), hit(key('t')), hit(key('w')), hit(key('m')), hit(key('l'))]).toEqual(['new', 'today', 'week', 'month', 'list'])
```

with:

```ts
    expect([hit(key('n')), hit(key('t')), hit(key('w')), hit(key('m')), hit(key('l'))]).toEqual(['new', 'today', 'week', 'month', 'list'])
    // Spec 2026-10-16 §4.3: I adds an idea, anywhere in Content.
    expect(hit(key('i'))).toBe('idea')
```

and replace:

```ts
    expect(hit(key('ь', { code: 'KeyM' }))).toBe('month')
```

with:

```ts
    expect(hit(key('ь', { code: 'KeyM' }))).toBe('month')
    expect(hit(key('ш', { code: 'KeyI' }))).toBe('idea')
```

In `frontend/src/content/find/findItems.test.ts`:

1. Replace `import { CalendarDays, FileText } from 'lucide-react'` with `import { CalendarDays, FileText, Lightbulb } from 'lucide-react'`.
2. Replace `const words = { newPost: 'New post', goTo: 'Go to',` with `const words = { newPost: 'New post', newIdea: 'Add an idea', goTo: 'Go to',`.
3. Replace `    expect(light.map(a => a.label)).toEqual(['New post', 'Go to Plan', 'Switch to dark', 'Collapse menu', 'Keyboard shortcuts'])` with `    expect(light.map(a => a.label)).toEqual(['New post', 'Add an idea', 'Go to Plan', 'Switch to dark', 'Collapse menu', 'Keyboard shortcuts'])`.
4. Replace `    expect(light[1].go).toEqual({ to: '/content' })` with:

```ts
    expect(light[1].go).toEqual({ run: 'idea' })
    expect(light[2].go).toEqual({ to: '/content' })
```

5. Replace `    expect(phone.map(a => a.label)).toEqual(['New post', 'Go to Plan', 'Switch to light', 'Keyboard shortcuts'])` with `    expect(phone.map(a => a.label)).toEqual(['New post', 'Add an idea', 'Go to Plan', 'Switch to light', 'Keyboard shortcuts'])`.
6. Replace `    expect(iconOf({ id: 'g', kind: 'page', label: '', go: { to: '/content' } })).toBe(CalendarDays)` with:

```ts
    expect(iconOf({ id: 'g', kind: 'page', label: '', go: { to: '/content' } })).toBe(CalendarDays)
    expect(iconOf({ id: 'idea', kind: 'idea', label: '', go: { run: 'idea' } })).toBe(Lightbulb)
```

In `frontend/src/content/ui/contentShortcuts.test.tsx`, replace `    for (const words of ['Find', 'Ctrl K', 'New post', 'This list',` with `    for (const words of ['Find', 'Ctrl K', 'New post', 'Add an idea', 'This list',`.

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4B/vt.sh" src/content/ideas/ src/content/lib/shortcuts.test.ts src/content/find/findItems.test.ts src/content/ui/contentShortcuts.test.tsx
```

Expected: failures — `ideaBody` is not exported; no capture line; `i` is no shortcut; no "Add an idea" action, icon or sheet row.

- [ ] **Step 3: `ideaBody`, the capture line and its dialog**

In `frontend/src/content/ideas/ideasMath.ts`, replace `import type { Channel, DateKey, IdeasColumn, IdeasPayload, Platform, PostCard, PostStatus } from '../lib/types'` with `import type { Channel, DateKey, IdeasColumn, IdeasPayload, Platform, PostCard, PostFields, PostStatus } from '../lib/types'`, and add at the end:

```ts

/** Quick capture (spec §4.3): an idea post, the words its topic (255 at most), no day, on the brand's first active channel. */
export function ideaBody(text: string, channels: readonly Channel[], platforms: readonly Platform[]): (PostFields & { platform: Platform }) | null {
  const topic = text.trim().slice(0, 255)
  if (topic === '') return null
  return { platform: channels.find(c => c.active)?.platform ?? platforms[0] ?? 'instagram', status: 'idea', topic }
}
```

Write `frontend/src/content/ideas/QuickCapture.tsx` with the Write tool:

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import { ideaBody } from './ideasMath'

/**
 * "Add an idea…" (spec 2026-10-16 §4.3): type, press Enter, and an idea post with no day is made. The line clears and
 * keeps the focus for the next one (it is never disabled while saving: that would drop the focus).
 */
export function QuickCapture({ autoFocus = false }: { autoFocus?: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ danger: boolean; text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    // After the dialog around it has focused its own box (a parent's effect runs after its children's).
    const frame = window.requestAnimationFrame(() => input.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [autoFocus])

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const body = ideaBody(text, brandInfo.data?.channels ?? [], boot.platforms)
    if (body === null || busy) return
    setBusy(true)
    setNote(null)
    try {
      await api.createPost(body)
      setText('')
      setNote({ danger: false, text: t('content.ideas.added', 'Idea added.') })
      void refreshLists(queryClient, brand)
    } catch (err) {
      const [key, words] = errorKey('idea', failureOf(err).code)
      setNote({ danger: true, text: t(key, words) })
    } finally {
      setBusy(false)
    }
  }

  const label = t('content.ideas.capture', 'Add an idea…')
  return (
    <form onSubmit={(e) => { void add(e) }} className="space-y-1">
      <input ref={input} value={text} maxLength={255} readOnly={busy} aria-busy={busy || undefined} enterKeyHint="done" aria-label={label} placeholder={label}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text placeholder:text-a-text-2" />
      <p role="status" className={`text-xs ${note?.danger ? 'text-a-danger' : 'text-a-text-2'}`}>{note?.text}</p>
    </form>
  )
}
```

Write `frontend/src/content/ideas/CaptureDialog.tsx` with the Write tool:

```tsx
import { useTranslation } from 'react-i18next'
import { Dialog } from '../ui/Dialog'
import { QuickCapture } from './QuickCapture'

/** The capture box behind I and Find's "Add an idea" (spec 2026-10-16 §4.3), anywhere in Content; Escape closes it. */
export function CaptureDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog title={t('content.ideas.capture_title', 'Add an idea')} onClose={onClose}>
      <div className="space-y-2">
        <QuickCapture autoFocus />
        <p className="text-xs text-a-text-2">{t('content.ideas.capture_hint', 'Press Enter to add it to the Ideas page. Add as many as you like.')}</p>
      </div>
    </Dialog>
  )
}
```

In `frontend/src/content/ideas/IdeasPage.tsx`, add `import { QuickCapture } from './QuickCapture'` after `import { IdeaColumn } from './IdeaColumn'`, and replace:

```tsx
            onDragStart={setDragging} onDragEnd={() => setDragging(null)} onDrop={() => drop(column)} />
```

with:

```tsx
            onDragStart={setDragging} onDragEnd={() => setDragging(null)} onDrop={() => drop(column)}>
            {column === 'idea' && <QuickCapture />}
          </IdeaColumn>
```

- [ ] **Step 4: I, Find and the shortcuts sheet**

In `frontend/src/content/lib/shortcuts.ts`, replace:

```ts
 * HexaTech Content's shortcuts (spec §4.7) on the shared engine: N a new
 * post, T this week, W / M / L the week, month and list views, ← → the
```

with:

```ts
 * HexaTech Content's shortcuts (spec §4.7) on the shared engine: N a new
 * post, I an idea (spec 2026-10-16 §4.3), T this week, W / M / L the week, month and list views, ← → the
```

replace `export type Shortcut = 'find' | 'help' | 'new' | 'today' | 'prev' | 'next' | 'week' | 'month' | 'list'` with `export type Shortcut = 'find' | 'help' | 'new' | 'idea' | 'today' | 'prev' | 'next' | 'week' | 'month' | 'list'`, and replace `  letters: { n: 'new', t: 'today', w: 'week', m: 'month', l: 'list' },` with `  letters: { n: 'new', i: 'idea', t: 'today', w: 'week', m: 'month', l: 'list' },`.

In `frontend/src/content/find/findItems.ts`:

1. Replace `import { CalendarDays, FileText, Keyboard, Moon, PanelLeft, Plus, Sun } from 'lucide-react'` with `import { CalendarDays, FileText, Keyboard, Lightbulb, Moon, PanelLeft, Plus, Sun } from 'lucide-react'`.
2. Replace `export interface ActionWords { newPost: string; goTo: string;` with `export interface ActionWords { newPost: string; newIdea: string; goTo: string;`.
3. Replace:

```ts
/** Find's actions (spec §4.7): a new post, the pages, the other theme, the side panel (from 1024 px), the list of shortcuts. */
```

with:

```ts
/** Find's actions (spec §4.7): a new post, an idea (spec 2026-10-16 §4.3), the pages, the other theme, the side panel (from 1024 px), the list of shortcuts. */
```

4. Replace:

```ts
    { id: 'new', kind: 'new', label: p.words.newPost, go: { run: 'new' } },
```

with:

```ts
    { id: 'new', kind: 'new', label: p.words.newPost, go: { run: 'new' } },
    { id: 'idea', kind: 'idea', label: p.words.newIdea, go: { run: 'idea' } },
```

5. Replace `    case 'new': return Plus` with:

```ts
    case 'new': return Plus
    case 'idea': return Lightbulb
```

In `frontend/src/content/ui/ContentShortcuts.tsx`, replace:

```tsx
        { name: t('content.shell.new_post', 'New post'), keys: [['N']] },
```

with:

```tsx
        { name: t('content.shell.new_post', 'New post'), keys: [['N']] },
        { name: t('content.shortcuts.idea', 'Add an idea'), keys: [['I']] },
```

In `frontend/src/content/ContentShell.tsx`:

1. After `import { ContentFind } from './find/ContentFind'` add `import { CaptureDialog } from './ideas/CaptureDialog'`.
2. Replace:

```tsx
  const [helpOpen, setHelpOpen] = useState(false)
  const main = useRef<HTMLElement>(null)
```

with:

```tsx
  const [helpOpen, setHelpOpen] = useState(false)
  // The capture box (I, or Find's "Add an idea": spec 2026-10-16 §4.3).
  const [capturing, setCapturing] = useState(false)
  const main = useRef<HTMLElement>(null)
```

3. Replace `  if (helpOpen && !ready) setHelpOpen(false)` with:

```tsx
  if (helpOpen && !ready) setHelpOpen(false)
  if (capturing && !ready) setCapturing(false)
```

4. Replace:

```tsx
      else if (hit === 'new') openNew({ date: today, platform: null })
      else return
```

with:

```tsx
      else if (hit === 'new') openNew({ date: today, platform: null })
      else if (hit === 'idea') setCapturing(true)
      else return
```

5. Replace `      newPost: t('content.shell.new_post', 'New post'),` with:

```tsx
      newPost: t('content.shell.new_post', 'New post'),
      newIdea: t('content.find.new_idea', 'Add an idea'),
```

6. Replace `    else if (target.run === 'shortcuts') setHelpOpen(true)` with:

```tsx
    else if (target.run === 'shortcuts') setHelpOpen(true)
    else if (target.run === 'idea') setCapturing(true)
```

7. Replace:

```tsx
        <ContentShortcuts open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} fallbackFocus={[findButton, main]} />
```

with:

```tsx
        <ContentShortcuts open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} fallbackFocus={[findButton, main]} />
        {capturing && <CaptureDialog onClose={() => setCapturing(false)} />}
```

- [ ] **Step 5: The words**

Write `$R4B/t8-words.json` with the Write tool:

```json
{
  "ideas.capture": { "en": "Add an idea…", "ru": "Добавить идею…", "de": "Idee hinzufügen…", "fr": "Ajouter une idée…", "es": "Añadir una idea…" },
  "ideas.added": { "en": "Idea added.", "ru": "Идея добавлена.", "de": "Idee hinzugefügt.", "fr": "Idée ajoutée.", "es": "Idea añadida." },
  "ideas.capture_title": { "en": "Add an idea", "ru": "Добавить идею", "de": "Idee hinzufügen", "fr": "Ajouter une idée", "es": "Añadir una idea" },
  "ideas.capture_hint": { "en": "Press Enter to add it to the Ideas page. Add as many as you like.", "ru": "Нажмите Enter, чтобы добавить её на страницу идей. Добавляйте сколько угодно.", "de": "Drücken Sie die Eingabetaste, um sie zu den Ideen hinzuzufügen. Fügen Sie so viele hinzu, wie Sie möchten.", "fr": "Appuyez sur Entrée pour l’ajouter à la page Idées. Ajoutez-en autant que vous voulez.", "es": "Pulsa Intro para añadirla a la página de ideas. Añade tantas como quieras." },
  "find.new_idea": { "en": "Add an idea", "ru": "Добавить идею", "de": "Idee hinzufügen", "fr": "Ajouter une idée", "es": "Añadir una idea" },
  "shortcuts.idea": { "en": "Add an idea", "ru": "Добавить идею", "de": "Idee hinzufügen", "fr": "Ajouter une idée", "es": "Añadir una idea" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node "$R4B/words.mjs" "$R4B/t8-words.json"
```

- [ ] **Step 6: Run the tests, the content suite and the types**

```bash
"$R4B/vt.sh" src/content && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
```

Expected: every content test passes; `TSC-CLEAN`.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/ideas frontend/src/content/lib/shortcuts.ts frontend/src/content/lib/shortcuts.test.ts frontend/src/content/find frontend/src/content/ui frontend/src/content/ContentShell.tsx frontend/src/content/i18n && git commit -q -m "Content portal: quick capture — the Idea stage's line, Find's Add an idea and the I key" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 9: Templates on the Brand page (spec §5.1, §5.2)

**Files:**
- Create: `frontend/src/content/brand/templateActions.ts`, `frontend/src/content/brand/templateActions.test.ts`, `frontend/src/content/brand/sections/Templates.tsx`, `frontend/src/content/brand/templates.test.tsx`
- Modify: `frontend/src/content/brand/useBrand.ts` (`setTemplates`), `frontend/src/content/brand/BrandPage.tsx`
- Words: `$R4B/t9-words.json`

**Interfaces:**
- Consumes: `Template`, `TemplateFields`, `TemplateSuggestion`, `api.createTemplate/updateTemplate/deleteTemplate/suggestTemplates`, `ERRORS.template` (with `too_many_tags`), `brandCache` keeping `templates` (Task 2); `parseHashtags` (`lib/postText.ts`); `useActiveStrategy`; `TextField`, `INPUT`.
- Produces:
  - `templateActions.ts`: `MAX_TEMPLATES = 100`, `TEMPLATE_MAX`, `templatesOf(brand)`, `TemplateForm`, `templateForm(template | suggestion | null)`, `templateProblem(form): 'invalid' | 'too_many_tags' | null`, `templateBody(form, original): TemplateFields`, `saveTemplate({ api, setTemplates }, original, form)`, `removeTemplate({ api, setTemplates }, id)`, `withTemplates(brand, templates)`, `templateFromPost(post, pillarName): TemplateForm`.
  - `useBrand()` returns `setTemplates(templates: Template[])` too (the brand cache keeps the answer's list).
  - `<TemplateEditor template initial? onDone />` (Task 10's "Save as template" uses it) and `<TemplatesSection brand canEdit />`, after Hashtags and snippets.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/brand/templateActions.test.ts` with the Write tool:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { BrandPayload, PostDetail, Template } from '../lib/types'
import { removeTemplate, saveTemplate, templateBody, templateForm, templateFromPost, templateProblem, withTemplates } from './templateActions'

const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: null, hook: 'Book your [treatment]',
  main_copy: 'Our [treatment] is back.', cta: 'Book now', hashtags: ['#autumn'],
}

describe('the template editor’s rules (spec 2026-10-16 §5.1)', () => {
  it('holds a template as text, and stops a save with no name or more than 30 hashtags', () => {
    expect(templateForm(offer)).toEqual({
      name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: '', hook: 'Book your [treatment]',
      main_copy: 'Our [treatment] is back.', cta: 'Book now', hashtags: '#autumn',
    })
    expect(templateProblem({ ...templateForm(offer), name: '  ' })).toBe('invalid')
    expect(templateProblem({ ...templateForm(offer), hashtags: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ') })).toBe('too_many_tags')
    expect(templateProblem(templateForm(offer))).toBeNull()
  })

  it('sends everything for a new template, only the changes for an edit, and nothing for no change', () => {
    expect(templateBody({ ...templateForm(null), name: ' Welcome ', hook: 'Hi [name]', hashtags: '#a, #b' }, null)).toEqual({
      name: 'Welcome', platform: null, pillar_name: null, topic: null, hook: 'Hi [name]', main_copy: null, cta: null, hashtags: ['#a', '#b'],
    })
    expect(templateBody({ ...templateForm(offer), cta: 'Book today' }, offer)).toEqual({ cta: 'Book today' })
    expect(templateBody({ ...templateForm(offer), hashtags: '#autumn #glow' }, offer)).toEqual({ hashtags: ['#autumn', '#glow'] })
    expect(templateBody(templateForm(offer), offer)).toEqual({})
  })
})

describe('saving and removing', () => {
  it('creates, edits with only what changed, sends nothing for no change, removes by id; keeps the answer’s list', async () => {
    const list = [offer]
    const api = {
      createTemplate: vi.fn(async () => ({ template: offer, templates: list })),
      updateTemplate: vi.fn(async () => ({ template: offer, templates: list })),
      deleteTemplate: vi.fn(async () => ({ templates: [] })),
    }
    const setTemplates = vi.fn()
    await saveTemplate({ api, setTemplates }, null, { ...templateForm(null), name: 'Welcome' })
    expect(api.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Welcome', hashtags: [] }))
    await saveTemplate({ api, setTemplates }, offer, { ...templateForm(offer), cta: 'Book today' })
    expect(api.updateTemplate).toHaveBeenCalledWith(3, { cta: 'Book today' })
    await saveTemplate({ api, setTemplates }, offer, templateForm(offer))
    expect(api.updateTemplate).toHaveBeenCalledTimes(1)
    await removeTemplate({ api, setTemplates }, 3)
    expect(api.deleteTemplate).toHaveBeenCalledWith(3)
    expect(setTemplates.mock.calls).toEqual([[list], [list], [[]]])
  })

  it('puts a changed list into the brand, keeping the rest', () => {
    const brand = { profile: null, snippets: [], templates: [] } as unknown as BrandPayload
    expect(withTemplates(brand, [offer])).toEqual({ profile: null, snippets: [], templates: [offer] })
  })
})

describe('Save as template (spec §5.2)', () => {
  it('starts from the post: its words and platform, its pillar by name, the topic (else the hook) as the name, cut to 80', () => {
    const post = { platform: 'linkedin', topic: null, hook: 'h'.repeat(90), main_copy: 'Text', cta: null, hashtags: ['#a'] } as unknown as PostDetail
    const form = templateFromPost(post, 'Education')
    expect(form.name).toHaveLength(80)
    expect(form).toMatchObject({ platform: 'linkedin', pillar_name: 'Education', hook: 'h'.repeat(90), main_copy: 'Text', cta: '', hashtags: '#a' })
    expect(templateFromPost({ ...post, topic: 'Autumn colours' }, null)).toMatchObject({ name: 'Autumn colours', pillar_name: '' })
  })
})
```

Write `frontend/src/content/brand/templates.test.tsx` with the Write tool:

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

import type { Template } from '../lib/types'
import { brandWith, renderBrand } from './brandTesting'
import { TemplateEditor, TemplatesSection } from './sections/Templates'
import { templateForm } from './templateActions'

const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: null, hook: 'Book your [treatment]',
  main_copy: null, cta: null, hashtags: [],
}
const addButton = (html: string, words: string) => html.match(new RegExp(`<button(?:(?!</button>).)*${words}</button>`))?.[0] ?? ''

// Spec 2026-10-16 §5.2: everyone reads the templates; managers add, edit, remove and ask the AI.
describe('TemplatesSection', () => {
  it('shows everyone the templates with their platform and pillar; only managers get the buttons', () => {
    const brand = brandWith({ templates: [offer] })
    const staff = renderBrand(brand, false, <TemplatesSection brand={brand} canEdit={false} />)
    expect(staff).toContain('>Templates<')
    expect(staff).toContain('Seasonal offer')
    expect(staff).toContain('instagram · Offers')
    expect(staff).not.toContain('Add a template')
    expect(staff).not.toContain('Suggest templates with AI')
    const manager = renderBrand(brand, true, <TemplatesSection brand={brand} canEdit />)
    expect(addButton(manager, 'Add a template')).not.toContain('disabled=""')
    expect(manager).toContain('Remove')
    expect(manager).toContain('Suggest templates with AI')
  })

  it('stops a manager adding a 101st template, and says why; says when there are none', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...offer, id: i + 1, name: `T${i}` }))
    const full = renderBrand(brandWith({ templates: many }), true, <TemplatesSection brand={brandWith({ templates: many })} canEdit />)
    expect(addButton(full, 'Add a template')).toContain('disabled=""')
    expect(full).toContain('A brand keeps at most 100 templates. Remove one first.')
    expect(renderBrand(brandWith(), false, <TemplatesSection brand={brandWith()} canEdit={false} />)).toContain('No templates yet.')
  })
})

describe('TemplateEditor', () => {
  it('writes a template: its name, any platform, a pillar kept by name, and what [blanks] are', () => {
    const out = renderBrand(brandWith(), true, <TemplateEditor template={null} initial={{ ...templateForm(null), name: 'From a post', pillar_name: 'Old pillar' }} onDone={() => {}} />)
    expect(out).toContain('value="From a post"')
    expect(out).toContain('>Any platform</option>')
    expect(out).toContain('<option value="Old pillar" selected="">Old pillar</option>')
    expect(out).toContain('Words in [square brackets] are blanks to fill, such as [treatment] or [date].')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4B/vt.sh" src/content/brand/templateActions.test.ts src/content/brand/templates.test.tsx
```

Expected: both fail — `Failed to resolve import "./templateActions"` and `"./sections/Templates"`.

- [ ] **Step 3: `templateActions.ts` and the brand cache's `setTemplates`**

Write `frontend/src/content/brand/templateActions.ts` with the Write tool:

```ts
import type { ContentApi } from '../lib/api'
import { parseHashtags } from '../lib/postText'
import type { BrandPayload, Platform, PostDetail, Template, TemplateFields, TemplateSuggestion } from '../lib/types'

/** A brand keeps at most this many templates (the server's ContentPlannerTemplate::MAX). */
export const MAX_TEMPLATES = 100

/** Each field's limit (the server's ContentRules::templateFields; spec 2026-10-16 §5.1). */
export const TEMPLATE_MAX = { name: 80, topic: 255, hook: 500, main_copy: 5000, cta: 255, tags: 30 } as const

/** The brand's templates, in the order they were made. */
export const templatesOf = (brand: BrandPayload | null): Template[] => brand?.templates ?? []

/** A template as its editor holds it: text, '' for "none", the hashtags as one line. */
export interface TemplateForm {
  name: string
  platform: Platform | ''
  pillar_name: string
  topic: string
  hook: string
  main_copy: string
  cta: string
  hashtags: string
}

export function templateForm(template: Template | TemplateSuggestion | null): TemplateForm {
  return {
    name: template?.name ?? '',
    platform: template?.platform ?? '',
    pillar_name: template?.pillar_name ?? '',
    topic: template?.topic ?? '',
    hook: template?.hook ?? '',
    main_copy: template?.main_copy ?? '',
    cta: template?.cta ?? '',
    hashtags: (template?.hashtags ?? []).join(' '),
  }
}

/** What the server would refuse, said first: no name, or more than 30 hashtags. */
export function templateProblem(form: TemplateForm): 'invalid' | 'too_many_tags' | null {
  if (form.name.trim() === '') return 'invalid'
  return parseHashtags(form.hashtags).length > TEMPLATE_MAX.tags ? 'too_many_tags' : null
}

/** Each field as the server takes it: trimmed, '' as null, the hashtags as a list. */
function fieldsOf(form: TemplateForm): Required<TemplateFields> {
  const text = (value: string) => (value.trim() === '' ? null : value.trim())
  return {
    name: form.name.trim(),
    platform: form.platform === '' ? null : form.platform,
    pillar_name: text(form.pillar_name),
    topic: text(form.topic),
    hook: text(form.hook),
    main_copy: text(form.main_copy),
    cta: text(form.cta),
    hashtags: parseHashtags(form.hashtags),
  }
}

/** What to send: every field for a new template, only what changed for one being edited (nothing for no change). */
export function templateBody(form: TemplateForm, original: Template | null): TemplateFields {
  const fields = fieldsOf(form)
  if (!original) return fields
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    const before = original[key as keyof TemplateFields]
    if (JSON.stringify(value) !== JSON.stringify(before)) out[key] = value
  }
  return out as TemplateFields
}

type SetTemplates = (templates: Template[]) => void

/** A new template, or an edit with only what changed (nothing sent for no change); the answer's list is kept. */
export async function saveTemplate(
  { api, setTemplates }: { api: Pick<ContentApi, 'createTemplate' | 'updateTemplate'>; setTemplates: SetTemplates },
  original: Template | null, form: TemplateForm,
): Promise<void> {
  const body = templateBody(form, original)
  if (original === null) {
    setTemplates((await api.createTemplate({ ...body, name: form.name.trim() })).templates)
    return
  }
  if (Object.keys(body).length === 0) return
  setTemplates((await api.updateTemplate(original.id, body)).templates)
}

export async function removeTemplate({ api, setTemplates }: { api: Pick<ContentApi, 'deleteTemplate'>; setTemplates: SetTemplates }, id: number): Promise<void> {
  setTemplates((await api.deleteTemplate(id)).templates)
}

/** The brand with a changed list of templates (every template endpoint answers the whole list). */
export const withTemplates = (brand: BrandPayload, templates: Template[]): BrandPayload => ({ ...brand, templates })

/** "Save as template" (spec §5.2): the post's words and platform, its pillar by name; the name is the topic, else the hook, cut to 80. */
export function templateFromPost(post: Pick<PostDetail, 'platform' | 'topic' | 'hook' | 'main_copy' | 'cta' | 'hashtags'>, pillarName: string | null): TemplateForm {
  const cut = (value: string | null, max: number) => (value ?? '').trim().slice(0, max)
  return {
    name: cut(post.topic, TEMPLATE_MAX.name) || cut(post.hook, TEMPLATE_MAX.name),
    platform: post.platform,
    pillar_name: pillarName ?? '',
    topic: cut(post.topic, TEMPLATE_MAX.topic),
    hook: cut(post.hook, TEMPLATE_MAX.hook),
    main_copy: cut(post.main_copy, TEMPLATE_MAX.main_copy),
    cta: cut(post.cta, TEMPLATE_MAX.cta),
    hashtags: post.hashtags.slice(0, TEMPLATE_MAX.tags).join(' '),
  }
}
```

In `frontend/src/content/brand/useBrand.ts`:

1. Replace `import type { BrandPayload, ProfileFields } from '../lib/types'` with:

```ts
import type { BrandPayload, ProfileFields, Template } from '../lib/types'
import { withTemplates } from './templateActions'
```

2. Replace:

```ts
  return { query, brand: query.data ?? null, adopt, saveProfile }
```

with:

```ts
  // The template endpoints answer the whole list, not the brand (spec 2026-10-16 §5.2): the cache keeps it.
  const setTemplates = useCallback((templates: Template[]) => {
    queryClient.setQueryData<BrandPayload>(['content', brandId, 'brand'], old => (old ? withTemplates(old, templates) : old))
  }, [queryClient, brandId])

  return { query, brand: query.data ?? null, adopt, saveProfile, setTemplates }
```

- [ ] **Step 4: The section**

Write `frontend/src/content/brand/sections/Templates.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Sparkles } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BrandPayload, Template, TemplateSuggestion } from '../../lib/types'
import { useActiveStrategy } from '../../lib/useActiveStrategy'
import { INPUT, TextField } from '../inputs'
import { MAX_TEMPLATES, removeTemplate, saveTemplate, TEMPLATE_MAX, templateForm, templateProblem, templatesOf, type TemplateForm } from '../templateActions'
import { useBrand } from '../useBrand'

/**
 * One template being written (spec 2026-10-16 §5.1): its name, an optional platform and pillar (kept by name), and the
 * post's words with [blanks]. Save checks the name and the hashtags first. Also "Save as template" in the post panel.
 */
export function TemplateEditor({ template, initial, onDone }: { template: Template | null; initial?: TemplateForm; onDone: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const { setTemplates } = useBrand()
  const { strategy } = useActiveStrategy()
  const pillars = (strategy?.pillars ?? []).filter(p => p.active).map(p => p.name)
  const [form, setForm] = useState<TemplateForm>(() => initial ?? templateForm(template))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.templates.${key}`, english)
  const set = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => setForm({ ...form, [key]: value })
  const fail = (code: string) => {
    const [key, text] = errorKey('template', code)
    setError(t(key, text))
  }

  const save = async () => {
    const problem = templateProblem(form)
    if (problem) {
      fail(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveTemplate({ api, setTemplates }, template, form)
      onDone()
    } catch (e) {
      fail(failureOf(e).code)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-a-border p-3">
      <TextField label={w('name', 'Name')} value={form.name} maxLength={TEMPLATE_MAX.name} required onChange={(name) => set('name', name)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{w('platform', 'Platform')}</span>
          <select value={form.platform} onChange={(e) => set('platform', e.target.value as TemplateForm['platform'])} className={`${INPUT} border-a-border`}>
            <option value="">{w('any_platform', 'Any platform')}</option>
            {boot.platforms.map(p => <option key={p} value={p}>{t(`content.platform.${p}`, p)}</option>)}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{w('pillar', 'Pillar')}</span>
          <select value={form.pillar_name} onChange={(e) => set('pillar_name', e.target.value)} className={`${INPUT} border-a-border`}>
            <option value="">{t('content.panel.fields.none', 'None')}</option>
            {pillars.map(name => <option key={name} value={name}>{name}</option>)}
            {form.pillar_name !== '' && !pillars.includes(form.pillar_name) && <option value={form.pillar_name}>{form.pillar_name}</option>}
          </select>
        </label>
      </div>
      <TextField label={t('content.panel.fields.topic', 'Topic')} value={form.topic} maxLength={TEMPLATE_MAX.topic} onChange={(v) => set('topic', v)} />
      <TextField label={t('content.panel.fields.hook', 'Hook')} value={form.hook} maxLength={TEMPLATE_MAX.hook} rows={2} onChange={(v) => set('hook', v)} />
      <TextField label={t('content.panel.fields.main_copy', 'Text')} value={form.main_copy} maxLength={TEMPLATE_MAX.main_copy} rows={4} onChange={(v) => set('main_copy', v)} />
      <TextField label={t('content.panel.fields.cta', 'Call to action')} value={form.cta} maxLength={TEMPLATE_MAX.cta} onChange={(v) => set('cta', v)} />
      <TextField label={t('content.panel.fields.hashtags', 'Hashtags')} value={form.hashtags} maxLength={3000} rows={2}
        hint={t('content.panel.fields.hashtags_hint', 'Separate them with spaces or commas.')} onChange={(v) => set('hashtags', v)} />
      <p className="text-xs text-a-text-2">{w('blanks_hint', 'Words in [square brackets] are blanks to fill, such as [treatment] or [date].')}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { void save() }} loading={busy}>{t('content.brand.save', 'Save')}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onDone}>{t('content.common.cancel', 'Cancel')}</Button>
      </div>
    </div>
  )
}

/** The AI's templates for this brand (one call, nothing saved until Add), each with blanks (spec §5.2). */
function TemplateSuggestions({ full }: { full: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const { setTemplates } = useBrand()
  const [items, setItems] = useState<TemplateSuggestion[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paused = boot.ai.status === 'over'
  const w = (key: string, english: string) => t(`content.brand.templates.${key}`, english)
  const fail = (e: unknown) => {
    const [key, text] = errorKey('template', failureOf(e).code)
    setError(t(key, text))
  }

  const ask = async () => {
    setBusy('ask')
    setError(null)
    try {
      setItems((await api.suggestTemplates()).suggestions)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }
  const add = async (item: TemplateSuggestion, key: string) => {
    setBusy(key)
    setError(null)
    try {
      await saveTemplate({ api, setTemplates }, null, templateForm(item))
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
        <Sparkles size={14} aria-hidden />{w('suggest', 'Suggest templates with AI')}
      </Button>
      {paused && <p className="text-xs text-a-text-2">{t('content.template.error.ai_budget_used_up', "This month's AI budget is used up.")}</p>}
      {items !== null && items.length === 0 && <p className="text-sm text-a-text-2">{w('no_suggestions', 'No more suggestions. Ask again for new ones.')}</p>}
      {items?.map((item, i) => {
        const key = `${i}:${item.name}`
        return (
          <div key={key} className="flex flex-wrap items-start gap-3 rounded-lg bg-a-surface-2 p-2.5">
            <div className="min-w-0 grow basis-48">
              <p className="text-sm font-semibold text-a-text">{item.name}</p>
              <p className="break-words text-xs text-a-text-2">{item.hook ?? item.topic ?? item.main_copy ?? ''}</p>
            </div>
            <Button size="sm" variant="secondary" loading={busy === key} disabled={full || (busy !== null && busy !== key)} onClick={() => { void add(item, key) }}>
              {w('add_suggestion', 'Add')}
            </Button>
          </div>
        )
      })}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}

/**
 * Templates (spec 2026-10-16 §5.2): posts the team writes again and again, with [blanks]. Everyone reads the list (name,
 * platform, pillar); managers add, edit and remove them, and ask the AI for some.
 */
export function TemplatesSection({ brand, canEdit }: { brand: BrandPayload; canEdit: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const { setTemplates } = useBrand()
  const [open, setOpen] = useState<number | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const list = templatesOf(brand)
  const full = list.length >= MAX_TEMPLATES
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.brand.templates.${key}`, english, vars)
  const sub = (tpl: Template) =>
    [tpl.platform ? t(`content.platform.${tpl.platform}`, tpl.platform) : w('any_platform', 'Any platform'), tpl.pillar_name].filter(Boolean).join(' · ')

  const remove = async (tpl: Template) => {
    if (!window.confirm(w('remove_confirm', 'Remove “{{name}}”?', { name: tpl.name }))) return
    setError(null)
    try {
      await removeTemplate({ api, setTemplates }, tpl.id)
    } catch (e) {
      const [key, text] = errorKey('template', failureOf(e).code)
      setError(t(key, text))
    }
  }

  return (
    <section aria-labelledby="content-templates" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 grow basis-48 space-y-0.5">
          <h2 id="content-templates" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Templates')}</h2>
          <p className="text-sm text-a-text-2">{w('intro', 'Posts your team writes again and again, with [blanks] to fill. Use one from a day’s + menu or from the post panel.')}</p>
        </div>
        {canEdit && open !== 'new' && (
          <Button size="sm" variant="secondary" disabled={full} onClick={() => setOpen('new')}>
            <Plus size={14} aria-hidden />{w('add', 'Add a template')}
          </Button>
        )}
      </div>
      {canEdit && full && <p className="text-xs text-a-text-2">{t('content.template.error.too_many_templates', 'A brand keeps at most 100 templates. Remove one first.')}</p>}
      {open === 'new' && <TemplateEditor template={null} onDone={() => setOpen(null)} />}
      {list.length === 0 && open !== 'new' && <p className="text-sm text-a-text-2">{w('none', 'No templates yet.')}</p>}
      <ul className="space-y-2">
        {list.map(tpl => (
          <li key={tpl.id}>
            {open === tpl.id
              ? <TemplateEditor template={tpl} onDone={() => setOpen(null)} />
              : (
                <div className="flex flex-wrap items-start gap-3 rounded-lg border border-a-border p-3">
                  <div className="min-w-0 grow basis-48">
                    <p className="truncate text-sm font-semibold text-a-text">{tpl.name}</p>
                    <p className="truncate text-xs text-a-text-2">{sub(tpl)}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setOpen(tpl.id)}>{t('content.brand.edit', 'Edit')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { void remove(tpl) }}>{w('remove', 'Remove')}</Button>
                    </div>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
      {canEdit && <TemplateSuggestions full={full} />}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
```

In `frontend/src/content/brand/BrandPage.tsx`, add `import { TemplatesSection } from './sections/Templates'` beside the other section imports, and replace:

```tsx
              <SnippetsSection brand={brand} canEdit={canEdit} />
              <RhythmSection brand={brand} canEdit={canEdit} />
```

with:

```tsx
              <SnippetsSection brand={brand} canEdit={canEdit} />
              <TemplatesSection brand={brand} canEdit={canEdit} />
              <RhythmSection brand={brand} canEdit={canEdit} />
```

- [ ] **Step 5: The words**

Write `$R4B/t9-words.json` with the Write tool:

```json
{
  "brand.templates.title": { "en": "Templates", "ru": "Шаблоны", "de": "Vorlagen", "fr": "Modèles", "es": "Plantillas" },
  "brand.templates.intro": { "en": "Posts your team writes again and again, with [blanks] to fill. Use one from a day’s + menu or from the post panel.", "ru": "Посты, которые команда пишет снова и снова, с [пропусками] для заполнения. Используйте шаблон из меню «+» дня или из панели поста.", "de": "Beiträge, die Ihr Team immer wieder schreibt, mit [Lücken] zum Ausfüllen. Nutzen Sie eine Vorlage über das +-Menü eines Tages oder im Beitragsbereich.", "fr": "Les publications que votre équipe écrit encore et encore, avec des [blancs] à remplir. Utilisez-en un depuis le menu + d’un jour ou depuis le panneau de la publication.", "es": "Publicaciones que tu equipo escribe una y otra vez, con [huecos] por rellenar. Usa una desde el menú + de un día o desde el panel de la publicación." },
  "brand.templates.name": { "en": "Name", "ru": "Название", "de": "Name", "fr": "Nom", "es": "Nombre" },
  "brand.templates.platform": { "en": "Platform", "ru": "Платформа", "de": "Plattform", "fr": "Plateforme", "es": "Plataforma" },
  "brand.templates.any_platform": { "en": "Any platform", "ru": "Любая платформа", "de": "Jede Plattform", "fr": "Toute plateforme", "es": "Cualquier plataforma" },
  "brand.templates.pillar": { "en": "Pillar", "ru": "Тема", "de": "Säule", "fr": "Pilier", "es": "Pilar" },
  "brand.templates.blanks_hint": { "en": "Words in [square brackets] are blanks to fill, such as [treatment] or [date].", "ru": "Слова в [квадратных скобках] — пропуски для заполнения, например [услуга] или [дата].", "de": "Wörter in [eckigen Klammern] sind Lücken zum Ausfüllen, etwa [Behandlung] oder [Datum].", "fr": "Les mots entre [crochets] sont des blancs à remplir, comme [soin] ou [date].", "es": "Las palabras entre [corchetes] son huecos por rellenar, como [tratamiento] o [fecha]." },
  "brand.templates.add": { "en": "Add a template", "ru": "Добавить шаблон", "de": "Vorlage hinzufügen", "fr": "Ajouter un modèle", "es": "Añadir una plantilla" },
  "brand.templates.none": { "en": "No templates yet.", "ru": "Шаблонов пока нет.", "de": "Noch keine Vorlagen.", "fr": "Aucun modèle pour l’instant.", "es": "Aún no hay plantillas." },
  "brand.templates.remove": { "en": "Remove", "ru": "Удалить", "de": "Entfernen", "fr": "Supprimer", "es": "Quitar" },
  "brand.templates.remove_confirm": { "en": "Remove “{{name}}”?", "ru": "Удалить «{{name}}»?", "de": "„{{name}}“ entfernen?", "fr": "Supprimer « {{name}} » ?", "es": "¿Quitar «{{name}}»?" },
  "brand.templates.suggest": { "en": "Suggest templates with AI", "ru": "Предложить шаблоны с помощью ИИ", "de": "Vorlagen mit KI vorschlagen", "fr": "Proposer des modèles avec l’IA", "es": "Sugerir plantillas con IA" },
  "brand.templates.no_suggestions": { "en": "No more suggestions. Ask again for new ones.", "ru": "Больше предложений нет. Попросите ещё раз, чтобы получить новые.", "de": "Keine weiteren Vorschläge. Fragen Sie erneut nach neuen.", "fr": "Plus de propositions. Redemandez-en de nouvelles.", "es": "No hay más sugerencias. Pide de nuevo para obtener otras." },
  "brand.templates.add_suggestion": { "en": "Add", "ru": "Добавить", "de": "Hinzufügen", "fr": "Ajouter", "es": "Añadir" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node "$R4B/words.mjs" "$R4B/t9-words.json"
```

- [ ] **Step 6: Run the tests, the Brand folder and the types**

```bash
"$R4B/vt.sh" src/content/brand/ src/content/i18n/ && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
```

Expected: every file passes (`templateActions.test.ts` 5, `templates.test.tsx` 3); `TSC-CLEAN`.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/brand frontend/src/content/i18n && git commit -q -m "Content portal: the Brand page's Templates section — the team's own, with AI suggestions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 10: Templates in the panel and from the "+" (spec §5.3)

**Files:**
- Create: `frontend/src/content/panel/templateApply.ts`, `frontend/src/content/panel/templateApply.test.ts`, `frontend/src/content/plan/templateFlow.ts`, `frontend/src/content/plan/templateFlow.test.ts`, `frontend/src/content/plan/TemplatePicker.tsx`, `frontend/src/content/panel/templatePanel.test.tsx`
- Modify: `frontend/src/content/panel/{PostFormFields,PostPanel,PostActions,AiTools,PanelProvider}.tsx`, `frontend/src/content/plan/PlanPage.tsx`, `frontend/src/content/i18n/contentLocales.test.ts` (`COUNTED`)
- Test: `frontend/src/content/panel/aiTools.test.tsx`
- Words: `$R4B/t10-words.json`

**Interfaces:**
- Consumes: `Template`, `api.write(id, instructions, templateId)` (Task 2); `NewDraft.fields` and `newForm` laying them over the form (Task 4); `PopMenu` (Task 5); the Plan's `addOn` choice `'template'` and the views' `templates?` prop (Task 5); `TemplateEditor`, `templateFromPost` (Task 9); `newPostDraft`, `usualTimes` (`plan/addMath.ts`); `suggestedTimes`; `createBody`, `newForm` (`panel/panelState.ts`); `refreshLists`.
- Produces:
  - `templateApply.ts`: `BLANK`, `blanksIn(form): string[]`, `pillarIdByName(name, pillars): string`, `templateFields(template, pillars): NonNullable<NewDraft['fields']>`, `replacesText(form, template): boolean`, `applyTemplate(form, template, pillars): PostForm`.
  - `templateFlow.ts`: `templateDraft(day, template, slots, channels, industry, pillars): NewDraft`, `TemplateFlow`, `startPost(flow, body): Promise<PostDetail>`, `writeInto(flow, postId, templateId): Promise<void>`.
  - `PanelApi.writing: { id: number; failed: string | null } | null` and `PanelApi.noteWriting(writing)`: a write the AI does for a post from outside the panel; `AiTools` takes `outside?: { failed: string | null } | null` and `onOutsideSeen?: () => void` (PostPanel passes them for its post).
  - `PostFormFields` takes `templates?: Template[]` (the Template menu beside Topic and the blanks line); `PostActions` offers managers "Save as template"; `<TemplatePicker day templates slots channels onClose />`; the Plan's `picking` state.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/panel/templateApply.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import type { Template } from '../lib/types'
import { newForm } from './panelState'
import { applyTemplate, blanksIn, pillarIdByName, replacesText, templateFields } from './templateApply'

const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: null, hook: 'Book your [treatment] before [date]',
  main_copy: 'Our [treatment] is back.', cta: 'Book now', hashtags: ['#autumn', '#glow'],
}
const empty = newForm({ date: '2026-10-20', platform: 'linkedin' }, ['instagram', 'linkedin'])
const pillars = [{ id: 7, name: 'Offers', active: true }, { id: 8, name: 'Old', active: false }]

describe('blanks (spec 2026-10-16 §5.1, §5.3)', () => {
  it('finds each blank once, in the order it first appears in the topic, hook, text and call to action', () => {
    expect(blanksIn({ topic: '[date] sale', hook: 'Book your [treatment] before [date]', main_copy: 'a [x]\n[y', cta: `[] [${'z'.repeat(41)}]` }))
      .toEqual(['[date]', '[treatment]', '[x]'])
  })
})

describe('applying a template (spec §5.3)', () => {
  // Review Focus 4: it asks only when it would replace words already written; the blanks line counts what is left.
  it('asks first only when it would replace words already written', () => {
    expect(replacesText(empty, offer)).toBe(false)
    expect(replacesText({ ...empty, hook: 'My own hook' }, offer)).toBe(true)
    expect(replacesText({ ...empty, topic: 'My topic' }, offer)).toBe(false) // the template has no topic
    expect(replacesText({ ...empty, cta: 'Book now' }, offer)).toBe(false) // the same words
  })

  it('fills what the template has and keeps the rest; takes its platform, and its pillar by name', () => {
    const next = applyTemplate({ ...empty, topic: 'Autumn' }, offer, pillars)
    expect(next).toMatchObject({
      platform: 'instagram', pillar_id: '7', topic: 'Autumn', hook: 'Book your [treatment] before [date]', main_copy: 'Our [treatment] is back.',
      cta: 'Book now', hashtags: '#autumn #glow', scheduled_date: '2026-10-20',
    })
    expect(blanksIn(next)).toEqual(['[treatment]', '[date]'])
    const kept = applyTemplate({ ...empty, pillar_id: '8' }, { ...offer, platform: null, pillar_name: 'Gone', hashtags: [] }, pillars)
    expect(kept).toMatchObject({ platform: 'linkedin', pillar_id: '8', hashtags: '' })
  })

  it('takes the active strategy’s pillar of the template’s name, else none', () => {
    expect(pillarIdByName('offers ', pillars)).toBe('7')
    expect(pillarIdByName('Old', pillars)).toBe('')
    expect(pillarIdByName(null, pillars)).toBe('')
    expect(templateFields(offer, [])).toEqual({
      topic: '', hook: 'Book your [treatment] before [date]', main_copy: 'Our [treatment] is back.', cta: 'Book now', hashtags: '#autumn #glow', pillar_id: '',
    })
  })
})
```

Write `frontend/src/content/plan/templateFlow.test.ts` with the Write tool:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { Channel, PostDetail, Template } from '../lib/types'
import { startPost, templateDraft, writeInto } from './templateFlow'

const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'linkedin', pillar_name: 'Offers', topic: 'Book your [treatment]', hook: null,
  main_copy: 'Our [treatment] is back.', cta: null, hashtags: ['#autumn'],
}
const channels = [{ platform: 'instagram', active: true, post_time: '08:30' }, { platform: 'linkedin', active: true, post_time: '12:00' }] as unknown as Channel[]
const pillars = [{ id: 7, name: 'offers', active: true }]

describe('templateDraft (spec 2026-10-16 §5.3)', () => {
  it('starts on the template’s platform at its usual time, with the template’s words and its pillar by name', () => {
    expect(templateDraft('2026-10-20', offer, [], channels, 'beauty', pillars)).toEqual({
      date: '2026-10-20', platform: 'linkedin', time: '12:00',
      fields: { topic: 'Book your [treatment]', hook: '', main_copy: 'Our [treatment] is back.', cta: '', hashtags: '#autumn', pillar_id: '7' },
    })
  })

  it('without a platform, takes the day’s first open slot, else the brand’s first channel', () => {
    const any = { ...offer, platform: null }
    expect(templateDraft('2026-10-20', any, [{ date: '2026-10-20', platform: 'linkedin' }], channels, 'beauty', []).platform).toBe('linkedin')
    expect(templateDraft('2026-10-20', any, [], channels, 'beauty', [])).toMatchObject({ platform: 'instagram', time: '08:30' })
  })
})

describe('Write with AI from a template', () => {
  const post = { id: 41, updated_at: 'a' } as unknown as PostDetail
  const written = { id: 41, updated_at: 'b' } as unknown as PostDetail
  const flowWith = (write: () => Promise<{ post: PostDetail }>) => {
    const calls: string[] = []
    const flow = {
      api: {
        createPost: vi.fn(async () => { calls.push('create'); return { post } }),
        write: vi.fn(async (...args: unknown[]) => { calls.push(`write ${JSON.stringify(args)}`); return write() }),
      },
      keep: vi.fn((p: PostDetail) => { calls.push(`keep ${p.updated_at}`) }),
      panel: {
        open: vi.fn((id: number) => { calls.push(`open ${id}`); return true }),
        noteWriting: vi.fn((w: unknown) => { calls.push(`writing ${JSON.stringify(w)}`) }),
      },
    }
    return { flow, calls }
  }

  it('makes the post, keeps it, marks it as being written and opens it; then keeps what the AI wrote', async () => {
    const { flow, calls } = flowWith(async () => ({ post: written }))
    expect(await startPost(flow, { platform: 'linkedin', topic: 'x' })).toBe(post)
    await writeInto(flow, 41, 3)
    expect(calls).toEqual(['create', 'keep a', 'writing {"id":41,"failed":null}', 'open 41', 'write [41,null,3]', 'keep b', 'writing null'])
  })

  it('tells the panel why the AI stopped', async () => {
    const { flow, calls } = flowWith(async () => { throw Object.assign(new Error('refused'), { response: { status: 502, data: { code: 'ai_failed' } } }) })
    await writeInto(flow, 41, 3)
    expect(calls[calls.length - 1]).toBe('writing {"id":41,"failed":"ai_failed"}')
  })
})
```

Write `frontend/src/content/panel/templatePanel.test.tsx` with the Write tool:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

import { ContentContext } from '../ContentProvider'
import { bootFor } from '../brand/brandTesting'
import type { Bootstrap, PostDetail, Template } from '../lib/types'
import { TemplatePicker } from '../plan/TemplatePicker'
import { PanelProvider } from './PanelProvider'
import { newForm } from './panelState'
import { PostActions } from './PostActions'
import { PostFormFields } from './PostFormFields'

const noop = () => {}
const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: null, hook: 'Book your [treatment] before [date]',
  main_copy: null, cta: null, hashtags: [],
}
const post: PostDetail = {
  id: 5, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft',
  title: null, hook: 'Three colours', topic: 'Autumn', pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z',
  language: 'en', goal: null, format: null, main_copy: 'Warm tones.', short_copy: null, cta: null, hashtags: [],
  audience_id: null, campaign_id: null, weekday_role: null, funnel_stage: null, post_type: null, strategic_reason: null,
  quality: null, published_url: null, published_at: null, generated_by: 'manual', hook_alternatives: [], visual_brief: null,
}
const fields = (templates: Template[], hook = '') => renderToStaticMarkup(
  <PostFormFields form={{ ...newForm({ date: '2026-10-20', platform: 'instagram' }, ['instagram']), hook }} onChange={noop} platforms={['instagram']} statuses={['draft']}
    pillars={[]} audiences={[]} published={false} invalid={[]} locale="en" industry={null} snippets={[]} templates={templates} />,
)
const withBoot = (data: Bootstrap, el: ReactElement) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <ContentContext.Provider value={{ data, isLoading: false, isError: false, error: null, refetch: noop, switchBrand: noop }}>
      <PanelProvider>{el}</PanelProvider>
    </ContentContext.Provider>
  </QueryClientProvider>,
)

describe('templates in the post panel (spec 2026-10-16 §5.3)', () => {
  it('offers the brand’s templates beside the topic, and no menu when it has none', () => {
    expect(fields([offer])).toMatch(/<button[^>]*aria-haspopup="true"[^>]*aria-label="Template"/)
    expect(fields([])).not.toContain('aria-label="Template"')
  })

  it('says which blanks are left, and nothing when none are', () => {
    expect(fields([], 'Book your [treatment] before [date]')).toContain('Blanks to fill: 2 — [treatment], [date]')
    expect(fields([], 'Book your colour refresh')).not.toContain('Blanks to fill')
  })

  it('offers managers "Save as template" on a saved post, and not staff', () => {
    const actions = <PostActions post={post} dirty={false} onPost={noop} onDuplicated={noop} onDeleted={noop} />
    expect(withBoot(bootFor(true), actions)).toContain('Save as template')
    expect(withBoot(bootFor(false), actions)).not.toContain('Save as template')
  })
})

describe('TemplatePicker (spec §5.3)', () => {
  it('lists the templates with their platform and pillar, each with Use and Write with AI', () => {
    const out = withBoot(bootFor(false), <TemplatePicker day="2026-10-20" templates={[offer]} slots={[]} channels={[]} onClose={noop} />)
    expect(out).toContain('Choose a template')
    expect(out).toContain('Seasonal offer')
    expect(out).toContain('instagram · Offers')
    expect(out).toMatch(/<button[^>]*>Use<\/button>/)
    expect(out).toContain('Write with AI')
  })

  it('waits on Write with AI while this month’s AI budget is used up', () => {
    const over = { ...bootFor(false), ai: { status: 'over', percent: 100 } } as unknown as Bootstrap
    const out = withBoot(over, <TemplatePicker day="2026-10-20" templates={[offer]} slots={[]} channels={[]} onClose={noop} />)
    expect(out).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*[^<]*Write with AI/)
  })
})
```

In `frontend/src/content/panel/aiTools.test.tsx`, at the end of the file add:

```tsx

describe('AiTools and a write from elsewhere (spec 2026-10-16 §5.3)', () => {
  const shown = (outside: { failed: string | null }) => renderToStaticMarkup(
    <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <AiTools post={post} dirty={false} onPost={() => {}} onUseCopy={() => {}} outside={outside} onOutsideSeen={() => {}} />
    </ContentContext.Provider>,
  )

  it('shows the AI working on a post a template is writing, its write tools waiting, and why it stopped', () => {
    const working = shown({ failed: null })
    expect(working).toContain('The AI is working…')
    expect(disabled(working, 'Write the text')).toBe(true)
    expect(shown({ failed: 'ai_failed' })).toContain('The AI could not finish this. Please try again.')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4B/vt.sh" src/content/panel/templateApply.test.ts src/content/plan/templateFlow.test.ts src/content/panel/templatePanel.test.tsx src/content/panel/aiTools.test.tsx
```

Expected: failures — `./templateApply`, `./templateFlow` and `../plan/TemplatePicker` do not resolve; AiTools takes no `outside`.

- [ ] **Step 3: `templateApply.ts` and `templateFlow.ts`**

Write `frontend/src/content/panel/templateApply.ts` with the Write tool (it holds a regular expression: never through a heredoc):

```ts
import type { PillarRef, Template } from '../lib/types'
import type { NewDraft } from './PanelProvider'
import type { PostForm } from './panelState'

/** A blank (spec 2026-10-16 §5.1): "[" + 1–40 characters with no bracket or line break + "]". */
export const BLANK = /\[[^[\]\r\n]{1,40}\]/g

/** The fields that hold words: blanks are looked for there, and only there is text "replaced". */
const WORDS = ['topic', 'hook', 'main_copy', 'cta'] as const
type Words = Pick<PostForm, (typeof WORDS)[number]>

/** The blanks still in the topic, hook, text and call to action: each once, in the order it first appears. */
export function blanksIn(form: Words): string[] {
  const seen: string[] = []
  for (const key of WORDS) {
    for (const blank of form[key].match(BLANK) ?? []) if (!seen.includes(blank)) seen.push(blank)
  }
  return seen
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/** A template keeps its pillar by name (spec §5.1): the active strategy's active pillar of that name, else none (''). */
export function pillarIdByName(name: string | null, pillars: readonly PillarRef[]): string {
  if (!name) return ''
  const pillar = pillars.find(p => p.active && sameName(p.name, name))
  return pillar ? String(pillar.id) : ''
}

/** The words a template puts in a new post: its fields ('' where it has none), its hashtags as one line, its pillar by name. */
export function templateFields(template: Template, pillars: readonly PillarRef[]): NonNullable<NewDraft['fields']> {
  return {
    topic: template.topic ?? '',
    hook: template.hook ?? '',
    main_copy: template.main_copy ?? '',
    cta: template.cta ?? '',
    hashtags: template.hashtags.join(' '),
    pillar_id: pillarIdByName(template.pillar_name, pillars),
  }
}

/** Whether the template would replace words already written in the topic, hook, text or call to action (then the panel asks). */
export function replacesText(form: Words, template: Template): boolean {
  return WORDS.some(key => {
    const written = form[key].trim()
    const theirs = (template[key] ?? '').trim()
    return written !== '' && theirs !== '' && written !== theirs
  })
}

/**
 * The panel's Template menu (spec §5.3): the template's words replace the fields it has and the rest stay as written;
 * its platform and its pillar too where it names them (a pillar the active strategy lacks leaves the post's).
 */
export function applyTemplate(form: PostForm, template: Template, pillars: readonly PillarRef[]): PostForm {
  const pick = (key: (typeof WORDS)[number]) => {
    const theirs = template[key] ?? ''
    return theirs.trim() !== '' ? theirs : form[key]
  }
  const pillar = pillarIdByName(template.pillar_name, pillars)
  return {
    ...form,
    platform: template.platform ?? form.platform,
    pillar_id: pillar !== '' ? pillar : form.pillar_id,
    topic: pick('topic'),
    hook: pick('hook'),
    main_copy: pick('main_copy'),
    cta: pick('cta'),
    hashtags: template.hashtags.length > 0 ? template.hashtags.join(' ') : form.hashtags,
  }
}
```

Write `frontend/src/content/plan/templateFlow.ts` with the Write tool:

```ts
import { failureOf, type ContentApi } from '../lib/api'
import { suggestedTimes } from '../lib/bestTimes'
import type { Channel, DateKey, PillarRef, Platform, PostDetail, PostFields, Slot, Template } from '../lib/types'
import type { NewDraft, PanelApi } from '../panel/PanelProvider'
import { templateFields } from '../panel/templateApply'
import { newPostDraft, usualTimes } from './addMath'

/**
 * "From a template… → Use" (spec 2026-10-16 §5.3): a new post on the day — the template's platform, else the day's first
 * open slot's, else the brand's first channel — at that channel's usual time, filled with the template (its pillar by name).
 */
export function templateDraft(
  day: DateKey, template: Template, slots: readonly Slot[], channels: readonly Channel[], industry: string | null | undefined, pillars: readonly PillarRef[],
): NewDraft {
  const base = newPostDraft(day, slots, channels, industry)
  const time = template.platform
    ? usualTimes(channels, industry)[template.platform] ?? suggestedTimes(template.platform, industry)[0] ?? null
    : base.time ?? null
  return { date: day, platform: template.platform ?? base.platform, time, fields: templateFields(template, pillars) }
}

/** What "Write with AI" works with: the calls, a way to keep a post the server answered with, and the panel. */
export interface TemplateFlow {
  api: Pick<ContentApi, 'createPost' | 'write'>
  /** Puts the post into the panel's cache and reads the lists again. */
  keep: (post: PostDetail) => void
  panel: Pick<PanelApi, 'open' | 'noteWriting'>
}

/** "Write with AI", first half: the new post is made and kept, marked as being written, and opened in the panel. */
export async function startPost(flow: TemplateFlow, body: PostFields & { platform: Platform }): Promise<PostDetail> {
  const { post } = await flow.api.createPost(body)
  flow.keep(post)
  flow.panel.noteWriting({ id: post.id, failed: null })
  flow.panel.open(post.id)
  return post
}

/** Second half: the AI writes the post following the template; the panel takes its answer, or learns why it stopped. */
export async function writeInto(flow: TemplateFlow, postId: number, templateId: number): Promise<void> {
  try {
    const { post } = await flow.api.write(postId, null, templateId)
    flow.keep(post)
    flow.panel.noteWriting(null)
  } catch (e) {
    flow.panel.noteWriting({ id: postId, failed: failureOf(e).code })
  }
}
```

- [ ] **Step 4: The panel — the writing note, AiTools, the Template menu, the blanks line, Save as template**

In `frontend/src/content/panel/PanelProvider.tsx`:

1. Replace:

```ts
  moved: PostCard | null
  noteMoved: (card: PostCard) => void
}
```

with:

```ts
  moved: PostCard | null
  noteMoved: (card: PostCard) => void
  /** A write the AI is doing for a post from outside the panel ("Write with AI" from a template, spec 2026-10-16 §5.3); `failed` holds the refusal's code. */
  writing: { id: number; failed: string | null } | null
  noteWriting: (writing: { id: number; failed: string | null } | null) => void
}
```

2. Replace `  const [moved, setMoved] = useState<PostCard | null>(null)` with:

```ts
  const [moved, setMoved] = useState<PostCard | null>(null)
  const [writing, setWriting] = useState<PanelApi['writing']>(null)
```

3. Replace `  const noteMoved = useCallback((card: PostCard) => { setMoved(card) }, [])` with:

```ts
  const noteMoved = useCallback((card: PostCard) => { setMoved(card) }, [])
  const noteWriting = useCallback((value: PanelApi['writing']) => { setWriting(value) }, [])
```

4. Replace:

```ts
    () => ({ target, open, openNew, close, replace, reportDirty, guard, holdsEdits, moved, noteMoved }),
    [target, open, openNew, close, replace, reportDirty, guard, holdsEdits, moved, noteMoved],
```

with:

```ts
    () => ({ target, open, openNew, close, replace, reportDirty, guard, holdsEdits, moved, noteMoved, writing, noteWriting }),
    [target, open, openNew, close, replace, reportDirty, guard, holdsEdits, moved, noteMoved, writing, noteWriting],
```

In `frontend/src/content/panel/AiTools.tsx`:

1. Replace `export function AiTools({ post, dirty, onPost, onUseCopy }: {` with `export function AiTools({ post, dirty, onPost, onUseCopy, outside = null, onOutsideSeen }: {`.
2. Replace:

```tsx
  /** Put a rewrite into the text field, as an unsaved edit. */
  onUseCopy: (copy: string) => void
}) {
```

with:

```tsx
  /** Put a rewrite into the text field, as an unsaved edit. */
  onUseCopy: (copy: string) => void
  /** The AI writing this post from elsewhere ("Write with AI" from a template, spec 2026-10-16 §5.3): working, or the refusal's code. */
  outside?: { failed: string | null } | null
  /** That write is forgotten once the person uses a tool here. */
  onOutsideSeen?: () => void
}) {
```

3. Replace `  const writes = dirty || paused || busy !== null` with:

```tsx
  const working = outside !== null && outside.failed === null
  const writes = dirty || paused || busy !== null || working
  const [outsideKey, outsideText] = errorKey('ai', outside?.failed ?? 'unknown')
  const shownError = error ?? (outside?.failed ? t(outsideKey, outsideText) : null)
```

4. Replace:

```tsx
    setBusy(action)
    setError(null)
```

with:

```tsx
    setBusy(action)
    setError(null)
    if (outside) onOutsideSeen?.()
```

5. Replace `{busy !== null && <p role="status"` with `{(busy !== null || working) && <p role="status"`.
6. Replace `{error && <Notice tone="danger">{error}</Notice>}` with `{shownError && <Notice tone="danger">{shownError}</Notice>}`.

In `frontend/src/content/panel/PostFormFields.tsx`:

1. After `import { useTranslation } from 'react-i18next'` add `import { LayoutTemplate } from 'lucide-react'`.
2. Replace `import type { AudienceRef, PillarRef, Platform, PostStatus, Snippet } from '../lib/types'` with `import type { AudienceRef, PillarRef, Platform, PostStatus, Snippet, Template } from '../lib/types'`.
3. Replace `import { InsertMenu } from './InsertMenu'` with:

```tsx
import { PopMenu } from '../ui/PopMenu'
import { InsertMenu } from './InsertMenu'
import { applyTemplate, blanksIn, replacesText } from './templateApply'
```

4. Replace `export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale, industry, snippets }: {` with `export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale, industry, snippets, templates = [] }: {`.
5. Replace:

```tsx
  /** The brand's hashtag groups and snippets (spec 2026-10-15 §6). */
  snippets: Snippet[]
}) {
```

with:

```tsx
  /** The brand's hashtag groups and snippets (spec 2026-10-15 §6). */
  snippets: Snippet[]
  /** The brand's templates: the Template menu beside Topic (spec 2026-10-16 §5.3). */
  templates?: Template[]
}) {
```

6. Replace `  const tooMany = tooManyTags(form.platform, form.hashtags)` with:

```tsx
  const tooMany = tooManyTags(form.platform, form.hashtags)
  // Spec 2026-10-16 §5.3: the blanks still to fill (a quiet line; it never stops a save).
  const blanks = blanksIn(form)
  const pickTemplate = (id: string) => {
    const template = templates.find(tpl => String(tpl.id) === id)
    if (!template) return
    if (replacesText(form, template) && !window.confirm(t('content.panel.template_replace', 'Replace the words already written with this template?'))) return
    onChange(applyTemplate(form, template, pillars))
  }
```

7. Replace:

```tsx
      <FieldBox label={t('content.panel.fields.topic', 'Topic')} invalid={invalid.includes('topic')}>
        <input value={form.topic} maxLength={255} onChange={(e) => set('topic', e.target.value)} aria-invalid={bad('topic')} className={box('topic')} />
      </FieldBox>
```

with:

```tsx
      <div className="relative">
        <FieldBox label={t('content.panel.fields.topic', 'Topic')} invalid={invalid.includes('topic')}>
          <input value={form.topic} maxLength={255} onChange={(e) => set('topic', e.target.value)} aria-invalid={bad('topic')} className={box('topic')} />
        </FieldBox>
        <div className="absolute right-0 top-0">
          <PopMenu label={t('content.panel.template', 'Template')} onPick={pickTemplate}
            items={templates.map(tpl => ({ id: String(tpl.id), label: tpl.name, sub: [tpl.platform ? t(`content.platform.${tpl.platform}`, tpl.platform) : '', tpl.pillar_name ?? ''].filter(Boolean).join(' · ') || undefined }))}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
            <LayoutTemplate size={12} aria-hidden />{t('content.panel.template', 'Template')}
          </PopMenu>
        </div>
      </div>
```

8. Replace:

```tsx
      {tooMany && (
```

with:

```tsx
      {blanks.length > 0 && (
        <p data-blanks="" className="text-xs text-a-text-2">
          {t('content.panel.blanks', 'Blanks to fill: {{count}} — {{list}}', { count: blanks.length, list: blanks.join(', ') })}
        </p>
      )}
      {tooMany && (
```

In `frontend/src/content/panel/PostPanel.tsx`:

1. Replace `pillars={pillars} audiences={audiences} published={post?.status === 'published'} invalid={invalid} locale={locale} industry={boot.organization.industry} snippets={brandInfo.data?.snippets ?? []} />` with:

```tsx
pillars={pillars} audiences={audiences} published={post?.status === 'published'} invalid={invalid} locale={locale} industry={boot.organization.industry} snippets={brandInfo.data?.snippets ?? []}
            templates={brandInfo.data?.templates ?? []} />
```

2. Replace:

```tsx
            <AiTools post={post} dirty={dirty} onPost={adopt}
```

with:

```tsx
            <AiTools post={post} dirty={dirty} onPost={adopt}
              outside={panel.writing?.id === post.id ? panel.writing : null} onOutsideSeen={() => panel.noteWriting(null)}
```

In `frontend/src/content/panel/PostActions.tsx`:

1. Replace `import { CheckCircle2, Copy, CopyPlus, ExternalLink, Link2, Send, Trash2 } from 'lucide-react'` with `import { CheckCircle2, Copy, CopyPlus, ExternalLink, LayoutTemplate, Link2, Send, Trash2 } from 'lucide-react'`.
2. Replace `import { postLink } from '../lib/links'` with:

```tsx
import { TemplateEditor } from '../brand/sections/Templates'
import { templateFromPost } from '../brand/templateActions'
import { postLink } from '../lib/links'
import { useActiveStrategy } from '../lib/useActiveStrategy'
import { Dialog } from '../ui/Dialog'
```

3. Replace:

```tsx
  const [linkCopied, setLinkCopied] = useState(false)
```

with:

```tsx
  const [linkCopied, setLinkCopied] = useState(false)
  // "Save as template" (managers, spec 2026-10-16 §5.2): the editor filled from the post, its pillar by name.
  const [templating, setTemplating] = useState(false)
  const { strategy } = useActiveStrategy()
  const pillarName = post.pillar_id === null ? null : (strategy?.pillars.find(p => p.id === post.pillar_id)?.name ?? null)
```

4. Replace:

```tsx
        <Button size="sm" variant="ghost" disabled={waits} onClick={() => setConfirmDelete(true)}>
```

with:

```tsx
        {boot.staff.can_manage && (
          <Button size="sm" variant="secondary" disabled={waits} onClick={() => setTemplating(true)}>
            <LayoutTemplate size={14} aria-hidden />{t('content.panel.actions.save_template', 'Save as template')}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={waits} onClick={() => setConfirmDelete(true)}>
```

5. Replace:

```tsx
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
```

with:

```tsx
      {error && <Notice tone="danger">{error}</Notice>}
      {templating && (
        <Dialog title={t('content.panel.actions.save_template', 'Save as template')} onClose={() => setTemplating(false)}>
          <TemplateEditor template={null} initial={templateFromPost(post, pillarName)} onDone={() => setTemplating(false)} />
        </Dialog>
      )}
    </section>
```

- [ ] **Step 5: "+ → From a template…" — the picker and the Plan**

Write `frontend/src/content/plan/TemplatePicker.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { Channel, DateKey, PostDetail, Slot, Template } from '../lib/types'
import { useActiveStrategy } from '../lib/useActiveStrategy'
import { usePanel } from '../panel/PanelProvider'
import { createBody, newForm } from '../panel/panelState'
import { Dialog } from '../ui/Dialog'
import { usualTimes } from './addMath'
import { startPost, templateDraft, writeInto, type TemplateFlow } from './templateFlow'

/**
 * "+ → From a template…" (spec 2026-10-16 §5.3): the brand's templates, each with Use (a new post on the day, filled with
 * it) and Write with AI (the same post is made, then the AI writes it following the template while the panel shows it).
 */
export function TemplatePicker({ day, templates, slots, channels, onClose }: {
  day: DateKey
  templates: Template[]
  slots: Slot[]
  channels: Channel[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const panel = usePanel()
  const { strategy } = useActiveStrategy()
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paused = boot.ai.status === 'over'
  const industry = boot.organization.industry
  const draftFor = (template: Template) => templateDraft(day, template, slots, channels, industry, strategy?.pillars ?? [])
  const sub = (tpl: Template) =>
    [tpl.platform ? t(`content.platform.${tpl.platform}`, tpl.platform) : t('content.brand.templates.any_platform', 'Any platform'), tpl.pillar_name].filter(Boolean).join(' · ')

  const use = (template: Template) => { if (panel.openNew(draftFor(template))) onClose() }
  const writeAi = async (template: Template) => {
    const active = channels.filter(c => c.active).map(c => c.platform)
    const body = createBody(newForm(draftFor(template), boot.platforms, active, usualTimes(channels, industry)))
    const flow: TemplateFlow = {
      api,
      panel,
      keep: (post: PostDetail) => {
        queryClient.setQueryData(['content', brand, 'post', post.id], post)
        void refreshLists(queryClient, brand)
      },
    }
    setBusy(template.id)
    setError(null)
    try {
      const post = await startPost(flow, body)
      onClose()
      void writeInto(flow, post.id, template.id)
    } catch (e) {
      const [key, text] = errorKey('save', failureOf(e).code)
      setError(t(key, text))
      setBusy(null)
    }
  }

  return (
    <Dialog title={t('content.templates.pick_title', 'Choose a template')} onClose={onClose} busy={busy !== null}>
      <div className="space-y-3">
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {templates.map(tpl => (
            <li key={tpl.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-a-border p-2.5">
              <div className="min-w-0 grow basis-40">
                <p className="truncate text-sm font-semibold text-a-text">{tpl.name}</p>
                <p className="truncate text-xs text-a-text-2">{sub(tpl)}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => use(tpl)}>{t('content.templates.use', 'Use')}</Button>
                <Button size="sm" variant="secondary" disabled={paused || busy !== null} loading={busy === tpl.id} onClick={() => { void writeAi(tpl) }}>
                  <Sparkles size={14} aria-hidden />{t('content.templates.write_ai', 'Write with AI')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {paused && <p className="text-xs text-a-text-2">{t('content.ai.error.ai_budget_used_up', "This month's AI budget is used up. Writing by hand still works.")}</p>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  )
}
```

In `frontend/src/content/plan/PlanPage.tsx`:

1. After `import { KeyDayCard } from './KeyDayCard'` add `import { TemplatePicker } from './TemplatePicker'`.
2. Replace:

```tsx
  const [keyDateEdit, setKeyDateEdit] = useState<{ kind: OwnKind; keyDate: OwnKeyDate | null; day: DateKey } | null>(null)
```

with:

```tsx
  const [keyDateEdit, setKeyDateEdit] = useState<{ kind: OwnKind; keyDate: OwnKeyDate | null; day: DateKey } | null>(null)
  // "+ → From a template…" (spec 2026-10-16 §5.3): the day the picker is open for.
  const [picking, setPicking] = useState<DateKey | null>(null)
```

3. Replace:

```tsx
  const times = useMemo(() => usualTimes(channels, industry), [channels, industry])
```

with:

```tsx
  const times = useMemo(() => usualTimes(channels, industry), [channels, industry])
  const templates = brandInfo.data?.templates ?? []
```

4. Replace:

```tsx
    // "From a template…" (offered only when the brand has templates) opens the template picker (spec 2026-10-16 §5.3).
    if (choice === 'template') return
```

with:

```tsx
    // "From a template…" (offered only when the brand has templates) opens the template picker (spec 2026-10-16 §5.3).
    if (choice === 'template') {
      setPicking(day)
      return
    }
```

5. With the Edit tool's `replace_all`, replace `observed={observed} onKeyDate={onKeyDate}` with `observed={observed} onKeyDate={onKeyDate} templates={templates.length > 0}` (three places: the week, the month and the list).
6. Replace:

```tsx
      {keyDateEdit && <KeyDateEditor kind={keyDateEdit.kind} keyDate={keyDateEdit.keyDate} day={keyDateEdit.day} onClose={() => setKeyDateEdit(null)} />}
```

with:

```tsx
      {keyDateEdit && <KeyDateEditor kind={keyDateEdit.kind} keyDate={keyDateEdit.keyDate} day={keyDateEdit.day} onClose={() => setKeyDateEdit(null)} />}
      {picking && <TemplatePicker day={picking} templates={templates} slots={data?.slots ?? []} channels={channels} onClose={() => setPicking(null)} />}
```

- [ ] **Step 6: The words, and the count rule**

Write `$R4B/t10-words.json` with the Write tool:

```json
{
  "panel.template": { "en": "Template", "ru": "Шаблон", "de": "Vorlage", "fr": "Modèle", "es": "Plantilla" },
  "panel.template_replace": { "en": "Replace the words already written with this template?", "ru": "Заменить уже написанный текст этим шаблоном?", "de": "Den bereits geschriebenen Text durch diese Vorlage ersetzen?", "fr": "Remplacer les mots déjà écrits par ce modèle ?", "es": "¿Reemplazar el texto ya escrito por esta plantilla?" },
  "panel.blanks": { "en": "Blanks to fill: {{count}} — {{list}}", "ru": "Пропуски: {{count}} — {{list}}", "de": "Auszufüllende Lücken: {{count}} — {{list}}", "fr": "Blancs à remplir : {{count}} — {{list}}", "es": "Huecos por rellenar: {{count}} — {{list}}" },
  "panel.actions.save_template": { "en": "Save as template", "ru": "Сохранить как шаблон", "de": "Als Vorlage speichern", "fr": "Enregistrer comme modèle", "es": "Guardar como plantilla" },
  "templates.pick_title": { "en": "Choose a template", "ru": "Выберите шаблон", "de": "Vorlage wählen", "fr": "Choisir un modèle", "es": "Elige una plantilla" },
  "templates.use": { "en": "Use", "ru": "Использовать", "de": "Verwenden", "fr": "Utiliser", "es": "Usar" },
  "templates.write_ai": { "en": "Write with AI", "ru": "Написать с ИИ", "de": "Mit KI schreiben", "fr": "Écrire avec l’IA", "es": "Escribir con IA" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node "$R4B/words.mjs" "$R4B/t10-words.json"
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
    const COUNTED = ['plan.goals.at_risk', 'plan.goals.streak', 'panel.repeat.copies', 'panel.repeat.stop_confirm', 'brand.channels.per_week', 'ideas.see_all']
```

with:

```ts
    const COUNTED = ['plan.goals.at_risk', 'plan.goals.streak', 'panel.repeat.copies', 'panel.repeat.stop_confirm', 'brand.channels.per_week', 'ideas.see_all', 'panel.blanks']
```

- [ ] **Step 7: Run the tests, the content suite and the types**

```bash
"$R4B/vt.sh" src/content && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
```

Expected: every content test passes (`templateApply.test.ts` 4, `templateFlow.test.ts` 4, `templatePanel.test.tsx` 5, the new AiTools test); `TSC-CLEAN`.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -m "Content portal: templates in the panel (Template menu, blanks, Save as template) and from a day's +" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 11: The runbook — release 4a's portal

**Files:**
- Modify: `docs/content-workspace.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Add the portal's release-4a rules**

In `docs/content-workspace.md`, replace:

```markdown
- **Repeat**: in the panel of a saved post with a day; the limits (26 copies, 12 months, 12 AI copies) are checked
  before sending (`panel/repeatMath.ts` mirrors `ContentRepeat`); the panel reads its post every 5 s while the AI
  rewords the series, and the Plan with it.
```

with:

```markdown
- **Repeat**: in the panel of a saved post with a day; the limits (26 copies, 12 months, 12 AI copies) are checked
  before sending (`panel/repeatMath.ts` mirrors `ContentRepeat`); the panel reads its post every 5 s while the AI
  rewords the series, and the Plan with it.
- **Key dates** (release 4a): each day's chips above its posts (week, list; the month shows the first and "+N"); a
  holiday's card offers "Write a post for it" from today on; an event or note opens its editor (anyone on the team; an
  event lasts 31 days at most). The toolbar's Key dates switch is remembered on the device (`content:plan`). Day names
  come from the bundles under `keydates.day.<id>`; `tests/Unit/Content/DayWordsTest.php` ties them to `DayNames::EN`.
  A United States substitute day says "observed", elsewhere "day off in lieu". Brand → Key dates: the country (or none,
  or the guess) and the marketing switch, managers only.
- **The day's "+"** is a menu — New post · From a template… (when the brand has templates) · Note · Event — on one
  shared component (`ui/PopMenu.tsx`, also Insert, the Template menu and "Move to…"); a day's empty space still starts
  a post at once.
- **Ideas** (`/content/ideas`): the posts without a day by stage (Idea, Draft, In review, Ready); a card moves by drag,
  Shift + ← / → or "Move to…"; Schedule puts it on the Plan with Undo; past 50 a stage links to the Posts page. Quick
  capture: the Idea stage's line, Find's "Add an idea" and the I key.
- **Templates**: Brand → Templates (managers keep them; everyone reads them; AI suggestions save nothing until Add);
  the panel's Template menu beside Topic (asks before replacing written words), the blanks line, managers' "Save as
  template"; "+ → From a template…" with Use and Write with AI (the panel shows the AI working).
```

and replace:

```markdown
  that never chose a country gets a guess (the organisation's country, else the venue's time zone); `none` means no
```

with:

```markdown
  that never chose a country gets a guess (the organisation's country, else the venue time zone's own country, legacy
  names such as `GB` and `US/Eastern` included); `none` means no
```

and after the line that begins `  (404 before release 4a); the \`ContentApp\` chunk carries` add:

```markdown
- After the deploy (owner): on a real brand, check the guessed country on Brand → Key dates, add one event, capture
  one idea with I and schedule it, add one template and use it from a day's "+"; reload admin tabs left open.
```

and in "## What this release does not do", replace `No approvals, no publishing to social networks,` with `No approvals yet (release 4b), no publishing to social networks,`.

- [ ] **Step 2: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -F - <<'EOF'
Runbook: release 4a's portal — key dates, the + menu, Ideas, templates; the owner's checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 12: The release checks

The spec's checks (§10) on the finished branch, before the final whole-branch review (whose fix pass, if it changes the portal, runs Steps 1–3 and the touched pass checks again) and before anything is deployed. This task writes only to `$R4B` (git-ignored), to the local database (a temporary brand, removed at the end) and, for each defect a check finds, to the branch: every such fix goes in test-first (a test that fails, then passes) with a ledger line `Task 12: fixed <what> — <test> RED→GREEN`, and its own commit.

**Files:**
- Create (all under `$R4B`): `pass-seed.php`, `pass-unseed.php`, `tools/` (a copy of release 3B's tools) with a new `tools/pass.mjs`, `final-vitest.txt`, `final-php.txt`, `build.txt`, `lighthouse.md`, `eyes.md`, `keys-base.txt`, `keys-new.txt`
- Temporary: a base worktree `C:\wamp64\www\Hexa-Tech-content-base` (origin/main), local servers on :8012 (API), :5173 (Vite), :8099 (Lighthouse sign-in); all undone in Step 10.

**Interfaces:**
- Consumes: everything Plans 4A-1 and 4A-2 built.
- Produces: the evidence Task 13's question to the owner quotes (suite lines, build lines, `46 screens, 0 differ`, Lighthouse scores, the pass's PASS lines).

- [ ] **Step 1: The frontend suites**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R4B/final-vitest.txt" 2>&1; tail -6 "$R4B/final-vitest.txt"; grep -E '^ FAIL ' "$R4B/final-vitest.txt" | sed 's/ >.*//' | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; `Tests  3 failed | … passed`, the only `FAIL` file `src/lib/plannerMeta.test.ts`; the lint ends `✖ 17 problems (17 errors, 0 warnings)`. Ledger: `Task 12: note: vitest <n> passed, 3 baseline failures; tsc clean; lint baseline`.

- [ ] **Step 2: Every PHP suite, by folder**

```bash
cd /c/wamp64/www/Hexa-Tech-content && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R4B/php-paths.txt"; wc -l < "$R4B/php-paths.txt"; rm -f "$R4B/final-php.txt"
"$R4B/php.sh" $(sed -n 1,10p "$R4B/php-paths.txt") | tee -a "$R4B/final-php.txt"      # then 11,20p, 21,30p … to the end, one call each
grep -v "exit 0" "$R4B/final-php.txt"; echo "(nothing above: every path green)"
```

Expected: one line per path (about 72), each `Tests: … passed` and `exit 0`; `tests/Feature/Content/`, `tests/Unit/Content/`, `tests/Feature/ContentCalendar/`, `tests/Feature/AdminAccess/` and `tests/Feature/Appointments/` among them. A failing path: if its test or the code it covers is in this release's change list (`git diff --name-only d11056743 HEAD`), it is ours — fix it test-first, commit, run the path again. If neither is, run it once more alone (this suite has crashes that pass on a second run); if it still fails, ledger `Task 12: note: pre-existing failure <path> <test> — not in the change list` (it goes to the owner and does not block).

- [ ] **Step 3: The build check**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx vite build --outDir "$R4B/build" --emptyOutDir > "$R4B/build.txt" 2>&1; echo "build exit $?"
cd "$R4B/build/assets" && ls ContentApp-*.js AppointmentsApp-*.js
for w in 'Blanks to fill' 'Suggest templates with AI' 'Marketing and international days' 'Add an idea'; do printf '%s: ' "$w"; grep -l "$w" *.js | tr '\n' ' '; echo; done
grep -l "data-content\|data-appointments" index-*.js; echo "(no index file listed above)"
cd /c/wamp64/www/Hexa-Tech-content && git checkout -- frontend/dist/stats.html && rm -rf "$R4B/build" && git status --short
```

Expected: `build exit 0`; one `ContentApp-*.js` and one `AppointmentsApp-*.js`; each phrase found only in `ContentApp-*.js`; nothing listed for the index; `git status --short` prints nothing (the visualizer rewrites `frontend/dist/stats.html` whatever the `outDir`; it is restored).

- [ ] **Step 4: Appointments, pixel for pixel, against what is live — no difference**

The base is what production runs now (`origin/main`). Release 4a adds no dependency, so the base borrows the branch's `node_modules` through a junction.

```bash
cd /c/wamp64/www/Hexa-Tech-content && git fetch -q origin && git log -1 --format='%h %s' origin/main
git diff --quiet origin/main HEAD -- frontend/package.json frontend/package-lock.json && echo SAME-DEPS
git worktree add --detach ../Hexa-Tech-content-base origin/main
mkdir -p "$R4B/tools" && cp -r .superpowers/sdd/archive/2026-10-15-content-release-3b/tools/. "$R4B/tools/"
netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'; echo "ports above must be empty"
```

Expected: origin/main is `7b4b96191` (or a later commit the ledger names); `SAME-DEPS`. On `ENOSPC`, stop and report it. Then in PowerShell:

```powershell
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

In `$R4B/tools/pixels.mjs` (Edit tool): replace

```js
/** Which tree served the page: only the branch has content/lib/bestTimes.ts (release 3); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/content/lib/bestTimes.ts')
```

with

```js
/** Which tree served the page: only the branch has content/ideas/IdeasPage.tsx (release 4a); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/content/ideas/IdeasPage.tsx')
```

and change `const TOKEN_NAME = 'content-r3b-pixels'` to `const TOKEN_NAME = 'content-r4a-pixels'`.

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
cd "$R4B/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture base && node pixels.mjs capture control && node pixels.mjs compare base control | tail -1
node pixels.mjs keys | tee "$R4B/keys-base.txt" | tail -3
```

Expected: `46 screens, 0 differ` (the method is deterministic) and every keys line `PASS`. If `capture` stops with "no appointment with a client on 2026-09-30", pick a day that has one, use it for every run, and ledger it.

Stop the base Vite (TaskStop); `netstat -ano | grep ':5173 .*LISTENING'` must print nothing (a leftover node PID: check its command line names `Hexa-Tech-content-base`, then `taskkill //PID <pid> //F`). Start the BRANCH's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

```bash
cd "$R4B/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture new; node pixels.mjs compare base new | grep -E '^(DIFF|SIZE|MISSING)|screens'
node pixels.mjs keys | tee "$R4B/keys-new.txt" | tail -3; diff "$R4B/keys-base.txt" "$R4B/keys-new.txt" && echo KEYS-SAME
```

Expected: `46 screens, 0 differ` (release 4a changes nothing in Appointments or the shared workspace core); `KEYS-SAME`. Any differing screen is a defect of this release: find the change (`git diff d11056743 HEAD -- frontend/src/workspace frontend/src/appointments` must print nothing), fix it, capture `new` again. Keep the branch's Vite and the API running for Steps 5–6.

- [ ] **Step 5: The browser pass that writes for real**

It runs on local org 16, on a temporary brand that is already set up, as the manager `appointments-tester@example.test`. Write the two PHP files with the Write tool.

`$R4B/pass-seed.php`:

```php
<?php
// Plan 4A-2 browser pass: a set-up brand on local org 16 — Instagram every day (usual time 08:30), LinkedIn on Tuesday
// and Thursday; the United Kingdom's holidays and the marketing days; one template with two blanks; one idea without a
// day. pass-unseed.php removes the brand and everything under it.
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$org = 16;
$name = 'Release check 4a: key dates, ideas and templates';
if (DB::table('brands')->where('organization_id', $org)->where('name', $name)->exists()) { echo "EXISTS\n"; return; }
$now = now();
$today = Carbon\CarbonImmutable::now(App\Services\Appointments\VenueClock::zone($org));
$brand = DB::table('brands')->insertGetId([
    'organization_id' => $org, 'name' => $name, 'slug' => 'release-check-r4a', 'widget_token' => Str::random(32),
    'is_default' => false, 'sort_order' => 99, 'created_at' => $now, 'updated_at' => $now,
]);
// The planner models take the tenant from the container, as a request would.
app()->instance('current_organization_id', $org);
app()->instance('current_brand_id', $brand);
$profile = App\Models\ContentPlannerProfile::create(['name' => $name, 'brand_id' => $brand, 'default_language' => 'en', 'setup_completed_at' => $now]);
DB::table('content_planner_profiles')->where('id', $profile->id)->update(['holiday_country' => 'GB', 'marketing_days' => true]);
$days = fn (array $on) => array_merge(array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], false), array_fill_keys($on, true));
App\Models\ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'label' => 'Release check Instagram', 'active' => true, 'frequency' => $days(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), 'posts_per_week' => 3, 'post_time' => '08:30']);
App\Models\ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'linkedin', 'label' => 'Release check LinkedIn', 'active' => true, 'frequency' => $days(['tue', 'thu']), 'posts_per_week' => 1]);
App\Models\ContentPlannerTemplate::create(['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'name' => 'Release check offer', 'platform' => 'instagram',
    'hook' => 'Book your [treatment] before [date]', 'main_copy' => 'Our [treatment] is back for the season.', 'cta' => 'Book now', 'hashtags' => ['#releasecheck']]);
App\Models\ContentPlannerPost::create(['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'status' => 'idea',
    'topic' => 'Release check idea', 'language' => 'en', 'generated_by' => 'manual', 'hashtags' => []]);
echo "BRAND {$brand} PROFILE {$profile->id} TODAY {$today->toDateString()}\n";
```

`$R4B/pass-unseed.php`:

```php
<?php
// Removes the release-check brand that pass-seed.php made, and every Content row under it (profile, channels, key dates,
// templates, snippets, posts and their copies, and what an AI call added).
use Illuminate\Support\Facades\DB;

$brand = DB::table('brands')->where('organization_id', 16)->where('name', 'Release check 4a: key dates, ideas and templates')->value('id');
if (!$brand) { echo "NOTHING\n"; return; }
$profiles = DB::table('content_planner_profiles')->where('brand_id', $brand)->pluck('id');
$posts = DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->pluck('id');
DB::table('content_planner_visual_briefs')->whereIn('post_id', $posts)->delete();
DB::table('content_planner_post_variations')->whereIn('post_id', $posts)->delete();
DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->delete();
foreach (['content_planner_ai_generations', 'content_planner_channels', 'content_planner_key_dates', 'content_planner_templates', 'content_planner_snippets', 'content_planner_brand_voices', 'content_planner_audiences', 'content_planner_pillars', 'content_planner_strategies'] as $table) {
    DB::table($table)->whereIn('planner_profile_id', $profiles)->delete();
}
DB::table('content_planner_profiles')->whereIn('id', $profiles)->delete();
DB::table('brands')->where('id', $brand)->delete();
echo "REMOVED brand {$brand}, profiles {$profiles->count()}, posts {$posts->count()}\n";
```

Write `$R4B/tools/pass.mjs` with the Write tool (it replaces release 3B's):

```js
// Plan 4A-2 release check (Task 12): one browser pass that writes for real on local org 16, on a temporary brand made by
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
const TOKEN_NAME = 'content-r4a-pass'
const BRAND_NAME = 'Release check 4a: key dates, ideas and templates'
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')

const tinker = code => execFileSync(PHP, ['artisan', 'tinker', `--execute=${code}`], { cwd: BACKEND, encoding: 'utf8' })
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
/** Monday 0 … Sunday 6. */
const weekday = day => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
const mondayOf = day => addDays(day, -weekday(day))
/** The fourth Thursday of November (the United States' Thanksgiving). */
function thanksgiving(year) {
  const first = `${year}-11-01`
  return addDays(first, ((3 - weekday(first) + 7) % 7) + 21)
}

const results = []
const consoleErrors = []
const dialogs = []
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
  page.on('dialog', d => { dialogs.push(d.message()); void d.accept() })
  return { context, page }
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const ready = page => page.getByRole('button', { name: 'New post' }).first().waitFor({ timeout: 30_000 })
const panel = page => page.locator('[data-panel]')
const section = (page, name) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })
const menu = page => page.locator('[data-menu] ul')
async function openPlus(page, day) {
  await page.locator(`[data-drop-date="${day}"]`).hover()
  await page.locator(`[data-add="${day}"]`).click()
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const brand = brandId()
  if (!brand) throw new Error('no release-check brand: run pass-seed.php first')
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--font-render-hinting=none'] })
  const manager = mint(MANAGER)
  try {
    const today = (await api(manager, `bootstrap?brand_id=${brand}`)).venue.today
    const year = Number(today.slice(0, 4)) + (today.slice(5) > '12-20' ? 1 : 0)
    const xmas = `${year}-12-25`
    const ahead = addDays(today, 2)
    const keyDatesOf = async (from, to) => (await api(manager, `plan?brand_id=${brand}&from=${from}&to=${to}`)).key_dates ?? []
    const postOf = async id => (await api(manager, `posts/${id}?brand_id=${brand}`)).post

    // Key dates on the Plan: the United Kingdom's Christmas.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${xmas}`)
      await ready(page)
      const christmas = page.locator('[data-keydate="holiday"][aria-label="Public holiday: Christmas Day"]')
      record('K1 the week of Christmas shows Christmas Day and Boxing Day as public holidays', await until(async () =>
        (await christmas.count()) === 1 && (await page.locator('[data-keydate="holiday"][aria-label^="Public holiday: Boxing Day"]').count()) >= 1))
      await shot(page, 'plan-christmas-week')
      await christmas.click()
      const card = page.getByRole('dialog', { name: 'Christmas Day' })
      record('K2 a holiday opens its card with "Write a post for it"', await until(() => card.getByRole('button', { name: 'Write a post for it' }).isVisible()))
      await shot(page, 'keyday-card')
      await card.getByRole('button', { name: 'Write a post for it' }).click()
      record('K3 "Write a post for it" opens a new post on the day, the day as its topic', await until(async () =>
        (await panel(page).locator('input[type="date"]').first().inputValue()) === xmas && (await panel(page).getByLabel('Topic', { exact: true }).inputValue()) === 'Christmas Day'))
      await panel(page).getByRole('button', { name: 'Close' }).click()
      await until(async () => (await panel(page).count()) === 0)
      const toggle = page.getByRole('button', { name: 'Key dates' })
      await toggle.click()
      record('K4 the Key dates switch hides the chips', await until(async () => (await page.locator('[data-keydate]').count()) === 0))
      await page.reload()
      await ready(page)
      record('K5 the switch is remembered on this device', await until(async () => (await toggle.getAttribute('aria-pressed')) === 'false' && (await page.locator('[data-keydate]').count()) === 0))
      await toggle.click()
      record('K6 switched back on, the chips return', await until(async () => (await christmas.count()) === 1))
      await context.close()
    }
    // The day's "+" menu: a note, an event over three days, a post from a template.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${ahead}`)
      await ready(page)
      await openPlus(page, ahead)
      const item = name => menu(page).getByRole('button', { name, exact: true })
      record('P1 the "+" offers New post, From a template…, Note and Event', await until(async () =>
        (await item('New post').isVisible()) && (await item('From a template…').isVisible()) && (await item('Note').isVisible()) && (await item('Event').isVisible())))
      await shot(page, 'plus-menu')
      await item('Note').click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel(/^Title/).fill('Release check note')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      record('P2 "+ → Note" saves a note on its day, shown as a chip', await until(async () => (await keyDatesOf(ahead, ahead)).some(k => k.kind === 'note' && k.title === 'Release check note'))
        && await until(async () => (await page.locator('[data-keydate="note"][aria-label="Note: Release check note"]').count()) === 1))
      const start = addDays(today, 3)
      const end = addDays(today, 5)
      await page.goto(`${APP}/content?date=${start}`)
      await ready(page)
      await openPlus(page, start)
      await item('Event').click()
      await dialog.getByLabel(/^Title/).fill('Release check event')
      await dialog.getByLabel('Last day (optional)').fill(end)
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      const shown = [start, addDays(start, 1), end].filter(d => mondayOf(d) === mondayOf(start)).length
      record('P3 "+ → Event" for three days shows on each of them in the week', await until(async () => (await keyDatesOf(start, end)).some(k => k.kind === 'event' && k.end === end))
        && await until(async () => (await page.locator('[data-keydate="event"]').count()) === shown), `${shown} in this week`)
      await shot(page, 'plan-event')
      await openPlus(page, start)
      await item('From a template…').click()
      const picker = page.getByRole('dialog', { name: 'Choose a template' })
      await picker.getByRole('listitem').filter({ hasText: 'Release check offer' }).getByRole('button', { name: 'Use', exact: true }).click()
      record('P4 "+ → From a template… → Use" opens a new post with the template’s words', await until(async () =>
        (await panel(page).getByLabel('Hook', { exact: true }).inputValue()) === 'Book your [treatment] before [date]'))
      record('P5 the panel says which blanks are left', await until(() => panel(page).getByText('Blanks to fill: 2 — [treatment], [date]').isVisible()))
      await shot(page, 'panel-template-blanks')
      await context.close()
    }
    // The panel's Template menu on a new post.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${ahead}`)
      await ready(page)
      await page.getByRole('button', { name: 'New post' }).first().click()
      const templateMenu = panel(page).getByRole('button', { name: 'Template', exact: true })
      await templateMenu.click()
      await panel(page).getByRole('button', { name: /Release check offer/ }).click()
      record('T1 the panel’s Template menu fills a new post', await until(async () => (await panel(page).getByLabel('Call to action', { exact: true }).inputValue()) === 'Book now'))
      await panel(page).getByLabel('Hook', { exact: true }).fill('My own hook')
      const asked = dialogs.length
      await templateMenu.click()
      await panel(page).getByRole('button', { name: /Release check offer/ }).click()
      record('T2 over written words it asks first, then replaces them', await until(async () =>
        dialogs.slice(asked).some(m => m.includes('Replace the words already written')) && (await panel(page).getByLabel('Hook', { exact: true }).inputValue()) === 'Book your [treatment] before [date]'))
      await context.close()
    }
    // Brand: the Key dates section, then a template.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content/brand`)
      const keyDates = section(page, 'Key dates')
      await keyDates.waitFor({ timeout: 30_000 })
      const country = keyDates.getByLabel('Public holidays of')
      record('B1 Key dates shows the country chosen', (await country.inputValue()) === 'GB')
      await keyDates.scrollIntoViewIfNeeded()
      await shot(page, 'brand-keydates')
      await country.selectOption('US')
      record('B2 a manager switches the holidays to the United States', await until(async () => (await api(manager, `brand?brand_id=${brand}`)).profile?.holiday_country === 'US'))
      let tg = thanksgiving(Number(today.slice(0, 4)))
      if (tg < today) tg = thanksgiving(Number(today.slice(0, 4)) + 1)
      record('B3 the Plan then carries Thanksgiving Day', await until(async () => (await keyDatesOf(tg, tg)).some(k => k.id === 'us.thanksgiving')), tg)
      await keyDates.getByRole('switch', { name: 'Marketing and international days' }).click()
      record('B4 the marketing switch goes off', await until(async () => (await api(manager, `brand?brand_id=${brand}`)).profile?.marketing_days === false))
      const templates = section(page, 'Templates')
      await templates.getByRole('button', { name: 'Add a template' }).click()
      await templates.getByLabel(/^Name/).fill('Release check welcome')
      await templates.getByLabel('Hook', { exact: true }).fill('Welcome to [venue]')
      await templates.getByRole('button', { name: 'Save', exact: true }).click()
      record('B5 a manager adds a template', await until(async () => (await api(manager, `brand?brand_id=${brand}`)).templates?.some(t => t.name === 'Release check welcome')))
      await templates.scrollIntoViewIfNeeded()
      await shot(page, 'brand-templates')
      await context.close()
    }
    // Ideas: the board, quick capture, a keyboard move, a drag, Schedule and Undo.
    {
      const { context, page } = await session(browser, manager, { brand })
      const idea = ((await api(manager, `posts?brand_id=${brand}&q=${encodeURIComponent('Release check idea')}`)).data ?? [])[0]
      await page.goto(`${APP}/content/ideas`)
      record('I1 the Ideas page shows the idea in the Idea stage', await until(() => page.locator('[data-column="idea"]').getByText('Release check idea').isVisible()))
      const capture = page.getByLabel('Add an idea…')
      await capture.fill('Release check captured')
      await capture.press('Enter')
      const board = () => api(manager, `ideas?brand_id=${brand}`)
      record('I2 quick capture adds an idea and keeps the line for the next', await until(async () => (await board()).columns.idea.posts.some(p => p.topic === 'Release check captured'))
        && await until(async () => (await capture.inputValue()) === '' && await capture.evaluate(el => el === document.activeElement)))
      await shot(page, 'ideas-board')
      await page.locator(`[data-ideas] [data-post="${idea.id}"]`).focus()
      await page.keyboard.press('Shift+ArrowRight')
      record('I3 Shift+→ moves a focused card to Draft, and the focus follows it', await until(async () => (await postOf(idea.id))?.status === 'draft')
        && await until(() => page.locator(`[data-column="draft"] [data-post="${idea.id}"]`).evaluate(el => el === document.activeElement)))
      const captured = (await board()).columns.idea.posts.find(p => p.topic === 'Release check captured')
      await page.locator(`[data-ideas] li:has([data-post="${captured.id}"])`).dragTo(page.locator('[data-column="ready"]'))
      record('I4 a card dragged to Ready becomes ready to publish', await until(async () => (await postOf(captured.id))?.status === 'ready_to_publish'))
      await page.locator(`[data-column="draft"] li:has([data-post="${idea.id}"])`).getByRole('button', { name: 'Schedule', exact: true }).click()
      const schedule = page.getByRole('dialog', { name: 'Schedule this post' })
      await schedule.locator('input[type="date"]').fill(addDays(today, 4))
      await schedule.getByRole('button', { name: 'Schedule', exact: true }).click()
      record('I5 Schedule puts the post on the Plan', await until(async () => (await postOf(idea.id))?.scheduled_date === addDays(today, 4)))
      await page.getByRole('button', { name: 'Undo' }).click()
      record('I6 Undo puts it back on the board', await until(async () => (await postOf(idea.id))?.scheduled_date === null))
      await context.close()
    }
    // I, anywhere: the capture box.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${today}`)
      await ready(page)
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
      await page.keyboard.press('i')
      const box = page.getByRole('dialog', { name: 'Add an idea' })
      record('I7 the I key opens the capture box, its line focused', await until(async () =>
        (await box.isVisible()) && await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Add an idea…')))
      await shot(page, 'capture-dialog')
      await page.keyboard.type('Release check from I')
      await page.keyboard.press('Enter')
      record('I8 an idea typed there is added', await until(async () => (await api(manager, `ideas?brand_id=${brand}`)).columns.idea.posts.some(p => p.topic === 'Release check from I')))
      await page.keyboard.press('Escape')
      await context.close()
    }
    // Phones: the Ideas page in English; Ideas and Key dates in Russian.
    {
      const phone = await session(browser, manager, { brand, width: 390, height: 844, mobile: true })
      await phone.page.goto(`${APP}/content/ideas`)
      await phone.page.getByRole('group', { name: 'Stage' }).waitFor({ timeout: 30_000 })
      record('M1 on a phone the Ideas page shows one stage with a switch, nothing off the screen', await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      await shot(phone.page, 'ideas-phone')
      await phone.page.goto(`${APP}/content?date=${xmas}`)
      await ready(phone.page)
      await shot(phone.page, 'plan-phone-christmas')
      await phone.context.close()
    }
    {
      const phone = await session(browser, manager, { brand, lang: 'ru', width: 390, height: 844, mobile: true })
      await phone.page.goto(`${APP}/content/ideas`)
      await phone.page.getByRole('group', { name: 'Этап' }).waitFor({ timeout: 30_000 })
      const ideasFit = await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      await shot(phone.page, 'ideas-ru-phone')
      await phone.page.goto(`${APP}/content/brand`)
      const title = phone.page.getByText('Ключевые даты').first()
      await title.waitFor({ timeout: 30_000 })
      await title.scrollIntoViewIfNeeded()
      const brandFit = await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      await shot(phone.page, 'brand-keydates-ru-phone')
      record('M2 Ideas and Key dates fit a phone in Russian, nothing off the screen', ideasFit && brandFit)
      await phone.context.close()
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
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R4B/pass-seed.php" | tail -1
cd "$R4B/tools" && node pass.mjs | tee "$R4B/pass.txt" | tail -35
```

Expected: the jobs count noted (ledger it); `BRAND <id> PROFILE <id> TODAY <date>`; every line `PASS`, `console errors: 0`, `28 checks, 0 failed`. A FAIL: read the line and the screenshot; a defect of the portal is fixed test-first (a component or helper test that fails, then passes), committed, and the pass run again (run `pass-unseed.php` and `pass-seed.php` first, so it starts from the same brand). A defect of the script (a selector the page does not have, a wait that is too short) is fixed in the script and ledgered `Task 12: Ruling: pass script <what> — <why the page is right>`.

- [ ] **Step 6: Lighthouse accessibility on the Plan, Ideas, Brand and the panel**

In `$R4B/tools/token-server.mjs` (copied from 3B in Step 4; Edit tool): change `const NAME = 'content-r3b-lighthouse'` to `const NAME = 'content-r4a-lighthouse'` and `const BRAND_NAME = 'Release check 3: hashtags, repeats and goals'` to `const BRAND_NAME = 'Release check 4a: key dates, ideas and templates'`.

The release-check brand from Step 5 is still there. Start `node "$R4B/tools/token-server.mjs"` in the background (it prints only `serving on 127.0.0.1:8099`). Load the chrome-devtools tools with ToolSearch (`select:` the `new_page`, `navigate_page`, `evaluate_script`, `take_snapshot`, `click`, `wait_for` and `lighthouse_audit` tools of `mcp__plugin_chrome-devtools-mcp_chrome-devtools`), then:

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

2. `navigate_page` to `http://localhost:5173/content?date=<the Christmas date from the pass>` (chips on screen), `wait_for` the text `Christmas Day`, then `lighthouse_audit` (desktop; accessibility is the category that counts).
3. `navigate_page` to `http://localhost:5173/content/ideas`, `wait_for` `In review`, audit.
4. `take_snapshot`, `click` a card's `button` (the one naming "Release check from I"), and audit again in the tool's snapshot mode (the page as it is, panel open, the Template menu in it). If the tool offers no snapshot mode, ledger `Task 12: note: Lighthouse has no snapshot mode here — the panel is covered by its component tests and the page audits` and go on.
5. `navigate_page` to `http://localhost:5173/content/brand`, `wait_for` `Templates`, audit.

Then stop the token server (TaskStop) and run `node "$R4B/tools/token-server.mjs" drop` → `dropped`.

Write `$R4B/lighthouse.md`: per page the accessibility score and every failing audit with its elements. Expected: no failing audit the portal can fix. Each one it can is a defect: fix it test-first (a component test that renders the element and checks the missing name, role or contrast token), commit, and audit that page again. One the portal cannot fix (a browser extension, the dev server's overlay) gets `Task 12: Ruling: <audit> — <why it is not the portal's> — <cost if wrong>`. No conformance is claimed.

- [ ] **Step 7: Eyes**

Open every screenshot in `$R4B/shots/pass/` with the Read tool and write one line each in `$R4B/eyes.md`:
- `plan-christmas-week.png`: the chips under each day's name (Christmas Eve, Christmas Day, Boxing Day…), their icons, nothing overlapping the posts or the day's "+".
- `keyday-card.png`: the card with the day's name, "Public holiday · Friday 25 December …" and "Write a post for it".
- `plus-menu.png`: the menu under the "+", four items, inside the day column or overlapping its neighbour cleanly (never cut by the grid).
- `plan-event.png`: the event's chip on each day it covers this week, the note's chip on its day.
- `panel-template-blanks.png`: the new post with the template's hook, text and call to action; the blanks line under the fields; Template beside Topic.
- `brand-keydates.png`: Key dates after Channels — the country select, the "United Kingdom" line, the switch.
- `brand-templates.png`: Templates after Hashtags and snippets — the two templates, platform · pillar lines, Suggest with AI.
- `ideas-board.png`: four stages at 1440, the capture line on top of Idea, cards with platform, words, age, Schedule and Move to….
- `capture-dialog.png`: the small box over the Plan, its line focused.
- `ideas-phone.png` and `ideas-ru-phone.png`: the stage switch (two rows on a phone is fine), one stage, nothing cut mid-word or off the screen.
- `plan-phone-christmas.png`: the list on a phone, the chips under each day's header, the "+" at the header's end.
- `brand-keydates-ru-phone.png`: the section in Russian on a phone, the select and switch fitting.

Anything that looks wrong to a person is a defect: fix it (test-first where a test can hold it), take the screenshot again, and say so in `eyes.md`.

- [ ] **Step 8: The suites again if anything was fixed**

If Steps 2–7 committed any fix, run Step 1 again and the PHP paths those fixes touch (`"$R4B/php.sh" <paths>`). Expected: as in Steps 1–2.

- [ ] **Step 9: Ledger**

Append to `$R4B/progress.md`: `Task 12: note: vitest …; PHP <n> paths green (<pre-existing failures, if any>); build check clean; Appointments 46 screens, 0 differ, keys same; Lighthouse <Plan / Ideas / panel / Brand>; pass 28 checks 0 failed; eyes ok`.

- [ ] **Step 10: Clean up**

```bash
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R4B/pass-unseed.php" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo Laravel\Sanctum\PersonalAccessToken::where('name', 'like', 'content-r4a-%')->count();" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan workspace:content 16 --status | tail -2
```

Expected: `REMOVED brand <id>, profiles 1, posts <n>` (the seeded idea, the captured ones, the posts the pass made); tokens `0`; jobs as noted before the pass; org 16's Content `on`. Stop the API and the Vite tasks (TaskStop); `netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'` must print nothing (a leftover node PID: check its command line, then `taskkill //PID <pid> //F`). Remove the base worktree — junction first, in PowerShell:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove ../Hexa-Tech-content-base && git worktree list | grep -c content-base; test -d frontend/node_modules/react && echo MODULES-KEPT; git status --short
```

Expected: `0`; `MODULES-KEPT`; `git status --short` prints nothing.

- [ ] **Step 11: Record the task**

```bash
bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/executing-plans/scripts/task-done docs/superpowers/plans/2026-10-16-content-release-4a-2.md 12 <BASE> -- "$R4B/vt.sh" src/content src/workspace src/appointments
```

---

### Task 13: The deploy (source-patch recipe), after the owner's "yes, deploy"

Run this task after the final whole-branch review and its fix pass (executing-plans' Final Review), so the feature tip it ships is final.

Merging to `main` is a production deploy: Laravel Cloud runs `migrate --force` (release 4a brings three additive migrations) and rebuilds the SPA. This task prepares the artifact in its own worktree, proves it, then **stops and asks the owner**. Nothing is pushed without the owner's explicit "yes, deploy" in this conversation; release 3's yes does not carry over.

**Files:**
- Temporary: worktree `C:\wamp64\www\Hexa-Tech-deploy-content-r4a` on branch `deploy/content-r4a` (from `origin/main`), with a copied `vendor`, the local `.env` and a `frontend/node_modules` junction; removed in Step 9 (the branch is kept).
- Ledger: `$R4B/deploy-list.txt`, `$R4B/deploy-php.txt`, `$R4B/deploy-vitest.txt`, `$R4B/deploy-build.txt`, `$R4B/postdeploy.txt`.

**Interfaces:**
- Consumes: the feature tip after the review and Task 12 (`TIP`), the last deployed feature tip `d11056743`, prod main `7b4b96191`, `$R4B/php.sh`.

- [ ] **Step 1: Fix the inputs**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git status --short && git fetch -q origin
TIP=$(git rev-parse HEAD); echo "TIP $TIP"; git log -1 --format='%h %s' origin/main
git diff --stat d11056743 origin/main -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: a clean status; origin/main `7b4b96191`; the last line prints nothing (production's source is exactly the last deployed feature tip). If origin/main moved on, the line lists what changed there: Step 3's fourth guard proves none of it touches this release's files; ledger the new origin/main.

Ledger: `Task 13: note: TIP <sha>; origin/main <sha>`.

- [ ] **Step 2: The deploy worktree**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree add ../Hexa-Tech-deploy-content-r4a -B deploy/content-r4a origin/main
cp .env ../Hexa-Tech-deploy-content-r4a/.env
```

In PowerShell (robocopy, never a junction for `vendor`: PHPUnit would test the other tree; robocopy's exit codes 0–7 mean success):

```powershell
robocopy C:\wamp64\www\Hexa-Tech-content\vendor C:\wamp64\www\Hexa-Tech-deploy-content-r4a\vendor /E /NFL /NDL /NJH /NJS /NP; if ($LASTEXITCODE -lt 8) { 'VENDOR-OK' }
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-deploy-content-r4a\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

Expected: `VENDOR-OK`; the junction made. On `ENOSPC` (or robocopy's "not enough space"), stop and report it; delete nothing to make room.

- [ ] **Step 3: The change list and its guards**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git diff --no-renames --name-status d11056743 "$TIP" > "$R4B/deploy-list.txt"; wc -l < "$R4B/deploy-list.txt"
cut -f2 "$R4B/deploy-list.txt" | grep -vE '^(app/|routes/api\.php$|tests/|frontend/src/|docs/|database/migrations/2026_10_16_100(000|100|200)_)'; echo "(nothing above: every path is in the allowlist)"
cut -f2 "$R4B/deploy-list.txt" | grep -E '^(frontend/dist/|public/spa/|resources/spa-shell/|config/|composer\.|frontend/package)'; echo "(nothing above: no built file, no config, no dependency)"
cut -f2 "$R4B/deploy-list.txt" | grep '^database/'; echo "(above: exactly the three release-4a migrations)"
git diff --name-only 7b4b96191 origin/main -- $(cut -f2 "$R4B/deploy-list.txt"); echo "(nothing above: production has not changed any file of this release since 7b4b96191)"
cut -f1 "$R4B/deploy-list.txt" | sort | uniq -c
```

Expected: about 130 lines; the first two guards print nothing but their notes; the third lists exactly `database/migrations/2026_10_16_100000_add_holiday_settings_to_content_planner_profiles.php`, `…100100_create_content_planner_key_dates_table.php` and `…100200_create_content_planner_templates_table.php`; the fourth prints nothing; the status count shows `A` and `M` (and an `R`-free list: `--no-renames` turns the moved `menuFocus.ts` into one `D` and one `A`, which the ledger explains). A path outside the allowlist: stop and find out why before going on (another feature's commit must not ride the deploy); ledger the answer.

- [ ] **Step 4: Apply, check parity, commit**

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4a
awk -F'\t' '$1 != "D" {print $2}' "$R4B/deploy-list.txt" > "$R4B/deploy-am.txt"
awk -F'\t' '$1 == "D" {print $2}' "$R4B/deploy-list.txt" > "$R4B/deploy-d.txt"
xargs -a "$R4B/deploy-am.txt" git checkout "$TIP" --
[ -s "$R4B/deploy-d.txt" ] && xargs -a "$R4B/deploy-d.txt" git rm -q --
git diff --cached --stat | tail -1
git diff --cached "$TIP" -- $(cut -f2 "$R4B/deploy-list.txt") | head -5; echo "(nothing above: parity with the feature tip, deletions included)"
git diff "$TIP" --stat -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: the cached stat counts every line of the list; the parity diff prints nothing; when origin/main was still `7b4b96191`, the last line prints nothing too (whole-tree parity with the feature tip outside the built files).

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4a && git commit -q -F - <<'EOF'
HexaTech Content, release 4a: key dates and the + menu, the Ideas board, templates

Key dates on the Plan (public holidays of nine countries with their
substitute days, marketing and international days, the brand's events and
the team's notes) with a day's + as a menu; the Ideas page of posts
without a day, with quick capture and the I key; templates with blanks,
AI suggestions, the panel's Template menu and Write with AI from a
template; key dates in the AI's context. Three additive migrations
(profiles.holiday_country and marketing_days, content_planner_key_dates,
content_planner_templates). Source of feature/content-workspace at TIP_SHA
(since d11056743).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='%h %s'
```

(Before committing, replace `TIP_SHA` in the message with the short sha of `$TIP`, by editing the command.)

- [ ] **Step 5: Every suite on the artifact**

The PHP suites, by folder, on the deploy worktree, in batches of about ten per call (`php.sh` runs in the feature worktree, so for the artifact use a copy that runs in the deploy tree):

```bash
sed 's#cd /c/wamp64/www/Hexa-Tech-content #cd /c/wamp64/www/Hexa-Tech-deploy-content-r4a #' "$R4B/php.sh" > "$R4B/php-deploy.sh" && chmod +x "$R4B/php-deploy.sh" && grep -n "^cd " "$R4B/php-deploy.sh"
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4a && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R4B/deploy-paths.txt"; wc -l < "$R4B/deploy-paths.txt"; rm -f "$R4B/deploy-php.txt"
"$R4B/php-deploy.sh" $(sed -n 1,10p "$R4B/deploy-paths.txt") | tee -a "$R4B/deploy-php.txt"     # then 11,20p … to the end
grep -v "exit 0" "$R4B/deploy-php.txt"; echo "(nothing above: every path green)"
```

Expected: the `grep -n` line shows `cd /c/wamp64/www/Hexa-Tech-deploy-content-r4a || exit 1`; every PHP path `exit 0` (the same paths and results as Task 12; a pre-existing failure Task 12 recorded may repeat, nothing new).

The frontend, and the build:

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4a/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R4B/deploy-vitest.txt" 2>&1; tail -5 "$R4B/deploy-vitest.txt"; grep -E '^ FAIL ' "$R4B/deploy-vitest.txt" | sed 's/ >.*//' | sort -u
npm run build > "$R4B/deploy-build.txt" 2>&1; echo "build exit $?"; tail -5 "$R4B/deploy-build.txt"
cd .. && git status --short | cut -c4- | cut -d/ -f1-2 | sort | uniq -c
```

Expected: `TSC-CLEAN`; vitest `3 failed` only in `src/lib/plannerMeta.test.ts`; `build exit 0`; the status shows changes only under `frontend/dist`, `public/spa` and `resources/spa-shell`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4a && git add frontend/dist public/spa resources/spa-shell && git commit -q -m "Build the SPA for HexaTech Content release 4a" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git status --short && git log -3 --format='%h %s'
```

Expected: a clean status; the build commit on top of the source commit, on top of origin/main.

- [ ] **Step 6: STOP — ask the owner**

Ledger `Task 13: note: artifact ready — deploy/content-r4a <sha> (source <sha> + build <sha>), <n> files (A <a>, M <m>, D <d>), PHP <n> paths green, vitest <n> passed + 3 baseline, build ok`, then ask the owner, with the facts in plain words:

- what ships: key dates on the Plan (public holidays of the nine countries with substitute and "observed" days, marketing and international days, the brand's own events and the team's notes) with a Key dates switch; a day's "+" as a menu (New post, From a template…, Note, Event); the Ideas page (posts without a day by stage, drag, Shift + arrows, Move to…, Schedule with Undo) with quick capture and the I key; templates (Brand → Templates with AI suggestions, the panel's Template menu and blanks line, Save as template, "+ → From a template…" with Use and Write with AI); the AI told the period's key dates (never the notes);
- the three additive migrations (`content_planner_profiles.holiday_country` and `marketing_days`, `content_planner_key_dates`, `content_planner_templates`): nothing existing changes;
- what changes for people: chips on the Plan (each brand guesses its country from the venue until a manager chooses), the "+" opens a small menu, a new Ideas item in the menu; admin tabs left open across the deploy must be reloaded;
- the queue check from the runbook, still open: `retry_after` is 90 s while the strategy job may run 600 s;
- the checks: Task 12's results (suites, `46 screens, 0 differ`, Lighthouse, the browser pass) and Step 5's;
- the question: **"Shall I deploy? Reply 'yes, deploy' to push it to production."**

Wait for the answer. Anything other than a clear yes: do not push; keep the deploy worktree, and do what the owner asks.

- [ ] **Step 7: Push (only after "yes, deploy")**

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4a && git fetch -q origin && git log -1 --format='%h' origin/main
OLD=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "OLD $OLD" | tee "$R4B/postdeploy.txt"
for u in /api/v1/admin/content/ideas /api/v1/admin/content/bootstrap; do printf 'before %s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/json' "https://app.hexa-tech.uk$u")"; done | tee -a "$R4B/postdeploy.txt"
```

Expected: origin/main is still the commit the deploy branch was cut from (if it moved, stop: rebase nothing, tell the owner and start again from Step 1); `OLD /spa/assets/index-….js`; `before /api/v1/admin/content/ideas 404` and `before /api/v1/admin/content/bootstrap 401`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4a && git push origin deploy/content-r4a:main 2>&1 | tail -2; date -u +%FT%TZ
```

Then wait for Laravel Cloud's new bundle (Bash, `run_in_background`; it re-invokes when it exits; about 2–3 minutes in earlier releases):

```bash
OLD='<the OLD path from above>'; for i in $(seq 1 60); do NEW=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); [ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && { echo "NEW $NEW at $(date -u +%T)"; exit 0; }; sleep 15; done; echo "STILL OLD after 15 minutes"; exit 1
```

Expected: `NEW /spa/assets/index-….js`. "STILL OLD": look at the Laravel Cloud deploy log with the owner (a failed migration stops the deploy); do not push again.

- [ ] **Step 8: Verify by content**

```bash
B=https://app.hexa-tech.uk; NEW=$(curl -s $B/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "NEW $NEW" | tee -a "$R4B/postdeploy.txt"
curl -s "$B$NEW" -o "$R4B/live-index.js"; printf 'index data-content/data-appointments: %s\n' "$(grep -c 'data-content\|data-appointments' "$R4B/live-index.js")" | tee -a "$R4B/postdeploy.txt"
CA=$(grep -o 'ContentApp-[A-Za-z0-9_-]*\.js' "$R4B/live-index.js" | head -1); AA=$(grep -o 'AppointmentsApp-[A-Za-z0-9_-]*\.js' "$R4B/live-index.js" | head -1); echo "chunks $CA $AA" | tee -a "$R4B/postdeploy.txt"
curl -s "$B/spa/assets/$CA" -o "$R4B/live-content.js"; for w in 'Blanks to fill' 'Suggest templates with AI' 'Marketing and international days' 'Add an idea'; do printf 'ContentApp has "%s": %s\n' "$w" "$(grep -c "$w" "$R4B/live-content.js")"; done | tee -a "$R4B/postdeploy.txt"
curl -s "$B/spa/assets/$AA" | grep -c 'data-appointments' | sed 's/^/AppointmentsApp has data-appointments: /' | tee -a "$R4B/postdeploy.txt"
for u in /api/v1/admin/content/ideas /api/v1/admin/content/bootstrap; do printf 'after %s %s %s\n' "$u" "$(curl -s -o "$R4B/body.json" -w '%{http_code}' -H 'Accept: application/json' "$B$u")" "$(head -c 80 "$R4B/body.json")"; done | tee -a "$R4B/postdeploy.txt"
for p in / /content /content/ideas /appointments; do printf 'page %s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done | tee -a "$R4B/postdeploy.txt"
rm -f "$R4B/live-index.js" "$R4B/live-content.js" "$R4B/body.json"
```

Expected: `index data-content/data-appointments: 0`; both chunk names found; the ContentApp chunk has each of the four phrases (counts ≥ 1); `AppointmentsApp has data-appointments:` ≥ 1; `after /api/v1/admin/content/ideas 401 {"message":"Unauthenticated."…` (it answered 404 before) and `after /api/v1/admin/content/bootstrap 401`; the four pages `200`. Any other answer: tell the owner at once, with the line.

- [ ] **Step 9: Clean up and record**

In PowerShell, the junction first, then the worktree:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-deploy-content-r4a\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove --force ../Hexa-Tech-deploy-content-r4a && git worktree list | grep -c deploy-content-r4a; test -d frontend/node_modules/react && echo MODULES-KEPT
```

Expected: `0`; `MODULES-KEPT`. (`--force` because the copied `vendor` and `.env` are untracked files in it; the branch `deploy/content-r4a` stays.)

Ledger: `Task 13: complete — LIVE as prod main <sha> (source <sha> + build <sha>; <n> files) pushed <time>Z, new index live <time>Z (<index>, <ContentApp chunk>); verified by content (postdeploy.txt): …`.

Update the memory file `content-workspace.md` and its line in `MEMORY.md`: release 4a LIVE as prod main `<sha>` (date), verified by content; the owner's checks still open (the runbook's "After the deploy" lines for releases 2, 3 and 4a, the queue `retry_after` check); release 4b next (approvals, comments, the "For you" bell — Plans 4B-1 and 4B-2).

Tell the owner it is live, with the verification lines and the runbook's "After the deploy" checks.
