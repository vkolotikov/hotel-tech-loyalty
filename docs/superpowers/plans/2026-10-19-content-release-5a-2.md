# HexaTech Content — Release 5a, Plan 2: the Portal for Versions, Who Posts It, Reminders and the Morning Email; Release Checks; Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the portal half of release 5a "post it" (spec §3, §4) on Plan 5A-1's server, prove the whole release with the spec's checks (§8), and deploy it (§9) after the owner's final "yes, deploy".

**Architecture:**
- **One data layer:** `lib/types.ts`, `lib/api.ts`, `lib/errors.ts` and `lib/planCache.ts` learn the server's new fields (`group`, `group_size`, `poster`, `poster_id`, the bell's reminder kinds, `staff.id`, `staff.morning_email`), calls (`makeVersions`, `unlinkGroup`, `team`, `setMorningEmail`, `movePost` with `poster_id`) and refusals (family `version`, `move.invalid`). The bootstrap gains `staff.id` (one line on the server) so the portal knows the person's own posts.
- **The screens:** the panel gets a **Versions** section (chips per post in the group, Make versions… with platforms and Adapt with AI / Copy as is, Unlink, "Adapting for …", the kept note) and a **Who posts it** select beside Status; Ideas → Schedule asks who posts it; Mark published is offered to the post's own poster on an approved or ready post while approvals are on; cards get a versions mark.
- **The bell:** two new kinds ("To post today", "Not marked as posted") with their own second line, and the **morning email switch** at the foot of the bell's menu (`PopList` learns a footer).
- **Then** the runbook, the release checks (every PHP folder, the frontend suites, the build, Appointments pixel for pixel, a browser pass as a manager and as a staff member, Lighthouse, eyes) and the deploy of release 5a (Plans 5A-1 + 5A-2 together) by the source-patch recipe.

**Tech Stack:** React 19 + TypeScript + Vite, TanStack Query, react-i18next (five bundles), Tailwind tokens (`a-*`, `c-*`), vitest in node with `renderToStaticMarkup`; Laravel 13 / PHP 8.4.20 for the checks; Playwright (headless shell) and Lighthouse 13.5 for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-19-content-release-5-design.md` (approved 2026-10-19), §3, §4, §7 (5a), §8, §9. The server half is Plan `docs/superpowers/plans/2026-10-19-content-release-5a-1.md` (built, reviewed, fixed; feature tip `b990168a8`; its ledger `.superpowers/sdd/archive/2026-10-19-content-release-5a-1/`).

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `b990168a8` plus this plan's commit. Production is release 4b: prod main `2fe1d4dba` = the source of feature tip `8a05dade1` + a build. The server endpoints this plan uses (all under `/api/v1/admin/content`, `?brand_id=` as today):
- `POST posts/{id}/versions` (`platforms` 1–7, `ai`) → 201 `{post, versions: [card]}`; refusals `version_exists` 409, `ai_budget_used_up` 403, `not_found` 404, `invalid` 422. `DELETE posts/{id}/group` → `{post}`.
- `GET posts/{id}` → `post.group` (`{id, posts: [{id, platform, status, scheduled_date, scheduled_time}], adapting: [id], kept_original: [id], kept_reason: 'budget'|'ai_failed'|null}` or null), `post.poster` (`{id, name}` or null for nobody / someone no longer on the team); every card → `group_size` (0 below 2), `poster_id` (stored).
- `GET team` → `{team: [{id, name, role: 'manager'|'staff'}]}`; `POST posts`, `PUT posts/{id}`, `POST posts/{id}/move` take `poster_id` (422 `errors.poster_id` for someone off the team; the post's own poster sent again is no change).
- `POST posts/{id}/mark-published`: while approvals are on, staff may mark a post published only when they are its poster and it is Approved or Ready.
- `GET inbox` items gain kinds `to_post` and `not_posted` (`id` `to_post:{post}`, `by` null, `note` null); every item's `post` carries `scheduled_time` and `status`; `count` includes them.
- `PUT me/morning-email` (`on`) → `{on}`; the bootstrap's `staff.morning_email`.

**Design calls beyond the spec** (each pinned by a test or a comment):
- **The morning email switch sits at the foot of the "For you" bell's menu**, not in the person menu: that menu is the shared workspace shell's (Appointments uses it too), and the release checks expect Appointments unchanged (`46 screens, 0 differ`). The bell is Content's own menu for notices.
- **The cards' versions mark says "Versions: 3"**, not "1 of 3 versions": the server sends the group's size, not a card's place in it, and the bundles' counted words put the number after a colon (`contentLocales.test.ts`, `COUNTED`).
- **The bootstrap gains `staff.id`** (Task 1, one server line and one PHP test): Mark published for the poster compares the post's `poster_id` with it.
- **A reminder's second line** is its time ("at 18:00") or the day it was due, then its status only when it is not Approved or Ready.
- **The Make versions form is inline** in the Versions section, as Repeat's form is, not a dialog.

## Global Constraints

- **Branch:** never push the feature branch; never commit its built `frontend/dist`, `public/spa` or `resources/spa-shell`. Only Task 9 pushes, and only after the owner's explicit "yes, deploy" given at Task 9's question (an earlier "yes, deploy" does not carry over).
- **Ledger and tools:** `$R5C` = `/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2`; shell state does not survive between tool calls, so every command that uses it starts with `R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2`. Task 1, Step 1 sets it up with `vt.sh` (vitest on paths, honest exit code), `words.mjs` (locale keys inserted into the five bundles without reformatting them, from a JSON spec), `php.sh` (each PHP path alone, honest exit code) and `extract.mjs` (copies a plan code block into a file: `node $R5C/extract.mjs $R5C/task-N-brief.md "<line naming the file>" <path>`) from 4B-2's archive.
- **Appending to a test file:** a block the plan says to append is extracted to `$R5C/append.txt` and added with `cat "$R5C/append.txt" >> <file>` (never a heredoc).
- **Frontend commands** (Git Bash): types `cd frontend && npx tsc -b`; tests `$R5C/vt.sh <paths…>` (paths relative to `frontend/`); scoped lint `cd frontend && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts`.
- **Baselines** (Task 1, Step 1 measures them again and ledgers them): the full vitest run has exactly 3 failures (`src/lib/plannerMeta.test.ts`); the scoped lint has exactly 17 errors. Anything else is ours.
- **Tests cannot click** (`vitest.config.ts`: node environment, no jsdom). Every click rule lives in a pure helper with its own test; components are rendered with `renderToStaticMarkup` and checked by their markup. Static markup escapes `'` as `&#x27;`: English words the tests look for use the typographic `’`. Adjacent text nodes render with `<!-- -->` between them: a line the tests look for is built as one string.
- **Types:** every new field on a type that literal test fixtures build (`PostCard`, `PostDetail`, `Bootstrap['staff']`, `InboxItem['post']`) is optional, so the fixtures still compile.
- **Words:** every new literal `content.*` key in all five bundles (`frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`), inserted with `cd /c/wamp64/www/Hexa-Tech-content && node $R5C/words.mjs $R5C/tN-words.json` from a JSON spec the plan gives (keys from the bundle root, each with `en`, `ru`, `de`, `fr`, `es`), written with the Write tool. Keys built at run time go into `FAMILIES` in `content/i18n/contentLocales.test.ts`; a word holding a count puts the number after a colon (`COUNTED` in the same test). German is formal (Sie), Spanish informal (tú), French formal (vous), as the bundles are.
- **Refusals:** a new family in `lib/errors.ts` (`ERRORS`) must deep-equal `en.<family>.error` (`errors.test.ts`); the portal's own sentence for every refusal; the server's message is never shown.
- **Portal rules (`content/tokens.test.ts`):** nothing imported from `src/appointments`; no bare `hover:-translate-*`; no text under 12 px; only `a-*` / `c-*` colour classes (this plan uses `text-a-accent-text`, `border-a-accent-text`, `bg-a-accent`, `bg-a-accent/10`, `bg-a-surface`, `bg-a-surface-2`, `text-a-text`, `text-a-text-2`, `text-a-danger`, `border-a-border`, all already in use).
- **React lint:** no synchronous `setState` inside an effect; no `ref.current` read during render; no component defined inside another; a component file exports components only (helpers live in `*.ts` files).
- **Appointments and the shared workspace core (`src/appointments`, `src/workspace`) do not change in this plan:** the release checks expect `46 screens, 0 differ`.
- **PHP:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by folder, in the foreground (`$R5C/php.sh <paths…>`); never a bare `php artisan test`. Any `artisan tinker` call gets `< /dev/null`.
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace — write code holding backslashes with the Write or Edit tool (or `extract.mjs`), never a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Versions asked for while the panel holds unsaved edits:** Make versions and Unlink wait ("Save your changes first."), as Repeat does — a version copies the post as saved.
   - Pinned by Task 2's `versionsSection.test.tsx` ("waits while the panel holds unsaved edits").
2. **The month's AI budget used up:** "Adapt with AI" is unavailable and the versions are copied as they are; a box chosen before the budget ran out is never sent as `ai: true`.
   - Pinned by Task 2's `versionsMath.test.ts` (`aiAllowed`, `versionsBody`) and the form's render test.
3. **A post with a version for every platform:** Make versions is not offered; the section says so.
   - Pinned by Task 2's `versionsMath.test.ts` (`versionChoices`) and `versionsSection.test.tsx`.
4. **A reminder with no time, a post not ready, a day long past:** the bell's second line has no "at", names the status only when it is not Approved or Ready, and says the day a missed post was due — in the reader's words.
   - Pinned by Task 6's `bellMath.test.ts` reminders case.
5. **"Who posts it" before the team list has loaded, or after the poster left:** the select keeps the poster's name while the list loads; someone who left shows as "Not set" and nothing is sent unless the person picks someone.
   - Pinned by Task 3's `panelState.test.ts` (`posterChoices`, `formOf`, `changes`).

---

## File map

- **Task 1 (the data layer):** `frontend/src/content/lib/types.ts`, `lib/api.ts`, `lib/errors.ts`, `lib/planCache.ts`; `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`; tests `lib/api.test.ts`, `lib/errors.test.ts`, `lib/planCache.test.ts`, `tests/Feature/Content/MorningEmailSwitchTest.php`; words (`version` family, `move.invalid`).
- **Task 2 (Versions section):** new `panel/versionsMath.ts`, new `panel/VersionsSection.tsx`; `panel/repeatMath.ts` (`pollsWhileRewording`), `panel/PostPanel.tsx`; tests new `panel/versionsMath.test.ts`, new `panel/versionsSection.test.tsx`, `panel/repeatMath.test.ts`, `i18n/contentLocales.test.ts`; words.
- **Task 3 (Who posts it):** new `ui/PosterSelect.tsx`; `panel/panelState.ts`, `panel/PostFormFields.tsx`, `panel/PostPanel.tsx`, `ideas/ideasMath.ts`, `ideas/ScheduleDialog.tsx`; tests `panel/panelState.test.ts`, new `panel/postFormFields.test.tsx`, new `ideas/scheduleMath.test.ts`, new `ideas/scheduleDialog.test.tsx`; words.
- **Task 4 (the poster's Mark published):** `lib/approval.ts`, `panel/PostActions.tsx`; tests `lib/approval.test.ts`, `panel/postActions.test.tsx`; words.
- **Task 5 (the versions mark on cards):** `lib/approval.ts` (`versionsOf`, `flagWords`), `ui/CardFlags.tsx`, `plan/PostCardView.tsx`; tests `ui/cardFlags.test.tsx`, `lib/approval.test.ts`, `i18n/contentLocales.test.ts`; words.
- **Task 6 (the bell):** `bell/bellMath.ts`, `ui/PopMenu.tsx`, new `bell/MorningEmailSwitch.tsx`, `bell/ForYouBell.tsx`; tests `bell/bellMath.test.ts`, `ui/popMenu.test.tsx`, new `bell/morningEmailSwitch.test.tsx`, `i18n/contentLocales.test.ts`; words.
- **Task 7 (runbook):** `docs/content-workspace.md`.
- **Task 8 (release checks):** files under `$R5C` only (seed/unseed, the browser pass, Lighthouse), plus test-first fixes of any defect found.
- **Task 9 (deploy):** a temporary deploy worktree on branch `deploy/content-r5a`.

---

### Task 1: The data layer — types, calls, refusal words, the panel's cache, the person's id

**Files:**
- Modify: `frontend/src/content/lib/types.ts`, `frontend/src/content/lib/api.ts`, `frontend/src/content/lib/errors.ts`, `frontend/src/content/lib/planCache.ts`, `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`
- Test: `frontend/src/content/lib/api.test.ts`, `frontend/src/content/lib/errors.test.ts`, `frontend/src/content/lib/planCache.test.ts`, `tests/Feature/Content/MorningEmailSwitchTest.php`
- Words: `$R5C/t1-words.json`

**Interfaces:**
- Produces (types): `GroupPost {id, platform, status, scheduled_date, scheduled_time}`; `PostGroup {id, posts: GroupPost[], adapting: number[], kept_original: number[], kept_reason: 'budget'|'ai_failed'|null}`; `TeamMember {id, name, role: 'manager'|'staff'}`; optional `PostCard.group_size?: number`, `PostCard.poster_id?: number | null`, `PostDetail.group?: PostGroup | null`, `PostDetail.poster?: Person | null`, `Bootstrap['staff'].id?: number`, `Bootstrap['staff'].morning_email?: boolean`; `PostFields.poster_id?: number | null`; `InboxKind` adds `'to_post' | 'not_posted'`; `InboxItem['post']` adds optional `scheduled_time`, `status`.
- Produces (calls on `contentApi(brand)`): `makeVersions(id, platforms: Platform[], ai: boolean)` → `{post: PostDetail, versions: PostCard[]}`; `unlinkGroup(id)` → `{post}`; `team()` → `{team: TeamMember[]}`; `setMorningEmail(on: boolean)` → `{on: boolean}`; `movePost(id, {…, poster_id?: number | null})`.
- Produces (refusals): family `version` (`version_exists`, `ai_budget_used_up`, `invalid`, `not_found`, `unknown`); `move.invalid`.
- Produces (cache): `cardOf` carries `group_size` and `poster_id`.
- Produces (server): the bootstrap's `staff.id` (the user's id).

- [ ] **Step 1: Set up the ledger and measure the baselines**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R5C=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-19-content-release-5a-2.md)
A=.superpowers/sdd/archive/2026-10-18-content-release-4b-2
cp "$A/vt.sh" "$A/words.mjs" "$A/php.sh" "$A/extract.mjs" "$R5C/" && chmod +x "$R5C/vt.sh" "$R5C/php.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-19-content-release-5a-2.md" > "$R5C/progress.md"
echo "$R5C"; ls "$R5C"; grep -n "^cd " "$R5C/php.sh" "$R5C/vt.sh"
cd frontend && npx vitest run > "$R5C/base-vitest.txt" 2>&1; tail -5 "$R5C/base-vitest.txt"; grep -E '^ FAIL ' "$R5C/base-vitest.txt" | sed 's/ >.*//' | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `$R5C` ends in `.superpowers/sdd/2026-10-19-content-release-5a-2`; the listing shows `extract.mjs php.sh plan-path progress.md vt.sh words.mjs`; both scripts `cd` into `/c/wamp64/www/Hexa-Tech-content`; vitest `Tests  3 failed | … passed` with the only `FAIL` file `src/lib/plannerMeta.test.ts`; lint `✖ 17 problems (17 errors, 0 warnings)`. Ledger: `Task 1: note: baselines — vitest <n> passed + 3 plannerMeta; lint 17`. If either baseline differs, ledger the new numbers and use them from here on.

- [ ] **Step 2: Write the failing tests**

Append to `frontend/src/content/lib/api.test.ts` (extract this block to `$R5C/append.txt`, then `cat "$R5C/append.txt" >> frontend/src/content/lib/api.test.ts`):

```ts

describe('release 5a calls (spec 2026-10-19)', () => {
  it('reaches versions, the team and the morning email switch under the prefix, and sends who posts it on a schedule', async () => {
    calls.fail = null
    const api = contentApi(5)
    await api.makeVersions(9, ['linkedin', 'x'], true)
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/versions?brand_id=5', body: { platforms: ['linkedin', 'x'], ai: true } })
    await api.unlinkGroup(9)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/posts/9/group?brand_id=5' })
    await api.team()
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/team?brand_id=5' })
    await api.setMorningEmail(true)
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/me/morning-email?brand_id=5', body: { on: true } })
    await api.movePost(9, { updated_at: 'x', scheduled_date: '2026-10-09', poster_id: 4 })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/move?brand_id=5', body: { scheduled_date: '2026-10-09', poster_id: 4 } })
  })
})
```

Append to `frontend/src/content/lib/errors.test.ts` (the same way):

```ts

describe('release 5a refusals (spec 2026-10-19 §7.3)', () => {
  it('words a refused version and a refused poster on a schedule in the portal’s own sentence', () => {
    expect(errorKey('version', 'version_exists')).toEqual(['content.version.error.version_exists', 'This post already has a version for that platform.'])
    expect(errorKey('version', 'ai_budget_used_up')[1]).toBe("This month's AI budget is used up. Choose Copy as is.")
    expect(errorKey('version', 'teapot')[0]).toBe('content.version.error.unknown')
    expect(errorKey('move', 'invalid')).toEqual(['content.move.error.invalid', 'Check the day and who posts it.'])
  })
})
```

Append to `frontend/src/content/lib/planCache.test.ts` (the same way):

```ts

describe('release 5a: what the panel keeps', () => {
  it('carries a post’s group size and who posts it onto its card', () => {
    const detail = { ...card(5, '2026-10-07'), group_size: 3, poster_id: 7, language: 'en' } as unknown as PostDetail
    expect(cardOf(detail)).toEqual(card(5, '2026-10-07', { group_size: 3, poster_id: 7 }))
  })
})
```

In `tests/Feature/Content/MorningEmailSwitchTest.php`, replace:

```php
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertJsonPath('staff.morning_email', true);
    }
}
```

with:

```php
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertJsonPath('staff.morning_email', true);
    }

    // Plan 5A-2: the portal knows the person's own posts by this id (Mark published for the poster, spec 2026-10-19 §4.4).
    public function test_the_bootstrap_names_the_person_by_id(): void
    {
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('staff.id', $this->staffMember->id);
        $this->asManager()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('staff.id', $this->manager->id);
    }
}
```

- [ ] **Step 3: Run them to see them fail**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; "$R5C/vt.sh" src/content/lib/api.test.ts src/content/lib/errors.test.ts src/content/lib/planCache.test.ts > "$R5C/t1-red.txt"; tail -8 "$R5C/t1-red.txt"; "$R5C/php.sh" tests/Feature/Content/MorningEmailSwitchTest.php
```

Expected: vitest fails (`makeVersions is not a function`; no `version` family; `cardOf` drops `group_size`); PHP `exit 1` (`staff.id` missing).

- [ ] **Step 4: The types, calls, refusals, cache and the id**

In `frontend/src/content/lib/types.ts`, replace:

```ts
  staff: { name: string; role: string | null; can_manage: boolean }
```

with:

```ts
  /** `id`: the user's own id — the posts they post (spec 2026-10-19 §4.4); `morning_email`: their switch (§4.5). */
  staff: { name: string; role: string | null; can_manage: boolean; id?: number; morning_email?: boolean }
```

replace:

```ts
  /** Spec §6.3: a draft whose latest approval step sent it back, with no change to the post since. */
  sent_back?: boolean
}
```

with:

```ts
  /** Spec §6.3: a draft whose latest approval step sent it back, with no change to the post since. */
  sent_back?: boolean
  /** Spec 2026-10-19 §3.4: the posts in its group of versions (0 for none and for a group of one). */
  group_size?: number
  /** Spec 2026-10-19 §4.1: who posts it, as stored (the panel's `poster` says whether they are still on the team). */
  poster_id?: number | null
}
```

replace:

```ts
  /** Its comments and approval steps, oldest first, the newest 200 (`GET posts/{id}` and the approval steps send it). */
  timeline?: TimelineItem[]
}
```

with:

```ts
  /** Its comments and approval steps, oldest first, the newest 200 (`GET posts/{id}` and the approval steps send it). */
  timeline?: TimelineItem[]
  /** Its versions for other platforms (spec 2026-10-19 §3.4); null when it is in no group (or a group of one). */
  group?: PostGroup | null
  /** Who posts it: a member of the brand's team, or null for nobody (also someone who left) (spec 2026-10-19 §4.1). */
  poster?: Person | null
}

/** A post in a group of versions, as the panel lists it (spec 2026-10-19 §3.4). */
export interface GroupPost { id: number; platform: Platform; status: PostStatus; scheduled_date: DateKey | null; scheduled_time: string | null }
/** A post's group: its posts oldest first, the versions the AI is still adapting, and those it did not adapt, and why (§3.3). */
export interface PostGroup { id: number; posts: GroupPost[]; adapting: number[]; kept_original: number[]; kept_reason: 'budget' | 'ai_failed' | null }
/** Someone on the brand's team, for "Who posts it" (spec 2026-10-19 §4.1). */
export interface TeamMember { id: number; name: string; role: 'manager' | 'staff' }
```

replace:

```ts
  cta?: string | null
  hashtags?: string[]
}

export interface Variation { id: number; type: Rewrite; copy: string }
```

with:

```ts
  cta?: string | null
  hashtags?: string[]
  /** Who posts it (spec 2026-10-19 §4.1): a member of the team, or null for nobody. */
  poster_id?: number | null
}

export interface Variation { id: number; type: Rewrite; copy: string }
```

replace:

```ts
export type InboxKind = 'waiting' | 'approved' | 'sent_back' | 'comment'
export interface InboxItem {
  id: string
  kind: InboxKind
  post: Pick<PostCard, 'id' | 'platform' | 'title' | 'hook' | 'topic' | 'scheduled_date'> | null
```

with:

```ts
export type InboxKind = 'waiting' | 'approved' | 'sent_back' | 'comment' | 'to_post' | 'not_posted'
export interface InboxItem {
  id: string
  kind: InboxKind
  /** The reminders' second line reads its time and status (spec 2026-10-19 §4.3). */
  post: (Pick<PostCard, 'id' | 'platform' | 'title' | 'hook' | 'topic' | 'scheduled_date'> & { scheduled_time?: string | null; status?: PostStatus }) | null
```

In `frontend/src/content/lib/api.ts`, replace:

```ts
  RepeatEvery, Rewrite, Snippet, SnippetKind, SnippetSuggestion, StrategyDetail, StrategySummary, Template, TemplateFields, TemplateSuggestion,
  TimelineComment, Variation, VoiceFields, InboxPayload,
} from './types'
```

with:

```ts
  RepeatEvery, Rewrite, Snippet, SnippetKind, SnippetSuggestion, StrategyDetail, StrategySummary, Template, TemplateFields, TemplateSuggestion,
  TimelineComment, Variation, VoiceFields, InboxPayload, TeamMember,
} from './types'
```

replace:

```ts
    movePost: (id: number, body: { updated_at: string; scheduled_date: DateKey | null; scheduled_time?: string | null }): Promise<{ post: PostCard }> =>
      watched(api.post(url(`posts/${id}/move`), body)),
```

with:

```ts
    /** Ideas → Schedule also sends who posts it, when the person chose (spec 2026-10-19 §4.1). */
    movePost: (id: number, body: { updated_at: string; scheduled_date: DateKey | null; scheduled_time?: string | null; poster_id?: number | null }): Promise<{ post: PostCard }> =>
      watched(api.post(url(`posts/${id}/move`), body)),
```

and replace:

```ts
    inboxSeen: (at: string | null): Promise<{ count: number }> => watched(api.post(url('inbox/seen'), at === null ? {} : { at })),
```

with:

```ts
    inboxSeen: (at: string | null): Promise<{ count: number }> => watched(api.post(url('inbox/seen'), at === null ? {} : { at })),
    /** Versions per platform (spec 2026-10-19 §3): the post, now in its group, and the new versions as cards. */
    makeVersions: (id: number, platforms: Platform[], ai: boolean): Promise<{ post: PostDetail; versions: PostCard[] }> =>
      watched(api.post(url(`posts/${id}/versions`), { platforms, ai })),
    unlinkGroup: (id: number): Promise<{ post: PostDetail }> => watched(api.delete(url(`posts/${id}/group`))),
    /** The brand's team for "Who posts it" (spec §4.1): names and roles only. */
    team: (): Promise<{ team: TeamMember[] }> => watched(api.get(url('team'))),
    /** The morning email switch (spec §4.5): each person's own. */
    setMorningEmail: (on: boolean): Promise<{ on: boolean }> => watched(api.put(url('me/morning-email'), { on })),
```

In `frontend/src/content/lib/errors.ts`, replace:

```ts
  move: {
    changed_elsewhere: 'Someone else changed this post. The plan now shows their version.',
    published_cannot_move: 'A published post keeps the date it went out.',
    not_found: 'This post no longer exists.',
    unknown: 'The post could not be moved. Please try again.',
  },
```

with:

```ts
  move: {
    changed_elsewhere: 'Someone else changed this post. The plan now shows their version.',
    published_cannot_move: 'A published post keeps the date it went out.',
    // Ideas → Schedule sends who posts it (spec 2026-10-19 §4.1): someone off the team is refused.
    invalid: 'Check the day and who posts it.',
    not_found: 'This post no longer exists.',
    unknown: 'The post could not be moved. Please try again.',
  },
```

and replace:

```ts
  inbox: {
    unknown: 'The list could not be loaded. Please try again.',
  },
} as const
```

with:

```ts
  inbox: {
    unknown: 'The list could not be loaded. Please try again.',
  },
  // Release 5a (spec 2026-10-19 §3). `invalid` is also the portal's own check (no platform picked).
  version: {
    version_exists: 'This post already has a version for that platform.',
    ai_budget_used_up: "This month's AI budget is used up. Choose Copy as is.",
    invalid: 'Choose at least one platform.',
    not_found: 'This post no longer exists.',
    unknown: 'The versions could not be made. Please try again.',
  },
} as const
```

In `frontend/src/content/lib/planCache.ts`, replace:

```ts
  const { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back } = post
  return { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back }
```

with:

```ts
  const { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back, group_size, poster_id } = post
  return { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back, group_size, poster_id }
```

In `app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php`, replace:

```php
            'staff'        => [
                'name'          => (string) $user->name,
```

with:

```php
            'staff'        => [
                // Plan 5A-2: the portal knows the person's own posts by it (spec 2026-10-19 §4.4).
                'id'            => (int) $user->id,
                'name'          => (string) $user->name,
```

Write `$R5C/t1-words.json` with the Write tool:

```json
{
  "version.error.version_exists": { "en": "This post already has a version for that platform.", "ru": "У этого поста уже есть версия для этой платформы.", "de": "Für diese Plattform gibt es schon eine Version dieses Beitrags.", "fr": "Cette publication a déjà une version pour cette plateforme.", "es": "Esta publicación ya tiene una versión para esa plataforma." },
  "version.error.ai_budget_used_up": { "en": "This month's AI budget is used up. Choose Copy as is.", "ru": "Месячный бюджет на ИИ исчерпан. Выберите «Скопировать как есть».", "de": "Das KI-Budget dieses Monats ist aufgebraucht. Wählen Sie „Unverändert kopieren“.", "fr": "Le budget IA du mois est épuisé. Choisissez « Copier tel quel ».", "es": "El presupuesto de IA de este mes se ha agotado. Elige «Copiar tal cual»." },
  "version.error.invalid": { "en": "Choose at least one platform.", "ru": "Выберите хотя бы одну платформу.", "de": "Wählen Sie mindestens eine Plattform.", "fr": "Choisissez au moins une plateforme.", "es": "Elige al menos una plataforma." },
  "version.error.not_found": { "en": "This post no longer exists.", "ru": "Этого поста больше нет.", "de": "Diesen Beitrag gibt es nicht mehr.", "fr": "Cette publication n'existe plus.", "es": "Esta publicación ya no existe." },
  "version.error.unknown": { "en": "The versions could not be made. Please try again.", "ru": "Не удалось создать версии. Попробуйте ещё раз.", "de": "Die Versionen konnten nicht erstellt werden. Bitte versuchen Sie es erneut.", "fr": "Les versions n'ont pas pu être créées. Veuillez réessayer.", "es": "No se pudieron crear las versiones. Inténtalo de nuevo." },
  "move.error.invalid": { "en": "Check the day and who posts it.", "ru": "Проверьте день и того, кто публикует.", "de": "Prüfen Sie den Tag und wer ihn veröffentlicht.", "fr": "Vérifiez le jour et qui la publie.", "es": "Revisa el día y quién la publica." }
}
```

Then insert the words:

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R5C/words.mjs" "$R5C/t1-words.json"
```

Expected: the five bundles written, six keys each.

- [ ] **Step 5: Run the tests, the types and the Content folders**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R5C/vt.sh" src/content src/i18n; "$R5C/php.sh" tests/Feature/Content/MorningEmailSwitchTest.php tests/Feature/Content/
```

Expected: `TSC-CLEAN`; vitest all passed in `src/content` and `src/i18n`; `MorningEmailSwitchTest | Tests:    3 passed`; `tests/Feature/Content/ | Tests:    226 passed`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib/types.ts frontend/src/content/lib/api.ts frontend/src/content/lib/errors.ts frontend/src/content/lib/planCache.ts frontend/src/content/lib/api.test.ts frontend/src/content/lib/errors.test.ts frontend/src/content/lib/planCache.test.ts frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json app/Http/Controllers/Api/V1/Admin/Content/BootstrapController.php tests/Feature/Content/MorningEmailSwitchTest.php && git commit -q -m "Content portal: release 5a's data layer — versions, the team, who posts it, the morning email; the bootstrap names the person" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: The panel's Versions section (spec §3.1, §3.3, §3.4)

**Files:**
- Create: `frontend/src/content/panel/versionsMath.ts`, `frontend/src/content/panel/VersionsSection.tsx`
- Modify: `frontend/src/content/panel/repeatMath.ts`, `frontend/src/content/panel/PostPanel.tsx`, `frontend/src/content/i18n/contentLocales.test.ts`
- Test: create `frontend/src/content/panel/versionsMath.test.ts`, `frontend/src/content/panel/versionsSection.test.tsx`; modify `frontend/src/content/panel/repeatMath.test.ts`
- Words: `$R5C/t2-words.json`

**Interfaces:**
- Consumes: `PostGroup`, `GroupPost`, `makeVersions`, `unlinkGroup`, `errorKey('version', …)` (Task 1).
- Produces: `versionChoices(platforms, post: {platform}, group: PostGroup|null): Platform[]`; `aiAllowed(budget: BudgetStatus): boolean`; `type VersionNote`; `versionNote(group, post: {id, platform}): VersionNote`; `versionsBody(picked, choices, ai, budget): {platforms, ai} | null`; components `VersionsSection({post, group, dirty, onPost})`, `VersionsForm({choices, budget, busy, onSubmit, onCancel})`; `pollsWhileRewording(post)` is also true while `post.group.adapting` holds anything.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/panel/versionsMath.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import type { Platform, PostGroup } from '../lib/types'
import { aiAllowed, versionChoices, versionNote, versionsBody } from './versionsMath'

const group = (more: Partial<PostGroup> = {}): PostGroup => ({
  id: 5,
  posts: [
    { id: 5, platform: 'instagram', status: 'draft', scheduled_date: '2026-10-07', scheduled_time: null },
    { id: 6, platform: 'linkedin', status: 'draft', scheduled_date: '2026-10-07', scheduled_time: null },
  ],
  adapting: [], kept_original: [], kept_reason: null, ...more,
})
const ALL: Platform[] = ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email']

describe('versionChoices (spec 2026-10-19 §3.1)', () => {
  it('offers the brand’s platforms not yet in the group, the post’s own left out', () => {
    expect(versionChoices(ALL, { platform: 'instagram' }, null)).toEqual(['linkedin', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'])
    expect(versionChoices(ALL, { platform: 'linkedin' }, group())).toEqual(['tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'])
  })

  // Review Focus 3: a post with a version for every platform is offered none.
  it('offers nothing once every platform has a version', () => {
    expect(versionChoices(['instagram', 'linkedin'], { platform: 'instagram' }, group())).toEqual([])
  })
})

describe('the AI and the request (spec §3.1, §3.3)', () => {
  // Review Focus 2: at the budget cap the versions are copied as they are.
  it('allows the AI until the month’s budget is used up, and never asks for it then', () => {
    expect(aiAllowed('under')).toBe(true)
    expect(aiAllowed('warn')).toBe(true)
    expect(aiAllowed('unlimited')).toBe(true)
    expect(aiAllowed('over')).toBe(false)
    expect(versionsBody(['x', 'linkedin'], ['linkedin', 'tiktok', 'x'], true, 'over')).toEqual({ platforms: ['linkedin', 'x'], ai: false })
    expect(versionsBody(['x'], ['linkedin', 'x'], true, 'under')).toEqual({ platforms: ['x'], ai: true })
    expect(versionsBody(['x'], ['linkedin', 'x'], false, 'under')).toEqual({ platforms: ['x'], ai: false })
  })

  it('sends nothing with no platform picked, and drops a platform no longer offered', () => {
    expect(versionsBody([], ['linkedin'], true, 'under')).toBeNull()
    expect(versionsBody(['blog'], ['linkedin'], false, 'under')).toBeNull()
  })
})

describe('versionNote (spec §3.3)', () => {
  it('says this version is being adapted, the others are, or it kept the original text and why', () => {
    expect(versionNote(null, { id: 5, platform: 'instagram' })).toBeNull()
    expect(versionNote(group(), { id: 5, platform: 'instagram' })).toBeNull()
    expect(versionNote(group({ adapting: [6] }), { id: 6, platform: 'linkedin' })).toEqual({ kind: 'adapting', platform: 'linkedin' })
    expect(versionNote(group({ adapting: [6] }), { id: 5, platform: 'instagram' })).toEqual({ kind: 'adapting_others' })
    expect(versionNote(group({ kept_original: [6], kept_reason: 'budget' }), { id: 6, platform: 'linkedin' })).toEqual({ kind: 'kept', reason: 'budget' })
    expect(versionNote(group({ kept_original: [6], kept_reason: 'ai_failed' }), { id: 6, platform: 'linkedin' })).toEqual({ kind: 'kept', reason: 'ai_failed' })
  })
})
```

Write `frontend/src/content/panel/versionsSection.test.tsx` with the Write tool:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

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
import type { BudgetStatus, Bootstrap, Platform, PostDetail, PostGroup } from '../lib/types'
import { PanelProvider } from './PanelProvider'
import { VersionsForm, VersionsSection } from './VersionsSection'

const post = { id: 5, platform: 'instagram', status: 'draft', scheduled_date: '2026-10-07' } as unknown as PostDetail
const group = (more: Partial<PostGroup> = {}): PostGroup => ({
  id: 5,
  posts: [
    { id: 5, platform: 'instagram', status: 'draft', scheduled_date: '2026-10-07', scheduled_time: null },
    { id: 6, platform: 'linkedin', status: 'ready_to_publish', scheduled_date: null, scheduled_time: null },
  ],
  adapting: [], kept_original: [], kept_reason: null, ...more,
})
function render(element: ReactElement, platforms: Platform[] = ['instagram', 'linkedin', 'x'], budget: BudgetStatus = 'under') {
  const boot = { ...bootFor(false), platforms, ai: { status: budget, percent: 10 } } as unknown as Bootstrap
  return renderToStaticMarkup(
    <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <PanelProvider>{element}</PanelProvider>
    </ContentContext.Provider>,
  )
}
const section = (g: PostGroup | null, dirty = false) => <VersionsSection post={post} group={g} dirty={dirty} onPost={() => {}} />

describe('the Versions section (spec 2026-10-19 §3)', () => {
  it('offers Make versions on a post in no group, and says what versions are', () => {
    const html = render(section(null))
    expect(html).toContain('Versions')
    expect(html).toContain('Make versions…')
    expect(html).toContain('The same post for other platforms. Each version is a post of its own.')
    expect(html).not.toContain('Unlink this post')
    expect(html).not.toContain('data-versions=""')
  })

  it('lists the group’s posts with platform, status and day, marks this one, and offers Unlink', () => {
    const html = render(section(group()))
    // (This test's t gives the fallback: the platform's code, the status's code.)
    expect(html).toContain('data-versions=""')
    expect(html).toMatch(/aria-current="true"[^>]*>instagram · draft · 7 Oct/)
    expect(html).toContain('linkedin · ready_to_publish · No day')
    expect(html).toContain('(This post)')
    expect(html).toContain('Unlink this post')
  })

  // Review Focus 1: a version copies the post as saved.
  it('waits while the panel holds unsaved edits', () => {
    const html = render(section(group(), true))
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Make versions…/)
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Unlink this post/)
    expect(html).toContain('Save your changes first.')
  })

  it('says when the AI adapts this version or the others, and when it kept the original text, and why', () => {
    expect(render(section(group({ adapting: [5] })))).toContain('Adapting for instagram…')
    expect(render(section(group({ adapting: [6] })))).toContain('The AI is adapting the versions…')
    expect(render(section(group({ kept_original: [5], kept_reason: 'budget' })))).toContain('The AI budget ran out; this version keeps the original text.')
    expect(render(section(group({ kept_original: [5], kept_reason: 'ai_failed' })))).toContain('The AI could not adapt this version; it keeps the original text.')
  })

  // Review Focus 3
  it('says when every platform has a version, and offers none', () => {
    const html = render(section(group()), ['instagram', 'linkedin'])
    expect(html).toContain('This post has a version for every platform.')
    expect(html).not.toContain('Make versions…')
  })
})

describe('the Make versions form (spec §3.1)', () => {
  const form = (budget: BudgetStatus) => render(<VersionsForm choices={['linkedin', 'x']} budget={budget} busy={false} onSubmit={() => {}} onCancel={() => {}} />)

  it('lists the platforms to pick and the two ways, Adapt with AI first; nothing to send before a platform is picked', () => {
    const html = form('under')
    expect(html).toContain('For which platforms')
    expect(html).toMatch(/type="checkbox"[^>]*\/?>(?:<!-- -->)?linkedin<\/label>/)
    expect(html).toMatch(/type="checkbox"[^>]*\/?>(?:<!-- -->)?x<\/label>/)
    expect(html).toMatch(/type="radio"[^>]*checked=""[^>]*\/?>(?:<!-- -->)?Adapt with AI/)
    expect(html).toContain('Copy as is')
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Make versions</)
  })

  // Review Focus 2
  it('at the budget cap the AI cannot be chosen and the form says the text is copied as it is', () => {
    const html = form('over')
    expect(html).toMatch(/type="radio"[^>]*disabled=""[^>]*\/?>(?:<!-- -->)?Adapt with AI/)
    expect(html).toMatch(/type="radio"[^>]*checked=""[^>]*\/?>(?:<!-- -->)?Copy as is/)
    expect(html).toContain('This month’s AI budget is used up: the versions copy the text as it is.')
  })
})
```

Append to `frontend/src/content/panel/repeatMath.test.ts` (extract to `$R5C/append.txt`, then `cat "$R5C/append.txt" >> frontend/src/content/panel/repeatMath.test.ts`):

```ts

describe('pollsWhileRewording and versions (spec 2026-10-19 §3.3)', () => {
  it('reads the post again while the AI adapts any version of its group, and not once it is done', () => {
    const group = { id: 5, posts: [], adapting: [6], kept_original: [], kept_reason: null }
    expect(pollsWhileRewording({ group } as unknown as PostDetail)).toBe(true)
    expect(pollsWhileRewording({ group: { ...group, adapting: [] } } as unknown as PostDetail)).toBe(false)
    expect(pollsWhileRewording({ group: null } as unknown as PostDetail)).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; "$R5C/vt.sh" src/content/panel/versionsMath.test.ts src/content/panel/versionsSection.test.tsx src/content/panel/repeatMath.test.ts
```

Expected: FAIL — `versionsMath` and `VersionsSection` cannot be resolved; `pollsWhileRewording` ignores `group`.

- [ ] **Step 3: The helpers and the section**

Write `frontend/src/content/panel/versionsMath.ts` with the Write tool:

```ts
import type { BudgetStatus, Platform, PostDetail, PostGroup } from '../lib/types'

/** The platforms a new version can be for (spec 2026-10-19 §3.1): the brand's, minus those already in the group — the post's own included. */
export function versionChoices(platforms: readonly Platform[], post: Pick<PostDetail, 'platform'>, group: PostGroup | null): Platform[] {
  const taken = new Set<Platform>([post.platform, ...(group?.posts ?? []).map(p => p.platform)])
  return platforms.filter(p => !taken.has(p))
}

/** "Adapt with AI" is the default while the month's AI budget is not used up, and unavailable when it is (§3.1). */
export const aiAllowed = (budget: BudgetStatus): boolean => budget !== 'over'

/** What the panel says of the AI's work on this post's group (§3.3). */
export type VersionNote =
  | { kind: 'adapting'; platform: Platform }
  | { kind: 'adapting_others' }
  | { kind: 'kept'; reason: 'budget' | 'ai_failed' }
  | null

/** This version being adapted, the other versions being adapted, or this one kept as written (and why). */
export function versionNote(group: PostGroup | null, post: Pick<PostDetail, 'id' | 'platform'>): VersionNote {
  if (!group) return null
  if (group.adapting.includes(post.id)) return { kind: 'adapting', platform: post.platform }
  if (group.kept_original.includes(post.id)) return { kind: 'kept', reason: group.kept_reason === 'ai_failed' ? 'ai_failed' : 'budget' }
  return group.adapting.length > 0 ? { kind: 'adapting_others' } : null
}

/** The request: the platforms picked, in the brand's order, the AI only where allowed; null with none picked (the portal's own `invalid`). */
export function versionsBody(picked: readonly Platform[], choices: readonly Platform[], ai: boolean, budget: BudgetStatus): { platforms: Platform[]; ai: boolean } | null {
  const platforms = choices.filter(p => picked.includes(p))
  return platforms.length === 0 ? null : { platforms, ai: ai && aiAllowed(budget) }
}
```

Write `frontend/src/content/panel/VersionsSection.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { BudgetStatus, Platform, PostDetail, PostGroup } from '../lib/types'
import { usePanel } from './PanelProvider'
import { aiAllowed, versionChoices, versionNote, versionsBody } from './versionsMath'

const CHIP = 'rounded-full border px-2.5 py-1 text-xs font-medium'

/**
 * Versions per platform (spec 2026-10-19 §3): the post's group as chips (platform, status, day; this post marked; a
 * chip opens that version), Make versions… for the platforms not yet in it — adapted by the AI in the background or
 * copied as they are — and Unlink. While the AI works the panel says so; a version it did not adapt says why.
 * Everything waits while the post has unsaved edits: a version copies the post as saved.
 */
export function VersionsSection({ post, group, dirty, onPost }: {
  post: PostDetail
  /** The group as last read (the panel reads it again while the AI adapts); null when the post is in no group. */
  group: PostGroup | null
  dirty: boolean
  /** The post as the server answered (in its group, or out of it). */
  onPost: (post: PostDetail) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const panel = usePanel()
  const [making, setMaking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<number | null>(null)
  const choices = versionChoices(boot.platforms, post, group)
  const note = versionNote(group, post)
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.versions.${key}`, english, vars)
  const platformName = (p: Platform) => t(`content.platform.${p}`, p)

  const run = async (call: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await call()
    } catch (e) {
      const [key, text] = errorKey('version', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }
  const make = (platforms: Platform[], ai: boolean) => run(async () => {
    const answer = await api.makeVersions(post.id, platforms, ai)
    setMaking(false)
    setMade(answer.versions.length)
    onPost(answer.post)
  })
  const unlink = () => run(async () => {
    setMade(null)
    onPost((await api.unlinkGroup(post.id)).post)
  })

  return (
    <section aria-labelledby="content-versions-title" className="space-y-3">
      <h3 id="content-versions-title" className="flex items-center gap-2 font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">
        <Layers size={14} aria-hidden />{w('title', 'Versions')}
      </h3>
      {group ? (
        <ul data-versions="" className="flex flex-wrap gap-1.5">
          {group.posts.map(p => {
            const current = p.id === post.id
            const day = p.scheduled_date ? formatDate(p.scheduled_date, locale, { day: 'numeric', month: 'short' }) : w('no_day', 'No day')
            const line = [platformName(p.platform), t(`content.status.${p.status}`, p.status), day].join(' · ')
            return (
              <li key={p.id}>
                <button type="button" aria-current={current ? 'true' : undefined} disabled={current} onClick={() => { panel.open(p.id) }}
                  className={`${CHIP} ${current ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                  {line}{current && <span className="sr-only">{` (${w('this_one', 'This post')})`}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-a-text-2">{w('intro', 'The same post for other platforms. Each version is a post of its own.')}</p>
      )}
      {note?.kind === 'adapting' && <p role="status" className="text-xs text-a-text-2">{w('adapting', 'Adapting for {{platform}}…', { platform: platformName(note.platform) })}</p>}
      {note?.kind === 'adapting_others' && <p role="status" className="text-xs text-a-text-2">{w('adapting_others', 'The AI is adapting the versions…')}</p>}
      {note?.kind === 'kept' && (
        <Notice tone="warning">
          {note.reason === 'budget'
            ? w('kept_budget', 'The AI budget ran out; this version keeps the original text.')
            : w('kept_failed', 'The AI could not adapt this version; it keeps the original text.')}
        </Notice>
      )}
      {made !== null && <p role="status" className="text-xs text-a-text-2">{w('made', 'Versions made: {{count}}', { count: made })}</p>}
      {dirty && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      <div className="flex flex-wrap gap-2">
        {choices.length > 0 && (
          <Button size="sm" variant="secondary" disabled={dirty || busy} aria-expanded={making} onClick={() => setMaking(m => !m)}>
            <Layers size={14} aria-hidden />{w('make', 'Make versions…')}
          </Button>
        )}
        {group && (
          <Button size="sm" variant="ghost" disabled={dirty || busy} onClick={() => { void unlink() }}>{w('unlink', 'Unlink this post')}</Button>
        )}
      </div>
      {choices.length === 0 && <p className="text-xs text-a-text-2">{w('none_left', 'This post has a version for every platform.')}</p>}
      {making && choices.length > 0 && (
        <VersionsForm choices={choices} budget={boot.ai.status} busy={busy} onSubmit={(platforms, ai) => { void make(platforms, ai) }} onCancel={() => setMaking(false)} />
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}

/** The Make versions form (its own component, so a static render can draw it): the platforms, then the AI or a plain copy. */
export function VersionsForm({ choices, budget, busy, onSubmit, onCancel }: {
  choices: Platform[]
  budget: BudgetStatus
  busy: boolean
  onSubmit: (platforms: Platform[], ai: boolean) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const w = (key: string, english: string) => t(`content.versions.${key}`, english)
  const allowed = aiAllowed(budget)
  const [picked, setPicked] = useState<Platform[]>([])
  const [ai, setAi] = useState(allowed)
  const body = versionsBody(picked, choices, ai, budget)
  const withAi = ai && allowed

  return (
    <div data-versions-form="" className="space-y-3 rounded-lg border border-a-border bg-a-surface-2 p-3">
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-a-text-2">{w('platforms', 'For which platforms')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {choices.map(p => (
            <label key={p} className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={picked.includes(p)} onChange={(e) => setPicked(list => (e.target.checked ? [...list, p] : list.filter(x => x !== p)))} />
              {t(`content.platform.${p}`, p)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">{w('how', 'How')}</legend>
        <label className="flex items-center gap-2 text-sm text-a-text">
          <input type="radio" name="content-versions-how" checked={withAi} disabled={!allowed} onChange={() => setAi(true)} />
          {w('ai', 'Adapt with AI')}
        </label>
        <label className="flex items-center gap-2 text-sm text-a-text">
          <input type="radio" name="content-versions-how" checked={!withAi} onChange={() => setAi(false)} />
          {w('copy', 'Copy as is')}
        </label>
      </fieldset>
      {!allowed && <p className="text-xs text-a-text-2">{w('ai_paused', 'This month’s AI budget is used up: the versions copy the text as it is.')}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={body === null} loading={busy} onClick={() => { if (body) onSubmit(body.platforms, body.ai) }}>{w('submit', 'Make versions')}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>{t('content.common.cancel', 'Cancel')}</Button>
      </div>
    </div>
  )
}
```

In `frontend/src/content/panel/repeatMath.ts`, replace:

```ts
export const pollsWhileRewording = (post: PostDetail | undefined): boolean => post?.series?.rewriting === true
```

with:

```ts
export const pollsWhileRewording = (post: PostDetail | undefined): boolean =>
  // …and while the AI adapts a version of its group (spec 2026-10-19 §3.3).
  post?.series?.rewriting === true || (post?.group?.adapting.length ?? 0) > 0
```

In `frontend/src/content/panel/PostPanel.tsx`, replace:

```ts
import { RepeatSection } from './RepeatSection'
```

with:

```ts
import { RepeatSection } from './RepeatSection'
import { VersionsSection } from './VersionsSection'
```

and replace:

```tsx
            {/* The series as last read: its rewording ends without the post itself changing, so the panel's copy would keep "rewording". */}
```

with:

```tsx
            {/* The group as last read: the AI's adapting ends without this post changing (spec 2026-10-19 §3.3). */}
            <VersionsSection post={post} dirty={dirty} onPost={adopt}
              group={(detail.data && detail.data.id === post.id ? detail.data.group : post.group) ?? null} />
            {/* The series as last read: its rewording ends without the post itself changing, so the panel's copy would keep "rewording". */}
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
    const COUNTED = ['plan.goals.at_risk', 'plan.goals.streak', 'panel.repeat.copies', 'panel.repeat.stop_confirm', 'brand.channels.per_week', 'ideas.see_all', 'panel.blanks', 'flags.comments', 'bell.label_count']
```

with:

```ts
    const COUNTED = ['plan.goals.at_risk', 'plan.goals.streak', 'panel.repeat.copies', 'panel.repeat.stop_confirm', 'brand.channels.per_week', 'ideas.see_all', 'panel.blanks', 'flags.comments', 'bell.label_count', 'versions.made']
```

Write `$R5C/t2-words.json` with the Write tool:

```json
{
  "versions.title": { "en": "Versions", "ru": "Версии", "de": "Versionen", "fr": "Versions", "es": "Versiones" },
  "versions.intro": { "en": "The same post for other platforms. Each version is a post of its own.", "ru": "Тот же пост для других платформ. Каждая версия — отдельный пост.", "de": "Derselbe Beitrag für andere Plattformen. Jede Version ist ein eigener Beitrag.", "fr": "La même publication pour d’autres plateformes. Chaque version est une publication à part entière.", "es": "La misma publicación para otras plataformas. Cada versión es una publicación propia." },
  "versions.make": { "en": "Make versions…", "ru": "Создать версии…", "de": "Versionen erstellen…", "fr": "Créer des versions…", "es": "Crear versiones…" },
  "versions.platforms": { "en": "For which platforms", "ru": "Для каких платформ", "de": "Für welche Plattformen", "fr": "Pour quelles plateformes", "es": "Para qué plataformas" },
  "versions.how": { "en": "How", "ru": "Как", "de": "Wie", "fr": "Comment", "es": "Cómo" },
  "versions.ai": { "en": "Adapt with AI", "ru": "Адаптировать с ИИ", "de": "Mit KI anpassen", "fr": "Adapter avec l’IA", "es": "Adaptar con IA" },
  "versions.copy": { "en": "Copy as is", "ru": "Скопировать как есть", "de": "Unverändert kopieren", "fr": "Copier tel quel", "es": "Copiar tal cual" },
  "versions.ai_paused": { "en": "This month’s AI budget is used up: the versions copy the text as it is.", "ru": "Месячный бюджет на ИИ исчерпан: версии копируют текст как есть.", "de": "Das KI-Budget dieses Monats ist aufgebraucht: Die Versionen übernehmen den Text unverändert.", "fr": "Le budget IA du mois est épuisé : les versions reprennent le texte tel quel.", "es": "El presupuesto de IA de este mes se ha agotado: las versiones copian el texto tal cual." },
  "versions.submit": { "en": "Make versions", "ru": "Создать версии", "de": "Versionen erstellen", "fr": "Créer les versions", "es": "Crear versiones" },
  "versions.none_left": { "en": "This post has a version for every platform.", "ru": "У этого поста есть версия для каждой платформы.", "de": "Dieser Beitrag hat für jede Plattform eine Version.", "fr": "Cette publication a une version pour chaque plateforme.", "es": "Esta publicación tiene una versión para cada plataforma." },
  "versions.this_one": { "en": "This post", "ru": "Этот пост", "de": "Dieser Beitrag", "fr": "Cette publication", "es": "Esta publicación" },
  "versions.no_day": { "en": "No day", "ru": "Без дня", "de": "Ohne Tag", "fr": "Sans jour", "es": "Sin día" },
  "versions.unlink": { "en": "Unlink this post", "ru": "Отвязать этот пост", "de": "Diesen Beitrag lösen", "fr": "Détacher cette publication", "es": "Desvincular esta publicación" },
  "versions.adapting": { "en": "Adapting for {{platform}}…", "ru": "Адаптация для {{platform}}…", "de": "Wird für {{platform}} angepasst…", "fr": "Adaptation pour {{platform}}…", "es": "Adaptando para {{platform}}…" },
  "versions.adapting_others": { "en": "The AI is adapting the versions…", "ru": "ИИ адаптирует версии…", "de": "Die KI passt die Versionen an…", "fr": "L’IA adapte les versions…", "es": "La IA está adaptando las versiones…" },
  "versions.kept_budget": { "en": "The AI budget ran out; this version keeps the original text.", "ru": "Бюджет на ИИ закончился: в этой версии остался исходный текст.", "de": "Das KI-Budget ist aufgebraucht; diese Version behält den ursprünglichen Text.", "fr": "Le budget IA est épuisé ; cette version garde le texte d’origine.", "es": "Se agotó el presupuesto de IA; esta versión conserva el texto original." },
  "versions.kept_failed": { "en": "The AI could not adapt this version; it keeps the original text.", "ru": "ИИ не смог адаптировать эту версию: в ней остался исходный текст.", "de": "Die KI konnte diese Version nicht anpassen; sie behält den ursprünglichen Text.", "fr": "L’IA n’a pas pu adapter cette version ; elle garde le texte d’origine.", "es": "La IA no pudo adaptar esta versión; conserva el texto original." },
  "versions.made": { "en": "Versions made: {{count}}", "ru": "Создано версий: {{count}}", "de": "Erstellte Versionen: {{count}}", "fr": "Versions créées : {{count}}", "es": "Versiones creadas: {{count}}" }
}
```

Then insert the words:

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R5C/words.mjs" "$R5C/t2-words.json"
```

- [ ] **Step 4: Run the tests, the types, the lint**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R5C/vt.sh" src/content src/i18n; npx eslint src/content 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; all passed (`versionsMath.test.ts` 5, `versionsSection.test.tsx` 7, the repeatMath case, the bundle tests); eslint on `src/content` prints no problem (its 17 baseline errors are outside `src/content`).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/panel/versionsMath.ts frontend/src/content/panel/VersionsSection.tsx frontend/src/content/panel/repeatMath.ts frontend/src/content/panel/PostPanel.tsx frontend/src/content/panel/versionsMath.test.ts frontend/src/content/panel/versionsSection.test.tsx frontend/src/content/panel/repeatMath.test.ts frontend/src/content/i18n/contentLocales.test.ts frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json && git commit -q -m "Content portal: the panel's Versions section — chips, Make versions with AI or as a copy, Unlink, adapting and kept notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: "Who posts it" — the panel's field and Ideas → Schedule (spec §4.1)

**Files:**
- Create: `frontend/src/content/ui/PosterSelect.tsx`
- Modify: `frontend/src/content/panel/panelState.ts`, `frontend/src/content/panel/PostFormFields.tsx`, `frontend/src/content/panel/PostPanel.tsx`, `frontend/src/content/ideas/ideasMath.ts`, `frontend/src/content/ideas/ScheduleDialog.tsx`
- Test: modify `frontend/src/content/panel/panelState.test.ts`; create `frontend/src/content/panel/postFormFields.test.tsx`, `frontend/src/content/ideas/scheduleMath.test.ts`, `frontend/src/content/ideas/scheduleDialog.test.tsx`
- Words: `$R5C/t3-words.json`

**Interfaces:**
- Consumes: `TeamMember`, `Person`, `PostDetail.poster`, `PostCard.poster_id`, `api.team()`, `movePost(…, {poster_id})`, `errorKey('move','invalid')` (Task 1).
- Produces: `PostForm.poster_id: string` (`''` = nobody); `formOf` reads `post.poster` (the effective poster); `changes`/`createBody` send `poster_id` as a number or null; `invalidFields` knows `poster_id`; `posterChoices(team: TeamMember[], poster: Person | null | undefined): Person[]`; component `PosterSelect({value, onChange, choices, className, invalid?})`; `PostFormFields` takes `team?: Person[]`; `initialPoster(post: {poster_id?}, team: TeamMember[]): string`; `scheduleBody(post: {updated_at}, form: {date, time}, poster: string, initial: string)`; the team query key `['content', brand, 'team']` (5 minutes fresh).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/content/panel/panelState.test.ts`, replace:

```ts
import { BRIEF_TEXT, REWRITE_TEXT, changes, createBody, formOf, invalidFields, isDirty, newForm, newer, rebase, withChannels } from './panelState'
```

with:

```ts
import { BRIEF_TEXT, REWRITE_TEXT, changes, createBody, formOf, invalidFields, isDirty, newForm, newer, posterChoices, rebase, withChannels } from './panelState'
```

and replace:

```ts
      language: 'en', topic: 'Autumn', hook: 'Three colours', main_copy: 'Warm tones.\nBook now.', cta: '', hashtags: '#autumn hair',
    })
```

with:

```ts
      language: 'en', topic: 'Autumn', hook: 'Three colours', main_copy: 'Warm tones.\nBook now.', cta: '', hashtags: '#autumn hair', poster_id: '',
    })
```

Then append to `frontend/src/content/panel/panelState.test.ts` (extract to `$R5C/append.txt`, then `cat "$R5C/append.txt" >> frontend/src/content/panel/panelState.test.ts`):

```ts

describe('who posts it (spec 2026-10-19 §4.1)', () => {
  it('reads the poster who is still on the team, and sends a change as an id or null', () => {
    const withPoster = { ...detail, poster_id: 7, poster: { id: 7, name: 'Sam' } } as PostDetail
    expect(formOf(withPoster).poster_id).toBe('7')
    const base = formOf(withPoster)
    expect(changes(base, { ...base, poster_id: '' })).toEqual({ poster_id: null })
    expect(changes(base, { ...base, poster_id: '8' })).toEqual({ poster_id: 8 })
    expect(changes(base, base)).toEqual({})
    expect(createBody({ ...newForm({ date: null, platform: 'instagram' }, ['instagram']), poster_id: '8' })).toMatchObject({ poster_id: 8 })
    expect(createBody(newForm({ date: null, platform: 'instagram' }, ['instagram']))).not.toHaveProperty('poster_id')
    expect(invalidFields({ poster_id: ['Choose someone on this brand’s team.'] })).toEqual(['poster_id'])
  })

  // Review Focus 5: someone who left shows as nobody; nothing is sent unless the person picks someone.
  it('shows someone who left as nobody, and sends nothing for them', () => {
    const left = formOf({ ...detail, poster_id: 9, poster: null } as PostDetail)
    expect(left.poster_id).toBe('')
    expect(changes(left, left)).toEqual({})
  })

  it('keeps the poster among the choices while the team list loads', () => {
    expect(posterChoices([], { id: 7, name: 'Sam' })).toEqual([{ id: 7, name: 'Sam' }])
    expect(posterChoices([{ id: 7, name: 'Sam', role: 'staff' }], { id: 7, name: 'Sam' })).toEqual([{ id: 7, name: 'Sam' }])
    expect(posterChoices([{ id: 3, name: 'Mia', role: 'manager' }], null)).toEqual([{ id: 3, name: 'Mia' }])
  })
})
```

Write `frontend/src/content/panel/postFormFields.test.tsx` with the Write tool:

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

import { newForm } from './panelState'
import { PostFormFields } from './PostFormFields'

const render = (posterId: string, team = [{ id: 3, name: 'Mia' }, { id: 7, name: 'Sam' }]) => renderToStaticMarkup(
  <PostFormFields form={{ ...newForm({ date: '2026-10-07', platform: 'instagram' }, ['instagram']), poster_id: posterId }} onChange={() => {}}
    platforms={['instagram']} statuses={['draft']} pillars={[]} audiences={[]} published={false} invalid={[]} locale="en" industry={null}
    snippets={[]} team={team} />,
)

describe('"Who posts it" in the panel (spec 2026-10-19 §4.1)', () => {
  it('offers Not set and the brand’s team, with the poster chosen', () => {
    const html = render('7')
    expect(html).toContain('Who posts it')
    expect(html).toMatch(/<option value="">Not set<\/option>/)
    expect(html).toMatch(/<option value="3">Mia<\/option>/)
    expect(html).toMatch(/<option value="7" selected="">Sam<\/option>/)
  })

  it('chooses Not set for nobody', () => {
    expect(render('')).toMatch(/<option value="" selected="">Not set<\/option>/)
  })
})
```

Write `frontend/src/content/ideas/scheduleMath.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import { initialPoster, scheduleBody } from './ideasMath'

const team = [{ id: 3, name: 'Mia', role: 'manager' as const }, { id: 7, name: 'Sam', role: 'staff' as const }]

describe('Schedule and who posts it (spec 2026-10-19 §4.1)', () => {
  it('starts on the post’s own poster when they are on the team, else on nobody', () => {
    expect(initialPoster({ poster_id: 7 }, team)).toBe('7')
    expect(initialPoster({ poster_id: 9 }, team)).toBe('')
    expect(initialPoster({ poster_id: null }, team)).toBe('')
    expect(initialPoster({}, team)).toBe('')
  })

  it('sends the day and the time, and who posts it only when the person changed it', () => {
    const post = { updated_at: '2026-10-05T06:00:00.000000Z' }
    expect(scheduleBody(post, { date: '2026-10-09', time: '18:00' }, '7', '7')).toEqual({ updated_at: post.updated_at, scheduled_date: '2026-10-09', scheduled_time: '18:00' })
    expect(scheduleBody(post, { date: '2026-10-09', time: '' }, '3', '7')).toEqual({ updated_at: post.updated_at, scheduled_date: '2026-10-09', scheduled_time: null, poster_id: 3 })
    expect(scheduleBody(post, { date: '2026-10-09', time: '' }, '', '7')).toEqual({ updated_at: post.updated_at, scheduled_date: '2026-10-09', scheduled_time: null, poster_id: null })
  })
})
```

Write `frontend/src/content/ideas/scheduleDialog.test.tsx` with the Write tool:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
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
import type { PostCard } from '../lib/types'
import { ScheduleDialog } from './ScheduleDialog'

const idea = { id: 9, platform: 'instagram', scheduled_date: null, scheduled_time: null, status: 'idea', title: null, hook: 'An idea', topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', poster_id: 7 } as PostCard

describe('Ideas → Schedule (spec 2026-10-19 §4.1)', () => {
  it('asks who posts it, starting on the post’s own poster', () => {
    const client = new QueryClient()
    client.setQueryData(['content', 3, 'team'], { team: [{ id: 3, name: 'Mia', role: 'manager' }, { id: 7, name: 'Sam', role: 'staff' }] })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ContentContext.Provider value={{ data: bootFor(false), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <ScheduleDialog post={idea} today="2026-10-07" channels={[]} industry={null} onClose={() => {}} onScheduled={() => {}} />
        </ContentContext.Provider>
      </QueryClientProvider>,
    )
    expect(html).toContain('Who posts it')
    expect(html).toMatch(/<option value="7" selected="">Sam<\/option>/)
    expect(html).toMatch(/<option value="3">Mia<\/option>/)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; "$R5C/vt.sh" src/content/panel/panelState.test.ts src/content/panel/postFormFields.test.tsx src/content/ideas/scheduleMath.test.ts src/content/ideas/scheduleDialog.test.tsx
```

Expected: FAIL — `posterChoices`, `initialPoster`, `scheduleBody` are not exported; the form has no "Who posts it"; `formOf` has no `poster_id`.

- [ ] **Step 3: The form field, the select, the schedule**

Write `frontend/src/content/ui/PosterSelect.tsx` with the Write tool:

```tsx
import { useTranslation } from 'react-i18next'
import type { Person } from '../lib/types'

/** "Who posts it" (spec 2026-10-19 §4.1): Not set, then the people to choose from; the value is an id as text, '' for nobody. */
export function PosterSelect({ value, onChange, choices, className, invalid }: {
  value: string
  onChange: (value: string) => void
  choices: Person[]
  className: string
  invalid?: boolean
}) {
  const { t } = useTranslation()
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className={className}>
      <option value="">{t('content.panel.fields.not_set', 'Not set')}</option>
      {choices.map(person => <option key={person.id} value={String(person.id)}>{person.name}</option>)}
    </select>
  )
}
```

In `frontend/src/content/panel/panelState.ts`, replace:

```ts
import type { DateKey, Platform, PostDetail, PostFields, PostStatus, Rewrite, VisualBrief } from '../lib/types'
```

with:

```ts
import type { DateKey, Person, Platform, PostDetail, PostFields, PostStatus, Rewrite, TeamMember, VisualBrief } from '../lib/types'
```

replace:

```ts
  cta: string
  hashtags: string
}

const text = (value: string | null | undefined): string => value ?? ''
```

with:

```ts
  cta: string
  hashtags: string
  /** Who posts it (spec 2026-10-19 §4.1): a team member's id, '' for nobody. */
  poster_id: string
}

const text = (value: string | null | undefined): string => value ?? ''
```

replace:

```ts
    cta: text(post.cta),
    hashtags: post.hashtags.join(' '),
  }
}
```

with:

```ts
    cta: text(post.cta),
    hashtags: post.hashtags.join(' '),
    // The effective poster: someone who left reads as nobody, and nothing is sent for them unless changed.
    poster_id: post.poster ? String(post.poster.id) : '',
  }
}
```

replace:

```ts
    cta: '',
    hashtags: '',
    // The words it starts with (a key date's name, a template's fields) over the empty ones.
```

with:

```ts
    cta: '',
    hashtags: '',
    poster_id: '',
    // The words it starts with (a key date's name, a template's fields) over the empty ones.
```

replace:

```ts
    cta: orNull(form.cta),
    hashtags: parseHashtags(form.hashtags),
  }
}
```

with:

```ts
    cta: orNull(form.cta),
    hashtags: parseHashtags(form.hashtags),
    poster_id: id(form.poster_id),
  }
}
```

replace:

```ts
const FIELDS: readonly (keyof PostForm)[] = ['platform', 'scheduled_date', 'scheduled_time', 'status', 'pillar_id', 'audience_id', 'language', 'topic', 'hook', 'main_copy', 'cta', 'hashtags']
```

with:

```ts
const FIELDS: readonly (keyof PostForm)[] = ['platform', 'scheduled_date', 'scheduled_time', 'status', 'pillar_id', 'audience_id', 'language', 'topic', 'hook', 'main_copy', 'cta', 'hashtags', 'poster_id']

/** "Who posts it"'s choices: the team, with the post's own poster kept while the team list loads (spec 2026-10-19 §4.1). */
export function posterChoices(team: readonly TeamMember[], poster: Person | null | undefined): Person[] {
  const people = team.map(m => ({ id: m.id, name: m.name }))
  return poster && !people.some(p => p.id === poster.id) ? [...people, { id: poster.id, name: poster.name }] : people
}
```

In `frontend/src/content/panel/PostFormFields.tsx`, replace:

```ts
import type { AudienceRef, PillarRef, Platform, PostStatus, Snippet, Template } from '../lib/types'
import { PopMenu } from '../ui/PopMenu'
```

with:

```ts
import type { AudienceRef, Person, PillarRef, Platform, PostStatus, Snippet, Template } from '../lib/types'
import { PopMenu } from '../ui/PopMenu'
import { PosterSelect } from '../ui/PosterSelect'
```

replace:

```ts
export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale, industry, snippets, templates = [] }: {
```

with:

```ts
export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale, industry, snippets, templates = [], team = [] }: {
```

replace:

```ts
  /** The brand's templates: the Template menu beside Topic (spec 2026-10-16 §5.3). */
  templates?: Template[]
}) {
```

with:

```ts
  /** The brand's templates: the Template menu beside Topic (spec 2026-10-16 §5.3). */
  templates?: Template[]
  /** Who can post it (spec 2026-10-19 §4.1): the brand's team, the post's own poster kept (posterChoices). */
  team?: Person[]
}) {
```

and replace:

```tsx
            {statuses.map(s => <option key={s} value={s}>{t(`content.status.${s}`, s)}</option>)}
          </select>
        </FieldBox>
```

with:

```tsx
            {statuses.map(s => <option key={s} value={s}>{t(`content.status.${s}`, s)}</option>)}
          </select>
        </FieldBox>
        <FieldBox label={t('content.panel.fields.poster', 'Who posts it')} invalid={invalid.includes('poster_id')}>
          <PosterSelect value={form.poster_id} onChange={(value) => set('poster_id', value)} choices={team} invalid={bad('poster_id')} className={box('poster_id')} />
        </FieldBox>
```

In `frontend/src/content/panel/PostPanel.tsx`, replace:

```ts
import { changes, createBody, formOf, invalidFields, isDirty, newForm, newer, rebase, withChannels, type Editing, type PostForm } from './panelState'
```

with:

```ts
import { changes, createBody, formOf, invalidFields, isDirty, newForm, newer, posterChoices, rebase, withChannels, type Editing, type PostForm } from './panelState'
```

replace:

```ts
  const activeChannels = useMemo(() => (brandInfo.data?.channels ?? []).filter(c => c.active), [brandInfo.data])
```

with:

```ts
  const activeChannels = useMemo(() => (brandInfo.data?.channels ?? []).filter(c => c.active), [brandInfo.data])
  // "Who posts it" (spec 2026-10-19 §4.1): the brand's team, read once in a while.
  const team = useQuery({ queryKey: ['content', brand, 'team'], queryFn: api.team, staleTime: 300_000 })
```

and replace:

```tsx
            templates={brandInfo.data?.templates ?? []} />
```

with:

```tsx
            templates={brandInfo.data?.templates ?? []} team={posterChoices(team.data?.team ?? [], post?.poster)} />
```

In `frontend/src/content/ideas/ideasMath.ts`, append at the end of the file (extract to `$R5C/append.txt`, then `cat "$R5C/append.txt" >> frontend/src/content/ideas/ideasMath.ts`):

```ts

/** The poster Schedule starts on (spec 2026-10-19 §4.1): the post's own when they are on the team, else nobody. */
export function initialPoster(post: { poster_id?: number | null }, team: readonly { id: number }[]): string {
  const id = post.poster_id ?? null
  return id !== null && team.some(m => m.id === id) ? String(id) : ''
}

/** Schedule's request: the day, the time, and who posts it only when the person changed it. */
export function scheduleBody(post: { updated_at: string }, form: { date: string; time: string }, poster: string, initial: string): {
  updated_at: string
  scheduled_date: string
  scheduled_time: string | null
  poster_id?: number | null
} {
  const body = { updated_at: post.updated_at, scheduled_date: form.date, scheduled_time: form.time === '' ? null : form.time }
  return poster === initial ? body : { ...body, poster_id: poster === '' ? null : Number(poster) }
}
```

In `frontend/src/content/ideas/ScheduleDialog.tsx`, replace:

```ts
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
```

with:

```ts
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
```

replace:

```ts
import { useApi } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { Channel, DateKey, PostCard } from '../lib/types'
import { canAdd } from '../plan/addMath'
import { Dialog } from '../ui/Dialog'
import { scheduleDefaults } from './ideasMath'
```

with:

```ts
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { Channel, DateKey, PostCard } from '../lib/types'
import { canAdd } from '../plan/addMath'
import { Dialog } from '../ui/Dialog'
import { PosterSelect } from '../ui/PosterSelect'
import { initialPoster, scheduleBody, scheduleDefaults } from './ideasMath'
```

replace:

```ts
  const api = useApi()
  const [form, setForm] = useState(() => scheduleDefaults(post.platform, channels, industry, today))
```

with:

```ts
  const api = useApi()
  const brand = useBrandId()
  const [form, setForm] = useState(() => scheduleDefaults(post.platform, channels, industry, today))
  // Who posts it (spec 2026-10-19 §4.1): the team, the post's own poster to start; sent only when changed.
  const team = useQuery({ queryKey: ['content', brand, 'team'], queryFn: api.team, staleTime: 300_000 })
  const members = team.data?.team ?? []
  const initial = initialPoster(post, members)
  const [picked, setPicked] = useState<string | null>(null)
  const poster = picked ?? initial
```

replace:

```ts
      const { post: moved } = await api.movePost(post.id, { updated_at: post.updated_at, scheduled_date: form.date, scheduled_time: form.time === '' ? null : form.time })
```

with:

```ts
      const { post: moved } = await api.movePost(post.id, scheduleBody(post, form, poster, initial) as Parameters<typeof api.movePost>[1])
```

and replace:

```tsx
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`${INPUT} border-a-border`} />
          </label>
        </div>
```

with:

```tsx
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`${INPUT} border-a-border`} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.fields.poster', 'Who posts it')}</span>
          <PosterSelect value={poster} onChange={setPicked} choices={members.map(m => ({ id: m.id, name: m.name }))} className={`${INPUT} border-a-border`} />
        </label>
```

Write `$R5C/t3-words.json` with the Write tool:

```json
{
  "panel.fields.poster": { "en": "Who posts it", "ru": "Кто публикует", "de": "Wer veröffentlicht", "fr": "Qui la publie", "es": "Quién la publica" },
  "panel.fields.not_set": { "en": "Not set", "ru": "Не назначен", "de": "Nicht festgelegt", "fr": "Non défini", "es": "Sin asignar" }
}
```

Then insert the words:

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R5C/words.mjs" "$R5C/t3-words.json"
```

- [ ] **Step 4: Run the tests, the types, the lint**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R5C/vt.sh" src/content src/i18n; npx eslint src/content 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; all passed (the three new files, the updated `panelState.test.ts`); no lint problem in `src/content`.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/ui/PosterSelect.tsx frontend/src/content/panel/panelState.ts frontend/src/content/panel/PostFormFields.tsx frontend/src/content/panel/PostPanel.tsx frontend/src/content/ideas/ideasMath.ts frontend/src/content/ideas/ScheduleDialog.tsx frontend/src/content/panel/panelState.test.ts frontend/src/content/panel/postFormFields.test.tsx frontend/src/content/ideas/scheduleMath.test.ts frontend/src/content/ideas/scheduleDialog.test.tsx frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json && git commit -q -m "Content portal: who posts it — the panel's field beside Status and Ideas → Schedule" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: Mark published for the post's own poster (spec §4.4)

**Files:**
- Modify: `frontend/src/content/lib/approval.ts`, `frontend/src/content/panel/PostActions.tsx`
- Test: `frontend/src/content/lib/approval.test.ts`, `frontend/src/content/panel/postActions.test.tsx`
- Words: `$R5C/t4-words.json`

**Interfaces:**
- Consumes: `Bootstrap['staff'].id`, `PostCard.poster_id` (Task 1).
- Produces: `POSTER_PUBLISHES: readonly PostStatus[]` (`approved`, `ready_to_publish`); `canMarkPublished(post: {status, poster_id?}, locked: boolean, me: number | null): boolean`.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/content/lib/approval.test.ts`, replace:

```ts
import { approvalsOn, cardFlags, flagWords, staffLocked, statusChoices } from './approval'
```

with:

```ts
import { approvalsOn, canMarkPublished, cardFlags, flagWords, staffLocked, statusChoices } from './approval'
```

Then append to `frontend/src/content/lib/approval.test.ts` (extract to `$R5C/append.txt`, then `cat "$R5C/append.txt" >> frontend/src/content/lib/approval.test.ts`):

```ts

describe('Mark published for the poster (spec 2026-10-19 §4.4)', () => {
  it('is offered on any post not yet published when approvals do not lock the person', () => {
    expect(canMarkPublished({ status: 'draft' }, false, 7)).toBe(true)
    expect(canMarkPublished({ status: 'published' }, false, 7)).toBe(false)
  })

  it('while locked, only to the post’s own poster on an approved or ready post', () => {
    expect(canMarkPublished({ status: 'approved', poster_id: 7 }, true, 7)).toBe(true)
    expect(canMarkPublished({ status: 'ready_to_publish', poster_id: 7 }, true, 7)).toBe(true)
    expect(canMarkPublished({ status: 'draft', poster_id: 7 }, true, 7)).toBe(false)
    expect(canMarkPublished({ status: 'needs_review', poster_id: 7 }, true, 7)).toBe(false)
    expect(canMarkPublished({ status: 'approved', poster_id: 8 }, true, 7)).toBe(false)
    expect(canMarkPublished({ status: 'approved', poster_id: null }, true, 7)).toBe(false)
    expect(canMarkPublished({ status: 'approved', poster_id: 7 }, true, null)).toBe(false)
  })
})
```

Append to `frontend/src/content/panel/postActions.test.tsx` (the same way):

```tsx

describe('PostActions: the poster under approvals (spec 2026-10-19 §4.4)', () => {
  const locked = { brand: { id: 3, name: 'Lumière Salon' }, venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
    staff: { can_manage: false, id: 7 }, profile: { id: 1, setup_completed: true, readiness: 60, requires_approval: true } } as unknown as Bootstrap
  const renderLocked = (p: PostDetail) => renderToStaticMarkup(
    <ContentContext.Provider value={{ data: locked, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <PostActions post={p} dirty={false} onPost={() => {}} onDuplicated={() => {}} onDeleted={() => {}} />
    </ContentContext.Provider>,
  )

  it('offers Mark published to the post’s own poster on an approved post, and says why', () => {
    const html = renderLocked({ ...post, status: 'approved', poster_id: 7 } as PostDetail)
    expect(html).toContain('Mark published')
    expect(html).toContain('You post this one: mark it published once it is out.')
    expect(html).not.toContain('Mark ready')
  })

  it('offers nothing of the kind on someone else’s post, which still says a manager publishes', () => {
    const html = renderLocked({ ...post, status: 'approved', poster_id: 8 } as PostDetail)
    expect(html).not.toContain('Mark published')
    expect(html).toContain('While approvals are on, a manager approves, marks ready and publishes.')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; "$R5C/vt.sh" src/content/lib/approval.test.ts src/content/panel/postActions.test.tsx
```

Expected: FAIL — `canMarkPublished` is not exported; the poster's approved post shows no Mark published.

- [ ] **Step 3: The rule and the panel's actions**

In `frontend/src/content/lib/approval.ts`, replace:

```ts
/** The brand's approvals are on (the bootstrap says so; an answer without the field means off). */
```

with:

```ts
/** What a post's own poster may mark published from while the brand's approvals are on (spec 2026-10-19 §4.4). */
export const POSTER_PUBLISHES: readonly PostStatus[] = ['approved', 'ready_to_publish']

/**
 * Whether Mark published is offered: never on a published post; while approvals lock the person, only on a post they
 * post themselves (`me`, the bootstrap's `staff.id`) that is Approved or Ready — the server's guardPublish.
 */
export function canMarkPublished(post: Pick<PostCard, 'status' | 'poster_id'>, locked: boolean, me: number | null): boolean {
  if (post.status === 'published') return false
  if (!locked) return true
  return me !== null && post.poster_id === me && POSTER_PUBLISHES.includes(post.status)
}

/** The brand's approvals are on (the bootstrap says so; an answer without the field means off). */
```

In `frontend/src/content/panel/PostActions.tsx`, replace:

```ts
import { staffLocked } from '../lib/approval'
```

with:

```ts
import { canMarkPublished, staffLocked } from '../lib/approval'
```

replace:

```ts
  const locked = staffLocked(boot)
```

with:

```ts
  const locked = staffLocked(boot)
  // Spec 2026-10-19 §4.4: the post's own poster may mark an approved or ready post published, approvals on or off.
  const publishable = canMarkPublished(post, locked, boot.staff.id ?? null)
```

replace:

```tsx
      {locked && <p className="text-xs text-a-text-2">{t('content.review.staff_hint', 'While approvals are on, a manager approves, marks ready and publishes.')}</p>}
```

with:

```tsx
      {locked && (
        <p className="text-xs text-a-text-2">
          {publishable
            ? t('content.review.poster_hint', 'You post this one: mark it published once it is out.')
            : t('content.review.staff_hint', 'While approvals are on, a manager approves, marks ready and publishes.')}
        </p>
      )}
```

replace:

```tsx
        {!locked && post.status !== 'published' && (
          <Button size="sm" variant="secondary" disabled={waits} aria-expanded={publishing} onClick={() => setPublishing(p => !p)}>
```

with:

```tsx
        {publishable && (
          <Button size="sm" variant="secondary" disabled={waits} aria-expanded={publishing} onClick={() => setPublishing(p => !p)}>
```

and replace:

```tsx
      {!locked && publishing && post.status !== 'published' && (
```

with:

```tsx
      {publishable && publishing && (
```

Write `$R5C/t4-words.json` with the Write tool:

```json
{
  "review.poster_hint": { "en": "You post this one: mark it published once it is out.", "ru": "Этот пост публикуете вы: отметьте его опубликованным, когда он выйдет.", "de": "Diesen Beitrag veröffentlichen Sie: Markieren Sie ihn als veröffentlicht, sobald er online ist.", "fr": "C’est vous qui la publiez : marquez-la comme publiée une fois en ligne.", "es": "Esta la publicas tú: márcala como publicada cuando esté en línea." }
}
```

Then insert the words:

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R5C/words.mjs" "$R5C/t4-words.json"
```

- [ ] **Step 4: Run the tests and the types**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R5C/vt.sh" src/content src/i18n
```

Expected: `TSC-CLEAN`; all passed, the earlier PostActions tests (no approvals) unchanged.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib/approval.ts frontend/src/content/panel/PostActions.tsx frontend/src/content/lib/approval.test.ts frontend/src/content/panel/postActions.test.tsx frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json && git commit -q -m "Content portal: the post's own poster may mark an approved or ready post published under approvals" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: The versions mark on cards (spec §3.4)

**Files:**
- Modify: `frontend/src/content/lib/approval.ts`, `frontend/src/content/ui/CardFlags.tsx`, `frontend/src/content/plan/PostCardView.tsx`, `frontend/src/content/i18n/contentLocales.test.ts`
- Test: `frontend/src/content/ui/cardFlags.test.tsx`, `frontend/src/content/lib/approval.test.ts`
- Words: `$R5C/t5-words.json`

**Interfaces:**
- Consumes: `PostCard.group_size` (Task 1).
- Produces: `versionsOf(post: {group_size?}): number` (0 below 2); `flagWords(flags, t, versions = 0)` ends with "Versions: N"; `CardFlags` draws a versions mark (with words for a screen reader) on the Plan, Ideas and Posts.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/content/lib/approval.test.ts`, replace:

```ts
import { approvalsOn, canMarkPublished, cardFlags, flagWords, staffLocked, statusChoices } from './approval'
```

with:

```ts
import { approvalsOn, canMarkPublished, cardFlags, flagWords, staffLocked, statusChoices, versionsOf } from './approval'
```

Then append to `frontend/src/content/lib/approval.test.ts` (extract to `$R5C/append.txt`, then `cat "$R5C/append.txt" >> frontend/src/content/lib/approval.test.ts`):

```ts

describe('the versions mark (spec 2026-10-19 §3.4)', () => {
  const t = (_key: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? ''))

  it('counts a post’s versions from 2, and names them last', () => {
    expect(versionsOf({ group_size: 3 })).toBe(3)
    expect(versionsOf({ group_size: 1 })).toBe(0)
    expect(versionsOf({})).toBe(0)
    expect(flagWords({ waiting: false, sentBack: true, comments: 2 }, t, 3)).toBe('Sent back, Comments: 2, Versions: 3')
    expect(flagWords({ waiting: false, sentBack: false, comments: 0 }, t)).toBe('')
  })
})
```

Append to `frontend/src/content/ui/cardFlags.test.tsx` (the same way):

```tsx

describe('release 5a: the versions mark (spec 2026-10-19 §3.4)', () => {
  it('marks a post that is one of several versions, with its words for a screen reader, and nothing for none', () => {
    expect(render(false, <CardFlags post={card({ status: 'draft', group_size: 3 })} />)).toContain('Versions: 3')
    expect(render(false, <CardFlags post={card({ status: 'draft', group_size: 3 })} compact />)).toContain('Versions: 3')
    expect(render(false, <CardFlags post={card({ status: 'draft', group_size: 0 })} />)).toBe('')
  })

  it('ends a Plan card’s name with it', () => {
    expect(render(false, <PostCardView post={card({ status: 'draft', group_size: 2 })} onOpen={() => {}} />)).toMatch(/aria-label="[^"]*Versions: 2"/)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; "$R5C/vt.sh" src/content/lib/approval.test.ts src/content/ui/cardFlags.test.tsx
```

Expected: FAIL — `versionsOf` is not exported; no "Versions: 3" on the cards.

- [ ] **Step 3: The helper, the mark, the card's name**

In `frontend/src/content/lib/approval.ts`, replace:

```ts
/** A card's flags in words, in order: the name of a card whose marks are drawn without them (the Plan's cards). */
export function flagWords(flags: ReturnType<typeof cardFlags>, t: Translate): string {
  return [
    flags.waiting ? t('content.flags.waiting', 'Waiting for approval') : '',
    flags.sentBack ? t('content.flags.sent_back', 'Sent back') : '',
    flags.comments > 0 ? t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments }) : '',
  ].filter(Boolean).join(', ')
}
```

with:

```ts
/** How many posts share a card's group of versions (spec 2026-10-19 §3.4): 0 for none and for a group of one. */
export const versionsOf = (post: Pick<PostCard, 'group_size'>): number => ((post.group_size ?? 0) >= 2 ? (post.group_size as number) : 0)

/** A card's flags in words, in order, its versions last: the name of a card whose marks are drawn without them (the Plan's cards). */
export function flagWords(flags: ReturnType<typeof cardFlags>, t: Translate, versions = 0): string {
  return [
    flags.waiting ? t('content.flags.waiting', 'Waiting for approval') : '',
    flags.sentBack ? t('content.flags.sent_back', 'Sent back') : '',
    flags.comments > 0 ? t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments }) : '',
    versions > 0 ? t('content.flags.versions', 'Versions: {{count}}', { count: versions }) : '',
  ].filter(Boolean).join(', ')
}
```

In `frontend/src/content/ui/CardFlags.tsx`, replace:

```tsx
import { Hourglass, MessageSquare, Undo2 } from 'lucide-react'
import { useContent } from '../ContentProvider'
import { approvalsOn, cardFlags } from '../lib/approval'
```

with:

```tsx
import { Hourglass, Layers, MessageSquare, Undo2 } from 'lucide-react'
import { useContent } from '../ContentProvider'
import { approvalsOn, cardFlags, versionsOf } from '../lib/approval'
```

replace:

```tsx
  const flags = cardFlags(post, approvalsOn(data))
  if (!flags.waiting && !flags.sentBack && flags.comments === 0) return null
  const waiting = t('content.flags.waiting', 'Waiting for approval')
  const back = t('content.flags.sent_back', 'Sent back')
  const comments = t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments })
```

with:

```tsx
  const flags = cardFlags(post, approvalsOn(data))
  // Spec 2026-10-19 §3.4: a post that is one of several versions says so.
  const versions = versionsOf(post)
  if (!flags.waiting && !flags.sentBack && flags.comments === 0 && versions === 0) return null
  const waiting = t('content.flags.waiting', 'Waiting for approval')
  const back = t('content.flags.sent_back', 'Sent back')
  const comments = t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments })
  const versionWords = t('content.flags.versions', 'Versions: {{count}}', { count: versions })
```

replace:

```tsx
            <MessageSquare size={12} aria-hidden /><span aria-hidden>{flags.comments}</span><span className="sr-only">{comments}</span>
          </span>
        )}
      </span>
    )
  }
```

with:

```tsx
            <MessageSquare size={12} aria-hidden /><span aria-hidden>{flags.comments}</span><span className="sr-only">{comments}</span>
          </span>
        )}
        {versions > 0 && (
          <span title={versionWords} className="inline-flex items-center gap-0.5 text-xs tabular-nums">
            <Layers size={12} aria-hidden /><span aria-hidden>{versions}</span><span className="sr-only">{versionWords}</span>
          </span>
        )}
      </span>
    )
  }
```

and replace:

```tsx
          <MessageSquare size={12} aria-hidden /><span aria-hidden>{flags.comments}</span><span className="sr-only">{comments}</span>
        </span>
      )}
    </span>
  )
}
```

with:

```tsx
          <MessageSquare size={12} aria-hidden /><span aria-hidden>{flags.comments}</span><span className="sr-only">{comments}</span>
        </span>
      )}
      {versions > 0 && (
        <span title={versionWords} className={`${CHIP} bg-a-surface-2 text-a-text-2 tabular-nums`}>
          <Layers size={12} aria-hidden /><span aria-hidden>{versions}</span><span className="sr-only">{versionWords}</span>
        </span>
      )}
    </span>
  )
}
```

In `frontend/src/content/plan/PostCardView.tsx`, replace:

```ts
import { approvalsOn, cardFlags, flagWords } from '../lib/approval'
```

with:

```ts
import { approvalsOn, cardFlags, flagWords, versionsOf } from '../lib/approval'
```

and replace:

```ts
  const flags = flagWords(cardFlags(post, approvalsOn(data)), (key, fallback, vars) => t(key, fallback, vars))
```

with:

```ts
  const flags = flagWords(cardFlags(post, approvalsOn(data)), (key, fallback, vars) => t(key, fallback, vars), versionsOf(post))
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
'flags.comments', 'bell.label_count', 'versions.made']
```

with:

```ts
'flags.comments', 'bell.label_count', 'versions.made', 'flags.versions']
```

Write `$R5C/t5-words.json` with the Write tool:

```json
{
  "flags.versions": { "en": "Versions: {{count}}", "ru": "Версии: {{count}}", "de": "Versionen: {{count}}", "fr": "Versions : {{count}}", "es": "Versiones: {{count}}" }
}
```

Then insert the words:

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R5C/words.mjs" "$R5C/t5-words.json"
```

- [ ] **Step 4: Run the tests and the types**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R5C/vt.sh" src/content src/i18n
```

Expected: `TSC-CLEAN`; all passed (the earlier card-flag tests unchanged).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib/approval.ts frontend/src/content/ui/CardFlags.tsx frontend/src/content/plan/PostCardView.tsx frontend/src/content/i18n/contentLocales.test.ts frontend/src/content/lib/approval.test.ts frontend/src/content/ui/cardFlags.test.tsx frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json && git commit -q -m "Content portal: cards say how many versions a post has" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: The bell — reminders and the morning email switch (spec §4.3, §4.5)

**Files:**
- Create: `frontend/src/content/bell/MorningEmailSwitch.tsx`
- Modify: `frontend/src/content/bell/bellMath.ts`, `frontend/src/content/ui/PopMenu.tsx`, `frontend/src/content/bell/ForYouBell.tsx`, `frontend/src/content/i18n/contentLocales.test.ts`
- Test: `frontend/src/content/bell/bellMath.test.ts`, `frontend/src/content/ui/popMenu.test.tsx`; create `frontend/src/content/bell/morningEmailSwitch.test.tsx`
- Words: `$R5C/t6-words.json`

**Interfaces:**
- Consumes: `InboxKind` with `to_post`/`not_posted`, `InboxItem['post'].scheduled_time/status`, `Bootstrap['staff'].morning_email`, `api.setMorningEmail` (Task 1).
- Produces: `BELL_TEXT` gains `to_post`, `not_posted`; `bellItems(items, t, when, day = (d) => d)`; `PopList`/`PopMenu` take `footer?: ReactNode` (a last `<li data-menu-footer>`, shown also when empty); component `MorningEmailSwitch()`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/content/bell/bellMath.test.ts` (extract to `$R5C/append.txt`, then `cat "$R5C/append.txt" >> frontend/src/content/bell/bellMath.test.ts`):

```ts

describe('release 5a: reminders in the bell (spec 2026-10-19 §4.3)', () => {
  const tr = (_key: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? ''))
  const reminder = (kind: 'to_post' | 'not_posted', post: Partial<NonNullable<InboxItem['post']>>): InboxItem => ({
    id: `${kind}:1`, kind, by: null, note: null, at: '2026-10-05T00:00:00.000000Z', unread: true,
    post: { id: 1, platform: 'instagram', title: null, hook: 'Autumn offer', topic: null, scheduled_date: '2026-10-05', ...post },
  })

  // Review Focus 4
  it('says what is to post today with its time, and its status only when it is not ready; a missed one says when it was due', () => {
    const [timed, untimed, missed, waitingMissed] = bellItems([
      reminder('to_post', { scheduled_time: '18:00', status: 'approved' }),
      reminder('to_post', { scheduled_time: null, status: 'draft' }),
      reminder('not_posted', { scheduled_time: '09:00', status: 'ready_to_publish' }),
      reminder('not_posted', { scheduled_time: null, status: 'needs_review' }),
    ], tr, () => 'when', (day) => `day ${day}`)
    expect(timed).toMatchObject({ label: 'To post today: Autumn offer', sub: 'at 18:00', mark: true })
    expect(untimed.sub).toBe('draft')
    expect(missed).toMatchObject({ label: 'Not marked as posted: Autumn offer', sub: 'Due day 2026-10-05' })
    expect(waitingMissed.sub).toBe('Due day 2026-10-05 · needs_review')
  })
})
```

Append to `frontend/src/content/ui/popMenu.test.tsx` (the same way):

```tsx

describe('PopList footer (spec 2026-10-19 §4.5: the bell’s morning email switch)', () => {
  it('draws a footer under the lines, also when the list is empty', () => {
    const html = renderToStaticMarkup(<PopList id="l" items={[]} onPick={() => {}} className="c" emptyText="Nothing new" footer={<span>Footer here</span>} />)
    expect(html).toMatch(/Nothing new.*data-menu-footer=""[^>]*><span>Footer here<\/span>/)
    expect(renderToStaticMarkup(<PopList id="l" items={[{ id: 'a', label: 'A' }]} onPick={() => {}} className="c" />)).not.toContain('data-menu-footer')
  })
})
```

Write `frontend/src/content/bell/morningEmailSwitch.test.tsx` with the Write tool:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
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
import type { Bootstrap } from '../lib/types'
import { MorningEmailSwitch } from './MorningEmailSwitch'

const render = (on: boolean | undefined) => {
  const boot = { ...bootFor(false), staff: { name: 'Sam', role: 'staff', can_manage: false, id: 7, morning_email: on } } as unknown as Bootstrap
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <MorningEmailSwitch />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('the morning email switch (spec 2026-10-19 §4.5)', () => {
  it('is a named switch showing the person’s own setting, off when the bootstrap does not say', () => {
    expect(render(true)).toMatch(/role="switch" aria-checked="true"/)
    expect(render(false)).toMatch(/role="switch" aria-checked="false"/)
    expect(render(undefined)).toMatch(/role="switch" aria-checked="false"/)
    expect(render(true)).toContain('Morning email: today’s posts')
    expect(render(true)).toContain('At 8 am, the posts you post today.')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; "$R5C/vt.sh" src/content/bell src/content/ui/popMenu.test.tsx
```

Expected: FAIL — `bellItems` takes no day and has no words for the reminders; `PopList` draws no footer; `MorningEmailSwitch` cannot be resolved; `bellMath.test.ts`' bundle case also fails until the words are in (`BELL_TEXT` gains two kinds).

- [ ] **Step 3: The lines, the footer, the switch**

In `frontend/src/content/bell/bellMath.ts`, replace:

```ts
import type { InboxItem, InboxKind } from '../lib/types'
```

with:

```ts
import type { DateKey, InboxItem, InboxKind } from '../lib/types'
```

replace:

```ts
  comment: '{{name}} commented: {{post}}',
}
```

with:

```ts
  comment: '{{name}} commented: {{post}}',
  // Release 5a (spec 2026-10-19 §4.3): the posts the person is to put out.
  to_post: 'To post today: {{post}}',
  not_posted: 'Not marked as posted: {{post}}',
}

/** A reminder names its post's status only when it is not ready to go out. */
const READY = ['approved', 'ready_to_publish']

/** A line's second line: a reminder's time or the day it was due, then a status not yet ready; else who and when. */
function subLine(item: InboxItem, t: Translate, when: (at: string) => string, day: (date: DateKey) => string): string[] {
  if (item.kind === 'to_post' || item.kind === 'not_posted') {
    const post = item.post
    const status = post?.status && !READY.includes(post.status) ? t(`content.status.${post.status}`, post.status) : ''
    const timing = item.kind === 'to_post'
      ? (post?.scheduled_time ? t('content.bell.at', 'at {{time}}', { time: post.scheduled_time }) : '')
      : (post?.scheduled_date ? t('content.bell.due', 'Due {{day}}', { day: day(post.scheduled_date) }) : '')
    return [timing, status].filter(Boolean)
  }
  const first = item.kind === 'waiting' ? (item.by?.name ?? '') : (item.note ?? '')
  return [first, when(item.at)].filter(Boolean)
}
```

and replace:

```ts
export function bellItems(items: InboxItem[], t: Translate, when: (at: string) => string): PopItem[] {
  return items.map(item => {
    const post = (item.post && cardLine(item.post)) || t('content.plan.untitled', 'Untitled post')
    const name = item.by?.name ?? t('content.people.former', 'Former team member')
    const label = t(`content.bell.kind.${item.kind}`, BELL_TEXT[item.kind], { name, post })
    const first = item.kind === 'waiting' ? (item.by?.name ?? '') : (item.note ?? '')
    return { id: item.id, label, sub: [first, when(item.at)].filter(Boolean).join(' · '), mark: item.unread }
  })
}
```

with:

```ts
export function bellItems(items: InboxItem[], t: Translate, when: (at: string) => string, day: (date: DateKey) => string = date => date): PopItem[] {
  return items.map(item => {
    const post = (item.post && cardLine(item.post)) || t('content.plan.untitled', 'Untitled post')
    const name = item.by?.name ?? t('content.people.former', 'Former team member')
    const label = t(`content.bell.kind.${item.kind}`, BELL_TEXT[item.kind], { name, post })
    return { id: item.id, label, sub: subLine(item, t, when, day).join(' · '), mark: item.unread }
  })
}
```

In `frontend/src/content/ui/PopMenu.tsx`, replace:

```tsx
export function PopList({ id, items, onPick, className, emptyText, markLabel }: {
  id: string
  items: PopItem[]
  onPick: (id: string) => void
  className: string
  /** Said when there are no items. */
  emptyText?: string
  /** The word a screen reader hears before a marked line ("New"). */
  markLabel?: string
}) {
```

with:

```tsx
export function PopList({ id, items, onPick, className, emptyText, markLabel, footer }: {
  id: string
  items: PopItem[]
  onPick: (id: string) => void
  className: string
  /** Said when there are no items. */
  emptyText?: string
  /** The word a screen reader hears before a marked line ("New"). */
  markLabel?: string
  /** Drawn under the lines (the bell's morning email switch, spec 2026-10-19 §4.5). */
  footer?: ReactNode
}) {
```

replace:

```tsx
            {item.sub && <span className="block truncate text-xs text-a-text-2">{item.sub}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}
```

with:

```tsx
            {item.sub && <span className="block truncate text-xs text-a-text-2">{item.sub}</span>}
          </button>
        </li>
      ))}
      {footer !== undefined && <li data-menu-footer="" className="mt-1 border-t border-a-border pt-1">{footer}</li>}
    </ul>
  )
}
```

replace:

```tsx
export function PopMenu({ label, items, onPick, className, children, wrapClassName = '', data, align = 'right', side = 'below', listClassName = 'w-64', title, emptyText, markLabel, onOpenChange }: {
```

with:

```tsx
export function PopMenu({ label, items, onPick, className, children, wrapClassName = '', data, align = 'right', side = 'below', listClassName = 'w-64', title, emptyText, markLabel, onOpenChange, footer }: {
```

replace:

```tsx
  markLabel?: string
  onOpenChange?: (open: boolean) => void
}) {
```

with:

```tsx
  markLabel?: string
  onOpenChange?: (open: boolean) => void
  /** Drawn under the open list's lines (PopList). */
  footer?: ReactNode
}) {
```

and replace:

```tsx
        <PopList id={listId} items={items} emptyText={emptyText} markLabel={markLabel} onPick={(id) => { onPick(id); close() }}
```

with:

```tsx
        <PopList id={listId} items={items} emptyText={emptyText} markLabel={markLabel} footer={footer} onPick={(id) => { onPick(id); close() }}
```

Write `frontend/src/content/bell/MorningEmailSwitch.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot } from '../ContentProvider'

/**
 * The morning email switch (spec 2026-10-19 §4.5) at the foot of the bell's menu: each person's own, off until they
 * switch it on; at 8 am venue time an email lists the posts they post that day. The bootstrap is read again afterwards.
 */
export function MorningEmailSwitch() {
  const { t } = useTranslation()
  const boot = useBoot()
  const api = useApi()
  const queryClient = useQueryClient()
  const [on, setOn] = useState(boot.staff.morning_email === true)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const flip = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const answer = await api.setMorningEmail(!on)
      setOn(answer.on)
      void queryClient.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span id="content-morning-email" className="block text-sm font-medium text-a-text">{t('content.bell.morning', 'Morning email: today’s posts')}</span>
          <span id="content-morning-email-hint" className="block text-xs text-a-text-2">{t('content.bell.morning_hint', 'At 8 am, the posts you post today.')}</span>
        </span>
        <button type="button" role="switch" aria-checked={on} disabled={busy} aria-labelledby="content-morning-email" aria-describedby="content-morning-email-hint"
          onMouseDown={(e) => e.preventDefault()} onClick={() => { void flip() }}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-a-accent' : 'bg-a-surface-2'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
        </button>
      </div>
      {failed && <p role="status" className="mt-1 text-xs text-a-danger">{t('content.bell.morning_failed', 'The setting could not be saved. Please try again.')}</p>}
    </div>
  )
}
```

In `frontend/src/content/bell/ForYouBell.tsx`, replace:

```ts
import { formatInstant } from '../../workspace/lib/wallClock'
```

with:

```ts
import { formatDate, formatInstant } from '../../workspace/lib/wallClock'
```

replace:

```ts
import { BELL_LIST_CLASS, badgeText, bellItems } from './bellMath'
```

with:

```ts
import { BELL_LIST_CLASS, badgeText, bellItems } from './bellMath'
import { MorningEmailSwitch } from './MorningEmailSwitch'
```

replace:

```ts
  const items = read ? bellItems(read.items, (key, fallback, vars) => t(key, fallback, vars), at => formatInstant(at, locale, boot.venue.timezone)) : []
```

with:

```ts
  const items = read
    ? bellItems(read.items, (key, fallback, vars) => t(key, fallback, vars), at => formatInstant(at, locale, boot.venue.timezone),
      day => formatDate(day, locale, { weekday: 'short', day: 'numeric', month: 'short' }))
    : []
```

and replace:

```tsx
      align="right" listClassName={BELL_LIST_CLASS} data={{ 'data-bell': '' }}
```

with:

```tsx
      align="right" listClassName={BELL_LIST_CLASS} data={{ 'data-bell': '' }} footer={<MorningEmailSwitch />}
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
  'bell.kind': ['waiting', 'approved', 'sent_back', 'comment'],
```

with:

```ts
  'bell.kind': ['waiting', 'approved', 'sent_back', 'comment', 'to_post', 'not_posted'],
```

Write `$R5C/t6-words.json` with the Write tool:

```json
{
  "bell.kind.to_post": { "en": "To post today: {{post}}", "ru": "Опубликовать сегодня: {{post}}", "de": "Heute veröffentlichen: {{post}}", "fr": "À publier aujourd’hui : {{post}}", "es": "Para publicar hoy: {{post}}" },
  "bell.kind.not_posted": { "en": "Not marked as posted: {{post}}", "ru": "Не отмечен как опубликованный: {{post}}", "de": "Nicht als veröffentlicht markiert: {{post}}", "fr": "Pas marquée comme publiée : {{post}}", "es": "Sin marcar como publicada: {{post}}" },
  "bell.at": { "en": "at {{time}}", "ru": "в {{time}}", "de": "um {{time}}", "fr": "à {{time}}", "es": "a las {{time}}" },
  "bell.due": { "en": "Due {{day}}", "ru": "Срок: {{day}}", "de": "Fällig: {{day}}", "fr": "Prévue le {{day}}", "es": "Prevista el {{day}}" },
  "bell.morning": { "en": "Morning email: today’s posts", "ru": "Утреннее письмо: посты на сегодня", "de": "Morgen-E-Mail: heutige Beiträge", "fr": "E-mail du matin : publications du jour", "es": "Correo de la mañana: publicaciones de hoy" },
  "bell.morning_hint": { "en": "At 8 am, the posts you post today.", "ru": "В 8 утра — посты, которые вы публикуете сегодня.", "de": "Um 8 Uhr die Beiträge, die Sie heute veröffentlichen.", "fr": "À 8 h, les publications que vous publiez aujourd’hui.", "es": "A las 8, las publicaciones que publicas hoy." },
  "bell.morning_failed": { "en": "The setting could not be saved. Please try again.", "ru": "Не удалось сохранить настройку. Попробуйте ещё раз.", "de": "Die Einstellung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "fr": "Le réglage n’a pas pu être enregistré. Veuillez réessayer.", "es": "No se pudo guardar el ajuste. Inténtalo de nuevo." }
}
```

Then insert the words:

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R5C/words.mjs" "$R5C/t6-words.json"
```

- [ ] **Step 4: Run the tests, the types, the lint**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R5C/vt.sh" src/content src/i18n; npx eslint src/content 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; all passed (the bell's earlier tests unchanged, the new cases, the bundle tests); no lint problem in `src/content`.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/bell/bellMath.ts frontend/src/content/ui/PopMenu.tsx frontend/src/content/bell/MorningEmailSwitch.tsx frontend/src/content/bell/ForYouBell.tsx frontend/src/content/i18n/contentLocales.test.ts frontend/src/content/bell/bellMath.test.ts frontend/src/content/ui/popMenu.test.tsx frontend/src/content/bell/morningEmailSwitch.test.tsx frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json && git commit -q -m "Content portal: reminders in the For you bell and the morning email switch at its foot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 7: The runbook — release 5a's portal

**Files:**
- Modify: `docs/content-workspace.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: The portal's release-5a rules and the owner's checks**

In `docs/content-workspace.md`, replace:

```markdown
  to that read (`read_at`); a line opens its post. One brand at a time.
```

with:

```markdown
  to that read (`read_at`); a line opens its post. One brand at a time.
- **Versions** (release 5a): the panel's Versions section lists the post's group as chips (platform, status, day; this
  post marked; a chip opens that version), Make versions… for the brand's platforms not yet in the group — "Adapt with
  AI" (unavailable at the AI budget cap) or "Copy as is" — and Unlink. While the AI adapts, the panel reads the post
  every 5 s and says "Adapting for …"; a version it did not adapt says why. Cards carry "Versions: N".
- **Who posts it** beside Status in the panel and in Ideas → Schedule (`ui/PosterSelect.tsx`, the team from `GET team`):
  someone who left shows as Not set. While approvals are on, a staff member who posts an Approved or Ready post sees
  Mark published with "You post this one…".
- **The bell's reminders** ("To post today", with the time and a status not yet ready; "Not marked as posted", with the
  day it was due) and, at its foot, **the morning email switch** (each person's own).
```

and replace:

```markdown
- Verify release 5a by content (after Plan 5A-2's deploy): `/api/v1/admin/content/team` answers 401 when signed out
  (404 before release 5a); `php artisan schedule:list` lists `content:send-morning-email`.
```

with:

```markdown
- Verify release 5a by content (after Plan 5A-2's deploy): `/api/v1/admin/content/team` answers 401 when signed out
  (404 before release 5a); `php artisan schedule:list` lists `content:send-morning-email`; the `ContentApp` chunk carries
  "Make versions", "Who posts it", "To post today" and "Morning email".
- After the deploy (owner): on a real brand, make one version as a copy and one adapted by AI, set "Who posts it" on a
  post for today and look at that person's bell, switch the morning email on for yourself and read it the next morning
  at 8; tell the team that a manager's bell lists today's and the last seven days' unpublished posts nobody posts until
  "Who posts it" is set or the posts are marked published; reload admin tabs left open.
```

- [ ] **Step 2: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -m "Runbook: release 5a's portal — versions, who posts it, reminders, the morning email switch; the owner's checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 8: The release checks

The spec's checks (§8) on the finished branch, before the final whole-branch review (whose fix pass, if it changes the portal, runs Steps 1–3 and the touched pass checks again) and before anything is deployed. This task writes only to `$R5C` (git-ignored), to the local database (a temporary brand and a temporary staff member, removed at the end; the local migrations of release 5a, applied once) and, for each defect a check finds, to the branch: every such fix goes in test-first with a ledger line `Task 8: fixed <what> — <test> RED→GREEN`, and its own commit.

**Files:**
- Create (all under `$R5C`): `tools/` (a copy of 4B-2's tools) with a new `tools/pass.mjs` and `tools/lh.mjs`; `pass-seed.php`, `pass-unseed.php`, `final-vitest.txt`, `final-php.txt`, `build.txt`, `lighthouse.md`, `eyes.md`, `keys-base.txt`, `keys-new.txt`, `pass.txt`
- Temporary: a base worktree `C:\wamp64\www\Hexa-Tech-content-base` (origin/main), local servers on :8012 (API), :5173 (Vite), :8099 (Lighthouse sign-in); all undone in Step 10.

**Interfaces:**
- Consumes: everything Plans 5A-1 and 5A-2 built.
- Produces: the evidence Task 9's question to the owner quotes.

- [ ] **Step 1: The frontend suites**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R5C/final-vitest.txt" 2>&1; tail -6 "$R5C/final-vitest.txt"; grep -E '^ FAIL ' "$R5C/final-vitest.txt" | sed 's/ >.*//' | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; `Tests  3 failed | … passed` (more passed than Task 1's baseline), the only `FAIL` file `src/lib/plannerMeta.test.ts`; the lint ends `✖ 17 problems (17 errors, 0 warnings)` (or the baseline Task 1 ledgered). Ledger: `Task 8: note: vitest <n> passed, 3 baseline failures; tsc clean; lint baseline`.

- [ ] **Step 2: Every PHP suite, by folder**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-content && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R5C/php-paths.txt"; wc -l < "$R5C/php-paths.txt"; rm -f "$R5C/final-php.txt"
"$R5C/php.sh" $(sed -n 1,10p "$R5C/php-paths.txt") | tee -a "$R5C/final-php.txt"      # then 11,20p, 21,30p … to the end, one call each
grep -v "exit 0" "$R5C/final-php.txt"; echo "(nothing above: every path green)"
```

Expected: one line per path (about 72), each `Tests: … passed` and `exit 0`; `tests/Feature/Content/` (226 tests) and `tests/Unit/Content/` (76) among them. A failing path: if its test or the code it covers is in this release's change list (`git diff --name-only 8a05dade1 HEAD`), it is ours — fix it test-first, commit, run the path again. If neither is, run it once more alone; if it still fails, ledger `Task 8: note: pre-existing failure <path> <test> — not in the change list` (it goes to the owner and does not block).

- [ ] **Step 3: The build check**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx vite build --outDir "$R5C/build" --emptyOutDir > "$R5C/build.txt" 2>&1; echo "build exit $?"
cd "$R5C/build/assets" && ls ContentApp-*.js AppointmentsApp-*.js
for w in 'Make versions' 'Who posts it' 'To post today' 'Morning email'; do printf '%s: ' "$w"; grep -l "$w" *.js | tr '\n' ' '; echo; done
grep -l "data-content\|data-appointments" index-*.js; echo "(no index file listed above)"
cd /c/wamp64/www/Hexa-Tech-content && git checkout -- frontend/dist/stats.html && rm -rf "$R5C/build" && git status --short
```

Expected: `build exit 0`; one `ContentApp-*.js` and one `AppointmentsApp-*.js`; each phrase found only in `ContentApp-*.js`; nothing listed for the index; `git status --short` prints nothing.

- [ ] **Step 4: Appointments, pixel for pixel, against what is live — no difference**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-content && git fetch -q origin && git log -1 --format='%h %s' origin/main
git diff --quiet origin/main HEAD -- frontend/package.json frontend/package-lock.json && echo SAME-DEPS
git worktree add --detach ../Hexa-Tech-content-base origin/main
mkdir -p "$R5C/tools" && cp -r .superpowers/sdd/archive/2026-10-18-content-release-4b-2/tools/. "$R5C/tools/"
netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'; echo "ports above must be empty"
```

Expected: origin/main is `2fe1d4dba` (or a later commit the ledger names); `SAME-DEPS`. On `ENOSPC`, stop and report it. Then in PowerShell:

```powershell
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

In `$R5C/tools/pixels.mjs` (Edit tool): replace

```js
/** Which tree served the page: only the branch has content/bell/ForYouBell.tsx (release 4b); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/content/bell/ForYouBell.tsx')
```

with

```js
/** Which tree served the page: only the branch has content/panel/VersionsSection.tsx (release 5a); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/content/panel/VersionsSection.tsx')
```

and change `const TOKEN_NAME = 'content-r4b-pixels'` to `const TOKEN_NAME = 'content-r5a-pixels'`.

The local database needs release 5a's two migrations before any page reads it (the pass and Lighthouse write to it):

```bash
cd /c/wamp64/www/Hexa-Tech-content && for m in 2026_10_19_100000_add_group_and_poster_to_content_planner_posts 2026_10_19_100100_add_content_morning_email_to_users; do /c/wamp64/bin/php/php8.4.20/php.exe artisan migrate --path=database/migrations/$m.php --force < /dev/null | tail -1; done
```

Expected: each `DONE` (or `Nothing to migrate` when already applied). Ledger the line.

Start the API (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content && CORS_ALLOWED_ORIGINS=http://localhost:5173 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --port=8012 --no-reload
```

Start the BASE tree's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content-base/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

Capture the base, a control run on the same server, and the keyboard checks:

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd "$R5C/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture base && node pixels.mjs capture control && node pixels.mjs compare base control | tail -1
node pixels.mjs keys | tee "$R5C/keys-base.txt" | tail -3
```

Expected: `46 screens, 0 differ` and every keys line `PASS`. If `capture` stops with "no appointment with a client on 2026-09-30", pick a day that has one, use it for every run, and ledger it.

Stop the base Vite (TaskStop); `netstat -ano | grep ':5173 .*LISTENING'` must print nothing (a leftover node PID: check its command line names `Hexa-Tech-content-base`, then `taskkill //PID <pid> //F`). Start the BRANCH's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd "$R5C/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture new; node pixels.mjs compare base new | grep -E '^(DIFF|SIZE|MISSING)|screens'
node pixels.mjs keys | tee "$R5C/keys-new.txt" | tail -3; diff "$R5C/keys-base.txt" "$R5C/keys-new.txt" && echo KEYS-SAME
```

Expected: `46 screens, 0 differ`; `KEYS-SAME`. Any differing screen is a defect of this release: find the change (`git diff 8a05dade1 HEAD -- frontend/src/workspace frontend/src/appointments` must print nothing), fix it, capture `new` again. Keep the branch's Vite and the API running for Steps 5–6.

- [ ] **Step 5: The browser pass that writes for real — as a manager and as a staff member**

It runs on local org 16, on a temporary brand that is set up with approvals ON, as the manager `appointments-tester@example.test` and as a temporary staff member the seed makes. Write the two PHP files with the Write tool.

`$R5C/pass-seed.php`:

```php
<?php
// Plan 5A-2 browser pass: a set-up brand on local org 16 with approvals ON, Instagram every day; a temporary staff
// member; five posts that member wrote — one to make versions of (in two days), an approved one for today that the
// member posts, an idea without a day, one for today that nobody posts and one two days ago that nobody marked as
// posted. pass-unseed.php removes the brand, everything under it and the member.
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$org = 16;
$name = 'Release check 5a: versions, who posts it, reminders';
$email = 'release-check-5a-staff@example.test';
if (DB::table('brands')->where('organization_id', $org)->where('name', $name)->exists()) { echo "EXISTS\n"; return; }
$now = now();
$today = Carbon\CarbonImmutable::parse(App\Services\Appointments\VenueClock::today($org));
$brand = DB::table('brands')->insertGetId([
    'organization_id' => $org, 'name' => $name, 'slug' => 'release-check-r5a', 'widget_token' => Str::random(32),
    'is_default' => false, 'sort_order' => 99, 'created_at' => $now, 'updated_at' => $now,
]);
$staff = App\Models\User::where('email', $email)->first() ?? App\Models\User::create([
    'organization_id' => $org, 'name' => 'Release Check Staff', 'email' => $email, 'password' => bcrypt(Str::random(40)), 'user_type' => 'staff',
]);
if (!DB::table('staff')->where('user_id', $staff->id)->exists()) {
    DB::table('staff')->insert(['organization_id' => $org, 'user_id' => $staff->id, 'role' => 'staff', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
}
// The planner models take the tenant from the container, as a request would.
app()->instance('current_organization_id', $org);
app()->instance('current_brand_id', $brand);
$profile = App\Models\ContentPlannerProfile::create(['name' => $name, 'brand_id' => $brand, 'default_language' => 'en', 'setup_completed_at' => $now, 'requires_approval' => true]);
$days = fn (array $on) => array_merge(array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], false), array_fill_keys($on, true));
App\Models\ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'label' => 'Release check Instagram', 'active' => true, 'frequency' => $days(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), 'posts_per_week' => 3, 'post_time' => '08:30']);
$post = fn (array $fields) => App\Models\ContentPlannerPost::create($fields + [
    'planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'language' => 'en', 'generated_by' => 'manual', 'created_by' => $staff->id, 'hashtags' => [],
]);
$post(['status' => 'draft', 'topic' => 'Release check versions', 'hook' => 'Release check versions', 'scheduled_date' => $today->addDays(2)->toDateString(), 'scheduled_time' => '08:30']);
$post(['status' => 'approved', 'topic' => 'Release check to post', 'scheduled_date' => $today->toDateString(), 'poster_id' => $staff->id]);
$post(['status' => 'idea', 'topic' => 'Release check idea']);
$post(['status' => 'draft', 'topic' => 'Release check nobody', 'scheduled_date' => $today->toDateString()]);
$post(['status' => 'draft', 'topic' => 'Release check missed', 'scheduled_date' => $today->subDays(2)->toDateString()]);
echo "BRAND {$brand} PROFILE {$profile->id} STAFF {$staff->id} TODAY {$today->toDateString()}\n";
```

`$R5C/pass-unseed.php`:

```php
<?php
// Removes the release-check brand that pass-seed.php made, every Content row under it (profile, channels, posts, their
// comments, approval steps, briefs and variations, the bell's reads), the temporary staff member with their tokens, and
// puts the manager's morning email back off.
use Illuminate\Support\Facades\DB;

$email = 'release-check-5a-staff@example.test';
$brand = DB::table('brands')->where('organization_id', 16)->where('name', 'Release check 5a: versions, who posts it, reminders')->value('id');
$removed = [];
if ($brand) {
    $profiles = DB::table('content_planner_profiles')->where('brand_id', $brand)->pluck('id');
    $posts = DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->pluck('id');
    DB::table('content_planner_post_comments')->whereIn('post_id', $posts)->delete();
    DB::table('content_planner_post_events')->whereIn('post_id', $posts)->delete();
    DB::table('content_planner_reads')->whereIn('planner_profile_id', $profiles)->delete();
    DB::table('content_planner_visual_briefs')->whereIn('post_id', $posts)->delete();
    DB::table('content_planner_post_variations')->whereIn('post_id', $posts)->delete();
    DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->delete();
    foreach (['content_planner_ai_generations', 'content_planner_channels', 'content_planner_key_dates', 'content_planner_templates', 'content_planner_snippets', 'content_planner_brand_voices', 'content_planner_audiences', 'content_planner_pillars', 'content_planner_strategies'] as $table) {
        DB::table($table)->whereIn('planner_profile_id', $profiles)->delete();
    }
    DB::table('content_planner_profiles')->whereIn('id', $profiles)->delete();
    DB::table('brands')->where('id', $brand)->delete();
    $removed[] = "brand {$brand}, profiles {$profiles->count()}, posts {$posts->count()}";
}
$user = DB::table('users')->where('email', $email)->value('id');
if ($user) {
    DB::table('personal_access_tokens')->where('tokenable_type', App\Models\User::class)->where('tokenable_id', $user)->delete();
    if (Illuminate\Support\Facades\Schema::hasTable('admin_access_refusals')) {
        DB::table('admin_access_refusals')->where('user_id', $user)->delete();
    }
    DB::table('staff')->where('user_id', $user)->delete();
    DB::table('users')->where('id', $user)->delete();
    $removed[] = "staff member {$user}";
}
DB::table('users')->where('email', 'appointments-tester@example.test')->update(['wants_content_morning_email' => false]);
echo $removed ? 'REMOVED ' . implode('; ', $removed) . "\n" : "NOTHING\n";
```

Write `$R5C/tools/pass.mjs` with the Write tool (it replaces 4B-2's):

```js
// Plan 5A-2 release check (Task 8): one browser pass that writes for real on local org 16, on a temporary brand and a
// temporary staff member made by pass-seed.php (removed by pass-unseed.php), as the manager and as the staff member.
// API on :8012, Vite on :5173 (the feature tree). Sign-in tokens are minted through tinker into memory, never printed,
// and deleted when the run ends.
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
const STAFF = 'release-check-5a-staff@example.test'
const TOKEN_NAME = 'content-r5a-pass'
const BRAND_NAME = 'Release check 5a: versions, who posts it, reminders'
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')

// stdin closed: tinker waits on an open one.
const tinker = code => execFileSync(PHP, ['artisan', 'tinker', `--execute=${code}`], { cwd: BACKEND, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const lastLine = out => out.trim().split('\n').pop().trim()
const brandId = () => Number(lastLine(tinker(`echo DB::table('brands')->where('organization_id',16)->where('name','${BRAND_NAME}')->whereNull('deleted_at')->value('id');`)))
function mint(email) {
  const token = tinker(`echo App\\Models\\User::where('email', '${email}')->firstOrFail()->createToken('${TOKEN_NAME}')->plainTextToken;`).match(/\d+\|[A-Za-z0-9]{20,}/)?.[0]
  if (!token) throw new Error(`no token minted for ${email}`)
  return token
}
const dropTokens = () => tinker(`Laravel\\Sanctum\\PersonalAccessToken::where('name', '${TOKEN_NAME}')->delete();`)
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
/** A panel field by its label's own words. */
const field = (page, label, tag) => panel(page).locator('label').filter({ has: page.locator(`span:text-is("${label}")`) }).locator(tag)
const versions = page => panel(page).locator('section').filter({ has: page.getByRole('heading', { name: 'Versions', exact: true }) })
const bell = page => page.locator('[data-bell]')
const bellList = page => page.locator('[data-menu]:has([data-bell]) ul')

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const brand = brandId()
  if (!brand) throw new Error('no release-check brand: run pass-seed.php first')
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--font-render-hinting=none'] })
  const manager = mint(MANAGER)
  const staff = mint(STAFF)
  try {
    const postOf = async id => (await api(manager, `posts/${id}?brand_id=${brand}`)).post
    const find = async words => ((await api(manager, `posts?brand_id=${brand}&q=${encodeURIComponent(words)}`)).data ?? [])[0]
    const bootOf = token => api(token, `bootstrap?brand_id=${brand}`)
    const original = await find('Release check versions')
    const toPost = await find('Release check to post')
    const idea = await find('Release check idea')
    if (!original || !toPost || !idea) throw new Error('the seeded posts are missing: run pass-unseed.php, then pass-seed.php')
    const staffId = (await bootOf(staff)).staff?.id
    if (!staffId) throw new Error('the bootstrap does not name the staff member (staff.id)')

    // The manager makes versions (as copies: no AI call), opens one, unlinks it.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${original.scheduled_date}`)
      await ready(page)
      await page.locator(`[data-post="${original.id}"]`).first().click()
      const section = versions(page)
      await section.waitFor({ timeout: 30_000 })
      await section.getByRole('button', { name: 'Make versions…' }).click()
      await section.getByRole('checkbox', { name: 'LinkedIn' }).check()
      await section.getByRole('checkbox', { name: 'Facebook' }).check()
      await section.getByRole('radio', { name: 'Copy as is' }).check()
      await section.getByRole('button', { name: 'Make versions', exact: true }).click()
      record('V1 Make versions (copy as is) makes a LinkedIn and a Facebook version in one group', await until(async () =>
        ((await postOf(original.id))?.group?.posts ?? []).map(p => p.platform).sort().join(',') === 'facebook,instagram,linkedin'))
      record('V2 the section lists the three posts, this one marked', await until(async () => (await section.locator('[data-versions] button').count()) === 3)
        && (await section.locator('[data-versions] button[aria-current="true"]').innerText()).startsWith('Instagram'))
      await shot(page, 'panel-versions')
      const linkedinId = (await postOf(original.id)).group.posts.find(p => p.platform === 'linkedin').id
      await section.locator('[data-versions] button', { hasText: 'LinkedIn' }).click()
      record('V3 a chip opens that version in the panel', await until(async () =>
        (await versions(page).locator('[data-versions] button[aria-current="true"]').innerText().catch(() => '')).startsWith('LinkedIn')))
      await versions(page).getByRole('button', { name: 'Unlink this post' }).click()
      record('V4 Unlink takes the version out; the other two stay grouped', await until(async () =>
        (await postOf(linkedinId))?.group === null && ((await postOf(original.id))?.group?.posts ?? []).length === 2))
      await panel(page).getByRole('button', { name: 'Close' }).click()
      record('V5 the Plan card names its versions', await until(async () =>
        ((await page.locator(`[data-post="${original.id}"]`).first().getAttribute('aria-label')) ?? '').includes('Versions: 2')))
      await context.close()
    }
    // The manager's bell: today's post nobody posts, the missed one, and the morning email switch.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content`)
      await ready(page)
      await bell(page).click()
      record('B1 the manager’s bell lists today’s post nobody posts and the one not marked as posted', await until(async () => {
        const text = await bellList(page).innerText()
        return text.includes('To post today: Release check nobody') && text.includes('Not marked as posted: Release check missed')
      }))
      const toggle = page.locator('[data-menu-footer] [role="switch"]')
      record('B2 the bell’s foot holds the morning email switch, off', (await toggle.getAttribute('aria-checked')) === 'false')
      await shot(page, 'bell-manager')
      await toggle.click()
      record('B3 switching it on is saved', await until(async () => (await bootOf(manager)).staff?.morning_email === true))
      await toggle.click()
      record('B4 and off again', await until(async () => (await bootOf(manager)).staff?.morning_email === false))
      await context.close()
    }
    // The staff member: their reminder, Mark published under approvals, who posts it on Schedule.
    {
      const { context, page } = await session(browser, staff, { brand })
      await page.goto(`${APP}/content`)
      await ready(page)
      await bell(page).click()
      record('S1 the poster’s bell says what they post today', await until(async () => (await bellList(page).innerText()).includes('To post today: Release check to post')))
      await shot(page, 'bell-staff')
      await bellList(page).getByRole('button', { name: /To post today: Release check to post/ }).click()
      const poster = field(page, 'Who posts it', 'select')
      await poster.waitFor({ timeout: 30_000 })
      record('S2 the panel names the staff member as who posts it', await until(async () => (await poster.locator('option:checked').innerText()) === 'Release Check Staff'))
      record('S3 under approvals the poster is offered Mark published on the approved post',
        await panel(page).getByText('You post this one: mark it published once it is out.').isVisible()
        && await panel(page).getByRole('button', { name: 'Mark published' }).first().isVisible())
      await shot(page, 'panel-poster')
      await panel(page).getByRole('button', { name: 'Mark published' }).first().click()
      await panel(page).getByRole('button', { name: 'Mark published' }).last().click()
      record('S4 the poster marks it published', await until(async () => (await postOf(toPost.id))?.status === 'published'))
      await panel(page).getByRole('button', { name: 'Close' }).click()
      await page.goto(`${APP}/content/ideas`)
      const card = page.locator(`[data-ideas] li:has([data-post="${idea.id}"])`)
      await card.waitFor({ timeout: 30_000 })
      await card.getByRole('button', { name: 'Schedule' }).click()
      const dialog = page.getByRole('dialog', { name: 'Schedule this post' })
      await dialog.waitFor({ timeout: 30_000 })
      await dialog.getByLabel('Who posts it').selectOption({ label: 'Release Check Staff' })
      await shot(page, 'schedule-poster')
      await dialog.getByRole('button', { name: 'Schedule', exact: true }).click()
      record('S5 Schedule puts the idea on the Plan with who posts it', await until(async () => {
        const p = await postOf(idea.id)
        return p?.scheduled_date !== null && p?.poster_id === staffId
      }))
      await context.close()
    }
    // Phones: the panel's Versions section; the bell with its footer in Russian.
    {
      const phone = await session(browser, staff, { brand, width: 390, height: 844, mobile: true })
      await phone.page.goto(`${APP}/content?date=${original.scheduled_date}`)
      await ready(phone.page)
      await phone.page.locator(`[data-post="${original.id}"]`).first().click()
      const heading = versions(phone.page)
      await heading.waitFor({ timeout: 30_000 })
      await heading.scrollIntoViewIfNeeded()
      const fits = await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      await shot(phone.page, 'panel-versions-phone')
      record('P1 on a phone the panel’s Versions section fits, nothing off the screen', fits)
      await phone.context.close()
    }
    {
      const phone = await session(browser, manager, { brand, lang: 'ru', width: 390, height: 844, mobile: true })
      await phone.page.goto(`${APP}/content`)
      await bell(phone.page).waitFor({ timeout: 30_000 })
      await bell(phone.page).click()
      await phone.page.locator('[data-menu-footer]').waitFor({ timeout: 30_000 })
      const box = await phone.page.locator('[data-menu]:has([data-bell]) ul').boundingBox()
      const inside = box !== null && box.x >= 0 && box.x + box.width <= 390
      await shot(phone.page, 'bell-ru-phone')
      record('P2 the bell’s list with its footer fits a phone in Russian', inside, box ? `${Math.round(box.x)}–${Math.round(box.x + box.width)}` : 'no box')
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
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R5C/pass-seed.php" < /dev/null | tail -1
cd "$R5C/tools" && node pass.mjs | tee "$R5C/pass.txt" | tail -30
```

Expected: the jobs count noted (ledger it); `BRAND <id> PROFILE <id> STAFF <id> TODAY <date>`; every line `PASS`, `console errors: 0`, `16 checks, 0 failed`. A FAIL: read the line and the screenshot; a defect of the portal is fixed test-first, committed, and the pass run again (run `pass-unseed.php` and `pass-seed.php` first). A defect of the script is fixed in the script and ledgered `Task 8: Ruling: pass script <what> — <why the page is right>`.

- [ ] **Step 6: Lighthouse accessibility on the Plan, the bell, Ideas, the panel and Brand**

In `$R5C/tools/token-server.mjs` (Edit tool): change `const NAME = 'content-r4b-lighthouse'` to `const NAME = 'content-r5a-lighthouse'` and `const BRAND_NAME = 'Release check 4b: approvals, comments and the bell'` to `const BRAND_NAME = 'Release check 5a: versions, who posts it, reminders'`.

Write `$R5C/tools/lh.mjs` with the Write tool (it replaces 4B-2's):

```js
// Plan 5A-2 release check (Task 8, Step 6): Lighthouse accessibility on the Plan, the bell's open list (with the morning
// email switch), Ideas, the panel with its Versions section and "Who posts it", and Brand, on a Chrome of our own, in
// snapshot mode once each page's content is on screen. The sign-in comes from token-server.mjs (port 8099): the manager,
// on the release-check brand.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(HERE, '../lighthouse')
const CACHE = 'C:/Users/user6399/AppData/Local/npm-cache/_npx/1722e863ebfd623b/node_modules'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const APP = 'http://localhost:5173'
const DAY = process.argv[2]
if (!DAY) throw new Error('usage: node lh.mjs <the versions post’s day, YYYY-MM-DD>')

const { snapshot } = await import(pathToFileURL(`${CACHE}/lighthouse/core/index.js`).href)
const { default: puppeteer } = await import(pathToFileURL(`${CACHE}/puppeteer-core/lib/puppeteer/puppeteer-core.js`).href)

fs.mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, userDataDir: path.resolve(HERE, '../lh-profile'),
  defaultViewport: { width: 1440, height: 900 }, args: ['--no-first-run', '--no-default-browser-check'],
})
const flags = { onlyCategories: ['accessibility'], formFactor: 'desktop', screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false } }
const lines = []
try {
  const page = await browser.newPage()
  await page.goto(`${APP}/login`)
  const signedIn = await page.evaluate(async () => {
    const { token, brand } = await (await fetch('http://127.0.0.1:8099/session')).json()
    const me = await (await fetch('http://127.0.0.1:8012/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()
    localStorage.setItem('auth_token', token)
    localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token, user: me, staff: me.staff ?? null }, version: 1 }))
    localStorage.setItem('content:brand', String(brand))
    return me.id ? 'signed in' : 'not signed in'
  })
  console.log(signedIn)
  const audit = async name => {
    const result = await snapshot(page, { flags })
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(result.lhr, null, 1))
    const score = Math.round((result.lhr.categories.accessibility.score ?? 0) * 100)
    const failing = Object.values(result.lhr.audits)
      .filter(a => a.score !== null && a.score < 1 && (a.scoreDisplayMode === 'binary' || a.scoreDisplayMode === 'numeric'))
      .map(a => `  - ${a.id}: ${a.title}${(a.details?.items ?? []).slice(0, 5).map(i => `\n      ${i.node?.selector ?? ''} ${(i.node?.snippet ?? '').slice(0, 140)}`).join('')}`)
    lines.push(`## ${name}: accessibility ${score}`, ...(failing.length ? failing : ['  - no failing audit']), '')
    console.log(`${name}: ${score} (${failing.length} failing)`)
  }

  await page.goto(`${APP}/content?date=${DAY}`)
  await page.waitForSelector('[data-bell]', { timeout: 60_000 })
  await page.waitForSelector('[data-post]', { timeout: 60_000 })
  await audit('plan')

  await page.click('[data-bell]')
  await page.waitForSelector('[data-menu-footer] [role="switch"]', { timeout: 60_000 })
  await audit('bell')
  await page.keyboard.press('Escape')

  await page.goto(`${APP}/content/ideas`)
  await page.waitForSelector('[data-ideas] [data-post]', { timeout: 60_000 })
  await audit('ideas')

  await page.goto(`${APP}/content?date=${DAY}`)
  await page.waitForSelector('[data-post]', { timeout: 60_000 })
  await page.click('[data-post]')
  await page.waitForSelector('#content-versions-title', { timeout: 60_000 })
  await audit('panel')

  await page.goto(`${APP}/content/brand`)
  await page.waitForSelector('#content-approvals', { timeout: 60_000 })
  await audit('brand')
} finally {
  await browser.close()
}
fs.writeFileSync(path.resolve(HERE, '../lighthouse.md'), `# Plan 5A-2 release check — Lighthouse accessibility (snapshot mode, desktop 1440)\n\n${lines.join('\n')}\n`)
```

The release-check brand from Step 5 is still there. Start `node "$R5C/tools/token-server.mjs"` in the background (it prints only `serving on 127.0.0.1:8099`), then run `cd "$R5C/tools" && node lh.mjs <the versions post's day from the pass: TODAY + 2>`. Stop the token server (TaskStop) and run `node "$R5C/tools/token-server.mjs" drop` → `dropped`.

Read `$R5C/lighthouse.md`: per page the accessibility score and every failing audit with its elements. Expected: no failing audit the portal can fix. Each one it can is a defect: fix it test-first, commit, and audit that page again. One the portal cannot fix gets `Task 8: Ruling: <audit> — <why it is not the portal's> — <cost if wrong>`. No conformance is claimed.

- [ ] **Step 7: Eyes**

Open every screenshot in `$R5C/shots/pass/` with the Read tool and write one line each in `$R5C/eyes.md`:
- `panel-versions.png`: the Versions section between the AI tools and Repeat — the heading, three chips (Instagram marked), Make versions… and Unlink, "Versions made: 2".
- `bell-manager.png`: the bell's list with "To post today: Release check nobody" and "Not marked as posted: Release check missed" (the due day under it), and at its foot the morning email switch with its line — inside the window.
- `bell-staff.png`: the staff member's list with "To post today: Release check to post" (no status: it is approved).
- `panel-poster.png`: "Who posts it" beside Status naming Release Check Staff; the Actions with Mark published and "You post this one…".
- `schedule-poster.png`: the Schedule dialog with Day, Time and "Who posts it" set to Release Check Staff.
- `panel-versions-phone.png`: the panel full width at 390, the chips wrapping, nothing cut.
- `bell-ru-phone.png`: the Russian bell list on a phone with its footer switch, within the screen.

Anything that looks wrong to a person is a defect: fix it (test-first where a test can hold it), take the screenshot again, and say so in `eyes.md`.

- [ ] **Step 8: The suites again if anything was fixed**

If Steps 2–7 committed any fix, run Step 1 again and the PHP paths those fixes touch (`"$R5C/php.sh" <paths>`). Expected: as in Steps 1–2.

- [ ] **Step 9: Ledger**

Append to `$R5C/progress.md`: `Task 8: note: vitest …; PHP <n> paths green (<pre-existing failures, if any>); build check clean; Appointments 46 screens, 0 differ, keys same; Lighthouse <Plan / bell / Ideas / panel / Brand>; pass 16 checks 0 failed; eyes ok`.

- [ ] **Step 10: Clean up**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R5C/pass-unseed.php" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo Laravel\Sanctum\PersonalAccessToken::where('name', 'like', 'content-r5a-%')->count();" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan workspace:content 16 --status < /dev/null | tail -2
```

Expected: `REMOVED brand <id>, profiles 1, posts 7; staff member <id>` (five seeded posts and the two versions the pass made; the unlinked one is among them); tokens `0`; jobs as noted before the pass; org 16's Content `on`. Stop the API and the Vite tasks (TaskStop); `netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'` must print nothing (a leftover node PID: check its command line, then `taskkill //PID <pid> //F`). Remove the base worktree — junction first, in PowerShell:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove ../Hexa-Tech-content-base && git worktree list | grep -c content-base; test -d frontend/node_modules/react && echo MODULES-KEPT; git status --short
```

Expected: `0`; `MODULES-KEPT`; `git status --short` prints nothing.

- [ ] **Step 11: Record the task**

```bash
cd /c/wamp64/www/Hexa-Tech-content && bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/executing-plans/scripts/task-done docs/superpowers/plans/2026-10-19-content-release-5a-2.md 8 <BASE> -- .superpowers/sdd/2026-10-19-content-release-5a-2/vt.sh src/content src/workspace src/appointments
```

---

### Task 9: The deploy (source-patch recipe), after the owner's "yes, deploy"

Run this task after the final whole-branch review and its fix pass (executing-plans' Final Review), so the feature tip it ships is final.

Merging to `main` is a production deploy: Laravel Cloud runs `migrate --force` (release 5a brings two additive migrations) and rebuilds the SPA. Release 5a = Plans 5A-1 and 5A-2 together: the change list runs from the last deployed feature tip `8a05dade1`. This task prepares the artifact in its own worktree, proves it, then **stops and asks the owner**. Nothing is pushed without the owner's explicit "yes, deploy" given in answer to Step 6's question.

**Files:**
- Temporary: worktree `C:\wamp64\www\Hexa-Tech-deploy-content-r5a` on branch `deploy/content-r5a` (from `origin/main`), with a copied `vendor`, the local `.env` and a `frontend/node_modules` junction; removed in Step 9 (the branch is kept).
- Ledger: `$R5C/deploy-list.txt`, `$R5C/deploy-php.txt`, `$R5C/deploy-vitest.txt`, `$R5C/deploy-build.txt`, `$R5C/postdeploy.txt`.

**Interfaces:**
- Consumes: the feature tip after the review and Task 8 (`TIP`), the last deployed feature tip `8a05dade1`, prod main `2fe1d4dba`, `$R5C/php.sh`.

- [ ] **Step 1: Fix the inputs**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git status --short && git fetch -q origin
TIP=$(git rev-parse HEAD); echo "TIP $TIP"; git log -1 --format='%h %s' origin/main
git diff --stat 8a05dade1 origin/main -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: a clean status; origin/main `2fe1d4dba`; the last line prints nothing (production's source is exactly the last deployed feature tip). If origin/main moved on, the line lists what changed there: Step 3's fourth guard proves none of it touches this release's files; ledger the new origin/main.

Ledger: `Task 9: note: TIP <sha>; origin/main <sha>`.

- [ ] **Step 2: The deploy worktree**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree add ../Hexa-Tech-deploy-content-r5a -B deploy/content-r5a origin/main
cp .env ../Hexa-Tech-deploy-content-r5a/.env
```

In PowerShell (robocopy, never a junction for `vendor`; robocopy's exit codes 0–7 mean success):

```powershell
robocopy C:\wamp64\www\Hexa-Tech-content\vendor C:\wamp64\www\Hexa-Tech-deploy-content-r5a\vendor /E /NFL /NDL /NJH /NJS /NP; if ($LASTEXITCODE -lt 8) { 'VENDOR-OK' }
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-deploy-content-r5a\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

Expected: `VENDOR-OK`; the junction made. On `ENOSPC` (or robocopy's "not enough space"), stop and report it; delete nothing to make room.

- [ ] **Step 3: The change list and its guards**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-content && git diff --no-renames --name-status 8a05dade1 "$TIP" > "$R5C/deploy-list.txt"; wc -l < "$R5C/deploy-list.txt"
cut -f2 "$R5C/deploy-list.txt" | grep -vE '^(app/|routes/(api|console)\.php$|lang/(en|ru|de|fr|es)/content_morning\.php$|resources/views/emails/content-morning\.blade\.php$|tests/|frontend/src/|docs/|database/migrations/2026_10_19_100(000|100)_)'; echo "(nothing above: every path is in the allowlist)"
cut -f2 "$R5C/deploy-list.txt" | grep -E '^(frontend/dist/|public/spa/|resources/spa-shell/|config/|composer\.|frontend/package)'; echo "(nothing above: no built file, no config, no dependency)"
cut -f2 "$R5C/deploy-list.txt" | grep '^database/'; echo "(above: exactly the two release-5a migrations)"
git diff --name-only 2fe1d4dba origin/main -- $(cut -f2 "$R5C/deploy-list.txt"); echo "(nothing above: production has not changed any file of this release since 2fe1d4dba)"
cut -f1 "$R5C/deploy-list.txt" | sort | uniq -c
```

Expected: about 90 lines; the first two guards print nothing but their notes; the third lists exactly `database/migrations/2026_10_19_100000_add_group_and_poster_to_content_planner_posts.php` and `database/migrations/2026_10_19_100100_add_content_morning_email_to_users.php`; the fourth prints nothing; the status count shows `A` and `M` only (release 5a deletes nothing). A path outside the allowlist: stop and find out why before going on (another feature's commit must not ride the deploy); ledger the answer.

- [ ] **Step 4: Apply, check parity, commit**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5a
awk -F'\t' '$1 != "D" {print $2}' "$R5C/deploy-list.txt" > "$R5C/deploy-am.txt"
awk -F'\t' '$1 == "D" {print $2}' "$R5C/deploy-list.txt" > "$R5C/deploy-d.txt"
xargs -a "$R5C/deploy-am.txt" git checkout "$TIP" --
[ -s "$R5C/deploy-d.txt" ] && xargs -a "$R5C/deploy-d.txt" git rm -q --
git diff --cached --stat | tail -1
git diff --cached "$TIP" -- $(cut -f2 "$R5C/deploy-list.txt") | head -5; echo "(nothing above: parity with the feature tip, deletions included)"
git diff "$TIP" --stat -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: the cached stat counts every line of the list; the parity diff prints nothing; when origin/main was still `2fe1d4dba`, the last line prints nothing too (whole-tree parity with the feature tip outside the built files).

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5a && git commit -q -F - <<'EOF'
HexaTech Content, release 5a: versions per platform, who posts it, reminders, the morning email

Versions per platform: linked sibling posts in one group, made as copies
or adapted by AI in the background (one version per run, within the AI
budget, never over a person's words), unlinked, shown as chips in the
panel and counted on cards. Who posts it on every post (the brand's team;
the poster may mark an approved or ready post published while approvals
are on). Reminders in the For you bell: to post today and not marked as
posted for seven days. An opt-in morning email at 8 am venue time
(content:send-morning-email, hourly), in five languages. Two additive
migrations (content_planner_posts.group_id and poster_id;
users.wants_content_morning_email and content_morning_email_last_sent_at).
Source of feature/content-workspace at TIP_SHA (since 8a05dade1).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='%h %s'
```

(Before committing, replace `TIP_SHA` in the message with the short sha of `$TIP`, by editing the command.)

- [ ] **Step 5: Every suite on the artifact**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
sed 's#cd /c/wamp64/www/Hexa-Tech-content #cd /c/wamp64/www/Hexa-Tech-deploy-content-r5a #' "$R5C/php.sh" > "$R5C/php-deploy.sh" && chmod +x "$R5C/php-deploy.sh" && grep -n "^cd " "$R5C/php-deploy.sh"
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5a && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R5C/deploy-paths.txt"; wc -l < "$R5C/deploy-paths.txt"; rm -f "$R5C/deploy-php.txt"
"$R5C/php-deploy.sh" $(sed -n 1,10p "$R5C/deploy-paths.txt") | tee -a "$R5C/deploy-php.txt"     # then 11,20p … to the end
grep -v "exit 0" "$R5C/deploy-php.txt"; echo "(nothing above: every path green)"
```

Expected: the `grep -n` line shows `cd /c/wamp64/www/Hexa-Tech-deploy-content-r5a || exit 1`; every PHP path `exit 0` (the same paths and results as Task 8).

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5a/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R5C/deploy-vitest.txt" 2>&1; tail -5 "$R5C/deploy-vitest.txt"; grep -E '^ FAIL ' "$R5C/deploy-vitest.txt" | sed 's/ >.*//' | sort -u
npm run build > "$R5C/deploy-build.txt" 2>&1; echo "build exit $?"; tail -5 "$R5C/deploy-build.txt"
cd .. && git status --short | cut -c4- | cut -d/ -f1-2 | sort | uniq -c
```

Expected: `TSC-CLEAN`; vitest `3 failed` only in `src/lib/plannerMeta.test.ts`; `build exit 0`; the status shows changes only under `frontend/dist`, `public/spa` and `resources/spa-shell`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5a && git add frontend/dist public/spa resources/spa-shell && git commit -q -m "Build the SPA for HexaTech Content release 5a" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git status --short && git log -3 --format='%h %s'
```

Expected: a clean status; the build commit on top of the source commit, on top of origin/main.

- [ ] **Step 6: STOP — ask the owner**

Ledger `Task 9: note: artifact ready — deploy/content-r5a <sha> (source <sha> + build <sha>), <n> files (A <a>, M <m>), PHP <n> paths green, vitest <n> passed + 3 baseline, build ok`, then ask the owner, with the facts in plain words:

- what ships: versions per platform (Make versions… as copies or adapted by AI in the background; chips in the panel; Unlink; "Versions: N" on cards); "Who posts it" on every post and in Ideas → Schedule; while approvals are on, the poster may mark an approved or ready post published; the bell's "To post today" and "Not marked as posted" lines; the morning email (opt-in, at the foot of the bell, 8 am venue time);
- the two additive migrations and the new hourly command `content:send-morning-email` (it needs Laravel Cloud's scheduler, which the loyalty digest already uses); the queue must run for AI-adapted versions and the email;
- what changes for people at once: **managers' bells list today's and the last seven days' unpublished posts that nobody posts** on every brand (every existing post has no poster yet) — until "Who posts it" is set or the posts are marked published; nobody gets an email until they switch it on; admin tabs left open across the deploy must be reloaded;
- the open items carried: the runbook's "After the deploy" checks for releases 2–4b, the queue `retry_after` check, the three approval questions, and Plan 5A-1's five deferred minors;
- the checks: Task 8's results (suites, `46 screens, 0 differ`, Lighthouse, the browser pass as manager and staff) and Step 5's;
- the question: **"Shall I deploy? Reply 'yes, deploy' to push it to production."**

Wait for the answer. Anything other than a clear yes: do not push; keep the deploy worktree, and do what the owner asks.

- [ ] **Step 7: Push (only after "yes, deploy")**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5a && git fetch -q origin && git log -1 --format='%h' origin/main
OLD=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "OLD $OLD" | tee "$R5C/postdeploy.txt"
for u in /api/v1/admin/content/team /api/v1/admin/content/bootstrap; do printf 'before %s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/json' "https://app.hexa-tech.uk$u")"; done | tee -a "$R5C/postdeploy.txt"
```

Expected: origin/main is still the commit the deploy branch was cut from (if it moved, stop: rebase nothing, tell the owner and start again from Step 1); `OLD /spa/assets/index-….js`; `before /api/v1/admin/content/team 404` and `before /api/v1/admin/content/bootstrap 401`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5a && git push origin deploy/content-r5a:main 2>&1 | tail -2; date -u +%FT%TZ
```

Then wait for Laravel Cloud's new bundle (Bash, `run_in_background`; it re-invokes when it exits):

```bash
OLD='<the OLD path from above>'; for i in $(seq 1 60); do NEW=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); [ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && { echo "NEW $NEW at $(date -u +%T)"; exit 0; }; sleep 15; done; echo "STILL OLD after 15 minutes"; exit 1
```

Expected: `NEW /spa/assets/index-….js`. "STILL OLD": look at the Laravel Cloud deploy log with the owner (a failed migration stops the deploy); do not push again.

- [ ] **Step 8: Verify by content**

```bash
R5C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5a-2
B=https://app.hexa-tech.uk; NEW=$(curl -s $B/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "NEW $NEW" | tee -a "$R5C/postdeploy.txt"
curl -s "$B$NEW" -o "$R5C/live-index.js"; printf 'index data-content/data-appointments: %s\n' "$(grep -c 'data-content\|data-appointments' "$R5C/live-index.js")" | tee -a "$R5C/postdeploy.txt"
CA=$(grep -o 'ContentApp-[A-Za-z0-9_-]*\.js' "$R5C/live-index.js" | head -1); AA=$(grep -o 'AppointmentsApp-[A-Za-z0-9_-]*\.js' "$R5C/live-index.js" | head -1); echo "chunks $CA $AA" | tee -a "$R5C/postdeploy.txt"
curl -s "$B/spa/assets/$CA" -o "$R5C/live-content.js"; for w in 'Make versions' 'Who posts it' 'To post today' 'Morning email'; do printf 'ContentApp has "%s": %s\n' "$w" "$(grep -c "$w" "$R5C/live-content.js")"; done | tee -a "$R5C/postdeploy.txt"
curl -s "$B/spa/assets/$AA" | grep -c 'data-appointments' | sed 's/^/AppointmentsApp has data-appointments: /' | tee -a "$R5C/postdeploy.txt"
for u in /api/v1/admin/content/team /api/v1/admin/content/bootstrap; do printf 'after %s %s %s\n' "$u" "$(curl -s -o "$R5C/body.json" -w '%{http_code}' -H 'Accept: application/json' "$B$u")" "$(head -c 80 "$R5C/body.json")"; done | tee -a "$R5C/postdeploy.txt"
for p in / /content /content/ideas /content/brand /appointments; do printf 'page %s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done | tee -a "$R5C/postdeploy.txt"
rm -f "$R5C/live-index.js" "$R5C/live-content.js" "$R5C/body.json"
```

Expected: `index data-content/data-appointments: 0`; both chunk names found; the ContentApp chunk has each of the four phrases (counts ≥ 1); `AppointmentsApp has data-appointments:` ≥ 1; `after /api/v1/admin/content/team 401 {"message":"Unauthenticated."…` (it answered 404 before) and `after /api/v1/admin/content/bootstrap 401`; the five pages `200`. Any other answer: tell the owner at once, with the line.

- [ ] **Step 9: Clean up and record**

In PowerShell, the junction first, then the worktree:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-deploy-content-r5a\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove --force ../Hexa-Tech-deploy-content-r5a && git worktree list | grep -c deploy-content-r5a; test -d frontend/node_modules/react && echo MODULES-KEPT
```

Expected: `0`; `MODULES-KEPT`. (`--force` because the copied `vendor` and `.env` are untracked files in it; the branch `deploy/content-r5a` stays.)

Ledger: `Task 9: complete — LIVE as prod main <sha> (source <sha> + build <sha>; <n> files) pushed <time>Z, new index live <time>Z (<index>, <ContentApp chunk>); verified by content (postdeploy.txt): …`.

Update the memory file `content-workspace.md` and its line in `MEMORY.md`: release 5a LIVE as prod main `<sha>` (date), verified by content; the owner's checks open (the runbook's "After the deploy" lines for releases 2–5a, the queue `retry_after` check, the three approval questions, Plan 5A-1's deferred minors, the managers' bell heads-up); release 5b next (tracked links, link-in-bio: Plans 5B-1, 5B-2).

Tell the owner it is live, with the verification lines and the runbook's "After the deploy" checks.
