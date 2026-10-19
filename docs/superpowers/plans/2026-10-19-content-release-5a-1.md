# HexaTech Content — Release 5a, Plan 1: the Server for Versions, Who Posts It, Reminders and the Morning Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server half of release 5a "post it" (spec §3, §4, §7.1–§7.2 for 5a): versions per platform with background AI adapting, who posts a post and the brand's team, reminders in the "For you" bell, the poster's right to mark an approved post published, and the opt-in morning email.

**Architecture:**
- **Versions:** posts gain `group_id` (the original's id, as `series_id` links a repeat). `ContentVersions` makes, unlinks and describes groups; `VersionController` serves `POST posts/{id}/versions` and `DELETE posts/{id}/group`. Adapting by AI runs in `AdaptPostVersions`, one version per run like `RewriteRepeatCopies`, through a non-final `ContentVersionAdapter`. The platform rules move out of `ContentPostGenerationService` into `ContentPlatformRules`, word for word, for both.
- **Who posts it:** posts gain `poster_id`. `ContentTeam` says who is on a brand's team (active staff who can use the brand) for `GET team`, for the check on every write, and for the panel's `poster`. `ContentApproval::guardPublish` lets a post's own poster mark it published once it is approved or ready.
- **Reminders:** `ContentReminders` builds "to post today" and "not marked as posted" from the posts themselves; `ContentInbox` adds them to the bell's list and count. The morning email reuses them: `content:send-morning-email` runs hourly, `ContentMorningDigest` writes the words in the person's language, `ContentMorningEmail` is queued. Two additive migrations. Plan 5A-2 builds the portal on these endpoints, runs the release checks and deploys; nothing is deployed by this plan.

**Tech Stack:** Laravel 13 on PHP 8.4.20 (tests on SQLite in memory with foreign keys on, production PostgreSQL), PHPUnit through `artisan test`.

**Spec:** `docs/superpowers/specs/2026-10-19-content-release-5-design.md` (approved 2026-10-19), §3, §4, §7 (5a), §8, §9. Earlier specs, still binding: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`, `2026-10-15-content-release-3-design.md`, `2026-10-16-content-release-4-design.md`.

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `f6c80e93f` (the spec). Production is release 4b: prod main `2fe1d4dba` = the source of `29fd2c38b` + a build (feature tip then `8a05dade1`). Release 4b's ledgers and tools: `.superpowers/sdd/archive/2026-10-18-content-release-4b-1/` and `…-4b-2/`.

**The spec's "checked while planning" (§9), resolved for 5a:**
- **Visual brief copies:** a brief belongs to one post (`content_planner_visual_briefs.post_id`, unique, cascade on delete) and Content never deletes a picture file (`MediaService::putRaw` writes; nothing in Content calls a delete). A version gets a new brief row pointing at the same `image_url`; deleting either post removes only its own row. Safe.
- **Email links switch the brand:** the portal reads `?brand_id=` on first load (`frontend/src/content/lib/brand.ts` `firstBrand`), so a link is `{APP_URL}/content/posts/{id}?brand_id={brand}` and `PostLink` opens it.
- **"Change of words":** `ContentApproval::WORDS` is `topic, hook, main_copy, cta, hashtags, platform`; `poster_id` is not among them, so a poster change keeps an approved post approved (pinned by a test in Task 3). The Link (5b) is Plan 5B-1's.
- **Bio page language (5b):** the brand's Content language is `content_planner_profiles.default_language`; for Plan 5B-1.

**Design calls beyond the spec** (each pinned by a test or a comment):
- The schedule call is `POST posts/{id}/move` (the spec wrote `PUT`); it accepts `poster_id`.
- The adapter's signature is `adapt(ContentPlannerPost $version, string $from)`: the version already holds the original's words and its own platform; `$from` is the original's platform.
- `group` also carries `kept_reason` (`budget` | `ai_failed`): the AI may also fail, and the panel says which. A kept version a person has since edited is no longer listed.
- Joining or leaving a group does not change a post's `updated_at` (written with `toBase()->update()`), so a panel open on it can still save.
- Repeat copies and duplicates keep `poster_id` (the same post on another day is posted by the same person); duplicates still leave the group.
- Cards carry the stored `poster_id`; the panel's `poster` is the effective one (`null` for someone who left or was switched off).
- The morning email goes when the person has posts today **or** posts not marked as posted; it skips organisations with Content switched off or on an Appointments-only plan.
- `poster_id`'s foreign key (users, null on delete) is added on PostgreSQL only: SQLite cannot add one to an existing table without a rebuild. Behaviour is the same either way: an id that matches no active staff member counts as nobody.
- The email is inline-styled HTML like the loyalty digest (emails are not pages under the landing CSP rule); its words live in `lang/{en,ru,de,fr,es}/content_morning.php` and match the portal's status and platform words.

## Global Constraints

- **Branch:** never push the feature branch; never commit built `frontend/dist`, `public/spa` or `resources/spa-shell`. This plan pushes nothing and changes no frontend file.
- **Ledger and tools:** `.superpowers/sdd/2026-10-19-content-release-5a-1/`, called `$R5` below (absolute: `/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1`). Shell state does not survive between tool calls: start every command that uses it with `R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1`. Task 1, Step 1 sets it up with `php.sh` (each PHP path alone, honest exit code) and `extract.mjs` (copies a plan code block into a file: `node $R5/extract.mjs $R5/task-N-brief.md "<line naming the file>" <path>`) from 4B-2's archive.
- **PHP commands:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by path, in the foreground, through `$R5/php.sh <paths…>`. Never a bare `php artisan test`. Any `artisan tinker` call gets `< /dev/null`.
- **Migrations:** additive, SQLite-safe, guarded with `Schema::hasColumn` like `database/migrations/2026_05_12_210000_*.php` (the loyalty digest's columns). Tests build the tables by requiring the real migrations in `tests/Concerns/SetsUpContentSchema.php`: each new migration gets its own guarded `require … ->up()` line there.
- **Tenancy:** posts are organisation- and brand-scoped (`BelongsToOrganization`, `BelongsToBrand`); `Staff` is organisation-scoped. Code outside a request (the job, the command) binds `current_organization_id` and `current_brand_id` for its run and restores them, as `RewriteRepeatCopies` does. Another brand's post never exists here (404 `not_found`).
- **Who is a manager:** `ContentAccess::canManage($user)` (`AccessMap::MANAGER_ROLES`, active staff row).
- **Venue time:** `VenueClock::now($orgId)` (the venue's wall clock, labelled UTC, compared with stored digits), `VenueClock::today($orgId)`, `VenueClock::zone($orgId)` — the clock Content's "today" already uses.
- **Refusals:** `ContentRefused($code, $sentence, $status)`; validation through Laravel's validator (422 with `errors`). Code added by this plan: `version_exists` (409, "This post already has a version for that platform."); `ai_budget_used_up`, `needs_approval`, `not_found`, `changed_elsewhere` as today.
- **AI:** every new AI service is non-final and mocked in feature tests (`AiClient` and `ContextBuilder` are final). Its pure parts are static and unit-tested with PHPUnit's own `TestCase`.
- **No facade mocks** (`Cache::shouldReceive`, `Queue::shouldReceive` …): they have broken full runs before. `Mail::fake()` is a fake, not a mock, and is fine. The test queue is `sync`.
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace — write code holding backslashes (PHP namespaces!) with the Write or Edit tool or `extract.mjs`, never through a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A post with no day gets versions:** the versions have no day and no time either, and land among the ideas.
   - Pinned by Task 1's `test_a_duplicate_is_not_in_the_group_the_lists_carry_the_group_size_and_a_post_without_a_day_gives_versions_without_one`.
2. **A panel open while its post joins or leaves a group:** a save sent with the `updated_at` read before the join or the unlink is not refused as `changed_elsewhere`.
   - Pinned by Task 1's `test_unlink_and_delete_leave_the_others_grouped_and_an_open_panel_can_still_save`.
3. **The venue's day is not UTC's:** for a venue ahead of UTC across midnight, "today" in the bell is the venue's, and the item's moment is the venue's midnight.
   - Pinned by Task 4's `test_today_is_the_venues_today`.
4. **A poster who left or was switched off:** their posts remind the managers (bell and email), the panel shows nobody, and re-saving the form with their id is not refused.
   - Pinned by Task 3's `test_someone_who_left_or_was_switched_off_counts_as_nobody_and_their_post_still_saves` and Task 4's `test_a_post_nobody_posts_and_one_whose_poster_left_remind_the_managers_only`.
5. **Once a day on the venue's calendar:** the stamp is stored in UTC; the next send is allowed on the venue's next day, not refused for being on the same UTC date, and a second run in the same hour sends nothing.
   - Pinned by Task 6's `test_at_eight_on_the_venues_clock_the_poster_gets_todays_posts_with_links_once_a_day`.

---

## File map

- **Task 1 (versions: the group):** migration `database/migrations/2026_10_19_100000_add_group_and_poster_to_content_planner_posts.php`; new `app/Services/Content/ContentVersions.php`, new `app/Http/Controllers/Api/V1/Admin/Content/VersionController.php`; `app/Models/ContentPlannerPost.php`, `app/Services/Content/ContentPostPresenter.php`, `app/Http/Controllers/Api/V1/Admin/Content/PostController.php` (duplicate), `routes/api.php`, `tests/Concerns/SetsUpContentSchema.php`; tests new `tests/Feature/Content/VersionsTest.php`.
- **Task 2 (versions: AI adapting):** new `app/Services/Content/ContentPlatformRules.php`, new `app/Services/Content/ContentVersionAdapter.php`, new `app/Jobs/AdaptPostVersions.php`; `app/Services/ContentPostGenerationService.php`, `app/Services/Content/ContentVersions.php`, `VersionController.php`; tests new `tests/Unit/Content/ContentVersionAdapterTest.php`, new `tests/Feature/Content/VersionsAdaptTest.php`.
- **Task 3 (who posts it):** new `app/Services/Content/ContentTeam.php`, new `app/Http/Controllers/Api/V1/Admin/Content/TeamController.php`; `app/Services/Content/ContentRules.php`, `PostController.php`, `app/Services/Content/ContentApproval.php`, `ContentPostPresenter.php`, `app/Services/Content/ContentRepeat.php`, `routes/api.php`; tests new `tests/Feature/Content/PosterTest.php`.
- **Task 4 (reminders in the bell):** new `app/Services/Content/ContentReminders.php`; `app/Services/Content/ContentInbox.php`; tests new `tests/Feature/Content/RemindersTest.php`.
- **Task 5 (the morning email switch):** migration `database/migrations/2026_10_19_100100_add_content_morning_email_to_users.php`; new `app/Http/Controllers/Api/V1/Admin/Content/MorningEmailController.php`; `app/Models/User.php`, `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`, `app/Http/Controllers/Api/V1/Admin/MeController.php`, `routes/api.php`, `SetsUpContentSchema.php`; tests new `tests/Feature/Content/MorningEmailSwitchTest.php`.
- **Task 6 (the morning email):** new `app/Services/Content/ContentMorningDigest.php`, new `app/Mail/ContentMorningEmail.php`, new `resources/views/emails/content-morning.blade.php`, new `lang/{en,ru,de,fr,es}/content_morning.php`, new `app/Console/Commands/SendContentMorningEmail.php`; `routes/console.php`; tests new `tests/Feature/Content/MorningEmailTest.php`, new `tests/Unit/Content/MorningEmailWordsTest.php`.
- **Task 7 (runbook and regression):** `docs/content-workspace.md`.

---

### Task 1: Versions — the group, making and unlinking

**Files:**
- Create: `database/migrations/2026_10_19_100000_add_group_and_poster_to_content_planner_posts.php`, `app/Services/Content/ContentVersions.php`, `app/Http/Controllers/Api/V1/Admin/Content/VersionController.php`
- Modify: `app/Models/ContentPlannerPost.php`, `app/Services/Content/ContentPostPresenter.php`, `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, `routes/api.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: create `tests/Feature/Content/VersionsTest.php`

**Interfaces:**
- Produces: columns `content_planner_posts.group_id` and `poster_id` (both nullable, indexed; fillable). `ContentVersions::COPIED` (list of copied fields, `poster_id` included); `ContentVersions::platformsOf(ContentPlannerPost $post): list<string>`; `ContentVersions::make(ContentPlannerPost $original, list<string> $platforms, int $userId): Collection<int, ContentPlannerPost>` (throws `version_exists`); `ContentVersions::unlink(ContentPlannerPost $post): void`; `ContentVersions::describe(ContentPlannerPost $post): ?array{id:int, posts:list<array{id,platform,status,scheduled_date,scheduled_time}>, adapting:list<int>, kept_original:list<int>, kept_reason:?string}` (Task 2 fills the last three). `POST posts/{id}/versions` (`platforms` 1–7, `ai` boolean — ignored until Task 2) → 201 `{post, versions:[card]}`; `DELETE posts/{id}/group` → `{post}`. Cards gain `group_size` (int, 0 below 2); details gain `group`. The `withReview` scope reads `group_size` in the list's own query.

- [ ] **Step 1: Set up the ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R5=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-19-content-release-5a-1.md)
cp .superpowers/sdd/archive/2026-10-18-content-release-4b-2/php.sh .superpowers/sdd/archive/2026-10-18-content-release-4b-2/extract.mjs "$R5/"
chmod +x "$R5/php.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-19-content-release-5a-1.md" > "$R5/progress.md"
echo "$R5"; ls "$R5"; grep -n "^cd " "$R5/php.sh"
```

Expected: `$R5` ends in `.superpowers/sdd/2026-10-19-content-release-5a-1`; the listing shows `extract.mjs php.sh plan-path progress.md`; `php.sh` runs in `/c/wamp64/www/Hexa-Tech-content`.

- [ ] **Step 2: Write the failing test**

Write `tests/Feature/Content/VersionsTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Versions per platform (spec 2026-10-19 §3): linked sibling posts, each an ordinary post. Today is Monday 5 October 2026. */
class VersionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_making_versions_copies_the_post_as_drafts_for_each_platform_in_one_group(): void
    {
        $post = $this->makePost([
            'status' => 'approved', 'scheduled_date' => '2026-10-07', 'scheduled_time' => '18:00', 'title' => 'Autumn offer',
            'hook' => 'Three colours for October', 'main_copy' => 'Warm tones.', 'cta' => 'Book now', 'hashtags' => ['#autumn'],
            'language' => 'en', 'generated_by' => 'manual', 'created_by' => $this->manager->id,
        ]);
        $seen = $post->updated_at->toISOString();

        $answer = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'facebook']])
            ->assertCreated()
            ->assertJsonCount(2, 'versions')
            ->assertJsonPath('versions.0.platform', 'linkedin')
            ->assertJsonPath('versions.1.platform', 'facebook')
            ->assertJsonPath('versions.0.status', 'draft')
            ->assertJsonPath('versions.0.scheduled_date', '2026-10-07')
            ->assertJsonPath('versions.0.scheduled_time', '18:00')
            ->assertJsonPath('versions.0.group_size', 3)
            ->assertJsonPath('post.group_size', 3)
            ->assertJsonPath('post.group.id', $post->id)
            ->assertJsonPath('post.group.posts.0.id', $post->id)
            ->assertJsonPath('post.group.posts.1.platform', 'linkedin')
            ->assertJsonPath('post.group.posts.1.status', 'draft');

        $version = ContentPlannerPost::findOrFail($answer->json('versions.0.id'));
        $this->assertSame('Autumn offer', $version->title);
        $this->assertSame('Three colours for October', $version->hook);
        $this->assertSame('Warm tones.', $version->main_copy);
        $this->assertSame('Book now', $version->cta);
        $this->assertSame(['#autumn'], $version->hashtags);
        $this->assertSame('version', $version->generated_by);
        $this->assertSame($this->staffMember->id, (int) $version->created_by);
        $this->assertSame($post->id, (int) $version->group_id);
        $this->assertSame($post->id, (int) $post->fresh()->group_id);
        $this->assertSame('approved', $post->fresh()->status, 'the original keeps its status');
        $this->assertSame($seen, $post->fresh()->updated_at->toISOString(), 'joining a group is not an edit');
    }

    public function test_a_version_gets_its_own_copy_of_the_picture_and_none_of_the_published_details_or_the_series(): void
    {
        $post = $this->makePost(['status' => 'published', 'published_url' => 'https://instagram.com/p/1', 'published_at' => now()]);
        $post->forceFill(['series_id' => $post->id])->save();
        ContentPlannerVisualBrief::create(['post_id' => $post->id, 'description' => 'A warm still life', 'image_url' => 'https://cdn.example.test/a.png', 'image_status' => 'ready']);

        $id = $this->asManager()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])
            ->assertCreated()
            ->assertJsonPath('versions.0.image_url', 'https://cdn.example.test/a.png')
            ->json('versions.0.id');

        $version = ContentPlannerPost::findOrFail($id);
        $this->assertSame('draft', $version->status);
        $this->assertNull($version->published_url);
        $this->assertNull($version->published_at);
        $this->assertNull($version->series_id);
        $brief = ContentPlannerVisualBrief::where('post_id', $id)->firstOrFail();
        $this->assertSame('A warm still life', $brief->description);
        // A change to one brief is that post's alone.
        $brief->update(['description' => 'Changed']);
        $this->assertSame('A warm still life', ContentPlannerVisualBrief::where('post_id', $post->id)->value('description'));
    }

    public function test_a_platform_already_in_the_group_is_refused_and_nothing_of_the_call_is_made(): void
    {
        $post = $this->makePost();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['instagram']])
            ->assertStatus(409)->assertJsonPath('error', 'version_exists');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['facebook', 'linkedin']])
            ->assertStatus(409)->assertJsonPath('error', 'version_exists');
        $this->assertSame(2, ContentPlannerPost::where('group_id', $post->id)->count(), 'nothing of a refused call is made');

        // Made from a version, a new one joins the same group.
        $version = ContentPlannerPost::where('group_id', $post->id)->where('id', '!=', $post->id)->firstOrFail();
        $this->asStaffMember()->postJson($this->api("posts/{$version->id}/versions"), ['platforms' => ['instagram']])
            ->assertStatus(409)->assertJsonPath('error', 'version_exists');
        $this->asStaffMember()->postJson($this->api("posts/{$version->id}/versions"), ['platforms' => ['x']])
            ->assertCreated()->assertJsonPath('post.group.id', $post->id)->assertJsonPath('versions.0.group_size', 3);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => []])->assertStatus(422)->assertJsonValidationErrors('platforms');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['myspace']])->assertStatus(422)->assertJsonValidationErrors('platforms.0');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['tiktok', 'tiktok']])->assertStatus(422);

        $other = $this->otherOrganization();
        $this->asStaffMember()->postJson($this->api("posts/{$other['post']->id}/versions"), ['platforms' => ['linkedin']])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    public function test_unlink_and_delete_leave_the_others_grouped_and_an_open_panel_can_still_save(): void
    {
        $post = $this->makePost();
        [$linkedin, $facebook] = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'facebook']])
            ->json('versions.*.id');
        $seen = ContentPlannerPost::findOrFail($linkedin)->updated_at->toISOString();

        $this->asStaffMember()->deleteJson($this->api("posts/{$linkedin}/group"))->assertOk()
            ->assertJsonPath('post.group', null)->assertJsonPath('post.group_size', 0);
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.group_size', 2)->assertJsonCount(2, 'post.group.posts');
        // Leaving a group is not an edit: the panel's version still saves.
        $this->asStaffMember()->putJson($this->api("posts/{$linkedin}"), ['updated_at' => $seen, 'hook' => 'Mine'])->assertOk();

        // Deleting the original leaves the others grouped under its id.
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['x']])->assertCreated();
        $this->asStaffMember()->deleteJson($this->api("posts/{$post->id}"))->assertOk();
        $this->asStaffMember()->getJson($this->api("posts/{$facebook}"))->assertJsonPath('post.group_size', 2)->assertJsonPath('post.group.id', $post->id);

        // The last one left is no longer in a group; unlinking a post in none changes nothing.
        $this->asStaffMember()->deleteJson($this->api("posts/{$facebook}/group"))->assertOk()->assertJsonPath('post.group', null);
        $x = ContentPlannerPost::where('platform', 'x')->firstOrFail();
        $this->assertNull($x->group_id);
        $this->asStaffMember()->deleteJson($this->api("posts/{$x->id}/group"))->assertOk()->assertJsonPath('post.group', null);
    }

    public function test_a_duplicate_is_not_in_the_group_the_lists_carry_the_group_size_and_a_post_without_a_day_gives_versions_without_one(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()
            ->assertJsonPath('post.group_size', 0)->assertJsonPath('post.group', null);
        $rows = collect($this->asStaffMember()->getJson($this->api('posts?from=2026-10-07&to=2026-10-07'))->assertOk()->json('data'));
        $this->assertSame(['instagram' => 2, 'linkedin' => 2], $rows->pluck('group_size', 'platform')->sortKeys()->all());

        $idea = $this->makePost(['scheduled_date' => null, 'status' => 'idea']);
        $this->asStaffMember()->postJson($this->api("posts/{$idea->id}/versions"), ['platforms' => ['tiktok']])->assertCreated()
            ->assertJsonPath('versions.0.scheduled_date', null)
            ->assertJsonPath('versions.0.scheduled_time', null)
            ->assertJsonPath('versions.0.status', 'draft');
    }
}
```

- [ ] **Step 3: Run it to see it fail**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Feature/Content/VersionsTest.php
```

Expected: `exit 1` — the routes do not exist yet (404 on `posts/{id}/versions`), and `group_id` is not a column.

- [ ] **Step 4: The columns, the group, the endpoints**

Write `database/migrations/2026_10_19_100000_add_group_and_poster_to_content_planner_posts.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Release 5a (spec 2026-10-19 §7.1): a post's versions for other platforms share `group_id` (the original's id, no
 * foreign key, as `series_id`), and `poster_id` names who posts it. Its foreign key (users, null on delete) is added
 * on PostgreSQL; SQLite cannot add one to a table that exists, and an id that matches no active staff member counts
 * as nobody either way.
 */
return new class extends Migration
{
    public function up(): void
    {
        $addPoster = !Schema::hasColumn('content_planner_posts', 'poster_id');
        Schema::table('content_planner_posts', function (Blueprint $table) use ($addPoster) {
            if (!Schema::hasColumn('content_planner_posts', 'group_id')) {
                $table->unsignedBigInteger('group_id')->nullable()->index();
            }
            if ($addPoster) {
                $table->unsignedBigInteger('poster_id')->nullable()->index();
                if (DB::getDriverName() === 'pgsql') {
                    $table->foreign('poster_id')->references('id')->on('users')->nullOnDelete();
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('content_planner_posts', function (Blueprint $table) {
            if (Schema::hasColumn('content_planner_posts', 'poster_id')) {
                if (DB::getDriverName() === 'pgsql') {
                    $table->dropForeign(['poster_id']);
                }
                $table->dropColumn('poster_id');
            }
            if (Schema::hasColumn('content_planner_posts', 'group_id')) {
                $table->dropColumn('group_id');
            }
        });
    }
};
```

In `tests/Concerns/SetsUpContentSchema.php`, replace:

```php
        if (!Schema::hasTable('content_planner_reads')) {
            (require database_path('migrations/2026_10_18_100300_create_content_planner_reads_table.php'))->up();
        }
```

with:

```php
        if (!Schema::hasTable('content_planner_reads')) {
            (require database_path('migrations/2026_10_18_100300_create_content_planner_reads_table.php'))->up();
        }
        if (!Schema::hasColumn('content_planner_posts', 'group_id')) {
            (require database_path('migrations/2026_10_19_100000_add_group_and_poster_to_content_planner_posts.php'))->up();
        }
```

In `app/Models/ContentPlannerPost.php`, replace:

```php
        'series_id',
    ];
```

with:

```php
        'series_id',
        'group_id',
        'poster_id',
    ];
```

replace:

```php
use Illuminate\Database\Eloquent\Relations\HasMany;
```

with:

```php
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
```

and replace:

```php
        return $query->withCount('comments')->addSelect(['last_event_kind' => $latest('kind'), 'last_event_at' => $latest('created_at')]);
```

with:

```php
        return $query->withCount('comments')->addSelect([
            'last_event_kind' => $latest('kind'),
            'last_event_at'   => $latest('created_at'),
            // Spec 2026-10-19 §3.4: how many posts share its group of versions (none for a post in no group).
            'group_size'      => DB::table('content_planner_posts as same_group')->selectRaw('count(*)')
                ->whereColumn('same_group.group_id', 'content_planner_posts.group_id'),
        ]);
```

Write `app/Services/Content/ContentVersions.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Versions per platform (spec 2026-10-19 §3): sibling posts for other platforms, linked by `group_id` (the original's
 * id, as `series_id` links a repeat). Each version is an ordinary post afterwards: its own day, status, approvals and
 * comments. Joining or leaving a group is not an edit: it never changes a post's `updated_at`.
 */
final class ContentVersions
{
    /** What a version takes from its original (§3.1); status, published details, series, comments and events stay behind. */
    public const COPIED = [
        'scheduled_date', 'scheduled_time', 'language', 'topic', 'title', 'goal', 'format', 'hook', 'main_copy', 'short_copy',
        'cta', 'hashtags', 'pillar_id', 'audience_id', 'campaign_id', 'strategy_id', 'weekday_role', 'funnel_stage',
        'post_type', 'strategic_reason', 'poster_id',
    ];

    /** The platforms already in the post's group; its own when it has none. @return list<string> */
    public static function platformsOf(ContentPlannerPost $post): array
    {
        if (!$post->group_id) {
            return [(string) $post->platform];
        }

        return ContentPlannerPost::where('group_id', $post->group_id)->pluck('platform')
            ->map(fn ($platform) => (string) $platform)->unique()->values()->all();
    }

    /**
     * The versions, made in one transaction, as drafts on the original's day and time, each with its own copy of the
     * original's visual brief and picture (Content never deletes a picture file, so two briefs may share one). A
     * platform already in the group refuses the whole call.
     *
     * @param list<string> $platforms
     * @return Collection<int, ContentPlannerPost>
     */
    public static function make(ContentPlannerPost $original, array $platforms, int $userId): Collection
    {
        return DB::transaction(function () use ($original, $platforms, $userId) {
            // Two calls at once for the same platform: the second waits here, then sees the first one's version.
            ContentPlannerPost::whereKey($original->id)->lockForUpdate()->first();
            $original->refresh();
            if (array_intersect($platforms, self::platformsOf($original)) !== []) {
                throw new ContentRefused('version_exists', 'This post already has a version for that platform.', 409);
            }
            $groupId = (int) ($original->group_id ?: $original->id);
            if (!$original->group_id) {
                ContentPlannerPost::whereKey($original->id)->toBase()->update(['group_id' => $groupId]);
            }
            $brief = $original->visualBrief()->first();

            return collect($platforms)->map(function (string $platform) use ($original, $groupId, $userId, $brief) {
                $version = ContentPlannerPost::create($original->only(self::COPIED) + [
                    'planner_profile_id' => $original->planner_profile_id,
                    'brand_id'           => $original->brand_id,
                    'platform'           => $platform,
                    'status'             => 'draft',
                    'group_id'           => $groupId,
                    'generated_by'       => 'version',
                    'created_by'         => $userId,
                ]);
                if ($brief) {
                    $copy = $brief->replicate(['post_id']);
                    $copy->post_id = $version->id;
                    $copy->save();
                }

                return $version;
            });
        });
    }

    /** Takes a post out of its group; the last one left is no longer a group either. */
    public static function unlink(ContentPlannerPost $post): void
    {
        if (!$post->group_id) {
            return;
        }
        $groupId = (int) $post->group_id;
        DB::transaction(function () use ($post, $groupId) {
            ContentPlannerPost::whereKey($post->id)->toBase()->update(['group_id' => null]);
            $left = ContentPlannerPost::where('group_id', $groupId)->pluck('id');
            if ($left->count() === 1) {
                ContentPlannerPost::whereKey($left->first())->toBase()->update(['group_id' => null]);
            }
        });
    }

    /**
     * What the panel shows of a post's group (§3.4): each post in it, oldest first, and which versions the AI is still
     * adapting or did not adapt. A group of one is not shown.
     *
     * @return array{id: int, posts: list<array<string, mixed>>, adapting: list<int>, kept_original: list<int>, kept_reason: ?string}|null
     */
    public static function describe(ContentPlannerPost $post): ?array
    {
        if (!$post->group_id) {
            return null;
        }
        $posts = ContentPlannerPost::where('group_id', $post->group_id)->orderBy('id')
            ->get(['id', 'platform', 'status', 'scheduled_date', 'scheduled_time', 'created_at', 'updated_at']);
        if ($posts->count() < 2) {
            return null;
        }

        return [
            'id'            => (int) $post->group_id,
            'posts'         => $posts->map(fn (ContentPlannerPost $p) => [
                'id'             => (int) $p->id,
                'platform'       => (string) $p->platform,
                'status'         => (string) $p->status,
                'scheduled_date' => $p->scheduled_date?->format('Y-m-d'),
                'scheduled_time' => $p->scheduled_time ? substr((string) $p->scheduled_time, 0, 5) : null,
            ])->values()->all(),
            'adapting'      => [],
            'kept_original' => [],
            'kept_reason'   => null,
        ];
    }
}
```

Write `app/Http/Controllers/Api/V1/Admin/Content/VersionController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRules;
use App\Services\Content\ContentVersions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Versions per platform (spec 2026-10-19 §3): everyone who writes posts makes versions and unlinks them. */
class VersionController extends Controller
{
    public function store(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'platforms'   => 'required|array|min:1|max:' . (count(ContentRules::PLATFORMS) - 1),
            'platforms.*' => ['required', 'string', 'distinct', Rule::in(ContentRules::PLATFORMS)],
            'ai'          => 'sometimes|boolean',
        ]);
        $post = PostController::find($id);
        $versions = ContentVersions::make($post, array_values($data['platforms']), (int) $request->user()->id);

        return response()->json([
            'post'     => ContentPostPresenter::detail($post->fresh(PostController::WITH)),
            'versions' => $versions->map(fn ($version) => ContentPostPresenter::card($version->fresh(PostController::WITH)))->values(),
        ], 201);
    }

    public function destroy(int $id): JsonResponse
    {
        $post = PostController::find($id);
        ContentVersions::unlink($post);

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(PostController::WITH))]);
    }
}
```

In `app/Services/Content/ContentPostPresenter.php`, replace:

```php
            'comments_count' => (int) ($post->comments_count ?? $post->comments()->count()),
            'sent_back'      => self::sentBack($post),
        ];
    }
```

with:

```php
            'comments_count' => (int) ($post->comments_count ?? $post->comments()->count()),
            'sent_back'      => self::sentBack($post),
            // Spec 2026-10-19 §3.4: the posts in its group of versions, from 2 (read in the list's query by withReview()).
            'group_size'     => self::groupSize($post),
        ];
    }

    /** How many posts share its group; 0 for none and for a group of one. */
    private static function groupSize(ContentPlannerPost $post): int
    {
        if (!$post->group_id) {
            return 0;
        }
        $size = array_key_exists('group_size', $post->getAttributes())
            ? (int) $post->getAttribute('group_size')
            : ContentPlannerPost::where('group_id', $post->group_id)->count();

        return $size >= 2 ? $size : 0;
    }
```

and replace:

```php
            'series'            => ContentRepeat::describe($post),
```

with:

```php
            'series'            => ContentRepeat::describe($post),
            // Its versions for other platforms (spec 2026-10-19 §3.4), for the panel's Versions section.
            'group'             => ContentVersions::describe($post),
```

In `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, replace:

```php
        // A copy made by hand is not in the original's repeat series.
        $copy = self::find($id)->replicate(['published_url', 'published_at', 'status', 'series_id']);
```

with:

```php
        // A copy made by hand is not in the original's repeat series, nor in its group of versions.
        $copy = self::find($id)->replicate(['published_url', 'published_at', 'status', 'series_id', 'group_id']);
```

In `routes/api.php`, replace:

```php
                Route::delete('posts/{id}/repeat', [\App\Http\Controllers\Api\V1\Admin\Content\RepeatController::class, 'destroy'])->whereNumber('id');
```

with:

```php
                Route::delete('posts/{id}/repeat', [\App\Http\Controllers\Api\V1\Admin\Content\RepeatController::class, 'destroy'])->whereNumber('id');
                Route::post('posts/{id}/versions', [\App\Http\Controllers\Api\V1\Admin\Content\VersionController::class, 'store'])->whereNumber('id');
                Route::delete('posts/{id}/group', [\App\Http\Controllers\Api\V1\Admin\Content\VersionController::class, 'destroy'])->whereNumber('id');
```

- [ ] **Step 5: Run the test, then the Content folders**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Feature/Content/VersionsTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `VersionsTest | Tests:    5 passed`; both folders `exit 0` (Feature Content 194 + 5 = 199, Unit Content 71).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_19_100000_add_group_and_poster_to_content_planner_posts.php app/Services/Content/ContentVersions.php app/Http/Controllers/Api/V1/Admin/Content/VersionController.php app/Models/ContentPlannerPost.php app/Services/Content/ContentPostPresenter.php app/Http/Controllers/Api/V1/Admin/Content/PostController.php routes/api.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/VersionsTest.php && git commit -q -m "Content: versions per platform — linked sibling posts in one group, made and unlinked" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: Versions — adapted by AI in the background

**Files:**
- Create: `app/Services/Content/ContentPlatformRules.php`, `app/Services/Content/ContentVersionAdapter.php`, `app/Jobs/AdaptPostVersions.php`
- Modify: `app/Services/ContentPostGenerationService.php`, `app/Services/Content/ContentVersions.php`, `app/Http/Controllers/Api/V1/Admin/Content/VersionController.php`
- Test: create `tests/Unit/Content/ContentVersionAdapterTest.php`, `tests/Feature/Content/VersionsAdaptTest.php`

**Interfaces:**
- Consumes: `ContentVersions::make()` and `describe()` (Task 1).
- Produces: `ContentPlatformRules::RULES` (platform → text, plus `default`) and `ContentPlatformRules::for(string $platform): string`. `ContentVersionAdapter::adapt(ContentPlannerPost $version, string $from): array{hook, main_copy, short_copy, cta, hashtags}`; static `prompt(array $post, string $from, string $to, string $context): string` and `words(array $data, array $kept): array`. `AdaptPostVersions(int $groupId, int $organizationId, int $brandId, string $from, list<int> $versionIds)` (`$timeout = 80`). `ContentVersions::adaptingKey(int)`, `keptKey(int)`, `stillAdapting(int $groupId, list<int> $ids): void`, `keep(int $groupId, list<int> $ids, string $reason): void`; `describe()` now fills `adapting`, `kept_original`, `kept_reason`. `POST posts/{id}/versions` with `ai: true` checks the budget first (403 `ai_budget_used_up`, nothing made) and dispatches the job.

- [ ] **Step 1: Write the failing tests**

Write `tests/Unit/Content/ContentVersionAdapterTest.php` with the Write tool:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentPlatformRules;
use App\Services\Content\ContentRules;
use App\Services\Content\ContentVersionAdapter;
use PHPUnit\Framework\TestCase;

/** Adapting a version to its platform (spec 2026-10-19 §3.3): the request and the answer, without the AI. */
class ContentVersionAdapterTest extends TestCase
{
    private const POST = [
        'language' => 'en', 'hook' => 'Three colours for October', 'main_copy' => 'Warm tones, booked in October: 20 % off.',
        'short_copy' => null, 'cta' => 'Book now', 'hashtags' => ['#autumn', '#hair'],
    ];

    public function test_the_request_names_both_platforms_carries_the_targets_rules_the_context_and_every_word(): void
    {
        $prompt = ContentVersionAdapter::prompt(self::POST, 'instagram', 'linkedin', 'A salon in Riga.');

        $this->assertStringContainsString('written for instagram', $prompt);
        $this->assertStringContainsString('native linkedin post', $prompt);
        $this->assertStringContainsString(ContentPlatformRules::for('linkedin'), $prompt);
        $this->assertStringNotContainsString(ContentPlatformRules::for('instagram'), $prompt);
        $this->assertStringContainsString('A salon in Riga.', $prompt);
        $this->assertStringContainsString('language (en)', $prompt);
        foreach (['Three colours for October', 'Warm tones, booked in October: 20 % off.', 'Book now', '#autumn #hair'] as $words) {
            $this->assertStringContainsString($words, $prompt);
        }
    }

    public function test_the_answer_is_cut_to_the_columns_and_what_the_ai_left_out_keeps_the_versions_words(): void
    {
        $words = ContentVersionAdapter::words([
            'hook' => '  ' . str_repeat('h', 600), 'main_copy' => 'Adapted', 'cta' => ['not text'],
            'hashtags' => [' #a ', '', 7, ['x'], ...array_fill(0, 40, '#many')],
        ], self::POST);

        $this->assertSame(500, mb_strlen($words['hook']));
        $this->assertSame('Adapted', $words['main_copy']);
        $this->assertNull($words['short_copy']);
        $this->assertSame('Book now', $words['cta']);
        $this->assertCount(30, $words['hashtags']);
        $this->assertSame(['#a', '7'], array_slice($words['hashtags'], 0, 2));

        $this->assertSame(['#autumn', '#hair'], ContentVersionAdapter::words([], self::POST)['hashtags']);
        $this->assertArrayNotHasKey('language', ContentVersionAdapter::words([], self::POST));
    }

    public function test_every_platform_has_its_own_rules_and_an_unknown_one_gets_the_default(): void
    {
        foreach (ContentRules::PLATFORMS as $platform) {
            $this->assertNotSame(ContentPlatformRules::RULES['default'], ContentPlatformRules::for($platform), $platform);
        }
        $this->assertSame(ContentPlatformRules::RULES['default'], ContentPlatformRules::for('myspace'));
        $this->assertStringContainsString('maximum 280 characters per post', ContentPlatformRules::for('x'));
    }
}
```

Write `tests/Feature/Content/VersionsAdaptTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Jobs\AdaptPostVersions;
use App\Models\ContentPlannerPost;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentVersionAdapter;
use App\Services\Content\ContentVersions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Versions adapted by AI (spec 2026-10-19 §3.3): in the background, one at a time, within the budget, never over a person's words. */
class VersionsAdaptTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function adapter(): \Mockery\MockInterface
    {
        $adapter = Mockery::mock(ContentVersionAdapter::class);
        $this->app->instance(ContentVersionAdapter::class, $adapter);

        return $adapter;
    }

    private function version(ContentPlannerPost $post, string $platform): ContentPlannerPost
    {
        return ContentPlannerPost::where('group_id', $post->id)->where('platform', $platform)->firstOrFail();
    }

    public function test_the_ai_adapts_each_version_from_the_originals_platform_and_leaves_the_original(): void
    {
        $this->adapter()->shouldReceive('adapt')->twice()->andReturnUsing(fn (ContentPlannerPost $version, string $from) => [
            'hook' => "For {$version->platform} from {$from}", 'main_copy' => 'Adapted text', 'short_copy' => null, 'cta' => 'Book', 'hashtags' => ['#a', '#b'],
        ]);
        $post = $this->makePost(['hook' => 'Autumn tips', 'main_copy' => 'Warm tones.']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'x'], 'ai' => true])
            ->assertCreated()
            ->assertJsonPath('versions.0.hook', 'For linkedin from instagram')
            ->assertJsonPath('versions.1.hook', 'For x from instagram')
            ->assertJsonPath('post.group.adapting', [])
            ->assertJsonPath('post.group.kept_original', []);

        $this->assertSame(['#a', '#b'], $this->version($post, 'x')->hashtags);
        $this->assertSame('Adapted text', $this->version($post, 'linkedin')->main_copy);
        $this->assertSame('Autumn tips', $post->fresh()->hook);
        $this->assertFalse(Cache::has(ContentVersions::adaptingKey($post->id)), 'the job ends the adapting');
    }

    public function test_adapting_is_refused_at_the_budget_cap_before_anything_is_made(): void
    {
        $this->setAiCap(100, 120);
        $this->adapter()->shouldNotReceive('adapt');
        $post = $this->makePost();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin'], 'ai' => true])
            ->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->assertNull($post->fresh()->group_id);
        $this->assertSame(1, ContentPlannerPost::count());

        // Copy as is needs no budget.
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();
    }

    public function test_when_the_budget_runs_out_midway_the_rest_keep_the_original_text_and_the_panel_says_so(): void
    {
        $this->adapter()->shouldReceive('adapt')->once()->andReturnUsing(function () {
            $this->setAiCap(100, 120); // this call used the rest of the month's budget

            return ['hook' => 'Adapted', 'main_copy' => 'Adapted text', 'short_copy' => null, 'cta' => null, 'hashtags' => []];
        });
        $post = $this->makePost(['hook' => 'Autumn tips']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'facebook', 'x'], 'ai' => true])->assertCreated();

        [$linkedin, $facebook, $x] = [$this->version($post, 'linkedin'), $this->version($post, 'facebook'), $this->version($post, 'x')];
        $this->assertSame(['Adapted', 'Autumn tips', 'Autumn tips'], [$linkedin->hook, $facebook->hook, $x->hook]);
        $this->asStaffMember()->getJson($this->api("posts/{$x->id}"))->assertOk()
            ->assertJsonPath('post.group.kept_original', [$facebook->id, $x->id])
            ->assertJsonPath('post.group.kept_reason', 'budget');

        // A kept version a person then edits is theirs: nothing more is said about it.
        $this->travel(1)->minutes();
        $this->asStaffMember()->putJson($this->api("posts/{$facebook->id}"), ['updated_at' => $facebook->updated_at->toISOString(), 'hook' => 'My words'])
            ->assertOk()->assertJsonPath('post.group.kept_original', [$x->id]);
    }

    public function test_a_version_saved_while_the_ai_writes_keeps_the_persons_words(): void
    {
        $this->adapter()->shouldReceive('adapt')->once()->andReturnUsing(function (ContentPlannerPost $version) {
            $this->travel(1)->minutes();
            ContentPlannerPost::findOrFail($version->id)->update(['hook' => 'My own words']);

            return ['hook' => 'Adapted', 'main_copy' => 'Adapted text', 'short_copy' => null, 'cta' => null, 'hashtags' => []];
        });
        $post = $this->makePost();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin'], 'ai' => true])->assertCreated();

        $this->assertSame('My own words', $this->version($post, 'linkedin')->hook);
    }

    public function test_a_version_a_person_changed_before_its_turn_keeps_the_persons_words(): void
    {
        $post = $this->makePost(['hook' => 'Autumn tips']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'x']])->assertCreated();
        [$linkedin, $x] = [$this->version($post, 'linkedin'), $this->version($post, 'x')];
        $this->travel(5)->minutes();
        $x->update(['hook' => 'My own words']);
        $adapter = $this->adapter(); // the job hands the rest on to its next run, which takes the adapter from the container
        $adapter->shouldReceive('adapt')->once()->andReturn(['hook' => 'Adapted', 'main_copy' => 'Adapted text', 'short_copy' => null, 'cta' => null, 'hashtags' => []]);

        (new AdaptPostVersions($post->id, (int) $this->org->id, $this->brandId, 'instagram', [(int) $linkedin->id, (int) $x->id]))->handle($adapter, app(ContentAiGate::class));

        $this->assertSame('Adapted', $linkedin->fresh()->hook);
        $this->assertSame('My own words', $x->fresh()->hook);
    }

    public function test_when_the_ai_fails_the_versions_keep_the_original_text_and_the_panel_says_why(): void
    {
        $this->adapter()->shouldReceive('adapt')->once()->andThrow(new \RuntimeException('Overloaded'));
        $post = $this->makePost(['hook' => 'Autumn tips']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'x'], 'ai' => true])
            ->assertCreated()
            ->assertJsonPath('post.group.kept_reason', 'ai_failed')
            ->assertJsonCount(2, 'post.group.kept_original');
        $this->assertSame('Autumn tips', $this->version($post, 'x')->hook);
    }

    // As RepeatTest: a run longer than the queue's retry_after (90 s) is taken again by a second worker.
    public function test_the_panel_lists_the_versions_still_being_adapted_and_each_run_ends_before_the_queue_retries_it(): void
    {
        $post = $this->makePost();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();
        $linkedin = $this->version($post, 'linkedin');
        ContentVersions::stillAdapting($post->id, [(int) $linkedin->id]);

        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.group.adapting', [$linkedin->id]);

        $job = new AdaptPostVersions(1, 1, 1, 'instagram', []);
        foreach (['database', 'redis', 'beanstalkd'] as $connection) {
            $this->assertLessThan((int) config("queue.connections.{$connection}.retry_after"), $job->timeout, $connection);
        }
    }
}
```

- [ ] **Step 2: Run them to see them fail**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Unit/Content/ContentVersionAdapterTest.php tests/Feature/Content/VersionsAdaptTest.php
```

Expected: both `exit 1` — `ContentVersionAdapter`, `ContentPlatformRules` and `AdaptPostVersions` do not exist.

- [ ] **Step 3: The shared platform rules**

Write `app/Services/Content/ContentPlatformRules.php` with the Write tool (the rules are `ContentPostGenerationService::getPlatformRules()`'s, word for word):

```php
<?php

namespace App\Services\Content;

/**
 * Each platform's writing rules (the planner spec's §8, word for word), in one place for the post writer and the
 * version adapter (spec 2026-10-19 §3.3).
 */
final class ContentPlatformRules
{
    public const RULES = [
        'linkedin' => 'Purpose: B2B trust, authority, thought leadership, founder credibility, education, soft lead generation. '
            . 'Best content types: founder/expert insights, industry lessons, case studies, customer problems, transformation stories, practical frameworks, contrarian-but-useful opinions, company updates with a human angle. '
            . 'Rules: strong first line (the first ~200 characters show before "see more" — make them count); professional tone; no excessive emojis; no generic motivational fluff; use specific business examples; soft CTA; create comments through thoughtful questions; keep under ~1300 characters; 3-5 relevant hashtags maximum.',
        'instagram' => 'Purpose: brand awareness, visual trust, education through visuals, aesthetic memory, social proof; Reels drive reach and discovery. '
            . 'Best content types: carousels (use carousel logic when teaching, with a strong cover slide concept), short captions, educational graphics, behind-the-scenes photos, before/after, product/service visuals, lifestyle content; for Reels: short tips, myth-busting, process videos, quick demos, relatable business problems. '
            . 'Rules: the visual comes first — the caption supports it; front-load the first ~125 caption characters; keep captions clear (max 2200 characters); use save/share mechanics; do not overcrowd images with text; Reels are vertical 9:16, must hook in the first 1-3 seconds, one idea per video, with on-screen captions; hashtags per brand policy (5-15 relevant, never spammy).',
        'tiktok' => 'Purpose: discovery, attention, relatable education, trend adaptation, fast creative testing. '
            . 'Best content types: native short videos, problem/solution videos, POV content, founder speaking to camera, quick examples, reactions to trends, simple storytelling. '
            . 'Rules: TikTok-first content, never repurposed corporate ads; vertical 9:16 video; strong opening hook in the first 1-3 seconds; natural human tone; use trends only when genuinely relevant to the audience; avoid polished corporate stiffness; short punchy caption (max ~150 characters).',
        'facebook' => 'Purpose: community, local trust, offers, relationship building, existing customer engagement. '
            . 'Best content types: updates, offers, stories, community questions, event posts, helpful tips, customer-friendly posts. '
            . 'Rules: more conversational and easier language than LinkedIn; great for community-style engagement; use questions and relatable situations; longer captions are OK (up to ~1000 characters) but lead with the point; minimal hashtags.',
        'x' => 'Purpose: short insights, opinions, industry commentary, thought fragments, traffic to deeper content. '
            . 'Best content types: sharp one-liners, short threads, opinions, trend reactions, mini frameworks. '
            . 'Rules: maximum 280 characters per post; concise with a clear point of view; avoid generic corporate language; one strong idea; 0-2 hashtags; threads work well for frameworks.',
        'youtube' => 'Purpose: discovery, education, searchable short-form and long-form video, repurposed expertise. '
            . 'Best content types: quick explainers, mini tutorials, mistake lists, before/after, short demos, question-answer format. '
            . 'Rules: hook in the first seconds; clear curiosity-driven title (60-70 characters); one topic per video; strong retention structure (promise → deliver → payoff); end with a simple CTA; keyword-rich description; Shorts are vertical 9:16.',
        'blog' => 'Purpose: deeper education, SEO, long-term trust, lead nurturing. '
            . 'Best content types: guides, explainers, case studies, product education, trend articles, FAQ articles. '
            . 'Rules: useful structure with clear H2/H3 headers; practical examples; SEO-optimized title; meta description of 150-160 characters; write so sections can be repurposed into multiple social posts; internal links where natural.',
        'email' => 'Purpose: nurture, direct relationship, replies and conversions from an owned audience. '
            . 'Best content types: newsletters, value tips, story-driven lessons, soft offers, event/product updates. '
            . 'Rules: subject line 45-50 characters with a curiosity or value hook; preheader ~100 characters; write like one person emailing another (conversational, no corporate bulk tone); mobile-first formatting with short paragraphs; primary CTA above the fold; 2-3 CTAs maximum; no hashtags.',
        'default' => 'Professional yet approachable. One clear idea, clear messaging, a strong first line, specific value, and a clear CTA. Relevant hashtags only if the platform uses them.',
    ];

    public static function for(string $platform): string
    {
        return self::RULES[$platform] ?? self::RULES['default'];
    }
}
```

Then compare it with the generator's text before deleting the original — the two must match word for word:

```bash
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe -r 'require "vendor/autoload.php"; $s = (new ReflectionClass(App\Services\ContentPostGenerationService::class))->newInstanceWithoutConstructor(); $g = new ReflectionMethod($s, "getPlatformRules"); $bad = []; foreach (array_keys(App\Services\Content\ContentPlatformRules::RULES) as $p) { if ($g->invoke($s, $p) !== App\Services\Content\ContentPlatformRules::for($p)) { $bad[] = $p; } } echo $bad === [] ? "same\n" : "DIFFERENT: " . implode(",", $bad) . "\n";'
```

Expected: `same`. (Single quotes around the PHP code keep the shell from touching its backslashes; the instance is made without its constructor, so no AI client is built — the method reads nothing else.)

In `app/Services/ContentPostGenerationService.php`, replace:

```php
use App\Services\Content\ContentKeyDates;
```

with:

```php
use App\Services\Content\ContentKeyDates;
use App\Services\Content\ContentPlatformRules;
```

replace:

```php
        $platformRules = $this->getPlatformRules($post->platform);
```

with:

```php
        $platformRules = ContentPlatformRules::for((string) $post->platform);
```

and delete the method `getPlatformRules()` with its docblock: from the line `    /**` above `     * Enriched platform-specific rules (spec §8).` down to the method's closing `    }` and the blank line after it (nothing else calls it: `grep -rn getPlatformRules app tests` then finds nothing).

- [ ] **Step 4: The adapter, the job, the state, the endpoint**

Write `app/Services/Content/ContentVersionAdapter.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ContextBuilder;

/**
 * Adapts a version's words to its platform (spec 2026-10-19 §3.3): the same offer in the platform's own form, with
 * the platform's rules and the brand's context, in the post's language. Not final, so tests mock it.
 */
class ContentVersionAdapter
{
    public function __construct(protected AiClient $ai, protected ContextBuilder $context)
    {
    }

    /**
     * The version holds the original's words and its own platform; `$from` is the platform they were written for.
     *
     * @return array{hook: ?string, main_copy: ?string, short_copy: ?string, cta: ?string, hashtags: list<string>}
     */
    public function adapt(ContentPlannerPost $version, string $from): array
    {
        $profile = ContentPlannerProfile::findOrFail($version->planner_profile_id);
        $kept = [
            'language'   => $version->language,
            'hook'       => $version->hook,
            'main_copy'  => $version->main_copy,
            'short_copy' => $version->short_copy,
            'cta'        => $version->cta,
            'hashtags'   => array_values((array) ($version->hashtags ?? [])),
        ];
        $prompt = self::prompt($kept, $from, (string) $version->platform, $this->context->build($profile));

        return self::words($this->ai->generateJson($profile, 'version_adapt', $prompt, 3000), $kept);
    }

    /** @param array<string, mixed> $post the words to adapt: language, hook, main_copy, short_copy, cta, hashtags */
    public static function prompt(array $post, string $from, string $to, string $context): string
    {
        return "You adapt a social media post written for {$from} into a native {$to} post.\n"
            . 'Keep the same offer, facts, prices, dates and links exactly, the same language (' . ($post['language'] ?? '') . ') '
            . "and the intent of the call to action. Do not invent anything.\n\n"
            . "Platform rules ({$to}): " . ContentPlatformRules::for($to) . "\n\n"
            . "Brand context:\n{$context}\n\n"
            . 'Hook: ' . ($post['hook'] ?? '') . "\n"
            . "Text:\n" . ($post['main_copy'] ?? '') . "\n"
            . 'Short text: ' . ($post['short_copy'] ?? '') . "\n"
            . 'Call to action: ' . ($post['cta'] ?? '') . "\n"
            . 'Hashtags: ' . implode(' ', (array) ($post['hashtags'] ?? [])) . "\n\n"
            . 'Return ONLY JSON: {"hook": "...", "main_copy": "...", "short_copy": "...", "cta": "...", "hashtags": ["#..."]}';
    }

    /**
     * The answer, cut to the columns' limits; a field the AI left out (or did not give as text) keeps the version's words.
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed> $kept
     * @return array{hook: ?string, main_copy: ?string, short_copy: ?string, cta: ?string, hashtags: list<string>}
     */
    public static function words(array $data, array $kept): array
    {
        $text = fn (string $key, int $max) => isset($data[$key]) && is_scalar($data[$key])
            ? mb_substr(trim((string) $data[$key]), 0, $max)
            : ($kept[$key] ?? null);
        $tags = is_array($data['hashtags'] ?? null)
            ? array_slice(array_values(array_filter(
                array_map(fn ($tag) => is_scalar($tag) ? mb_substr(trim((string) $tag), 0, 100) : '', $data['hashtags']),
                fn (string $tag) => $tag !== '',
            )), 0, 30)
            : array_values((array) ($kept['hashtags'] ?? []));

        return [
            'hook'       => $text('hook', 500),
            'main_copy'  => $text('main_copy', 20000),
            'short_copy' => $text('short_copy', 5000),
            'cta'        => $text('cta', 255),
            'hashtags'   => $tags,
        ];
    }
}
```

Write `app/Jobs/AdaptPostVersions.php` with the Write tool:

```php
<?php

namespace App\Jobs;

use App\Models\ContentPlannerPost;
use App\Models\Organization;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentVersionAdapter;
use App\Services\Content\ContentVersions;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Adapts a post's new versions to their platforms one by one (spec 2026-10-19 §3.3), as RewriteRepeatCopies rewords
 * repeat copies: one version per run, the rest handed on, so no run outlives the queue's retry_after. The budget is
 * checked before each call; when it is used up, or the AI fails, the versions not yet adapted keep the original's
 * words and the panel says so. A version a person changed since it was made — or saved while the AI wrote — keeps
 * the person's words.
 */
class AdaptPostVersions implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    /** One AI call per run, well under the queue connections' retry_after (90 s). */
    public int $timeout = 80;

    /** @param list<int> $versionIds */
    public function __construct(public int $groupId, public int $organizationId, public int $brandId, public string $from, public array $versionIds)
    {
    }

    public function handle(ContentVersionAdapter $adapter, ContentAiGate $gate): void
    {
        // A queue worker has no request: bind the tenant for the run, then leave the bindings as found.
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', $this->organizationId);
        app()->instance('current_brand_id', $this->brandId);
        $handedOn = false;
        try {
            $ids = $this->versionIds;
            $id = array_shift($ids);
            if ($id !== null) {
                $stopped = $this->adapt((int) $id, $adapter, $gate);
                if ($stopped !== null) {
                    ContentVersions::keep($this->groupId, array_merge([(int) $id], $ids), $stopped);
                    $ids = [];
                }
            }
            if ($ids !== []) {
                // The rest in the next run; the panel keeps showing "Adapting…" for them meanwhile.
                ContentVersions::stillAdapting($this->groupId, $ids);
                $handedOn = true;
                self::dispatch($this->groupId, $this->organizationId, $this->brandId, $this->from, $ids);
            }
        } finally {
            if (!$handedOn) {
                ContentVersions::stillAdapting($this->groupId, []);
            }
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
    }

    /** Adapts one version; why the adapting stops (`budget` or `ai_failed`), or null to go on. */
    private function adapt(int $id, ContentVersionAdapter $adapter, ContentAiGate $gate): ?string
    {
        $version = ContentPlannerPost::find($id);
        if (!$version || $version->updated_at->gt($version->created_at)) {
            return null; // deleted, or changed by a person since it was made: on to the next
        }
        // Read the organisation afresh each time: its cap is on the row, and the budget moves with every call.
        $org = Organization::find($this->organizationId);
        if (!$org) {
            return 'ai_failed';
        }
        try {
            $gate->allow($org);
        } catch (ContentRefused) {
            return 'budget';
        }
        try {
            $words = $adapter->adapt($version, $this->from);
        } catch (\Throwable $e) {
            report($e);

            return 'ai_failed';
        }
        // A query update skips the model's casts: the hashtags go in as the JSON the column holds.
        $words['hashtags'] = json_encode(array_values($words['hashtags']));
        // Written only if nobody saved the version while the AI wrote: a person's words win.
        ContentPlannerPost::whereKey($version->id)->where('updated_at', $version->getRawOriginal('updated_at'))->update($words);

        return null;
    }

    public function failed(\Throwable $e): void
    {
        ContentVersions::stillAdapting($this->groupId, []);
    }
}
```

In `app/Services/Content/ContentVersions.php`, replace:

```php
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
```

with:

```php
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
```

replace:

```php
        if ($posts->count() < 2) {
            return null;
        }

        return [
```

with:

```php
        if ($posts->count() < 2) {
            return null;
        }
        $ids = $posts->pluck('id')->map(fn ($id) => (int) $id)->all();
        $kept = (array) Cache::get(self::keptKey((int) $post->group_id), []);
        // A kept version a person has since changed is theirs now: nothing more to say about it.
        $untouched = $posts->filter(fn (ContentPlannerPost $p) => !$p->updated_at->gt($p->created_at))->pluck('id')->map(fn ($id) => (int) $id)->all();
        $keptIds = array_values(array_intersect(array_map('intval', (array) ($kept['ids'] ?? [])), $untouched));

        return [
```

replace:

```php
            'adapting'      => [],
            'kept_original' => [],
            'kept_reason'   => null,
        ];
    }
```

with:

```php
            'adapting'      => array_values(array_intersect(array_map('intval', (array) Cache::get(self::adaptingKey((int) $post->group_id), [])), $ids)),
            'kept_original' => $keptIds,
            'kept_reason'   => $keptIds === [] ? null : ($kept['reason'] ?? null),
        ];
    }

    /** Set while the AI adapts a group's versions (the panel's "Adapting for LinkedIn…"), as a repeat's rewording key. */
    public static function adaptingKey(int $groupId): string
    {
        return "content:version-adapt:{$groupId}";
    }

    /** The versions the AI did not adapt, and why (the panel says they keep the original's words), for a day. */
    public static function keptKey(int $groupId): string
    {
        return "content:version-kept:{$groupId}";
    }

    /** @param list<int> $ids the versions still to adapt; none ends the adapting */
    public static function stillAdapting(int $groupId, array $ids): void
    {
        $ids === []
            ? Cache::forget(self::adaptingKey($groupId))
            : Cache::put(self::adaptingKey($groupId), array_values(array_unique(array_map('intval', $ids))), now()->addMinutes(15));
    }

    /** @param list<int> $ids */
    public static function keep(int $groupId, array $ids, string $reason): void
    {
        $before = (array) (Cache::get(self::keptKey($groupId))['ids'] ?? []);
        Cache::put(self::keptKey($groupId), [
            'ids'    => array_values(array_unique(array_map('intval', array_merge($before, $ids)))),
            'reason' => $reason,
        ], now()->addDay());
    }
```

In `app/Http/Controllers/Api/V1/Admin/Content/VersionController.php`, replace:

```php
use App\Http\Controllers\Controller;
use App\Services\Content\ContentPostPresenter;
```

with:

```php
use App\Http\Controllers\Controller;
use App\Jobs\AdaptPostVersions;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPostPresenter;
```

replace:

```php
    public function store(Request $request, int $id): JsonResponse
```

with:

```php
    public function store(Request $request, int $id, ContentAiGate $gate): JsonResponse
```

and replace:

```php
        $post = PostController::find($id);
        $versions = ContentVersions::make($post, array_values($data['platforms']), (int) $request->user()->id);
```

with:

```php
        $post = PostController::find($id);
        $ai = $request->boolean('ai');
        if ($ai) {
            // At the budget cap nothing is made: the person asked for adapted versions.
            $gate->allow($request->attributes->get('workspace_org'));
        }
        $versions = ContentVersions::make($post, array_values($data['platforms']), (int) $request->user()->id);
        if ($ai) {
            $groupId = (int) $versions->first()->group_id;
            $ids = $versions->pluck('id')->map(fn ($versionId) => (int) $versionId)->all();
            // The panel shows "Adapting…" on these until the job is done with them (or 15 minutes pass).
            ContentVersions::stillAdapting($groupId, array_merge((array) cache()->get(ContentVersions::adaptingKey($groupId), []), $ids));
            AdaptPostVersions::dispatch($groupId, ContentContext::orgId(), ContentContext::brandId(), (string) $post->platform, $ids);
        }
```

- [ ] **Step 5: Run the tests, then the Content folders and the calendar's**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Unit/Content/ContentVersionAdapterTest.php tests/Feature/Content/VersionsAdaptTest.php tests/Feature/Content/ tests/Unit/Content/ tests/Feature/ContentCalendar/
```

Expected: `ContentVersionAdapterTest | Tests:    3 passed`, `VersionsAdaptTest | Tests:    7 passed`; all folders `exit 0` (Feature Content 199 + 7 = 206, Unit Content 71 + 3 = 74, ContentCalendar 12). `grep -rn getPlatformRules app tests` finds nothing.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentPlatformRules.php app/Services/Content/ContentVersionAdapter.php app/Jobs/AdaptPostVersions.php app/Services/ContentPostGenerationService.php app/Services/Content/ContentVersions.php app/Http/Controllers/Api/V1/Admin/Content/VersionController.php tests/Unit/Content/ContentVersionAdapterTest.php tests/Feature/Content/VersionsAdaptTest.php && git commit -q -m "Content: versions adapted by AI in the background, within the budget, never over a person's words" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: Who posts it — the field, the team, and the poster's Mark published

**Files:**
- Create: `app/Services/Content/ContentTeam.php`, `app/Http/Controllers/Api/V1/Admin/Content/TeamController.php`
- Modify: `app/Services/Content/ContentRules.php`, `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, `app/Services/Content/ContentApproval.php`, `app/Services/Content/ContentPostPresenter.php`, `app/Services/Content/ContentRepeat.php`, `routes/api.php`
- Test: create `tests/Feature/Content/PosterTest.php`

**Interfaces:**
- Consumes: `content_planner_posts.poster_id` (Task 1); `ContentVersions::COPIED` already carries it.
- Produces: `ContentTeam::of(int $brandId): Collection<int, array{id:int, name:string, role:'manager'|'staff'}>` (by name); `ContentTeam::memberIds(int $brandId): list<int>`; `ContentTeam::isMember(?int $userId, int $brandId): bool`; `ContentTeam::poster(?int $userId, int $brandId): ?array{id:int, name:string}`; `ContentTeam::assertPoster(mixed $userId, ?int $current, int $brandId): void` (422 `errors.poster_id`). `ContentApproval::guardPublish(ContentPlannerPost $post, User $user, ?ContentPlannerProfile $profile): void`. `GET team` → `{team:[…]}`. `POST posts`, `PUT posts/{id}`, `POST posts/{id}/move` accept `poster_id`. Cards gain `poster_id` (stored); details gain `poster` (effective).

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/PosterTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Who posts it (spec 2026-10-19 §4.1, §4.4): a member of the brand's team; the poster may mark an approved post published. */
class PosterTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_the_team_is_the_active_staff_who_can_use_the_brand_with_names_and_roles_only(): void
    {
        $this->manager->forceFill(['name' => 'Mia'])->save();
        $this->staffMember->forceFill(['name' => 'Sam'])->save();
        $inactive = $this->staffUser($this->org, ['role' => 'staff', 'is_active' => false]);
        $inactive->forceFill(['name' => 'Ivy'])->save();
        [$secondBrand] = $this->secondBrand(false);
        $elsewhere = $this->staffUser($this->org, ['role' => 'staff']);
        $elsewhere->forceFill(['name' => 'Eve'])->save();
        DB::table('brand_user')->insert(['brand_id' => $secondBrand, 'user_id' => $elsewhere->id]);
        $here = $this->staffUser($this->org, ['role' => 'staff']);
        $here->forceFill(['name' => 'Hal'])->save();
        DB::table('brand_user')->insert(['brand_id' => $this->brandId, 'user_id' => $here->id]);
        $other = $this->otherOrganization();
        $this->staffUser($other['org'])->forceFill(['name' => 'Oz'])->save();

        $this->asStaffMember()->getJson($this->api('team'))->assertOk()->assertExactJson(['team' => [
            ['id' => $here->id, 'name' => 'Hal', 'role' => 'staff'],
            ['id' => $this->manager->id, 'name' => 'Mia', 'role' => 'manager'],
            ['id' => $this->staffMember->id, 'name' => 'Sam', 'role' => 'staff'],
        ]]);
    }

    public function test_who_posts_it_is_set_on_a_new_post_a_save_and_a_schedule_cleared_and_refused_for_someone_off_the_team(): void
    {
        $this->manager->forceFill(['name' => 'Mia'])->save();
        $post = $this->makePost();

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'poster_id' => $this->manager->id])
            ->assertOk()
            ->assertJsonPath('post.poster_id', $this->manager->id)
            ->assertJsonPath('post.poster', ['id' => $this->manager->id, 'name' => 'Mia']);

        $outsider = $this->staffUser($this->otherOrganization()['org']);
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'poster_id' => $outsider->id])
            ->assertStatus(422)->assertJsonValidationErrors('poster_id');

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), [
            'updated_at' => $post->fresh()->updated_at->toISOString(), 'scheduled_date' => '2026-10-08', 'poster_id' => $this->staffMember->id,
        ])->assertOk()->assertJsonPath('post.poster_id', $this->staffMember->id);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), [
            'updated_at' => $post->fresh()->updated_at->toISOString(), 'scheduled_date' => '2026-10-09', 'poster_id' => $outsider->id,
        ])->assertStatus(422)->assertJsonValidationErrors('poster_id');

        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'linkedin', 'poster_id' => $this->staffMember->id])
            ->assertCreated()->assertJsonPath('post.poster.id', $this->staffMember->id);
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'linkedin', 'poster_id' => $outsider->id])
            ->assertStatus(422)->assertJsonValidationErrors('poster_id');

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'poster_id' => null])
            ->assertOk()->assertJsonPath('post.poster', null)->assertJsonPath('post.poster_id', null);
    }

    public function test_someone_who_left_or_was_switched_off_counts_as_nobody_and_their_post_still_saves(): void
    {
        $leaver = $this->staffUser($this->org, ['role' => 'staff']);
        $post = $this->makePost(['poster_id' => $leaver->id]);
        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.poster.id', $leaver->id);

        DB::table('staff')->where('user_id', $leaver->id)->update(['is_active' => false]);
        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.poster', null)->assertJsonPath('post.poster_id', $leaver->id);
        // The form sent again with the same poster is no change.
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'poster_id' => $leaver->id, 'hook' => 'New'])->assertOk();
        // Choosing them for another post is.
        $another = $this->makePost();
        $this->asManager()->putJson($this->api("posts/{$another->id}"), ['updated_at' => $another->updated_at->toISOString(), 'poster_id' => $leaver->id])
            ->assertStatus(422)->assertJsonValidationErrors('poster_id');

        $gone = $this->staffUser($this->org, ['role' => 'staff']);
        $theirs = $this->makePost(['poster_id' => $gone->id]);
        $gone->delete();
        $this->asManager()->getJson($this->api("posts/{$theirs->id}"))->assertJsonPath('post.poster', null);
    }

    public function test_changing_who_posts_it_keeps_an_approved_post_approved(): void
    {
        $this->profile->forceFill(['requires_approval' => true])->save();
        $post = $this->makePost(['status' => 'approved']);

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'poster_id' => $this->staffMember->id])
            ->assertOk()->assertJsonPath('post.status', 'approved');
        $this->assertSame(0, $post->events()->count());
    }

    public function test_the_poster_may_mark_an_approved_or_ready_post_published_while_approvals_are_on_and_no_other_staff_case_changes(): void
    {
        $this->profile->forceFill(['requires_approval' => true])->save();
        $mark = fn (int $id) => $this->asStaffMember()->postJson($this->api("posts/{$id}/mark-published"), ['published_url' => 'https://instagram.com/p/abc']);

        $approved = $this->makePost(['status' => 'approved', 'poster_id' => $this->staffMember->id]);
        $mark($approved->id)->assertOk()->assertJsonPath('post.status', 'published')->assertJsonPath('post.published_url', 'https://instagram.com/p/abc');
        $ready = $this->makePost(['status' => 'ready_to_publish', 'poster_id' => $this->staffMember->id]);
        $mark($ready->id)->assertOk()->assertJsonPath('post.status', 'published');

        $draft = $this->makePost(['status' => 'draft', 'poster_id' => $this->staffMember->id]);
        $mark($draft->id)->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $review = $this->makePost(['status' => 'needs_review', 'poster_id' => $this->staffMember->id]);
        $mark($review->id)->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $someoneElses = $this->makePost(['status' => 'approved', 'poster_id' => $this->manager->id]);
        $mark($someoneElses->id)->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $nobodys = $this->makePost(['status' => 'approved']);
        $mark($nobodys->id)->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->assertSame('draft', $draft->fresh()->status);

        // Managers as before.
        $this->asManager()->postJson($this->api("posts/{$draft->id}/mark-published"))->assertOk()->assertJsonPath('post.status', 'published');
    }

    public function test_versions_repeat_copies_and_duplicates_keep_who_posts_it(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'poster_id' => $this->staffMember->id]);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated()
            ->assertJsonPath('versions.0.poster_id', $this->staffMember->id);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-14'])->assertCreated()
            ->assertJsonPath('copies.0.poster_id', $this->staffMember->id);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()
            ->assertJsonPath('post.poster_id', $this->staffMember->id);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Feature/Content/PosterTest.php
```

Expected: `exit 1` — `GET team` is 404, `poster_id` is neither validated nor shown, and the poster's Mark published is refused.

- [ ] **Step 3: The team, the field, the rule**

Write `app/Services/Content/ContentTeam.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\Staff;
use App\Models\User;
use App\Support\AdminAccess\AccessMap;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A brand's team (spec 2026-10-19 §4.1): the organisation's active staff who can use the brand — no brand rows on
 * the person, or a row for this one. Who posts a post must be one of them; one who has left, or whose staff row is
 * inactive, counts as nobody (the panel shows nobody, the reminders go to the managers).
 */
final class ContentTeam
{
    /** @return Collection<int, array{id: int, name: string, role: string}> by name */
    public static function of(int $brandId): Collection
    {
        // Staff is tenant-scoped: the bound organisation's rows only.
        $staff = Staff::where('is_active', true)->get(['user_id', 'role'])->keyBy(fn (Staff $row) => (int) $row->user_id);
        if ($staff->isEmpty()) {
            return collect();
        }
        $brandRows = DB::table('brand_user')->whereIn('user_id', $staff->keys()->all())->get(['user_id', 'brand_id'])
            ->groupBy(fn ($row) => (int) $row->user_id);

        return User::query()->whereIn('id', $staff->keys()->all())->orderBy('name')->orderBy('id')->get(['id', 'name'])
            ->filter(fn (User $user) => !$brandRows->has((int) $user->id)
                || $brandRows[(int) $user->id]->contains(fn ($row) => (int) $row->brand_id === $brandId))
            ->map(fn (User $user) => [
                'id'   => (int) $user->id,
                'name' => (string) $user->name,
                'role' => in_array($staff[(int) $user->id]->role, AccessMap::MANAGER_ROLES, true) ? 'manager' : 'staff',
            ])
            ->values();
    }

    /** @return list<int> */
    public static function memberIds(int $brandId): array
    {
        return self::of($brandId)->pluck('id')->all();
    }

    public static function isMember(?int $userId, int $brandId): bool
    {
        return $userId !== null && in_array($userId, self::memberIds($brandId), true);
    }

    /** Who posts it, as the panel shows it: a member, or nobody. @return array{id: int, name: string}|null */
    public static function poster(?int $userId, int $brandId): ?array
    {
        if ($userId === null) {
            return null;
        }
        $member = self::of($brandId)->firstWhere('id', $userId);

        return $member ? ['id' => $member['id'], 'name' => $member['name']] : null;
    }

    /** A new poster must be on the team; the post's own poster sent again is no change, even once they have left. */
    public static function assertPoster(mixed $userId, ?int $current, int $brandId): void
    {
        if ($userId === null || (int) $userId === $current) {
            return;
        }
        if (!self::isMember((int) $userId, $brandId)) {
            throw ValidationException::withMessages(['poster_id' => "Choose someone on this brand's team."]);
        }
    }
}
```

Write `app/Http/Controllers/Api/V1/Admin/Content/TeamController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentTeam;
use Illuminate\Http\JsonResponse;

/** The brand's team for "Who posts it" (spec 2026-10-19 §4.1): names and roles only, for everyone. */
class TeamController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['team' => ContentTeam::of(ContentContext::brandId())]);
    }
}
```

In `routes/api.php`, replace:

```php
                Route::post('inbox/seen', [\App\Http\Controllers\Api\V1\Admin\Content\InboxController::class, 'seen']);
```

with:

```php
                Route::post('inbox/seen', [\App\Http\Controllers\Api\V1\Admin\Content\InboxController::class, 'seen']);
                Route::get('team', [\App\Http\Controllers\Api\V1\Admin\Content\TeamController::class, 'index']);
```

In `app/Services/Content/ContentRules.php`, replace:

```php
            'strategic_reason' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
```

with:

```php
            'strategic_reason' => ['sometimes', 'nullable', 'string', 'max:5000'],
            // Who posts it (spec 2026-10-19 §4.1): a member of the brand's team, checked by ContentTeam::assertPoster.
            'poster_id'        => ['sometimes', 'nullable', 'integer'],
        ];
```

In `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, replace:

```php
use App\Services\Content\ContentRules;
```

with:

```php
use App\Services\Content\ContentRules;
use App\Services\Content\ContentTeam;
```

replace (in `store`):

```php
        ContentApproval::guardStatus($data['status'] ?? null, null, $request->user(), $profile);
```

with:

```php
        ContentTeam::assertPoster($data['poster_id'] ?? null, null, (int) $profile->brand_id);
        ContentApproval::guardStatus($data['status'] ?? null, null, $request->user(), $profile);
```

replace (in `update`):

```php
        $fields = Arr::except($data, ['updated_at']);
```

with:

```php
        $fields = Arr::except($data, ['updated_at']);
        ContentTeam::assertPoster($fields['poster_id'] ?? null, $post->poster_id === null ? null : (int) $post->poster_id, (int) $post->brand_id);
```

replace (in `move`):

```php
            'scheduled_time' => 'sometimes|nullable|date_format:H:i',
        ]);
        self::assertFresh($post, $data['updated_at']);
        if ($post->status === 'published') {
            self::refusePublishedMove();
        }
```

with:

```php
            'scheduled_time' => 'sometimes|nullable|date_format:H:i',
            // Ideas → Schedule asks who posts it (spec 2026-10-19 §4.1).
            'poster_id'      => 'sometimes|nullable|integer',
        ]);
        self::assertFresh($post, $data['updated_at']);
        if ($post->status === 'published') {
            self::refusePublishedMove();
        }
        ContentTeam::assertPoster($data['poster_id'] ?? null, $post->poster_id === null ? null : (int) $post->poster_id, (int) $post->brand_id);
```

replace (in `move`):

```php
        if (array_key_exists('scheduled_time', $data)) {
            $post->scheduled_time = $data['scheduled_time'];
        }
```

with:

```php
        if (array_key_exists('scheduled_time', $data)) {
            $post->scheduled_time = $data['scheduled_time'];
        }
        if (array_key_exists('poster_id', $data)) {
            $post->poster_id = $data['poster_id'];
        }
```

and replace (in `markPublished`):

```php
        ContentApproval::guardStatus('published', $before, $request->user(), ContentContext::profile());
```

with:

```php
        ContentApproval::guardPublish($post, $request->user(), ContentContext::profile());
```

In `app/Services/Content/ContentApproval.php`, replace:

```php
    /**
     * After a save's fields are filled, before it is written: a staff change to the words of an approved or ready post
```

with:

```php
    /**
     * Mark published (spec 2026-10-19 §4.4): the post's own poster may mark it published once it is approved or ready —
     * the person who posts it says it is out. Every other case is guardStatus's.
     */
    public static function guardPublish(ContentPlannerPost $post, User $user, ?ContentPlannerProfile $profile): void
    {
        if ($post->poster_id !== null && (int) $post->poster_id === (int) $user->id
            && in_array($post->status, ['approved', 'ready_to_publish'], true)) {
            return;
        }
        self::guardStatus('published', (string) $post->status, $user, $profile);
    }

    /**
     * After a save's fields are filled, before it is written: a staff change to the words of an approved or ready post
```

In `app/Services/Content/ContentPostPresenter.php`, replace:

```php
            'group_size'     => self::groupSize($post),
        ];
    }
```

with:

```php
            'group_size'     => self::groupSize($post),
            // Who posts it as stored (spec 2026-10-19 §4.1); the panel's `poster` says whether they are still on the team.
            'poster_id'      => $post->poster_id === null ? null : (int) $post->poster_id,
        ];
    }
```

and replace:

```php
            'group'             => ContentVersions::describe($post),
```

with:

```php
            'group'             => ContentVersions::describe($post),
            // Who posts it: a member of the brand's team, or nobody (spec 2026-10-19 §4.1).
            'poster'            => ContentTeam::poster($post->poster_id === null ? null : (int) $post->poster_id, (int) $post->brand_id),
```

In `app/Services/Content/ContentRepeat.php`, replace:

```php
    /** What a copy takes from its original. */
    public const COPIED = [
        'platform', 'scheduled_time', 'main_copy', 'short_copy', 'hashtags', 'cta', 'pillar_id', 'audience_id', 'campaign_id',
        'strategy_id', 'language', 'topic', 'title', 'hook', 'goal', 'format', 'weekday_role', 'funnel_stage', 'post_type', 'strategic_reason',
    ];
```

with:

```php
    /** What a copy takes from its original — who posts it too: the same post on another day (spec 2026-10-19 §4.1). */
    public const COPIED = [
        'platform', 'scheduled_time', 'main_copy', 'short_copy', 'hashtags', 'cta', 'pillar_id', 'audience_id', 'campaign_id',
        'strategy_id', 'language', 'topic', 'title', 'hook', 'goal', 'format', 'weekday_role', 'funnel_stage', 'post_type', 'strategic_reason',
        'poster_id',
    ];
```

- [ ] **Step 4: Run the test, then the Content folders and the access map**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Feature/Content/PosterTest.php tests/Feature/Content/ tests/Unit/Content/ tests/Feature/AdminAccess/
```

Expected: `PosterTest | Tests:    6 passed`; all folders `exit 0` (Feature Content 206 + 6 = 212, Unit Content 74, AdminAccess 51).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentTeam.php app/Http/Controllers/Api/V1/Admin/Content/TeamController.php app/Services/Content/ContentRules.php app/Http/Controllers/Api/V1/Admin/Content/PostController.php app/Services/Content/ContentApproval.php app/Services/Content/ContentPostPresenter.php app/Services/Content/ContentRepeat.php routes/api.php tests/Feature/Content/PosterTest.php && git commit -q -m "Content: who posts it — the brand's team, the field on every write, the poster's Mark published" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: Reminders in the "For you" bell

**Files:**
- Create: `app/Services/Content/ContentReminders.php`
- Modify: `app/Services/Content/ContentInbox.php`
- Test: create `tests/Feature/Content/RemindersTest.php`

**Interfaces:**
- Consumes: `poster_id` (Task 1); `ContentTeam::memberIds()` (Task 3); `ContentAccess::canManage()`; `VenueClock`.
- Produces: `ContentReminders::DONE`, `ContentReminders::MISSED_DAYS = 7`; `ContentReminders::today(User $user, ContentPlannerProfile $profile, CarbonImmutable $venueNow, bool $wholeDay = false): Builder`; `ContentReminders::missed(User, ContentPlannerProfile, CarbonImmutable $venueNow): Builder`; `ContentReminders::appearsAt(ContentPlannerPost $post, string $zone): CarbonImmutable`. The bell's items gain kinds `to_post` and `not_posted` (ids `to_post:{id}`, `not_posted:{id}`, `by` null); every item's `post` gains `scheduled_time` and `status`; `count` includes both kinds.

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/RemindersTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Reminders in the "For you" bell (spec 2026-10-19 §4.2–§4.3). Today is Monday 5 October 2026, 06:00 UTC, at a UTC venue. */
class RemindersTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** @return list<string> the bell's item ids for the manager or the staff member, sorted */
    private function bell(string $who): array
    {
        $caller = $who === 'manager' ? $this->asManager() : $this->asStaffMember();

        return collect($caller->getJson($this->api('inbox'))->assertOk()->json('items'))->pluck('id')->sort()->values()->all();
    }

    public function test_the_poster_sees_todays_post_from_the_morning_or_from_its_time(): void
    {
        $morning = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id, 'title' => 'Morning post']);
        $evening = $this->makePost(['scheduled_date' => '2026-10-05', 'scheduled_time' => '18:00', 'poster_id' => $this->staffMember->id, 'status' => 'approved']);
        $this->makePost(['scheduled_date' => '2026-10-06', 'poster_id' => $this->staffMember->id]);

        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('items.0.id', "to_post:{$morning->id}")
            ->assertJsonPath('items.0.kind', 'to_post')
            ->assertJsonPath('items.0.post.title', 'Morning post')
            ->assertJsonPath('items.0.post.status', 'draft')
            ->assertJsonPath('items.0.post.scheduled_time', null)
            ->assertJsonPath('items.0.by', null)
            ->assertJsonPath('items.0.at', '2026-10-05T00:00:00.000000Z');

        $this->travelTo(CarbonImmutable::parse('2026-10-05 18:00:00'));
        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 2)
            ->assertJsonPath('items.0.id', "to_post:{$evening->id}")
            ->assertJsonPath('items.0.post.scheduled_time', '18:00')
            ->assertJsonPath('items.0.post.status', 'approved');
    }

    public function test_a_post_not_marked_as_posted_stays_seven_days_and_publishing_skipping_or_a_new_day_ends_it(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->travelTo(CarbonImmutable::parse('2026-10-06 06:00:00'));
        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('items.0.id', "not_posted:{$post->id}")
            ->assertJsonPath('items.0.post.scheduled_date', '2026-10-05');
        $this->travelTo(CarbonImmutable::parse('2026-10-12 06:00:00'));
        $this->assertSame(["not_posted:{$post->id}"], $this->bell('staff'));
        $this->travelTo(CarbonImmutable::parse('2026-10-13 06:00:00'));
        $this->assertSame([], $this->bell('staff'));

        $this->travelTo(CarbonImmutable::parse('2026-10-06 06:00:00'));
        $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id, 'status' => 'skipped']);
        $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id, 'status' => 'archived']);
        $moved = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);
        $this->asStaffMember()->postJson($this->api("posts/{$moved->id}/move"), ['updated_at' => $moved->updated_at->toISOString(), 'scheduled_date' => '2026-10-08'])->assertOk();
        $this->asManager()->postJson($this->api("posts/{$post->id}/mark-published"))->assertOk();
        $this->assertSame([], $this->bell('staff'));

        $this->travelTo(CarbonImmutable::parse('2026-10-08 06:00:00'));
        $this->assertSame(["to_post:{$moved->id}"], $this->bell('staff'));
    }

    public function test_a_post_nobody_posts_and_one_whose_poster_left_remind_the_managers_only(): void
    {
        $nobody = $this->makePost(['scheduled_date' => '2026-10-05']);
        $leaver = $this->staffUser($this->org, ['role' => 'staff']);
        $left = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $leaver->id]);
        DB::table('staff')->where('user_id', $leaver->id)->update(['is_active' => false]);
        $staffs = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);
        $managers = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->manager->id]);

        $this->assertSame(collect(["to_post:{$nobody->id}", "to_post:{$left->id}", "to_post:{$managers->id}"])->sort()->values()->all(), $this->bell('manager'));
        $this->assertSame(["to_post:{$staffs->id}"], $this->bell('staff'));
    }

    public function test_reminders_count_while_they_last_and_are_new_until_the_list_is_seen(): void
    {
        $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->asStaffMember()->getJson($this->api('inbox'))->assertJsonPath('items.0.unread', true);
        $this->asStaffMember()->postJson($this->api('inbox/seen'))->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->getJson($this->api('inbox'))->assertJsonPath('items.0.unread', false)->assertJsonPath('count', 1);
        $this->asStaffMember()->getJson($this->api('inbox/count'))->assertJsonPath('count', 1);
    }

    public function test_today_is_the_venues_today(): void
    {
        $this->org->forceFill(['timezone' => 'Pacific/Auckland'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00')); // 01:00 on Tuesday 6 October in Auckland (NZDT, UTC+13)
        $tuesday = $this->makePost(['scheduled_date' => '2026-10-06', 'poster_id' => $this->staffMember->id]);
        $monday = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 2)
            ->assertJsonPath('items.0.id', "to_post:{$tuesday->id}")
            ->assertJsonPath('items.0.at', '2026-10-05T11:00:00.000000Z')
            ->assertJsonPath('items.1.id', "not_posted:{$monday->id}");
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Feature/Content/RemindersTest.php
```

Expected: `exit 1` — the bell has no `to_post` or `not_posted` items (count 0).

- [ ] **Step 3: The reminders, and the bell's two new kinds**

Write `app/Services/Content/ContentReminders.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Reminders (spec 2026-10-19 §4.2–§4.3): the posts a person is to put out — the ones they post, and, for a manager,
 * the ones nobody on the team posts — on their day ("to post today") and for seven days after, while nobody has
 * marked them published, skipped or archived ("not marked as posted"). Built from the posts on every read; the bell
 * and the morning email share them.
 */
final class ContentReminders
{
    /** A post with one of these needs no reminder. */
    public const DONE = ['published', 'skipped', 'archived'];

    public const MISSED_DAYS = 7;

    /**
     * Today's posts for the person, by `$venueNow` (the venue's wall clock): those whose time has come — a post with no
     * time from the start of the day — or, with `$wholeDay`, all of them (the morning email lists the day).
     */
    public static function today(User $user, ContentPlannerProfile $profile, CarbonImmutable $venueNow, bool $wholeDay = false): Builder
    {
        return self::mine($user, $profile)->whereDate('scheduled_date', $venueNow->format('Y-m-d'))
            ->when(!$wholeDay, fn (Builder $q) => $q->where(fn (Builder $t) => $t->whereNull('scheduled_time')
                ->orWhere('scheduled_time', '<=', $venueNow->format('H:i:s'))));
    }

    /** The person's posts from the seven days before today that nobody marked as done. */
    public static function missed(User $user, ContentPlannerProfile $profile, CarbonImmutable $venueNow): Builder
    {
        return self::mine($user, $profile)
            ->whereDate('scheduled_date', '>=', $venueNow->subDays(self::MISSED_DAYS)->format('Y-m-d'))
            ->whereDate('scheduled_date', '<', $venueNow->format('Y-m-d'));
    }

    /** When a reminder appears: its day's start, or its time, on the venue's clock, as a moment. */
    public static function appearsAt(ContentPlannerPost $post, string $zone): CarbonImmutable
    {
        $time = $post->scheduled_time ? substr((string) $post->scheduled_time, 0, 5) : '00:00';

        return CarbonImmutable::createFromFormat('Y-m-d H:i', $post->scheduled_date->format('Y-m-d') . ' ' . $time, $zone)->utc();
    }

    /** Posts not done that the person posts, or — for a manager — that nobody on the team posts. */
    private static function mine(User $user, ContentPlannerProfile $profile): Builder
    {
        $manager = ContentAccess::canManage($user);
        $members = $manager ? ContentTeam::memberIds((int) $profile->brand_id) : [];

        return ContentPlannerPost::query()->where('planner_profile_id', $profile->id)->whereNotIn('status', self::DONE)
            ->where(function (Builder $q) use ($user, $manager, $members) {
                $q->where('poster_id', $user->id);
                if ($manager) {
                    $q->orWhereNull('poster_id')->orWhereNotIn('poster_id', $members);
                }
            });
    }
}
```

In `app/Services/Content/ContentInbox.php`, replace:

```php
use App\Models\User;
use Carbon\CarbonImmutable;
```

with:

```php
use App\Models\User;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
```

replace:

```php
 * "approved" and "sent back" on posts they wrote, comments by others on posts they wrote or commented on. News is at
 * most 30 days old; an item whose author has left stays, with no name.
 */
```

with:

```php
 * "approved" and "sent back" on posts they wrote, comments by others on posts they wrote or commented on. News is at
 * most 30 days old; an item whose author has left stays, with no name. Release 5a adds the reminders (spec 2026-10-19
 * §4.3): today's posts once their time comes and the ones not marked as posted — like the waiting posts, they stay
 * until done and count while they last.
 */
```

replace:

```php
    private const WITH = ['post:id,platform,title,hook,topic,scheduled_date', 'user:id,name'];
```

with:

```php
    private const WITH = ['post:id,platform,title,hook,topic,scheduled_date,scheduled_time,status', 'user:id,name'];
```

replace:

```php
                $items[] = self::item("waiting:{$post->id}", 'waiting', $post, $post->createdBy, null, $at, $seenAt === null || $at->gt($seenAt));
            }
        }
```

with:

```php
                $items[] = self::item("waiting:{$post->id}", 'waiting', $post, $post->createdBy, null, $at, $seenAt === null || $at->gt($seenAt));
            }
        }
        $orgId = (int) $profile->organization_id;
        $venueNow = VenueClock::now($orgId);
        $zone = VenueClock::zone($orgId);
        $reminders = ['to_post' => ContentReminders::today($user, $profile, $venueNow), 'not_posted' => ContentReminders::missed($user, $profile, $venueNow)];
        foreach ($reminders as $kind => $query) {
            foreach ($query->orderByDesc('scheduled_date')->orderByDesc('scheduled_time')->orderByDesc('id')->limit(self::LIMIT)->get() as $post) {
                $at = ContentReminders::appearsAt($post, $zone);
                $items[] = self::item("{$kind}:{$post->id}", $kind, $post, null, null, $at, $seenAt === null || $at->gt($seenAt));
            }
        }
```

replace:

```php
        $since = self::since(self::seenAt($user, $profile));

        return (self::waiting($user, $profile)?->count() ?? 0)
            + self::approvals($user, $profile, $since)->count()
```

with:

```php
        $since = self::since(self::seenAt($user, $profile));
        $venueNow = VenueClock::now((int) $profile->organization_id);

        return (self::waiting($user, $profile)?->count() ?? 0)
            + ContentReminders::today($user, $profile, $venueNow)->count()
            + ContentReminders::missed($user, $profile, $venueNow)->count()
            + self::approvals($user, $profile, $since)->count()
```

and replace:

```php
                'topic'          => $post->topic,
                'scheduled_date' => $post->scheduled_date?->format('Y-m-d'),
            ] : null,
```

with:

```php
                'topic'          => $post->topic,
                'scheduled_date' => $post->scheduled_date?->format('Y-m-d'),
                // The reminders' second line: its time, and its status when it is not ready yet (spec 2026-10-19 §4.3).
                'scheduled_time' => $post->scheduled_time ? substr((string) $post->scheduled_time, 0, 5) : null,
                'status'         => (string) $post->status,
            ] : null,
```

- [ ] **Step 4: Run the test, then the Content folders**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Feature/Content/RemindersTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `RemindersTest | Tests:    5 passed`; both folders `exit 0` (Feature Content 212 + 5 = 217, `InboxTest` unchanged and green; Unit Content 74).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentReminders.php app/Services/Content/ContentInbox.php tests/Feature/Content/RemindersTest.php && git commit -q -m "Content: reminders in the For you bell — to post today, and not marked as posted for seven days" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: The morning email switch

**Files:**
- Create: `database/migrations/2026_10_19_100100_add_content_morning_email_to_users.php`, `app/Http/Controllers/Api/V1/Admin/Content/MorningEmailController.php`
- Modify: `app/Models/User.php`, `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`, `app/Http/Controllers/Api/V1/Admin/MeController.php`, `routes/api.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: create `tests/Feature/Content/MorningEmailSwitchTest.php`

**Interfaces:**
- Produces: `users.wants_content_morning_email` (boolean, default false; fillable, cast boolean) and `users.content_morning_email_last_sent_at` (timestamp, cast datetime). `PUT me/morning-email` (`on` boolean) → `{on}`; the bootstrap's `staff.morning_email` (bool); `GET/PUT admin/me/preferences` carry `wants_content_morning_email` and `content_morning_email_last_sent_at`.

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/MorningEmailSwitchTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The morning email switch (spec 2026-10-19 §4.5): each person's own, off by default, in Content and in the full admin. */
class MorningEmailSwitchTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_it_is_off_by_default_and_each_person_switches_their_own(): void
    {
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('staff.morning_email', false);

        $this->asStaffMember()->putJson($this->api('me/morning-email'), ['on' => true])->assertOk()->assertJsonPath('on', true);
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertJsonPath('staff.morning_email', true);
        $this->asManager()->getJson($this->api('bootstrap'))->assertJsonPath('staff.morning_email', false);

        $this->asStaffMember()->putJson($this->api('me/morning-email'), ['on' => 'often'])->assertStatus(422)->assertJsonValidationErrors('on');
        $this->asStaffMember()->putJson($this->api('me/morning-email'), [])->assertStatus(422)->assertJsonValidationErrors('on');
        $this->asStaffMember()->putJson($this->api('me/morning-email'), ['on' => false])->assertOk()->assertJsonPath('on', false);
        $this->assertFalse($this->staffMember->fresh()->wants_content_morning_email);
    }

    public function test_the_full_admins_preferences_carry_it_too(): void
    {
        $this->asStaffMember()->putJson('/api/v1/admin/me/preferences', ['wants_content_morning_email' => true])->assertOk()
            ->assertJsonPath('wants_content_morning_email', true);
        $this->asStaffMember()->getJson('/api/v1/admin/me/preferences')->assertOk()
            ->assertJsonPath('wants_content_morning_email', true)
            ->assertJsonPath('content_morning_email_last_sent_at', null);
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertJsonPath('staff.morning_email', true);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Feature/Content/MorningEmailSwitchTest.php
```

Expected: `exit 1` — `staff.morning_email` is missing and `me/morning-email` is 404.

- [ ] **Step 3: The columns, the switch, the preferences**

Write `database/migrations/2026_10_19_100100_add_content_morning_email_to_users.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Content's morning email (spec 2026-10-19 §4.5): each person's opt-in, off by default, and when it last
 * went — the loyalty digest's pair of columns, for this email.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            if (!Schema::hasColumn('users', 'wants_content_morning_email')) {
                $t->boolean('wants_content_morning_email')->default(false);
            }
            if (!Schema::hasColumn('users', 'content_morning_email_last_sent_at')) {
                $t->timestamp('content_morning_email_last_sent_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $t) {
            foreach (['content_morning_email_last_sent_at', 'wants_content_morning_email'] as $column) {
                if (Schema::hasColumn('users', $column)) {
                    $t->dropColumn($column);
                }
            }
        });
    }
};
```

In `tests/Concerns/SetsUpContentSchema.php`, replace:

```php
        if (!Schema::hasColumn('content_planner_posts', 'group_id')) {
            (require database_path('migrations/2026_10_19_100000_add_group_and_poster_to_content_planner_posts.php'))->up();
        }
```

with:

```php
        if (!Schema::hasColumn('content_planner_posts', 'group_id')) {
            (require database_path('migrations/2026_10_19_100000_add_group_and_poster_to_content_planner_posts.php'))->up();
        }
        if (!Schema::hasColumn('users', 'wants_content_morning_email')) {
            (require database_path('migrations/2026_10_19_100100_add_content_morning_email_to_users.php'))->up();
        }
```

In `app/Models/User.php`, replace:

```php
        'wants_daily_summary', 'wants_loyalty_digest',
    ];
```

with:

```php
        'wants_daily_summary', 'wants_loyalty_digest', 'wants_content_morning_email',
    ];
```

and replace:

```php
        'loyalty_digest_last_sent_at' => 'datetime',
    ];
```

with:

```php
        'loyalty_digest_last_sent_at' => 'datetime',
        'wants_content_morning_email' => 'boolean',
        'content_morning_email_last_sent_at' => 'datetime',
    ];
```

Write `app/Http/Controllers/Api/V1/Admin/Content/MorningEmailController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The morning email switch in Content's menu (spec 2026-10-19 §4.5): each person's own, off by default. */
class MorningEmailController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['on' => 'required|boolean']);
        $user = $request->user();
        $user->forceFill(['wants_content_morning_email' => (bool) $data['on']])->save();

        return response()->json(['on' => (bool) $user->wants_content_morning_email]);
    }
}
```

In `routes/api.php`, replace:

```php
                Route::get('team', [\App\Http\Controllers\Api\V1\Admin\Content\TeamController::class, 'index']);
```

with:

```php
                Route::get('team', [\App\Http\Controllers\Api\V1\Admin\Content\TeamController::class, 'index']);
                Route::put('me/morning-email', [\App\Http\Controllers\Api\V1\Admin\Content\MorningEmailController::class, 'update']);
```

In `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`, replace:

```php
            'staff'        => ['name' => (string) $user->name, 'role' => $staff?->role, 'can_manage' => ContentAccess::canManage($user)],
```

with:

```php
            'staff'        => [
                'name'          => (string) $user->name,
                'role'          => $staff?->role,
                'can_manage'    => ContentAccess::canManage($user),
                // Spec 2026-10-19 §4.5: the switch in Content's menu.
                'morning_email' => (bool) ($user->wants_content_morning_email ?? false),
            ],
```

In `app/Http/Controllers/Api/V1/Admin/MeController.php`, replace (in `preferences`):

```php
            'loyalty_digest_last_sent_at' => $user->loyalty_digest_last_sent_at?->toIso8601String(),
            'language'                    => $user->language ?: 'en',
        ]);
    }

    public function updatePreferences(Request $request): JsonResponse
```

with:

```php
            'loyalty_digest_last_sent_at' => $user->loyalty_digest_last_sent_at?->toIso8601String(),
            'wants_content_morning_email'        => (bool) ($user->wants_content_morning_email ?? false),
            'content_morning_email_last_sent_at' => $user->content_morning_email_last_sent_at?->toIso8601String(),
            'language'                    => $user->language ?: 'en',
        ]);
    }

    public function updatePreferences(Request $request): JsonResponse
```

replace:

```php
            'wants_loyalty_digest'  => 'sometimes|boolean',
```

with:

```php
            'wants_loyalty_digest'  => 'sometimes|boolean',
            'wants_content_morning_email' => 'sometimes|boolean',
```

and replace (in `updatePreferences`' answer):

```php
            'loyalty_digest_last_sent_at' => $user->loyalty_digest_last_sent_at?->toIso8601String(),
            'language'                    => $user->language ?: 'en',
        ]);
    }
}
```

with:

```php
            'loyalty_digest_last_sent_at' => $user->loyalty_digest_last_sent_at?->toIso8601String(),
            'wants_content_morning_email'        => (bool) $user->wants_content_morning_email,
            'content_morning_email_last_sent_at' => $user->content_morning_email_last_sent_at?->toIso8601String(),
            'language'                    => $user->language ?: 'en',
        ]);
    }
}
```

- [ ] **Step 4: Run the test, then the Content folders and the access map**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Feature/Content/MorningEmailSwitchTest.php tests/Feature/Content/ tests/Unit/Content/ tests/Feature/AdminAccess/
```

Expected: `MorningEmailSwitchTest | Tests:    2 passed`; all folders `exit 0` (Feature Content 217 + 2 = 219, Unit Content 74, AdminAccess 51).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_19_100100_add_content_morning_email_to_users.php app/Http/Controllers/Api/V1/Admin/Content/MorningEmailController.php app/Models/User.php app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php app/Http/Controllers/Api/V1/Admin/MeController.php routes/api.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/MorningEmailSwitchTest.php && git commit -q -m "Content: the morning email switch, each person's own, in Content and the full admin's preferences" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: The morning email

**Files:**
- Create: `app/Services/Content/ContentMorningDigest.php`, `app/Mail/ContentMorningEmail.php`, `resources/views/emails/content-morning.blade.php`, `lang/en/content_morning.php`, `lang/ru/content_morning.php`, `lang/de/content_morning.php`, `lang/fr/content_morning.php`, `lang/es/content_morning.php`, `app/Console/Commands/SendContentMorningEmail.php`
- Modify: `routes/console.php`
- Test: create `tests/Feature/Content/MorningEmailTest.php`, `tests/Unit/Content/MorningEmailWordsTest.php`

**Interfaces:**
- Consumes: `ContentReminders::today(..., wholeDay: true)` and `missed()` (Task 4); `users.wants_content_morning_email`, `content_morning_email_last_sent_at` (Task 5); `ContentContext::brandsFor()`; `Organization::workspaceEnabled()`, `appointmentsOnly()`; `MeController::SUPPORTED_LANGUAGES`.
- Produces: `ContentMorningDigest::build(User $user, int $orgId, CarbonImmutable $venueNow): ?array` (keys `locale, subject, eyebrow, heading, greeting, intro, brands[{name, posts[{time, platform, title, status, url}], missed}], open, openUrl, footer`); `ContentMorningEmail(array $lines)` (queued, public `$lines`); command `content:send-morning-email {--hour=8} {--user=} {--force}`, scheduled hourly with `withoutOverlapping(10)`.

- [ ] **Step 1: Write the failing tests**

Write `tests/Unit/Content/MorningEmailWordsTest.php` with the Write tool:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentRules;
use Carbon\CarbonImmutable;
use Tests\TestCase;

/** The morning email's words (spec 2026-10-19 §4.5, §7.3): five languages with the same keys, placeholders and lists. */
class MorningEmailWordsTest extends TestCase
{
    /** @return array<string, string> */
    private function flat(array $words, string $prefix = ''): array
    {
        $out = [];
        foreach ($words as $key => $value) {
            is_array($value) ? $out += $this->flat($value, "{$prefix}{$key}.") : $out["{$prefix}{$key}"] = (string) $value;
        }

        return $out;
    }

    public function test_every_language_has_every_english_word_and_keeps_its_placeholders(): void
    {
        $en = $this->flat(require lang_path('en/content_morning.php'));
        foreach (['ru', 'de', 'fr', 'es'] as $locale) {
            $words = $this->flat(require lang_path("{$locale}/content_morning.php"));
            $this->assertSame(array_keys($en), array_keys($words), $locale);
            foreach ($en as $key => $text) {
                preg_match_all('/:[a-z]+/', $text, $want);
                preg_match_all('/:[a-z]+/', $words[$key], $got);
                $this->assertSame($want[0], $got[0], "{$locale} {$key}");
            }
        }
        $english = require lang_path('en/content_morning.php');
        $this->assertSame(ContentRules::STATUSES, array_keys($english['status']));
        $this->assertSame(ContentRules::PLATFORMS, array_keys($english['platform']));
    }

    public function test_the_date_reads_naturally_in_each_language(): void
    {
        $day = CarbonImmutable::parse('2026-10-05');
        $expected = [
            'en' => 'Monday, 5 October',
            'ru' => 'понедельник, 5 октября',
            'de' => 'Montag, 5. Oktober',
            'fr' => 'lundi 5 octobre',
            'es' => 'lunes, 5 de octubre',
        ];
        foreach ($expected as $locale => $text) {
            $this->assertSame($text, $day->locale($locale)->isoFormat(__('content_morning.date_format', [], $locale)), $locale);
        }
    }
}
```

Write `tests/Feature/Content/MorningEmailTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Mail\ContentMorningEmail;
use App\Models\ContentPlannerPost;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/**
 * The morning email (spec 2026-10-19 §4.5). The venue is in Riga (UTC+3 in October): 05:00 UTC is 8 am there, on
 * Monday 5 October 2026.
 */
class MorningEmailTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 05:00:00'));
        Mail::fake();
    }

    private function optIn(User $user, array $more = []): void
    {
        $user->forceFill(['wants_content_morning_email' => true] + $more)->save();
    }

    /** @return array<string, mixed> the one queued email's words */
    private function onlyEmail(): array
    {
        Mail::assertQueued(ContentMorningEmail::class, 1);
        $lines = [];
        Mail::assertQueued(ContentMorningEmail::class, function (ContentMorningEmail $mail) use (&$lines) {
            $lines = $mail->lines;

            return true;
        });

        return $lines;
    }

    public function test_at_eight_on_the_venues_clock_the_poster_gets_todays_posts_with_links_once_a_day(): void
    {
        $this->optIn($this->staffMember, ['name' => 'Sam']);
        $evening = $this->makePost(['scheduled_date' => '2026-10-05', 'scheduled_time' => '18:00', 'title' => 'Autumn offer', 'status' => 'approved', 'poster_id' => $this->staffMember->id]);
        $this->makePost(['scheduled_date' => '2026-10-05', 'hook' => 'Three colours', 'poster_id' => $this->staffMember->id]);
        $this->makePost(['scheduled_date' => '2026-10-02', 'poster_id' => $this->staffMember->id]);
        $this->makePost(['scheduled_date' => '2026-10-05', 'title' => 'Not mine', 'poster_id' => $this->manager->id]);

        $this->artisan('content:send-morning-email')->assertSuccessful();

        $lines = $this->onlyEmail();
        Mail::assertQueued(ContentMorningEmail::class, fn (ContentMorningEmail $mail) => $mail->hasTo($this->staffMember->email));
        $base = rtrim((string) config('app.url'), '/');
        $this->assertSame("Today's posts: Monday, 5 October", $lines['subject']);
        $this->assertSame('Good morning, Sam.', $lines['greeting']);
        $this->assertCount(1, $lines['brands']);
        $posts = $lines['brands'][0]['posts'];
        $this->assertSame(['Three colours', 'Autumn offer'], array_column($posts, 'title'));
        $this->assertSame(['Any time', '18:00'], array_column($posts, 'time'));
        $this->assertSame(['Draft', 'Approved'], array_column($posts, 'status'));
        $this->assertSame('Instagram', $posts[1]['platform']);
        $this->assertSame("{$base}/content/posts/{$evening->id}?brand_id={$this->brandId}", $posts[1]['url']);
        $this->assertSame('Earlier posts not marked as posted yet: 1', $lines['brands'][0]['missed']);
        $this->assertSame("{$base}/content", $lines['openUrl']);
        $html = (new ContentMorningEmail($lines))->render();
        $this->assertStringContainsString('lang="en"', $html);
        $this->assertStringContainsString('Autumn offer', $html);
        $this->assertNotNull($this->staffMember->fresh()->content_morning_email_last_sent_at);

        // Later in the same hour: once a day.
        $this->travelTo(CarbonImmutable::parse('2026-10-05 05:40:00'));
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertQueued(ContentMorningEmail::class, 1);

        // The next morning at eight, again: the venue's new day (the posts are now not marked as posted).
        $this->travelTo(CarbonImmutable::parse('2026-10-06 05:00:00'));
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertQueued(ContentMorningEmail::class, 2);
    }

    public function test_no_email_off_the_hour_without_the_switch_for_an_inactive_member_or_with_nothing_to_say(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued(); // not switched on

        $this->optIn($this->staffMember);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00')); // 9 am in Riga
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();

        $this->travelTo(CarbonImmutable::parse('2026-10-05 05:00:00'));
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['is_active' => false]);
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();

        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['is_active' => true]);
        $post->update(['status' => 'published']);
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();
        $this->assertNull($this->staffMember->fresh()->content_morning_email_last_sent_at, 'nothing sent, nothing stamped');
    }

    public function test_a_manager_gets_the_posts_nobody_posts_across_their_brands_in_their_language(): void
    {
        $this->optIn($this->manager, ['language' => 'de', 'name' => 'Mia']);
        $this->makePost(['scheduled_date' => '2026-10-05', 'title' => 'Ohne Poster']);
        [$secondId, $second] = $this->secondBrand();
        app()->instance('current_brand_id', $secondId);
        ContentPlannerPost::create(['planner_profile_id' => $second->id, 'brand_id' => $secondId, 'platform' => 'linkedin', 'status' => 'draft', 'title' => 'Zweite Marke', 'scheduled_date' => '2026-10-05']);
        app()->instance('current_brand_id', $this->brandId);

        $this->artisan('content:send-morning-email')->assertSuccessful();

        $lines = $this->onlyEmail();
        $this->assertSame('de', $lines['locale']);
        $this->assertSame('Heutige Beiträge: Montag, 5. Oktober', $lines['subject']);
        $this->assertSame('Guten Morgen, Mia.', $lines['greeting']);
        $this->assertCount(2, $lines['brands']);
        $this->assertSame('Ohne Poster', $lines['brands'][0]['posts'][0]['title']);
        $this->assertSame('Second Studio', $lines['brands'][1]['name']);
        $this->assertSame('Zweite Marke', $lines['brands'][1]['posts'][0]['title']);
        $this->assertSame('Entwurf', $lines['brands'][1]['posts'][0]['status']);
        $this->assertStringEndsWith("?brand_id={$secondId}", $lines['brands'][1]['posts'][0]['url']);
    }

    public function test_an_organisation_with_content_switched_off_or_on_an_appointments_plan_gets_none(): void
    {
        $this->optIn($this->staffMember);
        $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->org->setWorkspace('content', false);
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();

        $this->org->setWorkspace('content', true);
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();
    }

    public function test_the_email_is_scheduled_every_hour(): void
    {
        $this->artisan('schedule:list')->expectsOutputToContain('content:send-morning-email')->assertSuccessful();
    }
}
```

- [ ] **Step 2: Run them to see them fail**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Unit/Content/MorningEmailWordsTest.php tests/Feature/Content/MorningEmailTest.php
```

Expected: both `exit 1` — no `lang/*/content_morning.php`, no command `content:send-morning-email`.

- [ ] **Step 3: The words, in five languages**

Write `lang/en/content_morning.php` with the Write tool:

```php
<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
// Status and platform words are the portal's own (frontend/src/content/i18n/content.en.json).
return [
    'date_format' => 'dddd, D MMMM',
    'subject'     => "Today's posts: :date",
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Good morning, :name.',
    'intro'       => 'Here is what is planned for you today.',
    'any_time'    => 'Any time',
    'untitled'    => 'Untitled post',
    'missed'      => 'Earlier posts not marked as posted yet: :count',
    'open'        => 'Open HexaTech Content',
    'footer'      => 'You get this email because you switched on the morning email in HexaTech Content. You can switch it off in the Content menu.',
    'status'      => [
        'idea' => 'Idea', 'draft' => 'Draft', 'needs_review' => 'Needs review', 'needs_visual' => 'Needs visual', 'approved' => 'Approved',
        'ready_to_publish' => 'Ready', 'published' => 'Published', 'skipped' => 'Skipped', 'archived' => 'Archived',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Blog', 'email' => 'Email',
    ],
];
```

Write `lang/ru/content_morning.php` with the Write tool:

```php
<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
return [
    'date_format' => 'dddd, D MMMM',
    'subject'     => 'Публикации на сегодня: :date',
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Доброе утро, :name.',
    'intro'       => 'Вот что запланировано для вас на сегодня.',
    'any_time'    => 'В любое время',
    'untitled'    => 'Пост без названия',
    'missed'      => 'Прошлые посты, ещё не отмеченные как опубликованные: :count',
    'open'        => 'Открыть HexaTech Content',
    'footer'      => 'Вы получаете это письмо, потому что включили утреннее письмо в HexaTech Content. Отключить его можно в меню Content.',
    'status'      => [
        'idea' => 'Идея', 'draft' => 'Черновик', 'needs_review' => 'На проверке', 'needs_visual' => 'Нужен визуал', 'approved' => 'Одобрен',
        'ready_to_publish' => 'Готов', 'published' => 'Опубликован', 'skipped' => 'Пропущен', 'archived' => 'В архиве',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Блог', 'email' => 'Эл. почта',
    ],
];
```

Write `lang/de/content_morning.php` with the Write tool:

```php
<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
return [
    'date_format' => 'dddd, D. MMMM',
    'subject'     => 'Heutige Beiträge: :date',
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Guten Morgen, :name.',
    'intro'       => 'Das ist heute für Sie geplant.',
    'any_time'    => 'Jederzeit',
    'untitled'    => 'Beitrag ohne Titel',
    'missed'      => 'Frühere Beiträge, noch nicht als veröffentlicht markiert: :count',
    'open'        => 'HexaTech Content öffnen',
    'footer'      => 'Sie erhalten diese E-Mail, weil Sie die Morgen-E-Mail in HexaTech Content eingeschaltet haben. Im Content-Menü können Sie sie ausschalten.',
    'status'      => [
        'idea' => 'Idee', 'draft' => 'Entwurf', 'needs_review' => 'Zur Prüfung', 'needs_visual' => 'Bild fehlt', 'approved' => 'Freigegeben',
        'ready_to_publish' => 'Bereit', 'published' => 'Veröffentlicht', 'skipped' => 'Übersprungen', 'archived' => 'Archiviert',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Blog', 'email' => 'E-Mail',
    ],
];
```

Write `lang/fr/content_morning.php` with the Write tool:

```php
<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
return [
    'date_format' => 'dddd D MMMM',
    'subject'     => 'Publications du jour : :date',
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Bonjour :name,',
    'intro'       => "Voici ce qui est prévu pour vous aujourd'hui.",
    'any_time'    => "N'importe quand",
    'untitled'    => 'Publication sans titre',
    'missed'      => 'Publications précédentes pas encore marquées comme publiées : :count',
    'open'        => 'Ouvrir HexaTech Content',
    'footer'      => "Vous recevez cet e-mail parce que vous avez activé l'e-mail du matin dans HexaTech Content. Vous pouvez le désactiver dans le menu de Content.",
    'status'      => [
        'idea' => 'Idée', 'draft' => 'Brouillon', 'needs_review' => 'À relire', 'needs_visual' => 'Visuel requis', 'approved' => 'Approuvée',
        'ready_to_publish' => 'Prête', 'published' => 'Publiée', 'skipped' => 'Ignorée', 'archived' => 'Archivée',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Blog', 'email' => 'E-mail',
    ],
];
```

Write `lang/es/content_morning.php` with the Write tool:

```php
<?php

// Every word of HexaTech Content's morning email (spec 2026-10-19 §4.5). Placeholders: :date, :name, :count.
return [
    'date_format' => 'dddd, D [de] MMMM',
    'subject'     => 'Publicaciones de hoy: :date',
    'eyebrow'     => 'HexaTech Content',
    'greeting'    => 'Buenos días, :name.',
    'intro'       => 'Esto es lo que tienes previsto para hoy.',
    'any_time'    => 'En cualquier momento',
    'untitled'    => 'Publicación sin título',
    'missed'      => 'Publicaciones anteriores aún no marcadas como publicadas: :count',
    'open'        => 'Abrir HexaTech Content',
    'footer'      => 'Recibes este correo porque activaste el correo de la mañana en HexaTech Content. Puedes desactivarlo en el menú de Content.',
    'status'      => [
        'idea' => 'Idea', 'draft' => 'Borrador', 'needs_review' => 'Por revisar', 'needs_visual' => 'Falta imagen', 'approved' => 'Aprobada',
        'ready_to_publish' => 'Lista', 'published' => 'Publicada', 'skipped' => 'Omitida', 'archived' => 'Archivada',
    ],
    'platform'    => [
        'linkedin' => 'LinkedIn', 'instagram' => 'Instagram', 'tiktok' => 'TikTok', 'facebook' => 'Facebook',
        'x' => 'X', 'youtube' => 'YouTube', 'blog' => 'Blog', 'email' => 'Correo',
    ],
];
```

- [ ] **Step 4: The digest, the email, the command, the schedule**

Write `app/Services/Content/ContentMorningDigest.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Http\Controllers\Api\V1\Admin\MeController;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * The morning email's words (spec 2026-10-19 §4.5): for each brand the person can use, today's posts the reminders
 * give them, each with a link that opens it in Content on its brand, and a line counting the ones not marked as
 * posted. Null when there is nothing to say. Every word is asked for in the person's language explicitly, so nothing
 * depends on the worker's own locale. The organisation is bound by the caller.
 */
final class ContentMorningDigest
{
    public const MAX_POSTS = 50;

    /** @return array<string, mixed>|null */
    public static function build(User $user, int $orgId, CarbonImmutable $venueNow): ?array
    {
        $locale = in_array($user->language, MeController::SUPPORTED_LANGUAGES, true) ? (string) $user->language : 'en';
        $t = fn (string $key, array $replace = []) => __("content_morning.{$key}", $replace, $locale);
        $base = rtrim((string) config('app.url'), '/');
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $brands = [];
        try {
            foreach (ContentContext::brandsFor($user) as $brand) {
                // Profiles and posts are brand-scoped: read each brand under its own binding.
                app()->instance('current_brand_id', (int) $brand->id);
                $profile = ContentPlannerProfile::where('brand_id', $brand->id)->first();
                if (!$profile) {
                    continue;
                }
                $posts = ContentReminders::today($user, $profile, $venueNow, true)
                    ->orderByRaw('CASE WHEN scheduled_time IS NULL THEN 0 ELSE 1 END')->orderBy('scheduled_time')->orderBy('id')
                    ->limit(self::MAX_POSTS)->get();
                $missed = ContentReminders::missed($user, $profile, $venueNow)->count();
                if ($posts->isEmpty() && $missed === 0) {
                    continue;
                }
                $brands[] = [
                    'name'   => (string) $brand->name,
                    'posts'  => $posts->map(fn (ContentPlannerPost $post) => [
                        'time'     => $post->scheduled_time ? substr((string) $post->scheduled_time, 0, 5) : $t('any_time'),
                        'platform' => $t("platform.{$post->platform}"),
                        'title'    => (string) ($post->title ?: ($post->hook ?: ($post->topic ?: $t('untitled')))),
                        'status'   => $t("status.{$post->status}"),
                        'url'      => "{$base}/content/posts/{$post->id}?brand_id={$brand->id}",
                    ])->values()->all(),
                    'missed' => $missed > 0 ? $t('missed', ['count' => $missed]) : null,
                ];
            }
        } finally {
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
        if ($brands === []) {
            return null;
        }
        $date = $venueNow->locale($locale)->isoFormat($t('date_format'));

        return [
            'locale'   => $locale,
            'subject'  => $t('subject', ['date' => $date]),
            'eyebrow'  => $t('eyebrow'),
            'heading'  => $date,
            'greeting' => $t('greeting', ['name' => (string) $user->name]),
            'intro'    => $t('intro'),
            'brands'   => $brands,
            'open'     => $t('open'),
            'openUrl'  => "{$base}/content",
            'footer'   => $t('footer'),
        ];
    }
}
```

Write `app/Mail/ContentMorningEmail.php` with the Write tool:

```php
<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** HexaTech Content's morning email (spec 2026-10-19 §4.5). Its words come ready from ContentMorningDigest. Queued. */
class ContentMorningEmail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $tries = 2;

    public $backoff = [120, 600];

    /** @param array<string, mixed> $lines */
    public function __construct(public array $lines)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: (string) $this->lines['subject']);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.content-morning', with: $this->lines);
    }
}
```

Write `resources/views/emails/content-morning.blade.php` with the Write tool:

```blade
{{-- HexaTech Content's morning email (spec 2026-10-19 §4.5). Inline styles, as every email: mail clients drop <style>. --}}
<!DOCTYPE html>
<html lang="{{ $locale }}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{{ $subject }}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c1e;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background:#1c1c1e;padding:24px 28px;color:#ffffff;">
            <p style="margin:0;font-size:12px;letter-spacing:1px;font-weight:700;color:#c9a84c;text-transform:uppercase;">{{ $eyebrow }}</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">{{ $heading }}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px;font-size:15px;line-height:1.5;">
            <p style="margin:0 0 8px;">{{ $greeting }}</p>
            <p style="margin:0 0 8px;color:#3c3c43;">{{ $intro }}</p>
            @foreach ($brands as $brand)
              <h2 style="margin:20px 0 8px;font-size:16px;font-weight:700;">{{ $brand['name'] }}</h2>
              @foreach ($brand['posts'] as $post)
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5ea;">
                  <tr>
                    <td style="padding:10px 12px 10px 0;width:72px;vertical-align:top;font-weight:700;white-space:nowrap;">{{ $post['time'] }}</td>
                    <td style="padding:10px 0;vertical-align:top;">
                      <a href="{{ $post['url'] }}" style="color:#1c1c1e;font-weight:600;text-decoration:underline;">{{ $post['title'] }}</a>
                      <div style="font-size:13px;color:#6e6e73;">{{ $post['platform'] }} · {{ $post['status'] }}</div>
                    </td>
                  </tr>
                </table>
              @endforeach
              @if ($brand['missed'])
                <p style="margin:10px 0 0;font-size:14px;color:#9a4400;">{{ $brand['missed'] }}</p>
              @endif
            @endforeach
            <p style="margin:28px 0 0;text-align:center;">
              <a href="{{ $openUrl }}" style="display:inline-block;background:#1c1c1e;color:#ffffff;padding:12px 24px;border-radius:10px;font-weight:600;text-decoration:none;">{{ $open }}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 24px;font-size:12px;color:#6e6e73;border-top:1px solid #e5e5ea;">{{ $footer }}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
```

Write `app/Console/Commands/SendContentMorningEmail.php` with the Write tool:

```php
<?php

namespace App\Console\Commands;

use App\Mail\ContentMorningEmail;
use App\Models\Organization;
use App\Models\Staff;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentMorningDigest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * HexaTech Content's morning email (spec 2026-10-19 §4.5), the loyalty digest's pattern: scheduled hourly; for each
 * opted-in staff member with an email and an active staff row, in an organisation that has Content, it sends at the
 * venue's 8 am (the clock Content's "today" uses), at most once a venue day, and only when there is something to say.
 *
 * `--force` skips the hour and once-a-day checks; `--hour=N` changes the hour; `--user=ID` targets one person.
 */
class SendContentMorningEmail extends Command
{
    protected $signature = 'content:send-morning-email
                            {--hour=8 : Venue hour to send at (0-23)}
                            {--user= : Send to one user id (testing)}
                            {--force : Skip the hour and once-a-day checks (testing)}';

    protected $description = "Send HexaTech Content's morning email to opted-in staff whose venue is at the send hour.";

    public function handle(): int
    {
        $hour = (int) $this->option('hour');
        if ($hour < 0 || $hour > 23) {
            $this->error('Invalid --hour, must be 0-23');

            return self::FAILURE;
        }
        $force = (bool) $this->option('force');
        $query = User::query()->where('user_type', 'staff')->where('wants_content_morning_email', true)->whereNotNull('email')
            ->when($this->option('user'), fn ($q, $id) => $q->where('id', $id));
        $sent = 0;
        $skipped = 0;
        $failed = 0;

        $query->chunkById(100, function ($users) use (&$sent, &$skipped, &$failed, $hour, $force) {
            foreach ($users as $user) {
                $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
                try {
                    $this->sendTo($user, $hour, $force) ? $sent++ : $skipped++;
                } catch (\Throwable $e) {
                    $failed++;
                    Log::warning("Content morning email failed for user {$user->id}: " . $e->getMessage());
                } finally {
                    $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
                }
            }
        });

        $this->info("Content morning email run: sent={$sent} skipped={$skipped} failed={$failed}");

        return self::SUCCESS;
    }

    /** True when the email was queued. */
    private function sendTo(User $user, int $hour, bool $force): bool
    {
        $org = Organization::withoutGlobalScopes()->find($user->organization_id);
        if (!$org || !$org->workspaceEnabled('content') || $org->appointmentsOnly()) {
            return false;
        }
        // Staff, brands, profiles and posts are tenant-scoped: read under the person's organisation.
        app()->instance('current_organization_id', (int) $org->id);
        if (!Staff::where('user_id', $user->id)->where('is_active', true)->exists()) {
            return false;
        }
        $venueNow = VenueClock::now((int) $org->id);
        if (!$force && (int) $venueNow->format('G') !== $hour) {
            return false;
        }
        $last = $user->content_morning_email_last_sent_at;
        if (!$force && $last !== null
            && $last->copy()->setTimezone(VenueClock::zone((int) $org->id))->format('Y-m-d') === $venueNow->format('Y-m-d')) {
            return false;
        }
        $lines = ContentMorningDigest::build($user, (int) $org->id, $venueNow);
        if ($lines === null) {
            return false;
        }
        Mail::to($user->email, $user->name ?: null)->queue(new ContentMorningEmail($lines));
        $user->forceFill(['content_morning_email_last_sent_at' => now()])->save();

        return true;
    }
}
```

In `routes/console.php`, replace:

```php
Schedule::command('loyalty:send-digest')
    ->hourly()
    ->withoutOverlapping(10);
```

with:

```php
Schedule::command('loyalty:send-digest')
    ->hourly()
    ->withoutOverlapping(10);

// HexaTech Content's morning email (spec 2026-10-19 §4.5) — the same hourly + venue-clock + once-a-day pattern,
// its own opt-in (users.wants_content_morning_email): today's posts for whoever posts them.
Schedule::command('content:send-morning-email')
    ->hourly()
    ->withoutOverlapping(10);
```

- [ ] **Step 5: Run the tests, then the Content folders**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; "$R5/php.sh" tests/Unit/Content/MorningEmailWordsTest.php tests/Feature/Content/MorningEmailTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `MorningEmailWordsTest | Tests:    2 passed`, `MorningEmailTest | Tests:    5 passed`; both folders `exit 0` (Feature Content 219 + 5 = 224, Unit Content 74 + 2 = 76).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentMorningDigest.php app/Mail/ContentMorningEmail.php resources/views/emails/content-morning.blade.php lang/en/content_morning.php lang/ru/content_morning.php lang/de/content_morning.php lang/fr/content_morning.php lang/es/content_morning.php app/Console/Commands/SendContentMorningEmail.php routes/console.php tests/Unit/Content/MorningEmailWordsTest.php tests/Feature/Content/MorningEmailTest.php && git commit -q -m "Content: the morning email — today's posts at 8 am venue time, opted-in staff only, five languages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 7: The runbook and the regression run

**Files:**
- Modify: `docs/content-workspace.md`

- [ ] **Step 1: The runbook**

In `docs/content-workspace.md`:

1. Replace:

```markdown
  `generation_failed`, `already_repeating`, `no_day`, `too_many_snippets`, and from release 4b `needs_approval`,
  `approvals_off`, `wrong_status` and `not_yours`.
```

with:

```markdown
  `generation_failed`, `already_repeating`, `no_day`, `too_many_snippets`, from release 4b `needs_approval`,
  `approvals_off`, `wrong_status` and `not_yours`, and from release 5a `version_exists`.
```

2. Replace:

```markdown
| For you | `GET inbox`, `GET inbox/count`, `POST inbox/seen` (`at`: the list's `read_at`) | everyone |
```

with:

```markdown
| For you | `GET inbox`, `GET inbox/count`, `POST inbox/seen` (`at`: the list's `read_at`) | everyone |
| Versions | `POST posts/{id}/versions` (`platforms`, `ai`), `DELETE posts/{id}/group` | everyone |
| Team | `GET team` (the brand's active staff: names and roles); `poster_id` on `POST posts`, `PUT posts/{id}`, `POST posts/{id}/move` | everyone |
| Morning email | `PUT me/morning-email` (`on`); also `wants_content_morning_email` in `PUT admin/me/preferences` | each person, for themselves |
```

3. Replace:

```markdown
  "Seen" takes the list's `read_at`, so news that came in while the list was open stays new (`InboxTest`).
```

with:

```markdown
  "Seen" takes the list's `read_at`, so news that came in while the list was open stays new (`InboxTest`).
- **Versions** (release 5a; `ContentVersions`): `group_id` holds the original's id. A version is a draft on the
  original's day and time with its words, poster and its own copy of the visual brief (the same picture file: Content
  never deletes pictures); one per platform in a group (`version_exists`); joining or leaving a group never changes a
  post's `updated_at`; a group of one is not shown. With `ai`, the budget is checked before anything is made, then
  `AdaptPostVersions` adapts one version per run with the platform's rules (`ContentPlatformRules`, shared with the
  post writer); at the cap or on an AI failure the rest keep the original's words and the panel says so
  (`kept_original`, `kept_reason`); a version a person changed keeps their words (`VersionsTest`, `VersionsAdaptTest`).
- **Who posts it** (`ContentTeam`): a member of the brand's team — active staff with no brand rows or a row for the
  brand. Someone who left or was switched off counts as nobody (the panel shows nobody; their post still saves with
  them sent again). It is not a change of words. While approvals are on, the post's own poster may Mark published an
  Approved or Ready post; every other staff case is refused as before (`PosterTest`).
- **Reminders** (`ContentReminders`): in the bell, "to post today" from the day's start or the post's time (venue
  clock) and "not marked as posted" for the seven days after, for the poster — or, when nobody on the team posts it,
  the brand's managers — until the post is published, skipped, archived or moved; they count while they last
  (`RemindersTest`).
- **The morning email** (`content:send-morning-email`, hourly): opted-in staff with an email and an active staff row,
  in organisations with Content (not switched off, not Appointments-only), at 8 am venue time, once a venue day, only
  when they have posts today or posts not marked as posted; words in the person's language from
  `lang/*/content_morning.php`, links open the post on its brand (`?brand_id=`) (`MorningEmailTest`).
```

4. Replace:

```markdown
No email notices, mentions or attachments (approvals, comments and the bell live in the app), no publishing to social networks,
```

with:

```markdown
No email notices other than the opt-in morning email, no mentions or attachments (approvals, comments, reminders and the bell live in the app), no publishing to social networks,
```

5. Replace:

```markdown
  approve one and send one back as a manager, add a comment, and look at both bells; switch Approvals off again if the
  team does not want them yet; reload admin tabs left open.
```

with:

```markdown
  approve one and send one back as a manager, add a comment, and look at both bells; switch Approvals off again if the
  team does not want them yet; reload admin tabs left open.
- Release 5a (server, Plan 5A-1): two additive migrations (`content_planner_posts.group_id` and `poster_id`;
  `users.wants_content_morning_email` and `content_morning_email_last_sent_at`) and one hourly scheduled command,
  `content:send-morning-email`. The email is off for everyone until they switch it on. The queue must be running for
  versions adapted by AI (`AdaptPostVersions`, one AI call per run, 80 s) and for the email (`ContentMorningEmail`).
- Verify release 5a by content (after Plan 5A-2's deploy): `/api/v1/admin/content/team` answers 401 when signed out
  (404 before release 5a); `php artisan schedule:list` lists `content:send-morning-email`.
```

- [ ] **Step 2: The regression run**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; cd /c/wamp64/www/Hexa-Tech-content && "$R5/php.sh" tests/Feature/Content/ tests/Unit/Content/ tests/Feature/ContentCalendar/ tests/Feature/AdminAccess/ tests/Unit/Support/ | tee "$R5/final-php.txt"
```

Expected: five lines, each `exit 0` (Feature Content = 194 at release 4b + 30 from this plan = 224; Unit Content 71 + 5 = 76; ContentCalendar 12; AdminAccess 51; Unit Support 177).

- [ ] **Step 3: Commit and ledger**

```bash
R5=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-1; cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -m "Runbook: release 5a's server (versions, who posts it, reminders, the morning email)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && echo "Task 7: note: regression $(grep -c 'exit 0' "$R5/final-php.txt")/5 paths green (final-php.txt)" >> "$R5/progress.md"
```
