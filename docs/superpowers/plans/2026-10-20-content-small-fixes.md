# HexaTech Content — Small-Fixes Batch after Release 5 (owner rulings of 2026-10-20) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every deferred minor of Plans 5A-1, 5A-2, 5B-1 and 5B-2, carry out the owner's answers of 2026-10-20 (referral tags for email and blog, a better robot rule, the three approval questions, the queue check), prove it, and deploy it under the owner's standing "deploy without asking".

**Architecture:** Four server tasks (tracked links; one write per save and one post per platform in a group; the bio page; approvals, the bell and the queue), two portal tasks (the link-in-bio editor and copy buttons; Plan, Ideas, versions and the bell), then the documents, the release checks and the deploy. Each fix is pinned by a test that fails first. Nothing changes the database's shape: no migration.

**Tech Stack:** Laravel 13 / PHP 8.4.20 (tests on SQLite in memory, `DatabaseTransactions` + `SetsUpContentSchema`); React 19 + TypeScript + Vite, TanStack Query v5, react-i18next (five bundles); vitest in node with `renderToStaticMarkup` (no DOM: timers and caret logic are tested as pure helpers).

**Spec:** `docs/superpowers/specs/2026-10-19-content-release-5-design.md` (release 5, approved 2026-10-19) and `docs/superpowers/specs/2026-10-16-content-release-4-design.md` (approvals, §6–§8). The owner's message of 2026-10-20 rules on top of both:
- "fix all mentioned small issues";
- email and blog posts: "referral is ok";
- Pinterest robot rule: "do as better";
- short links on the shared domain: "yes, it is acceptable" (no change);
- the after-deploy checks, the queue retry check, the three approval questions and the deferred minors: "approve all do as it is best to do".

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `dfb7134ba` (= the source deployed as prod main `162b63d75`, release 5b). The deferred minors are listed in `.superpowers/sdd/archive/2026-10-19-content-release-{5a-1,5a-2,5b-1,5b-2}/progress.md` and the approval questions in `.superpowers/sdd/archive/2026-10-18-content-release-4b-1/progress.md`.

**Decisions this plan takes for the owner ("do as it is best"):**
- **Deactivated team members keep their name** in the timeline and the bell; "Former team member" only when the user row is deleted. The record of who said what stays true. Spec 2026-10-16 §7.1 is reworded to match; no code change.
- **"Sent back" ends only when someone works on the post.** A quality check and joining a repeat series no longer move the post's version (`updated_at`), as joining a group of versions already does not. A save, a move, Write with AI or a new picture still end it.
- **Send for approval on a post already in review does nothing**: no second step and no second bell item. It answers 200 with the post. The portal already does not offer it.
- **Queue `retry_after` becomes 660 s** on the database, redis and beanstalkd connections, overridable by `DB_QUEUE_RETRY_AFTER`, `REDIS_QUEUE_RETRY_AFTER` and `BEANSTALKD_QUEUE_RETRY_AFTER`. 660 s is longer than the longest job may run (`GenerateContentStrategy`, 600 s); a guard test keeps it so. The cost: a job whose worker died is retried after 11 minutes instead of 90 s.
- **Robots:** Pinterest's crawler only (`pinterestbot`, `Pinterest/0.x`), not its in-app browser. Also named: VK, Mastodon, Bluesky (`Cardyb`), Iframely and Embedly preview fetchers. A prefetch (`Sec-Purpose`, `Purpose` or `X-Purpose` naming prefetch or preview, or `X-Moz: prefetch`) is not counted, as HEAD is not.
- **After-deploy checks for releases 2–5a:** every check that needs no account is done at this deploy, by content on the live site, for all releases. The checks that need a person signed in to a real brand stay the owner's and are listed once in the runbook.

## Global Constraints

- **Branch:** never push the feature branch; never commit its built `frontend/dist`, `public/spa` or `resources/spa-shell`. Only Task 9 pushes. It pushes without a question (the owner's standing go, memory `deploy-without-asking`), but only when every check is green and every guard holds. A guard that trips, a failed check or anything destructive stops it.
- **PHP:** always `/c/wamp64/bin/php/php8.4.20/php.exe`; never a bare `artisan test`. Run by path with `$R/php.sh <path>…` (each path alone, honest exit code). `php artisan view:clear` after a Blade change, before testing it.
- **Ledger and tools:** `$R` = `/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes`. Shell state does not survive between tool calls, so every command that uses it starts with `R=…`. Task 1, Step 1 copies `vt.sh`, `php.sh`, `words.mjs` and the `tools/` folder (Playwright and Lighthouse scripts, `node_modules` kept) from `.superpowers/sdd/archive/2026-10-19-content-release-5b-2/`.
- **Frontend:** types `cd frontend && npx tsc -b`; tests `$R/vt.sh <paths…>` (relative to `frontend/`); scoped lint `cd frontend && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts`.
- **Baselines:** the full vitest run has exactly 3 failures (`src/lib/plannerMeta.test.ts`); the scoped lint has exactly 17 errors.
- **Words:** every new or changed portal sentence goes into all five bundles (`frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`) and, for a refusal, into `lib/errors.ts` (whose fallbacks `errors.test.ts` keeps equal to the English bundle). New keys go in with `node $R/words.mjs <spec.json>`. A changed sentence is edited in place with the Edit tool in each bundle (`words.mjs` refuses to change words).
- **Edits:** prefer the Edit tool (CRLF and cp1252 hazards); documents with the Write tool, never a heredoc.
- **Commits:** one per task (more where a task says), message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A save that fails half-way**: a link write that throws after the post's fields are filled must leave the post exactly as it was, with no approval step recorded. Task 2 pins it for create and update.
2. **A version moved onto a platform its group already has**, by a save from a stale tab: refused 409 `version_exists`, and the panel marks Platform with the save family's words. Tasks 2 and 6 pin it.
3. **The bio editor's marks after a move**: a mark must follow its row, not its number, including a server refusal keyed `buttons.1.label`. Task 5 pins it with `keyedMarks`.
4. **Pinterest app users**: a tap in the app's browser (`[Pinterest/iOS]`, `[Pinterest/Android]`) is counted; the crawler (`Pinterestbot`, `Pinterest/0.2`) is not. Task 1 pins both.
5. **The morning email switch read after a reopen**: the switch must show the saved state even before the bootstrap is read again. Task 6 pins it by writing the answer into the cached bootstrap.

---

### Task 1: Tracked links — tags by platform, a better robot rule, prefetches not counted (server)

**Files:**
- Modify: `app/Services/Content/ContentLinks.php` (`postTags`)
- Modify: `app/Services/Content/ContentLinkClicks.php` (`ROBOTS`, new `counts()`)
- Modify: `app/Http/Controllers/ContentPublic/GoController.php`
- Test: `tests/Unit/Content/ContentLinksTest.php`, `tests/Feature/Content/LinkRedirectTest.php`

**Interfaces:**
- Produces: `ContentLinks::postTags(string $platform, ?string $campaign, int $postId): array` — `utm_medium` is `referral` for `email` and `blog`, `social` otherwise. `ContentLinkClicks::counts(Illuminate\Http\Request $request): bool` — false for HEAD, a robot or a prefetch.

- [ ] **Step 1: Set up the workspace and tools**

```bash
cd /c/wamp64/www/Hexa-Tech-content && P=docs/superpowers/plans/2026-10-20-content-small-fixes.md
W=$(/c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace "$P"); echo "$W"
A=.superpowers/sdd/archive/2026-10-19-content-release-5b-2; cp $A/vt.sh $A/php.sh $A/words.mjs "$W/" && cp -r $A/tools "$W/tools" && chmod +x "$W"/*.sh && ls "$W"
```

Expected: the workspace path ends with `2026-10-20-content-small-fixes`; `vt.sh php.sh words.mjs tools` listed. Create `$R/progress.md` with first line `# SDD ledger — plan: docs/superpowers/plans/2026-10-20-content-small-fixes.md` and a line `Pre-flight: no shared interfaces between tasks beyond Task 2 → Task 6 (save.version_exists) and Task 4 → Task 6 (morning switch words); both named in the tasks`.

- [ ] **Step 2: Write the failing tests**

In `tests/Unit/Content/ContentLinksTest.php`, add after the test that calls `ContentLinks::postTags('linkedin', 'Autumn Offer 2026!', 7)`:

```php
    // Owner, 2026-10-20: an email or blog post's clicks are a referral in Google Analytics, not social.
    public function test_email_and_blog_posts_are_tagged_as_a_referral_and_every_other_platform_as_social(): void
    {
        $this->assertSame('referral', ContentLinks::postTags('email', null, 7)['utm_medium']);
        $this->assertSame('referral', ContentLinks::postTags('blog', 'Spring', 7)['utm_medium']);
        foreach (['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube'] as $platform) {
            $this->assertSame('social', ContentLinks::postTags($platform, null, 7)['utm_medium'], $platform);
        }
        $this->assertSame('email', ContentLinks::postTags('email', null, 7)['utm_source']);
    }
```

In `tests/Feature/Content/LinkRedirectTest.php`, add after `test_robots_and_head_requests_are_sent_on_but_not_counted`:

```php
    // Owner, 2026-10-20 ("do as better"): Pinterest's crawler is a robot, a person tapping in Pinterest's app is not;
    // the preview fetchers of VK, Mastodon, Bluesky, Iframely and Embedly are robots; a prefetch is not a click.
    public function test_people_in_pinterests_app_are_counted_and_its_crawler_previews_and_prefetches_are_not(): void
    {
        $link = $this->link();
        $robots = [
            'Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)', 'Pinterest/0.2 (+https://www.pinterest.com/bot.html)',
            'vkShare; +http://vk.com/dev/Share', 'Mastodon/4.3.0 (http.rb/5.2.0; +https://mastodon.social/)',
            'Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)', 'Iframely/1.3.1 (+https://iframely.com/docs/about)',
            'Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)',
        ];
        foreach ($robots as $agent) {
            $this->withHeaders(['User-Agent' => $agent])->get($this->go($link->code))->assertStatus(302);
        }
        $chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
        foreach ([['Sec-Purpose' => 'prefetch'], ['Sec-Purpose' => 'prefetch;prerender'], ['Purpose' => 'prefetch'], ['X-Purpose' => 'preview'], ['X-Moz' => 'prefetch']] as $headers) {
            $this->withHeaders($headers + ['User-Agent' => $chrome])->get($this->go($link->code))->assertStatus(302);
        }
        $this->assertSame([], $this->clicks($link));

        $this->withHeaders(['User-Agent' => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]'])
            ->get($this->go($link->code))->assertStatus(302);
        $this->withHeaders(['User-Agent' => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 [Pinterest/Android]'])
            ->get($this->go($link->code))->assertStatus(302);
        $this->assertSame(['2026-10-05 direct' => 2], $this->clicks($link));
    }
```

- [ ] **Step 3: Run them to see them fail**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/php.sh tests/Unit/Content/ContentLinksTest.php tests/Feature/Content/LinkRedirectTest.php`
Expected: both files exit 1. The unit test fails with `'referral'` expected, `'social'` given. The feature test fails on the clicks: the prefetches and VK/Mastodon/Iframely are counted, and the Pinterest app taps are not.

- [ ] **Step 4: Implement**

In `ContentLinks::postTags`, replace `'utm_medium'   => 'social',` with:

```php
            // Owner, 2026-10-20: an email or a blog post sends readers from outside social networks.
            'utm_medium'   => in_array($platform, ['email', 'blog'], true) ? 'referral' : 'social',
```

and add to its docblock (or create one): `/** A post's tags (spec 2026-10-19 §5.2): the platform, social — referral for email and blog —, the campaign's slug and the post. */`.

In `ContentLinkClicks`, replace the `ROBOTS` constant and add `counts()` after `isRobot()`:

```php
    /**
     * Link-preview robots by name, and anything that calls itself a robot (§5.4). Pinterest by its crawler only
     * (`Pinterestbot`, `Pinterest/0.x`): people tapping inside Pinterest's app carry `[Pinterest/iOS]` and are counted
     * (owner, 2026-10-20).
     */
    public const ROBOTS = '/facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|pinterestbot|pinterest\/0\.|applebot|vkshare|mastodon\/|cardyb|iframely|embedly|bot|crawl|spider|preview|headless/i';

    /** Whether a request on a short link is a click: not a HEAD request, not a robot, not a prefetch (owner, 2026-10-20). */
    public static function counts(Request $request): bool
    {
        if ($request->isMethod('HEAD') || self::isRobot($request->userAgent())) {
            return false;
        }
        $purpose = strtolower(implode(' ', array_filter([
            $request->header('Sec-Purpose'), $request->header('Purpose'), $request->header('X-Purpose'), $request->header('X-Moz'),
        ])));

        return !str_contains($purpose, 'prefetch') && !str_contains($purpose, 'preview');
    }
```

with `use Illuminate\Http\Request;` among the imports, and the class docblock's second sentence changed to `HEAD requests, robots and prefetches are not counted.`

In `GoController::show`, replace `if (!$request->isMethod('HEAD') && !ContentLinkClicks::isRobot($request->userAgent())) {` with `if (ContentLinkClicks::counts($request)) {`.

- [ ] **Step 5: Run them to see them pass, then the folders**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/php.sh tests/Unit/Content/ tests/Feature/Content/LinkRedirectTest.php tests/Feature/Content/LinksTest.php tests/Feature/Content/LinkCopiesTest.php`
Expected: every path `exit 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentLinks.php app/Services/Content/ContentLinkClicks.php app/Http/Controllers/ContentPublic/GoController.php tests/Unit/Content/ContentLinksTest.php tests/Feature/Content/LinkRedirectTest.php && git commit -q -m "Content links: email and blog posts are a referral; people in Pinterest's app count, previews and prefetches do not" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format='%h %s'
```

---

### Task 2: One write per save, one post per platform in a group, each kept version its own reason (server)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/PostController.php` (`store`, `update`)
- Modify: `app/Services/Content/ContentVersions.php` (`lockGroup`, `assertPlatformFree`, `make`, `keep`, `describe`)
- Test: `tests/Feature/Content/LinksTest.php`, `tests/Feature/Content/VersionsTest.php`, `tests/Feature/Content/VersionsAdaptTest.php`

**Interfaces:**
- Produces: `ContentVersions::lockGroup(ContentPlannerPost $post): int` — locks the group's key post (the post whose id is `group_id`, or the post itself without a group) inside the caller's transaction, refreshes `$post`, returns the key id. `ContentVersions::assertPlatformFree(ContentPlannerPost $post, string $platform): void` — throws `ContentRefused('version_exists', …, 409)` when another post of its group is on `$platform`. A refusal code `version_exists` on `PUT posts/{id}` (Task 6 shows it).

- [ ] **Step 1: Write the failing tests**

Append to `tests/Feature/Content/LinksTest.php` (inside the class, before its closing brace; add `use App\Models\ContentLink;`, `use App\Models\ContentPlannerPost;` and `use App\Models\ContentPlannerPostEvent;` to its imports where missing):

```php
    // 5B-1 review: a post save and its Link are one write — a Link that cannot be written leaves the post as it was.
    public function test_a_save_whose_short_link_cannot_be_written_changes_nothing(): void
    {
        ContentLink::creating(fn () => throw new \RuntimeException('the link store is down'));
        $posts = ContentPlannerPost::count();
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'New', 'link' => 'https://lumiere.example/new'])->assertStatus(500);
        $this->assertSame($posts, ContentPlannerPost::count());

        $this->profile->forceFill(['requires_approval' => true])->save();
        $post = $this->makePost(['status' => 'draft', 'topic' => 'Before']);
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), [
            'updated_at' => $post->updated_at->toISOString(), 'topic' => 'After', 'status' => 'needs_review', 'link' => 'https://lumiere.example/after',
        ])->assertStatus(500);
        $this->assertSame('Before', $post->fresh()->topic);
        $this->assertSame('draft', $post->fresh()->status);
        $this->assertSame(0, ContentPlannerPostEvent::where('post_id', $post->id)->count());
        ContentLink::flushEventListeners();
    }
```

Append to `tests/Feature/Content/VersionsTest.php` (add `use App\Services\Content\ContentVersions;` and `use Illuminate\Support\Facades\DB;` where missing):

```php
    // 5A-1 review: a group holds one post per platform — also after a save that changes a version's platform.
    public function test_a_version_cannot_be_moved_to_a_platform_its_group_already_has(): void
    {
        $original = $this->makePost(['platform' => 'instagram']);
        $this->asStaffMember()->postJson($this->api("posts/{$original->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();
        $version = ContentPlannerPost::where('group_id', $original->id)->where('id', '!=', $original->id)->firstOrFail();

        $this->asStaffMember()->putJson($this->api("posts/{$version->id}"), ['updated_at' => $version->updated_at->toISOString(), 'platform' => 'instagram'])
            ->assertStatus(409)->assertJsonPath('error', 'version_exists');
        $this->assertSame('linkedin', $version->fresh()->platform);
        $this->asStaffMember()->putJson($this->api("posts/{$version->id}"), ['updated_at' => $version->updated_at->toISOString(), 'platform' => 'facebook'])
            ->assertOk()->assertJsonPath('post.platform', 'facebook');
        // A post outside any group changes platform freely.
        $alone = $this->makePost(['platform' => 'instagram']);
        $this->asStaffMember()->putJson($this->api("posts/{$alone->id}"), ['updated_at' => $alone->updated_at->toISOString(), 'platform' => 'linkedin'])->assertOk();
    }

    // 5A-1 review: Make versions from two posts of one group at once must wait on the same lock: the group's key post.
    public function test_make_versions_locks_the_groups_key_post_whichever_of_its_posts_it_is_called_from(): void
    {
        $original = $this->makePost(['platform' => 'instagram']);
        $this->asStaffMember()->postJson($this->api("posts/{$original->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();
        $version = ContentPlannerPost::where('group_id', $original->id)->where('id', '!=', $original->id)->firstOrFail();
        $alone = $this->makePost(['platform' => 'instagram']);

        DB::transaction(function () use ($original, $version, $alone) {
            $this->assertSame((int) $original->id, ContentVersions::lockGroup($version));
            $this->assertSame((int) $original->id, ContentVersions::lockGroup($original));
            $this->assertSame((int) $alone->id, ContentVersions::lockGroup($alone));
        });
    }
```

Append to `tests/Feature/Content/VersionsAdaptTest.php` (add `use App\Models\ContentPlannerPost;` and `use App\Services\Content\ContentVersions;` where missing):

```php
    // 5A-1 review: a later batch that stopped for another reason must not relabel the versions kept earlier.
    public function test_each_kept_version_keeps_its_own_reason(): void
    {
        $original = $this->makePost(['platform' => 'instagram']);
        $versions = ContentVersions::make($original, ['linkedin', 'facebook'], $this->staffMember->id);
        [$first, $second] = [(int) $versions[0]->id, (int) $versions[1]->id];

        ContentVersions::keep((int) $original->id, [$first], 'budget');
        ContentVersions::keep((int) $original->id, [$second], 'ai_failed');

        $this->assertSame('budget', ContentVersions::describe(ContentPlannerPost::findOrFail($first))['kept_reason']);
        $this->assertSame('ai_failed', ContentVersions::describe(ContentPlannerPost::findOrFail($second))['kept_reason']);
        $this->assertSame([$first, $second], ContentVersions::describe(ContentPlannerPost::findOrFail($first))['kept_original']);
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/php.sh tests/Feature/Content/LinksTest.php tests/Feature/Content/VersionsTest.php tests/Feature/Content/VersionsAdaptTest.php`
Expected: all three exit 1:
- LinksTest: the post count is one more than before;
- VersionsTest: 200 where 409 was expected, and `lockGroup` undefined;
- VersionsAdaptTest: `'ai_failed'` given where `'budget'` was expected.

- [ ] **Step 3: Implement — the versions service**

In `ContentVersions`, add after `platformsOf()`:

```php
    /**
     * Locks the group's key post — the post whose id is `group_id`, or the post itself outside a group — for the rest of
     * the caller's transaction, so every change to a group's platforms waits on one row whichever post it starts from
     * (5A-1 review). Unlink can re-key a group while this waits: then the new key is locked too. Refreshes `$post`.
     */
    public static function lockGroup(ContentPlannerPost $post): int
    {
        $key = (int) ($post->group_id ?: $post->id);
        ContentPlannerPost::whereKey($key)->lockForUpdate()->first();
        $post->refresh();
        $now = (int) ($post->group_id ?: $post->id);
        if ($now !== $key) {
            ContentPlannerPost::whereKey($now)->lockForUpdate()->first();
            $post->refresh();
        }

        return $now;
    }

    /** A save that moves a grouped post to a platform another post of its group has is refused: one post per platform. */
    public static function assertPlatformFree(ContentPlannerPost $post, string $platform): void
    {
        if ($post->group_id && ContentPlannerPost::where('group_id', $post->group_id)->where('id', '!=', $post->id)->where('platform', $platform)->exists()) {
            throw new ContentRefused('version_exists', 'Another version in this group is already for that platform.', 409);
        }
    }
```

In `make()`, replace the two lines

```php
            // Two calls at once for the same platform: the second waits here, then sees the first one's version.
            ContentPlannerPost::whereKey($original->id)->lockForUpdate()->first();
            $original->refresh();
```

with

```php
            // Two calls at once for the same platform, from any posts of the group: the second waits here, then sees the
            // first one's version.
            self::lockGroup($original);
```

Replace `keep()` with:

```php
    /** @param list<int> $ids — each keeps the reason it was kept for (5A-1 review: a later batch does not relabel them). */
    public static function keep(int $groupId, array $ids, string $reason): void
    {
        $before = (array) Cache::get(self::keptKey($groupId), []);
        $reasons = (array) ($before['reasons'] ?? []);
        foreach ((array) ($before['ids'] ?? []) as $id) {
            // An entry written before reasons were kept per version: its one reason stands for each of its ids.
            $reasons[(int) $id] ??= $before['reason'] ?? $reason;
        }
        foreach ($ids as $id) {
            $reasons[(int) $id] = $reason;
        }
        Cache::put(self::keptKey($groupId), ['ids' => array_map('intval', array_keys($reasons)), 'reasons' => $reasons], now()->addDay());
    }
```

In `describe()`, replace `'kept_reason'   => $keptIds === [] ? null : ($kept['reason'] ?? null),` with:

```php
            // The post's own reason when it is kept; otherwise the first kept version's (the panel words this post's).
            'kept_reason'   => $keptIds === [] ? null : self::reasonOf($kept, in_array((int) $post->id, $keptIds, true) ? (int) $post->id : $keptIds[0]),
```

and add the helper after `keep()`:

```php
    /** @param array<string, mixed> $kept */
    private static function reasonOf(array $kept, int $id): ?string
    {
        $reasons = (array) ($kept['reasons'] ?? []);

        return isset($reasons[$id]) ? (string) $reasons[$id] : (isset($kept['reason']) ? (string) $kept['reason'] : null);
    }
```

- [ ] **Step 4: Implement — the post controller**

Add `use App\Services\Content\ContentVersions;` and `use Illuminate\Support\Facades\DB;` to `PostController`'s imports.

In `store()`, replace from `$post = ContentPlannerPost::create(array_merge(` to the closing brace of the `if ($kind = ContentApproval::onCreate(...))` block with:

```php
        // The post, its short link and its approval step are one write (5B-1 review): a Link that cannot be written
        // leaves no post behind.
        $post = DB::transaction(function () use ($data, $profile, $request, $link) {
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
            if ($link !== null) {
                ContentLinks::set($post, $link);
            }
            if ($kind = ContentApproval::onCreate($post, $request->user(), $profile)) {
                ContentApproval::record($post, $kind, $request->user()->id);
            }

            return $post;
        });
```

In `update()`, replace from `$post->fill($fields);` to the closing brace of `if ($kind) { … }` with:

```php
        // The save, its short link and its approval step are one write (5B-1 review); a grouped post keeps one post per
        // platform (5A-1 review), checked under the group's lock.
        DB::transaction(function () use ($post, $fields, $linkChanges, $link, $before, $request, $profile) {
            if (array_key_exists('platform', $fields) && $fields['platform'] !== $post->platform && $post->group_id) {
                ContentVersions::lockGroup($post);
                ContentVersions::assertPlatformFree($post, (string) $fields['platform']);
            }
            $post->fill($fields);
            // A post without a day has no time either — also when only a time was sent for it.
            if ($post->scheduled_date === null) {
                $post->scheduled_time = null;
            }
            if ($linkChanges) {
                // Its version moves on, so a panel still holding the old Link cannot save it back (F3).
                $post->updated_at = $post->freshTimestamp();
            }
            $kind = ContentApproval::beforeSave($post, $before, $request->user(), $profile, $linkChanges);
            $post->save();
            if ($linkChanges) {
                ContentLinks::set($post, $link);
            } elseif ($post->wasChanged(['platform', 'campaign_id'])) {
                ContentLinks::retag($post);
            }
            if ($kind) {
                ContentApproval::record($post, $kind, $request->user()->id);
            }
        });
```

(`lockGroup` refreshes `$post` before the fill, so the fill and `$before` still describe the same saved post; `assertFresh` ran earlier.)

- [ ] **Step 5: Run them to see them pass, then the folder**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/php.sh tests/Feature/Content/LinksTest.php tests/Feature/Content/VersionsTest.php tests/Feature/Content/VersionsAdaptTest.php && $R/php.sh tests/Feature/Content/`
Expected: every path `exit 0`; the folder's `Tests:` line shows only passes.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Http/Controllers/Api/V1/Admin/Content/PostController.php app/Services/Content/ContentVersions.php tests/Feature/Content/LinksTest.php tests/Feature/Content/VersionsTest.php tests/Feature/Content/VersionsAdaptTest.php && git commit -q -m "Content: a post save and its short link are one write; a group keeps one post per platform; kept versions keep their own reason" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format='%h %s'
```

---

### Task 3: The bio page — a first save at the same moment, an absolute og:image, the accent helper, the missing tests (server)

**Files:**
- Modify: `app/Services/Content/ContentBio.php` (`save`)
- Create: `app/Support/OrgAccent.php`
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php`, `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`, `app/Services/Content/ContentBioPublic.php`
- Modify: `resources/views/content-public/bio.blade.php`
- Test: `tests/Feature/Content/BioEditorTest.php`, `tests/Feature/Content/BioPageTest.php`, `tests/Unit/Support/OrgAccentTest.php` (create)

**Interfaces:**
- Produces: `App\Support\OrgAccent::of(int $orgId): ?string` — the organisation's `primary_color` setting as `#rrggbb`, lowercase, or null. `ContentBioPublic` gains the view variable `og_image` (absolute URL or null).

- [ ] **Step 1: Write the failing tests**

Append to `tests/Feature/Content/BioEditorTest.php` (add `use App\Models\ContentBioPage;` and `use App\Models\ContentBioButton;` where missing):

```php
    // 5B-1 review: two managers saving the brand's first page at the same moment — the second becomes an update of the
    // first one's page, not "name taken".
    public function test_a_first_page_saved_by_someone_else_at_the_same_moment_is_updated_not_refused(): void
    {
        $raced = false;
        ContentBioPage::creating(function (ContentBioPage $page) use (&$raced) {
            if ($raced) {
                return;
            }
            $raced = true;
            DB::table('content_bio_pages')->insert([
                'organization_id' => $page->organization_id, 'brand_id' => $page->brand_id, 'planner_profile_id' => $page->planner_profile_id,
                'slug' => 'lumiere-other', 'is_on' => false, 'show_posts' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        });
        $this->save($this->body([['label' => 'Book now', 'destination' => 'https://lumiere.example/book']]))
            ->assertOk()->assertJsonPath('page.slug', 'lumiere')->assertJsonPath('buttons.0.label', 'Book now');
        $this->assertSame(1, DB::table('content_bio_pages')->where('planner_profile_id', $this->profile->id)->count());
        ContentBioPage::flushEventListeners();
    }

    // 5B-1 review (test gap): a button id from another organisation's page is a new button here; theirs is untouched.
    public function test_a_button_id_from_another_organisations_page_is_a_new_button(): void
    {
        $other = $this->otherOrganization();
        $pageId = DB::table('content_bio_pages')->insertGetId([
            'organization_id' => $other['org']->id, 'brand_id' => $other['brandId'], 'planner_profile_id' => $other['post']->planner_profile_id,
            'slug' => 'theirs', 'is_on' => true, 'show_posts' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $linkId = DB::table('content_links')->insertGetId([
            'organization_id' => $other['org']->id, 'brand_id' => $other['brandId'], 'code' => 'zzzz222', 'destination' => 'https://theirs.example/',
            'utm' => '{}', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $theirs = DB::table('content_bio_buttons')->insertGetId(['bio_page_id' => $pageId, 'link_id' => $linkId, 'label' => 'Theirs', 'position' => 0, 'created_at' => now(), 'updated_at' => now()]);

        $this->save($this->body([['id' => $theirs, 'label' => 'Mine', 'destination' => 'https://lumiere.example/mine']]))->assertOk();
        $this->assertNotSame($theirs, $this->asManager()->getJson($this->api('bio'))->json('buttons.0.id'));
        $this->assertSame('Theirs', DB::table('content_bio_buttons')->where('id', $theirs)->value('label'));
        $this->assertSame('https://theirs.example/', DB::table('content_links')->where('id', $linkId)->value('destination'));
    }
```

(If `content_links.utm` or `content_bio_buttons` has no timestamps in the migration, drop those keys from the inserts; ledger nothing — it is fixture shape.)

Append to `tests/Feature/Content/BioPageTest.php`:

```php
    // 5B-1 review: og:image must be absolute for a logo stored as a path (a preview robot cannot resolve a path).
    public function test_a_logo_stored_as_a_path_gives_an_absolute_og_image(): void
    {
        $this->page();
        DB::table('brands')->where('id', $this->brandId)->update(['logo_url' => '/storage/logos/brand.png']);
        $this->visit('lumiere')
            ->assertSee('src="/storage/logos/brand.png"', false)
            ->assertSee('<meta property="og:image" content="http://' . config('landing.host') . '/storage/logos/brand.png">', false);
    }

    // 5B-1 review (test gaps): HEAD and robots get the page as people do; the page allocates no session.
    public function test_head_and_robots_get_the_page_and_no_session_is_made(): void
    {
        $this->page();
        $this->call('HEAD', 'http://' . config('landing.host') . '/links/lumiere')->assertOk();
        $this->withHeaders(['User-Agent' => 'facebookexternalhit/1.1'])->get('http://' . config('landing.host') . '/links/lumiere')->assertOk()->assertSee('og:title', false);
        $dir = storage_path('framework/testing/sessions-' . uniqid());
        mkdir($dir, 0777, true);
        config(['session.driver' => 'file', 'session.files' => $dir]);
        try {
            $this->visit('lumiere')->assertOk();
            $this->assertSame([], array_values(array_diff(scandir($dir), ['.', '..'])), 'the bio page allocated a session');
        } finally {
            array_map('unlink', glob($dir . '/*') ?: []);
            rmdir($dir);
        }
    }
```

(Before writing the second test, read `LinkRedirectTest`'s session test (around its line 59) and match how it creates and cleans the folder; if the page's head has no `og:title`, assert on `og:url` or the title tag the view does print.)

Create `tests/Unit/Support/OrgAccentTest.php`:

```php
<?php

namespace Tests\Unit\Support;

use App\Support\OrgAccent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The organisation's accent setting (5B-1 review: it belongs in App\Support, not in a controller). */
class OrgAccentTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_the_primary_colour_setting_as_a_lowercase_hex_or_nothing(): void
    {
        $this->assertNull(OrgAccent::of($this->org->id));
        DB::table('hotel_settings')->insert(['organization_id' => $this->org->id, 'key' => 'primary_color', 'value' => ' #A1B2C3 ']);
        $this->assertSame('#a1b2c3', OrgAccent::of($this->org->id));
        DB::table('hotel_settings')->where('key', 'primary_color')->update(['value' => 'red']);
        $this->assertNull(OrgAccent::of($this->org->id));
    }
}
```

(If `hotel_settings` needs more columns in the test schema, add them to the insert from `SetsUpContentSchema`'s `hotel_settings` definition.)

- [ ] **Step 2: Run them to see them fail**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/php.sh tests/Feature/Content/BioEditorTest.php tests/Feature/Content/BioPageTest.php tests/Unit/Support/OrgAccentTest.php`
Expected: BioEditorTest exits 1: the race test gets 409 `bio_name_taken`. The other-organisation test may already pass; it is a test gap filled, ledgered as such. BioPageTest exits 1 on the og:image line (relative content). The HEAD/robot/session test may already pass (test gap). OrgAccentTest exits 1: class `App\Support\OrgAccent` not found.

- [ ] **Step 3: Implement**

`ContentBio::save` — wrap the existing `try { return DB::transaction(...) } catch (UniqueConstraintViolationException) { throw self::taken(); }` in one retry:

```php
        // Two managers saving the brand's first page at the same moment: the second insert meets the first one's page
        // (one page per profile) and is tried once more, as an update of it. The retry's own look finds a name another
        // page holds (`bio_name_taken`); a second violation is that name taken at the same moment (5B-1 review).
        for ($attempt = 1; ; $attempt++) {
            try {
                return DB::transaction(function () use ($profile, $data, $slug, $buttons, $destinations) {
                    // … the existing body, unchanged …
                });
            } catch (UniqueConstraintViolationException) {
                if ($attempt > 1) {
                    throw self::taken();
                }
            }
        }
```

(Keep the closure body exactly as it is; only the loop and the catch change.)

Create `app/Support/OrgAccent.php`:

```php
<?php

namespace App\Support;

use App\Models\HotelSetting;

/**
 * An organisation's accent colour as its settings hold it (`primary_color`): `#rrggbb`, lowercase, or null. Read across
 * tenants by id: the public bio page has no tenant bound. For a colour text can be read on, see Accent.
 */
final class OrgAccent
{
    public static function of(int $orgId): ?string
    {
        $value = HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)->where('key', 'primary_color')->value('value');
        $value = is_string($value) ? strtolower(trim($value)) : '';

        return preg_match('/^#[0-9a-f]{6}$/', $value) === 1 ? $value : null;
    }
}
```

In `Admin/Appointments/BootstrapController.php`: replace `'accent'       => self::accent($orgId),` with `'accent'       => OrgAccent::of($orgId),`, delete the `accent()` method and its docblock, add `use App\Support\OrgAccent;`, and remove `use App\Models\HotelSetting;` if nothing else uses it. In `Admin/Content/BootstrapController.php`: replace `AppointmentsBootstrap::accent($orgId)` with `OrgAccent::of($orgId)`, add the import, and drop the `AppointmentsBootstrap` import if now unused. In `ContentBioPublic.php`: the same replacement and imports.

In `ContentBioPublic`, where the view data has `'logo' => …`, add after it:

```php
            // A preview robot needs an absolute address; the page itself uses the path as stored (5B-1 review).
            'og_image' => self::absolute($logo),
```

computing `$logo` once above the array (the expression now inline in `'logo'`), and add:

```php
    /** A path on this host as a full address; an https address as it is. */
    private static function absolute(?string $url): ?string
    {
        return $url !== null && str_starts_with($url, '/') ? url($url) : $url;
    }
```

In `resources/views/content-public/bio.blade.php`, change the og:image line to `<meta property="og:image" content="{{ $og_image }}">` and its `@if ($logo)` guard to `@if ($og_image)`. Then `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear`.

- [ ] **Step 4: Run them to see them pass, then the folders**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; cd /c/wamp64/www/Hexa-Tech-content && XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear >/dev/null; $R/php.sh tests/Feature/Content/ tests/Unit/Support/ tests/Feature/Appointments/`
Expected: every path `exit 0`. If `tests/Feature/Appointments/` does not exist, run `ls -d tests/Feature/*ppoint*/` and use what it lists.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentBio.php app/Support/OrgAccent.php app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php app/Services/Content/ContentBioPublic.php resources/views/content-public/bio.blade.php tests/Feature/Content/BioEditorTest.php tests/Feature/Content/BioPageTest.php tests/Unit/Support/OrgAccentTest.php && git commit -q -m "Content bio page: a first save at the same moment becomes an update; og:image is absolute; the accent setting moves to App\\Support" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format='%h %s'
```

---

### Task 4: Approvals, the poster's publish, the bell's cost, the queue (server)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/ApprovalController.php` (`send`)
- Modify: `app/Services/ContentQualityService.php` (`check`), `app/Services/Content/ContentRepeat.php` (`copy`)
- Modify: `app/Services/Content/ContentApproval.php` (`guardPublish`)
- Modify: `app/Services/Content/ContentReminders.php`, `app/Services/Content/ContentInbox.php`
- Modify: `config/queue.php`; comments in `app/Jobs/AdaptPostVersions.php`, `app/Jobs/RewriteRepeatCopies.php`
- Test: `tests/Feature/Content/ApprovalActionsTest.php`, `tests/Feature/Content/PosterTest.php`, `tests/Feature/Content/InboxTest.php`, `tests/Feature/QueueRetryAfterTest.php` (create)

**Interfaces:**
- Produces: `ContentReminders::audience(User $user, ContentPlannerProfile $profile): array{manager: bool, members: list<int>}`; `today(…, bool $wholeDay = false, ?array $audience = null)` and `missed(…, ?array $audience = null)` take it (null: worked out as before, so the morning email is unchanged).

- [ ] **Step 1: Write the failing tests**

In `tests/Feature/Content/ApprovalActionsTest.php`, change the first loop of `test_staff_send_a_post_for_approval_from_idea_draft_needs_visual_or_needs_review` to `foreach (['idea', 'draft', 'needs_visual'] as $status) {`, rename the test to `test_staff_send_a_post_for_approval_from_idea_draft_or_needs_visual`, and append (adding `use App\Models\ContentPlannerPostEvent;` and `use App\Services\ContentQualityService;` where missing):

```php
    // Owner, 2026-10-20 (4B question): sending a post already in review again does nothing — no second step, no new bell item.
    public function test_sending_a_post_already_in_review_again_changes_nothing(): void
    {
        $post = $this->makePost(['status' => 'draft']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertOk();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertOk()
            ->assertJsonPath('post.status', 'needs_review')->assertJsonCount(1, 'post.timeline');
        $this->assertSame(1, ContentPlannerPostEvent::where('post_id', $post->id)->count());
    }

    // Owner, 2026-10-20 (4B question): "sent back" ends when someone works on the post, not on a quality check or a repeat.
    public function test_a_sent_back_post_stays_sent_back_through_a_quality_check_and_a_repeat(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'Warmer, please.'])->assertOk();
        $this->travel(5)->seconds();
        $this->fakeAi(['overall' => 8]);
        app(ContentQualityService::class)->check($post->fresh());
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->assertJsonPath('post.sent_back', true);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])->assertCreated();
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->assertJsonPath('post.sent_back', true);
        // Work on the post still ends it.
        $fresh = $post->fresh();
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $fresh->updated_at->toISOString(), 'hook' => 'Warmer now'])->assertOk()
            ->assertJsonPath('post.sent_back', false);
    }
```

(If `ContentQualityService::check` needs more than the test schema gives, read `PostAiTest`'s setup and give it the same; ledger what was needed.)

Append to `tests/Feature/Content/PosterTest.php` (add `use App\Models\Staff;` where missing):

```php
    // 5A-1 review: a poster whose staff row was switched off is nobody — their open session cannot mark the post published.
    public function test_a_poster_switched_off_cannot_mark_their_post_published_while_approvals_are_on(): void
    {
        $this->profile->forceFill(['requires_approval' => true])->save();
        $post = $this->makePost(['status' => 'approved', 'poster_id' => $this->staffMember->id]);
        Staff::where('user_id', $this->staffMember->id)->update(['is_active' => false]);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-published"))->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->assertSame('approved', $post->fresh()->status);
    }
```

(If the request is refused earlier, with another code, because inactive staff cannot reach Content at all: the minor does not exist on this path; ledger a ruling and keep the test asserting that refusal.)

Append to `tests/Feature/Content/InboxTest.php` (add `use Illuminate\Support\Facades\DB;` where missing):

```php
    // 5A-1 review: the bell's count is asked every minute per open tab — who manages and who is on the team are read once.
    public function test_the_bells_count_reads_the_staff_table_a_fixed_number_of_times(): void
    {
        $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => null]);
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk(); // warm the middleware's own caches
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk();
        $staffReads = collect(DB::getQueryLog())->filter(fn (array $q) => preg_match('/\bfrom\s+"?staff"?\b/i', $q['query']) === 1)->count();
        DB::disableQueryLog();
        $this->assertLessThanOrEqual(LIMIT, $staffReads);
    }
```

with `LIMIT` replaced as Step 2 says.

Create `tests/Feature/QueueRetryAfterTest.php`:

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * A queue connection hands a job to a second worker once `retry_after` passes. It must be longer than any job may run,
 * or a long run (GenerateContentStrategy, up to 600 s) is taken twice — and, with `tries = 1`, failed while it still runs.
 */
class QueueRetryAfterTest extends TestCase
{
    public function test_every_queue_connection_waits_longer_than_the_longest_job_may_run(): void
    {
        $longest = 0;
        foreach (glob(app_path('Jobs/*.php')) ?: [] as $file) {
            $class = 'App\\Jobs\\' . basename($file, '.php');
            if (class_exists($class)) {
                $longest = max($longest, (int) ((new \ReflectionClass($class))->getDefaultProperties()['timeout'] ?? 0));
            }
        }
        $this->assertGreaterThanOrEqual(600, $longest);
        foreach (['database', 'redis', 'beanstalkd'] as $connection) {
            $this->assertGreaterThan($longest, (int) config("queue.connections.{$connection}.retry_after"), "{$connection} retry_after");
        }
    }
}
```

- [ ] **Step 2: Measure the bell, then run the tests to see them fail**

First run the InboxTest test with `LIMIT` set to `0` to read the real count, then set `LIMIT` to the number the fix must reach: the count the middleware alone makes plus 1 (one `canManage` read, reused). Ledger `Task 4: note: inbox/count staff reads before <n>`.

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/php.sh tests/Feature/Content/ApprovalActionsTest.php tests/Feature/Content/PosterTest.php tests/Feature/Content/InboxTest.php tests/Feature/QueueRetryAfterTest.php`
Expected: all four exit 1:
- ApprovalActionsTest: the second send records a second event (`2` given), and `sent_back` turns false after the quality check;
- PosterTest: 200 where 403 was expected;
- InboxTest: the staff reads are above `LIMIT`;
- QueueRetryAfterTest: `database retry_after` 90 is not greater than 600.

- [ ] **Step 3: Implement**

`ApprovalController::send`:

```php
    public function send(Request $request, int $id): JsonResponse
    {
        $post = self::post($id, ContentApproval::SENDABLE);
        // Already in review (owner, 2026-10-20): nothing to record again, and the manager's waiting item stays as it is.
        if ($post->status === 'needs_review') {
            return response()->json(['post' => ContentPostPresenter::panel($post->fresh(PostController::WITH), $request->user())]);
        }

        return self::step($request, $post, 'needs_review', 'sent_for_approval');
    }
```

`ContentQualityService::check` — replace `$post->quality_score = $result;` and `$post->save();` with:

```php
        // A score is not an edit: the post's version stays, so "sent back" and an open panel's copy stay as they are
        // (owner, 2026-10-20).
        $post->quality_score = $result;
        $post->timestamps = false;
        try {
            $post->save();
        } finally {
            $post->timestamps = true;
        }
```

`ContentRepeat::copy` — replace `$original->forceFill(['series_id' => $original->id])->save();` with:

```php
            // Joining a series is not an edit (as joining a group of versions is not): the post's version stays.
            ContentPlannerPost::whereKey($original->id)->toBase()->update(['series_id' => $original->id]);
            $original->series_id = $original->id;
            $original->syncOriginalAttribute('series_id');
```

`ContentApproval::guardPublish` — the poster's own case also needs them on the team:

```php
        if ($post->poster_id !== null && (int) $post->poster_id === (int) $user->id
            && in_array($post->status, ['approved', 'ready_to_publish'], true)
            // A poster who left or was switched off counts as nobody (5A-1 review).
            && ContentTeam::isMember((int) $user->id, (int) $post->brand_id)) {
            return;
        }
```

`ContentReminders` — add `audience()`, thread it through `today()`, `missed()` and `mine()`:

```php
    /** Who the reminders are for, read once per request: whether the person manages, and the brand's team. @return array{manager: bool, members: list<int>} */
    public static function audience(User $user, ContentPlannerProfile $profile): array
    {
        $manager = ContentAccess::canManage($user);

        return ['manager' => $manager, 'members' => $manager ? ContentTeam::memberIds((int) $profile->brand_id) : []];
    }
```

`today(User $user, ContentPlannerProfile $profile, CarbonImmutable $venueNow, bool $wholeDay = false, ?array $audience = null)` calls `self::mine($user, $profile, $audience)`; `missed(User $user, ContentPlannerProfile $profile, CarbonImmutable $venueNow, ?array $audience = null)` the same; `mine(User $user, ContentPlannerProfile $profile, ?array $audience = null)` starts with:

```php
        ['manager' => $manager, 'members' => $members] = $audience ?? self::audience($user, $profile);
```

in place of its two lines that read `canManage` and `memberIds`.

`ContentInbox` — in `for()` and `count()`, compute `$audience = ContentReminders::audience($user, $profile);` once and pass it to `ContentReminders::today(..., false, $audience)` / `missed(..., $audience)`; change `waiting(User $user, ContentPlannerProfile $profile)` to `waiting(ContentPlannerProfile $profile, bool $manager)` with `if (!ContentApproval::isOn($profile) || !$manager) { return null; }`, called as `self::waiting($profile, $audience['manager'])`. If the measured count is still above `LIMIT`, find the remaining `staff` reads with the query log (`approvals()`, `comments()`, `seenAt()`) and pass what they need the same way; ledger what was found.

`config/queue.php` — the three `retry_after` lines:

```php
            // Longer than any job may run (GenerateContentStrategy: 600 s), or a long run is handed to a second worker;
            // tests/Feature/QueueRetryAfterTest.php keeps it so.
            'retry_after' => (int) env('DB_QUEUE_RETRY_AFTER', 660),
```

(`BEANSTALKD_QUEUE_RETRY_AFTER` and `REDIS_QUEUE_RETRY_AFTER` for the other two, the comment on the database one only.)

In `AdaptPostVersions` and `RewriteRepeatCopies`, change the `$timeout` docblock from `/** One AI call per run, well under the queue connections' retry_after (90 s). */` (and its RewriteRepeatCopies twin) to `/** One AI call per run: a short run hands the rest on, well under every queue connection's retry_after. */`.

- [ ] **Step 4: Run them to see them pass, then the folders**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/php.sh tests/Feature/Content/ApprovalActionsTest.php tests/Feature/Content/PosterTest.php tests/Feature/Content/InboxTest.php tests/Feature/QueueRetryAfterTest.php && $R/php.sh tests/Feature/Content/ tests/Unit/Content/`
Expected: every path `exit 0`.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Http/Controllers/Api/V1/Admin/Content/ApprovalController.php app/Services/ContentQualityService.php app/Services/Content/ContentRepeat.php app/Services/Content/ContentApproval.php app/Services/Content/ContentReminders.php app/Services/Content/ContentInbox.php config/queue.php app/Jobs/AdaptPostVersions.php app/Jobs/RewriteRepeatCopies.php tests/Feature/Content/ApprovalActionsTest.php tests/Feature/Content/PosterTest.php tests/Feature/Content/InboxTest.php tests/Feature/QueueRetryAfterTest.php && git commit -q -m "Content approvals: sending again is a no-op, sent back survives a quality check and a repeat, a switched-off poster cannot publish; the bell reads the team once; queue retry_after 660 s" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format='%h %s'
```

---

### Task 5: The link-in-bio editor and the copy buttons (portal, 5B-2 minors)

**Files:**
- Modify: `frontend/src/content/brand/bioForm.ts` (`keyedMarks`, `problemCodes`, `caretAfter`)
- Modify: `frontend/src/content/brand/sections/LinkInBio.tsx`
- Modify: `frontend/src/content/ui/CopyButton.tsx` (`resetAfterCopied`)
- Modify: `frontend/src/content/lib/errors.ts` (`bio.label_missing`)
- Modify: the five bundles (new keys; changed `bio.name_hint`, `links.copy`, `panel.actions.copy_link`)
- Test: `frontend/src/content/brand/bioForm.test.ts`, `frontend/src/content/brand/linkInBio.test.tsx`, `frontend/src/content/ui/copyButton.test.ts` (create), `frontend/src/content/panel/shortLink.test.tsx`, `frontend/src/content/panel/postActions.test.tsx`

**Interfaces:**
- Produces: `keyedMarks(buttons: readonly BioButtonForm[], marks: readonly string[]): string[]`; `problemCodes(marks: readonly string[]): string[]`; `caretAfter(raw: string, caret: number): number`; `resetAfterCopied(state: 'idle' | 'copied' | 'failed', idle: () => void): (() => void) | undefined`, `COPIED_FOR_MS = 2000`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/content/brand/bioForm.test.ts` (extend its import from `./bioForm` with `caretAfter, keyedMarks, problemCodes`, and `moveButton` if not imported):

```ts
// 5B-2 review: a mark follows its row through a move or a removal, and the portal's own check says which rule failed.
describe('the editor’s marks and words', () => {
  const rows = [
    { key: 'b4', id: 4, label: 'Book', destination: 'https://a.example' },
    { key: 'n0', id: null, label: '', destination: 'nope' },
  ]
  it('keys each button mark by its row, so a move keeps the mark on its row', () => {
    const marks = keyedMarks(rows, ['slug', 'buttons.1.label', 'buttons.1.destination', 'buttons'])
    expect(marks).toEqual(['slug', 'buttons.n0.label', 'buttons.n0.destination', 'buttons'])
    const moved = moveButton(rows, 1, -1)
    expect(moved[0].key).toBe('n0')
    expect(keyedMarks(rows, ['buttons.7.label'])).toEqual(['buttons.7.label'])
  })
  it('names the rule each mark broke, each once, the general line only for anything else', () => {
    expect(problemCodes(['slug'])).toEqual(['bio_name_invalid'])
    expect(problemCodes(['buttons.n0.destination', 'buttons.b4.destination', 'buttons.n0.label'])).toEqual(['bad_link', 'label_missing'])
    expect(problemCodes(['slug', 'buttons'])).toEqual(['bio_name_invalid', 'too_many_buttons'])
    expect(problemCodes(['title'])).toEqual(['invalid'])
  })
  it('puts the caret after the same characters once the name is rewritten', () => {
    expect(caretAfter('Lumiere Salon', 8)).toBe(8)
    expect(caretAfter('lumiere  salon', 9)).toBe(8)
    expect(caretAfter('abc', 3)).toBe(3)
  })
})
```

Append to `frontend/src/content/brand/linkInBio.test.tsx`:

```ts
// 5B-2 review: marks by row key, a label that holds only the name, placeholders on the labels, and a warning beside
// the manager's Copy address while the page is off.
describe('the link-in-bio editor after the 5B-2 review', () => {
  it('marks a button by its row key', () => {
    expect(editor(bioFormOf(payload()), ['buttons.b5.label'])).toMatch(/aria-label="Button 2: label" aria-invalid="true"/)
    expect(editor(bioFormOf(payload()), ['buttons.b5.label'])).not.toMatch(/aria-label="Button 1: label" aria-invalid="true"/)
  })
  it('names the name field by its label only, the address and the rules after it', () => {
    const html = editor()
    expect(html).toMatch(/<label for="content-bio-name"[^>]*>Name<\/label>/)
    expect(html).toMatch(/<input id="content-bio-name"[^>]*aria-describedby="content-bio-address"/)
    expect(html.indexOf('id="content-bio-address"')).toBeGreaterThan(html.indexOf('</label>', html.indexOf('for="content-bio-name"')))
    expect(html).toContain('3 to 63 lowercase letters, digits and single hyphens.')
  })
  it('shows an example in each button label', () => {
    expect(editor().match(/placeholder="e\.g\. Book a visit"/g)?.length).toBe(2)
  })
  it('warns a manager beside Copy address while the page is off', () => {
    const off = payload({ page: { is_on: false, slug: 'lumiere', title: null, line: null, show_posts: true } })
    expect(section(off, true)).toContain('The page is switched off: this address shows a page that is not found until you switch it on.')
    expect(section(payload(), true)).not.toContain('The page is switched off')
  })
})
```

Create `frontend/src/content/ui/copyButton.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPIED_FOR_MS, resetAfterCopied } from './CopyButton'

// 5B-2 review: "Copied" stayed for as long as the button was shown, so a second copy said nothing new.
describe('Copied goes back to the button’s words', () => {
  afterEach(() => { vi.useRealTimers() })
  it('two seconds after a copy, and never after a refusal (its words stay until the next try)', () => {
    vi.useFakeTimers()
    const idle = vi.fn()
    const stop = resetAfterCopied('copied', idle)
    vi.advanceTimersByTime(COPIED_FOR_MS - 1)
    expect(idle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(idle).toHaveBeenCalledTimes(1)
    expect(COPIED_FOR_MS).toBe(2000)
    expect(resetAfterCopied('failed', idle)).toBeUndefined()
    expect(resetAfterCopied('idle', idle)).toBeUndefined()
    stop?.()
  })
  it('stops waiting when the button goes away first', () => {
    vi.useFakeTimers()
    const idle = vi.fn()
    resetAfterCopied('copied', idle)?.()
    vi.advanceTimersByTime(COPIED_FOR_MS)
    expect(idle).not.toHaveBeenCalled()
  })
})
```

In `frontend/src/content/panel/shortLink.test.tsx`, change `expect(html).toContain('Copy</button>')` to `expect(html).toContain('Copy short link</button>')` and `expect(off).not.toContain('Copy</button>')` to `expect(off).not.toContain('Copy short link</button>')`.

In `frontend/src/content/panel/postActions.test.tsx`, find the assertion on `'Copy link'` and change it to `'Copy link for the team'` (if none exists, add to the test that renders the actions: `expect(html).toContain('Copy link for the team')`).

- [ ] **Step 2: Run them to see them fail**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/vt.sh src/content/brand/bioForm.test.ts src/content/brand/linkInBio.test.tsx src/content/ui/copyButton.test.ts src/content/panel/shortLink.test.tsx src/content/panel/postActions.test.tsx`
Expected: failures in all five files:
- the three helpers are not exported;
- the editor still marks by number, its label wraps the address, and there is no placeholder or warning;
- `resetAfterCopied` is missing;
- `Copy short link` and `Copy link for the team` are not found.

- [ ] **Step 3: Implement — the helpers and words**

Append to `bioForm.ts`:

```ts
/**
 * A check's marks with each button's row key in place of its number (`buttons.1.label` → `buttons.n0.label`), so a mark
 * stays on its row through a move or a removal (5B-2 review). A number with no row stays as it is.
 */
export function keyedMarks(buttons: readonly BioButtonForm[], marks: readonly string[]): string[] {
  return marks.map(mark => {
    const found = /^buttons\.(\d+)\.(label|destination)$/.exec(mark)
    const row = found ? buttons[Number(found[1])] : undefined
    return found && row ? `buttons.${row.key}.${found[2]}` : mark
  })
}

/** The refusal words for what a check marked: the name's rule, the address rule, a missing label, the count — each once. */
export function problemCodes(marks: readonly string[]): string[] {
  const codes: string[] = []
  if (marks.includes('slug')) codes.push('bio_name_invalid')
  if (marks.some(m => /^buttons\.[^.]+\.destination$/.test(m))) codes.push('bad_link')
  if (marks.some(m => /^buttons\.[^.]+\.label$/.test(m))) codes.push('label_missing')
  if (marks.includes('buttons')) codes.push('too_many_buttons')
  return codes.length > 0 ? codes : ['invalid']
}

/** Where the caret belongs once the name field rewrote what was typed: after the same characters, rewritten (5B-2 review). */
export const caretAfter = (raw: string, caret: number): number => slugInput(raw.slice(0, caret)).length
```

In `lib/errors.ts`, add to `bio` after `bad_link`: `label_missing: 'Each button needs a label.',`.

Write `$R/t5-words.json` and run `node $R/words.mjs $R/t5-words.json` from the worktree root:

```json
{
  "bio.error.label_missing": { "en": "Each button needs a label.", "ru": "У каждой кнопки должна быть подпись.", "de": "Jede Schaltfläche braucht eine Beschriftung.", "fr": "Chaque bouton doit avoir un libellé.", "es": "Cada botón necesita un texto." },
  "bio.button_label_placeholder": { "en": "e.g. Book a visit", "ru": "Например: Записаться", "de": "z. B. Termin buchen", "fr": "p. ex. Prendre rendez-vous", "es": "p. ej., Reservar cita" },
  "bio.off_warning": { "en": "The page is switched off: this address shows a page that is not found until you switch it on.", "ru": "Страница выключена: по этому адресу открывается «Страница не найдена», пока вы её не включите.", "de": "Die Seite ist ausgeschaltet: Unter dieser Adresse erscheint „Seite nicht gefunden“, bis Sie sie einschalten.", "fr": "La page est désactivée : cette adresse affiche une page introuvable tant que vous ne l’activez pas.", "es": "La página está desactivada: esta dirección muestra una página no encontrada hasta que la active." }
}
```

Then, with the Edit tool in each of the five bundles, change three existing values:
- `bio.name_hint` becomes en `3 to 63 lowercase letters, digits and single hyphens.`, ru `От 3 до 63 символов: строчные латинские буквы, цифры и одиночные дефисы.`, de `3 bis 63 Zeichen: Kleinbuchstaben, Ziffern und einzelne Bindestriche.`, fr `3 à 63 caractères : lettres minuscules, chiffres et tirets simples.`, es `De 3 a 63 caracteres: minúsculas, números y guiones simples.`;
- `links.copy` becomes en `Copy short link`, ru `Копировать короткую ссылку`, de `Kurzlink kopieren`, fr `Copier le lien court`, es `Copiar enlace corto`;
- `panel.actions.copy_link` becomes en `Copy link for the team`, ru `Копировать ссылку для команды`, de `Link fürs Team kopieren`, fr `Copier le lien pour l’équipe`, es `Copiar enlace para el equipo`.

- [ ] **Step 4: Implement — the components**

`ui/CopyButton.tsx`: add `useEffect` to the React import and, above the component:

```ts
/** How long "Copied" shows before the button's own words come back (PostActions waits as long). */
export const COPIED_FOR_MS = 2000

/** After a copy, the button goes back to its words, so a second copy says so again (5B-2 review); a refusal's words stay. */
export function resetAfterCopied(state: 'idle' | 'copied' | 'failed', idle: () => void): (() => void) | undefined {
  if (state !== 'copied') return undefined
  const timer = setTimeout(idle, COPIED_FOR_MS)
  return () => clearTimeout(timer)
}
```

and inside the component, after the `useState` line: `useEffect(() => resetAfterCopied(state, () => setState('idle')), [state])`. Change the click handler to set `'idle'` first when the state is `'failed'` is not needed; leave `copy` as it is.

`panel/ShortLink.tsx`: the label `w('copy', 'Copy')` becomes `w('copy', 'Copy short link')`. `panel/PostActions.tsx`: the fallback `'Copy link'` becomes `'Copy link for the team'`.

`brand/sections/LinkInBio.tsx`:
- import `caretAfter, keyedMarks, problemCodes` from `../bioForm` and `useLayoutEffect` from React;
- in `save()`, the portal check becomes
  ```ts
  if (problems.length > 0) {
    setInvalid(keyedMarks(draft.buttons, problems))
    setError(problemCodes(problems).map(code => { const [key, text] = errorKey('bio', code); return t(key, text) }).join(' '))
    focusAfter.current = '[aria-invalid="true"]'
    return
  }
  ```
  and the refusal's marks become `setInvalid(keyedMarks(draft.buttons, refusedFields(failure.code, failure.fields)))`;
- in `BioReadView`, for managers, right after `<AddressLine address={address} open={page.is_on} />`:
  ```tsx
  {!page.is_on && <p data-bio-off="" className="text-xs text-a-text-2">{w('off_warning', 'The page is switched off: this address shows a page that is not found until you switch it on.')}</p>}
  ```
- in `BioEditor`, add `const nameField = useRef<HTMLInputElement>(null)` and `const caret = useRef<number | null>(null)`, and after them:
  ```ts
  // The name is rewritten as it is typed (lowercase, hyphens): the caret stays after what was typed (5B-2 review).
  useLayoutEffect(() => {
    if (caret.current === null || nameField.current === null) return
    nameField.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  })
  ```
- replace the name's `<label className="block">…</label>` with:
  ```tsx
  <div>
    <label htmlFor="content-bio-name" className="mb-1 block text-xs font-medium text-a-text-2">{w('name', 'Name')}</label>
    <input id="content-bio-name" ref={nameField} value={draft.slug} maxLength={63} autoCapitalize="none" spellCheck={false} aria-invalid={bad('slug') || undefined} aria-describedby="content-bio-address"
      onChange={(e) => { const raw = e.target.value; caret.current = caretAfter(raw, e.target.selectionStart ?? raw.length); set({ slug: slugInput(raw) }) }}
      className={`${INPUT} ${edge(bad('slug'))}`} />
    {/* Outside the label, so the field is named once; only the address may break anywhere, the rules between words. */}
    <p id="content-bio-address" className="mt-1 text-xs text-a-text-2">
      <span className="break-all">{addressOf(bio.base_url, draft.slug.trim())}</span>
      {` · ${w('name_hint', '3 to 63 lowercase letters, digits and single hyphens.')}`}
    </p>
  </div>
  ```
- the button rows' marks become `bad(`buttons.${button.key}.label`)` and `bad(`buttons.${button.key}.destination`)` (four places), and the label input gains `placeholder={w('button_label_placeholder', 'e.g. Book a visit')}`.

The older test `lets only the address break anywhere, never the hint's words` asserts `id="content-bio-address" class=…` without `break-all`; it still holds with the `<p>`. The older test `stops adding at eight buttons, and marks the fields a check named` asserts `['buttons.1.label']` by number. Change that line to `['buttons.b5.label']` and ledger `Task 5: Ruling: the 5B-2 test's number-keyed mark becomes the row key — marks are by row now (5B-2 review) — cost if wrong: none, the new test pins both rows`.

- [ ] **Step 5: Run them to see them pass, then the content suite and types**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/vt.sh src/content && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN`
Expected: `src/content` all green (the locale and error tests included); `TSC-CLEAN`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -m "Content portal: the bio editor names each rule, keeps marks on their rows and the caret in place, warns while the page is off; Copied resets; clearer copy buttons" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format='%h %s'
```

---

### Task 6: Plan, Ideas, versions and the bell (portal, 5A-2 minors and Task 2's refusal)

**Files:**
- Modify: `frontend/src/content/panel/PostFormFields.tsx` (field order)
- Modify: `frontend/src/content/bell/MorningEmailSwitch.tsx` (`withMorningEmail`, manager hint)
- Modify: `frontend/src/content/lib/errors.ts` (`unlink`, `schedule` families; `move.invalid` removed; `save.version_exists`)
- Modify: `frontend/src/content/panel/VersionsSection.tsx`, `frontend/src/content/panel/versionsMath.ts` (`groupPostsToRefresh`)
- Modify: `frontend/src/content/plan/PlanPage.tsx` — no change needed once `move.invalid` is gone (a Plan 422 reads `unknown`)
- Modify: `frontend/src/content/ideas/ScheduleDialog.tsx`, `frontend/src/content/ideas/IdeasPage.tsx`, `frontend/src/content/ideas/ideasMath.ts` (`unscheduleBody`), `frontend/src/content/ui/PosterSelect.tsx` (`loading`)
- Modify: `frontend/src/content/panel/panelState.ts` (`refusalOf`), `frontend/src/content/panel/PostActions.tsx` (comment)
- Modify: the five bundles
- Test: `frontend/src/content/panel/postFormFields.test.tsx`, `frontend/src/content/bell/morningEmailSwitch.test.tsx`, `frontend/src/content/lib/errors.test.ts`, `frontend/src/content/panel/versionsMath.test.ts`, `frontend/src/content/ideas/ideasMath.test.ts`, `frontend/src/content/ideas/scheduleDialog.test.tsx`, `frontend/src/content/panel/panelState.test.ts`

**Interfaces:**
- Consumes: `version_exists` from `PUT posts/{id}` (Task 2).
- Produces: `withMorningEmail<T extends { staff: { morning_email?: boolean } }>(boot: T | undefined, on: boolean): T | undefined`; `groupPostsToRefresh(before: PostGroup | null, after: PostGroup | null, current: number): number[]`; `unscheduleBody(moved: { updated_at: string; poster_id?: number | null }, before: { poster_id?: number | null }): { updated_at: string; scheduled_date: null; poster_id?: number | null }`; `PosterSelect` prop `loading?: boolean`.

- [ ] **Step 1: Write the failing tests**

`panel/postFormFields.test.tsx` — append, reusing the file's own render helper (read its top first; call it `render` below):

```ts
// 5A-2 review: Date and Time sit side by side; Who posts it comes after them.
describe('the panel’s field order', () => {
  it('is Platform, Status, Date, Time, Who posts it, Pillar, Audience', () => {
    const html = render()
    const at = (label: string) => html.indexOf(`>${label}<`)
    const order = ['Platform', 'Status', 'Date', 'Time', 'Who posts it', 'Pillar', 'Audience'].map(at)
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})
```

`bell/morningEmailSwitch.test.tsx` — append (extend its imports with `withMorningEmail`):

```ts
// 5A-2 review: a reopened bell read the switch from the cached bootstrap before it was read again.
describe('the switch after a save', () => {
  it('writes the answer into the cached bootstrap', () => {
    const boot = { staff: { name: 'Anna', role: 'staff', can_manage: false, morning_email: false } }
    expect(withMorningEmail(boot, true)?.staff.morning_email).toBe(true)
    expect(withMorningEmail(boot, true)?.staff.name).toBe('Anna')
    expect(withMorningEmail(undefined, true)).toBeUndefined()
  })
  it('tells a manager they also get the posts nobody is set to post', () => {
    expect(renderToStaticMarkup(<MorningSwitchView on={false} busy={false} failed={false} manager onFlip={() => {}} />))
      .toContain('At 8 am, the posts you post today and those nobody is set to post.')
    expect(renderToStaticMarkup(<MorningSwitchView on={false} busy={false} failed={false} manager={false} onFlip={() => {}} />))
      .toContain('At 8 am, the posts you post today.')
  })
})
```

(Add `import { renderToStaticMarkup } from 'react-dom/server'` if the file lacks it.)

`lib/errors.test.ts` — append:

```ts
// 5A-2 review: an Unlink failure had Make versions' words; a Plan drag's rare 422 had the Schedule dialog's.
// Task 2: a save moving a version onto its group's platform.
describe('refusal words after the 5A-2 review', () => {
  it('gives Unlink its own words, Schedule the day-and-poster line, and a Plan move the general one', () => {
    expect(errorKey('unlink', 'unknown')[1]).toBe('The post could not be unlinked. Please try again.')
    expect(errorKey('schedule', 'invalid')[1]).toBe('Check the day and who posts it.')
    expect(errorKey('schedule', 'changed_elsewhere')[0]).toBe('content.schedule.error.changed_elsewhere')
    expect(errorKey('move', 'invalid')).toEqual(['content.move.error.unknown', 'The post could not be moved. Please try again.'])
    expect(errorKey('save', 'version_exists')[1]).toBe('Another version in this group is already for that platform.')
  })
})
```

`panel/versionsMath.test.ts` — append (import `groupPostsToRefresh`):

```ts
// 5A-2 review: the other versions' cached copies showed the old group for up to 30 s after Make versions or Unlink.
describe('the versions to read again', () => {
  const g = (...ids: number[]) => ({ id: ids[0], posts: ids.map(id => ({ id, platform: 'instagram' as const, status: 'draft' as const, scheduled_date: null, scheduled_time: null })), adapting: [], kept_original: [], kept_reason: null })
  it('are every post of the group before and after, but this one, each once', () => {
    expect(groupPostsToRefresh(g(1, 2), g(1, 2, 3), 1)).toEqual([2, 3])
    expect(groupPostsToRefresh(g(1, 2, 3), null, 2)).toEqual([1, 3])
    expect(groupPostsToRefresh(null, null, 5)).toEqual([])
  })
})
```

(Match the fixture's fields to `GroupPost` in `lib/types.ts`; adjust if it names them differently.)

`ideas/ideasMath.test.ts` — append (import `unscheduleBody`):

```ts
// 5A-2 review: Undo after Schedule took the day away but kept the person picked in the dialog.
describe('Undo after Schedule', () => {
  it('takes the day away and gives the post back the poster it had', () => {
    expect(unscheduleBody({ updated_at: 't2', poster_id: 9 }, { poster_id: 4 })).toEqual({ updated_at: 't2', scheduled_date: null, poster_id: 4 })
    expect(unscheduleBody({ updated_at: 't2', poster_id: 9 }, { poster_id: null })).toEqual({ updated_at: 't2', scheduled_date: null, poster_id: null })
    expect(unscheduleBody({ updated_at: 't2', poster_id: 4 }, { poster_id: 4 })).toEqual({ updated_at: 't2', scheduled_date: null })
  })
})
```

`ideas/scheduleDialog.test.tsx` — append (read its top for its render helper and mocks; import `PosterSelect` from `../ui/PosterSelect`):

```ts
// 5A-2 review: Schedule showed "Not set" while the team was still loading, even for an idea with a poster.
describe('who posts it while the team loads', () => {
  it('says it is loading and cannot be changed yet', () => {
    const html = renderToStaticMarkup(<PosterSelect value="" onChange={() => {}} choices={[]} className="x" loading />)
    expect(html).toMatch(/<select[^>]*disabled=""[^>]*aria-busy="true"/)
    expect(html).toContain('Loading…')
    expect(html).not.toContain('Not set')
  })
})
```

`panel/panelState.test.ts` — append (import `refusalOf` if not imported):

```ts
// Task 2: a save moving a version onto a platform its group has marks Platform with the save family's words.
it('marks Platform when a save is refused for a platform the group already has', () => {
  expect(refusalOf('version_exists', undefined)).toEqual({ invalid: ['platform'], family: 'save' })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/vt.sh src/content/panel/postFormFields.test.tsx src/content/bell/morningEmailSwitch.test.tsx src/content/lib/errors.test.ts src/content/panel/versionsMath.test.ts src/content/ideas/ideasMath.test.ts src/content/ideas/scheduleDialog.test.tsx src/content/panel/panelState.test.ts`
Expected: failures in all seven:
- Who posts it comes before Date;
- `withMorningEmail` is missing and the view has no `manager` prop;
- the `unlink` and `schedule` families are missing, and `move.invalid` still has its own words;
- `groupPostsToRefresh` and `unscheduleBody` are missing;
- PosterSelect is not disabled;
- `refusalOf` gives `invalid: []`.

- [ ] **Step 3: Implement**

`PostFormFields.tsx`: move the `Who posts it` `FieldBox` (the three lines after Status) to just after the Time block's closing `</div>`, so the grid reads Platform | Status, Date | Time, Who posts it | Pillar, Audience.

`MorningEmailSwitch.tsx`:

```ts
/** The cached bootstrap with the switch as saved, so a bell reopened before it is read again shows the new state (5A-2 review). */
export function withMorningEmail<T extends { staff: { morning_email?: boolean } }>(boot: T | undefined, on: boolean): T | undefined {
  return boot ? { ...boot, staff: { ...boot.staff, morning_email: on } } : boot
}
```

In `flip()`, before the `invalidateQueries` line: `queryClient.setQueriesData<BootPayload>({ queryKey: ['content', 'bootstrap'] }, old => withMorningEmail(old, answer.on))` (import the bootstrap type `lib/types.ts` names — read it; `BootPayload` here stands for that name). Pass `manager={boot.staff.can_manage}` to the view. `MorningSwitchView` takes `manager: boolean` and its hint becomes:

```tsx
{manager
  ? t('content.bell.morning_hint_manager', 'At 8 am, the posts you post today and those nobody is set to post.')
  : t('content.bell.morning_hint', 'At 8 am, the posts you post today.')}
```

(Update the existing view renders in `morningEmailSwitch.test.tsx` and `forYouBell.test.tsx` to pass `manager={false}` where tsc asks for it.)

`lib/errors.ts`:
- in `move`, delete the `invalid` line and its comment;
- add after `move`:
  ```ts
    // Ideas → Schedule sends who posts it (spec 2026-10-19 §4.1): someone off the team is refused. A Plan move has no
    // poster, so its rare 422 reads as `move`'s general line (5A-2 review).
    schedule: {
      changed_elsewhere: 'Someone else changed this post. The plan now shows their version.',
      published_cannot_move: 'A published post keeps the date it went out.',
      invalid: 'Check the day and who posts it.',
      not_found: 'This post no longer exists.',
      unknown: 'The post could not be moved. Please try again.',
    },
  ```
- after `version`:
  ```ts
    // Unlink has its own words (5A-2 review): it makes nothing.
    unlink: {
      not_found: 'This post no longer exists.',
      unknown: 'The post could not be unlinked. Please try again.',
    },
  ```
- in `save`, after `published_cannot_move`: `version_exists: 'Another version in this group is already for that platform.',`.

Bundles: with the Edit tool, in each of the five, delete `move.error.invalid` (and the comma before it). Write `$R/t6-words.json` and run `node $R/words.mjs $R/t6-words.json`. The `schedule.error.*` values copy each bundle's own `move.error.*` values word for word (read them first; the `invalid` one from the line just deleted). The `unlink.error.not_found` value copies each bundle's `version.error.not_found`. The rest:

```json
{
  "unlink.error.unknown": { "en": "The post could not be unlinked. Please try again.", "ru": "Не удалось отвязать пост. Попробуйте ещё раз.", "de": "Der Beitrag konnte nicht aus der Gruppe gelöst werden. Bitte versuchen Sie es erneut.", "fr": "La publication n’a pas pu être détachée du groupe. Veuillez réessayer.", "es": "No se pudo desvincular la publicación. Inténtelo de nuevo." },
  "save.error.version_exists": { "en": "Another version in this group is already for that platform.", "ru": "В этой группе уже есть версия для этой платформы.", "de": "In dieser Gruppe gibt es schon eine Version für diese Plattform.", "fr": "Ce groupe a déjà une version pour cette plateforme.", "es": "Este grupo ya tiene una versión para esa plataforma." },
  "bell.morning_hint_manager": { "en": "At 8 am, the posts you post today and those nobody is set to post.", "ru": "В 8 утра — посты, которые вы публикуете сегодня, и посты без назначенного исполнителя.", "de": "Um 8 Uhr die Beiträge, die Sie heute veröffentlichen, und die ohne festgelegte Person.", "fr": "À 8 h, les publications que vous publiez aujourd’hui et celles sans personne désignée.", "es": "A las 8, las publicaciones que publica hoy y las que no tienen a nadie asignado." }
}
```

In the German bundle, change `versions.unlink` from `Diesen Beitrag lösen` to `Diesen Beitrag aus der Gruppe lösen`. If `contentLocales.test.ts` lists the families it checks, add `'schedule.error'` and `'unlink.error'` as it lists the others.

`versionsMath.ts`:

```ts
/** After Make versions or Unlink: the other posts of the group, before and after, whose cached copies show the old group (5A-2 review). */
export function groupPostsToRefresh(before: PostGroup | null, after: PostGroup | null, current: number): number[] {
  const ids = [...(before?.posts ?? []), ...(after?.posts ?? [])].map(p => p.id).filter(id => id !== current)
  return [...new Set(ids)]
}
```

`VersionsSection.tsx`:
- `run` takes the family: `const run = async (family: 'version' | 'unlink', call: () => Promise<void>)`, using `errorKey(family, …)`. `make` passes `'version'` and `unlink` passes `'unlink'`.
- After each `onPost(…)`, refresh the others: `for (const id of groupPostsToRefresh(group, answer.post.group ?? null, post.id)) void queryClient.invalidateQueries({ queryKey: ['content', brand, 'post', id], exact: true })`. Here `queryClient = useQueryClient()` and `brand = useBrandId()`, imported as the other panel files import them. For unlink, the answer's post is the one returned by `api.unlinkGroup`.

`ideasMath.ts`:

```ts
/** Undo after Schedule (5A-2 review): the day goes, and the poster goes back to the one the post had before the dialog. */
export function unscheduleBody(moved: { updated_at: string; poster_id?: number | null }, before: { poster_id?: number | null }): {
  updated_at: string
  scheduled_date: null
  poster_id?: number | null
} {
  const body = { updated_at: moved.updated_at, scheduled_date: null }
  const was = before.poster_id ?? null
  return (moved.poster_id ?? null) === was ? body : { ...body, poster_id: was }
}
```

`IdeasPage.tsx`:
- `undo` holds `{ moved: PostCard; before: PostCard } | null`.
- `scheduled(post)` reads the post being scheduled before clearing it: `const before = scheduling ?? post; setScheduling(null); setUndo({ moved: post, before })`.
- `unschedule()` sends `api.movePost(undo.moved.id, unscheduleBody(undo.moved, undo.before))`.
- The line that shows the day reads `undo.moved.scheduled_date`.

`ScheduleDialog.tsx`:
- `errorKey('move', …)` becomes `errorKey('schedule', …)`;
- the `as Parameters<typeof api.movePost>[1]` cast goes. If tsc then refuses the call, type `scheduleBody`'s return as the parameter type and ledger it;
- `<PosterSelect … loading={team.isLoading} />`.

`PosterSelect.tsx`: add `loading?: boolean` to the props. While loading, render:

```tsx
if (loading) {
  return (
    <select value="" disabled aria-busy="true" onChange={() => {}} className={className}>
      <option value="">{t('content.common.loading', 'Loading…')}</option>
    </select>
  )
}
```

`panelState.ts` `refusalOf`:

```ts
  if (code === 'bad_link') return { invalid: ['link'], family: 'link' }
  // Task 2 (5A-2 follow-up): a version moved onto a platform its group already has.
  if (code === 'version_exists') return { invalid: ['platform'], family: 'save' }
  return { invalid: invalidFields(fields), family: 'save' }
```

`PostActions.tsx`: the comment `approvals on or off` becomes `whether approvals are on or off; with approvals off, anyone may mark it published`.

- [ ] **Step 4: Run them to see them pass, then the frontend suite, types and lint**

Run: `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes; $R/vt.sh src/content && cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -3`
Expected: `src/content` all green; `TSC-CLEAN`; lint `17 problems` (the baseline), none in a file this task changed.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -m "Content portal: Date beside Time; the morning switch keeps its saved state; Unlink and Plan moves get their own words; versions refresh their group; Schedule waits for the team and Undo restores the poster" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format='%h %s'
```

---

### Task 7: The documents — specs and runbook

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-content-release-5-design.md` (§5.2, §5.4)
- Modify: `docs/superpowers/specs/2026-10-16-content-release-4-design.md` (§7.1, and the send-for-approval and sent-back lines of §6)
- Modify: `docs/content-workspace.md` (runbook)

- [ ] **Step 1: Specs**

Read each named section and edit it with the Edit tool:
- release 5 §5.2: `utm_medium` = `social`, `referral` for the email and blog platforms (owner, 2026-10-20);
- release 5 §5.4: the robot list as `ContentLinkClicks::ROBOTS` now holds it (Pinterest's crawler only; VK, Mastodon, Bluesky, Iframely, Embedly), plus "a prefetch (`Sec-Purpose`, `Purpose`, `X-Purpose`, `X-Moz`) is not counted";
- release 4 §7.1: a deactivated member keeps their name; "Former team member" only for a deleted user (owner, 2026-10-20);
- release 4 §6: sending a post already in review again does nothing; "sent back" ends with a save, a move, Write with AI or a new picture — not with a quality check or a repeat.

Each edit ends with `(owner, 2026-10-20)`.

- [ ] **Step 2: Runbook**

In `docs/content-workspace.md`:
- replace the "Queue (owner check)" bullet with a statement: `retry_after` is 660 s on database, redis and beanstalkd (env `DB_QUEUE_RETRY_AFTER`, `REDIS_QUEUE_RETRY_AFTER`, `BEANSTALKD_QUEUE_RETRY_AFTER`), longer than the longest job (600 s), and `tests/Feature/QueueRetryAfterTest.php` keeps it so. Add the owner check that remains: if Laravel Cloud sets one of those variables, it must be above 600.
- in the release 5b section, record the tag and robot rules above and that short links on the shared domain are accepted (owner, 2026-10-20);
- where the runbook says "Who posts it beside Status", write "Who posts it after Date and Time";
- add a short "Small-fixes batch (2026-10-20)" section listing what changed for people, in plain words:
  - Copied resets after two seconds;
  - "Copy short link" and "Copy link for the team";
  - the bio editor names the rule that failed and warns while the page is off;
  - sending a post in review again does nothing;
  - "sent back" survives a quality check and a repeat;
  - a switched-off poster cannot publish;
  - a version cannot take a platform its group has;
  - the morning email hint for managers;
  - Schedule waits for the team, and Undo restores the poster;
- gather the owner's remaining after-deploy checks for releases 2–5b into one list under "After the deploy (owner, signed in)". Take them from the existing per-release "After the deploy" lines, kept word for word. They are the steps that need a real signed-in brand.

- [ ] **Step 3: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs && git commit -q -m "Content docs: the owner's rulings of 2026-10-20 in the specs and the runbook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format='%h %s'
```

---

### Task 8: The release checks

**Files:**
- Ledger: `$R/php-all.txt`, `$R/vitest-all.txt`, `$R/build.txt`, `$R/eyes.md`, `$R/lighthouse.md`.

- [ ] **Step 1: Every PHP folder, by path**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes
cd /c/wamp64/www/Hexa-Tech-content && XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear >/dev/null; { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } | grep -v '^tests/Feature/Landing/$' > "$R/php-paths.txt"; wc -l < "$R/php-paths.txt"; rm -f "$R/php-all.txt"
"$R/php.sh" $(sed -n 1,10p "$R/php-paths.txt") | tee -a "$R/php-all.txt"     # then 11,20p … to the end
grep -v "exit 0" "$R/php-all.txt"; echo "(nothing above: every path green)"
```

and `tests/Feature/Landing/` alone, in the background (`run_in_background`), its `Tests:` line read when it ends.

Expected: every path `exit 0`; Landing green (1734+ passed). A failure in a path this batch did not touch: run it again on `dfb7134ba` in a scratch worktree before calling it ours or not; ledger the answer.

- [ ] **Step 2: Frontend**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R/vitest-all.txt" 2>&1; tail -5 "$R/vitest-all.txt"; grep -E '^ FAIL ' "$R/vitest-all.txt" | sed 's/ >.*//' | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
npm run build > "$R/build.txt" 2>&1; echo "build exit $?"; cd .. && git status --short | cut -c4- | cut -d/ -f1-2 | sort | uniq -c
git checkout -- frontend/dist public/spa resources/spa-shell 2>/dev/null; git clean -fdq frontend/dist public/spa resources/spa-shell; git status --short
```

Expected: `TSC-CLEAN`; vitest `3 failed` only in `src/lib/plannerMeta.test.ts`; lint `17 problems`; `build exit 0` with changes only under the built folders, then those changes undone (the feature branch never commits a build) and a clean status.

- [ ] **Step 3: Eyes and Lighthouse**

Start the local stack as in release 5b:
- API and the public host together: `LANDING_HOST=sites.localhost CORS_ALLOWED_ORIGINS=http://localhost:5173 artisan serve --port=8012 --no-reload`, in the background;
- the branch's Vite on :5173;
- `token-server.mjs` on :8099.

Use the 5B-2 tools in `$R/tools/` (`pass-seed.php` and `pass-unseed.php` for a temporary brand in local org 16; `eyes-5b.mjs` for screenshots; `lh.mjs` for Lighthouse). Look, at 1440 and 390, at:
- the Brand page's Link-in-bio editor: the name field with the address under it, an invalid name and an empty label after Save showing the named rules, the label placeholders, and the off warning in the read view;
- the panel's fields (Date beside Time) and the short link's "Copy short link";
- Ideas → Schedule.

Lighthouse (accessibility) on the Brand page and the panel. Ledger what was seen in `$R/eyes.md` and the scores in `$R/lighthouse.md`. Expected: everything reads as described; accessibility 100, or the known `label-content-name-mismatch` that predates release 5b. Clean up: unseed the brand, stop the servers (a leftover Vite gets `taskkill` after its command line is checked), free the ports.

Ruling to ledger: `Task 8: Ruling: no Appointments pixel comparison — the batch changes nothing under src/workspace or the Appointments portal (git diff dfb7134ba --stat -- frontend/src/workspace frontend/src/appointments prints nothing) — cost if wrong: an unseen Appointments change; the deploy's content check still opens /appointments`. Before ledgering it, run that `git diff` and see it print nothing. If it prints anything, run the pixel comparison the 5B-2 way instead (`tools/pixels.mjs`).

---

### Task 9: The deploy (source-patch recipe, standing go)

Run this task after the final whole-branch review and its fix pass, so the feature tip it ships is final. Merging to `main` is a production deploy: Laravel Cloud runs `migrate --force` (this batch has no migration) and rebuilds the SPA. The change list runs from the last deployed feature tip `dfb7134ba`. The owner's standing go applies: no question before the push. Any trip below stops the task and goes to the owner.

**Files:**
- Temporary: worktree `C:\wamp64\www\Hexa-Tech-deploy-content-fixes` on branch `deploy/content-fixes` (from `origin/main`), with a copied `vendor`, the local `.env` and a `frontend/node_modules` junction; removed in Step 8, the branch kept.
- Ledger: `$R/deploy-list.txt`, `$R/deploy-php.txt`, `$R/deploy-vitest.txt`, `$R/deploy-build.txt`, `$R/postdeploy.txt`.

- [ ] **Step 1: Fix the inputs**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git status --short && git fetch -q origin
TIP=$(git rev-parse HEAD); echo "TIP $TIP"; git log -1 --format='%h %s' origin/main
git diff --stat dfb7134ba origin/main -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: a clean status; origin/main `162b63d75`; the `git diff` line prints nothing. If origin/main moved, Step 3's fourth guard must prove none of its changes touch this batch's files; ledger the new sha.

- [ ] **Step 2: The deploy worktree**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree add ../Hexa-Tech-deploy-content-fixes -B deploy/content-fixes origin/main && cp .env ../Hexa-Tech-deploy-content-fixes/.env
```

```powershell
robocopy C:\wamp64\www\Hexa-Tech-content\vendor C:\wamp64\www\Hexa-Tech-deploy-content-fixes\vendor /E /NFL /NDL /NJH /NJS /NP; if ($LASTEXITCODE -lt 8) { 'VENDOR-OK' }
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-deploy-content-fixes\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

Expected: `VENDOR-OK`; the junction made. On `ENOSPC`, stop and report; delete nothing.

- [ ] **Step 3: The change list and its guards**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes
cd /c/wamp64/www/Hexa-Tech-content && TIP=$(git rev-parse HEAD) && git diff --no-renames --name-status dfb7134ba "$TIP" > "$R/deploy-list.txt"; wc -l < "$R/deploy-list.txt"
cut -f2 "$R/deploy-list.txt" | grep -vE '^(app/|config/queue\.php$|resources/views/content-public/|tests/|frontend/src/|docs/)'; echo "(nothing above: every path is in the allowlist)"
cut -f2 "$R/deploy-list.txt" | grep -E '^(frontend/dist/|public/spa/|resources/spa-shell/|composer\.|frontend/package|database/|routes/)'; echo "(nothing above: no build, dependency, migration or route)"
git diff --name-only 162b63d75 origin/main -- $(cut -f2 "$R/deploy-list.txt"); echo "(nothing above: production has not changed any file of this batch since 162b63d75)"
cut -f1 "$R/deploy-list.txt" | sort | uniq -c
```

Expected:
- about 45 lines;
- the first three guards print nothing but their notes;
- the status count shows `A` and `M` only.

A path outside the allowlist: stop and find out why. Another feature's commit must not ride the deploy.

- [ ] **Step 4: Apply, check parity, commit**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes
TIP=$(git -C /c/wamp64/www/Hexa-Tech-content rev-parse HEAD); cd /c/wamp64/www/Hexa-Tech-deploy-content-fixes
awk -F'\t' '$1 != "D" {print $2}' "$R/deploy-list.txt" > "$R/deploy-am.txt"; awk -F'\t' '$1 == "D" {print $2}' "$R/deploy-list.txt" > "$R/deploy-d.txt"
xargs -a "$R/deploy-am.txt" git checkout "$TIP" --; [ -s "$R/deploy-d.txt" ] && xargs -a "$R/deploy-d.txt" git rm -q --
git diff --cached --stat | tail -1
git diff --cached "$TIP" -- $(cut -f2 "$R/deploy-list.txt") | head -5; echo "(nothing above: parity with the feature tip)"
git diff "$TIP" --stat -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: the cached stat counts every line of the list; both parity checks print nothing (the second only when origin/main was still `162b63d75`).

Commit (with `TIP_SHA` replaced by the short sha, by editing the command):

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-fixes && git commit -q -F - <<'EOF'
HexaTech Content: small fixes after release 5 (owner rulings 2026-10-20)

Email and blog posts' short links are tagged as a referral; people
tapping inside Pinterest's app are counted, preview robots and prefetches
are not. A post save and its short link are one write; a version cannot
take a platform its group already has. The bio editor names the rule
that failed and warns while the page is off; the first page saved at the
same moment becomes an update. Sending a post in review again does
nothing; "sent back" survives a quality check and a repeat; a switched-off
poster cannot publish. The bell reads the team once. Queue retry_after is
660 s. Source of feature/content-workspace at TIP_SHA (since dfb7134ba).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='%h %s'
```

- [ ] **Step 5: Every suite on the artifact**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes
sed 's#cd /c/wamp64/www/Hexa-Tech-content #cd /c/wamp64/www/Hexa-Tech-deploy-content-fixes #' "$R/php.sh" > "$R/php-deploy.sh" && chmod +x "$R/php-deploy.sh" && grep -n "^cd " "$R/php-deploy.sh"
cd /c/wamp64/www/Hexa-Tech-deploy-content-fixes && XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear >/dev/null; { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } | grep -v '^tests/Feature/Landing/$' > "$R/deploy-paths.txt"; rm -f "$R/deploy-php.txt"
"$R/php-deploy.sh" $(sed -n 1,10p "$R/deploy-paths.txt") | tee -a "$R/deploy-php.txt"     # then 11,20p … to the end
grep -v "exit 0" "$R/deploy-php.txt"; echo "(nothing above: every path green)"
```

with `tests/Feature/Landing/` alone in the background, as in Task 8.

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes
cd /c/wamp64/www/Hexa-Tech-deploy-content-fixes/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R/deploy-vitest.txt" 2>&1; tail -5 "$R/deploy-vitest.txt"; grep -E '^ FAIL ' "$R/deploy-vitest.txt" | sed 's/ >.*//' | sort -u
npm run build > "$R/deploy-build.txt" 2>&1; echo "build exit $?"; cd .. && git status --short | cut -c4- | cut -d/ -f1-2 | sort | uniq -c
git add frontend/dist public/spa resources/spa-shell && git commit -q -m "Build the SPA for the Content small-fixes batch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git status --short && git log -3 --format='%h %s'
```

Expected: every PHP path green; `TSC-CLEAN`; vitest `3 failed` only in `src/lib/plannerMeta.test.ts`; `build exit 0`, changes only in the built folders; a clean status with build commit on source commit on origin/main. Ledger `Task 9: note: artifact ready — …`. Any red: stop, tell the owner, push nothing.

- [ ] **Step 6: Push (standing go)**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes
cd /c/wamp64/www/Hexa-Tech-deploy-content-fixes && git fetch -q origin && git log -1 --format='%h' origin/main
OLD=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "OLD $OLD" | tee "$R/postdeploy.txt"
git push origin deploy/content-fixes:main 2>&1 | tail -2; date -u +%FT%TZ
```

Expected: origin/main still the commit the branch was cut from (if it moved: stop, push nothing, start again from Step 1). Then wait for the new bundle (Bash, `run_in_background`):

```bash
OLD='<the OLD path>'; for i in $(seq 1 60); do NEW=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); [ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && { echo "NEW $NEW at $(date -u +%T)"; exit 0; }; sleep 15; done; echo "STILL OLD after 15 minutes"; exit 1
```

Expected: `NEW /spa/assets/index-….js`. "STILL OLD": look at the Cloud deploy with the owner; never push again on a guess.

- [ ] **Step 7: Verify by content — this batch and every release since 2**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-20-content-small-fixes
B=https://app.hexa-tech.uk; S=https://sites.hexa-tech.uk; NEW=$(curl -s $B/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "NEW $NEW" | tee -a "$R/postdeploy.txt"
curl -s "$B$NEW" -o "$R/live-index.js"; CA=$(grep -o 'ContentApp-[A-Za-z0-9_-]*\.js' "$R/live-index.js" | head -1); AA=$(grep -o 'AppointmentsApp-[A-Za-z0-9_-]*\.js' "$R/live-index.js" | head -1); echo "chunks $CA $AA" | tee -a "$R/postdeploy.txt"
curl -s "$B/spa/assets/$CA" -o "$R/live-content.js"; for w in 'Copy short link' 'Copy link for the team' 'Each button needs a label.' 'those nobody is set to post' 'could not be unlinked'; do printf 'ContentApp has "%s": %s\n' "$w" "$(grep -c "$w" "$R/live-content.js")"; done | tee -a "$R/postdeploy.txt"
for u in bootstrap goals ideas inbox/count team bio; do printf 'api %s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/json' "$B/api/v1/admin/content/$u")"; done | tee -a "$R/postdeploy.txt"
printf 'old content-planner %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/json' "$B/api/v1/admin/content-planner/profile")" | tee -a "$R/postdeploy.txt"
printf 'css %s\n' "$(curl -s -o /dev/null -w '%{http_code}' $S/landing/content-public.css)" | tee -a "$R/postdeploy.txt"
for p in /go/zzzz222 /links/zzzz-none; do printf 'public %s %s app-cookies %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' $S$p)" "$(curl -s -D - -o /dev/null $S$p | grep -i '^set-cookie' | grep -vciE '__cf_bm|_cfuvid')"; done | tee -a "$R/postdeploy.txt"
for p in / /content /content/ideas /content/brand /appointments; do printf 'page %s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done | tee -a "$R/postdeploy.txt"
rm -f "$R/live-index.js" "$R/live-content.js"
```

Expected:
- each phrase count ≥ 1;
- `api bootstrap/goals/ideas/inbox/count/team/bio 401` (releases 2, 3, 4a, 4b, 5a and 5b answer, signed out);
- `old content-planner 404` (retired in release 2);
- `css 200`;
- both public paths `404 app-cookies 0` (Cloudflare's own cookies excluded);
- the five pages `200`.

Any other answer: tell the owner at once, with the line.

- [ ] **Step 8: Clean up and record**

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-deploy-content-fixes\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove --force ../Hexa-Tech-deploy-content-fixes && git worktree list | grep -c deploy-content-fixes; test -d frontend/node_modules/react && echo MODULES-KEPT
```

Expected: `0`; `MODULES-KEPT`.

Then:
- Ledger `Task 9: complete — LIVE as prod main <sha> …`.
- Update the memory file `content-workspace.md` and its `MEMORY.md` line: the batch LIVE, the owner's rulings applied, and what stays the owner's (the signed-in after-deploy checks listed in the runbook; a `*_QUEUE_RETRY_AFTER` variable in Cloud, if set, must be above 600).
- Tell the owner it is live, with the verification lines.
