# HexaTech Content — Release 2, Plan A: the Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give HexaTech Content its server: the workspace flag and sign-in payload, an operator command, and the `/v1/admin/content/*` API (bootstrap, plan, posts, single-post AI, generation, strategy, brand) with the AI gate and the spec's data fixes, all proved by PHP tests.

**Architecture:**
- **New API group.** A route group `admin/content` sits beside `admin/appointments`, behind `workspace:content` and a new `content.brand` middleware that pins every call to exactly one brand. Thin controllers in `App\Http\Controllers\Api\V1\Admin\Content\` call small services in `App\Services\Content\` and the existing Content Planner services.
- **Refusals.** They are `ContentRefused` exceptions that render `{error, message}`, the same pattern as `AppointmentRefused`.
- **AI spend.** It enters the shared ledger at its two real sources (`ContentPlanner\AiClient` for text, `ImageGenerationService` for images), so every AI call counts against the cap, including the old planner's until Plan B retires it.
  - Spec §6.5 sketches the recording going through `ContentAiGate`. This plan records straight into `AiUsageService` where each provider call is made instead: the gate runs once per request, a request can make several calls, and calls made outside a portal request (the strategy job, the old screens) must count too. The gate keeps the budget check and the lock.
- **Old screens keep working.** The old `/v1/admin/content-planner/*` routes stay until Plan B removes them together with the old screens.
- **One deploy.** Plans A and B ship together after Plan B (spec D8).

**Tech Stack:**
- Laravel 13 on PHP 8.4.20.
- PHPUnit through `artisan test`, on sqlite in memory, with `DatabaseTransactions` and schema traits, never `RefreshDatabase`.
- The Anthropic PHP SDK, behind the planner's `AiClient`.

**Spec:** `docs/superpowers/specs/2026-10-14-content-workspace-design.md`. This plan covers:
- §5 (roles, AI spend)
- §6.3 (flag, sign-in, command)
- §6.4 (API)
- §6.5 (server pieces)
- §6.6 (slots)
- §6.7 (brand)
- §6.8 (time)
- §6.9 (access map only)
- §7 (fixes F1–F8)
- the server half of §9

Plan B covers the portal, the way in, the retirements and the deploy. That includes:
- removing the `admin/content-planner` key;
- re-pointing `tests/Feature/ContentCalendar/` at the new route;
- the frontend proofs of §6.7, such as the portal's brand beating `loyalty-brand`.

## Global Constraints

- **Branch:**
  - Worktree `C:\wamp64\www\Hexa-Tech-content`, branch `feature/content-workspace` (tip `ec0eaf085` equals production `main`'s source).
  - Upstream is unset: never push it.
  - Never commit `frontend/dist`, `public/spa` or `resources/spa-shell`.
- **Ledger and tools:** `.superpowers/sdd/2026-10-14-content-workspace-r2a/`, git-ignored and called `$R2A` below.
- **PHP:**
  - Always `/c/wamp64/bin/php/php8.4.20/php.exe`.
  - Run tests **by directory or file**, never a bare `artisan test`, in the foreground, with `XDEBUG_MODE=off` and `--no-ansi`, and read the `Tests:` line yourself.
  - The worktree's `vendor/` is a **robocopy copy** (Task 1). Never use a junction.
- **Test fixtures:**
  - Every new test class uses `DatabaseTransactions` and `Tests\Concerns\SetsUpContentSchema` (Task 1), or the existing Appointments/AdminAccess fixtures where noted.
  - No network: `Http::preventStrayRequests()`. Calendar-path AI is faked with `Http::fake` (its transport uses Laravel's `Http`). Other AI services are **mocked** with Mockery, because `AiClient` and `ContextBuilder` are `final`.
- **Refusals:**
  - Every refusal is `{"error": <code>, "message": <sentence>}`.
  - Codes used by this plan: `workspace_disabled` (existing), `no_brand`, `no_profile`, `manager_only`, `not_found`, `ai_budget_used_up`, `already_generating`, `changed_elsewhere`, `published_cannot_move`, `slot_not_open`, `no_channels`, `ai_failed`, `audience_in_use`, `already_set_up`, `not_ready`, `generation_failed`.
  - Validation failures stay Laravel's 422 `{message, errors}`.
- **Roles (spec §5.1):**
  - Managers are staff role `super_admin` or `manager` in this organisation.
  - **Manager-only:** whole-calendar generation, strategy generate/activate/archive, every brand write (profile, voice, audiences, channels, quick setup, setup finish, refresh knowledge).
  - **Staff may:** everything else, including single-post AI and Fill a slot.
- **Brand:** every content query runs inside the one brand `content.brand` binds. Every id a request names must belong to this organisation **and** that brand (F2).
- **Time:** post dates and times are the venue's wall clock and are never converted. "Today" is `VenueClock::today($orgId)`. Compare `scheduled_date` with `whereDate`, never `whereBetween`: sqlite stores the date cast as `Y-m-d H:i:s`.
- **Schema:** no migration and no new table. AI strings written to `varchar` columns are cut with `mb_substr` to the column length (F8).
- **Old planner:** do not change the `ContentPlanner*Controller`s, their routes, or `admin/content-planner` in the access map. Plan B retires them.
- **Escapes:** write no `\u` escape sequences through the Write/Edit tools; they arrive as raw characters. Build such characters from code points.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The brand a request names is foreign, stale or not allowed.**
   - Cases: a stored brand from another organisation, a member restricted to one brand asking for another, or a multi-brand member asking for none.
   - Expected: the portal always works on one allowed brand, and the bootstrap names it.
   - Pinned by Task 3's `BootstrapTest`: falls back to the default, restricted to the assigned brand, 403 for another brand.
2. **A generation that fails part-way.** Expected: what was written stays, the answer says which days failed, and the brand's lock is released so the next attempt is not refused.
   - Pinned by Task 8's `GenerateTest::test_a_provider_failure_answers_503_and_frees_the_brand`.
3. **The venue's "today" in a zone ahead of UTC late in the evening.** Expected: open slots start from the venue's date, not the server's.
   - Pinned by Task 6's `PlanTest::test_slots_start_from_the_venues_today_not_the_servers`.
4. **The AI budget edges: no cap at all, 80 %, exactly 100 %.** Expected: never stopped without a cap, still running at 80 %, refused at 100 % before any provider call.
   - Pinned by Task 4's `AiGateTest`.
5. **An organisation on the Appointments plan.** Expected: no `content` key at sign-in, and every content call refused.
   - Pinned by Task 2's `SignInWorkspacesTest::test_an_appointments_only_organisation_has_no_content` and Task 3's `ContentGateTest::test_an_appointments_only_organisation_is_refused`.

---

## File map

```
app/Http/Middleware/ContentBrand.php                       NEW  pins one brand per content call
app/Console/Commands/ContentWorkspace.php                  NEW  workspace:content
app/Services/Content/ContentRefused.php                    NEW  {error,message} refusal
app/Services/Content/ContentAccess.php                     NEW  manager rule
app/Services/Content/ContentContext.php                    NEW  org/brand/profile of this request
app/Services/Content/ContentRules.php                      NEW  enums + validation (owned ids, column limits)
app/Services/Content/ContentAiGate.php                     NEW  budget check + one generation per brand
app/Services/Content/ContentPostPresenter.php              NEW  card/detail shapes
app/Services/Content/ContentSlots.php                      NEW  pure slot finder
app/Services/Content/ContentPlan.php                       NEW  plan answer, open slots, search
app/Services/Content/ContentBrandEditor.php                NEW  in-place brand edits, quick-setup payload
app/Http/Controllers/Api/V1/Admin/Content/{Bootstrap,Plan,Post,PostAi,Generation,Strategy,Brand}Controller.php  NEW
app/Models/Organization.php                                content default on, off on the Appointments plan, one landing
app/Support/AdminAccess/AccessMap.php                      admin/content key, product content
app/Services/AiUsageService.php                            IMAGE_PRICING + recordImage()
app/Services/ContentPlanner/AiClient.php                   records usage in the shared ledger
app/Services/ContentPlanner/ImageGenerationService.php     records images in the shared ledger
app/Services/ContentKnowledgeService.php                   readinessOf() (no write)
bootstrap/app.php                                          alias content.brand
routes/api.php                                             the admin/content group
tests/Concerns/SetsUpContentSchema.php                     NEW
tests/Feature/Content/*.php, tests/Unit/Content/ContentSlotsTest.php   NEW
tests/Feature/Appointments/{WorkspaceGateTest,SignInWorkspacesTest}.php, tests/Feature/AdminAccess/AppointmentsPlanTest.php   payload now carries content
docs/content-workspace.md                                  NEW  runbook (server half)
```

---

### Task 1: Rig, the test fixture, refusals, the manager rule and the request context

**Files:**
- Create:
  - `tests/Concerns/SetsUpContentSchema.php`
  - `app/Services/Content/ContentRefused.php`, `ContentAccess.php`, `ContentContext.php`
  - `tests/Feature/Content/ContentAccessTest.php`
- Rig: `vendor/` (robocopy), `.env` (copy), `$R2A`

**Interfaces:**
- Produces:
  - `ContentRefused(string $errorCode, string $message, int $status = 422, array $extra = [])`, rendering `{error, message} + extra`.
  - `ContentAccess::MANAGER_ROLES`, `ContentAccess::canManage(User): bool`, `ContentAccess::requireManager(User): void` (403 `manager_only`).
  - `ContentContext::orgId(): int`, `brandId(): int`, `brandsFor(User): Collection<Brand>`, `fallbackBrandId(?User): ?int`, `profile(): ?ContentPlannerProfile`, `requireProfile(): ContentPlannerProfile` (409 `no_profile`).
  - The fixture `SetsUpContentSchema`:
    - Properties: `$org`, `$brandId`, `$manager`, `$staffMember`, `$profile`.
    - Setup: `setUpContent(bool $withProfile = true)`.
    - Request helpers: `api(string $path)`, `asManager()`, `asStaffMember()`.
    - Data helpers: `makeProfile(int $brandId)`, `makePost(array $attributes = [])`, `secondBrand(bool $withProfile = true): array{0:int,1:?ContentPlannerProfile}`, `otherOrganization(): array{org, brandId, post, pillarId}`.
    - AI and budget helpers: `fakeAi(array $items, int $status = 200)`, `fakeAiTurns(list<array{0: array, 1: int}> $turns)`, `calendarReply(array $items): array`, `calendarItem(string $date, string $platform): array`, `setAiCap(int $cents, int $usedCents)` (clears the cached monthly total).
  - The fixture also creates `hotel_settings` (VenueClock and the accent read it).

- [ ] **Step 1: Rig the worktree** (PowerShell, then Git Bash)

```powershell
if ((Get-FileHash C:\wamp64\www\Hexa-Tech-atelier\composer.lock).Hash -eq (Get-FileHash C:\wamp64\www\Hexa-Tech-content\composer.lock).Hash) { 'composer.lock identical' } else { 'STOP: lockfiles differ' }
robocopy C:\wamp64\www\Hexa-Tech-atelier\vendor C:\wamp64\www\Hexa-Tech-content\vendor /E /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null; "robocopy exit $LASTEXITCODE (0-7 = success)"
Copy-Item C:\wamp64\www\Hexa-Tech-atelier\.env C:\wamp64\www\Hexa-Tech-content\.env
```

```bash
cd /c/wamp64/www/Hexa-Tech-content
git check-ignore -q vendor/autoload.php && git check-ignore -q .env && echo "vendor and .env are ignored"
mkdir -p .superpowers/sdd/2026-10-14-content-workspace-r2a
cat > .superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh <<'EOF'
#!/usr/bin/env bash
# One PHP test path, foreground, summary only: t.sh tests/Feature/Content/
cd /c/wamp64/www/Hexa-Tech-content && XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test "$@" --no-ansi 2>&1 | tail -25
EOF
chmod +x .superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
```
Expected: `composer.lock identical`, robocopy exit below 8, and `vendor and .env are ignored`. **Never print `.env`.**

- [ ] **Step 2: Record the PHP baseline** of the suites this plan touches:

```bash
cd /c/wamp64/www/Hexa-Tech-content && T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
for p in tests/Feature/Appointments/ tests/Feature/AdminAccess/ tests/Feature/ContentCalendar/ tests/Feature/RouteUniquenessTest.php tests/Feature/RouteControllersExistTest.php tests/Feature/Ai/; do echo "== $p"; $T $p | grep -E "Tests:|FAILED|Error" ; done | tee .superpowers/sdd/2026-10-14-content-workspace-r2a/baseline-php.txt
```
Expected: every path passes (`Tests: N passed`). Write the numbers down; any later failure in these paths is ours to fix.

- [ ] **Step 3: Write the fixture** `tests/Concerns/SetsUpContentSchema.php`:

```php
<?php

namespace Tests\Concerns;

use App\Models\Brand;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Models\User;
use App\Services\ContentKnowledgeService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

/**
 * Everything a HexaTech Content test needs (spec 2026-10-14): the planner's
 * own tables (its migrations run on sqlite, as CalendarGenerationTest does;
 * the "widen" migration is left out because sqlite does not enforce varchar
 * lengths), a beauty organisation with its default brand, a manager and a
 * staff member, a finished brand profile with two channels (Instagram on
 * Mon/Wed/Fri, LinkedIn on Tue/Thu), a stub knowledge service (no FAQ,
 * chatbot or service tables needed) and a fixed clock: Monday 5 October
 * 2026, 06:00 UTC.
 *
 * A test class uses `DatabaseTransactions` and this trait and calls
 * setUpContent() from setUp().
 */
trait SetsUpContentSchema
{
    use SetsUpMinimalSchema, MakesAdminCaller;

    protected Organization $org;
    protected int $brandId;
    protected User $manager;
    protected User $staffMember;
    protected ?ContentPlannerProfile $profile = null;

    protected function setUpContent(bool $withProfile = true): void
    {
        $this->setUpKnowledgeSchema();
        $this->setUpServiceCatalogSchema();
        $this->setUpAiUsageSchema();
        $columns = [
            'settings'          => fn (Blueprint $t) => $t->text('settings')->nullable(),
            'timezone'          => fn (Blueprint $t) => $t->string('timezone', 64)->nullable(),
            'currency'          => fn (Blueprint $t) => $t->string('currency', 10)->nullable(),
            'entitled_products' => fn (Blueprint $t) => $t->text('entitled_products')->nullable(),
            'plan_slug'         => fn (Blueprint $t) => $t->string('plan_slug', 64)->nullable(),
        ];
        foreach ($columns as $column => $add) {
            if (!Schema::hasColumn('organizations', $column)) {
                Schema::table('organizations', $add);
            }
        }
        // The venue's zone (VenueClock reads `hotel_timezone`) and the brand accent (`primary_color`) live here.
        if (!Schema::hasTable('hotel_settings')) {
            Schema::create('hotel_settings', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('key', 100);
                $t->text('value')->nullable();
                $t->string('type', 32)->nullable();
                $t->string('group', 32)->nullable();
                $t->string('label')->nullable();
                $t->text('description')->nullable();
                $t->string('scope', 16)->default('company');
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('content_planner_profiles')) {
            (require database_path('migrations/2026_07_08_000000_create_content_planner_tables.php'))->up();
            (require database_path('migrations/2026_07_08_200000_upgrade_content_planner_tables.php'))->up();
        }
        if (!Schema::hasColumn('content_planner_visual_briefs', 'image_url')) {
            (require database_path('migrations/2026_07_09_000000_add_image_to_content_planner_visual_briefs.php'))->up();
        }

        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00'));

        $this->org = Organization::create(['name' => 'Lumière Salon', 'slug' => 'org-' . uniqid('', true), 'industry' => 'beauty']);
        app()->instance('current_organization_id', $this->org->id);
        $this->brandId = (int) Brand::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('is_default', true)->value('id');
        app()->instance('current_brand_id', $this->brandId);

        $this->manager = $this->staffUser($this->org);
        $this->staffMember = $this->staffUser($this->org, ['role' => 'staff']);

        $this->app->instance(ContentKnowledgeService::class, new class extends ContentKnowledgeService {
            public function buildForBrand(int $orgId, int $brandId): array
            {
                return [
                    'exists' => true,
                    'sources' => ['has_faq' => false, 'faq_count' => 0, 'has_chatbot' => false, 'has_services' => false, 'has_org_info' => true],
                    'faq' => [],
                    'chatbot' => null,
                    'services' => [],
                    'organization' => ['name' => 'Lumière Salon', 'industry' => 'beauty', 'website' => null],
                    'missing_fields' => [],
                ];
            }

            public function summarizeForAi(int $orgId, int $brandId): string
            {
                return 'Test business context.';
            }
        });

        if ($withProfile) {
            $this->profile = $this->makeProfile($this->brandId);
        }

        // VenueClock memoises the venue's zone per request; a test is many.
        app()->forgetScopedInstances();
    }

    protected function api(string $path): string
    {
        return '/api/v1/admin/content/' . ltrim($path, '/');
    }

    protected function asManager(): static
    {
        return $this->actingAs($this->manager, 'sanctum');
    }

    protected function asStaffMember(): static
    {
        return $this->actingAs($this->staffMember, 'sanctum');
    }

    /** A finished profile for a brand, with Instagram (Mon/Wed/Fri) and LinkedIn (Tue/Thu). */
    protected function makeProfile(int $brandId): ContentPlannerProfile
    {
        $profile = ContentPlannerProfile::create([
            'name' => 'Lumière content',
            'brand_id' => $brandId,
            'default_language' => 'en',
            'setup_completed_at' => now(),
        ]);
        $days = fn (array $on) => array_merge(array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], false), array_fill_keys($on, true));
        ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brandId, 'platform' => 'instagram', 'label' => 'Instagram', 'active' => true, 'frequency' => $days(['mon', 'wed', 'fri'])]);
        ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brandId, 'platform' => 'linkedin', 'label' => 'LinkedIn', 'active' => true, 'frequency' => $days(['tue', 'thu'])]);

        return $profile;
    }

    protected function makePost(array $attributes = []): ContentPlannerPost
    {
        return ContentPlannerPost::create($attributes + [
            'planner_profile_id' => $this->profile->id,
            'brand_id' => $this->brandId,
            'platform' => 'instagram',
            'status' => 'draft',
            'topic' => 'Autumn colours',
            'scheduled_date' => '2026-10-07',
        ]);
    }

    /** A second brand of this organisation, with its own profile unless told not to. @return array{0: int, 1: ?ContentPlannerProfile} */
    protected function secondBrand(bool $withProfile = true): array
    {
        $brand = Brand::create(['name' => 'Second Studio', 'slug' => 'second-' . uniqid(), 'is_default' => false, 'sort_order' => 5]);

        return [(int) $brand->id, $withProfile ? $this->makeProfile((int) $brand->id) : null];
    }

    /**
     * Another organisation with its own default brand, profile, one post and one pillar, built under its own tenant
     * and handed back with ours restored.
     *
     * @return array{org: Organization, brandId: int, post: ContentPlannerPost, pillarId: int}
     */
    protected function otherOrganization(): array
    {
        $other = Organization::create(['name' => 'Other Studio', 'slug' => 'other-' . uniqid('', true), 'industry' => 'beauty']);
        $priorOrg = app('current_organization_id');
        $priorBrand = app('current_brand_id');
        app()->instance('current_organization_id', $other->id);
        $brandId = (int) Brand::withoutGlobalScopes()->where('organization_id', $other->id)->where('is_default', true)->value('id');
        app()->instance('current_brand_id', $brandId);
        try {
            $profile = $this->makeProfile($brandId);
            $post = ContentPlannerPost::create(['planner_profile_id' => $profile->id, 'brand_id' => $brandId, 'platform' => 'instagram', 'status' => 'draft', 'topic' => 'Theirs', 'scheduled_date' => '2026-10-07']);
            $pillar = ContentPlannerPillar::create(['planner_profile_id' => $profile->id, 'brand_id' => $brandId, 'name' => 'Their pillar', 'active' => true]);

            return ['org' => $other, 'brandId' => $brandId, 'post' => $post, 'pillarId' => (int) $pillar->id];
        } finally {
            app()->instance('current_organization_id', $priorOrg);
            app()->instance('current_brand_id', $priorBrand);
        }
    }

    /** An Anthropic message whose text is a calendar, as CalendarGenerationTest builds it. */
    protected function calendarReply(array $items): array
    {
        return [
            'id' => 'msg_content_test', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-sonnet-5',
            'content' => [['type' => 'text', 'text' => json_encode(['items' => $items])]],
            'stop_reason' => 'end_turn', 'stop_sequence' => null,
            'usage' => ['input_tokens' => 20, 'output_tokens' => 30],
        ];
    }

    protected function calendarItem(string $date, string $platform): array
    {
        return [
            'date' => $date, 'time' => '09:00', 'platform' => $platform, 'topic' => 'Autumn colours',
            'hook' => 'Three colours for October', 'draft_copy' => 'A useful draft.', 'cta' => 'Book now',
            'hashtags' => ['#autumn'], 'visual_idea' => 'A warm still life.',
        ];
    }

    /** Calendar-path AI answers every request with these items (or this error status); nothing reaches the network. */
    protected function fakeAi(array $items, int $status = 200): void
    {
        $this->fakeAiTurns([[$items, $status]]);
    }

    /**
     * Calendar-path AI answers each request with the next turn, [items, status],
     * and keeps repeating the last one. Http::fake() stubs add up and the first
     * one registered wins, so a test that needs a failure and then a success
     * says so here, in one call.
     *
     * @param list<array{0: array, 1: int}> $turns
     */
    protected function fakeAiTurns(array $turns): void
    {
        Http::preventStrayRequests();
        config(['services.anthropic.api_key' => 'content-test-key', 'services.anthropic.content_planner_model' => 'claude-sonnet-5']);
        $responses = array_map(fn (array $turn) => $turn[1] === 200
            ? Http::response($this->calendarReply($turn[0]))
            : Http::response(['type' => 'error', 'error' => ['type' => 'api_error', 'message' => 'Overloaded']], $turn[1]), $turns);
        Http::fake(['*' => Http::sequence($responses)->whenEmpty(end($responses))]);
    }

    /** A monthly AI cap of $cents with $usedCents already spent this month. */
    protected function setAiCap(int $cents, int $usedCents): void
    {
        $this->org->forceFill(['plan_features' => ['ai_monthly_cost_cents' => $cents]])->save();
        DB::table('ai_usage_logs')->insert([
            'organization_id' => $this->org->id, 'model' => 'claude-sonnet-5', 'kind' => 'chat',
            'feature' => 'crm_chat', 'cost_cents' => $usedCents, 'created_at' => now(),
        ]);
        // AiUsageService caches the month's total for 60 seconds; a gate read earlier in the test must not hide this.
        Cache::forget("ai_usage:month:{$this->org->id}:" . now()->format('Y-m'));
    }
}
```

- [ ] **Step 4: Write the failing test** `tests/Feature/Content/ContentAccessTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class ContentAccessTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_owners_and_managers_manage_and_everyone_else_does_not(): void
    {
        $this->assertTrue(ContentAccess::canManage($this->manager));
        $this->assertTrue(ContentAccess::canManage($this->staffUser($this->org, ['role' => 'super_admin'])));
        $this->assertFalse(ContentAccess::canManage($this->staffMember));
        $this->assertFalse(ContentAccess::canManage($this->staffUser($this->org, ['role' => 'manager', 'is_active' => false])));
    }

    public function test_a_refusal_carries_its_code_and_status(): void
    {
        try {
            ContentAccess::requireManager($this->staffMember);
            $this->fail('a staff member was let through');
        } catch (ContentRefused $e) {
            $this->assertSame('manager_only', $e->errorCode);
            $this->assertSame(403, $e->status);
            $this->assertSame(['error' => 'manager_only', 'message' => $e->getMessage()], $e->render()->getData(true));
        }
    }

    public function test_the_context_lists_the_brands_a_person_may_use_and_picks_the_default(): void
    {
        [$second] = $this->secondBrand();
        $this->assertSame([$this->brandId, $second], ContentContext::brandsFor($this->manager)->pluck('id')->all());
        $this->assertSame($this->brandId, ContentContext::fallbackBrandId($this->manager));

        DB::table('brand_user')->insert(['brand_id' => $second, 'user_id' => $this->staffMember->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame([$second], ContentContext::brandsFor($this->staffMember)->pluck('id')->all());
        $this->assertSame($second, ContentContext::fallbackBrandId($this->staffMember));
    }

    public function test_the_profile_is_the_bound_brands_and_its_absence_is_a_refusal(): void
    {
        $this->assertSame($this->profile->id, ContentContext::profile()?->id);

        [$second] = $this->secondBrand(withProfile: false);
        app()->instance('current_brand_id', $second);
        $this->assertNull(ContentContext::profile());
        $this->expectException(ContentRefused::class);
        ContentContext::requireProfile();
    }
}
```

Run: `.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh tests/Feature/Content/ContentAccessTest.php`
Expected: FAIL (`Class "App\Services\Content\ContentAccess" not found`).

- [ ] **Step 5: Write the three classes**

`app/Services/Content/ContentRefused.php`:

```php
<?php

namespace App\Services\Content;

use Illuminate\Http\JsonResponse;

/**
 * HexaTech Content says no, with a code the portal turns into its own words
 * (spec 2026-10-14 §8.1). Thrown from anywhere under a content controller;
 * Laravel's handler calls render(), so no controller needs to catch it, and a
 * transaction it is thrown inside rolls back.
 */
final class ContentRefused extends \DomainException
{
    /** @param array<string, mixed> $extra Merged into the answer beside `error` and `message`. */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
        public readonly array $extra = [],
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['error' => $this->errorCode, 'message' => $this->getMessage()] + $this->extra, $this->status);
    }

    /** An expected refusal, not an incident: keep it out of the error log. */
    public function report(): void
    {
    }
}
```

`app/Services/Content/ContentAccess.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\Staff;
use App\Models\User;

/**
 * Who may do what in HexaTech Content (spec 2026-10-14 §5.1): owners and
 * managers set the brand up, write strategies and generate whole calendars;
 * every staff member writes posts and uses AI on one post. Every endpoint
 * asks here; the portal only mirrors the answer.
 */
final class ContentAccess
{
    public const MANAGER_ROLES = ['super_admin', 'manager'];

    /** The caller's role in the bound organisation (Staff is tenant-scoped); a deactivated row counts for nothing. */
    public static function canManage(User $user): bool
    {
        return in_array(Staff::where('user_id', $user->id)->where('is_active', true)->first()?->role, self::MANAGER_ROLES, true);
    }

    public static function requireManager(User $user): void
    {
        if (!self::canManage($user)) {
            throw new ContentRefused('manager_only', 'Only an owner or a manager can do this.', 403);
        }
    }
}
```

`app/Services/Content/ContentContext.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\Brand;
use App\Models\ContentPlannerProfile;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * The organisation, the one brand and the brand's profile a content request
 * works on (spec 2026-10-14 §6.7). The `content.brand` middleware binds the
 * brand before any controller runs, so `brandId()` always has an answer
 * inside the content API.
 */
final class ContentContext
{
    public static function orgId(): int
    {
        return (int) app('current_organization_id');
    }

    public static function brandId(): int
    {
        return (int) app('current_brand_id');
    }

    /**
     * The brands this person may work on, in the organisation's order: the
     * ones assigned to them when they are restricted, else every brand.
     *
     * @return Collection<int, Brand>
     */
    public static function brandsFor(User $user): Collection
    {
        $assigned = $user->brands()->pluck('brands.id')->map(fn ($id) => (int) $id)->all();

        return Brand::query()
            ->when($assigned !== [], fn ($q) => $q->whereIn('id', $assigned))
            ->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'name', 'is_default']);
    }

    /** The brand to work on when the request names none (or one it may not use): the default among theirs, else their first. */
    public static function fallbackBrandId(?User $user): ?int
    {
        $brands = $user ? self::brandsFor($user) : Brand::query()->orderBy('sort_order')->orderBy('id')->get(['id', 'name', 'is_default']);
        $chosen = $brands->firstWhere('is_default', true) ?? $brands->first();

        return $chosen ? (int) $chosen->id : null;
    }

    public static function profile(): ?ContentPlannerProfile
    {
        return ContentPlannerProfile::where('brand_id', self::brandId())->first();
    }

    public static function requireProfile(): ContentPlannerProfile
    {
        return self::profile() ?? throw new ContentRefused('no_profile', 'This brand has no content profile yet.', 409);
    }
}
```

- [ ] **Step 6: Run** `t.sh tests/Feature/Content/ContentAccessTest.php`.
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add tests/Concerns/SetsUpContentSchema.php tests/Feature/Content app/Services/Content && git commit -q -F - <<'EOF'
Content server: the test fixture, refusals, the manager rule and the request context

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The workspace flag, sign-in and the operator command

**Files:**
- Modify:
  - `app/Models/Organization.php` (`WORKSPACE_DEFAULTS`, `workspace()`, `setWorkspace()`)
  - `tests/Feature/Appointments/WorkspaceGateTest.php:138,139,142,147`
  - `tests/Feature/Appointments/SignInWorkspacesTest.php:26,39,42-47,99-101`
  - `tests/Feature/AdminAccess/AppointmentsPlanTest.php:91`
- Create: `app/Console/Commands/ContentWorkspace.php`, `tests/Feature/Content/ContentCommandTest.php`
- Test (add): `tests/Feature/Appointments/SignInWorkspacesTest.php` (two new tests)

**Interfaces:**
- Produces:
  - `Organization::WORKSPACE_DEFAULTS = ['appointments' => true, 'content' => true]`.
  - `workspace('content')` is off on the Appointments plan.
  - `setWorkspace($name, true, landing: true)` clears `landing` on every other workspace.
  - Sign-in `user.workspaces.content` and `/auth/me` `workspaces.content` = `{landing: bool}`.
  - The command `workspace:content {org?} --on --off --landing --status --list`.

- [ ] **Step 1: Write the failing sign-in tests**: add to `tests/Feature/Appointments/SignInWorkspacesTest.php` (inside the class):

```php
    public function test_staff_are_told_about_content_and_landing_there_takes_the_landing_from_appointments(): void
    {
        $this->setUpAppointments();
        $this->me($this->staff)->assertJsonPath('workspaces.content', ['landing' => false]);

        $this->org->setWorkspace('appointments', true, landing: true);
        $this->org->fresh()->setWorkspace('content', true, landing: true);
        $this->me($this->staff)
            ->assertJsonPath('workspaces.content.landing', true)
            ->assertJsonPath('workspaces.appointments.landing', false);

        // And back: landing on Appointments takes it from Content.
        $this->org->fresh()->setWorkspace('appointments', true, landing: true);
        $this->me($this->staff)
            ->assertJsonPath('workspaces.appointments.landing', true)
            ->assertJsonPath('workspaces.content.landing', false);
    }

    public function test_an_appointments_only_organisation_has_no_content(): void
    {
        $this->setUpAppointments();
        $this->org->setAppointmentsOnly(true);

        $workspaces = $this->me($this->staff)->json('workspaces');
        $this->assertArrayHasKey('appointments', $workspaces);
        $this->assertArrayNotHasKey('content', $workspaces);
        $this->assertSame(['enabled' => false, 'landing' => false], $this->org->fresh()->workspace('content'));
    }
```

Run: `t.sh tests/Feature/Appointments/SignInWorkspacesTest.php`
Expected: the two new tests FAIL (no `content` key).

- [ ] **Step 2: Turn Content on by default**, off on the Appointments plan, with one landing per organisation. In `app/Models/Organization.php`:
  - Replace `public const WORKSPACE_DEFAULTS = ['appointments' => true];` with:
    ```php
        public const WORKSPACE_DEFAULTS = ['appointments' => true, 'content' => true];
    ```
  - In `workspace()`, after the `appointmentsOnly()` early return for `'appointments'`, add:
    ```php
            // The Appointments plan holds the appointments workspace and nothing else (spec 2026-10-14 §6.3).
            if ($name !== 'appointments' && $this->appointmentsOnly()) {
                return ['enabled' => false, 'landing' => false];
            }
    ```
  - In `setWorkspace()`, replace the line `data_set($settings, "workspaces.{$name}", $row);` with:
    ```php
            data_set($settings, "workspaces.{$name}", $row);
            // One landing per organisation: landing on this workspace takes it from every other one.
            if ($row['landing']) {
                foreach (array_keys(self::WORKSPACE_DEFAULTS) as $other) {
                    if ($other !== $name && data_get($settings, "workspaces.{$other}.landing") === true) {
                        data_set($settings, "workspaces.{$other}.landing", false);
                    }
                }
            }
    ```
  - Update the comment block above `WORKSPACE_DEFAULTS`: after "the appointments workspace is the first.", add "HexaTech Content (`/content`, spec 2026-10-14) is the second; it is not part of the Appointments plan."

- [ ] **Step 3: Update the tests that compare the whole payload**:
  - In `tests/Feature/Appointments/WorkspaceGateTest.php`:
    - Line 138: replace `['appointments' => ['landing' => false, 'has_services' => false, 'only' => false]]` with `['appointments' => ['landing' => false, 'has_services' => false, 'only' => false], 'content' => ['landing' => false]]`.
    - Line 139: replace `['appointments' => ['landing' => false, 'has_services' => true, 'only' => false]]` with `['appointments' => ['landing' => false, 'has_services' => true, 'only' => false], 'content' => ['landing' => false]]`.
    - Line 142: replace `['appointments' => ['landing' => true, 'has_services' => true, 'only' => false]]` with `['appointments' => ['landing' => true, 'has_services' => true, 'only' => false], 'content' => ['landing' => false]]`.
    - Line 147: replace `$this->assertNull($this->org->fresh()->workspacesPayload());` with `$this->assertSame(['content' => ['landing' => false]], $this->org->fresh()->workspacesPayload());`.
  - In `tests/Feature/Appointments/SignInWorkspacesTest.php`:
    - Line 26: replace `['appointments' => ['landing' => false, 'has_services' => true, 'only' => false]]` with `['appointments' => ['landing' => false, 'has_services' => true, 'only' => false], 'content' => ['landing' => false]]`.
    - Line 39: replace `['appointments' => ['landing' => false, 'has_services' => false, 'only' => false]]` with `['appointments' => ['landing' => false, 'has_services' => false, 'only' => false], 'content' => ['landing' => false]]`.
    - Replace the whole test `test_an_organisation_switched_off_gets_no_key` with:
      ```php
          public function test_an_organisation_with_appointments_switched_off_gets_no_appointments_key(): void
          {
              $this->setUpAppointments(enabled: false);

              $workspaces = $this->me($this->staff)->json('workspaces');
              $this->assertArrayNotHasKey('appointments', $workspaces);
              $this->assertSame(['landing' => false], $workspaces['content']);
          }
      ```
    - In `test_the_login_answer_carries_it_inside_user`, replace `$this->assertArrayNotHasKey('workspaces', $answer);` with `$this->assertArrayNotHasKey('appointments', $answer['workspaces'] ?? []);`.
  - In `tests/Feature/AdminAccess/AppointmentsPlanTest.php`, line 91: replace `['appointments' => ['landing' => false, 'has_services' => true, 'only' => false]]` with `['appointments' => ['landing' => false, 'has_services' => true, 'only' => false], 'content' => ['landing' => false]]`. Line 73 (an appointments-only organisation) stays as it is.

Run:
```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Feature/Appointments/SignInWorkspacesTest.php; $T tests/Feature/Appointments/WorkspaceGateTest.php; $T tests/Feature/AdminAccess/AppointmentsPlanTest.php
```
Expected: all PASS (the sign-in key still costs exactly one organisation read: `workspace('content')` reads only loaded attributes).

- [ ] **Step 4: Write the failing command test** `tests/Feature/Content/ContentCommandTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class ContentCommandTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_it_reports_switches_and_lists_the_exceptions(): void
    {
        $plain = Organization::create(['name' => 'Other Studio', 'slug' => 'plain-' . uniqid(), 'industry' => 'beauty']);

        $this->artisan('workspace:content', ['--list' => true])
            ->expectsOutputToContain('Every organization has HexaTech Content on, landing on the full admin.')
            ->assertSuccessful();

        $this->artisan('workspace:content', ['org' => $plain->id, '--status' => true])
            ->expectsOutputToContain('HexaTech Content ON, landing off')
            ->assertSuccessful();

        $this->org->setWorkspace('appointments', true, landing: true);
        $this->artisan('workspace:content', ['org' => $this->org->id, '--on' => true, '--landing' => true])
            ->expectsOutputToContain('HexaTech Content ON, landing on')
            ->assertSuccessful();
        $this->assertSame(['enabled' => true, 'landing' => true], $this->org->fresh()->workspace('content'));
        $this->assertFalse($this->org->fresh()->workspace('appointments')['landing']);

        $this->artisan('workspace:content', ['--list' => true])
            ->expectsOutputToContain('Lumière Salon')
            ->doesntExpectOutputToContain('Other Studio')
            ->assertSuccessful();

        $this->artisan('workspace:content', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('HexaTech Content off')
            ->assertSuccessful();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('content'));

        $this->artisan('workspace:content', ['org' => 999999, '--on' => true])->assertFailed();
        $this->artisan('workspace:content', ['org' => $this->org->id, '--on' => true, '--off' => true])->assertFailed();
    }

    public function test_it_will_not_switch_content_on_for_the_appointments_plan(): void
    {
        $this->org->setAppointmentsOnly(true);

        $this->artisan('workspace:content', ['org' => $this->org->id, '--on' => true])
            ->expectsOutputToContain('is on the Appointments plan')
            ->assertFailed();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('content'));
    }
}
```

Run: `t.sh tests/Feature/Content/ContentCommandTest.php`
Expected: FAIL (`Command "workspace:content" is not defined`).

- [ ] **Step 5: Write** `app/Console/Commands/ContentWorkspace.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Switches HexaTech Content (spec 2026-10-14) on or off for one organisation.
 * Every organisation has it by default (Organization::WORKSPACE_DEFAULTS),
 * signing in to the full admin; --off takes one out, --on --landing sends its
 * staff to HexaTech Content after signing in (an organisation lands in one
 * workspace only, so this takes the landing from Appointments), --list shows
 * the organisations that differ from the default.
 *
 * Off deletes nothing: the API answers 403 and /content sends staff back to
 * the full admin. The Appointments plan does not include HexaTech Content.
 */
class ContentWorkspace extends Command
{
    protected $signature = 'workspace:content
                            {org? : Organization id}
                            {--on : Switch HexaTech Content on}
                            {--off : Switch HexaTech Content off}
                            {--landing : With --on: staff land on HexaTech Content after signing in}
                            {--status : Show the current setting}
                            {--list : List the organizations that differ from the default (switched off, or landing on HexaTech Content)}';

    protected $description = 'Switch HexaTech Content on or off for an organization.';

    public function handle(): int
    {
        if ($this->option('list')) {
            $rows = Organization::query()->orderBy('id')->get()
                ->filter(fn (Organization $o) => $o->workspaceIsException('content'))
                ->map(fn (Organization $o) => [
                    $o->id,
                    $o->name,
                    $o->workspaceEnabled('content') ? 'on' : 'off',
                    $o->workspace('content')['landing'] ? 'content' : 'full admin',
                ])
                ->values()->all();

            if ($rows === []) {
                $this->line('Every organization has HexaTech Content on, landing on the full admin.');
            } else {
                $this->line('Every other organization has HexaTech Content on, landing on the full admin.');
                $this->table(['id', 'name', 'content', 'lands on'], $rows);
            }

            return self::SUCCESS;
        }

        $org = $this->argument('org') ? Organization::find((int) $this->argument('org')) : null;
        if (!$org) {
            $this->error('Name an existing organization: workspace:content <id> --on|--off|--status (or --list).');

            return self::FAILURE;
        }
        if ($this->option('on') && $this->option('off')) {
            $this->error('Choose one of --on and --off.');

            return self::FAILURE;
        }
        if ($this->option('on') && $org->appointmentsOnly()) {
            $this->error(sprintf('org %d (%s) is on the Appointments plan: HexaTech Content is not part of it.', $org->id, $org->name));

            return self::FAILURE;
        }

        if ($this->option('on')) {
            $org->setWorkspace('content', true, (bool) $this->option('landing'));
        } elseif ($this->option('off')) {
            $org->setWorkspace('content', false);
        }

        $state = $org->fresh()->workspace('content');
        $this->line(sprintf(
            'org %d (%s): HexaTech Content %s%s',
            $org->id,
            $org->name,
            $state['enabled'] ? 'ON' : 'off',
            $state['enabled'] ? ', landing ' . ($state['landing'] ? 'on' : 'off') : '',
        ));

        return self::SUCCESS;
    }
}
```

- [ ] **Step 6: Run and commit**

```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Feature/Content/; $T tests/Feature/Appointments/; $T tests/Feature/AdminAccess/
cd /c/wamp64/www/Hexa-Tech-content && git add app/Models/Organization.php app/Console/Commands/ContentWorkspace.php tests && git commit -q -F - <<'EOF'
Content server: HexaTech Content on for every organisation, with its command

Organization::WORKSPACE_DEFAULTS gains content (off on the Appointments
plan); sign-in and /auth/me carry workspaces.content; an organisation lands
in one workspace only. workspace:content switches, reports and lists.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: all three directories PASS.

---

### Task 3: The route group, one brand per call, the access map and the bootstrap

**Files:**
- Create:
  - `app/Http/Middleware/ContentBrand.php`
  - `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`
  - `app/Services/Content/ContentRules.php` (enums now; the validation helpers are added in Task 5)
- Modify:
  - `bootstrap/app.php` (alias)
  - `routes/api.php` (the group, after the Appointments group, inside the admin group)
  - `app/Support/AdminAccess/AccessMap.php` (`PRODUCTS`, `MAP`)
- Test: `tests/Feature/Content/ContentGateTest.php`, `tests/Feature/Content/BootstrapTest.php`

**Interfaces:**
- Consumes: `ContentContext`, `ContentAccess` (Task 1); `Organization::workspace` (Task 2).
- Produces:
  - Middleware alias `content.brand` → `App\Http\Middleware\ContentBrand`. It binds `current_brand_id`, sets the request attribute `content_brand_id`, and answers 409 `no_brand` when the organisation has no brand.
  - The route group `Route::prefix('content')->middleware(['workspace:content', 'content.brand'])`.
  - `GET /api/v1/admin/content/bootstrap` answering:
    `{name, organization{id,name,industry}, brand{id,name}|null, brands[{id,name}], accent, venue{timezone,timezone_named,today}, staff{name,role,can_manage}, profile{id,setup_completed,readiness}|null, ai{status,percent}, platforms[], statuses[], rewrites[]}`
  - `ContentRules::PLATFORMS`, `STATUSES`, `FUNNEL_STAGES`, `REWRITES`, `MAX_RANGE_DAYS = 62`.

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Content/ContentGateTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class ContentGateTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_every_content_route_carries_the_gate_and_the_brand(): void
    {
        $routes = collect(Route::getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/content/'));

        $this->assertNotEmpty($routes);
        foreach ($routes as $route) {
            $middleware = $route->gatherMiddleware();
            $this->assertContains('workspace:content', $middleware, "{$route->uri()} is reachable without the workspace flag");
            $this->assertContains('content.brand', $middleware, "{$route->uri()} runs without a pinned brand");
        }
    }

    public function test_an_organisation_switched_off_is_refused_and_the_next_call_after_switching_off_too(): void
    {
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk();
        $this->org->setWorkspace('content', false);

        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_an_appointments_only_organisation_is_refused(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();

        $this->asManager()->getJson($this->api('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
    }

    public function test_an_anonymous_caller_and_a_member_never_reach_it(): void
    {
        $member = User::create(['organization_id' => $this->org->id, 'name' => 'Member', 'email' => 'member-' . uniqid() . '@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member']);

        $this->getJson($this->api('bootstrap'))->assertStatus(401);
        $this->actingAs($member, 'sanctum')->getJson($this->api('bootstrap'))->assertStatus(403);
    }
}
```

`tests/Feature/Content/BootstrapTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\Brand;
use App\Services\Content\ContentRules;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class BootstrapTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_it_tells_the_portal_what_it_needs(): void
    {
        $defaultName = Brand::withoutGlobalScopes()->find($this->brandId)->name;

        $this->asManager()->getJson($this->api('bootstrap'))
            ->assertOk()
            ->assertJsonPath('name', 'HexaTech Content')
            ->assertJsonPath('organization.name', 'Lumière Salon')
            ->assertJsonPath('organization.industry', 'beauty')
            ->assertJsonPath('brand', ['id' => $this->brandId, 'name' => $defaultName])
            ->assertJsonPath('brands', [['id' => $this->brandId, 'name' => $defaultName]])
            ->assertJsonPath('venue.timezone', 'UTC')
            ->assertJsonPath('venue.today', '2026-10-05')
            ->assertJsonPath('staff.role', 'manager')
            ->assertJsonPath('staff.can_manage', true)
            ->assertJsonPath('profile.id', $this->profile->id)
            ->assertJsonPath('profile.setup_completed', true)
            ->assertJsonPath('ai', ['status' => 'unlimited', 'percent' => null])
            ->assertJsonPath('platforms', ContentRules::PLATFORMS)
            ->assertJsonPath('statuses', ContentRules::STATUSES)
            ->assertJsonPath('rewrites', ContentRules::REWRITES);

        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('staff.can_manage', false);
    }

    public function test_it_works_on_the_brand_the_portal_asks_for_and_lists_every_brand(): void
    {
        [$second] = $this->secondBrand();

        $this->asManager()->getJson($this->api('bootstrap') . '?brand_id=' . $second)
            ->assertOk()
            ->assertJsonPath('brand.id', $second)
            ->assertJsonCount(2, 'brands');
    }

    public function test_a_brand_from_another_organisation_falls_back_to_the_default(): void
    {
        $other = $this->otherOrganization();

        $this->asManager()->getJson($this->api('bootstrap') . '?brand_id=' . $other['brandId'])
            ->assertOk()
            ->assertJsonPath('brand.id', $this->brandId);
    }

    public function test_a_member_restricted_to_one_brand_works_on_it_and_may_not_ask_for_another(): void
    {
        [$second] = $this->secondBrand();
        DB::table('brand_user')->insert(['brand_id' => $second, 'user_id' => $this->staffMember->id, 'created_at' => now(), 'updated_at' => now()]);

        $this->asStaffMember()->getJson($this->api('bootstrap'))
            ->assertOk()
            ->assertJsonPath('brand.id', $second)
            ->assertJsonPath('brands', [['id' => $second, 'name' => 'Second Studio']]);
        $this->asStaffMember()->getJson($this->api('bootstrap') . '?brand_id=' . $this->brandId)->assertStatus(403);
    }

    public function test_a_brand_without_a_profile_says_so_and_the_budget_is_reported(): void
    {
        [$second] = $this->secondBrand(withProfile: false);
        $this->setAiCap(100, 85);

        $this->asManager()->getJson($this->api('bootstrap') . '?brand_id=' . $second)
            ->assertOk()
            ->assertJsonPath('profile', null)
            ->assertJsonPath('ai', ['status' => 'warn', 'percent' => 85]);
    }
}
```

Run: `t.sh tests/Feature/Content/ContentGateTest.php` and `t.sh tests/Feature/Content/BootstrapTest.php`
Expected: FAIL (no routes: `assertNotEmpty` fails, and the calls answer 404).

- [ ] **Step 2: Write** `app/Services/Content/ContentRules.php` (the enums; Task 5 adds the validation helpers):

```php
<?php

namespace App\Services\Content;

use Carbon\CarbonImmutable;

/**
 * The values HexaTech Content accepts, in one place (spec 2026-10-14). The
 * bootstrap sends the lists to the portal, so the screens never keep a copy.
 */
final class ContentRules
{
    public const PLATFORMS = ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'];

    public const STATUSES = ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived'];

    public const FUNNEL_STAGES = ['awareness', 'consideration', 'conversion', 'retention'];

    /** The five rewrites ContentPostGenerationService::generateAlternatives knows. */
    public const REWRITES = ['shorter', 'longer', 'professional', 'friendly', 'alternative'];

    /** The longest range a plan read or a generation may cover, in days, both ends included. */
    public const MAX_RANGE_DAYS = 62;

    /** Days in a range, both ends included. */
    public static function days(string $from, string $to): int
    {
        return (int) abs(CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to))) + 1;
    }
}
```

- [ ] **Step 3: Write** `app/Http/Middleware/ContentBrand.php`:

```php
<?php

namespace App\Http\Middleware;

use App\Services\Content\ContentContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware for HexaTech Content: every call works on exactly one
 * brand (spec 2026-10-14 §6.7). The `brand` middleware has already bound the
 * brand the portal named (?brand_id=), refused one a restricted member may
 * not use (403), and bound nothing for "none" or a brand of another
 * organisation; this one turns nothing into the person's default brand, so
 * BrandScope always filters and no content list mixes brands.
 */
class ContentBrand
{
    public function handle(Request $request, Closure $next): Response
    {
        $bound = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $brandId = $bound ? (int) $bound : ContentContext::fallbackBrandId($request->user());

        if (!$brandId) {
            return response()->json([
                'error' => 'no_brand',
                'message' => 'This organisation has no brand yet.',
            ], 409);
        }

        app()->instance('current_brand_id', $brandId);
        $request->attributes->set('content_brand_id', $brandId);

        return $next($request);
    }
}
```

In `bootstrap/app.php`, in the `$middleware->alias([...])` block, after `'workspace' => \App\Http\Middleware\RequireWorkspace::class,` add:

```php
            'content.brand'      => \App\Http\Middleware\ContentBrand::class,
```

- [ ] **Step 4: Write** `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Api\V1\Admin\Appointments\BootstrapController as AppointmentsBootstrap;
use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Organization;
use App\Models\Staff;
use App\Services\AiUsageService;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRules;
use App\Services\ContentKnowledgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** What HexaTech Content needs before it can draw anything (spec 2026-10-14 §6.4). */
class BootstrapController extends Controller
{
    public const NAME = 'HexaTech Content';

    public function show(Request $request, ContentKnowledgeService $knowledge, AiUsageService $usage): JsonResponse
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        // Tenant-scoped: a user with staff rows in two organisations reports this one's role.
        $staff = Staff::where('user_id', $user->id)->first();
        $brands = ContentContext::brandsFor($user);
        $brandId = ContentContext::brandId();
        $brand = $brands->firstWhere('id', $brandId) ?? Brand::find($brandId);
        $profile = ContentContext::profile();
        $budget = $usage->budgetStatus($org);

        return response()->json([
            'name'         => self::NAME,
            'organization' => ['id' => $orgId, 'name' => (string) $org->name, 'industry' => (string) $org->resolved_industry],
            'brand'        => $brand ? ['id' => (int) $brand->id, 'name' => (string) $brand->name] : null,
            'brands'       => $brands->map(fn (Brand $b) => ['id' => (int) $b->id, 'name' => (string) $b->name])->values(),
            'accent'       => AppointmentsBootstrap::accent($orgId),
            'venue'        => [
                'timezone'       => VenueClock::zone($orgId),
                'timezone_named' => VenueClock::isNamed($orgId),
                'today'          => VenueClock::today($orgId),
            ],
            'staff'        => ['name' => (string) $user->name, 'role' => $staff?->role, 'can_manage' => ContentAccess::canManage($user)],
            'profile'      => $profile ? [
                'id'              => (int) $profile->id,
                'setup_completed' => $profile->setup_completed_at !== null,
                'readiness'       => (int) $knowledge->readinessOf($profile)['overall'],
            ] : null,
            'ai'           => ['status' => $budget['status'], 'percent' => $budget['percent']],
            'platforms'    => ContentRules::PLATFORMS,
            'statuses'     => ContentRules::STATUSES,
            'rewrites'     => ContentRules::REWRITES,
        ]);
    }
}
```

The bootstrap reads readiness without saving it (F4), so add `readinessOf()` to `app/Services/ContentKnowledgeService.php` now. Replace the body of `readinessFor()` (from `$knowledge = $this->buildForBrand(...)` to its `return`) with a call, and move the computation into the new method:

```php
    public function readinessFor(ContentPlannerProfile $profile): array
    {
        $readiness = $this->readinessOf($profile);
        $profile->update(['knowledge_score' => $readiness['overall']]);

        return $readiness;
    }

    /**
     * The same readiness without saving it: what a read shows (spec 2026-10-14 §7, F4).
     * readinessFor() saves it, for the moments the profile or its knowledge changed.
     */
    public function readinessOf(ContentPlannerProfile $profile): array
    {
        $knowledge = $this->buildForBrand($profile->organization_id, $profile->brand_id);

        $sections = [
            $this->scoreCompany($profile, $knowledge),
            $this->scoreKnowledge($knowledge),
            $this->scoreAudience($profile),
            $this->scoreVoice($profile),
            $this->scoreChannels($profile),
            $this->scoreStrategyInputs($profile),
        ];

        $overall = (int) round(array_sum(array_column($sections, 'score')) / count($sections));

        return [
            'overall' => $overall,
            'sections' => $sections,
        ];
    }
```
Keep the existing docblock above `readinessFor()`, but drop its "Also persists the overall score" line and replace it with "Saves the overall score to the profile; readinessOf() does not.".

- [ ] **Step 5: The route group and the access map.** In `routes/api.php`, directly after the Appointments group's closing `});` (inside the admin group), add:

```php
            // ─── HexaTech Content workspace ─────────────────────────────────
            // The AI Content Planner as its own workspace beside the full admin
            // (spec 2026-10-14). Every organisation has it unless an operator
            // switched it off (`php artisan workspace:content <id> --off`);
            // `workspace:content` then answers 403, and `content.brand` pins
            // every call to exactly one brand.
            Route::prefix('content')->middleware(['workspace:content', 'content.brand'])->group(function () {
                Route::get('bootstrap', [\App\Http\Controllers\Api\V1\Admin\Content\BootstrapController::class, 'show']);
            });
```

In `app/Support/AdminAccess/AccessMap.php`:
- Replace `public const PRODUCTS = ['appointments', 'account', 'admin', 'booking', 'loyalty', 'crm', 'chat'];` with:
  ```php
      public const PRODUCTS = ['appointments', 'content', 'account', 'admin', 'booking', 'loyalty', 'crm', 'chat'];
  ```
- In `MAP`, after the `'admin/appointments'` line, add:
  ```php
          'admin/content'                         => ['staff',              'staff',              'content'],       // HexaTech Content; brand, strategy and whole-calendar AI keep their own manager rule (ContentAccess)
  ```
- In the class docblock's `product` paragraph, replace "`appointments` and `account`. The others (`admin`, …" with "`appointments` and `account`. The others (`content`, `admin`, …".

- [ ] **Step 6: Run and commit**

```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Feature/Content/; $T tests/Feature/AdminAccess/; $T tests/Feature/RouteUniquenessTest.php; $T tests/Feature/RouteControllersExistTest.php; $T tests/Feature/ContentCalendar/
cd /c/wamp64/www/Hexa-Tech-content && git add app bootstrap/app.php routes/api.php tests && git commit -q -F - <<'EOF'
Content server: the admin/content group, one brand per call, and the bootstrap

The group runs behind workspace:content and content.brand (the person's
default brand when none, or a foreign one, is named). The access map gains
admin/content with product content. The bootstrap carries the brand and the
brands a person may use, the venue's clock, the manager rule, the profile's
readiness (read without saving it) and the AI budget.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: all PASS, including `AccessMapTest` (every route has a key, every key a route, `content` is a known product).

---

### Task 4: AI spend in the shared ledger, and the AI gate

**Files:**
- Modify:
  - `app/Services/AiUsageService.php` (`IMAGE_PRICING`, `recordImage()`)
  - `app/Services/ContentPlanner/AiClient.php` (`USAGE_FEATURE`, records usage)
  - `app/Services/ContentPlanner/ImageGenerationService.php` (records images)
- Create: `app/Services/Content/ContentAiGate.php`
- Test: `tests/Feature/Content/AiLedgerTest.php`, `tests/Feature/Content/AiGateTest.php`

**Interfaces:**
- Produces:
  - `AiClient::USAGE_FEATURE = 'content'`.
  - `AiUsageService::IMAGE_PRICING` and `AiUsageService::recordImage(int $orgId, string $model, string $size, string $feature): void` (never throws).
  - `ContentAiGate::allow(Organization $org): void` (403 `ai_budget_used_up` when `budgetStatus` is `over`).
  - `ContentAiGate::oneGenerationAtATime(int $orgId, int $brandId, callable $run): mixed` (409 `already_generating`; the lock is released in `finally`), with `ContentAiGate::LOCK_SECONDS = 300`.

- [ ] **Step 1: Check the image prices.** Fetch OpenAI's pricing page (WebFetch `https://platform.openai.com/docs/pricing` or `https://openai.com/api/pricing/`).
  - Confirm the per-image prices for **gpt-image-1, quality high**: 1024×1024, 1024×1536 and 1536×1024.
  - Confirm them for **dall-e-3, quality hd**: 1024×1024, 1024×1792 and 1792×1024.
  - The figures below are $0.167 / $0.25 / $0.25 and $0.08 / $0.12 / $0.12, rounded up to whole cents. If the page differs, use the page's figures and write a `Ruling:` line in the ledger with the page's date. If the page cannot be fetched, keep these and say so in the ledger.

- [ ] **Step 2: Write the failing tests**

`tests/Feature/Content/AiLedgerTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Services\AiUsageService;
use App\Services\ContentCalendarGenerationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class AiLedgerTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_content_ai_call_counts_in_the_shared_ledger_with_its_tokens(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);
        $this->actingAs($this->manager);

        app(ContentCalendarGenerationService::class)->generate($this->profile, '2026-10-05', '2026-10-05', ['platforms' => ['instagram']]);

        $row = DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->first();
        $this->assertNotNull($row, 'no ai_usage_logs row');
        $this->assertSame('content', $row->feature);
        $this->assertSame('claude-sonnet-5', $row->model);
        $this->assertSame([20, 30], [(int) $row->input_tokens, (int) $row->output_tokens]);
        $this->assertSame(1, (int) $row->cost_cents); // (20 × $3 + 30 × $15) per million tokens, rounded up to a cent
    }

    public function test_an_image_is_recorded_at_its_published_price(): void
    {
        $usage = app(AiUsageService::class);
        $usage->recordImage($this->org->id, 'gpt-image-1', '1024x1536', 'content');
        $usage->recordImage($this->org->id, 'dall-e-3', '1024x1024', 'content');
        $usage->recordImage($this->org->id, 'gpt-image-1', '640x640', 'content');   // an unknown size costs the model's largest
        $usage->recordImage($this->org->id, 'some-new-model', '1024x1024', 'content'); // an unknown model is logged at 0

        $rows = DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->orderBy('id')->get();
        $this->assertSame([25, 8, 25, 0], $rows->pluck('cost_cents')->map(fn ($c) => (int) $c)->all());
        $this->assertSame(['image'], $rows->pluck('kind')->unique()->values()->all());
        $this->assertSame(['content'], $rows->pluck('feature')->unique()->values()->all());
    }

    public function test_the_image_service_records_every_image_it_makes(): void
    {
        // The image call goes through its own HTTP client: the wiring is read from the source.
        $source = file_get_contents(app_path('Services/ContentPlanner/ImageGenerationService.php'));
        $this->assertStringContainsString('->recordImage(', $source);
        $this->assertStringContainsString('AiClient::USAGE_FEATURE', $source);
    }
}
```

`tests/Feature/Content/AiGateTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentRefused;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class AiGateTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_an_organisation_without_a_cap_is_never_stopped(): void
    {
        app(ContentAiGate::class)->allow($this->org->fresh());
        $this->addToAssertionCount(1);
    }

    public function test_at_eighty_percent_it_still_runs(): void
    {
        $this->setAiCap(100, 85);
        app(ContentAiGate::class)->allow($this->org->fresh());
        $this->addToAssertionCount(1);
    }

    public function test_at_the_cap_it_refuses(): void
    {
        $this->setAiCap(100, 100);

        try {
            app(ContentAiGate::class)->allow($this->org->fresh());
            $this->fail('the budget was not checked');
        } catch (ContentRefused $e) {
            $this->assertSame('ai_budget_used_up', $e->errorCode);
            $this->assertSame(403, $e->status);
        }
    }

    public function test_one_generation_at_a_time_per_brand_and_the_brand_is_freed_even_after_a_failure(): void
    {
        $gate = app(ContentAiGate::class);
        $inner = null;
        $gate->oneGenerationAtATime($this->org->id, $this->brandId, function () use ($gate, &$inner) {
            try {
                $gate->oneGenerationAtATime($this->org->id, $this->brandId, fn () => null);
            } catch (ContentRefused $e) {
                $inner = [$e->errorCode, $e->status];
            }
            // Another brand is not held by this one.
            $gate->oneGenerationAtATime($this->org->id, $this->brandId + 1000, fn () => null);
        });
        $this->assertSame(['already_generating', 409], $inner);

        try {
            $gate->oneGenerationAtATime($this->org->id, $this->brandId, fn () => throw new \RuntimeException('provider down'));
        } catch (\RuntimeException) {
        }
        $this->assertSame('ran', $gate->oneGenerationAtATime($this->org->id, $this->brandId, fn () => 'ran'));
    }
}
```

Run: `t.sh tests/Feature/Content/AiLedgerTest.php` and `t.sh tests/Feature/Content/AiGateTest.php`
Expected: FAIL (no ledger row; `recordImage` undefined; `ContentAiGate` not found).

- [ ] **Step 3: Price images in the ledger.** In `app/Services/AiUsageService.php`, add below `MODEL_PRICING`:

```php
    /**
     * US cents per generated image, by model and size: OpenAI's published
     * prices at the quality ImageGenerationService asks for — gpt-image-1 at
     * "high" (1024×1024 $0.167, 1024×1536 and 1536×1024 $0.25), dall-e-3 at
     * "hd" (1024×1024 $0.08, 1024×1792 and 1792×1024 $0.12) — rounded up to a
     * whole cent. A size not listed costs the model's largest; a model not
     * listed is logged at 0 with a note, like an unknown chat model.
     */
    public const IMAGE_PRICING = [
        'gpt-image-1' => ['1024x1024' => 17, '1024x1536' => 25, '1536x1024' => 25],
        'dall-e-3'    => ['1024x1024' => 8, '1024x1792' => 12, '1792x1024' => 12],
    ];
```

and add below `recordUsage()`:

```php
    /**
     * Record one generated image (images are priced per picture, not per
     * token). Safe to call from inside a try/catch — never throws.
     */
    public function recordImage(int $orgId, string $model, string $size, string $feature): void
    {
        $prices = self::IMAGE_PRICING[$model] ?? null;
        if ($prices === null) {
            Log::info('AI usage: unknown image pricing (cost recorded as 0)', ['model' => $model]);
        }

        try {
            AiUsageLog::create([
                'organization_id' => $orgId,
                'brand_id'        => app()->bound('current_brand_id') ? app('current_brand_id') : null,
                'user_id'         => auth()->id(),
                'model'           => $model,
                'kind'            => 'image',
                'feature'         => mb_substr($feature, 0, 60),
                'input_tokens'    => 0,
                'output_tokens'   => 0,
                'cost_cents'      => $prices === null ? 0 : ($prices[$size] ?? max($prices)),
            ]);

            Cache::forget("ai_usage:month:{$orgId}:" . now()->format('Y-m'));
        } catch (\Throwable $e) {
            Log::warning('AI usage log write failed', ['org_id' => $orgId, 'model' => $model, 'error' => $e->getMessage()]);
        }
    }
```

- [ ] **Step 4: Record text calls and images.** In `app/Services/ContentPlanner/AiClient.php`:
  - Add `use App\Services\AiUsageService;` to the imports.
  - Add this constant below `private string $model;`:
    ```php
        /** The feature name Content's AI calls carry in the shared AI ledger (Settings → AI Usage). */
        public const USAGE_FEATURE = 'content';
    ```
  - At the end of `logSuccess()`, after the `ContentPlannerAiGeneration::create([...]);` statement, add:
    ```php
            // The shared AI ledger counts every Content call too, so Settings → AI Usage and the
            // organisation's monthly cap see it (spec 2026-10-14 §5.2). recordUsage never throws.
            app(AiUsageService::class)->recordUsage(
                (int) $profile->organization_id,
                $this->model,
                (int) ($inputTokens ?? 0),
                (int) ($outputTokens ?? 0),
                self::USAGE_FEATURE,
            );
    ```

In `app/Services/ContentPlanner/ImageGenerationService.php`:
- Add `use App\Services\AiUsageService;` to the imports.
- In `generateForPost()`, directly after `$this->logGeneration($post, $modelUsed, 'success', null);`, add:
  ```php
          // Images are priced per picture in the shared AI ledger (spec 2026-10-14 §5.2).
          app(AiUsageService::class)->recordImage(
              (int) $profile->organization_id,
              (string) $modelUsed,
              $this->sizeForModel((string) $modelUsed, $brief->aspect_ratio),
              AiClient::USAGE_FEATURE,
          );
  ```
  `sizeForModel()` is the class's private size helper, already called earlier in this method. If its signature differs from `(string $model, ?string $aspectRatio): string`, adapt the call to the real signature and note it in the ledger.

- [ ] **Step 5: Write** `app/Services/Content/ContentAiGate.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\Organization;
use App\Services\AiUsageService;
use Illuminate\Support\Facades\Cache;

/**
 * What every Content AI action passes first (spec 2026-10-14 §5.2): the
 * organisation's monthly AI budget (refused at 100 % before any provider
 * call; writing by hand keeps working; an organisation without a cap is
 * never stopped), and one generation at a time per brand, so a double click
 * cannot write the same days twice.
 */
final class ContentAiGate
{
    /** Longer than the calendar's own 240-second budget, so a running generation always holds its brand. */
    public const LOCK_SECONDS = 300;

    public function __construct(private AiUsageService $usage)
    {
    }

    public function allow(Organization $org): void
    {
        if (($this->usage->budgetStatus($org)['status'] ?? null) === 'over') {
            throw new ContentRefused('ai_budget_used_up', "This month's AI budget is used up — see Settings → AI Usage.", 403);
        }
    }

    /**
     * Runs $run while holding the brand's generation lock; a second request
     * while it runs is refused, not queued. The lock is released however
     * $run ends.
     *
     * @template T
     * @param callable(): T $run
     * @return T
     */
    public function oneGenerationAtATime(int $orgId, int $brandId, callable $run): mixed
    {
        $lock = Cache::lock("content:generate:{$orgId}:{$brandId}", self::LOCK_SECONDS);
        if (!$lock->get()) {
            throw new ContentRefused('already_generating', 'A generation is already running for this brand.', 409);
        }

        try {
            return $run();
        } finally {
            $lock->release();
        }
    }
}
```

- [ ] **Step 6: Run and commit**

```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Feature/Content/; $T tests/Feature/ContentCalendar/; $T tests/Feature/Ai/
cd /c/wamp64/www/Hexa-Tech-content && git add app tests && git commit -q -F - <<'EOF'
Content server: AI spend in the shared ledger, and the AI gate

Every planner text call (AiClient) and image (priced per picture) now lands
in ai_usage_logs as feature "content", so Settings → AI Usage and the
monthly cap see it. ContentAiGate refuses at 100 % of the cap before any
provider call and runs one generation at a time per brand.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: all PASS. The existing `CalendarGenerationTest` is unaffected, because the ledger write never throws.

---

### Task 5: Posts — list, Find, create, read, save, move, duplicate, mark, delete

**Files:**
- Modify: `app/Services/Content/ContentRules.php` (validation helpers)
- Create:
  - `app/Services/Content/ContentPostPresenter.php`
  - `app/Services/Content/ContentPlan.php` (search now; Task 6 adds the plan)
  - `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`
- Modify: `routes/api.php` (post routes)
- Test: `tests/Feature/Content/PostsTest.php`, `tests/Feature/Content/PostRulesTest.php`

**Interfaces:**
- Consumes: `ContentContext`, `ContentRefused` (Task 1); `ContentRules` enums (Task 3).
- Produces:
  - `ContentRules::owned(string $table): Exists`, `ContentRules::postFields(): array`.
  - `ContentPostPresenter::card(ContentPlannerPost): array` with keys `id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at`.
  - `ContentPostPresenter::detail(ContentPlannerPost): array`: the card plus `language, goal, format, main_copy, short_copy, cta, hashtags, audience_id, campaign_id, weekday_role, funnel_stage, post_type, strategic_reason, quality, published_url, published_at, generated_by, hook_alternatives, visual_brief`.
  - `ContentPlan::search(Builder $query, string $words): Builder`.
  - `PostController::WITH = ['visualBrief']`, `PostController::find(int $id): ContentPlannerPost` (static; 404 `not_found`), `PostController::assertFresh(ContentPlannerPost $post, string $seen): void` (409 `changed_elsewhere` with `post`). The `GET find` route's action is `PostController::search`: PHP allows one method per name.
  - Routes:
    - Reads: `GET find`, `GET posts`, `GET posts/{id}`.
    - Writes: `POST posts`, `PUT posts/{id}`, `DELETE posts/{id}`.
    - Actions: `POST posts/{id}/move|duplicate|mark-ready|mark-published`.

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Content/PostsTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class PostsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_staff_write_a_post_for_a_day_and_read_it_back(): void
    {
        $id = $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'scheduled_date' => '2026-10-07', 'topic' => 'Autumn colours'])
            ->assertCreated()
            ->assertJsonPath('post.platform', 'instagram')
            ->assertJsonPath('post.scheduled_date', '2026-10-07')
            ->assertJsonPath('post.status', 'draft')
            ->assertJsonPath('post.language', 'en')
            ->json('post.id');

        $this->asStaffMember()->getJson($this->api("posts/{$id}"))->assertOk()->assertJsonPath('post.topic', 'Autumn colours');
        $this->assertSame($this->brandId, (int) ContentPlannerPost::find($id)->brand_id);
    }

    public function test_a_save_sends_back_what_it_read_and_gets_the_new_post(): void
    {
        $post = $this->makePost(['hook' => 'Old hook']);
        $seen = $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->json('post.updated_at');

        $this->travel(1)->minutes();
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'New hook', 'scheduled_time' => '10:30', 'hashtags' => ['#autumn']])
            ->assertOk()
            ->assertJsonPath('post.hook', 'New hook')
            ->assertJsonPath('post.scheduled_time', '10:30')
            ->assertJsonPath('post.hashtags', ['#autumn']);
    }

    public function test_a_move_keeps_the_time_and_the_tray_clears_both(): void
    {
        $post = $this->makePost(['scheduled_time' => '09:00']);
        $seen = $post->fresh()->updated_at->toISOString();

        $moved = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $seen, 'scheduled_date' => '2026-10-09'])
            ->assertOk()
            ->assertJsonPath('post.scheduled_date', '2026-10-09')
            ->assertJsonPath('post.scheduled_time', '09:00')
            ->json('post.updated_at');

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $moved, 'scheduled_date' => null])
            ->assertOk()
            ->assertJsonPath('post.scheduled_date', null)
            ->assertJsonPath('post.scheduled_time', null);
    }

    public function test_duplicate_mark_ready_mark_published_and_delete(): void
    {
        $post = $this->makePost();

        $copy = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/duplicate"))
            ->assertCreated()
            ->assertJsonPath('post.status', 'draft')
            ->assertJsonPath('post.scheduled_date', '2026-10-12')
            ->json('post.id');
        $this->assertNotSame($post->id, $copy);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-ready"))->assertOk()->assertJsonPath('post.status', 'ready_to_publish');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-published"), ['published_url' => 'https://instagram.com/p/abc'])
            ->assertOk()
            ->assertJsonPath('post.status', 'published')
            ->assertJsonPath('post.published_url', 'https://instagram.com/p/abc');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-published"), ['published_url' => 'not a link'])->assertStatus(422);

        $this->asStaffMember()->deleteJson($this->api("posts/{$copy}"))->assertOk();
        $this->assertNull(ContentPlannerPost::find($copy));
    }

    public function test_the_list_filters_pages_and_finds(): void
    {
        $this->makePost(['topic' => 'Autumn colours', 'status' => 'draft', 'scheduled_date' => '2026-10-07']);
        $this->makePost(['topic' => 'Winter care', 'platform' => 'linkedin', 'status' => 'ready_to_publish', 'scheduled_date' => '2026-10-20']);
        $this->makePost(['topic' => 'An idea for later', 'status' => 'idea', 'scheduled_date' => null]);

        $this->asStaffMember()->getJson($this->api('posts'))->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('meta.total', 3)
            ->assertJsonPath('data.0.topic', 'Winter care')       // newest scheduled first
            ->assertJsonPath('data.2.topic', 'An idea for later'); // unscheduled last
        $this->asStaffMember()->getJson($this->api('posts?platform=linkedin'))->assertJsonCount(1, 'data');
        $this->asStaffMember()->getJson($this->api('posts?status=draft'))->assertJsonCount(1, 'data');
        $this->asStaffMember()->getJson($this->api('posts?unscheduled=1'))->assertJsonCount(1, 'data');
        $this->asStaffMember()->getJson($this->api('posts?from=2026-10-01&to=2026-10-10'))->assertJsonCount(1, 'data');
        $this->asStaffMember()->getJson($this->api('posts?q=WINTER'))->assertJsonCount(1, 'data');

        $this->asStaffMember()->getJson($this->api('find?q=autumn'))->assertOk()->assertJsonCount(1, 'posts')->assertJsonPath('posts.0.topic', 'Autumn colours');
        $this->asStaffMember()->getJson($this->api('find?q=a'))->assertOk()->assertJsonCount(0, 'posts');
    }

    public function test_a_card_shows_the_image_only_when_it_is_ready(): void
    {
        $post = $this->makePost();
        ContentPlannerVisualBrief::create(['post_id' => $post->id, 'image_url' => '/storage/x.png', 'image_status' => 'failed']);
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.image_url', null)->assertJsonPath('post.visual_brief.image_status', 'failed');

        $post->visualBrief()->update(['image_status' => 'ready']);
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.image_url', '/storage/x.png');
    }
}
```

`tests/Feature/Content/PostRulesTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerPost;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class PostRulesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_save_from_a_stale_copy_is_refused_with_the_current_post(): void
    {
        $post = $this->makePost(['hook' => 'Mine']);
        $seen = $post->fresh()->updated_at->toISOString();
        $this->travel(1)->minutes();
        $post->update(['hook' => 'Theirs']); // someone else saved since

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'Mine again'])
            ->assertStatus(409)
            ->assertJsonPath('error', 'changed_elsewhere')
            ->assertJsonPath('post.hook', 'Theirs');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $seen, 'scheduled_date' => '2026-10-09'])
            ->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere');
        $this->assertSame('Theirs', $post->fresh()->hook);
    }

    public function test_a_published_post_keeps_its_date(): void
    {
        $post = $this->makePost(['status' => 'published']);
        $seen = $post->fresh()->updated_at->toISOString();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $seen, 'scheduled_date' => '2026-10-09'])
            ->assertStatus(422)->assertJsonPath('error', 'published_cannot_move');
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'scheduled_date' => '2026-10-09'])
            ->assertStatus(422)->assertJsonPath('error', 'published_cannot_move');
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'Edited after'])->assertOk();
    }

    public function test_ids_from_another_organisation_or_another_brand_are_refused(): void
    {
        $post = $this->makePost();
        $seen = $post->fresh()->updated_at->toISOString();
        $other = $this->otherOrganization();
        [$second, $secondProfile] = $this->secondBrand();
        $theirPillar = ContentPlannerPillar::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'name' => 'Second brand pillar', 'active' => true]);
        $ourPillar = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Ours', 'active' => true]);

        foreach ([$other['pillarId'], $theirPillar->id] as $foreign) {
            $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'pillar_id' => $foreign])
                ->assertStatus(422)->assertJsonValidationErrors('pillar_id');
        }
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'pillar_id' => $ourPillar->id])->assertOk();
    }

    public function test_another_brands_or_organisations_post_does_not_exist_here_and_lists_never_mix_brands(): void
    {
        $other = $this->otherOrganization();
        [$second, $secondProfile] = $this->secondBrand();
        $theirs = ContentPlannerPost::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'platform' => 'instagram', 'status' => 'draft', 'topic' => 'Second brand post', 'scheduled_date' => '2026-10-07']);
        $this->makePost(['topic' => 'Our post']);

        $this->asStaffMember()->getJson($this->api("posts/{$other['post']->id}"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asStaffMember()->getJson($this->api("posts/{$theirs->id}"))->assertStatus(404);
        $this->asStaffMember()->getJson($this->api('posts'))->assertJsonCount(1, 'data')->assertJsonPath('data.0.topic', 'Our post');
        $this->asStaffMember()->getJson($this->api('posts') . '?brand_id=' . $second)->assertJsonCount(1, 'data')->assertJsonPath('data.0.topic', 'Second brand post');
    }

    public function test_column_limits_and_enums_are_validated_before_postgres_sees_them(): void
    {
        $post = $this->makePost();
        $seen = $post->fresh()->updated_at->toISOString();

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'format' => str_repeat('x', 51), 'hook' => str_repeat('y', 501), 'status' => 'nonsense', 'platform' => 'myspace'])
            ->assertStatus(422)->assertJsonValidationErrors(['format', 'hook', 'status', 'platform']);
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'scheduled_date' => '07/10/2026'])->assertStatus(422)->assertJsonValidationErrors('scheduled_date');
    }

    public function test_a_brand_without_a_profile_cannot_take_posts_but_lists_nothing(): void
    {
        [$second] = $this->secondBrand(withProfile: false);

        $this->asStaffMember()->postJson($this->api('posts') . '?brand_id=' . $second, ['platform' => 'instagram'])->assertStatus(409)->assertJsonPath('error', 'no_profile');
        $this->asStaffMember()->getJson($this->api('posts') . '?brand_id=' . $second)->assertOk()->assertJsonCount(0, 'data');
    }
}
```

Run: `t.sh tests/Feature/Content/PostsTest.php` and `t.sh tests/Feature/Content/PostRulesTest.php`
Expected: FAIL (404s: no routes).

- [ ] **Step 2: Add the validation helpers** to `app/Services/Content/ContentRules.php`:
  - Add the imports `use Illuminate\Validation\Rule;` and `use Illuminate\Validation\Rules\Exists;`.
  - Add these methods:

```php
    /** An id that must belong to this organisation AND the brand this call works on (spec 2026-10-14 §7, F2). */
    public static function owned(string $table): Exists
    {
        return Rule::exists($table, 'id')
            ->where('organization_id', ContentContext::orgId())
            ->where('brand_id', ContentContext::brandId());
    }

    /**
     * A post's editable fields, each optional, with the limits PostgreSQL's
     * columns enforce (sqlite does not, so these rules are the only guard).
     *
     * @return array<string, mixed>
     */
    public static function postFields(): array
    {
        return [
            'platform'         => ['sometimes', Rule::in(self::PLATFORMS)],
            'scheduled_date'   => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'scheduled_time'   => ['sometimes', 'nullable', 'date_format:H:i'],
            'status'           => ['sometimes', Rule::in(self::STATUSES)],
            'pillar_id'        => ['sometimes', 'nullable', 'integer', self::owned('content_planner_pillars')],
            'audience_id'      => ['sometimes', 'nullable', 'integer', self::owned('content_planner_audiences')],
            'campaign_id'      => ['sometimes', 'nullable', 'integer', self::owned('content_planner_campaigns')],
            'language'         => ['sometimes', 'string', 'max:10'],
            'topic'            => ['sometimes', 'nullable', 'string', 'max:255'],
            'title'            => ['sometimes', 'nullable', 'string', 'max:255'],
            'goal'             => ['sometimes', 'nullable', 'string', 'max:255'],
            'format'           => ['sometimes', 'nullable', 'string', 'max:50'],
            'hook'             => ['sometimes', 'nullable', 'string', 'max:500'],
            'main_copy'        => ['sometimes', 'nullable', 'string', 'max:20000'],
            'short_copy'       => ['sometimes', 'nullable', 'string', 'max:5000'],
            'cta'              => ['sometimes', 'nullable', 'string', 'max:255'],
            'hashtags'         => ['sometimes', 'nullable', 'array', 'max:30'],
            'hashtags.*'       => ['string', 'max:100'],
            'weekday_role'     => ['sometimes', 'nullable', 'string', 'max:50'],
            'funnel_stage'     => ['sometimes', 'nullable', Rule::in(self::FUNNEL_STAGES)],
            'post_type'        => ['sometimes', 'nullable', 'string', 'max:50'],
            'strategic_reason' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
    }
```

- [ ] **Step 3: Write** `app/Services/Content/ContentPostPresenter.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;

/** The shapes HexaTech Content sends for a post (spec 2026-10-14 §4). */
final class ContentPostPresenter
{
    /**
     * What a calendar card, a list row and Find draw. `updated_at` is the
     * version the portal sends back with a save or a move (F3).
     *
     * @return array<string, mixed>
     */
    public static function card(ContentPlannerPost $post): array
    {
        $brief = $post->relationLoaded('visualBrief') ? $post->visualBrief : $post->visualBrief()->first();

        return [
            'id'             => (int) $post->id,
            'platform'       => (string) $post->platform,
            'scheduled_date' => $post->scheduled_date?->format('Y-m-d'),
            'scheduled_time' => self::time($post->scheduled_time),
            'status'         => (string) $post->status,
            'title'          => $post->title,
            'hook'           => $post->hook,
            'topic'          => $post->topic,
            'pillar_id'      => $post->pillar_id ? (int) $post->pillar_id : null,
            'image_url'      => $brief?->image_status === 'ready' ? $brief->image_url : null,
            'updated_at'     => $post->updated_at?->toISOString(),
        ];
    }

    /** Everything the post panel shows and edits. @return array<string, mixed> */
    public static function detail(ContentPlannerPost $post): array
    {
        $brief = $post->relationLoaded('visualBrief') ? $post->visualBrief : $post->visualBrief()->first();

        return self::card($post) + [
            'language'          => $post->language,
            'goal'              => $post->goal,
            'format'            => $post->format,
            'main_copy'         => $post->main_copy,
            'short_copy'        => $post->short_copy,
            'cta'               => $post->cta,
            'hashtags'          => array_values((array) ($post->hashtags ?? [])),
            'audience_id'       => $post->audience_id ? (int) $post->audience_id : null,
            'campaign_id'       => $post->campaign_id ? (int) $post->campaign_id : null,
            'weekday_role'      => $post->weekday_role,
            'funnel_stage'      => $post->funnel_stage,
            'post_type'         => $post->post_type,
            'strategic_reason'  => $post->strategic_reason,
            'quality'           => $post->quality_score,
            'published_url'     => $post->published_url,
            'published_at'      => $post->published_at?->toISOString(),
            'generated_by'      => $post->generated_by,
            'hook_alternatives' => array_values((array) data_get($post->source_context, 'hook_alternatives', [])),
            'visual_brief'      => $brief ? [
                'visual_type'  => $brief->visual_type,
                'aspect_ratio' => $brief->aspect_ratio,
                'style'        => $brief->style,
                'description'  => $brief->description,
                'scene'        => $brief->scene,
                'mood'         => $brief->mood,
                'composition'  => $brief->composition,
                'text_overlay' => $brief->text_overlay,
                'avoid'        => $brief->avoid,
                'image_url'    => $brief->image_url,
                'image_status' => $brief->image_status,
                'image_error'  => $brief->image_error,
            ] : null,
        ];
    }

    /** PostgreSQL answers a time column as HH:MM:SS; the portal works in HH:MM. */
    private static function time(?string $value): ?string
    {
        return $value === null || $value === '' ? null : substr($value, 0, 5);
    }
}
```

- [ ] **Step 4: Write** `app/Services/Content/ContentPlan.php` (search now; Task 6 adds the plan):

```php
<?php

namespace App\Services\Content;

use Illuminate\Database\Eloquent\Builder;

/** Reading a brand's posts for the Plan, the Posts list and Find (spec 2026-10-14 §4.2, §4.4, §4.7). */
final class ContentPlan
{
    /**
     * Posts whose title, topic, hook or copy hold the words, in any case:
     * LIKE is case-sensitive on PostgreSQL, so both sides are lower-cased.
     */
    public static function search(Builder $query, string $words): Builder
    {
        $needle = '%' . mb_strtolower(trim($words)) . '%';

        return $query->where(function (Builder $q) use ($needle) {
            foreach (['title', 'topic', 'hook', 'main_copy'] as $column) {
                $q->orWhereRaw("LOWER(COALESCE({$column}, '')) LIKE ?", [$needle]);
            }
        });
    }
}
```

- [ ] **Step 5: Write** `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPlan;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;

/** A brand's posts: written, read, saved, moved and marked by every staff member (spec 2026-10-14 §5.1). */
class PostController extends Controller
{
    public const WITH = ['visualBrief'];

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q'           => 'nullable|string|max:100',
            'status'      => ['nullable', Rule::in(ContentRules::STATUSES)],
            'platform'    => ['nullable', Rule::in(ContentRules::PLATFORMS)],
            'pillar_id'   => 'nullable|integer',
            'from'        => 'nullable|date_format:Y-m-d',
            'to'          => 'nullable|date_format:Y-m-d|after_or_equal:from',
            'unscheduled' => 'nullable|boolean',
            'page'        => 'nullable|integer|min:1',
        ]);
        $profile = ContentContext::profile();
        if (!$profile) {
            return response()->json(['data' => [], 'meta' => ['page' => 1, 'pages' => 0, 'total' => 0]]);
        }

        $query = ContentPlannerPost::with(self::WITH)
            ->where('planner_profile_id', $profile->id)
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($data['platform'] ?? null, fn ($q, $platform) => $q->where('platform', $platform))
            ->when($data['pillar_id'] ?? null, fn ($q, $pillar) => $q->where('pillar_id', $pillar))
            ->when($data['from'] ?? null, fn ($q, $from) => $q->whereDate('scheduled_date', '>=', $from))
            ->when($data['to'] ?? null, fn ($q, $to) => $q->whereDate('scheduled_date', '<=', $to))
            ->when($request->boolean('unscheduled'), fn ($q) => $q->whereNull('scheduled_date'))
            ->when(trim((string) ($data['q'] ?? '')) !== '', fn ($q) => ContentPlan::search($q, $data['q']))
            // Newest scheduled first; posts without a date last.
            ->orderByRaw('CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('scheduled_date')->orderByDesc('scheduled_time')->orderByDesc('id');

        $page = $query->paginate(50, ['*'], 'page', (int) ($data['page'] ?? 1));

        return response()->json([
            'data' => $page->getCollection()->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p))->values(),
            'meta' => ['page' => $page->currentPage(), 'pages' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    /** Find (`GET find`): up to eight posts, from two letters (spec §4.7). Not named find(): that is the lookup below. */
    public function search(Request $request): JsonResponse
    {
        $words = trim((string) ($request->validate(['q' => 'nullable|string|max:100'])['q'] ?? ''));
        $profile = ContentContext::profile();
        if (!$profile || mb_strlen($words) < 2) {
            return response()->json(['posts' => []]);
        }

        $posts = ContentPlan::search(ContentPlannerPost::with(self::WITH)->where('planner_profile_id', $profile->id), $words)
            ->where('status', '!=', 'archived')
            ->orderByDesc('scheduled_date')->orderByDesc('id')
            ->limit(8)->get();

        return response()->json(['posts' => $posts->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $profile = ContentContext::requireProfile();
        $data = $request->validate(
            ['platform' => ['required', Rule::in(ContentRules::PLATFORMS)]] + Arr::except(ContentRules::postFields(), ['platform'])
        );

        $post = ContentPlannerPost::create(array_merge(
            ['status' => 'draft', 'language' => $profile->default_language ?: 'en'],
            $data,
            [
                'planner_profile_id' => $profile->id,
                'brand_id'           => $profile->brand_id,
                'generated_by'       => 'manual',
                'created_by'         => $request->user()->id,
            ],
        ));

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))], 201);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['post' => ContentPostPresenter::detail(self::find($id))]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $post = self::find($id);
        $data = $request->validate(['updated_at' => 'required|string'] + ContentRules::postFields());
        self::assertFresh($post, $data['updated_at']);

        $fields = Arr::except($data, ['updated_at']);
        if ($post->status === 'published' && array_key_exists('scheduled_date', $fields)
            && $fields['scheduled_date'] !== $post->scheduled_date?->format('Y-m-d')) {
            self::refusePublishedMove();
        }

        $post->fill($fields)->save();

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))]);
    }

    /** A drag on the calendar, a keyboard move, or a drop on the Unscheduled tray (spec §4.2). */
    public function move(Request $request, int $id): JsonResponse
    {
        $post = self::find($id);
        $data = $request->validate([
            'updated_at'     => 'required|string',
            'scheduled_date' => 'present|nullable|date_format:Y-m-d',
            'scheduled_time' => 'sometimes|nullable|date_format:H:i',
        ]);
        self::assertFresh($post, $data['updated_at']);
        if ($post->status === 'published') {
            self::refusePublishedMove();
        }

        $post->scheduled_date = $data['scheduled_date'];
        if (array_key_exists('scheduled_time', $data)) {
            $post->scheduled_time = $data['scheduled_time'];
        }
        // The tray holds ideas without a day: no day, no time.
        if ($data['scheduled_date'] === null) {
            $post->scheduled_time = null;
        }
        $post->save();

        return response()->json(['post' => ContentPostPresenter::card($post->fresh(self::WITH))]);
    }

    public function duplicate(Request $request, int $id): JsonResponse
    {
        $copy = self::find($id)->replicate(['published_url', 'published_at', 'status']);
        $copy->status = 'draft';
        $copy->created_by = $request->user()->id;
        $copy->scheduled_date = CarbonImmutable::parse(VenueClock::today(ContentContext::orgId()))->addDays(7)->format('Y-m-d');
        $copy->save();

        return response()->json(['post' => ContentPostPresenter::detail($copy->fresh(self::WITH))], 201);
    }

    public function markReady(int $id): JsonResponse
    {
        $post = self::find($id);
        $post->update(['status' => 'ready_to_publish']);

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))]);
    }

    public function markPublished(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['published_url' => 'nullable|url|max:255']);
        $post = self::find($id);
        $post->update(['status' => 'published', 'published_at' => now(), 'published_url' => $data['published_url'] ?? null]);

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))]);
    }

    public function destroy(int $id): JsonResponse
    {
        self::find($id)->delete();

        return response()->json(['deleted' => true]);
    }

    /** A post of this organisation and brand, or not_found (another brand's post does not exist here). */
    public static function find(int $id): ContentPlannerPost
    {
        return ContentPlannerPost::with(self::WITH)->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This post no longer exists.', 404);
    }

    /**
     * A save or a move made from a copy someone else has changed since is
     * refused, with the post as it is now (spec 2026-10-14 §7, F3). Versions
     * compare to the second, the precision the column keeps.
     */
    public static function assertFresh(ContentPlannerPost $post, string $seen): void
    {
        $sent = rescue(fn () => CarbonImmutable::parse($seen), null, false);
        if ($sent === null || $post->updated_at === null || $sent->getTimestamp() !== $post->updated_at->getTimestamp()) {
            throw new ContentRefused(
                'changed_elsewhere',
                'Someone else changed this post — reload to see their version.',
                409,
                ['post' => ContentPostPresenter::detail($post->fresh(self::WITH))],
            );
        }
    }

    private static function refusePublishedMove(): never
    {
        throw new ContentRefused('published_cannot_move', 'A published post keeps the date it went out.', 422);
    }
}
```

- [ ] **Step 6: Routes.** Inside the content group in `routes/api.php`, after the `bootstrap` line, add:

```php
                Route::get('find', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'search']);
                Route::get('posts', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'index']);
                Route::post('posts', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'store']);
                Route::get('posts/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'show'])->whereNumber('id');
                Route::put('posts/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'update'])->whereNumber('id');
                Route::delete('posts/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'destroy'])->whereNumber('id');
                Route::post('posts/{id}/move', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'move'])->whereNumber('id');
                Route::post('posts/{id}/duplicate', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'duplicate'])->whereNumber('id');
                Route::post('posts/{id}/mark-ready', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'markReady'])->whereNumber('id');
                Route::post('posts/{id}/mark-published', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'markPublished'])->whereNumber('id');
```

- [ ] **Step 7: Run and commit**

```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Feature/Content/; $T tests/Feature/AdminAccess/; $T tests/Feature/RouteUniquenessTest.php; $T tests/Feature/RouteControllersExistTest.php
cd /c/wamp64/www/Hexa-Tech-content && git add app routes/api.php tests && git commit -q -F - <<'EOF'
Content server: posts — list, Find, write, save, move, duplicate, mark, delete

Every id a request names must belong to this organisation and brand; a save
or move from a copy someone has changed since is refused with the post as it
is now; a published post keeps its date; column limits are validated before
PostgreSQL sees them; lists never mix brands.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: all PASS.

---

### Task 6: The plan — slots, the week's figures and the unscheduled tray

**Files:**
- Create: `app/Services/Content/ContentSlots.php`, `app/Http/Controllers/Api/V1/Admin/Content/PlanController.php`
- Modify: `app/Services/Content/ContentPlan.php` (`for()`, `openSlots()`), `routes/api.php`
- Test: `tests/Unit/Content/ContentSlotsTest.php`, `tests/Feature/Content/PlanTest.php`

**Interfaces:**
- Consumes: `ContentPostPresenter::card` (Task 5).
- Produces:
  - `ContentSlots::open(array $channels, array $taken, string $from, string $to, string $today): list<array{date:string, platform:string}>`.
  - `ContentPlan::openSlots(ContentPlannerProfile $profile, string $from, string $to, string $today): list<array{date, platform}>`.
  - `ContentPlan::for(ContentPlannerProfile $profile, string $from, string $to, string $today): array{posts, unscheduled, slots, figures{planned, ready, published, open_slots}}`.
  - `GET plan?from&to` (at most 62 days).

- [ ] **Step 1: Write the failing tests**

`tests/Unit/Content/ContentSlotsTest.php`:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentSlots;
use PHPUnit\Framework\TestCase;

class ContentSlotsTest extends TestCase
{
    private const DAYS = ['mon' => false, 'tue' => false, 'wed' => false, 'thu' => false, 'fri' => false, 'sat' => false, 'sun' => false];

    private function channel(string $platform, array $on): array
    {
        return ['platform' => $platform, 'frequency' => array_merge(self::DAYS, array_fill_keys($on, true))];
    }

    public function test_a_slot_is_a_ticked_weekday_of_an_active_channel_from_today_on(): void
    {
        $slots = ContentSlots::open([$this->channel('instagram', ['mon', 'wed'])], [], '2026-10-01', '2026-10-11', '2026-10-05');

        // 1 Oct (Thu) … 4 Oct are before today; Mon 5 and Wed 7 are open; nothing after Sun 11.
        $this->assertSame([['date' => '2026-10-05', 'platform' => 'instagram'], ['date' => '2026-10-07', 'platform' => 'instagram']], $slots);
    }

    public function test_a_taken_day_is_not_open_and_a_channel_without_days_has_none(): void
    {
        $slots = ContentSlots::open(
            [$this->channel('instagram', ['mon', 'wed']), $this->channel('linkedin', []), ['platform' => 'x', 'frequency' => null]],
            ['2026-10-05|instagram' => true],
            '2026-10-05', '2026-10-07', '2026-10-05',
        );

        $this->assertSame([['date' => '2026-10-07', 'platform' => 'instagram']], $slots);
    }

    public function test_two_channels_on_one_platform_make_one_slot_and_a_range_before_today_none(): void
    {
        $this->assertCount(1, ContentSlots::open([$this->channel('instagram', ['mon']), $this->channel('instagram', ['mon'])], [], '2026-10-05', '2026-10-05', '2026-10-05'));
        $this->assertSame([], ContentSlots::open([$this->channel('instagram', ['mon'])], [], '2026-09-28', '2026-10-04', '2026-10-05'));
    }
}
```

`tests/Feature/Content/PlanTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class PlanTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_the_week_has_its_posts_open_slots_figures_and_the_tray(): void
    {
        $this->makePost(['topic' => 'Wed draft', 'scheduled_date' => '2026-10-07', 'scheduled_time' => '09:00']);
        $this->makePost(['topic' => 'Tue ready', 'platform' => 'linkedin', 'status' => 'ready_to_publish', 'scheduled_date' => '2026-10-06']);
        $this->makePost(['topic' => 'Fri published', 'status' => 'published', 'scheduled_date' => '2026-10-09']);
        $this->makePost(['topic' => 'Mon archived', 'status' => 'archived', 'scheduled_date' => '2026-10-05']);
        $this->makePost(['topic' => 'Sat skipped', 'status' => 'skipped', 'scheduled_date' => '2026-10-10']);
        $this->makePost(['topic' => 'An idea', 'status' => 'idea', 'scheduled_date' => null]);

        $answer = $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->assertOk();

        $this->assertSame(['Tue ready', 'Wed draft', 'Fri published', 'Sat skipped'], array_column($answer->json('posts'), 'topic'));
        $this->assertSame([['date' => '2026-10-05', 'platform' => 'instagram'], ['date' => '2026-10-08', 'platform' => 'linkedin']], $answer->json('slots'));
        $this->assertSame(['planned' => 3, 'ready' => 1, 'published' => 1, 'open_slots' => 2], $answer->json('figures'));
        $this->assertSame(['An idea'], array_column($answer->json('unscheduled'), 'topic'));
    }

    public function test_slots_start_from_the_venues_today_not_the_servers(): void
    {
        // 22:30 UTC on Monday is already 01:30 on Tuesday in Riga: Monday's Instagram slot is gone.
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 22:30:00'));

        $slots = $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->assertOk()->json('slots');

        $this->assertNotContains(['date' => '2026-10-05', 'platform' => 'instagram'], $slots);
        $this->assertContains(['date' => '2026-10-06', 'platform' => 'linkedin'], $slots);
    }

    public function test_a_range_is_checked_and_a_brand_without_a_profile_has_an_empty_plan(): void
    {
        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-01&to=2026-12-15'))->assertStatus(422)->assertJsonValidationErrors('to');
        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-10&to=2026-10-01'))->assertStatus(422);
        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-01&to=2026-11-11'))->assertOk(); // a six-week month grid fits

        [$second] = $this->secondBrand(withProfile: false);
        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11') . '&brand_id=' . $second)
            ->assertOk()
            ->assertJsonPath('figures', ['planned' => 0, 'ready' => 0, 'published' => 0, 'open_slots' => 0]);
    }
}
```

Run: `t.sh tests/Unit/Content/` and `t.sh tests/Feature/Content/PlanTest.php`
Expected: FAIL (classes and route missing).

- [ ] **Step 2: Write** `app/Services/Content/ContentSlots.php`:

```php
<?php

namespace App\Services\Content;

use Carbon\CarbonImmutable;

/**
 * Open slots (spec 2026-10-14 §6.6): one per active channel and weekday its
 * `frequency` ticks, from the venue's today on, where the brand has no post
 * on that day for that platform other than an archived one (a skipped post
 * fills its slot on purpose). A channel with no ticked day has none.
 * Pure: the caller loads the channels and the days already taken.
 */
final class ContentSlots
{
    private const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    /**
     * @param list<array{platform: string, frequency: array<string, bool>|null}> $channels
     * @param array<string, true> $taken keys "Y-m-d|platform"
     * @return list<array{date: string, platform: string}>
     */
    public static function open(array $channels, array $taken, string $from, string $to, string $today): array
    {
        $out = [];
        $seen = [];
        for ($day = CarbonImmutable::parse(max($from, $today)); $day->format('Y-m-d') <= $to; $day = $day->addDay()) {
            $date = $day->format('Y-m-d');
            $weekday = self::DAYS[$day->dayOfWeekIso - 1];
            foreach ($channels as $channel) {
                $platform = (string) $channel['platform'];
                $key = "{$date}|{$platform}";
                $frequency = (array) ($channel['frequency'] ?? []);
                if (!($frequency[$weekday] ?? false)) {
                    continue;
                }
                if (isset($taken[$key]) || isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $out[] = ['date' => $date, 'platform' => $platform];
            }
        }

        return $out;
    }
}
```

- [ ] **Step 3: Add the plan** to `app/Services/Content/ContentPlan.php`. Add the imports `use App\Models\ContentPlannerPost;` and `use App\Models\ContentPlannerProfile;`, then these methods:

```php
    /** @return list<array{date: string, platform: string}> */
    public static function openSlots(ContentPlannerProfile $profile, string $from, string $to, string $today): array
    {
        $channels = $profile->channels()->where('active', true)->get(['platform', 'frequency'])
            ->map(fn ($c) => ['platform' => (string) $c->platform, 'frequency' => (array) ($c->frequency ?? [])])
            ->all();
        $taken = [];
        foreach (self::datedPosts($profile, max($from, $today), $to)->get(['scheduled_date', 'platform']) as $post) {
            $taken[$post->scheduled_date->format('Y-m-d') . '|' . $post->platform] = true;
        }

        return ContentSlots::open($channels, $taken, $from, $to, $today);
    }

    /**
     * The Plan for a range (spec 2026-10-14 §4.2): its cards (archived ones
     * left out), the posts without a day, its open slots, and the figures of
     * the This week strip — planned (not skipped or archived), ready,
     * published, open slots.
     *
     * @return array{posts: list<array>, unscheduled: list<array>, slots: list<array>, figures: array{planned: int, ready: int, published: int, open_slots: int}}
     */
    public static function for(ContentPlannerProfile $profile, string $from, string $to, string $today): array
    {
        $posts = self::datedPosts($profile, $from, $to)->with('visualBrief')
            ->orderBy('scheduled_date')
            ->orderByRaw('CASE WHEN scheduled_time IS NULL THEN 0 ELSE 1 END')
            ->orderBy('scheduled_time')->orderBy('id')
            ->get();
        $unscheduled = ContentPlannerPost::with('visualBrief')
            ->where('planner_profile_id', $profile->id)
            ->whereNull('scheduled_date')->where('status', '!=', 'archived')
            ->orderByDesc('id')->limit(100)->get();
        $slots = self::openSlots($profile, $from, $to, $today);

        return [
            'posts'       => $posts->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p))->values()->all(),
            'unscheduled' => $unscheduled->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p))->values()->all(),
            'slots'       => $slots,
            'figures'     => [
                'planned'    => $posts->whereNotIn('status', ['skipped'])->count(),
                'ready'      => $posts->where('status', 'ready_to_publish')->count(),
                'published'  => $posts->where('status', 'published')->count(),
                'open_slots' => count($slots),
            ],
        ];
    }

    /** A brand's dated posts in a range, archived ones left out (whereDate: sqlite keeps the date as Y-m-d H:i:s). */
    private static function datedPosts(ContentPlannerProfile $profile, string $from, string $to): Builder
    {
        return ContentPlannerPost::query()
            ->where('planner_profile_id', $profile->id)
            ->whereNotNull('scheduled_date')
            ->whereDate('scheduled_date', '>=', $from)
            ->whereDate('scheduled_date', '<=', $to)
            ->where('status', '!=', 'archived');
    }
```

- [ ] **Step 4: Write** `app/Http/Controllers/Api/V1/Admin/Content/PlanController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPlan;
use App\Services\Content\ContentRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** The Plan: a week, a month grid or a list's range (spec 2026-10-14 §4.2). */
class PlanController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => 'required|date_format:Y-m-d',
            'to'   => 'required|date_format:Y-m-d|after_or_equal:from',
        ]);
        if (ContentRules::days($data['from'], $data['to']) > ContentRules::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['to' => 'The range can be at most ' . ContentRules::MAX_RANGE_DAYS . ' days.']);
        }

        $profile = ContentContext::profile();
        if (!$profile) {
            return response()->json(['posts' => [], 'unscheduled' => [], 'slots' => [], 'figures' => ['planned' => 0, 'ready' => 0, 'published' => 0, 'open_slots' => 0]]);
        }

        return response()->json(ContentPlan::for($profile, $data['from'], $data['to'], VenueClock::today(ContentContext::orgId())));
    }
}
```

Route, inside the content group after `bootstrap`:

```php
                Route::get('plan', [\App\Http\Controllers\Api\V1\Admin\Content\PlanController::class, 'show']);
```

- [ ] **Step 5: Run and commit**

```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Unit/Content/; $T tests/Feature/Content/; $T tests/Feature/RouteControllersExistTest.php; $T tests/Feature/AdminAccess/AccessMapTest.php
cd /c/wamp64/www/Hexa-Tech-content && git add app routes/api.php tests && git commit -q -F - <<'EOF'
Content server: the plan — open slots, the week's figures and the tray

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: all PASS.

---

### Task 7: AI on one post, and Fill a slot

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/Content/PostAiController.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/Content/PostAiTest.php`

**Interfaces:**
- Consumes:
  - `ContentAiGate` (Task 4)
  - `PostController::find`, `PostController::WITH`, `ContentPostPresenter::detail` (Task 5)
  - `ContentPlan::openSlots` (Task 6)
  - the existing `ContentPostGenerationService::generate|generateAlternatives`, `ContentQualityService::check`, `ContentVisualBriefService::generateFor`, `ImageGenerationService::generateForPost`, `ContentCalendarGenerationService::generate`
- Produces: `POST posts/{id}/write|rewrite|quality|visual-brief|image` and `POST slots/fill`. A provider failure answers 502 `ai_failed` with the post unchanged.

- [ ] **Step 1: Write the failing test** `tests/Feature/Content/PostAiTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostVariation;
use App\Services\ContentPostGenerationService;
use App\Services\ContentQualityService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class PostAiTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function mockPosts(): \Mockery\MockInterface
    {
        $posts = Mockery::mock(ContentPostGenerationService::class);
        $this->app->instance(ContentPostGenerationService::class, $posts);

        return $posts;
    }

    public function test_staff_have_ai_write_a_posts_copy(): void
    {
        $post = $this->makePost();
        $this->mockPosts()->shouldReceive('generate')->once()->andReturnUsing(function (ContentPlannerPost $p, ?string $instructions) {
            $this->assertSame('Mention the October offer', $instructions);
            $p->update(['hook' => 'Fresh hook', 'main_copy' => 'Fresh copy', 'status' => 'needs_review']);

            return ['post' => $p->fresh(['visualBrief']), 'ai_response' => []];
        });

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"), ['instructions' => 'Mention the October offer'])
            ->assertOk()
            ->assertJsonPath('post.hook', 'Fresh hook')
            ->assertJsonPath('post.status', 'needs_review');
    }

    public function test_a_rewrite_answers_the_variation_and_only_the_five_kinds_exist(): void
    {
        $post = $this->makePost();
        $this->mockPosts()->shouldReceive('generateAlternatives')->once()->with(Mockery::type(ContentPlannerPost::class), 'shorter', 'Keep the emoji')
            ->andReturnUsing(fn (ContentPlannerPost $p) => ['variation' => ContentPlannerPostVariation::create(['post_id' => $p->id, 'variation_type' => 'shorter', 'copy' => 'Short copy']), 'ai_response' => 'Short copy']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/rewrite"), ['type' => 'shorter', 'guidance' => 'Keep the emoji'])
            ->assertOk()
            ->assertJsonPath('variation.type', 'shorter')
            ->assertJsonPath('variation.copy', 'Short copy');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/rewrite"), ['type' => 'sarcastic'])->assertStatus(422)->assertJsonValidationErrors('type');
    }

    public function test_the_quality_score_comes_back_with_the_post(): void
    {
        $post = $this->makePost();
        $quality = Mockery::mock(ContentQualityService::class);
        $quality->shouldReceive('check')->once()->andReturnUsing(function (ContentPlannerPost $p) {
            // A whole number: JSON writes 8.0 as "8.0", which reads back as a float and is not the int 8.
            $result = ['scores' => ['clarity' => 8], 'overall' => 8, 'flags' => [], 'improvements' => [], 'verdict' => 'good'];
            $p->update(['quality_score' => $result]);

            return $result;
        });
        $this->app->instance(ContentQualityService::class, $quality);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/quality"))
            ->assertOk()
            ->assertJsonPath('quality.verdict', 'good')
            ->assertJsonPath('post.quality.overall', 8);
    }

    public function test_a_provider_failure_answers_ai_failed_and_leaves_the_post_as_it_was(): void
    {
        $post = $this->makePost(['hook' => 'Kept']);
        $this->mockPosts()->shouldReceive('generate')->once()->andThrow(new \RuntimeException("AI request failed for 'post_copy' generation: overloaded"));

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"))
            ->assertStatus(502)
            ->assertJsonPath('error', 'ai_failed');
        $this->assertSame('Kept', $post->fresh()->hook);
    }

    public function test_at_the_budget_cap_no_ai_runs_and_writing_by_hand_still_works(): void
    {
        $post = $this->makePost();
        $this->setAiCap(100, 120);
        $this->mockPosts()->shouldNotReceive('generate');

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"))->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'By hand'])->assertCreated();
    }

    public function test_fill_writes_one_post_for_an_open_slot(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);

        $this->asStaffMember()->postJson($this->api('slots/fill'), ['date' => '2026-10-05', 'platform' => 'instagram'])
            ->assertCreated()
            ->assertJsonPath('post.platform', 'instagram')
            ->assertJsonPath('post.scheduled_date', '2026-10-05')
            ->assertJsonPath('post.status', 'draft');
        $this->assertSame(1, ContentPlannerPost::where('planner_profile_id', $this->profile->id)->count());
    }

    public function test_fill_refuses_a_day_that_is_not_an_open_slot(): void
    {
        $this->fakeAi([]);
        $this->makePost(['scheduled_date' => '2026-10-07']);

        foreach ([['2026-10-06', 'instagram'], ['2026-10-02', 'instagram'], ['2026-10-07', 'instagram']] as [$date, $platform]) {
            $this->asStaffMember()->postJson($this->api('slots/fill'), ['date' => $date, 'platform' => $platform])
                ->assertStatus(422)->assertJsonPath('error', 'slot_not_open');
        }
    }
}
```

Run: `t.sh tests/Feature/Content/PostAiTest.php`
Expected: FAIL (404: routes missing).

- [ ] **Step 2: Write** `app/Http/Controllers/Api/V1/Admin/Content/PostAiController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPlan;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\ContentCalendarGenerationService;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentPostGenerationService;
use App\Services\ContentQualityService;
use App\Services\ContentVisualBriefService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * AI on one post, for every staff member (spec 2026-10-14 §5.1): write the
 * copy, the five rewrites, the quality score, the visual brief, the image,
 * and Fill an open slot with one AI-written post. Each passes the budget
 * first; a provider failure answers ai_failed and changes nothing.
 */
class PostAiController extends Controller
{
    public function __construct(private ContentAiGate $gate)
    {
    }

    public function write(Request $request, int $id, ContentPostGenerationService $posts): JsonResponse
    {
        $data = $request->validate(['instructions' => 'nullable|string|max:1000']);
        $post = $this->prepare($request, $id);
        $this->run(fn () => $posts->generate($post, $data['instructions'] ?? null));

        return $this->post($post);
    }

    public function rewrite(Request $request, int $id, ContentPostGenerationService $posts): JsonResponse
    {
        $data = $request->validate([
            'type'     => ['required', Rule::in(ContentRules::REWRITES)],
            'guidance' => 'nullable|string|max:1000',
        ]);
        $post = $this->prepare($request, $id);
        $variation = $this->run(fn () => $posts->generateAlternatives($post, $data['type'], $data['guidance'] ?? null))['variation'];

        return response()->json(['variation' => [
            'id'   => (int) $variation->id,
            'type' => (string) $variation->variation_type,
            'copy' => (string) $variation->copy,
        ]]);
    }

    public function quality(Request $request, int $id, ContentQualityService $quality): JsonResponse
    {
        $post = $this->prepare($request, $id);
        $result = $this->run(fn () => $quality->check($post));

        return response()->json(['quality' => $result, 'post' => ContentPostPresenter::detail($post->fresh(PostController::WITH))]);
    }

    public function visualBrief(Request $request, int $id, ContentVisualBriefService $briefs): JsonResponse
    {
        $post = $this->prepare($request, $id);
        $this->run(fn () => $briefs->generateFor($post));

        return $this->post($post);
    }

    public function image(Request $request, int $id, ImageGenerationService $images): JsonResponse
    {
        $data = $request->validate(['instructions' => 'nullable|string|max:1000']);
        $post = $this->prepare($request, $id);
        $this->run(fn () => $images->generateForPost($post, $data['instructions'] ?? null));

        return $this->post($post);
    }

    /** One AI-written post for an open slot (spec §4.2), through the calendar's own one-day generation. */
    public function fill(Request $request, ContentCalendarGenerationService $calendar): JsonResponse
    {
        $data = $request->validate([
            'date'     => 'required|date_format:Y-m-d',
            'platform' => ['required', Rule::in(ContentRules::PLATFORMS)],
        ]);
        $org = $request->attributes->get('workspace_org');
        $this->gate->allow($org);
        $profile = ContentContext::requireProfile();
        $open = ContentPlan::openSlots($profile, $data['date'], $data['date'], VenueClock::today((int) $org->id));
        if (!in_array(['date' => $data['date'], 'platform' => $data['platform']], $open, true)) {
            throw new ContentRefused('slot_not_open', 'That day already has a post for this platform, or it is not one of its days.', 422);
        }

        set_time_limit(600);
        $result = $this->gate->oneGenerationAtATime((int) $org->id, (int) $profile->brand_id, fn () => $this->run(
            fn () => $calendar->generate($profile, $data['date'], $data['date'], ['platforms' => [$data['platform']], 'fill_empty_only' => true])
        ));
        $post = collect($result['created'])->first(fn (ContentPlannerPost $p) => $p->platform === $data['platform']);
        if (!$post) {
            throw new ContentRefused('ai_failed', 'The AI did not write a post for this slot. Please try again.', 502);
        }

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(PostController::WITH))], 201);
    }

    private function prepare(Request $request, int $id): ContentPlannerPost
    {
        $this->gate->allow($request->attributes->get('workspace_org'));
        $post = PostController::find($id);
        set_time_limit(600); // one AI call can take a minute or more

        return $post;
    }

    private function post(ContentPlannerPost $post): JsonResponse
    {
        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(PostController::WITH))]);
    }

    /** One AI call. A provider failure becomes ai_failed (502); a refusal passes through. */
    private function run(callable $call): mixed
    {
        try {
            return $call();
        } catch (ContentRefused $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);
            throw new ContentRefused('ai_failed', $e->getMessage() !== '' ? $e->getMessage() : 'The AI could not finish this. Please try again.', 502);
        }
    }
}
```

Routes, inside the content group after the post routes:

```php
                Route::post('posts/{id}/write', [\App\Http\Controllers\Api\V1\Admin\Content\PostAiController::class, 'write'])->whereNumber('id');
                Route::post('posts/{id}/rewrite', [\App\Http\Controllers\Api\V1\Admin\Content\PostAiController::class, 'rewrite'])->whereNumber('id');
                Route::post('posts/{id}/quality', [\App\Http\Controllers\Api\V1\Admin\Content\PostAiController::class, 'quality'])->whereNumber('id');
                Route::post('posts/{id}/visual-brief', [\App\Http\Controllers\Api\V1\Admin\Content\PostAiController::class, 'visualBrief'])->whereNumber('id');
                Route::post('posts/{id}/image', [\App\Http\Controllers\Api\V1\Admin\Content\PostAiController::class, 'image'])->whereNumber('id');
                Route::post('slots/fill', [\App\Http\Controllers\Api\V1\Admin\Content\PostAiController::class, 'fill']);
```

- [ ] **Step 3: Run and commit**

```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Feature/Content/; $T tests/Feature/RouteControllersExistTest.php; $T tests/Feature/AdminAccess/AccessMapTest.php
cd /c/wamp64/www/Hexa-Tech-content && git add app routes/api.php tests && git commit -q -F - <<'EOF'
Content server: AI on one post, and Fill a slot

Write, the five rewrites, quality, visual brief and image for every staff
member, each behind the AI budget; Fill writes one post for an open slot
through the calendar's one-day generation, one at a time per brand. A
provider failure answers ai_failed and leaves the post as it was.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: all PASS.

---

### Task 8: Generate a week, a month or a range (managers)

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/Content/GenerationController.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/Content/GenerateTest.php`

**Interfaces:**
- Consumes: `ContentAccess::requireManager`, `ContentContext` (Task 1); `ContentAiGate` (Task 4); `ContentPostPresenter::card` (Task 5); `ContentRules::days`, `MAX_RANGE_DAYS` (Task 3).
- Produces: `POST generate {from, to, platforms?, fill_empty_only?, instructions?}` answering `{status: completed|partial|failed, created_count, posts[cards], skipped[], failed_windows[]}`, with HTTP 503 when `failed`.

- [ ] **Step 1: Write the failing test** `tests/Feature/Content/GenerateTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerChannel;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class GenerateTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_manager_generates_a_week_and_the_spend_is_counted(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram'), $this->calendarItem('2026-10-06', 'linkedin')]);

        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('created_count', 2)
            ->assertJsonPath('posts.0.status', 'draft');
        $this->assertSame('content', DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->value('feature'));
    }

    public function test_staff_may_not_generate_a_whole_calendar(): void
    {
        $this->fakeAi([]);
        $this->asStaffMember()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');
    }

    public function test_a_second_generation_for_the_brand_is_refused_while_one_runs(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);
        $lock = Cache::lock("content:generate:{$this->org->id}:{$this->brandId}", 300);
        $this->assertTrue($lock->get());

        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(409)->assertJsonPath('error', 'already_generating');

        $lock->release();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertOk();
    }

    public function test_a_provider_failure_answers_503_and_frees_the_brand(): void
    {
        // The provider fails the first request and answers the second.
        $this->fakeAiTurns([[[], 500], [[$this->calendarItem('2026-10-05', 'instagram')], 200]]);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(503)
            ->assertJsonPath('status', 'failed')
            ->assertJsonPath('created_count', 0)
            ->assertJsonPath('failed_windows.0.reason', 'provider_unavailable');

        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertOk()->assertJsonPath('created_count', 1);
    }

    public function test_the_range_the_budget_and_the_channels_are_checked(): void
    {
        $this->fakeAi([]);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-01', 'to' => '2026-12-31'])->assertStatus(422)->assertJsonValidationErrors('to');
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11', 'platforms' => ['myspace']])->assertStatus(422);

        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->update(['active' => false]);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(422)->assertJsonPath('error', 'no_channels');

        $this->setAiCap(100, 100);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
    }
}
```

Run: `t.sh tests/Feature/Content/GenerateTest.php`
Expected: FAIL (404).

- [ ] **Step 2: Write** `app/Http/Controllers/Api/V1/Admin/Content/GenerationController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\ContentCalendarGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Generate (spec 2026-10-14 §4.2): a manager has AI write a week, a month or
 * a range of up to 62 days, empty slots only by default, one generation at a
 * time per brand. A partial run keeps what it wrote and says which windows
 * failed; a run that wrote nothing answers 503.
 */
class GenerationController extends Controller
{
    public function __construct(private ContentAiGate $gate)
    {
    }

    public function generate(Request $request, ContentCalendarGenerationService $calendar): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate([
            'from'            => 'required|date_format:Y-m-d',
            'to'              => 'required|date_format:Y-m-d|after_or_equal:from',
            'platforms'       => 'nullable|array',
            'platforms.*'     => [Rule::in(ContentRules::PLATFORMS)],
            'fill_empty_only' => 'nullable|boolean',
            'instructions'    => 'nullable|string|max:2000',
        ]);
        if (ContentRules::days($data['from'], $data['to']) > ContentRules::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['to' => 'The range can be at most ' . ContentRules::MAX_RANGE_DAYS . ' days.']);
        }
        $org = $request->attributes->get('workspace_org');
        $this->gate->allow($org);
        $profile = ContentContext::requireProfile();

        set_time_limit(600);
        try {
            $result = $this->gate->oneGenerationAtATime((int) $org->id, (int) $profile->brand_id, fn () => $calendar->generate($profile, $data['from'], $data['to'], [
                'platforms'       => $data['platforms'] ?? null,
                'fill_empty_only' => $request->boolean('fill_empty_only', true),
                'instructions'    => $data['instructions'] ?? null,
            ]));
        } catch (ContentRefused $e) {
            throw $e;
        } catch (\InvalidArgumentException $e) {
            // The service's one remaining refusal once the range is valid: no active channel.
            throw new ContentRefused('no_channels', $e->getMessage(), 422);
        } catch (\Throwable $e) {
            report($e);
            throw new ContentRefused('generation_failed', 'Generation stopped unexpectedly. Any drafts already saved remain in your plan. Please reload before retrying.', 500);
        }

        $created = collect($result['created']);
        $incomplete = $result['failed_windows'] !== [];
        $status = $incomplete ? ($created->isNotEmpty() ? 'partial' : 'failed') : 'completed';

        return response()->json([
            'status'         => $status,
            'created_count'  => $created->count(),
            'posts'          => $created->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p->fresh(PostController::WITH)))->values(),
            'skipped'        => $result['skipped_dates'],
            'failed_windows' => $result['failed_windows'],
        ], $status === 'failed' ? 503 : 200);
    }
}
```

Route, inside the content group:

```php
                Route::post('generate', [\App\Http\Controllers\Api\V1\Admin\Content\GenerationController::class, 'generate']);
```

- [ ] **Step 3: Run and commit**

```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Feature/Content/; $T tests/Feature/ContentCalendar/; $T tests/Feature/RouteControllersExistTest.php; $T tests/Feature/AdminAccess/AccessMapTest.php
cd /c/wamp64/www/Hexa-Tech-content && git add app routes/api.php tests && git commit -q -F - <<'EOF'
Content server: managers generate a week, a month or a range

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: all PASS. (A provider error on the calendar path does not throw: `AiClient` turns the SDK's `APIException` into `CalendarGenerationException('provider_unavailable')`, and the service catches it and reports the unfinished weeks in `failed_windows`. That is why a run that wrote nothing answers 503 from the normal path.)

---

### Task 9: Strategy — list, read with the pillar balance, generate, activate, archive

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/Content/StrategyController.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/Content/StrategyTest.php`

**Interfaces:**
- Consumes: `ContentAccess`, `ContentContext`, `ContentRefused` (Task 1); `ContentAiGate` (Task 4); the existing `GenerateContentStrategy` job.
- Produces:
  - `GET strategies` → `{strategies[{id, title, summary, status, created_at}]}`.
  - `GET strategies/{id}` → `{strategy{…summary, ai_output, pillars[{id, name, description, purpose, frequency_weight, active}], balance{from, to, pillars[{id, name, target_weight, posts}]}|null}}`.
  - `POST strategies {instructions?}` → 202 (manager, AI gate; 409 `already_generating` while a strategy for the brand has been `generating` for under 15 minutes).
  - `POST strategies/{id}/activate|archive` (manager; 422 `not_ready` for one still generating or failed).

- [ ] **Step 1: Write the failing test** `tests/Feature/Content/StrategyTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerStrategy;
use App\Services\ContentPlannerStrategyService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class StrategyTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function strategy(string $status, string $title = 'Autumn plan'): ContentPlannerStrategy
    {
        return ContentPlannerStrategy::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'title' => $title, 'status' => $status]);
    }

    public function test_a_manager_starts_a_strategy_and_the_job_writes_it(): void
    {
        $service = Mockery::mock(ContentPlannerStrategyService::class);
        $service->shouldReceive('generate')->once()->andReturnUsing(function (ContentPlannerProfile $profile, array $params, ContentPlannerStrategy $into) {
            $this->assertSame('Focus on autumn', $params['instructions']);
            $into->update(['status' => 'active', 'title' => 'Written strategy']);

            return ['strategy' => $into, 'pillars' => []];
        });
        $this->app->instance(ContentPlannerStrategyService::class, $service);

        $id = $this->asManager()->postJson($this->api('strategies'), ['instructions' => 'Focus on autumn'])
            ->assertStatus(202)
            ->json('strategy.id');

        // The queue is synchronous in tests: the job has already run.
        $this->assertSame('active', ContentPlannerStrategy::find($id)->status);
        $this->asStaffMember()->getJson($this->api('strategies'))->assertOk()->assertJsonPath('strategies.0.title', 'Written strategy');
    }

    public function test_staff_read_strategies_but_may_not_start_switch_or_archive_one(): void
    {
        $strategy = $this->strategy('active');

        $this->asStaffMember()->getJson($this->api("strategies/{$strategy->id}"))->assertOk();
        $this->asStaffMember()->postJson($this->api('strategies'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->postJson($this->api("strategies/{$strategy->id}/archive"))->assertStatus(403);
        $this->asStaffMember()->postJson($this->api("strategies/{$strategy->id}/activate"))->assertStatus(403);
    }

    public function test_one_strategy_at_a_time_but_a_stuck_one_does_not_block_for_ever(): void
    {
        $this->strategy('generating');
        $this->asManager()->postJson($this->api('strategies'))->assertStatus(409)->assertJsonPath('error', 'already_generating');

        $this->travel(16)->minutes();
        $service = Mockery::mock(ContentPlannerStrategyService::class);
        $service->shouldReceive('generate')->once()->andReturn(['strategy' => null, 'pillars' => []]);
        $this->app->instance(ContentPlannerStrategyService::class, $service);
        $this->asManager()->postJson($this->api('strategies'))->assertStatus(202);
    }

    public function test_activating_one_supersedes_the_active_one_and_archiving_works(): void
    {
        $old = $this->strategy('active', 'Old');
        $chosen = $this->strategy('superseded', 'Chosen');

        $this->asManager()->postJson($this->api("strategies/{$chosen->id}/activate"))->assertOk()->assertJsonPath('strategy.status', 'active');
        $this->assertSame('superseded', $old->fresh()->status);

        $this->asManager()->postJson($this->api("strategies/{$old->id}/archive"))->assertOk()->assertJsonPath('strategy.status', 'archived');
        $this->asManager()->postJson($this->api('strategies/' . $this->strategy('generating', 'Busy')->id . '/activate'))->assertStatus(422)->assertJsonPath('error', 'not_ready');
    }

    public function test_the_active_strategy_shows_this_months_posts_per_pillar_against_the_targets(): void
    {
        $strategy = $this->strategy('active');
        $education = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'strategy_id' => $strategy->id, 'brand_id' => $this->brandId, 'name' => 'Education', 'frequency_weight' => 6, 'active' => true]);
        $proof = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'strategy_id' => $strategy->id, 'brand_id' => $this->brandId, 'name' => 'Proof', 'frequency_weight' => 4, 'active' => true]);
        $this->makePost(['pillar_id' => $education->id, 'scheduled_date' => '2026-10-07']);
        $this->makePost(['pillar_id' => $education->id, 'scheduled_date' => '2026-10-21']);
        $this->makePost(['pillar_id' => $education->id, 'scheduled_date' => '2026-11-02']); // next month
        $this->makePost(['pillar_id' => $proof->id, 'scheduled_date' => '2026-10-09', 'status' => 'skipped']);

        $this->asStaffMember()->getJson($this->api("strategies/{$strategy->id}"))
            ->assertOk()
            ->assertJsonPath('strategy.balance.from', '2026-10-01')
            ->assertJsonPath('strategy.balance.to', '2026-10-31')
            ->assertJsonPath('strategy.balance.pillars', [
                ['id' => $education->id, 'name' => 'Education', 'target_weight' => 6, 'posts' => 2],
                ['id' => $proof->id, 'name' => 'Proof', 'target_weight' => 4, 'posts' => 0],
            ]);
    }

    public function test_another_brands_strategy_does_not_exist_here(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        $theirs = ContentPlannerStrategy::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'title' => 'Theirs', 'status' => 'active']);

        $this->asManager()->getJson($this->api("strategies/{$theirs->id}"))->assertStatus(404)->assertJsonPath('error', 'not_found');
    }
}
```

Run: `t.sh tests/Feature/Content/StrategyTest.php`
Expected: FAIL (404).

- [ ] **Step 2: Write** `app/Http/Controllers/Api/V1/Admin/Content/StrategyController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Jobs\GenerateContentStrategy;
use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerStrategy;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Strategy (spec 2026-10-14 §4.5): everyone reads it; managers start a new
 * one (a queued job, about a minute or three), make one active and archive
 * one. One generation at a time per brand; a strategy left "generating" for
 * longer than the job can run no longer blocks.
 */
class StrategyController extends Controller
{
    /** Longer than GenerateContentStrategy's 600-second timeout. */
    public const GENERATING_MINUTES = 15;

    public function __construct(private ContentAiGate $gate)
    {
    }

    public function index(): JsonResponse
    {
        $profile = ContentContext::profile();
        $strategies = $profile
            ? ContentPlannerStrategy::where('planner_profile_id', $profile->id)->orderByDesc('id')->limit(20)->get()
            : collect();

        return response()->json(['strategies' => $strategies->map(fn (ContentPlannerStrategy $s) => self::summary($s))->values()]);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['strategy' => self::detail(self::find($id))]);
    }

    public function store(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate(['instructions' => 'nullable|string|max:2000']);
        $org = $request->attributes->get('workspace_org');
        $this->gate->allow($org);
        $profile = ContentContext::requireProfile();

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
        GenerateContentStrategy::dispatch($placeholder->id, $profile->id, (int) $org->id, ['instructions' => $data['instructions'] ?? null]);

        return response()->json(['strategy' => self::summary($placeholder->fresh())], 202);
    }

    public function activate(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $strategy = self::finished($id);

        DB::transaction(function () use ($strategy) {
            ContentPlannerStrategy::where('planner_profile_id', $strategy->planner_profile_id)
                ->where('id', '!=', $strategy->id)->where('status', 'active')
                ->update(['status' => 'superseded']);
            $strategy->update(['status' => 'active']);
        });

        return response()->json(['strategy' => self::detail($strategy->fresh())]);
    }

    public function archive(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $strategy = self::finished($id);
        $strategy->update(['status' => 'archived']);

        return response()->json(['strategy' => self::detail($strategy->fresh())]);
    }

    private static function find(int $id): ContentPlannerStrategy
    {
        return ContentPlannerStrategy::where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This strategy no longer exists.', 404);
    }

    private static function finished(int $id): ContentPlannerStrategy
    {
        $strategy = self::find($id);
        if (in_array($strategy->status, ['generating', 'failed'], true)) {
            throw new ContentRefused('not_ready', 'Only a finished strategy can be made active or archived.', 422);
        }

        return $strategy;
    }

    /** @return array<string, mixed> */
    private static function summary(ContentPlannerStrategy $strategy): array
    {
        return [
            'id'         => (int) $strategy->id,
            'title'      => $strategy->title,
            'summary'    => $strategy->summary,
            'status'     => (string) $strategy->status,
            'created_at' => $strategy->created_at?->toISOString(),
        ];
    }

    /** @return array<string, mixed> */
    private static function detail(ContentPlannerStrategy $strategy): array
    {
        $pillars = ContentPlannerPillar::where('strategy_id', $strategy->id)->orderBy('id')->get();

        return self::summary($strategy) + [
            'ai_output' => $strategy->ai_output,
            'pillars'   => $pillars->map(fn (ContentPlannerPillar $p) => [
                'id'               => (int) $p->id,
                'name'             => (string) $p->name,
                'description'      => $p->description,
                'purpose'          => $p->purpose,
                'frequency_weight' => (int) ($p->frequency_weight ?? 0),
                'active'           => (bool) $p->active,
            ])->values()->all(),
            'balance'   => $strategy->status === 'active' ? self::balance($strategy, $pillars) : null,
        ];
    }

    /**
     * Pillar balance (spec §4.5): this venue month's posts per pillar (not
     * skipped or archived) against each pillar's target weight.
     *
     * @param \Illuminate\Support\Collection<int, ContentPlannerPillar> $pillars
     * @return array{from: string, to: string, pillars: list<array{id: int, name: string, target_weight: int, posts: int}>}
     */
    private static function balance(ContentPlannerStrategy $strategy, $pillars): array
    {
        $today = CarbonImmutable::parse(VenueClock::today(ContentContext::orgId()));
        $from = $today->startOfMonth()->format('Y-m-d');
        $to = $today->endOfMonth()->format('Y-m-d');
        $counts = ContentPlannerPost::query()
            ->where('planner_profile_id', $strategy->planner_profile_id)
            ->whereNotNull('pillar_id')
            ->whereDate('scheduled_date', '>=', $from)->whereDate('scheduled_date', '<=', $to)
            ->whereNotIn('status', ['skipped', 'archived'])
            ->selectRaw('pillar_id, COUNT(*) as posts')->groupBy('pillar_id')
            ->pluck('posts', 'pillar_id');

        return [
            'from'    => $from,
            'to'      => $to,
            'pillars' => $pillars->map(fn (ContentPlannerPillar $p) => [
                'id'            => (int) $p->id,
                'name'          => (string) $p->name,
                'target_weight' => (int) ($p->frequency_weight ?? 0),
                'posts'         => (int) ($counts[$p->id] ?? 0),
            ])->values()->all(),
        ];
    }
}
```

Routes, inside the content group:

```php
                Route::get('strategies', [\App\Http\Controllers\Api\V1\Admin\Content\StrategyController::class, 'index']);
                Route::post('strategies', [\App\Http\Controllers\Api\V1\Admin\Content\StrategyController::class, 'store']);
                Route::get('strategies/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\StrategyController::class, 'show'])->whereNumber('id');
                Route::post('strategies/{id}/activate', [\App\Http\Controllers\Api\V1\Admin\Content\StrategyController::class, 'activate'])->whereNumber('id');
                Route::post('strategies/{id}/archive', [\App\Http\Controllers\Api\V1\Admin\Content\StrategyController::class, 'archive'])->whereNumber('id');
```

- [ ] **Step 3: Run and commit**

```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Feature/Content/; $T tests/Feature/RouteControllersExistTest.php; $T tests/Feature/AdminAccess/AccessMapTest.php
cd /c/wamp64/www/Hexa-Tech-content && git add app routes/api.php tests && git commit -q -F - <<'EOF'
Content server: strategy — read with the pillar balance, generate, activate, archive

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: all PASS.

---

### Task 10: Brand — the profile in sections, edited in place; quick and guided setup

**Files:**
- Modify: `app/Services/Content/ContentRules.php` (profile, voice, audience and channel fields)
- Create:
  - `app/Services/Content/ContentBrandEditor.php`
  - `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/Content/BrandTest.php`; add one test to `tests/Feature/Content/ContentGateTest.php` (every manager endpoint refuses staff: the last route lands in this task)

**Interfaces:**
- Consumes:
  - `ContentAccess`, `ContentContext` (Task 1)
  - `ContentAiGate` (Task 4)
  - `ContentKnowledgeService::readinessOf` (no write) and `readinessFor` (writes) (Task 3)
  - the existing `ProfileBootstrapService::bootstrap(ContentPlannerProfile, array): array{payload, assumptions}`
- Produces:
  - `ContentRules::profileFields()`, `voiceFields()`, `audienceFields(bool $creating)`, `channelFields(bool $creating)`.
  - `ContentBrandEditor` with:
    - `profileFor(Organization, User)`, `saveProfile(profile, fields)`, `saveVoice(profile, fields)`;
    - `createAudience`, `updateAudience`, `deleteAudience`, `createChannel`, `updateChannel`, `deleteChannel`;
    - `applyPayload(profile, payload)` and `clamp(array, array): array`;
    - the limit tables `PROFILE_LIMITS`, `AUDIENCE_LIMITS`, `CHANNEL_LIMITS`, `VOICE_LIMITS`.
  - Routes:
    - `GET brand`.
    - Saves: `PUT brand/profile`, `PUT brand/voice`.
    - Lists: `POST|PUT|DELETE brand/audiences[/{id}]` and `brand/channels[/{id}]`.
    - Setup: `POST brand/quick-setup`, `POST brand/setup`, `POST brand/refresh-knowledge`.

- [ ] **Step 1: Write the failing test** `tests/Feature/Content/BrandTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\ProfileBootstrapService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class BrandTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_reading_the_brand_writes_nothing_and_saving_a_section_rescores_it(): void
    {
        $this->profile->forceFill(['knowledge_score' => 7])->save();

        $this->asStaffMember()->getJson($this->api('brand'))
            ->assertOk()
            ->assertJsonPath('profile.name', 'Lumière content')
            ->assertJsonCount(2, 'channels')
            ->assertJsonStructure(['readiness' => ['overall', 'sections']]);
        $this->assertSame(7, (int) $this->profile->fresh()->knowledge_score);

        $this->asManager()->putJson($this->api('brand/profile'), ['usp' => 'Organic colour only', 'price_position' => 'premium'])
            ->assertOk()
            ->assertJsonPath('profile.usp', 'Organic colour only');
        $this->assertNotSame(7, (int) $this->profile->fresh()->knowledge_score);
    }

    public function test_staff_read_the_brand_but_may_not_change_it(): void
    {
        $this->asStaffMember()->putJson($this->api('brand/profile'), ['usp' => 'x'])->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->postJson($this->api('brand/audiences'), ['name' => 'x'])->assertStatus(403);
        $this->asStaffMember()->postJson($this->api('brand/quick-setup'), ['platforms' => ['instagram']])->assertStatus(403);
        $this->asStaffMember()->postJson($this->api('brand/refresh-knowledge'))->assertStatus(403);
    }

    public function test_an_audience_is_edited_in_place_and_removing_one_in_use_asks_first(): void
    {
        $id = $this->asManager()->postJson($this->api('brand/audiences'), ['name' => 'Busy professionals', 'pain_points' => ['No time']])
            ->assertCreated()->json('audience.id');
        $post = $this->makePost(['audience_id' => $id]);

        $this->asManager()->putJson($this->api("brand/audiences/{$id}"), ['name' => 'Busy professionals 30+'])
            ->assertOk()->assertJsonPath('audience.id', $id)->assertJsonPath('audience.name', 'Busy professionals 30+');
        $this->assertSame($id, (int) $post->fresh()->audience_id);
        $this->asManager()->getJson($this->api('brand'))->assertJsonPath('audiences.0.posts_count', 1);

        $this->asManager()->deleteJson($this->api("brand/audiences/{$id}"))
            ->assertStatus(409)->assertJsonPath('error', 'audience_in_use')->assertJsonPath('posts', 1);
        $this->asManager()->deleteJson($this->api("brand/audiences/{$id}") . '?confirm=1')->assertOk();
        $this->assertNull(ContentPlannerAudience::find($id));
        $this->assertNull($post->fresh()->audience_id);
        $this->assertSame('Autumn colours', $post->fresh()->topic);
    }

    public function test_channels_and_the_voice_are_edited_in_place(): void
    {
        $channel = ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'instagram')->first();

        $this->asManager()->putJson($this->api("brand/channels/{$channel->id}"), ['frequency' => ['mon' => false, 'tue' => true, 'wed' => true, 'thu' => false, 'fri' => true, 'sat' => true, 'sun' => false], 'posts_per_week' => 4])
            ->assertOk()->assertJsonPath('channel.id', $channel->id)->assertJsonPath('channel.posts_per_week', 4);
        $new = $this->asManager()->postJson($this->api('brand/channels'), ['platform' => 'tiktok', 'label' => 'TikTok'])->assertCreated()->json('channel.id');
        $this->asManager()->postJson($this->api('brand/channels'), ['platform' => 'myspace', 'label' => 'x'])->assertStatus(422);
        $this->asManager()->deleteJson($this->api("brand/channels/{$new}"))->assertOk();

        $this->asManager()->putJson($this->api('brand/voice'), ['tone' => 'warm', 'forbidden_words' => ['cheap']])->assertOk()->assertJsonPath('voice.tone', 'warm');
        $this->asManager()->putJson($this->api('brand/voice'), ['tone' => 'calm'])->assertOk()->assertJsonPath('voice.tone', 'calm')->assertJsonPath('voice.forbidden_words', ['cheap']);
        $this->assertSame(1, $this->profile->brandVoices()->count());
    }

    public function test_ids_of_another_brand_are_refused(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        $theirs = ContentPlannerAudience::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'name' => 'Theirs', 'active' => true]);

        $this->asManager()->putJson($this->api("brand/audiences/{$theirs->id}"), ['name' => 'Taken'])->assertStatus(404);
        $this->asManager()->postJson($this->api('brand/channels'), ['platform' => 'tiktok', 'label' => 'TikTok', 'audience_id' => $theirs->id])->assertStatus(422);
    }

    public function test_a_new_brand_gets_its_profile_from_the_first_section_saved_and_the_setup_finishes(): void
    {
        [$second] = $this->secondBrand(withProfile: false);
        $q = '?brand_id=' . $second;

        $this->asManager()->getJson($this->api('brand') . $q)->assertOk()->assertJsonPath('profile', null);
        $this->asManager()->putJson($this->api('brand/profile') . $q, ['brand_summary' => 'A calm studio'])->assertOk()->assertJsonPath('profile.setup_completed_at', null);
        $this->asManager()->postJson($this->api('brand/setup') . $q)->assertOk();
        $this->assertNotNull(ContentPlannerProfile::where('brand_id', $second)->first()->setup_completed_at);
    }

    public function test_quick_setup_fills_an_empty_brand_with_ai_strings_cut_to_their_columns(): void
    {
        [$second] = $this->secondBrand(withProfile: false);
        $bootstrap = Mockery::mock(ProfileBootstrapService::class);
        $bootstrap->shouldReceive('bootstrap')->once()->andReturn([
            'payload' => [
                'name' => 'Second Studio plan', 'default_tone' => str_repeat('t', 150), 'price_position' => str_repeat('p', 80),
                'audiences' => [['name' => 'Locals', 'is_ai_assumed' => true]],
                'channels' => [['platform' => 'instagram', 'audience_index' => 0, 'frequency' => ['mon' => true], 'emoji_policy' => str_repeat('e', 70)], ['platform' => 'myspace']],
                'brand_voice' => ['tone' => 'friendly'],
            ],
            'assumptions' => ['We assumed a local audience.'],
        ]);
        $this->app->instance(ProfileBootstrapService::class, $bootstrap);

        $this->asManager()->postJson($this->api('brand/quick-setup') . '?brand_id=' . $second, ['platforms' => ['instagram'], 'intensity' => 'standard'])
            ->assertCreated()
            ->assertJsonPath('assumptions', ['We assumed a local audience.'])
            ->assertJsonCount(1, 'channels')
            ->assertJsonPath('audiences.0.name', 'Locals')
            ->assertJsonPath('voice.tone', 'friendly');

        $profile = ContentPlannerProfile::where('brand_id', $second)->first();
        $this->assertSame(100, mb_strlen($profile->default_tone));
        $this->assertSame(50, mb_strlen($profile->price_position));
        $this->assertSame(50, mb_strlen($profile->channels()->first()->emoji_policy));
        $this->assertNotNull($profile->setup_completed_at);
        $this->assertSame((int) $profile->audiences()->first()->id, (int) $profile->channels()->first()->audience_id);
    }

    public function test_quick_setup_is_for_a_brand_not_yet_set_up_and_refresh_reads_the_knowledge_again(): void
    {
        $this->asManager()->postJson($this->api('brand/quick-setup'), ['platforms' => ['instagram']])->assertStatus(409)->assertJsonPath('error', 'already_set_up');

        $this->asManager()->postJson($this->api('brand/refresh-knowledge'))->assertOk();
        $this->assertSame('Test business context.', $this->profile->fresh()->knowledge_summary_short);
    }
}
```

Add this test to `tests/Feature/Content/ContentGateTest.php` (spec §5.1's table, endpoint by endpoint; every manager action asks `ContentAccess` before it validates anything, so an empty body is enough). Add `use App\Models\ContentPlannerAudience;`, `use App\Models\ContentPlannerChannel;` and `use App\Models\ContentPlannerStrategy;` to its imports:

```php
    public function test_staff_are_refused_every_manager_action(): void
    {
        $strategy = ContentPlannerStrategy::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'title' => 'Plan', 'status' => 'active']);
        $audience = ContentPlannerAudience::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Locals', 'active' => true]);
        $channel = ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->firstOrFail();

        $managerOnly = [
            ['POST', 'generate'],
            ['POST', 'strategies'], ['POST', "strategies/{$strategy->id}/activate"], ['POST', "strategies/{$strategy->id}/archive"],
            ['PUT', 'brand/profile'], ['PUT', 'brand/voice'],
            ['POST', 'brand/audiences'], ['PUT', "brand/audiences/{$audience->id}"], ['DELETE', "brand/audiences/{$audience->id}"],
            ['POST', 'brand/channels'], ['PUT', "brand/channels/{$channel->id}"], ['DELETE', "brand/channels/{$channel->id}"],
            ['POST', 'brand/quick-setup'], ['POST', 'brand/setup'], ['POST', 'brand/refresh-knowledge'],
        ];
        foreach ($managerOnly as [$method, $path]) {
            $this->asStaffMember()->json($method, $this->api($path))
                ->assertStatus(403)
                ->assertJsonPath('error', 'manager_only');
        }
        $this->assertSame('active', $strategy->fresh()->status);
        $this->assertNotNull($audience->fresh());
        $this->assertNotNull($channel->fresh());
    }
```

Run: `t.sh tests/Feature/Content/BrandTest.php` and `t.sh tests/Feature/Content/ContentGateTest.php`
Expected: BrandTest FAILS (404). In ContentGateTest only the new test fails: the brand routes answer 404, not 403.

- [ ] **Step 2: Add the field rules** to `app/Services/Content/ContentRules.php`:

```php
    /** The brand profile's sections, each field optional (spec §4.6), with PostgreSQL's limits. @return array<string, mixed> */
    public static function profileFields(): array
    {
        $text = ['sometimes', 'nullable', 'string', 'max:5000'];
        $list = ['sometimes', 'nullable', 'array'];

        return [
            'name' => ['sometimes', 'string', 'max:255'], 'default_language' => ['sometimes', 'string', 'max:10'],
            'default_tone' => ['sometimes', 'nullable', 'string', 'max:100'], 'primary_goal' => $text,
            'secondary_goals' => $list, 'content_rules' => $list, 'brand_summary' => $text, 'usp' => $text,
            'mission' => $text, 'brand_values' => $list, 'brand_promise' => $text, 'differentiators' => $text,
            'proof_points' => $list, 'price_position' => ['sometimes', 'nullable', 'string', 'max:50'],
            'main_cta' => $text, 'important_links' => $list, 'positioning' => $list, 'key_messages' => $list,
            'content_mix' => $list, 'weekly_rhythm' => $list, 'engagement_goals' => $list, 'visual_style' => $list,
            'trend_mode' => ['sometimes', 'string', 'max:50'], 'setup_step' => ['sometimes', 'integer', 'min:0', 'max:20'],
        ];
    }

    /** @return array<string, mixed> */
    public static function voiceFields(): array
    {
        $short = fn (int $max) => ['sometimes', 'nullable', 'string', "max:{$max}"];
        $list = ['sometimes', 'nullable', 'array'];

        return [
            'tone' => $short(100), 'style' => $short(100), 'formality_level' => $short(50), 'emoji_policy' => $short(50),
            'hashtag_policy' => $short(50), 'sentence_style' => $short(50), 'point_of_view' => $short(50),
            'preferred_words' => $list, 'forbidden_words' => $list, 'claims_to_avoid' => $list,
            'example_good_posts' => $list, 'example_bad_posts' => $list,
        ];
    }

    /** @return array<string, mixed> */
    public static function audienceFields(bool $creating): array
    {
        $line = ['sometimes', 'nullable', 'string', 'max:255'];
        $list = ['sometimes', 'nullable', 'array'];

        return [
            'name' => $creating ? ['required', 'string', 'max:255'] : ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'], 'industry' => $line, 'country' => $line,
            'business_size' => $line, 'job_role' => $line, 'preferred_tone' => $line,
            'language' => ['sometimes', 'nullable', 'string', 'max:10'],
            'pain_points' => $list, 'goals' => $list, 'fears' => $list, 'objections' => $list, 'buying_triggers' => $list,
            'emotional_triggers' => $list, 'rational_triggers' => $list, 'questions' => $list, 'preferred_platforms' => $list,
            'content_they_trust' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'desired_transformation' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'is_ai_assumed' => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<string, mixed> */
    public static function channelFields(bool $creating): array
    {
        $line = ['sometimes', 'nullable', 'string', 'max:255'];
        $fields = [
            'platform' => $creating ? ['required', Rule::in(self::PLATFORMS)] : ['sometimes', Rule::in(self::PLATFORMS)],
            'label' => $creating ? ['required', 'string', 'max:255'] : ['sometimes', 'string', 'max:255'],
            'url' => $line, 'goal' => $line, 'role' => $line, 'cta_style' => $line, 'visual_style' => $line,
            'link_policy' => ['sometimes', 'nullable', 'string', 'max:100'], 'tone_override' => ['sometimes', 'nullable', 'string', 'max:100'],
            'default_language' => ['sometimes', 'nullable', 'string', 'max:10'],
            'emoji_policy' => ['sometimes', 'nullable', 'string', 'max:50'], 'hashtag_policy' => ['sometimes', 'nullable', 'string', 'max:50'],
            'posts_per_week' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:21'],
            'preferred_formats' => ['sometimes', 'nullable', 'array'],
            'audience_id' => ['sometimes', 'nullable', 'integer', self::owned('content_planner_audiences')],
            'active' => ['sometimes', 'boolean'],
            'frequency' => ['sometimes', 'nullable', 'array'],
        ];
        foreach (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as $day) {
            $fields["frequency.{$day}"] = ['sometimes', 'boolean'];
        }

        return $fields;
    }
```

- [ ] **Step 3: Write** `app/Services/Content/ContentBrandEditor.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerBrandVoice;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Models\User;
use App\Services\ContentKnowledgeService;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * The brand profile, edited one section at a time and in place (spec
 * 2026-10-14 §4.6, §7 F1): audiences, channels and the voice keep their ids,
 * so posts keep their links; removing an audience leaves its posts and
 * channels without it, never without anything else. Each change rescores the
 * profile's readiness (and saves it: a change is the moment to). AI strings
 * from quick setup are cut to their columns first (F8).
 */
final class ContentBrandEditor
{
    /** PostgreSQL's varchar limits on the planner's tables (the "widen" migration made the rest text). */
    public const PROFILE_LIMITS = ['name' => 255, 'default_language' => 10, 'default_tone' => 100, 'price_position' => 50, 'trend_mode' => 50];
    public const AUDIENCE_LIMITS = ['name' => 255, 'language' => 10];
    public const CHANNEL_LIMITS = ['platform' => 50, 'label' => 255, 'url' => 255, 'default_language' => 10, 'emoji_policy' => 50, 'hashtag_policy' => 50];
    public const VOICE_LIMITS = ['name' => 255, 'tone' => 100, 'style' => 100, 'formality_level' => 50, 'emoji_policy' => 50, 'hashtag_policy' => 50, 'sentence_style' => 50, 'point_of_view' => 50];

    private const PROFILE_FIELDS = ['name', 'default_language', 'default_tone', 'primary_goal', 'secondary_goals', 'content_rules', 'brand_summary', 'usp', 'mission', 'brand_values', 'brand_promise', 'differentiators', 'proof_points', 'price_position', 'main_cta', 'important_links', 'positioning', 'key_messages', 'content_mix', 'weekly_rhythm', 'engagement_goals', 'visual_style', 'trend_mode', 'setup_step'];
    private const AUDIENCE_FIELDS = ['name', 'description', 'industry', 'country', 'business_size', 'job_role', 'preferred_tone', 'language', 'pain_points', 'goals', 'fears', 'objections', 'buying_triggers', 'emotional_triggers', 'rational_triggers', 'questions', 'preferred_platforms', 'content_they_trust', 'desired_transformation', 'is_ai_assumed'];
    private const CHANNEL_FIELDS = ['platform', 'label', 'url', 'goal', 'role', 'cta_style', 'visual_style', 'link_policy', 'tone_override', 'default_language', 'emoji_policy', 'hashtag_policy', 'posts_per_week', 'preferred_formats', 'frequency', 'active'];
    private const VOICE_FIELDS = ['tone', 'style', 'formality_level', 'emoji_policy', 'hashtag_policy', 'sentence_style', 'point_of_view', 'preferred_words', 'forbidden_words', 'claims_to_avoid', 'example_good_posts', 'example_bad_posts'];

    public function __construct(private ContentKnowledgeService $knowledge)
    {
    }

    /** The brand's profile, created as an empty shell the first time a manager saves any part of it. */
    public function profileFor(Organization $org, User $user): ContentPlannerProfile
    {
        return ContentPlannerProfile::firstOrCreate(
            ['brand_id' => ContentContext::brandId()],
            ['name' => mb_substr($org->name . ' Content Plan', 0, 255), 'default_language' => 'en', 'created_by' => $user->id],
        );
    }

    /** @param array<string, mixed> $fields */
    public function saveProfile(ContentPlannerProfile $profile, array $fields): void
    {
        $profile->fill(Arr::only($fields, self::PROFILE_FIELDS))->save();
        $this->knowledge->readinessFor($profile);
    }

    /** @param array<string, mixed> $fields */
    public function saveVoice(ContentPlannerProfile $profile, array $fields): ContentPlannerBrandVoice
    {
        $voice = $profile->brandVoices()->where('active', true)->first()
            ?? $profile->brandVoices()->make(['name' => 'Default', 'brand_id' => $profile->brand_id, 'active' => true]);
        $voice->fill(Arr::only($fields, self::VOICE_FIELDS))->save();
        $this->knowledge->readinessFor($profile);

        return $voice;
    }

    /** @param array<string, mixed> $fields */
    public function createAudience(ContentPlannerProfile $profile, array $fields): ContentPlannerAudience
    {
        $audience = $profile->audiences()->create(Arr::only($fields, self::AUDIENCE_FIELDS) + ['brand_id' => $profile->brand_id, 'active' => true]);
        $this->knowledge->readinessFor($profile);

        return $audience;
    }

    /** @param array<string, mixed> $fields */
    public function updateAudience(ContentPlannerProfile $profile, ContentPlannerAudience $audience, array $fields): void
    {
        $audience->fill(Arr::only($fields, self::AUDIENCE_FIELDS))->save();
        $this->knowledge->readinessFor($profile);
    }

    public function deleteAudience(ContentPlannerProfile $profile, ContentPlannerAudience $audience): void
    {
        DB::transaction(function () use ($audience) {
            ContentPlannerPost::where('audience_id', $audience->id)->update(['audience_id' => null]);
            ContentPlannerChannel::where('audience_id', $audience->id)->update(['audience_id' => null]);
            $audience->delete();
        });
        $this->knowledge->readinessFor($profile);
    }

    /** @param array<string, mixed> $fields */
    public function createChannel(ContentPlannerProfile $profile, array $fields): ContentPlannerChannel
    {
        $channel = $profile->channels()->create(Arr::only($fields, [...self::CHANNEL_FIELDS, 'audience_id']) + ['brand_id' => $profile->brand_id, 'active' => true]);
        $this->knowledge->readinessFor($profile);

        return $channel;
    }

    /** @param array<string, mixed> $fields */
    public function updateChannel(ContentPlannerProfile $profile, ContentPlannerChannel $channel, array $fields): void
    {
        $channel->fill(Arr::only($fields, [...self::CHANNEL_FIELDS, 'audience_id']))->save();
        $this->knowledge->readinessFor($profile);
    }

    public function deleteChannel(ContentPlannerProfile $profile, ContentPlannerChannel $channel): void
    {
        $channel->delete();
        $this->knowledge->readinessFor($profile);
    }

    /**
     * Quick setup's answer written into a brand that has no audiences,
     * channels or voice of that kind yet (spec §4.6). Strings are cut to
     * their columns; channels on a platform HexaTech Content does not know
     * are left out; a channel's audience_index maps to the audience made here.
     *
     * @param array<string, mixed> $payload
     */
    public function applyPayload(ContentPlannerProfile $profile, array $payload): void
    {
        DB::transaction(function () use ($profile, $payload) {
            $profile->fill(self::clamp(Arr::only($payload, self::PROFILE_FIELDS), self::PROFILE_LIMITS) + ['setup_completed_at' => now()])->save();

            $audienceIds = [];
            if (!$profile->audiences()->exists()) {
                foreach ((array) ($payload['audiences'] ?? []) as $audience) {
                    if (is_array($audience)) {
                        $audienceIds[] = (int) $profile->audiences()->create(
                            self::clamp(Arr::only($audience, self::AUDIENCE_FIELDS) + ['name' => 'Audience'], self::AUDIENCE_LIMITS)
                            + ['brand_id' => $profile->brand_id, 'active' => true]
                        )->id;
                    }
                }
            }

            if (!$profile->channels()->exists()) {
                foreach ((array) ($payload['channels'] ?? []) as $channel) {
                    if (!is_array($channel) || !in_array($channel['platform'] ?? null, ContentRules::PLATFORMS, true)) {
                        continue;
                    }
                    $index = $channel['audience_index'] ?? null;
                    $profile->channels()->create(
                        self::clamp(Arr::only($channel, self::CHANNEL_FIELDS) + ['label' => ucfirst((string) $channel['platform'])], self::CHANNEL_LIMITS)
                        + [
                            'audience_id' => is_int($index) && isset($audienceIds[$index]) ? $audienceIds[$index] : null,
                            'brand_id'    => $profile->brand_id,
                            'active'      => true,
                        ]
                    );
                }
            }

            $voice = $payload['brand_voice'] ?? null;
            if (is_array($voice) && !$profile->brandVoices()->exists()) {
                $profile->brandVoices()->create(
                    self::clamp(Arr::only($voice, self::VOICE_FIELDS), self::VOICE_LIMITS)
                    + ['name' => 'Default', 'brand_id' => $profile->brand_id, 'active' => true]
                );
            }
        });
        $this->knowledge->readinessFor($profile);
    }

    /**
     * Each field with a limit cut to it by characters (never bytes: a byte cut
     * breaks UTF-8); a list or object where text belongs becomes null.
     *
     * @param array<string, mixed> $values
     * @param array<string, int> $limits
     * @return array<string, mixed>
     */
    public static function clamp(array $values, array $limits): array
    {
        foreach ($limits as $field => $limit) {
            if (!array_key_exists($field, $values) || $values[$field] === null) {
                continue;
            }
            $values[$field] = is_scalar($values[$field]) ? mb_substr((string) $values[$field], 0, $limit) : null;
        }

        return $values;
    }
}
```

- [ ] **Step 4: Write** `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentBrandEditor;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\ContentKnowledgeService;
use App\Services\ContentPlanner\ProfileBootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Brand (spec 2026-10-14 §4.6): everyone reads the profile, its audiences,
 * channels, voice and readiness; managers change them one section at a time,
 * set a new brand up (quick, with AI, or guided, section by section) and read
 * the organisation's knowledge again.
 */
class BrandController extends Controller
{
    public function __construct(private ContentBrandEditor $editor, private ContentKnowledgeService $knowledge)
    {
    }

    public function show(): JsonResponse
    {
        return response()->json($this->payload(ContentContext::profile()));
    }

    public function saveProfile(Request $request): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $this->editor->saveProfile($profile, $request->validate(ContentRules::profileFields()));

        return response()->json($this->payload($profile->fresh()));
    }

    public function saveVoice(Request $request): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $this->editor->saveVoice($profile, $request->validate(ContentRules::voiceFields()));

        return response()->json($this->payload($profile->fresh()));
    }

    public function storeAudience(Request $request): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $audience = $this->editor->createAudience($profile, $request->validate(ContentRules::audienceFields(true)));

        return response()->json(['audience' => $this->audience($audience)] + $this->payload($profile->fresh()), 201);
    }

    public function updateAudience(Request $request, int $id): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $audience = $this->findAudience($profile, $id);
        $this->editor->updateAudience($profile, $audience, $request->validate(ContentRules::audienceFields(false)));

        return response()->json(['audience' => $this->audience($audience->fresh())] + $this->payload($profile->fresh()));
    }

    /** Removing an audience posts use asks first (spec §7, F1): without ?confirm=1 it answers how many. */
    public function destroyAudience(Request $request, int $id): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $audience = $this->findAudience($profile, $id);
        $inUse = ContentPlannerPost::where('audience_id', $audience->id)->count();
        if ($inUse > 0 && !$request->boolean('confirm')) {
            throw new ContentRefused('audience_in_use', "{$inUse} posts use this audience; they keep everything else.", 409, ['posts' => $inUse]);
        }
        $this->editor->deleteAudience($profile, $audience);

        return response()->json($this->payload($profile->fresh()));
    }

    public function storeChannel(Request $request): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $channel = $this->editor->createChannel($profile, $request->validate(ContentRules::channelFields(true)));

        return response()->json(['channel' => $this->channel($channel)] + $this->payload($profile->fresh()), 201);
    }

    public function updateChannel(Request $request, int $id): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $channel = $this->findChannel($profile, $id);
        $this->editor->updateChannel($profile, $channel, $request->validate(ContentRules::channelFields(false)));

        return response()->json(['channel' => $this->channel($channel->fresh())] + $this->payload($profile->fresh()));
    }

    public function destroyChannel(Request $request, int $id): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $this->editor->deleteChannel($profile, $this->findChannel($profile, $id));

        return response()->json($this->payload($profile->fresh()));
    }

    /** One AI call builds an empty brand's profile from the organisation's knowledge (spec §4.6). */
    public function quickSetup(Request $request, ContentAiGate $gate, ProfileBootstrapService $bootstrap): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $input = $request->validate([
            'name'             => 'nullable|string|max:255',
            'default_language' => 'nullable|string|max:10',
            'primary_goal'     => 'nullable|string|max:500',
            'platforms'        => 'required|array|min:1',
            'platforms.*'      => ['string', \Illuminate\Validation\Rule::in(ContentRules::PLATFORMS)],
            'intensity'        => 'nullable|string|in:light,standard,active',
        ]);
        if (ContentContext::profile()?->setup_completed_at !== null) {
            throw new ContentRefused('already_set_up', 'This brand is already set up — change it section by section.', 409);
        }
        $gate->allow($request->attributes->get('workspace_org'));
        // The AI log needs a profile row, so the shell comes first.
        $profile = $this->editor->profileFor($request->attributes->get('workspace_org'), $request->user());

        set_time_limit(600);
        try {
            $result = $bootstrap->bootstrap($profile, $input);
        } catch (\Throwable $e) {
            report($e);
            throw new ContentRefused('ai_failed', $e->getMessage() !== '' ? $e->getMessage() : 'Quick setup could not finish. Please try again.', 502);
        }
        $this->editor->applyPayload($profile, (array) ($result['payload'] ?? []));

        return response()->json(['assumptions' => array_values((array) ($result['assumptions'] ?? []))] + $this->payload($profile->fresh()), 201);
    }

    /** Guided setup's last step: every section was saved on its own; this marks the brand set up. */
    public function finishSetup(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        if ($profile->setup_completed_at === null) {
            $profile->forceFill(['setup_completed_at' => now()])->save();
        }
        $this->knowledge->readinessFor($profile);

        return response()->json($this->payload($profile->fresh()));
    }

    public function refreshKnowledge(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $summary = $this->knowledge->summarizeForAi((int) $profile->organization_id, (int) $profile->brand_id);
        $profile->update([
            'knowledge_summary_long'  => $summary,
            'knowledge_summary_short' => $summary,
            'last_knowledge_sync_at'  => now(),
        ]);
        $this->knowledge->readinessFor($profile);

        return response()->json($this->payload($profile->fresh()));
    }

    /** A manager writing a section: the brand's profile, made on the first save. */
    private function managerProfile(Request $request): ContentPlannerProfile
    {
        ContentAccess::requireManager($request->user());

        return $this->editor->profileFor($request->attributes->get('workspace_org'), $request->user());
    }

    private function findAudience(ContentPlannerProfile $profile, int $id): ContentPlannerAudience
    {
        return $profile->audiences()->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This audience no longer exists.', 404);
    }

    private function findChannel(ContentPlannerProfile $profile, int $id): ContentPlannerChannel
    {
        return $profile->channels()->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This channel no longer exists.', 404);
    }

    /** @return array<string, mixed> */
    private function payload(?ContentPlannerProfile $profile): array
    {
        if (!$profile) {
            return ['profile' => null, 'audiences' => [], 'channels' => [], 'voice' => null, 'readiness' => null];
        }
        $voice = $profile->brandVoices()->where('active', true)->first();

        return [
            'profile'   => $profile->only([
                'id', 'name', 'default_language', 'default_tone', 'primary_goal', 'secondary_goals', 'content_rules',
                'brand_summary', 'usp', 'mission', 'brand_values', 'brand_promise', 'differentiators', 'proof_points',
                'price_position', 'main_cta', 'important_links', 'positioning', 'key_messages', 'content_mix',
                'weekly_rhythm', 'engagement_goals', 'visual_style', 'trend_mode', 'setup_step', 'knowledge_score',
            ]) + [
                'setup_completed_at'     => $profile->setup_completed_at?->toISOString(),
                'last_knowledge_sync_at' => $profile->last_knowledge_sync_at?->toISOString(),
            ],
            'audiences' => $profile->audiences()->where('active', true)->withCount('posts')->orderBy('id')->get()
                ->map(fn (ContentPlannerAudience $a) => $this->audience($a))->values()->all(),
            'channels'  => $profile->channels()->orderBy('id')->get()->map(fn (ContentPlannerChannel $c) => $this->channel($c))->values()->all(),
            'voice'     => $voice ? $voice->only(['id', 'tone', 'style', 'formality_level', 'emoji_policy', 'hashtag_policy', 'sentence_style', 'point_of_view', 'preferred_words', 'forbidden_words', 'claims_to_avoid', 'example_good_posts', 'example_bad_posts']) : null,
            'readiness' => $this->knowledge->readinessOf($profile),
        ];
    }

    /** @return array<string, mixed> */
    private function audience(ContentPlannerAudience $audience): array
    {
        return $audience->only(['id', 'name', 'description', 'industry', 'country', 'business_size', 'job_role', 'preferred_tone', 'language', 'pain_points', 'goals', 'fears', 'objections', 'buying_triggers', 'emotional_triggers', 'rational_triggers', 'questions', 'preferred_platforms', 'content_they_trust', 'desired_transformation', 'is_ai_assumed'])
            + ['posts_count' => (int) ($audience->posts_count ?? ContentPlannerPost::where('audience_id', $audience->id)->count())];
    }

    /** @return array<string, mixed> */
    private function channel(ContentPlannerChannel $channel): array
    {
        return $channel->only(['id', 'platform', 'label', 'url', 'goal', 'role', 'cta_style', 'visual_style', 'link_policy', 'tone_override', 'default_language', 'emoji_policy', 'hashtag_policy', 'posts_per_week', 'preferred_formats', 'frequency', 'audience_id', 'active']);
    }
}
```

Routes, inside the content group:

```php
                Route::get('brand', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'show']);
                Route::put('brand/profile', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'saveProfile']);
                Route::put('brand/voice', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'saveVoice']);
                Route::post('brand/audiences', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'storeAudience']);
                Route::put('brand/audiences/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'updateAudience'])->whereNumber('id');
                Route::delete('brand/audiences/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'destroyAudience'])->whereNumber('id');
                Route::post('brand/channels', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'storeChannel']);
                Route::put('brand/channels/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'updateChannel'])->whereNumber('id');
                Route::delete('brand/channels/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'destroyChannel'])->whereNumber('id');
                Route::post('brand/quick-setup', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'quickSetup']);
                Route::post('brand/setup', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'finishSetup']);
                Route::post('brand/refresh-knowledge', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'refreshKnowledge']);
```

`ContentPlannerAudience::posts()` exists (`hasMany` via `audience_id`), so `withCount('posts')` works. If it is named differently, use the real name and note it in the ledger.

- [ ] **Step 5: Run and commit**

```bash
T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
$T tests/Feature/Content/; $T tests/Feature/RouteControllersExistTest.php; $T tests/Feature/AdminAccess/AccessMapTest.php
cd /c/wamp64/www/Hexa-Tech-content && git add app routes/api.php tests && git commit -q -F - <<'EOF'
Content server: the brand, edited in place section by section; quick and guided setup

Audiences, channels and the voice keep their ids, so posts keep their links;
removing an audience posts use asks first and leaves those posts everything
else. Reading the brand saves nothing; each change rescores it. Quick setup
cuts AI strings to their columns before they are stored.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: all PASS.

---

### Task 11: Whole runs, and the runbook

**Files:**
- Create: `docs/content-workspace.md`

- [ ] **Step 1: Run every suite this plan touches, by directory**

```bash
cd /c/wamp64/www/Hexa-Tech-content && T=.superpowers/sdd/2026-10-14-content-workspace-r2a/t.sh
for p in tests/Feature/Content/ tests/Unit/Content/ tests/Feature/Appointments/ tests/Feature/AdminAccess/ tests/Feature/ContentCalendar/ tests/Feature/Ai/ tests/Feature/Settings/ tests/Feature/RouteUniquenessTest.php tests/Feature/RouteControllersExistTest.php tests/Unit/; do echo "== $p"; $T $p | grep -E "Tests:|FAILED|Error"; done | tee .superpowers/sdd/2026-10-14-content-workspace-r2a/final-php.txt
```
Expected: every path passes, and the numbers of the baseline paths (Task 1 Step 2) are at least what they were. Investigate any failure (systematic-debugging). Never hide one.

Then run the remaining Feature directories one at a time (`ls -d tests/Feature/*/`), as the project's rules ask. That catches anything else that reads `workspacesPayload()` or the access map. Append each directory's `Tests:` line to `$R2A/final-php.txt`.

Expected: every directory passes; production `main` was green by directory at its last health pass. Investigate any failure (systematic-debugging). It counts as pre-existing only when the same test file also fails at `ec0eaf085`, run in a scratch worktree with `vendor/` copied in by robocopy (never a junction) and removed afterwards. Ledger such a failure with that evidence. Every other failure is ours to fix.

- [ ] **Step 2: Write** `docs/content-workspace.md` (Write tool):

```markdown
# HexaTech Content — runbook

HexaTech Content (`/content`) is the AI Content Planner as its own workspace beside the full admin, a sibling of
HexaTech Appointments. Spec: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`. This page covers the
server; the portal's half is added with release 2's Plan B.

## Who has it, and switching it

- Every organisation has it by default (`Organization::WORKSPACE_DEFAULTS`). Organisations on the Appointments plan
  do not: it is not part of that plan, and the access map refuses them (`not_in_plan`).
- `php artisan workspace:content <org> --on [--landing] | --off | --status`, and `--list` for the organisations that
  differ from the default.
- An organisation lands in one workspace only: `--landing` here takes the landing from Appointments, and the other
  way round.
- Sign-in (`user.workspaces.content`) and `/auth/me` (`workspaces.content`) carry `{landing}` for staff.

## The API

All under `/api/v1/admin/content/`, behind the admin chain, `workspace:content` and `content.brand`.

- `content.brand` pins every call to exactly one brand: the one named in `?brand_id=` when the person may use it,
  otherwise their default brand. A restricted member asking for another brand gets 403.
- Refusals are `{error, message}`. The codes are `no_brand`, `no_profile`, `manager_only`, `not_found`,
  `ai_budget_used_up`, `already_generating`, `changed_elsewhere`, `published_cannot_move`, `slot_not_open`,
  `no_channels`, `ai_failed`, `audience_in_use`, `already_set_up`, `not_ready` and `generation_failed`.

| Area | Endpoints | Who |
|---|---|---|
| Bootstrap | `GET bootstrap` | everyone |
| Plan | `GET plan?from&to` (≤ 62 days) | everyone |
| Posts | `GET posts`, `GET find`, `POST posts`, `GET/PUT/DELETE posts/{id}`, `POST posts/{id}/move`, `/duplicate`, `/mark-ready`, `/mark-published` | everyone |
| AI on a post | `POST posts/{id}/write`, `/rewrite`, `/quality`, `/visual-brief`, `/image`, `POST slots/fill` | everyone |
| Generate | `POST generate` | managers |
| Strategy | `GET strategies`, `GET strategies/{id}` (everyone); `POST strategies`, `/activate`, `/archive` (managers) | |
| Brand | `GET brand` (everyone); `PUT brand/profile`, `PUT brand/voice`, audiences and channels `POST/PUT/DELETE`, `POST brand/quick-setup`, `POST brand/setup`, `POST brand/refresh-knowledge` (managers) | |

## Rules the code keeps (and the tests that keep them)

- **Brands never mix.** Every list and read stays inside the pinned brand, and every id a request names must belong
  to this organisation and that brand (`PostRulesTest`, `BrandTest`).
- **Stale saves are refused.** A save or move must send back the `updated_at` it read; a newer one answers 409
  `changed_elsewhere` with the post as it is now. Versions compare to the second (`PostRulesTest`).
- **A published post keeps its date.**
- **Reads write nothing.** Reading the brand never saves its readiness; a change does (`BrandTest`).
- **Brand edits happen in place.** Audiences, channels and the voice keep their ids. Removing an audience that posts
  use needs `?confirm=1` (`BrandTest`).
- **AI spend counts.** Every planner text call and image lands in `ai_usage_logs` as feature `content`; images are
  priced per picture (`AiUsageService::IMAGE_PRICING`). At 100 % of the monthly cap every AI action answers 403
  before calling the provider (`AiLedgerTest`, `AiGateTest`).
- **One generation at a time per brand.** It is a cache lock of 300 s; a strategy counts as running for 15 minutes
  at most (`GenerateTest`, `StrategyTest`).
- **Open slots** are each active channel's ticked weekdays, from the venue's today on, without a non-archived post on
  that day and platform (`ContentSlotsTest`, `PlanTest`).
- **Quick setup cuts AI strings** to their PostgreSQL columns (`ContentBrandEditor::*_LIMITS`).

## What this release does not do

No approvals, no publishing to social networks, no campaigns or media-library screens, no plan limits, and no AI
model allowlist for Content. The old `/v1/admin/content-planner/*` routes keep working until the portal replaces the
old screens (release 2, Plan B).
```

- [ ] **Step 3: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -F - <<'EOF'
Document HexaTech Content's server: switching it, the API and the rules it keeps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline ec0eaf085..HEAD | cat
```
