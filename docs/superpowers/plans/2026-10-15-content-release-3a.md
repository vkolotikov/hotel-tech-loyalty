# HexaTech Content — Release 3, Plan A: Leftovers and the Server for the Fast Wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close everything release 2 left open (spec §3) and build the server half of the release-3 features — a channel's usual time with best-time hints, hashtag groups and snippets, posting goals and streaks, repeat posts with AI rewording (spec §4–§8).

**Architecture:**
- **Leftovers** are small fixes, each pinned by a test that fails first: the shared shell and Find (both workspaces, spec §3.1), Content's mark colours, server correctness (§3.2) and portal fixes (§3.3).
- **Features (server):** three additive migrations (`content_planner_channels.post_time`, `content_planner_snippets`, `content_planner_posts.series_id`); new endpoints in the existing Content route group behind its gate and brand pin; every AI call in a small non-final service so tests can mock it; one queued job for the rewording.
- Plan B builds the portal for §4–§8 on these endpoints, runs the release checks and deploys. Nothing is deployed by this plan.

**Tech Stack:** Laravel 13 on PHP 8.4.20 (tests on SQLite in memory, production PostgreSQL); React 19, TypeScript 5.9, Vite 5, React Router 7, TanStack Query 5, react-i18next 17, Tailwind 3 (Atelier `a-*`), vitest 2.

**Spec:** `docs/superpowers/specs/2026-10-15-content-release-3-design.md` (approved 2026-10-15). Earlier spec, still binding: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`.

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `3bbf20655` (the release-3 spec). Production is release 2: prod main `a9483b428` = the source of feature tip `47dab9930` + a build. Code facts gathered for this plan: `.superpowers/sdd/r3a-facts.md` (numbered 1–21; quoted below where a task needs them).

## Global Constraints

- **Branch:** never push the feature branch; never commit its built `frontend/dist`, `public/spa` or `resources/spa-shell`. This plan pushes nothing.
- **Ledger and tools:** `.superpowers/sdd/2026-10-15-content-release-3a/`, called `$R3A` below. Set it up in Task 1, Step 1.
- **Frontend commands** (Git Bash): types `cd frontend && npx tsc -b`; tests `$R3A/vt.sh <paths…>`; scoped lint `cd frontend && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts`.
- **PHP commands:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by folder, in the foreground: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/ --no-ansi`. Never a bare `php artisan test`.
- **Baselines:** the full vitest run has exactly 3 failures (`src/lib/plannerMeta.test.ts`, the staff Planner); the scoped lint has exactly 17 errors (`src/App.tsx` 1, `src/components/Layout.tsx` 15, `src/pages/hubs/MarketingHub.tsx` 1). Anything else is ours.
- **Migrations:** additive and SQLite-safe (plain `Schema::table` / `Schema::create`; no `->change()`, no PostgreSQL-only SQL), guarded with `Schema::hasColumn` / `Schema::hasTable` like `database/migrations/2026_10_12_100000_add_color_to_service_masters_table.php`. Tests build the planner tables by requiring the real migrations in `tests/Concerns/SetsUpContentSchema.php` (lines 789–795): every new migration gets its own guarded `require … ->up()` line there.
- **AI:** every new AI call lives in a small non-final service (`AiClient` is `final` and its SDK path cannot be faked by `Http::fake`); tests bind a Mockery mock of the service with `$this->app->instance(...)`. Every AI action calls `ContentAiGate::allow($org)` first and is counted as feature `content` through `AiClient`.
- **No facade mocks** (`Cache::shouldReceive`, `Queue::shouldReceive` …): they have broken full runs before. The test queue is `sync` (`phpunit.xml` line 47): a dispatched job runs inside the request.
- **Appointments may change only where spec §3.1 says:** the phone menu's width and Find's empty line. Everything else in Appointments stays as it is (Plan B's pixel comparison expects exactly three differing screens).
- **Portal rules:** only `a-*` classes; selectors scoped under `[data-content]` / `[data-workspace]`; words in all five bundles (`frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`, the full admin's in `frontend/src/i18n/locales/*/common.json`); the portal's own sentence for every refusal it shows.
- **React lint:** no synchronous `setState` inside an effect; no `ref.current` reads during render; no component defined inside another.
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace — write any code holding backslashes with the Write or Edit tool (or a script written by the Write tool), never through a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Week edges on the venue's clock** (goals and streaks): a venue in Europe/Riga marks a post published at 23:30 on Sunday local time — it belongs to that week, not the next; the Friday nudge starts at Friday 00:00 local.
   - Pinned by Task 13's test with `organizations.timezone = 'Europe/Riga'`.
2. **Monthly repeats from the 29th–31st:** a post on 31 January repeating monthly lands on 28 February (29 in 2028), 31 March, 30 April; "until" includes its own day.
   - Pinned by Task 14's date tests.
3. **AI rewording meeting a person's edit:** a copy a person changed before the job reached it keeps the person's text.
   - Pinned by Task 15's test.
4. **Other brands and organisations on every new endpoint:** another brand's snippet on PUT/DELETE answers 404; another organisation's post on repeat answers 404; goals count only this brand's posts.
   - Pinned by Tasks 11, 13 and 14.
5. **A usual time typed oddly:** "9:00", "25:00" or "" — two-digit `HH:MM` from 00:00 to 23:59 is taken, an empty value clears it, anything else answers 422; Generate and Fill use it.
   - Pinned by Task 10's tests.

---

## File map

- **Task 1 (shared core and colours):** `frontend/src/workspace/WorkspaceShell.tsx` (+ test), `frontend/src/content/ContentShell.tsx`, `frontend/src/workspace/find/FindFrame.tsx` (+ `findFrame.test.tsx`), `frontend/src/content/theme/content.css` (+ `contentCss.test.ts`).
- **Task 2 (server fixes: data and roles):** `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, `app/Services/Content/ContentPlan.php`, `app/Services/Content/ContentAccess.php`, `app/Services/Appointments/Setup/SetupAccess.php`, `app/Jobs/GenerateContentStrategy.php`; tests `tests/Feature/Content/{PostsTest,StrategyTest}.php`, `tests/Unit/Content/ManagerRolesTest.php`.
- **Task 3 (quick setup re-check, AI endpoint tests):** `app/Services/Content/ContentBrandEditor.php`, `BrandController.php`; tests `tests/Unit/Content/RefuseIfSetUpTest.php`, `tests/Feature/Content/PostAiTest.php`.
- **Task 4 (tray over 100):** `app/Services/Content/ContentPlan.php`, `PlanController.php`, `frontend/src/content/plan/{Tray,PlanPage}.tsx`, `frontend/src/content/lib/types.ts`; tests `PlanTest.php`, `planPieces.test.tsx`; words.
- **Task 5 (strategy clock and refresh):** `StrategyController.php`, `frontend/src/content/strategy/{strategyMath.ts,StrategyPage.tsx}`; tests `StrategyTest.php`, `strategyMath.test.ts`, `strategyPage.test.tsx`.
- **Task 6 (brand changes mid-flight, post links):** `frontend/src/content/{ContentProvider.tsx,plan/PlanPage.tsx,panel/PanelProvider.tsx,panel/PostPanel.tsx,lib/links.ts}`; tests beside them; words.
- **Task 7 (week edges by keyboard):** `frontend/src/content/plan/{moveMath.ts,PlanPage.tsx}`; tests `moveMath.test.ts`.
- **Task 8 (Brand page fixes):** `frontend/src/content/brand/{listActions.ts,sections/Audiences.tsx,sections/Voice.tsx,SectionCard.tsx}`; tests beside them; words.
- **Task 9 (shell: panel boundary, switched-off notice):** `frontend/src/content/ContentShell.tsx`, `frontend/src/content/ui/ContentErrorBoundary.tsx`; tests `ContentShell.test.tsx`; words.
- **Task 10 (best times and usual time):** migration `…_add_post_time_to_content_planner_channels.php`, `app/Services/Content/BestTimes.php`, `frontend/src/content/lib/bestTimes.json` + `bestTimes.ts`, `ContentRules.php`, `ContentBrandEditor.php`, `BrandController.php`, `app/Models/ContentPlannerChannel.php`, `app/Services/ContentCalendarGenerationService.php`, `SetsUpContentSchema.php`; tests `tests/Feature/Content/BestTimesTest.php`, `bestTimes.test.ts`.
- **Task 11 (snippets):** migration `…_create_content_planner_snippets_table.php`, `app/Models/ContentPlannerSnippet.php`, `app/Models/ContentPlannerProfile.php`, `ContentRules.php`, `BrandController.php` (the snippet endpoints live beside audiences and channels), `routes/api.php`, `SetsUpContentSchema.php`; tests `tests/Feature/Content/SnippetsTest.php`, `ContentGateTest.php`.
- **Task 12 (snippet suggestions):** `app/Services/Content/ContentSnippetSuggester.php`, `BrandController.php`, `routes/api.php`; tests `SnippetsTest.php`, `tests/Unit/Content/SnippetSuggesterCleanTest.php`, `ContentGateTest.php`.
- **Task 13 (goals):** `app/Services/Content/ContentGoals.php`, `app/Http/Controllers/Api/V1/Admin/Content/GoalsController.php`, `routes/api.php`; tests `tests/Feature/Content/GoalsTest.php`.
- **Task 14 (repeat posts):** migration `…_add_series_id_to_content_planner_posts.php`, `app/Services/Content/ContentRepeat.php`, `app/Http/Controllers/Api/V1/Admin/Content/RepeatController.php`, `ContentPostPresenter.php`, `PostController.php` (`duplicate`), `app/Models/ContentPlannerPost.php`, `routes/api.php`, `SetsUpContentSchema.php`; tests `tests/Feature/Content/RepeatTest.php`, `tests/Unit/Content/ContentRepeatTest.php`.
- **Task 15 (AI rewording):** `app/Jobs/RewriteRepeatCopies.php`, `app/Services/Content/ContentRepeatRewriter.php`, `RepeatController.php`; tests `RepeatTest.php`.
- **Task 16 (runbook):** `docs/content-workspace.md`.

---

### Task 1: The shared core and Content's colours (spec §3.1)

**Files:**
- Modify: `frontend/src/workspace/WorkspaceShell.tsx`, `frontend/src/workspace/WorkspaceShell.test.tsx`, `frontend/src/content/ContentShell.tsx`, `frontend/src/workspace/find/FindFrame.tsx`, `frontend/src/workspace/find/findFrame.test.tsx`, `frontend/src/content/theme/content.css`, `frontend/src/content/theme/contentCss.test.ts`

**Interfaces:**
- Produces: `WorkspaceShell` without the `menuFits` prop (the phone menu always sizes to its content); `FindFrame` shows no empty line while `waiting` is set.

- [ ] **Step 1: Set up the ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R3A=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-15-content-release-3a.md)
cp .superpowers/sdd/archive/2026-10-15-content-workspace-r2d-release/vt.sh "$R3A/vt.sh"
cp .superpowers/sdd/archive/2026-10-15-content-workspace-r2d-release/php-all.sh "$R3A/php-all.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-15-content-release-3a.md" > "$R3A/progress.md"
echo "$R3A"
```

Expected: `$R3A` ends in `.superpowers/sdd/2026-10-15-content-release-3a`. (`vt.sh` and `php-all.sh` hard-code the worktree path `/c/wamp64/www/Hexa-Tech-content`, which is right.)

- [ ] **Step 2: Write the failing tests**

In `frontend/src/workspace/WorkspaceShell.test.tsx`, the render helper drops its `menuFits` option (`function render({ rail = 'full', fullAdmin = '/marketing' }: { rail?: 'full' | 'slim'; fullAdmin?: string | null } = {})` and no `menuFits={menuFits}` prop), and the menu test becomes:

```tsx
  // Owner, 2026-10-15: both workspaces size the phone menu to what it holds ("Авто" ran past the fixed 14rem in Russian).
  it('sizes the phone menu to what it holds, at least 14rem and never past the screen', () => {
    const menu = render().match(/<summary[\s\S]*?<\/summary><div class="([^"]*)"/)?.[1] ?? ''
    expect(menu).toContain('w-max')
    expect(menu).toContain('min-w-56')
    expect(menu).toContain('max-w-[calc(100vw-2rem)]')
    expect(menu.split(' ')).not.toContain('w-56')
  })
```

In `frontend/src/workspace/find/findFrame.test.tsx`, add to the describe block (the `draw(query, waiting, groups)` helper is at lines 22–25):

```tsx
  // Owner, 2026-10-15: "Nothing matches" while the search is still on its way told people a post was missing.
  it('says nothing matches only once nothing is still on its way', () => {
    const looking = draw('zzz', 'Looking for posts…', [])
    expect(looking).not.toContain('Nothing matches')
    expect(looking).toContain('Looking for posts…')
    expect(draw('zzz', null, [])).toContain('Nothing matches “zzz”.')
  })
```

In `frontend/src/content/theme/contentCss.test.ts`, the platform rule test (lines 45–53) becomes:

```ts
    for (const p of PLATFORMS) {
      it(`${p}: white ink where white reads 4.5:1 on its fill, else the dark ink — and the ink reads 4.5:1`, () => {
        const v = pf(p, theme.dark)
        expect(v.pf, `--c-pf of ${p}`).toBeDefined()
        const white = ratio(WHITE, v.pf) >= 4.5
        expect(v['pf-ink']).toEqual(white ? WHITE : theme.own.ink)
        expect(ratio(v['pf-ink'], v.pf)).toBeGreaterThanOrEqual(4.5)
      })
    }
```

and the file's doc comment (lines 4–8) says "white ink while white reads 4.5:1 on the fill" instead of 3:1.

- [ ] **Step 3: Run them to see them fail**

Run: `$R3A/vt.sh src/workspace/WorkspaceShell.test.tsx src/workspace/find/findFrame.test.tsx src/content/theme/contentCss.test.ts`
Expected: FAIL — the menu still carries `w-56`; "Nothing matches" shows while waiting; facebook, instagram, youtube and email expect the dark ink (white reads under 4.5:1 on their fills).

- [ ] **Step 4: The fixes**

`frontend/src/workspace/WorkspaceShell.tsx`:
1. Remove `menuFits = false` from the destructured props and the `menuFits?: boolean` prop with its doc comment (lines 48–52).
2. The menu div (line 155) becomes:

```tsx
            {/* As wide as what it holds (the theme switch is longer in Russian), at least 14rem, never past the screen. */}
            <div className="absolute right-0 top-full z-40 mt-2 w-max min-w-56 max-w-[calc(100vw-2rem)] animate-a-pop space-y-1 rounded-lg border border-a-border bg-a-surface p-2 shadow-lg">
```

`frontend/src/content/ContentShell.tsx`: remove the `menuFits` prop from `<WorkspaceShell …>` (line 131).

`frontend/src/workspace/find/FindFrame.tsx` (lines 121–125): nothing is "none" while the workspace is still looking, and the live status says it is looking:

```tsx
  const typed = query.trim()
  // While the workspace is still looking, nothing is missing yet: no "Nothing matches" until the answer is in.
  const none = typed !== '' && items.length === 0 && !waiting
  const status = none
    ? t('workspace.find.none', 'Nothing matches “{{q}}”.', { q: typed })
    : waiting && items.length === 0
      ? waiting
      : t('workspace.find.count', 'Results: {{count}}', { count: items.length })
```

`frontend/src/content/theme/content.css`:
1. Line 11's comment: `/* The dark ink on a platform fill white does not read on (owner, 2026-10-15: white where it reads 4.5:1, else ink). */`
2. Four fills (lines 39, 41, 43, 45):

```css
[data-content] [data-platform="instagram"] { --c-pf: 215 40 100; --c-pf-ink: 255 255 255; }
[data-content] [data-platform="facebook"] { --c-pf: 24 112 232; --c-pf-ink: 255 255 255; }
[data-content] [data-platform="youtube"] { --c-pf: 230 0 0; --c-pf-ink: 255 255 255; }
[data-content] [data-platform="email"] { --c-pf: 130 82 240; --c-pf-ink: 255 255 255; }
```

- [ ] **Step 5: Run the tests, the types and the lint**

Run: `$R3A/vt.sh src/workspace src/content src/appointments` → all pass. `cd frontend && npx tsc -b` → clean. The scoped lint → the 17 baseline errors only.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src && git commit -q -F - <<'EOF'
Both workspaces: the phone menu fits what it holds, Find waits before "Nothing matches"; Content's marks read 4.5:1

Owner, 2026-10-15. The phone menu sizes to its content in Appointments too
(Russian no longer runs past the screen); Find says nothing matches only
once its answer is in; four platform fills deepen slightly so their white
marks read 4.5:1 (Facebook, Instagram, YouTube, Email).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Server fixes — a time needs a day, literal search, one manager list, the strategy job (spec §3.2)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/PostController.php` (`store`, `update`), `app/Services/Content/ContentPlan.php` (`search`), `app/Services/Content/ContentAccess.php`, `app/Services/Appointments/Setup/SetupAccess.php`, `app/Jobs/GenerateContentStrategy.php`
- Test: `tests/Feature/Content/PostsTest.php`, `tests/Feature/Content/StrategyTest.php`, create `tests/Unit/Content/ManagerRolesTest.php`

**Interfaces:**
- Produces: `AccessMap::MANAGER_ROLES` as the only manager list; `GenerateContentStrategy::FAILED_SUMMARY = 'The strategy could not be made. Please try again.'`.

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Content/PostsTest.php`:

```php
    public function test_a_post_created_without_a_day_keeps_no_time(): void
    {
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'scheduled_time' => '09:00', 'topic' => 'Idea'])
            ->assertCreated()->assertJsonPath('post.scheduled_date', null)->assertJsonPath('post.scheduled_time', null);
    }

    public function test_setting_only_a_time_on_a_post_without_a_day_keeps_no_time(): void
    {
        $post = $this->makePost(['scheduled_date' => null]);

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'scheduled_time' => '10:00'])
            ->assertOk()->assertJsonPath('post.scheduled_time', null);
    }

    public function test_search_words_are_taken_literally(): void
    {
        $this->makePost(['topic' => '50% off colour', 'scheduled_date' => null]);
        $this->makePost(['topic' => '500 off colour', 'scheduled_date' => null]);
        $this->makePost(['topic' => 'cut_and_go', 'scheduled_date' => null]);
        $this->makePost(['topic' => 'cutxandxgo', 'scheduled_date' => null]);

        $this->asStaffMember()->getJson($this->api('find?q=' . urlencode('50%')))->assertOk()->assertJsonCount(1, 'posts')->assertJsonPath('posts.0.topic', '50% off colour');
        $this->asStaffMember()->getJson($this->api('find?q=cut_and'))->assertOk()->assertJsonCount(1, 'posts')->assertJsonPath('posts.0.topic', 'cut_and_go');
        $this->asStaffMember()->getJson($this->api('posts?q=' . urlencode('50%')))->assertOk()->assertJsonPath('meta.total', 1);
    }
```

`tests/Feature/Content/StrategyTest.php` (add `use App\Jobs\GenerateContentStrategy;` and `use App\Services\AiUsageService;` with the Edit tool):

```php
    public function test_a_failed_strategy_says_so_in_our_words(): void
    {
        $strategy = ContentPlannerStrategy::create(['brand_id' => $this->brandId, 'planner_profile_id' => $this->profile->id, 'title' => 'Generating strategy…', 'status' => 'generating']);

        (new GenerateContentStrategy((int) $strategy->id, (int) $this->profile->id, (int) $this->org->id))->failed(new \RuntimeException('Private provider detail: key sk-test'));

        $this->assertSame('failed', $strategy->fresh()->status);
        $this->assertSame('The strategy could not be made. Please try again.', $strategy->fresh()->summary);
    }

    public function test_the_strategy_job_counts_its_ai_use_for_its_brand(): void
    {
        $strategy = ContentPlannerStrategy::create(['brand_id' => $this->brandId, 'planner_profile_id' => $this->profile->id, 'title' => 'Generating strategy…', 'status' => 'generating']);
        $service = Mockery::mock(ContentPlannerStrategyService::class);
        $service->shouldReceive('generate')->once()->andReturnUsing(function () {
            app(AiUsageService::class)->recordUsage((int) $this->org->id, 'claude-sonnet-5', 10, 10, 'content');

            return ['strategy' => null, 'pillars' => []];
        });
        // A queue worker has no request: nothing binds the brand before the job does.
        app()->forgetInstance('current_brand_id');

        (new GenerateContentStrategy((int) $strategy->id, (int) $this->profile->id, (int) $this->org->id))->handle($service);

        $this->assertSame($this->brandId, (int) DB::table('ai_usage_logs')->where('feature', 'content')->latest('id')->value('brand_id'));
        $this->assertFalse(app()->bound('current_brand_id'), 'the job leaves the binding as it found it');
    }
```

(`StrategyTest` imports `DB` if it does not yet — add `use Illuminate\Support\Facades\DB;`.) In the same file, the lock test `test_two_requests_at_once_cannot_both_start_a_strategy` gets these lines at its top, so a regression can never reach the real AI:

```php
        $service = Mockery::mock(ContentPlannerStrategyService::class);
        $service->shouldNotReceive('generate');
        $this->app->instance(ContentPlannerStrategyService::class, $service);
```

Create `tests/Unit/Content/ManagerRolesTest.php`:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Content\ContentAccess;
use App\Support\AdminAccess\AccessMap;
use PHPUnit\Framework\TestCase;

/** One list of the roles that manage (spec 2026-10-15 §3.2): the access map's. */
class ManagerRolesTest extends TestCase
{
    public function test_the_access_map_holds_the_only_list_of_manager_roles(): void
    {
        $this->assertSame(['super_admin', 'manager'], AccessMap::MANAGER_ROLES);
        $this->assertFalse(defined(ContentAccess::class . '::MANAGER_ROLES'));
        $this->assertFalse(defined(SetupAccess::class . '::MANAGER_ROLES'));
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `for p in tests/Feature/Content/PostsTest.php tests/Feature/Content/StrategyTest.php tests/Unit/Content/ManagerRolesTest.php; do XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done`
Expected: the two time tests, the search test, the two strategy tests and the roles test fail (the lock test still passes).

- [ ] **Step 3: The fixes**

`PostController::store`: after `$data = $request->validate(…);`, add

```php
        // A post without a day has no time either (as a move to the tray, and as update, keep it).
        if (($data['scheduled_date'] ?? null) === null) {
            $data['scheduled_time'] = null;
        }
```

`PostController::update`: replace the existing "no day" clause and the save with

```php
        $post->fill($fields);
        // A post without a day has no time either — also when only a time was sent for it.
        if ($post->scheduled_date === null) {
            $post->scheduled_time = null;
        }
        $post->save();
```

(keep the published-move refusal above it; delete the old `if (array_key_exists('scheduled_date', $fields) && $fields['scheduled_date'] === null)` block and the separate `$post->fill($fields)->save();`.)

`ContentPlan::search` (use the Edit tool — backslashes):

```php
    /**
     * Posts whose title, topic, hook or copy hold the words, in any case:
     * LIKE is case-sensitive on PostgreSQL, so both sides are lower-cased.
     * The words are taken literally: %, _ and \ are escaped (SQLite has no
     * default escape character, so it is named).
     */
    public static function search(Builder $query, string $words): Builder
    {
        $needle = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_strtolower(trim($words))) . '%';

        return $query->where(function (Builder $q) use ($needle) {
            foreach (['title', 'topic', 'hook', 'main_copy'] as $column) {
                $q->orWhereRaw("LOWER(COALESCE({$column}, '')) LIKE ? ESCAPE '\\'", [$needle]);
            }
        });
    }
```

`ContentAccess`: delete `public const MANAGER_ROLES = …` (line 16), add `use App\Support\AdminAccess\AccessMap;`, and line 21 uses `AccessMap::MANAGER_ROLES`. `SetupAccess`: the same (line 19 deleted, line 24 uses `AccessMap::MANAGER_ROLES`, `use App\Support\AdminAccess\AccessMap;` added).

`GenerateContentStrategy`:
1. `public const FAILED_SUMMARY = 'The strategy could not be made. Please try again.';` under `$timeout`.
2. `handle`:

```php
    public function handle(ContentPlannerStrategyService $strategies): void
    {
        // A queued job runs outside the request that created it, so
        // TenantMiddleware never fires and every scoped query would otherwise
        // fail closed and match nothing.
        app()->instance('current_organization_id', $this->organizationId);

        $strategy = ContentPlannerStrategy::withoutGlobalScopes()->find($this->strategyId);
        $profile  = ContentPlannerProfile::withoutGlobalScopes()->find($this->profileId);

        if (!$strategy || !$profile) {
            return; // deleted while queued
        }

        // The AI ledger takes the brand from the container: bind the profile's for the run, then leave it as found
        // (in tests the sync queue runs this inside a request that has its own brand bound).
        $prior = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_brand_id', (int) $profile->brand_id);
        try {
            $strategies->generate($profile, $this->params, $strategy);
        } finally {
            $prior === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $prior);
        }
    }
```

3. `failed`: `'summary' => self::FAILED_SUMMARY,` (the exception text stays in the `Log::error` above it).

- [ ] **Step 4: Run the Content folders and AdminAccess**

```bash
for p in tests/Feature/Content/ tests/Unit/Content/ tests/Feature/AdminAccess/ tests/Feature/Appointments/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
```

Expected: all green (Appointments covers `SetupAccess`).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app tests && git commit -q -F - <<'EOF'
Content server: no time without a day, literal search words, one manager list, the strategy job's brand and words

A post created or saved without a day keeps no time; %, _ and \ in a
search are literal; the access map holds the only list of manager roles;
the strategy job counts its AI use for its brand (and leaves the binding
as it found it) and a failure keeps the provider's text in the log; the
lock test can never reach the real AI.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Quick setup checks again after its lock; the image and visual-brief endpoints get their tests (spec §3.2)

**Files:**
- Modify: `app/Services/Content/ContentBrandEditor.php`, `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php` (`quickSetup`)
- Test: create `tests/Unit/Content/RefuseIfSetUpTest.php`; `tests/Feature/Content/PostAiTest.php`

**Interfaces:**
- Produces: `ContentBrandEditor::refuseIfSetUp(ContentPlannerProfile $profile): void` — reads the profile's stored state (not the instance in memory) and throws `ContentRefused('already_set_up', …, 409)` when it is set up.

- [ ] **Step 1: Write the failing tests**

Create `tests/Unit/Content/RefuseIfSetUpTest.php`:

```php
<?php

namespace Tests\Unit\Content;

use App\Models\ContentPlannerProfile;
use App\Services\Content\ContentBrandEditor;
use App\Services\Content\ContentRefused;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/**
 * Quick setup checks "already set up" again once it holds its lock: a run that finished while this request waited
 * must not be paid for twice (spec 2026-10-15 §3.2). The check reads what is stored, not the instance in memory.
 */
class RefuseIfSetUpTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_profile_set_up_meanwhile_is_refused_even_when_the_instance_in_hand_is_older(): void
    {
        $stale = ContentPlannerProfile::findOrFail($this->profile->id);
        $stale->setup_completed_at = null; // what this request read before the other run finished
        ContentPlannerProfile::whereKey($this->profile->id)->update(['setup_completed_at' => now()]);

        try {
            app(ContentBrandEditor::class)->refuseIfSetUp($stale);
            $this->fail('expected already_set_up');
        } catch (ContentRefused $e) {
            $this->assertSame('already_set_up', $e->errorCode);
        }
    }

    public function test_a_profile_not_yet_set_up_passes(): void
    {
        ContentPlannerProfile::whereKey($this->profile->id)->update(['setup_completed_at' => null]);

        app(ContentBrandEditor::class)->refuseIfSetUp($this->profile->fresh());
        $this->addToAssertionCount(1);
    }
}
```

(`ContentRefused` carries its code as `public readonly string $errorCode`.)

`tests/Feature/Content/PostAiTest.php` (add `use App\Models\ContentPlannerVisualBrief;`, `use App\Services\ContentVisualBriefService;`, `use App\Services\ContentPlanner\ImageGenerationService;` with the Edit tool):

```php
    public function test_anyone_on_the_team_gets_a_visual_brief_for_a_post(): void
    {
        $post = $this->makePost();
        $briefs = Mockery::mock(ContentVisualBriefService::class);
        $briefs->shouldReceive('generateFor')->once()->andReturnUsing(fn ($p) => ContentPlannerVisualBrief::create(['post_id' => $p->id, 'description' => 'A warm still life']));
        $this->app->instance(ContentVisualBriefService::class, $briefs);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/visual-brief"))
            ->assertOk()->assertJsonPath('post.visual_brief.description', 'A warm still life');
    }

    public function test_anyone_on_the_team_gets_an_image_for_a_post(): void
    {
        $post = $this->makePost();
        $images = Mockery::mock(ImageGenerationService::class);
        $images->shouldReceive('generateForPost')->once()->andReturnUsing(fn ($p) => ContentPlannerVisualBrief::create(['post_id' => $p->id, 'image_url' => '/storage/a.png', 'image_status' => 'ready']));
        $this->app->instance(ImageGenerationService::class, $images);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/image"), ['instructions' => 'Warm light'])
            ->assertOk()->assertJsonPath('post.image_url', '/storage/a.png');
    }

    public function test_a_visual_brief_and_an_image_wait_while_the_ai_budget_is_used_up(): void
    {
        $post = $this->makePost();
        $this->setAiCap(100, 120);
        $briefs = Mockery::mock(ContentVisualBriefService::class);
        $briefs->shouldNotReceive('generateFor');
        $this->app->instance(ContentVisualBriefService::class, $briefs);
        $images = Mockery::mock(ImageGenerationService::class);
        $images->shouldNotReceive('generateForPost');
        $this->app->instance(ImageGenerationService::class, $images);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/visual-brief"))->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/image"))->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
    }

    public function test_another_organisations_post_gets_no_visual_brief_or_image(): void
    {
        $other = $this->otherOrganization();
        $briefs = Mockery::mock(ContentVisualBriefService::class);
        $briefs->shouldNotReceive('generateFor');
        $this->app->instance(ContentVisualBriefService::class, $briefs);
        $images = Mockery::mock(ImageGenerationService::class);
        $images->shouldNotReceive('generateForPost');
        $this->app->instance(ImageGenerationService::class, $images);

        $this->asStaffMember()->postJson($this->api("posts/{$other['post']->id}/visual-brief"))->assertNotFound();
        $this->asStaffMember()->postJson($this->api("posts/{$other['post']->id}/image"))->assertNotFound();
    }

    public function test_an_image_that_fails_says_so_in_our_words(): void
    {
        $post = $this->makePost();
        $images = Mockery::mock(ImageGenerationService::class);
        $images->shouldReceive('generateForPost')->once()->andThrow(new \RuntimeException('OpenAI is not configured: sk-secret'));
        $this->app->instance(ImageGenerationService::class, $images);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/image"))
            ->assertStatus(502)->assertJsonPath('error', 'ai_failed')->assertDontSee('sk-secret');
    }
```

- [ ] **Step 2: Run them**

Run: `for p in tests/Unit/Content/RefuseIfSetUpTest.php tests/Feature/Content/PostAiTest.php; do XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done`
Expected: the two `RefuseIfSetUp` tests fail (`refuseIfSetUp` does not exist). The five `PostAiTest` tests pin behaviour Plan 2A built and may pass at once — write `Task 3: note: the image and visual-brief endpoint tests passed before any change (they fill release 2's test gap)`. If one fails, that is a defect: fix it here and write a `Task 3: Ruling:` line.

- [ ] **Step 3: The fix**

`ContentBrandEditor` (add `use App\Services\Content\ContentRefused;` if the namespace differs — both are `App\Services\Content`, so none is needed):

```php
    /**
     * Refuses a quick setup for a brand that is already set up — read from what is stored, so a run that finished
     * while this request waited for the lock is seen (spec 2026-10-15 §3.2).
     */
    public function refuseIfSetUp(ContentPlannerProfile $profile): void
    {
        if (ContentPlannerProfile::whereKey($profile->id)->whereNotNull('setup_completed_at')->exists()) {
            throw new ContentRefused('already_set_up', 'This brand is already set up — change it section by section.', 409);
        }
    }
```

`BrandController::quickSetup`: right after the lock is taken (after the `if (!$lock->get()) { … }` block), add

```php
        // A run that finished while this request waited must not be paid for twice.
        try {
            $this->editor->refuseIfSetUp($profile);
        } catch (ContentRefused $e) {
            $lock->release();
            throw $e;
        }
```

- [ ] **Step 4: Run the Content folders**

```bash
for p in tests/Feature/Content/ tests/Unit/Content/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app tests && git commit -q -F - <<'EOF'
Content server: quick setup checks again once it holds its lock; the image and visual-brief endpoints get their tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The Unscheduled tray says when it shows only part (spec §3.3)

**Files:**
- Modify: `app/Services/Content/ContentPlan.php` (`for`), `app/Http/Controllers/Api/V1/Admin/Content/PlanController.php` (`show`), `frontend/src/content/lib/types.ts` (`PlanPayload`), `frontend/src/content/plan/Tray.tsx`, `frontend/src/content/plan/PlanPage.tsx`
- Test: `tests/Feature/Content/PlanTest.php`, `frontend/src/content/plan/planPieces.test.tsx`
- Words: `content.plan.tray.showing`, `content.plan.tray.see_all`

**Interfaces:**
- Produces: the plan answer's `unscheduled_total: number` (posts with no day, archived left out — the same filter as `GET posts?unscheduled=1`); `Tray` prop `total?: number`.

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Content/PlanTest.php`:

```php
    public function test_the_tray_lists_a_hundred_and_says_how_many_there_are(): void
    {
        for ($i = 0; $i < 102; $i++) {
            $this->makePost(['scheduled_date' => null, 'topic' => "Idea {$i}"]);
        }
        $this->makePost(['scheduled_date' => null, 'status' => 'archived']);

        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))
            ->assertOk()->assertJsonCount(100, 'unscheduled')->assertJsonPath('unscheduled_total', 102);
        [$second] = $this->secondBrand(false);
        $this->asManager()->getJson($this->api("plan?from=2026-10-05&to=2026-10-11&brand_id={$second}"))
            ->assertOk()->assertJsonPath('unscheduled_total', 0);
    }
```

`frontend/src/content/plan/planPieces.test.tsx` (import `MemoryRouter` from `react-router-dom` if the file does not yet), in `describe('Tray')`:

```tsx
  it('says when it shows only part of the posts with no day, and links to all of them', () => {
    const out = html(<MemoryRouter><Tray posts={[post(1, { scheduled_date: null }), post(2, { scheduled_date: null })]} total={102} active={false} selectedId={null} onOpen={noop} /></MemoryRouter>)
    expect(out).toContain('Showing 2 of 102')
    expect(out).toMatch(/<a[^>]*href="\/content\/posts\?unscheduled=1"[^>]*>See all<\/a>/)
    expect(out).toContain('>102<')
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/PlanTest.php --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"` and `$R3A/vt.sh src/content/plan/planPieces.test.tsx`
Expected: FAIL — no `unscheduled_total`; the tray says nothing about the rest.

- [ ] **Step 3: The fixes**

`ContentPlan::for`: beside `$unscheduled`, count them all, and answer it (also add `unscheduled_total: int` to the method's `@return` shape):

```php
        $unscheduledTotal = ContentPlannerPost::where('planner_profile_id', $profile->id)
            ->whereNull('scheduled_date')->where('status', '!=', 'archived')->count();
```

and in the returned array, after `'unscheduled' => …`: `'unscheduled_total' => $unscheduledTotal,`.

`PlanController::show`, the no-profile answer: `['posts' => [], 'unscheduled' => [], 'unscheduled_total' => 0, 'slots' => [], 'figures' => [...]]`.

`frontend/src/content/lib/types.ts`: `export interface PlanPayload { posts: PostCard[]; unscheduled: PostCard[]; unscheduled_total?: number; slots: Slot[]; figures: PlanFigures }`.

`frontend/src/content/plan/Tray.tsx`: import `Link` from `react-router-dom`; add the prop `total?: number` (`/** Every post with no day; the tray lists the newest 100. */`); the header count becomes `{Math.max(total ?? 0, posts.length)}`; under the header:

```tsx
      {total !== undefined && total > posts.length && (
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-a-text-2">
          <span>{t('content.plan.tray.showing', 'Showing {{shown}} of {{total}}', { shown: posts.length, total })}</span>
          <Link to="/content/posts?unscheduled=1" className="font-semibold text-a-accent-text hover:underline">{t('content.plan.tray.see_all', 'See all')}</Link>
        </p>
      )}
```

`PlanPage.tsx`: `<Tray posts={data?.unscheduled ?? []} total={data?.unscheduled_total} …>`.

- [ ] **Step 4: The words**

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `plan.tray.showing` | Showing {{shown}} of {{total}} | Показано {{shown}} из {{total}} | {{shown}} von {{total}} angezeigt | {{shown}} sur {{total}} affichés | Se muestran {{shown}} de {{total}} |
| `plan.tray.see_all` | See all | Показать все | Alle ansehen | Tout voir | Ver todo |

Insert them into the `tray` object of each `content.<lang>.json` with a small Node script written by the Write tool (read the file, find the `"tray": {` object, add the two keys, `JSON.parse` the result and check both values in every bundle) — never through a heredoc.

- [ ] **Step 5: Run the tests**

Run: the PlanTest command above → green; `$R3A/vt.sh src/content` → all pass; `cd frontend && npx tsc -b` → clean.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app tests frontend/src/content && git commit -q -F - <<'EOF'
Content: the Unscheduled tray says when it shows only its newest 100, and links to all of them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Strategy — "stuck" on the server's clock; a finished generation refreshes every strategy (spec §3.3)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/StrategyController.php` (`index`), `frontend/src/content/lib/api.ts` (`strategies` type), `frontend/src/content/strategy/strategyMath.ts`, `frontend/src/content/strategy/StrategyPage.tsx`
- Test: `tests/Feature/Content/StrategyTest.php`, `frontend/src/content/strategy/strategyMath.test.ts`

**Interfaces:**
- Produces: the strategies list's `now` (ISO, the server's clock); `serverClock(data: { now?: string } | undefined, fetchedAt: number): number`; `generationFinished(before: Generation['state'], now: Generation['state']): boolean`.

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Content/StrategyTest.php`:

```php
    public function test_the_list_carries_the_servers_clock(): void
    {
        $this->asStaffMember()->getJson($this->api('strategies'))->assertOk()->assertJsonPath('now', '2026-10-05T06:00:00.000000Z');
    }
```

`frontend/src/content/strategy/strategyMath.test.ts` (import `serverClock`, `generationFinished` beside `generationState`):

```ts
describe('serverClock', () => {
  it('reads the clock the server sent with the list, else the time the list was read', () => {
    expect(serverClock({ now: '2026-10-05T06:00:00.000000Z' }, 123)).toBe(Date.parse('2026-10-05T06:00:00.000000Z'))
    expect(serverClock({}, 123)).toBe(123)
    expect(serverClock(undefined, 123)).toBe(123)
  })

  it('keeps a fresh generation running when this computer\'s clock runs an hour fast', () => {
    const making = [{ id: 9, title: null, summary: null, status: 'generating' as const, created_at: '2026-10-05T05:58:00.000000Z' }]
    const fastDevice = Date.parse('2026-10-05T07:00:00.000000Z')
    expect(generationState(making, fastDevice).state).toBe('stuck')
    expect(generationState(making, serverClock({ now: '2026-10-05T06:00:00.000000Z' }, fastDevice)).state).toBe('running')
  })
})

describe('generationFinished', () => {
  it('is true once a generation that was running is no longer running', () => {
    expect(generationFinished('running', 'none')).toBe(true)
    expect(generationFinished('running', 'stuck')).toBe(true)
    expect(generationFinished('running', 'running')).toBe(false)
    expect(generationFinished('none', 'none')).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/StrategyTest.php --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"` and `$R3A/vt.sh src/content/strategy/strategyMath.test.ts`
Expected: FAIL — no `now`; `serverClock` and `generationFinished` do not exist.

- [ ] **Step 3: The fixes**

`StrategyController::index` answers the server's clock with the list (the page judges "stuck" on it, not on the device):

```php
        return response()->json([
            'strategies' => $strategies->map(fn (ContentPlannerStrategy $s) => self::summary($s))->values(),
            'now'        => now()->toISOString(),
        ]);
```

`frontend/src/content/lib/api.ts`: `strategies` resolves to `{ strategies: StrategySummary[]; now?: string }`.

`frontend/src/content/strategy/strategyMath.ts`:

```ts
/** The server's clock when it answered the list (this computer's may be off); the time the list was read when it sent none. */
export function serverClock(data: { now?: string } | undefined, fetchedAt: number): number {
  const at = data?.now ? Date.parse(data.now) : NaN
  return Number.isNaN(at) ? fetchedAt : at
}

/** A generation that was running is over (made, failed or stuck): every cached strategy detail is out of date. */
export const generationFinished = (before: Generation['state'], now: Generation['state']): boolean =>
  before === 'running' && now !== 'running'
```

`frontend/src/content/strategy/StrategyPage.tsx`:
1. The list's `refetchInterval` passes `serverClock(query.state.data, query.state.dataUpdatedAt)` to `generationState`, and the page's `generation` is `generationState(strategies, serverClock(list.data, list.dataUpdatedAt))`.
2. With `const queryClient = useQueryClient()` (and `useEffect`, `useRef` imported):

```tsx
  // A finished generation changes which strategy is active: every cached detail (the old active's balance too) is read again.
  const lastState = useRef(generation.state)
  useEffect(() => {
    if (generationFinished(lastState.current, generation.state)) void queryClient.invalidateQueries({ queryKey: ['content', brand, 'strategy'] })
    lastState.current = generation.state
  }, [generation.state, queryClient, brand])
```

- [ ] **Step 4: Run the tests**

Run: the StrategyTest command above → green; `$R3A/vt.sh src/content/strategy` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app tests frontend/src/content && git commit -q -F - <<'EOF'
Content strategy: "stuck" judged on the server's clock; a finished generation refreshes every cached strategy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Brand changes mid-flight; post links that carry their brand (spec §3.3)

**Files:**
- Modify: `frontend/src/content/plan/planMath.ts`, `frontend/src/content/plan/PlanPage.tsx`, `frontend/src/content/panel/PanelProvider.tsx`, `frontend/src/content/lib/brand.ts`, `frontend/src/content/ContentProvider.tsx`, `frontend/src/content/lib/links.ts`, `frontend/src/content/panel/PostActions.tsx`
- Test: `frontend/src/content/plan/planMath.test.ts`, `frontend/src/content/lib/brand.test.ts`, `frontend/src/content/lib/links.test.ts`, `frontend/src/content/panel/PostPanel.test.tsx`, create `frontend/src/content/panel/panelBrand.test.ts`
- Words: `content.panel.actions.copy_link`, `content.panel.actions.link_copied`

**Interfaces:**
- Produces: `opensAfterFill(madeFor: number | null, shownNow: number | null): boolean`; `keepWithinBrand(brand: number | null)` (a TanStack `placeholderData` function); `firstBrand(search: string, storage: BrandStorage | null): number | null`; `postLink(id: number, brand: number | null): string`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/plan/planMath.test.ts` (import `opensAfterFill`, `keepWithinBrand`):

```ts
describe('brand changes while something is on its way', () => {
  // Plan B deferred: a Fill finishing after a brand switch opened the old brand's post id under the new brand.
  it('opens a filled post only while the portal still shows the brand it was made for', () => {
    expect(opensAfterFill(3, 3)).toBe(true)
    expect(opensAfterFill(3, 4)).toBe(false)
  })

  // Plan B deferred: a fallback to another brand briefly showed the old brand's plan (keepPreviousData).
  it('keeps the last plan on screen only while it is the same brand\'s', () => {
    const plan = { posts: [] }
    expect(keepWithinBrand(3)(plan, { queryKey: ['content', 3, 'plan', '2026-10-05', '2026-10-11'] })).toBe(plan)
    expect(keepWithinBrand(4)(plan, { queryKey: ['content', 3, 'plan', '2026-10-05', '2026-10-11'] })).toBeUndefined()
    expect(keepWithinBrand(3)(undefined, undefined)).toBeUndefined()
  })
})
```

`frontend/src/content/lib/brand.test.ts` (import `firstBrand`; the file has a storage fake — reuse it, or `const storage = (v: string | null) => ({ getItem: () => v, setItem: () => {}, removeItem: () => {} })`):

```ts
describe('firstBrand', () => {
  it('asks for the brand a shared post link names, else the one this device chose', () => {
    expect(firstBrand('?brand_id=7', storage('3'))).toBe(7)
    expect(firstBrand('', storage('3'))).toBe(3)
    expect(firstBrand('?brand_id=x', storage('3'))).toBe(3)
    expect(firstBrand('?brand_id=0', null)).toBeNull()
  })
})
```

`frontend/src/content/lib/links.test.ts` (import `postLink`):

```ts
  it('links a post with its brand, so a colleague on another brand opens the right one', () => {
    expect(postLink(5, 3)).toBe('/content/posts/5?brand_id=3')
    expect(postLink(5, null)).toBe('/content/posts/5')
  })
```

`frontend/src/content/panel/PostPanel.test.tsx`, in the test "offers AI and the actions on a saved post, …", add `expect(html).toContain('Copy link')`.

Create `frontend/src/content/panel/panelBrand.test.ts`:

```ts
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// Plan B deferred: a mid-session fallback to another brand kept the panel (and its post) open under the new brand.
describe('the panel belongs to one brand', () => {
  it('closes when the brand changes, whoever changed it, and forgets its unsaved edits', () => {
    const source = fs.readFileSync(new URL('./PanelProvider.tsx', import.meta.url), 'utf8')
    expect(source).toContain('useBrandId()')
    expect(source).toMatch(/if \(brand !== brandShown\) \{\s*setBrandShown\(brand\)\s*if \(brandShown !== null\) setTarget\(null\)/)
    expect(source).toMatch(/if \(brandBefore\.current !== null && brandBefore\.current !== brand\) dirty\.current = false/)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R3A/vt.sh src/content/plan/planMath.test.ts src/content/lib src/content/panel`
Expected: FAIL — the helpers do not exist; no "Copy link"; the panel does not follow the brand.

- [ ] **Step 3: The fixes**

`frontend/src/content/plan/planMath.ts`:

```ts
/** After an AI fill comes back: open its post only while the portal still shows the brand it was made for. */
export const opensAfterFill = (madeFor: number | null, shownNow: number | null): boolean => madeFor === shownNow

/** Keep showing the last plan while the next range loads — but never another brand's (a switch, or the server's fallback). */
export const keepWithinBrand = (brand: number | null) =>
  <T,>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }): T | undefined =>
    previousQuery?.queryKey[1] === brand ? previous : undefined
```

`frontend/src/content/plan/PlanPage.tsx`:
1. The plan query's `placeholderData: keepPreviousData` becomes `placeholderData: keepWithinBrand(brand)` (drop the `keepPreviousData` import if unused).
2. A ref of the brand on screen, kept in an effect: `const brandNow = useRef(brand)` and `useEffect(() => { brandNow.current = brand }, [brand])`.
3. In `fill`, take `const madeFor = brand` before the request, and right after `const { post } = await api.fill(…)`: `if (!opensAfterFill(madeFor, brandNow.current)) return // the brand changed while the AI wrote: this post belongs to the other one`.

`frontend/src/content/panel/PanelProvider.tsx` (import `useBrandId` from `'../ContentProvider'`): inside the provider, after the `target` state,

```tsx
  // The panel belongs to one brand: another brand — chosen (it already asked) or the server's fallback — closes it.
  // From no brand yet (the first read) nothing closes: a post kept from the last visit comes back on its brand.
  const brand = useBrandId()
  const [brandShown, setBrandShown] = useState(brand)
  if (brand !== brandShown) {
    setBrandShown(brand)
    if (brandShown !== null) setTarget(null)
  }
  const brandBefore = useRef(brand)
  useEffect(() => {
    if (brandBefore.current !== null && brandBefore.current !== brand) dirty.current = false
    brandBefore.current = brand
  }, [brand])
```

(`dirty` is the provider's existing ref of unsaved edits; adjust the name if it differs and keep the test's patterns in step. Check first how a kept post comes back — `grep -n "kept\|initial" frontend/src/content/panel/PanelProvider.tsx` — and write a `Task 6: note:` if it does not go through `target`.)

`frontend/src/content/lib/brand.ts`:

```ts
/** The brand to ask for first: the one a shared post link names (`?brand_id=`), else this device's own choice. */
export function firstBrand(search: string, storage: BrandStorage | null): number | null {
  return positiveId(new URLSearchParams(search).get('brand_id')) ?? storedBrand(storage)
}
```

`frontend/src/content/ContentProvider.tsx`: `const [asked, setAsked] = useState<number | null>(() => firstBrand(typeof window === 'undefined' ? '' : window.location.search, deviceStorage()))` (import `firstBrand`; a link's brand the person may not use falls back to their default through `loadBootstrap`, and the post then reads "not found").

`frontend/src/content/lib/links.ts`:

```ts
/** A post's own link (spec §4.3) with its brand, so it opens on the right brand for whoever follows it. */
export function postLink(id: number, brand: number | null): string {
  return brand === null ? `/content/posts/${id}` : `/content/posts/${id}?brand_id=${brand}`
}
```

`frontend/src/content/panel/PostActions.tsx` (import `Link2` from `lucide-react`, `useBoot` from `'../ContentProvider'`, `postLink` from `'../lib/links'`): a `linkCopied` state reset after 2 s exactly like `copied` (copy its effect), and after the Copy text button:

```tsx
        <Button size="sm" variant="secondary" disabled={waits}
          onClick={() => { void act('link', async () => { await navigator.clipboard.writeText(`${window.location.origin}${postLink(post.id, boot.brand?.id ?? null)}`); setLinkCopied(true) }) }}>
          <Link2 size={14} aria-hidden />{linkCopied ? t('content.panel.actions.link_copied', 'Link copied') : t('content.panel.actions.copy_link', 'Copy link')}
        </Button>
```

(with `const boot = useBoot()`; if `act`'s name is a typed union, add `'link'` to it.)

- [ ] **Step 4: The words**

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `panel.actions.copy_link` | Copy link | Копировать ссылку | Link kopieren | Copier le lien | Copiar enlace |
| `panel.actions.link_copied` | Link copied | Ссылка скопирована | Link kopiert | Lien copié | Enlace copiado |

Insert into the `actions` object inside `panel` of each bundle with a Write-tool Node script that parses and checks the result.

- [ ] **Step 5: Run the tests, the types and the lint**

Run: `$R3A/vt.sh src/content` → all pass. `cd frontend && npx tsc -b` → clean. The scoped lint → baseline only.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content: nothing of one brand shows under another; post links carry their brand, with Copy link in the panel

A Fill that finishes after a brand switch opens nothing; the panel closes
when the brand changes, also on the server's fallback; the Plan keeps the
last plan on screen only within one brand; a post link names its brand,
and opening one asks for that brand first.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Shift+arrows across a week's edge (spec §3.3)

**Files:**
- Modify: `frontend/src/content/plan/moveMath.ts`, `frontend/src/content/plan/PlanPage.tsx`
- Test: `frontend/src/content/plan/moveMath.test.ts`

**Interfaces:**
- Produces: `leavesRange(to: DateKey, range: { from: DateKey; to: DateKey }): boolean`.

- [ ] **Step 1: Write the failing test**

`frontend/src/content/plan/moveMath.test.ts` (import `leavesRange`):

```ts
describe('leavesRange', () => {
  // Plan B deferred: Shift+→ on Sunday saved the move but the card left the view and the focus with it.
  it('tells a keyboard move that leaves the week on screen, so the Plan can follow it', () => {
    const week = { from: '2026-10-05', to: '2026-10-11' }
    expect(leavesRange(keyMove('2026-10-11', 'ArrowRight', true) as string, week)).toBe(true)
    expect(leavesRange(keyMove('2026-10-05', 'ArrowLeft', true) as string, week)).toBe(true)
    expect(leavesRange(keyMove('2026-10-07', 'ArrowRight', true) as string, week)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `$R3A/vt.sh src/content/plan/moveMath.test.ts` → FAIL (`leavesRange` does not exist).

- [ ] **Step 3: The fix**

`frontend/src/content/plan/moveMath.ts`:

```ts
/** A keyboard move to a day outside the range on screen: the Plan shows that day's week and keeps the card focused. */
export const leavesRange = (to: DateKey, range: { from: DateKey; to: DateKey }): boolean => to < range.from || to > range.to
```

`frontend/src/content/plan/PlanPage.tsx`:
1. State for a card to focus once its new week is on screen: `const [follow, setFollow] = useState<number | null>(null)` and `const [focusCard, setFocusCard] = useState<{ id: number; seq: number } | null>(null)`.
2. In `onCardKeyDown`, before `void move(post, to, true, true)`: `if (leavesRange(to, range)) { setDate(to); setFollow(post.id) }`.
3. Adopted while rendering (no effect sets state), after the plan query:

```tsx
  // A card moved out of the week by keyboard: once its new week is read, focus it there.
  const followed = follow !== null && !query.isPlaceholderData && (query.data?.posts ?? []).some(p => p.id === follow)
  if (followed) {
    setFocusCard({ id: follow, seq: (focusCard?.seq ?? 0) + 1 })
    setFollow(null)
  }
  useEffect(() => {
    if (!focusCard) return
    const frame = window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-post="${focusCard.id}"]`)?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [focusCard])
```

(The `move` function's own focus call stays: inside the week it still finds the card.)

- [ ] **Step 4: Run the tests, the types and the lint**

Run: `$R3A/vt.sh src/content/plan` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content Plan: Shift+arrows past Sunday or Monday follow the card into the next week and keep it focused

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Brand page — one question to remove an audience, a tone that did not follow, focus after a refusal (spec §3.3)

**Files:**
- Create: `frontend/src/content/brand/voiceSave.ts` (+ `voiceSave.test.ts`)
- Modify: `frontend/src/content/brand/listActions.ts`, `frontend/src/content/brand/sections/Audiences.tsx`, `frontend/src/content/brand/sections/Voice.tsx`, `frontend/src/content/brand/SectionCard.tsx`
- Test: `frontend/src/content/brand/listActions.test.ts`, `frontend/src/content/brand/brandSections.test.tsx`
- Words: `content.brand.voice.tone_sync_failed`

**Interfaces:**
- Produces: `asksBeforeRemoving(audience: { posts_count: number }): boolean`; `saveVoiceAndTone(api, adopt, saveProfile, fields): Promise<'tone_sync_failed' | null>`; `SectionCard`'s `save` may resolve to a string — a warning shown under the read view after the section closes; the Save button carries `data-section-save=""`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/brand/listActions.test.ts` (import `asksBeforeRemoving`):

```ts
describe('asksBeforeRemoving', () => {
  // Plan C deferred: removing an audience posts use asked twice ("Remove?" then "N posts use it — remove anyway?").
  it('asks its own question only for an audience no post uses; the server\'s in-use answer brings the other one', () => {
    expect(asksBeforeRemoving({ posts_count: 0 })).toBe(true)
    expect(asksBeforeRemoving({ posts_count: 3 })).toBe(false)
  })
})
```

Create `frontend/src/content/brand/voiceSave.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { BrandPayload } from '../lib/types'
import { saveVoiceAndTone } from './voiceSave'

const answer = { profile: null, audiences: [], channels: [], voice: null, readiness: null } as unknown as BrandPayload

describe('saveVoiceAndTone', () => {
  it('saves the voice, then the default tone from it', async () => {
    const api = { saveVoice: vi.fn(async () => answer) }
    const adopt = vi.fn()
    const saveProfile = vi.fn(async () => {})
    await expect(saveVoiceAndTone(api, adopt, saveProfile, { tone: 'warm' })).resolves.toBeNull()
    expect(adopt).toHaveBeenCalledWith(answer)
    expect(saveProfile).toHaveBeenCalledWith({ default_tone: 'warm' })
  })

  // Plan C deferred: a tone that did not follow showed "could not be saved" with the form open, though the voice was saved.
  it('reports a tone that did not follow instead of failing the saved voice', async () => {
    const api = { saveVoice: vi.fn(async () => answer) }
    const adopt = vi.fn()
    const saveProfile = vi.fn(async () => { throw new Error('down') })
    await expect(saveVoiceAndTone(api, adopt, saveProfile, { tone: 'warm' })).resolves.toBe('tone_sync_failed')
    expect(adopt).toHaveBeenCalledWith(answer)
  })

  it('sends nothing when nothing changed, and leaves the tone alone when it was not changed', async () => {
    const api = { saveVoice: vi.fn(async () => answer) }
    const saveProfile = vi.fn(async () => {})
    await saveVoiceAndTone(api, vi.fn(), saveProfile, {})
    expect(api.saveVoice).not.toHaveBeenCalled()
    await saveVoiceAndTone(api, vi.fn(), saveProfile, { style: 'Calm' })
    expect(saveProfile).not.toHaveBeenCalled()
  })
})
```

`frontend/src/content/brand/brandSections.test.tsx`, in `describe('VoiceSection')`:

```tsx
  // Plan C deferred: after a refused save the keyboard fell to the page; it goes to the first marked field, else Save.
  it('marks its Save button so a refusal can bring the keyboard back to the form', () => {
    expect(renderBrand(brandWith(), true, <VoiceSection brand={brandWith()} canEdit startOpen />)).toContain('data-section-save=""')
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R3A/vt.sh src/content/brand` → FAIL (`asksBeforeRemoving`, `voiceSave` missing; no `data-section-save`).

- [ ] **Step 3: The fixes**

`frontend/src/content/brand/listActions.ts`:

```ts
/** Removing an audience asks first only when no post uses it: for one in use the server's answer brings the one question. */
export const asksBeforeRemoving = (audience: { posts_count: number }): boolean => audience.posts_count === 0
```

`frontend/src/content/brand/sections/Audiences.tsx`, `remove`: the first line becomes `if (asksBeforeRemoving(audience) && !window.confirm(w('remove_confirm', 'Remove this audience?'))) return`.

Create `frontend/src/content/brand/voiceSave.ts`:

```ts
import type { ContentApi } from '../lib/api'
import type { BrandPayload, ProfileFields } from '../lib/types'

type VoiceFields = Parameters<ContentApi['saveVoice']>[0]

/**
 * Saves the voice, then the profile's default tone from it (the AI writes new posts in that tone). The voice is
 * saved either way: a tone that did not follow is reported to the caller, not thrown (spec 2026-10-15 §3.3).
 */
export async function saveVoiceAndTone(
  api: Pick<ContentApi, 'saveVoice'>,
  adopt: (payload: BrandPayload) => void,
  saveProfile: (fields: ProfileFields) => Promise<void>,
  fields: VoiceFields,
): Promise<'tone_sync_failed' | null> {
  if (Object.keys(fields).length === 0) return null
  adopt(await api.saveVoice(fields))
  if (!('tone' in fields)) return null
  try {
    await saveProfile({ default_tone: fields.tone ?? null })
    return null
  } catch {
    return 'tone_sync_failed'
  }
}
```

`frontend/src/content/brand/sections/Voice.tsx`, `save` (lines 46–51) becomes:

```tsx
  const save = async (draft: VoiceForm, base: VoiceForm) => {
    const outcome = await saveVoiceAndTone(api, adopt, saveProfile, changedFields(voiceFields(base), voiceFields(draft)))
    return outcome === 'tone_sync_failed'
      ? t('content.brand.voice.tone_sync_failed', 'The voice is saved, but the default tone for new posts could not be updated. Save the voice again to try once more.')
      : undefined
  }
```

`frontend/src/content/brand/SectionCard.tsx`:
1. `save: (draft: F, base: F) => Promise<void | string | undefined>` (doc: `… a string it resolves to is a warning shown once the section closes (the save went through).`).
2. `const [warning, setWarning] = useState<string | null>(null)`; in `submit`'s `try`: `const said = await save(draft, base ?? draft)` then `setWarning(typeof said === 'string' ? said : null)` before `setDraft(null)`; the Edit click also calls `setWarning(null)`.
3. In the read view: `{draft === null && warning && <Notice tone="warning">{warning}</Notice>}` right after `readView`.
4. Focus after a refusal: `focusAfter` becomes `useRef<'form' | 'edit' | 'invalid' | null>(null)`; the effect's selector is `want === 'form' ? 'input, textarea, select, button[aria-pressed]' : want === 'invalid' ? '[aria-invalid="true"], [data-section-save]' : '[data-section-edit]'` (document order: a marked field comes before Save); `focusAfter.current = 'invalid'` in `submit`'s `catch` and in the `problems.length > 0` branch; the Save button gets `data-section-save=""`.

- [ ] **Step 4: The words**

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `brand.voice.tone_sync_failed` | The voice is saved, but the default tone for new posts could not be updated. Save the voice again to try once more. | Голос сохранён, но тон по умолчанию для новых постов не обновился. Сохраните голос ещё раз, чтобы повторить. | Die Stimme ist gespeichert, aber der Standardton für neue Beiträge konnte nicht aktualisiert werden. Speichern Sie die Stimme erneut, um es noch einmal zu versuchen. | La voix est enregistrée, mais le ton par défaut des nouvelles publications n’a pas pu être mis à jour. Enregistrez la voix à nouveau pour réessayer. | La voz se ha guardado, pero no se pudo actualizar el tono predeterminado de las nuevas publicaciones. Guarda la voz de nuevo para volver a intentarlo. |

Insert into the `voice` object inside `brand` of each bundle with a Write-tool Node script that parses and checks the result.

- [ ] **Step 5: Run the tests, the types and the lint**

Run: `$R3A/vt.sh src/content` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content Brand: one question to remove an audience, a tone that did not follow is said, focus returns after a refusal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: The shell — the panel's own error boundary; the calm notice when Content is switched off (spec §3.3)

Run after Task 6 (the panel test wraps `PanelProvider`, which now reads the brand).

**Files:**
- Create: `frontend/src/content/panel/PanelFailed.tsx` (+ `panelFailed.test.tsx`)
- Modify: `frontend/src/content/ui/ContentErrorBoundary.tsx`, `frontend/src/content/ContentShell.tsx`
- Test: `frontend/src/content/ui/contentErrorBoundary.test.tsx`, `frontend/src/content/ContentShell.test.tsx`
- Words: `content.panel.failed`

**Interfaces:**
- Produces: `ContentErrorBoundary` prop `fallback?: ReactNode` (drawn in place of its own notice); `PanelFailed()`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/ui/contentErrorBoundary.test.tsx`:

```tsx
  it('shows the fallback it was given in place of its own notice', () => {
    const boundary = new ContentErrorBoundary({ message: 'x', reload: 'y', fallback: <aside>The panel could not be shown</aside>, children: null })
    boundary.state = { failed: true }
    const html = renderToStaticMarkup(<>{boundary.render()}</>)
    expect(html).toContain('The panel could not be shown')
    expect(html).not.toContain('>y<')
  })
```

Create `frontend/src/content/panel/panelFailed.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap } from '../lib/types'
import { PanelFailed } from './PanelFailed'
import { PanelProvider } from './PanelProvider'

const boot = { brand: { id: 3, name: 'Lumière Salon' } } as unknown as Bootstrap

// Spec 2026-10-15 §3.3: a panel that breaks shows the portal's notice in the panel's place, with a way to close it.
describe('PanelFailed', () => {
  it('says the post could not be shown, in the panel\'s place, with Close', () => {
    const html = renderToStaticMarkup(
      <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PanelProvider><PanelFailed /></PanelProvider>
      </ContentContext.Provider>,
    )
    expect(html).toContain('data-panel=""')
    expect(html).toContain('role="alert"')
    expect(html).toContain('This post could not be shown. What you saved is safe.')
    expect(html).toMatch(/<button[^>]*>Close<\/button>/)
  })
})
```

`frontend/src/content/ContentShell.test.tsx`:

```tsx
  // Spec §8.2: an organisation with Content switched off is told so calmly, not sent to the dashboard without a word.
  it('says calmly that Content is switched off when the first visit is refused, with the way back', () => {
    const html = render({ data: undefined, isLoading: false, isError: true, error: refused('workspace_disabled') })
    expect(html).toContain('HexaTech Content has been switched off for your organisation.')
    expect(html).toContain('Open the full admin')
    expect(html).not.toContain('full admin dashboard')
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R3A/vt.sh src/content/ui src/content/panel/panelFailed.test.tsx src/content/ContentShell.test.tsx`
Expected: FAIL — no `fallback`; `PanelFailed` missing; the first refused visit redirects.

- [ ] **Step 3: The fixes**

`frontend/src/content/ui/ContentErrorBoundary.tsx`: `interface Props { message: string; reload: string; fallback?: ReactNode; children: ReactNode }` (doc: `` `fallback`: drawn in place of the notice where the page's own layout is wrong for it (the panel). ``); in `render()`, after `if (!this.state.failed) return this.props.children`: `if (this.props.fallback !== undefined) return this.props.fallback`.

Create `frontend/src/content/panel/PanelFailed.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { usePanel } from './PanelProvider'

/**
 * The post panel when it broke while drawing (spec 2026-10-15 §3.3): the portal's notice in the panel's own place and
 * a Close that does not ask about edits the broken panel can no longer hold.
 */
export function PanelFailed() {
  const { t } = useTranslation()
  const panel = usePanel()
  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="content-panel-failed" data-panel=""
      className="fixed bottom-0 right-0 top-14 z-30 flex w-full flex-col gap-3 border-l border-a-border bg-a-surface p-4 shadow-a-lg sm:w-[480px]">
      <h2 id="content-panel-failed" className="font-a-display text-xl font-normal text-a-text">{t('content.panel.title', 'Post')}</h2>
      <Notice tone="danger">{t('content.panel.failed', 'This post could not be shown. What you saved is safe.')}</Notice>
      <Button variant="secondary" onClick={() => { panel.reportDirty(false); panel.close() }}>{t('content.common.close', 'Close')}</Button>
    </aside>
  )
}
```

`frontend/src/content/ContentShell.tsx`:
1. The overlays wrap the panel, keyed by its opening so the next post starts fresh:

```tsx
        <ContentErrorBoundary key={panel.target?.seq ?? 0}
          message={t('content.panel.failed', 'This post could not be shown. What you saved is safe.')}
          reload={t('content.common.reload', 'Reload the page')} fallback={<PanelFailed />}>
          <PostPanel />
        </ContentErrorBoundary>
```

2. Delete `if (switchedOff && !data) return <Navigate to="/" replace />` (line 86) and the comment above it, so the stopped notice shows on a first visit too; drop `Navigate` from the `react-router-dom` import if nothing else uses it.

- [ ] **Step 4: The words**

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `panel.failed` | This post could not be shown. What you saved is safe. | Этот пост не удалось показать. Всё сохранённое на месте. | Dieser Beitrag konnte nicht angezeigt werden. Was Sie gespeichert haben, ist sicher. | Cette publication n’a pas pu s’afficher. Ce que vous avez enregistré est en sécurité. | No se pudo mostrar esta publicación. Lo que guardaste está a salvo. |

Insert into the `panel` object of each bundle with a Write-tool Node script that parses and checks the result.

- [ ] **Step 5: Run the tests, the types and the lint**

Run: `$R3A/vt.sh src/content` → all pass; `cd frontend && npx tsc -b` → clean; the scoped lint → baseline only.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content shell: a panel that breaks says so in its own place; a switched-off organisation gets the calm notice on its first visit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Best-time hints and a channel's usual time (spec §5, server and the shared table)

**Files:**
- Create: `database/migrations/2026_10_15_100000_add_post_time_to_content_planner_channels.php`, `app/Services/Content/BestTimes.php`, `frontend/src/content/lib/bestTimes.json`, `frontend/src/content/lib/bestTimes.ts` (+ `bestTimes.test.ts`), `tests/Feature/Content/BestTimesTest.php`
- Modify: `tests/Concerns/SetsUpContentSchema.php`, `app/Models/ContentPlannerChannel.php` (`$fillable`), `app/Services/Content/ContentRules.php` (`channelFields`), `app/Services/Content/ContentBrandEditor.php` (`CHANNEL_FIELDS`), `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php` (`channel()`), `app/Services/ContentCalendarGenerationService.php` (`generate`), `frontend/src/content/lib/types.ts` (`Channel`)

**Interfaces:**
- Produces: `content_planner_channels.post_time` (`HH:MM` or null) in every channel answer; `BestTimes::TABLE`, `BestTimes::suggested(string $platform, ?string $industry): array`, `BestTimes::usual(?string $postTime, string $platform, ?string $industry): ?string`; TS `suggestedTimes(platform, industry): string[]`, `usualTime(channel, industry): string | null`; Generate and Fill give a post the AI left without a time its channel's usual time.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/lib/bestTimes.json` first (the table both sides read; spec §5):

```json
{
  "default": {
    "instagram": ["11:00", "19:00"],
    "facebook": ["09:00", "13:00"],
    "linkedin": ["08:00", "12:00"],
    "tiktok": ["18:00", "21:00"],
    "x": ["09:00", "12:00"],
    "youtube": ["15:00", "18:00"],
    "blog": ["10:00"],
    "email": ["10:00"]
  },
  "industries": {
    "beauty": { "facebook": ["10:00", "19:00"] },
    "fitness": { "instagram": ["06:30", "18:00"], "facebook": ["06:30", "18:00"] },
    "restaurant": { "instagram": ["11:00", "17:00"], "facebook": ["11:00", "17:00"] },
    "hotel": { "instagram": ["10:00", "20:00"], "facebook": ["10:00", "20:00"] },
    "medical": { "instagram": ["12:00", "19:00"], "facebook": ["09:00", "12:00"] }
  }
}
```

Create `frontend/src/content/lib/bestTimes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { suggestedTimes, usualTime } from './bestTimes'

describe('suggestedTimes', () => {
  it('takes the industry\'s own times where it has them, else the platform\'s', () => {
    expect(suggestedTimes('facebook', 'beauty')).toEqual(['10:00', '19:00'])
    expect(suggestedTimes('instagram', 'beauty')).toEqual(['11:00', '19:00'])
    expect(suggestedTimes('instagram', 'fitness')).toEqual(['06:30', '18:00'])
    expect(suggestedTimes('linkedin', 'unknown')).toEqual(['08:00', '12:00'])
    expect(suggestedTimes('blog', null)).toEqual(['10:00'])
  })
})

describe('usualTime', () => {
  it('is the channel\'s own time, else the first suggested one', () => {
    expect(usualTime({ platform: 'instagram', post_time: '08:30' }, 'beauty')).toBe('08:30')
    expect(usualTime({ platform: 'instagram', post_time: null }, 'beauty')).toBe('11:00')
    expect(usualTime({ platform: 'instagram' }, 'restaurant')).toBe('11:00')
  })
})
```

Create `tests/Feature/Content/BestTimesTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Services\Content\BestTimes;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Best-time hints and a channel's usual time (spec 2026-10-15 §5). */
class BestTimesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_the_server_and_the_portal_read_the_same_table(): void
    {
        $this->assertSame(json_decode((string) file_get_contents(base_path('frontend/src/content/lib/bestTimes.json')), true), BestTimes::TABLE);
        $this->assertSame(['10:00', '19:00'], BestTimes::suggested('facebook', 'beauty'));
        $this->assertSame('11:00', BestTimes::usual(null, 'instagram', 'beauty'));
        $this->assertSame('08:30', BestTimes::usual('08:30', 'instagram', 'beauty'));
    }

    public function test_a_channel_keeps_a_usual_time_typed_as_hh_mm_and_clears_it_when_emptied(): void
    {
        $channel = ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'instagram')->firstOrFail();

        $this->asManager()->putJson($this->api("brand/channels/{$channel->id}"), ['post_time' => '08:30'])->assertOk()->assertJsonPath('channel.post_time', '08:30');
        foreach (['9:00', '25:00', '08:30:00', 'soon'] as $bad) {
            $this->asManager()->putJson($this->api("brand/channels/{$channel->id}"), ['post_time' => $bad])->assertStatus(422)->assertJsonValidationErrors('post_time');
        }
        $this->asManager()->putJson($this->api("brand/channels/{$channel->id}"), ['post_time' => ''])->assertOk()->assertJsonPath('channel.post_time', null);
    }

    public function test_generated_posts_without_a_time_get_the_channels_usual_time(): void
    {
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'instagram')->update(['post_time' => '08:30']);
        $untimed = fn (string $date, string $platform) => array_diff_key($this->calendarItem($date, $platform), ['time' => true]);
        $this->fakeAi([$untimed('2026-10-07', 'instagram'), $untimed('2026-10-06', 'linkedin')]);

        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertOk();

        $this->assertSame('08:30', substr((string) ContentPlannerPost::where('platform', 'instagram')->value('scheduled_time'), 0, 5));
        // LinkedIn has no usual time of its own: the first suggested one.
        $this->assertSame('08:00', substr((string) ContentPlannerPost::where('platform', 'linkedin')->value('scheduled_time'), 0, 5));
    }

    public function test_a_filled_post_without_a_time_gets_the_channels_usual_time(): void
    {
        $this->fakeAi([array_diff_key($this->calendarItem('2026-10-09', 'instagram'), ['time' => true])]);

        $this->asStaffMember()->postJson($this->api('slots/fill'), ['date' => '2026-10-09', 'platform' => 'instagram'])
            ->assertCreated()->assertJsonPath('post.scheduled_time', '11:00');
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/BestTimesTest.php --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"` and `$R3A/vt.sh src/content/lib/bestTimes.test.ts`
Expected: FAIL — `BestTimes` and `bestTimes.ts` do not exist; no `post_time` column.

- [ ] **Step 3: The migration, and the test schema that runs it**

Create `database/migrations/2026_10_15_100000_add_post_time_to_content_planner_channels.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A channel's usual posting time, HH:MM on the venue's clock (spec 2026-10-15 §5); empty = the first suggested time. */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('content_planner_channels', 'post_time')) {
            Schema::table('content_planner_channels', function (Blueprint $table) {
                $table->string('post_time', 5)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('content_planner_channels', 'post_time')) {
            Schema::table('content_planner_channels', function (Blueprint $table) {
                $table->dropColumn('post_time');
            });
        }
    }
};
```

`tests/Concerns/SetsUpContentSchema.php`, after the visual-briefs `image_url` guard (line 795):

```php
        if (!Schema::hasColumn('content_planner_channels', 'post_time')) {
            (require database_path('migrations/2026_10_15_100000_add_post_time_to_content_planner_channels.php'))->up();
        }
```

- [ ] **Step 4: The table and the usual time**

Create `app/Services/Content/BestTimes.php` (the arrays copy `bestTimes.json` exactly — the first test keeps them equal):

```php
<?php

namespace App\Services\Content;

/**
 * Suggested posting times per platform, with industry overrides (spec 2026-10-15 §5): research-based starting points,
 * not learned from the venue. The same table as frontend/src/content/lib/bestTimes.json (BestTimesTest keeps them equal).
 */
final class BestTimes
{
    public const TABLE = [
        'default' => [
            'instagram' => ['11:00', '19:00'],
            'facebook'  => ['09:00', '13:00'],
            'linkedin'  => ['08:00', '12:00'],
            'tiktok'    => ['18:00', '21:00'],
            'x'         => ['09:00', '12:00'],
            'youtube'   => ['15:00', '18:00'],
            'blog'      => ['10:00'],
            'email'     => ['10:00'],
        ],
        'industries' => [
            'beauty'     => ['facebook' => ['10:00', '19:00']],
            'fitness'    => ['instagram' => ['06:30', '18:00'], 'facebook' => ['06:30', '18:00']],
            'restaurant' => ['instagram' => ['11:00', '17:00'], 'facebook' => ['11:00', '17:00']],
            'hotel'      => ['instagram' => ['10:00', '20:00'], 'facebook' => ['10:00', '20:00']],
            'medical'    => ['instagram' => ['12:00', '19:00'], 'facebook' => ['09:00', '12:00']],
        ],
    ];

    /** @return list<string> */
    public static function suggested(string $platform, ?string $industry): array
    {
        return self::TABLE['industries'][$industry ?? ''][$platform] ?? self::TABLE['default'][$platform] ?? [];
    }

    /** A channel's usual time: its own, else the first suggested time for its platform. */
    public static function usual(?string $postTime, string $platform, ?string $industry): ?string
    {
        return $postTime ?: (self::suggested($platform, $industry)[0] ?? null);
    }
}
```

Create `frontend/src/content/lib/bestTimes.ts`:

```ts
import table from './bestTimes.json'
import type { Platform } from './types'

type Times = Record<string, string[]>
const DEFAULT: Times = table.default
const INDUSTRIES: Record<string, Times> = table.industries

/** Suggested posting times for a platform, the industry's own where it has them (spec 2026-10-15 §5; the server reads the same table). */
export function suggestedTimes(platform: Platform, industry: string | null | undefined): string[] {
  return (industry ? INDUSTRIES[industry]?.[platform] : undefined) ?? DEFAULT[platform] ?? []
}

/** A channel's usual time: its own, else the first suggested time for its platform. */
export function usualTime(channel: { platform: Platform; post_time?: string | null }, industry: string | null | undefined): string | null {
  return channel.post_time || suggestedTimes(channel.platform, industry)[0] || null
}
```

`frontend/src/content/lib/types.ts`: the `Channel` interface gains `post_time: string | null`.

The channel accepts and answers the time:
- `ContentRules::channelFields`: `'post_time' => ['sometimes', 'nullable', 'date_format:H:i'],` (two-digit hours only; an empty string reaches it as null).
- `ContentBrandEditor::CHANNEL_FIELDS` gains `'post_time'`.
- `ContentPlannerChannel::$fillable` gains `'post_time'`.
- `BrandController::channel()`'s `only([...])` gains `'post_time'`.

`ContentCalendarGenerationService::generate` (add `use App\Models\Organization;` and `use App\Services\Content\BestTimes;`): right after the active channels are read and filtered (lines 66–72), before `if ($channels->isEmpty())`:

```php
        // A post the AI gave no time takes its channel's usual time (spec 2026-10-15 §5): its own, else the first suggested.
        $industry = Organization::find($profile->organization_id)?->resolved_industry;
        $usualTimes = [];
        foreach ($channels as $channel) {
            $usualTimes[(string) $channel->platform] ??= BestTimes::usual($channel->post_time, (string) $channel->platform, $industry);
        }
```

and in the post's attributes (line ~245): `'scheduled_time' => $time ?? ($usualTimes[$platform] ?? null),`.

- [ ] **Step 5: Run the tests, and the calendar folder**

```bash
for p in tests/Feature/Content/ tests/Feature/ContentCalendar/ tests/Unit/Content/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
cd frontend && npx tsc -b && echo TSC-CLEAN && ../.superpowers/sdd/2026-10-15-content-release-3a/vt.sh src/content 2>&1 | tail -2
```

Expected: all green (`CalendarGenerationTest`'s items carry no time, and no existing test asserts a generated post's time).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app database tests frontend/src/content && git commit -q -F - <<'EOF'
Content: a channel's usual posting time and best-time hints; Generate and Fill use them

One table of suggested times per platform and industry, read by the
server and the portal alike; a channel keeps an optional usual time
(HH:MM, additive migration); a post the AI leaves without a time gets its
channel's usual time.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Hashtag groups and snippets — the table and its endpoints (spec §6)

**Files:**
- Create: `database/migrations/2026_10_15_100100_create_content_planner_snippets_table.php`, `app/Models/ContentPlannerSnippet.php`, `tests/Feature/Content/SnippetsTest.php`
- Modify: `tests/Concerns/SetsUpContentSchema.php`, `app/Models/ContentPlannerProfile.php` (`snippets()`), `app/Services/Content/ContentRules.php` (`snippetFields`), `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php` (`storeSnippet`, `updateSnippet`, `destroySnippet`, `payload`), `routes/api.php`, `tests/Feature/Content/ContentGateTest.php`

**Interfaces:**
- Produces: `GET brand` (and every brand write) answers `snippets: [{id, kind, name, body}]` (hashtag groups first, then text snippets, each in the order made); `POST brand/snippets` `{kind, name, body}` → 201 `{snippet, …brand}`; `PUT brand/snippets/{id}` `{name?, body?}`; `DELETE brand/snippets/{id}`; refusal `too_many_snippets` (422) past 50 of a kind; `ContentPlannerSnippet::KINDS = ['hashtags', 'text']`, `MAX_PER_KIND = 50`.

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/Content/SnippetsTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerSnippet;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Hashtag groups and snippets (spec 2026-10-15 §6): everyone reads them, managers keep them. */
class SnippetsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_manager_keeps_hashtag_groups_and_snippets_and_everyone_reads_them(): void
    {
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'Sign-off', 'body' => 'See you at the studio!'])->assertCreated();
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'hashtags', 'name' => 'Autumn colour', 'body' => '#autumnhair #copperhair'])
            ->assertCreated()->assertJsonPath('snippet.kind', 'hashtags')->assertJsonPath('snippet.name', 'Autumn colour');

        $this->asStaffMember()->getJson($this->api('brand'))->assertOk()
            ->assertJsonCount(2, 'snippets')->assertJsonPath('snippets.0.kind', 'hashtags')->assertJsonPath('snippets.1.body', 'See you at the studio!');
    }

    public function test_staff_may_not_change_them(): void
    {
        $this->asStaffMember()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'x', 'body' => 'y'])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');
    }

    public function test_a_snippet_is_edited_and_removed_and_another_brands_does_not_exist_here(): void
    {
        $id = $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'Sign-off', 'body' => 'See you!'])->json('snippet.id');
        $this->asManager()->putJson($this->api("brand/snippets/{$id}"), ['body' => 'See you soon!'])->assertOk()->assertJsonPath('snippet.body', 'See you soon!');
        $this->asManager()->putJson($this->api("brand/snippets/{$id}"), ['kind' => 'hashtags'])->assertStatus(422)->assertJsonValidationErrors('kind');

        [$second] = $this->secondBrand();
        $theirs = $this->asManager()->postJson($this->api("brand/snippets?brand_id={$second}"), ['kind' => 'text', 'name' => 'Theirs', 'body' => 'Theirs'])->json('snippet.id');
        $this->asManager()->putJson($this->api("brand/snippets/{$theirs}"), ['body' => 'Mine now'])->assertNotFound();
        $this->asManager()->deleteJson($this->api("brand/snippets/{$theirs}"))->assertNotFound();

        $this->asManager()->deleteJson($this->api("brand/snippets/{$id}"))->assertOk()->assertJsonCount(0, 'snippets');
    }

    public function test_kinds_names_bodies_and_the_fifty_of_a_kind_are_checked(): void
    {
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'emoji', 'name' => 'x', 'body' => 'y'])->assertStatus(422)->assertJsonValidationErrors('kind');
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => str_repeat('n', 61), 'body' => 'y'])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'x', 'body' => str_repeat('b', 2001)])->assertStatus(422)->assertJsonValidationErrors('body');
        for ($i = 0; $i < 50; $i++) {
            ContentPlannerSnippet::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'kind' => 'hashtags', 'name' => "Group {$i}", 'body' => '#a']);
        }
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'hashtags', 'name' => 'One more', 'body' => '#b'])
            ->assertStatus(422)->assertJsonPath('error', 'too_many_snippets');
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'Still fine', 'body' => 'ok'])->assertCreated();
    }

    public function test_a_brand_without_a_profile_keeps_no_snippets(): void
    {
        [$second] = $this->secondBrand(false);
        $this->asManager()->postJson($this->api("brand/snippets?brand_id={$second}"), ['kind' => 'text', 'name' => 'x', 'body' => 'y'])
            ->assertStatus(409)->assertJsonPath('error', 'no_profile');
        $this->asManager()->getJson($this->api("brand?brand_id={$second}"))->assertOk()->assertJsonPath('snippets', []);
    }
}
```

`tests/Feature/Content/ContentGateTest.php`, the `$managerOnly` list (lines 65–72) gains `['POST', 'brand/snippets']`, `['PUT', 'brand/snippets/1']`, `['DELETE', 'brand/snippets/1']`.

- [ ] **Step 2: Run them to see them fail**

Run: `for p in tests/Feature/Content/SnippetsTest.php tests/Feature/Content/ContentGateTest.php; do XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done`
Expected: FAIL — no routes, no table.

- [ ] **Step 3: The table, the model, the rules**

Create `database/migrations/2026_10_15_100100_create_content_planner_snippets_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A brand's saved hashtag groups and text snippets (spec 2026-10-15 §6). */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_snippets')) {
            return;
        }
        Schema::create('content_planner_snippets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('kind', 20);
            $table->string('name', 60);
            $table->text('body');
            $table->integer('sort_order')->default(0);
            $table->timestamps();
            $table->index(['planner_profile_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_snippets');
    }
};
```

`tests/Concerns/SetsUpContentSchema.php`, after Task 10's guard:

```php
        if (!Schema::hasTable('content_planner_snippets')) {
            (require database_path('migrations/2026_10_15_100100_create_content_planner_snippets_table.php'))->up();
        }
```

Create `app/Models/ContentPlannerSnippet.php`:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/** A saved hashtag group or text snippet of a brand's Content profile (spec 2026-10-15 §6). */
class ContentPlannerSnippet extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const KINDS = ['hashtags', 'text'];

    /** A brand keeps at most this many of each kind. */
    public const MAX_PER_KIND = 50;

    protected $fillable = ['planner_profile_id', 'brand_id', 'kind', 'name', 'body', 'sort_order'];

    protected $casts = ['sort_order' => 'integer'];
}
```

`ContentPlannerProfile` (beside `channels()`):

```php
    public function snippets(): HasMany
    {
        return $this->hasMany(ContentPlannerSnippet::class, 'planner_profile_id');
    }
```

`ContentRules` (add `use App\Models\ContentPlannerSnippet;`):

```php
    /** A hashtag group or a text snippet (spec 2026-10-15 §6); its kind is fixed once made. */
    public static function snippetFields(bool $creating): array
    {
        return [
            'kind' => $creating ? ['required', Rule::in(ContentPlannerSnippet::KINDS)] : ['prohibited'],
            'name' => $creating ? ['required', 'string', 'max:60'] : ['sometimes', 'string', 'max:60'],
            'body' => $creating ? ['required', 'string', 'max:2000'] : ['sometimes', 'string', 'max:2000'],
        ];
    }
```

- [ ] **Step 4: The endpoints**

`BrandController` (add `use App\Models\ContentPlannerSnippet;`):

```php
    /** A hashtag group or snippet (spec 2026-10-15 §6): managers keep them, at most 50 of each kind per brand. */
    public function storeSnippet(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $data = $request->validate(ContentRules::snippetFields(true));
        if ($profile->snippets()->where('kind', $data['kind'])->count() >= ContentPlannerSnippet::MAX_PER_KIND) {
            throw new ContentRefused('too_many_snippets', 'A brand keeps at most ' . ContentPlannerSnippet::MAX_PER_KIND . ' of each.', 422);
        }
        $snippet = $profile->snippets()->create($data + [
            'brand_id'   => $profile->brand_id,
            'sort_order' => (int) $profile->snippets()->max('sort_order') + 1,
        ]);

        return response()->json(['snippet' => $this->snippet($snippet)] + $this->payload($profile->fresh()), 201);
    }

    public function updateSnippet(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $snippet = $this->findSnippet($profile, $id);
        $snippet->fill($request->validate(ContentRules::snippetFields(false)))->save();

        return response()->json(['snippet' => $this->snippet($snippet->fresh())] + $this->payload($profile->fresh()));
    }

    public function destroySnippet(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $this->findSnippet($profile, $id)->delete();

        return response()->json($this->payload($profile->fresh()));
    }

    private function findSnippet(ContentPlannerProfile $profile, int $id): ContentPlannerSnippet
    {
        return $profile->snippets()->find($id) ?? throw new ContentRefused('not_found', 'This item no longer exists.', 404);
    }

    /** @return array{id: int, kind: string, name: string, body: string} */
    private function snippet(ContentPlannerSnippet $snippet): array
    {
        return ['id' => (int) $snippet->id, 'kind' => (string) $snippet->kind, 'name' => (string) $snippet->name, 'body' => (string) $snippet->body];
    }
```

`BrandController::payload()`: the no-profile answer gains `'snippets' => []`; the full answer gains, after `'channels'`:

```php
            'snippets'  => $profile->snippets()->orderBy('kind')->orderBy('sort_order')->orderBy('id')->get()
                ->map(fn (ContentPlannerSnippet $s) => $this->snippet($s))->values()->all(),
```

(`orderBy('kind')` puts `hashtags` before `text`.)

`routes/api.php`, in the Content group after `brand/refresh-knowledge` (line 1314):

```php
            Route::post('brand/snippets', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'storeSnippet']);
            Route::put('brand/snippets/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'updateSnippet'])->whereNumber('id');
            Route::delete('brand/snippets/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'destroySnippet'])->whereNumber('id');
```

- [ ] **Step 5: Run the Content folders and AdminAccess**

```bash
for p in tests/Feature/Content/ tests/Unit/Content/ tests/Feature/AdminAccess/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
```

Expected: all green (AdminAccess proves the new routes sit under the `admin/content` key).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app database routes tests && git commit -q -F - <<'EOF'
Content server: hashtag groups and snippets — a brand's table, read by everyone, kept by managers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 12: Hashtag-group suggestions from the AI (spec §6)

**Files:**
- Create: `app/Services/Content/ContentSnippetSuggester.php`, `tests/Unit/Content/SnippetSuggesterCleanTest.php`
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php` (`suggestSnippets`), `routes/api.php`, `tests/Feature/Content/SnippetsTest.php`, `tests/Feature/Content/ContentGateTest.php`, `tests/Feature/Content/AiLedgerTest.php`

**Interfaces:**
- Produces: `POST brand/snippets/suggest` (managers) → `{suggestions: [{name, body}]}` — 3 to 5 groups, nothing saved; `ContentSnippetSuggester::suggest(ContentPlannerProfile $profile): array`, `ContentSnippetSuggester::clean(array $data): array`.

- [ ] **Step 1: Write the failing tests**

Create `tests/Unit/Content/SnippetSuggesterCleanTest.php`:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentSnippetSuggester;
use PHPUnit\Framework\TestCase;

/** What the AI's hashtag groups are cut to before anyone sees them (spec 2026-10-15 §6). */
class SnippetSuggesterCleanTest extends TestCase
{
    public function test_it_keeps_named_groups_of_distinct_one_word_hashtags(): void
    {
        $groups = ContentSnippetSuggester::clean(['groups' => [
            ['name' => 'Autumn colour', 'hashtags' => ['#autumnhair', 'copper hair', '#AutumnHair', '#']],
            ['name' => '', 'hashtags' => ['#x']],
            ['name' => 'Empty', 'hashtags' => []],
            ['name' => str_repeat('n', 70), 'hashtags' => array_map(fn ($i) => "#tag{$i}", range(1, 40))],
        ]]);

        $this->assertCount(2, $groups);
        $this->assertSame(['name' => 'Autumn colour', 'body' => '#autumnhair #copperhair'], $groups[0]);
        $this->assertSame(60, mb_strlen($groups[1]['name']));
        $this->assertCount(30, explode(' ', $groups[1]['body']));
    }

    public function test_it_keeps_at_most_five_groups_and_nothing_from_an_answer_without_groups(): void
    {
        $many = ['groups' => array_map(fn ($i) => ['name' => "Group {$i}", 'hashtags' => ['#a']], range(1, 8))];
        $this->assertCount(5, ContentSnippetSuggester::clean($many));
        $this->assertSame([], ContentSnippetSuggester::clean(['text' => 'no groups']));
    }
}
```

`tests/Feature/Content/SnippetsTest.php` (add `use App\Services\Content\ContentSnippetSuggester;` and `use Mockery;`):

```php
    public function test_a_manager_gets_hashtag_group_suggestions_and_nothing_is_saved(): void
    {
        $suggester = Mockery::mock(ContentSnippetSuggester::class);
        $suggester->shouldReceive('suggest')->once()->andReturn([['name' => 'Autumn colour', 'body' => '#autumnhair #copperhair']]);
        $this->app->instance(ContentSnippetSuggester::class, $suggester);

        $this->asManager()->postJson($this->api('brand/snippets/suggest'))->assertOk()->assertJsonPath('suggestions.0.name', 'Autumn colour');
        $this->assertSame(0, ContentPlannerSnippet::count());
    }

    public function test_suggestions_are_for_managers_fail_in_our_words_and_wait_at_the_budget_cap(): void
    {
        $suggester = Mockery::mock(ContentSnippetSuggester::class);
        $suggester->shouldReceive('suggest')->once()->andThrow(new \RuntimeException('Private provider detail'));
        $this->app->instance(ContentSnippetSuggester::class, $suggester);

        $this->asStaffMember()->postJson($this->api('brand/snippets/suggest'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asManager()->postJson($this->api('brand/snippets/suggest'))->assertStatus(502)->assertJsonPath('error', 'ai_failed')->assertDontSee('Private provider detail');
        $this->setAiCap(100, 120);
        $this->asManager()->postJson($this->api('brand/snippets/suggest'))->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
    }
```

`ContentGateTest`'s `$managerOnly` list gains `['POST', 'brand/snippets/suggest']`.

`tests/Feature/Content/AiLedgerTest.php` (the suggester is mocked in the endpoint tests, so its wiring to the counted client is read from the source, as the image service's is):

```php
    public function test_hashtag_suggestions_go_through_the_counted_ai_client(): void
    {
        $source = file_get_contents(app_path('Services/Content/ContentSnippetSuggester.php'));
        $this->assertStringContainsString('protected AiClient $ai', $source);
        $this->assertStringContainsString("->generateJson(\$profile, 'snippet_suggest'", $source);
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `for p in tests/Unit/Content/SnippetSuggesterCleanTest.php tests/Feature/Content/SnippetsTest.php tests/Feature/Content/ContentGateTest.php tests/Feature/Content/AiLedgerTest.php; do XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done`
Expected: FAIL — the suggester and the route do not exist.

- [ ] **Step 3: The suggester and the endpoint**

Create `app/Services/Content/ContentSnippetSuggester.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Services\ContentPlanner\AiClient;

/**
 * Proposes hashtag groups for a brand from its pillars, audiences and industry (spec 2026-10-15 §6): one AI call,
 * nothing saved. Not final, so tests mock it (AiClient's provider path cannot be faked).
 */
class ContentSnippetSuggester
{
    public function __construct(protected AiClient $ai)
    {
    }

    /** @return list<array{name: string, body: string}> */
    public function suggest(ContentPlannerProfile $profile): array
    {
        return self::clean($this->ai->generateJson($profile, 'snippet_suggest', $this->prompt($profile), 2000));
    }

    /**
     * The AI's answer as at most 5 groups: a name of at most 60 characters and up to 30 distinct hashtags (ignoring
     * case), each one word starting with #. Groups without a name or a hashtag, and anything else, are dropped.
     *
     * @return list<array{name: string, body: string}>
     */
    public static function clean(array $data): array
    {
        $groups = [];
        foreach ((array) ($data['groups'] ?? []) as $group) {
            $name = trim((string) ($group['name'] ?? ''));
            $tags = [];
            foreach ((array) ($group['hashtags'] ?? []) as $tag) {
                $tag = '#' . ltrim((string) preg_replace('/\s+/u', '', (string) $tag), '#');
                if ($tag !== '#' && !in_array(mb_strtolower($tag), array_map('mb_strtolower', $tags), true)) {
                    $tags[] = $tag;
                }
            }
            if ($name !== '' && $tags !== []) {
                $groups[] = ['name' => mb_substr($name, 0, 60), 'body' => implode(' ', array_slice($tags, 0, 30))];
            }
        }

        return array_slice($groups, 0, 5);
    }

    private function prompt(ContentPlannerProfile $profile): string
    {
        $pillars = ContentPlannerPillar::where('planner_profile_id', $profile->id)->where('active', true)->pluck('name')->implode(', ');
        $audiences = ContentPlannerAudience::where('planner_profile_id', $profile->id)->where('active', true)->pluck('name')->implode(', ');
        $industry = Organization::find($profile->organization_id)?->resolved_industry ?? 'other';
        $language = $profile->default_language ?: 'en';

        return "You suggest hashtag groups for the social posts of a {$industry} business.\n"
            . "Brand: {$profile->name}. Content pillars: " . ($pillars ?: 'none yet') . '. Audiences: ' . ($audiences ?: 'none yet') . ".\n"
            . "Write 3 to 5 groups. Each has a short name in the language '{$language}' and 8 to 15 relevant hashtags: mix popular and local or niche ones; no spaces inside a hashtag.\n"
            . 'Return ONLY JSON: {"groups": [{"name": "...", "hashtags": ["#..."]}]}';
    }
}
```

`BrandController` (add `use App\Services\Content\ContentSnippetSuggester;`; `ContentAiGate` is already imported for Quick setup):

```php
    /** Hashtag groups the AI proposes for this brand (spec 2026-10-15 §6): suggestions only, nothing is saved. */
    public function suggestSnippets(Request $request, ContentAiGate $gate, ContentSnippetSuggester $suggester): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $gate->allow($request->attributes->get('workspace_org'));
        $profile = ContentContext::requireProfile();
        set_time_limit(120);
        try {
            $suggestions = $suggester->suggest($profile);
        } catch (ContentRefused $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);
            // The provider's own words stay in the log.
            throw new ContentRefused('ai_failed', 'The AI could not finish this. Please try again.', 502);
        }

        return response()->json(['suggestions' => $suggestions]);
    }
```

`routes/api.php`, before `brand/snippets` (Task 11):

```php
            Route::post('brand/snippets/suggest', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'suggestSnippets']);
```

- [ ] **Step 4: Run the Content folders**

```bash
for p in tests/Feature/Content/ tests/Unit/Content/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app routes tests && git commit -q -F - <<'EOF'
Content server: the AI suggests hashtag groups from the brand's pillars, audiences and industry — nothing saved

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 13: Posting goals and streaks (spec §7)

**Files:**
- Create: `app/Services/Content/ContentGoals.php`, `app/Http/Controllers/Api/V1/Admin/Content/GoalsController.php`, `tests/Feature/Content/GoalsTest.php`
- Modify: `routes/api.php`

**Interfaces:**
- Produces: `GET goals` (everyone) → `{week: {from, to} | null, platforms: [{platform, target, published, planned}], streak: {weeks, current_met, at_risk, short_by}}`; `ContentGoals::for(ContentPlannerProfile $profile, int $orgId): array`.

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/Content/GoalsTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/**
 * Posting goals and streaks (spec 2026-10-15 §7). The clock stands at Monday 5 October 2026, 06:00 UTC; the channels'
 * targets are Instagram 2 and LinkedIn 1 a week, set since August.
 */
class GoalsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'instagram')->update(['posts_per_week' => 2, 'created_at' => '2026-08-03 09:00:00']);
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'linkedin')->update(['posts_per_week' => 1, 'created_at' => '2026-08-03 09:00:00']);
    }

    private function published(string $platform, string $at): void
    {
        $this->makePost(['platform' => $platform, 'status' => 'published', 'published_at' => $at, 'scheduled_date' => substr($at, 0, 10)]);
    }

    private function meetWeek(string $monday): void
    {
        $this->published('instagram', "{$monday} 09:00:00");
        $this->published('instagram', "{$monday} 12:00:00");
        $this->published('linkedin', "{$monday} 10:00:00");
    }

    public function test_this_weeks_progress_per_platform(): void
    {
        $this->published('instagram', '2026-10-05 05:00:00');
        $this->makePost(['platform' => 'instagram', 'status' => 'draft', 'scheduled_date' => '2026-10-07']);
        $this->makePost(['platform' => 'instagram', 'status' => 'archived', 'scheduled_date' => '2026-10-08']);
        $this->makePost(['platform' => 'instagram', 'status' => 'skipped', 'scheduled_date' => '2026-10-09']);

        $this->asStaffMember()->getJson($this->api('goals'))->assertOk()
            ->assertJsonPath('week', ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertJsonPath('platforms', [
                ['platform' => 'instagram', 'target' => 2, 'published' => 1, 'planned' => 1],
                ['platform' => 'linkedin', 'target' => 1, 'published' => 0, 'planned' => 0],
            ]);
    }

    public function test_the_streak_counts_weeks_in_a_row_and_the_current_week_once_met(): void
    {
        foreach (['2026-09-14', '2026-09-21', '2026-09-28'] as $monday) {
            $this->meetWeek($monday);
        }
        $this->published('instagram', '2026-09-08 09:00:00'); // a short week before them ends the count

        $this->asStaffMember()->getJson($this->api('goals'))->assertOk()
            ->assertJsonPath('streak', ['weeks' => 3, 'current_met' => false, 'at_risk' => false, 'short_by' => 3]);

        $this->meetWeek('2026-10-05');
        $this->asStaffMember()->getJson($this->api('goals'))->assertJsonPath('streak.weeks', 4)->assertJsonPath('streak.current_met', true)->assertJsonPath('streak.short_by', 0);
    }

    public function test_weeks_before_the_first_target_was_set_do_not_count(): void
    {
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->update(['created_at' => '2026-09-23 09:00:00']);
        // 14 September had as many posts as today's targets ask, but no target existed yet.
        foreach (['2026-09-14', '2026-09-21', '2026-09-28'] as $monday) {
            $this->meetWeek($monday);
        }

        $this->asStaffMember()->getJson($this->api('goals'))->assertJsonPath('streak.weeks', 2);
    }

    public function test_from_friday_a_running_streak_short_this_week_is_at_risk(): void
    {
        $this->meetWeek('2026-09-28');
        $this->travelTo(CarbonImmutable::parse('2026-10-08 18:00:00')); // Thursday
        $this->asStaffMember()->getJson($this->api('goals'))->assertJsonPath('streak.at_risk', false);

        $this->travelTo(CarbonImmutable::parse('2026-10-09 00:30:00')); // Friday
        $this->asStaffMember()->getJson($this->api('goals'))
            ->assertJsonPath('streak', ['weeks' => 1, 'current_met' => false, 'at_risk' => true, 'short_by' => 3]);
    }

    public function test_the_week_is_the_venues(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-11 20:45:00')); // Sunday 23:45 in Riga
        $this->published('instagram', '2026-10-11 20:30:00'); // Sunday 23:30 in Riga: this week
        $this->published('instagram', '2026-10-04 21:30:00'); // Monday 00:30 in Riga: this week (still Sunday in UTC)
        $this->published('instagram', '2026-10-04 20:30:00'); // Sunday 23:30 in Riga: last week

        $this->asStaffMember()->getJson($this->api('goals'))
            ->assertJsonPath('week', ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertJsonPath('platforms.0.published', 2);
    }

    public function test_only_this_brands_posts_count_and_a_brand_without_targets_has_none(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        ContentPlannerPost::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'platform' => 'instagram', 'status' => 'published', 'published_at' => '2026-10-05 05:00:00', 'scheduled_date' => '2026-10-05']);

        $this->asStaffMember()->getJson($this->api('goals'))->assertJsonPath('platforms.0.published', 0);
        $this->asManager()->getJson($this->api("goals?brand_id={$second}"))->assertOk()
            ->assertJsonPath('platforms', [])->assertJsonPath('streak', ['weeks' => 0, 'current_met' => false, 'at_risk' => false, 'short_by' => 0]);
    }
}
```

(The organisation's zone column is `organizations.timezone`, as `PlanTest` lines 40–42 set it.)

- [ ] **Step 2: Run them to see them fail**

Run: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/GoalsTest.php --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"`
Expected: FAIL — no `goals` route.

- [ ] **Step 3: The goals**

Create `app/Services/Content/ContentGoals.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * Posting goals and streaks (spec 2026-10-15 §7), on the venue's clock. Each active channel's posts_per_week is its
 * weekly target, summed per platform (posts carry a platform, not a channel). Progress counts posts marked published
 * in the venue's week (Monday–Sunday) and the ones planned (dated in the week; not published, archived or skipped —
 * the Plan's own figures leave skipped posts out too). The streak counts the weeks in a row in which every target was
 * met — completed weeks back to the week the oldest channel with a target was added (target history is not kept), plus
 * the current week once met.
 */
final class ContentGoals
{
    public const LOOK_BACK_WEEKS = 52;

    /**
     * @return array{week: array{from: string, to: string}, platforms: list<array{platform: string, target: int, published: int, planned: int}>, streak: array{weeks: int, current_met: bool, at_risk: bool, short_by: int}}
     */
    public static function for(ContentPlannerProfile $profile, int $orgId): array
    {
        $now = VenueClock::now($orgId); // the venue's digits, labelled UTC
        $zone = VenueClock::zone($orgId);
        $monday = $now->startOfWeek(CarbonImmutable::MONDAY)->startOfDay();
        $week = ['from' => $monday->toDateString(), 'to' => $monday->addDays(6)->toDateString()];
        $none = ['week' => $week, 'platforms' => [], 'streak' => ['weeks' => 0, 'current_met' => false, 'at_risk' => false, 'short_by' => 0]];

        $channels = ContentPlannerChannel::where('planner_profile_id', $profile->id)->where('active', true)
            ->where('posts_per_week', '>', 0)->orderBy('id')->get(['platform', 'posts_per_week', 'created_at']);
        $targets = [];
        foreach ($channels as $channel) {
            $targets[(string) $channel->platform] = ($targets[(string) $channel->platform] ?? 0) + (int) $channel->posts_per_week;
        }
        if ($targets === []) {
            return $none;
        }

        // Published posts of the look-back, by the venue's week of their published_at.
        $since = CarbonImmutable::parse($monday->subWeeks(self::LOOK_BACK_WEEKS)->format('Y-m-d H:i:s'), $zone)->utc();
        $published = [];
        $posts = ContentPlannerPost::where('planner_profile_id', $profile->id)->where('status', 'published')
            ->whereIn('platform', array_keys($targets))->where('published_at', '>=', $since)->get(['platform', 'published_at']);
        foreach ($posts as $post) {
            $weekOf = CarbonImmutable::parse($post->published_at)->setTimezone($zone)->startOfWeek(CarbonImmutable::MONDAY)->toDateString();
            $published[$weekOf][(string) $post->platform] = ($published[$weekOf][(string) $post->platform] ?? 0) + 1;
        }
        $planned = ContentPlannerPost::where('planner_profile_id', $profile->id)
            ->whereNotIn('status', ['published', 'archived', 'skipped'])->whereIn('platform', array_keys($targets))
            ->whereDate('scheduled_date', '>=', $week['from'])->whereDate('scheduled_date', '<=', $week['to'])
            ->get(['platform'])->countBy('platform')->all();

        $met = fn (string $weekStart): bool => collect($targets)->every(fn (int $target, string $platform) => ($published[$weekStart][$platform] ?? 0) >= $target);
        $currentMet = $met($week['from']);
        $firstTargetWeek = CarbonImmutable::parse($channels->min('created_at'))->setTimezone($zone)->startOfWeek(CarbonImmutable::MONDAY)->toDateString();
        $completed = 0;
        for ($k = 1; $k <= self::LOOK_BACK_WEEKS; $k++) {
            $start = $monday->subWeeks($k)->toDateString();
            if ($start < $firstTargetWeek || !$met($start)) {
                break;
            }
            $completed++;
        }
        $shortBy = (int) collect($targets)->sum(fn (int $target, string $platform) => max(0, $target - ($published[$week['from']][$platform] ?? 0)));

        return [
            'week'      => $week,
            'platforms' => collect($targets)->map(fn (int $target, string $platform) => [
                'platform'  => $platform,
                'target'    => $target,
                'published' => $published[$week['from']][$platform] ?? 0,
                'planned'   => (int) ($planned[$platform] ?? 0),
            ])->values()->all(),
            'streak'    => [
                'weeks'       => $completed + ($currentMet ? 1 : 0),
                'current_met' => $currentMet,
                'at_risk'     => $completed >= 1 && !$currentMet && $now->dayOfWeekIso >= 5,
                'short_by'    => $currentMet ? 0 : $shortBy,
            ],
        ];
    }
}
```

Create `app/Http/Controllers/Api/V1/Admin/Content/GoalsController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentGoals;
use Illuminate\Http\JsonResponse;

/** Posting goals and the streak for the pinned brand (spec 2026-10-15 §7): everyone reads them. */
class GoalsController extends Controller
{
    public function show(): JsonResponse
    {
        $profile = ContentContext::profile();
        if (!$profile) {
            return response()->json(['week' => null, 'platforms' => [], 'streak' => ['weeks' => 0, 'current_met' => false, 'at_risk' => false, 'short_by' => 0]]);
        }

        return response()->json(ContentGoals::for($profile, ContentContext::orgId()));
    }
}
```

`routes/api.php`, after `plan` (line 1280): `Route::get('goals', [\App\Http\Controllers\Api\V1\Admin\Content\GoalsController::class, 'show']);`

- [ ] **Step 4: Run the Content folders**

```bash
for p in tests/Feature/Content/ tests/Unit/Content/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app routes tests && git commit -q -F - <<'EOF'
Content server: posting goals and streaks on the venue's clock

Each active channel's posts per week is its target (summed per platform);
progress counts posts marked published in the venue's week and the ones
planned; the streak counts weeks in a row with every target met, back to
the first target; from Friday a short week of a running streak is at risk.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 14: Repeat posts (spec §8)

**Files:**
- Create: `database/migrations/2026_10_15_100200_add_series_id_to_content_planner_posts.php`, `app/Services/Content/ContentRepeat.php`, `app/Http/Controllers/Api/V1/Admin/Content/RepeatController.php`, `tests/Feature/Content/RepeatTest.php`, `tests/Unit/Content/ContentRepeatTest.php`
- Modify: `tests/Concerns/SetsUpContentSchema.php`, `app/Models/ContentPlannerPost.php` (`$fillable`), `app/Services/Content/ContentPostPresenter.php` (`detail`), `app/Http/Controllers/Api/V1/Admin/Content/PostController.php` (`duplicate`), `routes/api.php`

**Interfaces:**
- Produces: `content_planner_posts.series_id` (the original's id); `POST posts/{id}/repeat` `{every: week|2weeks|month, until: Y-m-d, ai_rewrite?: bool}` → 201 `{post, copies}`; `DELETE posts/{id}/repeat` → `{removed, post}`; refusals `already_repeating` (409), `no_day` (422), validation 422 on `until` / `every` / `ai_rewrite`; the post detail's `series_id` and `series: {id, every, until, more, rewriting} | null`; `ContentRepeat::dates()`, `copy()`, `stop()`, `describe()`, `rewritingKey()`, constants `EVERY`, `MAX_COPIES = 26`, `MAX_MONTHS = 12`, `MAX_AI_COPIES = 12`.

- [ ] **Step 1: Write the failing tests**

Create `tests/Unit/Content/ContentRepeatTest.php`:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentRepeat;
use PHPUnit\Framework\TestCase;

/** The days a repeated post's copies land on (spec 2026-10-15 §8). */
class ContentRepeatTest extends TestCase
{
    public function test_weekly_and_fortnightly_copies_keep_the_weekday_and_include_the_last_day(): void
    {
        $this->assertSame(['2026-10-14', '2026-10-21', '2026-10-28'], ContentRepeat::dates('2026-10-07', 'week', '2026-10-28', '2026-10-05'));
        $this->assertSame(['2026-10-21', '2026-11-04'], ContentRepeat::dates('2026-10-07', '2weeks', '2026-11-10', '2026-10-05'));
    }

    public function test_monthly_copies_take_the_months_last_day_when_it_is_shorter(): void
    {
        $this->assertSame(['2028-02-29', '2028-03-31'], ContentRepeat::dates('2028-01-31', 'month', '2028-03-31', '2028-01-01'));
        $this->assertSame(['2026-11-15', '2026-12-15'], ContentRepeat::dates('2026-10-15', 'month', '2026-12-31', '2026-10-05'));
    }

    public function test_days_already_gone_are_left_out(): void
    {
        $this->assertSame(['2026-10-07'], ContentRepeat::dates('2026-09-23', 'week', '2026-10-07', '2026-10-05'));
    }
}
```

Create `tests/Feature/Content/RepeatTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Repeat posts (spec 2026-10-15 §8). Today is Monday 5 October 2026. */
class RepeatTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** @return list<ContentPlannerPost> the copies of a series, by day */
    private function copiesOf(ContentPlannerPost $post): array
    {
        return ContentPlannerPost::where('series_id', $post->id)->where('id', '!=', $post->id)->orderBy('scheduled_date')->get()->all();
    }

    private function days(array $posts): array
    {
        return array_map(fn (ContentPlannerPost $p) => $p->scheduled_date->format('Y-m-d'), $posts);
    }

    public function test_a_weekly_repeat_makes_copies_on_the_same_weekday_with_the_posts_words(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'scheduled_time' => '09:30', 'hook' => 'Autumn tips', 'main_copy' => 'Warm tones.', 'hashtags' => ['#autumn'], 'status' => 'ready_to_publish']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])
            ->assertCreated()->assertJsonCount(3, 'copies')->assertJsonPath('post.series_id', $post->id);

        $copies = $this->copiesOf($post);
        $this->assertSame(['2026-10-14', '2026-10-21', '2026-10-28'], $this->days($copies));
        $this->assertSame('Autumn tips', $copies[2]->hook);
        $this->assertSame('Warm tones.', $copies[0]->main_copy);
        $this->assertSame(['#autumn'], $copies[0]->hashtags);
        $this->assertSame('ready_to_publish', $copies[0]->status);
        $this->assertSame('09:30', substr((string) $copies[0]->scheduled_time, 0, 5));
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))
            ->assertJsonPath('post.series', ['id' => $post->id, 'every' => 'week', 'until' => '2026-10-28', 'more' => 3, 'rewriting' => false]);
    }

    public function test_a_published_post_repeats_as_drafts_and_only_from_today_on(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-09-30', 'status' => 'published', 'published_at' => '2026-09-30 09:00:00']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])->assertCreated()->assertJsonCount(3, 'copies');

        $copies = $this->copiesOf($post);
        $this->assertSame(['2026-10-07', '2026-10-14', '2026-10-21'], $this->days($copies));
        $this->assertSame(['draft'], array_values(array_unique(array_map(fn ($c) => $c->status, $copies))));
    }

    public function test_a_monthly_repeat_keeps_the_day_or_takes_the_months_last(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-01-20 09:00:00'));
        $post = $this->makePost(['scheduled_date' => '2026-01-31']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'month', 'until' => '2026-05-31'])->assertCreated();

        $this->assertSame(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'], $this->days($this->copiesOf($post)));
    }

    public function test_refusals_a_series_a_post_without_a_day_and_the_caps(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-14'])->assertCreated();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])
            ->assertStatus(409)->assertJsonPath('error', 'already_repeating');

        $noDay = $this->makePost(['scheduled_date' => null]);
        $this->asStaffMember()->postJson($this->api("posts/{$noDay->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])
            ->assertStatus(422)->assertJsonPath('error', 'no_day');

        $other = $this->makePost(['scheduled_date' => '2026-10-08']);
        $refused = fn (array $body, string $field) => $this->asStaffMember()->postJson($this->api("posts/{$other->id}/repeat"), $body)->assertStatus(422)->assertJsonValidationErrors($field);
        $refused(['every' => 'week', 'until' => '2027-10-09'], 'until');                      // more than 12 months
        $refused(['every' => 'week', 'until' => '2027-04-15'], 'until');                      // 27 copies
        $refused(['every' => 'week', 'until' => '2027-01-14', 'ai_rewrite' => true], 'ai_rewrite'); // 14 copies for the AI
        $refused(['every' => 'daily', 'until' => '2026-10-15'], 'every');
        $refused(['every' => 'week', 'until' => '2026-10-10'], 'until');                      // no day before then
        $this->assertNull($other->fresh()->series_id);
    }

    public function test_stop_repeating_removes_future_unpublished_copies_and_keeps_the_rest(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])->assertCreated();
        $published = $this->copiesOf($post)[0];
        $published->update(['status' => 'published', 'published_at' => now()]);

        $this->asStaffMember()->deleteJson($this->api("posts/{$post->id}/repeat"))->assertOk()
            ->assertJsonPath('removed', 2)->assertJsonPath('post.series', null);

        $this->assertNotNull($post->fresh());
        $this->assertNull($published->fresh()->series_id);
        $this->assertSame(0, ContentPlannerPost::whereDate('scheduled_date', '>=', '2026-10-21')->count());
    }

    public function test_another_organisations_post_does_not_repeat_here_and_a_copy_of_a_series_post_is_not_in_it(): void
    {
        $other = $this->otherOrganization();
        $this->asStaffMember()->postJson($this->api("posts/{$other['post']->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])->assertNotFound();
        $this->asStaffMember()->deleteJson($this->api("posts/{$other['post']->id}/repeat"))->assertNotFound();

        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-14'])->assertCreated();
        $copy = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/duplicate"))->assertSuccessful()->json('post.id');
        $this->assertNull(ContentPlannerPost::find($copy)->series_id);
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `for p in tests/Unit/Content/ContentRepeatTest.php tests/Feature/Content/RepeatTest.php; do XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done`
Expected: FAIL — `ContentRepeat`, the routes and the column do not exist.

- [ ] **Step 3: The column**

Create `database/migrations/2026_10_15_100200_add_series_id_to_content_planner_posts.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A repeated post and its copies share the original's id here (spec 2026-10-15 §8). */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('content_planner_posts', 'series_id')) {
            Schema::table('content_planner_posts', function (Blueprint $table) {
                $table->unsignedBigInteger('series_id')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('content_planner_posts', 'series_id')) {
            Schema::table('content_planner_posts', function (Blueprint $table) {
                $table->dropIndex(['series_id']);
                $table->dropColumn('series_id');
            });
        }
    }
};
```

`tests/Concerns/SetsUpContentSchema.php`, after Task 11's guard:

```php
        if (!Schema::hasColumn('content_planner_posts', 'series_id')) {
            (require database_path('migrations/2026_10_15_100200_add_series_id_to_content_planner_posts.php'))->up();
        }
```

`ContentPlannerPost::$fillable` gains `'series_id'`.

- [ ] **Step 4: The repeat**

Create `app/Services/Content/ContentRepeat.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Repeat posts (spec 2026-10-15 §8): copies of a post on the matching future dates, linked by `series_id` (the
 * original's id). Each copy is an ordinary post afterwards: editing one changes only it.
 */
final class ContentRepeat
{
    public const EVERY = ['week', '2weeks', 'month'];
    public const MAX_COPIES = 26;
    public const MAX_MONTHS = 12;
    public const MAX_AI_COPIES = 12;

    /** What a copy takes from its original. */
    public const COPIED = [
        'platform', 'scheduled_time', 'main_copy', 'short_copy', 'hashtags', 'cta', 'pillar_id', 'audience_id', 'campaign_id',
        'strategy_id', 'language', 'topic', 'title', 'hook', 'goal', 'format', 'weekday_role', 'funnel_stage', 'post_type', 'strategic_reason',
    ];

    /**
     * The copies' days after `$from`, up to `$until` included, from `$today` on: the same weekday every week or every
     * two weeks, or the same day of the month (the month's last day when it is shorter).
     *
     * @return list<string>
     */
    public static function dates(string $from, string $every, string $until, string $today): array
    {
        $start = CarbonImmutable::parse($from);
        $dates = [];
        for ($k = 1; $k <= 400; $k++) {
            if ($every === 'month') {
                $month = $start->startOfMonth()->addMonthsNoOverflow($k);
                $date = $month->setDate($month->year, $month->month, min($start->day, $month->daysInMonth));
            } else {
                $date = $start->addWeeks($every === '2weeks' ? 2 * $k : $k);
            }
            $day = $date->toDateString();
            if ($day > $until) {
                break;
            }
            if ($day >= $today) {
                $dates[] = $day;
            }
        }

        return $dates;
    }

    /**
     * The copies, made in one transaction; the original joins its own series. A published or archived original gives
     * draft copies; any other keeps its status.
     *
     * @param list<string> $dates
     * @return Collection<int, ContentPlannerPost>
     */
    public static function copy(ContentPlannerPost $original, array $dates, ?int $userId): Collection
    {
        $status = in_array($original->status, ['published', 'archived'], true) ? 'draft' : (string) $original->status;

        return DB::transaction(function () use ($original, $dates, $status, $userId) {
            $original->forceFill(['series_id' => $original->id])->save();

            return collect($dates)->map(fn (string $date) => ContentPlannerPost::create($original->only(self::COPIED) + [
                'planner_profile_id' => $original->planner_profile_id,
                'brand_id'           => $original->brand_id,
                'scheduled_date'     => $date,
                'status'             => $status,
                'series_id'          => $original->id,
                'generated_by'       => 'repeat',
                'created_by'         => $userId,
            ]));
        });
    }

    /** Stop a series: its future unpublished copies go; what stays (the original, published copies) is no longer a series. */
    public static function stop(int $seriesId, string $today): int
    {
        return DB::transaction(function () use ($seriesId, $today) {
            $removed = ContentPlannerPost::where('series_id', $seriesId)->where('id', '!=', $seriesId)
                ->where('status', '!=', 'published')->whereDate('scheduled_date', '>=', $today)->delete();
            ContentPlannerPost::where('series_id', $seriesId)->update(['series_id' => null]);

            return $removed;
        });
    }

    /**
     * What the panel says about a post's series: how often (from the smallest gap between its days, so a copy removed
     * by hand or an original long before today does not change the answer), until when, how many unpublished copies
     * come after this post, and whether the AI is still rewording it.
     *
     * @return array{id: int, every: string, until: ?string, more: int, rewriting: bool}|null
     */
    public static function describe(ContentPlannerPost $post): ?array
    {
        if (!$post->series_id) {
            return null;
        }
        $days = ContentPlannerPost::where('series_id', $post->series_id)->whereNotNull('scheduled_date')
            ->orderBy('scheduled_date')->pluck('scheduled_date')
            ->map(fn ($day) => CarbonImmutable::parse($day)->toDateString())->unique()->values();
        $gaps = [];
        for ($i = 1; $i < $days->count(); $i++) {
            $gaps[] = (int) round(CarbonImmutable::parse($days[$i - 1])->diffInDays(CarbonImmutable::parse($days[$i])));
        }
        $gap = $gaps === [] ? 7 : min($gaps);
        $mine = $post->scheduled_date?->format('Y-m-d');

        return [
            'id'        => (int) $post->series_id,
            'every'     => $gap <= 7 ? 'week' : ($gap <= 14 ? '2weeks' : 'month'),
            'until'     => $days->last(),
            'more'      => ContentPlannerPost::where('series_id', $post->series_id)->where('status', '!=', 'published')
                ->when($mine, fn ($q) => $q->whereDate('scheduled_date', '>', $mine))->count(),
            'rewriting' => Cache::has(self::rewritingKey((int) $post->series_id)),
        ];
    }

    /** Set while the AI rewords a series (Task 15). */
    public static function rewritingKey(int $seriesId): string
    {
        return "content:repeat-rewrite:{$seriesId}";
    }
}
```

Create `app/Http/Controllers/Api/V1/Admin/Content/RepeatController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRepeat;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Repeat posts (spec 2026-10-15 §8): everyone may repeat a post (everyone writes posts) and stop a series. */
class RepeatController extends Controller
{
    public function store(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'every'      => ['required', Rule::in(ContentRepeat::EVERY)],
            'until'      => 'required|date_format:Y-m-d',
            'ai_rewrite' => 'sometimes|boolean',
        ]);
        $post = PostController::find($id);
        if ($post->series_id !== null) {
            throw new ContentRefused('already_repeating', 'This post already repeats.', 409);
        }
        if ($post->scheduled_date === null) {
            throw new ContentRefused('no_day', 'A post repeats from its day: give it one first.', 422);
        }
        $from = $post->scheduled_date->format('Y-m-d');
        if ($data['until'] > CarbonImmutable::parse($from)->addMonthsNoOverflow(ContentRepeat::MAX_MONTHS)->toDateString()) {
            throw ValidationException::withMessages(['until' => 'A post repeats for at most ' . ContentRepeat::MAX_MONTHS . ' months.']);
        }
        $dates = ContentRepeat::dates($from, $data['every'], $data['until'], VenueClock::today(ContentContext::orgId()));
        if ($dates === []) {
            throw ValidationException::withMessages(['until' => 'There is no day to repeat on before that date.']);
        }
        if (count($dates) > ContentRepeat::MAX_COPIES) {
            throw ValidationException::withMessages(['until' => 'A post repeats at most ' . ContentRepeat::MAX_COPIES . ' times.']);
        }
        if ($request->boolean('ai_rewrite') && count($dates) > ContentRepeat::MAX_AI_COPIES) {
            throw ValidationException::withMessages(['ai_rewrite' => 'The AI rewrites at most ' . ContentRepeat::MAX_AI_COPIES . ' copies.']);
        }

        $copies = ContentRepeat::copy($post, $dates, $request->user()->id);

        return response()->json([
            'post'   => ContentPostPresenter::detail($post->fresh(PostController::WITH)),
            'copies' => $copies->map(fn ($copy) => ContentPostPresenter::card($copy))->values(),
        ], 201);
    }

    public function destroy(int $id): JsonResponse
    {
        $post = PostController::find($id);
        $removed = $post->series_id ? ContentRepeat::stop((int) $post->series_id, VenueClock::today(ContentContext::orgId())) : 0;
        $kept = $post->fresh(PostController::WITH);

        return response()->json(['removed' => $removed, 'post' => $kept ? ContentPostPresenter::detail($kept) : null]);
    }
}
```

`ContentPostPresenter::detail()` gains (`use App\Services\Content\ContentRepeat;` is not needed — same namespace):

```php
            'series_id' => $post->series_id ? (int) $post->series_id : null,
            'series'    => ContentRepeat::describe($post),
```

`PostController::duplicate`: the replicate list becomes `replicate(['published_url', 'published_at', 'status', 'series_id'])` (a copy made by hand is not in the series).

`routes/api.php`, after `posts/{id}/duplicate` (line 1288):

```php
            Route::post('posts/{id}/repeat', [\App\Http\Controllers\Api\V1\Admin\Content\RepeatController::class, 'store'])->whereNumber('id');
            Route::delete('posts/{id}/repeat', [\App\Http\Controllers\Api\V1\Admin\Content\RepeatController::class, 'destroy'])->whereNumber('id');
```

- [ ] **Step 5: Run the Content folders**

```bash
for p in tests/Feature/Content/ tests/Unit/Content/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app database routes tests && git commit -q -F - <<'EOF'
Content server: repeat posts — copies on the matching future days, a series to stop

Weekly, fortnightly or monthly copies (the month's last day when it is
shorter) up to 26 and 12 months ahead, from today on; a published original
gives drafts; Stop repeating removes the future unpublished copies; a
post's detail says how its series runs. Additive migration (series_id).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 15: The AI rewords a series (spec §8)

**Files:**
- Create: `app/Services/Content/ContentRepeatRewriter.php`, `app/Jobs/RewriteRepeatCopies.php`
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/RepeatController.php` (`store`)
- Test: `tests/Feature/Content/RepeatTest.php`, `tests/Feature/Content/AiLedgerTest.php`

**Interfaces:**
- Consumes: `ContentRepeat::MAX_AI_COPIES`, `ContentRepeat::rewritingKey()` (Task 14).
- Produces: `ContentRepeatRewriter::rewrite(ContentPlannerPost $copy): array{hook: ?string, main_copy: ?string}`; `RewriteRepeatCopies(int $seriesId, int $organizationId, int $brandId, array $copyIds)`; the series' `rewriting` is true from the request until the job ends.

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Content/RepeatTest.php` (add `use App\Jobs\RewriteRepeatCopies;`, `use App\Services\Content\ContentAiGate;`, `use App\Services\Content\ContentRepeat;`, `use App\Services\Content\ContentRepeatRewriter;`, `use Illuminate\Support\Facades\Cache;`, `use Mockery;`):

```php
    public function test_the_ai_rewords_each_copy_and_leaves_the_original(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'hook' => 'Autumn tips', 'main_copy' => 'Warm tones.']);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $n = 0;
        $rewriter->shouldReceive('rewrite')->times(3)->andReturnUsing(function () use (&$n) {
            $n++;

            return ['hook' => "Fresh hook {$n}", 'main_copy' => "Fresh text {$n}"];
        });
        $this->app->instance(ContentRepeatRewriter::class, $rewriter);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28', 'ai_rewrite' => true])->assertCreated();

        $this->assertSame(['Fresh hook 1', 'Fresh hook 2', 'Fresh hook 3'], array_map(fn ($c) => $c->hook, $this->copiesOf($post)));
        $this->assertSame('Autumn tips', $post->fresh()->hook);
        $this->assertFalse(Cache::has(ContentRepeat::rewritingKey($post->id)), 'the job ends the rewording');
    }

    public function test_rewording_is_refused_at_the_budget_cap_before_anything_is_made(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->setAiCap(100, 120);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldNotReceive('rewrite');
        $this->app->instance(ContentRepeatRewriter::class, $rewriter);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28', 'ai_rewrite' => true])
            ->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->assertSame([], $this->copiesOf($post));
    }

    public function test_rewording_stops_when_the_budget_runs_out_midway_and_keeps_what_is_done(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'hook' => 'Autumn tips']);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldReceive('rewrite')->once()->andReturnUsing(function () {
            $this->setAiCap(100, 120); // this call used the rest of the month's budget

            return ['hook' => 'Fresh hook', 'main_copy' => 'Fresh text'];
        });
        $this->app->instance(ContentRepeatRewriter::class, $rewriter);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28', 'ai_rewrite' => true])->assertCreated();

        $this->assertSame(['Fresh hook', 'Autumn tips', 'Autumn tips'], array_map(fn ($c) => $c->hook, $this->copiesOf($post)));
    }

    public function test_a_copy_a_person_changed_keeps_the_persons_words(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'hook' => 'Autumn tips']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])->assertCreated();
        [$first, $second] = $this->copiesOf($post);
        $this->travel(5)->minutes();
        $second->update(['hook' => 'My own words']);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldReceive('rewrite')->once()->andReturn(['hook' => 'Fresh hook', 'main_copy' => 'Fresh text']);

        (new RewriteRepeatCopies((int) $post->id, (int) $this->org->id, $this->brandId, [(int) $first->id, (int) $second->id]))->handle($rewriter, app(ContentAiGate::class));

        $this->assertSame('Fresh hook', $first->fresh()->hook);
        $this->assertSame('My own words', $second->fresh()->hook);
    }
```

`tests/Feature/Content/AiLedgerTest.php` (the rewriter is mocked above, so its wiring to the counted client is read from the source):

```php
    public function test_repeat_rewording_goes_through_the_counted_ai_client(): void
    {
        $source = file_get_contents(app_path('Services/Content/ContentRepeatRewriter.php'));
        $this->assertStringContainsString('protected AiClient $ai', $source);
        $this->assertStringContainsString("->generateJson(\$profile, 'repeat_rewrite'", $source);
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `for p in tests/Feature/Content/RepeatTest.php tests/Feature/Content/AiLedgerTest.php; do XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done`
Expected: the five new tests fail (no rewriter, no job, no budget check).

- [ ] **Step 3: The rewriter, the job and the request**

Create `app/Services/Content/ContentRepeatRewriter.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\AiClient;

/**
 * Rewords one copy of a repeated post (spec 2026-10-15 §8): the same meaning, language and length in fresh words.
 * Not final, so tests mock it.
 */
class ContentRepeatRewriter
{
    public function __construct(protected AiClient $ai)
    {
    }

    /** @return array{hook: ?string, main_copy: ?string} */
    public function rewrite(ContentPlannerPost $copy): array
    {
        $profile = ContentPlannerProfile::findOrFail($copy->planner_profile_id);
        $data = $this->ai->generateJson($profile, 'repeat_rewrite', $this->prompt($copy), 2000);

        return [
            'hook'      => isset($data['hook']) ? mb_substr(trim((string) $data['hook']), 0, 500) : $copy->hook,
            'main_copy' => isset($data['main_copy']) ? mb_substr(trim((string) $data['main_copy']), 0, 20000) : $copy->main_copy,
        ];
    }

    private function prompt(ContentPlannerPost $copy): string
    {
        return "Rewrite this {$copy->platform} post so it says the same thing in fresh words. Keep its language ({$copy->language}), "
            . "its length, every offer, price, date and link exactly, and the intent of its call to action.\n"
            . 'Hook: ' . ($copy->hook ?? '') . "\nText:\n" . ($copy->main_copy ?? '') . "\n"
            . 'Return ONLY JSON: {"hook": "...", "main_copy": "..."}';
    }
}
```

Create `app/Jobs/RewriteRepeatCopies.php`:

```php
<?php

namespace App\Jobs;

use App\Models\ContentPlannerPost;
use App\Models\Organization;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRepeat;
use App\Services\Content\ContentRepeatRewriter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;

/**
 * Rewords a repeated post's copies one by one (spec 2026-10-15 §8). The budget is checked before each call and the
 * job stops at the cap, keeping what is done; a copy a person changed since it was made keeps the person's words; a
 * provider failure stops the job (the next copy would fail the same way).
 */
class RewriteRepeatCopies implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 900;

    /** @param list<int> $copyIds */
    public function __construct(public int $seriesId, public int $organizationId, public int $brandId, public array $copyIds)
    {
    }

    public function handle(ContentRepeatRewriter $rewriter, ContentAiGate $gate): void
    {
        // A queue worker has no request: bind the tenant for the run, then leave the bindings as found.
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', $this->organizationId);
        app()->instance('current_brand_id', $this->brandId);
        try {
            foreach (array_slice($this->copyIds, 0, ContentRepeat::MAX_AI_COPIES) as $id) {
                $copy = ContentPlannerPost::find($id);
                if (!$copy || $copy->updated_at->gt($copy->created_at)) {
                    continue; // deleted, or changed by a person since it was made
                }
                // Read the organisation afresh each time: its cap is on the row, and the budget moves with every call.
                $org = Organization::find($this->organizationId);
                if (!$org) {
                    break;
                }
                try {
                    $gate->allow($org);
                } catch (ContentRefused) {
                    break; // the month's AI budget is used up: keep what is done
                }
                try {
                    $copy->update($rewriter->rewrite($copy));
                } catch (\Throwable $e) {
                    report($e);
                    break;
                }
            }
        } finally {
            Cache::forget(ContentRepeat::rewritingKey($this->seriesId));
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
    }

    public function failed(\Throwable $e): void
    {
        Cache::forget(ContentRepeat::rewritingKey($this->seriesId));
    }
}
```

`RepeatController::store` (add `use App\Jobs\RewriteRepeatCopies;`, `use App\Services\Content\ContentAiGate;`, `use Illuminate\Support\Facades\Cache;`; the signature becomes `store(Request $request, int $id, ContentAiGate $gate)`):
1. After the `ai_rewrite` cap check, before the copies are made: `if ($request->boolean('ai_rewrite')) { $gate->allow($request->attributes->get('workspace_org')); }`.
2. After `$copies = ContentRepeat::copy(…)`:

```php
        if ($request->boolean('ai_rewrite')) {
            // The panel shows "rewording…" until the job forgets this (or 15 minutes pass).
            Cache::put(ContentRepeat::rewritingKey((int) $post->id), true, now()->addMinutes(15));
            RewriteRepeatCopies::dispatch((int) $post->id, ContentContext::orgId(), ContentContext::brandId(), $copies->pluck('id')->map(fn ($copyId) => (int) $copyId)->all());
        }
```

- [ ] **Step 4: Run the Content folders**

```bash
for p in tests/Feature/Content/ tests/Unit/Content/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"; done
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app tests && git commit -q -F - <<'EOF'
Content server: the AI rewords a repeated post's copies in the background, within the budget, never over a person's edit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 16: The runbook

**Files:**
- Modify: `docs/content-workspace.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Add release 3's server to the runbook**

In `docs/content-workspace.md`:
1. The table under "## The API" gains rows:

```markdown
| Goals | `GET goals` (this week per platform, the streak) | everyone |
| Repeat | `POST posts/{id}/repeat`, `DELETE posts/{id}/repeat` | everyone |
| Snippets | `brand/snippets` `POST`, `PUT/DELETE brand/snippets/{id}`, `POST brand/snippets/suggest` (AI) | managers (everyone reads them in `GET brand`) |
```

2. The refusal codes list gains `already_repeating`, `no_day`, `too_many_snippets`.
3. Under "## Rules the code keeps", add:

```markdown
- **A time needs a day.** A post with no day stores no time, however it was saved (`PostsTest`).
- **Search words are literal.** `%`, `_` and `\` in Find and Posts search match themselves (`PostsTest`).
- **A channel's usual time** (`post_time`, `HH:MM`) is what Generate and Fill give a post the AI left without a time;
  empty means the first suggested time for its platform and the organisation's industry (`BestTimes`, the same table
  as `frontend/src/content/lib/bestTimes.json`; `BestTimesTest`).
- **Snippets:** at most 50 hashtag groups and 50 text snippets per brand; suggestions are one AI call and save nothing
  (`SnippetsTest`).
- **Goals** count only posts marked published, in the venue's week (Monday–Sunday); targets are the channels'
  `posts_per_week` as they are now, summed per platform; "planned" leaves published, archived and skipped posts out;
  the streak looks back 52 weeks, no further than the week the oldest channel with a target was added (target history
  is not kept); "at risk" from Friday 00:00 on the venue's clock (`GoalsTest`).
- **Repeat posts:** up to 26 copies within 12 months of the post's day, from today on; the AI rewords at most 12, one
  call each, stops at the budget cap and never rewrites a copy a person changed; Stop repeating removes the future
  unpublished copies (`RepeatTest`). The rewording runs on the queue (`RewriteRepeatCopies`).
- **The strategy job** counts its AI use for its brand and stores a fixed sentence when it fails (`StrategyTest`).
```

4. Under "## Deploying", the first bullet ("No migration: every profile, strategy, post and image carries over as it is.") becomes: "Release 3 brings three additive migrations (`content_planner_channels.post_time`, `content_planner_snippets`, `content_planner_posts.series_id`); nothing existing changes, and every profile, strategy, post and image carries over as it is."
5. The Brand row of the API table keeps its words; the Snippets row above is the only new brand endpoint row.

- [ ] **Step 2: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs && git commit -q -F - <<'EOF'
Runbook: release 3's server — goals, repeat posts, snippets, a channel's usual time, the rules they keep

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

After Task 16: the final whole-branch review of this plan's range (executing-plans' Final Review), its fix pass, and the ledger archived. Plan B builds the portal for §4–§8, runs the release checks and deploys.
