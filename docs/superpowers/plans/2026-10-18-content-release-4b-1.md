# HexaTech Content — Release 4b, Plan 1: the Server for Approvals, Comments and the "For you" Bell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server half of release 4b "the team" (spec §6–§9): the per-brand approval switch and its rule on every write, the approval actions and their history, comments on posts in one timeline with that history, and the "For you" inbox behind the bell.

**Architecture:**
- **The rule in one place:** `app/Services/Content/ContentApproval.php` says which statuses only a manager may set while a brand's switch is on, refuses them with `needs_approval`, sends an approved post back to review when staff change its words, and records every approval step in a new `content_planner_post_events` table. `PostController` (create, save, mark ready, mark published) and `RepeatController` call it; a new `ApprovalController` holds Send for approval, Approve and Send back.
- **What a post shows:** cards gain `comments_count` and `sent_back` (computed in the list queries, no extra query per card); the post's detail gains `author`; `GET posts/{id}` gains the `timeline` (comments and history, oldest first, the newest 200) from `ContentTimeline`. Comments get their own table and `CommentController`.
- **The bell:** `ContentInbox` builds a person's items for the current brand from posts in review, approval events and comments, against their `seen_at` in a new `content_planner_reads` table; `InboxController` serves the list, the count and "seen". Four additive migrations. Plan 4B-2 builds the portal on these endpoints, runs the release checks and deploys; nothing is deployed by this plan.

**Tech Stack:** Laravel 13 on PHP 8.4.20 (tests on SQLite in memory with foreign keys on, production PostgreSQL), PHPUnit through `artisan test`.

**Spec:** `docs/superpowers/specs/2026-10-16-content-release-4-design.md` (approved 2026-10-16), §6–§11 (4b). Earlier specs, still binding: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`, `docs/superpowers/specs/2026-10-15-content-release-3-design.md`.

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `55b0f750f`. Production is release 4a: prod main `4c7514ca4` = the source of `55b0f750f` + a build. Release 4a's ledger and tools: `.superpowers/sdd/archive/2026-10-16-content-release-4a-2/`.

## Global Constraints

- **Branch:** never push the feature branch; never commit built `frontend/dist`, `public/spa` or `resources/spa-shell`. This plan pushes nothing and changes no frontend file.
- **Ledger and tools:** `.superpowers/sdd/2026-10-18-content-release-4b-1/`, called `$R5` below; Task 1, Step 1 sets it up with `php.sh` (each PHP path alone, honest exit code) and `extract.mjs` (copies a plan code block into a file: `node $R5/extract.mjs $R5/task-N-brief.md "<line naming the file>" <path>`) from 4A-2's archive.
- **PHP commands:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by path, in the foreground, through `$R5/php.sh <paths…>`. Never a bare `php artisan test`. Any `artisan tinker` call gets `< /dev/null` (with a file it waits on an open stdin).
- **Migrations:** additive, SQLite-safe, guarded with `Schema::hasColumn` / `Schema::hasTable` like `database/migrations/2026_10_16_100100_create_content_planner_key_dates_table.php`. Tests build the planner tables by requiring the real migrations in `tests/Concerns/SetsUpContentSchema.php`: every new migration gets its own guarded `require … ->up()` line there.
- **Tenancy:** the three new tables carry `organization_id` and `brand_id` and their models use `BelongsToOrganization, BelongsToBrand`, as `content_planner_key_dates` / `ContentPlannerKeyDate` do (spec §9.1 lists only the post or profile; the tenant columns are the codebase's rule for tenant data, as in 4A-1). Another brand's post, comment or read never exists here (404).
- **Who is a manager:** `ContentAccess::canManage($user)` (`AccessMap::MANAGER_ROLES`), the rule Content already uses (spec §6.1).
- **Refusals:** `ContentRefused($code, $sentence, $status)` with our own sentence (the answer carries the code under `error`); validation through Laravel's validator (422 with `errors`). Codes added by this plan: `needs_approval` (403, "Only a manager can approve posts while approvals are on for this brand." — the spec's sentence), `approvals_off` (409), `wrong_status` (409), `not_yours` (403); `not_found`, `manager_only`, `no_profile`, `changed_elsewhere` as today.
- **No facade mocks** (`Cache::shouldReceive`, `Queue::shouldReceive` …): they have broken full runs before.
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace — write code holding backslashes (PHP namespaces!) with the Write or Edit tool or `extract.mjs`, never through a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An old tab sends a forbidden status with other changes:** a staff member's save that sets `approved` (or `ready_to_publish`, `published`) together with new words, while the switch is on, is refused whole — nothing of it is saved.
   - Pinned by Task 2's `test_a_staff_save_with_a_status_only_managers_set_is_refused_whole`.
2. **The current status sent again:** a staff save that only moves an approved post's day and re-sends its own status `approved` is not refused and does not send it back to review (day and time are not words).
   - Pinned by Task 2's `test_moving_an_approved_posts_day_keeps_it_approved_even_with_its_status_resent`.
3. **"Sent back" against later activity:** a comment on a sent-back draft keeps it "sent back"; an edit to the post ends it.
   - Pinned by Task 3's `test_sent_back_lasts_until_the_post_is_changed_not_when_it_is_commented`.
4. **A removed team member:** their comments and history stay, with no name (`user: null`, "Former team member" in the portal), in the timeline and the bell.
   - Pinned by Task 3's timeline test and Task 6's inbox test (`user_id` null).
5. **Two brands, one person:** brand B's waiting posts and comments never show in brand A's bell, and opening A's bell does not mark B's as seen.
   - Pinned by Task 6's `test_the_bell_is_per_brand_and_seen_is_per_brand`.

---

## File map

- **Task 1 (the switch):** migration `database/migrations/2026_10_18_100000_add_requires_approval_to_content_planner_profiles.php`; `app/Models/ContentPlannerProfile.php`, `app/Services/Content/ContentRules.php`, `app/Services/Content/ContentBrandEditor.php`, `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php`, `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`, `tests/Concerns/SetsUpContentSchema.php`; tests new `tests/Feature/Content/ApprovalSwitchTest.php`.
- **Task 2 (the rule on every write, the history):** migration `database/migrations/2026_10_18_100100_create_content_planner_post_events_table.php`; new `app/Models/ContentPlannerPostEvent.php`, new `app/Services/Content/ContentApproval.php`; `app/Models/ContentPlannerPost.php`, `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, `app/Http/Controllers/Api/V1/Admin/Content/RepeatController.php`, `app/Services/Content/ContentRepeat.php`, `SetsUpContentSchema.php`; tests new `tests/Feature/Content/ApprovalRuleTest.php`.
- **Task 3 (what a post shows):** migration `database/migrations/2026_10_18_100200_create_content_planner_post_comments_table.php`; new `app/Models/ContentPlannerPostComment.php`, new `app/Services/Content/ContentTimeline.php`; `ContentPlannerPost.php` (`comments()`, `withReview` scope), `app/Services/Content/ContentPostPresenter.php`, `PostController.php` (show, index, search), `app/Services/Content/ContentPlan.php`, `app/Services/Content/ContentIdeas.php`, `SetsUpContentSchema.php`; tests new `tests/Feature/Content/PostReviewTest.php`.
- **Task 4 (Send for approval, Approve, Send back):** new `app/Http/Controllers/Api/V1/Admin/Content/ApprovalController.php`, `routes/api.php`; tests new `tests/Feature/Content/ApprovalActionsTest.php`, `tests/Feature/Content/ContentGateTest.php`.
- **Task 5 (comments):** new `app/Http/Controllers/Api/V1/Admin/Content/CommentController.php`, `routes/api.php`; tests new `tests/Feature/Content/CommentsTest.php`.
- **Task 6 (the inbox):** migration `database/migrations/2026_10_18_100300_create_content_planner_reads_table.php`; new `app/Models/ContentPlannerRead.php`, new `app/Services/Content/ContentInbox.php`, new `app/Http/Controllers/Api/V1/Admin/Content/InboxController.php`, `app/Models/ContentPlannerPostEvent.php` and `app/Models/ContentPlannerPostComment.php` (`post()`), `routes/api.php`, `SetsUpContentSchema.php`; tests new `tests/Feature/Content/InboxTest.php`.
- **Task 7 (runbook and regression):** `docs/content-workspace.md`.

---

### Task 1: The approval switch on the brand

**Files:**
- Create: `database/migrations/2026_10_18_100000_add_requires_approval_to_content_planner_profiles.php`
- Modify: `app/Models/ContentPlannerProfile.php`, `app/Services/Content/ContentRules.php`, `app/Services/Content/ContentBrandEditor.php`, `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php`, `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: create `tests/Feature/Content/ApprovalSwitchTest.php`

**Interfaces:**
- Produces: `content_planner_profiles.requires_approval` (boolean, default false), fillable and cast `boolean` on `ContentPlannerProfile`; `PUT brand/profile` accepts `requires_approval` (managers, as every profile field); the brand payload's `profile.requires_approval` and the bootstrap's `profile.requires_approval` (both `bool`).

- [ ] **Step 1: Set up the ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R5=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-18-content-release-4b-1.md)
cp .superpowers/sdd/archive/2026-10-16-content-release-4a-2/php.sh .superpowers/sdd/archive/2026-10-16-content-release-4a-2/extract.mjs "$R5/"
chmod +x "$R5/php.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-18-content-release-4b-1.md" > "$R5/progress.md"
echo "$R5"; ls "$R5"; grep -n "^cd " "$R5/php.sh"
```

Expected: `$R5` ends in `.superpowers/sdd/2026-10-18-content-release-4b-1`; the listing shows `extract.mjs php.sh plan-path progress.md`; `php.sh` runs in `/c/wamp64/www/Hexa-Tech-content`.

- [ ] **Step 2: Write the failing test**

Write `tests/Feature/Content/ApprovalSwitchTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The approval switch (spec 2026-10-16 §6.1): per brand, default off, managers only, changing no post. */
class ApprovalSwitchTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_manager_switches_approvals_on_and_everyone_reads_it_in_the_brand_and_the_bootstrap(): void
    {
        $this->asStaffMember()->getJson($this->api('brand'))->assertOk()->assertJsonPath('profile.requires_approval', false);
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('profile.requires_approval', false);

        $this->asManager()->putJson($this->api('brand/profile'), ['requires_approval' => true])->assertOk()
            ->assertJsonPath('profile.requires_approval', true);
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('profile.requires_approval', true);

        $this->asManager()->putJson($this->api('brand/profile'), ['requires_approval' => 'often'])->assertStatus(422)->assertJsonValidationErrors('requires_approval');
        $this->asStaffMember()->putJson($this->api('brand/profile'), ['requires_approval' => false])->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->assertTrue($this->profile->fresh()->requires_approval);
    }

    public function test_switching_changes_no_posts_status(): void
    {
        $approved = $this->makePost(['status' => 'approved']);
        $ready = $this->makePost(['status' => 'ready_to_publish']);

        $this->asManager()->putJson($this->api('brand/profile'), ['requires_approval' => true])->assertOk();
        $this->asManager()->putJson($this->api('brand/profile'), ['requires_approval' => false])->assertOk();

        $this->assertSame('approved', $approved->fresh()->status);
        $this->assertSame('ready_to_publish', $ready->fresh()->status);
    }
}
```

- [ ] **Step 3: Run it to see it fail**

```bash
"$R5/php.sh" tests/Feature/Content/ApprovalSwitchTest.php
```

Expected: `exit 1` — `profile.requires_approval` is missing from both answers.

- [ ] **Step 4: The column, the model, the rule, the payloads**

Write `database/migrations/2026_10_18_100000_add_requires_approval_to_content_planner_profiles.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Posts need a manager's approval (spec 2026-10-16 §6.1): per brand, default off. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('content_planner_profiles', 'requires_approval')) {
            return;
        }
        Schema::table('content_planner_profiles', function (Blueprint $table) {
            $table->boolean('requires_approval')->default(false);
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('content_planner_profiles', 'requires_approval')) {
            Schema::table('content_planner_profiles', function (Blueprint $table) {
                $table->dropColumn('requires_approval');
            });
        }
    }
};
```

In `tests/Concerns/SetsUpContentSchema.php`, replace:

```php
        if (!Schema::hasTable('content_planner_templates')) {
            (require database_path('migrations/2026_10_16_100200_create_content_planner_templates_table.php'))->up();
        }
```

with:

```php
        if (!Schema::hasTable('content_planner_templates')) {
            (require database_path('migrations/2026_10_16_100200_create_content_planner_templates_table.php'))->up();
        }
        if (!Schema::hasColumn('content_planner_profiles', 'requires_approval')) {
            (require database_path('migrations/2026_10_18_100000_add_requires_approval_to_content_planner_profiles.php'))->up();
        }
```

In `app/Models/ContentPlannerProfile.php`, replace:

```php
        'holiday_country',
        'marketing_days',
    ];
```

with:

```php
        'holiday_country',
        'marketing_days',
        'requires_approval',
    ];
```

and replace:

```php
        'marketing_days' => 'boolean',
    ];
```

with:

```php
        'marketing_days' => 'boolean',
        'requires_approval' => 'boolean',
    ];
```

In `app/Services/Content/ContentRules.php`, replace:

```php
            'marketing_days' => ['sometimes', 'boolean'],
        ];
```

with:

```php
            'marketing_days' => ['sometimes', 'boolean'],
            // Spec 2026-10-16 §6.1: posts need a manager's approval (managers only, as every profile field).
            'requires_approval' => ['sometimes', 'boolean'],
        ];
```

In `app/Services/Content/ContentBrandEditor.php`, replace `'holiday_country', 'marketing_days'];` (the end of `PROFILE_FIELDS`) with `'holiday_country', 'marketing_days', 'requires_approval'];`.

In `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php`, replace:

```php
                'marketing_days'         => (bool) ($profile->marketing_days ?? true),
            ],
```

with:

```php
                'marketing_days'         => (bool) ($profile->marketing_days ?? true),
                'requires_approval'      => (bool) ($profile->requires_approval ?? false),
            ],
```

In `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`, replace:

```php
                'readiness'       => (int) $knowledge->readinessOf($profile)['overall'],
            ] : null,
```

with:

```php
                'readiness'       => (int) $knowledge->readinessOf($profile)['overall'],
                // Spec 2026-10-16 §6: the portal hides what staff may not do while approvals are on.
                'requires_approval' => (bool) ($profile->requires_approval ?? false),
            ] : null,
```

- [ ] **Step 5: Run the test, then the Content folders**

```bash
"$R5/php.sh" tests/Feature/Content/ApprovalSwitchTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `ApprovalSwitchTest | Tests:    2 passed`; both folders `exit 0` (Feature Content 163, Unit Content 71).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_18_100000_add_requires_approval_to_content_planner_profiles.php app/Models/ContentPlannerProfile.php app/Services/Content/ContentRules.php app/Services/Content/ContentBrandEditor.php app/Http/Controllers/Api/V1/Admin/Content/BrandController.php app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/ApprovalSwitchTest.php && git commit -q -m "Content: the per-brand approval switch (managers), in the brand and the bootstrap" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: The approval rule on every write, and the history

**Files:**
- Create: `database/migrations/2026_10_18_100100_create_content_planner_post_events_table.php`, `app/Models/ContentPlannerPostEvent.php`, `app/Services/Content/ContentApproval.php`
- Modify: `app/Models/ContentPlannerPost.php`, `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, `app/Http/Controllers/Api/V1/Admin/Content/RepeatController.php`, `app/Services/Content/ContentRepeat.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: create `tests/Feature/Content/ApprovalRuleTest.php`

**Interfaces:**
- Consumes: `requires_approval` (Task 1); `ContentAccess::canManage`.
- Produces:
  - Table `content_planner_post_events` (`id`, `organization_id`, `brand_id`, `post_id` FK cascade, `user_id` FK users null on delete, `kind` varchar(30), `note` text null, `created_at`); model `ContentPlannerPostEvent` (no `updated_at`; `user()` belongs to `User`; `KINDS`); `ContentPlannerPost::events()`.
  - `ContentApproval`: `MANAGER_STATUSES = ['approved', 'ready_to_publish', 'published']`, `SENDABLE = ['idea', 'draft', 'needs_visual', 'needs_review']`, `WORDS = ['topic', 'hook', 'main_copy', 'cta', 'hashtags', 'platform']`; `isOn(?ContentPlannerProfile): bool`; `guardStatus(?string $status, ?string $before, User $user, ?ContentPlannerProfile $profile): void` (throws `needs_approval` 403); `beforeSave(ContentPlannerPost $post, string $before, User $user, ?ContentPlannerProfile $profile): ?string` (after `fill`, before `save`: may set `needs_review`; returns the event kind to record or null); `onCreate(ContentPlannerPost $post, User $user, ?ContentPlannerProfile $profile): ?string`; `record(ContentPlannerPost $post, string $kind, ?int $userId, ?string $note = null): ContentPlannerPostEvent`.
  - `ContentRepeat::copy($original, $dates, $userId, ?string $status = null)`: `$status` overrides the copies' status (AI-reworded copies while the switch is on).

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/ApprovalRuleTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostEvent;
use App\Services\Content\ContentRepeatRewriter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** What staff may not do while approvals are on, and the history it leaves (spec 2026-10-16 §6.2, §6.4). */
class ApprovalRuleTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->profile->forceFill(['requires_approval' => true])->save();
    }

    private function save(ContentPlannerPost $post, array $fields)
    {
        return $this->putJson($this->api("posts/{$post->id}"), $fields + ['updated_at' => $post->fresh()->updated_at->toISOString()]);
    }

    /** @return list<string> */
    private function kinds(ContentPlannerPost $post): array
    {
        return ContentPlannerPostEvent::where('post_id', $post->id)->orderBy('id')->pluck('kind')->all();
    }

    public function test_staff_cannot_set_approved_ready_or_published_nor_mark_ready_or_published(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        foreach (['approved', 'ready_to_publish', 'published'] as $status) {
            $this->asStaffMember();
            $this->save($post, ['status' => $status])->assertStatus(403)->assertJsonPath('error', 'needs_approval')
                ->assertJsonPath('message', 'Only a manager can approve posts while approvals are on for this brand.');
        }
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-ready"))->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-published"), [])->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'status' => 'approved'])->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->assertSame('needs_review', $post->fresh()->status);
        $this->assertSame(1, ContentPlannerPost::count());
    }

    // Review Focus 1: an old tab sends the forbidden status with new words; nothing of it is saved.
    public function test_a_staff_save_with_a_status_only_managers_set_is_refused_whole(): void
    {
        $post = $this->makePost(['status' => 'needs_review', 'hook' => 'Old hook']);
        $this->asStaffMember();
        $this->save($post, ['status' => 'approved', 'hook' => 'New hook'])->assertStatus(403);
        $this->assertSame('Old hook', $post->fresh()->hook);
    }

    public function test_managers_do_everything_and_with_the_switch_off_staff_do_too(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->asManager();
        $this->save($post, ['status' => 'approved'])->assertOk()->assertJsonPath('post.status', 'approved');
        $this->asManager()->postJson($this->api("posts/{$post->id}/mark-ready"))->assertOk()->assertJsonPath('post.status', 'ready_to_publish');
        $this->asManager()->postJson($this->api("posts/{$post->id}/mark-published"), [])->assertOk()->assertJsonPath('post.status', 'published');

        $this->profile->forceFill(['requires_approval' => false])->save();
        $other = $this->makePost(['status' => 'draft']);
        $this->asStaffMember();
        $this->save($other, ['status' => 'approved'])->assertOk()->assertJsonPath('post.status', 'approved');
        $this->assertSame([], $this->kinds($other), 'no history while approvals are off');
    }

    public function test_staff_setting_needs_review_sends_the_post_for_approval_and_a_manager_approving_it_is_recorded(): void
    {
        $post = $this->makePost(['status' => 'draft']);
        $this->asStaffMember();
        $this->save($post, ['status' => 'needs_review'])->assertOk();
        $this->asManager();
        $this->save($post, ['status' => 'approved'])->assertOk();

        $events = ContentPlannerPostEvent::where('post_id', $post->id)->orderBy('id')->get();
        $this->assertSame(['sent_for_approval', 'approved'], $events->pluck('kind')->all());
        $this->assertSame([$this->staffMember->id, $this->manager->id], $events->pluck('user_id')->map(fn ($id) => (int) $id)->all());

        $created = $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'status' => 'needs_review', 'topic' => 'Waiting'])->assertCreated();
        $this->assertSame(['sent_for_approval'], $this->kinds(ContentPlannerPost::findOrFail($created->json('post.id'))));
    }

    public function test_a_staff_change_to_an_approved_posts_words_sends_it_back_to_review(): void
    {
        foreach (['topic' => 'New topic', 'hook' => 'New hook', 'main_copy' => 'New text', 'cta' => 'Book now', 'hashtags' => ['#new'], 'platform' => 'linkedin'] as $field => $value) {
            $post = $this->makePost(['status' => 'approved', 'hashtags' => []]);
            $this->asStaffMember();
            $this->save($post, [$field => $value])->assertOk()->assertJsonPath('post.status', 'needs_review');
            $this->assertSame(['changed_after_approval'], $this->kinds($post), $field);
        }
        $ready = $this->makePost(['status' => 'ready_to_publish']);
        $this->asStaffMember();
        $this->save($ready, ['hook' => 'Changed'])->assertOk()->assertJsonPath('post.status', 'needs_review');

        $managers = $this->makePost(['status' => 'approved']);
        $this->asManager();
        $this->save($managers, ['hook' => 'Manager words'])->assertOk()->assertJsonPath('post.status', 'approved');
        $this->assertSame([], $this->kinds($managers));
    }

    // Review Focus 2: day and time are not words; the post's own status sent again is not a change.
    public function test_moving_an_approved_posts_day_keeps_it_approved_even_with_its_status_resent(): void
    {
        $post = $this->makePost(['status' => 'approved']);
        $this->asStaffMember();
        $this->save($post, ['scheduled_date' => '2026-10-09', 'scheduled_time' => '09:30', 'status' => 'approved'])->assertOk()
            ->assertJsonPath('post.status', 'approved')->assertJsonPath('post.scheduled_date', '2026-10-09');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'scheduled_date' => '2026-10-12'])
            ->assertOk()->assertJsonPath('post.status', 'approved');
        $this->assertSame([], $this->kinds($post));
    }

    public function test_ai_reworded_repeat_copies_wait_for_approval_and_plain_copies_keep_the_status(): void
    {
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldReceive('rewrite')->andReturn(['hook' => 'Fresh hook', 'main_copy' => 'Fresh text']);
        $this->app->instance(ContentRepeatRewriter::class, $rewriter);

        $plain = $this->makePost(['status' => 'approved', 'scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$plain->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])->assertCreated();
        $this->assertSame(['approved', 'approved'], ContentPlannerPost::where('series_id', $plain->id)->where('id', '!=', $plain->id)->orderBy('id')->pluck('status')->all());

        $reworded = $this->makePost(['status' => 'approved', 'scheduled_date' => '2026-10-08']);
        $this->asStaffMember()->postJson($this->api("posts/{$reworded->id}/repeat"), ['every' => 'week', 'until' => '2026-10-22', 'ai_rewrite' => true])->assertCreated();
        $this->assertSame(['needs_review', 'needs_review'], ContentPlannerPost::where('series_id', $reworded->id)->where('id', '!=', $reworded->id)->orderBy('id')->pluck('status')->all());
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R5/php.sh" tests/Feature/Content/ApprovalRuleTest.php
```

Expected: `exit 1` — `ContentPlannerPostEvent` does not exist (the class is not found).

- [ ] **Step 3: The history table and its model**

Write `database/migrations/2026_10_18_100100_create_content_planner_post_events_table.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Every approval step on a post (spec 2026-10-16 §6.4): who, what, an optional note, when. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_post_events')) {
            return;
        }
        Schema::create('content_planner_post_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('post_id')->constrained('content_planner_posts')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('kind', 30);
            $table->text('note')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['post_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_post_events');
    }
};
```

Write `app/Models/ContentPlannerPostEvent.php` with the Write tool:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One approval step on a post (spec 2026-10-16 §6.4); kept when its author leaves (`user_id` null). */
class ContentPlannerPostEvent extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const KINDS = ['sent_for_approval', 'approved', 'sent_back', 'changed_after_approval'];

    /** A step happens once: it has no later version. */
    public const UPDATED_AT = null;

    protected $fillable = ['post_id', 'brand_id', 'user_id', 'kind', 'note'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
```

In `app/Models/ContentPlannerPost.php`, replace:

```php
    public function variations(): HasMany
    {
        return $this->hasMany(ContentPlannerPostVariation::class, 'post_id');
    }
```

with:

```php
    public function variations(): HasMany
    {
        return $this->hasMany(ContentPlannerPostVariation::class, 'post_id');
    }

    /** Its approval steps (spec 2026-10-16 §6.4). */
    public function events(): HasMany
    {
        return $this->hasMany(ContentPlannerPostEvent::class, 'post_id');
    }
```

In `tests/Concerns/SetsUpContentSchema.php`, replace:

```php
        if (!Schema::hasColumn('content_planner_profiles', 'requires_approval')) {
            (require database_path('migrations/2026_10_18_100000_add_requires_approval_to_content_planner_profiles.php'))->up();
        }
```

with:

```php
        if (!Schema::hasColumn('content_planner_profiles', 'requires_approval')) {
            (require database_path('migrations/2026_10_18_100000_add_requires_approval_to_content_planner_profiles.php'))->up();
        }
        if (!Schema::hasTable('content_planner_post_events')) {
            (require database_path('migrations/2026_10_18_100100_create_content_planner_post_events_table.php'))->up();
        }
```

- [ ] **Step 4: `ContentApproval`**

Write `app/Services/Content/ContentApproval.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostEvent;
use App\Models\ContentPlannerProfile;
use App\Models\User;

/**
 * Approvals (spec 2026-10-16 §6): while a brand's switch is on, staff write, edit and send for approval, and only
 * managers approve, mark ready or publish. Every write path asks here, so an old tab cannot get around the rule;
 * every approval step is recorded for the timeline and the bell.
 */
final class ContentApproval
{
    /** What only a manager may set while approvals are on. */
    public const MANAGER_STATUSES = ['approved', 'ready_to_publish', 'published'];

    /** The statuses a post may be sent for approval from. */
    public const SENDABLE = ['idea', 'draft', 'needs_visual', 'needs_review'];

    /** The words whose staff change sends an approved or ready post back to review; its day and time are not among them. */
    public const WORDS = ['topic', 'hook', 'main_copy', 'cta', 'hashtags', 'platform'];

    public static function isOn(?ContentPlannerProfile $profile): bool
    {
        return (bool) ($profile?->requires_approval ?? false);
    }

    /** Refuses a status only a manager may set, for staff while approvals are on; the post's own status sent again is no change. */
    public static function guardStatus(?string $status, ?string $before, User $user, ?ContentPlannerProfile $profile): void
    {
        if ($status === null || $status === $before || !in_array($status, self::MANAGER_STATUSES, true)) {
            return;
        }
        if (self::isOn($profile) && !ContentAccess::canManage($user)) {
            throw new ContentRefused('needs_approval', 'Only a manager can approve posts while approvals are on for this brand.', 403);
        }
    }

    /**
     * After a save's fields are filled, before it is written: a staff change to the words of an approved or ready post
     * sends it back to review. Returns the step to record once the post is saved, or null.
     */
    public static function beforeSave(ContentPlannerPost $post, string $before, User $user, ?ContentPlannerProfile $profile): ?string
    {
        if (!self::isOn($profile)) {
            return null;
        }
        $manager = ContentAccess::canManage($user);
        if (!$manager && $post->status === $before && in_array($before, ['approved', 'ready_to_publish'], true) && $post->isDirty(self::WORDS)) {
            $post->status = 'needs_review';

            return 'changed_after_approval';
        }
        if ($post->status === $before) {
            return null;
        }
        if ($post->status === 'needs_review' && !$manager) {
            return 'sent_for_approval';
        }

        return $post->status === 'approved' && $before === 'needs_review' && $manager ? 'approved' : null;
    }

    /** A new post a staff member files straight into review is sent for approval. */
    public static function onCreate(ContentPlannerPost $post, User $user, ?ContentPlannerProfile $profile): ?string
    {
        return self::isOn($profile) && $post->status === 'needs_review' && !ContentAccess::canManage($user) ? 'sent_for_approval' : null;
    }

    public static function record(ContentPlannerPost $post, string $kind, ?int $userId, ?string $note = null): ContentPlannerPostEvent
    {
        return ContentPlannerPostEvent::create(['post_id' => $post->id, 'brand_id' => $post->brand_id, 'user_id' => $userId, 'kind' => $kind, 'note' => $note]);
    }
}
```

- [ ] **Step 5: The rule in every write path**

In `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`:

1. Replace `use App\Services\Content\ContentContext;` with:

```php
use App\Services\Content\ContentApproval;
use App\Services\Content\ContentContext;
```

2. In `store`, replace:

```php
        // A post without a day has no time either (as a move to the tray, and as update, keep it).
        if (($data['scheduled_date'] ?? null) === null) {
            $data['scheduled_time'] = null;
        }
```

with:

```php
        ContentApproval::guardStatus($data['status'] ?? null, null, $request->user(), $profile);
        // A post without a day has no time either (as a move to the tray, and as update, keep it).
        if (($data['scheduled_date'] ?? null) === null) {
            $data['scheduled_time'] = null;
        }
```

and replace:

```php
        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))], 201);
    }

    public function show(int $id): JsonResponse
```

with:

```php
        if ($kind = ContentApproval::onCreate($post, $request->user(), $profile)) {
            ContentApproval::record($post, $kind, $request->user()->id);
        }

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))], 201);
    }

    public function show(int $id): JsonResponse
```

3. In `update`, replace:

```php
        $fields = Arr::except($data, ['updated_at']);
        if ($post->status === 'published' && array_key_exists('scheduled_date', $fields)
            && $fields['scheduled_date'] !== $post->scheduled_date?->format('Y-m-d')) {
            self::refusePublishedMove();
        }
        $post->fill($fields);
        // A post without a day has no time either — also when only a time was sent for it.
        if ($post->scheduled_date === null) {
            $post->scheduled_time = null;
        }
        $post->save();
```

with:

```php
        $fields = Arr::except($data, ['updated_at']);
        if ($post->status === 'published' && array_key_exists('scheduled_date', $fields)
            && $fields['scheduled_date'] !== $post->scheduled_date?->format('Y-m-d')) {
            self::refusePublishedMove();
        }
        $profile = ContentContext::profile();
        $before = (string) $post->status;
        // Spec 2026-10-16 §6.2: refused whole, before anything of the save is filled.
        ContentApproval::guardStatus($fields['status'] ?? null, $before, $request->user(), $profile);
        $post->fill($fields);
        // A post without a day has no time either — also when only a time was sent for it.
        if ($post->scheduled_date === null) {
            $post->scheduled_time = null;
        }
        $kind = ContentApproval::beforeSave($post, $before, $request->user(), $profile);
        $post->save();
        if ($kind) {
            ContentApproval::record($post, $kind, $request->user()->id);
        }
```

4. Replace:

```php
    public function markReady(int $id): JsonResponse
    {
        $post = self::find($id);
        $post->update(['status' => 'ready_to_publish']);
```

with:

```php
    public function markReady(Request $request, int $id): JsonResponse
    {
        $post = self::find($id);
        ContentApproval::guardStatus('ready_to_publish', (string) $post->status, $request->user(), ContentContext::profile());
        $post->update(['status' => 'ready_to_publish']);
```

5. Replace:

```php
        $data = $request->validate(['published_url' => 'nullable|url|max:255']);
        $post = self::find($id);
        $post->update(['status' => 'published', 'published_at' => now(), 'published_url' => $data['published_url'] ?? null]);
```

with:

```php
        $data = $request->validate(['published_url' => 'nullable|url|max:255']);
        $post = self::find($id);
        ContentApproval::guardStatus('published', (string) $post->status, $request->user(), ContentContext::profile());
        $post->update(['status' => 'published', 'published_at' => now(), 'published_url' => $data['published_url'] ?? null]);
```

In `app/Services/Content/ContentRepeat.php`, replace:

```php
     * The copies, made in one transaction; the original joins its own series. A published or archived original gives
     * draft copies; any other keeps its status.
     *
     * @param list<string> $dates
     * @return Collection<int, ContentPlannerPost>
     */
    public static function copy(ContentPlannerPost $original, array $dates, ?int $userId): Collection
    {
        $status = in_array($original->status, ['published', 'archived'], true) ? 'draft' : (string) $original->status;
```

with:

```php
     * The copies, made in one transaction; the original joins its own series. A published or archived original gives
     * draft copies; any other keeps its status — unless `$status` is given (copies the AI rewords while approvals are
     * on wait for approval: spec 2026-10-16 §6.2).
     *
     * @param list<string> $dates
     * @return Collection<int, ContentPlannerPost>
     */
    public static function copy(ContentPlannerPost $original, array $dates, ?int $userId, ?string $status = null): Collection
    {
        $status ??= in_array($original->status, ['published', 'archived'], true) ? 'draft' : (string) $original->status;
```

In `app/Http/Controllers/Api/V1/Admin/Content/RepeatController.php`, replace `use App\Services\Content\ContentAiGate;` with:

```php
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentApproval;
```

and replace:

```php
        $copies = ContentRepeat::copy($post, $dates, $request->user()->id);
```

with:

```php
        // Copies the AI rewords wait for a manager while approvals are on (spec 2026-10-16 §6.2); plain copies keep the status.
        $waits = $request->boolean('ai_rewrite') && ContentApproval::isOn(ContentContext::profile());
        $copies = ContentRepeat::copy($post, $dates, $request->user()->id, $waits ? 'needs_review' : null);
```

- [ ] **Step 6: Run the test, then the Content folders**

```bash
"$R5/php.sh" tests/Feature/Content/ApprovalRuleTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `ApprovalRuleTest | Tests:    7 passed`; both folders `exit 0` (Feature Content 170, Unit Content 71; `PostsTest`, `RepeatTest` and `IdeasTest` unchanged — the switch is off there).

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_18_100100_create_content_planner_post_events_table.php app/Models/ContentPlannerPostEvent.php app/Models/ContentPlannerPost.php app/Services/Content/ContentApproval.php app/Http/Controllers/Api/V1/Admin/Content/PostController.php app/Http/Controllers/Api/V1/Admin/Content/RepeatController.php app/Services/Content/ContentRepeat.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/ApprovalRuleTest.php && git commit -q -m "Content: the approval rule on every write, and the approval history" -m "While a brand's switch is on, staff cannot set approved, ready or published
(needs_approval); a staff change to an approved post's words sends it back
to review; AI-reworded repeat copies wait for approval. Every step is
recorded in content_planner_post_events." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: What a post shows — author, comment count, "sent back", the timeline

**Files:**
- Create: `database/migrations/2026_10_18_100200_create_content_planner_post_comments_table.php`, `app/Models/ContentPlannerPostComment.php`, `app/Services/Content/ContentTimeline.php`
- Modify: `app/Models/ContentPlannerPost.php`, `app/Services/Content/ContentPostPresenter.php`, `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, `app/Services/Content/ContentPlan.php`, `app/Services/Content/ContentIdeas.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: create `tests/Feature/Content/PostReviewTest.php`

**Interfaces:**
- Consumes: `ContentPlannerPostEvent`, `ContentPlannerPost::events()` (Task 2).
- Produces:
  - Table `content_planner_post_comments` (`id`, `organization_id`, `brand_id`, `post_id` FK cascade, `user_id` FK users null on delete, `body` text, `edited_at` null, timestamps); model `ContentPlannerPostComment` (`user()`, `MAX_LENGTH = 2000`); `ContentPlannerPost::comments()`; scope `ContentPlannerPost::withReview()` (adds `comments_count`, `last_event_kind`, `last_event_at`).
  - Card fields `comments_count` (int) and `sent_back` (bool); detail field `author` (string|null); `ContentPostPresenter::sentBack(ContentPlannerPost): bool`; `ContentPostPresenter::panel(ContentPlannerPost $post, ?User $viewer): array` (the detail plus `timeline`; Task 4 answers with it).
  - `ContentTimeline::LIMIT = 200`; `ContentTimeline::for(ContentPlannerPost $post, ?User $viewer): list<array>` — items oldest first: `{type: 'comment', id, user: {id, name}|null, body, edited: bool, mine: bool, at}` and `{type: 'event', id, kind, user: {id, name}|null, note, at}`; `ContentTimeline::comment(ContentPlannerPostComment $c, ?User $viewer): array` (one comment item, used by Task 5).
  - `GET posts/{id}` answers `post.timeline`.
  - Comments do not touch their post: a comment neither makes an open panel's save stale nor ends "sent back".

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/PostReviewTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerPostEvent;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** What a post shows for the team (spec 2026-10-16 §6.3, §7.1): its writer, comments, history and "sent back". */
class PostReviewTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function comment(ContentPlannerPost $post, ?int $userId, string $body, ?string $at = null): ContentPlannerPostComment
    {
        $comment = ContentPlannerPostComment::create(['post_id' => $post->id, 'brand_id' => $this->brandId, 'user_id' => $userId, 'body' => $body]);
        if ($at) {
            $comment->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
        }

        return $comment;
    }

    private function event(ContentPlannerPost $post, ?int $userId, string $kind, ?string $note = null, ?string $at = null): ContentPlannerPostEvent
    {
        $event = ContentPlannerPostEvent::create(['post_id' => $post->id, 'brand_id' => $this->brandId, 'user_id' => $userId, 'kind' => $kind, 'note' => $note]);
        if ($at) {
            $event->forceFill(['created_at' => $at])->save();
        }

        return $event;
    }

    public function test_the_post_says_who_wrote_it_and_an_ai_post_says_nothing(): void
    {
        $this->staffMember->forceFill(['name' => 'Anna'])->save();
        $id = $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'Mine'])->assertCreated()->json('post.id');
        $this->asManager()->getJson($this->api("posts/{$id}"))->assertOk()->assertJsonPath('post.author', 'Anna');
        $generated = $this->makePost(['generated_by' => 'ai']);
        $this->asManager()->getJson($this->api("posts/{$generated->id}"))->assertOk()->assertJsonPath('post.author', null);
    }

    // Review Focus 4: a removed member's comments and steps stay, with no name.
    public function test_the_timeline_holds_comments_and_steps_oldest_first_and_marks_my_comments(): void
    {
        $post = $this->makePost();
        $this->event($post, $this->staffMember->id, 'sent_for_approval', null, '2026-10-05 07:00:00');
        $this->comment($post, $this->manager->id, 'Shorter please', '2026-10-05 08:00:00');
        $this->event($post, $this->manager->id, 'sent_back', 'Shorter please', '2026-10-05 08:01:00');
        $this->comment($post, null, 'From someone who left', '2026-10-05 09:00:00');

        $timeline = $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->json('post.timeline');

        $this->assertSame(['event', 'comment', 'event', 'comment'], array_column($timeline, 'type'));
        $this->assertSame('sent_for_approval', $timeline[0]['kind']);
        $this->assertSame(['id' => $this->manager->id, 'name' => $this->manager->name], $timeline[1]['user']);
        $this->assertFalse($timeline[1]['mine']);
        $this->assertSame('Shorter please', $timeline[2]['note']);
        $this->assertNull($timeline[3]['user']);
        $this->assertSame('From someone who left', $timeline[3]['body']);
        $this->assertTrue($this->asManager()->getJson($this->api("posts/{$post->id}"))->json('post.timeline.1.mine'));
    }

    public function test_the_timeline_keeps_the_newest_200(): void
    {
        $post = $this->makePost();
        $start = CarbonImmutable::parse('2026-09-01 08:00:00');
        for ($i = 0; $i < 150; $i++) {
            $this->comment($post, $this->manager->id, "Comment {$i}", $start->addMinutes($i * 2)->toDateTimeString());
        }
        for ($i = 0; $i < 60; $i++) {
            $this->event($post, $this->manager->id, 'approved', null, $start->addMinutes($i * 2 + 1)->toDateTimeString());
        }

        $timeline = $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertOk()->json('post.timeline');

        $this->assertCount(200, $timeline);
        $this->assertSame('Comment 149', $timeline[199]['body']);
        $this->assertSame('Comment 5', $timeline[0]['body']);
    }

    public function test_cards_carry_their_comment_count_on_the_plan_the_ideas_board_and_the_posts_list(): void
    {
        $dated = $this->makePost(['scheduled_date' => '2026-10-07']);
        $idea = $this->makePost(['scheduled_date' => null, 'status' => 'idea']);
        $this->comment($dated, $this->manager->id, 'One');
        $this->comment($dated, $this->staffMember->id, 'Two');
        $this->comment($idea, $this->manager->id, 'Three');

        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->assertOk()
            ->assertJsonPath('posts.0.comments_count', 2)->assertJsonPath('unscheduled.0.comments_count', 1);
        $this->asStaffMember()->getJson($this->api('ideas'))->assertOk()->assertJsonPath('columns.idea.posts.0.comments_count', 1);
        $posts = collect($this->asStaffMember()->getJson($this->api('posts'))->assertOk()->json('data'));
        $this->assertSame(2, $posts->firstWhere('id', $dated->id)['comments_count']);
        $found = collect($this->asStaffMember()->getJson($this->api('find?q=Autumn'))->assertOk()->json('posts'));
        $this->assertSame(2, $found->firstWhere('id', $dated->id)['comments_count']);
    }

    // Review Focus 3.
    public function test_sent_back_lasts_until_the_post_is_changed_not_when_it_is_commented(): void
    {
        $post = $this->makePost(['status' => 'draft', 'scheduled_date' => '2026-10-07']);
        $post->forceFill(['updated_at' => '2026-10-05 06:00:00'])->save();
        $this->event($post, $this->manager->id, 'sent_back', 'Shorter please', '2026-10-05 06:00:00');
        $sentBack = fn () => $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->assertOk()->json('posts.0.sent_back');

        $this->assertTrue($sentBack());
        $this->comment($post, $this->staffMember->id, 'On it');
        $this->assertTrue($sentBack());

        $this->travel(1)->minutes();
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['hook' => 'Shorter', 'updated_at' => $post->fresh()->updated_at->toISOString()])->assertOk()
            ->assertJsonPath('post.sent_back', false);
        $this->assertFalse($sentBack());

        $approved = $this->makePost(['status' => 'approved', 'scheduled_date' => '2026-10-08']);
        $this->event($approved, $this->manager->id, 'sent_back', 'x');
        $this->assertFalse(collect($this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->json('posts'))->firstWhere('id', $approved->id)['sent_back'], 'only a draft is "sent back"');
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R5/php.sh" tests/Feature/Content/PostReviewTest.php
```

Expected: `exit 1` — `ContentPlannerPostComment` does not exist.

- [ ] **Step 3: The comments table and model; the review scope**

Write `database/migrations/2026_10_18_100200_create_content_planner_post_comments_table.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Comments on a post (spec 2026-10-16 §7): plain text, kept when their author leaves (`user_id` null). */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_post_comments')) {
            return;
        }
        Schema::create('content_planner_post_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('post_id')->constrained('content_planner_posts')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->timestamp('edited_at')->nullable();
            $table->timestamps();
            $table->index(['post_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_post_comments');
    }
};
```

Write `app/Models/ContentPlannerPostComment.php` with the Write tool:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A comment on a post (spec 2026-10-16 §7.1): its author edits or deletes it; managers delete anyone's. */
class ContentPlannerPostComment extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    /** A comment holds 1–2,000 characters. */
    public const MAX_LENGTH = 2000;

    protected $fillable = ['post_id', 'brand_id', 'user_id', 'body', 'edited_at'];

    protected $casts = ['edited_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
```

In `app/Models/ContentPlannerPost.php`, replace:

```php
    /** Its approval steps (spec 2026-10-16 §6.4). */
    public function events(): HasMany
    {
        return $this->hasMany(ContentPlannerPostEvent::class, 'post_id');
    }
```

with:

```php
    /** Its approval steps (spec 2026-10-16 §6.4). */
    public function events(): HasMany
    {
        return $this->hasMany(ContentPlannerPostEvent::class, 'post_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(ContentPlannerPostComment::class, 'post_id');
    }

    /**
     * Cards' review facts in the list's own query (spec 2026-10-16 §6.3, §7.1): the comment count and the latest
     * approval step, so a card never asks again.
     */
    public function scopeWithReview($query)
    {
        $latest = fn (string $column) => ContentPlannerPostEvent::select($column)
            ->whereColumn('post_id', 'content_planner_posts.id')->orderByDesc('id')->limit(1);

        return $query->withCount('comments')->addSelect(['last_event_kind' => $latest('kind'), 'last_event_at' => $latest('created_at')]);
    }
```

In `tests/Concerns/SetsUpContentSchema.php`, replace:

```php
        if (!Schema::hasTable('content_planner_post_events')) {
            (require database_path('migrations/2026_10_18_100100_create_content_planner_post_events_table.php'))->up();
        }
```

with:

```php
        if (!Schema::hasTable('content_planner_post_events')) {
            (require database_path('migrations/2026_10_18_100100_create_content_planner_post_events_table.php'))->up();
        }
        if (!Schema::hasTable('content_planner_post_comments')) {
            (require database_path('migrations/2026_10_18_100200_create_content_planner_post_comments_table.php'))->up();
        }
```

- [ ] **Step 4: The timeline and the presenter**

Write `app/Services/Content/ContentTimeline.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerPostEvent;
use App\Models\User;

/**
 * A post's comments and approval steps in one timeline (spec 2026-10-16 §7.1): oldest first, the newest 200. A comment
 * or step whose author has left has no `user` (the portal says "Former team member").
 */
final class ContentTimeline
{
    public const LIMIT = 200;

    /** @return list<array<string, mixed>> */
    public static function for(ContentPlannerPost $post, ?User $viewer): array
    {
        $comments = $post->comments()->with('user:id,name')->orderByDesc('created_at')->orderByDesc('id')->limit(self::LIMIT)->get()
            ->map(fn (ContentPlannerPostComment $comment) => self::comment($comment, $viewer));
        $events = $post->events()->with('user:id,name')->orderByDesc('created_at')->orderByDesc('id')->limit(self::LIMIT)->get()
            ->map(fn (ContentPlannerPostEvent $event) => [
                'type' => 'event',
                'id'   => (int) $event->id,
                'kind' => (string) $event->kind,
                'user' => self::person($event->user),
                'note' => $event->note,
                'at'   => $event->created_at?->toISOString(),
            ]);

        return $comments->concat($events)
            ->sort(fn (array $a, array $b) => [$b['at'], $b['type'], $b['id']] <=> [$a['at'], $a['type'], $a['id']])
            ->take(self::LIMIT)->reverse()->values()->all();
    }

    /** One comment as the timeline and the comment endpoints send it. @return array<string, mixed> */
    public static function comment(ContentPlannerPostComment $comment, ?User $viewer): array
    {
        return [
            'type'   => 'comment',
            'id'     => (int) $comment->id,
            'user'   => self::person($comment->user),
            'body'   => (string) $comment->body,
            'edited' => $comment->edited_at !== null,
            'mine'   => $viewer !== null && $comment->user_id !== null && (int) $comment->user_id === (int) $viewer->id,
            'at'     => $comment->created_at?->toISOString(),
        ];
    }

    /** @return array{id: int, name: string}|null */
    private static function person(?User $user): ?array
    {
        return $user ? ['id' => (int) $user->id, 'name' => (string) $user->name] : null;
    }
}
```

In `app/Services/Content/ContentPostPresenter.php`:

1. Replace `use App\Models\ContentPlannerPost;` with:

```php
use App\Models\ContentPlannerPost;
use App\Models\User;
use Carbon\CarbonImmutable;
```

2. Replace:

```php
            'image_url'      => $brief?->image_status === 'ready' ? $brief->image_url : null,
            'updated_at'     => $post->updated_at?->toISOString(),
        ];
    }
```

with:

```php
            'image_url'      => $brief?->image_status === 'ready' ? $brief->image_url : null,
            'updated_at'     => $post->updated_at?->toISOString(),
            // Spec 2026-10-16 §6.3, §7.1 (read in the list's query by withReview(); asked here otherwise).
            'comments_count' => (int) ($post->comments_count ?? $post->comments()->count()),
            'sent_back'      => self::sentBack($post),
        ];
    }

    /** A draft whose latest approval step is a send-back, with no change to the post after it (spec 2026-10-16 §6.3). */
    public static function sentBack(ContentPlannerPost $post): bool
    {
        if ($post->status !== 'draft') {
            return false;
        }
        if (array_key_exists('last_event_kind', $post->getAttributes())) {
            $kind = $post->getAttribute('last_event_kind');
            $at = $post->getAttribute('last_event_at');
        } else {
            $last = $post->events()->orderByDesc('id')->first();
            $kind = $last?->kind;
            $at = $last?->created_at;
        }
        if ($kind !== 'sent_back' || $at === null || $post->updated_at === null) {
            return false;
        }

        return $post->updated_at->getTimestamp() <= CarbonImmutable::parse($at)->getTimestamp();
    }
```

3. Replace:

```php
        return self::card($post) + [
            'language'          => $post->language,
```

with:

```php
        return self::card($post) + [
            // Who wrote it (spec 2026-10-16 §7.1); an AI-generated post, or one whose writer left, has none.
            'author'            => $post->created_by ? $post->createdBy?->name : null,
            'language'          => $post->language,
```

4. Replace:

```php
    /** PostgreSQL answers a time column as HH:MM:SS; the portal works in HH:MM. */
```

with:

```php
    /** The post as its panel opens it: everything, with its comments and approval steps (spec 2026-10-16 §7.1). @return array<string, mixed> */
    public static function panel(ContentPlannerPost $post, ?User $viewer): array
    {
        return self::detail($post) + ['timeline' => ContentTimeline::for($post, $viewer)];
    }

    /** PostgreSQL answers a time column as HH:MM:SS; the portal works in HH:MM. */
```

In `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`:

1. Replace:

```php
    public function show(int $id): JsonResponse
    {
        return response()->json(['post' => ContentPostPresenter::detail(self::find($id))]);
    }
```

with:

```php
    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['post' => ContentPostPresenter::panel(self::find($id), $request->user())]);
    }
```

2. Replace `        $query = ContentPlannerPost::with(self::WITH)` with `        $query = ContentPlannerPost::with(self::WITH)->withReview()`.
3. Replace `        $posts = ContentPlan::search(ContentPlannerPost::with(self::WITH)->where('planner_profile_id', $profile->id), $words)` with `        $posts = ContentPlan::search(ContentPlannerPost::with(self::WITH)->withReview()->where('planner_profile_id', $profile->id), $words)`.

In `app/Services/Content/ContentPlan.php`, replace:

```php
        $posts = self::datedPosts($profile, $from, $to)->with('visualBrief')
```

with:

```php
        $posts = self::datedPosts($profile, $from, $to)->with('visualBrief')->withReview()
```

and replace:

```php
        $unscheduled = ContentPlannerPost::with('visualBrief')
```

with:

```php
        $unscheduled = ContentPlannerPost::with('visualBrief')->withReview()
```

In `app/Services/Content/ContentIdeas.php`, replace `'posts' => $query()->with('visualBrief')->orderByDesc('updated_at')` with `'posts' => $query()->with('visualBrief')->withReview()->orderByDesc('updated_at')`.

- [ ] **Step 5: Run the test, then the Content folders**

```bash
"$R5/php.sh" tests/Feature/Content/PostReviewTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `PostReviewTest | Tests:    5 passed`; both folders `exit 0` (Feature Content 175, Unit Content 71). The subselects of `withReview()` carry the event and comment models' tenant scopes (`organization_id`, `brand_id`): wanted.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_18_100200_create_content_planner_post_comments_table.php app/Models/ContentPlannerPostComment.php app/Models/ContentPlannerPost.php app/Services/Content/ContentTimeline.php app/Services/Content/ContentPostPresenter.php app/Http/Controllers/Api/V1/Admin/Content/PostController.php app/Services/Content/ContentPlan.php app/Services/Content/ContentIdeas.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/PostReviewTest.php && git commit -q -m "Content: a post's writer, comment count, sent-back state and timeline" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: Send for approval, Approve, Send back

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/Content/ApprovalController.php`
- Modify: `routes/api.php`, `tests/Feature/Content/ContentGateTest.php`
- Test: create `tests/Feature/Content/ApprovalActionsTest.php`

**Interfaces:**
- Consumes: `ContentApproval::isOn`, `ContentApproval::SENDABLE`, `ContentApproval::record` (Task 2); `ContentPostPresenter::panel` (Task 3); `ContentPlannerPostComment::MAX_LENGTH` (Task 3, the send-back note's limit); `PostController::find`, `PostController::assertFresh`, `PostController::WITH`; `ContentAccess::requireManager`.
- Produces:
  - `POST posts/{id}/send-for-approval` (everyone) → `needs_review`, records `sent_for_approval`.
  - `POST posts/{id}/approve` (managers, body `updated_at`: the version the manager read) → `approved`, records `approved`; a post changed since answers 409 `changed_elsewhere` with the post as it is now.
  - `POST posts/{id}/send-back` (managers, body `note`, 1–2,000 characters) → `draft`, records `sent_back` with the note.
  - Each answers `{post}` = `ContentPostPresenter::panel` (with the timeline). Refusals: `manager_only` 403 (before anything is read), `not_found` 404, `approvals_off` 409 (the brand's switch is off), `wrong_status` 409 (with `post`: the post as it is now).

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/ApprovalActionsTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPostEvent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The three approval steps (spec 2026-10-16 §6.2): only while the brand's switch is on. */
class ApprovalActionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->profile->forceFill(['requires_approval' => true])->save();
    }

    public function test_staff_send_a_post_for_approval_from_idea_draft_needs_visual_or_needs_review(): void
    {
        foreach (['idea', 'draft', 'needs_visual', 'needs_review'] as $status) {
            $post = $this->makePost(['status' => $status]);
            $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertOk()
                ->assertJsonPath('post.status', 'needs_review')
                ->assertJsonPath('post.timeline.0.kind', 'sent_for_approval')
                ->assertJsonPath('post.timeline.0.user.id', $this->staffMember->id);
        }
        foreach (['approved', 'ready_to_publish', 'published', 'skipped', 'archived'] as $status) {
            $post = $this->makePost(['status' => $status]);
            $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertStatus(409)
                ->assertJsonPath('error', 'wrong_status')->assertJsonPath('post.status', $status);
            $this->assertSame($status, $post->fresh()->status);
        }
    }

    public function test_a_manager_approves_a_post_in_review_as_they_read_it(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $read = $post->fresh()->updated_at->toISOString();
        $this->travel(1)->minutes();
        $post->update(['hook' => 'Changed since']);

        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), ['updated_at' => $read])->assertStatus(409)
            ->assertJsonPath('error', 'changed_elsewhere')->assertJsonPath('post.hook', 'Changed since');
        $this->assertSame('needs_review', $post->fresh()->status);

        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), ['updated_at' => $post->fresh()->updated_at->toISOString()])->assertOk()
            ->assertJsonPath('post.status', 'approved')->assertJsonPath('post.timeline.0.kind', 'approved')
            ->assertJsonPath('post.timeline.0.user.id', $this->manager->id);
        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), ['updated_at' => $post->fresh()->updated_at->toISOString()])->assertStatus(409)
            ->assertJsonPath('error', 'wrong_status');
    }

    public function test_a_manager_sends_a_post_back_with_a_note_and_it_becomes_a_sent_back_draft(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), [])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => '   '])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => str_repeat('a', 2001)])->assertStatus(422)->assertJsonValidationErrors('note');

        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => "Shorter, please.\nAnd a warmer photo."])->assertOk()
            ->assertJsonPath('post.status', 'draft')->assertJsonPath('post.sent_back', true)
            ->assertJsonPath('post.timeline.0.kind', 'sent_back')
            ->assertJsonPath('post.timeline.0.note', "Shorter, please.\nAnd a warmer photo.");
    }

    public function test_only_managers_approve_or_send_back_and_nothing_happens_while_approvals_are_off(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $read = fn () => ['updated_at' => $post->fresh()->updated_at->toISOString()];
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/approve"), $read())->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'No'])->assertStatus(403)->assertJsonPath('error', 'manager_only');

        $this->profile->forceFill(['requires_approval' => false])->save();
        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), $read())->assertStatus(409)->assertJsonPath('error', 'approvals_off');
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'No'])->assertStatus(409)->assertJsonPath('error', 'approvals_off');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertStatus(409)->assertJsonPath('error', 'approvals_off');

        $this->assertSame('needs_review', $post->fresh()->status);
        $this->assertSame(0, ContentPlannerPostEvent::count());
    }

    public function test_another_organisations_post_does_not_exist_here(): void
    {
        $other = $this->otherOrganization();
        $this->asManager()->postJson($this->api("posts/{$other['post']->id}/send-back"), ['note' => 'No'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asStaffMember()->postJson($this->api("posts/{$other['post']->id}/send-for-approval"))->assertNotFound()->assertJsonPath('error', 'not_found');
    }
}
```

In `tests/Feature/Content/ContentGateTest.php`, replace:

```php
            ['POST', 'brand/templates'], ['PUT', 'brand/templates/1'], ['DELETE', 'brand/templates/1'], ['POST', 'brand/templates/suggest'],
        ];
```

with:

```php
            ['POST', 'brand/templates'], ['PUT', 'brand/templates/1'], ['DELETE', 'brand/templates/1'], ['POST', 'brand/templates/suggest'],
            ['POST', 'posts/1/approve'], ['POST', 'posts/1/send-back'],
        ];
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R5/php.sh" tests/Feature/Content/ApprovalActionsTest.php tests/Feature/Content/ContentGateTest.php
```

Expected: both `exit 1` — the three routes do not exist (404 where 200, 409 or 403 is expected).

- [ ] **Step 3: The controller and its routes**

Write `app/Http/Controllers/Api/V1/Admin/Content/ApprovalController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentApproval;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Send for approval, Approve and Send back (spec 2026-10-16 §6.2): a brand's approval steps, only while its switch is
 * on. Each sets the post's status, records the step and answers with the post and its timeline.
 */
class ApprovalController extends Controller
{
    public function send(Request $request, int $id): JsonResponse
    {
        return self::step($request, self::post($id, ContentApproval::SENDABLE), 'needs_review', 'sent_for_approval');
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate(['updated_at' => 'required|string']);
        $post = self::post($id, ['needs_review']);
        // A manager approves the words they read: a post changed since is refused, with the post as it is now.
        PostController::assertFresh($post, $data['updated_at']);

        return self::step($request, $post, 'approved', 'approved');
    }

    public function sendBack(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate(['note' => 'required|string|max:' . ContentPlannerPostComment::MAX_LENGTH]);

        return self::step($request, self::post($id, ['needs_review']), 'draft', 'sent_back', trim($data['note']));
    }

    /** A post of this brand, while approvals are on, in a status the step starts from. @param list<string> $from */
    private static function post(int $id, array $from): ContentPlannerPost
    {
        $post = PostController::find($id);
        if (!ContentApproval::isOn(ContentContext::profile())) {
            throw new ContentRefused('approvals_off', 'Approvals are off for this brand.', 409);
        }
        if (!in_array($post->status, $from, true)) {
            throw new ContentRefused('wrong_status', 'This post has moved on since — reload to see where it is.', 409, ['post' => ContentPostPresenter::detail($post)]);
        }

        return $post;
    }

    private static function step(Request $request, ContentPlannerPost $post, string $status, string $kind, ?string $note = null): JsonResponse
    {
        DB::transaction(function () use ($request, $post, $status, $kind, $note) {
            $post->update(['status' => $status]);
            ContentApproval::record($post, $kind, $request->user()->id, $note);
        });

        return response()->json(['post' => ContentPostPresenter::panel($post->fresh(PostController::WITH), $request->user())]);
    }
}
```

In `routes/api.php`, replace:

```php
                Route::post('posts/{id}/mark-published', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'markPublished'])->whereNumber('id');
```

with:

```php
                Route::post('posts/{id}/mark-published', [\App\Http\Controllers\Api\V1\Admin\Content\PostController::class, 'markPublished'])->whereNumber('id');
                Route::post('posts/{id}/send-for-approval', [\App\Http\Controllers\Api\V1\Admin\Content\ApprovalController::class, 'send'])->whereNumber('id');
                Route::post('posts/{id}/approve', [\App\Http\Controllers\Api\V1\Admin\Content\ApprovalController::class, 'approve'])->whereNumber('id');
                Route::post('posts/{id}/send-back', [\App\Http\Controllers\Api\V1\Admin\Content\ApprovalController::class, 'sendBack'])->whereNumber('id');
```

- [ ] **Step 4: Run the tests, then the Content folders**

```bash
"$R5/php.sh" tests/Feature/Content/ApprovalActionsTest.php tests/Feature/Content/ContentGateTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `ApprovalActionsTest | Tests:    5 passed`; `ContentGateTest` `exit 0`; both folders `exit 0` (Feature Content 180, Unit Content 71).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Http/Controllers/Api/V1/Admin/Content/ApprovalController.php routes/api.php tests/Feature/Content/ApprovalActionsTest.php tests/Feature/Content/ContentGateTest.php && git commit -q -m "Content: Send for approval, Approve and Send back" -m "Approve takes the version the manager read: a post changed since is refused
(changed_elsewhere), so nobody approves words they have not seen." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: Comments

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/Content/CommentController.php`
- Modify: `routes/api.php`
- Test: create `tests/Feature/Content/CommentsTest.php`

**Interfaces:**
- Consumes: `ContentPlannerPostComment` (`MAX_LENGTH`), `ContentTimeline::comment`, `ContentPlannerPost::comments()` (Task 3); `PostController::find`; `ContentAccess::canManage`.
- Produces:
  - `POST posts/{id}/comments` (everyone, body `body`: plain text, lines kept, 1–2,000 characters once trimmed) → 201 `{comment, comments_count}`.
  - `PUT comments/{id}` (its author only) → `{comment}` with `edited: true`.
  - `DELETE comments/{id}` (its author, or any manager) → `{deleted: true, comments_count}`.
  - Refusals: `not_yours` 403 (someone else's comment, a removed member's included), `not_found` 404 (another brand's post or comment, a deleted comment).

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/CommentsTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Comments on a post (spec 2026-10-16 §7.1): everyone comments; you edit or delete your own; managers delete anyone's. */
class CommentsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_everyone_comments_on_any_of_the_brands_posts_in_plain_text_with_lines_kept(): void
    {
        $post = $this->makePost();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => "  Love it.\nMaybe a warmer photo?  "])->assertCreated()
            ->assertJsonPath('comment.type', 'comment')
            ->assertJsonPath('comment.body', "Love it.\nMaybe a warmer photo?")
            ->assertJsonPath('comment.user', ['id' => $this->staffMember->id, 'name' => $this->staffMember->name])
            ->assertJsonPath('comment.mine', true)->assertJsonPath('comment.edited', false)
            ->assertJsonPath('comments_count', 1);
        $this->asManager()->postJson($this->api("posts/{$post->id}/comments"), ['body' => '<b>Yes</b>'])->assertCreated()
            ->assertJsonPath('comment.body', '<b>Yes</b>')->assertJsonPath('comments_count', 2);

        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertOk()
            ->assertJsonPath('post.comments_count', 2)->assertJsonPath('post.timeline.1.body', '<b>Yes</b>');
    }

    public function test_a_comment_holds_1_to_2000_characters(): void
    {
        $post = $this->makePost();
        foreach (['', '   ', str_repeat('a', 2001)] as $body) {
            $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => $body])->assertStatus(422)->assertJsonValidationErrors('body');
        }
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => str_repeat('ā', 2000)])->assertCreated();
        $this->assertSame(1, ContentPlannerPostComment::count());
    }

    public function test_you_edit_your_own_comment_and_it_says_edited(): void
    {
        $post = $this->makePost();
        $id = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'First'])->json('comment.id');

        $this->asManager()->putJson($this->api("comments/{$id}"), ['body' => 'Taken over'])->assertStatus(403)->assertJsonPath('error', 'not_yours');
        $this->asStaffMember()->putJson($this->api("comments/{$id}"), ['body' => 'Second'])->assertOk()
            ->assertJsonPath('comment.body', 'Second')->assertJsonPath('comment.edited', true);
        $this->asStaffMember()->putJson($this->api("comments/{$id}"), ['body' => ''])->assertStatus(422)->assertJsonValidationErrors('body');
        $this->assertSame('Second', ContentPlannerPostComment::findOrFail($id)->body);
    }

    public function test_you_delete_your_own_and_managers_delete_anyones(): void
    {
        $post = $this->makePost();
        $staffs = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'Mine'])->json('comment.id');
        $managers = $this->asManager()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'Theirs'])->json('comment.id');
        $left = ContentPlannerPostComment::create(['post_id' => $post->id, 'brand_id' => $this->brandId, 'user_id' => null, 'body' => 'From someone who left']);

        $this->asStaffMember()->deleteJson($this->api("comments/{$managers}"))->assertStatus(403)->assertJsonPath('error', 'not_yours');
        $this->asStaffMember()->deleteJson($this->api("comments/{$left->id}"))->assertStatus(403)->assertJsonPath('error', 'not_yours');
        $this->asStaffMember()->putJson($this->api("comments/{$left->id}"), ['body' => 'Mine now'])->assertStatus(403)->assertJsonPath('error', 'not_yours');

        $this->asStaffMember()->deleteJson($this->api("comments/{$staffs}"))->assertOk()->assertJsonPath('deleted', true)->assertJsonPath('comments_count', 2);
        $this->asManager()->deleteJson($this->api("comments/{$left->id}"))->assertOk()->assertJsonPath('comments_count', 1);
        $this->asManager()->deleteJson($this->api("comments/{$staffs}"))->assertNotFound()->assertJsonPath('error', 'not_found');
    }

    public function test_another_brands_post_and_comments_do_not_exist_here(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        $theirPost = ContentPlannerPost::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'platform' => 'instagram', 'status' => 'draft', 'topic' => 'Theirs']);
        $theirs = ContentPlannerPostComment::create(['post_id' => $theirPost->id, 'brand_id' => $second, 'user_id' => $this->manager->id, 'body' => 'Theirs']);

        $this->asManager()->postJson($this->api("posts/{$theirPost->id}/comments"), ['body' => 'Hello'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asManager()->putJson($this->api("comments/{$theirs->id}"), ['body' => 'Hello'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("comments/{$theirs->id}"))->assertNotFound();
        $this->assertSame('Theirs', ContentPlannerPostComment::withoutGlobalScopes()->findOrFail($theirs->id)->body);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R5/php.sh" tests/Feature/Content/CommentsTest.php
```

Expected: `exit 1` — the routes do not exist (404 where 201 is expected).

- [ ] **Step 3: The controller and its routes**

Write `app/Http/Controllers/Api/V1/Admin/Content/CommentController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPostComment;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentTimeline;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Comments on a post (spec 2026-10-16 §7.1): everyone on the team comments on any of the brand's posts; you edit or
 * delete your own; managers delete anyone's. Plain text, its lines kept.
 */
class CommentController extends Controller
{
    public function store(Request $request, int $id): JsonResponse
    {
        $post = PostController::find($id);
        $comment = ContentPlannerPostComment::create([
            'post_id'  => $post->id,
            'brand_id' => $post->brand_id,
            'user_id'  => $request->user()->id,
            'body'     => self::body($request),
        ]);

        return response()->json([
            'comment'        => ContentTimeline::comment($comment->load('user:id,name'), $request->user()),
            'comments_count' => $post->comments()->count(),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $comment = self::find($id);
        if (!self::mine($comment, $request)) {
            throw new ContentRefused('not_yours', 'You can only change your own comments.', 403);
        }
        $comment->update(['body' => self::body($request), 'edited_at' => now()]);

        return response()->json(['comment' => ContentTimeline::comment($comment->load('user:id,name'), $request->user())]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $comment = self::find($id);
        if (!self::mine($comment, $request) && !ContentAccess::canManage($request->user())) {
            throw new ContentRefused('not_yours', 'You can only delete your own comments.', 403);
        }
        $postId = (int) $comment->post_id;
        $comment->delete();

        return response()->json(['deleted' => true, 'comments_count' => ContentPlannerPostComment::where('post_id', $postId)->count()]);
    }

    /** A comment of this organisation and brand, or not_found (another brand's comment does not exist here). */
    private static function find(int $id): ContentPlannerPostComment
    {
        return ContentPlannerPostComment::where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This comment no longer exists.', 404);
    }

    /** A removed member's comment is nobody's own. */
    private static function mine(ContentPlannerPostComment $comment, Request $request): bool
    {
        return $comment->user_id !== null && (int) $comment->user_id === (int) $request->user()->id;
    }

    /** 1–2,000 characters once trimmed (the request's strings arrive trimmed, a blank one as null). */
    private static function body(Request $request): string
    {
        return trim((string) $request->validate(['body' => 'required|string|max:' . ContentPlannerPostComment::MAX_LENGTH])['body']);
    }
}
```

In `routes/api.php`, replace:

```php
                Route::post('posts/{id}/send-back', [\App\Http\Controllers\Api\V1\Admin\Content\ApprovalController::class, 'sendBack'])->whereNumber('id');
```

with:

```php
                Route::post('posts/{id}/send-back', [\App\Http\Controllers\Api\V1\Admin\Content\ApprovalController::class, 'sendBack'])->whereNumber('id');
                Route::post('posts/{id}/comments', [\App\Http\Controllers\Api\V1\Admin\Content\CommentController::class, 'store'])->whereNumber('id');
                Route::put('comments/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\CommentController::class, 'update'])->whereNumber('id');
                Route::delete('comments/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\CommentController::class, 'destroy'])->whereNumber('id');
```

- [ ] **Step 4: Run the test, then the Content folders**

```bash
"$R5/php.sh" tests/Feature/Content/CommentsTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `CommentsTest | Tests:    5 passed`; both folders `exit 0` (Feature Content 185, Unit Content 71).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Http/Controllers/Api/V1/Admin/Content/CommentController.php routes/api.php tests/Feature/Content/CommentsTest.php && git commit -q -m "Content: comments on posts (write, edit your own, delete your own or as a manager)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: The "For you" inbox

**Files:**
- Create: `database/migrations/2026_10_18_100300_create_content_planner_reads_table.php`, `app/Models/ContentPlannerRead.php`, `app/Services/Content/ContentInbox.php`, `app/Http/Controllers/Api/V1/Admin/Content/InboxController.php`
- Modify: `app/Models/ContentPlannerPostEvent.php`, `app/Models/ContentPlannerPostComment.php` (`post()`), `routes/api.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: create `tests/Feature/Content/InboxTest.php`

**Interfaces:**
- Consumes: `ContentPlannerPostEvent`, `ContentApproval::isOn` (Task 2); `ContentPlannerPostComment` (Task 3); the approve and send-back endpoints (Task 4, used by the test); `ContentAccess::canManage`; `ContentContext::profile`.
- Produces:
  - Table `content_planner_reads` (`id`, `organization_id`, `brand_id`, `user_id` FK users cascade, `planner_profile_id` FK cascade, `seen_at`; unique (`user_id`, `planner_profile_id`)); model `ContentPlannerRead` (no timestamps; `seen_at` datetime).
  - `ContentPlannerPostEvent::post()` and `ContentPlannerPostComment::post()` (belong to `ContentPlannerPost`).
  - `ContentInbox::LIMIT = 50`, `LOOKBACK_DAYS = 30`, `NOTE_LENGTH = 200`; `ContentInbox::for(User, ?ContentPlannerProfile): array{items, count, read_at}`; `ContentInbox::count(User, ?ContentPlannerProfile): int`; `ContentInbox::markSeen(User, ContentPlannerProfile, ?CarbonImmutable $at): void`.
  - Items, newest first: `{id: 'waiting:12' | 'event:5' | 'comment:9', kind: 'waiting' | 'approved' | 'sent_back' | 'comment', post: {id, platform, title, hook, topic, scheduled_date}, by: {id, name}|null, note: string|null (the send-back note or the comment, cut to 200 characters + "…"), at, unread: bool}`. `by` is the post's writer for a waiting item, else who acted or commented (null for a removed member).
  - `GET inbox` → `{items, count, read_at}`; `GET inbox/count` → `{count}`; `POST inbox/seen` (optional `at`: the list's `read_at`) → `{count}`. Seen is per person and brand, never moves back, never ahead of now.

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/InboxTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The "For you" bell (spec 2026-10-16 §8): what waits for a manager, and the news since a person last looked. */
class InboxTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->profile->forceFill(['requires_approval' => true])->save();
    }

    private function comment(ContentPlannerPost $post, ?int $userId, string $body, ?string $at = null): ContentPlannerPostComment
    {
        $comment = ContentPlannerPostComment::create(['post_id' => $post->id, 'brand_id' => $post->brand_id, 'user_id' => $userId, 'body' => $body]);
        if ($at) {
            $comment->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
        }

        return $comment;
    }

    public function test_a_manager_sees_each_post_waiting_for_approval_until_it_is_acted_on(): void
    {
        $this->staffMember->forceFill(['name' => 'Anna'])->save();
        $waiting = $this->makePost(['status' => 'needs_review', 'title' => 'Autumn offer', 'created_by' => $this->staffMember->id]);
        $this->makePost(['status' => 'draft']);

        $this->asManager()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('items.0.kind', 'waiting')
            ->assertJsonPath('items.0.post.id', $waiting->id)
            ->assertJsonPath('items.0.post.title', 'Autumn offer')
            ->assertJsonPath('items.0.by.name', 'Anna')
            ->assertJsonPath('items.0.unread', true);
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 0)->assertJsonPath('items', []);

        // Seen does not clear what waits: it stays, no longer new, until a manager acts on it.
        $this->asManager()->postJson($this->api('inbox/seen'))->assertOk()->assertJsonPath('count', 1);
        $this->asManager()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('items.0.unread', false);

        $this->asManager()->postJson($this->api("posts/{$waiting->id}/approve"), ['updated_at' => $waiting->fresh()->updated_at->toISOString()])->assertOk();
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 0);

        $this->makePost(['status' => 'needs_review']);
        $this->profile->forceFill(['requires_approval' => false])->save();
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 0);
    }

    public function test_the_writer_hears_when_their_post_is_approved_or_sent_back_until_they_have_seen_it(): void
    {
        $approved = $this->makePost(['status' => 'needs_review', 'created_by' => $this->staffMember->id]);
        $sentBack = $this->makePost(['status' => 'needs_review', 'created_by' => $this->staffMember->id, 'scheduled_date' => '2026-10-08']);
        $this->asManager()->postJson($this->api("posts/{$approved->id}/approve"), ['updated_at' => $approved->fresh()->updated_at->toISOString()])->assertOk();
        $this->travel(1)->minutes();
        $this->asManager()->postJson($this->api("posts/{$sentBack->id}/send-back"), ['note' => 'Shorter, please.'])->assertOk();

        $inbox = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 2)->json();
        $this->assertSame(['sent_back', 'approved'], array_column($inbox['items'], 'kind'));
        $this->assertSame('Shorter, please.', $inbox['items'][0]['note']);
        $this->assertSame(['id' => $this->manager->id, 'name' => $this->manager->name], $inbox['items'][0]['by']);
        $this->assertSame($sentBack->id, $inbox['items'][0]['post']['id']);
        $this->assertTrue($inbox['items'][0]['unread']);
        // What a manager did themselves is no news to them.
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 0);

        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => $inbox['read_at']])->assertOk()->assertJsonPath('count', 0);
        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('items', []);
    }

    public function test_comments_by_others_reach_the_writer_and_those_who_commented_before_them(): void
    {
        $colleague = $this->staffUser($this->org, ['role' => 'staff']);
        $post = $this->makePost(['created_by' => $this->staffMember->id]);
        $this->comment($post, $this->manager->id, 'Early word', '2026-10-05 05:00:00');
        $this->comment($post, $colleague->id, 'I agree', '2026-10-05 05:10:00');
        $this->comment($post, $this->manager->id, 'Final word', '2026-10-05 05:20:00');
        // Review Focus 4: someone who has since left.
        $this->comment($post, null, 'From someone who left', '2026-10-05 05:30:00');

        $writer = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 4)->json('items');
        $this->assertSame(['From someone who left', 'Final word', 'I agree', 'Early word'], array_column($writer, 'note'));
        $this->assertSame(['comment'], array_values(array_unique(array_column($writer, 'kind'))));
        $this->assertNull($writer[0]['by']);
        $this->assertSame($post->id, $writer[0]['post']['id']);

        // A colleague hears of the comments after their own first one; the manager, of the others' after theirs.
        $theirs = $this->actingAs($colleague, 'sanctum')->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 2)->json('items');
        $this->assertSame(['From someone who left', 'Final word'], array_column($theirs, 'note'));
        $managers = $this->asManager()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 2)->json('items');
        $this->assertSame(['From someone who left', 'I agree'], array_column($managers, 'note'));
    }

    // Review Focus 5.
    public function test_the_bell_is_per_brand_and_seen_is_per_brand(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        $secondProfile->forceFill(['requires_approval' => true])->save();
        $there = fn (array $attributes) => ContentPlannerPost::create($attributes + ['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'platform' => 'instagram', 'status' => 'draft', 'topic' => 'Second studio']);
        $mineHere = $this->makePost(['created_by' => $this->manager->id]);
        $this->makePost(['status' => 'needs_review']);
        $mineThere = $there(['created_by' => $this->manager->id]);
        $there(['status' => 'needs_review']);
        $there(['status' => 'needs_review']);
        $this->comment($mineHere, $this->staffMember->id, 'On the first brand', '2026-10-05 05:00:00');
        $this->comment($mineThere, $this->staffMember->id, 'On the second brand', '2026-10-05 05:00:00');

        $first = $this->asManager()->getJson($this->api('inbox') . "?brand_id={$this->brandId}")->assertOk()->assertJsonPath('count', 2)->json('items');
        $this->assertEqualsCanonicalizing(['waiting', 'comment'], array_column($first, 'kind'));
        $this->assertSame('On the first brand', collect($first)->firstWhere('kind', 'comment')['note']);
        $other = $this->asManager()->getJson($this->api('inbox') . "?brand_id={$second}")->assertOk()->assertJsonPath('count', 3)->json('items');
        $this->assertSame('On the second brand', collect($other)->firstWhere('kind', 'comment')['note']);

        $this->asManager()->postJson($this->api('inbox/seen') . "?brand_id={$this->brandId}")->assertOk()->assertJsonPath('count', 1);
        $this->asManager()->getJson($this->api('inbox/count') . "?brand_id={$second}")->assertOk()->assertJsonPath('count', 3);
    }

    public function test_seen_takes_the_lists_read_at_never_goes_back_and_never_runs_ahead(): void
    {
        $post = $this->makePost(['created_by' => $this->staffMember->id]);
        $this->comment($post, $this->manager->id, 'First');
        $readAt = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 1)->json('read_at');

        $this->travel(1)->minutes();
        $this->comment($post, $this->manager->id, 'Second, after the list was read');
        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => $readAt])->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => '2026-10-01T00:00:00Z'])->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => '2030-01-01T00:00:00Z'])->assertOk()->assertJsonPath('count', 0);

        $this->travel(1)->minutes();
        $this->comment($post, $this->manager->id, 'Third');
        $this->asStaffMember()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => 'soon'])->assertStatus(422)->assertJsonValidationErrors('at');
    }

    public function test_the_list_keeps_the_newest_50_shortens_long_words_and_leaves_out_news_older_than_30_days(): void
    {
        $post = $this->makePost(['created_by' => $this->staffMember->id]);
        $start = CarbonImmutable::parse('2026-10-04 06:00:00');
        for ($i = 0; $i < 55; $i++) {
            $this->comment($post, $this->manager->id, "Comment {$i}", $start->addMinutes($i)->toDateTimeString());
        }
        $this->comment($post, $this->manager->id, str_repeat('x', 300), '2026-10-05 05:59:00');
        $this->comment($post, $this->manager->id, 'Long ago', '2026-09-04 05:00:00');

        $items = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 56)->json('items');

        $this->assertCount(50, $items);
        $this->assertSame(str_repeat('x', 200) . '…', $items[0]['note']);
        $this->assertSame('Comment 54', $items[1]['note']);
        $this->assertSame('Comment 6', $items[49]['note']);
    }

    public function test_a_brand_without_a_profile_has_an_empty_bell(): void
    {
        [$second] = $this->secondBrand(false);
        $this->asManager()->getJson($this->api('inbox') . "?brand_id={$second}")->assertOk()->assertJsonPath('items', [])->assertJsonPath('count', 0);
        $this->asManager()->getJson($this->api('inbox/count') . "?brand_id={$second}")->assertOk()->assertJsonPath('count', 0);
        $this->asManager()->postJson($this->api('inbox/seen') . "?brand_id={$second}")->assertOk()->assertJsonPath('count', 0);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R5/php.sh" tests/Feature/Content/InboxTest.php
```

Expected: `exit 1` — the inbox routes do not exist (404 where 200 is expected).

- [ ] **Step 3: The reads table, its model, the posts' relations**

Write `database/migrations/2026_10_18_100300_create_content_planner_reads_table.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** When a person last opened a brand's "For you" list (spec 2026-10-16 §8): one row per person and brand profile. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_reads')) {
            return;
        }
        Schema::create('content_planner_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->timestamp('seen_at');
            $table->unique(['user_id', 'planner_profile_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_reads');
    }
};
```

Write `app/Models/ContentPlannerRead.php` with the Write tool:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/** When a person last opened a brand's "For you" list (spec 2026-10-16 §8); news after `seen_at` is new. */
class ContentPlannerRead extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public $timestamps = false;

    protected $fillable = ['user_id', 'planner_profile_id', 'brand_id', 'seen_at'];

    protected $casts = ['seen_at' => 'datetime'];
}
```

In `tests/Concerns/SetsUpContentSchema.php`, replace:

```php
        if (!Schema::hasTable('content_planner_post_comments')) {
            (require database_path('migrations/2026_10_18_100200_create_content_planner_post_comments_table.php'))->up();
        }
```

with:

```php
        if (!Schema::hasTable('content_planner_post_comments')) {
            (require database_path('migrations/2026_10_18_100200_create_content_planner_post_comments_table.php'))->up();
        }
        if (!Schema::hasTable('content_planner_reads')) {
            (require database_path('migrations/2026_10_18_100300_create_content_planner_reads_table.php'))->up();
        }
```

In `app/Models/ContentPlannerPostEvent.php`, replace:

```php
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
```

with:

```php
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerPost::class, 'post_id');
    }
}
```

In `app/Models/ContentPlannerPostComment.php`, make the same replacement (its `user()` block is the same text):

```php
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerPost::class, 'post_id');
    }
}
```

- [ ] **Step 4: `ContentInbox` and its controller**

Write `app/Services/Content/ContentInbox.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerPostEvent;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerRead;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

/**
 * The "For you" bell (spec 2026-10-16 §8), for one person and the current brand: the posts waiting for approval
 * (managers, while the switch is on; they stay until acted on), and the news since the person last opened the list —
 * "approved" and "sent back" on posts they wrote, comments by others on posts they wrote or commented on. News is at
 * most 30 days old; an item whose author has left stays, with no name.
 */
final class ContentInbox
{
    public const LIMIT = 50;

    public const LOOKBACK_DAYS = 30;

    /** A send-back note or a comment is cut to this in the list; the panel shows it whole. */
    public const NOTE_LENGTH = 200;

    private const WITH = ['post:id,platform,title,hook,topic,scheduled_date', 'user:id,name'];

    /** @return array{items: list<array<string, mixed>>, count: int, read_at: string} */
    public static function for(User $user, ?ContentPlannerProfile $profile): array
    {
        // What "seen" may cover: news that arrives while the list is open stays new.
        $readAt = CarbonImmutable::now()->toISOString();
        if (!$profile) {
            return ['items' => [], 'count' => 0, 'read_at' => $readAt];
        }
        $seenAt = self::seenAt($user, $profile);
        $since = self::since($seenAt);
        $items = [];

        $waiting = self::waiting($user, $profile);
        if ($waiting) {
            foreach ($waiting->with('createdBy:id,name')->orderByDesc('updated_at')->orderByDesc('id')->limit(self::LIMIT)->get() as $post) {
                $at = $post->waiting_since ? CarbonImmutable::parse($post->waiting_since) : CarbonImmutable::instance($post->updated_at);
                $items[] = self::item("waiting:{$post->id}", 'waiting', $post, $post->createdBy, null, $at, $seenAt === null || $at->gt($seenAt));
            }
        }
        foreach (self::approvals($user, $profile, $since)->with(self::WITH)->orderByDesc('created_at')->orderByDesc('id')->limit(self::LIMIT)->get() as $event) {
            $items[] = self::item("event:{$event->id}", (string) $event->kind, $event->post, $event->user, $event->note, CarbonImmutable::instance($event->created_at), true);
        }
        foreach (self::comments($user, $profile, $since)->with(self::WITH)->orderByDesc('created_at')->orderByDesc('id')->limit(self::LIMIT)->get() as $comment) {
            $items[] = self::item("comment:{$comment->id}", 'comment', $comment->post, $comment->user, $comment->body, CarbonImmutable::instance($comment->created_at), true);
        }
        // Newest first; usort keeps the order above for items of the same second.
        usort($items, fn (array $a, array $b) => $b['at'] <=> $a['at']);

        return ['items' => array_slice($items, 0, self::LIMIT), 'count' => self::count($user, $profile), 'read_at' => $readAt];
    }

    /** Everything waiting, and the news not yet seen. */
    public static function count(User $user, ?ContentPlannerProfile $profile): int
    {
        if (!$profile) {
            return 0;
        }
        $since = self::since(self::seenAt($user, $profile));

        return (self::waiting($user, $profile)?->count() ?? 0)
            + self::approvals($user, $profile, $since)->count()
            + self::comments($user, $profile, $since)->count();
    }

    /** Marks the news up to `$at` (the list's `read_at`; now when none) as seen: never back, never ahead of now. */
    public static function markSeen(User $user, ContentPlannerProfile $profile, ?CarbonImmutable $at): void
    {
        $now = CarbonImmutable::now();
        $at = $at === null || $at->gt($now) ? $now : $at;
        $read = ContentPlannerRead::firstOrNew(['user_id' => $user->id, 'planner_profile_id' => $profile->id]);
        if ($read->seen_at !== null && $read->seen_at->gte($at)) {
            return;
        }
        $read->fill(['brand_id' => $profile->brand_id, 'seen_at' => $at])->save();
    }

    /** The posts waiting for approval, for a manager while the brand's switch is on; null for everyone else. */
    private static function waiting(User $user, ContentPlannerProfile $profile): ?Builder
    {
        if (!ContentApproval::isOn($profile) || !ContentAccess::canManage($user)) {
            return null;
        }

        return ContentPlannerPost::query()->where('planner_profile_id', $profile->id)->where('status', 'needs_review')
            ->addSelect(['waiting_since' => ContentPlannerPostEvent::select('created_at')
                ->whereColumn('post_id', 'content_planner_posts.id')
                ->whereIn('kind', ['sent_for_approval', 'changed_after_approval'])
                ->orderByDesc('id')->limit(1)]);
    }

    /** "Approved" and "sent back" by someone else on the posts the person wrote. */
    private static function approvals(User $user, ContentPlannerProfile $profile, CarbonImmutable $since): Builder
    {
        return ContentPlannerPostEvent::query()->whereIn('kind', ['approved', 'sent_back'])
            ->where('created_at', '>', $since)
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $user->id))
            ->whereIn('post_id', ContentPlannerPost::select('id')->where('planner_profile_id', $profile->id)->where('created_by', $user->id));
    }

    /** Comments by others on the posts the person wrote, and — on anyone else's post — after the person's own first one. */
    private static function comments(User $user, ContentPlannerProfile $profile, CarbonImmutable $since): Builder
    {
        return ContentPlannerPostComment::query()
            ->where('created_at', '>', $since)
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $user->id))
            ->whereIn('post_id', ContentPlannerPost::select('id')->where('planner_profile_id', $profile->id))
            ->where(fn ($q) => $q
                ->whereIn('post_id', ContentPlannerPost::select('id')->where('created_by', $user->id))
                ->orWhereExists(fn ($mine) => $mine->selectRaw('1')->from('content_planner_post_comments as mine')
                    ->whereColumn('mine.post_id', 'content_planner_post_comments.post_id')
                    ->where('mine.user_id', $user->id)
                    ->whereColumn('mine.created_at', '<', 'content_planner_post_comments.created_at')));
    }

    private static function seenAt(User $user, ContentPlannerProfile $profile): ?CarbonImmutable
    {
        $seen = ContentPlannerRead::where('user_id', $user->id)->where('planner_profile_id', $profile->id)->value('seen_at');

        return $seen ? CarbonImmutable::parse($seen) : null;
    }

    /** News counts from the later of the person's last look and 30 days ago. */
    private static function since(?CarbonImmutable $seenAt): CarbonImmutable
    {
        $floor = CarbonImmutable::now()->subDays(self::LOOKBACK_DAYS);

        return $seenAt !== null && $seenAt->gt($floor) ? $seenAt : $floor;
    }

    /** @return array<string, mixed> */
    private static function item(string $id, string $kind, ?ContentPlannerPost $post, ?User $by, ?string $note, CarbonImmutable $at, bool $unread): array
    {
        return [
            'id'     => $id,
            'kind'   => $kind,
            'post'   => $post ? [
                'id'             => (int) $post->id,
                'platform'       => (string) $post->platform,
                'title'          => $post->title,
                'hook'           => $post->hook,
                'topic'          => $post->topic,
                'scheduled_date' => $post->scheduled_date?->format('Y-m-d'),
            ] : null,
            'by'     => $by ? ['id' => (int) $by->id, 'name' => (string) $by->name] : null,
            'note'   => $note === null ? null : Str::limit($note, self::NOTE_LENGTH, '…'),
            'at'     => $at->toISOString(),
            'unread' => $unread,
        ];
    }
}
```

Write `app/Http/Controllers/Api/V1/Admin/Content/InboxController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentInbox;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The "For you" bell (spec 2026-10-16 §8): the list, its count, and "seen" — for the current brand. */
class InboxController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(ContentInbox::for($request->user(), ContentContext::profile()));
    }

    public function count(Request $request): JsonResponse
    {
        return response()->json(['count' => ContentInbox::count($request->user(), ContentContext::profile())]);
    }

    /** `at` is the list's `read_at`: what came in after the list was read stays new. */
    public function seen(Request $request): JsonResponse
    {
        $data = $request->validate(['at' => 'nullable|date']);
        $profile = ContentContext::profile();
        if ($profile) {
            $at = isset($data['at']) ? CarbonImmutable::parse($data['at'])->setTimezone(config('app.timezone')) : null;
            ContentInbox::markSeen($request->user(), $profile, $at);
        }

        return response()->json(['count' => ContentInbox::count($request->user(), $profile)]);
    }
}
```

In `routes/api.php`, replace:

```php
                Route::get('ideas', [\App\Http\Controllers\Api\V1\Admin\Content\IdeasController::class, 'show']);
```

with:

```php
                Route::get('ideas', [\App\Http\Controllers\Api\V1\Admin\Content\IdeasController::class, 'show']);
                Route::get('inbox', [\App\Http\Controllers\Api\V1\Admin\Content\InboxController::class, 'index']);
                Route::get('inbox/count', [\App\Http\Controllers\Api\V1\Admin\Content\InboxController::class, 'count']);
                Route::post('inbox/seen', [\App\Http\Controllers\Api\V1\Admin\Content\InboxController::class, 'seen']);
```

- [ ] **Step 5: Run the test, then the Content folders**

```bash
"$R5/php.sh" tests/Feature/Content/InboxTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `InboxTest | Tests:    7 passed`; both folders `exit 0` (Feature Content 192, Unit Content 71).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_18_100300_create_content_planner_reads_table.php app/Models/ContentPlannerRead.php app/Models/ContentPlannerPostEvent.php app/Models/ContentPlannerPostComment.php app/Services/Content/ContentInbox.php app/Http/Controllers/Api/V1/Admin/Content/InboxController.php routes/api.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/InboxTest.php && git commit -q -m "Content: the For you inbox (waiting approvals, approval news, comments) per brand" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 7: The runbook and the regression run

**Files:**
- Modify: `docs/content-workspace.md`

- [ ] **Step 1: The runbook**

In `docs/content-workspace.md`:

1. Replace:

```markdown
  `generation_failed`, `already_repeating`, `no_day` and `too_many_snippets`.
```

with:

```markdown
  `generation_failed`, `already_repeating`, `no_day`, `too_many_snippets`, and from release 4b `needs_approval`,
  `approvals_off`, `wrong_status` and `not_yours`.
```

2. Replace:

```markdown
| Snippets | `brand/snippets` `POST`, `PUT/DELETE brand/snippets/{id}`, `POST brand/snippets/suggest` (AI) | managers (everyone reads them in `GET brand`) |
```

with:

```markdown
| Snippets | `brand/snippets` `POST`, `PUT/DELETE brand/snippets/{id}`, `POST brand/snippets/suggest` (AI) | managers (everyone reads them in `GET brand`) |
| Approvals | `POST posts/{id}/send-for-approval` (everyone); `POST posts/{id}/approve` (with the `updated_at` read), `POST posts/{id}/send-back` (`note`) (managers); only while the brand's switch (`requires_approval`) is on | |
| Comments | `POST posts/{id}/comments`; `PUT comments/{id}` (your own); `DELETE comments/{id}` (your own, or any as a manager) | everyone |
| For you | `GET inbox`, `GET inbox/count`, `POST inbox/seen` (`at`: the list's `read_at`) | everyone |
```

3. Replace:

```markdown
- **The strategy job** counts its AI use for its brand and stores a fixed sentence when it fails (`StrategyTest`).
```

with:

```markdown
- **The strategy job** counts its AI use for its brand and stores a fixed sentence when it fails (`StrategyTest`).
- **Approvals** (release 4b; per brand, default off; `ContentApproval`): while on, staff cannot set Approved, Ready or
  Published by any write — save, new post, Mark ready, Mark published — and get 403 `needs_approval` with nothing of
  the save kept; a staff change to the words (topic, hook, text, call to action, hashtags, platform) of an approved or
  ready post sends it back to review, moving its day or time does not; repeat copies the AI rewords wait for approval;
  Approve refuses a post changed since the manager read it (`changed_elsewhere`). Every step is a row in
  `content_planner_post_events` (`ApprovalRuleTest`, `ApprovalActionsTest`).
- **Comments** are plain text of 1–2,000 characters and do not touch their post (no stale saves, "sent back" stays);
  a post's timeline is its comments and approval steps, the newest 200, oldest first; a removed member's comments and
  steps stay with no name (`CommentsTest`, `PostReviewTest`).
- **The bell** is per brand: the posts waiting for approval (managers, while the switch is on; they stay until acted
  on), then the news since `seen_at` in `content_planner_reads` — approved and sent back on your posts, comments by
  others on posts you wrote or commented on (after your own first comment) — at most 30 days old, the newest 50.
  "Seen" takes the list's `read_at`, so news that came in while the list was open stays new (`InboxTest`).
```

4. Replace:

```markdown
No approvals yet (release 4b), no publishing to social networks,
```

with:

```markdown
No email notices, mentions or attachments (approvals, comments and the bell live in the app), no publishing to social networks,
```

5. Replace:

```markdown
  one idea with I and schedule it, add one template and use it from a day's "+"; reload admin tabs left open.
```

with:

```markdown
  one idea with I and schedule it, add one template and use it from a day's "+"; reload admin tabs left open.
- Release 4b (server, Plan 4B-1): four additive migrations (`content_planner_profiles.requires_approval`,
  `content_planner_post_events`, `content_planner_post_comments`, `content_planner_reads`). The switch starts off for
  every brand, so nothing changes for anyone until a manager turns it on.
- Verify release 4b by content (after Plan 4B-2's deploy): `/api/v1/admin/content/inbox/count` answers 401 when signed
  out (404 before release 4b).
```

- [ ] **Step 2: The regression run**

```bash
cd /c/wamp64/www/Hexa-Tech-content && "$R5/php.sh" tests/Feature/Content/ tests/Unit/Content/ tests/Feature/ContentCalendar/ tests/Feature/AdminAccess/ tests/Unit/Support/ | tee "$R5/final-php.txt"
```

Expected: five lines, each `exit 0` (Feature Content = 161 at release 4a + 31 from this plan = 192; Unit Content 71; ContentCalendar 12; AdminAccess 51; Unit Support 177).

- [ ] **Step 3: Commit and ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -m "Runbook: release 4b's server (approvals, comments, the For you inbox)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && echo "Task 7: note: regression $(grep -c 'exit 0' "$R5/final-php.txt")/5 paths green (final-php.txt)" >> "$R5/progress.md"
```
