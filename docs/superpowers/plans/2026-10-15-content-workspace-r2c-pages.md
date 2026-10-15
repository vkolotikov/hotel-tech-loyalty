# HexaTech Content — Release 2, Plan C: Posts, Strategy and Brand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give HexaTech Content its three remaining pages:
- **Posts** (`/content/posts`): every post of the brand, searched and filtered, 50 a page.
- **Strategy** (`/content/strategy`): the active strategy read as a document, the pillar balance, and for managers: make a new one, see the past ones, make one active, archive one.
- **Brand** (`/content/brand`): readiness and what is missing, the brand profile in sections that managers edit one at a time, audiences and channels edited in place, Refresh knowledge, and the two ways to set up a brand that has no profile (Quick setup, Guided setup).

**Architecture:**
- **Same portal.** The pages live in `frontend/src/content/posts/`, `strategy/`, `brand/`, routed by `ContentApp` and listed in the side panel (and so in Find). They use the brand-aware `contentApi`, the panel and the words exactly as Plan B's Plan does.
- **Server.** Plan A's endpoints already serve every call. Task 1 adds two small server changes, each with a failing test first: readiness gaps get stable codes (so the portal can say them in five languages), and the posts list leaves archived posts out unless asked for.
- **Brand editing.** Each section of the Brand page is its own small form with its own draft, and saves only its own fields (`PUT brand/profile` with those fields, `PUT brand/voice`, audiences and channels by id). Every brand endpoint answers with the whole brand, which replaces the cached copy.
- **Option lists** (tones, roles, mix categories and the rest) move from the old planner's `components/ContentPlanner/lib.ts` into `content/lib/options.ts`, as spec §6.9 says ("types and metadata move to `content/lib`"). Plan D deletes the old copy with the old screens.
- **Testing.** Logic in small pure modules with node tests; components by static-render tests; one real-browser pass at the end, as in Plan B.

**Tech Stack:**
- React 19, TypeScript 5.9, Vite 5, React Router 7 (`BrowserRouter`), TanStack Query 5, react-i18next 17.
- Tailwind 3 with the Atelier `a-*` tokens; lucide-react icons; vitest 2 (node environment, `renderToStaticMarkup`).
- Laravel 13 on PHP 8.4.20 for Task 1.

**Spec:** `docs/superpowers/specs/2026-10-14-content-workspace-design.md`. This plan covers:
- §4.1 (the rail's Posts, Strategy and Brand), §4.3's last clause (an unscheduled post's link opens on Posts), §4.4, §4.5, §4.6;
- §5.1 in these screens (managers' buttons only for managers);
- §7 F1 and F6 in the portal (edits in place, the in-use question; the Guided setup draft per brand);
- §8 for these pages (words, refusals, accessibility);
- the portal half of §9 for these pages.

**Plan D** (next): the way in from the full admin, the retirements (old screens, controllers, routes, `admin/content-planner` key), the deferred minors of Plans A–C, the release checks (Appointments pixel comparison, Lighthouse, `loginPathAfterExpiry` for `/content`) and the deploy after the owner's "yes, deploy".

**What Plans A and B left (on this branch, tip `ed775aa9e`):**
- Every endpoint these pages call: `GET posts` (filters `q`, `status`, `platform`, `pillar_id`, `from`, `to`, `unscheduled`, `page`; 50 a page; `{data, meta: {page, pages, total}}`), `GET strategies`, `GET strategies/{id}` (with `ai_output`, `pillars`, `balance`), `POST strategies` (202, queued job, poll), `POST strategies/{id}/activate|archive`, `GET brand`, `PUT brand/profile`, `PUT brand/voice`, `POST/PUT/DELETE brand/audiences[/{id}]` (`?confirm=1`), `POST/PUT/DELETE brand/channels[/{id}]`, `POST brand/quick-setup`, `POST brand/setup`, `POST brand/refresh-knowledge`. Shapes: `.superpowers/sdd/r2c-facts.md`.
- The portal frame, the Plan, the panel (app-level, rebases server answers under typing), Find, shortcuts, words in five bundles, `lib/errors.ts`, `lib/planCache.ts`.
- Plan B's deferred minors are in `.superpowers/sdd/archive/2026-10-14-content-workspace-r2b-portal/progress.md`; none is in this plan's scope except where a task says so.

## Global Constraints

- **Branch:** worktree `C:\wamp64\www\Hexa-Tech-content`, branch `feature/content-workspace` (tip `ed775aa9e`). Upstream unset: never push. Never commit `frontend/dist`, `public/spa` or `resources/spa-shell`.
- **Ledger and tools:** `.superpowers/sdd/2026-10-15-content-workspace-r2c-pages/`, called `$R2C` below (exactly what `sdd-workspace` prints for this plan file).
- **Frontend commands** (Git Bash):
  - Types: `cd frontend && npx tsc -b`.
  - Tests: `$R2C/vt.sh <paths…>` (vitest, colours stripped, exit code kept; Task 1 copies it from Plan B's archive).
  - Lint: `cd frontend && npx eslint src/content src/workspace src/App.tsx`.
- **PHP commands:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, always scoped by folder, in the foreground: `XDEBUG_MODE=off $PHP artisan test tests/Feature/Content/ --no-ansi`. Never a bare `php artisan test`.
- **Baseline:**
  - The full vitest run has exactly 3 failing tests, all in `src/lib/plannerMeta.test.ts`.
  - The scoped lint has exactly 1 error, `src/App.tsx` `react-hooks/set-state-in-effect` (Plan B's ruling).
  - Anything beyond these is ours to fix.
- **Portal rules** (`src/content/tokens.test.ts`, from Plan B): only `a-*` colour classes and the `c-*` classes `theme/content.css` defines; every API path is `/v1/admin/content/…`; nothing imported from `src/appointments/` or `src/components/`; no text under 12 px; a hover lift only as `[@media(hover:hover)]:hover:-translate-y-px`; accent lines and text use `-a-accent-text`, only fills use `bg-a-accent`.
- **Words:**
  - Every visible word comes through `t('content.…', 'English fallback')`.
  - Every key exists in all five bundles `src/content/i18n/content.{en,ru,de,fr,es}.json`, same key set, no empty value (`contentLocales.test.ts`).
  - A refusal is shown in the portal's own words per code (`lib/errors.ts`), never the server's message. Readiness gaps are shown by their code (Task 1), never the server's English hint.
  - Option values (a tone, a role, a mix category) are stored as they are today; their names come from `content.options.<group>.<slug>`; a stored value the list does not know is shown as itself and kept.
- **React lint (eslint-plugin-react-hooks 7):** no synchronous `setState` inside an effect (adjust while rendering, or set from a callback, timer or promise); no reading `ref.current` while rendering; no component defined inside another; contexts and hooks beside a component carry `// eslint-disable-next-line react-refresh/only-export-components`.
- **Roles:** managers are `boot.staff.can_manage`. A staff member never sees a button the server would refuse (spec §5.1); they read everything.
- **Server:** only Task 1 changes PHP. If a later task finds a server bug, add a failing PHP test and the fix in that task, and write a `Ruling:` line.
- **Escapes:** no `\u` escape sequences through the Write/Edit tools; no shell `printf` with backslashes; write files with the Write/Edit tools; PHP namespace lines with the Edit tool.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Brand data the old wizard wrote in shapes the new editors do not expect:** a list field that holds one string, `positioning` as plain text, `weekly_rhythm` with missing days, a channel's `frequency` as `null`, a tone or role the option list does not know.
   - Expected: the page shows what is there, never crashes, and saves a field back unchanged unless the manager edited it.
   - Pinned by Task 6's `brandForms.test.ts` (`asList`, `asText`, `asPositioning`, `asRhythm`, `asDays`, `asMix`) and Task 7's section tests (an unknown tone shown pressed and kept; positioning as text never rewritten unless edited).
2. **Two sections open at once:** a manager edits Voice, then saves Brand DNA.
   - Expected: each section saves only its own fields; the other section keeps its unsaved draft; the answer (the whole brand) never overwrites a draft that is open.
   - Pinned by Task 6's `changedFields` test and Task 7's "sends only what the manager changed" tests; the drafts live in each `SectionCard` (Task 6).
3. **A strategy generation that never finishes or fails** (job crash, worker down, the server's 15-minute cap).
   - Expected: the page stops polling once the strategy leaves `generating`, or after 15 minutes calls it stuck; it says so in the portal's words, never the job's error text; a new generation is then allowed.
   - Pinned by Task 5's `strategyMath.test.ts` (`generationState`) and Task 4's "This strategy could not be made." for a failed one.
4. **Removing an audience that posts use, or a channel the Plan's slots come from.**
   - Expected: the audience asks first with the number of posts, and only then removes it (those posts keep everything else); removing or switching off a channel makes its empty slots disappear from the Plan on its next read.
   - Pinned by Task 8's `listActions.test.ts` (`removeAudience` asks with the count and confirms only after a yes; `saveChannel`/`removeChannel` read the Plan again).
5. **A Posts link with bad or hostile parameters** (`page=abc`, `status=foo`, `from` after `to`, a pillar id of another brand).
   - Expected: bad values fall back to the defaults, the page never loops on a 422, and an empty answer says "no posts match"; a page past the end says so and offers the first page.
   - Pinned by Task 3's `postsFilters.test.ts` (`readFilters`) and `postsPage.test.tsx`.

---

## File map

**Server (Task 1):**
- Modify `app/Services/ContentKnowledgeService.php` — readiness sections gain `missing` (codes) beside `hints`; the knowledge section gains `faq_count`; `GAPS` lists every code.
- Modify `app/Http/Controllers/Api/V1/Admin/Content/PostController.php` — `index` leaves archived posts out unless `status` asks for them.
- Modify `tests/Feature/Content/BrandTest.php`, `tests/Feature/Content/PostsTest.php`.

**Portal data layer (Task 2):**
- Modify `frontend/src/content/lib/types.ts` (posts page, filters, strategy detail, brand payload in full).
- Modify `frontend/src/content/lib/api.ts` (the calls these pages make; `failureOf` carries the `posts` count an `audience_in_use` refusal sends).
- Modify `frontend/src/content/lib/errors.ts` (families `posts`, `strategy`, `brand`).
- Create `frontend/src/content/lib/options.ts` (+ `options.test.ts`).

**Posts (Task 3):** `ui/PageHeader.tsx`, `lib/useActiveStrategy.ts`, `posts/postsFilters.ts` (+ test), `posts/PostRow.tsx`, `posts/PostsPage.tsx` (+ test); `ContentApp.tsx` and `ContentShell.tsx` (route and rail item), `lib/links.ts` (`postHome`, + test), `panel/PostLink.tsx`, `lib/planCache.ts` (`refreshLists`), `panel/PostPanel.tsx` and `plan/PlanPage.tsx` (refresh both lists).

**Strategy (Tasks 4–5):** `strategy/strategyMath.ts` (+ test), `strategy/StrategyPage.tsx`, `strategy/StrategyDocument.tsx`, `strategy/PillarBalance.tsx`, `strategy/StrategyActions.tsx`, `strategy/StrategyScreen.tsx`, `strategy/strategyPage.test.tsx`.

**Brand (Tasks 6–9):** `brand/brandForms.ts`, `brand/readinessWords.ts`, `brand/mixMath.ts`, `brand/listActions.ts`, `brand/setupDraft.ts` (each + test), `brand/useBrand.ts`, `brand/inputs.tsx`, `brand/SectionCard.tsx`, `brand/Readiness.tsx`, `brand/BrandPage.tsx`, `brand/sections/{BrandDna,Voice,Positioning,Rhythm,Audiences,Channels}.tsx`, `brand/setup/{SetupChoice,QuickSetup,GuidedSetup}.tsx`, `brand/brandTesting.tsx` (test helpers), `brand/*.test.tsx`.

**Words:** every task adds its keys to all five bundles.

**Release checks and runbook (Task 10):** `docs/content-workspace.md`; the ledger's seed, screens and eyes.

## Pre-flight (interfaces between tasks)

| From → to | Produces | Consumes |
|---|---|---|
| T1 → T6 | readiness section `missing: string[]`, `faq_count`; `ContentKnowledgeService::GAPS` | `Readiness` type, `brand.gap.*` words, the PHP cross-check in T6 |
| T2 → T3–T9 | `PostsPage`, `PostFilters`, `StrategyDetail`, `BrandPayload`, `Audience`, `Channel`, `Voice`, `BrandProfile`; `contentApi` calls; `ERRORS.posts/strategy/brand`; `options.ts` | every page |
| T3 → T4–T9 | `PageHeader`; `refreshLists`; the rail's pattern (each page adds its own route and item) | the pages |
| T4 → T5 | `StrategyPage({ actions })`, `StrategyStatus`, `pickStrategy` | `StrategyScreen`, `StrategyActions` |
| T6 → T7–T9 | `useBrand()`, `SectionCard` (`startOpen`, `onSaved`), `TextField`, `SelectField`, `TagInput`, `ChoiceChips`, `Segmented`, `ReadRow`, `ReadTags`, the `as*` readers, `changedFields`, `brandTesting.tsx` | the sections and setup |
| T7, T8 → T9 | every section takes `startOpen` and `onSaved` | `GuidedSetup` |

---

### Task 1: Server — readiness gaps as codes; the posts list without archived posts

**Files:**
- Modify: `app/Services/ContentKnowledgeService.php` (`readinessOf`'s six section scorers)
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/PostController.php` (`index`)
- Test: `tests/Feature/Content/BrandTest.php`, `tests/Feature/Content/PostsTest.php`

**Interfaces:**
- Produces: every readiness section `{key, label, score, hints: string[], missing: string[]}` with `missing[i]` the code of `hints[i]`; the knowledge section also has `faq_count: int`; `ContentKnowledgeService::GAPS` (list of every code). `GET posts` without `status` leaves `archived` posts out.

- [ ] **Step 1: Set up the ledger and the test runner**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R2C=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-15-content-workspace-r2c-pages.md)
echo "$R2C"
cp .superpowers/sdd/archive/2026-10-14-content-workspace-r2b-portal/vt.sh "$R2C/vt.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-15-content-workspace-r2c-pages.md" > "$R2C/progress.md"
```
Expected: the printed path ends in `.superpowers/sdd/2026-10-15-content-workspace-r2c-pages`; `vt.sh` and `progress.md` exist there.

- [ ] **Step 2: Write the failing tests**

In `tests/Feature/Content/BrandTest.php`, add `use App\Services\ContentKnowledgeService;` to the imports (Edit tool) and this test after `test_reading_the_brand_writes_nothing_and_saving_a_section_rescores_it`:

```php
    public function test_readiness_names_each_gap_by_a_code_the_portal_words(): void
    {
        $this->profile->audiences()->delete();

        $sections = collect($this->asStaffMember()->getJson($this->api('brand'))->assertOk()->json('readiness.sections'))->keyBy('key');

        $this->assertSame(['company', 'knowledge', 'audience', 'voice', 'channels', 'strategy_inputs'], $sections->keys()->all());
        foreach ($sections as $key => $section) {
            $this->assertCount(count($section['hints']), $section['missing'], "{$key}: one code per hint");
            foreach ($section['missing'] as $code) {
                $this->assertContains($code, ContentKnowledgeService::GAPS, "{$key}: {$code}");
            }
        }
        $this->assertSame(['audience_none'], $sections['audience']['missing']);
        $this->assertIsInt($sections['knowledge']['faq_count']);
    }
```

In `tests/Feature/Content/PostsTest.php`, after `test_the_list_filters_pages_and_finds`:

```php
    public function test_the_list_leaves_archived_posts_out_unless_asked_for(): void
    {
        $this->makePost(['topic' => 'Live post']);
        $this->makePost(['topic' => 'Old post', 'status' => 'archived']);

        $this->asStaffMember()->getJson($this->api('posts'))->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.topic', 'Live post')->assertJsonPath('meta.total', 1);
        $this->asStaffMember()->getJson($this->api('posts?status=archived'))->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.topic', 'Old post');
    }
```

- [ ] **Step 3: Run them to see them fail**

Run: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/BrandTest.php tests/Feature/Content/PostsTest.php --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "✓|⨯|FAIL|Tests:"`
Expected: 2 failed — `GAPS` undefined (or `missing` key absent); the list answers 2 posts.

- [ ] **Step 4: Codes beside every hint**

In `app/Services/ContentKnowledgeService.php`, add this constant at the top of the class body:

```php
    /**
     * Every readiness gap by its code (`missing`, beside the English `hints`): the portal says
     * each one in the reader's language (content.brand.gap.<code>; a test keeps both lists equal).
     */
    public const GAPS = [
        'company_name', 'company_industry', 'company_website', 'brand_summary', 'usp', 'mission',
        'faq_none', 'faq_more', 'services',
        'audience_none', 'audience_pains', 'audience_goals',
        'voice_none', 'voice_tone', 'voice_emoji', 'voice_hashtag',
        'channels_none', 'channels_days', 'channels_per_week',
        'content_mix', 'weekly_rhythm', 'engagement_goals',
    ];
```

Replace the six methods `scoreCompany` … `scoreStrategyInputs` (from `private function scoreCompany` to the end of `scoreStrategyInputs`) with:

```php
    /** A gap: its sentence for the old screens and its code for the portal. */
    private static function gap(array &$hints, array &$missing, string $code, string $hint): void
    {
        $hints[] = $hint;
        $missing[] = $code;
    }

    /**
     * Company section: org name/industry/website + profile brand DNA fields.
     */
    private function scoreCompany(ContentPlannerProfile $profile, array $knowledge): array
    {
        $org = $knowledge['organization'] ?? null;
        $score = 0;
        $hints = [];
        $missing = [];

        if (!empty($org['name'])) {
            $score += 15;
        } else {
            self::gap($hints, $missing, 'company_name', 'Set the company name in organization settings.');
        }

        if (!empty($org['industry'])) {
            $score += 10;
        } else {
            self::gap($hints, $missing, 'company_industry', 'Set the company industry.');
        }

        if (!empty($org['website'])) {
            $score += 10;
        } else {
            self::gap($hints, $missing, 'company_website', 'Add the company website.');
        }

        if (trim((string) $profile->brand_summary) !== '') {
            $score += 25;
        } else {
            self::gap($hints, $missing, 'brand_summary', 'Add a brand summary in the setup wizard.');
        }

        if (trim((string) $profile->usp) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'usp', 'Define your USP (what makes you different).');
        }

        if (trim((string) $profile->mission) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'mission', 'Add your mission statement.');
        }

        return ['key' => 'company', 'label' => 'Company info', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
    }

    /**
     * Knowledge section: FAQ count (5+ = full credit) + services presence.
     */
    private function scoreKnowledge(array $knowledge): array
    {
        $faqCount = (int) ($knowledge['sources']['faq_count'] ?? 0);
        $hints = [];
        $missing = [];

        $score = (int) round(min($faqCount, 5) / 5 * 70);

        if ($faqCount === 0) {
            self::gap($hints, $missing, 'faq_none', 'Add FAQ entries in the AI Chat Widget knowledge base.');
        } elseif ($faqCount < 5) {
            self::gap($hints, $missing, 'faq_more', "Add more FAQ entries (have {$faqCount}, 5+ recommended).");
        }

        if (!empty($knowledge['sources']['has_services'])) {
            $score += 30;
        } else {
            self::gap($hints, $missing, 'services', 'Add your services/products list.');
        }

        return ['key' => 'knowledge', 'label' => 'FAQ & knowledge', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing, 'faq_count' => $faqCount];
    }

    /**
     * Audience section: segments exist + have pain points and goals.
     */
    private function scoreAudience(ContentPlannerProfile $profile): array
    {
        $audiences = $profile->audiences()->active()->get();

        if ($audiences->isEmpty()) {
            return [
                'key' => 'audience',
                'label' => 'Audience',
                'score' => 0,
                'hints' => ['Add at least one target audience segment.'],
                'missing' => ['audience_none'],
            ];
        }

        $hints = [];
        $missing = [];
        $score = 40;
        $total = $audiences->count();

        $withPains = $audiences->filter(fn ($audience) => !empty($audience->pain_points))->count();
        $withGoals = $audiences->filter(fn ($audience) => !empty($audience->goals))->count();

        $score += (int) round($withPains / $total * 30);
        $score += (int) round($withGoals / $total * 30);

        if ($withPains < $total) {
            self::gap($hints, $missing, 'audience_pains', 'Add pain points to every audience segment.');
        }

        if ($withGoals < $total) {
            self::gap($hints, $missing, 'audience_goals', 'Add goals/desires to every audience segment.');
        }

        return ['key' => 'audience', 'label' => 'Audience', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
    }

    /**
     * Voice section: brand voice row with tone + emoji/hashtag policies.
     */
    private function scoreVoice(ContentPlannerProfile $profile): array
    {
        $voice = $profile->brandVoices()->active()->first();

        if (!$voice) {
            return [
                'key' => 'voice',
                'label' => 'Brand voice',
                'score' => 0,
                'hints' => ['Define your brand voice in the setup wizard.'],
                'missing' => ['voice_none'],
            ];
        }

        $hints = [];
        $missing = [];
        $score = 40;

        if (trim((string) $voice->tone) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'voice_tone', 'Choose a tone for your brand voice.');
        }

        if (trim((string) $voice->emoji_policy) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'voice_emoji', 'Set an emoji policy.');
        }

        if (trim((string) $voice->hashtag_policy) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'voice_hashtag', 'Set a hashtag policy.');
        }

        return ['key' => 'voice', 'label' => 'Brand voice', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
    }

    /**
     * Channels section: at least one active channel + frequency/posts_per_week.
     */
    private function scoreChannels(ContentPlannerProfile $profile): array
    {
        $channels = $profile->channels()->active()->get();

        if ($channels->isEmpty()) {
            return [
                'key' => 'channels',
                'label' => 'Social channels',
                'score' => 0,
                'hints' => ['Activate at least one social channel.'],
                'missing' => ['channels_none'],
            ];
        }

        $hints = [];
        $missing = [];
        $score = 50;

        $hasFrequency = $channels->contains(function ($channel) {
            return is_array($channel->frequency) && count(array_filter($channel->frequency)) > 0;
        });

        $hasPostsPerWeek = $channels->contains(fn ($channel) => (int) $channel->posts_per_week > 0);

        if ($hasFrequency) {
            $score += 25;
        } else {
            self::gap($hints, $missing, 'channels_days', 'Set posting days (frequency) on your channels.');
        }

        if ($hasPostsPerWeek) {
            $score += 25;
        } else {
            self::gap($hints, $missing, 'channels_per_week', 'Set posts per week on your channels.');
        }

        return ['key' => 'channels', 'label' => 'Social channels', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
    }

    /**
     * Strategy inputs section: content mix + weekly rhythm + engagement goals.
     */
    private function scoreStrategyInputs(ContentPlannerProfile $profile): array
    {
        $hints = [];
        $missing = [];
        $score = 0;

        if (!empty($profile->content_mix)) {
            $score += 40;
        } else {
            self::gap($hints, $missing, 'content_mix', 'Set your content mix percentages.');
        }

        if (!empty($profile->weekly_rhythm)) {
            $score += 30;
        } else {
            self::gap($hints, $missing, 'weekly_rhythm', 'Configure your weekly rhythm.');
        }

        if (!empty($profile->engagement_goals)) {
            $score += 30;
        } else {
            self::gap($hints, $missing, 'engagement_goals', 'Choose your engagement goals.');
        }

        return ['key' => 'strategy_inputs', 'label' => 'Strategy inputs', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
    }
```

- [ ] **Step 5: The list without archived posts**

In `PostController::index`, replace

```php
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
```

with

```php
            // Archived posts are put away: listed only when asked for by their status.
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('status', $status), fn ($q) => $q->where('status', '!=', 'archived'))
```

- [ ] **Step 6: Run the tests to see them pass, then the whole Content folder**

Run: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/ --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|FAIL|Tests:"`
Expected: `Tests: 71 passed` (Plan A's 69 + these 2), no failure.

Then: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Content/ --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests:"` → `Tests: 3 passed`; and `tests/Feature/ContentCalendar/` → all passed (readiness feeds the AI context).

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/ContentKnowledgeService.php app/Http/Controllers/Api/V1/Admin/Content/PostController.php tests/Feature/Content/BrandTest.php tests/Feature/Content/PostsTest.php && git commit -q -F - <<'EOF'
Content server: readiness gaps by code; the posts list puts archived posts away

Each readiness section now says what is missing as codes beside its English
hints (and the FAQ count), so the portal can say them in five languages.
The posts list leaves archived posts out unless their status is asked for,
as the Plan and Find already do.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The data layer — types, calls, refusal words, option lists

**Files:**
- Modify: `frontend/src/content/lib/types.ts`, `frontend/src/content/lib/api.ts`, `frontend/src/content/lib/errors.ts`
- Create: `frontend/src/content/lib/options.ts`
- Test: `frontend/src/content/lib/api.test.ts`, `frontend/src/content/lib/options.test.ts` (create); `errors.test.ts` covers the new families as they are
- Words: `content.options.*`, `content.posts.error.*`, `content.strategy.error.*`, `content.brand.error.*` in all five bundles

**Interfaces:**
- Produces (types): `PostsPage`, `PostFilters`, `StrategyPillar`, `PillarBalance`, `StrategyOutput`, `StrategyDetail` (full), `Weekday`, `Channel`, `Audience`, `Voice`, `Positioning`, `RhythmDay`, `VisualStyle`, `BrandProfile`, `ReadinessSection`, `Readiness`, `BrandPayload` (full), `ProfileFields`, `VoiceFields`, `AudienceFields`, `ChannelFields`, `QuickSetupBody`, `Intensity`.
- Produces (calls on `contentApi(brand)`): `posts(filters)`, `createStrategy(instructions)`, `activateStrategy(id)`, `archiveStrategy(id)`, `saveProfile(fields)`, `saveVoice(fields)`, `createAudience(fields)`, `updateAudience(id, fields)`, `deleteAudience(id, confirm)`, `createChannel(fields)`, `updateChannel(id, fields)`, `deleteChannel(id)`, `quickSetup(body)`, `finishSetup()`, `refreshKnowledge()`; `postsParams(filters)`; `failureOf(e).posts` (the count an `audience_in_use` refusal carries).
- Produces (options): `optionSlug(value)`, `optionText(t, group, value)`, the maps `TONES`, `FORMALITY`, `SENTENCE_STYLES`, `POINTS_OF_VIEW`, `EMOJI_POLICIES`, `HASHTAG_POLICIES`, `PRICE_POSITIONS`, `TREND_MODES`, `TREND_HINTS`, `VISUAL_STYLES`, `IMAGE_TYPES`, `ENGAGEMENT_GOALS`, `WEEKDAY_ROLES`, `ROLE_HINTS`, `MIX_CATEGORIES`, `INTENSITIES`; `DEFAULT_MIX`, `DEFAULT_RHYTHM`, `RHYTHM_DAYS`, `CHANNEL_DAYS`, `OPTION_GROUPS` (group → map, for the bundle test).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/lib/options.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import { DEFAULT_MIX, DEFAULT_RHYTHM, MIX_CATEGORIES, OPTION_GROUPS, RHYTHM_DAYS, optionSlug, optionText } from './options'

describe('option lists', () => {
  it('are worded in the English bundle exactly as their fallbacks (by slug)', () => {
    for (const [group, map] of Object.entries(OPTION_GROUPS)) {
      const bySlug = Object.fromEntries(Object.entries(map).map(([value, label]) => [optionSlug(value), label]))
      expect((en.options as Record<string, unknown>)[group], `content.options.${group}`).toEqual(bySlug)
    }
  })

  it('turn a stored value into a key part ("real photos" → real_photos, "UI mockups" → ui_mockups)', () => {
    expect(optionSlug('real photos')).toBe('real_photos')
    expect(optionSlug('UI mockups')).toBe('ui_mockups')
    expect(optionSlug('trend_aware')).toBe('trend_aware')
  })

  it('name a known value in the reader\'s words, and show a value the list does not know as itself', () => {
    const t = (key: string, fallback: string) => `${key}|${fallback}`
    expect(optionText(t, 'tone', 'warm')).toBe('content.options.tone.warm|Warm')
    expect(optionText(t, 'tone', 'Cosy and calm')).toBe('Cosy and calm')
    expect(optionText(t, 'tone', '')).toBe('')
  })

  it('start a content mix at 100 % and a weekly rhythm on all seven days, from known values only', () => {
    expect(Object.values(DEFAULT_MIX).reduce((a, b) => a + b, 0)).toBe(100)
    for (const key of Object.keys(DEFAULT_MIX)) expect(MIX_CATEGORIES).toHaveProperty(key)
    expect(Object.keys(DEFAULT_RHYTHM)).toEqual([...RHYTHM_DAYS])
  })
})
```

Add to `frontend/src/content/lib/api.test.ts` (update the import line to `import { contentApi, contentUrl, failureOf, onWorkspaceOff, postsParams } from './api'`), at the end of the file:

```ts
describe('the Posts, Strategy and Brand calls', () => {
  it('send the posts filters that hold something, and only a page after the first', () => {
    const none = { q: '', status: '', platform: '', pillar_id: null, from: '', to: '', unscheduled: false, page: 1 } as const
    expect(postsParams(none)).toEqual({})
    expect(postsParams({ ...none, q: '  autumn ', status: 'draft', platform: 'instagram', pillar_id: 4, from: '2026-10-01', to: '2026-10-31', unscheduled: true, page: 3 }))
      .toEqual({ q: 'autumn', status: 'draft', platform: 'instagram', pillar_id: 4, from: '2026-10-01', to: '2026-10-31', unscheduled: 1, page: 3 })
  })

  it('reach each endpoint under the prefix with the brand', async () => {
    calls.fail = null
    const api = contentApi(5)
    await api.posts({ q: '', status: '', platform: '', pillar_id: null, from: '', to: '', unscheduled: false, page: 2 })
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/posts?brand_id=5', config: { params: { page: 2 } } })
    await api.createStrategy('Focus on autumn')
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/strategies?brand_id=5', body: { instructions: 'Focus on autumn' } })
    await api.createStrategy(null)
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/strategies?brand_id=5', body: {} })
    await api.activateStrategy(8)
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/strategies/8/activate?brand_id=5' })
    await api.archiveStrategy(8)
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/strategies/8/archive?brand_id=5' })
    await api.saveProfile({ usp: 'Organic colour only' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/profile?brand_id=5', body: { usp: 'Organic colour only' } })
    await api.saveVoice({ tone: 'warm' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/voice?brand_id=5', body: { tone: 'warm' } })
    await api.createAudience({ name: 'Busy parents' })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/audiences?brand_id=5', body: { name: 'Busy parents' } })
    await api.updateAudience(3, { name: 'Busy parents 30+' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/audiences/3?brand_id=5' })
    await api.deleteAudience(3, false)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/brand/audiences/3?brand_id=5' })
    await api.deleteAudience(3, true)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/brand/audiences/3?confirm=1&brand_id=5' })
    await api.createChannel({ platform: 'instagram', label: 'Instagram' })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/channels?brand_id=5' })
    await api.updateChannel(6, { active: false })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/channels/6?brand_id=5', body: { active: false } })
    await api.deleteChannel(6)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/brand/channels/6?brand_id=5' })
    await api.quickSetup({ platforms: ['instagram'], intensity: 'standard' })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/quick-setup?brand_id=5', body: { platforms: ['instagram'] } })
    await api.finishSetup()
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/setup?brand_id=5' })
    await api.refreshKnowledge()
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/refresh-knowledge?brand_id=5' })
  })

  it('carry the number of posts an audience in use has, for the question before removing it', () => {
    const failure = failureOf({ response: { status: 409, data: { error: 'audience_in_use', message: 'x', posts: 4 } } })
    expect(failure).toMatchObject({ status: 409, code: 'audience_in_use', posts: 4 })
    expect(failureOf({ response: { status: 409, data: { error: 'changed_elsewhere' } } })).not.toHaveProperty('posts')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R2C/vt.sh src/content/lib`
Expected: FAIL — `./options` cannot be found; `postsParams` is not exported; `api.posts` is not a function.

- [ ] **Step 3: The types**

In `frontend/src/content/lib/types.ts`, replace the block from `export interface StrategySummary {` to the end of the file with:

```ts
/** One page of `GET posts`: 50 a page, newest scheduled first, posts with no day last. */
export interface PostsPage { data: PostCard[]; meta: { page: number; pages: number; total: number } }

/** The Posts page's filters ('' or null: not filtered), as the address and `GET posts` hold them. */
export interface PostFilters {
  q: string
  status: PostStatus | ''
  platform: Platform | ''
  pillar_id: number | null
  from: DateKey | ''
  to: DateKey | ''
  unscheduled: boolean
  page: number
}

export interface StrategySummary {
  id: number
  title: string | null
  summary: string | null
  status: 'generating' | 'active' | 'superseded' | 'archived' | 'failed'
  created_at: string | null
}
export interface PillarRef { id: number; name: string; active: boolean }
export interface StrategyPillar extends PillarRef { description: string | null; purpose: string | null; frequency_weight: number | null }
/** This month's posts per pillar against the pillars' target weights (the active strategy only). */
export interface PillarBalance { from: DateKey; to: DateKey; pillars: { id: number; name: string; target_weight: number | null; posts: number }[] }

/** What the AI wrote for a strategy (every part optional: older strategies lack some). */
export interface StrategyOutput {
  title?: string
  brand_summary?: string
  assumptions?: string[]
  positioning_narrative?: { old_way?: string; new_way?: string; beliefs?: string[]; key_messages?: string[] }
  audience_map?: { name?: string; pains?: string[]; desires?: string[]; objections?: string[]; emotional_triggers?: string[]; content_they_engage_with?: string[] }[]
  content_pillars?: { name?: string; description?: string; purpose?: string; frequency_weight?: number; recommended_platforms?: string[]; example_topics?: string[]; cta_examples?: string[]; visual_direction?: string }[]
  content_mix?: Record<string, number>
  weekly_rhythm?: Record<string, { role?: string; description?: string; platforms?: string[]; pillars?: string[] }>
  platform_strategy?: Record<string, { role?: string; formats?: string[]; tone?: string; frequency?: string; post_types?: string[]; cta_style?: string; engagement_mechanics?: string[]; visual_style?: string }>
  engagement_strategy?: { primary_goals?: string[]; mechanics?: { goal?: string; tactic?: string }[] }
  conversion_strategy?: { approach?: string; soft_cta_examples?: string[] }
  visual_direction?: string
  monthly_themes?: string[]
  campaign_ideas?: { name?: string; goal?: string; description?: string }[]
  example_posts?: { platform?: string; post_type?: string; hook?: string; summary?: string }[]
  risks?: string[]
  opportunities?: string[]
  missing_information?: string[]
  next_actions?: string[]
}
export interface StrategyDetail extends StrategySummary {
  ai_output: StrategyOutput | null
  pillars: StrategyPillar[]
  balance: PillarBalance | null
}

/** A channel's posting days, as `frequency` keys them. */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface Channel {
  id: number
  platform: Platform
  label: string
  url: string | null
  goal: string | null
  role: string | null
  cta_style: string | null
  visual_style: string | null
  link_policy: string | null
  tone_override: string | null
  default_language: string | null
  emoji_policy: string | null
  hashtag_policy: string | null
  posts_per_week: number | null
  preferred_formats: string[] | null
  frequency: Partial<Record<Weekday, boolean>> | null
  audience_id: number | null
  active: boolean
}
export type ChannelRef = Pick<Channel, 'id' | 'platform' | 'label' | 'active'>

export interface Audience {
  id: number
  name: string
  description: string | null
  industry: string | null
  country: string | null
  business_size: string | null
  job_role: string | null
  preferred_tone: string | null
  language: string | null
  pain_points: string[] | null
  goals: string[] | null
  fears: string[] | null
  objections: string[] | null
  buying_triggers: string[] | null
  emotional_triggers: string[] | null
  rational_triggers: string[] | null
  questions: string[] | null
  preferred_platforms: string[] | null
  content_they_trust: string | null
  desired_transformation: string | null
  is_ai_assumed: boolean
  posts_count: number
}
export type AudienceRef = Pick<Audience, 'id' | 'name'>

export interface Voice {
  id: number
  tone: string | null
  style: string | null
  formality_level: string | null
  emoji_policy: string | null
  hashtag_policy: string | null
  sentence_style: string | null
  point_of_view: string | null
  preferred_words: string[] | null
  forbidden_words: string[] | null
  claims_to_avoid: string[] | null
  example_good_posts: string[] | null
  example_bad_posts: string[] | null
}

export interface Positioning { old_way?: string; new_way?: string; transformation?: string; beliefs?: string[] }
export interface RhythmDay { role?: string; notes?: string }
export interface VisualStyle { style?: string; image_types?: string[]; avoid?: string[]; aspect_ratios?: string[]; colors?: string[] }

export interface BrandProfile {
  id: number
  name: string | null
  default_language: string | null
  default_tone: string | null
  primary_goal: string | null
  secondary_goals: string[] | null
  content_rules: string[] | null
  brand_summary: string | null
  usp: string | null
  mission: string | null
  brand_values: string[] | null
  brand_promise: string | null
  differentiators: string | null
  proof_points: string[] | null
  price_position: string | null
  main_cta: string | null
  important_links: string[] | null
  positioning: Positioning | null
  key_messages: string[] | null
  content_mix: Record<string, number> | null
  weekly_rhythm: Record<string, RhythmDay> | null
  engagement_goals: string[] | null
  visual_style: VisualStyle | null
  trend_mode: string | null
  setup_step: number | null
  knowledge_score: number | null
  setup_completed_at: string | null
  last_knowledge_sync_at: string | null
}

export type ReadinessKey = 'company' | 'knowledge' | 'audience' | 'voice' | 'channels' | 'strategy_inputs'
/** One readiness section: its score and what is missing, by code (Task 1; `hints` are the server's English for the old screens). */
export interface ReadinessSection { key: ReadinessKey; label: string; score: number; hints: string[]; missing: string[]; faq_count?: number }
export interface Readiness { overall: number; sections: ReadinessSection[] }

/** `GET brand`, and the answer of every brand change: the whole brand as it now is. */
export interface BrandPayload {
  profile: BrandProfile | null
  audiences: Audience[]
  channels: Channel[]
  voice: Voice | null
  readiness: Readiness | null
}

/** What a brand change sends: only the fields it changes. */
export type ProfileFields = Partial<Omit<BrandProfile, 'id' | 'knowledge_score' | 'setup_completed_at' | 'last_knowledge_sync_at'>>
export type VoiceFields = Partial<Omit<Voice, 'id'>>
export type AudienceFields = Partial<Omit<Audience, 'id' | 'posts_count'>>
export type ChannelFields = Partial<Omit<Channel, 'id'>>

export type Intensity = 'light' | 'standard' | 'active'
export interface QuickSetupBody { platforms: Platform[]; name?: string; default_language?: string; primary_goal?: string; intensity?: Intensity }
```

- [ ] **Step 4: The calls**

In `frontend/src/content/lib/api.ts`:

1. Extend the type import with `AudienceFields, BrandProfile, ChannelFields, PostFilters, PostsPage, ProfileFields, QuickSetupBody, StrategyDetail, StrategySummary, VoiceFields, Audience, Channel` (keep it sorted as the file does).
2. Add this function above `contentApi`:

```ts
/** The posts filters as `GET posts` takes them: only those that hold something, the page only after the first. */
export function postsParams(filters: PostFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  const q = filters.q.trim()
  if (q !== '') out.q = q
  if (filters.status !== '') out.status = filters.status
  if (filters.platform !== '') out.platform = filters.platform
  if (filters.pillar_id !== null) out.pillar_id = filters.pillar_id
  if (filters.from !== '') out.from = filters.from
  if (filters.to !== '') out.to = filters.to
  if (filters.unscheduled) out.unscheduled = 1
  if (filters.page > 1) out.page = filters.page
  return out
}
```

3. Inside the object `contentApi` returns, after `brand: …`, add:

```ts
    posts: (filters: PostFilters): Promise<PostsPage> => watched(api.get(url('posts'), { params: postsParams(filters) })),

    createStrategy: (instructions: string | null): Promise<{ strategy: StrategySummary }> =>
      watched(api.post(url('strategies'), instructions ? { instructions } : {})),
    activateStrategy: (id: number): Promise<{ strategy: StrategyDetail }> => watched(api.post(url(`strategies/${id}/activate`))),
    archiveStrategy: (id: number): Promise<{ strategy: StrategyDetail }> => watched(api.post(url(`strategies/${id}/archive`))),

    saveProfile: (fields: ProfileFields): Promise<BrandPayload> => watched(api.put(url('brand/profile'), fields)),
    saveVoice: (fields: VoiceFields): Promise<BrandPayload> => watched(api.put(url('brand/voice'), fields)),
    createAudience: (fields: AudienceFields): Promise<BrandPayload & { audience: Audience }> => watched(api.post(url('brand/audiences'), fields)),
    updateAudience: (id: number, fields: AudienceFields): Promise<BrandPayload & { audience: Audience }> =>
      watched(api.put(url(`brand/audiences/${id}`), fields)),
    /** `confirm`: the manager said yes to removing an audience posts use (it answers 409 `audience_in_use` with their number first). */
    deleteAudience: (id: number, confirm: boolean): Promise<BrandPayload> =>
      watched(api.delete(url(`brand/audiences/${id}${confirm ? '?confirm=1' : ''}`))),
    createChannel: (fields: ChannelFields): Promise<BrandPayload & { channel: Channel }> => watched(api.post(url('brand/channels'), fields)),
    updateChannel: (id: number, fields: ChannelFields): Promise<BrandPayload & { channel: Channel }> =>
      watched(api.put(url(`brand/channels/${id}`), fields)),
    deleteChannel: (id: number): Promise<BrandPayload> => watched(api.delete(url(`brand/channels/${id}`))),
    /** One AI call that sets the brand up (minutes, not seconds); the brand comes back set up, with the AI's assumptions. */
    quickSetup: (body: QuickSetupBody): Promise<BrandPayload & { assumptions: string[] }> => watched(api.post(url('brand/quick-setup'), body)),
    finishSetup: (): Promise<BrandPayload> => watched(api.post(url('brand/setup'))),
    refreshKnowledge: (): Promise<BrandPayload> => watched(api.post(url('brand/refresh-knowledge'))),
```

(`BrandProfile` is not needed in api.ts if unused; drop it from the import if `tsc`/lint says so.)

4. In `ApiFailure` add `posts?: number` with the comment `/** An audience_in_use refusal: how many posts use the audience. */`, and in `failureOf`'s returned object add, after the `post` line:

```ts
    ...(typeof data.posts === 'number' ? { posts: data.posts } : {}),
```

- [ ] **Step 5: The refusal words**

In `frontend/src/content/lib/errors.ts`, inside `ERRORS` after `action: {…},` add:

```ts
  posts: {
    invalid: 'Check the dates: the end must not be before the start.',
    unknown: 'The posts could not be loaded. Please try again.',
  },
  strategy: {
    manager_only: 'Only an owner or a manager can change the strategy.',
    already_generating: 'A strategy is already being made for this brand.',
    ai_budget_used_up: "This month's AI budget is used up.",
    not_ready: 'This strategy is not finished, so it cannot be made active or archived.',
    not_found: 'This strategy no longer exists.',
    no_profile: 'Set up the brand first: the strategy is made from it.',
    unknown: 'That did not work. Please try again.',
  },
  brand: {
    manager_only: 'Only an owner or a manager can change the brand.',
    invalid: 'Some fields need attention.',
    not_found: 'This item no longer exists. The page now shows the brand as it is.',
    no_profile: 'This brand is not set up yet.',
    already_set_up: 'This brand is already set up.',
    ai_budget_used_up: "This month's AI budget is used up.",
    ai_failed: 'The AI could not finish. Please try again.',
    unknown: 'The change could not be saved. Please try again.',
  },
```

- [ ] **Step 6: The option lists**

Create `frontend/src/content/lib/options.ts`:

```ts
/**
 * The brand's option lists, moved from the old planner's lib.ts (spec §6.9:
 * its types and metadata move to content/lib; Plan D deletes the old copy).
 * Values are stored exactly as before (the AI reads them); each list maps a
 * value to its English name, the fallback under content.options.<group>.<slug>
 * (options.test.ts keeps the English bundle equal). A stored value no list
 * knows is shown as itself and kept.
 */

export const TONES: Record<string, string> = {
  professional: 'Professional', friendly: 'Friendly', luxury: 'Luxury', bold: 'Bold', expert: 'Expert',
  warm: 'Warm', direct: 'Direct', educational: 'Educational', premium: 'Premium', playful: 'Playful',
}
export const FORMALITY: Record<string, string> = { casual: 'Casual', balanced: 'Balanced', formal: 'Formal' }
export const SENTENCE_STYLES: Record<string, string> = { short: 'Short sentences', balanced: 'Balanced', storytelling: 'Storytelling' }
export const POINTS_OF_VIEW: Record<string, string> = { brand: 'The brand', founder: 'The founder', expert: 'An expert', customer: 'A customer' }
export const EMOJI_POLICIES: Record<string, string> = { none: 'None', light: 'A few', medium: 'Some', expressive: 'Many' }
export const HASHTAG_POLICIES: Record<string, string> = { none: 'None', minimal: 'Minimal', standard: 'Standard', broad: 'Broad' }
export const PRICE_POSITIONS: Record<string, string> = { budget: 'Budget', mid_market: 'Mid-market', premium: 'Premium', luxury: 'Luxury' }
export const TREND_MODES: Record<string, string> = {
  evergreen: 'Evergreen', trend_aware: 'Trend-aware', aggressive_trends: 'Trend testing', conservative: 'Conservative',
}
export const TREND_HINTS: Record<string, string> = {
  evergreen: 'Timeless content, no trend chasing',
  trend_aware: 'Trends only when they fit the brand',
  aggressive_trends: 'Actively test trending formats',
  conservative: 'Strictly professional, no experiments',
}
export const VISUAL_STYLES: Record<string, string> = {
  premium: 'Premium', minimal: 'Minimal', bold: 'Bold', luxury: 'Luxury', realistic: 'Realistic',
  lifestyle: 'Lifestyle', corporate: 'Corporate', educational: 'Educational', dark: 'Dark', light: 'Light',
}
/** Stored with spaces, as the old wizard wrote them. */
export const IMAGE_TYPES: Record<string, string> = {
  'real photos': 'Real photos', screenshots: 'Screenshots', 'UI mockups': 'Interface mock-ups', people: 'People',
  product: 'Product', abstract: 'Abstract', studio: 'Studio', office: 'Office', lifestyle: 'Lifestyle',
}
export const ENGAGEMENT_GOALS: Record<string, string> = {
  comments: 'Comments', saves: 'Saves', shares: 'Shares', dms: 'Direct messages', profile_visits: 'Profile visits',
  link_clicks: 'Link clicks', demo_requests: 'Demo requests', trial_signups: 'Trial sign-ups', bookings: 'Bookings', email_replies: 'Email replies',
}
export const WEEKDAY_ROLES: Record<string, string> = {
  problem_insight: 'Problem or insight', educational: 'Educational, how-to', proof: 'Proof, a case', behind_the_scenes: 'Behind the scenes',
  soft_conversion: 'Soft conversion', community: 'Community', reflection: 'Reflection, recap',
}
export const ROLE_HINTS: Record<string, string> = {
  problem_insight: 'A problem, an insight or a change of view',
  educational: 'Useful content that builds authority',
  proof: 'Trust through evidence, cases, before and after',
  behind_the_scenes: 'People, the team and their story',
  soft_conversion: 'Closer to action without hard selling',
  community: 'Polls, questions, light interaction',
  reflection: 'Recaps, lessons, planning prompts',
}
export const MIX_CATEGORIES: Record<string, string> = {
  education: 'Education', problem_awareness: 'Problem awareness', myths: 'Myths and misconceptions', product_explanation: 'Product explanation',
  behind_the_scenes: 'Behind the scenes', social_proof: 'Social proof', thought_leadership: 'Thought leadership', faq_answers: 'FAQ answers',
  case_studies: 'Case studies', community: 'Community and interaction', soft_promotion: 'Soft promotion', direct_conversion: 'Direct conversion',
}
export const INTENSITIES: Record<string, string> = { light: 'Light', standard: 'Standard', active: 'Active' }

/** Every list by its group in content.options (the bundle test walks this). */
export const OPTION_GROUPS = {
  tone: TONES, formality: FORMALITY, sentence_style: SENTENCE_STYLES, point_of_view: POINTS_OF_VIEW,
  emoji: EMOJI_POLICIES, hashtag: HASHTAG_POLICIES, price: PRICE_POSITIONS, trend: TREND_MODES, trend_hint: TREND_HINTS,
  visual_style: VISUAL_STYLES, image_type: IMAGE_TYPES, engagement: ENGAGEMENT_GOALS, role: WEEKDAY_ROLES, role_hint: ROLE_HINTS,
  mix: MIX_CATEGORIES, intensity: INTENSITIES,
} as const
export type OptionGroup = keyof typeof OPTION_GROUPS

/** The content mix a manager starts from (100 %). */
export const DEFAULT_MIX: Record<string, number> = {
  education: 25, problem_awareness: 15, thought_leadership: 15, product_explanation: 10,
  social_proof: 10, behind_the_scenes: 10, community: 10, soft_promotion: 5,
}
/** The weekly rhythm keys its days by their full English names (as the AI reads them). */
export const RHYTHM_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export const DEFAULT_RHYTHM: Record<string, { role: string; notes: string }> = {
  monday: { role: 'problem_insight', notes: '' }, tuesday: { role: 'educational', notes: '' }, wednesday: { role: 'proof', notes: '' },
  thursday: { role: 'behind_the_scenes', notes: '' }, friday: { role: 'soft_conversion', notes: '' }, saturday: { role: 'community', notes: '' },
  sunday: { role: 'reflection', notes: '' },
}
/** A channel's posting days, Monday first. */
export const CHANNEL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** A stored value as a key part: lower case, spaces to underscores ("UI mockups" → ui_mockups). */
export const optionSlug = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '_')

/** A value's name in the reader's words; a value the list does not know reads as itself. */
export function optionText(t: (key: string, fallback: string) => string, group: OptionGroup, value: string): string {
  const english = (OPTION_GROUPS[group] as Record<string, string>)[value]
  return english === undefined ? value : t(`content.options.${group}.${optionSlug(value)}`, english)
}
```

- [ ] **Step 7: The words**

Add to each bundle, as new top-level keys before the closing `}` (keep the file's two-space JSON style). **English** (`content.en.json`):

```json
  "options": {
    "tone": { "professional": "Professional", "friendly": "Friendly", "luxury": "Luxury", "bold": "Bold", "expert": "Expert", "warm": "Warm", "direct": "Direct", "educational": "Educational", "premium": "Premium", "playful": "Playful" },
    "formality": { "casual": "Casual", "balanced": "Balanced", "formal": "Formal" },
    "sentence_style": { "short": "Short sentences", "balanced": "Balanced", "storytelling": "Storytelling" },
    "point_of_view": { "brand": "The brand", "founder": "The founder", "expert": "An expert", "customer": "A customer" },
    "emoji": { "none": "None", "light": "A few", "medium": "Some", "expressive": "Many" },
    "hashtag": { "none": "None", "minimal": "Minimal", "standard": "Standard", "broad": "Broad" },
    "price": { "budget": "Budget", "mid_market": "Mid-market", "premium": "Premium", "luxury": "Luxury" },
    "trend": { "evergreen": "Evergreen", "trend_aware": "Trend-aware", "aggressive_trends": "Trend testing", "conservative": "Conservative" },
    "trend_hint": { "evergreen": "Timeless content, no trend chasing", "trend_aware": "Trends only when they fit the brand", "aggressive_trends": "Actively test trending formats", "conservative": "Strictly professional, no experiments" },
    "visual_style": { "premium": "Premium", "minimal": "Minimal", "bold": "Bold", "luxury": "Luxury", "realistic": "Realistic", "lifestyle": "Lifestyle", "corporate": "Corporate", "educational": "Educational", "dark": "Dark", "light": "Light" },
    "image_type": { "real_photos": "Real photos", "screenshots": "Screenshots", "ui_mockups": "Interface mock-ups", "people": "People", "product": "Product", "abstract": "Abstract", "studio": "Studio", "office": "Office", "lifestyle": "Lifestyle" },
    "engagement": { "comments": "Comments", "saves": "Saves", "shares": "Shares", "dms": "Direct messages", "profile_visits": "Profile visits", "link_clicks": "Link clicks", "demo_requests": "Demo requests", "trial_signups": "Trial sign-ups", "bookings": "Bookings", "email_replies": "Email replies" },
    "role": { "problem_insight": "Problem or insight", "educational": "Educational, how-to", "proof": "Proof, a case", "behind_the_scenes": "Behind the scenes", "soft_conversion": "Soft conversion", "community": "Community", "reflection": "Reflection, recap" },
    "role_hint": { "problem_insight": "A problem, an insight or a change of view", "educational": "Useful content that builds authority", "proof": "Trust through evidence, cases, before and after", "behind_the_scenes": "People, the team and their story", "soft_conversion": "Closer to action without hard selling", "community": "Polls, questions, light interaction", "reflection": "Recaps, lessons, planning prompts" },
    "mix": { "education": "Education", "problem_awareness": "Problem awareness", "myths": "Myths and misconceptions", "product_explanation": "Product explanation", "behind_the_scenes": "Behind the scenes", "social_proof": "Social proof", "thought_leadership": "Thought leadership", "faq_answers": "FAQ answers", "case_studies": "Case studies", "community": "Community and interaction", "soft_promotion": "Soft promotion", "direct_conversion": "Direct conversion" },
    "intensity": { "light": "Light", "standard": "Standard", "active": "Active" }
  },
  "posts": {
    "error": { "invalid": "Check the dates: the end must not be before the start.", "unknown": "The posts could not be loaded. Please try again." }
  },
  "strategy": {
    "error": { "manager_only": "Only an owner or a manager can change the strategy.", "already_generating": "A strategy is already being made for this brand.", "ai_budget_used_up": "This month's AI budget is used up.", "not_ready": "This strategy is not finished, so it cannot be made active or archived.", "not_found": "This strategy no longer exists.", "no_profile": "Set up the brand first: the strategy is made from it.", "unknown": "That did not work. Please try again." }
  },
  "brand": {
    "error": { "manager_only": "Only an owner or a manager can change the brand.", "invalid": "Some fields need attention.", "not_found": "This item no longer exists. The page now shows the brand as it is.", "no_profile": "This brand is not set up yet.", "already_set_up": "This brand is already set up.", "ai_budget_used_up": "This month's AI budget is used up.", "ai_failed": "The AI could not finish. Please try again.", "unknown": "The change could not be saved. Please try again." }
  }
```

**Russian** (`content.ru.json`):

```json
  "options": {
    "tone": { "professional": "Профессиональный", "friendly": "Дружелюбный", "luxury": "Роскошный", "bold": "Смелый", "expert": "Экспертный", "warm": "Тёплый", "direct": "Прямой", "educational": "Обучающий", "premium": "Премиальный", "playful": "Игривый" },
    "formality": { "casual": "Непринуждённо", "balanced": "Сбалансированно", "formal": "Официально" },
    "sentence_style": { "short": "Короткие фразы", "balanced": "Сбалансированно", "storytelling": "Истории" },
    "point_of_view": { "brand": "От бренда", "founder": "От основателя", "expert": "От эксперта", "customer": "От клиента" },
    "emoji": { "none": "Без эмодзи", "light": "Немного", "medium": "Умеренно", "expressive": "Много" },
    "hashtag": { "none": "Без хештегов", "minimal": "Минимум", "standard": "Стандартно", "broad": "Много" },
    "price": { "budget": "Бюджетный", "mid_market": "Средний сегмент", "premium": "Премиум", "luxury": "Люкс" },
    "trend": { "evergreen": "Вне времени", "trend_aware": "С учётом трендов", "aggressive_trends": "Тест трендов", "conservative": "Консервативно" },
    "trend_hint": { "evergreen": "Вечный контент, без погони за трендами", "trend_aware": "Тренды — только если подходят бренду", "aggressive_trends": "Активно пробовать трендовые форматы", "conservative": "Строго профессионально, без экспериментов" },
    "visual_style": { "premium": "Премиальный", "minimal": "Минималистичный", "bold": "Смелый", "luxury": "Роскошный", "realistic": "Реалистичный", "lifestyle": "Лайфстайл", "corporate": "Корпоративный", "educational": "Обучающий", "dark": "Тёмный", "light": "Светлый" },
    "image_type": { "real_photos": "Реальные фото", "screenshots": "Скриншоты", "ui_mockups": "Макеты интерфейса", "people": "Люди", "product": "Продукт", "abstract": "Абстракция", "studio": "Студия", "office": "Офис", "lifestyle": "Лайфстайл" },
    "engagement": { "comments": "Комментарии", "saves": "Сохранения", "shares": "Репосты", "dms": "Личные сообщения", "profile_visits": "Визиты в профиль", "link_clicks": "Переходы по ссылке", "demo_requests": "Заявки на демо", "trial_signups": "Пробные регистрации", "bookings": "Записи", "email_replies": "Ответы на письма" },
    "role": { "problem_insight": "Проблема или инсайт", "educational": "Обучение, как сделать", "proof": "Доказательство, кейс", "behind_the_scenes": "За кулисами", "soft_conversion": "Мягкая конверсия", "community": "Сообщество", "reflection": "Итоги, размышления" },
    "role_hint": { "problem_insight": "Проблема, инсайт или новый взгляд", "educational": "Полезный контент, который создаёт авторитет", "proof": "Доверие через факты, кейсы, до и после", "behind_the_scenes": "Люди, команда и их история", "soft_conversion": "Ближе к действию без жёстких продаж", "community": "Опросы, вопросы, лёгкое общение", "reflection": "Итоги, уроки, планы" },
    "mix": { "education": "Обучение", "problem_awareness": "Осознание проблемы", "myths": "Мифы и заблуждения", "product_explanation": "Объяснение продукта", "behind_the_scenes": "За кулисами", "social_proof": "Социальное доказательство", "thought_leadership": "Экспертное мнение", "faq_answers": "Ответы на вопросы", "case_studies": "Кейсы", "community": "Сообщество и общение", "soft_promotion": "Мягкое продвижение", "direct_conversion": "Прямая продажа" },
    "intensity": { "light": "Спокойно", "standard": "Обычно", "active": "Активно" }
  },
  "posts": {
    "error": { "invalid": "Проверьте даты: конец не может быть раньше начала.", "unknown": "Не удалось загрузить посты. Попробуйте ещё раз." }
  },
  "strategy": {
    "error": { "manager_only": "Менять стратегию может только владелец или менеджер.", "already_generating": "Стратегия для этого бренда уже создаётся.", "ai_budget_used_up": "Бюджет ИИ на этот месяц исчерпан.", "not_ready": "Стратегия ещё не готова, её нельзя сделать активной или отправить в архив.", "not_found": "Этой стратегии больше нет.", "no_profile": "Сначала настройте бренд: стратегия строится на нём.", "unknown": "Не получилось. Попробуйте ещё раз." }
  },
  "brand": {
    "error": { "manager_only": "Менять бренд может только владелец или менеджер.", "invalid": "Проверьте отмеченные поля.", "not_found": "Этого элемента больше нет. Страница показывает бренд как есть.", "no_profile": "Бренд ещё не настроен.", "already_set_up": "Бренд уже настроен.", "ai_budget_used_up": "Бюджет ИИ на этот месяц исчерпан.", "ai_failed": "ИИ не смог закончить. Попробуйте ещё раз.", "unknown": "Не удалось сохранить изменение. Попробуйте ещё раз." }
  }
```

**German** (`content.de.json`):

```json
  "options": {
    "tone": { "professional": "Professionell", "friendly": "Freundlich", "luxury": "Luxuriös", "bold": "Mutig", "expert": "Fachkundig", "warm": "Warm", "direct": "Direkt", "educational": "Lehrreich", "premium": "Premium", "playful": "Verspielt" },
    "formality": { "casual": "Locker", "balanced": "Ausgewogen", "formal": "Förmlich" },
    "sentence_style": { "short": "Kurze Sätze", "balanced": "Ausgewogen", "storytelling": "Erzählend" },
    "point_of_view": { "brand": "Die Marke", "founder": "Die Gründung", "expert": "Eine Fachperson", "customer": "Die Kundschaft" },
    "emoji": { "none": "Keine", "light": "Wenige", "medium": "Einige", "expressive": "Viele" },
    "hashtag": { "none": "Keine", "minimal": "Minimal", "standard": "Standard", "broad": "Breit" },
    "price": { "budget": "Günstig", "mid_market": "Mittelklasse", "premium": "Premium", "luxury": "Luxus" },
    "trend": { "evergreen": "Zeitlos", "trend_aware": "Trendbewusst", "aggressive_trends": "Trends testen", "conservative": "Konservativ" },
    "trend_hint": { "evergreen": "Zeitlose Inhalte, keine Trendjagd", "trend_aware": "Trends nur, wenn sie zur Marke passen", "aggressive_trends": "Trendformate aktiv testen", "conservative": "Streng professionell, keine Experimente" },
    "visual_style": { "premium": "Premium", "minimal": "Minimalistisch", "bold": "Kräftig", "luxury": "Luxuriös", "realistic": "Realistisch", "lifestyle": "Lifestyle", "corporate": "Geschäftlich", "educational": "Lehrreich", "dark": "Dunkel", "light": "Hell" },
    "image_type": { "real_photos": "Echte Fotos", "screenshots": "Screenshots", "ui_mockups": "Interface-Entwürfe", "people": "Menschen", "product": "Produkt", "abstract": "Abstrakt", "studio": "Studio", "office": "Büro", "lifestyle": "Lifestyle" },
    "engagement": { "comments": "Kommentare", "saves": "Speicherungen", "shares": "Geteilte Beiträge", "dms": "Direktnachrichten", "profile_visits": "Profilbesuche", "link_clicks": "Linkklicks", "demo_requests": "Demo-Anfragen", "trial_signups": "Testanmeldungen", "bookings": "Buchungen", "email_replies": "E-Mail-Antworten" },
    "role": { "problem_insight": "Problem oder Einsicht", "educational": "Wissen, Anleitung", "proof": "Beweis, Fallbeispiel", "behind_the_scenes": "Hinter den Kulissen", "soft_conversion": "Sanfte Conversion", "community": "Community", "reflection": "Rückblick" },
    "role_hint": { "problem_insight": "Ein Problem, eine Einsicht oder ein neuer Blick", "educational": "Nützliche Inhalte, die Ansehen schaffen", "proof": "Vertrauen durch Belege, Fälle, Vorher und Nachher", "behind_the_scenes": "Menschen, das Team und ihre Geschichte", "soft_conversion": "Näher zur Handlung, ohne harten Verkauf", "community": "Umfragen, Fragen, leichter Austausch", "reflection": "Rückblicke, Lehren, Planungsimpulse" },
    "mix": { "education": "Wissen", "problem_awareness": "Problembewusstsein", "myths": "Mythen und Irrtümer", "product_explanation": "Produkterklärung", "behind_the_scenes": "Hinter den Kulissen", "social_proof": "Social Proof", "thought_leadership": "Vordenkerrolle", "faq_answers": "Antworten auf Fragen", "case_studies": "Fallstudien", "community": "Community und Austausch", "soft_promotion": "Sanfte Werbung", "direct_conversion": "Direkter Verkauf" },
    "intensity": { "light": "Ruhig", "standard": "Standard", "active": "Aktiv" }
  },
  "posts": {
    "error": { "invalid": "Prüfen Sie die Daten: Das Ende darf nicht vor dem Anfang liegen.", "unknown": "Die Beiträge konnten nicht geladen werden. Bitte versuchen Sie es erneut." }
  },
  "strategy": {
    "error": { "manager_only": "Nur Inhaber oder Manager können die Strategie ändern.", "already_generating": "Für diese Marke wird bereits eine Strategie erstellt.", "ai_budget_used_up": "Das KI-Budget dieses Monats ist aufgebraucht.", "not_ready": "Diese Strategie ist nicht fertig und kann weder aktiviert noch archiviert werden.", "not_found": "Diese Strategie gibt es nicht mehr.", "no_profile": "Richten Sie zuerst die Marke ein: Die Strategie baut darauf auf.", "unknown": "Das hat nicht geklappt. Bitte versuchen Sie es erneut." }
  },
  "brand": {
    "error": { "manager_only": "Nur Inhaber oder Manager können die Marke ändern.", "invalid": "Einige Felder müssen geprüft werden.", "not_found": "Diesen Eintrag gibt es nicht mehr. Die Seite zeigt die Marke, wie sie jetzt ist.", "no_profile": "Diese Marke ist noch nicht eingerichtet.", "already_set_up": "Diese Marke ist bereits eingerichtet.", "ai_budget_used_up": "Das KI-Budget dieses Monats ist aufgebraucht.", "ai_failed": "Die KI konnte nicht fertig werden. Bitte versuchen Sie es erneut.", "unknown": "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut." }
  }
```

**French** (`content.fr.json`):

```json
  "options": {
    "tone": { "professional": "Professionnel", "friendly": "Amical", "luxury": "Luxe", "bold": "Audacieux", "expert": "Expert", "warm": "Chaleureux", "direct": "Direct", "educational": "Pédagogique", "premium": "Premium", "playful": "Ludique" },
    "formality": { "casual": "Décontracté", "balanced": "Équilibré", "formal": "Formel" },
    "sentence_style": { "short": "Phrases courtes", "balanced": "Équilibré", "storytelling": "Narratif" },
    "point_of_view": { "brand": "La marque", "founder": "Le fondateur", "expert": "Un expert", "customer": "Un client" },
    "emoji": { "none": "Aucun", "light": "Quelques-uns", "medium": "Modéré", "expressive": "Beaucoup" },
    "hashtag": { "none": "Aucun", "minimal": "Minimal", "standard": "Standard", "broad": "Large" },
    "price": { "budget": "Économique", "mid_market": "Milieu de gamme", "premium": "Premium", "luxury": "Luxe" },
    "trend": { "evergreen": "Intemporel", "trend_aware": "Attentif aux tendances", "aggressive_trends": "Test de tendances", "conservative": "Conservateur" },
    "trend_hint": { "evergreen": "Contenu intemporel, sans courir après les tendances", "trend_aware": "Les tendances seulement si elles vont à la marque", "aggressive_trends": "Tester activement les formats tendance", "conservative": "Strictement professionnel, sans expériences" },
    "visual_style": { "premium": "Premium", "minimal": "Minimaliste", "bold": "Audacieux", "luxury": "Luxe", "realistic": "Réaliste", "lifestyle": "Lifestyle", "corporate": "Corporate", "educational": "Pédagogique", "dark": "Sombre", "light": "Clair" },
    "image_type": { "real_photos": "Vraies photos", "screenshots": "Captures d’écran", "ui_mockups": "Maquettes d’interface", "people": "Personnes", "product": "Produit", "abstract": "Abstrait", "studio": "Studio", "office": "Bureau", "lifestyle": "Lifestyle" },
    "engagement": { "comments": "Commentaires", "saves": "Enregistrements", "shares": "Partages", "dms": "Messages privés", "profile_visits": "Visites du profil", "link_clicks": "Clics sur les liens", "demo_requests": "Demandes de démo", "trial_signups": "Inscriptions à l’essai", "bookings": "Réservations", "email_replies": "Réponses aux e-mails" },
    "role": { "problem_insight": "Problème ou idée", "educational": "Pédagogie, tutoriel", "proof": "Preuve, cas client", "behind_the_scenes": "Coulisses", "soft_conversion": "Conversion douce", "community": "Communauté", "reflection": "Bilan, réflexion" },
    "role_hint": { "problem_insight": "Un problème, une idée ou un autre regard", "educational": "Du contenu utile qui installe l’autorité", "proof": "La confiance par les preuves, les cas, l’avant-après", "behind_the_scenes": "Les personnes, l’équipe et leur histoire", "soft_conversion": "Vers l’action, sans vente agressive", "community": "Sondages, questions, échanges légers", "reflection": "Bilans, leçons, pistes pour la suite" },
    "mix": { "education": "Éducation", "problem_awareness": "Prise de conscience du problème", "myths": "Mythes et idées reçues", "product_explanation": "Explication du produit", "behind_the_scenes": "Coulisses", "social_proof": "Preuve sociale", "thought_leadership": "Leadership d’opinion", "faq_answers": "Réponses aux questions", "case_studies": "Études de cas", "community": "Communauté et échanges", "soft_promotion": "Promotion douce", "direct_conversion": "Conversion directe" },
    "intensity": { "light": "Léger", "standard": "Standard", "active": "Actif" }
  },
  "posts": {
    "error": { "invalid": "Vérifiez les dates : la fin ne peut pas précéder le début.", "unknown": "Les publications n’ont pas pu être chargées. Veuillez réessayer." }
  },
  "strategy": {
    "error": { "manager_only": "Seul un propriétaire ou un responsable peut modifier la stratégie.", "already_generating": "Une stratégie est déjà en cours de création pour cette marque.", "ai_budget_used_up": "Le budget IA de ce mois est épuisé.", "not_ready": "Cette stratégie n’est pas terminée : elle ne peut être ni activée ni archivée.", "not_found": "Cette stratégie n’existe plus.", "no_profile": "Configurez d’abord la marque : la stratégie s’appuie sur elle.", "unknown": "Cela n’a pas fonctionné. Veuillez réessayer." }
  },
  "brand": {
    "error": { "manager_only": "Seul un propriétaire ou un responsable peut modifier la marque.", "invalid": "Certains champs sont à vérifier.", "not_found": "Cet élément n’existe plus. La page montre la marque telle qu’elle est.", "no_profile": "Cette marque n’est pas encore configurée.", "already_set_up": "Cette marque est déjà configurée.", "ai_budget_used_up": "Le budget IA de ce mois est épuisé.", "ai_failed": "L’IA n’a pas pu terminer. Veuillez réessayer.", "unknown": "La modification n’a pas pu être enregistrée. Veuillez réessayer." }
  }
```

**Spanish** (`content.es.json`):

```json
  "options": {
    "tone": { "professional": "Profesional", "friendly": "Cercano", "luxury": "Lujoso", "bold": "Audaz", "expert": "Experto", "warm": "Cálido", "direct": "Directo", "educational": "Educativo", "premium": "Premium", "playful": "Divertido" },
    "formality": { "casual": "Informal", "balanced": "Equilibrado", "formal": "Formal" },
    "sentence_style": { "short": "Frases cortas", "balanced": "Equilibrado", "storytelling": "Narrativo" },
    "point_of_view": { "brand": "La marca", "founder": "El fundador", "expert": "Un experto", "customer": "Un cliente" },
    "emoji": { "none": "Ninguno", "light": "Pocos", "medium": "Algunos", "expressive": "Muchos" },
    "hashtag": { "none": "Ninguno", "minimal": "Mínimo", "standard": "Estándar", "broad": "Amplio" },
    "price": { "budget": "Económico", "mid_market": "Gama media", "premium": "Premium", "luxury": "Lujo" },
    "trend": { "evergreen": "Atemporal", "trend_aware": "Atento a tendencias", "aggressive_trends": "Probar tendencias", "conservative": "Conservador" },
    "trend_hint": { "evergreen": "Contenido atemporal, sin perseguir tendencias", "trend_aware": "Tendencias solo si encajan con la marca", "aggressive_trends": "Probar activamente formatos de moda", "conservative": "Estrictamente profesional, sin experimentos" },
    "visual_style": { "premium": "Premium", "minimal": "Minimalista", "bold": "Audaz", "luxury": "Lujo", "realistic": "Realista", "lifestyle": "Estilo de vida", "corporate": "Corporativo", "educational": "Educativo", "dark": "Oscuro", "light": "Claro" },
    "image_type": { "real_photos": "Fotos reales", "screenshots": "Capturas de pantalla", "ui_mockups": "Maquetas de interfaz", "people": "Personas", "product": "Producto", "abstract": "Abstracto", "studio": "Estudio", "office": "Oficina", "lifestyle": "Estilo de vida" },
    "engagement": { "comments": "Comentarios", "saves": "Guardados", "shares": "Compartidos", "dms": "Mensajes directos", "profile_visits": "Visitas al perfil", "link_clicks": "Clics en enlaces", "demo_requests": "Solicitudes de demo", "trial_signups": "Registros de prueba", "bookings": "Reservas", "email_replies": "Respuestas a correos" },
    "role": { "problem_insight": "Problema o idea", "educational": "Educativo, cómo hacerlo", "proof": "Prueba, un caso", "behind_the_scenes": "Entre bastidores", "soft_conversion": "Conversión suave", "community": "Comunidad", "reflection": "Reflexión, resumen" },
    "role_hint": { "problem_insight": "Un problema, una idea o un cambio de mirada", "educational": "Contenido útil que crea autoridad", "proof": "Confianza con pruebas, casos, antes y después", "behind_the_scenes": "Las personas, el equipo y su historia", "soft_conversion": "Más cerca de actuar, sin venta agresiva", "community": "Encuestas, preguntas, interacción ligera", "reflection": "Resúmenes, lecciones, ideas para planificar" },
    "mix": { "education": "Educación", "problem_awareness": "Conciencia del problema", "myths": "Mitos y errores", "product_explanation": "Explicación del producto", "behind_the_scenes": "Entre bastidores", "social_proof": "Prueba social", "thought_leadership": "Liderazgo de opinión", "faq_answers": "Respuestas a preguntas", "case_studies": "Casos de éxito", "community": "Comunidad e interacción", "soft_promotion": "Promoción suave", "direct_conversion": "Conversión directa" },
    "intensity": { "light": "Ligero", "standard": "Estándar", "active": "Activo" }
  },
  "posts": {
    "error": { "invalid": "Revisa las fechas: el final no puede ser anterior al inicio.", "unknown": "No se pudieron cargar las publicaciones. Inténtalo de nuevo." }
  },
  "strategy": {
    "error": { "manager_only": "Solo un propietario o un responsable puede cambiar la estrategia.", "already_generating": "Ya se está creando una estrategia para esta marca.", "ai_budget_used_up": "El presupuesto de IA de este mes se ha agotado.", "not_ready": "Esta estrategia no está terminada: no se puede activar ni archivar.", "not_found": "Esta estrategia ya no existe.", "no_profile": "Configura primero la marca: la estrategia parte de ella.", "unknown": "No ha funcionado. Inténtalo de nuevo." }
  },
  "brand": {
    "error": { "manager_only": "Solo un propietario o un responsable puede cambiar la marca.", "invalid": "Algunos campos necesitan revisión.", "not_found": "Este elemento ya no existe. La página muestra la marca tal como está.", "no_profile": "Esta marca aún no está configurada.", "already_set_up": "Esta marca ya está configurada.", "ai_budget_used_up": "El presupuesto de IA de este mes se ha agotado.", "ai_failed": "La IA no pudo terminar. Inténtalo de nuevo.", "unknown": "No se pudo guardar el cambio. Inténtalo de nuevo." }
  }
```

- [ ] **Step 8: Run the tests, the types and the lint**

Run: `$R2C/vt.sh src/content` → all pass (Plan B's 225 + this task's new ones), including `errors.test.ts` (the three new families equal the English bundle) and `contentLocales.test.ts` (five bundles, same keys).
Run: `cd frontend && npx tsc -b` → clean. If Plan B code that built a partial `BrandPayload` or used the old `ChannelRef`/`AudienceRef` no longer types, fix the call site (the new types are supersets) and say so in a `Ruling:` line. (Later tasks pass react-i18next's `t` straight to `optionText`; if `tsc` then says `TFunction` is not assignable to its first parameter, type that parameter as `TFunction` with `import type { TFunction } from 'i18next'` — the call sites stay as written.)
Run: `cd frontend && npx eslint src/content src/workspace src/App.tsx` → only the baseline error.

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib frontend/src/content/i18n && git commit -q -F - <<'EOF'
Content portal: the data layer for Posts, Strategy and Brand — types, calls, refusal words, option lists

The brand payload, strategy detail and posts page in full; every call the
three pages make; the portal's words for their refusals; and the brand's
option lists moved into content/lib (spec §6.9), named in five languages.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```


---

### Task 3: Posts — the page, its filters in the address, its place in the rail

**Files:**
- Create: `frontend/src/content/ui/PageHeader.tsx`, `frontend/src/content/lib/useActiveStrategy.ts`, `frontend/src/content/posts/postsFilters.ts`, `frontend/src/content/posts/PostRow.tsx`, `frontend/src/content/posts/PostsPage.tsx`
- Modify: `frontend/src/content/ContentApp.tsx` (route `posts`), `frontend/src/content/ContentShell.tsx` (nav item), `frontend/src/content/lib/links.ts` (`postHome`), `frontend/src/content/panel/PostLink.tsx` (an unscheduled post opens on Posts), `frontend/src/content/lib/planCache.ts` (`refreshLists`), `frontend/src/content/panel/PostPanel.tsx` and `frontend/src/content/plan/PlanPage.tsx` (refresh both lists)
- Test: `frontend/src/content/posts/postsFilters.test.ts`, `frontend/src/content/posts/postsPage.test.tsx`, `frontend/src/content/lib/links.test.ts` (create); `frontend/src/content/lib/planCache.test.ts` (add)
- Words: `content.nav.posts`, `content.posts.*` (page words) in all five bundles

**Interfaces:**
- Consumes: `PostFilters`, `PostsPage`, `contentApi.posts`, `postsParams` (Task 2); `PlatformMark`, `StatusPill`, `cardLine`, `formatDate`, `usePanel` (Plan B).
- Produces: `PageHeader({ title, children })`; `useActiveStrategy(): { activeId, strategy }`; `NO_FILTERS`, `readFilters(params, statuses, platforms)`, `writeFilters(filters)`, `withFilter(filters, change)`, `isFiltered(filters)`; `postHome(post, today)`; `refreshLists(queryClient, brand)`; route `/content/posts`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/posts/postsFilters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Platform, PostStatus } from '../lib/types'
import { NO_FILTERS, isFiltered, readFilters, withFilter, writeFilters } from './postsFilters'

const statuses: PostStatus[] = ['idea', 'draft', 'published', 'archived']
const platforms: Platform[] = ['instagram', 'linkedin']
const read = (query: string) => readFilters(new URLSearchParams(query), statuses, platforms)

describe('readFilters', () => {
  it('reads a plain address as "not filtered", first page', () => {
    expect(read('')).toEqual(NO_FILTERS)
  })

  it('reads every filter an address names', () => {
    expect(read('q=autumn&status=draft&platform=linkedin&pillar=7&from=2026-10-01&to=2026-10-31&page=3')).toEqual({
      q: 'autumn', status: 'draft', platform: 'linkedin', pillar_id: 7, from: '2026-10-01', to: '2026-10-31', unscheduled: false, page: 3,
    })
  })

  // A shared or hand-edited link never makes the server refuse the list (it would answer 422 for an end before the start).
  it('drops what it cannot use: an unknown status or platform, a bad pillar or page, a bad date, an end before the start', () => {
    expect(read('status=lost&platform=myspace&pillar=-3&page=abc&from=2026-13-40&to=yesterday')).toEqual(NO_FILTERS)
    expect(read('from=2026-10-20&to=2026-10-01')).toMatchObject({ from: '2026-10-20', to: '' })
    expect(read('page=1.5').page).toBe(1)
  })

  it('takes "only posts with no day" over a date range (the two cannot both hold)', () => {
    expect(read('unscheduled=1&from=2026-10-01&to=2026-10-31')).toMatchObject({ unscheduled: true, from: '', to: '' })
  })
})

describe('writeFilters, withFilter and isFiltered', () => {
  it('write only what holds something, so a plain list keeps a plain address', () => {
    expect(writeFilters(NO_FILTERS).toString()).toBe('')
    const full = { q: 'autumn ', status: 'draft', platform: 'instagram', pillar_id: 7, from: '2026-10-01', to: '', unscheduled: false, page: 2 } as const
    expect(writeFilters(full).toString()).toBe('q=autumn+&status=draft&platform=instagram&pillar=7&from=2026-10-01&page=2')
    expect(read(writeFilters(full).toString())).toEqual(full)
  })

  it('start again from the first page when a filter changes, but not when the page does', () => {
    const onPage3 = { ...NO_FILTERS, page: 3 }
    expect(withFilter(onPage3, { status: 'draft' }).page).toBe(1)
    expect(withFilter(onPage3, { page: 4 }).page).toBe(4)
  })

  it('say whether anything filters the list (the page is not a filter)', () => {
    expect(isFiltered({ ...NO_FILTERS, page: 5 })).toBe(false)
    expect(isFiltered({ ...NO_FILTERS, unscheduled: true })).toBe(true)
    expect(isFiltered({ ...NO_FILTERS, q: '  ' })).toBe(false)
  })
})
```

Create `frontend/src/content/lib/links.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { postHome } from './links'

describe('postHome', () => {
  it('opens a post with a day on its week, and one with no day on Posts among the others with no day', () => {
    expect(postHome({ scheduled_date: '2026-10-21' })).toBe('/content?date=2026-10-21')
    expect(postHome({ scheduled_date: null })).toBe('/content/posts?unscheduled=1')
  })
})
```

Add to `frontend/src/content/lib/planCache.test.ts` (import `refreshLists` too, and `QueryClient` from `@tanstack/react-query`, `vi` from vitest):

```ts
describe('refreshLists', () => {
  it('marks both the Plan\'s and the Posts page\'s reads of the brand for a new read', () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    void refreshLists(client, 3)
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['content', 3, 'plan'], ['content', 3, 'posts']])
  })
})
```

Create `frontend/src/content/posts/postsPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostCard, PostFilters, PostsPage as Page } from '../lib/types'
import { PanelProvider } from '../panel/PanelProvider'
import { NO_FILTERS } from './postsFilters'
import { PostsPage } from './PostsPage'

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
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['idea', 'draft', 'published', 'archived'], rewrites: [],
} as unknown as Bootstrap

const card = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: '2026-10-21', scheduled_time: '09:30', status: 'draft',
  title: null, hook: `Hook ${id}`, topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', ...more,
})

function render(url: string, filters: PostFilters, page: Page | null) {
  const client = new QueryClient()
  if (page) client.setQueryData(['content', 3, 'posts', filters], page)
  client.setQueryData(['content', 3, 'strategies'], { strategies: [{ id: 2, title: null, summary: null, status: 'active', created_at: null }] })
  client.setQueryData(['content', 3, 'strategy', 2], {
    strategy: { id: 2, title: null, summary: null, status: 'active', created_at: null, ai_output: null, balance: null,
      pillars: [{ id: 7, name: 'Hair care', active: true, description: null, purpose: null, frequency_weight: 30 }] },
  })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PanelProvider><PostsPage /></PanelProvider>
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PostsPage', () => {
  it('lists the posts the address asks for, each with its day, pillar and status, and how many there are', () => {
    const filters = { ...NO_FILTERS, status: 'draft' } as const
    const html = render('/content/posts?status=draft', filters, {
      data: [card(1, { pillar_id: 7 }), card(2, { scheduled_date: null, scheduled_time: null, pillar_id: 99 })],
      meta: { page: 1, pages: 1, total: 2 },
    })
    expect(html).toContain('>Posts<')
    expect(html).toContain('Posts: 2')
    expect(html).toContain('Hook 1')
    expect(html).toContain('Hair care')
    expect(html).toContain('Another pillar')
    expect(html).toContain('Unscheduled')
    expect(html).toContain('data-status="draft"')
    expect(html).toMatch(/<option value="draft" selected="">/)
    expect(html).toContain('Clear filters')
  })

  it('offers the active strategy\'s pillars as a filter', () => {
    const html = render('/content/posts', NO_FILTERS, { data: [card(1)], meta: { page: 1, pages: 1, total: 1 } })
    expect(html).toMatch(/<option value="7">Hair care<\/option>/)
    expect(html).not.toContain('Clear filters')
  })

  it('says when nothing matches the filters, and when the brand has no post yet', () => {
    const empty = { data: [], meta: { page: 1, pages: 0, total: 0 } }
    expect(render('/content/posts?platform=linkedin', { ...NO_FILTERS, platform: 'linkedin' }, empty)).toContain('No posts match these filters.')
    expect(render('/content/posts', NO_FILTERS, empty)).toContain('No posts yet.')
  })

  it('pages through the list 50 at a time, and says when a page holds nothing', () => {
    const html = render('/content/posts?page=2', { ...NO_FILTERS, page: 2 }, { data: [card(1)], meta: { page: 2, pages: 3, total: 120 } })
    expect(html).toContain('Page 2 of 3')
    const previous = html.match(/<button[^>]*aria-label="Previous page"[^>]*>/)?.[0] ?? ''
    expect(previous).not.toBe('')
    expect(previous).not.toMatch(/\bdisabled=""/)
    const beyond = render('/content/posts?page=9', { ...NO_FILTERS, page: 9 }, { data: [], meta: { page: 9, pages: 3, total: 120 } })
    expect(beyond).toContain('There is nothing on this page.')
    expect(beyond).toContain('First page')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R2C/vt.sh src/content/posts src/content/lib/links.test.ts src/content/lib/planCache.test.ts`
Expected: FAIL — `./postsFilters`, `./PostsPage` and `postHome`/`refreshLists` do not exist.

- [ ] **Step 3: The filters**

Create `frontend/src/content/posts/postsFilters.ts`:

```ts
import { isDateKey } from '../../workspace/lib/wallClock'
import type { Platform, PostFilters, PostStatus } from '../lib/types'

export const NO_FILTERS: PostFilters = { q: '', status: '', platform: '', pillar_id: null, from: '', to: '', unscheduled: false, page: 1 }

const whole = (value: string | null): number | null => {
  const n = Number(value)
  return value !== null && Number.isInteger(n) && n > 0 ? n : null
}

/**
 * The filters a Posts address holds. Anything it cannot use falls back to
 * "not filtered", so a shared or hand-edited link never makes the server
 * refuse the list: an end before the start is dropped, and "only posts with
 * no day" wins over a date range.
 */
export function readFilters(params: URLSearchParams, statuses: readonly PostStatus[], platforms: readonly Platform[]): PostFilters {
  const status = params.get('status') ?? ''
  const platform = params.get('platform') ?? ''
  const unscheduled = params.get('unscheduled') === '1'
  const day = (name: string): string => {
    const value = params.get(name) ?? ''
    return !unscheduled && isDateKey(value) ? value : ''
  }
  const from = day('from')
  let to = day('to')
  if (from !== '' && to !== '' && to < from) to = ''
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    status: (statuses as readonly string[]).includes(status) ? (status as PostStatus) : '',
    platform: (platforms as readonly string[]).includes(platform) ? (platform as Platform) : '',
    pillar_id: whole(params.get('pillar')),
    from: from as PostFilters['from'],
    to: to as PostFilters['to'],
    unscheduled,
    page: whole(params.get('page')) ?? 1,
  }
}

/** The address for these filters: only what holds something, the page only after the first. */
export function writeFilters(filters: PostFilters): URLSearchParams {
  const out = new URLSearchParams()
  if (filters.q !== '') out.set('q', filters.q)
  if (filters.status !== '') out.set('status', filters.status)
  if (filters.platform !== '') out.set('platform', filters.platform)
  if (filters.pillar_id !== null) out.set('pillar', String(filters.pillar_id))
  if (filters.unscheduled) out.set('unscheduled', '1')
  if (!filters.unscheduled && filters.from !== '') out.set('from', filters.from)
  if (!filters.unscheduled && filters.to !== '') out.set('to', filters.to)
  if (filters.page > 1) out.set('page', String(filters.page))
  return out
}

/** A change of filter starts again from the first page; a change of page keeps the filters. */
export const withFilter = (filters: PostFilters, change: Partial<PostFilters>): PostFilters => ({ ...filters, ...change, page: change.page ?? 1 })

/** Whether anything filters the list (the page does not). */
export const isFiltered = (f: PostFilters): boolean =>
  f.q.trim() !== '' || f.status !== '' || f.platform !== '' || f.pillar_id !== null || f.from !== '' || f.to !== '' || f.unscheduled
```

- [ ] **Step 4: The small shared pieces**

Create `frontend/src/content/ui/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react'

/** A page's title in the display face, with its actions (or a figure) at the end of the row. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="font-a-display text-2xl font-normal leading-tight text-a-text">{title}</h1>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
```

Create `frontend/src/content/lib/useActiveStrategy.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { useApi, useBrandId } from '../ContentProvider'
import type { StrategyDetail } from './types'

/** The brand's active strategy (its pillars name posts); the same reads the post panel makes, so they share the cache. */
export function useActiveStrategy(): { activeId: number | null; strategy: StrategyDetail | null } {
  const api = useApi()
  const brand = useBrandId()
  const list = useQuery({ queryKey: ['content', brand, 'strategies'], queryFn: api.strategies, staleTime: 300_000 })
  const activeId = list.data?.strategies.find(s => s.status === 'active')?.id ?? null
  const detail = useQuery({
    queryKey: ['content', brand, 'strategy', activeId], queryFn: () => api.strategy(activeId as number), enabled: activeId !== null, staleTime: 300_000,
  })
  return { activeId, strategy: detail.data?.strategy ?? null }
}
```

In `frontend/src/content/lib/links.ts` add:

```ts
/** Where a post's own link lands (spec §4.3): its week on the Plan, or, with no day, Posts among the others with no day. */
export function postHome(post: { scheduled_date: string | null }): string {
  return post.scheduled_date === null ? '/content/posts?unscheduled=1' : `/content?date=${post.scheduled_date}`
}
```

In `frontend/src/content/lib/planCache.ts` add:

```ts
/** After a post changes, the Plan's and the Posts page's reads of the brand are read again (an open page at once, the others when shown). */
export function refreshLists(queryClient: QueryClient, brand: number | null): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] }),
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'posts'] }),
  ])
}
```

Use it: in `PostPanel.tsx` replace every `queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] })` (in `show`, after a create, in `onDuplicated`, in `onDeleted`) with `refreshLists(queryClient, brand)`, and import it from `../lib/planCache`. In `PlanPage.tsx`, the mover's `refresh` becomes `refresh: () => refreshLists(queryClient, brand)`, and the page's own `refresh` (after Fill, Generate) becomes `const refresh = () => refreshLists(queryClient, brand)`.

In `frontend/src/content/panel/PostLink.tsx`, import `postHome` from `../lib/links` and replace the navigation line with:

```ts
    navigate(postHome(post), { replace: true })
```

(the effect's dependency on `boot.venue.today` goes; remove `useBoot` and `boot` if nothing else uses them, and update the doc comment's "(a post with no day opens on this week, its card in the tray)" to "(a post with no day opens on Posts, among the others with no day)").

- [ ] **Step 5: The row and the page**

Create `frontend/src/content/posts/PostRow.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import { cardLine } from '../lib/postText'
import type { PostCard } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusPill } from '../ui/StatusDot'

/** One post on the Posts page: its platform, its words, its day (or none) and pillar, its image and status; a click opens it. */
export function PostRow({ post, locale, pillar, selected, onOpen }: {
  post: PostCard
  locale: string
  /** The pillar's name, or null for a post without one. */
  pillar: string | null
  selected: boolean
  onOpen: (id: number) => void
}) {
  const { t } = useTranslation()
  const text = cardLine(post) || t('content.plan.untitled', 'Untitled post')
  const day = post.scheduled_date
    ? formatDate(post.scheduled_date, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + (post.scheduled_time ? ` · ${post.scheduled_time}` : '')
    : t('content.common.unscheduled', 'Unscheduled')
  return (
    <button type="button" data-post-row={post.id} aria-current={selected ? 'true' : undefined} onClick={() => onOpen(post.id)}
      className={`flex w-full items-center gap-3 border-b border-a-border px-4 py-3 text-left last:border-b-0 hover:bg-a-surface-2 ${selected ? 'bg-a-surface-2' : ''}`}>
      <PlatformMark platform={post.platform} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-a-text">{text}</span>
        <span className="block truncate text-xs text-a-text-2">{pillar ? `${day} · ${pillar}` : day}</span>
      </span>
      {post.image_url && <img src={post.image_url} alt="" loading="lazy" draggable={false} className="hidden h-10 w-10 shrink-0 rounded-md object-cover sm:block" />}
      <StatusPill status={post.status} />
    </button>
  )
}
```

Create `frontend/src/content/posts/PostsPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { DateKey, Platform, PostFilters, PostStatus } from '../lib/types'
import { useActiveStrategy } from '../lib/useActiveStrategy'
import { usePanel } from '../panel/PanelProvider'
import { PageHeader } from '../ui/PageHeader'
import { PostRow } from './PostRow'
import { NO_FILTERS, isFiltered, readFilters, withFilter, writeFilters } from './postsFilters'

const INPUT = 'rounded-lg border border-a-border bg-a-surface px-2.5 py-1.5 text-sm text-a-text disabled:opacity-60'

/**
 * Posts (spec §4.4): every post of the brand, newest scheduled first and the
 * ones with no day last, 50 a page. The search and the filters live in the
 * address, so a filtered list can be shared and Back undoes a filter. A row
 * opens the post panel. Archived posts show only when their status is chosen.
 */
export function PostsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const panel = usePanel()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readFilters(params, boot.statuses, boot.platforms), [params, boot.statuses, boot.platforms])
  const apply = (next: PostFilters) => setParams(writeFilters(next), { replace: true })
  const change = (part: Partial<PostFilters>) => apply(withFilter(filters, part))

  // The search box shows each letter at once; the list is asked once typing pauses. Back or a link brings the address's words.
  const [typed, setTyped] = useState(filters.q)
  const [seen, setSeen] = useState(filters.q)
  if (filters.q !== seen) {
    setSeen(filters.q)
    setTyped(filters.q)
  }
  useEffect(() => {
    if (typed === filters.q) return
    const timer = window.setTimeout(() => setParams(writeFilters(withFilter(filters, { q: typed })), { replace: true }), 300)
    return () => window.clearTimeout(timer)
  }, [typed, filters, setParams])

  const query = useQuery({ queryKey: ['content', brand, 'posts', filters], queryFn: () => api.posts(filters), placeholderData: keepPreviousData })
  const { strategy } = useActiveStrategy()
  const pillars = strategy?.pillars ?? []
  const pillarName = (id: number | null): string | null =>
    id === null ? null : (pillars.find(p => p.id === id)?.name ?? t('content.posts.other_pillar', 'Another pillar'))
  const selectedId = panel.target?.kind === 'post' ? panel.target.id : null
  const page = query.data
  const filtered = isFiltered(filters)
  const clear = () => { setTyped(''); apply(NO_FILTERS) }
  const [failureKey, failureText] = errorKey('posts', failureOf(query.error).code)

  return (
    <div className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.posts.title', 'Posts')}>
        {page && <span className="text-sm text-a-text-2">{t('content.posts.found', 'Posts: {{count}}', { count: page.meta.total })}</span>}
      </PageHeader>

      <div role="search" className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">{t('content.posts.search', 'Search posts')}</span>
          <Search size={15} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-a-text-2" />
          <input type="search" value={typed} maxLength={100} onChange={(e) => setTyped(e.target.value)}
            placeholder={t('content.posts.search', 'Search posts')} className={`${INPUT} w-full pl-8`} />
        </label>
        <select aria-label={t('content.posts.status', 'Status')} value={filters.status} className={INPUT}
          onChange={(e) => change({ status: e.target.value as PostStatus | '' })}>
          <option value="">{t('content.posts.all_statuses', 'All statuses')}</option>
          {boot.statuses.map(s => <option key={s} value={s}>{t(`content.status.${s}`, s)}</option>)}
        </select>
        <select aria-label={t('content.posts.platform', 'Platform')} value={filters.platform} className={INPUT}
          onChange={(e) => change({ platform: e.target.value as Platform | '' })}>
          <option value="">{t('content.posts.all_platforms', 'All platforms')}</option>
          {boot.platforms.map(p => <option key={p} value={p}>{t(`content.platform.${p}`, p)}</option>)}
        </select>
        {pillars.length > 0 && (
          <select aria-label={t('content.posts.pillar', 'Pillar')} value={filters.pillar_id ?? ''} className={INPUT}
            onChange={(e) => change({ pillar_id: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">{t('content.posts.all_pillars', 'All pillars')}</option>
            {pillars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-a-text-2">
          {t('content.posts.from', 'From')}
          <input type="date" value={filters.from} max={filters.to || undefined} disabled={filters.unscheduled} className={INPUT}
            onChange={(e) => {
              const from = e.target.value as DateKey | ''
              change({ from, ...(filters.to !== '' && from !== '' && from > filters.to ? { to: '' as const } : {}) })
            }} />
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-a-text-2">
          {t('content.posts.to', 'To')}
          <input type="date" value={filters.to} min={filters.from || undefined} disabled={filters.unscheduled} className={INPUT}
            onChange={(e) => change({ to: e.target.value as DateKey | '' })} />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-a-text">
          <input type="checkbox" checked={filters.unscheduled} onChange={(e) => change({ unscheduled: e.target.checked, from: '', to: '' })} />
          {t('content.posts.unscheduled_only', 'Only posts with no day')}
        </label>
        {filtered && <Button variant="ghost" size="sm" onClick={clear}>{t('content.posts.clear', 'Clear filters')}</Button>}
      </div>

      {query.isError && !page && (
        <div className="space-y-3">
          <Notice tone="danger">{t(failureKey, failureText)}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {query.isLoading && (
        <div role="status" aria-label={t('content.common.loading', 'Loading…')} className="space-y-2">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}
        </div>
      )}
      {page && page.data.length === 0 && (
        <div className="space-y-3 rounded-xl border border-a-border bg-a-surface p-6 text-sm text-a-text-2">
          {filters.page > 1
            ? <p>{t('content.posts.no_page', 'There is nothing on this page.')}</p>
            : <p>{filtered ? t('content.posts.no_match', 'No posts match these filters.') : t('content.posts.empty', 'No posts yet. Write one on the Plan, or with New post.')}</p>}
          {filters.page > 1 && <Button variant="secondary" size="sm" onClick={() => change({ page: 1 })}>{t('content.posts.first', 'First page')}</Button>}
          {filters.page === 1 && filtered && <Button variant="secondary" size="sm" onClick={clear}>{t('content.posts.clear', 'Clear filters')}</Button>}
        </div>
      )}
      {page && page.data.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-a-border bg-a-surface">
          {page.data.map(post => (
            <PostRow key={post.id} post={post} locale={locale} pillar={pillarName(post.pillar_id)} selected={selectedId === post.id}
              onOpen={(id) => { panel.open(id) }} />
          ))}
        </div>
      )}
      {page && page.meta.pages > 1 && page.data.length > 0 && (
        <nav aria-label={t('content.posts.pages', 'Pages')} className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={filters.page <= 1} aria-label={t('content.posts.previous', 'Previous page')}
            onClick={() => change({ page: filters.page - 1 })}><ChevronLeft size={16} aria-hidden /></Button>
          <span className="text-sm text-a-text-2">{t('content.posts.page', 'Page {{page}} of {{pages}}', { page: page.meta.page, pages: page.meta.pages })}</span>
          <Button variant="secondary" size="sm" disabled={filters.page >= page.meta.pages} aria-label={t('content.posts.next', 'Next page')}
            onClick={() => change({ page: filters.page + 1 })}><ChevronRight size={16} aria-hidden /></Button>
        </nav>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Route and rail**

In `ContentApp.tsx`: import `PostsPage` from `./posts/PostsPage` and add, before the `posts/:id` route:

```tsx
            <Route path="posts" element={<PostsPage />} />
```

In `ContentShell.tsx`: import `FileText` from `lucide-react` and make `nav`:

```tsx
  const nav: WorkspaceNavItem[] = [
    { to: '/content', end: true, icon: CalendarDays, label: t('content.nav.plan', 'Plan') },
    { to: '/content/posts', end: false, icon: FileText, label: t('content.nav.posts', 'Posts') },
  ]
```

(Find's page jumps come from `nav`, so "Go to Posts" appears there with no other change. If `ContentShell.test.tsx` or `findItems.test.ts` pinned the one-item rail, update the expectation and write a `Ruling:` line.)

- [ ] **Step 7: The words**

In each bundle, `"nav"` gains `"posts"`, and the `"posts"` group (from Task 2) gains these keys before `"error"`:

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `nav.posts` | Posts | Посты | Beiträge | Publications | Publicaciones |
| `posts.title` | Posts | Посты | Beiträge | Publications | Publicaciones |
| `posts.search` | Search posts | Искать посты | Beiträge suchen | Rechercher des publications | Buscar publicaciones |
| `posts.status` | Status | Статус | Status | Statut | Estado |
| `posts.platform` | Platform | Платформа | Plattform | Plateforme | Plataforma |
| `posts.pillar` | Pillar | Рубрика | Säule | Pilier | Pilar |
| `posts.all_statuses` | All statuses | Все статусы | Alle Status | Tous les statuts | Todos los estados |
| `posts.all_platforms` | All platforms | Все платформы | Alle Plattformen | Toutes les plateformes | Todas las plataformas |
| `posts.all_pillars` | All pillars | Все рубрики | Alle Säulen | Tous les piliers | Todos los pilares |
| `posts.from` | From | С | Von | Du | Desde |
| `posts.to` | To | По | Bis | Au | Hasta |
| `posts.unscheduled_only` | Only posts with no day | Только посты без даты | Nur Beiträge ohne Datum | Seulement les publications sans date | Solo publicaciones sin fecha |
| `posts.clear` | Clear filters | Сбросить фильтры | Filter zurücksetzen | Effacer les filtres | Quitar filtros |
| `posts.found` | Posts: {{count}} | Постов: {{count}} | Beiträge: {{count}} | Publications : {{count}} | Publicaciones: {{count}} |
| `posts.page` | Page {{page}} of {{pages}} | Страница {{page}} из {{pages}} | Seite {{page}} von {{pages}} | Page {{page}} sur {{pages}} | Página {{page}} de {{pages}} |
| `posts.pages` | Pages | Страницы | Seiten | Pages | Páginas |
| `posts.previous` | Previous page | Предыдущая страница | Vorherige Seite | Page précédente | Página anterior |
| `posts.next` | Next page | Следующая страница | Nächste Seite | Page suivante | Página siguiente |
| `posts.first` | First page | Первая страница | Erste Seite | Première page | Primera página |
| `posts.empty` | No posts yet. Write one on the Plan, or with New post. | Постов пока нет. Напишите первый в плане или кнопкой «Новый пост». | Noch keine Beiträge. Schreiben Sie einen im Plan oder mit „Neuer Beitrag“. | Aucune publication pour l’instant. Écrivez-en une dans le plan ou avec « Nouvelle publication ». | Aún no hay publicaciones. Escribe una en el plan o con «Nueva publicación». |
| `posts.no_match` | No posts match these filters. | Нет постов под эти фильтры. | Keine Beiträge passen zu diesen Filtern. | Aucune publication ne correspond à ces filtres. | Ninguna publicación coincide con estos filtros. |
| `posts.no_page` | There is nothing on this page. | На этой странице ничего нет. | Auf dieser Seite ist nichts. | Il n’y a rien sur cette page. | No hay nada en esta página. |
| `posts.other_pillar` | Another pillar | Другая рубрика | Eine andere Säule | Un autre pilier | Otro pilar |

- [ ] **Step 8: Run the tests, the types and the lint**

Run: `$R2C/vt.sh src/content` → all pass.
Run: `cd frontend && npx tsc -b` → clean. Run: `cd frontend && npx eslint src/content src/workspace src/App.tsx` → only the baseline error.

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: Posts — every post of the brand, searched and filtered, 50 a page

Filters live in the address (bad values fall back to none), a row opens the
post panel, an unscheduled post's link opens here, and a saved post refreshes
both the Plan and this list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Strategy — reading it

**Files:**
- Create: `frontend/src/content/strategy/strategyMath.ts`, `frontend/src/content/strategy/StrategyPage.tsx`, `frontend/src/content/strategy/StrategyDocument.tsx`, `frontend/src/content/strategy/PillarBalance.tsx`
- Modify: `frontend/src/content/ContentApp.tsx` (route `strategy`), `frontend/src/content/ContentShell.tsx` (nav item)
- Test: `frontend/src/content/strategy/strategyMath.test.ts`, `frontend/src/content/strategy/strategyPage.test.tsx`
- Words: `content.nav.strategy`, `content.strategy.*` (page words) in all five bundles

**Interfaces:**
- Consumes: `StrategySummary`, `StrategyDetail`, `StrategyOutput`, `PillarBalance`, `contentApi.strategies/strategy`, `optionText`, `RHYTHM_DAYS` (Task 2); `PageHeader` (Task 3); `PlatformMark`, `formatDate`, `addDays`.
- Produces: `pickStrategy(list)`, `balanceRows(balance)`, `strings(value)`; `StrategyPage` (Task 5 adds the managers' actions into its header and its empty state through the `actions` slot described there); `StrategyStatus({ status })`; route `/content/strategy` (`?id=` shows a past strategy).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/strategy/strategyMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { StrategySummary } from '../lib/types'
import { balanceRows, pickStrategy, strings } from './strategyMath'

const s = (id: number, status: StrategySummary['status']): StrategySummary => ({ id, title: `S${id}`, summary: null, status, created_at: null })

describe('pickStrategy', () => {
  it('opens on the active strategy, else the one being made, else the newest', () => {
    expect(pickStrategy([s(5, 'generating'), s(4, 'active'), s(3, 'superseded')])?.id).toBe(4)
    expect(pickStrategy([s(5, 'failed'), s(4, 'generating')])?.id).toBe(4)
    expect(pickStrategy([s(5, 'failed'), s(3, 'archived')])?.id).toBe(5)
    expect(pickStrategy([])).toBeNull()
  })
})

describe('balanceRows', () => {
  it('sets each pillar\'s share of this month\'s posts against its share of the target weights, in whole percent', () => {
    const rows = balanceRows({ from: '2026-10-01', to: '2026-10-31', pillars: [
      { id: 1, name: 'Hair care', target_weight: 50, posts: 2 },
      { id: 2, name: 'Colour', target_weight: 30, posts: 2 },
      { id: 3, name: 'Team', target_weight: 20, posts: 0 },
    ] })
    expect(rows.map(r => [r.name, r.actual, r.target])).toEqual([['Hair care', 50, 50], ['Colour', 50, 30], ['Team', 0, 20]])
  })

  it('reads 0 % where there is nothing to share: no posts yet, or no weights set', () => {
    const rows = balanceRows({ from: '2026-10-01', to: '2026-10-31', pillars: [{ id: 1, name: 'A', target_weight: null, posts: 0 }] })
    expect(rows[0]).toMatchObject({ actual: 0, target: 0, posts: 0 })
  })
})

describe('strings', () => {
  it('reads what the AI wrote as a list of lines, whatever shape it came in', () => {
    expect(strings(['a', ' ', 'b', 3])).toEqual(['a', 'b'])
    expect(strings('one line')).toEqual(['one line'])
    expect(strings(null)).toEqual([])
    expect(strings({ a: 1 })).toEqual([])
  })
})
```

Create `frontend/src/content/strategy/strategyPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, StrategyDetail, StrategySummary } from '../lib/types'
import { StrategyPage } from './StrategyPage'

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

const bootFor = (canManage: boolean) => ({
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' }, brands: [], accent: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Sam', role: canManage ? 'manager' : 'staff', can_manage: canManage }, profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['draft'], rewrites: [],
}) as unknown as Bootstrap

const summary = (id: number, status: StrategySummary['status'], title: string): StrategySummary => ({ id, title, summary: 'For busy clients', status, created_at: '2026-10-01T09:00:00.000000Z' })
const detail = (base: StrategySummary, more: Partial<StrategyDetail> = {}): StrategyDetail => ({
  ...base, ai_output: null, pillars: [], balance: null, ...more,
})

function render(url: string, list: StrategySummary[], details: StrategyDetail[], canManage = false) {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'strategies'], { strategies: list })
  for (const d of details) client.setQueryData(['content', 3, 'strategy', d.id], { strategy: d })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <StrategyPage />
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const active = summary(2, 'active', 'Autumn plan')
const older = summary(1, 'superseded', 'Summer plan')
const output = {
  title: 'Autumn plan',
  positioning_narrative: { old_way: 'Quick cuts', new_way: 'Hair health first', beliefs: ['Healthy hair lasts'], key_messages: ['Care, not speed'] },
  content_pillars: [{ name: 'Hair care', purpose: 'Build trust', frequency_weight: 40, example_topics: ['Scalp health'] }],
  content_mix: { education: 40, social_proof: 60 },
  weekly_rhythm: { monday: { role: 'proof', description: 'A before and after' } },
  platform_strategy: { instagram: { role: 'Show the work', formats: ['Reels'] } },
  risks: ['Too few photos'],
  next_actions: ['Book a photo shoot'],
}

describe('StrategyPage', () => {
  it('opens on the active strategy and reads it as a document: positioning, pillars, mix, rhythm, playbooks, risks, next actions', () => {
    const html = render('/content/strategy', [active, older], [detail(active, { ai_output: output })])
    expect(html).toContain('>Strategy<')
    expect(html).toContain('Autumn plan')
    expect(html).toContain('>Active<')
    expect(html).toContain('Hair health first')
    expect(html).toContain('Hair care')
    expect(html).toContain('Scalp health')
    expect(html).toContain('Education')
    expect(html).toContain('Proof, a case')
    expect(html).toContain('Show the work')
    expect(html).toContain('Too few photos')
    expect(html).toContain('Book a photo shoot')
  })

  it('shows a past strategy the address names', () => {
    const html = render('/content/strategy?id=1', [active, older], [detail(older, { ai_output: { title: 'Summer plan' } })])
    expect(html).toContain('Summer plan')
    expect(html).toContain('>Replaced<')
  })

  it('sets this month\'s posts per pillar against the target', () => {
    const balance = { from: '2026-10-01', to: '2026-10-31', pillars: [
      { id: 7, name: 'Hair care', target_weight: 60, posts: 1 }, { id: 8, name: 'Colour', target_weight: 40, posts: 3 },
    ] } as const
    const html = render('/content/strategy', [active], [detail(active, { balance: { ...balance, pillars: [...balance.pillars] } })])
    expect(html).toContain('Pillar balance this month')
    expect(html).toContain('3 posts · 75 % of posts · target 40 %')
  })

  it('says there is no strategy yet: to staff that the manager makes it, to managers what it gives', () => {
    expect(render('/content/strategy', [], [], false)).toContain('Your manager has not made a strategy yet.')
    expect(render('/content/strategy', [], [], true)).toContain('A strategy gives the AI its pillars, its content mix and its weekly rhythm.')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R2C/vt.sh src/content/strategy`
Expected: FAIL — `./strategyMath` and `./StrategyPage` do not exist.

- [ ] **Step 3: The maths**

Create `frontend/src/content/strategy/strategyMath.ts`:

```ts
import type { PillarBalance, StrategySummary } from '../lib/types'

/** The strategy the page opens on: the active one, else the one being made, else the newest (the list is newest first). */
export function pickStrategy(list: readonly StrategySummary[]): StrategySummary | null {
  return list.find(s => s.status === 'active') ?? list.find(s => s.status === 'generating') ?? list[0] ?? null
}

export interface BalanceRow { id: number; name: string; posts: number; actual: number; target: number }

/** Each pillar's share of this month's posts against its share of the target weights, in whole percent. */
export function balanceRows(balance: PillarBalance): BalanceRow[] {
  const posts = balance.pillars.reduce((sum, p) => sum + p.posts, 0)
  const weights = balance.pillars.reduce((sum, p) => sum + (p.target_weight ?? 0), 0)
  return balance.pillars.map(p => ({
    id: p.id,
    name: p.name,
    posts: p.posts,
    actual: posts > 0 ? Math.round((p.posts / posts) * 100) : 0,
    target: weights > 0 ? Math.round(((p.target_weight ?? 0) / weights) * 100) : 0,
  }))
}

/** What the AI wrote, as a list of non-empty lines: a list of strings, one string, or nothing usable. */
export function strings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value]
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}
```

- [ ] **Step 4: The pieces**

Create `frontend/src/content/strategy/PillarBalance.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { PillarBalance as Balance } from '../lib/types'
import { balanceRows } from './strategyMath'

/** This month's posts per pillar against the pillars' target weights (spec §4.5; the old Dashboard's balance). */
export function PillarBalance({ balance }: { balance: Balance }) {
  const { t } = useTranslation()
  const rows = balanceRows(balance)
  const any = rows.some(r => r.posts > 0)
  return (
    <section aria-labelledby="content-balance" className="space-y-3 rounded-xl border border-a-border bg-a-surface p-4">
      <h2 id="content-balance" className="font-a-display text-lg font-normal text-a-text">{t('content.strategy.balance', 'Pillar balance this month')}</h2>
      {!any && <p className="text-sm text-a-text-2">{t('content.strategy.balance_empty', 'No post of this month has a pillar yet.')}</p>}
      <ul className="space-y-3">
        {rows.map(row => (
          <li key={row.id} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-a-text">{row.name}</span>
              <span className="text-xs text-a-text-2">
                {t('content.strategy.balance_line', '{{posts}} posts · {{actual}} % of posts · target {{target}} %', row)}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-a-surface-2" aria-hidden>
              <div className="h-2 rounded-full bg-a-accent" style={{ width: `${row.actual}%` }} />
              <div className="absolute -top-1 h-4 w-0.5 rounded bg-a-text" style={{ left: `${row.target}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

Create `frontend/src/content/strategy/StrategyDocument.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, formatDate } from '../../workspace/lib/wallClock'
import { optionText, RHYTHM_DAYS } from '../lib/options'
import type { Platform, StrategyOutput, StrategyPillar } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { strings } from './strategyMath'

/** A Monday: the rhythm's days are named from it in the reader's language. */
const A_MONDAY = '2026-10-12'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-a-border bg-a-surface p-4">
      <h2 className="font-a-display text-lg font-normal text-a-text">{title}</h2>
      {children}
    </section>
  )
}

function Lines({ label, items }: { label?: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      {label && <p className="text-xs font-medium text-a-text-2">{label}</p>}
      <ul className="list-disc space-y-1 pl-5 text-sm text-a-text">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    </div>
  )
}

function Text({ label, value }: { label?: string; value: unknown }) {
  if (typeof value !== 'string' || value.trim() === '') return null
  return (
    <div className="space-y-0.5">
      {label && <p className="text-xs font-medium text-a-text-2">{label}</p>}
      <p className="whitespace-pre-wrap text-sm text-a-text">{value}</p>
    </div>
  )
}

/**
 * A strategy read as a document (spec §4.5): what the AI wrote, part by part,
 * in the words it wrote them (the brand's language); the headings are the
 * portal's. Any part an older strategy lacks is left out.
 */
export function StrategyDocument({ output, pillars, platforms, locale }: {
  output: StrategyOutput
  /** The strategy's pillars as saved, for a strategy whose text lists none. */
  pillars: StrategyPillar[]
  platforms: readonly Platform[]
  locale: string
}) {
  const { t } = useTranslation()
  const w = (key: string, english: string) => t(`content.strategy.${key}`, english)
  const positioning = output.positioning_narrative
  const written = (output.content_pillars ?? []).filter(p => typeof p?.name === 'string' && p.name.trim() !== '')
  const mix = Object.entries(output.content_mix ?? {}).filter(([, pct]) => typeof pct === 'number' && pct > 0)
  const rhythm = output.weekly_rhythm ?? {}
  const playbooks = Object.entries(output.platform_strategy ?? {})
  const lists: [string, string, string[]][] = [
    ['risks', 'Risks', strings(output.risks)],
    ['opportunities', 'Opportunities', strings(output.opportunities)],
    ['missing', 'Missing information', strings(output.missing_information)],
    ['next', 'Next actions', strings(output.next_actions)],
  ]

  return (
    <div className="space-y-4">
      {(output.brand_summary || strings(output.assumptions).length > 0) && (
        <Block title={w('summary', 'Brand summary')}>
          <Text value={output.brand_summary} />
          <Lines label={w('assumptions', 'What the AI assumed')} items={strings(output.assumptions)} />
        </Block>
      )}

      {positioning && (
        <Block title={w('positioning', 'Positioning')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label={w('old_way', 'The old way')} value={positioning.old_way} />
            <Text label={w('new_way', 'The new way')} value={positioning.new_way} />
          </div>
          <Lines label={w('beliefs', 'Beliefs')} items={strings(positioning.beliefs)} />
          <Lines label={w('key_messages', 'Key messages')} items={strings(positioning.key_messages)} />
        </Block>
      )}

      {(output.audience_map ?? []).length > 0 && (
        <Block title={w('audiences', 'Audience map')}>
          <div className="grid gap-3 md:grid-cols-2">
            {(output.audience_map ?? []).map((a, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-a-border p-3">
                <p className="text-sm font-semibold text-a-text">{a.name}</p>
                <Lines label={w('pains', 'Pains')} items={strings(a.pains)} />
                <Lines label={w('desires', 'Desires')} items={strings(a.desires)} />
                <Lines label={w('objections', 'Objections')} items={strings(a.objections)} />
                <Lines label={w('triggers', 'Emotional triggers')} items={strings(a.emotional_triggers)} />
                <Lines label={w('engages', 'Content they engage with')} items={strings(a.content_they_engage_with)} />
              </div>
            ))}
          </div>
        </Block>
      )}

      {(written.length > 0 || pillars.length > 0) && (
        <Block title={w('pillars', 'Pillars')}>
          <div className="grid gap-3 md:grid-cols-2">
            {written.length > 0
              ? written.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-a-border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-a-text">{p.name}</p>
                      {typeof p.frequency_weight === 'number' && (
                        <span className="text-xs text-a-text-2">{t('content.strategy.weight', 'Weight {{weight}} %', { weight: p.frequency_weight })}</span>
                      )}
                    </div>
                    <Text value={p.description} />
                    <Text label={w('purpose', 'Purpose')} value={p.purpose} />
                    <Lines label={w('topics', 'Example topics')} items={strings(p.example_topics)} />
                    <Lines label={w('ctas', 'Calls to action')} items={strings(p.cta_examples)} />
                    <Text label={w('visual', 'Visual direction')} value={p.visual_direction} />
                  </div>
                ))
              : pillars.map(p => (
                  <div key={p.id} className="space-y-2 rounded-lg border border-a-border p-3">
                    <p className="text-sm font-semibold text-a-text">{p.name}</p>
                    <Text value={p.description} />
                    <Text label={w('purpose', 'Purpose')} value={p.purpose} />
                  </div>
                ))}
          </div>
        </Block>
      )}

      {mix.length > 0 && (
        <Block title={w('mix', 'Content mix')}>
          <ul className="space-y-2">
            {mix.map(([category, pct]) => (
              <li key={category} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-a-text">{optionText(t, 'mix', category)}</span>
                  <span className="text-a-text-2">{pct} %</span>
                </div>
                <div className="h-1.5 rounded-full bg-a-surface-2" aria-hidden>
                  <div className="h-1.5 rounded-full bg-a-accent" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {Object.keys(rhythm).length > 0 && (
        <Block title={w('rhythm', 'Weekly rhythm')}>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {RHYTHM_DAYS.map((day, i) => {
              const plan = rhythm[day]
              return (
                <li key={day} className="space-y-1 rounded-lg border border-a-border p-2.5">
                  <p className="font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{formatDate(addDays(A_MONDAY, i), locale, { weekday: 'long' })}</p>
                  {plan?.role && <p className="text-sm font-medium text-a-text">{optionText(t, 'role', plan.role)}</p>}
                  <Text value={plan?.description} />
                </li>
              )
            })}
          </ol>
        </Block>
      )}

      {playbooks.length > 0 && (
        <Block title={w('platforms', 'Platform playbooks')}>
          <div className="grid gap-3 md:grid-cols-2">
            {playbooks.map(([platform, book]) => (
              <div key={platform} className="space-y-2 rounded-lg border border-a-border p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-a-text">
                  {(platforms as readonly string[]).includes(platform) && <PlatformMark platform={platform as Platform} size="sm" />}
                  {t(`content.platform.${platform}`, platform)}
                </p>
                <Text label={w('role', 'Role')} value={book?.role} />
                <Lines label={w('formats', 'Formats')} items={strings(book?.formats)} />
                <Text label={w('tone', 'Tone')} value={book?.tone} />
                <Text label={w('frequency', 'Frequency')} value={book?.frequency} />
                <Lines label={w('post_types', 'Post types')} items={strings(book?.post_types)} />
                <Text label={w('cta_style', 'Call-to-action style')} value={book?.cta_style} />
                <Lines label={w('mechanics', 'Engagement mechanics')} items={strings(book?.engagement_mechanics)} />
                <Text label={w('visual_style', 'Visual style')} value={book?.visual_style} />
              </div>
            ))}
          </div>
        </Block>
      )}

      {(output.engagement_strategy || output.conversion_strategy) && (
        <div className="grid gap-4 md:grid-cols-2">
          {output.engagement_strategy && (
            <Block title={w('engagement', 'Engagement')}>
              <Lines label={w('goals', 'Goals')} items={strings(output.engagement_strategy.primary_goals)} />
              <Lines items={(output.engagement_strategy.mechanics ?? []).map(m => [m?.goal, m?.tactic].filter(Boolean).join(': ')).filter(Boolean)} />
            </Block>
          )}
          {output.conversion_strategy && (
            <Block title={w('conversion', 'Conversion')}>
              <Text label={w('approach', 'Approach')} value={output.conversion_strategy.approach} />
              <Lines label={w('soft_ctas', 'Soft calls to action')} items={strings(output.conversion_strategy.soft_cta_examples)} />
            </Block>
          )}
        </div>
      )}

      {output.visual_direction && <Block title={w('visual', 'Visual direction')}><Text value={output.visual_direction} /></Block>}

      {(strings(output.monthly_themes).length > 0 || (output.campaign_ideas ?? []).length > 0) && (
        <Block title={w('themes', 'Themes and campaigns')}>
          <Lines label={w('monthly', 'Monthly themes')} items={strings(output.monthly_themes)} />
          <Lines label={w('campaigns', 'Campaign ideas')}
            items={(output.campaign_ideas ?? []).map(c => [c?.name, c?.goal, c?.description].filter(Boolean).join(' — ')).filter(Boolean)} />
        </Block>
      )}

      {(output.example_posts ?? []).length > 0 && (
        <Block title={w('examples', 'Example posts')}>
          <ul className="space-y-2">
            {(output.example_posts ?? []).map((p, i) => (
              <li key={i} className="rounded-lg border border-a-border p-3 text-sm">
                <p className="font-medium text-a-text">{p?.hook}</p>
                {p?.summary && <p className="text-a-text-2">{p.summary}</p>}
                {p?.platform && <p className="mt-1 text-xs text-a-text-2">{t(`content.platform.${p.platform}`, p.platform)}</p>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {lists.some(([, , items]) => items.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {lists.filter(([, , items]) => items.length > 0).map(([key, english, items]) => (
            <Block key={key} title={w(key, english)}><Lines items={items} /></Block>
          ))}
        </div>
      )}
    </div>
  )
}
```

Create `frontend/src/content/strategy/StrategyPage.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import type { StrategySummary } from '../lib/types'
import { PageHeader } from '../ui/PageHeader'
import { PillarBalance } from './PillarBalance'
import { StrategyDocument } from './StrategyDocument'
import { pickStrategy } from './strategyMath'

const STATUS_TEXT: Record<StrategySummary['status'], string> = {
  generating: 'Being made', active: 'Active', superseded: 'Replaced', archived: 'Archived', failed: 'Failed',
}

/** A strategy's status as a small pill; the active one in the accent. */
export function StrategyStatus({ status }: { status: StrategySummary['status'] }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${status === 'active' ? 'border-a-accent-text text-a-accent-text' : 'border-a-border text-a-text-2'}`}>
      {t(`content.strategy.status.${status}`, STATUS_TEXT[status])}
    </span>
  )
}

/**
 * Strategy (spec §4.5): the brand's active strategy read as a document, with
 * this month's pillar balance; `?id=` shows a past one. Everyone reads it;
 * the managers' actions (make a new one, past strategies, make active,
 * archive) arrive in `actions` (Task 5).
 */
export function StrategyPage({ actions }: { actions?: (shown: StrategySummary | null) => ReactNode } = {}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const [params] = useSearchParams()
  const list = useQuery({ queryKey: ['content', brand, 'strategies'], queryFn: api.strategies, staleTime: 300_000 })
  const strategies = list.data?.strategies ?? []
  const asked = Number(params.get('id'))
  const shown = strategies.find(s => s.id === asked) ?? pickStrategy(strategies)
  const finished = shown !== null && shown.status !== 'generating' && shown.status !== 'failed'
  const detail = useQuery({
    queryKey: ['content', brand, 'strategy', shown?.id ?? null], queryFn: () => api.strategy((shown as StrategySummary).id),
    enabled: finished, staleTime: 300_000,
  })
  const strategy = detail.data?.strategy ?? null
  const title = strategy?.ai_output?.title || shown?.title || t('content.strategy.untitled', 'Untitled strategy')

  return (
    <div className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.strategy.title', 'Strategy')}>{actions?.(shown)}</PageHeader>

      {list.isLoading && <div role="status" aria-label={t('content.common.loading', 'Loading…')} className="space-y-2"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>}

      {list.data && strategies.length === 0 && (
        <Notice tone="info">
          {boot.staff.can_manage
            ? t('content.strategy.none_manager', 'This brand has no strategy yet. A strategy gives the AI its pillars, its content mix and its weekly rhythm.')
            : t('content.strategy.none_staff', 'Your manager has not made a strategy yet.')}
        </Notice>
      )}

      {shown && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-a-display text-xl text-a-text">{title}</p>
            <StrategyStatus status={shown.status} />
          </div>
          {shown.created_at && (
            <p className="text-xs text-a-text-2">
              {t('content.strategy.made_on', 'Made on {{date}}', { date: formatDay(shown.created_at, locale) })}
            </p>
          )}
          {shown.status === 'failed' && <Notice tone="danger">{t('content.strategy.failed', 'This strategy could not be made.')}</Notice>}
        </div>
      )}

      {finished && detail.isLoading && <Skeleton className="h-64" />}
      {strategy?.balance && <PillarBalance balance={strategy.balance} />}
      {strategy && (strategy.ai_output || strategy.pillars.length > 0) && (
        <StrategyDocument output={strategy.ai_output ?? {}} pillars={strategy.pillars} platforms={boot.platforms} locale={locale} />
      )}
    </div>
  )
}

/** A server time stamp as a day in the reader's language (the day it was made is all the page needs). */
function formatDay(iso: string, locale: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}
```

- [ ] **Step 5: Route and rail**

In `ContentApp.tsx`: import `StrategyPage` (Task 5 replaces this import with its `StrategyScreen`) and add `<Route path="strategy" element={<StrategyPage />} />`.
In `ContentShell.tsx`: import `Compass` and add `{ to: '/content/strategy', end: false, icon: Compass, label: t('content.nav.strategy', 'Strategy') }` after Posts.

- [ ] **Step 6: The words**

`"nav"` gains `"strategy"`; the `"strategy"` group gains, before `"error"`, a `"status"` object and these keys:

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `nav.strategy` | Strategy | Стратегия | Strategie | Stratégie | Estrategia |
| `strategy.title` | Strategy | Стратегия | Strategie | Stratégie | Estrategia |
| `strategy.untitled` | Untitled strategy | Стратегия без названия | Strategie ohne Titel | Stratégie sans titre | Estrategia sin título |
| `strategy.made_on` | Made on {{date}} | Создана {{date}} | Erstellt am {{date}} | Créée le {{date}} | Creada el {{date}} |
| `strategy.failed` | This strategy could not be made. | Эту стратегию создать не удалось. | Diese Strategie konnte nicht erstellt werden. | Cette stratégie n’a pas pu être créée. | No se pudo crear esta estrategia. |
| `strategy.none_manager` | This brand has no strategy yet. A strategy gives the AI its pillars, its content mix and its weekly rhythm. | У бренда пока нет стратегии. Стратегия задаёт ИИ рубрики, контент-микс и недельный ритм. | Diese Marke hat noch keine Strategie. Eine Strategie gibt der KI ihre Säulen, ihren Content-Mix und ihren Wochenrhythmus. | Cette marque n’a pas encore de stratégie. Une stratégie donne à l’IA ses piliers, son mix de contenus et son rythme de la semaine. | Esta marca aún no tiene estrategia. Una estrategia da a la IA sus pilares, su mezcla de contenidos y su ritmo semanal. |
| `strategy.none_staff` | Your manager has not made a strategy yet. | Менеджер ещё не создал стратегию. | Ihr Manager hat noch keine Strategie erstellt. | Votre responsable n’a pas encore créé de stratégie. | Tu responsable aún no ha creado una estrategia. |
| `strategy.balance` | Pillar balance this month | Баланс рубрик в этом месяце | Säulen-Balance diesen Monat | Équilibre des piliers ce mois-ci | Equilibrio de pilares este mes |
| `strategy.balance_empty` | No post of this month has a pillar yet. | Ни у одного поста этого месяца пока нет рубрики. | Noch kein Beitrag dieses Monats hat eine Säule. | Aucune publication de ce mois n’a encore de pilier. | Ninguna publicación de este mes tiene pilar todavía. |
| `strategy.balance_line` | {{posts}} posts · {{actual}} % of posts · target {{target}} % | постов: {{posts}} · {{actual}} % постов · цель {{target}} % | {{posts}} Beiträge · {{actual}} % der Beiträge · Ziel {{target}} % | {{posts}} publications · {{actual}} % des publications · objectif {{target}} % | {{posts}} publicaciones · {{actual}} % de las publicaciones · objetivo {{target}} % |
| `strategy.summary` | Brand summary | О бренде | Über die Marke | La marque en bref | Resumen de la marca |
| `strategy.assumptions` | What the AI assumed | Что ИИ предположил | Was die KI angenommen hat | Ce que l’IA a supposé | Lo que la IA supuso |
| `strategy.positioning` | Positioning | Позиционирование | Positionierung | Positionnement | Posicionamiento |
| `strategy.old_way` | The old way | Как было | Der alte Weg | L’ancienne façon | La forma antigua |
| `strategy.new_way` | The new way | Как стало | Der neue Weg | La nouvelle façon | La forma nueva |
| `strategy.beliefs` | Beliefs | Убеждения | Überzeugungen | Convictions | Creencias |
| `strategy.key_messages` | Key messages | Ключевые сообщения | Kernbotschaften | Messages clés | Mensajes clave |
| `strategy.audiences` | Audience map | Карта аудитории | Zielgruppen-Karte | Carte des audiences | Mapa de audiencias |
| `strategy.pains` | Pains | Боли | Probleme | Difficultés | Problemas |
| `strategy.desires` | Desires | Желания | Wünsche | Désirs | Deseos |
| `strategy.objections` | Objections | Возражения | Einwände | Objections | Objeciones |
| `strategy.triggers` | Emotional triggers | Эмоциональные триггеры | Emotionale Auslöser | Déclencheurs émotionnels | Detonantes emocionales |
| `strategy.engages` | Content they engage with | Контент, на который они реагируют | Inhalte, auf die sie reagieren | Les contenus qui les font réagir | Contenido con el que interactúan |
| `strategy.pillars` | Pillars | Рубрики | Säulen | Piliers | Pilares |
| `strategy.weight` | Weight {{weight}} % | Вес {{weight}} % | Gewicht {{weight}} % | Poids {{weight}} % | Peso {{weight}} % |
| `strategy.purpose` | Purpose | Цель | Zweck | Objectif | Propósito |
| `strategy.topics` | Example topics | Примеры тем | Beispielthemen | Exemples de sujets | Temas de ejemplo |
| `strategy.ctas` | Calls to action | Призывы к действию | Handlungsaufrufe | Appels à l’action | Llamadas a la acción |
| `strategy.visual` | Visual direction | Визуальное направление | Bildsprache | Direction visuelle | Dirección visual |
| `strategy.mix` | Content mix | Контент-микс | Content-Mix | Mix de contenus | Mezcla de contenidos |
| `strategy.rhythm` | Weekly rhythm | Недельный ритм | Wochenrhythmus | Rythme de la semaine | Ritmo semanal |
| `strategy.platforms` | Platform playbooks | Сценарии для платформ | Plattform-Leitfäden | Guides par plateforme | Guías por plataforma |
| `strategy.role` | Role | Роль | Rolle | Rôle | Función |
| `strategy.formats` | Formats | Форматы | Formate | Formats | Formatos |
| `strategy.tone` | Tone | Тон | Ton | Ton | Tono |
| `strategy.frequency` | Frequency | Частота | Häufigkeit | Fréquence | Frecuencia |
| `strategy.post_types` | Post types | Типы постов | Beitragsarten | Types de publication | Tipos de publicación |
| `strategy.cta_style` | Call-to-action style | Стиль призыва | Stil der Handlungsaufrufe | Style des appels à l’action | Estilo de llamada a la acción |
| `strategy.mechanics` | Engagement mechanics | Механики вовлечения | Interaktions-Mechaniken | Mécaniques d’engagement | Mecánicas de interacción |
| `strategy.visual_style` | Visual style | Визуальный стиль | Bildstil | Style visuel | Estilo visual |
| `strategy.engagement` | Engagement | Вовлечение | Interaktion | Engagement | Interacción |
| `strategy.goals` | Goals | Цели | Ziele | Objectifs | Objetivos |
| `strategy.conversion` | Conversion | Конверсия | Conversion | Conversion | Conversión |
| `strategy.approach` | Approach | Подход | Ansatz | Approche | Enfoque |
| `strategy.soft_ctas` | Soft calls to action | Мягкие призывы | Sanfte Handlungsaufrufe | Appels à l’action doux | Llamadas a la acción suaves |
| `strategy.themes` | Themes and campaigns | Темы и кампании | Themen und Kampagnen | Thèmes et campagnes | Temas y campañas |
| `strategy.monthly` | Monthly themes | Темы месяцев | Monatsthemen | Thèmes du mois | Temas mensuales |
| `strategy.campaigns` | Campaign ideas | Идеи кампаний | Kampagnenideen | Idées de campagnes | Ideas de campañas |
| `strategy.examples` | Example posts | Примеры постов | Beispielbeiträge | Exemples de publications | Publicaciones de ejemplo |
| `strategy.risks` | Risks | Риски | Risiken | Risques | Riesgos |
| `strategy.opportunities` | Opportunities | Возможности | Chancen | Opportunités | Oportunidades |
| `strategy.missing` | Missing information | Чего не хватает | Fehlende Angaben | Informations manquantes | Información que falta |
| `strategy.next` | Next actions | Следующие шаги | Nächste Schritte | Prochaines étapes | Próximos pasos |
| `strategy.status.generating` | Being made | Создаётся | Wird erstellt | En cours de création | En preparación |
| `strategy.status.active` | Active | Активная | Aktiv | Active | Activa |
| `strategy.status.superseded` | Replaced | Заменена | Ersetzt | Remplacée | Sustituida |
| `strategy.status.archived` | Archived | В архиве | Archiviert | Archivée | Archivada |
| `strategy.status.failed` | Failed | Не удалась | Fehlgeschlagen | Échec | Fallida |

- [ ] **Step 7: Run the tests, the types and the lint**

Run: `$R2C/vt.sh src/content` → all pass. `cd frontend && npx tsc -b` → clean. Scoped eslint → only the baseline error.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: Strategy — the active strategy as a document, with this month's pillar balance

Positioning, audiences, pillars, mix, weekly rhythm, platform playbooks,
engagement and conversion, themes, example posts, risks and next actions,
as the AI wrote them; a past strategy by its address; and each pillar's
share of this month's posts against its target.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Strategy — making a new one, past ones, active, archived

**Files:**
- Create: `frontend/src/content/strategy/StrategyActions.tsx` (with `NewStrategyDialog`), `frontend/src/content/strategy/StrategyScreen.tsx`
- Modify: `frontend/src/content/strategy/strategyMath.ts` (`generationState`), `frontend/src/content/strategy/StrategyPage.tsx` (poll while a strategy is being made; the banner; `actions` gets the list and the generation), `frontend/src/content/ContentApp.tsx` (route element `StrategyScreen`)
- Test: `frontend/src/content/strategy/strategyMath.test.ts`, `frontend/src/content/strategy/strategyPage.test.tsx` (add)
- Words: `content.strategy.*` (actions) in all five bundles

**Interfaces:**
- Consumes: `contentApi.createStrategy/activateStrategy/archiveStrategy` (Task 2), `StrategyPage`, `StrategyStatus`, `pickStrategy` (Task 4), `Dialog` (Plan B), `errorKey('strategy', …)`.
- Produces: `generationState(list, now)`; `GENERATION_STUCK_MS`; `StrategyPage({ actions })` where `actions(shown, strategies, generation)`; `StrategyScreen` (managers get `StrategyActions`); `NewStrategyDialog({ onClose, onStarted })`.

The server's rules (Plan A): `POST strategies` answers 202 with the new row in `generating`, a queued job writes it (one to three minutes; the job may run up to 10 minutes), and on success the new strategy becomes active and the old active one `superseded`. A failure marks the row `failed`. A second request while a row is `generating` and younger than 15 minutes answers 409 `already_generating`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/content/strategy/strategyMath.test.ts` (import `generationState`, `GENERATION_STUCK_MS`):

```ts
describe('generationState', () => {
  const at = (iso: string) => Date.parse(iso)
  const made = (id: number, status: StrategySummary['status'], created_at: string): StrategySummary => ({ id, title: null, summary: null, status, created_at })

  it('is "none" when no strategy is being made (a failed one is over)', () => {
    expect(generationState([made(4, 'active', '2026-10-15T09:00:00Z'), made(5, 'failed', '2026-10-15T09:05:00Z')], at('2026-10-15T09:10:00Z')))
      .toEqual({ state: 'none' })
  })

  it('is "running" while one is being made, with the minutes since it started', () => {
    expect(generationState([made(6, 'generating', '2026-10-15T09:00:00Z')], at('2026-10-15T09:02:40Z'))).toEqual({ state: 'running', id: 6, minutes: 2 })
  })

  // The server lets a new one start after 15 minutes; the page stops waiting at the same moment.
  it('calls it stuck after 15 minutes, when the page stops waiting and a new one may start', () => {
    const start = at('2026-10-15T09:00:00Z')
    expect(generationState([made(6, 'generating', '2026-10-15T09:00:00Z')], start + GENERATION_STUCK_MS + 1000)).toEqual({ state: 'stuck', id: 6 })
  })
})
```

Add to `frontend/src/content/strategy/strategyPage.test.tsx` — change the `render` helper to render `<StrategyScreen />` (import it from `./StrategyScreen`) instead of `<StrategyPage />` (every Task 4 test still holds), let it take an optional `ai` status (`ai: { status: ai, percent: 10 }` in `bootFor`), and add:

```tsx
/** The opening tag of the button whose text holds `label` (its icon may come first). */
const buttonTag = (html: string, label: string): string =>
  html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}`, 's'))?.[0].match(/^<button[^>]*>/)?.[0] ?? ''

describe('StrategyScreen for managers', () => {
  it('offers a new strategy, the past ones, and, on a replaced one, Make active and Archive', () => {
    const html = render('/content/strategy?id=1', [active, older], [detail(older, { ai_output: { title: 'Summer plan' } })], true)
    expect(html).toContain('New strategy')
    expect(html).toContain('aria-label="Past strategies"')
    expect(html).toMatch(/<option value="2">Autumn plan/)
    expect(html).toContain('>Make active<')
    expect(html).toContain('>Archive<')
  })

  it('offers Archive but not Make active on the active strategy', () => {
    const html = render('/content/strategy', [active], [detail(active)], true)
    expect(html).toContain('>Archive<')
    expect(html).not.toContain('>Make active<')
  })

  it('shows staff none of it', () => {
    const html = render('/content/strategy?id=1', [active, older], [detail(older)], false)
    for (const word of ['New strategy', 'Past strategies', '>Make active<', '>Archive<']) expect(html).not.toContain(word)
  })

  it('tells everyone a new strategy is being made, and lets no one start another meanwhile', () => {
    const making = { ...summary(3, 'generating', 'Generating strategy…'), created_at: new Date().toISOString() }
    const manager = render('/content/strategy', [making, active], [detail(active)], true)
    expect(manager).toContain('A new strategy is being made. It usually takes one to three minutes.')
    expect(buttonTag(manager, 'New strategy')).toMatch(/\bdisabled=""/)
    expect(render('/content/strategy', [making, active], [detail(active)], false)).toContain('A new strategy is being made.')
  })

  it('keeps New strategy closed when this month\'s AI budget is used up', () => {
    const html = render('/content/strategy', [active], [detail(active)], true, 'over')
    expect(buttonTag(html, 'New strategy')).toMatch(/\bdisabled=""/)
    expect(buttonTag(render('/content/strategy', [active], [detail(active)], true), 'New strategy')).not.toMatch(/\bdisabled=""/)
  })
})

describe('NewStrategyDialog', () => {
  it('says what will happen, takes optional instructions, and starts it', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ContentContext.Provider value={{ data: bootFor(true), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <NewStrategyDialog onClose={() => {}} onStarted={() => {}} />
        </ContentContext.Provider>
      </QueryClientProvider>,
    )
    expect(html).toContain('Make a new strategy')
    expect(html).toContain('the current one stays among the past strategies')
    expect(html).toContain('<textarea')
    expect(html).toMatch(/<button[^>]*>Make strategy</)
  })
})
```

(Import `NewStrategyDialog` from `./StrategyActions`.)

- [ ] **Step 2: Run them to see them fail**

Run: `$R2C/vt.sh src/content/strategy`
Expected: FAIL — `generationState` is not exported; `./StrategyScreen` and `./StrategyActions` do not exist.

- [ ] **Step 3: The generation's state**

Add to `frontend/src/content/strategy/strategyMath.ts`:

```ts
/** After this long the server lets a new strategy start (StrategyController::GENERATING_MINUTES), and the page stops waiting. */
export const GENERATION_STUCK_MS = 15 * 60_000

export type Generation = { state: 'none' } | { state: 'running'; id: number; minutes: number } | { state: 'stuck'; id: number }

/**
 * Whether a strategy is being made, at `now` (the time the list was last
 * read, so rendering stays pure): running with its minutes, or stuck once
 * the server would let a new one start.
 */
export function generationState(list: readonly StrategySummary[], now: number): Generation {
  const making = list.find(s => s.status === 'generating')
  if (!making) return { state: 'none' }
  const started = making.created_at ? Date.parse(making.created_at) : NaN
  const elapsed = Number.isNaN(started) ? 0 : Math.max(0, now - started)
  if (elapsed > GENERATION_STUCK_MS) return { state: 'stuck', id: making.id }
  return { state: 'running', id: making.id, minutes: Math.floor(elapsed / 60_000) }
}
```

- [ ] **Step 4: The page polls and says so**

In `frontend/src/content/strategy/StrategyPage.tsx`:

1. Import `Loader2` from `lucide-react`, and `generationState, type Generation` from `./strategyMath`.
2. Change the `actions` prop type to `actions?: (shown: StrategySummary | null, strategies: StrategySummary[], generation: Generation) => ReactNode`, and the doc comment's last sentence to "the managers' actions arrive in `actions` (StrategyScreen)".
3. The list query reads again every 5 seconds while a strategy is being made:

```tsx
  const list = useQuery({
    queryKey: ['content', brand, 'strategies'], queryFn: api.strategies, staleTime: 300_000,
    // While a strategy is being made the list is read every 5 s; it stops once it is made, failed, or stuck.
    refetchInterval: (query) => (generationState(query.state.data?.strategies ?? [], query.state.dataUpdatedAt).state === 'running' ? 5_000 : false),
  })
```

4. After `const strategies = …`, add `const generation = generationState(strategies, list.dataUpdatedAt)`, pass it to `actions?.(shown, strategies, generation)`, and draw, right under the `PageHeader`:

```tsx
      {generation.state === 'running' && (
        <Notice tone="info">
          <span className="inline-flex items-center gap-2">
            <Loader2 size={14} aria-hidden className="animate-spin" />
            {t('content.strategy.running', 'A new strategy is being made. It usually takes one to three minutes.')}
            {generation.minutes > 0 && ` ${t('content.strategy.running_since', 'Started {{minutes}} min ago.', { minutes: generation.minutes })}`}
          </span>
        </Notice>
      )}
      {generation.state === 'stuck' && (
        <Notice tone="warning">
          {boot.staff.can_manage
            ? t('content.strategy.stuck_manager', 'The new strategy is taking far longer than it should and may have stopped. You can make a new one.')
            : t('content.strategy.stuck_staff', 'The new strategy is taking far longer than it should and may have stopped.')}
        </Notice>
      )}
```

5. `pickStrategy` would show the generating row when there is no active one; keep that (the page then shows its title and the "Being made" pill under the banner).

- [ ] **Step 5: The actions**

Create `frontend/src/content/strategy/StrategyActions.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Archive, CheckCircle2, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { StrategySummary } from '../lib/types'
import { Dialog } from '../ui/Dialog'
import type { Generation } from './strategyMath'

const STATUS_TEXT: Record<StrategySummary['status'], string> = {
  generating: 'Being made', active: 'Active', superseded: 'Replaced', archived: 'Archived', failed: 'Failed',
}

/** "Make a new strategy": what will happen, optional instructions, and the start (spec §4.5). */
export function NewStrategyDialog({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.createStrategy(instructions.trim() === '' ? null : instructions.trim())
      onStarted()
    } catch (e) {
      const [key, text] = errorKey('strategy', failureOf(e).code)
      setError(t(key, text))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('content.strategy.new_title', 'Make a new strategy')} onClose={onClose} busy={busy}>
      <div className="space-y-3">
        <p className="text-sm text-a-text-2">{t('content.strategy.new_intro', 'The AI reads the brand and writes a new strategy. It usually takes one to three minutes; you can leave this page meanwhile.')}</p>
        <p className="text-sm text-a-text-2">{t('content.strategy.new_replaces', 'When it is ready it becomes the active strategy; the current one stays among the past strategies.')}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.strategy.instructions', 'Instructions for the AI (optional)')}</span>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} rows={4}
            className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" />
        </label>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>{t('content.common.cancel', 'Cancel')}</Button>
          <Button onClick={() => { void start() }} loading={busy}>{t('content.strategy.make', 'Make strategy')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * The managers' strategy actions (spec §4.5): make a new one (not while one
 * is being made, nor with the month's AI budget used up), choose a past one
 * to read, make the shown one active, archive it.
 */
export function StrategyActions({ shown, strategies, generation }: { shown: StrategySummary | null; strategies: StrategySummary[]; generation: Generation }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const paused = boot.ai.status === 'over'

  const reread = async () => {
    await queryClient.invalidateQueries({ queryKey: ['content', brand, 'strategies'] })
    await queryClient.invalidateQueries({ queryKey: ['content', brand, 'strategy'] })
    void refreshLists(queryClient, brand) // pillar names on the Plan and Posts
  }

  const act = async (kind: 'activate' | 'archive', strategy: StrategySummary) => {
    if (kind === 'archive' && !window.confirm(t('content.strategy.archive_confirm', 'Archive this strategy? Its pillars stop being offered for posts.'))) return
    setBusy(true)
    setNote(null)
    try {
      await (kind === 'activate' ? api.activateStrategy(strategy.id) : api.archiveStrategy(strategy.id))
      await reread()
      setNote({ tone: 'success', text: kind === 'activate' ? t('content.strategy.activated', 'This strategy is now active.') : t('content.strategy.archived', 'Strategy archived.') })
      if (kind === 'activate') navigate('/content/strategy', { replace: true })
    } catch (e) {
      const [key, text] = errorKey('strategy', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    } finally {
      setBusy(false)
    }
  }

  const finished = strategies.filter(s => s.status !== 'generating')
  return (
    <>
      {finished.length > 1 && (
        <select aria-label={t('content.strategy.past', 'Past strategies')} value={shown?.id ?? ''}
          onChange={(e) => navigate(`/content/strategy?id=${e.target.value}`)}
          className="max-w-[16rem] rounded-lg border border-a-border bg-a-surface px-2.5 py-1.5 text-sm text-a-text">
          {finished.map(s => (
            <option key={s.id} value={s.id}>{(s.title || t('content.strategy.untitled', 'Untitled strategy'))} · {t(`content.strategy.status.${s.status}`, STATUS_TEXT[s.status])}</option>
          ))}
        </select>
      )}
      {shown && (shown.status === 'superseded' || shown.status === 'archived') && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => { void act('activate', shown) }}>
          <CheckCircle2 size={14} aria-hidden />{t('content.strategy.activate', 'Make active')}
        </Button>
      )}
      {shown && (shown.status === 'active' || shown.status === 'superseded') && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void act('archive', shown) }}>
          <Archive size={14} aria-hidden />{t('content.strategy.archive', 'Archive')}
        </Button>
      )}
      <Button size="sm" disabled={paused || generation.state === 'running'} onClick={() => setDialog(true)}>
        <Sparkles size={14} aria-hidden />{t('content.strategy.new', 'New strategy')}
      </Button>
      {note && <p role="status" className={`basis-full text-right text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</p>}
      {paused && <p className="basis-full text-right text-xs text-a-text-2">{t('content.strategy.error.ai_budget_used_up', "This month's AI budget is used up.")}</p>}
      {dialog && (
        <NewStrategyDialog onClose={() => setDialog(false)}
          onStarted={() => { setDialog(false); void queryClient.invalidateQueries({ queryKey: ['content', brand, 'strategies'] }); navigate('/content/strategy', { replace: true }) }} />
      )}
    </>
  )
}
```

Create `frontend/src/content/strategy/StrategyScreen.tsx`:

```tsx
import { useBoot } from '../ContentProvider'
import { StrategyActions } from './StrategyActions'
import { StrategyPage } from './StrategyPage'

/** /content/strategy: everyone reads; managers also get the actions (spec §5.1: staff never see a button the server would refuse). */
export function StrategyScreen() {
  const boot = useBoot()
  if (!boot.staff.can_manage) return <StrategyPage />
  return <StrategyPage actions={(shown, strategies, generation) => <StrategyActions shown={shown} strategies={strategies} generation={generation} />} />
}
```

In `ContentApp.tsx`, the `strategy` route's element becomes `<StrategyScreen />` (import from `./strategy/StrategyScreen`; drop the `StrategyPage` import there).

- [ ] **Step 6: The words**

The `"strategy"` group gains, before `"error"`:

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `new` | New strategy | Новая стратегия | Neue Strategie | Nouvelle stratégie | Nueva estrategia |
| `new_title` | Make a new strategy | Создать новую стратегию | Neue Strategie erstellen | Créer une nouvelle stratégie | Crear una nueva estrategia |
| `new_intro` | The AI reads the brand and writes a new strategy. It usually takes one to three minutes; you can leave this page meanwhile. | ИИ изучит бренд и напишет новую стратегию. Обычно это занимает от одной до трёх минут; страницу можно закрыть. | Die KI liest die Marke und schreibt eine neue Strategie. Das dauert meist ein bis drei Minuten; Sie können die Seite solange verlassen. | L’IA lit la marque et écrit une nouvelle stratégie. Cela prend en général une à trois minutes ; vous pouvez quitter la page en attendant. | La IA lee la marca y escribe una nueva estrategia. Suele tardar de uno a tres minutos; mientras tanto puedes salir de esta página. |
| `new_replaces` | When it is ready it becomes the active strategy; the current one stays among the past strategies. | Когда она будет готова, она станет активной; текущая останется среди прошлых стратегий. | Sobald sie fertig ist, wird sie die aktive Strategie; die jetzige bleibt bei den früheren Strategien. | Une fois prête, elle devient la stratégie active ; l’actuelle reste parmi les stratégies passées. | Cuando esté lista pasará a ser la estrategia activa; la actual queda entre las estrategias anteriores. |
| `instructions` | Instructions for the AI (optional) | Указания для ИИ (необязательно) | Hinweise für die KI (optional) | Consignes pour l’IA (facultatif) | Indicaciones para la IA (opcional) |
| `make` | Make strategy | Создать стратегию | Strategie erstellen | Créer la stratégie | Crear la estrategia |
| `past` | Past strategies | Прошлые стратегии | Frühere Strategien | Stratégies passées | Estrategias anteriores |
| `activate` | Make active | Сделать активной | Aktivieren | Rendre active | Activar |
| `archive` | Archive | В архив | Archivieren | Archiver | Archivar |
| `archive_confirm` | Archive this strategy? Its pillars stop being offered for posts. | Отправить стратегию в архив? Её рубрики больше не будут предлагаться для постов. | Diese Strategie archivieren? Ihre Säulen werden für Beiträge nicht mehr angeboten. | Archiver cette stratégie ? Ses piliers ne seront plus proposés pour les publications. | ¿Archivar esta estrategia? Sus pilares dejarán de ofrecerse para las publicaciones. |
| `activated` | This strategy is now active. | Теперь эта стратегия активна. | Diese Strategie ist jetzt aktiv. | Cette stratégie est maintenant active. | Esta estrategia ya está activa. |
| `archived` | Strategy archived. | Стратегия в архиве. | Strategie archiviert. | Stratégie archivée. | Estrategia archivada. |
| `running` | A new strategy is being made. It usually takes one to three minutes. | Новая стратегия создаётся. Обычно это занимает от одной до трёх минут. | Eine neue Strategie wird erstellt. Das dauert meist ein bis drei Minuten. | Une nouvelle stratégie est en cours de création. Cela prend en général une à trois minutes. | Se está creando una nueva estrategia. Suele tardar de uno a tres minutos. |
| `running_since` | Started {{minutes}} min ago. | Начато {{minutes}} мин назад. | Vor {{minutes}} Min. gestartet. | Commencé il y a {{minutes}} min. | Empezó hace {{minutes}} min. |
| `stuck_manager` | The new strategy is taking far longer than it should and may have stopped. You can make a new one. | Новая стратегия создаётся слишком долго — возможно, процесс остановился. Можно создать новую. | Die neue Strategie braucht viel länger als nötig und ist vielleicht abgebrochen. Sie können eine neue erstellen. | La nouvelle stratégie prend bien plus de temps que prévu et s’est peut-être arrêtée. Vous pouvez en créer une nouvelle. | La nueva estrategia está tardando mucho más de lo normal y puede que se haya detenido. Puedes crear una nueva. |
| `stuck_staff` | The new strategy is taking far longer than it should and may have stopped. | Новая стратегия создаётся слишком долго — возможно, процесс остановился. | Die neue Strategie braucht viel länger als nötig und ist vielleicht abgebrochen. | La nouvelle stratégie prend bien plus de temps que prévu et s’est peut-être arrêtée. | La nueva estrategia está tardando mucho más de lo normal y puede que se haya detenido. |

- [ ] **Step 7: Run the tests, the types and the lint**

Run: `$R2C/vt.sh src/content` → all pass. `cd frontend && npx tsc -b` → clean. Scoped eslint → only the baseline error.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: Strategy for managers — a new one (with its progress), past ones, make active, archive

Making a strategy is a queued job: the page reads the list every 5 s while
one is being made, says so to everyone, and calls it stuck after the same
15 minutes after which the server lets a new one start. Staff read; only
managers see the actions.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Brand — the page, readiness, the section pattern, the inputs, Brand DNA

**Files:**
- Create: `frontend/src/content/brand/brandForms.ts`, `frontend/src/content/brand/readinessWords.ts`, `frontend/src/content/brand/useBrand.ts`, `frontend/src/content/brand/inputs.tsx`, `frontend/src/content/brand/SectionCard.tsx`, `frontend/src/content/brand/Readiness.tsx`, `frontend/src/content/brand/sections/BrandDna.tsx`, `frontend/src/content/brand/BrandPage.tsx`
- Modify: `frontend/src/content/ContentApp.tsx` (route `brand`), `frontend/src/content/ContentShell.tsx` (nav item)
- Test: `frontend/src/content/brand/brandForms.test.ts`, `frontend/src/content/brand/readinessWords.test.ts`, `frontend/src/content/brand/brandPage.test.tsx`, with the shared helpers in `frontend/src/content/brand/brandTesting.tsx`; PHP `tests/Feature/Content/BrandTest.php` (the portal words every gap code)
- Words: `content.nav.brand`, `content.brand.*` (page, readiness, gaps, sections, Brand DNA, inputs) in all five bundles

**Interfaces:**
- Consumes: `BrandPayload`, `BrandProfile`, `ProfileFields`, `Readiness`, `contentApi.brand/saveProfile/refreshKnowledge` (Task 2); `ContentKnowledgeService::GAPS` and `missing`, `faq_count` (Task 1); `PageHeader` (Task 3); `LANGUAGES`, `languageName` (Plan B); `Field`, `Button`, `Notice`, `Skeleton`.
- Produces:
  - `brandForms`: `asText`, `asList`, `asPositioning`, `asRhythm`, `asDays`, `asMix`, `orNull`, `changedFields(before, after)`, `addTags(values, text)`.
  - `useBrand(): { query, brand, adopt, saveProfile }` — `adopt(payload)` puts a brand answer in the cache and reads the bootstrap again; `saveProfile(fields)` sends only non-empty changes.
  - `SectionCard<F>({ id, title, description?, canEdit, readView, makeDraft, editView, save, startOpen?, saveLabel?, onSaved? })`.
  - `inputs`: `TextField`, `SelectField`, `TagInput`, `ChoiceChips`, `Segmented`, `ReadRow`, `ReadTags`, `INPUT`.
  - `GAP_TEXT`, `SECTION_TEXT` (readiness words), `Readiness({ readiness, canRefresh, lastSync })`.
  - `BrandDnaSection({ brand, canEdit, startOpen?, onSaved? })`; `BrandPage`; route `/content/brand`.

**How a section saves (Review Focus 1 and 2):** each section turns the brand into its own form (`makeDraft`, with the `as*` readers so any old shape reads), the manager edits that draft only, and Save sends `changedFields(fieldsOf(formOf(brand)), fieldsOf(draft))`: only this section's fields, only those that changed, so a field the manager did not touch is never rewritten (not even normalised). The answer is the whole brand; it replaces the cache, and every other section keeps its own open draft (drafts live in each `SectionCard`). `name`, `default_language` and `trend_mode` may not be null on the server (`ContentRules::profileFields`), so an emptied one is left out rather than sent.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/brand/brandForms.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addTags, asDays, asList, asMix, asPositioning, asRhythm, asText, changedFields, orNull } from './brandForms'

describe('reading what the old wizard and the AI wrote', () => {
  it('reads text and lists of any shape', () => {
    expect(asText('Warm')).toBe('Warm')
    expect(asText(42)).toBe('42')
    expect(asText(null)).toBe('')
    expect(asList(['Care', ' ', 'Speed ', 7])).toEqual(['Care', 'Speed'])
    expect(asList('One value')).toEqual(['One value'])
    expect(asList({ a: 1 })).toEqual([])
  })

  it('reads positioning written as plain text as the transformation, and keeps parts it does not edit', () => {
    expect(asPositioning('From quick cuts to healthy hair')).toEqual({ transformation: 'From quick cuts to healthy hair' })
    expect(asPositioning({ old_way: 'Quick', beliefs: 'Care first', extra: 'kept' }))
      .toEqual({ old_way: 'Quick', new_way: '', transformation: '', beliefs: ['Care first'], extra: 'kept' })
    expect(asPositioning(null)).toEqual({})
  })

  it('reads a weekly rhythm with all seven days, keeping what each day had', () => {
    const rhythm = asRhythm({ monday: { role: 'proof', description: 'From the AI' }, funday: { role: 'x' } })
    expect(Object.keys(rhythm)).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
    expect(rhythm.monday).toEqual({ role: 'proof', notes: '', description: 'From the AI' })
    expect(rhythm.sunday).toEqual({ role: '', notes: '' })
  })

  it('reads posting days with all seven, off unless on', () => {
    expect(asDays(null)).toEqual({ mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })
    expect(asDays({ mon: true, wed: 1, fri: 'yes' })).toMatchObject({ mon: true, wed: true, fri: false })
  })

  it('reads a content mix as whole numbers, leaving out anything else', () => {
    expect(asMix({ education: 24.6, myths: 'lots', proof: 10 })).toEqual({ education: 25, proof: 10 })
    expect(asMix([1, 2])).toEqual({})
  })
})

describe('changedFields', () => {
  // Review Focus 2: a section sends only its own fields, and only those the manager changed.
  it('keeps only the fields that changed, comparing lists and objects by value', () => {
    const before = { usp: 'Organic', brand_values: ['Care'], positioning: { old_way: 'A' }, mission: null as string | null }
    expect(changedFields(before, { ...before })).toEqual({})
    expect(changedFields(before, { ...before, brand_values: ['Care', 'Calm'], mission: 'Hair for life' }))
      .toEqual({ brand_values: ['Care', 'Calm'], mission: 'Hair for life' })
  })

  it('turns an emptied text into null for the server', () => {
    expect(orNull('  ')).toBeNull()
    expect(orNull(' Organic ')).toBe('Organic')
  })
})

describe('addTags', () => {
  it('adds what was typed or pasted, split on commas and lines, trimmed, without doubles', () => {
    expect(addTags(['Care'], 'calm, Care ,  speed\nlight')).toEqual(['Care', 'calm', 'speed', 'light'])
    expect(addTags(['Care'], ' , ')).toEqual(['Care'])
  })
})
```

Create `frontend/src/content/brand/readinessWords.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import { GAP_TEXT, SECTION_TEXT } from './readinessWords'

describe('readiness words', () => {
  it('name every gap and section in the English bundle exactly as the fallbacks', () => {
    expect(en.brand.gap).toEqual(GAP_TEXT)
    expect(en.brand.section).toEqual(SECTION_TEXT)
  })
})
```

Create `frontend/src/content/brand/brandTesting.tsx` (helpers the Brand tests share; a test file must not import another test file, or its tests run twice):

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, BrandPayload, BrandProfile } from '../lib/types'
import { BrandPage } from './BrandPage'

/** A bootstrap for brand 3 of org 16, as a manager or as staff. */
export const bootFor = (canManage: boolean) => ({
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' }, brands: [], accent: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Sam', role: canManage ? 'manager' : 'staff', can_manage: canManage }, profile: { id: 1, setup_completed: true, readiness: 64 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['draft'], rewrites: [],
}) as unknown as Bootstrap

export const profile = {
  id: 1, name: 'Lumière content', default_language: 'en', primary_goal: 'More bookings', usp: 'Organic colour only',
  brand_values: ['Care', 'Calm'], price_position: 'premium', setup_completed_at: '2026-10-01T09:00:00.000000Z',
  last_knowledge_sync_at: '2026-10-02T09:00:00.000000Z',
} as unknown as BrandProfile

export const brandWith = (more: Partial<BrandPayload> = {}): BrandPayload => ({
  profile, audiences: [], channels: [], voice: null,
  readiness: { overall: 64, sections: [
    { key: 'company', label: 'Company info', score: 60, hints: ['x'], missing: ['mission'] },
    { key: 'knowledge', label: 'FAQ & knowledge', score: 40, hints: ['x'], missing: ['faq_more'], faq_count: 2 },
  ] },
  ...more,
})

/** Renders `element` (the Brand page by default) with the brand in the cache, as a manager or as staff. */
export function renderBrand(payload: BrandPayload, canManage: boolean, element: ReactElement = <BrandPage />) {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'brand'], payload)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/content/brand']}>
        <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          {element}
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
```

Create `frontend/src/content/brand/brandPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { brandWith, renderBrand } from './brandTesting'
import { SectionCard } from './SectionCard'

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

describe('BrandPage', () => {
  it('shows how ready the brand is and what is missing, in the portal\'s words', () => {
    const html = renderBrand(brandWith(), false)
    expect(html).toContain('>Brand<')
    expect(html).toContain('64 %')
    expect(html).toContain('Add the mission (Brand DNA).')
    expect(html).toContain('Add more questions and answers to the knowledge base: 2 so far, 5 or more work best.')
    expect(html).not.toContain('Company info') // the server's English label is never shown
  })

  it('reads Brand DNA to everyone, and offers Edit and Refresh knowledge only to managers', () => {
    const staff = renderBrand(brandWith(), false)
    expect(staff).toContain('Organic colour only')
    expect(staff).toContain('Calm')
    expect(staff).toContain('Premium')
    expect(staff).not.toContain('>Edit<')
    expect(staff).not.toContain('Refresh knowledge')
    const manager = renderBrand(brandWith(), true)
    expect(manager).toContain('>Edit<')
    expect(manager).toContain('Refresh knowledge')
  })

  it('tells staff when the brand is not set up yet', () => {
    expect(renderBrand({ profile: null, audiences: [], channels: [], voice: null, readiness: null }, false)).toContain('Your manager has not set up this brand yet.')
  })
})

describe('SectionCard', () => {
  it('opens on its form when asked to, with Save and Cancel', () => {
    const html = renderToStaticMarkup(
      <SectionCard id="s" title="Voice" canEdit startOpen readView={<p>read</p>} makeDraft={() => ({ tone: 'warm' })}
        editView={(draft) => <p>editing {draft.tone}</p>} save={() => Promise.resolve()} />,
    )
    expect(html).toContain('editing warm')
    expect(html).toMatch(/<button[^>]*>Save</)
    expect(html).toContain('>Cancel<')
    expect(html).not.toContain('read')
  })
})
```

Add to `tests/Feature/Content/BrandTest.php`:

```php
    public function test_the_portal_words_every_readiness_gap_and_nothing_else(): void
    {
        $words = json_decode((string) file_get_contents(base_path('frontend/src/content/i18n/content.en.json')), true);

        $portal = array_keys($words['brand']['gap'] ?? []);
        $server = ContentKnowledgeService::GAPS;
        sort($portal);
        sort($server);
        $this->assertSame($server, $portal, 'content.brand.gap in the English bundle must name exactly ContentKnowledgeService::GAPS');
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R2C/vt.sh src/content/brand` → FAIL (modules missing).
Run: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/BrandTest.php --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"` → 1 failed (no `brand.gap` words yet).

- [ ] **Step 3: The readers and helpers**

Create `frontend/src/content/brand/brandForms.ts`:

```ts
import { CHANNEL_DAYS, RHYTHM_DAYS } from '../lib/options'
import type { Positioning, RhythmDay, Weekday } from '../lib/types'

/**
 * Readers for the brand as the old wizard and the AI wrote it (Review Focus 1):
 * any shape reads as the editors' shape, nothing throws, and parts an editor
 * does not show are kept so they go back as they came.
 */
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export const asText = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')

export function asList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(v => v !== '')
}

/** Positioning written as plain text reads as the transformation it describes. */
export function asPositioning(value: unknown): Positioning {
  if (typeof value === 'string') return value.trim() === '' ? {} : { transformation: value }
  const v = record(value)
  if (Object.keys(v).length === 0) return {}
  return { ...v, old_way: asText(v.old_way), new_way: asText(v.new_way), transformation: asText(v.transformation), beliefs: asList(v.beliefs) }
}

/** All seven days (by their full English names, as the AI reads them), each with its role and notes, keeping what else a day had. */
export function asRhythm(value: unknown): Record<string, RhythmDay> {
  const source = record(value)
  const out: Record<string, RhythmDay> = {}
  for (const day of RHYTHM_DAYS) {
    const entry = record(source[day])
    out[day] = { ...entry, role: asText(entry.role), notes: asText(entry.notes) }
  }
  return out
}

/** A channel's posting days: all seven, off unless on. */
export function asDays(value: unknown): Record<Weekday, boolean> {
  const source = record(value)
  return Object.fromEntries(CHANNEL_DAYS.map(day => [day, source[day] === true || source[day] === 1 || source[day] === '1'])) as Record<Weekday, boolean>
}

/** A content mix as whole percentages; anything that is not a number is left out. */
export function asMix(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record(value)).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, Math.round(v as number)]),
  )
}

/** An emptied text is "none" for the server. */
export const orNull = (text: string): string | null => (text.trim() === '' ? null : text.trim())

/** Only the fields whose value changed (lists and objects compared by value). */
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = after[key]
  }
  return out
}

/** Tags typed or pasted: split on commas and lines, trimmed, without doubles (ignoring case). */
export function addTags(values: readonly string[], text: string): string[] {
  const out = [...values]
  for (const part of text.split(/[,\n]/)) {
    const tag = part.trim()
    if (tag !== '' && !out.some(v => v.toLowerCase() === tag.toLowerCase())) out.push(tag)
  }
  return out
}
```

Create `frontend/src/content/brand/readinessWords.ts`:

```ts
import type { ReadinessKey } from '../lib/types'

/** Readiness sections in the portal's words (the server's labels are English). */
export const SECTION_TEXT: Record<ReadinessKey, string> = {
  company: 'Company and brand', knowledge: 'Knowledge', audience: 'Audiences', voice: 'Voice', channels: 'Channels', strategy_inputs: 'Strategy inputs',
}

/** Every readiness gap by its code (ContentKnowledgeService::GAPS; a PHP test keeps the two lists equal). */
export const GAP_TEXT: Record<string, string> = {
  company_name: 'The organisation has no name yet (full admin, Settings).',
  company_industry: 'The organisation has no industry yet (full admin, Settings).',
  company_website: 'The organisation has no website yet (full admin, Settings).',
  brand_summary: 'Add a brand summary (Brand DNA).',
  usp: 'Say what makes the brand different (Brand DNA).',
  mission: 'Add the mission (Brand DNA).',
  faq_none: 'Add questions and answers to the knowledge base of the AI chat widget.',
  faq_more: 'Add more questions and answers to the knowledge base: {{count}} so far, 5 or more work best.',
  services: 'Add your services or products in the full admin.',
  audience_none: 'Add at least one audience (Audiences).',
  audience_pains: 'Give every audience its pain points.',
  audience_goals: 'Give every audience its goals.',
  voice_none: 'Describe the brand voice (Voice).',
  voice_tone: 'Choose a tone (Voice).',
  voice_emoji: 'Choose how many emoji to use (Voice).',
  voice_hashtag: 'Choose how many hashtags to use (Voice).',
  channels_none: 'Switch on at least one channel (Channels).',
  channels_days: 'Choose posting days on your channels.',
  channels_per_week: 'Set posts per week on your channels.',
  content_mix: 'Set the content mix (Rhythm and goals).',
  weekly_rhythm: 'Set the weekly rhythm (Rhythm and goals).',
  engagement_goals: 'Choose engagement goals (Rhythm and goals).',
}
```

- [ ] **Step 4: The brand's reads and writes**

Create `frontend/src/content/brand/useBrand.ts`:

```ts
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi, useBrandId } from '../ContentProvider'
import type { BrandPayload, ProfileFields } from '../lib/types'

/**
 * The brand as `GET brand` reads it (the same cache the post panel and
 * Generate read), and the two ways a section writes: `adopt` puts an answer
 * (every brand endpoint answers with the whole brand) in the cache and reads
 * the bootstrap again (readiness, "set up"); `saveProfile` sends only what it
 * is given, and nothing at all when that is nothing.
 */
export function useBrand() {
  const api = useApi()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['content', brandId, 'brand'], queryFn: api.brand, staleTime: 300_000 })

  const adopt = useCallback((payload: BrandPayload) => {
    const { profile, audiences, channels, voice, readiness } = payload
    queryClient.setQueryData<BrandPayload>(['content', brandId, 'brand'], { profile, audiences, channels, voice, readiness })
    void queryClient.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
  }, [queryClient, brandId])

  const saveProfile = useCallback(async (fields: ProfileFields) => {
    const sent = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as ProfileFields
    if (Object.keys(sent).length === 0) return
    adopt(await api.saveProfile(sent))
  }, [api, adopt])

  return { query, brand: query.data ?? null, adopt, saveProfile }
}
```

- [ ] **Step 5: The inputs**

Create `frontend/src/content/brand/inputs.tsx`:

```tsx
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { addTags } from './brandForms'

export const INPUT = 'w-full rounded-lg border bg-a-surface px-3 py-2 text-sm text-a-text'
const edge = (invalid: boolean) => (invalid ? 'border-a-danger' : 'border-a-border')

function Label({ text, children, hint }: { text: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-a-text-2">{text}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-a-text-2">{hint}</span>}
    </label>
  )
}

/** A text input, or a textarea with `rows`. */
export function TextField({ label, value, onChange, rows, maxLength = 5000, invalid = false, hint, required = false }: {
  label: string; value: string; onChange: (value: string) => void; rows?: number; maxLength?: number; invalid?: boolean; hint?: string; required?: boolean
}) {
  return (
    <Label text={label} hint={hint}>
      {rows
        ? <textarea value={value} rows={rows} maxLength={maxLength} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} className={`${INPUT} ${edge(invalid)}`} />
        : <input value={value} maxLength={maxLength} required={required} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} className={`${INPUT} ${edge(invalid)}`} />}
    </Label>
  )
}

/** A select over `options` ([value, name]); a stored value the list lacks stays offered as itself. */
export function SelectField({ label, value, options, onChange, empty, invalid = false }: {
  label: string; value: string; options: [string, string][]; onChange: (value: string) => void; empty: string; invalid?: boolean
}) {
  const known = value === '' || options.some(([v]) => v === value)
  return (
    <Label text={label}>
      <select value={value} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} className={`${INPUT} ${edge(invalid)}`}>
        <option value="">{empty}</option>
        {!known && <option value={value}>{value}</option>}
        {options.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
      </select>
    </Label>
  )
}

/** A list of short texts: Enter or a comma adds what was typed (or pasted), each tag removes with its ×, Backspace in the empty box removes the last. */
export function TagInput({ label, values, onChange, invalid = false }: { label: string; values: string[]; onChange: (values: string[]) => void; invalid?: boolean }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const commit = () => {
    if (text.trim() === '') return
    onChange(addTags(values, text))
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && text === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
      <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border bg-a-surface px-2 py-1.5 ${edge(invalid)}`}>
        {values.map(value => (
          <span key={value} className="inline-flex items-center gap-1 rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text">
            {value}
            <button type="button" onClick={() => onChange(values.filter(v => v !== value))} aria-label={t('content.brand.tag_remove', 'Remove {{item}}', { item: value })}
              className="rounded-full text-a-text-2 hover:text-a-text"><X size={12} aria-hidden /></button>
          </span>
        ))}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={commit} aria-label={label}
          placeholder={values.length === 0 ? t('content.brand.tag_add', 'Type and press Enter') : ''}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-a-text outline-none" />
      </div>
    </div>
  )
}

/** Toggle chips over `options`: one or many may be on; a stored value the list lacks shows as its own chip, on, so it stays until removed. */
export function ChoiceChips({ label, options, values, onChange, multiple = true }: {
  label: string; options: [string, string][]; values: string[]; onChange: (values: string[]) => void; multiple?: boolean
}) {
  const extras = values.filter(v => !options.some(([o]) => o === v)).map(v => [v, v] as [string, string])
  const toggle = (value: string) => {
    const on = values.includes(value)
    onChange(on ? values.filter(v => v !== value) : multiple ? [...values, value] : [value])
  }
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {[...options, ...extras].map(([value, name]) => (
          <button key={value} type="button" aria-pressed={values.includes(value)} onClick={() => toggle(value)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${values.includes(value) ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** One choice from a few; pressing the chosen one again clears it. */
export function Segmented({ label, options, value, onChange }: { label: string; options: [string, string][]; value: string; onChange: (value: string) => void }) {
  return <ChoiceChips label={label} options={options} values={value === '' ? [] : [value]} multiple={false} onChange={(values) => onChange(values[0] ?? '')} />
}

/** One field in a section's read view; "Not set yet" when empty. */
export function ReadRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-a-text-2">{label}</dt>
      <dd className={`whitespace-pre-wrap text-sm ${value.trim() === '' ? 'text-a-text-2' : 'text-a-text'}`}>{value.trim() === '' ? t('content.brand.empty', 'Not set yet') : value}</dd>
    </div>
  )
}

/** A list in a section's read view, as chips. */
export function ReadTags({ label, values }: { label: string; values: string[] }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-a-text-2">{label}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {values.length === 0
          ? <span className="text-sm text-a-text-2">{t('content.brand.empty', 'Not set yet')}</span>
          : values.map(v => <span key={v} className="rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text">{v}</span>)}
      </dd>
    </div>
  )
}
```

- [ ] **Step 6: The section card and readiness**

Create `frontend/src/content/brand/SectionCard.tsx`:

```tsx
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'

/**
 * One section of the Brand page (spec §4.6): its read view, and for managers
 * an Edit that opens its own draft (`makeDraft`, from the brand as it is now)
 * with Save and Cancel. The draft lives here, so another section's save never
 * touches it (Review Focus 2). A refusal stays on the form, in the portal's
 * words, with the fields it names marked. Guided setup opens it at once
 * (`startOpen`) and moves on when it is saved (`onSaved`).
 */
export function SectionCard<F>({ id, title, description, canEdit, readView, makeDraft, editView, save, startOpen = false, saveLabel, onSaved }: {
  id: string
  title: string
  description?: string
  canEdit: boolean
  readView: ReactNode
  makeDraft: () => F
  editView: (draft: F, change: (next: F) => void, invalid: string[]) => ReactNode
  /** Saves the draft; the brand's answer is adopted by the caller. */
  save: (draft: F) => Promise<void>
  startOpen?: boolean
  saveLabel?: string
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<F | null>(() => (startOpen && canEdit ? makeDraft() : null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string[]>([])

  const submit = async () => {
    if (draft === null || busy) return
    setBusy(true)
    setError(null)
    setInvalid([])
    try {
      await save(draft)
      setDraft(null)
      onSaved?.()
    } catch (e) {
      const failure = failureOf(e)
      setInvalid(Object.keys(failure.fields ?? {}).map(name => name.split('.')[0]))
      const [key, text] = errorKey('brand', failure.code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={id} className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id={id} className="font-a-display text-lg font-normal text-a-text">{title}</h2>
          {description && <p className="text-sm text-a-text-2">{description}</p>}
        </div>
        {canEdit && draft === null && (
          <Button size="sm" variant="secondary" onClick={() => setDraft(makeDraft())}>{t('content.brand.edit', 'Edit')}</Button>
        )}
      </div>
      {draft === null ? readView : (
        <div className="space-y-4">
          {editView(draft, setDraft, invalid)}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { void submit() }} loading={busy}>{saveLabel ?? t('content.brand.save', 'Save')}</Button>
            {!onSaved && <Button variant="secondary" disabled={busy} onClick={() => { setDraft(null); setError(null); setInvalid([]) }}>{t('content.common.cancel', 'Cancel')}</Button>}
          </div>
        </div>
      )}
    </section>
  )
}
```

(Cancel is hidden only in Guided setup, which passes `onSaved`: there a step has no "back to reading".)

Create `frontend/src/content/brand/Readiness.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useApi } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { BrandPayload, Readiness as ReadinessData } from '../lib/types'
import { GAP_TEXT, SECTION_TEXT } from './readinessWords'

/**
 * Knowledge and readiness (spec §4.6): how well the AI knows the brand,
 * section by section, with what is missing in the portal's words (the gap
 * codes; never the server's English hints). Managers can have the
 * organisation's FAQ, chatbot knowledge and services read again.
 */
export function Readiness({ readiness, canRefresh, lastSync, locale, onRefreshed }: {
  readiness: ReadinessData
  canRefresh: boolean
  lastSync: string | null
  locale: string
  onRefreshed: (payload: BrandPayload) => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const refresh = async () => {
    setBusy(true)
    setNote(null)
    try {
      onRefreshed(await api.refreshKnowledge())
      setNote({ tone: 'success', text: t('content.brand.refreshed', 'Knowledge read again.') })
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    } finally {
      setBusy(false)
    }
  }

  const synced = lastSync ? new Date(lastSync) : null
  return (
    <section aria-labelledby="content-readiness" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-readiness" className="font-a-display text-lg font-normal text-a-text">{t('content.brand.readiness', 'Knowledge and readiness')}</h2>
          <p className="text-sm text-a-text-2">{t('content.brand.readiness_intro', 'How well the AI knows this brand. Every gap makes its posts more generic.')}</p>
        </div>
        <p className="font-a-display text-4xl text-a-text">{readiness.overall} %</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {readiness.sections.map(section => (
          <li key={section.key} className="space-y-1.5 rounded-lg border border-a-border p-3">
            <div className="flex justify-between gap-2 text-sm">
              <span className="font-medium text-a-text">{t(`content.brand.section.${section.key}`, SECTION_TEXT[section.key] ?? section.key)}</span>
              <span className="text-a-text-2">{section.score} %</span>
            </div>
            <div className="h-1.5 rounded-full bg-a-surface-2" aria-hidden><div className="h-1.5 rounded-full bg-a-accent" style={{ width: `${section.score}%` }} /></div>
            {(section.missing ?? []).length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-a-text-2">
                {(section.missing ?? []).filter(code => code in GAP_TEXT).map(code => (
                  <li key={code}>{t(`content.brand.gap.${code}`, GAP_TEXT[code], { count: section.faq_count ?? 0 })}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-a-text-2">
          {synced && !Number.isNaN(synced.getTime())
            ? t('content.brand.synced', 'Knowledge read on {{date}}', { date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(synced) })
            : t('content.brand.never_synced', 'Knowledge not read yet')}
        </span>
        {canRefresh && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => { void refresh() }}>
            <RefreshCw size={14} aria-hidden />{t('content.brand.refresh', 'Refresh knowledge')}
          </Button>
        )}
        {note && <span role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</span>}
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Brand DNA and the page**

Create `frontend/src/content/brand/sections/BrandDna.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { LANGUAGES, languageName } from '../../lib/languages'
import { optionText, PRICE_POSITIONS } from '../../lib/options'
import type { BrandPayload, ProfileFields } from '../../lib/types'
import { asList, asText, changedFields, orNull } from '../brandForms'
import { ReadRow, ReadTags, Segmented, SelectField, TagInput, TextField } from '../inputs'
import { SectionCard } from '../SectionCard'
import { useBrand } from '../useBrand'

interface DnaForm {
  name: string; default_language: string; primary_goal: string; brand_summary: string; usp: string; mission: string
  brand_promise: string; differentiators: string; brand_values: string[]; proof_points: string[]; price_position: string
  main_cta: string; important_links: string[]
}

// eslint-disable-next-line react-refresh/only-export-components
export const dnaForm = (brand: BrandPayload): DnaForm => {
  const p = brand.profile
  return {
    name: asText(p?.name), default_language: asText(p?.default_language), primary_goal: asText(p?.primary_goal),
    brand_summary: asText(p?.brand_summary), usp: asText(p?.usp), mission: asText(p?.mission), brand_promise: asText(p?.brand_promise),
    differentiators: asText(p?.differentiators), brand_values: asList(p?.brand_values), proof_points: asList(p?.proof_points),
    price_position: asText(p?.price_position), main_cta: asText(p?.main_cta), important_links: asList(p?.important_links),
  }
}

/** The form as the server takes it; `name` and `default_language` may not be null, so an emptied one is left out. */
// eslint-disable-next-line react-refresh/only-export-components
export const dnaFields = (f: DnaForm): ProfileFields => ({
  name: f.name.trim() === '' ? undefined : f.name.trim(),
  default_language: f.default_language === '' ? undefined : f.default_language,
  primary_goal: orNull(f.primary_goal), brand_summary: orNull(f.brand_summary), usp: orNull(f.usp), mission: orNull(f.mission),
  brand_promise: orNull(f.brand_promise), differentiators: orNull(f.differentiators), brand_values: f.brand_values,
  proof_points: f.proof_points, price_position: orNull(f.price_position), main_cta: orNull(f.main_cta), important_links: f.important_links,
})

/** Brand DNA (spec §4.6): who the brand is — its name and language for posts, goal, summary, what sets it apart, values, proof, price, call to action, links. */
export function BrandDnaSection({ brand, canEdit, startOpen, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const { saveProfile } = useBrand()
  const w = (key: string, english: string) => t(`content.brand.dna.${key}`, english)
  const shown = dnaForm(brand)
  const prices = Object.keys(PRICE_POSITIONS).map(v => [v, optionText(t, 'price', v)] as [string, string])
  const languages = LANGUAGES.map(code => [code, languageName(code, locale)] as [string, string])

  return (
    <SectionCard<DnaForm> id="content-dna" title={w('title', 'Brand DNA')} description={w('intro', 'Who the brand is, in its own words. The AI writes from this.')}
      canEdit={canEdit} startOpen={startOpen} onSaved={onSaved}
      makeDraft={() => dnaForm(brand)}
      save={(draft) => saveProfile(changedFields(dnaFields(dnaForm(brand)), dnaFields(draft)))}
      readView={(
        <dl className="grid gap-4 md:grid-cols-2">
          <ReadRow label={w('name', 'Brand name')} value={shown.name} />
          <ReadRow label={w('language', 'Language of the posts')} value={shown.default_language ? languageName(shown.default_language, locale) : ''} />
          <ReadRow label={w('goal', 'Main goal')} value={shown.primary_goal} />
          <ReadRow label={w('price', 'Price position')} value={shown.price_position ? optionText(t, 'price', shown.price_position) : ''} />
          <ReadRow label={w('summary', 'Brand summary')} value={shown.brand_summary} />
          <ReadRow label={w('usp', 'What makes it different')} value={shown.usp} />
          <ReadRow label={w('mission', 'Mission')} value={shown.mission} />
          <ReadRow label={w('promise', 'Brand promise')} value={shown.brand_promise} />
          <ReadRow label={w('differentiators', 'Differentiators')} value={shown.differentiators} />
          <ReadRow label={w('cta', 'Main call to action')} value={shown.main_cta} />
          <ReadTags label={w('values', 'Values')} values={shown.brand_values} />
          <ReadTags label={w('proof', 'Proof points')} values={shown.proof_points} />
          <ReadTags label={w('links', 'Important links')} values={shown.important_links} />
        </dl>
      )}
      editView={(draft, change, invalid) => (
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label={w('name', 'Brand name')} value={draft.name} maxLength={255} required invalid={invalid.includes('name')} onChange={(name) => change({ ...draft, name })} />
          <SelectField label={w('language', 'Language of the posts')} value={draft.default_language} options={languages} empty={w('language_none', 'Choose a language')}
            onChange={(default_language) => change({ ...draft, default_language })} />
          <div className="md:col-span-2"><TextField label={w('goal', 'Main goal')} value={draft.primary_goal} rows={2} invalid={invalid.includes('primary_goal')} onChange={(primary_goal) => change({ ...draft, primary_goal })} /></div>
          <div className="md:col-span-2"><TextField label={w('summary', 'Brand summary')} value={draft.brand_summary} rows={4} invalid={invalid.includes('brand_summary')} onChange={(brand_summary) => change({ ...draft, brand_summary })} /></div>
          <TextField label={w('usp', 'What makes it different')} value={draft.usp} rows={3} invalid={invalid.includes('usp')} onChange={(usp) => change({ ...draft, usp })} />
          <TextField label={w('differentiators', 'Differentiators')} value={draft.differentiators} rows={3} invalid={invalid.includes('differentiators')} onChange={(differentiators) => change({ ...draft, differentiators })} />
          <TextField label={w('mission', 'Mission')} value={draft.mission} rows={2} invalid={invalid.includes('mission')} onChange={(mission) => change({ ...draft, mission })} />
          <TextField label={w('promise', 'Brand promise')} value={draft.brand_promise} rows={2} invalid={invalid.includes('brand_promise')} onChange={(brand_promise) => change({ ...draft, brand_promise })} />
          <TagInput label={w('values', 'Values')} values={draft.brand_values} onChange={(brand_values) => change({ ...draft, brand_values })} />
          <TagInput label={w('proof', 'Proof points')} values={draft.proof_points} onChange={(proof_points) => change({ ...draft, proof_points })} />
          <Segmented label={w('price', 'Price position')} options={prices} value={draft.price_position} onChange={(price_position) => change({ ...draft, price_position })} />
          <TextField label={w('cta', 'Main call to action')} value={draft.main_cta} invalid={invalid.includes('main_cta')} onChange={(main_cta) => change({ ...draft, main_cta })} />
          <div className="md:col-span-2"><TagInput label={w('links', 'Important links')} values={draft.important_links} onChange={(important_links) => change({ ...draft, important_links })} /></div>
        </div>
      )} />
  )
}
```

Create `frontend/src/content/brand/BrandPage.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../ContentProvider'
import { PageHeader } from '../ui/PageHeader'
import { Readiness } from './Readiness'
import { BrandDnaSection } from './sections/BrandDna'
import { useBrand } from './useBrand'

/**
 * Brand (spec §4.6): readiness and what is missing, then the profile in
 * sections — Brand DNA, Audiences, Voice, Positioning, Channels, Rhythm and
 * goals — each read by everyone and edited by managers one at a time.
 */
export function BrandPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const { query, brand, adopt } = useBrand()
  const canEdit = boot.staff.can_manage

  return (
    <div className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.brand.title', 'Brand')} />
      {query.isLoading && <div role="status" aria-label={t('content.common.loading', 'Loading…')} className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>}
      {query.isError && !brand && (
        <div className="space-y-3">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {brand && !brand.profile && !canEdit && <Notice tone="info">{t('content.shell.not_set_up_staff', 'Your manager has not set up this brand yet.')}</Notice>}
      {brand && brand.readiness && (
        <Readiness readiness={brand.readiness} canRefresh={canEdit && brand.profile !== null} lastSync={brand.profile?.last_knowledge_sync_at ?? null} locale={locale} onRefreshed={adopt} />
      )}
      {brand && (brand.profile || canEdit) && <BrandDnaSection brand={brand} canEdit={canEdit} />}
    </div>
  )
}
```

- [ ] **Step 8: Route and rail**

`ContentApp.tsx`: import `BrandPage` from `./brand/BrandPage`, add `<Route path="brand" element={<BrandPage />} />`.
`ContentShell.tsx`: import `Fingerprint` and add `{ to: '/content/brand', end: false, icon: Fingerprint, label: t('content.nav.brand', 'Brand') }` last.

- [ ] **Step 9: The words**

`"nav"` gains `"brand"`. The `"brand"` group (Task 2) gains, before `"error"`, these keys, and nested objects `"section"`, `"gap"`, `"dna"`:

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `nav.brand` | Brand | Бренд | Marke | Marque | Marca |
| `title` | Brand | Бренд | Marke | Marque | Marca |
| `edit` | Edit | Изменить | Bearbeiten | Modifier | Editar |
| `save` | Save | Сохранить | Speichern | Enregistrer | Guardar |
| `empty` | Not set yet | Пока не задано | Noch nicht festgelegt | Pas encore défini | Aún sin definir |
| `tag_add` | Type and press Enter | Введите и нажмите Enter | Eingeben und Enter drücken | Tapez puis Entrée | Escribe y pulsa Intro |
| `tag_remove` | Remove {{item}} | Убрать {{item}} | {{item}} entfernen | Retirer {{item}} | Quitar {{item}} |
| `readiness` | Knowledge and readiness | Знания и готовность | Wissen und Bereitschaft | Connaissances et préparation | Conocimiento y preparación |
| `readiness_intro` | How well the AI knows this brand. Every gap makes its posts more generic. | Насколько хорошо ИИ знает бренд. Каждый пробел делает посты более общими. | Wie gut die KI diese Marke kennt. Jede Lücke macht ihre Beiträge allgemeiner. | Ce que l’IA sait de cette marque. Chaque manque rend ses publications plus génériques. | Cuánto conoce la IA esta marca. Cada hueco hace sus publicaciones más genéricas. |
| `refresh` | Refresh knowledge | Обновить знания | Wissen auffrischen | Actualiser les connaissances | Actualizar el conocimiento |
| `refreshed` | Knowledge read again. | Знания обновлены. | Wissen neu gelesen. | Connaissances relues. | Conocimiento leído de nuevo. |
| `synced` | Knowledge read on {{date}} | Знания прочитаны {{date}} | Wissen gelesen am {{date}} | Connaissances lues le {{date}} | Conocimiento leído el {{date}} |
| `never_synced` | Knowledge not read yet | Знания ещё не прочитаны | Wissen noch nicht gelesen | Connaissances pas encore lues | Conocimiento aún sin leer |
| `section.company` | Company and brand | Компания и бренд | Unternehmen und Marke | Entreprise et marque | Empresa y marca |
| `section.knowledge` | Knowledge | Знания | Wissen | Connaissances | Conocimiento |
| `section.audience` | Audiences | Аудитории | Zielgruppen | Audiences | Audiencias |
| `section.voice` | Voice | Голос | Tonalität | Voix | Voz |
| `section.channels` | Channels | Каналы | Kanäle | Canaux | Canales |
| `section.strategy_inputs` | Strategy inputs | Основа для стратегии | Grundlagen der Strategie | Bases de la stratégie | Bases de la estrategia |
| `gap.company_name` | The organisation has no name yet (full admin, Settings). | У организации ещё нет названия (полная админка, Настройки). | Die Organisation hat noch keinen Namen (volle Verwaltung, Einstellungen). | L’organisation n’a pas encore de nom (administration complète, Paramètres). | La organización aún no tiene nombre (administración completa, Ajustes). |
| `gap.company_industry` | The organisation has no industry yet (full admin, Settings). | У организации не указана отрасль (полная админка, Настройки). | Die Organisation hat noch keine Branche (volle Verwaltung, Einstellungen). | L’organisation n’a pas encore de secteur (administration complète, Paramètres). | La organización aún no tiene sector (administración completa, Ajustes). |
| `gap.company_website` | The organisation has no website yet (full admin, Settings). | У организации не указан сайт (полная админка, Настройки). | Die Organisation hat noch keine Website (volle Verwaltung, Einstellungen). | L’organisation n’a pas encore de site web (administration complète, Paramètres). | La organización aún no tiene sitio web (administración completa, Ajustes). |
| `gap.brand_summary` | Add a brand summary (Brand DNA). | Добавьте описание бренда (ДНК бренда). | Fügen Sie eine Kurzbeschreibung hinzu (Marken-DNA). | Ajoutez une présentation de la marque (ADN de la marque). | Añade un resumen de la marca (ADN de la marca). |
| `gap.usp` | Say what makes the brand different (Brand DNA). | Опишите, чем бренд отличается (ДНК бренда). | Sagen Sie, was die Marke besonders macht (Marken-DNA). | Dites ce qui distingue la marque (ADN de la marque). | Di qué hace diferente a la marca (ADN de la marca). |
| `gap.mission` | Add the mission (Brand DNA). | Добавьте миссию (ДНК бренда). | Fügen Sie die Mission hinzu (Marken-DNA). | Ajoutez la mission (ADN de la marque). | Añade la misión (ADN de la marca). |
| `gap.faq_none` | Add questions and answers to the knowledge base of the AI chat widget. | Добавьте вопросы и ответы в базу знаний ИИ-чата. | Fügen Sie der Wissensbasis des KI-Chats Fragen und Antworten hinzu. | Ajoutez des questions et réponses à la base de connaissances du chat IA. | Añade preguntas y respuestas a la base de conocimiento del chat de IA. |
| `gap.faq_more` | Add more questions and answers to the knowledge base: {{count}} so far, 5 or more work best. | Добавьте ещё вопросов и ответов: сейчас {{count}}, лучше 5 и больше. | Fügen Sie weitere Fragen und Antworten hinzu: bisher {{count}}, ab 5 klappt es am besten. | Ajoutez d’autres questions et réponses : {{count}} pour l’instant, 5 ou plus c’est mieux. | Añade más preguntas y respuestas: {{count}} por ahora, 5 o más funciona mejor. |
| `gap.services` | Add your services or products in the full admin. | Добавьте услуги или товары в полной админке. | Fügen Sie Ihre Leistungen oder Produkte in der vollen Verwaltung hinzu. | Ajoutez vos services ou produits dans l’administration complète. | Añade tus servicios o productos en la administración completa. |
| `gap.audience_none` | Add at least one audience (Audiences). | Добавьте хотя бы одну аудиторию (Аудитории). | Legen Sie mindestens eine Zielgruppe an (Zielgruppen). | Ajoutez au moins une audience (Audiences). | Añade al menos una audiencia (Audiencias). |
| `gap.audience_pains` | Give every audience its pain points. | Укажите боли для каждой аудитории. | Geben Sie jeder Zielgruppe ihre Probleme. | Indiquez les difficultés de chaque audience. | Indica los problemas de cada audiencia. |
| `gap.audience_goals` | Give every audience its goals. | Укажите цели для каждой аудитории. | Geben Sie jeder Zielgruppe ihre Ziele. | Indiquez les objectifs de chaque audience. | Indica los objetivos de cada audiencia. |
| `gap.voice_none` | Describe the brand voice (Voice). | Опишите голос бренда (Голос). | Beschreiben Sie die Tonalität der Marke (Tonalität). | Décrivez la voix de la marque (Voix). | Describe la voz de la marca (Voz). |
| `gap.voice_tone` | Choose a tone (Voice). | Выберите тон (Голос). | Wählen Sie einen Ton (Tonalität). | Choisissez un ton (Voix). | Elige un tono (Voz). |
| `gap.voice_emoji` | Choose how many emoji to use (Voice). | Выберите, сколько эмодзи использовать (Голос). | Legen Sie fest, wie viele Emojis (Tonalität). | Choisissez combien d’emoji utiliser (Voix). | Elige cuántos emojis usar (Voz). |
| `gap.voice_hashtag` | Choose how many hashtags to use (Voice). | Выберите, сколько хештегов использовать (Голос). | Legen Sie fest, wie viele Hashtags (Tonalität). | Choisissez combien de hashtags utiliser (Voix). | Elige cuántos hashtags usar (Voz). |
| `gap.channels_none` | Switch on at least one channel (Channels). | Включите хотя бы один канал (Каналы). | Schalten Sie mindestens einen Kanal ein (Kanäle). | Activez au moins un canal (Canaux). | Activa al menos un canal (Canales). |
| `gap.channels_days` | Choose posting days on your channels. | Выберите дни публикаций в каналах. | Wählen Sie Veröffentlichungstage für Ihre Kanäle. | Choisissez les jours de publication de vos canaux. | Elige los días de publicación de tus canales. |
| `gap.channels_per_week` | Set posts per week on your channels. | Укажите число постов в неделю в каналах. | Legen Sie Beiträge pro Woche für Ihre Kanäle fest. | Indiquez le nombre de publications par semaine de vos canaux. | Indica las publicaciones por semana de tus canales. |
| `gap.content_mix` | Set the content mix (Rhythm and goals). | Задайте контент-микс (Ритм и цели). | Legen Sie den Content-Mix fest (Rhythmus und Ziele). | Définissez le mix de contenus (Rythme et objectifs). | Define la mezcla de contenidos (Ritmo y objetivos). |
| `gap.weekly_rhythm` | Set the weekly rhythm (Rhythm and goals). | Задайте недельный ритм (Ритм и цели). | Legen Sie den Wochenrhythmus fest (Rhythmus und Ziele). | Définissez le rythme de la semaine (Rythme et objectifs). | Define el ritmo semanal (Ritmo y objetivos). |
| `gap.engagement_goals` | Choose engagement goals (Rhythm and goals). | Выберите цели вовлечения (Ритм и цели). | Wählen Sie Interaktionsziele (Rhythmus und Ziele). | Choisissez des objectifs d’engagement (Rythme et objectifs). | Elige objetivos de interacción (Ritmo y objetivos). |
| `dna.title` | Brand DNA | ДНК бренда | Marken-DNA | ADN de la marque | ADN de la marca |
| `dna.intro` | Who the brand is, in its own words. The AI writes from this. | Кто такой бренд — его словами. ИИ пишет, опираясь на это. | Wer die Marke ist, in ihren eigenen Worten. Die KI schreibt danach. | Qui est la marque, avec ses propres mots. L’IA écrit à partir de cela. | Quién es la marca, con sus propias palabras. La IA escribe a partir de esto. |
| `dna.name` | Brand name | Название бренда | Markenname | Nom de la marque | Nombre de la marca |
| `dna.language` | Language of the posts | Язык постов | Sprache der Beiträge | Langue des publications | Idioma de las publicaciones |
| `dna.language_none` | Choose a language | Выберите язык | Sprache wählen | Choisissez une langue | Elige un idioma |
| `dna.goal` | Main goal | Главная цель | Hauptziel | Objectif principal | Objetivo principal |
| `dna.summary` | Brand summary | Описание бренда | Kurzbeschreibung | Présentation de la marque | Resumen de la marca |
| `dna.usp` | What makes it different | Чем отличается | Was sie besonders macht | Ce qui la distingue | Qué la hace diferente |
| `dna.mission` | Mission | Миссия | Mission | Mission | Misión |
| `dna.promise` | Brand promise | Обещание бренда | Markenversprechen | Promesse de la marque | Promesa de la marca |
| `dna.differentiators` | Differentiators | Отличия | Unterscheidungsmerkmale | Éléments distinctifs | Diferenciadores |
| `dna.values` | Values | Ценности | Werte | Valeurs | Valores |
| `dna.proof` | Proof points | Доказательства | Belege | Preuves | Pruebas |
| `dna.price` | Price position | Ценовой сегмент | Preislage | Positionnement prix | Posicionamiento de precio |
| `dna.cta` | Main call to action | Главный призыв к действию | Wichtigster Handlungsaufruf | Appel à l’action principal | Llamada a la acción principal |
| `dna.links` | Important links | Важные ссылки | Wichtige Links | Liens importants | Enlaces importantes |

- [ ] **Step 10: Run the tests, the types and the lint**

Run: `$R2C/vt.sh src/content` → all pass. Run the PHP folder: `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Content/ --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "⨯|Tests:"` → `Tests: 72 passed`.
`cd frontend && npx tsc -b` → clean. Scoped eslint → only the baseline error.

- [ ] **Step 11: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content tests/Feature/Content/BrandTest.php && git commit -q -F - <<'EOF'
Content portal: Brand — readiness in the portal's words, the section pattern, Brand DNA

Readiness shows what is missing by code (a PHP test keeps the portal's
words and the server's codes equal). Each section reads every old shape,
edits its own draft, and saves only its own fields that changed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Brand — Voice, Positioning, Rhythm and goals

**Files:**
- Create: `frontend/src/content/brand/sections/Voice.tsx`, `frontend/src/content/brand/sections/Positioning.tsx`, `frontend/src/content/brand/sections/Rhythm.tsx`, `frontend/src/content/brand/mixMath.ts`
- Modify: `frontend/src/content/brand/BrandPage.tsx` (the three sections, in the spec's order)
- Test: `frontend/src/content/brand/mixMath.test.ts`, `frontend/src/content/brand/brandSections.test.tsx`
- Words: `content.brand.voice.*`, `content.brand.positioning.*`, `content.brand.rhythm.*` in all five bundles

**Interfaces:**
- Consumes: `useBrand`, `SectionCard`, the inputs, the `as*` readers, `changedFields`, `orNull` (Task 6); the option maps and `optionText`, `DEFAULT_MIX`, `DEFAULT_RHYTHM`, `RHYTHM_DAYS` (Task 2); `contentApi.saveVoice` (Task 2); `renderBrand`, `brandWith` (Task 6's `brandTesting.tsx`).
- Produces: `VoiceSection`, `PositioningSection`, `RhythmSection` (each `{ brand, canEdit, startOpen?, onSaved? }`); `voiceForm/voiceFields`, `positioningForm/positioningFields`, `rhythmForm/rhythmFields`; `mixTotal(mix)`, `balanceMix(mix)`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/brand/mixMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_MIX } from '../lib/options'
import { balanceMix, mixTotal } from './mixMath'

describe('the content mix', () => {
  it('adds up what is set', () => {
    expect(mixTotal({ education: 40, myths: 35 })).toBe(75)
    expect(mixTotal({})).toBe(0)
  })

  it('balances to exactly 100 % in proportion, rounding fairly, leaving zeros at zero', () => {
    const balanced = balanceMix({ education: 50, myths: 25, community: 25, social_proof: 0 })
    expect(balanced).toEqual({ education: 50, myths: 25, community: 25, social_proof: 0 })
    const thirds = balanceMix({ education: 10, myths: 10, community: 10 })
    expect(mixTotal(thirds)).toBe(100)
    expect(Object.values(thirds).sort()).toEqual([33, 33, 34])
  })

  it('starts from the usual mix when nothing is set', () => {
    expect(balanceMix({ education: 0 })).toEqual(DEFAULT_MIX)
  })
})
```

Create `frontend/src/content/brand/brandSections.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import type { Voice } from '../lib/types'
import { changedFields } from './brandForms'
import { brandWith, profile, renderBrand } from './brandTesting'
import { PositioningSection, positioningFields, positioningForm } from './sections/Positioning'
import { RhythmSection, rhythmFields, rhythmForm } from './sections/Rhythm'
import { VoiceSection, voiceFields, voiceForm } from './sections/Voice'

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

const voice = {
  id: 1, tone: 'warm', style: 'Calm and close', formality_level: 'balanced', emoji_policy: 'light', hashtag_policy: null,
  sentence_style: 'short', point_of_view: 'brand', preferred_words: ['care'], forbidden_words: ['cheap'], claims_to_avoid: [],
  example_good_posts: null, example_bad_posts: null,
} as Voice

describe('VoiceSection', () => {
  it('reads the voice in the reader\'s words', () => {
    const html = renderBrand(brandWith({ voice }), false, <VoiceSection brand={brandWith({ voice })} canEdit={false} />)
    expect(html).toContain('Warm')
    expect(html).toContain('A few')
    expect(html).toContain('Short sentences')
    expect(html).toContain('cheap')
  })

  it('shows a tone the list does not know as itself, pressed, so it is kept', () => {
    const odd = { ...voice, tone: 'Cosy and calm' }
    const html = renderBrand(brandWith({ voice: odd }), true, <VoiceSection brand={brandWith({ voice: odd })} canEdit startOpen />)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Cosy and calm</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Warm</)
  })

  it('sends only what the manager changed', () => {
    const brand = brandWith({ voice })
    expect(changedFields(voiceFields(voiceForm(brand)), voiceFields(voiceForm(brand)))).toEqual({})
    expect(changedFields(voiceFields(voiceForm(brand)), voiceFields({ ...voiceForm(brand), hashtag_policy: 'minimal' }))).toEqual({ hashtag_policy: 'minimal' })
  })
})

describe('PositioningSection', () => {
  it('reads positioning written as plain text, and never rewrites it unless edited', () => {
    const brand = brandWith({ profile: { ...profile, positioning: 'From quick cuts to healthy hair' as never } })
    expect(renderBrand(brand, false, <PositioningSection brand={brand} canEdit={false} />)).toContain('From quick cuts to healthy hair')
    expect(changedFields(positioningFields(positioningForm(brand)), positioningFields(positioningForm(brand)))).toEqual({})
  })

  it('saves the whole positioning when one part changes, keeping the parts it does not show', () => {
    const brand = brandWith({ profile: { ...profile, positioning: { old_way: 'Quick', extra: 'kept' } as never } })
    const changed = changedFields(positioningFields(positioningForm(brand)), positioningFields({ ...positioningForm(brand), beliefs: ['Care first'] }))
    expect(changed).toEqual({ positioning: { extra: 'kept', old_way: 'Quick', new_way: '', transformation: '', beliefs: ['Care first'] } })
  })
})

describe('RhythmSection', () => {
  const brand = brandWith({ profile: { ...profile, weekly_rhythm: { monday: { role: 'proof', notes: 'Before and after' } }, content_mix: null, engagement_goals: ['bookings'], trend_mode: 'trend_aware' } })

  it('reads the week, the mix, the goals and the trends in the reader\'s words', () => {
    const html = renderBrand(brand, false, <RhythmSection brand={brand} canEdit={false} />)
    expect(html).toContain('Proof, a case')
    expect(html).toContain('Before and after')
    expect(html).toContain('The AI decides the mix.')
    expect(html).toContain('Bookings')
    expect(html).toContain('Trend-aware')
  })

  it('sends nothing for an untouched section, and an empty mix when the AI is to decide', () => {
    expect(changedFields(rhythmFields(rhythmForm(brand)), rhythmFields(rhythmForm(brand)))).toEqual({})
    const manual = { ...rhythmForm(brand), mixMode: 'manual' as const, mix: { education: 60, myths: 40 } }
    expect(changedFields(rhythmFields(rhythmForm(brand)), rhythmFields(manual))).toEqual({ content_mix: { education: 60, myths: 40 } })
  })

  it('offers the mix editor with its total and Balance', () => {
    const withMix = brandWith({ profile: { ...profile, content_mix: { education: 50, myths: 30 } } })
    const html = renderBrand(withMix, true, <RhythmSection brand={withMix} canEdit startOpen />)
    expect(html).toContain('Total 80 %')
    expect(html).toContain('Balance to 100 %')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R2C/vt.sh src/content/brand` → FAIL (modules missing).

- [ ] **Step 3: The mix maths**

Create `frontend/src/content/brand/mixMath.ts`:

```ts
import { DEFAULT_MIX } from '../lib/options'

export const mixTotal = (mix: Record<string, number>): number => Object.values(mix).reduce((sum, pct) => sum + (pct > 0 ? pct : 0), 0)

/**
 * The mix scaled to exactly 100 %, in proportion; the rounding goes to the
 * largest remainders. Nothing set: the usual mix.
 */
export function balanceMix(mix: Record<string, number>): Record<string, number> {
  const total = mixTotal(mix)
  if (total === 0) return { ...DEFAULT_MIX }
  const exact = Object.entries(mix).map(([key, pct]) => [key, pct > 0 ? (pct / total) * 100 : 0] as const)
  const out: Record<string, number> = Object.fromEntries(exact.map(([key, value]) => [key, Math.floor(value)]))
  let left = 100 - mixTotal(out)
  for (const [key] of [...exact].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (left <= 0) break
    if (mix[key] > 0) {
      out[key] += 1
      left -= 1
    }
  }
  return out
}
```

- [ ] **Step 4: Voice**

Create `frontend/src/content/brand/sections/Voice.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { useApi } from '../../ContentProvider'
import { EMOJI_POLICIES, FORMALITY, HASHTAG_POLICIES, optionText, POINTS_OF_VIEW, SENTENCE_STYLES, TONES, type OptionGroup } from '../../lib/options'
import type { BrandPayload, VoiceFields } from '../../lib/types'
import { asList, asText, changedFields, orNull } from '../brandForms'
import { ChoiceChips, ReadRow, ReadTags, Segmented, TagInput, TextField } from '../inputs'
import { SectionCard } from '../SectionCard'
import { useBrand } from '../useBrand'

interface VoiceForm {
  tone: string; style: string; formality_level: string; sentence_style: string; point_of_view: string
  emoji_policy: string; hashtag_policy: string; preferred_words: string[]; forbidden_words: string[]; claims_to_avoid: string[]
}

// eslint-disable-next-line react-refresh/only-export-components
export const voiceForm = (brand: BrandPayload): VoiceForm => {
  const v = brand.voice
  return {
    tone: asText(v?.tone), style: asText(v?.style), formality_level: asText(v?.formality_level), sentence_style: asText(v?.sentence_style),
    point_of_view: asText(v?.point_of_view), emoji_policy: asText(v?.emoji_policy), hashtag_policy: asText(v?.hashtag_policy),
    preferred_words: asList(v?.preferred_words), forbidden_words: asList(v?.forbidden_words), claims_to_avoid: asList(v?.claims_to_avoid),
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export const voiceFields = (f: VoiceForm): VoiceFields => ({
  tone: orNull(f.tone), style: orNull(f.style), formality_level: orNull(f.formality_level), sentence_style: orNull(f.sentence_style),
  point_of_view: orNull(f.point_of_view), emoji_policy: orNull(f.emoji_policy), hashtag_policy: orNull(f.hashtag_policy),
  preferred_words: f.preferred_words, forbidden_words: f.forbidden_words, claims_to_avoid: f.claims_to_avoid,
})

/**
 * Voice (spec §4.6): how the brand sounds. Saved with `PUT brand/voice`;
 * the tone is also the profile's default tone (as the old wizard kept them
 * equal), so a changed tone is saved there too.
 */
export function VoiceSection({ brand, canEdit, startOpen, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const { adopt, saveProfile } = useBrand()
  const w = (key: string, english: string) => t(`content.brand.voice.${key}`, english)
  const choices = (group: OptionGroup, map: Record<string, string>) => Object.keys(map).map(v => [v, optionText(t, group, v)] as [string, string])
  const named = (group: OptionGroup, value: string) => (value === '' ? '' : optionText(t, group, value))
  const shown = voiceForm(brand)

  const save = async (draft: VoiceForm) => {
    const fields = changedFields(voiceFields(voiceForm(brand)), voiceFields(draft))
    if (Object.keys(fields).length === 0) return
    adopt(await api.saveVoice(fields))
    if ('tone' in fields) await saveProfile({ default_tone: fields.tone ?? null })
  }

  return (
    <SectionCard<VoiceForm> id="content-voice" title={w('title', 'Voice')} description={w('intro', 'How the brand sounds when it writes.')}
      canEdit={canEdit} startOpen={startOpen} onSaved={onSaved} makeDraft={() => voiceForm(brand)} save={save}
      readView={(
        <dl className="grid gap-4 md:grid-cols-2">
          <ReadRow label={w('tone', 'Tone')} value={named('tone', shown.tone)} />
          <ReadRow label={w('style', 'Style in a few words')} value={shown.style} />
          <ReadRow label={w('formality', 'Formality')} value={named('formality', shown.formality_level)} />
          <ReadRow label={w('sentences', 'Sentences')} value={named('sentence_style', shown.sentence_style)} />
          <ReadRow label={w('pov', 'Written as')} value={named('point_of_view', shown.point_of_view)} />
          <ReadRow label={w('emoji', 'Emoji')} value={named('emoji', shown.emoji_policy)} />
          <ReadRow label={w('hashtags', 'Hashtags')} value={named('hashtag', shown.hashtag_policy)} />
          <ReadTags label={w('preferred', 'Words to use')} values={shown.preferred_words} />
          <ReadTags label={w('forbidden', 'Words to avoid')} values={shown.forbidden_words} />
          <ReadTags label={w('claims', 'Claims to avoid')} values={shown.claims_to_avoid} />
        </dl>
      )}
      editView={(draft, change, invalid) => (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Segmented label={w('tone', 'Tone')} options={choices('tone', TONES)} value={draft.tone} onChange={(tone) => change({ ...draft, tone })} /></div>
          <TextField label={w('style', 'Style in a few words')} value={draft.style} maxLength={100} invalid={invalid.includes('style')} onChange={(style) => change({ ...draft, style })} />
          <Segmented label={w('formality', 'Formality')} options={choices('formality', FORMALITY)} value={draft.formality_level} onChange={(formality_level) => change({ ...draft, formality_level })} />
          <Segmented label={w('sentences', 'Sentences')} options={choices('sentence_style', SENTENCE_STYLES)} value={draft.sentence_style} onChange={(sentence_style) => change({ ...draft, sentence_style })} />
          <Segmented label={w('pov', 'Written as')} options={choices('point_of_view', POINTS_OF_VIEW)} value={draft.point_of_view} onChange={(point_of_view) => change({ ...draft, point_of_view })} />
          <Segmented label={w('emoji', 'Emoji')} options={choices('emoji', EMOJI_POLICIES)} value={draft.emoji_policy} onChange={(emoji_policy) => change({ ...draft, emoji_policy })} />
          <Segmented label={w('hashtags', 'Hashtags')} options={choices('hashtag', HASHTAG_POLICIES)} value={draft.hashtag_policy} onChange={(hashtag_policy) => change({ ...draft, hashtag_policy })} />
          <TagInput label={w('preferred', 'Words to use')} values={draft.preferred_words} onChange={(preferred_words) => change({ ...draft, preferred_words })} />
          <TagInput label={w('forbidden', 'Words to avoid')} values={draft.forbidden_words} onChange={(forbidden_words) => change({ ...draft, forbidden_words })} />
          <div className="md:col-span-2"><TagInput label={w('claims', 'Claims to avoid')} values={draft.claims_to_avoid} onChange={(claims_to_avoid) => change({ ...draft, claims_to_avoid })} /></div>
        </div>
      )} />
  )
}
```

- [ ] **Step 5: Positioning**

Create `frontend/src/content/brand/sections/Positioning.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { BrandPayload, Positioning, ProfileFields } from '../../lib/types'
import { asList, asPositioning, changedFields } from '../brandForms'
import { ReadRow, ReadTags, TagInput, TextField } from '../inputs'
import { SectionCard } from '../SectionCard'
import { useBrand } from '../useBrand'

interface PositioningForm {
  /** Parts of the stored positioning this section does not show; they go back as they came. */
  rest: Record<string, unknown>
  old_way: string; new_way: string; transformation: string; beliefs: string[]; key_messages: string[]
}

// eslint-disable-next-line react-refresh/only-export-components
export const positioningForm = (brand: BrandPayload): PositioningForm => {
  const { old_way = '', new_way = '', transformation = '', beliefs = [], ...rest } = asPositioning(brand.profile?.positioning)
  return { rest, old_way, new_way, transformation, beliefs, key_messages: asList(brand.profile?.key_messages) }
}

// eslint-disable-next-line react-refresh/only-export-components
export const positioningFields = (f: PositioningForm): ProfileFields => ({
  positioning: { ...f.rest, old_way: f.old_way, new_way: f.new_way, transformation: f.transformation, beliefs: f.beliefs } as Positioning,
  key_messages: f.key_messages,
})

/** Positioning (spec §4.6): what the brand moves people away from and towards, what it believes, what it keeps saying. */
export function PositioningSection({ brand, canEdit, startOpen, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t } = useTranslation()
  const { saveProfile } = useBrand()
  const w = (key: string, english: string) => t(`content.brand.positioning.${key}`, english)
  const shown = positioningForm(brand)

  return (
    <SectionCard<PositioningForm> id="content-positioning" title={w('title', 'Positioning')}
      description={w('intro', 'Where the brand stands: what it moves people away from, and towards.')}
      canEdit={canEdit} startOpen={startOpen} onSaved={onSaved} makeDraft={() => positioningForm(brand)}
      save={(draft) => saveProfile(changedFields(positioningFields(positioningForm(brand)), positioningFields(draft)))}
      readView={(
        <dl className="grid gap-4 md:grid-cols-2">
          <ReadRow label={w('old_way', 'The old way')} value={shown.old_way} />
          <ReadRow label={w('new_way', 'The new way')} value={shown.new_way} />
          <div className="md:col-span-2"><ReadRow label={w('transformation', 'What changes for the client')} value={shown.transformation} /></div>
          <ReadTags label={w('beliefs', 'Beliefs')} values={shown.beliefs} />
          <ReadTags label={w('key_messages', 'Key messages')} values={shown.key_messages} />
        </dl>
      )}
      editView={(draft, change) => (
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label={w('old_way', 'The old way')} value={draft.old_way} rows={3} onChange={(old_way) => change({ ...draft, old_way })} />
          <TextField label={w('new_way', 'The new way')} value={draft.new_way} rows={3} onChange={(new_way) => change({ ...draft, new_way })} />
          <div className="md:col-span-2"><TextField label={w('transformation', 'What changes for the client')} value={draft.transformation} rows={3} onChange={(transformation) => change({ ...draft, transformation })} /></div>
          <TagInput label={w('beliefs', 'Beliefs')} values={draft.beliefs} onChange={(beliefs) => change({ ...draft, beliefs })} />
          <TagInput label={w('key_messages', 'Key messages')} values={draft.key_messages} onChange={(key_messages) => change({ ...draft, key_messages })} />
        </div>
      )} />
  )
}
```

- [ ] **Step 6: Rhythm and goals**

Create `frontend/src/content/brand/sections/Rhythm.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Button } from '../../../workspace/ui/Button'
import { addDays, formatDate } from '../../../workspace/lib/wallClock'
import {
  DEFAULT_RHYTHM, ENGAGEMENT_GOALS, IMAGE_TYPES, MIX_CATEGORIES, optionText, RHYTHM_DAYS, TREND_HINTS, TREND_MODES, VISUAL_STYLES, WEEKDAY_ROLES,
} from '../../lib/options'
import type { BrandPayload, ProfileFields, RhythmDay, VisualStyle } from '../../lib/types'
import { asList, asMix, asRhythm, asText, changedFields } from '../brandForms'
import { ChoiceChips, INPUT, ReadRow, ReadTags, Segmented, SelectField, TagInput } from '../inputs'
import { balanceMix, mixTotal } from '../mixMath'
import { SectionCard } from '../SectionCard'
import { useBrand } from '../useBrand'

/** A Monday: the rhythm's days are named from it in the reader's language. */
const A_MONDAY = '2026-10-12'

interface RhythmForm {
  rhythm: Record<string, RhythmDay>
  mixMode: 'ai' | 'manual'
  mix: Record<string, number>
  engagement_goals: string[]
  trend_mode: string
  visualRest: Record<string, unknown>
  style: string; image_types: string[]; colors: string[]; avoid: string[]
}

const blank = (day: RhythmDay) => asText(day.role) === '' && asText(day.notes) === ''

// eslint-disable-next-line react-refresh/only-export-components
export const rhythmForm = (brand: BrandPayload): RhythmForm => {
  const p = brand.profile
  const mix = asMix(p?.content_mix)
  const visual = (p?.visual_style && typeof p.visual_style === 'object' && !Array.isArray(p.visual_style) ? p.visual_style : {}) as VisualStyle & Record<string, unknown>
  const { style, image_types, colors, avoid, ...visualRest } = visual
  return {
    rhythm: asRhythm(p?.weekly_rhythm), mixMode: Object.keys(mix).length > 0 ? 'manual' : 'ai', mix,
    engagement_goals: asList(p?.engagement_goals), trend_mode: asText(p?.trend_mode), visualRest,
    style: asText(style), image_types: asList(image_types), colors: asList(colors), avoid: asList(avoid),
  }
}

/** The form as the server takes it: an all-empty week is "none"; the AI deciding the mix is an empty mix; trend_mode may not be null. */
// eslint-disable-next-line react-refresh/only-export-components
export const rhythmFields = (f: RhythmForm): ProfileFields => ({
  weekly_rhythm: Object.values(f.rhythm).every(blank) ? {} : f.rhythm,
  content_mix: f.mixMode === 'ai' ? {} : Object.fromEntries(Object.entries(f.mix).filter(([, pct]) => pct > 0)),
  engagement_goals: f.engagement_goals,
  trend_mode: f.trend_mode === '' ? undefined : f.trend_mode,
  visual_style: { ...f.visualRest, style: f.style, image_types: f.image_types, colors: f.colors, avoid: f.avoid },
})

/** Rhythm and goals (spec §4.6): the week's shape, the content mix, what posts should achieve, how far to follow trends, the look of images. */
export function RhythmSection({ brand, canEdit, startOpen, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const { saveProfile } = useBrand()
  const w = (key: string, english: string) => t(`content.brand.rhythm.${key}`, english)
  const dayName = (i: number) => formatDate(addDays(A_MONDAY, i), locale, { weekday: 'long' })
  const roles = Object.keys(WEEKDAY_ROLES).map(v => [v, optionText(t, 'role', v)] as [string, string])
  const shown = rhythmForm(brand)

  return (
    <SectionCard<RhythmForm> id="content-rhythm" title={w('title', 'Rhythm and goals')}
      description={w('intro', 'The shape of the week, the content mix, and what the posts should achieve.')}
      canEdit={canEdit} startOpen={startOpen} onSaved={onSaved} makeDraft={() => rhythmForm(brand)}
      save={(draft) => saveProfile(changedFields(rhythmFields(rhythmForm(brand)), rhythmFields(draft)))}
      readView={(
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-a-text-2">{w('days', 'Weekly rhythm')}</p>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {RHYTHM_DAYS.map((day, i) => (
                <li key={day} className="text-a-text">
                  <span className="text-a-text-2">{dayName(i)}: </span>
                  {blank(shown.rhythm[day]) ? t('content.brand.empty', 'Not set yet') : [shown.rhythm[day].role ? optionText(t, 'role', asText(shown.rhythm[day].role)) : '', asText(shown.rhythm[day].notes)].filter(Boolean).join(' · ')}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-a-text-2">{w('mix', 'Content mix')}</p>
            {shown.mixMode === 'ai'
              ? <p className="text-sm text-a-text">{w('mix_by_ai', 'The AI decides the mix.')}</p>
              : <ul className="flex flex-wrap gap-1.5">{Object.entries(shown.mix).map(([k, pct]) => <li key={k} className="rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text">{optionText(t, 'mix', k)} {pct} %</li>)}</ul>}
          </div>
          <dl className="grid gap-4 md:grid-cols-2">
            <ReadTags label={w('goals', 'Engagement goals')} values={shown.engagement_goals.map(v => optionText(t, 'engagement', v))} />
            <ReadRow label={w('trend', 'Trends')} value={shown.trend_mode ? optionText(t, 'trend', shown.trend_mode) : ''} />
            <ReadRow label={w('style', 'Visual style')} value={shown.style ? optionText(t, 'visual_style', shown.style) : ''} />
            <ReadTags label={w('image_types', 'Kinds of images')} values={shown.image_types.map(v => optionText(t, 'image_type', v))} />
            <ReadTags label={w('colors', 'Colours')} values={shown.colors} />
            <ReadTags label={w('avoid', 'Avoid in images')} values={shown.avoid} />
          </dl>
        </div>
      )}
      editView={(draft, change) => {
        const setDay = (day: string, part: Partial<RhythmDay>) => change({ ...draft, rhythm: { ...draft.rhythm, [day]: { ...draft.rhythm[day], ...part } } })
        const total = mixTotal(draft.mix)
        return (
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-a-text-2">{w('days', 'Weekly rhythm')}</legend>
              {Object.values(draft.rhythm).every(blank) && (
                <Button size="sm" variant="secondary" onClick={() => change({ ...draft, rhythm: { ...draft.rhythm, ...Object.fromEntries(RHYTHM_DAYS.map(d => [d, { ...draft.rhythm[d], ...DEFAULT_RHYTHM[d] }])) } })}>
                  {w('usual_week', 'Start from a usual week')}
                </Button>
              )}
              {RHYTHM_DAYS.map((day, i) => (
                <div key={day} className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_1fr]">
                  <span className="pb-2 text-sm text-a-text">{dayName(i)}</span>
                  <SelectField label={w('role', 'Role of the day')} value={asText(draft.rhythm[day].role)} options={roles} empty="—" onChange={(role) => setDay(day, { role })} />
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-a-text-2">{w('notes', 'Notes')}</span>
                    <input value={asText(draft.rhythm[day].notes)} maxLength={500} onChange={(e) => setDay(day, { notes: e.target.value })} className={`${INPUT} border-a-border`} />
                  </label>
                </div>
              ))}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-a-text-2">{w('mix', 'Content mix')}</legend>
              <Segmented label={w('mix_who', 'Who sets it')} value={draft.mixMode}
                options={[['ai', w('mix_ai', 'Let the AI decide')], ['manual', w('mix_manual', 'Set it myself')]]}
                onChange={(mode) => change({ ...draft, mixMode: mode === 'manual' ? 'manual' : 'ai', mix: mode === 'manual' && mixTotal(draft.mix) === 0 ? balanceMix({}) : draft.mix })} />
              {draft.mixMode === 'manual' && (
                <div className="space-y-2">
                  {Object.keys(MIX_CATEGORIES).map(key => (
                    <label key={key} className="grid grid-cols-[1fr_5rem] items-center gap-2 text-sm text-a-text">
                      {optionText(t, 'mix', key)}
                      <input type="number" min={0} max={100} step={5} value={draft.mix[key] ?? 0}
                        onChange={(e) => change({ ...draft, mix: { ...draft.mix, [key]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) } })}
                        className={`${INPUT} border-a-border text-right`} />
                    </label>
                  ))}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`text-sm font-medium ${total === 100 ? 'text-a-text' : 'text-a-danger'}`}>{t('content.brand.rhythm.total', 'Total {{total}} %', { total })}</span>
                    <Button size="sm" variant="secondary" onClick={() => change({ ...draft, mix: balanceMix(draft.mix) })}>{w('balance', 'Balance to 100 %')}</Button>
                  </div>
                </div>
              )}
            </fieldset>

            <ChoiceChips label={w('goals', 'Engagement goals')} options={Object.keys(ENGAGEMENT_GOALS).map(v => [v, optionText(t, 'engagement', v)])}
              values={draft.engagement_goals} onChange={(engagement_goals) => change({ ...draft, engagement_goals })} />
            <div className="space-y-1">
              <Segmented label={w('trend', 'Trends')} options={Object.keys(TREND_MODES).map(v => [v, optionText(t, 'trend', v)])}
                value={draft.trend_mode} onChange={(trend_mode) => change({ ...draft, trend_mode })} />
              {draft.trend_mode in TREND_HINTS && <p className="text-xs text-a-text-2">{optionText(t, 'trend_hint', draft.trend_mode)}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label={w('style', 'Visual style')} value={draft.style} empty={w('style_none', 'No style chosen')}
                options={Object.keys(VISUAL_STYLES).map(v => [v, optionText(t, 'visual_style', v)])} onChange={(style) => change({ ...draft, style })} />
              <TagInput label={w('colors', 'Colours')} values={draft.colors} onChange={(colors) => change({ ...draft, colors })} />
              <ChoiceChips label={w('image_types', 'Kinds of images')} options={Object.keys(IMAGE_TYPES).map(v => [v, optionText(t, 'image_type', v)])}
                values={draft.image_types} onChange={(image_types) => change({ ...draft, image_types })} />
              <TagInput label={w('avoid', 'Avoid in images')} values={draft.avoid} onChange={(avoid) => change({ ...draft, avoid })} />
            </div>
          </div>
        )
      }} />
  )
}
```

- [ ] **Step 7: The page shows them**

In `BrandPage.tsx`, import the three sections and, after `<BrandDnaSection …/>`, render (same condition `brand && (brand.profile || canEdit)`):

```tsx
          <VoiceSection brand={brand} canEdit={canEdit} />
          <PositioningSection brand={brand} canEdit={canEdit} />
          <RhythmSection brand={brand} canEdit={canEdit} />
```

(Task 8 puts Audiences between Brand DNA and Voice, and Channels between Positioning and Rhythm, which is the spec's order.)

- [ ] **Step 8: The words**

The `"brand"` group gains nested objects `"voice"`, `"positioning"`, `"rhythm"`:

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `voice.title` | Voice | Голос | Tonalität | Voix | Voz |
| `voice.intro` | How the brand sounds when it writes. | Как звучит бренд, когда пишет. | Wie die Marke klingt, wenn sie schreibt. | Comment la marque s’exprime quand elle écrit. | Cómo suena la marca cuando escribe. |
| `voice.tone` | Tone | Тон | Ton | Ton | Tono |
| `voice.style` | Style in a few words | Стиль в двух словах | Stil in wenigen Worten | Le style en quelques mots | El estilo en pocas palabras |
| `voice.formality` | Formality | Официальность | Förmlichkeit | Formalité | Formalidad |
| `voice.sentences` | Sentences | Фразы | Sätze | Phrases | Frases |
| `voice.pov` | Written as | От чьего лица | Geschrieben als | Écrit par | Escrito como |
| `voice.emoji` | Emoji | Эмодзи | Emojis | Emoji | Emojis |
| `voice.hashtags` | Hashtags | Хештеги | Hashtags | Hashtags | Hashtags |
| `voice.preferred` | Words to use | Слова, которые используем | Gern genutzte Wörter | Mots à employer | Palabras que usar |
| `voice.forbidden` | Words to avoid | Слова, которых избегаем | Zu meidende Wörter | Mots à éviter | Palabras que evitar |
| `voice.claims` | Claims to avoid | Обещания, которых избегаем | Zu meidende Aussagen | Affirmations à éviter | Afirmaciones que evitar |
| `positioning.title` | Positioning | Позиционирование | Positionierung | Positionnement | Posicionamiento |
| `positioning.intro` | Where the brand stands: what it moves people away from, and towards. | Где стоит бренд: от чего он уводит людей и к чему ведёт. | Wo die Marke steht: wovon sie Menschen wegführt und wohin. | Où se situe la marque : ce dont elle éloigne les gens, et vers quoi elle les mène. | Dónde está la marca: de qué aleja a la gente y hacia qué la lleva. |
| `positioning.old_way` | The old way | Как было | Der alte Weg | L’ancienne façon | La forma antigua |
| `positioning.new_way` | The new way | Как стало | Der neue Weg | La nouvelle façon | La forma nueva |
| `positioning.transformation` | What changes for the client | Что меняется для клиента | Was sich für die Kundschaft ändert | Ce qui change pour le client | Qué cambia para el cliente |
| `positioning.beliefs` | Beliefs | Убеждения | Überzeugungen | Convictions | Creencias |
| `positioning.key_messages` | Key messages | Ключевые сообщения | Kernbotschaften | Messages clés | Mensajes clave |
| `rhythm.title` | Rhythm and goals | Ритм и цели | Rhythmus und Ziele | Rythme et objectifs | Ritmo y objetivos |
| `rhythm.intro` | The shape of the week, the content mix, and what the posts should achieve. | Ритм недели, контент-микс и чего должны добиваться посты. | Die Form der Woche, der Content-Mix und was die Beiträge erreichen sollen. | La forme de la semaine, le mix de contenus et ce que les publications doivent obtenir. | La forma de la semana, la mezcla de contenidos y lo que deben lograr las publicaciones. |
| `rhythm.days` | Weekly rhythm | Недельный ритм | Wochenrhythmus | Rythme de la semaine | Ritmo semanal |
| `rhythm.role` | Role of the day | Роль дня | Rolle des Tages | Rôle du jour | Función del día |
| `rhythm.notes` | Notes | Заметки | Notizen | Notes | Notas |
| `rhythm.usual_week` | Start from a usual week | Начать с обычной недели | Mit einer üblichen Woche beginnen | Partir d’une semaine type | Empezar con una semana habitual |
| `rhythm.mix` | Content mix | Контент-микс | Content-Mix | Mix de contenus | Mezcla de contenidos |
| `rhythm.mix_who` | Who sets it | Кто задаёт | Wer legt ihn fest | Qui le définit | Quién la define |
| `rhythm.mix_ai` | Let the AI decide | Пусть решает ИИ | Die KI entscheiden lassen | Laisser l’IA décider | Que decida la IA |
| `rhythm.mix_manual` | Set it myself | Задам сам | Selbst festlegen | Le définir moi-même | Definirla yo |
| `rhythm.mix_by_ai` | The AI decides the mix. | Микс выбирает ИИ. | Die KI wählt den Mix. | L’IA choisit le mix. | La IA decide la mezcla. |
| `rhythm.total` | Total {{total}} % | Всего {{total}} % | Gesamt {{total}} % | Total {{total}} % | Total {{total}} % |
| `rhythm.balance` | Balance to 100 % | Выровнять до 100 % | Auf 100 % ausgleichen | Équilibrer à 100 % | Ajustar al 100 % |
| `rhythm.goals` | Engagement goals | Цели вовлечения | Interaktionsziele | Objectifs d’engagement | Objetivos de interacción |
| `rhythm.trend` | Trends | Тренды | Trends | Tendances | Tendencias |
| `rhythm.style` | Visual style | Визуальный стиль | Bildstil | Style visuel | Estilo visual |
| `rhythm.style_none` | No style chosen | Стиль не выбран | Kein Stil gewählt | Aucun style choisi | Ningún estilo elegido |
| `rhythm.image_types` | Kinds of images | Виды изображений | Bildarten | Types d’images | Tipos de imágenes |
| `rhythm.colors` | Colours | Цвета | Farben | Couleurs | Colores |
| `rhythm.avoid` | Avoid in images | Избегать на изображениях | In Bildern vermeiden | À éviter dans les images | Evitar en las imágenes |

- [ ] **Step 9: Run the tests, the types and the lint**

Run: `$R2C/vt.sh src/content` → all pass. `cd frontend && npx tsc -b` → clean. Scoped eslint → only the baseline error.

- [ ] **Step 10: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: Brand — Voice, Positioning, Rhythm and goals

Each reads what is stored in any shape (an unknown tone stays, pressed),
saves only what changed, and keeps parts it does not show. The content mix
can be left to the AI or set by hand and balanced to 100 %.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Brand — Audiences and Channels, edited in place

**Files:**
- Create: `frontend/src/content/brand/listActions.ts`, `frontend/src/content/brand/sections/Audiences.tsx`, `frontend/src/content/brand/sections/Channels.tsx`
- Modify: `frontend/src/content/brand/BrandPage.tsx` (Audiences after Brand DNA, Channels after Positioning)
- Test: `frontend/src/content/brand/listActions.test.ts`, `frontend/src/content/brand/brandLists.test.tsx`
- Words: `content.brand.audiences.*`, `content.brand.channels.*` in all five bundles

**Interfaces:**
- Consumes: `contentApi.createAudience/updateAudience/deleteAudience/createChannel/updateChannel/deleteChannel`, `failureOf(e).posts` (Task 2); `useBrand`, inputs, `asText`, `asList`, `asDays`, `changedFields`, `orNull` (Task 6); `refreshLists` (Task 3); `PlatformMark`, `LANGUAGES`, `languageName`, `CHANNEL_DAYS`, `EMOJI_POLICIES`, `HASHTAG_POLICIES`, `optionText`.
- Produces: `audienceForm/audienceFields`, `channelForm/channelFields`, `saveAudience`, `removeAudience`, `saveChannel`, `removeChannel` (in `listActions.ts`); `AudiencesSection`, `ChannelsSection` (each `{ brand, canEdit, startOpen?, onSaved? }`; `startOpen` opens the "add" form when the list is empty, for Guided setup).

**The rules (spec §7 F1, Review Focus 4):** audiences and channels keep their ids: an edit is a `PUT` of the changed fields, a new one a `POST`, a removal a `DELETE` of that one only. Removing an audience that posts use first answers 409 `audience_in_use` with their number; the portal asks, and only a yes sends `?confirm=1` (those posts keep everything else). Any channel change reads the Plan and Posts again (`refreshLists`): a channel switched off or removed takes its empty slots off the Plan.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/brand/listActions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { Audience, BrandPayload, Channel } from '../lib/types'
import { changedFields } from './brandForms'
import { audienceFields, audienceForm, channelFields, channelForm, removeAudience, removeChannel, saveAudience, saveChannel } from './listActions'

const payload = { profile: null, audiences: [], channels: [], voice: null, readiness: null } as BrandPayload
const inUse = { response: { status: 409, data: { error: 'audience_in_use', message: 'x', posts: 4 } } }

describe('removeAudience', () => {
  it('removes an audience nobody uses at once', async () => {
    const api = { deleteAudience: vi.fn(() => Promise.resolve(payload)) }
    const ask = vi.fn(() => true)
    await expect(removeAudience(api, 3, ask)).resolves.toBe(payload)
    expect(ask).not.toHaveBeenCalled()
    expect(api.deleteAudience).toHaveBeenCalledWith(3, false)
  })

  it('asks with the number of posts first, and removes only after a yes', async () => {
    const api = { deleteAudience: vi.fn((_: number, confirm: boolean) => (confirm ? Promise.resolve(payload) : Promise.reject(inUse))) }
    const no = vi.fn(() => false)
    await expect(removeAudience(api, 3, no)).resolves.toBeNull()
    expect(no).toHaveBeenCalledWith(4)
    expect(api.deleteAudience).toHaveBeenCalledTimes(1)
    await expect(removeAudience(api, 3, () => true)).resolves.toBe(payload)
    expect(api.deleteAudience).toHaveBeenLastCalledWith(3, true)
  })

  it('passes any other refusal on', async () => {
    const api = { deleteAudience: vi.fn(() => Promise.reject({ response: { status: 403, data: { error: 'manager_only' } } })) }
    await expect(removeAudience(api, 3, () => true)).rejects.toBeTruthy()
  })
})

describe('saving audiences and channels', () => {
  it('creates a new audience with its fields, and edits one by id with only what changed (marking it a person\'s, not the AI\'s)', async () => {
    const api = { createAudience: vi.fn(() => Promise.resolve({ ...payload, audience: {} as Audience })), updateAudience: vi.fn(() => Promise.resolve({ ...payload, audience: {} as Audience })) }
    const adopt = vi.fn()
    await saveAudience({ api, adopt }, null, { ...audienceForm(null), name: 'Busy parents', pain_points: ['No time'] })
    expect(api.createAudience).toHaveBeenCalledWith(expect.objectContaining({ name: 'Busy parents', pain_points: ['No time'] }))
    const existing = { id: 5, name: 'Students', is_ai_assumed: true, posts_count: 2 } as Audience
    await saveAudience({ api, adopt }, existing, { ...audienceForm(existing), country: 'Latvia' })
    expect(api.updateAudience).toHaveBeenCalledWith(5, { country: 'Latvia', is_ai_assumed: false })
    expect(adopt).toHaveBeenCalledTimes(2)
  })

  it('reads the Plan again after any channel change, so slots follow the channels', async () => {
    const api = {
      createChannel: vi.fn(() => Promise.resolve({ ...payload, channel: {} as Channel })),
      updateChannel: vi.fn(() => Promise.resolve({ ...payload, channel: {} as Channel })),
      deleteChannel: vi.fn(() => Promise.resolve(payload)),
    }
    const adopt = vi.fn()
    const refresh = vi.fn()
    await saveChannel({ api, adopt, refresh }, null, channelForm(null, 'instagram'))
    expect(api.createChannel).toHaveBeenCalledWith(expect.objectContaining({ platform: 'instagram', label: 'instagram', active: true, frequency: { mon: true, tue: false, wed: true, thu: false, fri: true, sat: false, sun: false } }))
    const channel = { id: 6, platform: 'linkedin', label: 'LinkedIn', active: true, frequency: { tue: true }, posts_per_week: 2 } as Channel
    await saveChannel({ api, adopt, refresh }, channel, { ...channelForm(channel, 'linkedin'), active: false })
    expect(api.updateChannel).toHaveBeenCalledWith(6, { active: false })
    await removeChannel({ api, adopt, refresh }, 6)
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(adopt).toHaveBeenCalledTimes(3)
  })

  it('sends nothing for an untouched channel, and reads days as all seven', () => {
    const channel = { id: 6, platform: 'linkedin', label: 'LinkedIn', active: true, frequency: null, posts_per_week: null } as Channel
    expect(changedFields(channelFields(channelForm(channel, 'linkedin')), channelFields(channelForm(channel, 'linkedin')))).toEqual({})
    expect(channelForm(channel, 'linkedin').days).toEqual({ mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })
  })
})
```

Create `frontend/src/content/brand/brandLists.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import type { Audience, Channel } from '../lib/types'
import { brandWith, renderBrand } from './brandTesting'
import { AudiencesSection } from './sections/Audiences'
import { ChannelsSection } from './sections/Channels'

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

const audience = { id: 5, name: 'Busy parents', job_role: 'Parent', industry: null, country: 'Latvia', pain_points: ['No time'], goals: ['Look good fast'], is_ai_assumed: true, posts_count: 4 } as Audience
const channels = [
  { id: 6, platform: 'instagram', label: 'Instagram', active: true, frequency: { mon: true, wed: true, fri: true }, posts_per_week: 3 },
  { id: 7, platform: 'linkedin', label: 'LinkedIn', active: false, frequency: { tue: true }, posts_per_week: 1 },
] as Channel[]

describe('AudiencesSection', () => {
  it('lists each audience with what moves it and how many posts use it; only managers may change them', () => {
    const brand = brandWith({ audiences: [audience] })
    const staff = renderBrand(brand, false, <AudiencesSection brand={brand} canEdit={false} />)
    expect(staff).toContain('Busy parents')
    expect(staff).toContain('No time')
    expect(staff).toContain('Used by 4 posts')
    expect(staff).toContain('Assumed by the AI')
    expect(staff).not.toContain('Add audience')
    const manager = renderBrand(brand, true, <AudiencesSection brand={brand} canEdit />)
    expect(manager).toContain('Add audience')
    expect(manager).toContain('>Remove<')
  })

  it('opens the add form at once in Guided setup when there is no audience yet', () => {
    const brand = brandWith({ audiences: [] })
    const html = renderBrand(brand, true, <AudiencesSection brand={brand} canEdit startOpen onSaved={() => {}} />)
    expect(html).toContain('More about this audience')
    expect(html).toMatch(/<button[^>]*>Save</)
  })
})

describe('ChannelsSection', () => {
  it('lists each channel with its days, posts a week and whether it is on; only managers may change them', () => {
    const brand = brandWith({ channels })
    const staff = renderBrand(brand, false, <ChannelsSection brand={brand} canEdit={false} />)
    expect(staff).toContain('Instagram')
    expect(staff).toContain('Mon, Wed, Fri')
    expect(staff).toContain('3 posts a week')
    expect(staff).toContain('>Off<')
    expect(staff).not.toContain('Add channel')
    const manager = renderBrand(brand, true, <ChannelsSection brand={brand} canEdit />)
    expect(manager).toContain('Add channel')
    expect(manager).toContain('role="switch"')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R2C/vt.sh src/content/brand` → FAIL (modules missing).

- [ ] **Step 3: The forms and the actions**

Create `frontend/src/content/brand/listActions.ts`:

```ts
import { failureOf, type ContentApi } from '../lib/api'
import type { Audience, AudienceFields, BrandPayload, Channel, ChannelFields, Platform, Weekday } from '../lib/types'
import { asDays, asList, asText, changedFields, orNull } from './brandForms'

export interface AudienceForm {
  name: string; job_role: string; industry: string; country: string; business_size: string; language: string; description: string
  pain_points: string[]; goals: string[]; preferred_platforms: string[]; fears: string[]; objections: string[]; buying_triggers: string[]
  emotional_triggers: string[]; rational_triggers: string[]; questions: string[]; content_they_trust: string; desired_transformation: string
}

export const audienceForm = (a: Audience | null): AudienceForm => ({
  name: asText(a?.name), job_role: asText(a?.job_role), industry: asText(a?.industry), country: asText(a?.country),
  business_size: asText(a?.business_size), language: asText(a?.language), description: asText(a?.description),
  pain_points: asList(a?.pain_points), goals: asList(a?.goals), preferred_platforms: asList(a?.preferred_platforms),
  fears: asList(a?.fears), objections: asList(a?.objections), buying_triggers: asList(a?.buying_triggers),
  emotional_triggers: asList(a?.emotional_triggers), rational_triggers: asList(a?.rational_triggers), questions: asList(a?.questions),
  content_they_trust: asText(a?.content_they_trust), desired_transformation: asText(a?.desired_transformation),
})

export const audienceFields = (f: AudienceForm): AudienceFields => ({
  name: f.name.trim(), job_role: orNull(f.job_role), industry: orNull(f.industry), country: orNull(f.country),
  business_size: orNull(f.business_size), language: orNull(f.language), description: orNull(f.description),
  pain_points: f.pain_points, goals: f.goals, preferred_platforms: f.preferred_platforms, fears: f.fears, objections: f.objections,
  buying_triggers: f.buying_triggers, emotional_triggers: f.emotional_triggers, rational_triggers: f.rational_triggers, questions: f.questions,
  content_they_trust: orNull(f.content_they_trust), desired_transformation: orNull(f.desired_transformation),
})

export interface ChannelForm {
  platform: Platform; label: string; url: string; active: boolean; posts_per_week: string; days: Record<Weekday, boolean>; audience_id: string
  preferred_formats: string[]; emoji_policy: string; hashtag_policy: string; goal: string; role: string
  cta_style: string; visual_style: string; link_policy: string; tone_override: string; default_language: string
}

/** A channel as its form; a new one starts on Mon, Wed and Fri, three a week, named after its platform (as the old wizard did). */
export const channelForm = (c: Channel | null, platform: Platform): ChannelForm => ({
  platform: c?.platform ?? platform, label: c ? asText(c.label) : platform, url: asText(c?.url), active: c ? c.active : true,
  posts_per_week: c ? (c.posts_per_week === null || c.posts_per_week === undefined ? '' : String(c.posts_per_week)) : '3',
  days: c ? asDays(c.frequency) : asDays({ mon: true, wed: true, fri: true }), audience_id: c?.audience_id ? String(c.audience_id) : '',
  preferred_formats: asList(c?.preferred_formats), emoji_policy: asText(c?.emoji_policy), hashtag_policy: asText(c?.hashtag_policy),
  goal: asText(c?.goal), role: asText(c?.role), cta_style: asText(c?.cta_style), visual_style: asText(c?.visual_style),
  link_policy: asText(c?.link_policy), tone_override: asText(c?.tone_override), default_language: asText(c?.default_language),
})

export const channelFields = (f: ChannelForm): ChannelFields => ({
  platform: f.platform, label: f.label.trim(), url: orNull(f.url), active: f.active,
  posts_per_week: f.posts_per_week.trim() === '' ? null : Math.max(0, Math.min(21, Math.round(Number(f.posts_per_week) || 0))),
  frequency: f.days, audience_id: f.audience_id === '' ? null : Number(f.audience_id), preferred_formats: f.preferred_formats,
  emoji_policy: orNull(f.emoji_policy), hashtag_policy: orNull(f.hashtag_policy), goal: orNull(f.goal), role: orNull(f.role),
  cta_style: orNull(f.cta_style), visual_style: orNull(f.visual_style), link_policy: orNull(f.link_policy),
  tone_override: orNull(f.tone_override), default_language: orNull(f.default_language),
})

type Adopt = (payload: BrandPayload) => void

/** A new audience with everything it holds, or an edit by id with only what changed; a person's edit is no longer the AI's assumption. */
export async function saveAudience(
  { api, adopt }: { api: Pick<ContentApi, 'createAudience' | 'updateAudience'>; adopt: Adopt },
  audience: Audience | null, form: AudienceForm,
): Promise<void> {
  if (audience === null) {
    adopt(await api.createAudience(audienceFields(form)))
    return
  }
  const fields: AudienceFields = changedFields(audienceFields(audienceForm(audience)), audienceFields(form))
  if (Object.keys(fields).length === 0) return
  adopt(await api.updateAudience(audience.id, audience.is_ai_assumed ? { ...fields, is_ai_assumed: false } : fields))
}

/**
 * Remove an audience; one that posts use answers 409 with their number, and
 * is removed only when `ask(posts)` says yes (null: kept). Any other refusal is passed on.
 */
export async function removeAudience(api: Pick<ContentApi, 'deleteAudience'>, id: number, ask: (posts: number) => boolean): Promise<BrandPayload | null> {
  try {
    return await api.deleteAudience(id, false)
  } catch (error) {
    const failure = failureOf(error)
    if (failure.code !== 'audience_in_use') throw error
    if (!ask(failure.posts ?? 0)) return null
    return api.deleteAudience(id, true)
  }
}

/** A new channel, or an edit by id with only what changed; either way the Plan and Posts are read again (slots follow channels). */
export async function saveChannel(
  { api, adopt, refresh }: { api: Pick<ContentApi, 'createChannel' | 'updateChannel'>; adopt: Adopt; refresh: () => void },
  channel: Channel | null, form: ChannelForm,
): Promise<void> {
  if (channel === null) {
    adopt(await api.createChannel(channelFields(form)))
  } else {
    const fields = changedFields(channelFields(channelForm(channel, channel.platform)), channelFields(form))
    if (Object.keys(fields).length === 0) return
    adopt(await api.updateChannel(channel.id, fields))
  }
  refresh()
}

export async function removeChannel(
  { api, adopt, refresh }: { api: Pick<ContentApi, 'deleteChannel'>; adopt: Adopt; refresh: () => void }, id: number,
): Promise<void> {
  adopt(await api.deleteChannel(id))
  refresh()
}
```

- [ ] **Step 4: Audiences**

Create `frontend/src/content/brand/sections/Audiences.tsx`:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import { LANGUAGES, languageName } from '../../lib/languages'
import type { Audience, BrandPayload } from '../../lib/types'
import { ChoiceChips, ReadTags, SelectField, TagInput, TextField } from '../inputs'
import { audienceForm, removeAudience, saveAudience, type AudienceForm } from '../listActions'
import { useBrand } from '../useBrand'

function AudienceEditor({ audience, onDone, onCancel }: { audience: Audience | null; onDone: () => void; onCancel: (() => void) | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const { adopt } = useBrand()
  const [form, setForm] = useState<AudienceForm>(() => audienceForm(audience))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.audiences.${key}`, english)
  const set = (part: Partial<AudienceForm>) => setForm({ ...form, ...part })

  const save = async () => {
    if (form.name.trim() === '') {
      setError(w('name_required', 'Give the audience a name.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveAudience({ api, adopt }, audience, form)
      onDone()
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-a-border p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label={w('name', 'Name')} value={form.name} maxLength={255} required onChange={(name) => set({ name })} />
        <TextField label={w('job_role', 'Job or role')} value={form.job_role} onChange={(job_role) => set({ job_role })} />
        <TextField label={w('industry', 'Industry')} value={form.industry} onChange={(industry) => set({ industry })} />
        <TextField label={w('country', 'Country')} value={form.country} onChange={(country) => set({ country })} />
        <TextField label={w('size', 'Business size')} value={form.business_size} onChange={(business_size) => set({ business_size })} />
        <SelectField label={w('language', 'Language')} value={form.language} empty={w('language_brand', 'The brand language')}
          options={LANGUAGES.map(code => [code, languageName(code, locale)])} onChange={(language) => set({ language })} />
        <TagInput label={w('pains', 'Pain points')} values={form.pain_points} onChange={(pain_points) => set({ pain_points })} />
        <TagInput label={w('goals', 'Goals')} values={form.goals} onChange={(goals) => set({ goals })} />
        <div className="md:col-span-2">
          <ChoiceChips label={w('platforms', 'Where they are')} options={boot.platforms.map(p => [p, t(`content.platform.${p}`, p)])}
            values={form.preferred_platforms} onChange={(preferred_platforms) => set({ preferred_platforms })} />
        </div>
      </div>
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm font-medium text-a-accent-text">{w('more', 'More about this audience')}</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TagInput label={w('fears', 'Fears')} values={form.fears} onChange={(fears) => set({ fears })} />
          <TagInput label={w('objections', 'Objections')} values={form.objections} onChange={(objections) => set({ objections })} />
          <TagInput label={w('buying', 'What makes them buy')} values={form.buying_triggers} onChange={(buying_triggers) => set({ buying_triggers })} />
          <TagInput label={w('emotional', 'Emotional triggers')} values={form.emotional_triggers} onChange={(emotional_triggers) => set({ emotional_triggers })} />
          <TagInput label={w('rational', 'Rational triggers')} values={form.rational_triggers} onChange={(rational_triggers) => set({ rational_triggers })} />
          <TagInput label={w('questions', 'Their questions')} values={form.questions} onChange={(questions) => set({ questions })} />
          <TextField label={w('trust', 'Content they trust')} value={form.content_they_trust} rows={2} onChange={(content_they_trust) => set({ content_they_trust })} />
          <TextField label={w('transformation', 'What they want to change')} value={form.desired_transformation} rows={2} onChange={(desired_transformation) => set({ desired_transformation })} />
          <div className="md:col-span-2"><TextField label={w('description', 'Description')} value={form.description} rows={3} onChange={(description) => set({ description })} /></div>
        </div>
      </details>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button onClick={() => { void save() }} loading={busy}>{t('content.brand.save', 'Save')}</Button>
        {onCancel && <Button variant="secondary" disabled={busy} onClick={onCancel}>{t('content.common.cancel', 'Cancel')}</Button>}
      </div>
    </div>
  )
}

/**
 * Audiences (spec §4.6): who the posts speak to. Each keeps its id when
 * edited; removing one that posts use first says how many and asks (§7 F1).
 */
export function AudiencesSection({ brand, canEdit, startOpen = false, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const { adopt } = useBrand()
  const [open, setOpen] = useState<number | 'new' | null>(() => (startOpen && canEdit && brand.audiences.length === 0 ? 'new' : null))
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const w = (key: string, english: string) => t(`content.brand.audiences.${key}`, english)

  const remove = async (audience: Audience) => {
    if (!window.confirm(w('remove_confirm', 'Remove this audience?'))) return
    setNote(null)
    try {
      const answer = await removeAudience(api, audience.id, (posts) =>
        window.confirm(t('content.brand.audiences.remove_in_use', '{{count}} posts use this audience. Remove it anyway? Those posts keep everything else.', { count: posts })))
      if (answer) {
        adopt(answer)
        void queryClient.invalidateQueries({ queryKey: ['content', brandId, 'post'] }) // open posts lose the audience
        setNote({ tone: 'success', text: w('removed', 'Audience removed.') })
      }
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    }
  }
  const done = () => { setOpen(null); onSaved?.() }

  return (
    <section aria-labelledby="content-audiences" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-audiences" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Audiences')}</h2>
          <p className="text-sm text-a-text-2">{w('intro', 'Who the posts speak to.')}</p>
        </div>
        {canEdit && open === null && <Button size="sm" variant="secondary" onClick={() => setOpen('new')}><Plus size={14} aria-hidden />{w('add', 'Add audience')}</Button>}
      </div>
      {brand.audiences.length === 0 && open !== 'new' && <p className="text-sm text-a-text-2">{w('none', 'No audience yet.')}</p>}
      <ul className="space-y-3">
        {brand.audiences.map(audience => (
          <li key={audience.id}>
            {open === audience.id
              ? <AudienceEditor audience={audience} onDone={done} onCancel={() => setOpen(null)} />
              : (
                <div className="space-y-2 rounded-lg border border-a-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-a-text">{audience.name}</p>
                    {audience.is_ai_assumed && <span className="rounded-full border border-a-border px-2 py-0.5 text-xs text-a-text-2">{w('assumed', 'Assumed by the AI')}</span>}
                    <span className="text-xs text-a-text-2">{t('content.brand.audiences.used', 'Used by {{count}} posts', { count: audience.posts_count })}</span>
                    {canEdit && open === null && (
                      <span className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setOpen(audience.id)}>{t('content.brand.edit', 'Edit')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => { void remove(audience) }}>{w('remove', 'Remove')}</Button>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-a-text-2">{[audience.job_role, audience.industry, audience.country].filter(Boolean).join(' · ')}</p>
                  <dl className="grid gap-2 md:grid-cols-2">
                    <ReadTags label={w('pains', 'Pain points')} values={audience.pain_points ?? []} />
                    <ReadTags label={w('goals', 'Goals')} values={audience.goals ?? []} />
                  </dl>
                </div>
              )}
          </li>
        ))}
      </ul>
      {open === 'new' && <AudienceEditor audience={null} onDone={done} onCancel={onSaved ? null : () => setOpen(null)} />}
      {note && <p role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</p>}
    </section>
  )
}
```

- [ ] **Step 5: Channels**

Create `frontend/src/content/brand/sections/Channels.tsx`:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { addDays, formatDate } from '../../../workspace/lib/wallClock'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import { LANGUAGES, languageName } from '../../lib/languages'
import { CHANNEL_DAYS, EMOJI_POLICIES, HASHTAG_POLICIES, optionText } from '../../lib/options'
import { refreshLists } from '../../lib/planCache'
import type { BrandPayload, Channel, Platform } from '../../lib/types'
import { PlatformMark } from '../../ui/PlatformMark'
import { asDays } from '../brandForms'
import { Segmented, SelectField, TagInput, TextField, INPUT } from '../inputs'
import { channelForm, removeChannel, saveChannel, type ChannelForm } from '../listActions'
import { useBrand } from '../useBrand'

/** A Monday: posting days are named from it in the reader's language. */
const A_MONDAY = '2026-10-12'
const dayShort = (i: number, locale: string) => formatDate(addDays(A_MONDAY, i), locale, { weekday: 'short' })

function ChannelEditor({ channel, onDone, onCancel }: { channel: Channel | null; onDone: () => void; onCancel: (() => void) | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const { brand, adopt } = useBrand()
  const [form, setForm] = useState<ChannelForm>(() => channelForm(channel, boot.platforms[0] ?? 'instagram'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.channels.${key}`, english)
  const set = (part: Partial<ChannelForm>) => setForm({ ...form, ...part })
  const choices = (group: 'emoji' | 'hashtag', map: Record<string, string>) => Object.keys(map).map(v => [v, optionText(t, group, v)] as [string, string])

  const save = async () => {
    if (form.label.trim() === '') {
      setError(w('label_required', 'Give the channel a name.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveChannel({ api, adopt, refresh: () => { void refreshLists(queryClient, brandId) } }, channel, form)
      onDone()
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-a-border p-3">
      <div className="grid gap-3 md:grid-cols-2">
        {channel === null
          ? <SelectField label={w('platform', 'Platform')} value={form.platform} empty="—" options={boot.platforms.map(p => [p, t(`content.platform.${p}`, p)])}
              onChange={(platform) => { if (platform !== '') set({ platform: platform as Platform, label: form.label === form.platform ? platform : form.label }) }} />
          : <p className="flex items-center gap-2 text-sm text-a-text"><PlatformMark platform={channel.platform} />{t(`content.platform.${channel.platform}`, channel.platform)}</p>}
        <TextField label={w('label', 'Name')} value={form.label} maxLength={255} required onChange={(label) => set({ label })} />
        <TextField label={w('url', 'Link')} value={form.url} maxLength={255} onChange={(url) => set({ url })} />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{w('posts_per_week', 'Posts per week')}</span>
          <input type="number" min={0} max={21} value={form.posts_per_week} onChange={(e) => set({ posts_per_week: e.target.value })} className={`${INPUT} border-a-border`} />
        </label>
        <div className="md:col-span-2" role="group" aria-label={w('days', 'Posting days')}>
          <span className="mb-1 block text-xs font-medium text-a-text-2">{w('days', 'Posting days')}</span>
          <div className="flex flex-wrap gap-1.5">
            {CHANNEL_DAYS.map((day, i) => (
              <button key={day} type="button" aria-pressed={form.days[day]} onClick={() => set({ days: { ...form.days, [day]: !form.days[day] } })}
                className={`min-w-[3rem] rounded-full border px-2.5 py-1 text-xs font-medium ${form.days[day] ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                {dayShort(i, locale)}
              </button>
            ))}
          </div>
        </div>
        <SelectField label={w('audience', 'Audience')} value={form.audience_id} empty={w('audience_none', 'All audiences')}
          options={(brand?.audiences ?? []).map(a => [String(a.id), a.name])} onChange={(audience_id) => set({ audience_id })} />
        <TagInput label={w('formats', 'Formats')} values={form.preferred_formats} onChange={(preferred_formats) => set({ preferred_formats })} />
        <Segmented label={t('content.brand.voice.emoji', 'Emoji')} options={choices('emoji', EMOJI_POLICIES)} value={form.emoji_policy} onChange={(emoji_policy) => set({ emoji_policy })} />
        <Segmented label={t('content.brand.voice.hashtags', 'Hashtags')} options={choices('hashtag', HASHTAG_POLICIES)} value={form.hashtag_policy} onChange={(hashtag_policy) => set({ hashtag_policy })} />
        <TextField label={w('goal', 'Goal')} value={form.goal} rows={2} onChange={(goal) => set({ goal })} />
        <TextField label={w('role', 'Role of the channel')} value={form.role} rows={2} onChange={(role) => set({ role })} />
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-a-accent-text">{w('more', 'More rules')}</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextField label={w('cta_style', 'Call-to-action style')} value={form.cta_style} onChange={(cta_style) => set({ cta_style })} />
          <TextField label={w('visual_style', 'Visual style')} value={form.visual_style} onChange={(visual_style) => set({ visual_style })} />
          <TextField label={w('link_policy', 'Links')} value={form.link_policy} onChange={(link_policy) => set({ link_policy })} />
          <TextField label={w('tone_override', 'Tone on this channel')} value={form.tone_override} onChange={(tone_override) => set({ tone_override })} />
          <SelectField label={w('language', 'Language')} value={form.default_language} empty={w('language_brand', 'The brand language')}
            options={LANGUAGES.map(code => [code, languageName(code, locale)])} onChange={(default_language) => set({ default_language })} />
        </div>
      </details>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button onClick={() => { void save() }} loading={busy}>{t('content.brand.save', 'Save')}</Button>
        {onCancel && <Button variant="secondary" disabled={busy} onClick={onCancel}>{t('content.common.cancel', 'Cancel')}</Button>}
      </div>
    </div>
  )
}

/**
 * Channels (spec §4.6): where the brand posts, on which days and how often —
 * the Plan's empty slots come from here, so every change reads the Plan
 * again. Each keeps its id; a switch turns one off without losing it.
 */
export function ChannelsSection({ brand, canEdit, startOpen = false, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const { adopt } = useBrand()
  const [open, setOpen] = useState<number | 'new' | null>(() => (startOpen && canEdit && brand.channels.length === 0 ? 'new' : null))
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const w = (key: string, english: string) => t(`content.brand.channels.${key}`, english)
  const deps = { api, adopt, refresh: () => { void refreshLists(queryClient, brandId) } }

  const run = async (action: () => Promise<void>, success: string | null) => {
    setNote(null)
    try {
      await action()
      if (success) setNote({ tone: 'success', text: success })
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    }
  }
  const done = () => { setOpen(null); onSaved?.() }
  const daysText = (channel: Channel) => {
    const days = asDays(channel.frequency)
    const on = CHANNEL_DAYS.map((day, i) => (days[day] ? dayShort(i, locale) : null)).filter(Boolean)
    return on.length > 0 ? on.join(', ') : w('no_days', 'No posting days')
  }

  return (
    <section aria-labelledby="content-channels" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-channels" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Channels')}</h2>
          <p className="text-sm text-a-text-2">{w('intro', 'Where the brand posts, on which days and how often. The empty slots on the Plan come from here.')}</p>
        </div>
        {canEdit && open === null && <Button size="sm" variant="secondary" onClick={() => setOpen('new')}><Plus size={14} aria-hidden />{w('add', 'Add channel')}</Button>}
      </div>
      {brand.channels.length === 0 && open !== 'new' && <p className="text-sm text-a-text-2">{w('none', 'No channel yet. Add one to plan posts.')}</p>}
      <ul className="space-y-3">
        {brand.channels.map(channel => (
          <li key={channel.id}>
            {open === channel.id
              ? <ChannelEditor channel={channel} onDone={done} onCancel={() => setOpen(null)} />
              : (
                <div className={`flex flex-wrap items-center gap-3 rounded-lg border border-a-border p-3 ${channel.active ? '' : 'opacity-70'}`}>
                  <PlatformMark platform={channel.platform} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-a-text">{channel.label}</p>
                    <p className="text-xs text-a-text-2">
                      {daysText(channel)}
                      {channel.posts_per_week ? ` · ${t('content.brand.channels.per_week', '{{count}} posts a week', { count: channel.posts_per_week })}` : ''}
                    </p>
                  </div>
                  {canEdit ? (
                    <button type="button" role="switch" aria-checked={channel.active}
                      aria-label={t('content.brand.channels.switch', 'Posting on {{channel}}', { channel: channel.label })}
                      onClick={() => { void run(() => saveChannel(deps, channel, { ...channelForm(channel, channel.platform), active: !channel.active }), null) }}
                      className={`relative h-6 w-11 rounded-full transition ${channel.active ? 'bg-a-accent' : 'bg-a-surface-2'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${channel.active ? 'left-[1.375rem]' : 'left-0.5'}`} />
                    </button>
                  ) : (
                    <span className="rounded-full border border-a-border px-2 py-0.5 text-xs text-a-text-2">{channel.active ? w('on', 'On') : w('off', 'Off')}</span>
                  )}
                  {canEdit && open === null && (
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setOpen(channel.id)}>{t('content.brand.edit', 'Edit')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (window.confirm(w('remove_confirm', 'Remove this channel? Its empty slots leave the Plan.'))) void run(() => removeChannel(deps, channel.id), w('removed', 'Channel removed.'))
                      }}>{w('remove', 'Remove')}</Button>
                    </span>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
      {open === 'new' && <ChannelEditor channel={null} onDone={done} onCancel={onSaved ? null : () => setOpen(null)} />}
      {note && <p role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</p>}
    </section>
  )
}
```

- [ ] **Step 6: The page shows them**

In `BrandPage.tsx`, import both and order the sections as the spec lists them: `BrandDnaSection`, `AudiencesSection`, `VoiceSection`, `PositioningSection`, `ChannelsSection`, `RhythmSection`.

- [ ] **Step 7: The words**

The `"brand"` group gains nested objects `"audiences"` and `"channels"`:

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `audiences.title` | Audiences | Аудитории | Zielgruppen | Audiences | Audiencias |
| `audiences.intro` | Who the posts speak to. | К кому обращаются посты. | An wen sich die Beiträge richten. | À qui s’adressent les publications. | A quién hablan las publicaciones. |
| `audiences.add` | Add audience | Добавить аудиторию | Zielgruppe hinzufügen | Ajouter une audience | Añadir audiencia |
| `audiences.remove` | Remove | Удалить | Entfernen | Supprimer | Quitar |
| `audiences.remove_confirm` | Remove this audience? | Удалить эту аудиторию? | Diese Zielgruppe entfernen? | Supprimer cette audience ? | ¿Quitar esta audiencia? |
| `audiences.remove_in_use` | {{count}} posts use this audience. Remove it anyway? Those posts keep everything else. | Эту аудиторию используют посты: {{count}}. Всё равно удалить? Остальное в этих постах сохранится. | {{count}} Beiträge nutzen diese Zielgruppe. Trotzdem entfernen? Alles andere an diesen Beiträgen bleibt. | {{count}} publications utilisent cette audience. La supprimer quand même ? Le reste de ces publications est conservé. | {{count}} publicaciones usan esta audiencia. ¿Quitarla de todos modos? Lo demás de esas publicaciones se mantiene. |
| `audiences.removed` | Audience removed. | Аудитория удалена. | Zielgruppe entfernt. | Audience supprimée. | Audiencia quitada. |
| `audiences.used` | Used by {{count}} posts | Используют посты: {{count}} | Von {{count}} Beiträgen genutzt | Utilisée par {{count}} publications | Usada por {{count}} publicaciones |
| `audiences.assumed` | Assumed by the AI | Предположение ИИ | Von der KI angenommen | Supposée par l’IA | Supuesta por la IA |
| `audiences.none` | No audience yet. | Аудиторий пока нет. | Noch keine Zielgruppe. | Aucune audience pour l’instant. | Aún no hay audiencias. |
| `audiences.name` | Name | Название | Name | Nom | Nombre |
| `audiences.name_required` | Give the audience a name. | Дайте аудитории название. | Geben Sie der Zielgruppe einen Namen. | Donnez un nom à l’audience. | Pon un nombre a la audiencia. |
| `audiences.job_role` | Job or role | Профессия или роль | Beruf oder Rolle | Métier ou rôle | Profesión o función |
| `audiences.industry` | Industry | Отрасль | Branche | Secteur | Sector |
| `audiences.country` | Country | Страна | Land | Pays | País |
| `audiences.size` | Business size | Размер бизнеса | Unternehmensgröße | Taille de l’entreprise | Tamaño de la empresa |
| `audiences.language` | Language | Язык | Sprache | Langue | Idioma |
| `audiences.language_brand` | The brand language | Язык бренда | Sprache der Marke | La langue de la marque | El idioma de la marca |
| `audiences.pains` | Pain points | Боли | Probleme | Difficultés | Problemas |
| `audiences.goals` | Goals | Цели | Ziele | Objectifs | Objetivos |
| `audiences.platforms` | Where they are | Где они бывают | Wo sie unterwegs sind | Où on les trouve | Dónde están |
| `audiences.more` | More about this audience | Подробнее об аудитории | Mehr über diese Zielgruppe | En savoir plus sur cette audience | Más sobre esta audiencia |
| `audiences.fears` | Fears | Страхи | Ängste | Craintes | Miedos |
| `audiences.objections` | Objections | Возражения | Einwände | Objections | Objeciones |
| `audiences.buying` | What makes them buy | Что побуждает купить | Was sie zum Kauf bringt | Ce qui les fait acheter | Qué les hace comprar |
| `audiences.emotional` | Emotional triggers | Эмоциональные триггеры | Emotionale Auslöser | Déclencheurs émotionnels | Detonantes emocionales |
| `audiences.rational` | Rational triggers | Рациональные доводы | Rationale Auslöser | Arguments rationnels | Argumentos racionales |
| `audiences.questions` | Their questions | Их вопросы | Ihre Fragen | Leurs questions | Sus preguntas |
| `audiences.trust` | Content they trust | Контент, которому они доверяют | Inhalte, denen sie vertrauen | Les contenus auxquels ils font confiance | Contenido en el que confían |
| `audiences.transformation` | What they want to change | Что они хотят изменить | Was sie ändern wollen | Ce qu’ils veulent changer | Lo que quieren cambiar |
| `audiences.description` | Description | Описание | Beschreibung | Description | Descripción |
| `channels.title` | Channels | Каналы | Kanäle | Canaux | Canales |
| `channels.intro` | Where the brand posts, on which days and how often. The empty slots on the Plan come from here. | Где бренд публикуется, в какие дни и как часто. Отсюда берутся пустые слоты в плане. | Wo die Marke veröffentlicht, an welchen Tagen und wie oft. Die freien Plätze im Plan kommen von hier. | Où la marque publie, quels jours et à quelle fréquence. Les créneaux vides du plan viennent d’ici. | Dónde publica la marca, qué días y con qué frecuencia. Los huecos vacíos del plan salen de aquí. |
| `channels.add` | Add channel | Добавить канал | Kanal hinzufügen | Ajouter un canal | Añadir canal |
| `channels.remove` | Remove | Удалить | Entfernen | Supprimer | Quitar |
| `channels.remove_confirm` | Remove this channel? Its empty slots leave the Plan. | Удалить канал? Его пустые слоты исчезнут из плана. | Diesen Kanal entfernen? Seine freien Plätze verschwinden aus dem Plan. | Supprimer ce canal ? Ses créneaux vides quittent le plan. | ¿Quitar este canal? Sus huecos vacíos salen del plan. |
| `channels.removed` | Channel removed. | Канал удалён. | Kanal entfernt. | Canal supprimé. | Canal quitado. |
| `channels.none` | No channel yet. Add one to plan posts. | Каналов пока нет. Добавьте канал, чтобы планировать посты. | Noch kein Kanal. Fügen Sie einen hinzu, um Beiträge zu planen. | Aucun canal pour l’instant. Ajoutez-en un pour planifier. | Aún no hay canales. Añade uno para planificar publicaciones. |
| `channels.on` | On | Вкл. | An | Actif | Activo |
| `channels.off` | Off | Выкл. | Aus | Inactif | Inactivo |
| `channels.switch` | Posting on {{channel}} | Публикации в {{channel}} | Veröffentlichen auf {{channel}} | Publier sur {{channel}} | Publicar en {{channel}} |
| `channels.per_week` | {{count}} posts a week | постов в неделю: {{count}} | {{count}} Beiträge pro Woche | {{count}} publications par semaine | {{count}} publicaciones por semana |
| `channels.no_days` | No posting days | Дни публикаций не выбраны | Keine Veröffentlichungstage | Aucun jour de publication | Sin días de publicación |
| `channels.platform` | Platform | Платформа | Plattform | Plateforme | Plataforma |
| `channels.label` | Name | Название | Name | Nom | Nombre |
| `channels.label_required` | Give the channel a name. | Дайте каналу название. | Geben Sie dem Kanal einen Namen. | Donnez un nom au canal. | Pon un nombre al canal. |
| `channels.url` | Link | Ссылка | Link | Lien | Enlace |
| `channels.days` | Posting days | Дни публикаций | Veröffentlichungstage | Jours de publication | Días de publicación |
| `channels.posts_per_week` | Posts per week | Постов в неделю | Beiträge pro Woche | Publications par semaine | Publicaciones por semana |
| `channels.audience` | Audience | Аудитория | Zielgruppe | Audience | Audiencia |
| `channels.audience_none` | All audiences | Все аудитории | Alle Zielgruppen | Toutes les audiences | Todas las audiencias |
| `channels.formats` | Formats | Форматы | Formate | Formats | Formatos |
| `channels.goal` | Goal | Цель | Ziel | Objectif | Objetivo |
| `channels.role` | Role of the channel | Роль канала | Rolle des Kanals | Rôle du canal | Función del canal |
| `channels.more` | More rules | Другие правила | Weitere Regeln | Autres règles | Más reglas |
| `channels.cta_style` | Call-to-action style | Стиль призыва | Stil der Handlungsaufrufe | Style des appels à l’action | Estilo de llamada a la acción |
| `channels.visual_style` | Visual style | Визуальный стиль | Bildstil | Style visuel | Estilo visual |
| `channels.link_policy` | Links | Ссылки | Links | Liens | Enlaces |
| `channels.tone_override` | Tone on this channel | Тон в этом канале | Ton auf diesem Kanal | Ton sur ce canal | Tono en este canal |
| `channels.language` | Language | Язык | Sprache | Langue | Idioma |
| `channels.language_brand` | The brand language | Язык бренда | Sprache der Marke | La langue de la marque | El idioma de la marca |

- [ ] **Step 8: Run the tests, the types and the lint**

Run: `$R2C/vt.sh src/content` → all pass. `cd frontend && npx tsc -b` → clean. Scoped eslint → only the baseline error.

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: Brand — audiences and channels edited in place

Each keeps its id; removing an audience that posts use says how many and
asks first; every channel change reads the Plan again so its slots follow.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Brand — setting up a brand: Quick setup, Guided setup, Finish

**Files:**
- Create: `frontend/src/content/brand/setupDraft.ts`, `frontend/src/content/brand/setup/SetupChoice.tsx`, `frontend/src/content/brand/setup/QuickSetup.tsx`, `frontend/src/content/brand/setup/GuidedSetup.tsx`
- Modify: `frontend/src/content/brand/BrandPage.tsx` (the setup choice, the guided mode, sections only once a profile exists), `frontend/src/content/brand/sections/BrandDna.tsx` (`defaults` for a brand with no profile)
- Test: `frontend/src/content/brand/setupDraft.test.ts`, `frontend/src/content/brand/setup.test.tsx`
- Words: `content.brand.setup.*` in all five bundles

**Interfaces:**
- Consumes: `contentApi.quickSetup/finishSetup` (Task 2); `useBrand`, `ChoiceChips`, `Segmented`, `SelectField`, `TextField` (Task 6); every section with `startOpen`/`onSaved` (Tasks 6–8); `Dialog` (Plan B); `INTENSITIES`, `optionText`, `LANGUAGES`, `languageName`.
- Produces: `loadSetupStep(brand, storage?)`, `saveSetupStep(brand, step, storage?)`, `clearSetupStep(brand, storage?)`; `SetupChoice`, `QuickSetupDialog({ onClose })`, `GuidedSetup({ brand, onExit })`; `BrandDnaSection`'s `defaults?: Partial<DnaForm>`.

**How setup works (spec §4.6, §7 F6):**
- A brand with no profile: managers choose **Quick setup** (one AI call, `POST brand/quick-setup`, minutes; the brand comes back set up with the AI's assumptions to check) or **Guided setup** (the section editors one after another). Staff see "Your manager has not set up this brand yet" (Task 6).
- Guided setup saves each step on the server as it is done (the first step, Brand DNA with the brand's name filled in, creates the profile). What the device keeps per brand, under `content:setup-draft:{brand}`, is where the manager is, so leaving and coming back resumes there. The last step, Finish, sends `POST brand/setup` and forgets the place.
- A profile that exists but is not set up (a Guided setup left half-way, or an old wizard draft) shows the same choice with "Continue setup".
- `Ruling` for the ledger at Step 1: F6 names a "draft kept per brand on the device"; since every step is saved on the server as it is done, the device keeps the step reached (the only thing not on the server), not field values — cost if wrong: unsaved edits inside one step are lost on reload, as for any section.

- [ ] **Step 1: Write the failing tests** (and write the ruling above into `$R2C/progress.md`)

Create `frontend/src/content/brand/setupDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clearSetupStep, loadSetupStep, saveSetupStep } from './setupDraft'

const memory = () => {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, removeItem: (k: string) => { map.delete(k) }, map }
}

describe('the Guided setup place, per brand on this device', () => {
  it('keeps each brand\'s step under its own key', () => {
    const storage = memory()
    saveSetupStep(3, 2, storage)
    saveSetupStep(7, 5, storage)
    expect(storage.map.get('content:setup-draft:3')).toBe('2')
    expect(loadSetupStep(3, storage)).toBe(2)
    expect(loadSetupStep(7, storage)).toBe(5)
    expect(loadSetupStep(9, storage)).toBeNull()
  })

  it('forgets it when setup is finished, and reads anything odd as no place', () => {
    const storage = memory()
    saveSetupStep(3, 2, storage)
    clearSetupStep(3, storage)
    expect(loadSetupStep(3, storage)).toBeNull()
    storage.setItem('content:setup-draft:3', 'banana')
    expect(loadSetupStep(3, storage)).toBeNull()
    storage.setItem('content:setup-draft:3', '-1')
    expect(loadSetupStep(3, storage)).toBeNull()
  })

  it('works without storage at all (private windows), keeping nothing', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    expect(() => saveSetupStep(3, 1, broken)).not.toThrow()
    expect(loadSetupStep(3, broken)).toBeNull()
  })
})
```

Create `frontend/src/content/brand/setup.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { brandWith, profile, renderBrand } from './brandTesting'
import { GuidedSetup } from './setup/GuidedSetup'
import { QuickSetupDialog } from './setup/QuickSetup'

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

const empty = { profile: null, audiences: [], channels: [], voice: null, readiness: null }

describe('setting up a brand', () => {
  it('offers managers Quick setup and Guided setup when the brand has no profile, and no sections yet', () => {
    const html = renderBrand(empty, true)
    expect(html).toContain('Set up this brand')
    expect(html).toContain('>Quick setup<')
    expect(html).toContain('>Guided setup<')
    expect(html).not.toContain('Brand DNA')
  })

  it('offers to continue a setup that was started, beside the sections', () => {
    const html = renderBrand(brandWith({ profile: { ...profile, setup_completed_at: null } }), true)
    expect(html).toContain('Setup has started but is not finished.')
    expect(html).toContain('Continue setup')
    expect(html).toContain('Brand DNA')
  })

  it('shows staff no setup buttons', () => {
    const html = renderBrand(empty, false)
    expect(html).not.toContain('>Quick setup<')
    expect(html).toContain('Your manager has not set up this brand yet.')
  })

  it('asks Quick setup for the essentials, waiting for at least one platform', () => {
    const html = renderBrand(empty, true, <QuickSetupDialog onClose={() => {}} />)
    expect(html).toContain('value="Lumière Salon"')
    expect(html).toContain('Where the brand posts')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Standard</)
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>Set up with AI</)
  })

  it('walks Guided setup from Brand DNA, with the brand\'s name filled in, step 1 of 7, no Skip before a profile exists', () => {
    const html = renderBrand(empty, true, <GuidedSetup brand={empty} onExit={() => {}} />)
    expect(html).toContain('Step 1 of 7')
    expect(html).toContain('Brand DNA')
    expect(html).toContain('value="Lumière Salon"')
    expect(html).not.toContain('Skip this step')
    expect(html).toContain('Leave setup')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$R2C/vt.sh src/content/brand` → FAIL (modules missing).

- [ ] **Step 3: The place on the device**

Create `frontend/src/content/brand/setupDraft.ts`:

```ts
/** Where a manager is in Guided setup, per brand on this device (spec §7 F6): `content:setup-draft:{brand}`. */
interface StorageLike { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void }

const keyOf = (brand: number | null) => `content:setup-draft:${brand ?? 'default'}`
const device = (): StorageLike | null => (typeof window === 'undefined' ? null : window.localStorage)

export function loadSetupStep(brand: number | null, storage: StorageLike | null = device()): number | null {
  try {
    const step = Number(storage?.getItem(keyOf(brand)) ?? NaN)
    return Number.isInteger(step) && step >= 0 ? step : null
  } catch {
    return null
  }
}

export function saveSetupStep(brand: number | null, step: number, storage: StorageLike | null = device()): void {
  try { storage?.setItem(keyOf(brand), String(step)) } catch { /* no storage: the place is not kept */ }
}

export function clearSetupStep(brand: number | null, storage: StorageLike | null = device()): void {
  try { storage?.removeItem(keyOf(brand)) } catch { /* nothing to forget */ }
}
```

- [ ] **Step 4: Brand DNA fills in the brand's name for a new profile**

In `sections/BrandDna.tsx`, give `BrandDnaSection` a `defaults?: Partial<DnaForm>` prop (export `DnaForm` as a type), and use it in `makeDraft`:

```tsx
      makeDraft={() => ({ ...dnaForm(brand), ...(brand.profile ? {} : defaults) })}
```

(With no profile the draft starts from the defaults, so the first Save sends the name and creates the profile.)

- [ ] **Step 5: The choice, Quick setup, Guided setup**

Create `frontend/src/content/brand/setup/SetupChoice.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { ListChecks, Sparkles } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'

/** A brand with no profile, or one not set up yet: the two ways in (spec §4.6), for managers. */
export function SetupChoice({ started, onQuick, onGuided }: { started: boolean; onQuick: () => void; onGuided: () => void }) {
  const { t } = useTranslation()
  const w = (key: string, english: string) => t(`content.brand.setup.${key}`, english)
  return (
    <section aria-labelledby="content-setup" className="space-y-4 rounded-xl border border-a-accent-text bg-a-surface p-4">
      <div className="space-y-0.5">
        <h2 id="content-setup" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Set up this brand')}</h2>
        <p className="text-sm text-a-text-2">{started ? w('not_finished', 'Setup has started but is not finished.') : w('intro', 'The AI needs to know the brand before it writes for it. Choose how to start.')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-a-border p-3">
          <p className="text-sm text-a-text-2">{w('quick_text', 'One AI call writes a first version from what HexaTech already knows about you. It takes a minute or two; you can change everything afterwards.')}</p>
          <Button size="sm" onClick={onQuick}><Sparkles size={14} aria-hidden />{w('quick', 'Quick setup')}</Button>
        </div>
        <div className="space-y-2 rounded-lg border border-a-border p-3">
          <p className="text-sm text-a-text-2">{w('guided_text', 'The sections one after another, at your own pace. Your place is kept on this device.')}</p>
          <Button size="sm" variant="secondary" onClick={onGuided}><ListChecks size={14} aria-hidden />{started ? w('continue', 'Continue setup') : w('guided', 'Guided setup')}</Button>
        </div>
      </div>
    </section>
  )
}
```

Create `frontend/src/content/brand/setup/QuickSetup.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import { LANGUAGES, languageName } from '../../lib/languages'
import { INTENSITIES, optionText } from '../../lib/options'
import type { Intensity, Platform } from '../../lib/types'
import { Dialog } from '../../ui/Dialog'
import { ChoiceChips, Segmented, SelectField, TextField } from '../inputs'
import { useBrand } from '../useBrand'

/**
 * Quick setup (spec §4.6): the essentials, then one AI call that sets the
 * brand up (it fills only what is empty); the AI's assumptions are shown to
 * check. It takes minutes: the dialog stays until it answers.
 */
export function QuickSetupDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const { adopt } = useBrand()
  const w = (key: string, english: string) => t(`content.brand.setup.${key}`, english)
  const [name, setName] = useState(boot.brand?.name ?? boot.organization.name)
  const [language, setLanguage] = useState(() => ((LANGUAGES as readonly string[]).includes(locale) ? locale : 'en'))
  const [goal, setGoal] = useState('')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [intensity, setIntensity] = useState<Intensity>('standard')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assumptions, setAssumptions] = useState<string[] | null>(null)
  const paused = boot.ai.status === 'over'

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const answer = await api.quickSetup({
        platforms: platforms as Platform[], intensity,
        ...(name.trim() ? { name: name.trim() } : {}), ...(language ? { default_language: language } : {}), ...(goal.trim() ? { primary_goal: goal.trim() } : {}),
      })
      adopt(answer)
      setAssumptions(answer.assumptions ?? [])
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={w('quick_title', 'Quick setup')} onClose={onClose} busy={busy}>
      {assumptions !== null ? (
        <div className="space-y-3">
          <Notice tone="success">{w('done', 'The brand is set up.')}</Notice>
          {assumptions.length > 0 && (
            <>
              <p className="text-sm text-a-text-2">{w('assumptions', 'What the AI assumed. Check these on the Brand page:')}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-a-text">{assumptions.map((line, i) => <li key={i}>{line}</li>)}</ul>
            </>
          )}
          <div className="flex justify-end"><Button onClick={onClose}>{t('content.common.close', 'Close')}</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <TextField label={w('name', 'Brand name')} value={name} maxLength={255} onChange={setName} />
          <SelectField label={w('language', 'Language of the posts')} value={language} empty="—" options={LANGUAGES.map(code => [code, languageName(code, locale)])} onChange={setLanguage} />
          <TextField label={w('goal', 'Main goal (optional)')} value={goal} rows={2} maxLength={500} onChange={setGoal} />
          <ChoiceChips label={w('platforms', 'Where the brand posts')} options={boot.platforms.map(p => [p, t(`content.platform.${p}`, p)])} values={platforms} onChange={setPlatforms} />
          <Segmented label={w('intensity', 'How often to post')} options={Object.keys(INTENSITIES).map(v => [v, optionText(t, 'intensity', v)])}
            value={intensity} onChange={(value) => setIntensity((value || 'standard') as Intensity)} />
          {busy && <p role="status" className="flex items-center gap-2 text-sm text-a-text-2"><Loader2 size={14} aria-hidden className="animate-spin" />{w('working', 'The AI is setting up the brand. This takes a minute or two.')}</p>}
          {paused && <Notice tone="warning">{t('content.brand.error.ai_budget_used_up', "This month's AI budget is used up.")}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>{t('content.common.cancel', 'Cancel')}</Button>
            <Button onClick={() => { void start() }} loading={busy} disabled={platforms.length === 0 || paused}>{w('start', 'Set up with AI')}</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
```

Create `frontend/src/content/brand/setup/GuidedSetup.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import { LANGUAGES } from '../../lib/languages'
import type { BrandPayload } from '../../lib/types'
import { AudiencesSection } from '../sections/Audiences'
import { BrandDnaSection } from '../sections/BrandDna'
import { ChannelsSection } from '../sections/Channels'
import { PositioningSection } from '../sections/Positioning'
import { RhythmSection } from '../sections/Rhythm'
import { VoiceSection } from '../sections/Voice'
import { clearSetupStep, loadSetupStep, saveSetupStep } from '../setupDraft'
import { useBrand } from '../useBrand'

const STEPS = ['dna', 'audiences', 'voice', 'positioning', 'channels', 'rhythm', 'finish'] as const
const STEP_TEXT: Record<(typeof STEPS)[number], [string, string]> = {
  dna: ['content.brand.dna.title', 'Brand DNA'], audiences: ['content.brand.audiences.title', 'Audiences'], voice: ['content.brand.voice.title', 'Voice'],
  positioning: ['content.brand.positioning.title', 'Positioning'], channels: ['content.brand.channels.title', 'Channels'],
  rhythm: ['content.brand.rhythm.title', 'Rhythm and goals'], finish: ['content.brand.setup.finish_title', 'Finish'],
}

/**
 * Guided setup (spec §4.6): the section editors one after another. Each step
 * is saved on the server as it is done (Brand DNA, first, creates the
 * profile, so it cannot be skipped before one exists); the device keeps
 * where the manager is (setupDraft.ts). Finish marks the brand set up.
 */
export function GuidedSetup({ brand, onExit }: { brand: BrandPayload; onExit: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const brandId = useBrandId()
  const { adopt } = useBrand()
  const [step, setStep] = useState(() => Math.min(loadSetupStep(brandId) ?? 0, STEPS.length - 1))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.setup.${key}`, english)
  const go = (next: number) => {
    const to = Math.max(0, Math.min(next, STEPS.length - 1))
    setStep(to)
    saveSetupStep(brandId, to)
  }
  const current = STEPS[step]
  const next = () => go(step + 1)
  const defaults = { name: boot.brand?.name ?? boot.organization.name, default_language: (LANGUAGES as readonly string[]).includes(locale) ? locale : 'en' }

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      adopt(await api.finishSetup())
      clearSetupStep(brandId)
      onExit()
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{t('content.brand.setup.step', 'Step {{step}} of {{total}}', { step: step + 1, total: STEPS.length })}</p>
        <ol className="flex flex-wrap gap-1.5">
          {STEPS.map((name, i) => (
            <li key={name} aria-current={i === step ? 'step' : undefined}
              className={`rounded-full px-2 py-0.5 text-xs ${i === step ? 'bg-a-accent/10 font-semibold text-a-text' : i < step ? 'text-a-text' : 'text-a-text-2'}`}>
              {t(STEP_TEXT[name][0], STEP_TEXT[name][1])}
            </li>
          ))}
        </ol>
        <Button size="sm" variant="ghost" onClick={onExit}>{w('leave', 'Leave setup')}</Button>
      </div>

      {current === 'dna' && <BrandDnaSection key="dna" brand={brand} canEdit startOpen defaults={defaults} onSaved={next} />}
      {current === 'audiences' && <AudiencesSection key="audiences" brand={brand} canEdit startOpen onSaved={() => {}} />}
      {current === 'voice' && <VoiceSection key="voice" brand={brand} canEdit startOpen onSaved={next} />}
      {current === 'positioning' && <PositioningSection key="positioning" brand={brand} canEdit startOpen onSaved={next} />}
      {current === 'channels' && <ChannelsSection key="channels" brand={brand} canEdit startOpen onSaved={() => {}} />}
      {current === 'rhythm' && <RhythmSection key="rhythm" brand={brand} canEdit startOpen onSaved={next} />}
      {current === 'finish' && (
        <section className="space-y-3 rounded-xl border border-a-border bg-a-surface p-4">
          <h2 className="font-a-display text-lg font-normal text-a-text">{w('finish_title', 'Finish')}</h2>
          <p className="text-sm text-a-text-2">{w('finish_text', 'That is everything. Finish the setup and the AI starts writing from this brand.')}</p>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button onClick={() => { void finish() }} loading={busy}>{w('finish', 'Finish setup')}</Button>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {step > 0 && <Button size="sm" variant="secondary" onClick={() => go(step - 1)}>{w('back', 'Back')}</Button>}
        {(current === 'audiences' || current === 'channels') && <Button size="sm" onClick={next}>{w('next', 'Next')}</Button>}
        {current !== 'finish' && current !== 'audiences' && current !== 'channels' && (current !== 'dna' || brand.profile !== null) && (
          <Button size="sm" variant="ghost" onClick={next}>{w('skip', 'Skip this step')}</Button>
        )}
      </div>
    </div>
  )
}
```

(Audiences and Channels can hold several: their step's own Save keeps the manager on the step to add another, and Next moves on.)

- [ ] **Step 6: The page**

Rewrite the body of `BrandPage.tsx` after the loading and error blocks as:

```tsx
      {brand && guided && <GuidedSetup brand={brand} onExit={() => setGuided(false)} />}
      {brand && !guided && (
        <>
          {!brand.profile && !canEdit && <Notice tone="info">{t('content.shell.not_set_up_staff', 'Your manager has not set up this brand yet.')}</Notice>}
          {canEdit && !brand.profile?.setup_completed_at && (
            <SetupChoice started={brand.profile !== null} onQuick={() => setQuick(true)} onGuided={() => setGuided(true)} />
          )}
          {brand.readiness && (
            <Readiness readiness={brand.readiness} canRefresh={canEdit && brand.profile !== null} lastSync={brand.profile?.last_knowledge_sync_at ?? null} locale={locale} onRefreshed={adopt} />
          )}
          {brand.profile && (
            <>
              <BrandDnaSection brand={brand} canEdit={canEdit} />
              <AudiencesSection brand={brand} canEdit={canEdit} />
              <VoiceSection brand={brand} canEdit={canEdit} />
              <PositioningSection brand={brand} canEdit={canEdit} />
              <ChannelsSection brand={brand} canEdit={canEdit} />
              <RhythmSection brand={brand} canEdit={canEdit} />
            </>
          )}
        </>
      )}
      {quick && <QuickSetupDialog onClose={() => setQuick(false)} />}
```

with `const [guided, setGuided] = useState(false)` and `const [quick, setQuick] = useState(false)` at the top, and the imports for `SetupChoice`, `QuickSetupDialog`, `GuidedSetup`, `useState`. (Task 6's test "tells staff when the brand is not set up yet" still holds; its manager tests have a set-up profile, so no choice shows.)

- [ ] **Step 7: The words**

The `"brand"` group gains a nested `"setup"` object:

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `setup.title` | Set up this brand | Настройте бренд | Diese Marke einrichten | Configurer cette marque | Configurar esta marca |
| `setup.intro` | The AI needs to know the brand before it writes for it. Choose how to start. | ИИ должен узнать бренд, прежде чем писать для него. Выберите, как начать. | Die KI muss die Marke kennen, bevor sie für sie schreibt. Wählen Sie, wie Sie beginnen. | L’IA doit connaître la marque avant d’écrire pour elle. Choisissez comment commencer. | La IA necesita conocer la marca antes de escribir para ella. Elige cómo empezar. |
| `setup.not_finished` | Setup has started but is not finished. | Настройка начата, но не завершена. | Die Einrichtung hat begonnen, ist aber nicht fertig. | La configuration a commencé mais n’est pas terminée. | La configuración ha empezado pero no está terminada. |
| `setup.quick` | Quick setup | Быстрая настройка | Schnelle Einrichtung | Configuration rapide | Configuración rápida |
| `setup.quick_title` | Quick setup | Быстрая настройка | Schnelle Einrichtung | Configuration rapide | Configuración rápida |
| `setup.quick_text` | One AI call writes a first version from what HexaTech already knows about you. It takes a minute or two; you can change everything afterwards. | ИИ одним запросом напишет первую версию по тому, что HexaTech уже о вас знает. Это займёт минуту-две; потом всё можно изменить. | Ein KI-Aufruf schreibt eine erste Fassung aus dem, was HexaTech schon über Sie weiß. Das dauert ein, zwei Minuten; danach können Sie alles ändern. | Un seul appel à l’IA écrit une première version à partir de ce que HexaTech sait déjà de vous. Cela prend une ou deux minutes ; tout reste modifiable ensuite. | Una sola llamada a la IA escribe una primera versión con lo que HexaTech ya sabe de ti. Tarda uno o dos minutos; después puedes cambiarlo todo. |
| `setup.guided` | Guided setup | Пошаговая настройка | Geführte Einrichtung | Configuration guidée | Configuración guiada |
| `setup.guided_text` | The sections one after another, at your own pace. Your place is kept on this device. | Разделы один за другим, в своём темпе. Место, где вы остановились, сохранится на этом устройстве. | Die Abschnitte nacheinander, in Ihrem Tempo. Wo Sie stehen, bleibt auf diesem Gerät gespeichert. | Les sections l’une après l’autre, à votre rythme. Votre avancée est gardée sur cet appareil. | Las secciones una tras otra, a tu ritmo. Tu avance se guarda en este dispositivo. |
| `setup.continue` | Continue setup | Продолжить настройку | Einrichtung fortsetzen | Reprendre la configuration | Continuar la configuración |
| `setup.name` | Brand name | Название бренда | Markenname | Nom de la marque | Nombre de la marca |
| `setup.language` | Language of the posts | Язык постов | Sprache der Beiträge | Langue des publications | Idioma de las publicaciones |
| `setup.goal` | Main goal (optional) | Главная цель (необязательно) | Hauptziel (optional) | Objectif principal (facultatif) | Objetivo principal (opcional) |
| `setup.platforms` | Where the brand posts | Где публикуется бренд | Wo die Marke veröffentlicht | Où la marque publie | Dónde publica la marca |
| `setup.intensity` | How often to post | Как часто публиковать | Wie oft veröffentlichen | À quelle fréquence publier | Con qué frecuencia publicar |
| `setup.start` | Set up with AI | Настроить с ИИ | Mit KI einrichten | Configurer avec l’IA | Configurar con IA |
| `setup.working` | The AI is setting up the brand. This takes a minute or two. | ИИ настраивает бренд. Это займёт минуту-две. | Die KI richtet die Marke ein. Das dauert ein, zwei Minuten. | L’IA configure la marque. Cela prend une ou deux minutes. | La IA está configurando la marca. Tarda uno o dos minutos. |
| `setup.done` | The brand is set up. | Бренд настроен. | Die Marke ist eingerichtet. | La marque est configurée. | La marca está configurada. |
| `setup.assumptions` | What the AI assumed. Check these on the Brand page: | Что предположил ИИ. Проверьте это на странице «Бренд»: | Was die KI angenommen hat. Prüfen Sie es auf der Seite „Marke“: | Ce que l’IA a supposé. Vérifiez-le sur la page « Marque » : | Lo que supuso la IA. Revísalo en la página «Marca»: |
| `setup.step` | Step {{step}} of {{total}} | Шаг {{step}} из {{total}} | Schritt {{step}} von {{total}} | Étape {{step}} sur {{total}} | Paso {{step}} de {{total}} |
| `setup.leave` | Leave setup | Выйти из настройки | Einrichtung verlassen | Quitter la configuration | Salir de la configuración |
| `setup.back` | Back | Назад | Zurück | Retour | Atrás |
| `setup.next` | Next | Далее | Weiter | Suivant | Siguiente |
| `setup.skip` | Skip this step | Пропустить шаг | Schritt überspringen | Passer cette étape | Saltar este paso |
| `setup.finish_title` | Finish | Готово | Abschluss | Terminer | Terminar |
| `setup.finish_text` | That is everything. Finish the setup and the AI starts writing from this brand. | Это всё. Завершите настройку, и ИИ начнёт писать, опираясь на этот бренд. | Das ist alles. Schließen Sie die Einrichtung ab, und die KI schreibt ab jetzt für diese Marke. | C’est tout. Terminez la configuration et l’IA écrira à partir de cette marque. | Eso es todo. Termina la configuración y la IA empezará a escribir a partir de esta marca. |
| `setup.finish` | Finish setup | Завершить настройку | Einrichtung abschließen | Terminer la configuration | Terminar la configuración |

- [ ] **Step 8: Run the tests, the types and the lint**

Run: `$R2C/vt.sh src/content` → all pass. `cd frontend && npx tsc -b` → clean. Scoped eslint → only the baseline error.

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -F - <<'EOF'
Content portal: Brand setup — Quick setup, Guided setup kept per brand on the device, Finish

A brand with no profile offers managers one AI call (with its assumptions
to check) or the sections one after another; each step saves as it goes,
the device keeps the step reached, and Finish marks the brand set up.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Release checks for Plan C — suites, build, eyes, runbook

**Files:**
- Create (ledger, not committed): `$R2C/seed.php`, `$R2C/unseed.php`, `$R2C/image.php` (copied from Plan B's archive), `$R2C/strategy.php`, `$R2C/tools/shots.mjs` (Plan C's screens), `$R2C/eyes.md`
- Modify: `docs/content-workspace.md` (the portal section gains Posts, Strategy and Brand)

**Interfaces:**
- Consumes: everything above; Plan B's tools (`.superpowers/sdd/archive/2026-10-14-content-workspace-r2b-portal/`).

- [ ] **Step 1: Every suite, the types, the lint**

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend
"$R2C/vt.sh" > "$R2C/final-vitest.txt"; grep -E "Test Files|Tests " "$R2C/final-vitest.txt"
npx tsc -b && echo TSC-CLEAN
npx eslint src/content src/workspace src/App.tsx | tail -3
cd .. && for p in tests/Feature/Content/ tests/Unit/Content/ tests/Feature/AdminAccess/ tests/Feature/ContentCalendar/; do echo "== $p"; XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test $p --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests:"; done
```
Expected: vitest — only the 3 `plannerMeta` failures; `TSC-CLEAN`; lint — the 1 baseline error; PHP — `Tests: 72 passed`, `3 passed`, `51 passed`, and ContentCalendar all passed.

- [ ] **Step 2: The build check** (the pages ride in the Content chunk, nothing in the admin's index)

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx vite build --outDir "$R2C/build" > "$R2C/build.txt" 2>&1; tail -3 "$R2C/build.txt"
grep -l "Pillar balance this month" "$R2C"/build/assets/*.js | xargs -n1 basename
grep -l "Pillar balance this month" "$R2C"/build/assets/index-*.js 2>/dev/null; echo "index must be absent above"
git -C .. checkout -- frontend/dist/stats.html 2>/dev/null; rm -rf "$R2C/build"; git -C .. status --short | grep -v '^??'; echo "nothing tracked above"
```
Expected: one `ContentApp-*.js` named; no `index-*.js`; the visualizer's `stats.html` restored (Plan B found the build rewrites it); no tracked change.

- [ ] **Step 3: The demo set** (local org 16; everything labelled, removed in Step 7)

```bash
A=.superpowers/sdd/archive/2026-10-14-content-workspace-r2b-portal
cp "$A/seed.php" "$A/unseed.php" "$A/image.php" "$R2C/" && mkdir -p "$R2C/tools" "$R2C/shots"
```

Create `$R2C/strategy.php`:

```php
<?php
// Plan 2C browser check: adds to seed.php's demo profile an active strategy (as the AI writes one), its two
// pillars with this month's posts on them, a voice and an audience. unseed.php removes all of it by profile.
use Illuminate\Support\Facades\DB;

$p = DB::table('content_planner_profiles')->where('organization_id', 16)->where('name', 'Browser check (content r2b)')->first();
if (!$p) { echo "NO_PROFILE\n"; return; }
$now = now();
$base = ['organization_id' => $p->organization_id, 'brand_id' => $p->brand_id, 'planner_profile_id' => $p->id, 'created_at' => $now, 'updated_at' => $now];
$output = [
    'title' => 'Autumn: healthy hair first',
    'brand_summary' => 'An organic salon for busy people who want hair that lasts.',
    'assumptions' => ['Most clients book on weekdays after work.'],
    'positioning_narrative' => ['old_way' => 'Quick cuts and harsh colour', 'new_way' => 'Hair health first, colour that lasts', 'beliefs' => ['Healthy hair is the best style'], 'key_messages' => ['Care, not speed']],
    'audience_map' => [['name' => 'Busy professionals', 'pains' => ['No time'], 'desires' => ['Look good with little effort']]],
    'content_pillars' => [
        ['name' => 'Hair care', 'description' => 'Everyday care that keeps colour and health', 'purpose' => 'Build trust', 'frequency_weight' => 60, 'example_topics' => ['Scalp health', 'Heat protection']],
        ['name' => 'Behind the chair', 'description' => 'The team and the work', 'purpose' => 'Show the people', 'frequency_weight' => 40, 'example_topics' => ['Meet the team']],
    ],
    'content_mix' => ['education' => 40, 'behind_the_scenes' => 30, 'social_proof' => 30],
    'weekly_rhythm' => ['monday' => ['role' => 'educational', 'description' => 'A care tip'], 'wednesday' => ['role' => 'proof', 'description' => 'A before and after'], 'friday' => ['role' => 'soft_conversion', 'description' => 'A weekend slot']],
    'platform_strategy' => ['instagram' => ['role' => 'Show the work', 'formats' => ['Reels', 'Carousels'], 'tone' => 'Warm']],
    'risks' => ['Too few photos of the work'],
    'next_actions' => ['Book a photo session', 'Collect three reviews'],
];
$strategy = DB::table('content_planner_strategies')->insertGetId($base + [
    'title' => $output['title'], 'summary' => 'For busy clients who want lasting hair', 'status' => 'active',
    'ai_output' => json_encode($output), 'content_mix' => json_encode($output['content_mix']),
]);
DB::table('content_planner_strategies')->insert(array_merge($base, ['title' => 'Summer: fresh colour', 'summary' => 'Last season', 'status' => 'superseded', 'ai_output' => json_encode(['title' => 'Summer: fresh colour', 'risks' => ['Heat']]), 'created_at' => $now->copy()->subMonths(3)]));
$pillars = [];
foreach ([['Hair care', 60], ['Behind the chair', 40]] as [$name, $weight]) {
    $pillars[] = DB::table('content_planner_pillars')->insertGetId($base + ['strategy_id' => $strategy, 'name' => $name, 'frequency_weight' => $weight, 'active' => true]);
}
// This month's posts carry the pillars: the first two on Hair care, the rest on Behind the chair.
foreach (DB::table('content_planner_posts')->where('planner_profile_id', $p->id)->whereNotNull('scheduled_date')->orderBy('id')->pluck('id') as $i => $post) {
    DB::table('content_planner_posts')->where('id', $post)->update(['pillar_id' => $pillars[$i < 2 ? 0 : 1]]);
}
DB::table('content_planner_brand_voices')->insert($base + ['name' => 'Default', 'tone' => 'warm', 'formality_level' => 'balanced', 'emoji_policy' => 'light', 'sentence_style' => 'short', 'point_of_view' => 'brand', 'forbidden_words' => json_encode(['cheap']), 'active' => true]);
DB::table('content_planner_audiences')->insert($base + ['name' => 'Busy professionals', 'job_role' => 'Office workers', 'country' => 'Latvia', 'pain_points' => json_encode(['No time']), 'goals' => json_encode(['Hair that lasts']), 'is_ai_assumed' => true, 'active' => true]);
DB::table('content_planner_profiles')->where('id', $p->id)->update(['usp' => 'Organic colour only', 'brand_values' => json_encode(['Care', 'Calm']), 'price_position' => 'premium', 'engagement_goals' => json_encode(['bookings', 'saves']), 'trend_mode' => 'trend_aware']);
echo "STRATEGY {$strategy}\n";
```

Run: `cd /c/wamp64/www/Hexa-Tech-content && for f in seed image strategy; do /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R2C/$f.php" | tail -1; done`
Expected: `PROFILE <id>`, `IMAGE <id>`, `STRATEGY <id>`.

Start the servers in the background (Plan B's way): the API `CORS_ALLOWED_ORIGINS=http://localhost:5173 $PHP artisan serve --port=8012 --no-reload` and Vite `VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort`.

- [ ] **Step 4: The screens**

Create `$R2C/tools/shots.mjs` by copying Plan B's (`cp .superpowers/sdd/archive/2026-10-14-content-workspace-r2b-portal/tools/shots.mjs "$R2C/tools/shots.mjs"`; it keeps the token minting, the session with look and language, and `shot`), then replace its `main()` with:

```js
async function waitFor(page, selector) {
  await page.waitForSelector(selector, { timeout: 90_000 })
  await page.waitForTimeout(800) // the brand and strategy reads land after the frame
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--font-render-hinting=none'] })
  const manager = mint(MANAGER)
  const staffMail = staffEmail()
  const staff = staffMail && staffMail.includes('@') ? mint(staffMail) : null
  const visit = async (token, url, name, options = {}, ready = 'main h1') => {
    const { context, page } = await session(browser, token, options)
    await page.goto(`${APP}${url}`, { timeout: 90_000 })
    await waitFor(page, ready)
    await shot(page, name)
    return { context, page }
  }
  try {
    let s = await visit(manager, '/content/posts', 'posts-light', {}, '[data-post-row]')
    await s.page.locator('select[aria-label="Status"]').selectOption('draft')
    await s.page.waitForTimeout(1500)
    await shot(s.page, 'posts-filtered-light')
    await s.page.locator('[data-post-row]').first().click()
    await s.page.waitForSelector('[data-panel] input')
    await shot(s.page, 'posts-panel-light')
    await s.context.close()

    s = await visit(manager, '/content/strategy', 'strategy-light', {}, '#content-balance')
    await s.page.getByRole('button', { name: 'New strategy' }).click()
    await s.page.waitForSelector('[aria-modal="true"]')
    await shot(s.page, 'strategy-new-light')
    await s.context.close()

    s = await visit(manager, '/content/brand', 'brand-light', {}, '#content-readiness')
    await s.page.locator('section[aria-labelledby="content-voice"]').getByRole('button', { name: 'Edit' }).click()
    await s.page.waitForTimeout(500)
    await shot(s.page, 'brand-voice-edit-light')
    await s.page.locator('#content-channels').scrollIntoViewIfNeeded()
    await shot(s.page, 'brand-channels-light')
    await s.context.close()

    // One screen each: [who, address, name, look, what to wait for].
    const singles = [
      [manager, '/content/strategy', 'strategy-dark', { theme: 'dark' }, '#content-balance'],
      [manager, '/content/strategy', 'strategy-ru', { lang: 'ru' }, '#content-balance'],
      [manager, '/content/brand', 'brand-dark', { theme: 'dark' }, '#content-readiness'],
      [manager, '/content/brand', 'brand-ru', { lang: 'ru' }, '#content-readiness'],
      [manager, '/content/brand', 'brand-phone', { width: 390, height: 844 }, '#content-readiness'],
      [manager, '/content/posts', 'posts-phone', { width: 390, height: 844 }, '[data-post-row]'],
      ...(staff ? [
        [staff, '/content/strategy', 'strategy-staff', {}, '#content-balance'],
        [staff, '/content/brand', 'brand-staff', {}, '#content-readiness'],
      ] : []),
    ]
    for (const [who, url, name, look, ready] of singles) {
      const one = await visit(who, url, name, look, ready)
      await one.context.close()
    }
    if (process.env.AI === '1') {
      s = await visit(manager, '/content/strategy', 'ai-strategy-start', {}, '#content-balance')
      await s.page.getByRole('button', { name: 'New strategy' }).click()
      await s.page.locator('[aria-modal="true"]').getByRole('button', { name: 'Make strategy' }).click()
      await s.page.waitForSelector('text=A new strategy is being made', { timeout: 30_000 })
      await shot(s.page, 'ai-strategy-running')
      // The job runs on the database queue: `$PHP artisan queue:work --stop-when-empty` in another shell (Step 5).
      await s.page.waitForSelector('text=A new strategy is being made', { state: 'detached', timeout: 600_000 })
      await s.page.waitForTimeout(1500)
      await shot(s.page, 'ai-strategy-done')
      await s.context.close()
    }
  } finally {
    await browser.close()
    dropTokens()
  }
  console.log(`${taken.length} screens: ${taken.join(', ')}${staff ? '' : ' (no active staff-role user in org 16: staff screens skipped)'}`)
}
```

Run: `cd "$R2C/tools" && node shots.mjs`
Expected: 16 screens (14 without an active staff-role user in org 16).

- [ ] **Step 5: Look with your eyes, and one real strategy**

Read every PNG in `$R2C/shots/`. Check, at least:
- Posts: rows readable at 1440 and 390, the filters on one wrapping line, the panel over the list, the filtered list shows only drafts.
- Strategy: the balance bars and target marks; the document's sections in order; past strategies select; dark legible; Russian words everywhere except what the AI wrote.
- Brand: readiness in the portal's words; each section's read view; the Voice editor's chips; channels with days and switches; staff see no Edit, no switch, no setup buttons; phone width has no sideways scroll.

Write one line per screen into `$R2C/eyes.md`. Anything wrong is fixed with a test where one can pin it, committed, ledgered as a `Ruling:` ("found by eyes"), and the screens are taken again.

When a local AI key is set (the `.env` has one; never print it): run `AI=1 node shots.mjs` and, once `ai-strategy-running` is taken, in a second shell `cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan queue:work --stop-when-empty --timeout=600`. Expected: `ai-strategy-done` shows the new strategy active, the old one among the past strategies. If no key, say so in `eyes.md` (spec §9).

- [ ] **Step 6: The runbook**

In `docs/content-workspace.md`, in "## The portal (`/content`, `frontend/src/content/`)", add after the **Find** bullet:

```markdown
- **Posts** (`/content/posts`): every post of the brand, newest scheduled first and those with no day last, 50 a page (`GET posts`). The search and the filters (status, platform, pillar, from–to, only posts with no day) live in the address, so a list can be shared; a value the address holds that cannot be used falls back to none. Archived posts show only when their status is chosen. A post's own link opens here when it has no day.
- **Strategy** (`/content/strategy`): the active strategy as a document, and this month's posts per pillar against the pillars' target weights (the server's `balance`). `?id=` shows a past one. Managers make a new one (a queued job: the list is read every 5 s while one is being made; after 15 minutes the page calls it stuck, when the server also lets a new one start), make a past one active, or archive one. Locally the job needs `php artisan queue:work`.
- **Brand** (`/content/brand`):
  - Readiness shows what is missing by code (`readiness.sections[].missing`, from `ContentKnowledgeService::GAPS`); `BrandTest` keeps the portal's words (`content.brand.gap.*`) and the codes equal. Refresh knowledge re-reads the organisation's FAQ, chatbot and services.
  - Sections — Brand DNA, Audiences, Voice, Positioning, Channels, Rhythm and goals — are read by everyone and edited by managers one at a time. Each section reads any stored shape, edits its own draft and saves only its own fields that changed; parts it does not show go back as they came. `name`, `default_language` and `trend_mode` are never sent empty (the server refuses null there).
  - Audiences and channels keep their ids. Removing an audience that posts use asks first with their number (`?confirm=1`); any channel change reads the Plan again, so its slots follow.
  - A brand with no profile: managers choose Quick setup (one AI call, minutes; the AI's assumptions are shown) or Guided setup (the sections in turn; each step saves as it goes; the device keeps the step reached under `content:setup-draft:{brand}`; Finish sends `POST brand/setup`). Staff are told their manager has not set it up yet.
- **Option lists** (tones, roles, mix categories, …) live in `content/lib/options.ts`, moved from the old planner; stored values are kept as they are and named under `content.options.*`.
```

- [ ] **Step 7: Undo everything temporary**

TaskStop the API and Vite tasks, then:

```bash
netstat -ano | grep -E ':(8012|5173) .*LISTENING' ; echo "must be empty"
cd /c/wamp64/www/Hexa-Tech-content
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R2C/unseed.php" | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo Laravel\Sanctum\PersonalAccessToken::where('name','content-r2b-shots')->count();" | tail -1
git status --short | grep -v '^??' ; echo "tracked files above must be only this plan's"
```
Expected: no port listening (a leftover Vite `node.exe`: check its command line names `Hexa-Tech-content`, then `taskkill //PID <pid> //F`), `REMOVED <id>`, `0`, only `docs/content-workspace.md` changed.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -F - <<'EOF'
Document HexaTech Content's Posts, Strategy and Brand pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline ed775aa9e..HEAD | cat
```
